# #316 PR 2: ボタン・操作の並び・文字の段 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ボタンの見た目を部品 `.ui-button`（形 1 つ・役割 4 種・大きさ 3 段）と操作の並び `.ui-actions` に揃え、要素層の `button` から見た目を外し、見出しを文字の段（§11）に揃える。玄関・poker・お題ツールに当てる（timer は PR 3）。

**Architecture:** 部品層に `button.css` と `actions.css` を足す。要素層の `button` を初期化だけに減らし、h2・h3 を §11 の表に合わせる。各アプリの素の `<button>` にすべて役割のクラスを付け、一時的な規則（`.secondary` の上書き）を消す。素のボタンが残っていないことを E2E で走査する。

**Tech Stack:** CSS・React 19・Vitest・Playwright・postcss（検査）

**Spec:** [`docs/superpowers/specs/2026-10-08-responsive-layout-design.md`](../specs/2026-10-08-responsive-layout-design.md) の D4・D5・D6・§10.2・§11。見た目の案はキャンバスの「PR 2」の段

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 素のボタンの走査・主の数・押せる大きさの E2E を先に書いて赤を見る |
| II. 技術選定は ADR を通す | 通過 | 新しい依存を足さない。ADR 0025 の決定 4・5 を「実施した」に、文字の段を決定として足す |
| III. 揮発インメモリと単純運用 | 該当なし | 同期サーバーに触れない |
| IV. 境界の型安全 | 該当なし | 境界検証に触れない |
| V. 実画面検証 | 通過 | 撮影を controller が見て、利用者に実物で見てもらう |
| VI. 依存は内向き | 該当なし | `packages/ui` は依存を持たないまま |
| VII. 検査は壊して確かめる | 通過 | 部品と要素層の規則を壊して E2E と検査が赤になるのを見る |
| VIII. 記録が正本 | 通過 | 設計正本 §11・ADR 0025・README「画面を組む」 |
| IX. 小さく回す | 通過 | #316 の PR 2。配布しない |
| X. 抽象は実需で | 通過 | 部品はすべて 2 アプリ以上が使う（死んだ部品の検査） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## Global Constraints

- ボタンの役割: `.ui-button`（既定＝主・金の地）／`--secondary`（金の枠）／`--quiet`（下線の字・`<a>` にも当ててよい）／`--danger`（朱の枠）。大きさ: `--sm`（見た目 36px・字 xs・当たりは擬似要素で 44px）／既定（44px・字 sm）／`--lg`（52px・字 base）。最小幅 `6rem`（`--quiet` は持たない）。アイコンだけは `--icon`（44px 四方）
- **象牙の札（`.ui-reader`・`.ui-drawer`）の上**のボタンは字を札の色（`--coal`）・危険は濃い朱の枠（`--card-back` 系。札の上で AA を満たす値を測って選ぶ）。部品の CSS に `.ui-reader .ui-button--secondary` などの形で書く（先頭の複合が `.ui-` のクラス・詳細度 (0,2,0)）
- フォーカスのリングは部品が持たない（`outline` を書かない）
- 押し込み・ホバー・無効の見た目は要素層の `button` にあった値を部品へ移す
- 文字の段（§11）: h1 xl・h2 lg 象牙 700（字間・大文字・罫なし・上の余白 `var(--space-5)`）・h3 base 700
- 操作の並び `.ui-actions`: 64rem 未満ではなく **40rem 以上**で横に並べて右寄せ・折り返しても右から詰める。`.ui-actions-start` は左端に離す。40rem 未満は幅いっぱいに縦に積み、主が最後。`.ui-actions--dock` は 40rem 未満でだけ画面の下端に固定（器の下に帯の高さの余白・`env(safe-area-inset-bottom)`）
- 幅の段の境目は `40rem`・`64rem`・`90rem` だけ（範囲構文）
- 新しい文言は書体の base 層に収める（各アプリの書体の検査）
- 作業ブランチ `feature/issue-316-pr2-buttons-type`。サブエージェントは push・マージ・`git stash`・`git checkout -- <path>`・`git reset --hard` をしない。`e2e/inventory-316/` を消さない・コミットしない
- **E2E は 8787 と 18080 を使う。始める前に `ss -tlnp | grep -E ':(8787|18080)\b'` で空いていることを確かめ、塞がっていたら止まって報告する**（利用者の `pnpm dev` を止めない）

## Review Focus

1. **要素層の `button` から見た目を外したとき、クラスの無い `<button>` が素の灰色で出る** → E2E の走査（Task 4）が全画面で 0 件。クラスを付け忘れた変異で赤
2. **主が 1 つの並びに 2 つ出ない**（E7）→ `.ui-actions` の中の `.ui-button` で `--secondary` / `--quiet` / `--danger` を持たないものが 1 つ以下
3. **`--sm` の当たり 44px が隣のボタンに重ならない**（擬似要素で広げた当たりが隣を覆うと押し間違える）→ 並びの `gap` を当たりの差の分取る。E2E で隣り合う当たりの矩形が重ならない
4. **象牙の札の上のボタンの字とフォーカスの輪が AA を満たす** → 既存の a11y の走査（poker・お題ツール）
5. **h2 を大きくしたことで、狭い幅で見出しが折り返して崩れない・見出しの行（`.ui-page-header`）が崩れない** → 320px の横溢れの E2E と撮影

## 見積もり

| 区分 | 見積もり |
|---|---|
| 機械の待ち | 約 1 時間（E2E 全件 2 回・CI 一式・mutation-check） |
| 実作業 | 5〜8 時間 |

2 倍を超えたら利用者に報告する。サブエージェントの戻りが 1 時間を超えたら Monitor で作業ツリーを確かめる。

---

### Task 1: 部品（ボタン・操作の並び）と要素層（button・h2・h3）

**Files:** `packages/ui/src/components/button.css`・`actions.css`（新規）・`components/index.css`・`packages/ui/src/elements/controls.css`・`elements/reset.css`・`packages/ui/tests/`（書体の検査が拾うこと）

- [ ] **Step 1:** `button.css` を書く。要素層の今の `button` の規則（`controls.css` の `button`・`button:disabled`・`:hover`・`:active`・`button.secondary`）の値を `.ui-button` と役割へ移す。大きさ 3 段・`--icon`・`--sm` の当たりの擬似要素（`::before` で上下に広げる・`position: relative` の上で `inset-block: -4px`）・最小幅・`--quiet`（下線・地なし・最小幅なし・高さは 44px）・`--danger`（`--rose-bright` の字と `--rose-edge` の枠・ホバーで `--rose-tint`）。象牙の札の上（`.ui-reader .ui-button--secondary`・`.ui-reader .ui-button--danger`・`.ui-drawer .ui-button--secondary` など）。字の大きさは 5 段のトークン。`outline` を書かない
- [ ] **Step 2:** `actions.css` を書く（Global Constraints の `.ui-actions` の規則）
- [ ] **Step 3:** 要素層: `controls.css` の `button` を `font: inherit; cursor: pointer;` 程度の初期化に減らし、`button:disabled { cursor: not-allowed; }` だけ残す（見た目を持たない）。`reset.css` の h2 を §11 に（`font-size: var(--font-size-lg); font-weight: 700; color: var(--ivory); letter-spacing: 0; text-transform: none; margin: var(--space-5) 0 var(--space-3); line-height: var(--line-tight);`・`h2::after` の罫を消す）。h3 を足す（`font-size: var(--font-size-base); font-weight: 700; margin: 0 0 var(--space-2); line-height: var(--line-tight);`）
- [ ] **Step 4:** `pnpm --filter @tasuki/ui lint && test`・`node scripts/audit-ui-components.mjs`（`[部品の CSS]` 0 件。死んだ部品はこの時点で赤でよい）
- [ ] **Step 5:** コミット `feat: ボタンと操作の並びの部品を置き、要素層の button と見出しを文字の段に揃える（#316 PR 2）`

### Task 2: 玄関とお題ツールに当てる

**Files:** `apps/landing/src/screens/*.tsx`・`src/index.css`・`apps/topic-web/src/components/*.tsx`・`src/index.css`・各アプリの単体テスト

- [ ] **Step 1:** 素の `<button>` と `className="secondary"` を全部、役割のクラスに替える（`grep -rn --include='*.tsx' "<button" apps/landing/src apps/topic-web/src` で全件）。対応:
  - 玄関: `hub-submit`（作る・参加する）→ `ui-button ui-button--lg`（主）。参加用 URL をコピー・QR コードを表示 → `ui-button ui-button--secondary`。記録を見る（`.hub-secondary` の `<a>`）→ `ui-button ui-button--quiet`
  - お題ツール: 場に出す → `ui-button ui-button--lg`（主）。招待リンクをコピー → `--secondary --sm`。選択画面へ戻る（`<a>`）→ `--quiet --sm`。定型から選ぶ・AI で作る → `--secondary`。解錠する → `--secondary`。下書きにコピー → `--secondary`（札の上）。場から下げる → `--danger`（札の上）。続きを読む・閉じる → `--secondary --sm`（札の上）。書く／プレビューの切り替え（狭い幅）→ `--secondary --sm`（選んだ側は `aria-pressed` と主の見た目にしない・`--secondary` のまま `aria-pressed` で太字などで区別する）。タブ（`.topic-tab`）はボタンの形をしない操作なので `.ui-button` にしない（`.topic-tab` のまま。要素層から見た目が消えるので、`.topic-tab` が自分で見た目を全部持つことを確かめる）
- [ ] **Step 2:** 画面の CSS から、ボタンの見た目の写し（`.hub-submit` の地と枠・`.hub-invite-actions button`・`.topic-current .secondary, .ui-drawer .secondary` の一時的な規則・`.hub-secondary` の見た目）を消す。配置（幅・並び）は残す。玄関の `.hub-section-title`・`.hub-heading` は §11 の h2 と同じ値なら消し、違うなら理由を注釈に
- [ ] **Step 3:** お題ツールの h2 の上書き（`.topic-make-fold > summary h2` など）が §11 と食い違わないか見て揃える
- [ ] **Step 4:** 単体テスト（クラス名で取っているものがあれば役割で取る形へ）・型・書体の検査・E2E `landing*.spec.ts`・`topic.spec.ts`・`invite-sheet-md.spec.ts`・`panels-headers.spec.ts`・`notices-a11y.spec.ts`・`routing.spec.ts` が緑
- [ ] **Step 5:** 1280 と 390 で玄関（名乗る・道具選び）とお題ツール（場のお題・下書き）を撮り、自分で見る（`scratchpad/pr2-landing-*.png`・`pr2-topic-*.png`）
- [ ] **Step 6:** コミット `feat: 玄関とお題ツールのボタンを役割の部品に揃える（#316 PR 2）`

### Task 3: poker に当てる（主従の逆転・操作の並び・下端の帯）

**Files:** `apps/poker-web/src/pages/RoomPage.tsx`・`components/*.tsx`・`src/index.css`・単体テスト

- [ ] **Step 1:** ボタンの役割（設計正本 §2.3 の B5 を直す）: 票を公開する → 主（`--lg`）。再投票 → 主（`--lg`）・次のラウンドへ → `--secondary`。招待リンクをコピー → `--secondary --sm`。選択画面へ戻る → `--quiet --sm`。お題を隠す・お題を見る → `--secondary --sm`。続きを読む・閉じる → `--secondary --sm`（札の上）。エラーの閉じる（`ErrorNote`）→ `--quiet --sm`。手札の札（`CardHand`）は `.ui-button` にしない
- [ ] **Step 2:** 操作の並び: 票を公開する・再投票＋次のラウンドへ を `.ui-actions .ui-actions--dock` に入れる（主は最後）。40rem 未満で下端の帯になる
- [ ] **Step 3:** 画面の CSS から写しを消す（`.invite button`・`.error-note button`・`.topic .secondary` の一時的な規則・`.round-actions` の並び）。区画の見出しの下の暗い帯（`.room section:not(.topic) > h2`）と、その注釈を §11 の理由で消す。`.room-main section > h2 { margin-top: 0 }` は残すか §11 の値と揃える
- [ ] **Step 4:** 単体・型・書体・E2E `poker.spec.ts`・`poker-a11y.spec.ts`・`layout.spec.ts`・`invite-sheet-md.spec.ts`・`panels-headers.spec.ts`
- [ ] **Step 5:** 1280・390 で 投票中・公開後 を撮り、自分で見る（`scratchpad/pr2-poker-*.png`。390 では下端の帯が中身を隠さないこと）
- [ ] **Step 6:** コミット `feat: poker のボタンを役割の部品に揃え、主の操作を下端の帯にする（#316 PR 2）`

### Task 4: 検査（E2E）と破壊検証

**Files:** `e2e/specs/layout.spec.ts`（または `e2e/specs/buttons.spec.ts` 新規）

- [ ] **Step 1: 先に書いて赤を見る**（Task 1〜3 の前の main の状態の考え方は使えないので、Task 3 の後に書き、Step 2 の破壊検証で赤を見る）
  - 素のボタン: 玄関（名乗る・道具選び）・poker（投票中・公開後）・お題ツール（場のお題・下書き・作る欄を開いた）で、`button` のうち `.ui-button` も画面固有のクラス（`card`・`topic-tab`・ほか許可した 1 つの一覧）も持たないものが 0 件（E6）
  - 主の数: `.ui-actions` の中の主（`.ui-button` で `--secondary`・`--quiet`・`--danger` を持たない）が 1 以下（E7）
  - 下端の帯: poker 390 で `.ui-actions--dock` が画面の下端に接し、最下部の中身の下端 ≤ 帯の上端（E8）
  - 当たり: `.ui-button` の当たり（`--sm` は擬似要素を含む）が 44×44 以上。隣り合う当たりが重ならない
- [ ] **Step 2: 破壊検証**（コミットしない）: ① 玄関の 1 つのボタンからクラスを外す → 素のボタンの検査が赤 ② 次のラウンドへの `--secondary` を外す → 主の数の検査が赤 ③ `--sm` の擬似要素を消す → 当たりの検査が赤 ④ 帯の下の余白を消す → 帯の検査が赤。`git restore` で戻す
- [ ] **Step 3:** CI 一式・E2E 全件・`node scripts/mutation-check.mjs`（全件検出。当たらないパッチは壊し方を変えずに当て直す）
- [ ] **Step 4:** コミット `test: 素のボタン・主の数・下端の帯・押せる大きさを E2E で見る（#316 PR 2）`

### Task 5: 文書

- [ ] `packages/ui/README.md`: 部品の表に `.ui-button`・`.ui-actions` を足す。「画面を組む」にボタンの選び方（役割で選ぶ・主は 1 つの並びに 1 つ・危険は離す・札の上の色は部品が持つ）と文字の段（§11 の表）を書く。画面の列挙をしない
- [ ] ADR 0025: 決定 4・5 を「実施は #316 PR 2（timer は PR 3）」から実施の記述へ（完了形にせず、決定として書き、`## 実施状況` に PR 2 の行を足す形）。文字の段を決定 7 として足す
- [ ] 設計正本 §11 の内容と実装の照合
- [ ] `node scripts/check-links.mjs`・`node scripts/audit-plan-gate.mjs`。コミット `docs: ボタンの選び方と文字の段を画面を組むと ADR 0025 に残す（#316 PR 2）`
