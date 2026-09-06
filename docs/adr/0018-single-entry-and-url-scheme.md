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
| 選択画面へ戻る | `/?room=CODE` |

パス方式（`/poker/room/<id>`）は使わない（**MUST NOT**）。ルームコードには日本語が
入りうるため、符号化をクエリに任せる。

### 決定 3: WebSocket の入口は `/ws` 1 つ

`/timer/ws` と `/poker/ws` は移行期間だけ受け付け、移行完了時に撤去する。

### 決定 4: 旧救済断片を撤去する

`40-timer-legacy-room.conf` を削除する。**削除は、新しい参加用 URL を配り始める変更と
同じ PR で行う**（**MUST**）。先に消すと旧リンクの救済だけが失われ、後で消すと新しい
招待リンクがタイマーへ飛ばされる期間ができる。

救済の実質的価値が失われている根拠: ルームは揮発インメモリ（`docs/timer/adr/0007`）で
あり、救済対象のリンクが指すルームはとうに存在しない。

## 影響

- LP が同期クライアントになる。静的 SPA ではなくなる
- `apps/poker-web/src/router.ts` が `?room=` を解するようになる
- Caddy 断片が 1 本増え（`/ws`）、3 本減る（`/timer/ws`・`/poker/ws`・旧救済）
- 旧リンク `/?room=CODE` は LP に着地し、そのルームが在れば入れる（救済より良い挙動になる）
