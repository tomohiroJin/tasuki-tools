# Markdown のタスクリストを押せないチェックボックスで描く（#315 PR 1）実装計画

> **作業者へ:** 必須サブスキル —— `superpowers:subagent-driven-development`（推奨）または
> `superpowers:executing-plans` を使って 1 タスクずつ実装すること。
> 手順のチェックボックス（`- [ ]`）で進捗を追う。

**ゴール**: お題の説明と共有メモに書いた `- [ ] 文`・`- [x] 文` を、どの画面でも押せないチェックボックスと文で描く。
いまは `[ ] 文` という記号の混じった文で出ている。

**方式**: 解析（`@tasuki/markdown`）の箇条書き・番号付きの項目に「タスクか、チェック済みか」を持たせ、共有の描画
（`@tasuki/web-kit/reader` の `Markdown`）が `<label>` で包んだ `disabled` のチェックボックスで描く。見た目は部品層の
`markdown.css` に足す。**各アプリの TSX は変えない**（描画は 1 つ・ADR 0021 の追記）。アプリの側で変えるのは、
暗い面（timer の共有メモ）がつまみを宣言する 1 行だけ。

**技術**: TypeScript / React / 素の CSS / Vitest + Testing Library（jsdom）/ Playwright（実画面）

**設計正本**: `docs/superpowers/specs/2026-10-15-markdown-task-list-design.md`（**計画は正本に従う。両方を読むこと**）。
この計画は正本 §7 の **PR 1**（D2〜D5・FR-001〜006・NFR-001〜003）だけを扱う。付け外し（D6〜D8）は PR 2。

## この計画で決めたこと（正本に無い細部）

| # | 決定 | 根拠 |
|---|---|---|
| P1 | 型: `export type MdListItem = { inline: MdInline[]; task: MdTask \| null }`・`export type MdTask = { checked: boolean }`。`ul`・`ol` の `items` を `MdListItem[]` にし、`index.ts` から型だけ公開する | 正本 D3。`web-kit` が型を使うので公開の検査（`audit-public-surface.mjs`）に掛からない |
| P2 | 判定の正規表現は `blocks.ts` の内部の `TASK_RE = /^\[([ xX])\]\s+(?=\S)/`。一致したら `task: { checked: m[1] !== ' ' }`、文は一致を外した残りを行内解析する | 正本 D2。先読み `(?=\S)` で文の無い項目を外す（FR-004）。先頭に固定した 1 回の照合なので線形のまま（NFR-003） |
| P3 | 判定は `toBlock` の `ul`・`ol` の分岐で、印を外した各行に当てる。`parseRawBlocks`（ブロックの切り分け）は変えない | 箇条書きの切り分けの規則（`UL_RE`・`OL_RE`）を動かさないので、段落の停止などの既存の振る舞いに触れない |
| P4 | 描画の形: タスクの項目は `<li className="ui-md-task"><label className="ui-md-task-label"><input type="checkbox" className="ui-md-check" checked={…} disabled /><span className="ui-md-task-text">…</span></label></li>`。タスクでない項目はいまの `<li>` のまま | 正本 D4。文を `span` で包むのはチェックボックスとの間隔を CSS で取るため（文の中の太字・リンクの並びを崩さない） |
| P5 | `checked` は React の制御された値で、`disabled` を付けるので `onChange` は渡さない（React の警告が出ない） | PR 2 で受け口を渡したときだけ `disabled` を外す |
| P6 | CSS: `.ui-md-task { list-style: none; margin-left: calc(-1 * var(--space-5)); }`（列の字下げを打ち消し、チェックボックスを印の位置に置く）・`.ui-md-task-label { display: inline-flex; gap: var(--space-2); align-items: baseline; }`・`.ui-md-check { accent-color: var(--ui-md-check, …); margin: 0; }`。既定の色は象牙の札の上の字の色に近いトークンを選び、Task 6 の実画面で決める | 正本 D5。部品の CSS はつまみを宣言しない（`audit-ui-components.mjs`）。値は `var(--ui-md-check, 既定)` で受ける |
| P7 | 変異を 3 つ登録する（番号は 280〜282。#315 に 280〜289 を割り当てた。267〜269 は #402、270〜279 は #405 のために空いている —— 当初は 267〜269 と書いていた。レビューで指摘を受けて移した）: ①文の無い項目もタスクにする（`(?=\S)` を外す）②`[X]` をチェック済みにしない（`[ xX]` を `[ x]` に）③描画で `label` を外す（名前が消える） | 正本 SC-005。①②は `packages/markdown`、③は `packages/web-kit` |
| P8 | `SHAPE_SOURCE`（`packages/web-kit/tests/support/dom-shape.ts`）は**変えない**。タスクリストの形は別のテストで固定する | いまの形のテストは「寄せる前の 3 アプリと同じ」ことの記録。混ぜると何の記録か分からなくなる |

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。
様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | Task 2〜4 で失敗するテストを先に書き、赤を見てから実装する。Task 1 の型の組み替えは振る舞いを変えないリファクタで、既存のテストの期待値の形だけを直して緑のまま進める |
| II. 技術選定は ADR を通す | 該当なし | 新しい技術・依存を足さない |
| III. 揮発インメモリと単純運用 | 該当なし | 状態を持たない（解析と描画だけ）。サーバーに触れない |
| IV. 境界の型安全 | 該当なし | 境界を越えるデータ（お題の本文・共有メモ）の形は変わらない。変わるのは画面の中の解析の結果だけ |
| V. 実画面検証 | 通過 | Task 6 でお題ツール・poker・timer（お題の札と共有メモ）を 390・1280 で撮り、利用者に見せる |
| VI. 依存は内向き | 通過 | 解析は依存 0 の `@tasuki/markdown`、描画は `@tasuki/web-kit/reader` のまま。依存方向の許可表は変えない |
| VII. 検査は壊して確かめる | 通過 | Task 5 で変異を 3 つ登録し、各変異で赤を見る |
| VIII. 記録が正本 | 通過 | 決定は設計正本、細部はこの計画の P 表。README（`packages/markdown`・`packages/ui`）を実装に合わせる。ADR 0021 の追記が要らないことを PR の本文に書く |
| IX. 小さく回す | 通過 | 表示だけ。付け外しは PR 2 に分ける（正本 §7） |
| X. 抽象は実需で | 通過 | 新しい部品・フックを作らない。型 `MdListItem` は既存の項目に 1 つの値を足すだけ |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密も個人情報も扱わない |

**逸脱なし。**

## 全体の制約

- **ブランチ**: `feature/issue-315-pr1-task-list-display`（main から切る）
- **破壊検証の前に `git status --porcelain` が空であることを見る**
- **コミットしたらすぐ push する**。**本番へ配布しない**（配布は利用者の明示の指示を待つ）
- 画面の CSS（`apps/*`）に `input` の型を含むセレクタ・生の色を書かない（`scripts/audit-ui-components.mjs`）。見た目は部品層だけに書く
- 新しい文言は無い（チェックボックスの名前は利用者の書いた文）
- E2E や実画面検証に書く本文は英数字で書く（書体の base 層の検査に掛かる）

## ファイルの地図

| ファイル | 変更 |
|---|---|
| `packages/markdown/src/blocks.ts` | `MdListItem`・`MdTask`・`TASK_RE`。`toBlock` の `ul`・`ol` |
| `packages/markdown/src/index.ts` | 型 `MdListItem`・`MdTask` を公開 |
| `packages/markdown/tests/blocks.test.ts` | 期待値の形（Task 1）・タスクリストの解析（Task 2） |
| `packages/markdown/tests/performance.test.ts` | タスクの項目を並べた病的な入力（Task 2） |
| `packages/markdown/README.md` | 記法の一覧と型。古い「描画は各アプリが持つ」を #371 に合わせて直す |
| `packages/web-kit/src/reader/markdown.tsx` | 項目の描画（Task 1・Task 3） |
| `packages/web-kit/tests/markdown.test.tsx` | タスクリストの形・名前・状態（Task 3） |
| `packages/ui/src/components/markdown.css` | `.ui-md-task`・`.ui-md-task-label`・`.ui-md-task-text`・`.ui-md-check`（Task 4） |
| `packages/ui/README.md` | `.ui-md` の行にクラスとつまみ `--ui-md-check` を足す |
| `apps/timer-web/src/styles/shared-memo.css` | 暗い面でつまみ `--ui-md-check` を宣言（Task 4） |
| `apps/topic-web/tests/markdown.test.tsx` | いまのお題の札でチェックボックスが押せないこと（FR-006。Task 3） |
| `scripts/mutations/m280〜m282-*.patch`・`scripts/lib/mutation-declarations.mjs` | 変異の登録（Task 5） |

## Task 1: 項目の型を `MdListItem` に組み替える（振る舞いは変えない）

- [ ] `blocks.ts` に `MdTask`・`MdListItem` を足し、`ul`・`ol` の `items` を `MdListItem[]` にする。`toBlock` は `{ inline: parseInline(line), task: null }` を返す
- [ ] `index.ts` から型 `MdListItem`・`MdTask` を公開する
- [ ] `blocks.test.ts` の `ul`・`ol` の期待値を `{ inline: text('a'), task: null }` の形に直す（**期待する中身は変えない**）
- [ ] `markdown.tsx` の `items.map` を `item.inline` を読む形に直す
- [ ] `pnpm --filter @tasuki/markdown test`・`pnpm --filter @tasuki/web-kit test`・`pnpm -r typecheck` が緑。3 つのアプリのテストも緑（DOM は変わらない）
- [ ] コミット: `refactor(markdown): 箇条書きの項目を MdListItem にする（#315）`

## Task 2: タスクの項目を解析する（FR-001・002・004・005・NFR-003）

- [ ] **Red**: `blocks.test.ts` に `describe('タスクリストを解析する')` を足す。`@requirements #315 spec FR-001〜005`
  - `- [ ] a` → `task: { checked: false }`・文は `a`
  - `- [x] a`・`- [X] a` → `checked: true`
  - `* [ ] a`・`1. [ ] a` もタスクになる
  - タスクとそうでない項目が混ざった列は、項目ごとに `task` が付く・付かない
  - `- [ ]`（文が無い）・`- [ ]  `（空白だけ）→ `task: null`・文は `[ ]`（素の文として残る）
  - `- [y] a`・`- [] a`・`- [ ]a`（空白が無い）→ `task: null`
  - コードの囲みの中の `- [ ] a` は `code` のまま
  - 文の中の行内要素（`- [ ] **a** [b](https://example.com)`）は解析される
- [ ] 赤を見る（`task` が無い・文に `[ ] ` が残る）
- [ ] **Green**: P2・P3 のとおり `TASK_RE` を足し、`toBlock` で当てる
- [ ] `performance.test.ts` に「`- [ ] ` と `[` を交互に並べた 20 万字」の病的な入力を足し、上限の時間の中で終わることを見る（NFR-003。既存の上限と同じ値を使う）
- [ ] コミット: `feat(markdown): タスクリストの項目を解析する（#315）`

## Task 3: 押せないチェックボックスで描く（FR-001〜003・006）

- [ ] **Red**: `packages/web-kit/tests/markdown.test.tsx` に `describe('タスクリスト')` を足す
  - `domShape` で形を固定する: `ul.ui-md-ul` > `li.ui-md-task` > `label.ui-md-task-label` > `input.ui-md-check[type=checkbox][disabled]`・`span.ui-md-task-text "a"`。タスクでない項目は `li` のまま
  - `screen.getByRole('checkbox', { name: 'a' })` が取れ、`toBeChecked()`／`not.toBeChecked()` が `[x]`／`[ ]` に合う（FR-002・FR-003）
  - チェックボックスが `toBeDisabled()`（FR-006）
  - 項目の中のリンクは `getByRole('link')` で取れ、`href` はいまと同じく `safeHref` を通ったものだけ
- [ ] `apps/topic-web/tests/markdown.test.tsx`（または `CurrentTopic` のテスト）に、いまのお題の札で `getByRole('checkbox', { name })` が押せない（`disabled`）ことを 1 つ足す（FR-006 を画面の側で固定）
- [ ] 赤を見る
- [ ] **Green**: P4・P5 のとおり `Block` の `ul`・`ol` の分岐で `item.task` を見て描く
- [ ] コミット: `feat(web-kit): タスクリストを押せないチェックボックスで描く（#315）`

## Task 4: 見た目を部品層に足す（D5・NFR-001）

- [ ] `markdown.css` に P6 の規則を足す。冒頭の注釈の「描画（React）は各アプリが持つ（#315 が判断する）」を、#371 で 1 つになったことに直す
- [ ] つまみ `--ui-md-check` を冒頭のつまみの一覧に書く（宣言はしない）
- [ ] 共有メモは暗い面で、すでに `apps/timer-web/src/styles/shared-memo.css` がつまみ `--ui-md-edge`・`--ui-md-link` を宣言している。同じ場所で `--ui-md-check` も宣言する（値は既存のトークン。生の色を書かない）
- [ ] `node scripts/audit-ui-components.mjs` が緑（死んだ部品・入力欄の型のセレクタ・生の色）
- [ ] `packages/ui/README.md` の `.ui-md` の行にクラスとつまみを足す
- [ ] コミット: `feat(ui): タスクリストのチェックボックスの見た目を部品層に足す（#315）`

## Task 5: 変異を登録して赤を見る（VII）

- [ ] `git status --porcelain` が空であることを見る
- [ ] P7 の 3 つのパッチを `scripts/mutations/` に作り、`scripts/lib/mutation-declarations.mjs` に登録する（`pkg`・`tests`・`note` は m106・m107 の書き方に合わせる）
  - ① `markdown-task-empty-text`: `(?=\S)` を外す → Task 2 の「文が無い」のテストが赤
  - ② `markdown-task-upper-x`: `[ xX]` を `[ x]` に → `[X]` のテストが赤
  - ③ `web-kit-task-no-label`: `label` を外し `input` と文を並べる → 名前のテストが赤
- [ ] `node scripts/mutation-check.mjs --id 280,281,282` で 3 つとも殺されることを見る
- [ ] **Task 1〜3 で `blocks.ts`・`markdown.tsx` を変えたので、既存の変異（m106・m107 と、`markdown.tsx` を当てる変異があればそれも）のパッチが当たることを** `node scripts/mutation-check.mjs --changed` で見る。当たらなければ作り直す
- [ ] scripts の自己テスト（`AGENTS.md` の基本コマンド）が緑
- [ ] コミット: `test(mutation): タスクリストの解析と名前を壊す変異を足す（#315）`

## Task 6: 実画面検証（V）と文書

- [ ] 次の本文をお題の説明と共有メモに入れ、お題ツール・poker・timer（ロビーのお題の札・セッションのお題の札・共有メモ）を 390 と 1280 の幅で撮る

  ```
  - [ ] first test
  - [x] second test
  - plain item
  1. [X] numbered
  ```

- [ ] 押せないチェックボックスで、チェック済みかどうかが象牙の札と共有メモの面の上で読めることを見る。読めなければ P6 の既定の色と `opacity` を直す（正本 §8）
- [ ] 押しても状態が変わらないこと、文を押しても変わらないことを見る
- [ ] 既存の axe の E2E（`e2e/specs/timer-a11y.spec.ts` など）が緑
- [ ] `packages/markdown/README.md` を直す（記法にタスクリスト・型 `MdListItem`・「描画は `@tasuki/web-kit/reader` の `Markdown` 1 つ」）
- [ ] ADR 0021 を読み直し、追記が要らないこと（決定 3・7 を変えていない）を PR の本文に書く
- [ ] 撮った画面を利用者に見せる
- [ ] コミット: `docs: タスクリストを README に書く（#315）`

## Task 7: 仕上げ

- [ ] `pnpm test`・`pnpm -r lint`・`pnpm -r typecheck`
- [ ] `node scripts/audit-structure.mjs`・`node scripts/audit-ui-components.mjs`・`node scripts/audit-public-surface.mjs`・`node scripts/check-links.mjs`・`node scripts/audit-plan-gate.mjs`
- [ ] PR を作る。本文に: 表示だけで押せないこと・PR 2 は使ってみてから着手を決めること（正本 §7）・撮った画面・ADR の追記が要らない理由
- [ ] 振り返りは PR 2 の着手を決めたとき（または見送ったとき）に #315 として書く（`docs/guides/retrospective.md`）

## 実装で計画から外したこと（2026-10-15）

| # | 計画 | 実装 | 理由 |
|---|---|---|---|
| X1 | P6: `.ui-md-check` は `accent-color` で色を付ける | `appearance: none` で部品が枠と印（`::before`）を描く。色は同じつまみ `--ui-md-check`、角は `0.2em` | Task 6 の実画面で、ブラウザは押せない（`disabled`）チェックボックスを灰色で描き、`accent-color` も効かず、象牙の札の上で済んだかどうかがほとんど読めなかった（正本 §8 の懸念が当たった）。押せるかどうかで見た目を変えないので、PR 2 で受け口を渡しても見た目はそのまま |
| X2 | P6: `.ui-md-task-label` は `inline-flex`・`gap`・`align-items` だけ | `flex-direction: row`・`font-size: inherit`・`color: inherit` も書く | 要素層の `label`（`packages/ui/src/elements/controls.css`）が欄の名札として縦に並べ・小さく・`--ivory-dim` で書くので、お題ツールと poker の札で文がチェックボックスの下へ回り、象牙の上で読めなかった。jsdom のテストでは見えず、実画面で見つけた |
| X3 | Task 3: 画面の側の FR-006 のテストを `apps/topic-web/tests/markdown.test.tsx`（または `CurrentTopic` のテスト）に足す | `apps/topic-web/tests/topic-room.test.tsx` の「場のお題」に足した | いまのお題の札を実際に描くテストがそこにある。描画の変更を戻すと赤・`disabled` を外すと赤になることを確かめた |
| X4 | Task 6: 実画面は E2E の基盤で撮る | 開発サーバー（玄関・timer・poker・お題ツール・同期サーバー）を立て、導入済みの Chromium で撮った | 作業環境に Caddy と E2E が要求する版の Chromium が無く、E2E の基盤が立たなかった。CI の E2E は従来どおり流れる |
| X5 | Task 5: `--changed` で既存の変異が当たることを見る | `--pkg packages/markdown`・`--pkg packages/web-kit` で流した（m106・m107・m280〜m282 がすべて検出） | 宣言の表を書き足した枝の `--changed` は全件（214 件）に倒れる。全件は CI が流す |
| X6 | P6: チェックボックスの縦の位置は決めていなかった（X1 で `align-self: center`） | `align-self: flex-start` と `margin-top: calc((1lh - 1.05em) / 2)` で文の 1 行目の真ん中に置く。字の大きさと `line-height` を継ぐ | PR #413 のレビュー。折り返した項目で、チェックボックスが文全体の真ん中まで下がっていた（実画面の撮影が短い項目だけだった）。継がないと入力欄の既定の字（13.33px）で `em` と `1lh` が測られ、象牙の札で 2.3px 上にずれた。幅 360・1280 で、折り返した項目の箱の中心と 1 行目の中心が一致することを測った。`lh` を読めないブラウザ（Safari 16.4 未満・Firefox 120 未満）は `calc` の宣言ごと捨てて入力欄の既定の余白（3px 3px 3px 4px）に戻るので、手前に `margin: 0` を置いた（`lh` を読めない単位に置き換えて、0 に戻ることを確かめた） |
| X7 | P7: 変異の番号は 267〜269 | 280〜282 | PR #413 のレビュー。267〜269 は #402 のために、270〜279 は #405 のために空けてあった（main の m270〜m275 の note） |
| X8 | Task 2: 「タスクにしない」例は 5 つ | 項目の途中に印がある `- a [ ] b` を足した | PR #413 のレビュー。`TASK_RE` の先頭の `^` を消してもテストが緑のままだった。足した例で赤になることを確かめた |

