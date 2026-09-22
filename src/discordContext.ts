import type { Message, PartialMessage, TextBasedChannel } from "discord.js";

const DEFAULT_HISTORY = 40;
const DEFAULT_REPLY_DEPTH = 6;
const DEFAULT_MAX_CHARS = 14_000;

export type ContextOptions = {
  historyLimit?: number;
  replyDepth?: number;
  maxChars?: number;
  botId?: string;
};

function displayName(message: Message | PartialMessage): string {
  const user = message.author;
  if (!user) return "unknown";
  return user.bot ? `${user.username}[bot]` : user.username;
}

function formatOne(message: Message | PartialMessage, botId?: string): string {
  const raw = message.content ?? "";
  const content = botId
    ? raw.replace(new RegExp(`<@!?${botId}>`, "g"), "@bot").trim()
    : raw.trim();
  const attachments = [...(message.attachments?.values() ?? [])]
    .map((att) => att.name ?? att.url)
    .filter(Boolean);
  const bits = [
    content || (attachments.length ? "(no text)" : ""),
    attachments.length ? `[attachments: ${attachments.join(", ")}]` : "",
  ].filter(Boolean);
  const body = bits.join(" ") || "(empty)";
  return `${displayName(message)}: ${body}`;
}

async function resolveMessage(message: Message | PartialMessage): Promise<Message | null> {
  if (message.partial) {
    try {
      return await message.fetch();
    } catch {
      return null;
    }
  }
  return message as Message;
}

/** Walk message.reference chain (the thing people Discord-reply to). */
export async function fetchReplyChain(
  message: Message,
  depth = DEFAULT_REPLY_DEPTH,
): Promise<Message[]> {
  const chain: Message[] = [];
  let current: Message | null = message;
  const seen = new Set<string>([message.id]);

  for (let i = 0; i < depth; i++) {
    if (!current) break;
    const refId = current.reference?.messageId;
    if (!refId || seen.has(refId)) break;
    seen.add(refId);
    try {
      const parent: Message = await current.channel.messages.fetch(refId);
      chain.push(parent);
      current = parent;
    } catch {
      break;
    }
  }
  return chain;
}

/** Recent messages in this channel/thread, oldest → newest, excluding `excludeId`. */
export async function fetchRecentHistory(
  channel: TextBasedChannel,
  options: { limit?: number; excludeId?: string } = {},
): Promise<Message[]> {
  if (!channel.isTextBased() || channel.isDMBased()) return [];
  const limit = options.limit ?? DEFAULT_HISTORY;
  try {
    const fetched = await channel.messages.fetch({ limit: Math.min(100, Math.max(1, limit)) });
    return [...fetched.values()]
      .filter((msg) => msg.id !== options.excludeId)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  } catch {
    return [];
  }
}

/**
 * Build a Discord context block for the agent:
 * - reply chain (what the user Discord-replied to)
 * - recent messages in the current channel/thread
 * - optional parent-channel history when starting from a guild channel into a new thread
 */
export async function buildDiscordContext(
  message: Message,
  options: ContextOptions & { parentChannel?: TextBasedChannel | null } = {},
): Promise<string> {
  const historyLimit = options.historyLimit ?? DEFAULT_HISTORY;
  const replyDepth = options.replyDepth ?? DEFAULT_REPLY_DEPTH;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const botId = options.botId;

  const sections: string[] = [];

  const chain = await fetchReplyChain(message, replyDepth);
  if (chain.length > 0) {
    const lines = [];
    for (const msg of [...chain].reverse()) {
      const full = await resolveMessage(msg);
      if (full) lines.push(formatOne(full, botId));
    }
    sections.push(`## Discord reply target (message being replied to, oldest→newest)\n${lines.join("\n")}`);
  }

  if (options.parentChannel && options.parentChannel.id !== message.channelId) {
    const parentHistory = await fetchRecentHistory(options.parentChannel, {
      limit: historyLimit,
      excludeId: message.id,
    });
    if (parentHistory.length > 0) {
      const lines = parentHistory.map((msg) => formatOne(msg, botId));
      sections.push(
        `## Recent parent channel (#${"name" in options.parentChannel ? options.parentChannel.name : options.parentChannel.id})\n${lines.join("\n")}`,
      );
    }
  }

  const localHistory = await fetchRecentHistory(message.channel, {
    limit: historyLimit,
    excludeId: message.id,
  });
  if (localHistory.length > 0) {
    const lines = localHistory.map((msg) => formatOne(msg, botId));
    const label = message.channel.isThread() ? "Recent thread messages" : "Recent channel messages";
    sections.push(`## ${label}\n${lines.join("\n")}`);
  }

  if (sections.length === 0) return "";

  let text = `Discord conversation context (use for continuity; the user's latest message is below):\n\n${sections.join("\n\n")}`;
  if (text.length > maxChars) {
    text = `…[older Discord context truncated]\n${text.slice(text.length - maxChars)}`;
  }
  return text;
}
