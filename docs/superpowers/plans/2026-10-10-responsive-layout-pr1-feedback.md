# #316 PR 1 実物の確認を受けた手直し 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 利用者が #347 を実物で確かめた指摘（2026-10-09）のうち、この PR で直すと決めたもの（設計正本 §10.1）を直す。poker のお題を切り替えられるようにし、お題ツールを書く主役にして文言を卓の言葉に揃える。

**Architecture:** 部品層は変えない（読む面の高さの固定・中央寄せは各アプリの CSS が持つ。使うアプリが 1 つのため）。poker は表示の切り替えの状態を `RoomPage` に置き、お題ツールは `TopicEditor` から「書き直す」を外して `CurrentTopic`（札の側）へ移す。

**Tech Stack:** React 19・CSS・Vitest・Playwright

**Spec:** [`docs/superpowers/specs/2026-10-08-responsive-layout-design.md`](../specs/2026-10-08-responsive-layout-design.md) §10。見た目の案はキャンバスの案 4

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 単体テストと E2E を先に書き換えて赤を見てから直す |
| II. 技術選定は ADR を通す | 該当なし | 新しい技術を足さない |
| III. 揮発インメモリと単純運用 | 該当なし | 同期サーバーに触れない。表示の切り替えは手元の状態だけ |
| IV. 境界の型安全 | 該当なし | 境界検証に触れない |
| V. 実画面検証 | 通過 | 撮影を controller が見て釣り合いを判断し、利用者に実物で見てもらう |
| VI. 依存は内向き | 該当なし | ドメインに触れない |
| VII. 検査は壊して確かめる | 通過 | 札の高さの固定・中央寄せ・ボタンの位置を壊して E2E が赤になるのを見る |
| VIII. 記録が正本 | 通過 | 設計正本 §10・README |
| IX. 小さく回す | 通過 | #347 の中の手直し。配布しない |
| X. 抽象は実需で | 通過 | 部品を足さない（1 アプリだけが使うものは各アプリ） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## Global Constraints

- 文言（案 A）: タブ「場のお題」「下書き」／主のボタン「場に出す」／取り下げ「場から下げる」／写す「下書きにコピー」／下書きの印「まだ場に出していません」／poker の切り替え「お題を隠す」「お題を見る」／作る欄の見出し「定型や AI で作る」／札の下端の添え書き「場に出すと、同じルームの timer と poker にも表示されます」。**全部の字が書体の base 層に収まることを各アプリの `tests/*fits-font-base*` で確かめる**
  - 「下書きにコピー」の字は、「写」が書体の base 層に無いため（2026-10-10）。定数名は `COPY_TO_DRAFT_BUTTON`
- 幅の段の境目は `40rem`・`64rem`・`90rem` だけ（範囲構文）。部品層は変えない
- 文字の大きさの段（見出しの大きさ）は PR 2 の範囲。この PR では既存の要素層の見出しのまま
- 作業ブランチ `feature/issue-316-pr1-layout`（#347）。サブエージェントは push・マージ・`git stash`・`git checkout -- <path>`・`git reset --hard` をしない。`e2e/inventory-316/` を消さない・コミットしない
- 日本語のコメント・文書

## Review Focus

1. **poker の切り替えで隠した後も、お題の札の中の `<dialog>`（シート）が DOM ごと消えて、開いていたシートのフォーカスが失われないか** → 隠すのは札ごと（React で描かない）。シートが開いている間は切り替えが押せない（モーダル）ことを注釈で確かめる
2. **お題ツールで「下書きにコピー」を札の側へ移したことで、写した後に書く欄へフォーカスが移るか**（写したのに入力位置が分からない）→ 写したら書くのタイトルの欄へフォーカスを移す。単体テストで固定
3. **札の高さを画面いっぱいに固定したとき、64rem 未満では固定しない**（スマホは 3 行＋続きを読む のまま）
4. **お題ツールの「定型や AI で作る」をたたんだ状態で、生成中・定型に切り替えた知らせ（操作の面の先頭）と生成の操作の結果が見えるか**
5. **poker の切り替えの状態は手元だけ**（他の人の画面に影響しない・お題が差し替わっても開閉の状態は保つ）

## 見積もり

| 区分 | 見積もり |
|---|---|
| 機械の待ち | 約 45 分（E2E 全件・CI 一式・mutation-check） |
| 実作業 | 3〜5 時間 |

2 倍を超えたら利用者に報告する。**サブエージェントの戻りが 1 時間を超えたら、Monitor で作業ツリーとプロセスを確かめる**（前の 2 回の空白）。

---

### Task 1: poker のお題の切り替えと中央寄せ

**Files:** `apps/poker-web/src/pages/RoomPage.tsx`・`src/components/CurrentTopic.tsx`（必要なら）・`src/index.css`・`tests/`（RoomPage の単体テスト。既存の `room-page*.test.tsx` に足すか新設）・`e2e/specs/layout.spec.ts`

- [ ] **Step 1: テストを先に書く**
  - 単体: お題があるとき、見出しの横に「お題を隠す」（`aria-expanded="true"`・`aria-controls` が札の id）がある／押すと札が描かれなくなり、ボタンが「お題を見る」（`aria-expanded="false"`）になる／もう一度押すと札が戻る／お題が無いときは切り替えのボタンが無い／お題が差し替わっても開閉の状態は保つ
  - E2E（`layout.spec.ts`）: poker 1280 で「お題を隠す」を押すと、操作の面（`.room-main`）の幅が 46rem 前後で、器の内側の中央にある（左右の余白の差が 2px 以内）／お題が無い poker 1280 でも同じ（既存の「お題が無いとき」の検査を中央寄せの検査に替える）／お題を開いた状態の札の幅が操作の面より狭い（約 43%）
  - 赤を見る
- [ ] **Step 2: 実装**
  - `RoomPage` に `const [topicOpen, setTopicOpen] = useState(true)`。お題があるときだけ見出しの横（`.ui-page-header` の h1 の隣）に切り替えのボタン（`type="button"`・`className="secondary"`・`aria-expanded`・`aria-controls`）
  - 段組み: お題があり開いているときだけ `-side` を描く（今のまま `ui-workspace ui-workspace--reader`）。隠したとき・無いときは部品が 1 列にする
  - `apps/poker-web/src/index.css`: 1 列のとき（`.ui-workspace:not(:has(> .ui-workspace-side)) > .room-main` のように画面の CSS で書く。画面の CSS は詳細度の約束の対象外だが、読みやすさのため素直に）`max-width: 46rem; margin-inline: auto; width: 100%`
  - 札の比: poker の段組みを `--reader` のまま、札を約 43% にする（`apps/poker-web/src/index.css` で 64rem 以上の `.room .ui-workspace--reader { grid-template-columns: minmax(0, 0.75fr) minmax(0, 1fr); }`。部品の比（0.85fr）より手札を広げる理由を注釈）
  - 文言は `RoomPage` か copy の定数に（poker の書体の検査が拾う場所に置く）
- [ ] **Step 3:** poker-web の単体・型・書体の検査・E2E `layout.spec.ts`・`poker.spec.ts`・`poker-a11y.spec.ts`・`invite-sheet-md.spec.ts` が緑
- [ ] **Step 4: 破壊検証**（コミットしない）: 中央寄せの `margin-inline: auto` を消す → 中央寄せの検査が赤／札の比の規則を消す → 札の幅の検査が赤。`git restore` で戻す（前後で `git status --porcelain` が空）
- [ ] **Step 5:** コミット `feat: poker のお題を隠せるようにし、お題が無いときは手札を中央に寄せる（#316 PR 1）`。1280 で お題を開いた・隠した・無い の 3 枚を撮る（`scratchpad/v4-poker-1280-open.png`・`-hidden.png`・`-none.png`）

---

### Task 2: お題ツールを書く主役にし、文言を揃える

**Files:** `apps/topic-web/src/copy.ts`・`src/components/TopicEditor.tsx`・`TopicMaker.tsx`・`CurrentTopic.tsx`・`src/screens/TopicRoom.tsx`・`src/index.css`・`tests/topic-room.test.tsx`（ほか文言を参照するテスト）・`e2e/specs/topic.spec.ts`・`invite-sheet-md.spec.ts`・`panels-headers.spec.ts`・`e2e/support/topic.ts`（`setTopic` が「このお題にする」を押している）

- [ ] **Step 1: テストを先に書き換える**
  - 文言: タブ「場のお題」「下書き」・主のボタン「場に出す」・「場から下げる」・「下書きにコピー」・下書きの印「まだ場に出していません」・作る欄の見出し「定型や AI で作る」
  - 「下書きにコピー」は札の側（場のお題のタブ）にだけあり、書く側には無い。押すと書く欄にお題が写り、**タイトルの欄にフォーカスが移る**。写したら札は「下書き」のタブへ（下書きが空 → 空でないの規則のまま）
  - 書く側の操作は「場に出す」だけ（書く欄の右端）
  - 「定型や AI で作る」は `<details>`（最初はたたむ）。開くと言語・難易度・定型から選ぶ・合言葉・解錠する が出る。生成中の知らせはたたんだままでも操作の面の先頭に出る
  - 64rem 以上で札の高さは中身によらず一定（E2E: 短い本文と長い本文で札の高さが同じ・画面の高さ − 器の上下の余白 − 見出しの行 程度）
  - 赤を見る
- [ ] **Step 2: 実装**
  - `copy.ts` の定数を替える（`SET_BUTTON = '場に出す'`・`CLEAR_BUTTON = '場から下げる'`・`COPY_TO_DRAFT_BUTTON = '下書きにコピー'`・`TAB_CURRENT = '場のお題'`・`TAB_DRAFT = '下書き'`・`DRAFT_STAMP = 'まだ場に出していません'`・`MAKE_HEADING = '定型や AI で作る'`・`WRITE_HEADING` は「お題を書く」・札の下端の添え書きの定数を足す。`EMPTY_TEXT` などに「書くか、作って」が残れば文言を合わせる）
  - `TopicEditor` から「書き直す」を外す。写す処理（いまのお題を欄へ入れる）は `TopicEditor` の外から呼べるようにする（例: `TopicRoom` が `copyToDraft` の要求を持ち、`TopicEditor` に `fillRequest` の props で渡す・または `TopicEditor` を ref で操作する。既存の「届いたお題で下書きを上書きしない」（変異 m90 が守る）を壊さない形を選び、報告に書く）
  - `CurrentTopic` の「場のお題」のタブの札の下端に「下書きにコピー」（左）と「場から下げる」（右）を置く（`justify-content: space-between`）。下書きのタブの下端には添え書きだけ
  - `TopicRoom`: 操作の面を「お題を書く」（`TopicEditor`）→「定型や AI で作る」（`<details>` に `TopicMaker` を包む）の順に。知らせは操作の面の先頭のまま
  - `apps/topic-web/src/index.css`: 64rem 以上で札の高さを固定（`.topic-current.ui-reader { height: calc(100dvh - var(--space-4) * 2 - var(--space-6) * 2); }` のように部品の max-height と同じ式。注釈で部品の式と揃える理由）。作るの 2 行の規則は `<details>` の中でも効くこと
- [ ] **Step 3:** `e2e/support/topic.ts` の `setTopic` を新しい文言に。topic-web と poker-web の単体・型・書体の検査・E2E `topic.spec.ts`・`invite-sheet-md.spec.ts`・`panels-headers.spec.ts`・`layout.spec.ts`・`poker-a11y.spec.ts`・`timer-a11y.spec.ts`（お題ツールでお題を出す補助を使っている spec は grep で拾って全部）
- [ ] **Step 4: 破壊検証**（コミットしない）: 札の高さの固定を消す → 高さが一定の検査が赤／「下書きにコピー」を書く側に戻す → 位置の検査が赤。`git restore` で戻す
- [ ] **Step 5:** 変異 m90 が当たるか（`git apply --check scripts/mutations/m90-topic-editor-draft-overwritten.patch`）。当たらなければ壊し方を変えずに当て直す
- [ ] **Step 6:** コミット `feat: お題ツールを書く主役にし、文言を場に出す・場から下げるに揃える（#316 PR 1）`。1280 で 場のお題（短い本文・長い本文）・下書き・作る欄を開いた の 4 枚と、390 を 1 枚撮る（`scratchpad/v4-topic-*.png`）

---

### Task 3: 検査一式・文書・Issue（controller が Issue と push）

- [ ] **Step 1（実装役）:** 手元の CI 一式（`pnpm test`・`lint`・`typecheck`・scripts の自己テスト・全 audit・リンク検査）・E2E 全件・`node scripts/mutation-check.mjs` 全件検出
- [ ] **Step 2（実装役）:** `packages/ui/README.md` の「画面を組む」に、脇を「隠せる」形（脇が無いと 1 列になるので、画面が脇を描かないだけで隠せる。1 列のときの操作の面の幅は画面が決める）を 1 行。書く主役の画面の例は書かない（画面の列挙をしない）
- [ ] **Step 3（controller）:** poker の札の見せ方の Issue を起票（設計正本 §10.3）。ブランチ全体のレビュー → push → PR 本文の更新 → 利用者に実物の確認を依頼
