# 招待リンクの表示・象牙の札・Markdown の見た目を部品層へ寄せる（#320 PR 4）実装計画

> **作業者へ:** 必須サブスキル —— `superpowers:subagent-driven-development`（推奨）または
> `superpowers:executing-plans` を使って 1 タスクずつ実装すること。
> 手順のチェックボックス（`- [ ]`）で進捗を追う。

**ゴール**: 部品層に**招待リンクの表示**（`.ui-invite`・`.ui-invite-url`）・**象牙の札**（`.ui-sheet`）・**Markdown の見た目**（`.ui-md` と `.ui-md-*`）を置き、
poker とお題ツールの写しをこの部品へ置き換える。

**方式**: 部品は PR 1〜3 と同じく `.ui-` で始まるクラスだけで書いた素の CSS（`@layer` 不使用）。値の出発点はお題ツールの値
（poker の招待リンクは生の色と 5 段の外の字の大きさで書かれている）。Markdown は **CSS だけ**を共有し、描画（`Markdown.tsx`）は
各アプリに置いたまま、クラス名だけを部品へ替える（正本 §1.3・§2.2。描画の共有は #315 が決める）。

**技術**: 素の CSS / React（各アプリのマークアップのクラスだけを替える）/ Playwright（E2E・計算後の値を測る）

**設計正本**: `docs/superpowers/specs/2026-09-27-ui-components-layer-design.md`（**計画は正本に従属する。両方を読むこと**）。
この計画は正本 §7 の **PR 4** だけを扱う。出発点は正本 §2.1 の「招待リンクの表示」「象牙の札」「Markdown の見た目」の行と §1.3 の
「Markdown の CSS とお題の札」の判断。PR 3 の計画（`docs/superpowers/plans/2026-09-29-ui-components-pr3-panel-header.md`）と
PR 3 が入った main（`e72f110`）の現物を見て書いた。

## この計画で決めたこと（正本に無い細部）

レビューはここを最初に見る。いずれも正本の D 番号に照らして決めた。

| # | 決定 | 根拠 |
|---|---|---|
| P1 | **招待リンクは、行の並び（`flex`・折り返し・中央揃え・`gap`）と字の大きさまで部品が持つ**。URL の枠は点線・等幅・折り返し | 写っている知識が「点線の枠・等幅・折り返し」と「同じ組み方」（正本 §2.1。お題ツールの注釈が「poker-web の `.invite` と同じ組み方」と明言）。PR 3 の見出しの行（P2）と同じ扱い |
| P2 | **招待リンクの値はお題ツールの値に揃える**（トークンで書かれている）。poker の半透明の黒の地・金の点線・`0.8rem` はやめる | poker の値は生の色（`rgba`）と 5 段の外の大きさで、PR 5 の生の色の検査（D10 の 3）で落ちる。お題ツールの値は同じ面（羅紗）の上で文字の走査を通っている（`topic.spec.ts`） |
| P3 | **コピーのボタンの見た目は画面に残す**（poker は既定のボタンに `.invite button` の大きさ、お題ツールは `.secondary`） | ボタンの形・大きさの段は #316 の範囲（正本 §2.2）。poker は `invite` のクラスを残して `.invite button` を効かせ続ける |
| P4 | **札は字の色（`--coal`）まで持ち、Markdown のリンクの色は札から継ぐ**（`.ui-md-link` は `color: inherit`） | 正本 §2.1「札の上の字の色を札が決める」。いまの `.md-link` は `--coal` を直書きしていて、札と別々に直せてしまう。札の上では継いだ色も `--coal` なので見た目は変わらない |
| P5 | **札の `min-width: 0` は部品が持つ** | 2 つの写しが同じ理由（区切りの無い長い文字列で札ごとはみ出す。どちらも実画面で発見）で持っている。グリッドの子でない所では効かないので害が無い |
| P6 | **Markdown の描画はクラス名を字面で書く**（`md-${block.kind}` をやめる） | 死んだ部品の検査（正本 D11 の 6）は `.tsx` に現れる `ui-` の語を数える。組み立てた名前は数えられず、`.ui-md-ul` / `.ui-md-ol` が死んだ部品として落ちる |
| P7 | **見出しの段の規則（`h4.ui-md-h` など）は要素型を前に置いたまま部品へ移す** | 正本 D11 の 1 は「先頭の複合セレクタが `.ui-` のクラスを含む」ことを求めていて、`h4.ui-md-h` は満たす。要素型は段（h4〜h6）を見分けるためのもので、全アプリへ漏れない |
| P8 | 画面のクラス `.topic-card`（お題ツール）と poker の `.topic-body` の規則は消す。お題ツールの `.topic-body`（札の中の本文の余白）と `.topic-invite` 系は並びが部品へ移るので消す | PR 3 の P6 と同じ（中身が空になる規則は死んだ CSS） |
| P9 | 変異は `mutation-check.mjs` に**登録しない**。Task 6 で手で壊して赤を見る | PR 2 P7・PR 3 P7 と同じ。触るファイルを文脈に持つ変異パッチは無い（計画の段で確かめた） |

**正本 D7 の表に無い見た目の変化**（利用者の確認が要る。Task 7 で並べて見せる）:

- poker の招待リンクの URL の枠: 半透明の黒の地が消え、点線が金（`rgba(207,161,76,0.5)`）から `--line-strong`（象牙の淡い線）になる
- poker の招待リンクの字が `0.8rem` → `--font-size-sm`（1280px で 12.8px → 15.2px）。URL の枠の内側の余白と、URL とボタンの間隔がわずかに広がる（`0.45rem 0.7rem` → `--space-2 --space-3`・`0.6rem` → `--space-3`）

札と Markdown は 2 つの写しの値が一致しているので、見た目は変わらない見込み。

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。
様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | Task 1 で E2E を先に書き、main のマークアップのまま poker の招待リンクが赤になるのを見てから部品を書く（PR 3 の `/code-review` の指摘を受け、部品より先にテストを置く順にした）。札と Markdown の判定は main でも緑になる（写しと部品が同じ値）ので、Task 6 で壊して赤を見る |
| II. 技術選定は ADR を通す | 該当なし | 新しい技術・依存を足さない |
| III. 揮発インメモリと単純運用 | 該当なし | CSS とマークアップのクラスのみ。配布は epic の区切りで利用者に諮る（この PR では配らない） |
| IV. 境界の型安全 | 該当なし | 境界を越えるデータを扱わない |
| V. 実画面検証 | 通過 | Task 7 で上の「表に無い変化」を main と並べて撮り、Chrome で目視する |
| VI. 依存は内向き | 該当なし | ドメインに触れない |
| VII. 検査は壊して確かめる | 通過 | Task 1 の赤（main のまま）・Task 6 の破壊検証 |
| VIII. 記録が正本 | 通過 | 部品の一覧と使い方は `packages/ui/README.md`。ADR 0022 は PR 5 で実施状況を追記する。**この計画に数値の正本を作らない** |
| IX. 小さく回す | 通過 | PR 4 は招待リンク・札・Markdown の見た目だけ。分割の理由は正本 §7 |
| X. 抽象は実需で | 通過 | どの部品も poker とお題ツールの 2 アプリが使う。死んだ部品は検査が落とす。Markdown の描画（React）は共有しない（#315 が判断する） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密も個人情報も扱わない |

**逸脱なし。**

## 全体の制約

- **ブランチ**: `feature/issue-320-pr4-invite-sheet-md`（main `e72f110` から切った。この計画のコミットを含んだまま PR 4 にする）
- **破壊検証の前に `git status --porcelain` が空であることを見る**
- **コミットしたらすぐ push する**
- **本番へ配布しない**
- 部品のセレクタは `.ui-` で始まるクラスを先頭の複合セレクタに含める。部分は `.ui-<部品>-<部分>`。`@layer` を使わない（正本 D3・D5・D11）
- 部品の CSS に `outline` 系を書かない・つまみ（`--*`）を宣言しない・生の色を書かない（正本 D4・D6・D11）
- **部品の CSS のコメントに `font-size:` と `font:` の字面を書かない**（`packages/ui/tests/typography-scale.test.mjs` がコメントの中も宣言と誤認する）
- timer は触らない（timer の招待リンク・札・Markdown は Tailwind で組んであり #321 で扱う）
- **E2E に書く Markdown の本文は書体の base 層に収める**（英数字だけで書く。「掲」「本」「文」などは base 層に無い）
- scripts の自己テストは **bash** で回す
- E2E が同期サーバーの起動で即死したら、headroom のプロキシが 8787 を持っていないかを先に疑う
- コメント・docstring は日本語。「なぜ」を書く。決定は完了形で書かない

## Review Focus

1. **Markdown の組み立てた名前が残り、リストだけ見た目が消える**（`md-${block.kind}` の書き換え漏れ）→ Task 1 の E2E がリストの `padding-left` を 2 アプリで測る。Task 1 の検査（死んだ部品）も落とす
2. **札の字の色を継がないリンク**（`.ui-md-link` の `inherit` が要素層の `a` の真鍮色に負ける・消し忘れた画面の色が勝つ）→ Task 1 の E2E がリンクの色を `--coal` と比べ、文字の走査が `--coal` on `--ivory` の組を測ったことを固定する
3. **poker の招待リンクのボタンが既定の大きさに戻る**（`invite` のクラスを消して `.invite button` が効かなくなる）→ Task 4 Step 1 でクラスを残す。Task 7 の撮影で見る
4. **画面の CSS に写しの値が残る**（同じ値なので見た目にも E2E にも出ない）→ Task 7 Step 1 の grep
5. **札を暗い地の上で Markdown だけ使う画面が出る**（`.ui-md-code` などの枠の `--coal-soft` は象牙の上でしか読めない）→ README に「Markdown は札の上に置く」と書く（Task 2 Step 5）

---

### Task 1: 招待リンク・札・Markdown を測る E2E を書き、main のまま赤を見る

**Files:**
- Create: `e2e/specs/invite-sheet-md.spec.ts`

**Interfaces:**
- Consumes: `resolveColors` / `scanContrast` / `expectReadable` / `pairKey`（`e2e/support/a11y.ts`）・`openTopicTool` / `setTopic` / `currentTopic`（`e2e/support/topic.ts`）・`joinRoom` / `invitedUrlText`（`e2e/support/poker.ts`）・fixture の `openPeer`
- Produces: なし

- [ ] **Step 1: spec を書く**

`e2e/specs/invite-sheet-md.spec.ts`:

```ts
/**
 * 招待リンクの表示・象牙の札・Markdown の見た目（#320 PR 4）。
 *
 * **タグを付けない（`local` 専用）。** 理由は `timer-a11y.spec.ts` と同じ（見るのはスタイルの健全性）。
 *
 * **札と Markdown の判定は、写しを部品へ置き換える前でも緑になる**（写しと部品が同じ値を持つ）。守るのは
 * 「部品を当て忘れる」後退で、赤は破壊検証で見る（計画 Task 6）。招待リンクは poker の写しがお題ツールと
 * 違う値（生の色・5 段の外の大きさ）を持っていたので、置き換える前は poker だけが赤になる。
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { expectReadable, pairKey, resolveColors, scanContrast } from '../support/a11y';
import { invitedUrlText, joinRoom } from '../support/poker';
import { currentTopic, openTopicTool, setTopic } from '../support/topic';

/** 見出し・リスト・引用・インラインコード・リンクを 1 つずつ持つ本文。書体の base 層に収まる英数字だけで書く。 */
const TITLE = 'FizzBuzz';
const BODY = ['# Rules', '', '- one', '- two', '', '> note', '', 'Use `x` and [example](https://example.com)'].join('\n');

/** トークンを画面上で解いて、その性質の計算値にする。 */
async function resolveStyle(page: Page, property: string, token: string): Promise<string> {
  return page.evaluate(
    ([prop, tok]) => {
      const probe = document.createElement('div');
      document.body.append(probe);
      probe.style.setProperty(prop, `var(${tok})`);
      const value = getComputedStyle(probe).getPropertyValue(prop);
      probe.remove();
      return value;
    },
    [property, token] as const,
  );
}

async function styleOf(locator: Locator, props: readonly string[]): Promise<Record<string, string>> {
  return locator.evaluate(
    (el, list) => Object.fromEntries(list.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])),
    props,
  );
}

/** 招待リンク: URL の枠は点線の `--line-strong`・地なし・等幅、行の字は `--font-size-sm`。 */
async function expectInvite(page: Page, url: Locator, label: string): Promise<void> {
  await expect(url, label).toBeVisible();
  const [lineStrong, ivoryDim] = await resolveColors(page, ['--line-strong', '--ivory-dim']);
  const mono = await resolveStyle(page, 'font-family', '--font-mono');
  const sm = await resolveStyle(page, 'font-size', '--font-size-sm');
  expect(
    await styleOf(url, ['border-top-style', 'border-top-color', 'background-color', 'color', 'font-family']),
    `${label} の URL の枠`,
  ).toEqual({
    'border-top-style': 'dashed',
    'border-top-color': lineStrong,
    'background-color': 'rgba(0, 0, 0, 0)',
    color: ivoryDim,
    'font-family': mono,
  });
  expect((await styleOf(url.locator('..'), ['font-size']))['font-size'], `${label} の招待リンクの字の大きさ`).toBe(sm);
}

/** 札は象牙の地に `--coal` の字、中の Markdown は部品の値。 */
async function expectSheetAndMarkdown(page: Page, sheet: Locator, label: string): Promise<void> {
  await expect(sheet, label).toBeVisible();
  const [ivory, coal, coalSoft] = await resolveColors(page, ['--ivory', '--coal', '--coal-soft']);
  const radius = await resolveStyle(page, 'border-top-left-radius', '--radius-lg');
  const space5 = await resolveStyle(page, 'padding-top', '--space-5');
  const base = await resolveStyle(page, 'font-size', '--font-size-base');
  const mono = await resolveStyle(page, 'font-family', '--font-mono');

  expect(
    await styleOf(sheet, ['background-color', 'color', 'border-top-left-radius', 'padding-top']),
    `${label} の札`,
  ).toEqual({ 'background-color': ivory, color: coal, 'border-top-left-radius': radius, 'padding-top': space5 });

  const link = sheet.getByRole('link', { name: 'example', exact: true });
  expect(await styleOf(link, ['color', 'text-decoration-line']), `${label} のリンク`).toEqual({
    color: coal,
    'text-decoration-line': 'underline',
  });
  expect(
    await styleOf(sheet.getByRole('heading', { level: 4, name: 'Rules' }), ['font-size', 'margin-top']),
    `${label} の見出し`,
  ).toEqual({ 'font-size': base, 'margin-top': '0px' });
  expect((await styleOf(sheet.getByRole('list'), ['padding-left']))['padding-left'], `${label} のリスト`).toBe(space5);
  expect(
    await styleOf(sheet.locator('blockquote'), ['border-left-width', 'border-left-style', 'border-left-color']),
    `${label} の引用`,
  ).toEqual({ 'border-left-width': '2px', 'border-left-style': 'solid', 'border-left-color': coalSoft });
  expect(
    await styleOf(sheet.locator('code'), ['border-top-color', 'font-family']),
    `${label} のコード`,
  ).toEqual({ 'border-top-color': coalSoft, 'font-family': mono });
}

test.describe('招待リンクの表示・象牙の札・Markdown の見た目（#320 PR 4）', () => {
  test('Given お題ツールでお題を掲げる / When 招待リンクと札を測る / Then 部品の値で、札の上の字はすべて読める', async ({ page }) => {
    // Given
    const inviteUrl = await openTopicTool(page, 'sheet-topic');
    await setTopic(page, TITLE, BODY);

    // Then その1: 招待リンク
    await expectInvite(page, page.getByText(inviteUrl, { exact: true }), 'お題ツール');
    // Then その2: 札と Markdown
    await expectSheetAndMarkdown(page, currentTopic(page).getByRole('article'), 'お題ツール');
    // Then その3: 札の上の字（`--coal` on `--ivory`）を測ったことを固定する
    const [coal, ivory] = await resolveColors(page, ['--coal', '--ivory']);
    expectReadable(await scanContrast(page, 5), 5, [pairKey(coal!, ivory!)]);
  });

  test('Given お題を掲げたルーム / When poker で説明を開いて測る / Then 部品の値で、札の上の字はすべて読める', async ({
    page,
    openPeer,
  }) => {
    // Given
    const inviteUrl = await openTopicTool(page, 'sheet-host');
    await setTopic(page, TITLE, BODY);
    const poker = await openPeer('sheet-poker');
    await joinRoom(poker.page, inviteUrl, 'sheet-poker');
    const topic = poker.page.getByRole('region', { name: 'お題', exact: true });
    await topic.getByText('説明を見る', { exact: true }).click();

    // Then その1: 招待リンク（main の poker は半透明の黒の地・金の点線・12.8px で、ここが赤になる）
    await expectInvite(poker.page, invitedUrlText(poker.page), 'poker');
    // Then その2: 札と Markdown（札は説明の中の、Markdown を包む箱）
    await expectSheetAndMarkdown(poker.page, topic.locator('details > div'), 'poker');
    // Then その3
    const [coal, ivory] = await resolveColors(poker.page, ['--coal', '--ivory']);
    expectReadable(await scanContrast(poker.page, 10), 8, [pairKey(coal!, ivory!)]);
  });
});
```

- [ ] **Step 2: main のまま流して、見込みどおりに落ちることを見る**

Run: `cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/invite-sheet-md.spec.ts --reporter=line; cd ..`
Expected:
- 1 本目（お題ツール）: **PASS**（対照実行。お題ツールの写しは部品と同じ値）
- 2 本目（poker）: **FAIL**。`poker の URL の枠` で `border-top-color` と `background-color` が食い違う（金の点線・半透明の黒）

**見込みと違う理由で落ちたら止めて原因を調べる**（`getByRole('article')` が札に当たらない・`details > div` が別の箱に当たる・
本文の Markdown が見込みの要素に解析されない、など。main の画面で前提が成り立たないなら計画の前提が誤っている）

- [ ] **Step 3: lint と型検査を通す**

Run: `corepack pnpm --filter @tasuki/e2e lint && corepack pnpm --filter @tasuki/e2e typecheck`
Expected: PASS

- [ ] **Step 4: コミットする**

```bash
git add e2e/specs/invite-sheet-md.spec.ts
git commit -m "test: 招待リンク・札・Markdown の見た目を測る E2E を足す（#320 PR 4）"
git push -u origin feature/issue-320-pr4-invite-sheet-md
```

---

### Task 2: 部品層に招待リンク・札・Markdown を置く

**Files:**
- Create: `packages/ui/src/components/invite.css`
- Create: `packages/ui/src/components/sheet.css`
- Create: `packages/ui/src/components/markdown.css`
- Modify: `packages/ui/src/components/index.css`
- Modify: `packages/ui/README.md`（「部品層」の表と使い方）

**Interfaces:**
- Produces: `.ui-invite`・`.ui-invite-url`・`.ui-sheet`・`.ui-md`・`.ui-md-h`・`.ui-md-p`・`.ui-md-ul`・`.ui-md-ol`・`.ui-md-quote`・`.ui-md-code`・`.ui-md-pre`・`.ui-md-link`。Task 3・4 がマークアップに当てる

- [ ] **Step 1: 招待リンクの部品を書く**

`packages/ui/src/components/invite.css`:

```css
/* ============================================================
   Tasuki UI — 招待リンクの表示（#320・ADR 0022）
   参加用 URL と、それをコピーするボタンを 1 行に組む容器。URL の `<span>` には `.ui-invite-url` を当てる。
   **行の中の並びと字の大きさまで部品が持つ**（配置は画面が持つ、の例外）。写しが持っていた知識が
   「同じ組み方」そのものなので、並びを画面に残すと片方だけ直ったときに画面ごとにずれる。
   ボタンの見た目は画面が持つ（ボタンの形・大きさの段は #316）。
   ============================================================ */

.ui-invite {
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--font-size-sm);
}

/* URL は桁を揃えたいものなので等幅に置き、点線の枠で「写し取るもの」と分かるようにする。
   区切りの無い長い URL でも画面の幅を超えないよう、どこででも折り返す。 */
.ui-invite-url {
  box-sizing: border-box;
  padding: var(--space-2) var(--space-3);
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-md);
  color: var(--ivory-dim);
  font-family: var(--font-mono);
  word-break: break-all;
}
```

- [ ] **Step 2: 札の部品を書く**

`packages/ui/src/components/sheet.css`:

```css
/* ============================================================
   Tasuki UI — 象牙の札（#320・ADR 0022）
   お題の本文（Markdown）を載せる明るい札。暗いパネルの中に置く。
   **札の上の字の色は札が決める。** Markdown のリンク・コード・引用の色は象牙の地の上で読めるように
   決めてあり、暗い地の上に直接置くとリンクは約 1.03:1 まで落ちる（#91 PR 3 のレビュー指摘）。
   Markdown のリンクは札の字の色を継ぐので、札を直せば一緒に直る。
   ============================================================ */

.ui-sheet {
  box-sizing: border-box;
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  background: var(--ivory);
  color: var(--coal);
  /* グリッドの子は既定で中身の最小幅まで伸びる。区切りの無い長いタイトルや URL で、札を包む
     グリッドごと横にはみ出していた（#91 PR 2・PR 3 の実画面で発見）。 */
  min-width: 0;
}
```

- [ ] **Step 3: Markdown の見た目の部品を書く**

`packages/ui/src/components/markdown.css`:

```css
/* ============================================================
   Tasuki UI — Markdown の見た目（#320・ADR 0022）
   お題の説明の Markdown サブセット（`@tasuki/markdown` が解析し、各アプリの `Markdown.tsx` が描く）の見た目。
   根に `.ui-md`、各ブロックと行内の要素に `.ui-md-*` を当てる。**描画（React）は各アプリが持つ**（#315 が判断する）。
   **象牙の札（`.ui-sheet`）の上に置く。** 枠の色（`--coal-soft`）は象牙の上でしか読めない。
   ============================================================ */

/* ブロックの間隔は margin で作る。`white-space: pre-wrap` は Markdown 自身の段落・改行の扱い
   （空行区切り・行内の改行）と二重になり、連続する空行が段落の間隔と別に隙間を作る。 */
.ui-md > * + * {
  margin-top: var(--space-2);
}

.ui-md-h {
  margin: 0;
  font-weight: 700;
}
/* 要素は h4〜h6（札のタイトルの h3 の下へ段を下げる）だが、大きさの見た目は本文に近く保つ。 */
h4.ui-md-h {
  font-size: var(--font-size-base);
}
h5.ui-md-h {
  font-size: var(--font-size-sm);
}
h6.ui-md-h {
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.ui-md-p {
  margin: 0;
}

.ui-md-ul,
.ui-md-ol {
  margin: 0;
  padding-left: var(--space-5);
}

.ui-md-quote {
  margin: 0;
  padding-left: var(--space-3);
  border-left: 2px solid var(--coal-soft);
}

/* インラインコード。地は変えず、`--coal-soft` の枠と等幅体で区別する（半透明の地を書かない）。
   長い連続文字列（URL など）も画面の幅を超えない。 */
.ui-md-code {
  padding: 0 0.2em;
  border: 1px solid var(--coal-soft);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}

/* コードブロックは折り返さず横スクロールで逃がす（整形済みの中身を保つ）。 */
.ui-md-pre {
  margin: 0;
  padding: var(--space-3);
  border: 1px solid var(--coal-soft);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  overflow-x: auto;
  white-space: pre;
}

/* リンクは札の字の色を継ぎ、下線で区別する。`--gold-deep`（象牙の上で約 3.75:1）は本文の大きさの
   AA（4.5:1）を割る。色を直書きすると札と別々に直せてしまうので、札が決めた色を継ぐ。 */
.ui-md-link {
  color: inherit;
  text-decoration: underline;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 4: まとめ読みに足し、検査が「死んだ部品」を出すことを見る**

`packages/ui/src/components/index.css` の `@import './page-header.css';` の後に 3 行を足す:

```css
@import './page-header.css';
@import './invite.css';
@import './sheet.css';
@import './markdown.css';
```

Run: `node scripts/audit-ui-components.mjs; echo "exit=$?"`
Expected: `exit=1`。`[死んだ部品]` が 12 行（`.ui-invite`・`.ui-invite-url`・`.ui-sheet`・`.ui-md`・`.ui-md-h`・`.ui-md-p`・`.ui-md-ul`・`.ui-md-ol`・`.ui-md-quote`・`.ui-md-code`・`.ui-md-pre`・`.ui-md-link`）。
**`[部品の CSS]` の行は 0 件**（`h4.ui-md-h` が先頭の複合セレクタの規則で落ちたら P7 の前提が誤っている。止めて検査の実装を読む）

Run:
```bash
corepack pnpm --filter @tasuki/ui test
corepack pnpm --filter @tasuki/ui lint
```
Expected: どちらも PASS

- [ ] **Step 5: README の部品の表と使い方を直す**

`packages/ui/README.md` の「部品層（`components/`・ADR 0022）」の表の末尾（`.ui-page-header` の行の後）に 3 行を足す:

```markdown
| `.ui-invite` | 参加用 URL とコピーのボタンを 1 行に組む容器。URL の `<span>` に `.ui-invite-url` を当てる | なし |
| `.ui-sheet` | お題の本文を載せる象牙の札。札の上の字の色（`--coal`）まで持つ | なし |
| `.ui-md` | Markdown の根。各要素に `.ui-md-h`・`.ui-md-p`・`.ui-md-ul`・`.ui-md-ol`・`.ui-md-quote`・`.ui-md-code`・`.ui-md-pre`・`.ui-md-link` を当てる | なし |
```

同じ節の「**使い方**」の箇条の末尾（見出しの行の項目の後）に 2 項目を足す:

```markdown
- **招待リンクは、行の並びと字の大きさまで部品が持ちます。** コピーのボタンの見た目は画面が持ちます
- **Markdown は象牙の札（`.ui-sheet`）の上に置きます。** コード・引用の枠の色は象牙の上でしか読めません。
  リンクは札の字の色を継ぐので、画面のクラスで色を書きません。描画（React）は各アプリの `Markdown.tsx` が持ち、
  クラス名は字面で書きます（組み立てた名前は検査が数えられず、死んだ部品として落ちます）
```

- [ ] **Step 6: コミットする**

```bash
git add packages/ui/src/components packages/ui/README.md
git commit -m "feat: 部品層に招待リンク・象牙の札・Markdown の見た目を置く（#320 PR 4）"
git push
```

（この時点の CI は `audit-ui-components` が死んだ部品で、E2E が poker の招待リンクで赤。Task 4 の終わりで緑になる）

---

### Task 3: お題ツールを部品へ置き換える

**Files:**
- Modify: `apps/topic-web/src/components/InviteLink.tsx`
- Modify: `apps/topic-web/src/components/CurrentTopic.tsx`（札の `<article>`）
- Modify: `apps/topic-web/src/components/Markdown.tsx`
- Modify: `apps/topic-web/src/index.css`（札・Markdown・招待リンクの節）

**Interfaces:**
- Consumes: Task 2 の部品

- [ ] **Step 1: マークアップのクラスを替える**

- `InviteLink.tsx`: `<div className="topic-invite">` → `<div className="ui-invite">`、`<span className="topic-invite-url">` → `<span className="ui-invite-url">`（ボタンの `className="secondary"` はそのまま）
- `CurrentTopic.tsx`: `<article className="topic-card">` → `<article className="ui-sheet">`
- `Markdown.tsx`: クラス名を字面の部品名にする（P6）:
  - `className="md-code"` → `className="ui-md-code"`・`className="md-link"` → `className="ui-md-link"`・`className="md-h"` → `className="ui-md-h"`・
    `className="md-pre"` → `className="ui-md-pre"`・`className="md-quote"` → `className="ui-md-quote"`・`className="md-p"` → `className="ui-md-p"`
  - リストの `className={\`md-${block.kind}\`}` → `className={block.kind === 'ul' ? 'ui-md-ul' : 'ui-md-ol'}`（すぐ上に
    `{/* クラス名は字面で書く（部品の使用を検査が .tsx の字面で数えるため）。 */}` を置く）
  - 根の `className={\`md ${className}\`}` → `className={\`ui-md ${className}\`}`

- [ ] **Step 2: 画面の CSS から写しを消す**

`apps/topic-web/src/index.css`:
1. 「いまのお題（象牙の札）」の節の `.topic-card` の規則（コメントごと）を消す。`.topic-title` と `.topic-body` は札の中の配置なので残す
2. 「説明の Markdown サブセット」の節（節の見出しのコメントから `.md-link` の規則まで）を、次の 1 行に置き換える:

```css
/* ---------- 説明の Markdown の見た目は部品層（`.ui-md`・ADR 0022）が持つ ---------- */
```

3. 「招待リンク（poker-web の `.invite` と同じ組み方）」の節（見出しのコメントと `.topic-invite`・`.topic-invite-url`）を、次の 1 行に置き換える:

```css
/* ---------- 招待リンクは部品層（`.ui-invite`・ADR 0022）が持つ ---------- */
```

4. 節「いまのお題（象牙の札）」の見出しのコメントを `/* ---------- いまのお題（札の見た目は部品層の `.ui-sheet` が持つ） ---------- */` にする

- [ ] **Step 3: 単体テスト・lint・型検査と E2E を通す**

Run:
```bash
corepack pnpm --filter @tasuki/topic-web test && corepack pnpm --filter @tasuki/topic-web lint && corepack pnpm --filter @tasuki/topic-web typecheck
cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/invite-sheet-md.spec.ts specs/topic.spec.ts -g 'お題' --reporter=line; cd ..
```
Expected: 単体テストが PASS（`role` と文言で掴んでいる。落ちたらクラス名で掴んでいる箇所を探す）。E2E の `invite-sheet-md` の 1 本目と `topic.spec.ts` が PASS

- [ ] **Step 4: コミットする**

```bash
git add apps/topic-web
git commit -m "feat: お題ツールの招待リンク・札・Markdown を部品層へ寄せる（#320 PR 4）"
git push
```

---

### Task 4: poker を部品へ置き換える

**Files:**
- Modify: `apps/poker-web/src/pages/RoomPage.tsx`（`InviteLink`）
- Modify: `apps/poker-web/src/components/CurrentTopic.tsx`（札の `<div>` と冒頭の注釈）
- Modify: `apps/poker-web/src/components/Markdown.tsx`
- Modify: `apps/poker-web/src/index.css`（招待リンク・札・Markdown の節）

**Interfaces:**
- Consumes: Task 2 の部品

- [ ] **Step 1: マークアップのクラスを替える**

- `RoomPage.tsx`: `<div className="invite">` → `<div className="invite ui-invite">`（`invite` はボタンの大きさ `.invite button` のために残す。P3）、
  `<span className="invite-url">` → `<span className="ui-invite-url">`
- `CurrentTopic.tsx`: `<div className="topic-body">` → `<div className="ui-sheet">`。冒頭の注釈の「**本文だけを象牙の札（topic-web の `.topic-card` と同じ地）に載せる**」を
  「**本文だけを象牙の札（部品 `.ui-sheet`）に載せる**」に、「`.md-link`/`.md-code`/`.md-quote`」を「Markdown のリンク・コード・引用」にする
- `Markdown.tsx`: Task 3 Step 1 の `Markdown.tsx` と同じ置き換え（`md-*` → `ui-md-*`・リストの字面・根の `ui-md`・同じ注釈）

- [ ] **Step 2: 画面の CSS から写しを消す**

`apps/poker-web/src/index.css`:
1. `.invite` と `.invite-url` の規則を消し、`.invite button` の前に次のコメントを置く:

```css
/* 招待リンクの並び・URL の枠は部品（`.ui-invite`・ADR 0022）が持つ。ボタンの大きさだけを poker に置く（ボタンの段は #316）。 */
```

2. `.topic-body` のコメント（「本文（Markdown）だけを象牙の札に載せる…」）と規則を消す
3. 「説明の Markdown サブセット（…topic-web からの写し）」の節（見出しのコメントから `.md-link` の規則まで）を、次の 1 行に置き換える:

```css
/* ---------- 説明の Markdown の見た目と象牙の札は部品層（`.ui-md`・`.ui-sheet`・ADR 0022）が持つ ---------- */
```

4. 節「ルームヘッダー・招待リンク」の見出しはそのまま

- [ ] **Step 3: 検査が緑に戻ることを見る**

Run: `node scripts/audit-ui-components.mjs; echo "exit=$?"`
Expected: `exit=0`

- [ ] **Step 4: 単体テスト・lint・型検査と E2E を通す**

Run:
```bash
corepack pnpm --filter @tasuki/poker-web test && corepack pnpm --filter @tasuki/poker-web lint && corepack pnpm --filter @tasuki/poker-web typecheck
cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/invite-sheet-md.spec.ts specs/poker-a11y.spec.ts specs/invite-sharing.spec.ts --reporter=line; cd ..
```
Expected: すべて PASS（`invite-sheet-md` の 2 本目は Task 1 で赤だったもの）

- [ ] **Step 5: コミットする**

```bash
git add apps/poker-web
git commit -m "feat: poker の招待リンク・札・Markdown を部品層へ寄せる（#320 PR 4）"
git push
```

---

### Task 5: 残った写しと古い注釈を探す

- [ ] **Step 1: 消したクラスの名前を探す**

Run: `git grep -nE "topic-card|topic-invite|invite-url|\bmd-(h|p|ul|ol|quote|code|pre|link)\b|\.md\b[ >*]|'md |\"md " -- apps packages e2e`
Expected: 残るのは poker の `.invite` のクラス（P3）と、`e2e/support/poker.ts` の注釈の `.invite-url` だけ。
後者は `.ui-invite-url` に直す（招待リンクの `<span>` を指す注釈）。**それ以外が出たら直す**（片側だけの直しの型）

- [ ] **Step 2: 直したらコミットする**

```bash
git add -A e2e apps packages
git commit -m "docs: 招待リンクの注釈を部品の名前に合わせる（#320 PR 4）"
git push
```
（Step 1 で直すものが無ければコミットしない）

---

### Task 6: 壊して赤を見る（破壊検証・コミットしない）

各項目の前に `git status --porcelain` が空であることを見る。壊したファイルは、赤を見たら `git checkout -- <そのファイル>` で戻し、
もう一度 `git status --porcelain` が空であることを見る。

Run（各項目の確認に使う）: `cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/invite-sheet-md.spec.ts --reporter=line; cd ..`

- [ ] **Step 1: お題ツールの札の部品を外す** — `apps/topic-web/src/components/CurrentTopic.tsx` の `className="ui-sheet"` を消す。
  Expected: 1 本目が FAIL（`お題ツール の札`）
- [ ] **Step 2: poker のリストを組み立てた名前に戻す** — `apps/poker-web/src/components/Markdown.tsx` のリストの className を `` `md-${block.kind}` `` に戻す。
  Expected: 2 本目が FAIL（`poker のリスト`。`padding-left` が既定の値になる）
- [ ] **Step 3: リンクの色を直書きに戻す** — `packages/ui/src/components/markdown.css` の `.ui-md-link` の `color: inherit;` を `color: var(--gold-deep);` に替える。
  Expected: 2 本とも FAIL（`のリンク` の色。文字の走査も AA を割る）
- [ ] **Step 4: 招待リンクの枠を実線にする** — `packages/ui/src/components/invite.css` の `dashed` を `solid` に替える。
  Expected: 2 本とも FAIL（`の URL の枠`）
- [ ] **Step 5: 札の地を変える** — `packages/ui/src/components/sheet.css` の `background: var(--ivory);` を `background: var(--ivory-dim);` に替える。
  Expected: 2 本とも FAIL（`の札`。**緑で通った画面があれば、その画面の CSS に地の写しが残っている**）
- [ ] **Step 6: 結果を記録する** — 5 項目の「壊し方・落ちたテスト・失敗の 1 行目」を PR 本文の「テスト方法」に書く。**緑のまま通った項目があれば、その判定は恒真なので直す**

---

### Task 7: 通しで確かめ、実画面を main と並べる（コミットしない）

- [ ] **Step 1: 全体の検査を流す**

Run:
```bash
corepack pnpm test
corepack pnpm lint
corepack pnpm typecheck
bash -c 'set -euo pipefail; for t in $(node scripts/list-scan-targets.mjs script-tests); do node --test "$t"; done' 2>&1 | grep -E '^# (pass|fail)' | sort | uniq -c
for s in scripts/audit-*.mjs; do case "$s" in *.test.mjs) ;; *) node "$s" >/dev/null || echo "NG: $s";; esac; done
for p in scripts/mutations/*.patch; do git apply --check "$p" 2>/dev/null || echo "NOT APPLY: $p"; done
node scripts/audit-plan-gate.mjs
node scripts/check-links.mjs
corepack pnpm audit --audit-level high
```
Expected: すべて緑。自己テストは `# fail 0` だけ。`NG:` と `NOT APPLY:` の行は出ない。**`| tail` や `| head` で終了コードを隠さない**

写しが画面の CSS に残っていないことを見る（Review Focus 4）:

```bash
git grep -nE "ivory\);|coal\);|dashed|coal-soft" -- apps/poker-web/src/index.css apps/topic-web/src/index.css
```
Expected: 札・Markdown・招待リンクの値が出てこない（出たら、その規則が部品の写しでないかを読む）

- [ ] **Step 2: 構造監査の SC の行を main と並べる** — PR 3 の計画 Task 7 Step 2 と同じ手順（main の worktree をスクラッチパッドに作り、`audit-structure.mjs` の出力を `diff`）。
  Expected: 差は走査量の件数だけ

- [ ] **Step 3: E2E を全部流す** — Run: `corepack pnpm e2e`。Expected: 全件 PASS

- [ ] **Step 4: 見た目の変わる画面を main と並べて撮る**

PR 3 と同じく、使い捨ての spec をスクラッチパッドで書いて E2E のハーネスで流す（`e2e/specs/` に一時的に置き、撮り終えたら消す）。
撮ったら `git checkout main -- apps packages` → 同じ spec で撮る → `git checkout HEAD -- apps packages` で戻す（**前後で `git status --porcelain` を見る**）。
1280px と 360px で、Task 1 と同じ本文のお題を掲げて次を撮る:
- お題ツールのルーム画面（招待リンク・札）
- poker のルーム画面（招待リンク・説明を開いた札）

Expected: 差はこの計画の「正本 D7 の表に無い見た目の変化」の poker の招待リンクだけ（ルームコードの字は毎回変わるので差に出る）。**それ以外の差が出たら止める**

- [ ] **Step 5: 利用者に Chrome での目視を頼む** — 撮影の対と「表に無い見た目の変化」を見せ、受け入れるかを聞く

---

### Task 8: PR を作り、レビューを通す

- [ ] **Step 1: PR を作る** — `gh pr create --base main --title "feat: 招待リンク・象牙の札・Markdown の見た目を部品層へ寄せる（#320 PR 4）" --body-file <本文のファイル>`。
  本文は PR 3 と同じ形（`## 概要`・`## 変更内容`・`## テスト方法`。`Closes` も地の文の閉鎖キーワードも書かない）。P1〜P9 の要約・見た目の変化と利用者の目視の結果・Task 6 の結果・
  既知の見逃し（クラス名で書いた写しは検査に掛からない。ADR 0022 決定 6）を含める
- [ ] **Step 2: 最終レビューと、文脈を共有しない `/code-review` を PR 番号を明示して通す** — 指摘は採点が出てから直す
- [ ] **Step 3: マージの後に記録を直す** — マージは利用者が行う。#320 に PR 4 の進捗コメントを書く（PR 5 の計画は PR 4 が入った main の現物を見てから書く）
