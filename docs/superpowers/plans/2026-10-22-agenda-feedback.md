# 進行タイマーの利用者フィードバック（#429 第 2 段の後）— 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 利用者が実際に使って挙げた 6 点（サンプルの出し方・進行表の枠・読み上げのボタン・終了見込みの印）を直す。

**Architecture:** すべて `apps/agenda-web` の画面だけで閉じる。core・wire・同期サーバー・保存の形は変えない。

**Tech Stack:** React 19・vitest・Playwright（e2e）

**Spec:** この文書の「利用者の決定」が正本（2026-10-22 に利用者が承認した直し方）。前提は [`docs/superpowers/specs/2026-10-21-agenda-timer-repeat-design.md`](../specs/2026-10-21-agenda-timer-repeat-design.md) と第 1 段の設計。

- **日付**: 2026-10-22・**実測時点**: main `0b1fb8d6`・枝 `fix/429-agenda-feedback`

## 利用者のフィードバックと決定（2026-10-22）

| # | フィードバック（要旨） | 決定（利用者が承認した直し方） |
|---|---|---|
| F1 | サンプルは一度選ぶと二度と出せない | 組む画面に小さな「サンプルから選ぶ」を 1 つ置き、押したときだけ 3 行の一覧を開く。組む画面にいる間は何度でも使える |
| F2 | 主役は会の名前とステップなのに、サンプルが場所を取りすぎ | 大きな札 3 枚をやめる。ボタンは主の欄（会の名前・ステップ）より**下**に置く |
| F3 | 慣れると要らないのに消せない。必要なときに出るだけでいい | 一覧は既定で閉じている。下書きに中身があるときに選んだら「いまの下書きを置き換えますか」と確かめる |
| F4 | 進行表のスクロールバーの位置がおかしい。全部見えているのにバーが出る | 枠の高さを固定値（`min(24rem, 50vh)`）でなく画面に合わせる。はみ出すときだけバーを出す。1 回あたり 1 ステップ（朝会）は回の見出しを出さず 1 行にまとめる |
| F5 | 「読み上げ」が何か分からない。効いている？ | 読み上げソフト向けのボタンとして残し、ふだんは隠す。キーボードのフォーカスが当たったときだけ見せる |
| F6 | 盤の縁の ▽ が何か分からない | 盤の下の一行の「終了見込み」の前に、同じ形・同じ色の小さな印を添えて結び付ける。盤は変えない |

実測（2026-10-22・dev・朝会のサンプル 1 ステップ × 6 回）: 枠の `clientHeight` 384px に対して `scrollHeight` 417px（1440 / 1024px）・409px（375px）。最後の 33px のためにバーが出て、「6 回」の行が半分で切れていた。広い幅では枠の下が空いている。

## Constitution Check

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動 | 通過 | 各タスクは赤いテストから。CSS の寸法は jsdom で測れないので実画面の撮影で確かめる（V） |
| II. ADR | 通過 | 新しい依存・技術なし |
| III. 揮発インメモリ | 通過 | 状態の持ち方は変えない（サンプルの一覧の開閉は画面の一時状態） |
| IV. 境界の型安全 | 通過 | 境界は変えない |
| V. 実画面検証 | 通過 | 朝会・LT 会・60 区切りを 375 / 1024 / 1440px で撮る（Task 3） |
| VI. 依存は内向き | 通過 | 画面だけ |
| VII. 壊して確かめる | 通過 | 変異 m461・m462 を足す |
| VIII. 記録が正本 | 通過 | 設計 `2026-10-21-agenda-timer-repeat-design.md` の §11 に、この直しの決定を足す（Task 3） |
| IX. 小さく回す | 通過 | PR 1 本。配布は第 2 段と一緒に、利用者の指示を待つ |
| X. 抽象は実需で | 通過 | 読み上げのボタンの「フォーカスで見せる」は agenda-web の CSS に置き、`packages/ui` に上げない（使うのは 1 か所） |
| XI. 秘密と個人情報 | 通過 | 変えない |

**逸脱なし。**

## Global Constraints

- 画面の固定文言は `apps/agenda-web/src/copy.ts` に置き、書体の base 層に収める（`tests/copy-fits-font-base.test.ts`・`tests/rendered-text-fits-font-base.test.tsx`）。**「目」「返」「繰」「択」は base 層に無いかもしれない**ので、新しい文言は `outsideBase` で実測してから使う
- 新しい生の色を書かない。字の大きさは既存の段か理由つきの `scale-exempt`
- **回数 1 の進行表の DOM は変えない**（第 1 段と同じ）
- 押せる部品は 44px 以上（`--tap-target`）
- コミットの末尾は `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`（実装役）。閉鎖キーワードを書かない
- サブエージェントは push・PR 作成・マージをしない

## Review Focus

1. **下書きを組みかけたままサンプルを押した** → 黙って消えず、確かめてから置き換える。やめれば下書きはそのまま（Task 1〈m461〉）
2. **朝会（1 ステップ × 6 回）を 1440×900 で進める** → 進行表にスクロールバーが出ず、6 行が全部見える（Task 2・撮影）
3. **LT 会を 30 回（60 区切り）にして 375px で進める** → はみ出すのでバーが出て、いまの行が枠の中に見え、ページは動かない（既存の m459・m460 が守る。撮影で確かめる）
4. **キーボードだけで操作する人が Tab で「読み上げ」に来た** → そのときだけボタンが見え、押すと要約が読み上げの領域に入る（Task 2）
5. **サンプルの一覧を開いたまま、ルームのシナリオが他の人に変えられた** → 一覧の開閉と「シナリオが変わりました」の知らせが両立する（Task 1）

## 検証の実行時間の見積もり

| 何を | 1 回 | 回数 | 小計 |
|---|---|---|---|
| `pnpm --filter @tasuki/agenda-web test`（ファイル指定・全件） | 30 秒〜1 分 | 20 | 15 分 |
| agenda-web の typecheck・lint・`pnpm typecheck` | 1〜3 分 | 4 | 8 分 |
| 変異 2 本の赤を見る | 1 分 | 2 | 2 分 |
| E2E（agenda・landing・buttons の spec。統括） | 1〜3 分 | 2 | 5 分 |
| 撮影（統括・3 幅 × 3 場面） | 10 分 | 2 | 20 分 |
| CI（quality に変異の全件・約 13 分） | 15 分 | 1〜2 | 30 分 |
| **合計** | | | **約 1.5 時間**（往復を含めない） |

## 取り決め

- 枝は `fix/429-agenda-feedback`。実装役は本体（`/workspaces/claym/local/Tasuki`）で作業し、枝を切り替えない
- 変異は **m461・m462**（着手時に `ls scripts/mutations` と宣言で空きを確かめる）。手順は第 2 段と同じ（当てて赤 → 戻して `git status --porcelain` が空）
- E2E の実行・`pnpm dev`・撮影は統括。実装役は E2E の選択子を直すだけ
- `pnpm install` は打たない

---

### Task 1: 組む画面のサンプル（F1・F2・F3）

**Files:**
- Modify: `apps/agenda-web/src/components/ScenarioBuilder.tsx`（`SampleCards`・`showSample`）・`apps/agenda-web/src/builder.css`・`apps/agenda-web/src/copy.ts`
- Modify: `e2e/support/agenda.ts`（`loadSampleAndStart`）・`e2e/specs/agenda.spec.ts`・`e2e/specs/landing.spec.ts:65-66`・`e2e/specs/buttons.spec.ts:299`（サンプルの札を目印にしている所）
- Test: `apps/agenda-web/tests/scenario-builder.test.tsx`・`tests/rendered-text-fits-font-base.test.tsx`

**Interfaces:**
- Produces: `copy.ts` に `SAMPLE_MENU_BUTTON`（例「サンプルから選ぶ」）・`SAMPLE_REPLACE_CONFIRM`（例「いまの下書きを置き換えますか」）・`SAMPLE_REPLACE_YES`（例「置き換える」）・`SAMPLE_REPLACE_NO`（例「やめる」）。いずれも base 層で実測してから決める
- 一覧の各行のボタンの名前は、いまの札と同じ `sampleTitle(label)`（「サンプル：KPT のふりかえり」）を含める（読み上げと E2E の選択子が今までどおり引ける）

- [ ] **Step 1: 赤いテストを書く**（scenario-builder.test.tsx）
  - 「空のルームで組む画面を開くと、サンプルの札は出ず、『サンプルから選ぶ』のボタンが 1 つだけある。押すと 3 行（KPT・朝会・LT 会）が開く」
  - 「ルームにシナリオがある・下書きに中身があるときも『サンプルから選ぶ』がある」（これまでは空のときだけ。F1 の本体）
  - 「下書きが空のときに選ぶと、確かめずにそのまま読み込み、一覧は閉じる」
  - 「下書きに中身があるときに選ぶと『いまの下書きを置き換えますか』が出る。『置き換える』で読み込み、『やめる』で下書きはそのまま」（**m461**: 確かめずに置き換える）
  - 「『サンプルから選ぶ』は会の名前とステップの欄より後にある（DOM の順）」（F2）
  - 「一覧は既定で閉じている。もう一度押すと閉じる（`aria-expanded` が true / false）」
- [ ] **Step 2: 赤を見る**（`pnpm --filter @tasuki/agenda-web test -- tests/scenario-builder.test.tsx`）
- [ ] **Step 3: 実装する**
  - 大きな札（`SampleCards`・`.builder-sample*` の CSS）をやめ、開閉のボタン（`aria-expanded`・`aria-controls`）と、開いたときの 3 行の一覧にする。行はサンプルの名前と `scenarioDetail(...)`（例「1 ステップ × 6 回・全部で 12 分」）を 1 行で見せる
  - 置き場所は主の欄（会の名前・ステップの並び・くりかえし）の**下**、合計の行より前か後は見た目で決める（主役を押しのけない）。控えめな見た目（`ui-button--quiet` 相当）
  - 下書きに中身があるとき（`isEmptyDraft(draft)` が偽）の確かめは、既存の「最初から」の確かめ（`components/ResetControl.tsx`）と同じ作り（その場で開く確かめ・`role` と文言・フォーカスの戻し）に揃える
  - 「下書きが空」は第 2 段の `isEmptyDraft`（会の名前・ステップが空で回数が '1'）をそのまま使う
- [ ] **Step 4: E2E の選択子を直す**: 札を押していた所（`e2e/support/agenda.ts:62` ほか）は「サンプルから選ぶ」を押してから行を押す。`landing.spec.ts:65-66` と `buttons.spec.ts:299` の目印（「サンプル：KPT のふりかえり」の札）は「サンプルから選ぶ」のボタンに替える。**Playwright は打たない**（統括が流す）。e2e の typecheck・lint・`e2e/tests` の自己テストは流す
- [ ] **Step 5: 緑を見る**（agenda-web の全件・typecheck・lint）。変異 m461 を足して赤を見る。既存の変異が当たること（`grep -l ScenarioBuilder scripts/mutations/*.patch` ほか）
- [ ] **Step 6: コミット** `fix: サンプルを組む画面の小さな一覧にし、いつでも選べるようにする（#429）`

### Task 2: 進める画面（F4・F5・F6）

**Files:**
- Modify: `apps/agenda-web/src/components/StepList.tsx`・`apps/agenda-web/src/agenda-view.ts`（`stepRows`・`footerLine`）・`apps/agenda-web/src/run.css`・`apps/agenda-web/src/components/RunScreen.tsx`（読み上げのボタン）・`apps/agenda-web/src/components/Dial.tsx`（盤の下の一行）・`apps/agenda-web/src/dial.css`・`apps/agenda-web/src/copy.ts`
- Test: `apps/agenda-web/tests/step-list.test.tsx`・`tests/agenda-view.test.ts`・`tests/dial.test.tsx`・`tests/agenda-room.test.tsx`（読み上げのボタン）

**Interfaces:**
- Consumes: `definedStepCount(v)`（`agenda-view.ts`・第 2 段）
- Produces: `footerParts(v, wallNow): { next: string; end: string }`（`footerLine` を分けたもの。`footerLine` は `footerParts` から組み、要約・既存のテストの文は変えない）

- [ ] **Step 1: 赤いテストを書く**
  - step-list.test.tsx「回数 2 以上で 1 回あたり 1 ステップのときは、回の見出しを出さず、行の番号に回の数（1〜N）を出す」（**m462**: 見出しを出す）。「1 回あたり 2 ステップ以上は、これまでどおり回の見出しで区切る」。「回数 1 の DOM は変わらない」
  - step-list.test.tsx: スキップ／戻すの読み上げ名は、1 ステップのときは回を名指す（例「3 回をスキップ」）。copy.ts に置く
  - agenda-view.test.ts: `footerParts` が `next`（「次は 話す」・無ければ空）と `end`（「20:35 に終了見込み」）を返し、`footerLine` は今までと同じ文
  - dial.test.tsx: 盤の下の一行で、終了見込みの前に印（`aria-hidden` の小さな SVG・盤の印と同じ形 `M0 7 L-6 -5 L6 -5 Z` と同じ色の段 `dial-marker--{tone}`）がある。読み上げの文は変わらない
  - agenda-room.test.tsx（または RunScreen のテスト）: 「読み上げ」のボタンは目に見えない隠し方のクラスを持ち、Tab でフォーカスを当てられ、押すと要約が `aria-live` の領域に入る（既存の振る舞いのまま）
- [ ] **Step 2: 赤を見る**
- [ ] **Step 3: 実装する**
  - **進行表の枠（F4）**: `.step-list-rows--scroll` の高さの上限を固定値でなく画面に合わせる。目安:
    - 広い幅（`>= 64rem`）: 右の列の上端から画面の下端まで（例 `max-height: calc(100dvh - <枠の上端までの高さ>)` か、`.run-aside` を `position: sticky; top` にして中を伸ばす）。**1440×900 と 1024×768 で朝会（6 行）・LT 会 5 回（10 行・見出し 5）にスクロールバーが出ない**こと
    - 狭い幅: 画面の高さの 7 割前後。中身が収まるならバーを出さない（`overflow-y: auto` のまま）
    - バーの見た目: `scrollbar-width: thin`・`scrollbar-color` は既存のトークン（例 `--gold-edge` と透明）。バーは枠の右端に付く（行の「スキップ」に重ならない）
    - 値は CSS の 1 か所にまとめる（統括が撮影で詰める）
  - **1 ステップの回（F4）**: `definedStepCount(v) === 1 && v.rounds >= 2` のときは、見出しの群をやめて平らな `<ol>` にし、行の番号に回の数を出す。枠（`--scroll`）とキーボードの `tabIndex` は回数 2 以上の振る舞いを保つ
  - **読み上げ（F5）**: `.run-speak` を、ふだんは `ui-visually-hidden` と同じ隠し方にし、`:focus-visible` のときだけ見える普通のボタンに戻す（agenda-web の CSS に置く。「本文へ飛ぶ」リンクと同じ作り）。ボタンの名前は「読み上げ」のままでよいが、何をするかが分かる名前にするなら「状況を読み上げる」など（base 層で実測）
  - **終了見込みの印（F6）**: 盤の下の一行（`Dial.tsx` の `figcaption.dial-footer`）を `footerParts` で組み、`end` の前に盤の印と同じ形・同じ色の段（`driftTone(view)` の `late` / `early` / `even`）の小さな SVG（字の高さ程度・`aria-hidden`）を置く。映す表示の「終了見込み」の見出しにも同じ印を添える（`ProjectionView.tsx`）
- [ ] **Step 4: 緑を見る**（agenda-web の全件・typecheck・lint・`pnpm typecheck`）。変異 m462 を足して赤を見る。既存の m444〜m448・m450・m455〜m460 が当たること
- [ ] **Step 5: コミット**（1〜2 つ）

### Task 3: 撮影と記録（統括）

- [ ] E2E（agenda・landing・buttons の spec）を流す
- [ ] dev で撮る: 組む画面（空・下書きあり・サンプルの一覧を開いた）を 375 / 1440px。進める画面の朝会・LT 会 5 回・60 区切りを 375 / 1024 / 1440px。枠の `clientHeight` と `scrollHeight` を測り、「収まるならバーが無い」「はみ出すならいまの行が見える」を確かめる。値が合わなければ Task 2 の CSS の 1 か所を直す
- [ ] 設計 `docs/superpowers/specs/2026-10-21-agenda-timer-repeat-design.md` の §11 に「利用者のフィードバック（2026-10-22）」として F1〜F6 と決めたことを足す
- [ ] PR を作り `/code-review <番号>` を流す
