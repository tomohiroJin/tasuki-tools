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
| WebSocket | `/timer/ws`（**rewrite しない**。#95 S5a で `/ws` はハブの入口になった） |
| 初回公開 | 2026-06-09 |

## 公開パスの移設（S4 / #19）

`/` から `/timer/` へ移した。ルートは玄関 LP が占める。揃える必要があるのは 5 箇所で、
1 つでも取り残すと白画面・404・WS 不通のいずれかになる。

| 箇所 | 値 | 取り残すと |
|---|---|---|
| `apps/timer-web/vite.config.ts` の `base` | `/timer/` | アセットが 404（白画面） |
| `app.env` の `PUBLIC_PATH` | `/timer/` | ドキュメントと実態が食い違う |
| `caddy/30-timer-spa.conf` | `handle_path /timer/*` | `/timer/` が LP に吸われる |
| `caddy/10-timer-ws.conf` | `handle /timer/ws`（**rewrite しない**） | WS が繋がらない／ハブ扱いになる |
| `apps/timer-web/src/sync/sync-url.ts` の `SYNC_PATH` | `/timer/ws` | WS が繋がらない |

**最後の 2 つは同じ値を別ファイルで持つ**ため、食い違ってもどちらのファイルを見ても
正しく見える。`apps/timer-web/test/sync/sync-url.test.ts` が両者を読み比べて機械的に
固定している（どちらか一方だけ変えるとテストが落ちる）。

`WEB_ROOT`（`/var/www/tasuki`）と sync サーバーの実装は**変えていない**。

⚠ **ホスト上の旧 `90-timer-spa.conf` を消すこと。** 残すと `90-landing.conf` と並び、
辞書順で landing が先に評価されて `/timer/` が LP に吸われる
（手順は [`../caddy/README.md`](../caddy/README.md)）。

### 旧共有リンクの救済（#95 S5a で撤去した）

S4（#19）から S5a までは `caddy/40-timer-legacy-room.conf` が **`/` かつ `room` クエリ付きの
ときだけ** `/timer/` へ 301 していた。**S5a で参加用 URL が `/?room=CODE` になった**ため、
救済と新しい招待リンクが同じ形になり、両立しなくなった（`docs/adr/0018` 決定 4）。

⚠ **ホスト上の `/etc/caddy/tasuki/apps/40-timer-legacy-room.conf` を消すこと。**
残すと、いま配っている参加用 URL が 301 でタイマーへ飛ばされ、選択画面に着地しない。

⚠ **この 301 は `permanent` なのでブラウザがキャッシュしている。** 断片を消しても、
以前に旧リンクを開いた端末では飛ばされ続けることがある。利用者には強制再読み込み
（Ctrl+Shift+R）かキャッシュの消去を案内する。**新しい端末・新しいプロファイルでは起きない。**

### ハブ（選択画面）の WS（#95 S5a で新設）

[`../landing/caddy/05-hub-ws.conf`](../landing/caddy/05-hub-ws.conf) を設置する。`/ws` を統合 sync（8787）へ渡す断片で、
**rewrite しない**（`/ws` はハブ、`/timer/ws` は timer、`/poker/ws` は poker と、
パスだけで振り分けている）。同じ段で `10-timer-ws.conf` から `rewrite * /ws` を外したので、
**こちらも更新して設置し直すこと** —— 古いままだと timer の接続がハブとして扱われ、
timer の参加者一覧から全員が消える。

## リソース上限・Origin 保護（公開運用）

- 本番 env に `NODE_ENV=production` を置くと、`ALLOWED_ORIGINS` 未設定時に sync が
  **起動を拒否**する（CSWSH 防止の fail-closed）。
- `MAX_CONNECTIONS`（既定 400）/ `MAX_ROOMS`（既定 100）で同時接続数・ルーム数を制限。
  超過接続は WS 1013、超過 room.create は `ROOM_LIMIT_EXCEEDED` で拒否。
  **どちらの既定値も、統合の前後で実効枠を保つために決め直したものである**
  （接続は #95 S2 で 200 → 400、ルームは #95 S4a で 50 → 100。根拠は
  `apps/tasuki-sync/src/config.ts` の `SyncConfig` の docstring）。
  **本番で実際に効いている値は起動ログで確かめる**（下の切り替え手順を参照）。
- `ROOM_IDLE_TTL_MS`（既定 30 分）全員切断が継続したルームを定期回収（60 秒間隔）。
  揮発設計のため回収されたルームは復帰不可（再作成すればよい）。
- `HEARTBEAT_INTERVAL_MS`（既定 15000）/ `HEARTBEAT_MAX_MISSES`（既定 2）でサーバー主導の
  死活監視（ws ping/pong）を調整する（Issue #25）。回線断・端末スリープ等で半開きのまま残った
  接続を検出し、最大 `interval × (missMax + 1)`（既定で約45秒）以内に `terminate` して
  presence を `offline` に収束させる。一時的な通信の揺れでは切断しない（連続欠落のみ判定）。

## #95 S4a を配布するときに 1 度だけ行うこと

**本番の `app.env`（`/opt/tasuki/tasuki-sync.env`）の `MAX_ROOMS` を 100 に書き換える。**

`deploy/setup.sh` は `[ -f "$APP_DIR/$ENV_FILE" ]` のとき env を**上書きしない**（既存を
保持する）ので、`deploy/timer/env.example` を直しただけでは本番に届かない。飛ばすと
名簿の統合で実効枠が **100 → 50 へ半減する**（統合前は 2 プロセス × 50 = 100 で、
S4a からは 1 本で数える）。**S2 の `MAX_CONNECTIONS` とまったく同型の罠**である
（あちらの手順は [`../poker/NOTES.md`](../poker/NOTES.md)）。

> ⚠ **S2 以降が未配布なら、同じ env の `MAX_CONNECTIONS` も同時に直すこと。**
> S2 は `MAX_CONNECTIONS` を 200 → 400 にしており（手順は
> [`../poker/NOTES.md`](../poker/NOTES.md) の手順 1）、そちらも `deploy/setup.sh` では
> 本番へ届かない。**片方だけ直して配ると、接続の実効枠が 400 → 200 のまま残る。**
> 未配布かどうかは下の手順 3 の 1 コマンドで分かる（`maxConn=200` なら未配布である）。

```bash
# 1. 配る**前に**本番の env を直す。env は DEPLOY_USER 所有の 600 で、
#    ログインユーザーがそのまま編集できる（sudo は不要）
ssh <ホスト別名> "sed -i 's/^MAX_ROOMS=50\$/MAX_ROOMS=100/' /opt/tasuki/tasuki-sync.env"
#    S2 が未配布なら、同じ env のこの 1 行も直す（両方直すまで枠は戻らない）
ssh <ホスト別名> "sed -i 's/^MAX_CONNECTIONS=200\$/MAX_CONNECTIONS=400/' /opt/tasuki/tasuki-sync.env"
#    **必ず目で確かめる。** 値を手で変えてあった場合、上の sed は何もせず成功する。
#    行そのものが無ければ（古いテンプレートから作った env）追記すること
ssh <ホスト別名> "grep -E '^(MAX_ROOMS|MAX_CONNECTIONS)=' /opt/tasuki/tasuki-sync.env"

# 2. 配る
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh timer

# 3. **手順 1 が効いたことを起動ログで確かめる（ここが唯一の証拠）。**
#    手順 1 を飛ばしても deploy.sh は成功するので、これを見るまで気づけない。
#    2 つまとめて見る（どちらか片方だけ直す事故がいちばん起きやすい）
ssh <ホスト別名> "journalctl -u tasuki-sync -n 30 --no-pager | grep -oE '(maxConn|maxRooms)=[0-9]*' | tail -2"
```

`maxConn=400` と `maxRooms=100` の両方が出れば完了。片方でも欠ければ手順 1 へ戻ること。

> ⚠ **`ROOM_IDLE_TTL_MS` は変えない。** S4a で poker のルームが即時破棄から TTL 保持へ
> 変わったので同時に占有される数は増えるが、TTL を縮めると timer の復帰体験
> （席を外して戻る）まで巻き添えになる。

## 運用可視化（管理エンドポイント）

`ADMIN_TOKEN` を設定すると、VPS ホストから read-only の運用情報を参照できる
（インターネット非公開・127.0.0.1 限定）。

```bash
curl -H "x-admin-token: $ADMIN_TOKEN" http://127.0.0.1:8787/status
curl -H "x-admin-token: $ADMIN_TOKEN" http://127.0.0.1:8787/admin/rooms
```

- `/status`: アクティブルーム数・累計回収数
- `/admin/rooms`: 上記＋各ルーム要約（コード/参加者数/online数/ドライバー有無/作成時刻）

> ✅ **#95 S4a から、どちらの数字も timer と poker の両方を数える。** 名簿
> （`RoomStore`）が 1 つになり、`activeRooms` はその件数だからである
> （**`MAX_ROOMS` が数える単位と一致する**）。**再起動が道連れにする範囲と、この数字が
> 数える範囲は同じ** —— `activeRooms: 0` なら、いま落としても誰のセッションも消えない。
>
> `hasDriver` は**そのルームに timer の状態があるときだけ**真になる（`session.rotation` の
> 有無で決め、timer の状態が無ければ `false`）。したがって **`hasDriver: false` のルームは
> 「poker だけのルーム」か「timer を開始していないルーム」のどちらか**である。
> 区別はこのエンドポイントからはつかない。
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

- ローカルで AI を試す簡単な方法は `apps/tasuki-sync/.env` に値を書くこと
  （Bun が cwd の `.env` を自動読み込み・`passThroughEnv` 不要）
- env を `pnpm dev` のコマンドラインで直接渡す場合のみ、`turbo.json` の `dev.passThroughEnv` に
  宣言済みのものだけが透過する（turbo strict env）。新しい env を足すときは `turbo.json` も更新する

## トラブルシュート（timer 固有）

- **502 / WS つながらない**: `sudo systemctl status tasuki-sync` と
  `journalctl -u tasuki-sync -n 50`。`bun` パス誤り（`ExecStart`）、
  `ALLOWED_ORIGINS` 不一致（`1008 Origin not allowed`）を確認
- **TLS が出ない**: DNS A レコード未反映、または Caddy が 80/443 を握れていない。`journalctl -u caddy`
- **`/ws` を curl で直叩きして 426**: 正常（WebSocket Upgrade 待ち）
