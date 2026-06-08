#!/usr/bin/env bash
# Caddy に tasuki.niku9.click ブロックを安全に追記する（root で実行: sudo bash）。
# gallery/play と共用の Caddyfile を壊さないよう:
#   バックアップ → 追記 → caddy validate → 合格なら reload / 失敗なら自動復元。
# 冪等: 既に tasuki ブロックがあれば追記しない。
set -euo pipefail

CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
DOMAIN="tasuki.niku9.click"

[ "$(id -u)" -eq 0 ] || { echo "root で実行してください（sudo bash $0）"; exit 1; }
[ -f "$CADDYFILE" ] || { echo "ERROR: $CADDYFILE が無い"; exit 1; }
command -v caddy >/dev/null || { echo "ERROR: caddy が無い"; exit 1; }

if grep -q "$DOMAIN" "$CADDYFILE"; then
  echo "既に $DOMAIN ブロックあり。追記をスキップします。"
  caddy validate --config "$CADDYFILE" --adapter caddyfile
  systemctl reload caddy
  echo "reload 済み。"
  exit 0
fi

BACKUP="${CADDYFILE}.bak.$(date +%Y%m%d%H%M%S)"
cp -a "$CADDYFILE" "$BACKUP"
echo "バックアップ: $BACKUP"

cat >> "$CADDYFILE" <<'CADDYEOF'

tasuki.niku9.click {
	root * /var/www/tasuki
	encode zstd gzip

	# 検索除外 + 基本セキュリティヘッダ
	header {
		X-Robots-Tag "noindex, nofollow"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "SAMEORIGIN"
		Referrer-Policy "same-origin"
	}

	# WebSocket 同期サーバーへ（Upgrade は Caddy が自動処理）
	handle /ws* {
		reverse_proxy 127.0.0.1:8787
	}

	# 静的 SPA（ディープリンクは index.html へフォールバック）
	handle {
		try_files {path} /index.html
		file_server
	}
}
CADDYEOF

echo "追記しました。検証します..."
if caddy validate --config "$CADDYFILE" --adapter caddyfile; then
  systemctl reload caddy
  echo ""
  echo "==> 成功。Caddy を reload しました。"
  echo "    https://${DOMAIN}/ で公開（初回は TLS 証明書取得に数十秒かかることがあります）。"
else
  echo "" >&2
  echo "==> 検証失敗。Caddyfile を元に戻します（既存サイトは無傷）。" >&2
  cp -a "$BACKUP" "$CADDYFILE"
  echo "復元しました: $CADDYFILE ← $BACKUP" >&2
  exit 1
fi
