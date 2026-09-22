import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export function plotsRoot(): string {
  return path.resolve(process.cwd(), "data", "plots");
}

export async function createPlotDir(label: string): Promise<string> {
  const safe = label.replace(/[^\w.-]+/g, "_").slice(0, 48) || "run";
  const dir = path.join(plotsRoot(), `${Date.now()}-${safe}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function snapshotImages(dir: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return map;
  }
  for (const name of entries) {
    const ext = path.extname(name).toLowerCase();
    if (!IMAGE_EXT.has(ext)) continue;
    const full = path.join(dir, name);
    try {
      const info = await stat(full);
      map.set(full, info.mtimeMs);
    } catch {
      // ignore
    }
  }
  return map;
}

/** Images created or updated in dir since before snapshot. */
export async function collectNewImages(
  dir: string,
  before: Map<string, number>,
  limit = 8,
): Promise<string[]> {
  const after = await snapshotImages(dir);
  const created: { path: string; mtime: number }[] = [];
  for (const [file, mtime] of after) {
    const prev = before.get(file);
    if (prev === undefined || mtime > prev) {
      created.push({ path: file, mtime });
    }
  }
  created.sort((a, b) => a.mtime - b.mtime);
  return created.slice(0, limit).map((item) => item.path);
}
