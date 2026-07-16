#!/usr/bin/env bash
# Tasuki Planning Poker デプロイスクリプト
# ローカルでビルドし、サーバーへ rsync して sync サービスを再起動する。
# 使い方: DEPLOY_HOST=user@tasuki.niku9.click ./deploy/deploy.sh
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:?DEPLOY_HOST（例: user@tasuki.niku9.click）を指定してください}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/tasuki/planning-poker}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> ビルド（web: 静的ファイル / sync: 単一ファイルバンドル）"
pnpm turbo build

echo "==> 配置先ディレクトリを準備"
ssh "$DEPLOY_HOST" "sudo mkdir -p '$DEPLOY_ROOT/web' '$DEPLOY_ROOT/sync'"

echo "==> web（apps/web/dist → $DEPLOY_ROOT/web）"
rsync -az --delete --rsync-path='sudo rsync' apps/web/dist/ "$DEPLOY_HOST:$DEPLOY_ROOT/web/"

echo "==> sync（apps/sync/dist/server.js → $DEPLOY_ROOT/sync/server.js）"
rsync -az --rsync-path='sudo rsync' apps/sync/dist/server.js "$DEPLOY_HOST:$DEPLOY_ROOT/sync/server.js"

echo "==> sync サービス再起動"
ssh "$DEPLOY_HOST" 'sudo systemctl restart poker-sync && systemctl is-active poker-sync'

echo "==> 完了。https://tasuki.niku9.click/poker で quickstart S1〜S2 を確認してください"
