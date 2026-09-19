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
| WebSocket | `/ws`（唯一の WS 入口。ツールはクエリ `?tool=timer` が宣言する。#95 S5c） |
| 初回公開 | 2026-06-09 |

## 公開パスの移設（S4 / #19）

`/` から `/timer/` へ移した。ルートは玄関 LP が占める。当時揃える必要があったのは
5 箇所で、1 つでも取り残すと白画面・404・WS 不通のいずれかになった
（WS 関連の 2 箇所は #95 S5c で表から落ちている。下の注記を参照）。

| 箇所 | 値 | 取り残すと |
|---|---|---|
| `apps/timer-web/vite.config.ts` の `base` | `/timer/` | アセットが 404（白画面） |
| `app.env` の `PUBLIC_PATH` | `/timer/` | ドキュメントと実態が食い違う |
| `caddy/30-timer-spa.conf` | `handle_path /timer/*` | `/timer/` が LP に吸われる |

⚠ **WS 関連の行は #95 S5c で無くなった。** `caddy/10-timer-ws.conf`（`handle /timer/ws`）は
撤去し、`apps/timer-web/src/sync/sync-url.ts` の `SYNC_PATH` は `/ws` になった
（値は玄関ハブと共用。下の「#95 S5c（旧 WS 入口の撤去）」を参照）。**最後の 2 つが
同じ値を別ファイルで持つ**構図自体は変わっておらず、`apps/timer-web/test/sync/sync-url.test.ts`
が両者（`SYNC_PATH` と `deploy/landing/caddy/05-hub-ws.conf`）を読み比べて機械的に
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
**rewrite しない**。#95 S5c からはこの断片が **唯一の WS 入口**で、
ツール（timer / poker / ハブ）は接続 URL のクエリ（`?tool=`）で決まる
（下の「#95 S5c（旧 WS 入口の撤去）」を参照）。

### #95 S5c（旧 WS 入口の撤去）

やることは 3 件ある。**順序はここでは決まらない。** 下の
[「#95 S5c を配布するときに行うこと」](#95-s5c-を配布するときに行うこと3-系統を続けて配る)の
順序表に従うこと —— 削除を配信物より先にやると、まだ動いている旧 timer が `/timer/ws` を、
旧 poker が `/poker/ws` を失う。**順序表にはここに無い作業も 1 件ある**（S5a 由来の
`40-timer-legacy-room.conf` の削除。上の「旧共有リンクの救済」）。ここの 3 件だけを
やって手を止めないこと。

- `05-hub-ws.conf`（S5a で新設）が設置済みであることを確かめる —— これが無いと**すべての
  ツールが繋がらない**。S5c 以降、WS の入口はこの 1 本だけである
- ホスト上の `/etc/caddy/tasuki/apps/10-timer-ws.conf` を**削除する**
- `deploy/poker/caddy/20-poker.conf` を**更新して設置し直す**（`/poker/ws` の handle が消えた）

⚠ **旧 WS パスへ繋いだままのタブは静かに壊れる。** 断片を消すと `/timer/ws` は
`handle_path /timer/*` の SPA フォールバックに吸われ、WebSocket にならずに index.html が
200 で返る。エラーにならないので気づきにくい（強制再読み込みで直る。新しいタブでは起きない）。

**断片の入れ替えだけでは S5c は配り終わらない。** 配信物の手順は下の
「#95 S5c を配布するときに行うこと」を参照。

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

## #95 S5c を配布するときに行うこと（3 系統を続けて配る）

> ⚠ **この節が扱うのは配信物だけである。Caddy 断片の入れ替え（上の
> [「#95 S5c（旧 WS 入口の撤去）」](#95-s5c旧-ws-入口の撤去)）を飛ばしてここの 3 行だけを
> 実行すると、全ツールが一切繋がらなくなる。**
>
> **S5a〜S5c はまだ 1 度も本番へ出ていない。** したがって本番ホストには
> `05-hub-ws.conf`（`/ws`）が**無く**、旧 `10-timer-ws.conf`（`/timer/ws`）が**残っている**。
> S5c の玄関・timer・poker はどれも `/ws?tool=…` へ繋ぎに行くので、その入口が無いまま
> 配ると 3 つとも接続できない（`../caddy/README.md` の設置手順が
> 「設置し忘れると本番の WS が一切繋がらない」と書いているのがこの状態である）。

**順序は 1 つに決まる。** 断片は「足す」と「消す」で置く場所が違う。

| # | やること | なぜこの位置か |
|---|---|---|
| 1 | **`site.conf` と `05-hub-ws.conf` だけを設置し、`40-timer-legacy-room.conf` を削除する**（`../caddy/README.md` の「設置」手順 2） | 足すのは**この 2 本だけ**にする。`/ws` はそれまで包括フォールバック（`90-landing.conf`）に吸われていただけで、旧 timer も旧 poker もこのパスを使っていないので無害である。**`20-poker.conf` をここで入れてはならない** —— 新しい版は `/poker/ws` の handle を落としてあり、旧 poker がまだ配信されている段で入れると、reload の時点で `/poker/ws` が SPA に吸われて poker の WS が死ぬ（手順 3 と同型の誤り）。`site.conf` の差分は断片の顔ぶれのコメントだけなので先に入れてよい。**`40-timer-legacy-room.conf`（S5a で撤去）の削除だけは、ここから後ろへ回せない** —— 残したまま 2 を走らせると、新しい玄関が配る参加用 URL（`/?room=CODE`）が `permanent` 301 で `/timer/` へ飛び、**その 301 がブラウザにキャッシュされて断片を消した後も飛ばされ続ける**（上の「旧共有リンクの救済」） |
| 2 | **`deploy.sh landing` → `timer` → `poker`** | 1 が済んでいれば新しい 3 つは繋がる。旧断片（`/timer/ws`・`/poker/ws`）はこの時点では**使われないまま残っているだけ**で害が無い —— **これは 1 で `20-poker.conf` を入れていないことが前提である。** 入れてしまうと、この段の間ずっと旧 poker の WS が死ぬ |
| 3 | **`10-timer-ws.conf` を削除し、`20-poker.conf`（と残りの断片）を入れる**（同手順 3） | **ここを 2 より先にやると、まだ配信中の旧 timer が `/timer/ws` を失い、旧 poker が `/poker/ws` を失う。** 逆に、後回しにしても壊れはしない（死んだ設定が残るだけ）—— ただし**この段まで済ませてから `pnpm e2e:prod` を回すこと**。`@smoke` の `e2e/specs/routing.spec.ts` は `/timer/ws` と `/poker/ws` の**両方**に **200**（SPA フォールバック）を期待しており、どちらかの断片が残っていると 426 が返って**赤になる** |

以下は手順 2 の中身である。

S5c は玄関・timer・poker の**すべて**の配信物を変える。`deploy.sh` はアプリ単位なので、
**3 回叩くまで配り終わらない**。

```bash
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh landing
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh timer    # sync サーバーもここで入れ替わる
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh poker
```

⚠ **途中で止めると、入口が食い違ったまま公開される。** 版が混ざったときに起きることは
どちらの向きでも黙って壊れる形になる。

| 配った側 | 古いまま | 起きること |
|---|---|---|
| timer / poker | 玄関 | ルームコード無しで `/timer/` を開いた人が玄関へ送られるが、玄関に接続の告知と記録への入口が無い（作成が押せるのに何も起きない場面が残る） |
| 玄関 | timer | 玄関の「記録を見る」が `/timer/?view=history` を開くのに、古い timer は `?view=` を知らず**旧入口（`Setup`）に着く** |
| 玄関 | poker | 参加用 URL から選択画面に入れるが、poker の札を選んだ先で**古い名乗りのフォーム**がもう一度出る |

⚠ **`deploy.sh timer` の再起動は poker のルームも道連れにする**（同期サーバーが 1 本・#95 S2）。
揮発インメモリなので、**利用者が使っていない時間帯に 3 つまとめて配ること**。

⚠ **`deploy.sh timer` は #276 でも配布順序の窓を持つ（上の S5c の 3 系統とは別件）。**
`timer` の内部は web dist の転送 → `server.js` の転送 → 再起動の順に進むため、その間に
新規に読み込み・再読み込みした画面は「最新ではありません」を見ることがある
（`seats` / `nextIndex` が `RoomSchema` で必須化されたため。理由と仕組みは設計文書
[`../../docs/superpowers/specs/2026-09-18-rotation-seat-and-presence-design.md`](../../docs/superpowers/specs/2026-09-18-rotation-seat-and-presence-design.md)
の §7 を参照）。窓は再起動で閉じ、再起動自体がルームを全消滅させるので影響は
配布中の数十秒に留まる。**この順序は変更しない。**

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
