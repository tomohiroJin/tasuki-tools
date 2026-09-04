#!/usr/bin/env bash
# Tasuki アプリ別デプロイ
#
#   TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh <app>
#
# 対象アプリだけを turbo --filter でビルドし、そのアプリの配置先へ転送して、
# そのアプリの systemd ユニットだけを再起動する。他アプリには一切触れない。
#
# 静的サイト（app.env に STATIC_ONLY=1）は Caddy が直接配信するので、
# バンドルと再起動の段を飛ばす。
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
STATIC="${STATIC_ONLY:-}"

echo "==> [$APP] → $SSH_HOST"
if [ -n "$STATIC" ]; then
	echo "    静的サイト（再起動するサービスは無い）"
	echo "    web  $WEB_DIST → $SSH_HOST:$WEB_ROOT"
else
	echo "    SERVICE=$SERVICE  PORT=$PORT"
	echo "    web  $WEB_DIST → $SSH_HOST:$WEB_ROOT"
	echo "    sync $SYNC_ENTRY → $SSH_HOST:$APP_DIR/server.js"
fi

step=0
total=$([ -n "$STATIC" ] && echo 2 || echo 4)
next() {
	step=$((step + 1))
	echo "==> [$step/$total] $*"
}

next "web をビルド (vite・${BUILD_FILTER} のみ)"
run "$PNPM" --filter "$BUILD_FILTER" build

if [ -z "$STATIC" ]; then
	next "sync を単一ファイルにバンドル (bun build)"
	run mkdir -p "$BUNDLE_DIR"
	run bun build "$SYNC_ENTRY" --target bun --outfile "$BUNDLE_DIR/server.js"
fi

next "web dist を転送"
# --delete はリモート web root のファイルを消すため、ビルド成果物が
# 揃っていることを確認してから実行する（空 dist による事故防止）。
if [ -z "${DRY_RUN:-}" ] && [ ! -f "$WEB_DIST/index.html" ]; then
	die "web ビルドが不完全です（$WEB_DIST/index.html が無い）。中止します。"
fi
run rsync -az --delete "$WEB_DIST/" "$SSH_HOST:$WEB_ROOT/"

if [ -z "$STATIC" ]; then
	next "server.js を転送して $SERVICE を再起動"
	# 前版を退避してから上書きする。切り戻しは README の手順を手でたどる形だが、
	# **戻す先が無ければ手順があっても戻せない**（#146）。退避に失敗しても
	# デプロイ自体は続ける（初回は前版が存在しない）。
	BACKUP="$APP_DIR/server.js.bak-$(date +%Y%m%d-%H%M%S)"
	# shellcheck disable=SC2029  # パスはクライアント側での展開が意図した動作
	run ssh "$SSH_HOST" "cp -p '$APP_DIR/server.js' '$BACKUP' 2>/dev/null || echo '前版が無いため退避しません'"
	run scp "$BUNDLE_DIR/server.js" "$SSH_HOST:$APP_DIR/server.js"

	# restart のみ sudo（NOPASSWD 対象）。status は閲覧用なので sudo 不要にして
	# sudoers ルール（--no-pager 無しの status）との不一致による失敗を避ける。
	# SERVICE は load_app でシェルメタ文字を弾いてある。
	if ! restart_and_verify; then
		cat >&2 <<MSG

ERROR: [$APP] $SERVICE が起動していません。**新しい server.js は転送済みです。**

  切り戻し（前版に戻して再起動する）:
    ssh $SSH_HOST "cp -p '$BACKUP' '$APP_DIR/server.js'"
    ssh $SSH_HOST "sudo systemctl restart $SERVICE"

  原因を見る:
    ssh $SSH_HOST "journalctl -u $SERVICE -n 50 --no-pager"

  #103・#145 以降、次の 4 つは**起動しないことで守る**設計です。まずここを疑ってください。
    ALLOWED_ORIGINS が未設定 / HOST がループバック外 / NODE_ENV が未知の値 / AI_UNLOCK_KEY が下限を割る
    ssh $SSH_HOST "cat '$APP_DIR/$ENV_FILE'"
MSG
		exit 1
	fi
fi

echo "==> [$APP] 完了"
echo ""
echo "確認:"
echo "  配信中のハッシュとローカルビルドの一致を見る（新版が出た決定的証拠）"
echo "    grep -o 'assets/index-[A-Za-z0-9_-]*\\.js' $WEB_DIST/index.html | head -1"
if [ -z "$STATIC" ]; then
	# 起動の確認（間を空けて 2 回・NRestarts）は再起動の段で済ませている（#146）。
	# ここに残すのは、時間をおいてから見直したいときの手順。
	echo "  時間をおいてから改めて見るとき（ActiveState と NRestarts）"
	echo "    ssh $SSH_HOST 'systemctl --no-pager show $SERVICE -p ActiveState -p NRestarts -p MainPID'"
fi
echo "  3 アプリすべてを出し終えたら、外から通しで確認する（アプリ単位ではなくサイト全体）"
echo "    TASUKI_E2E_BASE_URL=https://<公開ドメイン> pnpm e2e:prod"
