import path from "node:path";
import { config } from "../config.js";
import { clip, runCommand } from "./exec.js";

const ALLOWED = new Set([
  "load",
  "info",
  "sessions",
  "search-fields",
  "get",
  "range",
  "find-bool",
  "find-threshold",
  "stats",
  "query",
  "query-multi",
  "disconnect",
  "version",
  "help",
]);

export async function runClaudeScope(command: string, args: string[] = []): Promise<string> {
  if (!ALLOWED.has(command)) {
    return `Blocked command "${command}". Allowed: ${[...ALLOWED].join(", ")}`;
  }
  const argv = [command, ...args];
  if (command === "load" && args[0] && !path.isAbsolute(args[0])) {
    argv[1] = path.resolve(config.logDir, args[0]);
  }
  const timeoutMs = command === "load" || command === "query-multi" ? 180_000 : 90_000;
  try {
    const result = await runCommand(config.claudeScopeBin, argv, { timeoutMs });
    const text = clip(`${result.stdout}\n${result.stderr}`.trim(), config.maxToolResultChars);
    if (result.code !== 0) {
      return `ClaudeScope ${command} failed (exit ${result.code})\n${text}`;
    }
    return text || "(no output)";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to run ${config.claudeScopeBin}: ${message}`;
  }
}
