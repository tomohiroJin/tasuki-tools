#!/usr/bin/env bash
set -euo pipefail

# ===== 設定（環境変数で上書き可能）=====
SSH_HOST="${TASUKI_SSH_HOST:-myvps}"        # ~/.ssh/config のホスト別名 か user@203.0.113.10
WEB_ROOT="${TASUKI_WEB_ROOT:-/var/www/tasuki}"
APP_DIR="${TASUKI_APP_DIR:-/opt/tasuki}"
SERVICE="${TASUKI_SERVICE:-tasuki-sync}"

# SERVICE はリモートの sudo コマンド文字列に埋め込むため、シェルメタ文字を弾く
# （環境変数経由のコマンドインジェクション防止）。
if ! [[ "${SERVICE}" =~ ^[A-Za-z0-9_.@-]+$ ]]; then
	echo "ERROR: TASUKI_SERVICE に使える文字は英数と _.@- のみです: ${SERVICE}" >&2
	exit 1
fi

# ワークスペースルート（このスクリプトの2つ上）へ移動。
# S1-a で deploy/ が tdd-mob-pro-timer/deploy/ から deploy/timer/ へ移ったため、
# ルートは1つ上ではなく2つ上になった。
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PNPM="${PNPM:-pnpm}"   # 見つからない場合は PNPM=~/.local/bin/pnpm で実行

echo "==> [1/5] web をビルド (vite)"
"$PNPM" --filter @tasuki/timer-web build

echo "==> [2/5] sync を単一ファイルにバンドル (bun build)"
mkdir -p deploy/timer/dist
bun build apps/timer-sync/src/server.ts --target bun --outfile deploy/timer/dist/server.js

echo "==> [3/5] web dist を転送 → ${SSH_HOST}:${WEB_ROOT}"
# --delete はリモート web root のファイルを消すため、ビルド成果物が
# 揃っていることを確認してから実行する（空 dist による事故防止）。
if [ ! -f apps/timer-web/dist/index.html ]; then
	echo "ERROR: web ビルドが不完全です (apps/timer-web/dist/index.html が無い)。中止します。" >&2
	exit 1
fi
rsync -az --delete apps/timer-web/dist/ "${SSH_HOST}:${WEB_ROOT}/"

echo "==> [4/5] server.js を転送 → ${SSH_HOST}:${APP_DIR}"
scp deploy/timer/dist/server.js "${SSH_HOST}:${APP_DIR}/server.js"

echo "==> [5/5] sync を再起動: ${SERVICE}"
# restart のみ sudo（NOPASSWD 対象）。status は閲覧用なので sudo 不要にして
# sudoers ルール（--no-pager 無しの status）との不一致による失敗を避ける。
# shellcheck disable=SC2029  # ${SERVICE} はクライアント側での展開が意図した動作
ssh "${SSH_HOST}" "sudo systemctl restart ${SERVICE}; systemctl --no-pager status ${SERVICE} | head -5"

echo "==> 完了: https://tasuki.example.com/"
