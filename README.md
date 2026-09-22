# discord-log-bot

Always-on Discord agent for FRC log analysis. It talks to people in a team channel, reads `.wpilog` files from a local Google Drive sync, queries them with [ClaudeScope](https://github.com/rylero/ClaudeScope), and looks up design threads through [chiefdelphi-mcp](https://github.com/rylero/chiefdelphi-mcp).

Both tools are git submodules under `vendor/`:

- [`vendor/ClaudeScope`](https://github.com/rylero/ClaudeScope)
- [`vendor/chiefdelphi-mcp`](https://github.com/rylero/chiefdelphi-mcp)

Meant to run on a closet server (or any always-on box). Discord only needs outbound internet — the bot does not have to live on Railway.

## What people type

- `/ask why did we brown out in Q37`
- `/logs q37`
- `@LogBot compare elevator current in Q36 vs Q37`
- Drop a `.wpilog` on a message to the bot

Follow-ups stay in the thread the bot opens.

## Clone

```bash
git clone --recurse-submodules https://github.com/rylero/discord-log-bot.git
cd discord-log-bot
npm install
```

If you already cloned without submodules:

```bash
git submodule update --init --recursive
```

## Closet server

1. Install Node 20+, [rclone](https://rclone.org), and a [ClaudeScope](https://github.com/rylero/ClaudeScope/releases) binary on `PATH` (or build from `vendor/ClaudeScope`).
2. Copy `.env.example` to `.env` and fill in tokens, `ALLOWED_CHANNEL_IDS`, and `LOG_DIR`. `CHIEFDELPHI_MCP_CWD` defaults to `vendor/chiefdelphi-mcp`.
3. Point rclone at the Drive log folder (`rclone config`), then set `RCLONE_REMOTE` (example: `gdrive:FRC/Logs`). First sync:

   ```bash
   rclone sync "$RCLONE_REMOTE" "$LOG_DIR" --fast-list
   ```

4. Invite the Discord bot with **Message Content Intent** on, and permissions: View Channel, Send Messages, Send Messages in Threads, Read Message History, Attach Files, Use Slash Commands.
5. Run `npm start` under systemd, NSSM, or Task Scheduler so it comes back after reboot.

Windows service example (NSSM): Application `C:\Program Files\nodejs\npx.cmd`, arguments `tsx src/index.ts`, startup directory this repo, env file the `.env`.

Linux unit sketch:

```ini
[Service]
WorkingDirectory=/opt/discord-log-bot
EnvironmentFile=/opt/discord-log-bot/.env
ExecStart=/usr/bin/npx tsx src/index.ts
Restart=always
```

Optional cron to keep Drive warm: `*/10 * * * * rclone sync …` — or just tell the bot the logs were uploaded and it will call `sync_drive`.

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
