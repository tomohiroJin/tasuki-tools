# ADR-0016: ドメインの表現は選択制とし、揃える点を定める

- **ステータス**: Accepted（2026-08-17）
- **関連**: [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72)（ADR に沿ったリファクタリング、
  親 epic [#67](https://github.com/tomohiroJin/tasuki-tools/issues/67)）/
  [`docs/adr/0005`](./0005-result-and-boundary-validation.md)（Result と境界検証）/
  [`docs/adr/0007`](./0007-abstraction-criteria.md)（抽象の導入基準）/
  [`docs/timer/adr/0002`](../timer/adr/0002-decider-pure-domain.md)（timer が Decider を採った記録）/
  `docs/constitution.md` 原則 VI（依存は内向き）・原則 X（抽象は実需で）

## 背景

`packages/timer-core` と `packages/poker-core` は、どちらも `Result` を返す純粋
ドメインだが、表現が揃っていない（2026-08-17 実測）。

| | `packages/timer-core`（4,234 行 / 14 ファイル） | `packages/poker-core`（462 行 / 7 ファイル） |
|---|---|---|
| 状態遷移 | `decide(cmd, agg, now): Result<DomainEvent[], DomainError>` ＋ `evolve(agg, event, now): Aggregate` | `castVote(room, participantId, card): Result<Room, RoundError>` ほか 8 関数 |
| 中間表現 | `DomainEvent` を挟む | 挟まない |
| エラー型 | `{ type: "DuplicateName"; name: string }` 等。文言を持たず `displayMessageFor()` が生成 | `{ code: 'not-voting'; message: '現在は投票を受け付けていません' }` 等。文言を同梱 |
| `index.ts` | 公開記号を明示列挙 | `export * from './deck'` ほか 6 行 |
| 決定の記録 | [`docs/timer/adr/0002`](../timer/adr/0002-decider-pure-domain.md) | **ADR が 1 本も無い** |

**共通しているのは `Result` を返すこと（[`docs/adr/0005`](./0005-result-and-boundary-validation.md)）だけである。**

一方へ寄せる案は 2 つとも採らなかった。poker を Decider へ寄せる案は、poker の
ドメインが 462 行 / 8 遷移関数で、イベント履歴・再生の要求が現に無いため
[`docs/adr/0007`](./0007-abstraction-criteria.md) の基準 3（パターンは変更が現に困難な
ときに限る）を満たさない。timer を直接遷移へ寄せる案は、4,234 行の全面書き換えと
[`docs/timer/adr/0002`](../timer/adr/0002-decider-pure-domain.md) の `Superseded` を要し、
timer では Decider が現に効いている以上、後退である。

## 決定

### 決定 1: 表現は選択制とし、選択を記録する

- イベントの履歴・再生・段階適用が要るドメインは **Decider**（`decide` / `evolve`）を採る。
- 状態遷移だけで足りるドメインは **直接遷移関数 ＋ `Result`** を採る。
- **どちらを採ったかと、その理由を、そのアプリの ADR（`docs/<app>/adr/`）に記録する（MUST）。**

### 決定 2: どちらを採っても必ず揃える点

1. ドメイン操作の失敗は `Result<T, E>` で表す（**MUST**。[`docs/adr/0005`](./0005-result-and-boundary-validation.md) の再掲ではなく参照）。
2. `index.ts` は**公開記号を明示列挙**する。`export *` を使わない（**MUST NOT**）。
3. ドメインエラーは**判別子（`type` または `code`）と機械可読な詳細のみ**を持つ。
   表示文言は文言生成関数が担う（**MUST**）。
4. ドメイン内で `Date.now()` / `Math.random()` を呼ばない（**MUST NOT**）。
   時刻・乱数は引数で注入する。

**3 の「文言生成関数」は core の外に出すという意味ではない。** timer の
`displayMessageFor()` は `@tasuki/timer-core` から export されている。poker も同様に
poker-core 内の別モジュールへ置き、同期サーバーは `code` から文言を引く。

## 影響

- **本 ADR の時点ではコード（`apps/` `packages/` `e2e/` `scripts/`）を変更しない。**
  適用は [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72) の各段で行う。
- 決定 2 の未達と宛先（2026-08-17 実測）:

  | 項目 | 現状 | 直す対象 | 宛先 |
  |---|---|---|---|
  | 1. `Result` | 両方準拠 | なし | — |
  | 2. `index.ts` の明示列挙 | timer 準拠 / poker 未 | `packages/poker-core/src/index.ts` 1 ファイル | #72 E6 |
  | 3. エラー型 | timer 準拠 / poker 未 | poker-core の `RoundError` `RoomError` と文言 6 箇所（`RoundError` 由来 5 ＋ `RoomError` 由来 1）、`apps/poker-sync/src/server.ts:244` `:333`、`apps/poker-web` | #72 E2 |
  | 4. `Date.now()` | poker 準拠 / timer 未 | `packages/timer-core/src/problem.ts:70` 1 箇所 | #72 E3 |

- **項目 3 を E2（poker-sync のポート/アダプタ再編）と同じ PR で行うのは、
  触るファイル群が同一だからである。** 分けると `apps/poker-sync/src/server.ts` を
  二度触ることになる（`docs/guides/pr-granularity.md`「分けた方が丁寧に見えるは
  理由にならない」）。
- 項目 3 の適用時、**WS で送る文字列は 1 文字も変えない**（振る舞い不変）。
- 決定 2 の項目 2・4 の機械検査は、それを消す Issue（E6・E3）が同じ PR で置く。
  **項目 3 の検査は E2 が置く**（`packages/poker-core` のエラー型に `message` フィールドが 0 件）。
