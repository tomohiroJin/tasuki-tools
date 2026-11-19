# ADR-0018: 入口を LP に一本化し、URL 体系を揃える

- **ステータス**: Accepted（2026-09-06）
- **関連**: [#95](https://github.com/tomohiroJin/tasuki-tools/issues/95) /
  [設計正本](../superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md) /
  [`docs/timer/adr/0007`](../timer/adr/0007-volatile-in-memory-state.md)（揮発インメモリ状態）

## 背景

ルームの作成と名乗りの画面が 3 つある（timer の `Setup` / `Join`、poker の
`TopPage` / `NameForm`）。ツールを足すたびに増える。

`deploy/timer/caddy/40-timer-legacy-room.conf` は「`/` かつ `?room=` が付いていたら
`/timer/` へ 301」する救済断片である。これは本 ADR が定める参加用 URL と**完全に同じ形**であり、
両立しない。

## 決定

### 決定 1: 入口は LP のみ

ルームの作成と名乗りは LP でだけ行う（**MUST**）。ツール側は名乗りの画面を持たない
（**MUST NOT**）。ルームコードを伴わずにツールの URL が開かれた場合は LP へ送る。

### 決定 2: URL 体系

| 経路 | URL |
|---|---|
| 参加用 URL（配るもの） | `/?room=CODE` |
| タイマー | `/timer/?room=CODE` |
| ポーカー | `/poker/?room=CODE` |
| お題ツール（#91 で追加。末尾の改定節） | `/topic/?room=CODE` |
| 選択画面へ戻る | `/?room=CODE` |

パス方式（`/poker/room/<id>`）は使わない（**MUST NOT**）。ルームコードには日本語が
入りうるため、符号化をクエリに任せる。

### 決定 3: WebSocket の入口は `/ws` 1 つ

`/timer/ws` と `/poker/ws` は移行期間だけ受け付け、移行完了時に撤去する（**MUST**）。

### 決定 4: 旧救済断片を撤去する

`40-timer-legacy-room.conf` を削除する。**削除は、新しい参加用 URL を配り始める変更と
同じ PR で行う**（**MUST**）。先に消すと旧リンクの救済だけが失われ、後で消すと新しい
招待リンクがタイマーへ飛ばされる期間ができる。

救済の実質的価値が失われている根拠: ルームは揮発インメモリ（`docs/timer/adr/0007`）で
あり、救済対象のリンクが指すルームはとうに存在しない。

## 影響

- LP が同期クライアントになる。静的 SPA ではなくなる
- `apps/poker-web/src/router.ts` が `?room=` を解するようになる
- Caddy 断片が 1 本増え（`/ws`）、**2 本減る**（`10-timer-ws.conf`・旧救済 `40-timer-legacy-room.conf`）。`/poker/ws` は `20-poker.conf` 内の `handle` ブロックとして落とす
- 旧リンク `/?room=CODE` は LP に着地し、そのルームが在れば入れる（救済より良い挙動になる）

## 改定（2026-09-25・#91 PR 3）

決定 2 の URL の表に **お題ツール `/topic/?room=CODE`** の行を足した。
[#91](https://github.com/tomohiroJin/tasuki-tools/issues/91) で玄関に 3 枚目の札（お題ツール・`apps/topic-web`）が
加わったためである（[`docs/adr/0021`](./0021-topic-as-shared-context.md)）。本文が URL 体系の現況を記述しているので、
[`docs/adr/0002`](./0002-document-system-three-layers.md) の「追記（2026-09-09・#258）」に従い改定節つきで直した。

**決定 1〜4 はそのまま当てはまる。** お題ツールも名乗りの画面を持たず（決定 1）、ルームコードを伴わずに開かれたら
玄関へ送る。パス方式を使わない（決定 2）。WebSocket の入口は `/ws` の 1 本で、お題ツールはクエリ `?tool=topic` で
宣言する（決定 3）。配信断片は `deploy/topic/caddy/40-topic.conf` である
（撤去済みの旧 `40-timer-legacy-room.conf` とは番号が同じだけの別物）。


## 追記（2026-11-19・#638） — 合言葉の設定を玄関へ移し、道具から送り返された人を通ったら戻す（Accepted）

決定 1（入口は LP のみ。名乗りと合言葉の入力は玄関に 1 つ）の続きとして、[#638](https://github.com/tomohiroJin/tasuki-tools/issues/638) で次を足した。**決定 1〜4 は覆さない。**

- **設定の口は玄関のルームの画面（選択画面）に置く**。作成画面には置かない（作るときの欄を増やさない）。コマンドはハブのものである（`docs/adr/0011` の同日の追記）
- **道具から玄関へ送るとき、元の道具を `?from=<道具の ID>` で運ぶ**（`@tasuki/room-core` の `RETURN_PARAM`・`roomHubPath` の第 3 引数）。
  玄関は入れたあと、その道具の同じルームへ**置き換えて**戻す（選択画面を経由しない）。復帰の組は戻る前に端末へ置くので、道具が復帰できる
  - **URL を信じて遷移しない**: 行き先は玄関の札の一覧（`TOOLS`）から引く。知らない値・外部の URL・パスを混ぜた値は戻さない
  - **退出の告知（`?left=`）を持つ人は戻さない**（外された人が入り直してまた外される往復を作らない）。`departed` の送り返しは `?from=` を運ばない
  - ルームの作成（`room.created`）は戻る理由を持たないので戻さない
- `?from=` つきで玄関へ送るのは、次の 2 つの場面である。
  - **復帰の組が無いとき**: 6 つの道具（timer・poker・topic・roulette・agenda・checkin）すべて
  - **合言葉の失敗（`PASSPHRASE_REQUIRED`・`PASSPHRASE_MISMATCH`）**: topic・roulette・agenda・checkin だけ。
    timer と poker は、復帰の組で入り直して合言葉を求められても玄関へは送らず、帯にエラーを出すだけである（timer は `error-action.ts` で一時的なエラーとして、poker は `useSync.ts` で帯に）
