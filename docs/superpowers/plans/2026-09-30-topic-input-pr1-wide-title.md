# お題ツールの幅を広げ、長いタイトルを書きやすくする（#313 PR 1）実装計画

> **作業者へ:** 必須サブスキル —— `superpowers:subagent-driven-development`（推奨）または
> `superpowers:executing-plans` を使って 1 タスクずつ実装すること。
> 手順のチェックボックス（`- [ ]`）で進捗を追う。

**ゴール**: お題ツールのページを最大 1120px に広げ、「書く」を行いっぱいに置く。タイトルを折り返す複数行の欄にし、
説明の欄を書いた量に合わせて伸ばし、どちらにも書いた量を数字で出す。

**方式**: 画面の CSS（`apps/topic-web/src/index.css`）とマークアップ（`TopicEditor.tsx`）だけを変える。部品層（`@tasuki/ui`）は変えない。
改行の置き換えは純粋関数（`topic-view.ts`）に置き、Enter の送信は `TopicEditor` の `onKeyDown` に置く。

**技術**: React / 素の CSS（`field-sizing`・`grid-column`）/ Vitest + Testing Library（jsdom）/ Playwright（E2E）

**設計正本**: `docs/superpowers/specs/2026-09-30-topic-input-and-preview-design.md`（**計画は正本に従属する。両方を読むこと**）。
この計画は正本 §7 の **PR 1**（D1〜D5・FR-001〜FR-006・FR-014・FR-015）だけを扱う。

## この計画で決めたこと（正本に無い細部）

| # | 決定 | 根拠 |
|---|---|---|
| P1 | 書いた量の行は `<p className="topic-field-meta ui-note">` に 2 つの `<span>`（左に添え書き、右に数字）。色は `.ui-note` が持ち、画面のクラスは並びと字の大きさだけを持つ | `packages/ui/README.md`「一言は色だけを持ちます」。画面のクラスに色を書かない |
| P2 | 数字の `<span>` に `id` を振り、欄の `aria-describedby` で指す。`useId()` から `${id}-count` を作る | いまの `TopicEditor` が `useId()` でラベルと欄を結んでいる形に揃える |
| P3 | タイトルの送信は `event.currentTarget.form?.requestSubmit()`。押せない状態（`canSubmit` が偽）でも `requestSubmit` は呼ぶ（`onSubmit` の中の `if (!canSubmit) return` が止める） | 送信の条件を 1 か所に保つ。Enter だけ別の条件を持たせない |
| P4 | 変換中の判定は `event.nativeEvent.isComposing \|\| event.keyCode === 229` | Safari は確定の Enter で `isComposing` が偽になり `keyCode` が 229 になる（既知の差）。どちらかが真なら送らない |
| P5 | `toSingleLine` は `\r\n` を先に 1 つの改行として扱い、改行 1 つを空白 1 つにする。**連続する空白は畳まない**（利用者が書いた空白を消さない） | `\r\n` を 2 つの空白にすると、Windows から貼った文だけ空白が増える |
| P6 | タイトルの欄の `rows={2}`・説明の欄の `rows={8}` | 正本 D3・D5 |
| P7 | 変異は `mutation-check.mjs` に**登録しない**。Task 6 で手で壊して赤を見る | #320 PR 2〜4 と同じ扱い |

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。
様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 各タスクで失敗するテストを先に書き、赤を見てから実装する（Task 1〜5） |
| II. 技術選定は ADR を通す | 該当なし | 新しい技術・依存を足さない。`field-sizing` は CSS の性質で、効かないブラウザでも入力はできる |
| III. 揮発インメモリと単純運用 | 該当なし | 同期サーバーと状態の持ち方に触れない。本番へは配らない |
| IV. 境界の型安全 | 該当なし | 境界スキーマ（`titleStr`）と上限を変えない。画面側で改行を空白にするだけ |
| V. 実画面検証 | 通過 | Task 7 で 390・768・1280・1920 の 4 幅を撮り、正本 §8 の「いまのお題」「作る」の横幅を利用者に見せる |
| VI. 依存は内向き | 通過 | 判断（改行の置き換え）は `topic-view.ts` の純粋関数に置き、画面から呼ぶ（`docs/adr/0015` MUST 1） |
| VII. 検査は壊して確かめる | 通過 | Task 6 で 3 か所を壊して赤を見る |
| VIII. 記録が正本 | 通過 | 決定は設計正本、細部はこの計画の P 表。数値の正本は設計正本 §3 |
| IX. 小さく回す | 通過 | お題ツールの 1 画面だけ。PR 2（プレビュー）と分ける（正本 §7） |
| X. 抽象は実需で | 通過 | 新しい部品を作らない。`toSingleLine` は画面の判断 1 つ |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密も個人情報も扱わない |

**逸脱なし。**

## 全体の制約

- **ブランチ**: `feature/issue-313-pr1-wide-title`（main から切る。この計画のコミットを含んだまま PR 1 にする）
- **破壊検証の前に `git status --porcelain` が空であることを見る**
- **コミットしたらすぐ push する**。**本番へ配布しない**
- 画面の CSS に入力欄の型（`textarea` など）を含むセレクタ・生の色を書かない（`scripts/audit-ui-components.mjs`）。配置はクラスで書く
- 部品の入力欄の字の大きさを上書きしない（16px の下限）
- 新しい文言は `src/copy.ts` に置く。画面に日本語を直書きしない。**「字」「文」を使わない**（base 層の外。正本 §3）
- テストに書く日本語は base 層に収める（`FizzBuzz` など英数字を主にする）
- E2E が同期サーバーの起動で即死したら、headroom のプロキシが 8787 を持っていないかを先に疑う
- コメント・docstring は日本語。「なぜ」を書く

## Review Focus

1. **日本語の確定の Enter で送ってしまう**（`isComposing` の見落とし・Safari の 229）→ Task 3 の単体テストが 2 通りを見る
2. **改行を含むタイトルが同期サーバーへ届く**（貼り付けの経路の置き換え漏れ）→ Task 3 のテストが `change` で改行を流し、送った `title` を見る
3. **ページの幅を `.page` で変えて poker まで広がる** → Task 5 の E2E は poker を見ない。レビューで `packages/ui` の差分が無いことを見る
4. **`.ui-note` の色が画面のクラスで上書きされる**（P1）→ `index.css` の `.topic-field-meta` に `color` が無いことを見る
5. **既存テストの `getByLabelText` の欄が `<input>` 前提**（`toHaveValue` は `<textarea>` でも通る）→ Task 3 で既存の「書く」の describe が緑のままであることを見る

---

### Task 1: 改行を空白にする純粋関数（FR-004）

**Files:**
- Modify: `apps/topic-web/tests/topic-view.test.ts`
- Modify: `apps/topic-web/src/topic-view.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
describe('タイトルを 1 行にする', () => {
  it.each([
    ['改行なし', 'FizzBuzz', 'FizzBuzz'],
    ['LF', 'Fizz\nBuzz', 'Fizz Buzz'],
    ['CRLF は 1 つの改行', 'Fizz\r\nBuzz', 'Fizz Buzz'],
    ['CR', 'Fizz\rBuzz', 'Fizz Buzz'],
    ['連続する改行は 1 つずつ', 'Fizz\n\nBuzz', 'Fizz  Buzz'],
    ['空白は畳まない', 'Fizz  Buzz', 'Fizz  Buzz'],
  ])('Given %s / When 1 行にする / Then 改行だけが空白になる', (_label, input, expected) => {
    expect(toSingleLine(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: `pnpm --filter @tasuki/topic-web test topic-view` で赤を見る**（`toSingleLine` が無い）
- [ ] **Step 3: 実装する**

```ts
/**
 * タイトルを 1 行にする（#313 正本 D3）。タイトルは各画面で見出しの素の文字として出るので、改行を持たせない。
 * `\r\n` は 1 つの改行として扱う（Windows から貼った文だけ空白が増えないように）。連続する空白は畳まない。
 */
export function toSingleLine(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ');
}
```

- [ ] **Step 4: 緑を見てコミットする**（`feat: タイトルの改行を空白にする判断を足す（#313 PR 1）`）

### Task 2: 添え書きの文言（D5）

**Files:**
- Modify: `apps/topic-web/src/copy.ts`

- [ ] **Step 1**: `BODY_LABEL` の次に足す

```ts
/** 説明の欄の下の添え書き（#313）。「字」「文」は base 層の外なので使わない。 */
export const BODY_HINT = 'Markdown で書けます';
```

- [ ] **Step 2**: `pnpm --filter @tasuki/topic-web test copy-fits-font-base` が緑（文言の件数が 1 増える。`> 30` のまま通る）

### Task 3: タイトルと説明の欄の振る舞い（FR-001〜FR-006）

**Files:**
- Modify: `apps/topic-web/tests/topic-room.test.tsx`（`describe('書く')` に足す）
- Modify: `apps/topic-web/src/components/TopicEditor.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```ts
const titleField = () => screen.getByLabelText(copy.TITLE_LABEL);
const bodyField = () => screen.getByLabelText(copy.BODY_LABEL);

it('Given 画面 / When 欄を見る / Then タイトルは複数行の欄で、説明は 8 行の欄である', () => {
  enterWith();
  expect(titleField().tagName).toBe('TEXTAREA');
  expect(titleField()).toHaveAttribute('rows', '2');
  expect(bodyField()).toHaveAttribute('rows', '8');
});

it('Given タイトルと説明を書いた / When 欄の下を見る / Then 長さと上限が数字で出て、欄から指されている', () => {
  enterWith();
  fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
  fireEvent.change(bodyField(), { target: { value: 'fizz' } });
  expect(titleField()).toHaveAccessibleDescription(`8 / ${MAX_TOPIC_TITLE}`);
  expect(bodyField()).toHaveAccessibleDescription(`4 / ${MAX_TOPIC_BODY}`);
});

it('Given 説明の欄 / When 欄の下を見る / Then Markdown で書けると添えてある', () => {
  enterWith();
  expect(screen.getByText(copy.BODY_HINT)).toBeInTheDocument();
});

it('Given 改行を含む文を貼った / When このお題にする / Then 改行は空白になって送られる', () => {
  enterWith();
  fireEvent.change(titleField(), { target: { value: 'Fizz\r\nBuzz' } });
  expect(titleField()).toHaveValue('Fizz Buzz');
  fireEvent.click(setButton());
  expect(lastSent()).toEqual({ command: 'topic.set', title: 'Fizz Buzz', body: '' });
});

it('Given タイトルを書いた / When タイトルの欄で Enter / Then 送られ、改行は入らない', () => {
  enterWith();
  fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
  fireEvent.keyDown(titleField(), { key: 'Enter' });
  expect(lastSent()).toEqual({ command: 'topic.set', title: 'FizzBuzz', body: '' });
});

it.each([
  ['変換中', { isComposing: true }],
  ['Safari の確定', { keyCode: 229 }],
])('Given タイトルを書いた / When %s の Enter / Then 送らない', (_label, init) => {
  enterWith();
  fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
  const before = latestSocket().sentJson().length;
  fireEvent.keyDown(titleField(), { key: 'Enter', ...init });
  expect(latestSocket().sentJson()).toHaveLength(before);
});

it('Given タイトルを書いた / When Shift+Enter / Then 送らず、既定の改行も止める', () => {
  enterWith();
  fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
  const before = latestSocket().sentJson().length;
  const notCancelled = fireEvent.keyDown(titleField(), { key: 'Enter', shiftKey: true });
  expect(notCancelled).toBe(false);
  expect(latestSocket().sentJson()).toHaveLength(before);
});

it('Given 説明の欄 / When Enter / Then 送らない（説明は改行を書ける）', () => {
  enterWith();
  fireEvent.change(titleField(), { target: { value: 'FizzBuzz' } });
  const before = latestSocket().sentJson().length;
  fireEvent.keyDown(bodyField(), { key: 'Enter' });
  expect(latestSocket().sentJson()).toHaveLength(before);
});
```

`toHaveAccessibleDescription` は `@testing-library/jest-dom` の既存の照合子。`MAX_TOPIC_BODY` は既存の import にある。

- [ ] **Step 2: 赤を見る**（`tagName` が `INPUT`・説明が無い・Enter で送られない など）
- [ ] **Step 3: 実装する**（`TopicEditor.tsx` の欄の部分）

```tsx
<label htmlFor={titleId}>{TITLE_LABEL}</label>
<textarea
  id={titleId}
  className="ui-input topic-title-field"
  rows={2}
  value={title}
  maxLength={MAX_TOPIC_TITLE}
  aria-describedby={`${titleId}-count`}
  onChange={(e) => setTitle(toSingleLine(e.target.value))}
  onKeyDown={(e) => {
    if (e.key !== 'Enter') return;
    // 変換の確定の Enter では送らない（Safari は isComposing が偽で keyCode が 229 になる）
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    // タイトルは 1 行（正本 D3）。Shift+Enter でも改行を入れない
    e.preventDefault();
    if (!e.shiftKey) e.currentTarget.form?.requestSubmit();
  }}
/>
<p className="topic-field-meta ui-note">
  <span id={`${titleId}-count`}>{`${title.length} / ${MAX_TOPIC_TITLE}`}</span>
</p>
<label htmlFor={bodyId}>{BODY_LABEL}</label>
<textarea
  id={bodyId}
  className="ui-input topic-body-field"
  rows={8}
  value={body}
  maxLength={MAX_TOPIC_BODY}
  aria-describedby={`${bodyId}-count`}
  onChange={(e) => setBody(e.target.value)}
/>
<p className="topic-field-meta ui-note">
  <span>{BODY_HINT}</span>
  <span id={`${bodyId}-count`}>{`${body.length} / ${MAX_TOPIC_BODY}`}</span>
</p>
```

`<section>` に `topic-write` を足す（`className="topic-panel topic-write ui-panel"`）。jsdom の `requestSubmit` は Testing Library の環境で使える（使えなければ `form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))` に替え、P3 の意図を注釈に残す）。

- [ ] **Step 4: 緑を見る**。既存の「書く」の describe（送信・空白・上限・下書き・書き直す）も緑のまま
- [ ] **Step 5: コミットする**（`feat: タイトルを複数行の欄にし、書いた量を数字で出す（#313 PR 1）`）

### Task 4: ページ幅・置き場・欄の伸び方の CSS（FR-001・FR-006・FR-014・FR-015）

**Files:**
- Modify: `apps/topic-web/src/index.css`

jsdom は CSS を読まないので、この Task の赤は Task 5 の E2E で見る。**Task 5 の Step 1〜2 を先にやってから** ここへ戻る。

- [ ] **Step 1: 書く**

```css
/* ページの最大幅（#313 正本 D1）。玄関の選択画面（1120px）に揃える。`@tasuki/ui` の `.page` は
   poker も使うので変えない。幅の揃え方は #316 が決める（写し元は玄関とお題ツールの 2 つ）。 */
.topic-page {
  max-width: 1120px;
}

/* 「書く」は行いっぱい（正本 D2）。「作る」は 2 行目に 1 つ残り、auto-fit が空の列を畳んで広がる。 */
.topic-write {
  grid-column: 1 / -1;
}

/* タイトルは書いた量に合わせて伸ばす（正本 D3）。効かないブラウザは rows の高さのまま縦に伸ばせる。 */
.topic-title-field {
  field-sizing: content;
}

/* 説明も伸ばすが、32rem を超えたら欄の中でスクロールする（正本 D5）。 */
.topic-body-field {
  field-sizing: content;
  min-block-size: 12rem;
  max-block-size: 32rem;
}

/* 欄の下の添え書きと数字。色は部品（`.ui-note`）が持つので、ここには並びと大きさだけを書く。 */
.topic-field-meta {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  margin: 0;
  font-size: var(--font-size-sm);
}

.topic-field-meta > :last-child {
  margin-inline-start: auto;
}
```

`field-sizing: content` は `rows` を下限として使わない（内容の高さになる）ので、タイトルの欄は `min-block-size` を持たせない代わりに、E2E で空の欄が 1 行ぶん以上の高さを持つことを見る（Task 5）。1 行に潰れて見えるなら `min-block-size: calc(2lh + 2 * var(--space-3))` を足す。

- [ ] **Step 2**: `node scripts/audit-ui-components.mjs` が通る（型のセレクタ・生の色が無い）
- [ ] **Step 3**: Task 5 の E2E が緑になる
- [ ] **Step 4: コミットする**（`feat: お題ツールのページを広げ、書くを行いっぱいに置く（#313 PR 1）`）

### Task 5: 幅と長いタイトルの E2E（SC-001・SC-005・FR-003・FR-014・FR-015）

**Files:**
- Modify: `e2e/specs/topic.spec.ts`（`describe('お題ツールの文字と書体')` の後に describe を足す）

- [ ] **Step 1: 失敗するテストを書く**

```ts
/** ユーザーストーリーの形のタイトル（正本 §3 の例。67）。 */
const STORY_TITLE =
  'チームの一員として、スプリントの終わりにふりかえりの結果を一目で見たい。なぜなら、次のスプリントで何を変えるかをその場で決めたいからだ';

test.describe('長いタイトルと広いページ（#313 PR 1）', () => {
  for (const width of [390, 1280]) {
    test(`Given ユーザーストーリーの形のタイトル / When 幅 ${width} で書く / Then 横に隠れず全体が見える`, async ({ page, consoleWatcher }) => {
      await page.setViewportSize({ width, height: 900 });
      await openTopicTool(page, `story-topic-${width}`);
      const field = page.getByLabel('タイトル', { exact: true });
      await field.fill(STORY_TITLE);
      const box = await field.evaluate((el) => ({
        overflowX: el.scrollWidth - el.clientWidth,
        overflowY: el.scrollHeight - el.clientHeight,
      }));
      expect(box, '欄の中に隠れた部分がある').toEqual({ overflowX: 0, overflowY: 0 });
      await expect(page.getByText(`${STORY_TITLE.length} / 200`)).toBeVisible();
      await expectFieldsAtLeast16px(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(consoleWatcher.errors).toEqual([]);
    });
  }

  test('Given 幅 1920 / When お題ツールを開く / Then ページは 1120px で、書くは中身の幅いっぱい', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await openTopicTool(page, 'wide-topic');
    const main = page.getByRole('main');
    const write = page.getByRole('region', { name: '書く' });
    const mainBox = await main.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: el.getBoundingClientRect().width, inner: el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) };
    });
    expect(mainBox.width).toBe(1120);
    expect((await write.boundingBox())?.width).toBeCloseTo(mainBox.inner, 0);
  });

  test('Given タイトルを書いた / When タイトルの欄で Enter / Then このお題になる', async ({ page }) => {
    await openTopicTool(page, 'enter-topic');
    await page.getByLabel('タイトル', { exact: true }).fill('FizzBuzz');
    await page.getByLabel('タイトル', { exact: true }).press('Enter');
    await expect(currentTopic(page).getByRole('heading', { name: 'FizzBuzz' })).toBeVisible();
  });
});
```

`STORY_TITLE` は日本語を含む。**このテストは文字のコントラストと書体の層を測らない**ので base 層の検査には掛からない（入力欄の値は画面の文言ではない）。

- [ ] **Step 2: main のまま赤を見る**（1 行の `<input>` は `scrollWidth > clientWidth`・ページは 680px・「書く」は半分の幅・数字が無い）
- [ ] **Step 3**: Task 3・4 の後に緑を見る。既存の `topic.spec.ts` 全体（コントラスト・輪郭・16px・320/1280 のはみ出し）も緑
- [ ] **Step 4: コミットする**（`test: 長いタイトルと広いページを E2E で見る（#313 PR 1）`）

### Task 6: 破壊検証（原則 VII）

`git status --porcelain` が空であることを見てから、1 つずつ壊して赤を見て戻す。

| 壊すもの | 赤になるテスト |
|---|---|
| `onKeyDown` の `isComposing \|\| keyCode === 229` を消す | Task 3 の「変換中」「Safari の確定」 |
| `onChange` の `toSingleLine` を外す | Task 3 の「改行を含む文を貼った」 |
| `.topic-title-field` の `field-sizing` を消す | Task 5 の幅 390（`overflowY > 0`） |
| `.topic-page` の `max-width` を消す | Task 5 の幅 1920 |
| `.topic-write` の `grid-column` を消す | Task 5 の幅 1920（「書く」が半分） |

- [ ] 各行で赤を見た。戻したあと `git status --porcelain` が空

### Task 7: 実画面検証（原則 V）

- [ ] **Step 1**: `pnpm dev` でお題ツールを開き、390・768・1280・1920 の 4 幅を撮る（タイトルに `STORY_TITLE`・説明に見出しと箇条書きを書き、このお題にした状態）
- [ ] **Step 2**: 利用者に見せて確かめる: いまのお題の札の横幅（正本 §8・#314）・「作る」の横幅（正本 §8・#316）・タイトルの欄の伸び方
- [ ] **Step 3**: 使い終わった dev サーバーを止める（`ss -tlnp` で確認）
- [ ] **Step 4**: 確かめた結果を PR の本文に残す（写真と、利用者の判断）
