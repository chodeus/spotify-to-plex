#!/bin/bash
set -euo pipefail

CONFIG_DIR=/app/config
APP_HOME=/tmp/app-home
PUID="${PUID:-99}"
PGID="${PGID:-100}"
# supervisord passes it to the web app; an empty value would fall back to Next's 3000
export PORT="${PORT:-9030}"

echo "🎵 Spotify-to-Plex Starting..."
echo "=============================="

if [ "$(id -u)" != 0 ]; then
    echo "FATAL: start the container as root and set PUID/PGID; it drops to that user itself." >&2
    exit 1
fi

# supervisord stays root so it can start each program as the app user
if [ "$(id -u app)" != "$PUID" ] || [ "$(id -g app)" != "$PGID" ]; then
    groupmod -o -g "$PGID" app
    usermod -o -u "$PUID" -g "$PGID" app
fi

# npm and npx need a writable HOME for their cache and logs
mkdir -p "$APP_HOME"
chown "$PUID:$PGID" "$APP_HOME"

# Only what is wrong: an already-correct config tree costs a stat pass, not a rewrite.
# A failed chown alone is not fatal (a read-only or foreign-uid share); the write probe decides
find "$CONFIG_DIR" \( ! -user "$PUID" -o ! -group "$PGID" \) -exec chown -h "$PUID:$PGID" {} + || true

probe="$CONFIG_DIR/.write-probe.$$"
if ! runuser -u app -- touch "$probe" 2>/dev/null; then
    echo "FATAL: $CONFIG_DIR is not writable by $PUID:$PGID. Check the volume's permissions, or set PUID/PGID to its owner." >&2
    exit 1
fi
rm -f "$probe"

echo "✅ Web UI Port: $PORT"
echo "✅ Config Directory: $CONFIG_DIR (running as $PUID:$PGID)"
if [ -n "${SPOTIFY_API_CLIENT_ID:-}" ]; then
    echo "✅ Spotify API configured"
fi
if [ -n "${TIDAL_API_CLIENT_ID:-}" ]; then
    echo "✅ Tidal API configured"
fi

echo "🚀 Starting services..."
exec "$@"
