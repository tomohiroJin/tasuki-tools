# #316 PR 1 作り直し: 読む面と操作の面 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PR 1（#347）の 3 区画の段組みを、「読む面（`.ui-reader`）と操作の面」の 2 区画に作り直し、poker とお題ツールで説明が長くてもページが伸びず、狭い幅では下からのシートで全文を読めるようにする。

**Architecture:** 部品層の `layout.css` を 2 区画（`-main` / `-side`）に書き換え、`reader.css`（読む面）と `drawer.css`（下からのシート）を足す。poker とお題ツールは読む面を React で組み、お題ツールは下書きを `TopicRoom` へ持ち上げて読む面のタブで見せる。timer は区画名を読み替えるだけ。

**Tech Stack:** CSS（`@layer` なし）・React 19・`<dialog>`・Vitest・Playwright

**Spec:** [`docs/superpowers/specs/2026-10-08-responsive-layout-design.md`](../specs/2026-10-08-responsive-layout-design.md) の §9（D3'・D3''・D7'）。見た目の案はキャンバス「Tasuki レスポンシブ設計」の案 3

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | E2E と単体テストを先に書き換えて赤を見てから部品と画面を直す |
| II. 技術選定は ADR を通す | 通過 | 新しい依存を足さない。`<dialog>` は標準。ADR 0025 の決定 3 を改める |
| III. 揮発インメモリと単純運用 | 該当なし | 同期サーバーに触れない |
| IV. 境界の型安全 | 該当なし | 境界検証に触れない |
| V. 実画面検証 | 通過 | 撮影を自分で見て釣り合いを判断し、利用者に Chrome で見てもらう（Task 6） |
| VI. 依存は内向き | 該当なし | `packages/ui` は依存を持たないまま |
| VII. 検査は壊して確かめる | 通過 | 読む面の高さと sticky の規則を壊して E2E が赤になるのを見る（Task 5） |
| VIII. 記録が正本 | 通過 | 正本 §9・ADR 0025 の改訂・README |
| IX. 小さく回す | 通過 | #347 の中の作り直し。配布しない |
| X. 抽象は実需で | 通過 | 新しい部品はすべて 2 アプリ以上が使う（`.ui-reader`・`.ui-drawer`・`--reader` は poker とお題ツール、`--side-end` はお題ツールと timer） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## Global Constraints

- 幅の段の境目は `40rem`・`64rem`・`90rem` だけ（範囲構文の `width >=` と `width <`）。検査（`scripts/audit-ui-components.mjs`）はそのまま
- 部品層の規則: セレクタは `.ui-` から・詳細度 (0,1,0)〜(0,2,0)・`@layer` / 入れ子 / `--*` の宣言 / 生の色 / `outline` を書かない・**定義した `.ui-*` は 2 つ以上のアプリの TSX が使う**
- **新しい UI の文言は書体の base 層の字だけで書く**。使う文言: 「続きを読む」「閉じる」「いまのお題」「下書きの見え方」「下書き（まだ公開していません）」。足す前に各アプリの `tests/*fits-font-base*` を流して通ることを確かめる（「全文」「札」「誰」は base 層に無い）
- 器（`.ui-page` の 3 段）・幅の段・`useIsWide` は PR 1 のまま変えない
- 作業ブランチは `feature/issue-316-pr1-layout`（#347）。サブエージェントは push・マージ・`git stash`・`git checkout -- <path>`・`git reset --hard` をしない。`e2e/inventory-316/` を消さない・コミットしない
- 日本語のコメント・文書。README と ADR に画面の列挙と数を書かない

## Review Focus

1. **64rem 以上で説明がとても長いとき、ページ全体が縦に伸びないか**（読む面の本文だけがスクロールする）→ Task 5 の E2E（`document.documentElement.scrollHeight <= innerHeight + 余裕` と、本文の `scrollHeight > clientHeight`）
2. **読む面の本文がキーボードでスクロールできるか**（スクロールする領域は `tabindex="0"` と名前を持つ）→ Task 2・3 の単体テスト
3. **シート（`<dialog>`）を閉じたら、開いたボタンへフォーカスが戻るか・Esc で閉じるか** → Task 2 の E2E
4. **お題ツールで下書きを送ったら「いまのお題」のタブへ戻り、送った内容が出るか**。書き始めの自動切り替えが、手で選んだタブを毎打鍵で上書きしないか → Task 3 の単体テスト
5. **既存の a11y の走査（poker・timer・お題ツールのコントラスト）が、読む面の札の上の字で割れないか** → Task 5 で既存の E2E 全件

## 見積もり

| 区分 | 見積もり |
|---|---|
| 機械の待ち | 約 1 時間（E2E 全件・CI 一式・mutation-check） |
| 実作業 | 6〜9 時間（部品 1.5・poker 2・お題ツール 2.5・timer と E2E 1.5・文書 1） |

2 倍を超えたら利用者に報告する。**各タスクの終わりに経過時間を台帳に書き、サブエージェントの戻りが 1 時間を超えたら様子を確かめる**（PR 1 で 2.7 時間・6.6 時間の空白があった）。

## ファイルの地図

| ファイル | 変更 |
|---|---|
| `packages/ui/src/components/layout.css` | 2 区画に書き換え |
| `packages/ui/src/components/reader.css`・`drawer.css`・`index.css` | 新規・まとめ読みに足す |
| `apps/poker-web/src/components/CurrentTopic.tsx`・`ParticipantList.tsx`・`pages/RoomPage.tsx`・`index.css` | 読む面・場・段組み |
| `apps/poker-web/tests/current-topic.test.tsx` | 「説明を見る」の `<details>` から読む面へ |
| `apps/topic-web/src/components/CurrentTopic.tsx`・`TopicEditor.tsx`・`screens/TopicRoom.tsx`・`copy.ts`・`index.css` | 読む面のタブ・下書きの持ち上げ |
| `apps/topic-web/tests/topic-room.test.tsx` | タブと下書き |
| `apps/timer-web/src/ui/Session.tsx` | `-aside` → `-side`・`--side-end` |
| `e2e/specs/layout.spec.ts`・`invite-sheet-md.spec.ts`・`poker-a11y.spec.ts`・`topic.spec.ts` | 新しい構造 |
| `packages/ui/README.md`・`docs/adr/0025-responsive-layout.md` | 区画の選び方・読む面 |

---

### Task 1: 部品（2 区画・読む面・シート）

**Files:** `packages/ui/src/components/layout.css`（書き換え）・`reader.css`・`drawer.css`（新規）・`index.css`

**Interfaces（後のタスクが使うクラス）:**
- `.ui-workspace`・`.ui-workspace-main`・`.ui-workspace-side`・`.ui-workspace--side-end`・`.ui-workspace--reader`
- `.ui-reader`（象牙の札の外枠）・`.ui-reader-head`（見出し。固定）・`.ui-reader-body`（本文。スクロール）・`.ui-reader-more`（続きを読むのボタン。64rem 未満だけ見える）・`.ui-reader-tabs`（タブの並び。お題ツールが使う）
- `.ui-drawer`（`<dialog>` に当てる。下からのシート）・`.ui-drawer-head`・`.ui-drawer-body`

- [ ] **Step 1: `layout.css` の段組みを書き換える**（器の `.ui-page*` の規則はそのまま残す。段組みの部分を次に置き換える）

```css
/* 段組み（#316 §9・ADR 0025 決定 3）。操作の面（-main）と脇（-side）の 2 区画。
   狭い幅では DOM の順に縦へ積む（DOM は狭い幅で見せたい順に書く）。64rem 以上で横に並べる。
   脇は既定で左・22rem。--side-end で右へ、--reader で脇を読む面（操作の面と釣り合う比）にする。 */
.ui-workspace {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-6);
  align-items: start;
}

.ui-workspace-main,
.ui-workspace-side {
  box-sizing: border-box;
  min-width: 0;
}

@media (width >= 64rem) {
  .ui-workspace {
    grid-template-columns: 22rem minmax(0, 1fr);
  }

  .ui-workspace-side {
    grid-column: 1;
    grid-row: 1;
  }

  .ui-workspace-main {
    grid-column: 2;
    grid-row: 1;
  }

  .ui-workspace--side-end {
    grid-template-columns: minmax(0, 1fr) 22rem;
  }

  .ui-workspace--side-end > .ui-workspace-side {
    grid-column: 2;
  }

  .ui-workspace--side-end > .ui-workspace-main {
    grid-column: 1;
  }

  /* 読む面は 1 行 35〜45 字に収まる比。操作の面を押しつぶさない。 */
  .ui-workspace--reader {
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1fr);
  }

  .ui-workspace--reader.ui-workspace--side-end {
    grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr);
  }
}
```

（`.ui-workspace--reader.ui-workspace--side-end` の詳細度は (0,2,0)。部品層の規則の範囲内。）

- [ ] **Step 2: `reader.css` を書く**

```css
/* 読む面（#316 §9・D3''）。象牙の札に見出し（固定）と本文（札の中でスクロール）を載せる。
   64rem 以上では画面の高さに収め、説明が長くてもページ全体を伸ばさない。
   64rem 未満では本文を 3 行で切り、.ui-reader-more（続きを読む）で .ui-drawer に全文を出す。
   札の上の字の色（--coal）は .ui-sheet と同じ知識なので、札の地と字をここで持つ。 */
.ui-reader {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--card-edge);
  border-radius: var(--radius-lg);
  background: linear-gradient(160deg, var(--card-sheen), var(--card-shade));
  color: var(--coal);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.ui-reader-head {
  box-sizing: border-box;
  padding: var(--space-5) var(--space-5) var(--space-3);
  border-bottom: 1px solid var(--card-inline);
}

.ui-reader-tabs {
  display: flex;
  gap: var(--space-1);
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--card-inline);
}

.ui-reader-body {
  box-sizing: border-box;
  padding: var(--space-4) var(--space-5);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.ui-reader-more {
  align-self: flex-start;
  margin: 0 var(--space-5) var(--space-4);
}

@media (width >= 64rem) {
  .ui-reader {
    position: sticky;
    top: var(--space-4);
    max-height: calc(100dvh - var(--space-4) * 2);
  }

  .ui-reader-body {
    display: block;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    /* 下端をぼかして続きがあることを示す（スクロールの終わりでもぼかしは残るが、本文の下の余白に掛かる） */
    mask-image: linear-gradient(to bottom, var(--coal) calc(100% - var(--space-6)), transparent);
  }

  .ui-reader-more {
    display: none;
  }
}
```

（`mask-image` の色は不透明さだけが効くので、トークンの `--coal` で書く（生の色の検査）。）

- [ ] **Step 3: `drawer.css` を書く**

```css
/* 下からのシート（#316 §9・D3''）。<dialog> に当て、showModal() で開く。
   狭い幅で読む面の全文を出す。閉じるボタンと Esc で閉じ、開いたボタンへフォーカスを戻す（画面の側）。 */
.ui-drawer {
  box-sizing: border-box;
  width: 100%;
  max-width: 40rem;
  max-height: 85dvh;
  margin: auto auto 0;
  padding: 0;
  border: 1px solid var(--card-edge);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: linear-gradient(160deg, var(--card-sheen), var(--card-shade));
  color: var(--coal);
  box-shadow: var(--shadow-dialog);
}

.ui-drawer[open] {
  display: flex;
  flex-direction: column;
}

.ui-drawer::backdrop {
  background: var(--felt-shade);
}

.ui-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--card-inline);
}

.ui-drawer-body {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-4) var(--space-5) calc(var(--space-5) + env(safe-area-inset-bottom));
  overflow-wrap: anywhere;
}
```

`index.css` の末尾に `@import './reader.css';` と `@import './drawer.css';` を足す。

- [ ] **Step 4: 検査** — `pnpm --filter @tasuki/ui lint && pnpm --filter @tasuki/ui test` が緑。`node scripts/audit-ui-components.mjs` は**死んだ部品で赤になるのが正しい**（画面がまだ使っていない）。部品の CSS の規則違反（`[部品の CSS]`）が 0 件であることを確かめる。`::backdrop` が「セレクタの先頭が `.ui-`」を満たすことも確かめる（落ちたら止まって報告）

- [ ] **Step 5: コミット** — `feat: 段組みを読む面と操作の面の 2 区画にし、読む面とシートの部品を置く（#316 PR 1）`

---

### Task 2: poker

**Files:** `apps/poker-web/src/components/CurrentTopic.tsx`・`ParticipantList.tsx`・`pages/RoomPage.tsx`・`src/index.css`・`tests/current-topic.test.tsx`・`e2e/specs/invite-sheet-md.spec.ts`・`e2e/specs/poker-a11y.spec.ts`

**Interfaces:** Task 1 のクラス。`CurrentTopic` は `{ topic: Topic }` のまま

- [ ] **Step 1: 単体テストを先に書き換える**（`tests/current-topic.test.tsx`。`<details>` の「説明を見る」を前提にした検査を、次の性質へ）
  - 見出し「お題」とタイトルが出る。本文は畳まずに読む面の本文（`role="region"`・`aria-label` はタイトル・`tabindex="0"`）に出る
  - 「続きを読む」ボタンがあり、押すと `<dialog>`（名前はタイトル）が開いて本文が出る。閉じるボタンで閉じ、フォーカスが「続きを読む」へ戻る（jsdom は `showModal` が無いので `HTMLDialogElement.prototype.showModal` / `close` を差し替える。差し替えは `afterEach` で戻す）
  - 本文が空のお題では本文の領域も「続きを読む」も出ない
  赤を見る

- [ ] **Step 2: `CurrentTopic.tsx` を読む面にする**

```tsx
export const TOPIC_HEADING = 'お題';
export const READ_MORE = '続きを読む';
export const CLOSE = '閉じる';

export function CurrentTopic({ topic }: { topic: Topic }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const hasBody = topic.body !== '';
  const close = () => {
    dialogRef.current?.close();
    moreRef.current?.focus();
  };
  return (
    <section className="topic ui-reader" aria-labelledby="poker-topic-heading">
      <div className="ui-reader-head">
        <h2 id="poker-topic-heading">{TOPIC_HEADING}</h2>
        <h3 className="topic-title">{topic.title}</h3>
      </div>
      {hasBody && (
        <>
          <div className="ui-reader-body" role="region" aria-label={topic.title} tabIndex={0}>
            <Markdown source={topic.body} />
          </div>
          <button ref={moreRef} type="button" className="secondary ui-reader-more" onClick={() => dialogRef.current?.showModal()}>
            {READ_MORE}
          </button>
          <dialog ref={dialogRef} className="ui-drawer" aria-labelledby="poker-topic-drawer-title" onClose={() => moreRef.current?.focus()}>
            <div className="ui-drawer-head">
              <h3 id="poker-topic-drawer-title">{topic.title}</h3>
              <button type="button" className="secondary" onClick={close}>{CLOSE}</button>
            </div>
            <div className="ui-drawer-body">
              <Markdown source={topic.body} />
            </div>
          </dialog>
        </>
      )}
    </section>
  );
}
```

ファイル冒頭の注釈を書き直す（読む面・札の上の字の色は `.ui-reader` が持つ・`TOPIC_BODY_TOGGLE` を消した理由）。`TOPIC_BODY_TOGGLE` を参照する箇所（`tests/topic-copy-fits-font-base.test.ts` など）を `READ_MORE` と `CLOSE` に替える。**お題の h2 の金の字は象牙の札の上では読めないので、`.topic h2` の色を `--gold-deep` 以上の暗さにするか、`--coal-soft` にする**（`poker-a11y.spec.ts` のコントラストの走査で確かめる。既存の `.topic` の規則と `.room section:not(.topic) > h2` の地の規則を読み、象牙の地の上で AA を満たす色を選ぶ）

- [ ] **Step 3: 場（参加者）を横並びにする** — `ParticipantList` は DOM と読み上げを変えず、`apps/poker-web/src/index.css` の `.participants` を `flex-direction: row; flex-wrap: wrap` の席の並びにする（各 `li` は伏せた札・名前・状態を縦に積んだ席。幅 5.5rem 程度・名前は `overflow-wrap: anywhere`・`min-width: 0`）。PR 1 で足した長い名前の E2E がそのまま通ること

- [ ] **Step 4: `RoomPage.tsx` の段組みを替える**

```tsx
      <div className="ui-workspace ui-workspace--reader">
        {sync.topic && (
          <div className="ui-workspace-side">
            <CurrentTopic topic={sync.topic} />
          </div>
        )}
        <div className="ui-workspace-main room-main">
          <section>
            <h2>参加者（{snapshot.participants.length}人）</h2>
            <ParticipantList participants={snapshot.participants} you={snapshot.you} />
          </section>
          {isVoting ? <VotingSection snapshot={snapshot} sync={sync} /> : <RevealedSection snapshot={snapshot} sync={sync} />}
        </div>
      </div>
```

お題が無いとき（`sync.topic` が null）は脇が無いので、`.ui-workspace--reader` の 2 列が空の列を作らないよう、**お題が無いときは `ui-workspace--reader` を付けず `ui-workspace` だけにし、さらに脇が無いことで主が 1 列目に入るよう `.room-main` に `grid-column: 1 / -1` を当てる**（画面の CSS・64rem 以上）。`.room-main` は縦に積む（`display: grid; gap: var(--space-5)`）

- [ ] **Step 5: E2E の書き換え** — `invite-sheet-md.spec.ts` と `poker-a11y.spec.ts` で `details > div` / 「説明を見る」を前提にした箇所を、読む面の本文（`getByRole('region', { name: <タイトル> })`）に替える。札の上の Markdown の色の検査は読む面の本文で行う。`cd e2e && TASUKI_E2E_TARGET=local pnpm exec playwright test specs/invite-sheet-md.spec.ts specs/poker-a11y.spec.ts specs/poker.spec.ts` が緑

- [ ] **Step 6:** `pnpm --filter @tasuki/poker-web test` と型が緑。コミット `feat: poker のお題を読む面にし、参加者を場として横に並べる（#316 PR 1）`

---

### Task 3: お題ツール

**Files:** `apps/topic-web/src/components/CurrentTopic.tsx`・`TopicEditor.tsx`・`screens/TopicRoom.tsx`・`src/copy.ts`・`src/index.css`・`tests/topic-room.test.tsx`・`e2e/specs/topic.spec.ts`

**Interfaces:**
- `TopicEditor` に `onDraftChange?: (draft: { title: string; body: string }) => void` を足す（打つたびに呼ぶ。送って欄を空にしたときも空で呼ぶ）
- `CurrentTopic` に `draft: { title: string; body: string }` を足す

- [ ] **Step 1: 単体テストを先に書く**（`tests/topic-room.test.tsx`）
  - いまのお題があるとき、読む面のタブは「いまのお題」が選ばれていて、お題が出る
  - 「書く」のタイトルに打つと、タブが「下書きの見え方」へ切り替わり、下書き（印「下書き（まだ公開していません）」・打ったタイトル）が出る
  - 下書きを見ている間に手で「いまのお題」を選んだら、続けて打っても「いまのお題」のまま（毎打鍵で上書きしない）。下書きを空にしてからまた打ち始めたときだけ自動で切り替わる
  - 「このお題にする」で送ると、タブが「いまのお題」へ戻る
  - タブは `role="tablist"` / `tab` / `tabpanel`・`aria-selected`・左右の矢印で移動（既存の timer の `Tabs` の作法を読んで合わせる。部品の共有はしない）
  赤を見る

- [ ] **Step 2: 下書きを `TopicRoom` へ持ち上げる** — `TopicRoom` に `const [draft, setDraft] = useState({ title: '', body: '' })` を置き、`TopicEditor` の `onDraftChange={setDraft}` と `CurrentTopic` の `draft={draft}` を配線する。`TopicEditor` は内部の `title` / `body` が変わるたびに `onDraftChange` を呼ぶ（`useEffect` で）。既存のプレビュー（`.topic-compose-preview`）と切り替え（`.topic-compose-toggle`）は 64rem 未満のためにそのまま残し、**64rem 以上では CSS で隠す**（`apps/topic-web/src/index.css` に `@media (width >= 64rem) { .topic-compose-preview, .topic-compose-toggle { display: none; } }`。`.topic-compose-panes` は 1 列）

- [ ] **Step 3: `CurrentTopic` を読む面＋タブにする** — `section.topic-current` を `.ui-reader` にし、`aria-busy` と知らせの置き方（ファイル冒頭の注釈）は保つ。`.ui-reader-head` に見出し「いまのお題」、その下に `.ui-reader-tabs`（「いまのお題」「下書きの見え方」の 2 タブ）、タブパネルの中に `.ui-reader-body`（`tabindex="0"`）。下書きのパネルは印「下書き（まだ公開していません）」と `TopicSheet` を使わず本文だけ（タイトル＋Markdown）を出す（札の中に札を入れない）。下書きが空なら「書くと、ここに見え方が出ます」（既存の `PREVIEW_EMPTY` を使う）。「お題を下ろす」は読む面の下端（`.ui-reader` の中の最後）に置く。狭い幅の「続きを読む」と `.ui-drawer` は poker と同じ作り（いまのお題のタブの本文だけ）。文言は `copy.ts` に足す
  自動切り替えの規則: 下書きが「空 → 空でない」に変わった瞬間だけ「下書きの見え方」へ。送って空に戻ったら「いまのお題」へ。それ以外は利用者の選択を保つ

- [ ] **Step 4: 段組みを替える**（`TopicRoom.tsx`）: `<div className="ui-workspace ui-workspace--reader ui-workspace--side-end">` の中を、狭い幅で いまのお題 → 作る・書く の順になるよう **`-side`（CurrentTopic）を先・`-main`（TopicMaker・TopicEditor）を後**に書く。`TopicMaker` の帯を 64rem 以上で 1 行にする（既存の `@container make` の規則が効く幅か確かめる。足りなければ `.topic-make` の中の並びを `flex-wrap` で 1 行に寄せる。値は実画面で決めて報告）

- [ ] **Step 5: E2E** — `topic.spec.ts` のうち、1280px で「説明の欄とプレビューが並ぶ」ことを見ているテスト（:331 付近）と、プレビューの AA 走査（:381 付近）を、**64rem 以上では読む面の下書きのタブで見る**形に書き換える。768px 以下でプレビューへ切り替える既存のテストはそのまま。`cd e2e && TASUKI_E2E_TARGET=local pnpm exec playwright test specs/topic.spec.ts` が緑

- [ ] **Step 6:** `pnpm --filter @tasuki/topic-web test`・型・`tests/*fits-font-base*` が緑。コミット `feat: お題ツールのいまのお題を読む面にし、下書きの見え方をタブで出す（#316 PR 1）`

---

### Task 4: timer の読み替えと段組みの E2E

**Files:** `apps/timer-web/src/ui/Session.tsx`・`e2e/specs/layout.spec.ts`

- [ ] **Step 1:** `Session.tsx` の `<div className="ui-workspace">` を `<div className="ui-workspace ui-workspace--side-end">` に、`ui-workspace-aside` を `ui-workspace-side` に替える。2 列の注釈を「脇（参加者・メモ）は右・22rem」に直す。timer の見た目が変わらないこと（右 22rem・間 2rem）を撮影で確かめる

- [ ] **Step 2: `layout.spec.ts` を書き換える**（PR 1 の 3 区画の検査を、2 区画と読む面の検査に置き換える。器の幅・横溢れ・長い名前・44px の注釈の検査は残す）
  - poker 1280 / 1920: 読む面が左・操作の面が右・上端が揃う・**長い説明（40 行程度の Markdown）でも `document.documentElement.scrollHeight <= innerHeight + 2rem`**・読む面の本文の `scrollHeight > clientHeight`（中でスクロールしている）・読む面の右端 ≤ 操作の面の左端
  - poker 320: 横に溢れない・読む面の本文が 3 行で切れている（本文の高さ ≤ 行の高さ × 3.5）・「続きを読む」でシートが開き、Esc で閉じ、フォーカスが「続きを読む」へ戻る
  - お題ツール 1280 / 1920: 読む面が右・操作の面が左・長い説明でもページが伸びない・器の内側 ≥ 1152px（1280）
  - お題ツール 320: 横に溢れない・DOM の順に いまのお題 → 作る の順に積む
  - timer 1280: 脇が右・上端が揃う・下に空きを残さない（PR 1 の右脇に高さを与える検査を `-side` に読み替える）
  - お題が無い poker 1280: 操作の面が器の内側の幅いっぱい（空の列を残さない）
  まず流して、構造を変える前の Task 1〜3 の結果に対して緑になることを確かめる（このタスクは Task 1〜3 の後に行う）

- [ ] **Step 3:** コミット `test: 段組みの E2E を読む面と操作の面の形に替える（#316 PR 1）`

---

### Task 5: 検査一式と破壊検証

- [ ] **Step 1: 破壊検証（コミットしない）** — `reader.css` の 64rem 以上の `max-height` を消す → poker 1920 の「ページが伸びない」が赤。`position: sticky` を消しても上の検査が赤になるかを見る（ならなければ、操作の面が長い場面で読む面が上に置き去りになることを見る検査を足す）。`layout.css` の `--side-end` の規則を消す → お題ツールと timer の左右の検査が赤。毎回 `git restore` で戻し、前後で `git status --porcelain` が空
- [ ] **Step 2:** `node scripts/audit-ui-components.mjs` が緑（死んだ部品なし）。手元の CI 一式（`pnpm test`・`lint`・`typecheck`・scripts の自己テスト・全 audit・リンク検査）・E2E 全件・`node scripts/mutation-check.mjs` 全件検出。出力はファイルへ保存してから読む

---

### Task 6: 文書・撮影・利用者への確認（controller）

- [ ] **Step 1: 文書**（実装役）— `packages/ui/README.md` の「画面を組む」の段組みの節を 2 区画と読む面に書き換える（区画の表・`--side-end` と `--reader` の選び方・読む面とシートの使い方・「説明が長くてもページを伸ばさない」の理由）。ADR 0025 の決定 3 を「操作の面と脇の 2 区画・読む面」に改め、改めた日付と理由（§9.1）を書く。設計正本の D3 と D7 の冒頭に「§9 で置き換えた」の注記を足す（本文は書き換えない）。数と画面の列挙を書かない
- [ ] **Step 2: 撮影（controller）** — `e2e/inventory-316/` の撮影と `topic-open.inv.ts`（長い説明）を流し、poker・お題ツールを 1280・1920・390 で**自分で見て釣り合いを判断する**。崩れがあれば直してから先へ
- [ ] **Step 3:** ブランチ全体のレビュー → 修正 → push（#347 を更新）→ 利用者に Chrome で見てもらう
