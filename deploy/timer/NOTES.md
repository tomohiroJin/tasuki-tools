# timer 固有の運用メモ

共通の手順は [`../README.md`](../README.md) を参照。ここには timer にしか当てはまらない
設定と経緯だけを置く。

## 稼働情報

| 項目 | 値 |
|---|---|
| サービス | `tasuki-sync`（**改名しない**。稼働中のため） |
| ポート | 8787（`127.0.0.1` のみ待受） |
| 配置先 | `/opt/tasuki`（server.js・env）/ `/var/www/tasuki`（web） |
| 公開パス | `/timer/`（S4 / #19 で `/` から移設。ルートは玄関 LP） |
| WebSocket | `/timer/ws`（Caddy が sync の `/ws` へ rewrite） |
| 初回公開 | 2026-06-09 |

## 公開パスの移設（S4 / #19）

`/` から `/timer/` へ移した。ルートは玄関 LP が占める。揃える必要があるのは 4 箇所で、
1 つでも取り残すと白画面か 404 になる。

| 箇所 | 値 |
|---|---|
| `apps/timer-web/vite.config.ts` の `base` | `/timer/` |
| `app.env` の `PUBLIC_PATH` | `/timer/` |
| `caddy/30-timer-spa.conf` | `handle_path /timer/*` |
| `caddy/10-timer-ws.conf` | `handle /timer/ws` → `rewrite * /ws` |

`WEB_ROOT`（`/var/www/tasuki`）と sync サーバーの実装は**変えていない**。

⚠ **ホスト上の旧 `90-timer-spa.conf` を消すこと。** 残すと `90-landing.conf` と並び、
辞書順で landing が先に評価されて `/timer/` が LP に吸われる
（手順は [`../caddy/README.md`](../caddy/README.md)）。

### 旧共有リンクの救済

ルーム共有リンクは `?room=CODE` のクエリ形式のため、移設で `https://<host>/?room=ABC` が
LP に着地してしまう。`caddy/40-timer-legacy-room.conf` が **`/` かつ `room` クエリ付きの
ときだけ** `/timer/` へ 301 する。素の `/` は LP のまま。

## リソース上限・Origin 保護（公開運用）

- 本番 env に `NODE_ENV=production` を置くと、`ALLOWED_ORIGINS` 未設定時に sync が
  **起動を拒否**する（CSWSH 防止の fail-closed）。
- `MAX_CONNECTIONS`（既定 200）/ `MAX_ROOMS`（既定 50）で同時接続数・ルーム数を制限。
  超過接続は WS 1013、超過 room.create は `ROOM_LIMIT_EXCEEDED` で拒否。
- `ROOM_IDLE_TTL_MS`（既定 30 分）全員切断が継続したルームを定期回収（60 秒間隔）。
  揮発設計のため回収されたルームは復帰不可（再作成すればよい）。
- `HEARTBEAT_INTERVAL_MS`（既定 15000）/ `HEARTBEAT_MAX_MISSES`（既定 2）でサーバー主導の
  死活監視（ws ping/pong）を調整する（Issue #25）。回線断・端末スリープ等で半開きのまま残った
  接続を検出し、最大 `interval × (missMax + 1)`（既定で約45秒）以内に `terminate` して
  presence を `offline` に収束させる。一時的な通信の揺れでは切断しない（連続欠落のみ判定）。

## 運用可視化（管理エンドポイント）

`ADMIN_TOKEN` を設定すると、VPS ホストから read-only の運用情報を参照できる
（インターネット非公開・127.0.0.1 限定）。

```bash
curl -H "x-admin-token: $ADMIN_TOKEN" http://127.0.0.1:8787/status
curl -H "x-admin-token: $ADMIN_TOKEN" http://127.0.0.1:8787/admin/rooms
```

- `/status`: アクティブルーム数・累計回収数
- `/admin/rooms`: 上記＋各ルーム要約（コード/参加者数/online数/ドライバー有無/作成時刻）
- 回収ログは `journalctl -u tasuki-sync | grep reclaimed` で追える

## AI お題生成（任意機能）

設計: [`../../docs/superpowers/specs/2026-06-12-ai-problem-generation-design.md`](../../docs/superpowers/specs/2026-06-12-ai-problem-generation-design.md)

### 初回セットアップ（VPS）

1. claude スタンドアロンバイナリを導入（Node 不要・約 240MB）:
   `curl -fsSL https://claude.ai/install.sh | bash`
   → `~/.local/bin/claude` に入る。`claude --version` で確認
2. systemd unit が claude を解決できるよう、`service.tmpl` の `[Service]` に
   `Environment=PATH=/home/<user>/.local/bin:/usr/local/bin:/usr/bin:/bin` を追加する
   （テンプレートを編集してから `setup.sh` を再実行する）
3. ローカルマシンで `claude setup-token` を実行しトークンを発行
4. `/opt/tasuki/tasuki-sync.env` に `CLAUDE_CODE_OAUTH_TOKEN` と `AI_UNLOCK_KEY` を追記
   （パーミッション 600 を維持）
5. `sudo systemctl daemon-reload && sudo systemctl restart tasuki-sync`
   → 起動ログに「AI お題生成: 有効」が出れば OK

### 運用

- 消費の確認: `/status` の `aiGeneration: { today, total }`（127.0.0.1 限定・`ADMIN_TOKEN` 必須）
- トークン失効時: 生成は定型バンクへ自動縮退（サービス無停止）。`claude setup-token` で
  再発行し env を更新 → `sudo systemctl restart tasuki-sync`
- 一時停止（トークン保持のまま）: env に `AI_DAILY_LIMIT=0` を設定して restart
  → その日の生成を全面停止（定型へ縮退）
- 全面無効化（ロールバック）: env の `CLAUDE_CODE_OAUTH_TOKEN`・`AI_UNLOCK_KEY` を消して restart
- メモリ: `claude -p` は約 355MB（実測）。同時実行はアプリ側で 1 に直列化済み
  （VPS 1GB RAM・swap 2GB 前提）

### 開発時の注意

- ローカルで AI を試す簡単な方法は `apps/timer-sync/.env` に値を書くこと
  （Bun が cwd の `.env` を自動読み込み・`passThroughEnv` 不要）
- env を `pnpm dev` のコマンドラインで直接渡す場合のみ、`turbo.json` の `dev.passThroughEnv` に
  宣言済みのものだけが透過する（turbo strict env）。新しい env を足すときは `turbo.json` も更新する

## トラブルシュート（timer 固有）

- **502 / WS つながらない**: `sudo systemctl status tasuki-sync` と
  `journalctl -u tasuki-sync -n 50`。`bun` パス誤り（`ExecStart`）、
  `ALLOWED_ORIGINS` 不一致（`1008 Origin not allowed`）を確認
- **TLS が出ない**: DNS A レコード未反映、または Caddy が 80/443 を握れていない。`journalctl -u caddy`
- **`/ws` を curl で直叩きして 426**: 正常（WebSocket Upgrade 待ち）
