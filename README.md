# RobotLogBot

Always-on Discord agent for FRC log analysis. Uses the Claude Agent SDK with:

- **scope** — ClaudeScope log analysis ([ClaudeScope](https://github.com/rylero/ClaudeScope))
- **chiefdelphi** — FRC design research via [chiefdelphi-mcp](https://github.com/rylero/chiefdelphi-mcp)
- **github** — optional robot-code access via [GitHub MCP](https://github.com/github/github-mcp-server) (read-only)

Default model: `claude-sonnet-4-6`.

## Portainer (recommended)

The image is built on GitHub Actions and published to **GHCR** (`ghcr.io/rylero/robotlogbot:latest`). Portainer only pulls — it does not build.

### 1. Make the package pullable

After the first successful Actions run:

1. GitHub → repo → **Packages** → `robotlogbot`
2. **Package settings** → set visibility to **Public**  
   (or keep private and add a Portainer registry credential with a PAT that has `read:packages`)

### 2. Host logs (rclone)

Sync wpilogs on the Docker host (see **rclone** below), e.g. `/mnt/robot-logs/2026-Rebuilt`.

### 3. Create the stack

1. Portainer → **Stacks** → **Add stack** → **Web editor**
2. Paste [`docker-compose.yml`](docker-compose.yml) (or deploy from Repository pointing at this file)
3. Environment variables:

| Name | Value |
| --- | --- |
| `DISCORD_TOKEN` | Discord bot token |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `HOST_LOG_DIR` | Absolute host path, e.g. `/mnt/robot-logs/2026-Rebuilt` |
| `CLAUDE_MODEL` | optional |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | optional fine-grained PAT (Contents: Read) — enables GitHub MCP |
| `GITHUB_DEFAULT_REPO` | optional `owner/repo` for code questions |

4. **Deploy the stack**

Update later: **Pull and redeploy** (image tag `latest` is updated on every push to `main`).

Local/dev build without GHCR: `docker compose -f docker-compose.build.yml up -d --build`.

### 4. rclone on the host (Google Drive → HOST_LOG_DIR)

Do this on the **Portainer host** (or another always-on machine that mounts the same path), not inside the bot container.

```bash
# Install: https://rclone.org/install/
curl https://rclone.org/install.sh | sudo bash

rclone config
```

In `rclone config`:

1. `n` new remote — name it e.g. `gdrive`
2. Storage: **Google Drive**
3. Scope: full drive (or drive.readonly)
4. For a **Shared drive** (Team Drive): set `team_drive` when asked, or after config edit:
   ```bash
   rclone config show gdrive
   # then: rclone backend drives gdrive:
   # pick the Shared drive id and set team_drive = <id>
   ```
5. Finish auth (browser / rclone authorize on another machine if headless)

Find the folder:

```bash
rclone lsf "gdrive:Shared drives/Popcorn Penguins/RobotLogs/2026-Rebuilt" --drive-shared-with-me
# or browse:
rclone lsd "gdrive:" 
rclone lsd "gdrive:Popcorn Penguins/RobotLogs"
```

First sync + cron (every 10 minutes):

```bash
sudo mkdir -p /mnt/robot-logs/2026-Rebuilt

rclone sync "gdrive:Popcorn Penguins/RobotLogs/2026-Rebuilt" /mnt/robot-logs/2026-Rebuilt \
  --fast-list -v

# crontab -e
*/10 * * * * rclone sync "gdrive:Popcorn Penguins/RobotLogs/2026-Rebuilt" /mnt/robot-logs/2026-Rebuilt --fast-list >> /var/log/rclone-robot-logs.log 2>&1
```

Use the remote path that matches *your* Drive layout (Shared drive names vary). Verify with:

```bash
ls /mnt/robot-logs/2026-Rebuilt/*.wpilog | head
```

Set Portainer `HOST_LOG_DIR=/mnt/robot-logs/2026-Rebuilt`.

## Local Windows (dev)

```bash
git clone https://github.com/rylero/RobotLogBot.git
git clone https://github.com/rylero/chiefdelphi-mcp.git
cd RobotLogBot && npm install && cp .env.example .env
# ClaudeScope on PATH; set LOG_DIR to Drive Desktop folder
npm start
```

## Discord

`@bot …` (or DM / continue in a bot thread). Threads keep session context. Design → `/chiefdelphi`; logs → `/scope`.
