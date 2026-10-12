# #316 PR 4: timer の写しを部品へ・押せる大きさとはみ出しを全画面で合否に 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** timer に残っている部品の写し（入力欄・招待・Markdown）を部品層へ寄せ、本文の文字の大きさを 5 段へ寄せる。押せる大きさ（44px）と横溢れを全画面で合否にする。§13.3 で PR 4 に送った残りもここで片付け、README の「新しい画面や機能を足すときの手順」を書いて #316 を閉じる。

**Architecture:** timer の 4 つの入力欄は `.ui-input` にする。招待の URL の行は `.ui-invite` にする。共有メモの Markdown は `.ui-md-*` にし、暗い面の上でも読めるよう部品に「つまみ」（枠とリンクの色）を足す。これで `Markdown` の `surface` が消える。読む面は「64rem 未満の 3 行の写し（`inert`）」と「64rem 以上の本文」を別の要素に分け、切った本文の中身を Tab の行き先から外す（3 アプリ）。押せる大きさの E2E は `.ui-button` だけを測っていた物差しを広げ、全ての操作（`button`・`a[href]`・`summary`・`[role=tab]`）を 4 つの幅で測る。

**Tech Stack:** CSS・React 19・Vitest・Playwright・node:test（検査）

**Spec:** [`docs/superpowers/specs/2026-10-08-responsive-layout-design.md`](../specs/2026-10-08-responsive-layout-design.md) の D8・D9・E4・E5・E9・§7.1・§13.3。PR 4 で決めたことは Task 8 で設計正本 §14 に書く。ADR 0025

## 利用者の判断が要る論点（計画は推奨で書いてある）

| # | 論点 | 推奨 | 推奨しない側を選んだ場合 |
|---|---|---|---|
| P1 | **文字の大きさの検査（`packages/ui/tests/typography-scale.test.mjs`）の射程を `apps/*/src` に広げるか。** 今の検査は `packages/ui/src` しか読んでいない。timer の `scale-exempt` の注釈（66 件）・poker の直値 7 件・玄関の 2 件は、どの検査にも守られていない。射程を `packages/ui` に限ったのは #280 の設計の決定 | **広げる。** 寄せても守る検査が無ければ、次の PR でまた直値が入る。poker は 5 件を段へ寄せ、点数の大きな数字（2 件）は理由を書いて外す。玄関の題字 2 件も理由を書いて外す（Task 5） | timer を寄せるだけで、検査は足さない。Task 5 の Step 1・2・6 が消え、約 1 時間短くなる |
| P2 | **3 行に切った本文を Tab の行き先から外す方法。** §13.3 で「両方まとめて直す」と決めてある。調べたところ、お題ツールの札（場のお題・下書き）も同じ作りで、**同じ欠陥はアプリ 3 つにある** | **3 行の写し（`.ui-reader-preview`・`inert`）と 64rem 以上の本文（`.ui-reader-body`）を別の要素に分け、CSS で片方だけ見せる。** JS の幅の判定は要らない（poker とお題ツールには判定のフックが無い）。お題ツールも同じ PR で直す | 各アプリで `matchMedia` のフックを作り、`inert={!isWide}` を付ける（フックが 3 つに増える） |
| P3 | `.brand-title`（読み込み中・セッション喪失の h1。等幅の題字）を 5 段へ寄せるか | **段の外に残し、`scale-exempt:` で理由を書く**（計器の意匠の題字。寄せると最大 2.75rem → 1.9rem に縮む。出るのは 2 つの珍しい画面だけ） | `--font-size-xl` に寄せる |
| P4 | 共有メモ（暗い面）のリンクの色 | **今の金（`--signal`）を保つ。** 部品のつまみ `--ui-md-link` で共有メモが指定する | 部品の既定（字の色を継ぎ、下線だけで区別する）にする |

### 設計正本の前提で外れていたもの（実測・2026-10-12）

- **D8「`Card` は `ui-exempt:` で理由を書く」は成り立たない。** `audit-ui-components.mjs` は、何も免除していない `ui-exempt:` を落とす。`Card` の CSS はトークンだけで書かれていて、検査に当たるものが無い。そのため、普通の注釈で理由を書く（Task 2）
- **§13.3 の「poker も同じ」は、お題ツールも同じだった**（P2）
- **E9 の物差し `expectFieldsAtLeast16px` は `.ui-input, .ui-select` だけを数える。** 部品を当て忘れた欄は測られず、緑のまま 14px の欄が残る。オラクルは文字を入れる欄全体に広げる（Task 1）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 各 Task の Step 1 で物差しを先に広げ、main の状態で赤を見る（16px・Tab の行き先・射程・44px） |
| II. 技術選定は ADR を通す | 通過 | 新しい依存を足さない。ADR 0025 の実施状況に PR 4 の行を足す |
| III. 揮発インメモリと単純運用 | 該当なし | 同期サーバーに触れない |
| IV. 境界の型安全 | 該当なし | 境界検証に触れない |
| V. 実画面検証 | 通過 | 撮影を controller が見る。利用者には Chrome の実物で見てもらう |
| VI. 依存は内向き | 該当なし | `packages/ui` は依存を持たないまま |
| VII. 検査は壊して確かめる | 通過 | Task 7 の破壊検証と変異検査（新しい変異 m125〜） |
| VIII. 記録が正本 | 通過 | 設計正本 §14・ADR 0025・README「画面を組む」の手順の節 |
| IX. 小さく回す | 通過 | #316 の最後の PR。配布しない |
| X. 抽象は実需で | 通過 | `.ui-md` のつまみは、2 つ目の面（共有メモ）が実際に使う。`.ui-reader-preview` は 3 アプリが使う |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## Global Constraints

- **timer は要素層を読まない**（ADR 0023 決定 4・ADR 0025 決定 6）。部品層（`packages/ui/src/components/`）は読む。フォーカスの輪は timer の `base.css` の `:focus-visible`（`--signal`）が全要素に効くので、入力欄の写しが持つ `:focus` / `:focus-visible` の規則は消してよい
- 入力欄の地は timer の `base.css` が `--ui-field-bg: var(--panel-2)` で宣言済み。部品の `.ui-input` の字は 1rem（16px）
- 文字の大きさの寄せ方（Task 5）: Tailwind の写し `0.75rem`→`var(--font-size-xs)`・`0.875rem`→`var(--font-size-sm)`・`1rem`→`var(--font-size-base)`・`1.125rem` / `1.25rem`→`var(--font-size-lg)`。行の高さは `var(--timer-never-defined, calc(…))` をやめ、割り切れる数で書く（xs `1.35`・sm `1.45`・base `1.5`・lg `1.4`）。`--timer-never-defined` の仕掛けは基準との画素一致のためのもので、#316 は見た目を変えてよい（§1.2）。計器の大きな数字（`（計器の数字は段の外）`）はそのまま
- 押せる大きさ: **行の中の小さな操作は見た目を保ち、当たりだけを `::before` で 44×44 に広げる**（D7・`.lobby-row-icon-button` と同じ形）。広げた当たりは隣の当たりと重ねない
- 新しい文言は書体の base 層に収める（`apps/*/tests/*fits-font-base*`）。この PR は新しい UI の文言を足さない予定。足すなら `fonts.css` の unicode-range で測ってから決める
- `audit-timer-classes.mjs`: `className` は文字列リテラル・置換の無いテンプレート・それらを枝に持つ条件式だけ。定義だけで使われないクラスは落ちる（消した写しの CSS は規則ごと消す）
- `audit-ui-components.mjs`: 何も免除していない `ui-exempt:` は落ちる
- 作業ブランチ `feature/issue-316-pr4-timer-copies-and-targets`。サブエージェントは push・マージ・`git stash`・`git checkout -- <path>`・`git reset --hard` をしない。`e2e/inventory-316/` を消さない・コミットしない
- **E2E は 8787 と 18080 を使う。始める前に `ss -tlnp | grep -E ':(8787|18080)\b'` で空いていることを確かめ、塞がっていたら止まって報告する**（利用者の `pnpm dev` を止めない）
- **E2E 全件はルームの枠（100）ぎりぎり。この PR はルームを 1 つも足さない。** 新しい検査は既存のテストの流れ（すでに作ったルーム）の中に置く
- 変異の新しい ID は `m125` から。足す前に `ls scripts/mutations | sort -V | tail -3` で空きを確かめる
- 配布しない

## Review Focus

1. **入力欄を `.ui-input`（`width: 100%`）にしたあと、脇（22rem）の中の改名の行と代理追加の行で、ボタンが行の外へ押し出されない** → Task 1 の E2E: 1280 と 320 で改名の欄と代理追加の欄を開き、行の `scrollWidth <= clientWidth`、ページは横に溢れない
2. **共有メモ（暗い面）に `.ui-md` を当てたあと、リンク・コード・引用が読める**（部品の既定の枠 `--coal-soft` は暗い地で約 2:1） → Task 3 の E2E: リンク・インラインコード・引用・コードブロックを含むメモを書き、プレビューで `timer-a11y` のコントラストの走査が通る。枠の色が `--coal-soft` でないことも見る
3. **64rem 未満で、切った本文の中のリンクに Tab が止まらず、「続きを読む」とシートの中のリンクには止まる。64rem 以上では本文のリンクに止まる** → Task 4 の E2E（poker・timer・お題ツールの 3 つ）
4. **当たりを広げた操作（ステータスの「選択画面へ戻る」と「通知設定」、通知のヒントの「閉じる」）どうしが、320px で重ならない** → Task 6 の物差しが、全ての組の重なりを見る
5. **文字の段へ寄せたあと、320px で横に溢れる画面が無い**（`--font-size-sm` は 320px で約 13.5px、1920px で 15.2px。Tailwind の 14px 固定より広い幅で大きくなる） → Task 6 の物差しが全画面を 320・1920 で見る

## 見積もり

| 区分 | 1 回 | 回数 | 小計 |
|---|---|---|---|
| E2E 全件 | 約 10 分 | 3 回（Task 7・レビュー後・最終） | 30 分 |
| 関係する E2E だけ（`buttons`・`layout`・`invite-sheet-md`・`timer-a11y`・`topic`） | 約 4 分 | 計 12 回 | 48 分 |
| `pnpm test`・型・lint・検査の一式 | 約 10 分 | 2 回 | 20 分 |
| `node scripts/mutation-check.mjs` | 約 14 分 | 1 回（当たらないパッチがあれば +14 分。`RosterPanel.tsx` の m55〜m59 が当たらなくなりうる） | 14〜28 分 |
| 洗い出しの撮影（main と並べる・`screens.inv.ts`） | 約 1 分（2026-10-12 の実測は 50 秒） | 2 回 | 2 分 |
| **機械の待ち 合計** | | | **約 2〜2.2 時間** |
| **実作業** | | | **6〜9 時間** |

- **設計正本 §6 の見積もり（実作業 3〜5 時間）を超える。** 増えた理由は、P1（検査の射程）、P2（お題ツールにも同じ欠陥があった）、44px 未満が timer に 8 種類残っていたこと（2026-10-12 の撮影。`.ui-button` 以外の操作）
- **止まる条件**: 実作業が 12 時間を超える／機械の待ちが 4 時間を超える／物差しの直しが製品の直しと同じ量になったら、続ける前に利用者に報告する
- サブエージェントの戻りが 1 時間を超えたら Monitor で作業ツリーと transcript の更新を確かめる（15 分止まっていたら TaskStop して controller が引き取る）。E2E 全件と変異検査は controller が流す
- 比較と全件のログは `scratchpad/pr4-t<N>-<n>.log` に残し、controller が時間を足す
- Minor の指摘はまとめて Task 8 の後に直す

### 2026-10-12 の撮影（main `a94f3205`）で見えた 44px 未満（見た目の箱。`::before` で広げてあるものを除く）

| 画面 | 操作 | 見た目の箱 |
|---|---|---|
| timer 全画面 | ステータスの「選択画面へ戻る」（`.status-strip-back-link`） | 84×16 |
| timer 全画面 | ステータスの「通知設定」（`.notify-settings-trigger`） | 60×24 |
| timer ロビー | 通知のスイッチ 2 つ（`.notify-settings-switch-*`） | 36×20 |
| timer ロビー | 「試聴」（`.notify-settings-preview`） | 32×32 |
| timer セッション | 通知のヒントの「閉じる」（`.notify-hint-close`） | 16×16 |
| timer セッション | タブ「セッション」「ルーム」（`.tab`） | 高さ 38 |
| timer ロビー | 交代間隔のチップ（`.session-config-interval`） | 撮影では「詳細設定」が閉じていて測れていない（Task 6 で測る） |

`.ui-button--sm`（36px）・`.lobby-row-icon-button`（32px）・`.roster-panel-mini-button`（36px）は `::before` で 44px に広げてあり、今の `buttons.spec.ts` が測っている。

---

### Task 1: 入力欄を `.ui-input` へ（E9）

**Files:** `apps/timer-web/src/ui/components/PassphrasePanel.tsx`・`RosterPanel.tsx`・`SharedMemo.tsx`・`src/styles/passphrase-panel.css`・`roster-panel.css`・`shared-memo.css`・`e2e/support/a11y.ts`・`e2e/specs/buttons.spec.ts`

**Interfaces:**
- Produces: `expectFieldsAtLeast16px(page)` は、表示中の**文字を入れる欄全体**（`textarea`・`select`・`type` が `checkbox` / `radio` / `range` / `hidden` / `button` / `submit` / `color` / `file` 以外の `input`）を測る。部品のクラスの有無で絞らない

- [ ] **Step 1: 物差しを広げる**（`e2e/support/a11y.ts`）:

```ts
/** 文字を入れる欄（iOS Safari が 16px 未満でフォーカス時に画面を拡大する対象）。部品のクラスで絞らない —— 当て忘れた欄こそ測る */
const TEXT_FIELD = 'textarea, select, input:not([type="checkbox"], [type="radio"], [type="range"], [type="hidden"], [type="button"], [type="submit"], [type="color"], [type="file"])';

export async function expectFieldsAtLeast16px(page: Page): Promise<void> {
  const sizes = await page.locator(TEXT_FIELD).evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({
        name: el.getAttribute('aria-label') ?? el.id,
        px: Number.parseFloat(getComputedStyle(el).fontSize),
      })),
  );
  // 当たる欄が無いまま空回りすると、下の判定は 1 度も走らずに緑になる
  expect(sizes.length, '文字を入れる欄が画面に無い（判定が空振りする）').toBeGreaterThan(0);
  for (const s of sizes) expect(s.px, `${s.name} の字が 16px を下回る`).toBeGreaterThanOrEqual(16);
}
```

- [ ] **Step 2: timer の欄を測る場面を足す**（`buttons.spec.ts` の timer の describe。ルームは既存の 1 つ）。ロビー（390）でパスフレーズの欄を見て `expectFieldsAtLeast16px`。セッション（1280）で「代理参加者を追加」を開いた後、名簿の自分の行の「改名」を開いた後、共有メモの「編集」を押した後に、それぞれ `expectFieldsAtLeast16px`。改名の欄と代理追加の欄を開いた状態で、1280 と 320 のそれぞれで、行（欄の親）の `scrollWidth <= clientWidth` とページの横溢れなし（Review Focus 1）
- [ ] **Step 3: main の状態で流して赤を見る**: パスフレーズ・代理追加・改名（14px）と共有メモ（14px）が名指しで赤になる（`scratchpad/pr4-t1-1.log`）
- [ ] **Step 4:** 4 つの欄に `ui-input` を足す（`className="ui-input passphrase-panel-input"` など。`textarea` も `ui-input`）。写しの CSS からは見た目の宣言（枠・角丸・地・padding・字の大きさと行の高さ・字の色・`:focus` / `:focus-visible`）を消し、配置の宣言（`flex`・`min-width`・`min-height`）だけを残す。残る宣言が無くなったクラスは、`.tsx` からも CSS からも消す
- [ ] **Step 5:** 単体（`pnpm --filter @tasuki/timer-web test`）・型・`node scripts/audit-timer-classes.mjs`・`node scripts/audit-ui-components.mjs`・E2E `buttons.spec.ts`・`timer.spec.ts`・`timer-a11y.spec.ts`・`landing-design.spec.ts`・`topic.spec.ts`（広げた物差しが他の画面でも緑）
- [ ] **Step 6:** コミット `feat: timer の入力欄を部品の .ui-input にする（#316 PR 4）`

### Task 2: 招待の URL の行を `.ui-invite` へ・`Card` の理由

**Files:** `apps/timer-web/src/ui/components/InvitePanel.tsx`・`src/styles/invite-panel.css`・`src/ui/primitives.tsx`・`src/styles/primitives.css`・単体テスト

- [ ] **Step 1:** `InvitePanel` の参加 URL（`<p className="tabular invite-panel-url">`）と「参加 URL をコピー」を、poker の `RoomPage.tsx` と同じ組み方（`<div className="ui-invite"><span className="ui-invite-url">{roomUrl}</span><button …>`）にする。`user-select: all` は `.invite-panel-url` を `span` に残して持たせる（手で選んでコピーする経路・#76 F-1）。ルームコードの大きな数字と QR は timer 固有のまま（計器の数字・QR の白地の `ui-exempt:`）
- [ ] **Step 2:** `invite-panel.css` の `.invite-panel-url-action`・URL の字の大きさの写しを消す。`.invite-panel-button-label` と `.invite-panel-status` の字は Task 5 で段へ寄せる
- [ ] **Step 3:** `primitives.css` の `Card` の規則の前に、普通の注釈で理由を書く: `/* 計器の四隅の飾りを持つ timer 固有の面。部品の .ui-panel へは寄せない（#316 D8）。ui-exempt: は付けない —— 検査に当たる宣言が無く、免除の申告が落ちる */`
- [ ] **Step 4:** 単体テスト（コピーの成否の文言・`role="status"`）・E2E `invite-sharing.spec.ts`・`timer.spec.ts`。1280 と 320 でロビーの招待を撮って自分で見る（`scratchpad/pr4-invite-*.png`）
- [ ] **Step 5:** コミット `feat: timer の招待の URL の行を部品の .ui-invite にする（#316 PR 4）`

### Task 3: Markdown を `.ui-md-*` へ（`surface` を消す）

**Files:** `packages/ui/src/components/markdown.css`・`packages/ui/README.md`（部品層の表の Markdown の行）・`apps/timer-web/src/ui/components/Markdown.tsx`・`TopicCard.tsx`・`SharedMemo.tsx`・`src/styles/shared-memo.css`・`src/styles/markdown.css`（消す）・timer の CSS の読み込み元・単体テスト・`e2e/specs/timer-a11y.spec.ts`

**Interfaces:**
- Produces: `.ui-md` のつまみ `--ui-md-edge`（コード・引用の枠の色。既定 `--coal-soft`）・`--ui-md-link`（リンクの字の色。既定は字の色を継ぐ）。置く面が宣言し、部品は宣言しない（`field.css` の `--ui-field-bg` と同じ作法）
- Produces: `Markdown({ source, headingBase })`。`surface` は消える

- [ ] **Step 1: 先に E2E を書いて赤を見る**（`timer-a11y.spec.ts`。セッションの既存の流れの中で）: 共有メモに `[リンク](https://example.com)`・`` `code` ``・`> 引用`・コードブロックを含む本文を書いてプレビューに戻し、コントラストの走査を通す。続けて `.shared-memo-preview code` の `border-top-color` が `--coal-soft` の計算値と違うことを見る（Review Focus 2）。main の状態ではプレビューは `markdown-*` で描かれ `.ui-md` が無いので、「`.shared-memo-preview .ui-md` が 1 つある」の確認で赤になる（`scratchpad/pr4-t3-1.log`）
- [ ] **Step 2:** 部品につまみを足す（`markdown.css`。冒頭の注釈の「象牙の札の上に置く」を「既定の色は象牙の札の上で読める値。暗い面に置くときは面がつまみを宣言する」に書き換える）:

```css
/* つまみ（置く面が宣言する。ここでは宣言しない —— 宣言すると面の指定が継承に負けて黙って効かない）:
     --ui-md-edge  コード・引用の枠の色。既定 --coal-soft は象牙の上でしか読めない
     --ui-md-link  リンクの字の色。既定は字の色を継ぐ（下線で区別する） */
.ui-md-quote {
  border-left: 2px solid var(--ui-md-edge, var(--coal-soft));
}
.ui-md-code,
.ui-md-pre {
  border: 1px solid var(--ui-md-edge, var(--coal-soft));
}
.ui-md-link {
  color: var(--ui-md-link, inherit);
}
/* 共有メモは h2 の下に置くので `#` が h3 になる（`headingBase` 3）。 */
h3.ui-md-h {
  font-size: var(--font-size-base);
}
```

  既存の `.ui-md-quote`・`.ui-md-code`・`.ui-md-pre`・`.ui-md-link` の枠と色の宣言を、上の形に置き換える（宣言を 2 か所に残さない）
- [ ] **Step 3:** `Markdown.tsx` の `Surface`・`surface` の引数・`panel-*` の列を消し、`MARKDOWN_CLASS` を 1 列にする（`root: "ui-md"`・`code: "ui-md-code"`・`link: "ui-md-link"`・`h1`〜`h3: "ui-md-h"`・`pre: "ui-md-pre"`・`quote: "ui-md-quote"`・`ul: "ui-md-ul"`・`ol: "ui-md-ol"`・`p: "ui-md-p"`）。**強調・斜体は `className` を書かない**（今の `card` の空の `class=""` が消える）。コードブロックの `tabIndex={0}` は常に付ける（横へスクロールするのでキーボードで届かせる）。`TopicCard.tsx` の `surface="card"` を消す。冒頭の注釈から「#316 PR 4 で…消える」を消す
- [ ] **Step 4:** 共有メモの面がつまみと字を持つ（`shared-memo.css` の `.shared-memo-preview`）: `--ui-md-edge: var(--hairline-strong); --ui-md-link: var(--signal); color: var(--bone-muted); font-size: var(--font-size-sm); line-height: 1.6;`（P4）。`src/styles/markdown.css` を消し、読み込み元の `@import` も消す
- [ ] **Step 5:** 単体テスト: `Markdown` の根が `ui-md`・段落が `ui-md-p`・コードが `ui-md-code`。強調・斜体が `class` 属性を持たない（`hasAttribute('class') === false`）。`markdown-` で始まるクラスを持つ要素が 0（`querySelectorAll('[class*="markdown-"]')`）
- [ ] **Step 6:** 型・`audit-timer-classes`・`audit-ui-components`（`.ui-md` は 3 アプリが使うので死んだ部品にならない）・`pnpm --filter @tasuki/ui test`・E2E `timer-a11y.spec.ts`・`invite-sheet-md.spec.ts`・`layout.spec.ts`。1280 で共有メモのプレビューとお題の札を撮って自分で見る
- [ ] **Step 7:** コミット `feat: timer の Markdown を部品の .ui-md にし、暗い面のつまみを足す（#316 PR 4）`

### Task 4: 3 行に切った本文を Tab の行き先から外す（P2・3 アプリ）

**Files:** `packages/ui/src/components/reader.css`・`packages/ui/README.md`（読む面の節）・`apps/poker-web/src/components/CurrentTopic.tsx`・`apps/timer-web/src/ui/components/TopicCard.tsx`・`apps/topic-web/src/components/CurrentTopic.tsx`・`apps/topic-web/src/index.css`・各アプリの単体テスト・`e2e/specs/invite-sheet-md.spec.ts`・`layout.spec.ts`・`topic.spec.ts`

**Interfaces:**
- Produces: `.ui-reader-preview`（64rem 未満だけ見える 3 行の写し。`inert` を付けて置く）と `.ui-reader-body`（64rem 以上だけ見える本文。`role="region"`・`tabIndex={0}`）。読む面は両方を同じ親に並べる

- [ ] **Step 1: 先に E2E を書いて赤を見る**（`invite-sheet-md.spec.ts` の既存のルームの流れの中で。ルームを足さない）。お題の本文に段落を 6 つ置き、4 段落目に `[先のリンク](https://example.com/after)` を入れる:
  - 390: 「お題」の見出しから Tab を押し続け、`document.activeElement` が `a[href="https://example.com/after"]` に一度もならないまま「続きを読む」に着く。シートを開くと、シートの中のそのリンクには Tab で着く
  - 1280: 本文の region から Tab でそのリンクに着く
  - poker・timer・お題ツール（場のお題のタブ）の 3 つで同じことを見る。timer とお題ツールは、`layout.spec.ts` か `topic.spec.ts` の既存の流れのうち、お題を掲げる所に置く
  - main の状態では 390 で切った本文の中のリンクに Tab が止まり、赤になる（`scratchpad/pr4-t4-1.log`）
- [ ] **Step 2:** 部品を分ける（`reader.css`）。今の `.ui-reader-body` の 3 行の規則を `.ui-reader-preview` へ移し、`.ui-reader-body` は 64rem 以上だけ見せる:

```css
/* 64rem 未満の 3 行の写し。見せるだけで、中のリンクやコードは Tab の行き先にしない（画面は inert を付けて置く）。
   全文と、その中のリンクはシート（.ui-drawer）が持つ。縦の余白は padding でなく margin で取る（padding の帯に 4 行目の上端が覗くため） */
.ui-reader-preview {
  box-sizing: border-box;
  margin-block: var(--space-4);
  padding: 0 var(--space-5);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

/* 64rem 以上の本文（札の中でスクロールする）。64rem 未満では描かない —— 描くと切った中身が Tab の行き先に残る */
.ui-reader-body {
  display: none;
}

@media (width >= 64rem) {
  .ui-reader-preview {
    display: none;
  }
  .ui-reader-body {
    box-sizing: border-box;
    display: block;
    flex: 1 1 auto;
    min-height: 0;
    /* 本文の下端を角丸の高さぶん上げる（スクロールバーが角の外へはみ出さない） */
    margin-block: 0 var(--radius-lg);
    padding: var(--space-4) var(--space-5);
    overflow-wrap: anywhere;
    overflow-y: auto;
  }
}
```

  `.ui-reader .ui-reader-more` を 64rem 以上で隠す規則はそのまま残す
- [ ] **Step 3:** 3 アプリの読む面で、本文の直前に写しを置く: `<div className="ui-reader-preview" inert>{本文の Markdown}</div>`。写しには `role`・`aria-*`・`tabIndex` を付けない（`inert` は読み上げからも外す。狭い幅では見出しと「続きを読む」から全文に届く）。お題ツールは場のお題のタブと下書きのタブの両方（下書きはシートが無いが、書く欄に全文がある）。`apps/topic-web/src/index.css` の `.topic-reader-panel > .ui-reader-body` の 64rem 未満の余白は `.ui-reader-preview` に付け替える。各コンポーネントの冒頭の注釈から「64rem 未満は切って見せるだけだが、フォーカスは受けるので害は無い」の類を消し、写しを分けた理由を書く
- [ ] **Step 4:** 既存の E2E と単体テストの追随: `git grep -n 'ui-reader-body' -- e2e apps/*/src` で、狭い幅で `.ui-reader-body` を測っている所（`layout.spec.ts` の 3 行の高さ・`topic.spec.ts` の「3 行＋続きを読む」）を `.ui-reader-preview` に替える。同じ文が 2 回描かれるので、`getByText` が厳密モードで 2 つに当たる所は、region（`getByRole('region', …)`）かシートの中に絞る
- [ ] **Step 5:** 単体（3 アプリ）・型・`audit-ui-components`（`.ui-reader-preview` は 3 アプリが使う）・E2E `invite-sheet-md.spec.ts`・`layout.spec.ts`・`topic.spec.ts`・`poker-a11y.spec.ts`・`timer-a11y.spec.ts`。390 と 1280 で 3 アプリの札を撮って、見た目が変わっていないことを確かめる
- [ ] **Step 6:** コミット `fix: 3 行に切った読む面の中身を Tab の行き先から外す（#316 PR 4）`

### Task 5: 文字の段へ寄せる・検査の射程を広げる（P1・P3）

**Files:** `packages/ui/tests/typography-scale.test.mjs`・`scripts/mutations/m125-typography-scale-apps-out-of-scope.patch`・`scripts/mutation-check.mjs`・`apps/timer-web/src/styles/*.css`・`apps/poker-web/src/index.css`・`apps/landing/src/index.css`

- [ ] **Step 1: 射程を広げる**（`typography-scale.test.mjs`）。対象を `packages/ui/src` と `apps/*/src` の CSS にする。アプリは `apps/` の直下を読んで見つける（列挙しない）:

```js
const REPO = resolve(ROOT, '../..');
/** 検査する CSS の根。部品層と、各アプリの src（apps/ の直下を読んで見つける。アプリを足しても射程が自動で広がる）。 */
function cssRoots() {
  const apps = readdirSync(resolve(REPO, 'apps'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => resolve(REPO, 'apps', d.name, 'src'))
    .filter((p) => existsSync(p));
  return [SRC, ...apps];
}

/** 根の下の CSS を再帰で拾う（リポジトリの根からの相対パスで返す）。 */
function cssFiles() {
  return cssRoots()
    .flatMap((root) => readdirSync(root, { recursive: true }).map(String).filter((p) => p.endsWith('.css')).map((p) => join(root, p)))
    .map((abs) => relative(REPO, abs))
    .sort();
}
```

  import に `existsSync`（`node:fs`）と `relative`（`node:path`）を足す。`declarations()` と `fontShorthandOffenders()` は `join(REPO, rel)` で読む。`definedSteps()` は `SRC` のまま。射程そのものの自己テストを足す: `cssFiles()` が `apps/timer-web/src/styles/base.css` と `packages/ui/src/tokens/typography.css` の両方を含む
- [ ] **Step 2: main の状態で流して赤を見る**: timer の `#316 PR 4 で段へ寄せる` の写しは理由つきなので通るが、`.instrument-label` の `0.7rem`・`reset.css` の `inherit` / `1em` / `80%` / `75%`・`reset.css` の `font: inherit`（一括指定）・poker の 7 件・玄関の 2 件が名指しで赤になる（`scratchpad/pr4-t5-1.log`）
- [ ] **Step 3: timer を寄せる**（Global Constraints の対応表）: `git grep -n 'scale-exempt.*#316 PR 4' -- apps/timer-web/src` の全件を段のトークンにし、行の高さを割り切れる数にする。ほかに:
  - `.instrument-label` の `0.7rem` → `var(--font-size-xs)`（§11 の「添え書き・小さな印」。字間の広い大文字はこの段だけに使ってよい）
  - `.notify-settings-heading`（`<p>`。通知の状態の要約で、区画の見出しではない）→ `var(--font-size-base)`・600 のまま
  - まとめの見出しの行の高さ: `.summary-title-abort` の `calc(2 / 1.5)`（Tailwind の text-2xl の名残）→ `1.2`（`.summary-title` と揃える）。`.summary-banner` の `calc(2 / 1.5)` → `1.3`
  - `.brand-title`（P3）: `font-size: clamp(…); /* scale-exempt: 計器の意匠の題字（読み込み中・セッション喪失の h1）。5 段の xl では等幅の題字が詰まって見える（#316 §14） */`。`.driver-name-fluid`・計器の数字も同じ行に理由があることを確かめる
  - `reset.css` の preflight の逐語（`inherit`・`1em`・`80%`・`75%`）は同じ行に `/* scale-exempt: preflight の逐語（親の大きさに対する相対値で、段を作らない） */`。`font: inherit` は `font-family: inherit; font-size: inherit; font-weight: inherit; line-height: inherit;` などの個別の宣言に展開する（`font-feature-settings` などの preflight の他の宣言は既にある。展開しても計算値が変わらないことを単体で確かめる）
  - 寄せ終えたら `grep -rn 'var(--timer-never-defined' apps/timer-web/src` の残りを数え、残りが 0 なら `status-strip.css` 冒頭の注釈と `audit-timer-classes.mjs` の `--timer-never-defined` の宣言の禁止を消す。残るなら注釈を残りの用途に書き換える
- [ ] **Step 4: poker と玄関を寄せる**: `.room header h1` 1.6rem → `var(--font-size-xl)`（§11 の画面の見出し）・`.no-vote` 0.78rem → `var(--font-size-xs)`・`.stats dt` 0.72rem → `var(--font-size-xs)`・`.error-note` 0.85rem → `var(--font-size-sm)`・`.you-mark` 0.8em → `/* scale-exempt: 名前の横の小さな印。名前の字に対する相対値で、名前の段に付いて動く */`・`.stats dd` 2.3rem / 1.9rem → `/* scale-exempt: 結果の大きな数字（計器の数字は段の外） */`。玄関の `.wordmark` 2 件 → `/* scale-exempt: 題字（ブランドのロゴの代わり）。5 段の外 */`
- [ ] **Step 5:** `pnpm --filter @tasuki/ui test`（射程を広げた検査が緑）・各アプリの単体・型・書体の検査（`*fits-font-base*`）・E2E `timer-a11y.spec.ts`・`poker-a11y.spec.ts`・`landing-design.spec.ts`・`layout.spec.ts`。洗い出しの撮影を流し、main と 320・1280・1920 で並べて自分で見る（`scratchpad/inv-pr4-t5/`）
- [ ] **Step 6: 変異 m125**: `cssRoots()` が `[SRC]` だけを返す形のパッチを作り、`mutation-check.mjs` の一覧の末尾に足す:

```js
  {
    id: 125,
    label: "文字の大きさの検査の射程からアプリの CSS を落とす",
    patch: "m125-typography-scale-apps-out-of-scope.patch",
    pkg: "packages/ui",
    tests: ["tests/typography-scale.test.mjs"],
    note: "#316 PR 4。射程からアプリが落ちても、部品層だけを見て緑になる。射程の自己テストが捕まえる。",
  },
```

  `mutation-check.mjs` には 1 件だけ流す引数が無い（`--help` も全件を走らせるので使わない）。検出は Task 7 の全件で確かめる。ここでは手でパッチを当てて `node --test packages/ui/tests/typography-scale.test.mjs` が赤になることを見て、`git apply -R` で戻す
- [ ] **Step 7:** コミット `feat: timer の本文の字を 5 段へ寄せ、文字の大きさの検査をアプリへ広げる（#316 PR 4）`

### Task 6: 押せる大きさとはみ出しを全画面で合否に（E4・E5）・「設定」の行数の検査を作り直す

**Files:** `e2e/support/a11y.ts`・`e2e/specs/buttons.spec.ts`・`e2e/specs/layout.spec.ts`・`e2e/specs/timer.spec.ts`・`e2e/specs/landing.spec.ts`・`apps/timer-web/src/styles/{status-strip,notify-settings,notify-hint,tabs,session-config-panel}.css`

**Interfaces:**
- Produces: `expectTouchTargets(page: Page, label: string, minTargets: number, scope?: string): Promise<void>`・`expectScreenAcrossWidths(page: Page, label: string, minTargets: number, scope?: string): Promise<void>`（`e2e/support/a11y.ts`）

- [ ] **Step 1: 物差しを書く**（`e2e/support/a11y.ts`）。`buttons.spec.ts` の `scanButtons` の当たりの計り方（`::before` の広がり）を、全ての操作と `::after` に広げる:

```ts
/** 押せる操作。行内のリンク（文の中のリンク・Markdown の本文の中）は除く（設計正本 D9） */
const TARGET = 'button, a[href], summary, [role="tab"]';
const WIDTHS = [320, 768, 1280, 1920] as const;

interface Hit { name: string; left: number; top: number; right: number; bottom: number }

async function scanTargets(page: Page, scope: string): Promise<{ hits: Hit[]; wrapped: string[] }> {
  return page.evaluate(([scope, sel]) => {
    const shown = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && el.closest('[inert]') === null;
    };
    // 文の中のリンク: 親のブロックに自分以外の文字がある、または Markdown の本文の中
    const inline = (el: Element): boolean =>
      el.tagName === 'A' && (el.closest('.ui-md') !== null || (el.parentElement?.textContent ?? '').trim() !== (el.textContent ?? '').trim());
    const name = (el: Element): string => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24);
    const els = Array.from(document.querySelectorAll(`${scope} :is(${sel})`)).filter((el) => shown(el) && !inline(el));
    const hits = els.map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
      // 絶対配置の擬似要素（見た目を保って当たりだけ広げる形）は、その広がりを当たりに含める
      for (const which of ['::before', '::after'] as const) {
        const p = getComputedStyle(el, which);
        if (p.content === 'none' || p.position !== 'absolute') continue;
        const pl = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(p.left);
        const pt = r.top + parseFloat(cs.borderTopWidth) + parseFloat(p.top);
        left = Math.min(left, pl); top = Math.min(top, pt);
        right = Math.max(right, pl + parseFloat(p.width)); bottom = Math.max(bottom, pt + parseFloat(p.height));
      }
      return { name: name(el), left, top, right, bottom };
    });
    // 部品のボタンの字が 1 行に収まっているか。アイコン（svg）を数えないよう、文字のノードの行だけを数える
    const wrapped = Array.from(document.querySelectorAll(`${scope} .ui-button`)).filter(shown).filter((el) => {
      const tops = new Set<number>();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
        if ((n.textContent ?? '').trim() === '') continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const rect of Array.from(range.getClientRects())) tops.add(Math.round(rect.top / 4));
      }
      return tops.size > 1;
    }).map(name);
    return { hits, wrapped };
  }, [scope, TARGET] as const);
}

/** 当たりが 44×44 以上で、どの 2 つも重ならず、部品のボタンの字が折れない。`minTargets` は測った操作の数の下限（空振りの防止） */
export async function expectTouchTargets(page: Page, label: string, minTargets: number, scope = 'body'): Promise<void> {
  const { hits, wrapped } = await scanTargets(page, scope);
  expect(hits.length, `${label}: 測った操作が少ない（描かれる前に測っていないか）`).toBeGreaterThanOrEqual(minTargets);
  const small = hits.filter((h) => h.right - h.left < 44 - 0.01 || h.bottom - h.top < 44 - 0.01)
    .map((h) => `${h.name} ${Math.round(h.right - h.left)}x${Math.round(h.bottom - h.top)}`);
  expect(small, `${label}: 当たりが 44px 未満`).toEqual([]);
  const overlaps: string[] = [];
  for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) {
    const a = hits[i]!, b = hits[j]!;
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (x > 0.5 && y > 0.5) overlaps.push(`${a.name} / ${b.name}`);
  }
  expect(overlaps, `${label}: 当たりが重なる`).toEqual([]);
  expect(wrapped, `${label}: 字が 2 行に折れた部品のボタン`).toEqual([]);
}

/** 4 つの幅で、横に溢れず、押せる大きさを満たす。測り終えたら元の幅に戻す */
export async function expectScreenAcrossWidths(page: Page, label: string, minTargets: number, scope = 'body'): Promise<void> {
  const original = page.viewportSize();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `${label}（${width}）: 横に溢れる` }).toBe(true);
    await expectTouchTargets(page, `${label}（${width}）`, minTargets, scope);
  }
  if (original !== null) await page.setViewportSize(original);
}
```

  字の折れの判定の `Math.round(rect.top / 4)` は、和文と欧文の行の上端の数 px の差を同じ行に数えるためのもの。2 行目は少なくとも 1 行の高さ（約 18px）下にある
- [ ] **Step 2: 全画面に当てる**（ルームを足さない）:
  - `buttons.spec.ts`: 今の `expectScreen` の中の `expectHitTargets`（`.ui-button` だけ）を `expectScreenAcrossWidths` に置き換える。`expectMiniHitTargets` は広げた物差しに含まれるので消す（名簿の行の操作の数の下限 10 は、セッションの `minTargets` に入れる）。timer の流れに場面を足す: ロビーで「詳細設定」を開いた状態（交代間隔のチップ）・ステータスの「通知設定」を開いた状態・390 のセッションで「ルーム」のタブ・共有メモの編集・代理追加の欄を開いた状態・改名の欄を開いた状態。確認ダイアログは `scope` を `[role="dialog"]` にする（今と同じ）
  - `timer.spec.ts` のセッション喪失のテストの最後に、喪失の画面で `expectScreenAcrossWidths`
  - `landing.spec.ts` の履歴のテストで、履歴の画面に `expectScreenAcrossWidths`
  - 読み込み中の行き止まり（`Loading`）は E2E で作るのに同期サーバーを止める仕掛けが要るので測らない。ボタンは既定の大きさの `.ui-button`（44px）だけ、と注釈に書く
  - `layout.spec.ts` の `noteSmallTargets`（合否にしない注釈）と、その呼び出しを消す
- [ ] **Step 3: 今の状態で流して赤を見る**（Task 1〜5 の後）。赤の一覧を `scratchpad/pr4-t6-1.log` に残し、上の撮影の表（timer の 7 種類）と突き合わせる。表に無いものが出たら、直す前に controller に報告する
- [ ] **Step 4: 直す**（見た目を保ち、当たりだけ広げる）。対象は `.status-strip-back-link`・`.notify-settings-trigger`・`.notify-settings-switch-on` / `-off`・`.notify-settings-preview`・`.notify-hint-close`・`.session-config-interval`（Step 3 で 44px 未満だったら）。形は `.lobby-row-icon-button` の `::before` に合わせる:

```css
/* 見た目を保ち、押せる範囲だけ 44×44 に広げる（#316 D7・lobby.css の .lobby-row-icon-button と同じ形）。
   inset の % は左右が幅、上下が高さに対するので、縦長・横長の箱でも当たりは 44×44 の中央寄せになる。
   隣の当たりと重ならないことは buttons.spec.ts が見る */
.notify-hint-close {
  position: relative;
}
.notify-hint-close::before {
  content: "";
  position: absolute;
  inset: calc((100% - 2.75rem) / 2);
}
```

  `transform` で寄せない（`getComputedStyle(…).left` が変換前の値を返し、物差しの計算とずれる）。見た目の箱が 44px より大きい向き（「選択画面へ戻る」の幅 84px）は、`inset` が負にならず箱の幅のまま当たりになるので、`inset-inline` を `0` にした形（`inset: calc((100% - 2.75rem) / 2) 0`）にする。タブ（`.tab`）は見た目の高さを `min-height: 2.75rem` で 44px にする（タブは帯の中の大きな的で、見た目を保つ理由が無い）。重なりが出たら、親の `gap` を当たりの差の分だけ広げる
- [ ] **Step 5:** 「設定」の行数の検査（`layout.spec.ts` の `setLines`）を消す。字の折れは Step 1 の物差しが全ての部品のボタンで見る。消す理由（今の全幅の「設定」は折れる幅を持たず、壊しても赤にならない）をコミットの本文に書く
- [ ] **Step 6:** E2E `buttons.spec.ts`・`layout.spec.ts`・`timer.spec.ts`・`landing.spec.ts`・`timer-a11y.spec.ts`。320 と 1280 でステータスの帯と通知のヒントを撮って、見た目が変わっていないことを自分で見る
- [ ] **Step 7:** コミット `test: 押せる大きさとはみ出しを全画面・4 つの幅で合否にする（#316 PR 4）`

### Task 7: 破壊検証・CI 一式・変異・撮影

- [ ] **Step 1: 破壊検証**（コミットしない。入る前に `git status --porcelain` が空であることを見る）:
  1. パスフレーズの欄の `ui-input` を外す → 16px の検査が赤
  2. 共有メモの面の `--ui-md-edge` を消す → Task 3 の枠の色の検査が赤
  3. poker の写しの `inert` を外す → Task 4 の Tab の検査が赤（timer とお題ツールでも 1 つずつ）
  4. `.ui-reader-body` の 64rem 未満の `display: none` を消す → Task 4 の Tab の検査が赤
  5. `.notify-hint-close::before` を消す → 押せる大きさが赤
  6. `.notify-settings-trigger` の当たりを `.status-strip-back-link` に重なる幅へ広げる → 重なりが赤
  7. ロビーのパスフレーズの「設定」に `width: 3rem` を当てる → 字の折れが赤
  8. 物差しの `inline` の判定を「全ての `a` を除く」に変える → `.status-strip-back-link` の 44px 未満が見えなくなることを、5 の赤が消えないことで確かめる（除き方が広すぎないか）

  それぞれ `git restore` で戻し、戻した後に緑を見る
- [ ] **Step 2:** CI 一式（`pnpm test`・型・lint・`node scripts/*.test.mjs` の自己テスト・`node scripts/audit-*.mjs`）・E2E 全件（controller が流す）・`node scripts/mutation-check.mjs`（全件検出。`RosterPanel.tsx` の m55〜m59 や読む面の変更で当たらなくなったパッチは、壊し方を変えずに当て直す。出力を `| head` で切らない）
- [ ] **Step 3:** 洗い出しの撮影を main と並べる（`e2e/inventory-316/screens.inv.ts`。timer の全画面 × 320・768・1024・1280・1920）。44px 未満の件数が timer で 0 になったことを `report.json` で数える（見た目の箱の数なので、`::before` で広げたものは残る。表と突き合わせる）
- [ ] **Step 4:** 直しがあればコミット `test: …（#316 PR 4）`

### Task 8: 文書と #316 の締め

- [ ] `packages/ui/README.md` の「画面を組む」に **「新しい画面や機能を足すときの手順」** の節を書く（§7.1）。手順: 器を選ぶ（`--prose` / 既定 / `--wide`）→ 区画に置く（操作の面と脇、読む物があれば読む面）→ ボタンの役割を決める（主・副・控え・危険）→ 主は並びに 1 つで最後 → 入力欄は `.ui-input` / `.ui-select`、招待は `.ui-invite`、長い文章は `.ui-reader`、Markdown は `.ui-md`（暗い面はつまみ）→ 文字は役割の段（§11）→ 320・1280 で確かめる（横に溢れない・押せる大きさ・主の操作が見える）→ 検査を流す（`node scripts/audit-ui-components.mjs`・`pnpm --filter @tasuki/ui test`・`buttons.spec.ts`）。**画面の列挙と数は書かない**。要素層を読まない画面（timer）は、要素層が持つ手当て（フォーカスの輪・`scroll-padding`・見出しの段）を自分で持つことも書く
- [ ] README の読む面の節を `.ui-reader-preview` と `.ui-reader-body` の 2 つに書き換える（写しは `inert`）。Markdown の行につまみ（`--ui-md-edge`・`--ui-md-link`）を書く。書体の大きさの節に「検査はアプリの CSS も読む」を書く（P1）
- [ ] 設計正本 §14「PR 4 で決めたこと（2026-10-12）」: P1〜P4 の判断と理由／D8 の `Card` は `ui-exempt:` でなく注釈（何も免除しない申告は落ちる）／お題ツールにも同じ Tab の欠陥があった／E9 の物差しを部品のクラスで絞らない形にした／押せる大きさの物差しの「行内のリンク」の除き方／「設定」の行数の検査を消した理由／受け入れた限界（読み込み中の行き止まりは E2E で測っていない・幅を 64rem をまたいで変えると本文の中のフォーカスと位置が失われる）
- [ ] ADR 0025 の実施状況に PR 4 の行（`D8（timer の写し）・D9（押せる大きさを全画面で合否）`）を足す。完了形の現況を書かない
- [ ] #316 本文の進み具合の PR 4 の行（PR 番号）。PR の本文で `Closes #316` を 1 回だけ使う（地の文に閉鎖キーワードと Issue 番号を並べない）
- [ ] `node scripts/check-links.mjs`・`node scripts/audit-plan-gate.mjs`。コミット `docs: 新しい画面を足す手順を README に書き、PR 4 の決定を残す（#316 PR 4）`

### 仕上げ

- [ ] 文脈を共有しない `/code-review` を **PR 番号を明示して**通す（採点が出るまで直さない）
- [ ] 利用者に Chrome の実物で見てもらう（timer のロビー・セッション・共有メモ・まとめ、3 アプリのお題の札を PC とスマホの幅で。字の大きさの変化を含む）
- [ ] マージ後: `e2e/inventory-316/` を消してよいか利用者に確かめる（#316 が閉じたら消す約束）
