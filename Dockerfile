# Builds the pnpm monorepo: the packages, the Next.js standalone web app, and the sync worker's runtime install
FROM node:22-alpine AS node-builder

ENV NEXT_DOCKER=1

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

WORKDIR /build

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig*.json ./
COPY config/ ./config/
COPY packages/ ./packages/
COPY apps/ ./apps/

RUN pnpm install --frozen-lockfile

RUN pnpm run build:packages

# Type checking is disabled for this build via next.config.js
RUN NEXT_DOCKER=1 pnpm --filter @spotify-to-plex/web run build

# Swap the dev install for the sync worker's production dependencies only: the web app
# already carries its own in the standalone output, and the jobs run TypeScript through tsx
RUN set -e; \
    rm -rf node_modules apps/*/node_modules packages/*/node_modules; \
    pnpm install --frozen-lockfile --prod --offline --filter "@spotify-to-plex/sync-worker..."

# Node and npm come from the official image instead of piping NodeSource's setup script into a shell
FROM node:22-bookworm-slim AS node-runtime

# Runtime: Node.js 22 for the web app and sync worker, Python 3.10 for the scraper, supervisord for all three
FROM ubuntu:22.04 AS production

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    NODE_ENV=production \
    PYTHONPATH=/app/apps/spotify-scraper \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=9030 \
    HOSTNAME=0.0.0.0 \
    PLEX_APP_ID=eXf+f9ktw3CZ8i45OY468WxriOCtoFxuNPzVeDcAwfw= \
    SPOTIFY_SCRAPER_URL=http://localhost:3020 \
    STORAGE_DIR=/app/config \
    PUID=99 \
    PGID=100

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    # Without this TZ names nothing: date and the scraper's log stamps stay UTC
    tzdata \
    python3 python3-pip \
    libatomic1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && node --version && npm --version

RUN pip install --no-cache-dir supervisor

# The programs run as this user; the entrypoint moves it to PUID/PGID. gid 100 is already "users" here
RUN groupadd -o -g 100 app \
    && useradd -o -u 99 -g 100 -M -d /nonexistent -s /usr/sbin/nologin app

RUN mkdir -p /app/config /var/log/supervisor

COPY apps/spotify-scraper/requirements.txt /app/apps/spotify-scraper/
WORKDIR /app/apps/spotify-scraper
RUN pip install --no-cache-dir -r requirements.txt \
    && python3 -c "from spotify_scraper import SpotifyClient; print('SpotifyScraper installed successfully')"

COPY apps/spotify-scraper/ /app/apps/spotify-scraper/
# Compiled here so the scraper never writes __pycache__ into a directory it does not own
RUN python3 -m compileall -q /app/apps/spotify-scraper

COPY --from=node-builder /build/apps/sync-worker/src/ /app/apps/sync-worker/src/
COPY --from=node-builder /build/apps/sync-worker/package.json /app/apps/sync-worker/
COPY --from=node-builder /build/apps/sync-worker/tsconfig.production.json /app/apps/sync-worker/tsconfig.json
COPY --from=node-builder /build/apps/sync-worker/node_modules/ /app/apps/sync-worker/node_modules/
COPY --from=node-builder /build/node_modules/ /app/node_modules/
COPY --from=node-builder /build/packages/ /app/packages/

# Next.js with distDir "dist" puts the standalone server in dist/standalone/
COPY --from=node-builder /build/apps/web/dist/standalone/ /app/web/
COPY --from=node-builder /build/apps/web/dist/static/ /app/web/apps/web/dist/static/
COPY --from=node-builder /build/apps/web/public/ /app/web/apps/web/public/

COPY supervisor/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh

# The app runs as a non-root user, so everything under /app must be readable by it and none of it writable
RUN set -e; \
    chmod 755 /docker-entrypoint.sh; \
    unreadable="$(find /app \( -type f ! -perm -0004 \) -o \( -type d ! -perm -0005 \) | head -20)"; \
    if [ -n "$unreadable" ]; then echo "not world-readable:"; echo "$unreadable"; exit 1; fi; \
    writable="$(find /app -xdev -path /app/config -prune -o ! -type l -perm /022 -print -quit)"; \
    if [ -n "$writable" ]; then echo "writable below /app:"; echo "$writable"; exit 1; fi

WORKDIR /app

# 9030: web app; 3020: scraper (internal)
EXPOSE 9030 3020

VOLUME ["/app/config"]

# Shell form, so a PORT set at run time is the one checked
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -fs "http://localhost:${PORT}/" > /dev/null || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]

CMD ["supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
