# RobotLogBot

Always-on Discord agent for FRC log analysis. It talks to people in a team channel, reads `.wpilog` files from a **local folder**, and runs the **Claude Agent SDK** with:

- **scope** — ClaudeScope log analysis ([ClaudeScope](https://github.com/rylero/ClaudeScope))
- **chiefdelphi** — FRC design research via [chiefdelphi-mcp](https://github.com/rylero/chiefdelphi-mcp) (Open Alliance–aware)

Model defaults to **Sonnet** (`claude-sonnet-4-6`). Override with `CLAUDE_MODEL` in `.env`.

## Local setup

```bash
git clone https://github.com/rylero/RobotLogBot.git
git clone https://github.com/rylero/chiefdelphi-mcp.git
cd RobotLogBot
npm install
cp .env.example .env
# Install ClaudeScope on PATH: https://github.com/rylero/ClaudeScope/releases
npm start
```

Set `DISCORD_TOKEN`, `ANTHROPIC_API_KEY`, and `LOG_DIR`. `CHIEFDELPHI_MCP_CWD` defaults to `../chiefdelphi-mcp`.

Only one process may run at a time (lock on `127.0.0.1:39281`).

## Portainer (closet server)

1. On the host, sync wpilogs into a folder (rclone cron recommended — Drive Desktop does not run in Linux containers):

   ```bash
   rclone sync gdrive:RobotLogs/2026-Rebuilt /mnt/robot-logs/2026-Rebuilt --fast-list
   ```

2. Clone this repo on the Portainer host (or use Portainer git deploy).

3. Copy `.env.portainer.example` → `.env` and fill tokens. Set `HOST_LOG_DIR` in the stack env or compose to the host log path.

4. In Portainer → **Stacks** → **Add stack**:
   - Build method: repository or upload `docker-compose.yml` + `Dockerfile`
   - Env: paste from `.env`, plus `HOST_LOG_DIR=/mnt/robot-logs/2026-Rebuilt`
   - Deploy

5. Check container logs for `Discord ready` and `Single-instance lock acquired`.

No ports need publishing. Volumes persist the Chief Delphi SQLite index and plot/cache data.

**ClaudeScope note:** the image downloads the published Linux binary. If you need a newer build (e.g. with `query`), mount it over `/usr/local/bin/ClaudeScope`.

## How Google Drive is used

The bot never talks to Drive. Point `LOG_DIR` / `HOST_LOG_DIR` at a local sync of the team folder.

## Discord usage

- `/ask …` or `@ClaudeBot …`
- Follow-ups in the bot’s thread continue the session
- Reply-to + `@bot` includes the referenced message and recent channel history
- Design questions use `/chiefdelphi`; log questions use `/scope`
