import type { Server } from "node:net";
import { createDiscordClient } from "./discord.js";
import { config } from "./config.js";
import { acquireSingletonLock } from "./singleton.js";

console.log(`RobotLogBot starting (model=${config.model}, logs=${config.logDir})`);

let lock: Server;
try {
  lock = await acquireSingletonLock();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const discord = createDiscordClient();

const shutdown = async () => {
  console.log("Shutting down");
  discord.destroy();
  lock.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await discord.login(config.discordToken);
