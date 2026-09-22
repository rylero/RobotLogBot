import path from "node:path";
import { loadEnv } from "./env.js";

loadEnv();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function csv(name: string): string[] {
  return optional(name)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export const config = {
  discordToken: required("DISCORD_TOKEN"),
  allowedChannelIds: new Set(csv("ALLOWED_CHANNEL_IDS")),
  allowedUserIds: new Set(csv("ALLOWED_USER_IDS")),
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  model: optional("CLAUDE_MODEL", "claude-sonnet-4-6"),
  logDir: optional("LOG_DIR", "./data/logs"),
  claudeScopeBin:
    optional("CLAUDESCOPE_BIN") ||
    (process.platform === "win32" ? "ClaudeScope.exe" : "ClaudeScope"),
  chiefDelphiCwd: optional(
    "CHIEFDELPHI_MCP_CWD",
    path.resolve(process.cwd(), "../chiefdelphi-mcp"),
  ),
  rcloneRemote: optional("RCLONE_REMOTE"),
  maxToolRounds: 24,
  maxToolResultChars: 80_000,
};

export function assertAccess(userId: string, channelId: string | null, isDm: boolean): string | null {
  if (config.allowedUserIds.size > 0 && !config.allowedUserIds.has(userId)) {
    return "You are not on the allowlist for this bot.";
  }
  if (isDm) {
    return config.allowedUserIds.size > 0 ? null : "DMs are disabled unless ALLOWED_USER_IDS is set.";
  }
  if (config.allowedChannelIds.size === 0) {
    return "ALLOWED_CHANNEL_IDS is empty — refuse to listen everywhere.";
  }
  if (!channelId || !config.allowedChannelIds.has(channelId)) {
    return "This channel is not enabled for the log bot.";
  }
  return null;
}
