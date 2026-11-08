#!/usr/bin/env bash
# Деплой онлайн-режима на VPS: сборка клиентов локально, rsync репозитория
# (без .git/node_modules), рестарт systemd-сервиса, проверка /healthz.
#
# Использование:
#   ./deploy/deploy.sh <user@host> [remote-path]
# Пример:
#   ./deploy/deploy.sh retro@retro.example.com /opt/retro
#
# Предполагается: systemd-unit retro.service (deploy/retro.service) и env
# (/etc/retro/env) уже настроены на сервере — см. DEPLOY.md.
set -euo pipefail

TARGET=${1:?"usage: deploy.sh <user@host> [remote-path]"}
REMOTE_PATH=${2:-/opt/retro}

cd "$(dirname "$0")/.."

echo "[deploy] сборка Mini App-клиентов (bun run build:tma)…"
bun run build:tma

echo "[deploy] rsync → $TARGET:$REMOTE_PATH"
rsync -az --delete \
  --exclude .git \
  --exclude node_modules \
  --exclude dist \
  --exclude 'server/data' \
  --exclude test-results \
  --exclude playwright-report \
  --exclude .DS_Store \
  ./ "$TARGET:$REMOTE_PATH/"

echo "[deploy] рестарт retro.service…"
ssh "$TARGET" "sudo systemctl restart retro && sleep 1 && systemctl is-active retro"

echo "[deploy] /healthz:"
ssh "$TARGET" "curl -sf http://127.0.0.1:${PORT:-8787}/healthz && echo"

echo "[deploy] ок: $TARGET:$REMOTE_PATH"
