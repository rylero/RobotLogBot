import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { systemPrompt } from "./prompt.js";
import { runClaudeScope } from "./tools/claudescope.js";
import { callChiefDelphi, type McpHandle } from "./tools/chiefdelphi.js";
import { formatLogList, listLogs, syncDrive } from "./tools/logs.js";

export type ProgressFn = (text: string) => Promise<void>;

const builtinTools: Anthropic.Tool[] = [
  {
    name: "list_logs",
    description:
      "List .wpilog files in LOG_DIR (the local Google Drive sync). Optional query filters by filename (match, event, date).",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional substring such as q37, cc, or 2026-04-05" },
      },
    },
  },
  {
    name: "sync_drive",
    description:
      "Run rclone sync from RCLONE_REMOTE into LOG_DIR so newly uploaded Drive logs appear locally. Use when the user says logs were just added.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "claudescope",
    description:
      "Run a ClaudeScope CLI command against a loaded log or to load one. Pass the subcommand and its arguments as an array (no shell quoting). load resolves relative paths against LOG_DIR.",
    input_schema: {
      type: "object",
      required: ["command"],
      properties: {
        command: {
          type: "string",
          enum: [
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
          ],
        },
        args: {
          type: "array",
          items: { type: "string" },
          description:
            'CLI args after the command. Examples: load ["akit_q37.wpilog"]; query ["where BatteryVoltage < 7 | ranges"]; get ["/RealOutputs/Robot/Enabled","--time","0"]',
        },
      },
    },
  },
];

export function createAnthropic(): Anthropic {
  return new Anthropic({ apiKey: config.anthropicApiKey });
}

async function runTool(
  name: string,
  input: Record<string, unknown>,
  mcp: McpHandle | null,
): Promise<string> {
  if (name === "list_logs") {
    const query = typeof input.query === "string" ? input.query : undefined;
    return formatLogList(await listLogs(query));
  }
  if (name === "sync_drive") {
    return syncDrive();
  }
  if (name === "claudescope") {
    const command = String(input.command ?? "");
    const args = Array.isArray(input.args) ? input.args.map((value) => String(value)) : [];
    return runClaudeScope(command, args);
  }
  if (mcp?.tools.some((tool) => tool.name === name)) {
    return callChiefDelphi(mcp, name, input);
  }
  return `Unknown tool: ${name}`;
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export async function runAgent(options: {
  anthropic: Anthropic;
  mcp: McpHandle | null;
  history: Anthropic.MessageParam[];
  userText: string;
  onProgress?: ProgressFn;
}): Promise<{ reply: string; history: Anthropic.MessageParam[] }> {
  const tools: Anthropic.Tool[] = [...builtinTools, ...(options.mcp?.tools ?? [])];
  const history: Anthropic.MessageParam[] = [
    ...options.history,
    { role: "user", content: options.userText },
  ];

  for (let round = 0; round < config.maxToolRounds; round++) {
    const response = await options.anthropic.messages.create({
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt(),
      tools,
      messages: history,
    });

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    history.push({ role: "assistant", content: response.content });

    if (toolUses.length === 0 || response.stop_reason === "end_turn") {
      return { reply: textOf(response) || "(no text)", history };
    }

    if (options.onProgress) {
      const names = toolUses.map((block) => block.name).join(", ");
      await options.onProgress(`Running ${names}…`);
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUses) {
      const input =
        block.input && typeof block.input === "object" ? (block.input as Record<string, unknown>) : {};
      const output = await runTool(block.name, input, options.mcp);
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: output,
      });
    }
    history.push({ role: "user", content: results });
  }

  return {
    reply: "Stopped after too many tool calls. Ask a narrower question or name a specific log.",
    history,
  };
}
