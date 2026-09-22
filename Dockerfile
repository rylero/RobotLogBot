# RobotLogBot — Portainer / Docker
FROM node:22-bookworm-slim

ARG CLAUDESCOPE_VERSION=v1.2.1
ARG CHIEFDELPHI_REF=main

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git gosu python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# ClaudeScope CLI
RUN curl -fsSL -o /usr/local/bin/ClaudeScope \
      "https://github.com/rylero/ClaudeScope/releases/download/${CLAUDESCOPE_VERSION}/ClaudeScope-linux-amd64" \
    && chmod +x /usr/local/bin/ClaudeScope \
    && ClaudeScope version || true

WORKDIR /app

# App source
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY knowledge ./knowledge
COPY .claude ./.claude
COPY requirements.txt ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN pip3 install --break-system-packages --no-cache-dir -r requirements.txt \
    && chmod +x /usr/local/bin/docker-entrypoint.sh

# Vendor Chief Delphi MCP (sibling path used by default config)
RUN git clone --depth 1 --branch "${CHIEFDELPHI_REF}" \
      https://github.com/rylero/chiefdelphi-mcp.git /app/vendor/chiefdelphi-mcp \
    && cd /app/vendor/chiefdelphi-mcp && npm ci

# Claude Agent SDK refuses --dangerously-skip-permissions as root.
# Official node image provides uid 1000 "node".
RUN mkdir -p /data/logs /app/data /app/vendor/chiefdelphi-mcp/data \
    && chown -R node:node /app /data

ENV NODE_ENV=production \
    LOG_DIR=/data/logs \
    CHIEFDELPHI_MCP_CWD=/app/vendor/chiefdelphi-mcp \
    CLAUDESCOPE_BIN=/usr/local/bin/ClaudeScope \
    BOT_LOCK_PORT=39281 \
    HOME=/home/node

VOLUME ["/data/logs", "/app/vendor/chiefdelphi-mcp/data", "/app/data"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npx", "tsx", "src/index.ts"]
