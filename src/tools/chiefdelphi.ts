import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { clip } from "./exec.js";

export type McpHandle = {
  client: Client;
  tools: Anthropic.Tool[];
};

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((block) => {
        if (block && typeof block === "object" && "text" in block) {
          return String((block as { text: unknown }).text);
        }
        return JSON.stringify(block);
      })
      .join("\n");
  }
  return JSON.stringify(value);
}

export async function connectChiefDelphi(): Promise<McpHandle | null> {
  const transport = new StdioClientTransport({
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    args: ["tsx", "src/index.ts"],
    cwd: config.chiefDelphiCwd,
  });
  const client = new Client({ name: "discord-log-bot", version: "0.1.0" });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const tools: Anthropic.Tool[] = listed.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      input_schema: (tool.inputSchema ?? {
        type: "object",
        properties: {},
      }) as Anthropic.Tool.InputSchema,
    }));
    console.log(`Chief Delphi MCP connected (${tools.length} tools) from ${config.chiefDelphiCwd}`);
    return { client, tools };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Chief Delphi MCP unavailable: ${message}`);
    await client.close().catch(() => undefined);
    return null;
  }
}

export async function callChiefDelphi(handle: McpHandle, name: string, args: unknown): Promise<string> {
  const result = await handle.client.callTool({
    name,
    arguments: (args ?? {}) as Record<string, unknown>,
  });
  const text = asText(result.content);
  if (result.isError) {
    return clip(`Chief Delphi tool error:\n${text}`, config.maxToolResultChars);
  }
  return clip(text, config.maxToolResultChars);
}
