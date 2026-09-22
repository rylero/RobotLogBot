import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config.js";
import { discordAppendPrompt } from "./prompt.js";
import { collectNewImages, createPlotDir, snapshotImages } from "./plots.js";

export type ProgressFn = (text: string) => Promise<void>;

/** Agent SDK stdio MCP configs don't reliably honor cwd — use absolute paths. */
function chiefDelphiMcp() {
  const cwd = path.resolve(config.chiefDelphiCwd);
  const entry = path.join(cwd, "src", "index.ts");
  const tsxCli = path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs");
  if (!existsSync(entry)) {
    console.warn(`Chief Delphi MCP entry missing: ${entry}`);
  }
  if (!existsSync(tsxCli)) {
    console.warn(`Chief Delphi tsx missing: ${tsxCli} (run npm install in ${cwd})`);
  }
  return {
    chiefdelphi: {
      type: "stdio" as const,
      command: process.execPath,
      args: [tsxCli, entry],
      env: {
        ...process.env,
        // Keep relative data/ paths inside the MCP package.
        PWD: cwd,
        INIT_CWD: cwd,
      },
    },
  };
}

function looksLikeLogQuestion(text: string): boolean {
  return /\b(\/?scope|wpilog|log|match|q\d+|brownout|swerve|voltage|current|can|module|teleop|auton|akit_|plot|graph|chart)\b/i.test(
    text,
  );
}

function looksLikeDesignQuestion(text: string): boolean {
  return /\b(\/?chiefdelphi|chief\s*delphi|open\s*alliance|how (have|are|do) teams|camera mount|intake|elevator|mechanism|3d\s*print|petg|polycarb|cad|manufactur|design)\b/i.test(
    text,
  );
}

function buildPrompt(userText: string, firstTurn: boolean, plotHint: string): string {
  const parts: string[] = [];
  if (firstTurn && looksLikeLogQuestion(userText)) {
    parts.push("/scope");
  }
  if (firstTurn && looksLikeDesignQuestion(userText)) {
    parts.push("/chiefdelphi");
  }
  if (firstTurn) {
    parts.push(`Team logs directory: ${path.resolve(config.logDir)}`);
  }
  parts.push(plotHint);
  parts.push(userText);
  return parts.join("\n\n");
}

export async function runAgent(options: {
  sessionId?: string;
  userText: string;
  plotLabel?: string;
  onProgress?: ProgressFn;
}): Promise<{ reply: string; sessionId?: string; images: string[] }> {
  const resume = options.sessionId;
  const firstTurn = !resume;
  const plotDir = await createPlotDir(options.plotLabel ?? "discord");
  await mkdir(plotDir, { recursive: true });
  const before = await snapshotImages(plotDir);

  const plotHint = `Plot directory for this turn (save PNGs here so Discord can attach them):\n${plotDir}\nHelper: python scripts/plot_series.py --parquet series.parquet --y BatteryVoltage --out "${path.join(plotDir, "plot.png")}" --title "..."`;

  const prompt = buildPrompt(options.userText, firstTurn, plotHint);

  let sessionId = resume;
  let reply = "";
  let sawInit = false;

  for await (const message of query({
    prompt,
    options: {
      cwd: process.cwd(),
      model: config.model,
      resume,
      persistSession: true,
      settingSources: ["project"],
      skills: ["scope", "chiefdelphi"],
      allowedTools: ["Bash", "Read", "Write", "Glob", "Grep", "Skill"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: config.maxToolRounds,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: config.anthropicApiKey,
        MSYS_NO_PATHCONV: "1",
      },
      mcpServers: chiefDelphiMcp(),
      strictMcpConfig: true,
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: discordAppendPrompt(),
      },
    },
  })) {
    if ("session_id" in message && typeof message.session_id === "string") {
      sessionId = message.session_id;
    }

    if (message.type === "system" && message.subtype === "init") {
      sawInit = true;
      const skills = "skills" in message ? message.skills : undefined;
      console.log("Agent init", {
        skills,
        model: config.model,
        sessionId,
        plotDir,
      });
      if (options.onProgress) {
        const names = Array.isArray(skills) ? skills.map(String).join(", ") : "scope";
        await options.onProgress(`Ready (skills: ${names || "scope"})…`);
      }
    }

    if (message.type === "assistant") {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === "object" && "type" in block && block.type === "tool_use") {
            const name = "name" in block ? String(block.name) : "tool";
            if (options.onProgress) await options.onProgress(`Running ${name}…`);
          }
        }
      }
    }

    if (message.type === "result") {
      if (message.subtype === "success") {
        reply = message.result?.trim() || reply;
      } else {
        const errors = "errors" in message ? message.errors : [];
        reply =
          (Array.isArray(errors) && errors.length > 0 ? errors.join("\n") : null) ||
          `Agent stopped (${message.subtype}).`;
      }
    }
  }

  if (!reply) {
    reply = sawInit
      ? "(no text returned — try again or name a specific log)"
      : "Agent failed to start. Check Claude Code auth / ANTHROPIC_API_KEY.";
  }

  const images = await collectNewImages(plotDir, before);
  if (images.length > 0) {
    console.log(`Attaching ${images.length} plot(s) from ${plotDir}`);
  }

  return { reply, sessionId, images };
}
