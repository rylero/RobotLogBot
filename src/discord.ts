import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  ThreadAutoArchiveDuration,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgent } from "./agent.js";
import { assertAccess, config } from "./config.js";
import type { McpHandle } from "./tools/chiefdelphi.js";
import { formatLogList, listLogs } from "./tools/logs.js";

const DISCORD_LIMIT = 1900;
const sessions = new Map<string, Anthropic.MessageParam[]>();
const botThreads = new Set<string>();

export function createDiscordClient(anthropic: Anthropic, mcp: McpHandle | null): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });

  client.once(Events.ClientReady, async (ready) => {
    await ready.application.commands.set([
      new SlashCommandBuilder()
        .setName("ask")
        .setDescription("Ask the log / Chief Delphi agent")
        .addStringOption((option) =>
          option.setName("question").setDescription("What do you want to know?").setRequired(true),
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName("logs")
        .setDescription("List recent .wpilog files on this machine")
        .addStringOption((option) =>
          option.setName("query").setDescription("Optional filename filter").setRequired(false),
        )
        .toJSON(),
    ]);
    console.log(`Discord ready as ${ready.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
      if (interaction.commandName === "logs") {
        await handleLogs(interaction);
        return;
      }
      if (interaction.commandName === "ask") {
        await handleAsk(interaction, anthropic, mcp);
      }
    } catch (error) {
      console.error(error);
      const text = "Something broke while handling that command.";
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(text).catch(() => undefined);
      } else {
        await interaction.reply({ content: text, ephemeral: true }).catch(() => undefined);
      }
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      await handleMessage(message, anthropic, mcp, client);
    } catch (error) {
      console.error(error);
      await message.reply("Something broke while handling that message.").catch(() => undefined);
    }
  });

  return client;
}

async function handleLogs(interaction: ChatInputCommandInteraction): Promise<void> {
  const denied = assertAccess(interaction.user.id, interaction.channelId, !interaction.inGuild());
  if (denied) {
    await interaction.reply({ content: denied, ephemeral: true });
    return;
  }
  await interaction.deferReply();
  const query = interaction.options.getString("query") ?? undefined;
  await interaction.editReply(trimForDiscord(formatLogList(await listLogs(query))));
}

async function handleAsk(
  interaction: ChatInputCommandInteraction,
  anthropic: Anthropic,
  mcp: McpHandle | null,
): Promise<void> {
  const denied = assertAccess(interaction.user.id, interaction.channelId, !interaction.inGuild());
  if (denied) {
    await interaction.reply({ content: denied, ephemeral: true });
    return;
  }
  const question = interaction.options.getString("question", true);
  await interaction.deferReply();
  const thread = await startThreadFromInteraction(interaction, question);
  const sessionId = thread?.id ?? interaction.id;
  if (thread) botThreads.add(thread.id);

  const { reply, history } = await runAgent({
    anthropic,
    mcp,
    history: sessions.get(sessionId) ?? [],
    userText: question,
    onProgress: async (text) => {
      if (thread) await thread.send(text).catch(() => undefined);
      else await interaction.editReply(text).catch(() => undefined);
    },
  });
  sessions.set(sessionId, history);
  await sendChunks(thread ?? interaction, reply);
}

async function handleMessage(
  message: Message,
  anthropic: Anthropic,
  mcp: McpHandle | null,
  client: Client,
): Promise<void> {
  if (message.author.bot) return;
  const isDm = message.channel.type === ChannelType.DM;
  const parentId = message.channel.isThread() ? message.channel.parentId : message.channelId;
  const inBotThread = message.channel.isThread() && botThreads.has(message.channel.id);
  const mentioned = client.user ? message.mentions.has(client.user) : false;

  if (!isDm && !inBotThread && !mentioned) return;
  if (inBotThread && !mentioned && message.reference) {
    // allow all follow-ups in sessions we started
  }

  const denied = assertAccess(message.author.id, parentId, isDm);
  if (denied) {
    if (mentioned || isDm) await message.reply(denied);
    return;
  }

  const question = stripMention(message.content, client.user?.id);
  const saved = await saveAttachments(message);
  const userText = [question, saved].filter(Boolean).join("\n");
  if (!userText.trim()) return;

  let thread = message.channel.isThread() ? message.channel : null;
  if (!thread && !isDm && message.channel.isTextBased() && "threads" in message.channel) {
    thread = await message.startThread({
      name: threadName(question || "log question"),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    });
    botThreads.add(thread.id);
  }
  if (thread) botThreads.add(thread.id);

  const replyChannel = thread ?? message.channel;
  if (!replyChannel.isSendable()) return;
  const status = await replyChannel.send("Looking…");
  const sessionId = thread?.id ?? message.channelId;
  const { reply, history } = await runAgent({
    anthropic,
    mcp,
    history: sessions.get(sessionId) ?? [],
    userText,
    onProgress: async (text) => {
      await status.edit(trimForDiscord(text)).catch(() => undefined);
    },
  });
  sessions.set(sessionId, history);
  await status.edit(trimForDiscord(firstChunk(reply))).catch(() => undefined);
  const rest = splitMessage(reply).slice(1);
  for (const chunk of rest) {
    await replyChannel.send(chunk);
  }
}

async function saveAttachments(message: Message): Promise<string> {
  const logs = [...message.attachments.values()].filter((att) =>
    att.name?.toLowerCase().endsWith(".wpilog"),
  );
  if (logs.length === 0) return "";
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { default: path } = await import("node:path");
  const destDir = path.resolve(config.logDir, "inbox");
  await mkdir(destDir, { recursive: true });
  const saved: string[] = [];
  for (const att of logs) {
    const res = await fetch(att.url);
    const buf = Buffer.from(await res.arrayBuffer());
    const dest = path.join(destDir, att.name ?? `upload-${att.id}.wpilog`);
    await writeFile(dest, buf);
    saved.push(dest);
  }
  return `Attached log(s) saved to:\n${saved.join("\n")}`;
}

async function startThreadFromInteraction(
  interaction: ChatInputCommandInteraction,
  question: string,
) {
  const channel = interaction.channel;
  if (!channel || channel.isDMBased() || !channel.isTextBased() || !("threads" in channel)) {
    return null;
  }
  try {
    const starter = await interaction.fetchReply();
    return await starter.startThread({
      name: threadName(question),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    });
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function sendChunks(
  target: { send: (content: string) => Promise<unknown> } | ChatInputCommandInteraction,
  text: string,
): Promise<void> {
  const chunks = splitMessage(text);
  if ("editReply" in target) {
    await target.editReply(chunks[0] ?? "(empty)");
    for (const chunk of chunks.slice(1)) {
      await target.followUp({ content: chunk });
    }
    return;
  }
  for (const chunk of chunks) {
    await target.send(chunk);
  }
}

function stripMention(content: string, botId?: string): string {
  if (!botId) return content.trim();
  return content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();
}

function threadName(question: string): string {
  const cleaned = question.replace(/\s+/g, " ").trim() || "log question";
  return cleaned.slice(0, 90);
}

function firstChunk(text: string): string {
  return splitMessage(text)[0] ?? "(empty)";
}

function trimForDiscord(text: string): string {
  return text.length <= DISCORD_LIMIT ? text : `${text.slice(0, DISCORD_LIMIT - 16)}\n…[truncated]`;
}

function splitMessage(text: string): string[] {
  if (text.length <= DISCORD_LIMIT) return [text || "(empty)"];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > DISCORD_LIMIT) {
    let cut = rest.lastIndexOf("\n", DISCORD_LIMIT);
    if (cut < 200) cut = DISCORD_LIMIT;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

