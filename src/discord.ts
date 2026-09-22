import {
  AttachmentBuilder,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  ThreadAutoArchiveDuration,
  type Message,
} from "discord.js";
import path from "node:path";
import { runAgent } from "./agent.js";
import { assertAccess, config } from "./config.js";
import { buildDiscordContext } from "./discordContext.js";

const DISCORD_LIMIT = 1900;
/** Discord thread/channel id → Claude Agent SDK session id */
const sessions = new Map<string, string>();
const botThreads = new Set<string>();
/** Prevent duplicate MessageCreate handling (gateway retries / races). */
const inFlightMessages = new Set<string>();
/** Only one agent turn at a time per thread/channel. */
const busySessions = new Set<string>();
const THREAD_ALREADY_EXISTS = 160004;

export function createDiscordClient(): Client {
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
    // Clear any previously registered slash commands — @mention / DMs / bot threads only.
    await ready.application.commands.set([]);
    console.log(`Discord ready as ${ready.user.tag} (model ${config.model})`);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (inFlightMessages.has(message.id)) {
      console.warn(`Skipping duplicate handle for message ${message.id}`);
      return;
    }
    inFlightMessages.add(message.id);
    let postedStatus = false;
    try {
      postedStatus = await handleMessage(message, client);
    } catch (error) {
      console.error(error);
      if (!postedStatus) {
        await message.reply("Something broke while handling that message.").catch(() => undefined);
      }
    } finally {
      setTimeout(() => inFlightMessages.delete(message.id), 120_000);
    }
  });

  return client;
}

async function handleMessage(message: Message, client: Client): Promise<boolean> {
  if (message.author.bot) return false;
  const isDm = message.channel.type === ChannelType.DM;
  const parentId = message.channel.isThread() ? message.channel.parentId : message.channelId;
  const inBotThread = message.channel.isThread() && botThreads.has(message.channel.id);
  const mentioned = client.user ? message.mentions.has(client.user) : false;

  if (!isDm && !inBotThread && !mentioned) return false;

  const denied = assertAccess(message.author.id, parentId, isDm);
  if (denied) {
    if (mentioned || isDm) await message.reply(denied);
    return false;
  }

  const question = stripMention(message.content, client.user?.id);
  const saved = await saveAttachments(message);

  // Capture parent channel before we may move into a new thread.
  const parentForContext =
    !message.channel.isThread() && message.channel.isTextBased() ? message.channel : null;

  let thread = message.channel.isThread() ? message.channel : null;
  if (!thread) {
    thread = await resolveMessageThread(message);
  }
  const startingNewThread =
    !thread && !isDm && message.channel.isTextBased() && "threads" in message.channel;

  const discordContext = await buildDiscordContext(message, {
    botId: client.user?.id,
    historyLimit: config.discordHistoryLimit,
    replyDepth: config.discordReplyDepth,
    maxChars: config.discordContextMaxChars,
    // When @mentioned in a channel, pull parent history so the new thread still sees the room.
    parentChannel: startingNewThread || (thread && parentForContext) ? parentForContext : null,
  });

  const userText = [
    discordContext,
    saved,
    `User message from ${message.author.username}:\n${question || "(no text)"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  if (!question.trim() && !saved && !discordContext) return false;

  if (startingNewThread) {
    thread = await ensureThread(message, question);
  }
  if (thread) botThreads.add(thread.id);

  const replyChannel = thread ?? message.channel;
  if (!replyChannel.isSendable()) return false;

  const key = thread?.id ?? message.channelId;
  if (busySessions.has(key)) {
    await replyChannel
      .send("Still working on the previous question in this thread — hang tight.")
      .catch(() => undefined);
    return true;
  }
  busySessions.add(key);

  let status: Message;
  try {
    status = await replyChannel.send("Looking…");
    const { reply, sessionId, images } = await runAgent({
      sessionId: sessions.get(key),
      userText,
      plotLabel: key,
      onProgress: async (text) => {
        await status.edit(trimForDiscord(text)).catch(() => undefined);
      },
    });
    if (sessionId) sessions.set(key, sessionId);
    const chunks = splitMessage(reply);
    const files = toAttachments(images);
    await status
      .edit({
        content: trimForDiscord(chunks[0] ?? "(empty)"),
        files: files.slice(0, 10),
      })
      .catch(async () => {
        await status.edit(trimForDiscord(chunks[0] ?? "(empty)")).catch(() => undefined);
        if (files.length > 0) await replyChannel.send({ files: files.slice(0, 10) });
      });
    for (const chunk of chunks.slice(1)) {
      await replyChannel.send(chunk);
    }
    return true;
  } finally {
    busySessions.delete(key);
  }
}

async function ensureThread(message: Message, question: string) {
  const existing = await resolveMessageThread(message);
  if (existing) return existing;

  try {
    return await message.startThread({
      name: threadName(question || "log question"),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    });
  } catch (error) {
    // Race: another handler (or Discord) created the thread first.
    if (isThreadAlreadyExistsError(error)) {
      const recovered = await resolveMessageThread(message);
      if (recovered) return recovered;
    }
    throw error;
  }
}

/** Public message threads use the starter message id as the thread channel id. */
async function resolveMessageThread(message: Message) {
  if (message.thread?.isThread()) return message.thread;
  try {
    const fetched = await message.fetch();
    if (fetched.thread?.isThread()) return fetched.thread;
  } catch {
    // ignore
  }
  try {
    const channel = await message.client.channels.fetch(message.id);
    if (channel?.isThread()) return channel;
  } catch {
    // ignore
  }
  return null;
}

function isThreadAlreadyExistsError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code: unknown }).code;
  return code === "MessageExistingThread" || code === THREAD_ALREADY_EXISTS;
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

function toAttachments(images: string[]): AttachmentBuilder[] {
  return images.map(
    (file) => new AttachmentBuilder(file, { name: path.basename(file) }),
  );
}

function stripMention(content: string, botId?: string): string {
  if (!botId) return content.trim();
  return content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();
}

function threadName(question: string): string {
  const cleaned = question.replace(/\s+/g, " ").trim() || "log question";
  return cleaned.slice(0, 90);
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
