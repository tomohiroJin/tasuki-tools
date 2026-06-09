#!/usr/bin/env bash
# Caddy の tasuki.niku9.click ブロックを「最新の望ましい内容」に揃える（root で実行: sudo bash）。
# 冪等: 既存の tasuki ブロックを除去してから最新ブロックを追記する（再実行で更新になる）。
# 安全: 一時コピー上で組み立て → caddy validate 合格時のみ本物を差し替え＋reload。
#       失敗時は本物に一切触れない（gallery/play は無傷）。
set -euo pipefail

CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
DOMAIN="tasuki.niku9.click"

[ "$(id -u)" -eq 0 ] || { echo "root で実行してください（sudo bash $0）"; exit 1; }
[ -f "$CADDYFILE" ] || { echo "ERROR: $CADDYFILE が無い"; exit 1; }
command -v caddy >/dev/null || { echo "ERROR: caddy が無い"; exit 1; }

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# 既存の tasuki ブロックを波括弧の深さで正確に除去して TMP を作る。
awk -v dom="$DOMAIN" '
  BEGIN { skip=0; depth=0 }
  skip==0 && $0 ~ ("^"dom"[[:space:]]*\\{") { skip=1; depth=0 }
  skip==1 {
    o=gsub(/\{/,"{"); c=gsub(/\}/,"}"); depth += o - c
    if (depth<=0) skip=0
    next
  }
  { print }
' "$CADDYFILE" > "$TMP"

# 末尾の余分な空行を1つに整えてから最新ブロックを追記。
printf '\n' >> "$TMP"
cat >> "$TMP" <<'CADDYEOF'
tasuki.niku9.click {
	root * /var/www/tasuki
	encode zstd gzip

	# 検索除外 + セキュリティヘッダ（HSTS 含む）
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
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

echo "tasuki ブロックを組み立てました。検証します..."
if ! caddy validate --config "$TMP" --adapter caddyfile; then
  echo "" >&2
  echo "==> 検証失敗。本番 Caddyfile には一切触れていません（gallery/play 無傷）。" >&2
  exit 1
fi

BACKUP="${CADDYFILE}.bak.$(date +%Y%m%d%H%M%S)"
cp -a "$CADDYFILE" "$BACKUP"
install -m 644 -o root -g "$(stat -c %G "$CADDYFILE")" "$TMP" "$CADDYFILE"
systemctl reload caddy
echo ""
echo "==> 成功。Caddy を reload しました（バックアップ: $BACKUP）。"
echo "    https://${DOMAIN}/ に HSTS 等の最新ヘッダが反映されます。"
