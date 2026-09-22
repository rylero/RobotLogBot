import net from "node:net";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_PORT = 39281;

/**
 * Ensure only one RobotLogBot process is alive on this machine.
 * In-memory Discord dedupe cannot stop duplicate replies when several
 * `npm start` processes each connect with the same bot token.
 */
export async function acquireSingletonLock(
  port = Number(process.env.BOT_LOCK_PORT ?? DEFAULT_PORT) || DEFAULT_PORT,
): Promise<net.Server> {
  mkdirSync(path.resolve(process.cwd(), "data"), { recursive: true });

  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            `Another RobotLogBot instance is already running (lock port ${port}). Stop it before starting again.`,
          ),
        );
        return;
      }
      reject(error);
    });
    server.listen({ port, host: "127.0.0.1", exclusive: true }, () => {
      console.log(`Single-instance lock acquired on 127.0.0.1:${port}`);
      resolve(server);
    });
  });
}
