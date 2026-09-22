# RobotLogBot

Always-on Discord agent for FRC log analysis. It talks to people in a team channel, reads `.wpilog` files from a **local folder**, queries them with [ClaudeScope](https://github.com/rylero/ClaudeScope), and looks up design threads through [chiefdelphi-mcp](https://github.com/rylero/chiefdelphi-mcp).

Those two are separate repos you install alongside this one — not git submodules.

Meant to run on a closet server (or any always-on box). Discord only needs outbound internet.

## How Google Drive is used

The bot never talks to Drive. ClaudeScope needs real files on disk, so Drive is only a sync source:

1. **Preferred on a Windows closet box:** install [Google Drive for Desktop](https://www.google.com/drive/download/), stream or mirror the team log folder, set `LOG_DIR` to that path. New uploads show up as local `.wpilog` files.
2. **Headless / rclone:** `rclone config` a Drive remote, set `RCLONE_REMOTE` (example `gdrive:FRC/Logs`) and `LOG_DIR`. The `/ask` agent can run `sync_drive`, or you cron `rclone sync`.
3. Someone can also drop a `.wpilog` on a Discord message; the bot saves it under `LOG_DIR/inbox`.

If `LOG_DIR` is empty, `/logs` will say so.

## What people type

- `/ask why did we brown out in Q37`
- `/logs q37`
- `@LogBot compare elevator current in Q36 vs Q37`
- Drop a `.wpilog` on a message to the bot

Follow-ups stay in the thread the bot opens.

## Setup

```bash
git clone https://github.com/rylero/RobotLogBot.git
git clone https://github.com/rylero/chiefdelphi-mcp.git
cd RobotLogBot
npm install
cp .env.example .env
```

Also install a [ClaudeScope](https://github.com/rylero/ClaudeScope/releases) binary on `PATH`.

Fill in `DISCORD_TOKEN`, `ANTHROPIC_API_KEY`, `ALLOWED_CHANNEL_IDS`, and `LOG_DIR`. `CHIEFDELPHI_MCP_CWD` defaults to `../chiefdelphi-mcp`.

## Closet server

1. Node 20+, ClaudeScope on `PATH`, Drive for Desktop **or** rclone.
2. Set `LOG_DIR` at the local copy of the Drive folder.
3. Invite the Discord bot with **Message Content Intent** on, and permissions: View Channel, Send Messages, Send Messages in Threads, Read Message History, Attach Files, Use Slash Commands.
4. Run `npm start` under systemd, NSSM, or Task Scheduler so it comes back after reboot.

Windows service example (NSSM): Application `C:\Program Files\nodejs\npx.cmd`, arguments `tsx src/index.ts`, startup directory this repo.

Linux unit sketch:

```ini
[Service]
WorkingDirectory=/opt/RobotLogBot
EnvironmentFile=/opt/RobotLogBot/.env
ExecStart=/usr/bin/npx tsx src/index.ts
Restart=always
```

## Discord app

Developer Portal → New Application → Bot:

- Enable **Message Content Intent**
- Copy the bot token into `DISCORD_TOKEN`
- OAuth2 URL Generator: `bot` + `applications.commands`
- Bot permissions listed above

Copy channel IDs into `ALLOWED_CHANNEL_IDS`. Leave `ALLOWED_USER_IDS` empty to allow anyone in those channels; set it to lock the bot to specific people.

## Local dev

```bash
cp .env.example .env
npm install
npm start
```
