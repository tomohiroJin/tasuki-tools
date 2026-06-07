#!/usr/bin/env bash
set -euo pipefail

# ===== 設定（環境変数で上書き可能）=====
SSH_HOST="${TASUKI_SSH_HOST:-niku9}"        # ~/.ssh/config のホスト別名 か user@157.7.141.211
WEB_ROOT="${TASUKI_WEB_ROOT:-/var/www/tasuki}"
APP_DIR="${TASUKI_APP_DIR:-/opt/tasuki}"
SERVICE="${TASUKI_SERVICE:-tasuki-sync}"

# モノレポルート（このスクリプトの1つ上）へ移動
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PNPM="${PNPM:-pnpm}"   # 見つからない場合は PNPM=~/.local/bin/pnpm で実行

echo "==> [1/5] web をビルド (vite)"
"$PNPM" --filter @tdd-mob/web build

echo "==> [2/5] sync を単一ファイルにバンドル (bun build)"
mkdir -p deploy/dist
bun build apps/sync/src/server.ts --target bun --outfile deploy/dist/server.js

echo "==> [3/5] web dist を転送 → ${SSH_HOST}:${WEB_ROOT}"
# --delete はリモート web root のファイルを消すため、ビルド成果物が
# 揃っていることを確認してから実行する（空 dist による事故防止）。
if [ ! -f apps/web/dist/index.html ]; then
	echo "ERROR: web ビルドが不完全です (apps/web/dist/index.html が無い)。中止します。" >&2
	exit 1
fi
rsync -az --delete apps/web/dist/ "${SSH_HOST}:${WEB_ROOT}/"

echo "==> [4/5] server.js を転送 → ${SSH_HOST}:${APP_DIR}"
scp deploy/dist/server.js "${SSH_HOST}:${APP_DIR}/server.js"

echo "==> [5/5] sync を再起動: ${SERVICE}"
# shellcheck disable=SC2029  # ${SERVICE} はクライアント側での展開が意図した動作
ssh "${SSH_HOST}" "sudo systemctl restart ${SERVICE} && sudo systemctl --no-pager status ${SERVICE} | head -5"

echo "==> 完了: https://tasuki.niku9.click/"
