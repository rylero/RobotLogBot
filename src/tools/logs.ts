import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { clip, runCommand } from "./exec.js";

export type LogFile = {
  name: string;
  path: string;
  bytes: number;
  mtime: string;
};

async function walk(dir: string, out: LogFile[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
      continue;
    }
    if (!entry.name.toLowerCase().endsWith(".wpilog")) continue;
    const info = await stat(full);
    out.push({
      name: entry.name,
      path: full,
      bytes: info.size,
      mtime: info.mtime.toISOString(),
    });
  }
}

export async function listLogs(query?: string): Promise<LogFile[]> {
  const files: LogFile[] = [];
  await walk(path.resolve(config.logDir), files);
  files.sort((a, b) => b.mtime.localeCompare(a.mtime));
  if (!query) return files;
  const needle = query.toLowerCase();
  return files.filter(
    (file) => file.name.toLowerCase().includes(needle) || file.path.toLowerCase().includes(needle),
  );
}

export function formatLogList(files: LogFile[], limit = 40): string {
  if (files.length === 0) {
    return `No .wpilog files under ${path.resolve(config.logDir)}. Sync Drive into LOG_DIR or attach a log.`;
  }
  const shown = files.slice(0, limit);
  const lines = shown.map((file) => {
    const mb = (file.bytes / (1024 * 1024)).toFixed(1);
    return `- ${file.name}  ${mb} MiB  ${file.mtime}\n  ${file.path}`;
  });
  const extra = files.length > limit ? `\n…and ${files.length - limit} more` : "";
  return `${files.length} log(s) in ${path.resolve(config.logDir)}\n${lines.join("\n")}${extra}`;
}

export async function syncDrive(): Promise<string> {
  if (!config.rcloneRemote) {
    return "RCLONE_REMOTE is not set. Point it at the Google Drive folder (e.g. gdrive:FRC/Logs).";
  }
  const dest = path.resolve(config.logDir);
  const result = await runCommand(
    "rclone",
    ["sync", config.rcloneRemote, dest, "--fast-list", "--drive-acknowledge-abuse"],
    { timeoutMs: 10 * 60_000 },
  );
  const text = clip(`${result.stdout}\n${result.stderr}`.trim(), 8_000);
  if (result.code !== 0) {
    return `rclone sync failed (exit ${result.code})\n${text}`;
  }
  const files = await listLogs();
  return `rclone sync ok. ${files.length} .wpilog files now in ${dest}\n${text}`;
}
