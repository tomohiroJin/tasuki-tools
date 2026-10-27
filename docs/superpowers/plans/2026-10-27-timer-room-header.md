# timer のロビーとセッションの見出し（#447 段 2）— 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** timer のロビー・セッション・完了の画面に、段 1 の共通の見出し `RoomHeader` を置く。セッション中と完了は詰めた見た目（`compact`）にする。timer の `InvitePanel` を消し、上の帯から戻るリンクを外す。

**Architecture:** 部品に `compact?: boolean` を足す（`packages/invite-ui`）。見た目は `packages/ui/src/components/room-header.css` の `.ui-room-header--compact`。timer は `App.tsx` が帯の直後に見出しを 1 つだけ置き、画面（`Lobby`・`Session`）からは招待を消す。

**Tech Stack:** TypeScript（strict・`exactOptionalPropertyTypes`）、React 19、vitest＋jsdom＋Testing Library、node:test（`packages/ui`）、Playwright（e2e）

**Spec:** [`docs/superpowers/specs/2026-10-27-timer-room-header-design.md`](../specs/2026-10-27-timer-room-header-design.md)（以下「設計」）と、段 1 の設計 [`2026-10-26-room-header-design.md`](../specs/2026-10-26-room-header-design.md)。実装者は両方と本計画を読むこと。

- **日付**: 2026-10-27・**実測時点**: main `0de5f988`・枝 `feature/447-2-timer-room-header`
- **実装役**: Sonnet 5.5（Task 1・2・3・5）。Task 4（変異）は Opus

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | Task 1・2 は赤いテストから始める |
| II. 技術選定は ADR を通す | 通過 | 新しい依存なし。部品の型を 1 つ足すだけ |
| III. 揮発インメモリと単純運用 | 通過 | サーバーとプロトコルは変えない |
| IV. 境界の型安全 | 通過 | 境界は変えない |
| V. 実画面検証 | 通過 | 5 アプリ × 320px・1280px を撮る。E2E 全件（統括） |
| VI. 依存は内向き | 通過 | timer-web → invite-ui の向きは今と同じ（既に `useCopyText` を使っている） |
| VII. 検査は壊して確かめる | 通過 | 変異 485〜494 を足し、1 本ずつ赤を見る（Task 4） |
| VIII. 記録が正本 | 通過 | invite-ui・ui の README、timer の文書（Task 5） |
| IX. 小さく回す | 通過 | PR 1 本。配布は利用者の指示を待つ |
| X. 抽象は実需で | 通過 | `compact` は timer のセッションという実需 1 つのために足す。通常の見た目と同じ部品で、分岐は CSS のクラス 1 つ |
| XI. 秘密と個人情報を持ち込まない | 通過 | 新しい利用者由来のテキストは無い |

**逸脱なし。**

## Global Constraints

- 文言の正本は `packages/invite-ui/src/room-header-copy.ts` の `ROOM_HEADER_TEXT`。timer に写しを書かない。道具名 `TDD Mob Pro Timer` は timer 側の定数（設計 R8）
- 新しい生の色を書かない。字の大きさは 5 段のトークン（`--font-size-xs|sm|base|lg|xl`）
- 部品層の新しいクラスは `.ui-room-header` で始める。`packages/ui` は CSS だけ
- **timer は要素層（`elements.css`）を読まない**（`apps/timer-web/src/index.css` の冒頭）。timer の `h1` は reset で素の字になるので、見出しの字は timer の CSS が持つ（要素層の `h1` と同じ値: `--font-display`・600・`--ivory`・`--font-size-xl`・行の高さ 1.25）
- `packages/ui/tests/room-header-wide-toggle.test.mjs` は「`.ui-room-header-share-toggle` を 40rem 以上で隠す規則」をクラスの連鎖で読む fail-closed の検査。**同じ見出しの `@media` を 2 つ書くと赤**になるので、既存の `@media` の塊に足す
- CSS は後勝ち。`@media` の中の上書きは、基準の規則より後に書く
- 新しい依存を足さない。**`pnpm install` は打たない**。E2E に新しいタグを足さない
- 共有の部品を触ったら、使う全アプリの試験を流す（`@tasuki/invite-ui`・`@tasuki/ui`・`@tasuki/topic-web`・`@tasuki/roulette-web`・`@tasuki/agenda-web`・`@tasuki/poker-web`・`@tasuki/timer-web`）
- コミットの末尾は **`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`**（Opus のタスクは `Claude Opus 5.5`）。閉鎖キーワード（Closes / Fixes / Resolves と番号の組）を書かない
- **サブエージェントは push・PR 作成・マージをしない。プロセスを止めない。dev サーバー・E2E・Playwright を起動しない。ブランチを切り替えない。作業ツリーやコミットを巻き戻す git 操作（`checkout`・`switch`・`stash`・`reset`・`restore`）をしない**（戻すときは手で直すか、新しいコミット）

## Review Focus

素のテストでは突かない入力のうち、使う人に効きそうなもの（効く順）。

1. **休憩の覆いが出ている間** → 見出し（戻るリンク・仲間を招く）にフォーカスが入らない（`inert`）。覆いが閉じたら戻る（Task 2）
2. **1280px のセッションで「仲間を招く」を開いて QR を開き、もう一度「仲間を招く」** → 欄も QR も閉じる。開き直したとき QR は閉じている（Task 1）
3. **1280px の詰めた見た目で、欄が開いていないのに QR が開く経路が無い** → 欄が `display: none` の間に `resize` が来ても QR が残らない（段 1 の `placeOrClose`。Task 1 で compact の試験を足す）
4. **ロビー → セッション → 完了** → 見出しは同じ位置に 1 つだけ（二重に描かない）。完了でも戻るリンクがある（Task 2）
5. **ルームを失った・履歴を開いた・まだ snapshot が無い** → 見出しを描かない（帯と同じ条件。Task 2）

## 検証の実行時間の見積もり

**見込みである。想定の 2 倍を超えたら統括へ報告する。**

| 何を | いつ | 1 回の見込み | 回数 | 小計 |
|---|---|---|---|---|
| `pnpm --filter @tasuki/invite-ui test`・`@tasuki/ui test`・`lint` | Task 1 | 15 秒 | 6 | 2 分 |
| 4 アプリ（topic・roulette・agenda・poker）の `test` | Task 1 の終わり | 30〜60 秒 | 各 1 | 4 分 |
| `pnpm --filter @tasuki/timer-web test`・`typecheck`・`lint` | Task 2 | 60〜90 秒 | 6 | 8 分 |
| E2E の timer 関連（`timer.spec`・`timer-a11y`・`buttons`・`layout`・`timer-break`） | 統括・Task 2 の後と Task 3 の後 | 3〜5 分 | 2〜3 | 15 分 |
| 変異を 1 本ずつ当てて赤を見る | Task 4 | 1〜2 分 | 10 | 15 分 |
| 撮影（5 アプリ × 2 幅＋timer のセッション） | 統括 | 10 分 | 1 | 10 分 |
| `pnpm test`（turbo の全件）＋ scripts の自己テスト ＋ 全 audit | 統括・PR の前 | 10〜15 分 | 1〜2 | 25 分 |
| `pnpm e2e` 全件 | 統括・PR の前 | 5〜10 分 | 1 | 10 分 |
| 変異の `--changed` | 宣言を足すので全件に倒れる → CI に任せる（約 11 分） | — | — | CI |

合計の見込み: 手元で約 1.5 時間。

---

## Task 1: 部品に詰めた見た目（`compact`）を足す

**Files:**
- Modify: `packages/invite-ui/src/RoomHeader.tsx`（`compact?: boolean` を props に足し、`<header>` のクラスを切り替える。他の振る舞いは変えない）
- Modify: `packages/ui/src/components/room-header.css`（`.ui-room-header--compact`）
- Test: `packages/invite-ui/tests/room-header.test.tsx`、必要なら `packages/ui/tests/room-header-wide-toggle.test.mjs`

**受け入れ条件:**
- `compact` を渡さないときの DOM とクラスは今と同じ（4 アプリの試験が緑のまま）
- `compact` のとき `<header class="ui-room-header ui-room-header--compact">`
- CSS（jsdom は `@media` を評価しないので、CSS の振る舞いは E2E と撮影で統括が見る。部品の試験では DOM とクラスと開閉だけを見る）:
  - 詰めた見た目では「仲間を招く」を**全幅で**出す。40rem 以上で隠す既存の規則（(0,2,0)）に勝つよう、既存の `@media (width >= 40rem)` の塊の中に、より強い連鎖（例 `.ui-room-header.ui-room-header--compact .ui-room-header-share-toggle { display: inline-flex; }`）を**後に**書く
  - 詰めた見た目では招待の欄を `data-open='true'` が無い限り**全幅で**たたむ（`@media` の外）
  - 1 行目（`.ui-page-header`）と「仲間を招く」を 1 行に並べ、開いた欄は次の行に全幅で出す（例: `grid-template-columns: minmax(0, 1fr) auto` と、欄に `grid-column: 1 / -1`）。320px で横にはみ出さない（折り返しは可）
  - 見出しの `h1` は `--font-size-lg`
- `room-header-wide-toggle.test.mjs` が緑のまま。この検査が詰めた見た目の規則を誤って読むなら、検査に「詰めた見た目の規則は 40rem 以上で出す側」と分かるように足す（fail-closed は保つ）
- 部品の試験に足す（Given/When/Then）:
  - 詰めた見た目のクラスが付く／付かない
  - 詰めた見た目でも「仲間を招く」の `aria-expanded` が開閉で切り替わり、欄の `data-open` が付く／外れる
  - 詰めた見た目で欄を開き、QR を開いてから「仲間を招く」でたたむと QR も閉じ、もう一度開いたとき QR は閉じている（Review Focus 2）
- `room-header.css` の冒頭の注記に、詰めた見た目の段落を足す（timer のセッション中・#447 段 2）

- [ ] 試験を足して赤を見る → 実装 → 緑
- [ ] `pnpm --filter @tasuki/invite-ui test`・`typecheck`・`lint`、`pnpm --filter @tasuki/ui test`・`lint`
- [ ] 4 アプリ（`@tasuki/topic-web`・`@tasuki/roulette-web`・`@tasuki/agenda-web`・`@tasuki/poker-web`）の `test`
- [ ] コミット `feat: 共通の見出しに詰めた見た目を足す（#447 段 2）`

## Task 2: timer の見出しを共通の部品にする

**Files:**
- Modify: `apps/timer-web/src/App.tsx`（帯の直後に `RoomHeader` を 1 つ）
- Modify: `apps/timer-web/src/ui/Lobby.tsx`（`InvitePanel` を消す。`inviteUrl` の props が要らなくなれば消す）
- Modify: `apps/timer-web/src/ui/Session.tsx`（「ルーム」タブの `InvitePanel` を消す。パスフレーズ・自己退出・ランダム・名簿は残す。`inviteUrl` が要らなくなれば消す）
- Modify: `apps/timer-web/src/ui/components/StatusStrip.tsx`（戻るリンクを消す。ルームコードの表示は残す・設計 R12）
- Delete: `apps/timer-web/src/ui/components/InvitePanel.tsx`・`apps/timer-web/src/styles/invite-panel.css`（`index.css` の `@import` も）・`apps/timer-web/test/ui/InvitePanel.test.tsx`
- Create: `apps/timer-web/src/styles/room-header.css`（timer の見出しの字と、見出しと下の段組みの間の余白。`index.css` に `@import`）
- Modify: `apps/timer-web/src/styles/status-strip.css`（戻るリンクの規則を消す）
- Test: `apps/timer-web/test/ui/StatusStrip.test.tsx`・`Session.invite.test.tsx`（招待がタブから消えたこと・パスフレーズは残ること、に書き直す。ファイル名が合わなくなれば改名してよい）・`a11y.test.tsx`・`Lobby.invite.test.tsx`・`Session.all-equal.test.tsx` ほか、落ちたもの。新しく `App.room-header.test.tsx`

**受け入れ条件:**
- 見出しを出す条件は帯と同じ（`mode !== null && !sessionLost`、かつ `room` がある。履歴（`entry.kind === "history"`）のときは帯も描かれないことを確かめ、見出しも描かない）
- 置く位置は上の帯（`app-top` の `div`）の**直後**、`renderBody()` の前
- `title` は `TDD Mob Pro Timer`（timer の定数として 1 か所。例 `src/ui/room-heading.ts` か既存の文言の置き場）。`backHref` は `/?room=<code>`（今の帯のリンクと同じ組み立て。`encodeURIComponent`）。`roomCode` は `room.code`。`inviteUrl` は `sync.inviteUrl ?? ''`
- `compact` は `mode` が `session` か `celebration` のとき
- 休憩中（`onBreak`）は見出しを包む要素に `inert`
- **`className` は枝ごとの文字列リテラルで書く**（`audit-timer-classes` が読む。`node scripts/audit-timer-classes.mjs` を流して確かめる。名前が違えば `ls scripts | grep audit` で探す）
- 「ルーム」タブからルームコードのコピーと QR が消える（設計 R10）。`InvitePanel` を名指しする注記（`Lobby.tsx` の冒頭・脇の並びの注記・空のヒントの「上の招待リンク」など）を読み直し、今の姿に合わせる（「上の招待リンク」は見出しが上にあるので残してよい）
- `App.room-header.test.tsx`（Given/When/Then）: ロビーで見出し（`heading` `TDD Mob Pro Timer`・リンク「選択画面へ戻る」の `href` が `/?room=<code>`）が 1 つ・詰めた見た目のクラスが無い／セッションで詰めた見た目／完了で詰めた見た目と戻るリンク／ルームを失ったら描かない／休憩中は包む要素が `inert`。既存の `App.*.test.tsx` の作り方（同期フックの差し替え）に倣う
- 帯の試験: 戻るリンクが無いこと、ルームコードは出ていること
- `pnpm --filter @tasuki/timer-web test`・`typecheck`・`lint` が緑。timer の audit（`node scripts/audit-*.mjs` のうち timer・ui・構造に関わるもの）が緑

- [ ] 試験を足して赤を見る → 実装 → 緑
- [ ] コミット `feat: timer の見出しを共通の部品にする（#447 段 2）`（大きければ「帯と招待の撤去」と「見出しの配置」の 2 つに分けてよい）

## Task 3: E2E を新しい見出しに合わせる（統括が E2E を流して落ちたものを渡す）

**Files（見込み）:** `e2e/support/timer.ts`（`createRoom`・`invitedUrlText` の注記）、`e2e/specs/buttons.spec.ts`（timer の画面のボタン数）、`e2e/support/a11y.ts` の注記、`e2e/specs/timer.spec.ts`

**受け入れ条件:**
- `createRoom` はルームコードを、画面に出た招待 URL（`invitedUrlText`）の `room` から読み、**見出しのルームコード（`.ui-room-header-code-value` の字）がその値であること**を確かめてから返す（設計 R11。`page.url()` は使わない）
- 統括が渡す落ちた試験の一覧を、製品の変化（帯の戻るリンクが見出しへ・ルームタブの招待が消えた・セッションは詰めた見た目）に合わせて直す。**主張を弱めない**（数を下げるなら、なぜ下がるかを 1 行で書く）
- 実装役は E2E を流さない。統括が流して結果を返す

- [ ] コミット `test: timer の E2E を共通の見出しに合わせる（#447 段 2）`

## Task 4: 変異（485〜494・Opus）

`scripts/mutations/` の m474〜m484 と `scripts/lib/mutation-declarations.mjs` の書き方に倣う。候補（各 1 本ずつ当てて、狙った試験が赤になることを確かめる。赤にならない変異は試験を足すか、変異を捨てて理由を報告に書く）:

- 485 部品: `compact` でも詰めた見た目のクラスを付けない
- 486 部品の CSS: 詰めた見た目で 40rem 以上の「仲間を招く」を出す規則を消す（`packages/ui` の検査か E2E が拾うこと。拾えなければ検査を足す）
- 487 timer: セッションで `compact` を渡さない
- 488 timer: 完了の画面で見出しを描かない
- 489 timer: 休憩中の `inert` を外す
- 490 timer: ルームを失っても見出しを描く
- 491 timer: 戻る先を `/`（ルームを付けない）にする
- 492〜494: 予備（使わなければ使わない）

- [ ] 変異を足し、1 本ずつ `git apply` → 試験 → `git apply -R` で赤を確かめる
- [ ] コミット `test: #447 段 2 の変異を足す（m485〜）`

## Task 5: 文書

- `packages/invite-ui/README.md`（`compact`）、`packages/ui/README.md`（部品の表の `room-header.css` の行）
- timer の文書のうち、`InvitePanel`・帯の戻るリンク・「ルーム」タブの招待を名指しするもの（`grep -rn "InvitePanel\|招待パネル\|status-strip-back" docs apps/timer-web --include='*.md'`）
- ADR 0020（invite-ui が部品を持つ）の追記に、段 2 で `compact` を足したことを 1 行
- 設計 §6 の撮影の結果は統括が書く

- [ ] コミット `docs: timer の見出しの共通化を文書に反映する（#447 段 2）`
