# 共有メモとお題の下書きのプレビューで、タスクリストのチェックを付け外しする（#315 PR 2）実装計画

> **作業者へ:** 必須サブスキル —— `superpowers:subagent-driven-development`（推奨）または
> `superpowers:executing-plans` を使って 1 タスクずつ実装すること。
> 手順のチェックボックス（`- [ ]`）で進捗を追う。

> **着手の条件**: PR 1 が main に入って本番で使われ、**利用者が PR 2 に着手すると決めてから**始める（正本 §7）。
> 見送ると決めたら、この計画は着手せずに残し、Issue に §2.2 の行き先を書いて閉じる。

**ゴール**: timer の共有メモのプレビューと、お題ツールの「書く」の下書きのプレビューで、タスクリストのチェックボックスを押せるようにする。
共有メモは押した時点で全員へ送り、下書きは説明の欄だけを書き換える（場には出さない）。いまのお題の札は押せないまま。

**方式**: `@tasuki/markdown` に、n 番目のタスクの項目の 1 字だけを書き換える純粋な関数 `setTaskChecked` を足す。共有の `Markdown` は
受け口 `onSourceChange` を渡されたときだけチェックボックスを押せるようにし、書き換えた本文を返す。呼び手はそれを**いまある経路**
（`handoff.note.set`・下書きの状態）へ流す。**新しいコマンド・wire・ADR は無い**（正本 D1・D6）。

**技術**: TypeScript / React / Vitest + Testing Library（jsdom）/ Playwright（E2E）

**設計正本**: `docs/superpowers/specs/2026-10-15-markdown-task-list-design.md`（**計画は正本に従う。両方を読むこと**）。
この計画は正本 §7 の **PR 2**（D6〜D8・FR-007〜012）だけを扱う。

## この計画で決めたこと（正本に無い細部）

| # | 決定 | 根拠 |
|---|---|---|
| P1 | `parseRawBlocks` を「行の配列を受ける」形に分け、ブロックの切り分けの規則を 1 つにする。`parseMarkdown` は正規化して分けた行を、`setTaskChecked` は区切りを残して分けた行（`src.split(/(\r\n?\|[\n  ])/)` の偶数番目）を渡す。箇条書き・番号付きの行には元の行番号を持たせる | 正本 D6「同じ規則で」。規則の写しを作ると、コードの囲みの扱いなどが片方だけずれる |
| P2 | 2 つの分け方が**同じ行の配列を返す**ことをテストで固定する（LF・CRLF・CR・U+2028・U+2029・混在・末尾の改行） | P1 の前提。ずれると押した項目と違う行を書き換える |
| P3 | `MdTask` に `index: number`（文書の中のタスクの項目の通し番号・0 から）を足す。`parseMarkdown` が文書の順に振る | 正本 D3。番号付きと箇条書きをまたいで通す |
| P4 | `setTaskChecked(src, index, checked)`: 該当の行の印（`UL_RE`・`OL_RE` の一致）の直後の `[` の次の 1 字を、`checked` なら `x`、でなければ空白にする。範囲の外・すでに同じ状態なら `src` をそのまま返す（同じ参照） | 正本 D6・FR-012。1 字の置き換えなので長さが変わらない |
| P5 | `Markdown` の受け口は `onSourceChange?: (next: string) => void`。渡したときだけ `disabled` を外し、`onChange` で `setTaskChecked(source, task.index, e.currentTarget.checked)` を渡す | 正本 D6。アプリが `@tasuki/markdown` に直接依存せずに済む |
| P6 | 共有メモのプレビューは `note` ではなく `draft` を描く。押したら `setDraft(next)`・`lastCommittedRef.current = next`・`onCommit(next)` の順に行う | 正本 D7・FR-008。プレビューの間は `draft` と `note` は同じ値（切り替えで確定する）なので、押す前の見え方は変わらない |
| P7 | `TopicSheet` に任意の `onBodyChange?: (next: string) => void` を足し、`Markdown` の `onSourceChange` へそのまま渡す。`TopicEditor` は**プレビューの値が追いついているとき（`previewBody === body`）だけ** `setBody` を渡す | 正本 D8。プレビューは `useDeferredValue` の値を描く。追いつく前に押すと、古い本文から作った値で最新の打鍵を消してしまう。追いつく間は押せない（一瞬） |
| P8 | 変異を 3 つ登録する（番号は着手時の次の空き）: ①`setTaskChecked` が `\n` で行をつなぎ直す（CRLF を失う）②`Markdown` が受け口が無くてもチェックボックスを押せる（`disabled` を外す）③`SharedMemo` が押したときに `lastCommittedRef` を更新しない（自分の付け外しで「更新されました」が出る） | 正本 SC-005。①は `packages/markdown`、②は `packages/web-kit`、③は `apps/timer-web` |

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。
様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | Task 1〜5 で失敗するテストを先に書き、赤を見てから実装する。Task 1 の `parseRawBlocks` の分割は既存のテストを緑に保ったまま行う |
| II. 技術選定は ADR を通す | 該当なし | 新しい技術・依存を足さない |
| III. 揮発インメモリと単純運用 | 該当なし | 同期サーバーに触れない。共有メモは既存の `handoff.note.set` で送る |
| IV. 境界の型安全 | 該当なし | 境界のスキーマ（`handoff.note.set`・`topic.set`）を変えない。書き換えは長さを変えないので上限（`MAX_HANDOFF_NOTE`・`MAX_TOPIC_BODY`）にも触れない |
| V. 実画面検証 | 通過 | Task 6 で 2 つのブラウザで共有メモを付け外しし、お題ツールの下書きを付け外しして撮る。E2E を 1 本足す |
| VI. 依存は内向き | 通過 | 書き換えは依存 0 の `@tasuki/markdown`。アプリは `@tasuki/web-kit/reader` の受け口だけを使い、依存方向の許可表を変えない |
| VII. 検査は壊して確かめる | 通過 | Task 5 で変異を 3 つ登録し、各変異で赤を見る |
| VIII. 記録が正本 | 通過 | 決定は設計正本、細部はこの計画の P 表。README（`packages/markdown`・`packages/web-kit`）を実装に合わせる |
| IX. 小さく回す | 通過 | 付け外しだけ。表示は PR 1 で済んでいる |
| X. 抽象は実需で | 通過 | `setTaskChecked` は共有メモとお題の下書きの 2 か所が使う（ADR 0007 基準 1）。全員に共有する付け外しのための仕組み（コマンド・版）は作らない（正本 D1） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密も個人情報も扱わない |

**逸脱なし。**

## 全体の制約

- **ブランチ**: `feature/issue-315-pr2-task-list-toggle`（PR 1 が入った main から切る）
- **破壊検証の前に `git status --porcelain` が空であることを見る**
- **コミットしたらすぐ push する**。**本番へ配布しない**（配布は利用者の明示の指示を待つ）
- お題のコマンドを timer・poker・ハブのスキーマに足さない（ADR 0021 決定 3）。お題ツールでも、付け外しで `topic.set` を送らない（FR-011）
- 新しい文言は無い
- E2E に書く本文は英数字で書く（書体の base 層の検査に掛かる）

## ファイルの地図

| ファイル | 変更 |
|---|---|
| `packages/markdown/src/blocks.ts` | `parseRawBlocks` の分割・行番号・`index`・`setTaskChecked` |
| `packages/markdown/src/index.ts` | `setTaskChecked` を公開 |
| `packages/markdown/tests/blocks.test.ts` | 行の分け方の一致（Task 1）・通し番号（Task 2） |
| `packages/markdown/tests/set-task-checked.test.ts` | 新規（Task 2） |
| `packages/web-kit/src/reader/markdown.tsx` | 受け口 `onSourceChange`（Task 3） |
| `packages/web-kit/tests/markdown.test.tsx` | 押せる・押せない・押した値（Task 3） |
| `apps/timer-web/src/ui/components/SharedMemo.tsx` | プレビューの付け外し（Task 4） |
| `apps/timer-web/test/ui/SharedMemo.test.tsx` | 付け外しの送信・自分と外からの知らせ（Task 4） |
| `apps/topic-web/src/components/TopicSheet.tsx`・`TopicEditor.tsx` | 下書きのプレビューの付け外し（Task 5） |
| `apps/topic-web/tests/topic-room.test.tsx`（または `TopicEditor` を描くテスト） | 下書きの書き換え・`topic.set` を送らない（Task 5） |
| `e2e/specs/markdown-task-list.spec.ts` | 新規。2 つのブラウザで共有メモの付け外しが届く（Task 6） |
| `scripts/mutations/*.patch`・`scripts/lib/mutation-declarations.mjs` | 変異の登録（Task 7） |

## Task 1: 行の分け方とブロックの切り分けを 1 つにする（振る舞いは変えない）

- [ ] **Red**: `blocks.test.ts` に、P2 の入力で「正規化して分けた行」と「区切りを残して分けた行の偶数番目」が等しいことを見るテストを足す（分け方の 2 つの関数は `blocks.ts` の内部。テストは `src/blocks.ts` から直接読む。README の「内部の関数はテストが直接読む」と同じ扱い）
- [ ] 赤を見る（関数が無い）
- [ ] **Green**: P1 のとおり分ける。`parseRawBlocks(lines)` の箇条書き・番号付きの行に元の行番号を持たせる
- [ ] 既存の `blocks.test.ts`・`performance.test.ts`、変異 m106・m107 が緑・赤のまま（`node scripts/mutation-check.mjs --pkg packages/markdown`）
- [ ] コミット: `refactor(markdown): 行の分け方とブロックの切り分けを付け外しと共有できる形にする（#315）`

## Task 2: `setTaskChecked` と通し番号（FR-010・012）

- [ ] **Red**: `blocks.test.ts` に通し番号のテスト（箇条書きと番号付きをまたいで 0, 1, 2…・タスクでない項目は数えない・コードの囲みの中は数えない）
- [ ] **Red**: `set-task-checked.test.ts` を足す。`@requirements #315 spec FR-010・FR-012`
  - 0 番目を付ける → その行の `[ ]` だけが `[x]`。他の行は同じ
  - `[X]` を外す → `[ ]`
  - CRLF・U+2028 の本文で、改行の種類が残る
  - コードの囲みの中の `- [ ]` が前にあっても、通し番号は囲みの外の項目を指す
  - 範囲の外の番号・すでに同じ状態 → 元の文字列と同じ参照（`toBe`）
  - 長さが変わらない
  - 往復: `parseMarkdown(setTaskChecked(src, i, c))` の i 番目の `checked` が `c`
- [ ] 赤を見る
- [ ] **Green**: P3・P4 のとおり足し、`index.ts` から `setTaskChecked` を公開する
- [ ] `performance.test.ts` に、20 万字の本文の最後の項目を付け外しする場合を足す（上限の時間の中で終わる）
- [ ] コミット: `feat(markdown): タスクの項目の 1 字だけを書き換える setTaskChecked を足す（#315）`

## Task 3: `Markdown` の受け口（FR-006 を保つ）

- [ ] **Red**: `packages/web-kit/tests/markdown.test.tsx`
  - `onSourceChange` を渡さない → いまと同じく `disabled`（PR 1 のテストがそのまま緑であること）
  - 渡す → `toBeEnabled()`。`userEvent.click(checkbox)` で `onSourceChange` が `setTaskChecked(source, i, true)` と同じ値で 1 回呼ばれる
  - 文（`label` の中の文）を押しても同じく呼ばれる。項目の中のリンクを押しても呼ばれない
  - 受け口を渡しても、`source` が変わるまで見え方は変わらない（制御された値。呼び手が本文を変えて初めてチェックが付く）
- [ ] 赤を見る
- [ ] **Green**: P5 のとおり `Markdown` → `Block` へ受け口を通す
- [ ] `packages/web-kit/README.md` の `Markdown` の説明に受け口を足す
- [ ] コミット: `feat(web-kit): Markdown に付け外しの受け口を足す（#315）`

## Task 4: 共有メモのプレビューで付け外しする（FR-007〜009）

- [ ] **Red**: `apps/timer-web/test/ui/SharedMemo.test.tsx`
  - プレビューで `getByRole('checkbox', { name })` を押す → `onCommit` が、その項目だけ反転した本文で 1 回呼ばれる（FR-007）
  - 押した直後、`note` が変わる前に、チェックボックスが反転して見える（FR-008）
  - その後に同じ本文が `note` で届いても「共有メモが更新されました」を出さない（自分の付け外し）
  - 別の本文（外から付け外しされた本文）が `note` で届く → 状態が変わり、知らせを出す（FR-009）
  - `onCommit` を渡さない → 押せない
- [ ] 赤を見る
- [ ] **Green**: P6 のとおり。`onCommit` があるときだけ `Markdown` に `onSourceChange` を渡す
- [ ] プレビューの区画の `aria-live="polite"` で、付け外しのたびに読み上げが増えないかを Task 6 で確かめる（正本 §8）。増えるなら `aria-live` の置き場を直す（この PR の範囲）
- [ ] コミット: `feat(timer-web): 共有メモのプレビューでチェックを付け外しする（#315）`

## Task 5: お題ツールの下書きのプレビューで付け外しする（FR-010・011・006）

- [ ] **Red**: `TopicEditor` を描くテスト
  - 説明に `- [ ] a` を書き、プレビューのチェックボックスを押す → 説明の欄の値が `- [x] a` になる（FR-010）
  - そのとき `topic.set`（送信の受け口）が呼ばれない（FR-011）
  - いまのお題の札（`CurrentTopic`）のチェックボックスは押せないまま（FR-006）
  - 書く欄の文字数の表示が変わらない（長さが同じ）
- [ ] 赤を見る
- [ ] **Green**: P7 のとおり `TopicSheet`・`TopicEditor` を直す
- [ ] 変異 m90（`TopicEditor.tsx` を当てる既存の変異）のパッチが当たることを `node scripts/mutation-check.mjs --changed` で見る。当たらなければ作り直す（#313 PR 1・PR 2 と同じ）
- [ ] コミット: `feat(topic-web): 下書きのプレビューでチェックを付け外しする（#315）`

## Task 6: E2E と実画面検証（V）

- [ ] `e2e/specs/markdown-task-list.spec.ts` を足す。既存の 2 人で入る spec の作りに倣い、timer のルームに 2 つのブラウザで入る。A が共有メモに `- [ ] first test` を書いてプレビューに戻し、チェックを押す → B の共有メモのチェックボックスが `toBeChecked()` になる（SC-003）
- [ ] 同じ spec で、お題ツールの下書きのプレビューのチェックを押すと説明の欄が `[x]` になり、いまのお題の札は変わらないことを見る（SC-004）
- [ ] 390・1280 で撮る: 共有メモ（押す前・押した後・相手の画面）、お題ツールの「書く」（広い幅の並べた形・狭い幅のプレビューに切り替えた形）
- [ ] 押せるチェックボックスが共有メモの面と象牙の札の上で 3:1 以上で見えること（NFR-001）。キーボード（Tab・Space）で付け外しできること
- [ ] 撮った画面を利用者に見せる
- [ ] コミット: `test(e2e): 共有メモのチェックの付け外しが相手に届くことを見る（#315）`

## Task 7: 変異を登録して赤を見る（VII）

- [ ] `git status --porcelain` が空であることを見る
- [ ] P8 の 3 つのパッチを作って登録し、`node scripts/mutation-check.mjs --id <番号>` で 3 つとも殺されることを見る
- [ ] PR 1 で足した変異（267〜269）が当たり続け、殺され続けることを `--changed` で見る
- [ ] scripts の自己テストが緑
- [ ] コミット: `test(mutation): 付け外しの書き換えと受け口を壊す変異を足す（#315）`

## Task 8: 仕上げ

- [ ] `pnpm test`・`pnpm e2e`・`pnpm -r lint`・`pnpm -r typecheck`
- [ ] `node scripts/audit-structure.mjs`・`node scripts/audit-ui-components.mjs`・`node scripts/audit-public-surface.mjs`・`node scripts/audit-dependency-direction.mjs`・`node scripts/check-links.mjs`・`node scripts/audit-plan-gate.mjs`
- [ ] `packages/markdown/README.md` に `setTaskChecked` を足す
- [ ] PR を作る。本文に: いまのお題の札は押せないまま（正本 D1）・共有メモの同時の付け外しは後から届いた方が勝つ（正本 D6）・撮った画面
- [ ] #315 の振り返りを書く（`docs/guides/retrospective.md`）。全員に共有する付け外しを見送ったこと（正本 §2.2）と、その後に実需が出たかを残す
