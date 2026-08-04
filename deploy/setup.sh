#!/usr/bin/env bash
# Tasuki アプリ別 VPS 初回セットアップ（root で実行する）
#
#   sudo DEPLOY_USER=<ログインユーザー> bash deploy/setup.sh <app>
#
# 冪等（再実行しても安全）。server.js の配置と起動は範囲外（deploy.sh が行う）。
# Caddy には触れない（deploy/caddy/ を参照して手動で設置する）。
#
#   RENDER_ONLY=1 を付けると、root でなくてもユニットを標準出力へ書き出すだけにする。
#   生成結果の検証に使う。
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

APP="${1:-}"
[ -n "$APP" ] || die "使い方: sudo DEPLOY_USER=<user> bash $0 <app>（利用可能: $(available_apps | tr '\n' ' ')）"
load_app "$APP"

DEPLOY_USER="${DEPLOY_USER:-deploy}"
BUN_PATH="${BUN_PATH:-/usr/local/bin/bun}"
TMPL="$WORKSPACE_ROOT/deploy/$APP/service.tmpl"
# UNIT_PATH は検証用に上書きできる。食い違いガード（下記）を root 権限なしで
# テストするために置いている。本番では既定のまま使う。
UNIT_PATH="${UNIT_PATH:-/etc/systemd/system/${SERVICE}.service}"

# DEPLOY_USER は chown / sudoers に使うため、ユーザー名として妥当な文字のみ許可
# （想定外の文字で sudoers を壊し sudo 全体を不能にする事故を防ぐ）。
printf '%s' "$DEPLOY_USER" | grep -Eq '^[a-z_][a-z0-9_-]{0,31}$' \
	|| die "DEPLOY_USER が不正です: $DEPLOY_USER"
[ -f "$TMPL" ] || die "$TMPL が見つかりません"

# ── ユニットの生成 ────────────────────────────────────────────────────────
# #51 A: 旧 vps-setup.sh はクォート付きヒアドキュメントで書き出していたため
# ${DEPLOY_USER} が展開されず User=deploy 固定だった。テンプレートの @KEY@ を
# 置換する形にして、指定した値が必ず反映されるようにする。
render_unit() {
	sed \
		-e "s|@DEPLOY_USER@|${DEPLOY_USER}|g" \
		-e "s|@APP_DIR@|${APP_DIR}|g" \
		-e "s|@ENV_FILE@|${ENV_FILE}|g" \
		-e "s|@BUN_PATH@|${BUN_PATH}|g" \
		"$TMPL"
}

if [ -n "${RENDER_ONLY:-}" ]; then
	render_unit
	exit 0
fi

# ── 既存ユニットとの食い違いガード ────────────────────────────────────────
# 稼働中のユニットと User= が違うまま上書きすると、再起動でサービスが起動しなくなる。
# 「気づかないうちに本番を壊す」経路なので、黙って上書きせず中断する。
#
# 検証は**何かを変更する前**に済ませる。root チェックより先に置いているのは、
# root でなくてもこのガードの動作を確かめられるようにするためでもある。
if [ -f "$UNIT_PATH" ]; then
	existing_user="$(grep -E '^User=' "$UNIT_PATH" | head -1 | cut -d= -f2- || true)"
	if [ -n "$existing_user" ] && [ "$existing_user" != "$DEPLOY_USER" ]; then
		[ -n "${FORCE:-}" ] || die "$(cat <<MSG
既存ユニットの User と指定が食い違っています。

  既存: $UNIT_PATH → User=$existing_user
  指定: DEPLOY_USER=$DEPLOY_USER

このまま上書きすると、再起動でサービスが起動しなくなる可能性があります。
意図した変更なら DEPLOY_USER=$existing_user を指定するか、FORCE=1 を付けてください。
MSG
)"
		echo "警告: FORCE=1 のため User を $existing_user → $DEPLOY_USER へ変更します" >&2
	fi
fi

[ "$(id -u)" -eq 0 ] || die "root で実行してください（sudo bash $0 $APP）"
[ -x "$BUN_PATH" ] || die "$BUN_PATH が無い。先に Bun を導入するか BUN_PATH= で指定してください"

echo "==> [$APP] SERVICE=$SERVICE PORT=$PORT USER=$DEPLOY_USER"

echo "==> [1/4] ディレクトリ（${DEPLOY_USER} 所有 = デプロイ転送が sudo 不要に）"
mkdir -p "$APP_DIR" "$WEB_ROOT"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "$APP_DIR" "$WEB_ROOT"
chmod 755 "$APP_DIR" "$WEB_ROOT"

echo "==> [2/4] env ファイル（既存なら上書きしない）"
if [ ! -f "$APP_DIR/$ENV_FILE" ]; then
	sed "s|@PORT@|${PORT}|g" "$WORKSPACE_ROOT/deploy/$APP/env.example" > "$APP_DIR/$ENV_FILE"
	chown "${DEPLOY_USER}:${DEPLOY_USER}" "$APP_DIR/$ENV_FILE"
	chmod 600 "$APP_DIR/$ENV_FILE"
	echo "  作成: $APP_DIR/$ENV_FILE（ALLOWED_ORIGINS 等を実値へ編集すること）"
else
	echo "  既存を保持: $APP_DIR/$ENV_FILE"
fi

echo "==> [3/4] systemd ユニット"
render_unit > "$UNIT_PATH"
chmod 644 "$UNIT_PATH"
systemctl daemon-reload
systemctl enable "$SERVICE"
echo "  $UNIT_PATH を生成（start は server.js 配置後）"

echo "==> [4/4] sudoers: deploy.sh 用に systemctl の一部を NOPASSWD"
# 一時ファイルに書いて visudo で検証してから設置する。壊れたファイルを直接
# /etc/sudoers.d/ に置くと sudo 全体が不能になるため、検証合格後にのみ設置する。
SYSTEMCTL="$(command -v systemctl)"
SUDOERS_TMP="$(mktemp)"
trap 'rm -f "$SUDOERS_TMP"' EXIT
cat > "$SUDOERS_TMP" <<SUDOEOF
${DEPLOY_USER} ALL=(root) NOPASSWD: ${SYSTEMCTL} restart ${SERVICE}, ${SYSTEMCTL} status ${SERVICE}, ${SYSTEMCTL} start ${SERVICE}, ${SYSTEMCTL} stop ${SERVICE}
SUDOEOF
visudo -cf "$SUDOERS_TMP"   # 構文NGならここで非0終了し、設置されない
install -m 0440 -o root -g root "$SUDOERS_TMP" "/etc/sudoers.d/tasuki-${APP}"
echo "  /etc/sudoers.d/tasuki-${APP} を設置"

echo ""
echo "==> [$APP] 完了。次の手順:"
echo "    1) $APP_DIR/$ENV_FILE を実値へ編集する"
echo "    2) Caddy に断片を設置する（deploy/caddy/README を参照）"
echo "    3) ローカルから TASUKI_SSH_HOST=<host> ./deploy/deploy.sh $APP"
echo "    4) sudo systemctl start $SERVICE"
