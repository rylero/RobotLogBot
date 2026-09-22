import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createAnthropic } from "./agent.js";
import { config } from "./config.js";
import { createDiscordClient } from "./discord.js";
import { connectChiefDelphi } from "./tools/chiefdelphi.js";

await mkdir(path.resolve(config.logDir), { recursive: true });

const mcp = await connectChiefDelphi();
const discord = createDiscordClient(createAnthropic(), mcp);

const shutdown = async () => {
  console.log("Shutting down");
  discord.destroy();
  await mcp?.client.close().catch(() => undefined);
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await discord.login(config.discordToken);
