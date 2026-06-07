# Tasuki VPS デプロイ設計（niku9.click）

- 日付: 2026-06-07
- 対象: TDD Mob Pro Timer v2（`tdd-mob-pro-timer/`）を本番 VPS へ公開する
- ブランチ: `feature/vps-deployment`（Tasuki リポジトリ・ローカル完結）

## 1. 目的

v2.0.0（tag `v2.0.0`）として完成した Tasuki を、既存の VPS に公開サイトとしてデプロイする。
既存の静的サイト（gallery / play）と共存させ、`tasuki.niku9.click` で提供する。

## 2. 前提（確定事項）

| 項目 | 決定 |
|------|------|
| Web サーバー | **Caddy**（ホスト直接稼働・自動 TLS）。gallery/play と同居 |
| バックエンド稼働 | **systemd + Bun**（ホスト直接）。1GB RAM に最優・Docker 不採用 |
| アクセス範囲 | **公開だが検索除外**（robots.txt + `X-Robots-Tag: noindex`） |
| サブドメイン | **`tasuki.niku9.click`**（HTTP/WS を単一サブドメインに集約） |
| デプロイ方式 | **ローカルビルド → 成果物転送**（rsync/scp + `systemctl restart`） |

### VPS 諸元
- お名前ドットコム VPS / 2 Core / 1024MB RAM / 100GB HDD
- IP: `157.7.141.211` / ホスト名: `niku9.click`
- 既存公開: `https://gallery.niku9.click/`, `https://play.niku9.click/`（いずれも完全静的）

## 3. アーキテクチャ

```
                Internet (HTTPS / WSS)
                        │
                        ▼
        ┌───────────────────────────────────┐
        │  Caddy (ホスト, :80/:443, 自動TLS) │
        ├───────────────────────────────────┤
        │ gallery.niku9.click → 静的 (既存)  │
        │ play.niku9.click    → 静的 (既存)  │
        │ tasuki.niku9.click  ──┐            │
        │   ├ /ws*  → reverse_proxy ─────────┼──┐
        │   └ /*    → file_server (静的dist) │  │
        └───────────────────────────────────┘  │
                                                ▼ (127.0.0.1:8787, localhost限定)
                            ┌──────────────────────────────┐
                            │ tasuki-sync (Bun, systemd)    │
                            │  WebSocket同期 / 揮発インメモリ │
                            │  サーバー権威タイマー / 秘密ゼロ │
                            └──────────────────────────────┘
```

### 設計の肝
- **単一サブドメイン集約**: `/ws*` のみ sync へ proxy、それ以外は静的フロント配信。
  同一オリジン WSS が自動成立し CORS 不要。
- **sync は localhost 限定バインド**（`127.0.0.1:8787`）。外部からは必ず Caddy 経由。
- フロントは静的ビルド成果物を Caddy `file_server` で配信（gallery/play と同様）。
- TLS は Caddy の ACME で自動取得（ドメイン名指定により自動。`tls internal` ではない）。
- SPA フォールバック（`try_files {path} /index.html`）でディープリンクに対応。

## 4. コードベース現状（確認済み・本番対応済み）

| 確認点 | 結果 | 箇所 |
|--------|------|------|
| WS URL 導出 | `window.location` から wss/host/`/ws` を生成。env 不要で Caddy 背後に自動追従 | `apps/web/src/App.tsx:82` |
| sync ポート設定 | `PORT` env（既定 8787） | `apps/sync/src/server.ts:16` |
| Origin 検証 | `ALLOWED_ORIGINS`（カンマ区切り）。未設定時は全許可＋警告（CSWSH リスク） | `apps/sync/src/server.ts:17`, `adapters/ws-adapter.ts:52` |
| 既存 Caddyfile | `deploy/Caddyfile` は **Docker 前提**（`sync:8787` / `tls internal` / ドメイン無）。本番とは別物 | `tdd-mob-pro-timer/deploy/Caddyfile` |
| バインドホスト | `ws-adapter` は `port` のみ指定。Bun.serve 既定は `0.0.0.0` | `apps/sync/src/adapters/ws-adapter.ts` |

### 必要な小改修
- **HOST バインド対応**（任意・多層防御）: `ws-adapter` / `Bun.serve` に `hostname` を渡し、
  `HOST` env（既定 `127.0.0.1`）で localhost 限定バインドできるようにする。
  これを入れない場合は firewall で 8787/tcp の外部到達を遮断して代替する。

## 5. 成果物（このブランチで作成）

| # | 物 | パス | 役割 |
|---|----|------|------|
| 1 | 本番 Caddy 設定スニペット | `deploy/Caddyfile.production` | `tasuki.niku9.click` ブロック（静的 + `/ws` proxy + noindex）。既存 Caddyfile に取り込む |
| 2 | systemd ユニット | `deploy/tasuki-sync.service` | Bun で sync 常駐・`Restart=on-failure`・`EnvironmentFile` で PORT/ALLOWED_ORIGINS/HOST |
| 3 | env テンプレート | `deploy/tasuki-sync.env.example` | `ALLOWED_ORIGINS=https://tasuki.niku9.click` 等。実ファイルは VPS のみ・コミットしない |
| 4 | デプロイスクリプト | `deploy/deploy.sh` | ローカルから build→rsync/scp→remote restart を1コマンド化 |
| 5 | robots.txt | `apps/web/public/robots.txt` | `Disallow: /`（検索除外） |
| 6 | デプロイ手順書 | `deploy/README.md` | 初回セットアップ + 更新手順 + ロールバック + トラブルシュート |
| 7 | （任意）HOST バインド | `apps/sync/src/adapters/ws-adapter.ts`, `server.ts` | `HOST` env で `127.0.0.1` 限定バインド |

> 既存 `deploy/Caddyfile`（Docker 用）は削除せず残し、本番用は別ファイル `Caddyfile.production` とする。
> README で両者の用途を明記する。

## 6. デプロイフロー

### 初回セットアップ（VPS 側・手動 + README に手順化）
1. DNS: `tasuki.niku9.click` の A レコードを `157.7.141.211` に向ける（ACME の前提）。
2. Bun をホストへ導入（未導入時）。
3. `/opt/tasuki/`（sync バンドル）, `/var/www/tasuki`（静的 dist）を作成（※既存 web root 慣例に合わせる）。
4. `tasuki-sync.service` を `/etc/systemd/system/` に配置、`tasuki-sync.env` を作成し `daemon-reload` → `enable --now`。
5. `Caddyfile.production` の内容を既存 Caddyfile に取り込み `caddy reload`。

### 更新（`deploy.sh`・ローカルから）
1. ローカル: `pnpm build`（web dist 生成）+ `bun build apps/sync/src/server.ts --target bun --outfile dist/server.js`（単一ファイル化）。
2. `rsync` で web dist → VPS `/var/www/tasuki`。
3. `scp` で `server.js` → VPS `/opt/tasuki/`。
4. `ssh ... sudo systemctl restart tasuki-sync`。
5. Caddyfile を変えた時だけ `caddy reload`（通常はスキップ）。

→ VPS 側に toolchain 不要・1GB RAM に最優・リモートリポジトリ不要。

## 7. 実行時の挙動・エラーハンドリング

- ブラウザ → Caddy が `index.html`/assets 配信 → フロントが `wss://tasuki.niku9.click/ws` を開く
  → Caddy が Upgrade → `127.0.0.1:8787` sync。
- sync は full snapshot 同期・サーバー権威タイマー（自己補正チャンクタイマー）を駆動。
- **再起動でルームは消える（揮発設計どおり・許容）**。systemd `Restart=on-failure` で異常時のみ自動復帰。
- sync 異常終了時: クライアントは WS 切断を検知し再接続を試みる（既存 client の挙動）。
  systemd が即時再起動するため、ルーム状態は失われるが接続性は早期回復。
- Origin 不正: sync が `1008 Origin not allowed` でクローズ（`ALLOWED_ORIGINS` 設定時）。

## 8. 安全策（公開・1GB RAM）

- **検索除外**: `robots.txt`（Disallow: /）+ Caddy `header X-Robots-Tag "noindex, nofollow"`。
- **アプリ層の既存防御**（v2 で実装済み）:
  - `room.join` レート制限（単一接続 10s/30回）
  - WS Origin 検証（本番 `ALLOWED_ORIGINS` 設定で有効化）
  - 入力長上限（displayName/roomName/handoffNote/お題各種）
  - secret-zero（鍵・秘密を持たない）
- **localhost 限定バインド**で sync の直接到達を遮断（HOST バインド or firewall）。

## 9. スコープ外（今回やらないこと）

- **M4 のリソース上限**（同時接続数 / ルーム数 / アイドル回収 / グローバルレート制限）は
  本デプロイの前提条件ではない。公開運用で必要になれば**別タスク**として追加する。
  （アプリ層の既存防御 + noindex で初期公開には十分と判断）
- **CI/CD（GitHub Actions 等）**: 現状ローカル完結方針のため不採用。将来リモート整備時に検討。
- **AI お題生成**: v2.0.0 後に保留中。本デプロイとは独立。
- **PWA / 永続記録ストア**: M4 将来枠。

## 10. 設計承認後に SSH で確認する項目（設計はブロックしない）

- gallery/play の **web root の慣例**（`/var/www`? `/srv`?）と **Caddyfile の実体パス**
- **Bun が既に導入済みか**、systemd を sudo 操作できるか
- DNS A レコードの設定状況（`tasuki.niku9.click` → `157.7.141.211`）
- SSH 接続情報（ユーザー / 鍵 / ポート）— `deploy.sh` の変数に反映
