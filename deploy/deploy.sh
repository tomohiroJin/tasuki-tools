#!/usr/bin/env bash
# Tasuki アプリ別デプロイ
#
#   TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh <app>
#
# 対象アプリだけを turbo --filter でビルドし、そのアプリの配置先へ転送して、
# そのアプリの systemd ユニットだけを再起動する。他アプリには一切触れない。
#
#   DRY_RUN=1 を付けると、実行せずコマンド列を表示する。
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

APP="${1:-}"
if [ -z "$APP" ]; then
	echo "使い方: TASUKI_SSH_HOST=<host> $0 <app>" >&2
	echo "  利用可能なアプリ: $(available_apps | tr '\n' ' ')" >&2
	exit 1
fi

load_app "$APP"
# 接続先の解決は**ビルドより先**に行う。長いビルドを走らせた後で
# 「接続先が未設定」と言われるのは時間の無駄なので、先に落とす（#51 B）。
require_ssh_host

cd "$WORKSPACE_ROOT"

PNPM="${PNPM:-pnpm}"   # 見つからない場合は PNPM=~/.local/bin/pnpm で実行
BUNDLE_DIR="deploy/$APP/dist"

echo "==> [$APP] 対象: SERVICE=$SERVICE PORT=$PORT → $SSH_HOST"
echo "    web  $WEB_DIST → $SSH_HOST:$WEB_ROOT"
echo "    sync $SYNC_ENTRY → $SSH_HOST:$APP_DIR/server.js"

echo "==> [1/5] web をビルド (vite・${BUILD_FILTER} のみ)"
run "$PNPM" --filter "$BUILD_FILTER" build

echo "==> [2/5] sync を単一ファイルにバンドル (bun build)"
run mkdir -p "$BUNDLE_DIR"
run bun build "$SYNC_ENTRY" --target bun --outfile "$BUNDLE_DIR/server.js"

echo "==> [3/5] web dist を転送"
# --delete はリモート web root のファイルを消すため、ビルド成果物が
# 揃っていることを確認してから実行する（空 dist による事故防止）。
if [ -z "${DRY_RUN:-}" ] && [ ! -f "$WEB_DIST/index.html" ]; then
	die "web ビルドが不完全です（$WEB_DIST/index.html が無い）。中止します。"
fi
run rsync -az --delete "$WEB_DIST/" "$SSH_HOST:$WEB_ROOT/"

echo "==> [4/5] server.js を転送"
run scp "$BUNDLE_DIR/server.js" "$SSH_HOST:$APP_DIR/server.js"

echo "==> [5/5] $SERVICE を再起動"
# restart のみ sudo（NOPASSWD 対象）。status は閲覧用なので sudo 不要にして
# sudoers ルール（--no-pager 無しの status）との不一致による失敗を避ける。
# SERVICE は load_app でシェルメタ文字を弾いてある。
# shellcheck disable=SC2029  # ${SERVICE} はクライアント側での展開が意図した動作
run ssh "$SSH_HOST" "sudo systemctl restart ${SERVICE}; systemctl --no-pager status ${SERVICE} | head -5"

echo "==> [$APP] 完了"
echo ""
echo "確認:"
echo "  配信中のハッシュとローカルビルドの一致を見る（新版が出た決定的証拠）"
echo "    grep -o 'assets/index-[A-Za-z0-9_-]*\\.js' $WEB_DIST/index.html | head -1"
echo "  クラッシュループしていないこと（20 秒あけて 2 回・NRestarts と MainPID を見る）"
echo "    ssh $SSH_HOST 'systemctl --no-pager show $SERVICE -p ActiveState -p NRestarts -p MainPID'"
