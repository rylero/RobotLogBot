#!/bin/sh
set -e
# Named volumes often mount as root; Claude Code must not run as root.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /data/logs /app/data /app/vendor/chiefdelphi-mcp/data
  chown -R node:node /app/data /app/vendor/chiefdelphi-mcp/data /data/logs 2>/dev/null || true
  exec gosu node "$@"
fi
exec "$@"
