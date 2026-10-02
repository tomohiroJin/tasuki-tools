# 説明のプレビューを付け、広い「書く」では並べ、狭い「書く」では切り替える（#313 PR 2）実装計画

> **作業者へ:** 必須サブスキル —— `superpowers:subagent-driven-development`（推奨）または
> `superpowers:executing-plans` を使って 1 タスクずつ実装すること。
> 手順のチェックボックス（`- [ ]`）で進捗を追う。

**ゴール**: 「書く」に説明のプレビューを足す。プレビューはいまのお題と同じ札の部品で描く。「書く」の幅が 48rem 以上なら
説明の欄とプレビューを並べ、未満なら「書く」「プレビュー」の切り替えで片方を出す。

**方式**: `CurrentTopic` の札を `TopicSheet` に切り出し、いまのお題とプレビューで共有する。並べるか切り替えるかは
**CSS が決める**（容器クエリと `data-mode`）。React の木は幅によらず同じにする。部品層（`@tasuki/ui`）は変えない。

**技術**: React（`useDeferredValue`）/ 素の CSS（`container`・`@container`）/ Vitest + Testing Library（jsdom）/ Playwright（E2E）

**設計正本**: `docs/superpowers/specs/2026-09-30-topic-input-and-preview-design.md`（**計画は正本に従属する。両方を読むこと**）。
この計画は正本 §7 の **PR 2**（D6〜D10・FR-007〜FR-013）だけを扱う。**PR 1 が main に入ってから着手する**（ページ幅が無いと
並ぶ幅に届かない）。

## この計画で決めたこと（正本に無い細部）

| # | 決定 | 根拠 |
|---|---|---|
| P1 | `TopicSheet` は `{ title: string; body: string }` を受け、`<article className="ui-sheet">` を返す。空白だけのタイトルの `<h3>` は描かない。説明が空なら `Markdown` を描かない（いまの `CurrentTopic` と同じ） | 正本 D6。いまのお題のタイトルは空白だけにならない（境界スキーマ）ので、`CurrentTopic` の見え方は変わらない |
| P2 | 説明の部分の構造: `<div className="topic-compose" data-mode>` の中に、切り替えの `<div role="group">`・`<div className="topic-compose-panes">`（`.topic-compose-write` と `.topic-compose-preview`） | 容器（`.topic-compose`）の子孫だけが容器クエリを受ける。切り替えも 2 つの枠も子孫に置く |
| P3 | 広いときだけ見える見出し代わりの `<p id className="topic-compose-caption">プレビュー</p>` を置き、プレビューの `<section>` は `aria-labelledby` でこれを指す。狭いときは CSS で隠す | 並べたときは切り替えのボタンが消え、右の列が何かを示すものが無くなる。`aria-labelledby` は隠れた要素も名前に使える |
| P4 | プレビューの札は `useDeferredValue` を通した `title`・`body` で描く | 正本 D6。打つたびに Markdown の解析で入力が止まらない |
| P5 | 切り替えの文言は `copy.ts` に 4 つ足す: `COMPOSE_MODE_LABEL = '説明の出し方'`・`WRITE_MODE_BUTTON = '書く'`・`PREVIEW_BUTTON = 'プレビュー'`・`PREVIEW_EMPTY = '説明を書くと、ここに見え方が出ます'` | いずれも base 層に収まる（正本 §3 の実測）。`WRITE_HEADING` と同じ字でも役割が違うので別の名にする |
| P6 | 押している方は素の `<button>`、押していない方は `className="secondary"`（正本 D8） | 要素層の見た目だけで組む |
| P7 | 変異は `mutation-check.mjs` に**登録しない**。Task 7 で手で壊して赤を見る。`TopicEditor.tsx` を変えるので、**既存の変異 m90 のパッチを最後に作り直す** | PR 1 と同じ（PR 1 で m90 のずれを CI が捕まえた） |

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。
様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 各タスクで失敗するテストを先に書き、赤を見てから実装する（Task 1〜6）。`TopicSheet` の切り出しは既存の「いまのお題」のテストを緑に保ったまま行う（振る舞いを変えないリファクタ） |
| II. 技術選定は ADR を通す | 該当なし | 新しい技術・依存を足さない。容器クエリは CSS の性質 |
| III. 揮発インメモリと単純運用 | 該当なし | 切り替えの状態は画面の中だけ。端末に残さない（正本 D9）。本番へは配らない |
| IV. 境界の型安全 | 該当なし | 境界を越えるデータを変えない |
| V. 実画面検証 | 通過 | Task 8 で 390・768・1280 を撮り、並ぶ・切り替わるを利用者に見せる |
| VI. 依存は内向き | 通過 | 解析は `@tasuki/markdown`、描画は `Markdown.tsx` のまま（ADR 0021 決定 7）。新しい判断を画面に持ち込まない |
| VII. 検査は壊して確かめる | 通過 | Task 7 で 4 か所を壊して赤を見る |
| VIII. 記録が正本 | 通過 | 決定は設計正本、細部はこの計画の P 表。#321 への申し送りは PR の本文と #321 のコメントに残す |
| IX. 小さく回す | 通過 | お題ツールの「書く」だけ。PR 1 と分ける（正本 §7） |
| X. 抽象は実需で | 通過 | `TopicSheet` はいまのお題とプレビューの 2 か所が使う（ADR 0007 基準 1）。切り替えは部品層に置かない（使うのは 1 画面。正本 D8） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密も個人情報も扱わない |

**逸脱なし。**

## 全体の制約

- **ブランチ**: `feature/issue-313-pr2-preview`（PR 1 が入った main から切る）
- **破壊検証の前に `git status --porcelain` が空であることを見る**
- **コミットしたらすぐ push する**。**本番へ配布しない**
- 画面の CSS に入力欄の型を含むセレクタ・生の色を書かない（`scripts/audit-ui-components.mjs`）。**`button` の型も書かない**（見た目は要素層に任せる）
- 新しい文言は `src/copy.ts` に置き、base 層に収める。**「字」「文」を使わない**
- プレビューに `aria-live` を付けない（正本 D6）
- E2E に書く説明の Markdown は英数字で書く（書体の層の検査に掛かる）
- コメント・docstring は日本語。「なぜ」を書く

## Review Focus

1. **プレビューといまのお題の札がずれる**（切り出しの後で片方だけにクラスや要素を足す）→ Task 3 の単体テストが 2 つの札の `outerHTML` を比べる
2. **広いのに切り替えが出る／狭いのに並ぶ**（容器クエリの閾値・容器の置き場の誤り）→ Task 6 の E2E が 390 と 1280 で見る
3. **狭い画面のプレビューのまま送って、次に書くとき欄が見えない**（送信で「書く」へ戻し忘れ）→ Task 4 の単体テスト
4. **切り替えのボタンの字が面の上で読めない**（`.secondary` を `felt-900` の上に置く組は既存にあるが、押している方の真鍮の地は新しい置き場）→ Task 6 の E2E の文字の走査
5. **`CurrentTopic` の既存のテストが、札を 2 つ見つけて曖昧になる**（プレビューにも同じ見出しが出る）→ 既存のテストは `currentTopic` の領域の中で探すので曖昧にならない。Task 3 で緑を見る

---

### Task 1: 文言を足す（P5）

**Files:**
- Modify: `apps/topic-web/src/copy.ts`

- [ ] **Step 1**: `BODY_HINT` の次に足す

```ts
// 説明の出し方の切り替え（#313 PR 2）。並べる幅では切り替えを出さず、プレビューの列の名前だけを出す
export const COMPOSE_MODE_LABEL = '説明の出し方';
export const WRITE_MODE_BUTTON = '書く';
export const PREVIEW_BUTTON = 'プレビュー';
export const PREVIEW_EMPTY = '説明を書くと、ここに見え方が出ます';
```

- [ ] **Step 2**: `copy-fits-font-base` が緑。コミットする（`feat: プレビューの文言を足す（#313 PR 2）`）

### Task 2: 札を切り出す（振る舞いを変えないリファクタ・D6）

**Files:**
- Create: `apps/topic-web/src/components/TopicSheet.tsx`
- Modify: `apps/topic-web/src/components/CurrentTopic.tsx`

- [ ] **Step 1**: 既存の `describe('いまのお題')` が緑であることを見る（切り出しの前の基準）
- [ ] **Step 2: 切り出す**

```tsx
import { Markdown } from './Markdown';

interface Props {
  readonly title: string;
  readonly body: string;
}

/**
 * お題の札（#313 正本 D6）。**いまのお題とプレビューの両方がこれを使う。**
 * 片方だけ直すと、このお題にする前と後で見え方がずれる（#313 の不満そのもの）。
 * 空白だけのタイトルの見出しは描かない（プレビューでは書きかけのことがある）。
 */
export function TopicSheet({ title, body }: Props) {
  return (
    <article className="ui-sheet">
      {title.trim() !== '' && <h3 className="topic-title">{title}</h3>}
      {body !== '' && <Markdown source={body} className="topic-body" />}
    </article>
  );
}
```

`CurrentTopic` の `<article>…</article>` を `<TopicSheet title={topic.title} body={topic.body} />` に替え、`Markdown` の import を外す。

- [ ] **Step 3**: 既存の `describe('いまのお題')` と `rendered-text-fits-font-base` が緑のまま
- [ ] **Step 4: コミットする**（`refactor: お題の札を TopicSheet に切り出す（#313 PR 2）`）

### Task 3: プレビューを描く（FR-007・FR-008・SC-004）

**Files:**
- Modify: `apps/topic-web/tests/topic-room.test.tsx`（`describe('書く')` の後に `describe('プレビュー')` を足す）
- Modify: `apps/topic-web/src/components/TopicEditor.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```ts
const preview = () => screen.getByRole('region', { name: copy.PREVIEW_BUTTON });

describe('プレビュー', () => {
  it('Given 何も書いていない / When プレビューを見る / Then 書くと見え方が出ると伝える', () => {
    enterWith();
    expect(within(preview()).getByText(copy.PREVIEW_EMPTY)).toBeInTheDocument();
  });

  it('Given タイトルと Markdown の説明を書いた / When プレビューを見る / Then 見出しと箇条書きとして出る', () => {
    enterWith();
    fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
    fireEvent.change(bodyField(), { target: { value: '# Rules\n\n- fizz\n- buzz' } });
    expect(within(preview()).getByRole('heading', { level: 3, name: 'FizzBuzz' })).toBeInTheDocument();
    expect(within(preview()).getByRole('heading', { level: 4, name: 'Rules' })).toBeInTheDocument();
    expect(within(preview()).getAllByRole('listitem')).toHaveLength(2);
    expect(within(preview()).queryByText(copy.PREVIEW_EMPTY)).toBeNull();
  });

  it('Given 書いた / When このお題にして、いまのお題に出る / Then プレビューの札と同じ中身で出る', () => {
    enterWith();
    fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
    fireEvent.change(bodyField(), { target: { value: '# Rules\n\n- **fizz**\n\n> note' } });
    const previewed = within(preview()).getByRole('article').outerHTML;
    fireEvent.click(setButton());
    act(() =>
      latestSocket().deliver({
        type: 'topic',
        state: { ...IDLE_STATE, topic: { title: 'FizzBuzz', body: '# Rules\n\n- **fizz**\n\n> note', source: 'manual' } },
      }),
    );
    const current = screen.getByRole('region', { name: copy.CURRENT_HEADING });
    expect(within(current).getByRole('article').outerHTML).toBe(previewed);
  });

  it('Given プレビュー / When 領域を見る / Then 打つたびに読み上げる印を持たない', () => {
    enterWith();
    expect(preview()).not.toHaveAttribute('aria-live');
  });
});
```

`<article>` の暗黙のロールは `article`。`within` は `@testing-library/react` から import する（既存の import に足す）。

- [ ] **Step 2: 赤を見る**（プレビューの領域が無い）
- [ ] **Step 3: 実装する**（`TopicEditor.tsx`。説明の欄と数字の行を `.topic-compose-write` に入れ、隣に `.topic-compose-preview` を置く）

```tsx
const deferredTitle = useDeferredValue(title);
const deferredBody = useDeferredValue(body);
const previewId = useId();
const isBlank = deferredTitle.trim() === '' && deferredBody.trim() === '';
// …
<div className="topic-compose" data-mode={mode}>
  {/* 切り替えは Task 4 で足す */}
  <div className="topic-compose-panes">
    <div className="topic-compose-write">
      {/* PR 1 の説明のラベル・欄・数字の行をそのまま移す */}
    </div>
    <section className="topic-compose-preview" aria-labelledby={previewId}>
      <p id={previewId} className="topic-compose-caption">{PREVIEW_BUTTON}</p>
      {isBlank ? <p className="ui-note">{PREVIEW_EMPTY}</p> : <TopicSheet title={deferredTitle} body={deferredBody} />}
    </section>
  </div>
</div>
```

`mode` は Task 4 で足す。この Task では `data-mode="write"` の固定でよい。

- [ ] **Step 4**: 緑を見る。`describe('書く')` と `rendered-text-fits-font-base` も緑
- [ ] **Step 5: コミットする**（`feat: 説明のプレビューを札の部品で描く（#313 PR 2）`）

### Task 4: 切り替え（FR-011〜FR-013・NFR-003・D9）

**Files:**
- Modify: `apps/topic-web/tests/topic-room.test.tsx`（`describe('プレビュー')` に足す）
- Modify: `apps/topic-web/src/components/TopicEditor.tsx`

jsdom は CSS を読まないので、**単体テストが見るのは「押している印」と `data-mode` まで**。見える・隠れるは Task 6 の E2E が見る。

- [ ] **Step 1: 失敗するテストを書く**

```ts
const modeGroup = () => screen.getByRole('group', { name: copy.COMPOSE_MODE_LABEL });
const modeButton = (name: string) => within(modeGroup()).getByRole('button', { name });
const compose = () => bodyField().closest('.topic-compose');

it('Given 画面 / When 切り替えを見る / Then 書くが押されている', () => {
  enterWith();
  expect(modeButton(copy.WRITE_MODE_BUTTON)).toHaveAttribute('aria-pressed', 'true');
  expect(modeButton(copy.PREVIEW_BUTTON)).toHaveAttribute('aria-pressed', 'false');
  expect(compose()).toHaveAttribute('data-mode', 'write');
});

it('Given 書く / When プレビューを押す / Then プレビューが押され、出し方がプレビューになる', () => {
  enterWith();
  fireEvent.click(modeButton(copy.PREVIEW_BUTTON));
  expect(modeButton(copy.PREVIEW_BUTTON)).toHaveAttribute('aria-pressed', 'true');
  expect(modeButton(copy.WRITE_MODE_BUTTON)).toHaveAttribute('aria-pressed', 'false');
  expect(compose()).toHaveAttribute('data-mode', 'preview');
});

it('Given プレビューを出している / When このお題にする / Then 書くへ戻る', () => {
  enterWith();
  fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
  fireEvent.click(modeButton(copy.PREVIEW_BUTTON));
  fireEvent.click(setButton());
  expect(compose()).toHaveAttribute('data-mode', 'write');
});

it('Given プレビューを出している / When 書き直す / Then プレビューのまま、いまのお題が出る', () => {
  enterWith({ ...IDLE_STATE, topic: FIZZ });
  fireEvent.click(modeButton(copy.PREVIEW_BUTTON));
  fireEvent.click(screen.getByRole('button', { name: copy.REWRITE_BUTTON }));
  expect(compose()).toHaveAttribute('data-mode', 'preview');
  expect(within(preview()).getByRole('heading', { level: 3, name: 'FizzBuzz' })).toBeInTheDocument();
});

it('Given 切り替えのボタン / When 押す / Then フォームを送らない', () => {
  enterWith();
  fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
  const before = latestSocket().sentJson().length;
  fireEvent.click(modeButton(copy.PREVIEW_BUTTON));
  expect(latestSocket().sentJson()).toHaveLength(before);
});
```

- [ ] **Step 2: 赤を見る**
- [ ] **Step 3: 実装する**

```tsx
const [mode, setMode] = useState<'write' | 'preview'>('write');
// onSubmit の中で setTitle('') / setBody('') の後に setMode('write')（正本 D9）
// …
<div className="topic-compose" data-mode={mode}>
  <div className="topic-compose-toggle" role="group" aria-label={COMPOSE_MODE_LABEL}>
    <button type="button" className={mode === 'write' ? undefined : 'secondary'} aria-pressed={mode === 'write'} onClick={() => setMode('write')}>
      {WRITE_MODE_BUTTON}
    </button>
    <button type="button" className={mode === 'preview' ? undefined : 'secondary'} aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>
      {PREVIEW_BUTTON}
    </button>
  </div>
  {/* Task 3 の .topic-compose-panes */}
</div>
```

- [ ] **Step 4**: 緑を見る。コミットする（`feat: 説明の出し方を書くとプレビューで切り替える（#313 PR 2）`）

### Task 5: 並べる・切り替えるの CSS（FR-009〜FR-012・D7）

**Files:**
- Modify: `apps/topic-web/src/index.css`

赤は Task 6 の E2E で見る。**Task 6 の Step 1〜2 を先にやってから** ここへ戻る。

- [ ] **Step 1: 書く**

```css
/* ---------- 説明の出し方（#313 正本 D7） ----------
   並べるか切り替えるかは「書く」の容器の幅で決める（ページの幅ではない）。React の木は幅によらず同じ。 */
.topic-compose {
  container: compose / inline-size;
  display: grid;
  gap: var(--space-3);
}

.topic-compose-toggle {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.topic-compose-panes {
  display: grid;
  gap: var(--space-4);
  align-items: start;
}

.topic-compose-write,
.topic-compose-preview {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}

/* 狭いときは選んだ方だけを出す。広いときの見出し代わりも隠す（切り替えのボタンが名前を示す）。 */
.topic-compose[data-mode='preview'] .topic-compose-write,
.topic-compose[data-mode='write'] .topic-compose-preview,
.topic-compose-caption {
  display: none;
}

/* 並べる。閾値 48rem は正本 D7（1120px のページで各列 約 500px、768px の画面では切り替え）。 */
@container compose (width >= 48rem) {
  .topic-compose-toggle {
    display: none;
  }

  .topic-compose-panes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .topic-compose[data-mode] .topic-compose-write,
  .topic-compose[data-mode] .topic-compose-preview {
    display: grid;
  }

  .topic-compose-caption {
    display: block;
    margin: 0;
  }
}
```

`.topic-compose-caption` の字の大きさと色は要素層の `label` に揃える（`--font-size-sm`・`--ivory-dim`。隣の列の「説明」のラベルと並ぶので、同じ見え方にした。トークンなので生の色の検査には掛からない）。

**詳細度に注意**: 広いときの `.topic-compose[data-mode] .topic-compose-write` は、狭いときの `.topic-compose[data-mode='preview'] .topic-compose-write` と同じ詳細度（クラス 2・属性 1）で、後に書いてあるので勝つ。順序を入れ替えないこと。

- [ ] **Step 2**: `node scripts/audit-ui-components.mjs` が通る
- [ ] **Step 3**: Task 6 の E2E が緑
- [ ] **Step 4: コミットする**（`feat: 広い書くでは説明とプレビューを並べる（#313 PR 2）`）

### Task 6: 並ぶ・切り替わるの E2E（SC-002・SC-003・SC-005・NFR-002）

**Files:**
- Modify: `e2e/specs/topic.spec.ts`（`describe('長いタイトルと広いページ（#313 PR 1）')` の後に describe を足す）

- [ ] **Step 1: 失敗するテストを書く**

```ts
const MD_BODY = ['# Rules', '', '- fizz', '- buzz'].join('\n');

test.describe('説明のプレビュー（#313 PR 2）', () => {
  test('Given 幅 1280 / When 説明を書く / Then 説明の欄とプレビューが並び、切り替えは出ない', async ({ page, consoleWatcher }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTopicTool(page, 'side-topic');
    await page.getByLabel('タイトル', { exact: true }).fill('FizzBuzz');
    const field = page.getByLabel('説明（なくてもよい）');
    await field.fill(MD_BODY);
    const preview = page.getByRole('region', { name: 'プレビュー' });
    await expect(preview.getByRole('heading', { level: 4, name: 'Rules' })).toBeVisible();
    await expect(field).toBeVisible();
    const [f, p] = [await field.boundingBox(), await preview.boundingBox()];
    expect(p!.x, 'プレビューが説明の欄の右に無い').toBeGreaterThanOrEqual(f!.x + f!.width);
    expect(Math.abs(p!.y - f!.y), '同じ行に無い').toBeLessThan(40);
    await expect(page.getByRole('group', { name: '説明の出し方' })).toBeHidden();
    expect(consoleWatcher.errors).toEqual([]);
  });

  for (const width of [390, 768]) {
    test(`Given 幅 ${width} / When プレビューを押す / Then 札が出て説明の欄が隠れ、送ると書くへ戻る`, async ({ page, consoleWatcher }) => {
      await page.setViewportSize({ width, height: 900 });
      await openTopicTool(page, `toggle-topic-${width}`);
      const field = page.getByLabel('説明（なくてもよい）');
      const preview = page.getByRole('region', { name: 'プレビュー' });
      await page.getByLabel('タイトル', { exact: true }).fill('FizzBuzz');
      await field.fill(MD_BODY);
      await expect(preview).toBeHidden();
      await page.getByRole('button', { name: 'プレビュー' }).click();
      await expect(preview.getByRole('heading', { level: 4, name: 'Rules' })).toBeVisible();
      await expect(field).toBeHidden();
      await page.getByRole('button', { name: 'このお題にする' }).click();
      await expect(currentTopic(page).getByRole('heading', { name: 'FizzBuzz' })).toBeVisible();
      await expect(field).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(consoleWatcher.errors).toEqual([]);
    });
  }

  test('Given 幅 390 でプレビューを出す / When 文字を測る / Then 切り替えと札の字はすべて AA を満たす', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await openTopicTool(page, 'preview-a11y');
    await page.getByLabel('タイトル', { exact: true }).fill('FizzBuzz');
    await page.getByLabel('説明（なくてもよい）').fill(MD_BODY);
    await page.getByRole('button', { name: 'プレビュー' }).click();
    const [coal, ivory] = await resolveColors(page, ['--coal', '--ivory']);
    // 札の字（coal on ivory）を測ったことを固定する。押している切り替えの字の組は下の注記のとおり実測してから足す
    expectReadable(await scanContrast(page, 10), 8, [pairKey(coal!, ivory!)]);
  });
});
```

最後のテストの「測ったことを固定する組」は、押している切り替えのボタンの地（要素層の `button` のグラデーション）を `scanContrast` がどの組として報告するかを実装時に一度走らせて見てから書く（推測で書かない）。

- [ ] **Step 2: PR 1 の main のまま赤を見る**（プレビューの領域も切り替えも無い）
- [ ] **Step 3**: Task 3〜5 の後に緑を見る。既存の `topic.spec.ts` 全体と PR 1 の describe も緑（`setTopic` は既定の「書く」のまま説明を書くので影響しない）
- [ ] **Step 4: コミットする**（`test: 説明のプレビューの並びと切り替えを E2E で見る（#313 PR 2）`）

### Task 7: 破壊検証（原則 VII）

`git status --porcelain` が空であることを見てから、1 つずつ壊して赤を見て戻す。

| 壊すもの | 赤になるテスト |
|---|---|
| `CurrentTopic` を `TopicSheet` から戻し、札に `data-x` を足す（プレビューとずらす） | Task 3 の「同じ中身で出る」 |
| `onSubmit` の `setMode('write')` を消す | Task 4 の「書くへ戻る」・Task 6 の 390/768 |
| `@container` の塊を消す | Task 6 の 1280 |
| `.topic-compose[data-mode='preview'] .topic-compose-write` の規則を消す | Task 6 の 390/768（欄が隠れない） |

- [ ] 各行で赤を見た。戻したあと `git status --porcelain` が空

### Task 8: 実画面検証と申し送り（原則 V・VIII）

- [ ] **Step 1**: `pnpm dev` でお題ツールを開き、390・768・1280 を撮る（書く・プレビューの両方の状態）
- [ ] **Step 2**: 利用者に見せて確かめる: 並んだときの列の幅・切り替えのボタンの見た目（要素層のボタンのまま）・プレビューの札といまのお題の札の見え方
- [ ] **Step 3**: 使い終わった dev サーバーを止める（`ss -tlnp` で確認）
- [ ] **Step 4**: #321 にコメントで申し送る（切り替えのボタンは `SharedMemo` が素の CSS に移るとき部品層へ寄せる候補。正本 D8）
- [ ] **Step 5**: 確かめた結果を PR の本文に残す（写真と、利用者の判断）
