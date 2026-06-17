# Tasuki VPS デプロイ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v2.0.0 の Tasuki（TDD Mob Pro Timer）を `tasuki.example.com` で公開するためのデプロイ成果物一式と、sync の localhost 限定バインド対応を作る。

**Architecture:** ホスト直接の Caddy（自動 TLS）が単一サブドメインで静的フロントを配信し `/ws` を `127.0.0.1:8787` の sync（systemd + Bun 常駐）へ reverse proxy する。デプロイはローカルでビルドした成果物（web dist + 単一バンドル `server.js`）を rsync/scp で転送し systemd を再起動する。

**Tech Stack:** Caddy v2, systemd, Bun, TypeScript, `ws`(WebSocketServer), vite, pnpm/turbo。

**設計の正本:** `docs/superpowers/specs/2026-06-07-tasuki-vps-deployment-design.md`（Tasuki リポジトリルート）

**作業ディレクトリ:** 特記なき限り `tdd-mob-pro-timer/`（このファイルのリポジトリ内モノレポルート）。

**環境メモ:** pnpm は `~/.local/bin/pnpm`、bun は PATH 上（`bun --version` = 1.3.14）。
コマンドで `pnpm` が見つからない場合は `~/.local/bin/pnpm` に置換すること。

---

## ファイル構成

**作成:**
- `apps/web/public/robots.txt` — 検索除外
- `deploy/Caddyfile.production` — `tasuki.example.com` の本番 Caddy ブロック（既存 Caddyfile に取り込む）
- `deploy/tasuki-sync.service` — systemd ユニット
- `deploy/tasuki-sync.env.example` — env テンプレート（実ファイルは VPS のみ）
- `deploy/deploy.sh` — ローカルからのデプロイスクリプト
- `deploy/README.md` — 初回セットアップ・更新・ロールバック・トラブルシュート手順

**変更:**
- `apps/sync/src/adapters/ws-adapter.ts` — `host` オプション追加（既定 `127.0.0.1`）
- `apps/sync/src/server.ts` — `HOST` env を読み adapter に渡す

**残置（変更しない）:**
- `deploy/Caddyfile` — Docker 用ドラフト。本番用は `Caddyfile.production` として別管理。README で用途を明記。

---

## Task 1: sync を localhost 限定バインド対応にする

`ws` の `WebSocketServer` は `port` のみ指定すると全インターフェース（`0.0.0.0`/`::`）で待ち受ける。
`host` を渡して `127.0.0.1` 限定にし、Caddy 経由以外の直接到達を防ぐ。`HOST` env で上書き可能にする。

**Files:**
- Modify: `apps/sync/src/adapters/ws-adapter.ts`
- Modify: `apps/sync/src/server.ts`

- [ ] **Step 1: `WsAdapterOptions` に `host` を追加し `WebSocketServer` に渡す**

`apps/sync/src/adapters/ws-adapter.ts` の `WsAdapterOptions` インターフェースに `host` を追加:

```typescript
export interface WsAdapterOptions {
  port: number;
  host?: string;
  allowedOrigins: string[];
  onMessage: (connId: string, msg: unknown) => Promise<void>;
  onDisconnect: (connId: string) => void;
}
```

同ファイルの constructor 内、`WebSocketServer` 生成箇所を変更:

```typescript
  constructor(private readonly options: WsAdapterOptions) {
    this.wss = new WebSocketServer({ port: options.port, host: options.host });
    this.wss.on("connection", this.handleConnection.bind(this));
  }
```

（`host` が `undefined` のときは `ws` の既定動作＝全インターフェースになる。既定値は呼び出し側 server.ts で与える。）

- [ ] **Step 2: `server.ts` で `HOST` env を読み adapter に渡す**

`apps/sync/src/server.ts` の `const PORT = ...` の直後（17行目付近）に追加:

```typescript
const HOST = process.env["HOST"] ?? "127.0.0.1";
```

同ファイルの `wsAdapter = new WsAdapter({` の options に `host` を追加:

```typescript
wsAdapter = new WsAdapter({
  port: PORT,
  host: HOST,
  allowedOrigins: ALLOWED_ORIGINS,
  onMessage: async (connId, msg) => {
```

起動ログも分かりやすく更新（`console.log(\`🚀 同期サーバー起動 port=${PORT}\`);` を置換）:

```typescript
console.log(`🚀 同期サーバー起動 host=${HOST} port=${PORT}`);
```

- [ ] **Step 3: 型チェックで回帰がないことを確認**

Run: `~/.local/bin/pnpm --filter @tdd-mob/sync typecheck`
Expected: エラーなし（exit 0）

- [ ] **Step 4: sync の既存テストで回帰がないことを確認**

Run: `~/.local/bin/pnpm --filter @tdd-mob/sync test:unit`
Expected: 全件 PASS（既存のハンドラ/ストア/スケジュール系テスト。`localhost` 接続は `127.0.0.1` に解決されるため影響なし）

- [ ] **Step 5: 手動スモーク — 127.0.0.1 限定で待ち受けることを確認**

Run:
```bash
HOST=127.0.0.1 PORT=8787 ALLOWED_ORIGINS=https://tasuki.example.com bun run apps/sync/src/server.ts &
SYNC_PID=$!
sleep 1
ss -tlnp 2>/dev/null | grep 8787 || netstat -tlnp 2>/dev/null | grep 8787
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/
kill $SYNC_PID
```
Expected:
- `ss`/`netstat` の表示が `127.0.0.1:8787`（`0.0.0.0:8787` や `*:8787` ではない）
- `curl` の HTTP コードが `426`（WebSocket Upgrade 待ち＝正常）

- [ ] **Step 6: Commit**

```bash
git add apps/sync/src/adapters/ws-adapter.ts apps/sync/src/server.ts
git commit -m "feat: sync を HOST env で localhost 限定バインド可能にする

ws の WebSocketServer に host を渡せるようにし、HOST env(既定 127.0.0.1)
で待ち受けインターフェースを制御。Caddy 経由以外の直接到達を防ぐ。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 検索除外用 robots.txt を追加

vite は `apps/web/public/` 配下を `dist/` ルートへそのままコピーする。`robots.txt` を置くだけで
`https://tasuki.example.com/robots.txt` として配信される。Caddy 側のヘッダ（Task 3）と二重で検索除外する。

**Files:**
- Create: `apps/web/public/robots.txt`

- [ ] **Step 1: robots.txt を作成**

`apps/web/public/robots.txt`:

```
User-agent: *
Disallow: /
```

- [ ] **Step 2: ビルドして dist ルートに含まれることを確認**

Run:
```bash
~/.local/bin/pnpm --filter @tdd-mob/web build
cat apps/web/dist/robots.txt
```
Expected: 上記 robots.txt の内容が表示される（`User-agent: *` / `Disallow: /`）

- [ ] **Step 3: Commit**

```bash
git add apps/web/public/robots.txt
git commit -m "feat: 検索除外用 robots.txt を追加

Disallow: / で全クローラを除外。公開だが検索インデックスには載せない方針。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 本番 Caddy 設定スニペットを作成

`tasuki.example.com` ブロック。ドメイン名を指定するので Caddy が自動で Let's Encrypt 証明書を取得する
（`tls internal` ではない）。`/ws*` を sync へ、それ以外を静的 SPA として配信。`reverse_proxy` は
WebSocket Upgrade を自動処理するため特別なヘッダ設定は不要（Caddy v2）。

**Files:**
- Create: `deploy/Caddyfile.production`

- [ ] **Step 1: Caddyfile.production を作成**

`deploy/Caddyfile.production`:

```caddy
# Tasuki 本番用 Caddy 設定
# 既存ホストの Caddyfile（gallery/play と同じファイル）へこのブロックを取り込む。
# ドメイン名を指定しているため TLS は Caddy が自動取得する（ACME）。
# 前提: tasuki.example.com の A レコードが 203.0.113.10 を指していること。
tasuki.example.com {
	root * /var/www/tasuki
	encode zstd gzip

	# 検索除外（robots.txt と二重）
	header X-Robots-Tag "noindex, nofollow"

	# WebSocket 同期サーバーへ（Upgrade は自動処理）
	handle /ws* {
		reverse_proxy 127.0.0.1:8787
	}

	# 静的 SPA（ディープリンクは index.html へフォールバック）
	handle {
		try_files {path} /index.html
		file_server
	}
}
```

- [ ] **Step 2: 構文を検証**

Run（caddy がローカルにあれば）:
```bash
caddy validate --config deploy/Caddyfile.production --adapter caddyfile 2>&1 || echo "caddy 未導入: VPS 側で caddy validate を実行すること"
```
Expected: `Valid configuration` と表示される。caddy 未導入の環境では検証は VPS 側で行う旨のメッセージでよい（構文は単純な静的ブロックのため）。

- [ ] **Step 3: Commit**

```bash
git add deploy/Caddyfile.production
git commit -m "feat: 本番用 Caddy 設定(tasuki.example.com)を追加

ドメイン指定で自動TLS。/ws を 127.0.0.1:8787(sync)へ proxy、それ以外を
静的SPA配信。noindex ヘッダ付き。既存 Docker 用 Caddyfile とは別管理。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: systemd ユニットと env テンプレートを作成

Bun で `/opt/tasuki/server.js` を常駐。異常終了時のみ自動再起動。env は `EnvironmentFile` で外出し。
専用システムユーザ `tasuki` で実行し、基本的な systemd ハードニングを付ける。

**Files:**
- Create: `deploy/tasuki-sync.service`
- Create: `deploy/tasuki-sync.env.example`

- [ ] **Step 1: systemd ユニットを作成**

`deploy/tasuki-sync.service`:

```ini
[Unit]
Description=Tasuki sync server (TDD Mob Pro Timer)
After=network.target

[Service]
Type=simple
# bun の絶対パスは VPS の `which bun` で確認して調整すること
ExecStart=/usr/local/bin/bun /opt/tasuki/server.js
WorkingDirectory=/opt/tasuki
EnvironmentFile=/opt/tasuki/tasuki-sync.env
Restart=on-failure
RestartSec=2
User=tasuki
Group=tasuki

# 基本ハードニング（アプリはファイルを書かない＝インメモリ）
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: env テンプレートを作成**

`deploy/tasuki-sync.env.example`:

```bash
# Tasuki sync server 環境変数（本番）
# このファイルをコピーして VPS の /opt/tasuki/tasuki-sync.env に配置する。
# 実ファイルはコミットしないこと（このテンプレートのみコミット）。

# 待ち受けポート（Caddy の reverse_proxy 先と一致させる）
PORT=8787

# 待ち受けインターフェース（Caddy 同居ホストなので localhost 限定）
HOST=127.0.0.1

# WebSocket 接続を許可する Origin（カンマ区切り）。
# 未設定だと全 Origin 許可＝CSWSH リスクなので本番では必ず設定する。
ALLOWED_ORIGINS=https://tasuki.example.com
```

- [ ] **Step 3: 構文を確認（簡易）**

Run:
```bash
grep -q "ExecStart=" deploy/tasuki-sync.service && grep -q "EnvironmentFile=" deploy/tasuki-sync.service && echo "unit OK"
grep -q "ALLOWED_ORIGINS=https://tasuki.example.com" deploy/tasuki-sync.env.example && echo "env OK"
```
Expected: `unit OK` と `env OK` が出る。（`systemd-analyze verify` は VPS 側で配置後に実行する。）

- [ ] **Step 4: Commit**

```bash
git add deploy/tasuki-sync.service deploy/tasuki-sync.env.example
git commit -m "feat: sync の systemd ユニットと env テンプレートを追加

専用ユーザ tasuki で Bun 常駐、Restart=on-failure、EnvironmentFile で
PORT/HOST/ALLOWED_ORIGINS を外出し。基本的な systemd ハードニング付き。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: デプロイスクリプトを作成

ローカルで web をビルドし sync を単一ファイルにバンドル、rsync/scp で転送し systemd を再起動する。
SSH 先や配置パスは環境変数で上書き可能。

**Files:**
- Create: `deploy/deploy.sh`

- [ ] **Step 1: deploy.sh を作成**

`deploy/deploy.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ===== 設定（環境変数で上書き可能）=====
SSH_HOST="${TASUKI_SSH_HOST:-myvps}"        # ~/.ssh/config のホスト別名 か user@203.0.113.10
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
rsync -az --delete apps/web/dist/ "${SSH_HOST}:${WEB_ROOT}/"

echo "==> [4/5] server.js を転送 → ${SSH_HOST}:${APP_DIR}"
scp deploy/dist/server.js "${SSH_HOST}:${APP_DIR}/server.js"

echo "==> [5/5] sync を再起動: ${SERVICE}"
ssh "${SSH_HOST}" "sudo systemctl restart ${SERVICE} && sudo systemctl --no-pager status ${SERVICE} | head -5"

echo "==> 完了: https://tasuki.example.com/"
```

- [ ] **Step 2: 実行権限を付与**

Run: `chmod +x deploy/deploy.sh`
Expected: エラーなし

- [ ] **Step 3: shellcheck で静的検査（あれば）**

Run: `shellcheck deploy/deploy.sh || echo "shellcheck 未導入: スキップ"`
Expected: 警告なし、または `shellcheck 未導入: スキップ`

- [ ] **Step 4: ビルド/バンドル段（転送前）までをローカルで dry-run 検証**

Run:
```bash
~/.local/bin/pnpm --filter @tdd-mob/web build
mkdir -p deploy/dist
bun build apps/sync/src/server.ts --target bun --outfile deploy/dist/server.js
ls -la apps/web/dist/index.html deploy/dist/server.js
```
Expected: `apps/web/dist/index.html` と `deploy/dist/server.js` の両方が存在する（サイズ > 0）。
（ws の optional 依存 bufferutil/utf-8-validate に関する警告が出ても無害＝バンドルは成功する。）

- [ ] **Step 5: バンドルした server.js が単体で起動することを確認**

Run:
```bash
HOST=127.0.0.1 PORT=8787 ALLOWED_ORIGINS=https://tasuki.example.com bun deploy/dist/server.js &
SYNC_PID=$!
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/
kill $SYNC_PID
```
Expected: HTTP コード `426`（バンドル単体で正常起動）

- [ ] **Step 6: `deploy/dist/` を gitignore してコミット**

Run:
```bash
echo "dist/" > deploy/.gitignore
git add deploy/deploy.sh deploy/.gitignore
git commit -m "feat: デプロイスクリプトを追加

ローカルで web ビルド+sync バンドル→rsync/scp 転送→systemd 再起動を
1コマンド化。SSH先/配置パスは環境変数で上書き可能。deploy/dist は無視。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: デプロイ手順書（README）を作成

初回セットアップ・更新・ロールバック・トラブルシュートを1ファイルにまとめる。

**Files:**
- Create: `deploy/README.md`

- [ ] **Step 1: README を作成**

`deploy/README.md`:

````markdown
# Tasuki デプロイ手順（example.com）

`tasuki.example.com` で公開するための手順。設計の正本は
`../docs/superpowers/specs/2026-06-07-tasuki-vps-deployment-design.md`。

## 構成

- Caddy（ホスト直接・自動 TLS）が静的フロントを配信し `/ws` を sync へ proxy
- sync は systemd + Bun でホスト常駐（`127.0.0.1:8787`・揮発インメモリ）
- 更新は `deploy.sh` でローカルからビルド→転送→再起動

## ファイル

| ファイル | 用途 |
|---------|------|
| `Caddyfile.production` | 本番用 Caddy ブロック（既存 Caddyfile へ取り込む） |
| `tasuki-sync.service` | systemd ユニット |
| `tasuki-sync.env.example` | env テンプレート（実体は VPS のみ・非コミット） |
| `deploy.sh` | ローカルからのデプロイスクリプト |
| `Caddyfile` | （旧）Docker 用ドラフト。本番では使わない |

## 初回セットアップ（VPS 側・1回だけ）

1. **DNS**: `tasuki.example.com` の A レコードを `203.0.113.10` に向ける（自動 TLS の前提）。
   `dig +short tasuki.example.com` で反映を確認。

2. **Bun を導入**（未導入時）:
   ```bash
   curl -fsSL https://bun.sh/install | bash
   which bun   # ExecStart のパスに合わせる（例: /root/.bun/bin/bun か /usr/local/bin/bun）
   ```

3. **専用ユーザとディレクトリ**:
   ```bash
   sudo useradd --system --no-create-home --shell /usr/sbin/nologin tasuki || true
   sudo mkdir -p /opt/tasuki /var/www/tasuki
   sudo chown -R tasuki:tasuki /opt/tasuki
   ```

4. **env を配置**:
   ```bash
   sudo cp tasuki-sync.env.example /opt/tasuki/tasuki-sync.env
   sudo nano /opt/tasuki/tasuki-sync.env   # ALLOWED_ORIGINS 等を確認
   sudo chown tasuki:tasuki /opt/tasuki/tasuki-sync.env
   sudo chmod 600 /opt/tasuki/tasuki-sync.env
   ```

5. **systemd ユニットを配置**（`ExecStart` の bun パスを `which bun` の結果に合わせてから）:
   ```bash
   sudo cp tasuki-sync.service /etc/systemd/system/
   sudo systemctl daemon-reload
   ```
   ※ この時点では `server.js` 未配置のため enable のみ。初回 `deploy.sh` 実行後に起動する。

6. **Caddy 設定を取り込む**: `Caddyfile.production` の `tasuki.example.com { ... }` ブロックを
   既存ホストの Caddyfile（gallery/play と同じファイル）へ追記し、検証して reload:
   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile   # 実パスは環境に合わせる
   sudo systemctl reload caddy
   ```

7. **初回デプロイ**（ローカルから・下記「更新」と同じ）を実行し、最後に:
   ```bash
   sudo systemctl enable --now tasuki-sync
   sudo systemctl status tasuki-sync
   ```

## 更新（ローカルから・通常運用）

```bash
# ~/.ssh/config に myvps ホストを定義済みなら:
./deploy/deploy.sh
# 別名/IP を直接指定する場合:
TASUKI_SSH_HOST=user@203.0.113.10 ./deploy/deploy.sh
```

配置パスを変える場合は `TASUKI_WEB_ROOT` / `TASUKI_APP_DIR` / `TASUKI_SERVICE` を指定。
`pnpm` が PATH に無い環境は `PNPM=~/.local/bin/pnpm ./deploy/deploy.sh`。

## 動作確認

```bash
curl -I https://tasuki.example.com/                 # 200 + X-Robots-Tag: noindex
curl -s https://tasuki.example.com/robots.txt       # Disallow: /
sudo systemctl status tasuki-sync                    # active (running)
sudo ss -tlnp | grep 8787                            # 127.0.0.1:8787 のみ
```
ブラウザで `https://tasuki.example.com/` を開き、ルーム作成→別タブで参加し WS 同期を確認。

## ロールバック

sync を一旦止めて前バージョンの `server.js` に戻す:
```bash
sudo systemctl stop tasuki-sync
# 直前の server.js を退避しておけば差し替え。無ければローカルで前コミットを
# checkout して deploy.sh を再実行する。
sudo systemctl start tasuki-sync
```
（ルームは揮発のため再起動でクリアされる＝設計どおり。）

## トラブルシュート

- **502/WS つながらない**: `sudo systemctl status tasuki-sync` と `journalctl -u tasuki-sync -n 50`。
  `bun` パス誤り（`ExecStart`）、`ALLOWED_ORIGINS` 不一致（`1008 Origin not allowed`）を確認。
- **TLS が出ない**: DNS A レコード未反映、または Caddy が 80/443 を握れていない。`journalctl -u caddy`。
- **426 が返る（curl で /ws 直叩き）**: 正常（WebSocket Upgrade 待ち）。
````

- [ ] **Step 2: Commit**

```bash
git add deploy/README.md
git commit -m "docs: デプロイ手順書(README)を追加

初回セットアップ・更新・動作確認・ロールバック・トラブルシュートを記載。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 最終検証（全体ビルド + バンドルスモーク）

成果物が揃った状態で、フルビルドと sync バンドルの起動を通しで確認する。

**Files:** （変更なし。検証のみ）

- [ ] **Step 1: モノレポ全体の型チェック**

Run: `~/.local/bin/pnpm typecheck`
Expected: 全パッケージ PASS

- [ ] **Step 2: sync テスト全件**

Run: `~/.local/bin/pnpm --filter @tdd-mob/sync test:unit`
Expected: 全件 PASS

- [ ] **Step 3: web フルビルド + robots.txt 確認**

Run:
```bash
~/.local/bin/pnpm --filter @tdd-mob/web build
test -f apps/web/dist/index.html && test -f apps/web/dist/robots.txt && echo "web dist OK"
```
Expected: `web dist OK`

- [ ] **Step 4: sync バンドル + 426 スモーク**

Run:
```bash
bun build apps/sync/src/server.ts --target bun --outfile deploy/dist/server.js
HOST=127.0.0.1 PORT=8787 ALLOWED_ORIGINS=https://tasuki.example.com bun deploy/dist/server.js &
SYNC_PID=$!
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/
kill $SYNC_PID
```
Expected: `426`

- [ ] **Step 5: 成果物が出揃ったことを確認**

Run:
```bash
ls deploy/Caddyfile.production deploy/tasuki-sync.service deploy/tasuki-sync.env.example deploy/deploy.sh deploy/README.md apps/web/public/robots.txt
```
Expected: 6ファイルすべて存在

- [ ] **Step 6: 完了報告**

ここまでで VPS 公開に必要な成果物とコード改修が揃う。実際の VPS への適用（DNS・初回セットアップ・
`deploy.sh` 実行）はユーザーと SSH で `deploy/README.md` に沿って行う（設計 spec のセクション10の
確認項目: web root 慣例 / Caddyfile 実パス / Bun 導入状況 / SSH 情報 を確定してから）。

---

## Self-Review

**Spec coverage（spec の各セクション → タスク対応）:**
- §3 アーキテクチャ（単一サブドメイン・/ws proxy・localhost バインド）→ Task 1, 3 ✅
- §4 必要な小改修（HOST バインド）→ Task 1 ✅
- §5 成果物 #1 Caddyfile.production → Task 3 / #2 systemd → Task 4 / #3 env → Task 4 /
  #4 deploy.sh → Task 5 / #5 robots.txt → Task 2 / #6 README → Task 6 / #7 HOST バインド → Task 1 ✅
- §6 デプロイフロー → Task 5（deploy.sh）+ Task 6（README 初回セットアップ）✅
- §8 安全策（検索除外）→ Task 2 + Task 3（noindex ヘッダ）✅
- §9 スコープ外（M4/CI/CD/AI）→ タスク化しない（意図的）✅
- §10 SSH 確認項目 → Task 7 Step 6 で実適用前提として明記 ✅

**Placeholder scan:** "TBD/TODO/後で" なし。各コードステップに実コードあり。SSH 情報・bun 絶対パス・
Caddyfile 実パスは「環境ごとに確定する変数」として明示（プレースホルダではなく設定項目）。

**Type consistency:** `host?` (ws-adapter `WsAdapterOptions`) ↔ `HOST` env ↔ server.ts の `host: HOST`、
`PORT` 8787 ↔ Caddy `reverse_proxy 127.0.0.1:8787` ↔ env `PORT=8787`、`ALLOWED_ORIGINS` 文字列 ↔
env 値、`WEB_ROOT=/var/www/tasuki` ↔ Caddy `root * /var/www/tasuki`、`APP_DIR=/opt/tasuki` ↔
systemd `WorkingDirectory`/`ExecStart` ↔ deploy.sh scp 先 — すべて一致。
