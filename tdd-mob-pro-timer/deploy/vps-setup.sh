#!/usr/bin/env bash
# Tasuki VPS 初回セットアップ（root で実行する: sudo bash vps-setup.sh）
# tasuki 専用の準備のみ。Caddy（gallery/play と共用）には触れない。
# 冪等: 再実行しても安全。server.js の配置と起動はこのスクリプトの範囲外（deploy.sh で行う）。
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="${APP_DIR:-/opt/tasuki}"
WEB_ROOT="${WEB_ROOT:-/var/www/tasuki}"
BUN_SRC="/home/${DEPLOY_USER}/.bun/bin/bun"
SYSTEMCTL="$(command -v systemctl)"

[ "$(id -u)" -eq 0 ] || { echo "root で実行してください（sudo bash $0）"; exit 1; }
[ -x "$BUN_SRC" ] || { echo "ERROR: $BUN_SRC が無い。先に Bun を導入してください"; exit 1; }
# DEPLOY_USER は chown / sudoers に使うため、ユーザー名として妥当な文字のみ許可
# （想定外の文字で sudoers を壊し sudo 全体を不能にする事故を防ぐ）。
printf '%s' "$DEPLOY_USER" | grep -Eq '^[a-z_][a-z0-9_-]{0,31}$' \
  || { echo "ERROR: DEPLOY_USER が不正です: $DEPLOY_USER"; exit 1; }

echo "==> [1/5] Bun を /usr/local/bin へ"
install -m 0755 "$BUN_SRC" /usr/local/bin/bun
/usr/local/bin/bun --version

echo "==> [2/5] ディレクトリ作成（${DEPLOY_USER} 所有 = デプロイ転送が sudo 不要に）"
mkdir -p "$APP_DIR" "$WEB_ROOT"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "$APP_DIR" "$WEB_ROOT"
chmod 755 "$APP_DIR" "$WEB_ROOT"

echo "==> [3/5] env ファイル（既存なら上書きしない）"
if [ ! -f "$APP_DIR/tasuki-sync.env" ]; then
  cat > "$APP_DIR/tasuki-sync.env" <<'ENVEOF'
# Tasuki sync 本番環境変数
NODE_ENV=production
PORT=8787
HOST=127.0.0.1
ALLOWED_ORIGINS=https://tasuki.example.com
MAX_CONNECTIONS=200
MAX_ROOMS=50
ROOM_IDLE_TTL_MS=1800000
ENVEOF
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "$APP_DIR/tasuki-sync.env"
  chmod 600 "$APP_DIR/tasuki-sync.env"
  echo "  env を作成: $APP_DIR/tasuki-sync.env"
else
  echo "  既存 env を保持: $APP_DIR/tasuki-sync.env"
fi

echo "==> [4/5] systemd ユニット（${DEPLOY_USER} で常駐）"
cat > /etc/systemd/system/tasuki-sync.service <<'UNITEOF'
[Unit]
Description=Tasuki sync server (TDD Mob Pro Timer)
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/bun /opt/tasuki/server.js
WorkingDirectory=/opt/tasuki
EnvironmentFile=/opt/tasuki/tasuki-sync.env
Restart=on-failure
RestartSec=2
User=deploy
Group=deploy
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
UNITEOF
"$SYSTEMCTL" daemon-reload
"$SYSTEMCTL" enable tasuki-sync   # 自動起動を有効化（start は server.js 配置後）
echo "  enable 済み（start はまだ。deploy.sh 実行後に start する）"

echo "==> [5/5] sudoers: deploy.sh 用に systemctl の一部を NOPASSWD"
# 一時ファイルに書いて visudo で検証してから設置する。
# 壊れたファイルを直接 /etc/sudoers.d/ に置くと sudo 全体が不能になるため、
# 「検証合格後にのみ設置」する（DEPLOY_USER は上で検証済み）。
SUDOERS_TMP="$(mktemp)"
trap 'rm -f "$SUDOERS_TMP"' EXIT
cat > "$SUDOERS_TMP" <<SUDOEOF
${DEPLOY_USER} ALL=(root) NOPASSWD: ${SYSTEMCTL} restart tasuki-sync, ${SYSTEMCTL} status tasuki-sync, ${SYSTEMCTL} start tasuki-sync, ${SYSTEMCTL} stop tasuki-sync
SUDOEOF
visudo -cf "$SUDOERS_TMP"   # 構文NGならここで非0終了し、設置されない
install -m 0440 -o root -g root "$SUDOERS_TMP" /etc/sudoers.d/tasuki-deploy
echo "  sudoers ルール設置完了"

echo ""
echo "==> 完了。次の手順:"
echo "    1) Caddy に tasuki.example.com ブロックを追記（別途・慎重に）"
echo "    2) ローカルから deploy.sh を実行して server.js と web を配置"
echo "    3) sudo systemctl start tasuki-sync"
