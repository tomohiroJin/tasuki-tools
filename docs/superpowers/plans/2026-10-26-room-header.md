# ルーム画面の共通の見出し（#447 段 1）— 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 共通の見出しの部品 `RoomHeader`（戻るリンク・道具名・ルームコード・参加用 URL のコピー・QR）を `packages/invite-ui` に作り、topic・roulette・agenda・poker のルーム画面をそれに置き換える。玄関の札を timer → poker → roulette → topic → agenda に並べ替える。

**Architecture:** 部品（React）は `packages/invite-ui/src/RoomHeader.tsx`、文言は `src/room-header-copy.ts`、見た目は `packages/ui/src/components/room-header.css`。部品は既存の `.ui-page-header`・`.ui-invite` を中に組み、コピーと QR は既存のフック（`useCopyText`・`useInviteQr`）を使う。アプリは写し（`InviteLink`）と `copy.ts` の `BACK_LINK`・`INVITE_*` を消し、部品へ道具名・戻り先・ルームコード・URL を渡すだけになる。

**Tech Stack:** TypeScript（strict・`exactOptionalPropertyTypes`）、React 19、vitest＋jsdom＋Testing Library、Playwright（e2e）

**Spec:** [`docs/superpowers/specs/2026-10-26-room-header-design.md`](../specs/2026-10-26-room-header-design.md)（以下「設計」）。実装者は設計と本計画の両方を読むこと。

- **日付**: 2026-10-26・**実測時点**: main `25e95de0`
- **実験**: この計画の実装役は **Haiku 5.5**（#447 の 2026-10-26 のコメント）。Task 5 だけ、同じタスクを Sonnet にも別の worktree で実装させて比べる。Task 7（変異）は Opus

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 全タスクが赤いテストから始まる |
| II. 技術選定は ADR を通す | 通過 | 新しい依存なし（qrcode は invite-ui が既に持つ）。`invite-ui` が部品を持つことを ADR 0020 に追記する（Task 8） |
| III. 揮発インメモリと単純運用 | 通過 | 状態は QR の開け閉めだけ（画面の手元）。サーバーは変えない |
| IV. 境界の型安全 | 通過 | 境界（プロトコル）は変えない |
| V. 実画面検証 | 通過 | 5 アプリ × 320px・1280px を前後で撮る。E2E 全件（統括） |
| VI. 依存は内向き | 通過 | アプリ → invite-ui の向きは今と同じ。invite-ui は同期クライアントを import しない（URL は受け取る） |
| VII. 検査は壊して確かめる | 通過 | 変異 474〜483 を足し、1 本ずつ赤を見る（Task 7） |
| VIII. 記録が正本 | 通過 | ADR 0020 の追記・`packages/ui/README.md` の部品の表・`invite-ui/README.md`（Task 8） |
| IX. 小さく回す | 通過 | PR 1 本。配布は利用者の指示を待つ |
| X. 抽象は実需で | 通過 | 写しが 4 つ（死んだ 1 つを含む）・EARS が「同じ位置・同じ文言」を求める。timer は段 2 |
| XI. 秘密と個人情報を持ち込まない | 通過 | 新しい利用者由来のテキストは無い |

**逸脱なし。**

## Global Constraints

- 文言は設計 §3 の表のとおり。**正本は `packages/invite-ui/src/room-header-copy.ts` の `ROOM_HEADER_TEXT` 1 か所**。アプリに写しを書かない
- URL の `<span class="ui-invite-url">` に `aria-label` を付けない（設計 §4・R2）
- QR は普段は閉じる。**閉じている間は qrcode を読み込まない**（`useInviteQr(url, open)`）
- 新しい生の色を書かない（QR の画像は qrcode が白い余白を描くので地は要らない。玄関の `.hub-invite-qr img` と同じ）。字の大きさは 5 段のトークン（`--font-size-*`）か、理由つきの `scale-exempt`
- 新しいクラスは `.ui-room-header` で始める。`packages/ui` は CSS だけ（React を置かない）
- 新しい依存を足さない。**`pnpm install` は打たない**
- E2E に新しいタグを足さない
- コミットの末尾は **`Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`**（実装役が Haiku のとき。Sonnet・Opus のタスクはそのモデル名）。閉鎖キーワード（Closes / Fixes / Resolves と番号の組）を書かない
- **サブエージェントは push・PR 作成・マージをしない。プロセスを止めない（`kill`・`pkill` をしない）。dev サーバー・E2E・Playwright を起動しない。ブランチを切り替えない（`git checkout`・`switch`・`stash`・`reset`・`restore` をしない）**

## Review Focus

設計が求めているのに、素のテストでは突かない入力のうち、使う人に効きそうなもの（効く順）。各行のテストは担当のタスクに足してある。

1. **QR を開いたまま、別のルームの URL に変わった** → 古い URL の QR を出し続けない（`useInviteQr` が守る。部品の試験で、URL を変えたら新しい URL で作り直すことを見る・Task 1）
2. **クリップボードが使えない端末で「招待リンクをコピー」** → ボタンが「コピーできません（URL を選択してください）」になり、URL の字は画面に出たまま（Task 1）
3. **poker の見出しにお題の切り替えと記録の切り替えがある** → 戻るリンクは行の右端のまま（`.ui-page-header` の子は 2 つ）（Task 1・Task 5）
4. **agenda を映している間** → 見出しごと描かない（全画面の重ねの裏に押せる部品を残さない）（Task 4）
5. **roulette の 320px** → 招待は見出しに 1 つだけ（脇に二重に出ない）（Task 3）

## 検証の実行時間の見積もり

**見込みである（手元の 9p 越し・CI は手元より遅い）。想定の 2 倍を超えたら統括へ報告する。**

| 何を | いつ | 1 回の見込み | 回数 | 小計 |
|---|---|---|---|---|
| `pnpm --filter @tasuki/invite-ui test` | Task 1 | 15 秒 | 6 | 2 分 |
| `pnpm --filter @tasuki/ui test`・`lint` | Task 1 | 15 秒 | 2 | 1 分 |
| 各アプリの `pnpm --filter <app> test` | Task 2〜6 | 30〜60 秒 | 各 4 | 15 分 |
| 各アプリの `typecheck`・`lint` | Task 1〜6 | 30 秒 | 各 2 | 6 分 |
| 自分の変異を 1 本ずつ当てて赤を見る | Task 7 | 1 分 | 10 | 10 分 |
| `pnpm test`（turbo の全件）＋ scripts の自己テスト ＋ 全 audit | 統括・PR の前 | 10〜15 分 | 1〜2 | 25 分 |
| 変異の `--changed` | 統括 | 宣言を足すので全件に倒れる → CI に任せる（約 11 分） | 1 | CI 11 分 |
| E2E 全件 | 統括 | 25〜40 分 | 1〜2 | 60 分 |
| 撮影（5 アプリ × 2 幅 × 前後） | 統括 | 30 分 | 1 | 30 分 |
| **合計の見込み** | | | | **約 2.5〜3 時間**（うち統括の直列 2 時間） |

## 取り決め

- **枝**: `feature/447-1-room-header`（設計と計画のコミットを含む）。PR は 1 本
- 各タスクは**テストファースト**: 赤いテストを書き、赤を見てから実装し、緑にする
- 試験は `describe`・`it` を日本語の Given / When / Then で書く（`packages/invite-ui/tests/use-invite-qr.test.ts` の型）
- **既存の変異が当たらなくなる恐れ**: 触ったファイルに当たる既存のパッチを、タスクの終わりに `git apply --check scripts/mutations/<名前>.patch` で 1 本ずつ確かめる。当たらなければ**パッチの文脈の行だけ**を今のファイルに合わせて直す（番号・変異の中身は変えない）。直したら、そのパッチを当てて対象の試験が赤くなり、`git apply -R` で戻ることを見る。対象のパッチ:
  - Task 2: `m90-topic-editor-draft-overwritten.patch`
  - Task 3: `m174-spin-end-relies-on-raf.patch`・`m310-web-wakes-only-next-stop.patch`・`m347-web-space-in-input-stops.patch`・`m348-web-reduced-motion-stops-press.patch`・`m177-vertical-latin-sideways.patch`・`m178-winner-label-bold.patch`・`m204-card-name-lg-without-clamp.patch`・`m208-card-san-without-nowrap.patch`
  - Task 5: `m143-topic-side-unmounts-when-closed.patch`・`m144-topic-side-not-inert-when-closed.patch`・`m274-room-page-drops-spread.patch`・`m414-web-points-select-without-open-group.patch`
  - Task 6: `m169-hub-tool-id-mismatch.patch`・`m449-hub-tool-id-mismatch-agenda.patch`
  - パッチの対象の試験は `scripts/lib/mutation-declarations.mjs` の、そのパッチの宣言の `pkg` と `tests` にある
- `node scripts/mutation-check.mjs` は打たない（全件に倒れて数時間かかる）
- **コミットは `git add <パス>` で自分の変えたファイルだけを足す**（`git add -A`・`git add .` をしない。統括の使い捨ての撮影 `e2e/specs/zz-shots-447.spec.ts` が未追跡で置いてある）
- 実行してよいのは `pnpm --filter <パッケージ> test|typecheck|lint` と `git` の add・commit・diff・log・show・apply だけ。コマンドは 1 つずつ・各 5 分以内

## ファイルの地図

| 層 | 変える | 作る | 消す |
|---|---|---|---|
| `packages/invite-ui` | `src/index.ts`・`tsconfig.json`・`vitest.config.ts`・`README.md` | `src/RoomHeader.tsx`・`src/room-header-copy.ts`・`tests/room-header.test.tsx`・`tests/room-header-copy-fits-font-base.test.ts`・`tests/support/font-base.ts` | — |
| `packages/ui` | `src/components/index.css`・`README.md` | `src/components/room-header.css` | — |
| `apps/topic-web` | `src/screens/TopicRoom.tsx`・`src/copy.ts`・`src/index.css`・`tests/topic-room.test.tsx` | — | `src/components/InviteLink.tsx` |
| `apps/roulette-web` | `src/screens/RouletteRoom.tsx`・`src/copy.ts`・`src/index.css`・関係する試験 | — | `src/components/InviteLink.tsx` |
| `apps/agenda-web` | `src/screens/AgendaRoom.tsx`・`src/copy.ts`・関係する試験 | — | `src/components/InviteLink.tsx` |
| `apps/poker-web` | `src/pages/RoomPage.tsx`・`src/index.css`・`tests/room-page-back.test.tsx` | — | — |
| `apps/landing` | `src/tools.ts`・`tests/App.test.tsx` | — | — |
| 検査 | `scripts/lib/mutation-declarations.mjs` | `scripts/mutations/m474〜m483-*.patch` | — |
| 文書 | `docs/adr/0020-invite-browser-operations.md` | — | — |

---

### Task 1: 部品 `RoomHeader` と文言と見た目

**Files:**
- Create: `packages/invite-ui/src/room-header-copy.ts`・`packages/invite-ui/src/RoomHeader.tsx`・`packages/ui/src/components/room-header.css`
- Create (test): `packages/invite-ui/tests/room-header.test.tsx`・`packages/invite-ui/tests/room-header-copy-fits-font-base.test.ts`・`packages/invite-ui/tests/support/font-base.ts`
- Modify: `scripts/audit-ui-components.mjs`（`SHARED_UI_ENTRIES` に 1 要素）・`packages/invite-ui/src/index.ts`・`packages/invite-ui/tsconfig.json`（`"jsx": "react-jsx"` を足す。`packages/web-kit/tsconfig.json` と同じ）・`packages/invite-ui/vitest.config.ts`（`include` を `tests/**/*.test.{ts,tsx}` に）・`packages/ui/src/components/index.css`（`@import './room-header.css';` を `./invite.css` の直後に）・`packages/ui/README.md`（部品の表に `.ui-room-header` の行）・`packages/invite-ui/README.md`（部品の説明を 1 段落）

**Interfaces:**
- Produces（後のタスクが使う。名前はこのとおりにする）:
  - `room-header-copy.ts`: `export const ROOM_HEADER_TEXT = { back: '選択画面へ戻る', roomLabel: 'ルーム', copy: '招待リンクをコピー', copied: 'コピーしました', copyFailed: 'コピーできません（URL を選択してください）', qrShow: 'QR コードを表示', qrHide: 'QR コードを閉じる', qrAlt: '参加用 URL の QR コード', qrPreparing: 'QR コードを準備しています…', qrFailed: 'QR コードを表示できません。URL を選んでコピーしてください。' } as const;`
  - `RoomHeader.tsx`: `import { useId, useState, type ReactNode } from 'react';`。`export interface RoomHeaderProps { readonly title: string; readonly backHref: string; readonly roomCode: string; readonly inviteUrl: string; readonly titleExtras?: ReactNode }` と `export function RoomHeader({ … }: RoomHeaderProps)`（**戻り値の型は書かない**。グローバルの `JSX` 名前空間は @types/react 19 に無く、型検査が落ちる）
  - `index.ts` から `RoomHeader`・`type RoomHeaderProps`・`ROOM_HEADER_TEXT` を出す（相対 import は `'./RoomHeader.js'`・`'./room-header-copy.js'` と **`.js` を付ける**。既存の行と同じ）
  - `ROOM_HEADER_TEXT` から `urlLabel` は**持たない**（R2 で URL に名前を付けないので、使い道の無い文言になる）。文言は 10 個

組み立て（DOM。クラス名と順はこのとおり。設計 §4）:

```html
<header class="ui-room-header">
  <div class="ui-page-header">
    <div class="ui-room-header-title"><h1>{title}</h1>{titleExtras}</div>
    <a class="ui-page-header-back ui-button ui-button--quiet" href={backHref}>{back}</a>
  </div>
  <div class="ui-room-header-invite">
    <p class="ui-room-header-code"><span class="ui-room-header-code-label">{roomLabel}</span> <span class="ui-room-header-code-value">{roomCode}</span></p>
    <div class="ui-invite">
      <span class="ui-invite-url">{inviteUrl}</span>
      <button type="button" class="ui-button ui-button--secondary ui-button--sm" aria-expanded={open} aria-controls={qrId}>{qrShow | qrHide}</button>
      <button type="button" class="ui-button ui-button--secondary ui-button--sm">{copy | copied | copyFailed}</button>
    </div>
  </div>
  <div id={qrId} hidden={!open} class="ui-room-header-qr">
    {dataUrl && <img src={dataUrl} width="200" height="200" alt={qrAlt} />}
    {open && !dataUrl && <p class="ui-note" role="status">{failed ? qrFailed : qrPreparing}</p>}
  </div>
</header>
```

- ボタンの並びは QR → コピー（よく使うコピーを末尾に置く。玄関 `RoomChoice.tsx` の並びと同じ）
- `qrId` は `useId()`。`open` は `useState(false)`。`useCopyText(inviteUrl)`・`useInviteQr(inviteUrl, open)`
- ルームコードの見出しと値の間の空白は、字として 1 つ入れる（読み上げで「ルーム ABC123」と読まれるように）

見た目（`room-header.css`。値はこのとおり。頭のコメントは `page-header.css` の型で「何を組む容器か」と「行の中の並びまで部品が持つ理由」を書く）:
- `.ui-room-header { display: grid; gap: var(--space-2); }`
- `.ui-room-header-title { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4); }` と `.ui-room-header-title > h1 { margin: 0; }`
- `.ui-room-header-invite { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }`
- `.ui-room-header-code { margin: 0; font-size: var(--font-size-sm); }`・`.ui-room-header-code-label { color: var(--ivory-dim); }`・`.ui-room-header-code-value { font-family: var(--font-mono); letter-spacing: 0.08em; }`
- `.ui-room-header-qr img { display: block; max-width: 100%; height: auto; }`

- [ ] **Step 1: 赤いテストを書く**（`room-header.test.tsx`）。**試験の土台**:
  - 描き方は `packages/web-kit/tests/markdown.test.tsx` の型（`render` と `screen`）。**invite-ui には jest-dom が無い**ので `toBeInTheDocument`・`toHaveAttribute` は使えない。`getAttribute`・`hidden` プロパティ・`textContent` を `toBe` で見る。`afterEach` で `cleanup()` を明示する
  - `vi.mock('qrcode', …)` は `use-invite-qr.test.ts` の型
  - クリップボードと `execCommand` は `tests/use-copy-text.test.ts` の型（`vi.stubGlobal('navigator', …)` と、そのファイルの `restoreExecCommand` の差し戻し）。**後の試験へ漏らさない**（`afterEach` で `vi.unstubAllGlobals()` と差し戻し）
  - `aria-controls` の指す要素は `document.getElementById(button.getAttribute('aria-controls')!)` で引く（`useId` の字は `querySelector('#…')` で壊れる）
  - 相対 import は `.js` を付ける（`'../src/index.js'`。eslint が求める）
  - 「Given 道具名・戻り先・ルームコード・URL / When 描く / Then 見出し・戻るリンク・ルームコード・URL・コピーのボタンが出る」: `getByRole('heading', { level: 1, name: 'お題' })`・`getByRole('link', { name: '選択画面へ戻る' })` の `href` が渡した `backHref`・`getByText('ABC123')`・`getByText('https://example.test/?room=ABC123')`・`getByRole('button', { name: '招待リンクをコピー' })`
  - 「Given 描いた直後 / When 何もしない / Then QR は閉じていて、qrcode を呼ばない」: QR のボタンの `aria-expanded` が `'false'`、`aria-controls` の指す要素が `hidden`、`toDataURL` が呼ばれていない、`queryByRole('img')` が null
  - 「Given 閉じた QR / When 開くボタンを押す / Then その URL の QR が出て、ボタンが閉じるに変わる」: `findByRole('img', { name: '参加用 URL の QR コード' })`・`toDataURL` が `('https://example.test/?room=ABC123', { width: 200 })` で呼ばれた・ボタンの名前が `QR コードを閉じる`・`aria-expanded` が `'true'`・指す要素の `hidden` が false。もう一度押すと `hidden` に戻る
  - 「Given QR の生成が失敗する / When 開く / Then 手で写す案内を出す」: `findByRole('status')` の字が `QR コードを表示できません。URL を選んでコピーしてください。`
  - 「Given QR を開いている / When URL が変わる（rerender）/ Then 新しい URL で作り直す」: `toDataURL` の最後の呼び出しの第 1 引数が新しい URL（Review Focus 1）
  - 「Given クリップボードが拒む / When コピーを押す / Then ボタンが失敗の字になり、URL は出たまま」: `writeText` が reject・`document.execCommand` が `false` を返す（`document.execCommand = vi.fn(() => false)`）→ ボタンの名前が `コピーできません（URL を選択してください）`・URL の字が在る（Review Focus 2）
  - 「Given クリップボードが使える / When コピーを押す / Then ボタンがコピーしましたになる」
  - 「Given 道具に固有のボタン / When titleExtras に渡す / Then 見出しの隣に置かれ、戻るリンクは行の 2 つ目の子のまま」: `container.querySelector('.ui-page-header')!.children.length === 2`・2 つ目が戻るリンク・渡したボタンの親が `h1` の親と同じ（Review Focus 3）
  - 「Given URL の欄 / When 描く / Then aria-label を持たない」: `.ui-invite-url` の `hasAttribute('aria-label')` が false
- [ ] **Step 2: 書体の試験を書く**（`room-header-copy-fits-font-base.test.ts`。`apps/roulette-web/tests/copy-fits-font-base.test.ts` の型。`support/font-base.ts` は `apps/topic-web/tests/support/font-base.ts` の写しで、`FONTS_CSS` の相対パスだけを `'../../../ui/src/tokens/fonts.css'` に変える。import は `'./support/font-base.js'`・`'../src/index.js'`）: 面が 3 つ見つかる・`Object.values(ROOM_HEADER_TEXT)` に外れる字が無い・件数が 10
- [ ] **Step 3: 赤を見る**: `pnpm --filter @tasuki/invite-ui test` → 部品が無いので落ちる
- [ ] **Step 4: 実装する**（上の Interfaces と組み立てのとおり。CSS・README・index.css も）
- [ ] **Step 5: 緑を見る**: `pnpm --filter @tasuki/invite-ui test`・`pnpm --filter @tasuki/invite-ui typecheck`・`pnpm --filter @tasuki/invite-ui lint`・`pnpm --filter @tasuki/ui test`・`pnpm --filter @tasuki/ui lint`・`node --test scripts/audit-ui-components.test.mjs` がすべて通る。**`scripts/audit-ui-components.mjs` の `SHARED_UI_ENTRIES` に `{ specifier: "@tasuki/invite-ui", parts: [{ name: "RoomHeader", file: "packages/invite-ui/src/RoomHeader.tsx" }] }` を足す**（共有の部品の中のクラスを、それを取り込むアプリの使用として数える仕組み。足さないと `.ui-room-header*` が永久に「死んだ部品」になる）。`node scripts/audit-ui-components.mjs` 本体は、どのアプリも `RoomHeader` を取り込んでいない Task 1 の時点では落ちうる。出力を報告に書く（統括が Task 2 以降で通ることを見る）
- [ ] **Step 6: コミット**: `feat: ルーム画面の共通の見出しの部品を足す（#447）`

### Task 2: topic を共通の見出しにする

**Files:**
- Modify: `apps/topic-web/src/screens/TopicRoom.tsx`・`apps/topic-web/src/copy.ts`（`BACK_LINK`・`INVITE_COPY_BUTTON`・`INVITE_COPIED`・`INVITE_COPY_FAILED` と、その上の「// 招待リンク（poker の `InviteLink` と同じ文）」のコメントを消す）・`apps/topic-web/src/index.css`（`.topic-room-header` の規則を、`.ui-room-header` に下の余白を当てる規則へ置き換える: `.ui-room-header { margin-block-end: var(--space-5); }` をアプリの CSS に。コメントの poker への言及は消す）・`apps/topic-web/tests/topic-room.test.tsx`
- Delete: `apps/topic-web/src/components/InviteLink.tsx`

**Interfaces:**
- Consumes: Task 1 の `RoomHeader`・`ROOM_HEADER_TEXT`（`@tasuki/invite-ui`）

- [ ] **Step 1: 赤いテスト**（`topic-room.test.tsx` に足す。既存の描き方に合わせる）: 「Given 入室したルーム / When 描く / Then 共通の見出しにルームコードと QR のボタンが出る」: `getByText(<そのテストのルームコード>)`・`getByRole('button', { name: 'QR コードを表示' })`・`getByRole('link', { name: '選択画面へ戻る' })` の `href` が `hubPathFor(roomCode)` と同じ
- [ ] **Step 2: 赤を見る**: `pnpm --filter @tasuki/topic-web test -- tests/topic-room.test.tsx`
- [ ] **Step 3: 実装**: ルームの画面（入室が成立した画面）の `<div className="topic-room-header">…</div>` を `<RoomHeader title={PAGE_HEADING} backHref={hubPathFor(roomCode)} roomCode={roomCode} inviteUrl={sync.inviteUrl} />` に置き換える。入室を待つ画面の戻るリンクは `ROOM_HEADER_TEXT.back` を読む（組み立ては変えない）。`BACK_LINK` などを import している他のファイル・試験も `ROOM_HEADER_TEXT` に直す（`grep -rn "BACK_LINK\|INVITE_" apps/topic-web` が 0 件になること）
- [ ] **Step 4: 緑**: `pnpm --filter @tasuki/topic-web test`・`typecheck`・`lint`。取り決めの既存パッチ（m90）の `git apply --check`
- [ ] **Step 5: コミット**: `feat: お題のルーム画面を共通の見出しにする（#447）`

### Task 3: roulette を共通の見出しにする

**Files:**
- Modify: `apps/roulette-web/src/screens/RouletteRoom.tsx`・`apps/roulette-web/src/copy.ts`（`BACK_LINK`・`INVITE_HEADING`・`INVITE_COPY_BUTTON`・`INVITE_COPIED`・`INVITE_COPY_FAILED`・`INVITE_URL_LABEL` と、その上の「// 脇: 招待（玄関と同じ見出し）」のコメントを消す）・`apps/roulette-web/src/index.css`（`.roulette-room-header` を `.ui-room-header { margin-block-end: var(--space-5); }` へ置き換え、`.roulette-invite` と `.roulette-invite h2` の規則を消す。**円盤の大きさの式（`--wheel-size` の `100dvh - 24rem` など）の値は変えない**。ただし 47 行のコメント「3 版: 招待を脇へ移して見出しの下が空いたので…」は前提が崩れるので、「招待は見出しへ移った（#447）。見出しが高くなった分は撮影で確かめる」の趣旨に書き換える）・`apps/roulette-web/tests/roulette-room.test.tsx`
- Delete: `apps/roulette-web/src/components/InviteLink.tsx`

- [ ] **Step 1: 赤いテスト**（既存の `tests/roulette-room.test.tsx` に足す。そのファイルの描き方を使う）: 「Given 入室したルーム / When 描く / Then 招待は見出しに 1 つだけ」: `getAllByRole('button', { name: '招待リンクをコピー' })` の長さが 1・そのボタンが `.ui-room-header` の中・`queryByRole('heading', { name: '仲間を招く' })` が null・ルームコードが出る（Review Focus 5）
- [ ] **Step 2: 赤を見る**
- [ ] **Step 3: 実装**: ルームの画面の `<div className="roulette-room-header">…</div>` を `RoomHeader` に置き換え（Task 2 と同じ渡し方。`inviteUrl={sync.inviteUrl}`）、脇の `<section className="ui-panel roulette-invite" …>` を消す。脇の直前のコメント（「脇は 決め方 → 入る人 → 仲間を招く」）と段組みのコメントの並び（「… → 仲間を招く」）から招待を外す。入室を待つ画面の戻るリンクは `ROOM_HEADER_TEXT.back`。`grep -rn "BACK_LINK\|INVITE_" apps/roulette-web` が 0 件
- [ ] **Step 4: 緑**: `pnpm --filter @tasuki/roulette-web test`・`typecheck`・`lint`。取り決めの既存パッチ 8 本の `git apply --check`
- [ ] **Step 5: コミット**: `feat: ルーレットのルーム画面を共通の見出しにする（#447）`

### Task 4: agenda を共通の見出しにする

**Files:**
- Modify: `apps/agenda-web/src/screens/AgendaRoom.tsx`・`apps/agenda-web/src/copy.ts`（`BACK_LINK`・`INVITE_HEADING`・`INVITE_COPY_BUTTON`・`INVITE_COPIED`・`INVITE_COPY_FAILED`・`INVITE_URL_LABEL` と、その上の「脇: 招待」のコメントを消す）・`apps/agenda-web/src/index.css`（`.ui-room-header { margin-block-end: var(--space-5); }` を足す。agenda に見出しの余白の規則は今は無い）・`apps/agenda-web/tests/agenda-room.test.tsx`・`apps/agenda-web/tests/projection-view.test.tsx`（`BACK_LINK` の import を `ROOM_HEADER_TEXT.back` に）。**`run.css` の `100dvh - 14rem`（見出しより上の高さの見積もり）の値は変えない**（撮影で統括が確かめる）
- Delete: `apps/agenda-web/src/components/InviteLink.tsx`（どこからも使われていない写し）

- [ ] **Step 1: 赤いテスト**（既存の `tests/agenda-room.test.tsx` に足す。映す表示の場合は `tests/projection-view.test.tsx` の描き方を使う）: 「Given 入室したルーム / When 描く / Then 共通の見出しにルームコード・URL・QR のボタンが出る」と「Given 映している / When 描く / Then 見出しごと描かない」: `container.querySelector('.ui-room-header')` が null・`queryByRole('link', { name: '選択画面へ戻る' })` が null（Review Focus 4）
- [ ] **Step 2: 赤を見る**
- [ ] **Step 3: 実装**: ルームの画面の `{!projecting && (<header className="ui-page-header">…</header>)}` を `{!projecting && <RoomHeader title={PAGE_HEADING} backHref={hubPathFor(roomCode)} roomCode={roomCode} inviteUrl={sync.inviteUrl} />}` に置き換える。入室を待つ画面の戻るリンクは `ROOM_HEADER_TEXT.back`。`grep -rn "BACK_LINK\|INVITE_" apps/agenda-web` が 0 件。下の余白は agenda の CSS に既にある見出しの余白の規則を見て、無ければ `.ui-room-header { margin-block-end: var(--space-5); }` を `apps/agenda-web/src/` の画面の CSS に足す
- [ ] **Step 4: 緑**: `pnpm --filter @tasuki/agenda-web test`・`typecheck`・`lint`
- [ ] **Step 5: コミット**: `feat: 進行タイマーのルーム画面に共通の見出しを出す（#447）`

### Task 5: poker を共通の見出しにする（影の実装の対象）

**Files:**
- Modify: `apps/poker-web/src/pages/RoomPage.tsx`・`apps/poker-web/src/index.css`・`apps/poker-web/tests/room-page-back.test.tsx`

- [ ] **Step 1: 赤いテスト**（`room-page-back.test.tsx` に足す。既存の描き方に合わせる）: 「Given 入室したルーム / When 描く / Then 共通の見出しにルームコードと QR のボタンが出る」: ルームコード（`roomId`）の字・`getByRole('button', { name: 'QR コードを表示' })`。「Given お題がある / When 描く / Then 切り替え 2 つは見出しの隣、戻るリンクは行の 2 つ目の子」: `.ui-page-header` の子が 2 つ・「お題を隠す」と「記録する」のボタンの親が `h1` の親と同じ（Review Focus 3）
- [ ] **Step 2: 赤を見る**
- [ ] **Step 3: 実装**: `RoomPage` の `<header>…</header>`（`.ui-page-header` と `InviteLink`）を `<RoomHeader title="プランニングポーカー" backHref={inviteUrl} roomCode={roomId} inviteUrl={inviteUrl} titleExtras={<>{お題の切り替え}{記録の切り替え}</>} />` に置き換え、ファイルの中の関数 `InviteLink` とその説明のコメントを消す。戻り先を `inviteUrl` にする理由のコメント（「行き先は招待リンクと同じ同じルームの選択画面」）は `backHref` の行に残す。見出しの隣の 2 つの切り替えの説明のコメントもそのまま `titleExtras` の中に残す。CSS: `.room-title` の規則は `.ui-room-header-title` が持つので消す。`.room-title .ui-button[aria-pressed='true']` は `.ui-room-header-title .ui-button[aria-pressed='true']` に直す。`.room .ui-page-header { margin-block-end: 0.4rem; }` は消す（行の間は部品の `gap` が持つ）。`.room > header` は `.room > .ui-room-header` に直す
- [ ] **Step 4: 緑**: `pnpm --filter @tasuki/poker-web test`・`typecheck`・`lint`。取り決めの既存パッチ 4 本の `git apply --check`
- [ ] **Step 5: コミット**: `feat: プランニングポーカーのルーム画面を共通の見出しにする（#447）`

### Task 6: 玄関の札の順

**Files:**
- Modify: `apps/landing/src/tools.ts`・`apps/landing/tests/App.test.tsx`

- [ ] **Step 1: 赤いテスト**（`App.test.tsx` に足す）: 「Given 玄関の札 / When 並びを読む / Then timer → poker → roulette → topic → agenda」: `TOOLS.map((t) => t.id)` が `['timer', 'poker', 'roulette', 'topic', 'agenda']`。加えて、選択画面を描いた試験（既存のものの描き方）で `getByRole('list', { name: 'ツール' })` の中のリンクの `href` の並びが `/timer/?room=…`・`/poker/?room=…`・`/roulette/?room=…`・`/topic/?room=…`・`/agenda/?room=…`
- [ ] **Step 2: 赤を見る**
- [ ] **Step 3: 実装**: `TOOLS` の topic と roulette の要素を入れ替える（中身は変えない）
- [ ] **Step 4: 緑**: `pnpm --filter @tasuki/landing test`・`typecheck`。取り決めの既存パッチ m169・m449 の `git apply --check`（並べ替えで文脈がずれるので、当たらなければ文脈を直す）
- [ ] **Step 5: コミット**: `feat: 玄関の札を使う流れの順に並べる（#447）`

### Task 7: 変異 474〜483（Opus）

**Files:**
- Create: `scripts/mutations/m474〜m483-<名前>.patch`（使うのは必要な本数だけ。帯の残りは空けておく）
- Modify: `scripts/lib/mutation-declarations.mjs`（末尾に `{ id, label, patch, pkg, tests, note }` の形で足す。`note` は `"#447。…"` で始める）

- [ ] 宣言の `pkg` はパッケージ名ではなくパス（例 `"packages/invite-ui"`・`"apps/roulette-web"`）。既存の宣言の型に合わせる
- [ ] 少なくとも次を変異にする（各 1 本・各パッチを当てると対象の試験が赤・戻すと緑）: 閉じている間も QR を作る（`useInviteQr(inviteUrl, true)`）／QR の容器の `hidden` を外す／`aria-controls` が容器の `id` を指さない／戻るリンクが `backHref` を使わない／`titleExtras` を `.ui-page-header` の直下に置く（戻るリンクが真ん中に浮く）／URL の欄に `aria-label` を付ける／玄関の札の順を作った順に戻す／roulette の脇に招待を戻す（二重）／agenda が映している間も見出しを描く
- [ ] 各パッチの 1 行目は `# 変異 NNN: <名前>`、適用の手順は既存のパッチの型に合わせる
- [ ] 1 本ずつ: `git status --porcelain` が空 → `git apply` → 対象の試験で赤 → `git apply -R` → 空に戻る
- [ ] コミット: `test: 共通の見出しの変異を足す（#447）`（`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`）

### Task 8: 文書

**Files:**
- Modify: `docs/adr/0020-invite-browser-operations.md`（末尾に「2026-10-26 の追記（#447）」の節: invite-ui が React の部品 `RoomHeader` を 1 つ持つ・見た目は `packages/ui` の CSS・文言の正本は `room-header-copy.ts`・ADR 0022 の「ui は CSS だけ」は保つ）

- [ ] 追記は既存の追記の節の型に合わせる（決定の段では完了形で書かない）
- [ ] `node scripts/check-links.mjs` が通る
- [ ] コミット: `docs: invite-ui が見出しの部品を持つことを ADR 0020 に追記する（#447）`

### 統括の仕上げ（タスクにしない）

- `pnpm test --force`・scripts の自己テスト・全 audit・`pnpm typecheck`・`pnpm lint`
- E2E 全件。落ちたもの（`buttons.spec.ts` の roulette の部品の並び・`layout.spec.ts` の札の幅・`panels-headers.spec.ts` など）は、落ちた理由を読んでから直しの dispatch を出す
- 撮影（5 アプリ × 320px・1280px × 前後）を並べて見る
- 最終レビュー（Opus・面で分割）・PR・`/code-review <番号>`・CI
