import { spawn } from "node:child_process";

export function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number; maxBuffer?: number } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const maxBuffer = options.maxBuffer ?? 12 * 1024 * 1024;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, MSYS_NO_PATHCONV: "1" },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > maxBuffer) {
        killed = true;
        child.kill("SIGTERM");
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed && stdout.length > maxBuffer) {
        resolve({ stdout: `${stdout.slice(0, maxBuffer)}\n[truncated]`, stderr, code: code ?? 1 });
        return;
      }
      if (killed) {
        resolve({ stdout, stderr: `${stderr}\n[timed out after ${timeoutMs}ms]`, code: code ?? 1 });
        return;
      }
      resolve({ stdout, stderr, code: code ?? 0 });
    });
  });
}

export function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…[truncated ${text.length - maxChars} chars]`;
}
