# RobotLogBot

Always-on Discord agent for FRC log analysis. Uses the Claude Agent SDK with:

- **scope** — ClaudeScope log analysis ([ClaudeScope](https://github.com/rylero/ClaudeScope))
- **chiefdelphi** — FRC design research via [chiefdelphi-mcp](https://github.com/rylero/chiefdelphi-mcp)

Default model: `claude-sonnet-4-6`.

## Portainer (recommended)

Portainer clones this repo and builds the image. You do **not** need to clone manually on the host (except optionally for rclone/scripts).

### 1. Prepare log storage on the host

Sync wpilogs to a folder the Docker host can see (see **rclone** below), e.g. `/mnt/robot-logs/2026-Rebuilt`.

### 2. Create the stack from GitHub

1. Portainer → **Stacks** → **Add stack**
2. Build method: **Repository**
3. Repository URL: `https://github.com/rylero/RobotLogBot`
4. Compose path: `docker-compose.yml` (branch `main`)
5. Enable **Authenticate** only if the repo is private (it’s public)
6. Under **Environment variables**, add:

| Name | Value |
| --- | --- |
| `DISCORD_TOKEN` | Discord bot token |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `HOST_LOG_DIR` | Absolute host path, e.g. `/mnt/robot-logs/2026-Rebuilt` |
| `CLAUDE_MODEL` | optional, default `claude-sonnet-4-6` |
| `ALLOWED_CHANNEL_IDS` | optional |

7. **Deploy the stack**

Portainer will clone the repo, build `Dockerfile` (installs ClaudeScope + vendors chiefdelphi-mcp), and start the container. Check **Logs** for `Discord ready` and `Single-instance lock acquired`.

No ports to publish. Redeploy / pull+rebuild when you push to `main`.

### 3. rclone on the host (Google Drive → HOST_LOG_DIR)

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

`/ask …` or `@bot …`. Threads keep session context. Design → `/chiefdelphi`; logs → `/scope`.
