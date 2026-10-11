# #316 PR 3: timer の器・段組み・ボタン・お題の読む面 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** timer の全画面に、PR 1・2 で部品層へ置いた器（`.ui-page` の 3 段）・段組み（`.ui-workspace`）・ボタン（`.ui-button`）・操作の並び（`.ui-actions`）・文字の段（§11）を当てる。お題は読む面（`.ui-reader`）にして脇の先頭へ置き、#314（お題が主役を押し下げる）を閉じる。

**Architecture:** `Stage` が画面ごとに器の段を受け取る。ロビーとセッションは `--wide` の器で、操作の面（左）と脇（右・22rem）に分ける。お題は脇の先頭の読む面にし、64rem 以上では高さに上限を付けて札の中でスクロールさせる。64rem 未満では 3 行で切ってシートに全文を出す。timer の `PrimaryButton` / `GhostButton` と大きさのクラスを消し、`.ui-button` の役割で書く。危険の役割（`--danger`）は timer が 2 画面目になるので部品へ戻す。

**Tech Stack:** CSS・React 19・Vitest・Playwright・postcss（検査）

**Spec:** [`docs/superpowers/specs/2026-10-08-responsive-layout-design.md`](../specs/2026-10-08-responsive-layout-design.md) の D1・D2・D4・D6・D7・D8・§9.2・§11・§12。PR 3 で決めたこと（下の「利用者の判断」）は Task 7 で設計正本 §13 に書く。ADR 0025 決定 4・5・7

## 利用者の判断（2026-10-11・すべて推奨どおり）

| # | 論点 | 判断 |
|---|---|---|
| Q1 | timer のお題の置き場 | **脇（右・22rem）の先頭に読む面 `.ui-reader` で置く。** 64rem 以上は高さに上限を付けて札の中でスクロールし、64rem 未満は 3 行で切って「続きを読む」でシートに全文を出す。ロビーもセッションと同じ置き方にする |
| Q2 | ロビーの段組み | 操作の面＝開始・セッションの設定・交代通知。脇（右）＝お題・参加者・招待・パスフレーズ。320px の横溢れ（B1）は行の操作の当たりを広げたうえで折り返しを直す |
| Q3 | 文字の大きさの寄せ方の範囲 | PR 3 では**見出し（§11 の役割）とボタンの字**（`.ui-button` への置き換えで消える）だけを寄せる。本文の text-sm / text-xs の写し（`scale-exempt: … #316 で段へ寄せる`）は PR 4 で寄せる。計器の大きな数字は段の外のままにし、注釈を書き換える |

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 器の幅・横溢れ・読む面・素のボタンの E2E を先に書いて main で赤を見る（Task 1〜3 の Step 1） |
| II. 技術選定は ADR を通す | 通過 | 新しい依存を足さない。ADR 0025 の実施状況に PR 3 の行を足す |
| III. 揮発インメモリと単純運用 | 該当なし | 同期サーバーに触れない |
| IV. 境界の型安全 | 該当なし | 境界検証に触れない |
| V. 実画面検証 | 通過 | 撮影を controller が見て、利用者に Chrome の実物で見てもらう |
| VI. 依存は内向き | 該当なし | `packages/ui` は依存を持たないまま |
| VII. 検査は壊して確かめる | 通過 | Task 6 の破壊検証と変異検査 |
| VIII. 記録が正本 | 通過 | 設計正本 §13・ADR 0025・README「画面を組む」 |
| IX. 小さく回す | 通過 | #316 の PR 3。配布しない |
| X. 抽象は実需で | 通過 | `--danger` は timer が 2 画面目（ADR 0022 決定 2・死んだ部品の検査） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## Global Constraints

- **timer は要素層を読まない**（ADR 0023 決定 4・ADR 0025 決定 6）。要素層の h2・`scroll-padding`・`:focus-visible` は timer に届かないので、要るものは timer の画面の CSS に書く
- 器: ロビー・セッション＝`ui-page ui-page--wide`（96rem）／履歴＝`ui-page`（72rem）／まとめ・読み込み中・セッション喪失＝`ui-page ui-page--prose`（40rem）。画面の内側の最大幅（`summary.css` の 28rem・`history.css` の 42rem・`loading.css` / `session-lost.css` の 32rem）は消し、器に任せる
- 幅の段の境目は `40rem`・`64rem`・`90rem` だけ（範囲構文）。timer に残る `48rem` 7 か所は近い段（`40rem`）へ寄せ、`ui-exempt: #316 PR 3 で段へ寄せる` を 0 件にする
- ボタンの役割: `.ui-button`（主・画面の並びに 1 つ・最後）／`--secondary`／`--quiet`（戻る・閉じる）／`--danger`（取り消せない操作・朱の枠）。大きさ `--sm` / 既定 / `--lg`。**主は 1 つの並び（`.ui-actions`）に 1 つまで**（ADR 0025 決定 5）
- 危険（`--danger`）の色: 暗い面の上は字 `--rose-bright`（felt-800 上 4.95:1）・枠 `--rose-edge`・ホバー `--rose-tint`。象牙の札の上は字と枠 `--card-back`（PR 2 のお題ツールの値）
- ボタンの形をしない操作は `.ui-button` にしない: タブ（`role="tab"`）・スイッチ（`role="switch"`）・交代間隔のチップ（`.session-config-interval`）・行のアイコン（`.lobby-row-icon-button`・`.roster-panel-mini-button`）・通知のヒントの閉じる（`.notify-hint-close`）・ステータスの「通知」（`.notify-settings-trigger`）・試聴（`.notify-settings-preview`）。**行の中の小さな操作は見た目を保ち、当たりだけ 44px に広げる**（`::before` で上下左右へ・D7）。それ以外の 44px 未満は PR 4 で合否にするときに直す
- 文字の段（§11）を timer の画面のクラスで当てる: 区画の見出し（`.section-header-title` などの h2）＝ `--font-size-lg`・700・`--bone`・字間 0・大文字にしない／小見出し（h3）＝ `--font-size-base`・700
- 新しい文言は書体の base 層に収める（`apps/timer-web/tests/*fits-font-base*`）。「続きを読む」「閉じる」は poker と同じ文言
- `audit-timer-classes.mjs`: `className` は文字列リテラル・置換の無いテンプレート・それらを枝に持つ条件式だけ。定義だけで使われないクラスは落ちる
- 作業ブランチ `feature/issue-316-pr3-timer`。サブエージェントは push・マージ・`git stash`・`git checkout -- <path>`・`git reset --hard` をしない。`e2e/inventory-316/` を消さない・コミットしない
- **E2E は 8787 と 18080 を使う。始める前に `ss -tlnp | grep -E ':(8787|18080)\b'` で空いていることを確かめ、塞がっていたら止まって報告する**（利用者の `pnpm dev` を止めない）
- E2E 全件はルームの枠（100）に近い。新しい spec はルームをまとめて作る（`buttons.spec.ts` の冒頭の注釈）
- 配布しない

## Review Focus

1. **長いお題（40 段落）でも、タイマーが最初の画面に入る**（#314 の本体）→ Task 2 の E2E: 1280×900 と 390×844 で、セッションを開いた直後の `role="timer"` の下端が画面の高さ以下
2. **象牙の札の上でお題の本文が読める**（timer の `Markdown` は暗い面の色 `--bone` で描く。札へ載せると字が消える）→ Task 2 で札の上は `.ui-md-*` で描き、`timer-a11y.spec.ts` のコントラストの走査がお題を掲げた状態で通る
3. **40rem 未満でセッションの下端の帯が Tab の行き先を隠さない**（timer は要素層の `scroll-padding` を読まない）→ Task 4b の E2E: 390 で Tab で「完成!」まで辿り、帯と重ならない
4. **参加者のパネルの内側スクロールをやめた後、長い名前（30 字）と 6 人の行で、22rem の脇から行の操作がはみ出さない**（B2）→ Task 4b の E2E: 各行の `scrollWidth <= clientWidth`、ページの横溢れなし
5. **確認ダイアログの危険の確定ボタンが暗い面の上で AA を満たし、取り消しへ最初のフォーカスが来る**（既存の挙動を保つ）→ Task 4a の単体テスト（最初のフォーカス）と Task 6 の a11y の走査（ダイアログを開いた状態）

## 見積もり

| 区分 | 1 回 | 回数 | 小計 |
|---|---|---|---|
| E2E 全件 | 約 10 分 | 3 回（Task 6・レビュー後・最終） | 30 分 |
| timer の E2E だけ（`timer*.spec.ts`・`layout`・`buttons`） | 約 4 分 | 各 Task で 1〜2 回・計 8 回 | 32 分 |
| `pnpm test`・型・lint・検査の一式 | 約 10 分 | 2 回 | 20 分 |
| `node scripts/mutation-check.mjs` | 約 14 分 | 1 回（当たらないパッチがあれば +14 分） | 14〜28 分 |
| 洗い出しの撮影（main と並べる） | 約 5 分 | 2 回 | 10 分 |
| **機械の待ち 合計** | | | **約 1.8〜2 時間** |
| **実作業** | | | **6〜10 時間**（設計正本 §6） |

- **止まる条件**: 実作業が 12 時間を超える／機械の待ちが 4 時間を超える／検査や物差しの直しが製品の直しと同じ量になったら、続ける前に利用者に報告する
- サブエージェントの戻りが 1 時間を超えたら Monitor で作業ツリーと transcript の更新を確かめる（15 分止まっていたら TaskStop して controller が引き取る）
- 比較と全件のログは `scratchpad/pr3-t<N>-<n>.log` に残し、controller が時間を足す
- Minor の指摘はまとめて Task 7 の後に直す

---

### Task 1: 器（`Stage` の段）と 48rem の寄せ

**Files:** `apps/timer-web/src/ui/primitives.tsx`・`src/App.tsx`・`src/styles/{primitives,summary,history,loading,session-lost,invite-panel,session,switch-alert}.css`・`e2e/specs/layout.spec.ts`・timer の単体テスト

**Interfaces:**
- Produces: `Stage({ page, children }: { page: "prose" | "default" | "wide"; children: React.ReactNode })`。`page` は必須（既定値を置かない。新しい画面を足す人に段を選ばせる）

- [ ] **Step 1: 先に E2E を書いて赤を見る**（`layout.spec.ts` の `timer のセッションは脇を右に持つ` の describe に足す。ルームは既存の 1 つを使い回す）
  - 1920×1080 でロビーの器の外寸が `96 * REM`（1536px）、1280×900 でロビーとセッションの器の内側が 1152px 以上（E3）
  - 1280×900 でまとめ（「完成!」→ 確認）の器の外寸が `40 * REM`（640px・U3）
  - timer の器は `<main>` ではなく `Stage` の `div` に当たる。`pageBox` を `.ui-page` を引数で受ける形に広げる（`main.ui-page` 固定をやめる）
  - main で流して、ロビー 1536 と まとめ 640 が赤になることを見る（ログ `scratchpad/pr3-t1-1.log`）
- [ ] **Step 2:** `Stage` に `page` を足し、`className` を条件式のリテラルで書く（`audit-timer-classes` の規則）:

```tsx
/** 全画面共通の舞台。器の段（`.ui-page` の 3 段・#316 D2）は画面の用途で選ぶ。 */
export function Stage({ page, children }: { page: "prose" | "default" | "wide"; children: React.ReactNode }) {
  return (
    <div className="instrument-stage stage">
      <div
        className={
          page === "wide"
            ? "ui-page ui-page--wide stage-inner"
            : page === "prose"
              ? "ui-page ui-page--prose stage-inner"
              : "ui-page stage-inner"
        }
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3:** `App.tsx` で画面ごとに段を決める。`renderBody` の分岐から段を引く小さな関数 `pageOf(...)` を置き、`<Stage page={pageOf(...)}>` にする。対応: 履歴 `default`／セッション喪失 `prose`／ロビー・セッション `wide`／まとめ（celebration）`prose`／読み込み中 `prose`
- [ ] **Step 4:** 画面の内側の最大幅を消す（`summary.css` の `max-width: 28rem`・`history.css` の 42rem・`loading.css` と `session-lost.css` の 32rem）。中央寄せの `margin-inline: auto` も器と重なるなら消す
- [ ] **Step 5:** `48rem` の 7 か所（`grep -rn '48rem' apps/timer-web/src/styles`）を `40rem` へ寄せ、`ui-exempt: #316 PR 3 で段へ寄せる` を消す。`summary.css` の `(40rem <= width < 48rem)` は器が 40rem になれば要らないはずなので、撮影で確かめてから消す。`grep -rn 'ui-exempt: #316 PR 3' apps/timer-web/src` が 0 件
- [ ] **Step 6:** `pnpm --filter @tasuki/timer-web test`・型・`node scripts/audit-ui-components.mjs`・`node scripts/audit-timer-classes.mjs`・E2E `layout.spec.ts`・`timer.spec.ts` が緑
- [ ] **Step 7:** コミット `feat: timer の器を画面ごとの段にし、幅の境目を段へ寄せる（#316 PR 3）`

### Task 2: お題の読む面（#314）

**Files:** `apps/timer-web/src/ui/components/TopicCard.tsx`・`components/Markdown.tsx`・`src/styles/topic-card.css`・`src/ui/Session.tsx`・`src/ui/Lobby.tsx`・単体テスト・`e2e/specs/layout.spec.ts`

**Interfaces:**
- Produces: `Markdown` に `surface?: "panel" | "card"`（既定 `"panel"`）。`"card"` のときは部品の `.ui-md`・`.ui-md-*` のクラスで描く（象牙の札の上の色）。`"panel"` は今の `markdown-*`（共有メモ）。クラスの対応表は `_CLASS` で終わる定数に置く（`audit-timer-classes` の規則）。PR 4 で `markdown-*` を `.ui-md-*` へ寄せたら `surface` ごと消える
- Produces: `TopicCard` は脇の先頭に置かれる前提の読む面。`TOPIC_READ_MORE = "続きを読む"`・`TOPIC_CLOSE = "閉じる"` を書き出す（書体の検査が拾う）

- [ ] **Step 1: 先に E2E を書いて赤を見る**（`layout.spec.ts`。お題は `setTopic` で 40 段落の `LONG_BODY` を掲げる。ルームは Task 1 のものを使う）
  - 1280×900: セッションを開いた直後、`role="timer"` の下端 ≤ 900（Review Focus 1）。お題の札（`region` 名「お題」）が脇（`.ui-workspace-side`）の中で、本文（`.ui-reader-body`）の `scrollHeight > clientHeight`。ページの高さは札の本文の長さで伸びない（説明が 1 段落のときと 40 段落のときで `document.documentElement.scrollHeight` の差が 1px 以下）
  - 390×844: `role="timer"` の下端 ≤ 844。札の本文は 3 行で切れ（行の高さ × 3 + 1 以下）、「続きを読む」でシート（`dialog.ui-drawer`）が開き、Esc で閉じてフォーカスが「続きを読む」へ戻る
  - ロビーも 1280 で札が脇の中にあり、「セッションを開始」の上端が札の上端より上か同じ（主役が押し下げられない）
  - main で流して赤を見る（`scratchpad/pr3-t2-1.log`）
- [ ] **Step 2:** `Markdown.tsx` に `surface` を足す。単体テスト: `surface="card"` で根が `ui-md`、段落が `ui-md-p`、コードが `ui-md-code` を持ち、`markdown-*` を持たない。既定では今のクラス
- [ ] **Step 3:** `TopicCard.tsx` を poker の `CurrentTopic.tsx` と同じ構造にする（`Card` と `SectionHeader` をやめる）:
  - `<section className="ui-reader timer-topic" aria-labelledby=…>` → 見出し行（h2「お題」・h3 タイトル）→ `.ui-reader-body`（`role="region"`・`tabIndex={0}`・`<Markdown surface="card" headingBase={4}>`）→ 「続きを読む」（`ui-button ui-button--secondary ui-button--sm ui-reader-more`）→ `<dialog className="ui-drawer">`（見出し行に h3 と「閉じる」・本文）
  - フォーカスを「続きを読む」へ戻す経路は `onClose` の 1 本（poker と同じ）
  - 単体テスト: 本文が空なら「続きを読む」とシートを描かない。h2・h3 の段の並び
- [ ] **Step 4:** `topic-card.css`: h2 と h3 の文字の段（Global Constraints）を `.timer-topic` の下に書く（timer は要素層の h2 を読まない）。字の色は札の `--coal` を継ぎ、h2 は poker と同じ `--coal-soft`。**64rem 以上で札の高さに上限** `max-height: min(24rem, 45dvh)`（部品の `100dvh - 14rem` は脇がお題だけの画面の式で、timer は札の下に参加者が続く）。部品の `max-height` を上書きするので `.ui-reader.timer-topic`（(0,2,0)）で書く。`scale-exempt` の付いた `topic-card-title` の写しは消す
- [ ] **Step 5:** 置き場を変える: `Session.tsx` の `sessionPanel` 先頭の `{topic && <TopicCard … />}` を `.ui-workspace-side` の先頭へ。`Lobby.tsx` は Task 3 で脇を作るときに移すので、ここではセッションだけ（ロビーの E2E は Task 3 で緑になる）
- [ ] **Step 6:** 単体・型・`audit-timer-classes`・書体の検査・E2E `layout.spec.ts`・`timer-a11y.spec.ts`（お題を掲げた状態のコントラストの走査・Review Focus 2）・`timer.spec.ts`
- [ ] **Step 7:** 1280・390 でセッション（お題が長い）を撮り、自分で見る（`scratchpad/pr3-topic-*.png`）
- [ ] **Step 8:** コミット `feat: timer のお題を脇の読む面にし、主役を押し下げない（#316 PR 3・#314）`

### Task 3: ロビーの段組みと 320px の横溢れ（B1）

**Files:** `apps/timer-web/src/ui/Lobby.tsx`・`src/styles/lobby.css`・`src/styles/passphrase-panel.css`・`e2e/specs/layout.spec.ts`

- [ ] **Step 1: 先に E2E を書いて赤を見る**: 320×640 でロビー（参加者 2 人・パスフレーズの欄あり）とセッションのページが横に溢れない（E4・`expectNoHorizontalOverflow`）。1280 でロビーの脇が右・22rem で、操作の面に「セッションを開始」、脇に「参加者」の見出しがある。main で赤（B1）を見る
- [ ] **Step 2:** `Lobby.tsx` を `<div className="ui-workspace ui-workspace--side-end">` で組む。DOM の順（狭い幅で見せたい順）: 操作の面（開始 → セッションの設定 → 交代通知）→ 脇（お題 → 参加者 → 招待 → パスフレーズ）
- [ ] **Step 3:** B1 を直す: 参加者の行は名前とバッジの行と操作の行に分けて折り返す（`.lobby-participant` を `flex-wrap: wrap`・操作は `margin-inline-start: auto`）。パスフレーズの入力と「設定」は 40rem 未満で縦に積む（ボタンの字が「設／定」に折れない）
- [ ] **Step 4:** 行のアイコン（`.lobby-row-icon-button`）は見た目を保ち、当たりを `::before` で 44×44 に広げる（隣の当たりと重ならないよう、行の操作の `gap` を当たりの差の分取る）
- [ ] **Step 5:** 単体・型・E2E `layout.spec.ts`・`timer.spec.ts`・`timer-a11y.spec.ts`。1280・390・320 でロビーを撮って自分で見る
- [ ] **Step 6:** コミット `feat: timer のロビーを操作の面と脇に分け、狭い幅の横溢れを直す（#316 PR 3）`

### Task 4a: ボタンを役割の部品へ（危険を部品へ戻す）

**Files:** `packages/ui/src/components/button.css`・`apps/topic-web/src/components/CurrentTopic.tsx`・`apps/topic-web/src/index.css`・`apps/timer-web/src/ui/primitives.tsx`・`src/styles/primitives.css`・timer の各画面と部品の `.tsx` と CSS・単体テスト

- [ ] **Step 1:** 部品に `--danger` を置く（`button.css` の役割の節の最後・象牙の札の上の節にも）:

```css
/* 取り消せない操作（朱の枠）。地は持たない。暗い面の上で rose-bright は felt-800 上 4.95:1 */
.ui-button--danger {
  border-color: var(--rose-edge);
  background: transparent;
  box-shadow: none;
  color: var(--rose-bright);
}

.ui-button--danger:where(:hover:not(:disabled)) {
  background: var(--rose-tint);
}

.ui-button--danger:where(:active:not(:disabled)) {
  box-shadow: none;
}
```

  象牙の札の上: `.ui-reader .ui-button--danger, .ui-drawer .ui-button--danger { border-color: var(--card-back); color: var(--card-back); }`。お題ツールの「場から下げる」を `ui-button ui-button--danger` にし、`.topic-reader-foot .topic-danger` の 2 規則と注釈を消す
- [ ] **Step 2:** `primitives.tsx` の `PrimaryButton`・`GhostButton` と `primitives.css` の `.signal-button`・`.ghost-button` を消し、呼び出し側を `<button type="button" className="ui-button …">` で書く。大きさで付けたクラス（`session-button-sm` / `-xs`・`self-driver-toggle-button-xs` / `-sm`・`passphrase-panel-button`・`summary-button`・`lobby-row-action` などの見た目の写し）は消す。配置（幅・並び）だけのクラスは残す。役割の対応:

| 画面・部品 | ボタン | 役割 |
|---|---|---|
| ロビー | セッションを開始 | 主 `--lg` |
| ロビー | ランダム | `--secondary --sm` |
| ロビー（自分の行） | 列から外れる・ドライバーに加わる | `--secondary --sm` |
| ロビー（自分の行） | ルームから抜ける | `--quiet --sm` |
| セッション | 再開・一時停止（どちらか一方が出る） | 主（並びの最後） |
| セッション | スキップ・時間リセット | `--secondary` |
| 終える区画 | 完成! | 主（並びの最後） |
| 終える区画 | 途中で終える・最初から | `--danger`（`.ui-actions-start` に入れて左へ離す・U2・B6） |
| 確認ダイアログ | 取り消し | `--secondary` |
| 確認ダイアログ | 確定 | `confirmIntent` が `primary` なら主、`danger` なら `--danger` |
| 自分のドライバーの盤 | 加わる・一時離脱・復帰・外れる | `--secondary --sm` |
| 自分のドライバーの盤 | ルームから抜ける | `--quiet --sm` |
| 参加者のパネル | 代理追加（開閉）・追加 | `--secondary --sm` |
| 共有メモ | 編集・プレビューの切り替え | `--secondary --sm`（選んだ側は `aria-pressed`） |
| 招待 | ルームコードをコピー・参加 URL をコピー | `--secondary --sm` |
| パスフレーズ | 設定・解除 | `--secondary --sm` |
| ルームのタブ | ルームから抜ける | `--quiet --sm` |
| まとめ | 新しいセッション | 主 `--lg` |
| まとめ | 記録を保存 | `--secondary` |
| 履歴 | 戻る | `--quiet --sm` |
| 履歴 | 削除 | `--danger --sm` |
| 読み込み中 | 再読み込み | 主 |
| 読み込み中 | 戻る | `--quiet` |
| セッション喪失 | 新しいセッション | 主 |
| セッション喪失 | 履歴を見る | `--secondary` |

  ボタンの形をしない操作（Global Constraints の一覧）はクラスを変えない。アイコンと字の並び（`*-label` の span）は `.ui-button` が `inline-flex` なので、span の `display: inline-flex; gap` だけ残す
- [ ] **Step 3:** 並びを `.ui-actions` で組む: まとめ（保存 → 新しいセッション）・読み込み中（戻る → 再読み込み）・セッション喪失（履歴 → 新しいセッション）・確認ダイアログ（取り消し → 確定）。並びの中で主は最後
- [ ] **Step 4:** 単体テスト（クラス名で取っているものは役割の名前で取る形へ）・確認ダイアログの最初のフォーカスが取り消しにある（既存のテストが無ければ足す・Review Focus 5）・型・`audit-timer-classes`・`audit-ui-components`（死んだ部品が 0 件。`--danger` は timer とお題ツールの 2 アプリ）・`topic.spec.ts`・`timer*.spec.ts`
- [ ] **Step 5:** コミット `feat: timer のボタンを役割の部品に揃え、危険の役割を部品へ戻す（#316 PR 3）`

### Task 4b: セッションの並び（下端の帯・B2・B6）と片付け

**Files:** `apps/timer-web/src/ui/Session.tsx`・`components/EndSessionZone.tsx`・`components/RosterPanel.tsx`・`components/TeamOrbit.tsx`・`src/styles/{session,end-session-zone,roster-panel,team-orbit,notify-settings,shared-memo,base}.css`・単体テスト・`e2e/specs/buttons.spec.ts`

- [ ] **Step 1: 先に E2E を書いて赤を見る**（`buttons.spec.ts` に timer の describe を足す。ルームは 1 つ）
  - 1280: 参加者 6 人（うち 1 人は 30 字の名前）のセッションで、参加者の一覧に内側のスクロールが無く（`scrollHeight <= clientHeight`）、各行の `scrollWidth <= clientWidth`（Review Focus 4）
  - 390: セッションの操作（時間リセット・スキップ・一時停止）の並びが `.ui-actions--dock` で、先頭で画面の下端に接し、最下部で中身を隠さない（`expectDockPinned`）。Tab で「完成!」まで辿って帯と重ならない（`expectFocusNotHiddenByDock`・Review Focus 3）
  - main で赤を見る
- [ ] **Step 2:** セッションの操作を `<div className="ui-actions ui-actions--dock session-actions">` にし、順を「時間リセット → スキップ → 一時停止／再開」にする（主が最後）。帯は計器のカードの最後の子なので、カードの範囲の中で留まる
- [ ] **Step 3:** 終える区画を `.ui-actions` にし、`.ui-actions-start` に「途中で終える」「最初から」、最後に「完成!」。`end-session-zone.css` の朱の塗り・翡翠の塗り（`.end-session-zone-complete` / `-reset`）を消す
- [ ] **Step 4:** timer は要素層の `scroll-padding` を読まないので、`base.css` に 40rem 未満の `html { scroll-padding-block-end: 6rem; }` を書く（要素層 `reset.css` と同じ値・理由を注釈に）
- [ ] **Step 5:** B2: `RosterPanel` の `scrollable` を消す（使うのはセッションの 2 か所だけ。内側のスクロールをやめる）。行の操作が 22rem で 1 段に収まらないときは、名前の行と操作の行に分けて折り返す（Task 3 のロビーと同じ形）。`.roster-panel-mini-button` は見た目を保ち当たりを 44px に
- [ ] **Step 6:** 片付け（D8）: `transition-property` の `--tw-gradient-*` 4 か所を消す（`grep -rn 'tw-gradient' apps/timer-web/src` が 0 件）。`TeamOrbit` の 6 枝の三項を、共通のクラス＋`data-skipped`（`RotationLineup` と同じ）＋現・次の 2 枝に分け、`.team-orbit-avatar-skipped` を `[data-skipped]` の属性選択子へ
- [ ] **Step 7:** 単体・型・`audit-timer-classes`・E2E `buttons.spec.ts`・`timer*.spec.ts`・`layout.spec.ts`。1280・390 でセッションを撮って自分で見る（`scratchpad/pr3-session-*.png`）
- [ ] **Step 8:** コミット `feat: timer のセッションの主の操作を下端の帯にし、終える操作を危険の役割にする（#316 PR 3）`

### Task 5: 見出しの文字の段（§11）

**Files:** `apps/timer-web/src/styles/primitives.css`・`lobby.css`・ほか見出しの写しを持つ CSS

- [ ] **Step 1:** `.section-header-title`（区画の h2）を §11 の区画の見出しへ（Global Constraints）。`.lobby-notify-heading` も区画の見出しなら同じ段に揃える（要素が `div` のままなら `SectionHeader` に寄せて h2 にする）
- [ ] **Step 2:** `scale-exempt` の注釈を数え直す: 見出しとボタンの字の写しは消えている／本文の text-sm・text-xs は `（#316 PR 4 で段へ寄せる）` に書き換える／計器の大きな数字（text-2xl〜7xl）は `（計器の数字は段の外）` に書き換える。`grep -rn 'scale-exempt.*#316 で段へ寄せる' apps/timer-web/src` が 0 件
- [ ] **Step 3:** 書体の検査（`pnpm --filter @tasuki/ui test` の文字の大きさ 5 段・timer の書体の検査）・E2E `timer-a11y.spec.ts`。1280・320 でロビーを撮り、見出しが狭い幅で崩れないことを見る
- [ ] **Step 4:** コミット `feat: timer の見出しを文字の段に揃える（#316 PR 3）`

### Task 6: 検査（E2E）と破壊検証

**Files:** `e2e/specs/buttons.spec.ts`・`e2e/specs/layout.spec.ts`

- [ ] **Step 1:** `buttons.spec.ts` の主の判定（`isPrimary`）から `--danger` も外す（いまは `--secondary` / `--quiet` だけ）。timer の許可一覧を足す（Global Constraints のボタンの形をしない操作）。timer の画面（390 のロビー・セッション・確認ダイアログを開いた状態・まとめ）で `expectScreen`。当たりの検査は `.ui-button` だけが対象（行のアイコンの 44px は PR 4 で合否）
- [ ] **Step 2: 破壊検証**（コミットしない。入る前に `git status --porcelain` が空であることを見る）: ① 「途中で終える」の `--danger` を外す → 主の数が赤 ② セッションの操作の並びから `--dock` を外す → 帯の検査が赤 ③ `base.css` の `scroll-padding` を消す → Tab の検査が赤 ④ `.timer-topic` の `max-height` を消す → 主役の位置の検査（1280）が赤 ⑤ `Markdown` の `surface="card"` を外す → a11y の走査が赤 ⑥ ロビーの行の `flex-wrap` を消す → 320 の横溢れが赤。それぞれ `git restore` で戻し、戻した後に緑を見る
- [ ] **Step 3:** CI 一式（`pnpm test`・型・lint・`node scripts/*.test.mjs` の自己テスト）・E2E 全件・`node scripts/mutation-check.mjs`（全件検出。`RosterPanel`・`History`・`Loading` の既存パッチ m55〜m59・m63・m102 が当たらなくなったら、壊し方を変えずに当て直す。`| head` で切らない）
- [ ] **Step 4:** 洗い出しの撮影を main と並べる（`e2e/inventory-316/` の spec。timer の全画面 × 320・768・1280・1920）
- [ ] **Step 5:** コミット `test: timer の素のボタン・下端の帯・お題の位置を E2E で見る（#316 PR 3）`

### Task 7: 文書

- [ ] 設計正本 §13「PR 3 で決めたこと（2026-10-11）」: Q1〜Q3 の判断と理由／timer の札の上の Markdown は `surface="card"` で部品の `.ui-md-*` を使う（PR 4 で寄せたら消える）／timer の読む面の高さの上限（`min(24rem, 45dvh)`）が部品と違う理由／主は「並びに 1 つ」（ADR 0025 決定 5）でセッションには操作の並びと終える区画の 2 つの主がある
- [ ] `packages/ui/README.md` の「画面を組む」: 危険の役割の選び方（取り消せない操作・左へ離す）を足す。要素層を読まない画面（timer）は文字の段を画面のクラスで当てること。画面の列挙をしない
- [ ] ADR 0025 の実施状況に PR 3 の行（決定 4・5・7 の timer・危険の部品化）を足す。完了形の現況を書かない
- [ ] #316 本文の進み具合の PR 3 の行（PR 番号とマージ後の状態）。#314 は PR の本文で閉鎖キーワードを 1 回だけ使い、#316 は閉じない（地の文に閉鎖キーワードと Issue 番号を並べない）
- [ ] `node scripts/check-links.mjs`・`node scripts/audit-plan-gate.mjs`。コミット `docs: timer への当て方とお題の置き場を設計正本と ADR 0025 に残す（#316 PR 3）`

### 仕上げ

- [ ] 文脈を共有しない `/code-review` を **PR 番号を明示して**通す（採点が出るまで直さない）
- [ ] 利用者に Chrome の実物で見てもらう（ロビー・セッション・まとめを PC とスマホの幅で。お題は長いものと無いもの）
