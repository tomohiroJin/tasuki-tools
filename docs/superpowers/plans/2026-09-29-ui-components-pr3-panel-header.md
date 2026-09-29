# パネルの面と、見出し・戻る導線を部品層へ寄せる（#320 PR 3）実装計画

> **作業者へ:** 必須サブスキル —— `superpowers:subagent-driven-development`（推奨）または
> `superpowers:executing-plans` を使って 1 タスクずつ実装すること。
> 手順のチェックボックス（`- [ ]`）で進捗を追う。

**ゴール**: 部品層に**パネルの面**（`.ui-panel`）と**見出しと戻る導線**（`.ui-page-header`・`.ui-page-header-back`）を置き、
玄関・お題ツール・poker の写しをこの部品へ置き換える。

**方式**: 部品は PR 1・PR 2 と同じく `.ui-` で始まるクラスだけで書いた素の CSS（`@layer` 不使用）。パネルは**面**
（地・枠・角丸・内側の余白）だけを持ち、並び（grid / flex・gap）は画面のクラスに残す（正本 D4）。画面のクラスは並びのために残し、
**面の宣言だけを消す**（残すと後に読む画面の CSS が同じ詳細度で部品に勝つ。正本 D5）。見出しの行は、見出しと戻る導線を
1 行の両端に置く並びまでを部品が持つ（P2）。

**技術**: 素の CSS / React（各アプリのマークアップのクラスだけを替える）/ Playwright（E2E・計算後の値と位置を測る）

**設計正本**: `docs/superpowers/specs/2026-09-27-ui-components-layer-design.md`（**計画は正本に従属する。両方を読むこと**）。
この計画は正本 §7 の **PR 3** だけを扱う。出発点は正本 §2.1 の「パネルの面」「見出しと戻る導線」の行と、§2.1 末尾の
poker の節の見出しの注、§7 の m90 の注。PR 2 の計画（`docs/superpowers/plans/2026-09-28-ui-components-pr2-banner-note.md`）と
PR 2 が入った main（`bb1c9c9`）の現物を見て書いた。

## この計画で決めたこと（正本に無い細部）

レビューはここを最初に見る。いずれも正本の D 番号に照らして決めた。

| # | 決定 | 根拠 |
|---|---|---|
| P1 | **パネルは面だけを持つ**（`box-sizing`・内側の余白 `--space-5`・枠 `1px solid --line-strong`・角丸 `--radius-lg`・地 `--felt-900`）。`display` / `gap` / `min-width` は画面のクラスに残す | 5 箇所の写し（玄関 `.hub-panel` / `.hub-form`・お題ツール `.topic-panel` / `.topic-current`・poker `.topic`）で値が一致しているのは面だけで、並びは grid と flex で違う（正本 D4）。写っている知識は「地を持たない h2 の金が felt-700 の上で AA を割るので不透明な地を敷く」（正本 §2.1） |
| P2 | **見出しの行の並び（`flex`・折り返し・`baseline` 揃え・両端寄せ・`gap`）は部品が持つ**（D4 の「配置は画面」の例外） | 写っている知識が「同じ組み方」そのもの（正本 §2.1。poker とお題ツールの注釈が明言）。並びを画面に残すと部品に残るのは戻る導線の字の大きさだけになり、写しが消えない。見出し（h1）自身の大きさ・余白は画面が持つ（poker の `.room header h1`） |
| P3 | **戻る導線の字は `--font-size-sm`**（お題ツールの値）。poker の `0.8rem` をやめる | `0.8rem` は文字の大きさ 5 段の外の値。部品は 5 段のトークンで書く（`packages/ui/tests/typography-scale.test.mjs`） |
| P4 | **お題ツールの入室を待つ画面の見出しと戻る導線も `.ui-page-header` に入れる**（いまは見出しの下の行に素のリンク） | 同じ画面の 2 つの状態で戻る導線の位置が違う。ルーム画面と同じ組み方にする |
| P5 | **poker の節の見出しの地（`.room > section:not(.topic) > h2`）はパネルに寄せない** | 形が違う（見出しだけに敷く小さな地 対 まとまり全体の面）。節全体をパネルにすると席・カード・結果の並びが枠の中に入り、正本 D7 の「余白の揃え（小さい）」を超える。見出しだけに地を敷く形は poker にしか無く、D1 の条件 2 を満たさないので部品にもしない。正本 §2.1 は「実画面で判断する」としているので、Task 7 で撮影を利用者に見せ、覆ったら別の PR にする |
| P6 | **画面の見出しのクラス（`.room-title`・`.room-back`・`.topic-header`・`.topic-back`）は消す**。パネルの画面のクラス（`.hub-panel` など）は並びのために残す | 見出しの 4 つの規則は、部品へ移すと中身が空になる。空の規則は死んだ CSS（#280） |
| P7 | 変異は `mutation-check.mjs` に**登録しない**。Task 6 で手で壊して赤を見る | 新しい守りは E2E だけで、`mutation-check.mjs` は Playwright を流さない（PR 1 Task 10・PR 2 P7 と同じ扱い） |
| P8 | **m90 のパッチは文脈行だけを直す**（`className="topic-panel"` → `className="topic-panel ui-panel"`） | 正本 §7 の注。変異の中身（`useEffect` で下書きを上書きする）は変えない。当てて赤が出ることを Task 3 で確かめる |

**正本 D7 の表に無い見た目の変化**（利用者の確認が要る。Task 7 で並べて見せる）:

- poker の「選択画面へ戻る」の字が `0.8rem` → `--font-size-sm`（1280px の幅で 12.8px → 15.2px）
- お題ツールの**入室を待つ画面**の「選択画面へ戻る」が、見出しの下の行から見出しの行の右端へ移る

パネルの面は 5 箇所とも値が一致しているので、面の見た目は変わらない見込み（正本 D7 の PR 3〜4 の行「余白の揃え（小さい）」は、
PR 3 では出ない見込み。出たら Task 7 で止める）。

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。
様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | Task 2 で E2E を先に書き、main のマークアップのまま見出しの 2 件が赤になるのを見てから Task 3〜5 で置き換える。面の判定は main でも緑になる（写しと部品が同じ値）ので、Task 6 で壊して赤を見る。Task 1 の検査（死んだ部品）も赤から始まる |
| II. 技術選定は ADR を通す | 該当なし | 新しい技術・依存を足さない |
| III. 揮発インメモリと単純運用 | 該当なし | CSS とマークアップのクラスのみ。配布は epic の区切りで利用者に諮る（この PR では配らない） |
| IV. 境界の型安全 | 該当なし | 境界を越えるデータを扱わない |
| V. 実画面検証 | 通過 | Task 7 で上の「表に無い変化」と P5 を main と並べて撮り、Chrome で目視する |
| VI. 依存は内向き | 該当なし | ドメインに触れない |
| VII. 検査は壊して確かめる | 通過 | Task 2 の赤（main のまま）・Task 3 の m90 の赤・Task 6 の破壊検証 5 本 |
| VIII. 記録が正本 | 通過 | 部品の一覧と使い方は `packages/ui/README.md`。ADR 0022 は PR 5 で実施状況を追記する（正本 §7）ので、この PR では触らない。**この計画に数値の正本を作らない** |
| IX. 小さく回す | 通過 | PR 3 はパネルと見出しだけ。分割の理由は正本 §7 |
| X. 抽象は実需で | 通過 | `.ui-panel` は 3 アプリ、`.ui-page-header` と `.ui-page-header-back` は poker とお題ツールが使う。死んだ部品は検査が落とす。P5 の見出しだけの地は 1 アプリなので部品にしない |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密も個人情報も扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない（P2 の「並びを部品が持つ」は D4 の適用の細部で、README に理由つきで書く）。

## 全体の制約

- **ブランチ**: `feature/issue-320-pr3-panel-header`（main `bb1c9c9` から切った。この計画のコミットを含んだまま PR 3 にする）
- **破壊検証の前に `git status --porcelain` が空であることを見る**（`git checkout --` で未コミットの実装を消す事故を 4 度踏んでいる）
- **コミットしたらすぐ push する**
- **本番へ配布しない**
- 部品のセレクタは `.ui-` で始まるクラスだけ。部分は `.ui-<部品>-<部分>`。`@layer` を使わない（正本 D3・D5）
- 部品の CSS に `outline` 系を書かない・つまみ（`--*`）を宣言しない・生の色を書かない（正本 D4・D6・D11）
- **部品の CSS のコメントに `font-size:` と `font:` の字面を書かない**（`packages/ui/tests/typography-scale.test.mjs` がコメントの中も宣言と誤認して赤になる）
- timer は触らない（timer の見出しは `StatusStrip`・パネルは Tailwind の `Card` で、#321 で扱う）
- 画面の CSS に残すクラスの規則から**面の宣言（`padding`・`border`・`border-radius`・`background`）を消す**。ただし部品と違う値を意図して上書きするもの（玄関のフォームの `padding: var(--space-6)` と影）は残す
- scripts の自己テストは **bash** で回す（zsh は偽の赤を出す）
- E2E が同期サーバーの起動で即死したら、headroom のプロキシが 8787 を持っていないかを先に疑う。利用者の `pnpm run dev` が 8787 を掴んでいたら、止めずに聞く
- `node scripts/mutation-check.mjs --help` は引数を解さず全件を走らせる。1 件だけ見るときは `git apply` → テスト → `git apply -R`
- コメント・docstring は日本語。「なぜ」を書く。決定は完了形で書かない

## Review Focus

仕様が含意するが、どのタスクの単体テストも直接は叩かない失敗の型。レビューで最初に見る。

1. **部品の当て忘れ**（8 つのパネルのどれか 1 つに `ui-panel` を付け忘れ、画面の CSS から面を消したので地が消える）→ Task 2 の E2E が 8 つ全部の面を計算後の値で見る。Task 6 の破壊検証 1・2
2. **戻る導線が見出しの下の行へ落ちる**（並びの当て忘れ・部品の `display` の欠落）→ Task 2 の E2E が 3 画面で「縦の範囲が重なり、見出しの右にある」を見る。Task 6 の破壊検証 4
3. **戻る導線の字の大きさが画面の値のまま**（poker の `0.8rem` の消し忘れ）→ Task 2 の E2E が `--font-size-sm` の計算値と比べる。Task 6 の破壊検証 3
4. **画面の CSS に面の値が残る**（同じ値なので見た目にも E2E にも出ない。部品を直したときに片側だけ古く残る）→ Task 7 Step 1 の grep で、面の宣言が画面の CSS に残っていないことを見る
5. **m90 が当たらず、以降の変異が全部無検査になる** → Task 3 Step 6 で `git apply --check` と、当てて赤を見る

---

### Task 1: 部品層にパネルと見出しの行を置く

**Files:**
- Create: `packages/ui/src/components/panel.css`
- Create: `packages/ui/src/components/page-header.css`
- Modify: `packages/ui/src/components/index.css`
- Modify: `packages/ui/README.md`（「部品層」の表と使い方）

**Interfaces:**
- Produces: クラス `.ui-panel`・`.ui-page-header`・`.ui-page-header-back`。Task 3〜5 がマークアップに当て、Task 2 の E2E が計算後の値と位置を測る

- [ ] **Step 1: パネルの部品を書く**

`packages/ui/src/components/panel.css`:

```css
/* ============================================================
   Tasuki UI — パネルの面（#320・ADR 0022）
   見出しを持つまとまり（`<section>`・`<form>`）を卓の上に置く面。
   **面だけを持つ**（地・枠・角丸・内側の余白）。中の並び（grid / flex・間隔）は画面が持つ。
   内側の余白は画面が上書きしてよい（玄関のフォームは広く取る）。
   ============================================================ */

.ui-panel {
  box-sizing: border-box;
  padding: var(--space-5);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-lg);
  /* 地は不透明にする。body の羅紗グラデーション（felt-700〜felt-950）へ直接乗せると、地を持たない h2 の
     `--gold` は最も明るい停止点（felt-700）の上で約 3.92:1 と AA を割る（#91 PR 2 の実測）。
     felt-900 の上では約 6.4:1。 */
  background: var(--felt-900);
}
```

- [ ] **Step 2: 見出しの行の部品を書く**

`packages/ui/src/components/page-header.css`:

```css
/* ============================================================
   Tasuki UI — 見出しと戻る導線（#320・ADR 0022）
   画面の見出し（h1）と「戻る」のリンクを 1 行の両端に組む容器。リンクには `.ui-page-header-back` を当てる。
   **行の中の並びまで部品が持つ**（配置は画面が持つ、の例外）。写しが持っていた知識が「同じ組み方」
   そのものなので、並びを画面に残すと片方だけ直ったときに戻る導線の位置が画面ごとにずれる。
   見出し自身の大きさ・余白は画面が持つ。
   ============================================================ */

.ui-page-header {
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  /* 字の大きさの違う見出しとリンクを、字の並ぶ線で揃える。 */
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

/* 戻る導線は見出しより一段小さく、折り返させない（行の右端に置く）。
   色は要素層の素の `a`（真鍮の明色）をそのまま継ぐ。 */
.ui-page-header-back {
  flex: none;
  font-size: var(--font-size-sm);
}
```

- [ ] **Step 3: まとめ読みに足す**

`packages/ui/src/components/index.css` の `@import './note.css';` の後に 2 行を足す:

```css
@import './note.css';
@import './panel.css';
@import './page-header.css';
```

- [ ] **Step 4: 検査が「死んだ部品」を出すことを見る**

Run: `node scripts/audit-ui-components.mjs; echo "exit=$?"`
Expected: `exit=1`。`[死んだ部品]` が `.ui-panel`・`.ui-page-header`・`.ui-page-header-back` の 3 行（まだどのアプリも使っていない）。
`[部品の CSS]` の行は 0 件（出たら部品の CSS の約束を破っている。直してから進む）

- [ ] **Step 5: 書体の大きさの検査と lint を通す**

Run:
```bash
corepack pnpm --filter @tasuki/ui test
corepack pnpm --filter @tasuki/ui lint
```
Expected: どちらも PASS。`typography-scale` が赤なら、コメントに `font-size:` の字面を書いていないかを見る

- [ ] **Step 6: README の部品の表と使い方を直す**

`packages/ui/README.md` の「部品層（`components/`・ADR 0022）」の表の末尾（`.ui-note` の行の後）に 2 行を足す:

```markdown
| `.ui-panel` | 見出しを持つまとまりの面（`<section>`・`<form>`）。地・枠・角丸・内側の余白を持つ | なし |
| `.ui-page-header` | 画面の見出し（h1）と戻る導線を 1 行の両端に組む容器。戻る導線の `<a>` に `.ui-page-header-back` を当てる | なし |
```

同じ節の「**使い方**」の箇条の末尾（一言の項目の後）に 2 項目を足す:

```markdown
- **パネルは面だけを持ちます。** 中の並び（grid / flex・間隔）は画面のクラスで書き、**画面のクラスに面の値
  （地・枠・角丸）を書きません**（後に読まれる画面の CSS が勝つので、部品を直しても片側だけ古く残ります）。
  内側の余白は画面のクラスで上書きしてかまいません。地を持たない h2 の金は羅紗の明るいところで AA を割るので、
  見出しを持つまとまりはパネルに載せます
- **見出しの行は、行の中の並びまで部品が持ちます**（配置は画面が持つ、の例外）。見出し自身の大きさ・余白は画面が持ちます
```

- [ ] **Step 7: コミットする**

```bash
git add packages/ui/src/components packages/ui/README.md
git commit -m "feat: 部品層にパネルの面と見出しの行を置く（#320 PR 3）"
git push -u origin feature/issue-320-pr3-panel-header
```

（この時点の CI は `audit-ui-components` が死んだ部品で赤。Task 5 の終わりで緑になる）

---

### Task 2: パネルの面と見出しの行を測る E2E を書き、main のマークアップのまま赤を見る

**Files:**
- Create: `e2e/specs/panels-headers.spec.ts`

**Interfaces:**
- Consumes: `resolveColors`（`e2e/support/a11y.ts`）・`openTopicTool` / `setTopic`（`e2e/support/topic.ts`）・`joinRoom`（`e2e/support/poker.ts`）・fixture の `openPeer`
- Produces: なし（この spec の中だけで完結する）

- [ ] **Step 1: spec を書く**

`e2e/specs/panels-headers.spec.ts`:

```ts
/**
 * パネルの面と、見出し・戻る導線（#320 PR 3）。
 *
 * **タグを付けない（`local` 専用）。** 理由は `timer-a11y.spec.ts` と同じ（見るのはスタイルの健全性）。
 *
 * **面の判定は main でも緑になる**（写しと部品が同じ値を持つ）。守るのは「部品を当て忘れる」後退で、
 * 画面の CSS から面の宣言を消した後にだけ値が分かれる。赤は破壊検証で見る（計画 Task 6）。
 * 文字の走査（`scanContrast`）に任せないのは、玄関のパネルの見出しが象牙色で、地が消えても AA を割らないから。
 *
 * **見出しの判定は main で赤になる**: poker の戻る導線は 5 段の外の `0.8rem`、お題ツールの入室を待つ画面の
 * 戻る導線は見出しの下の行にある。
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { resolveColors } from '../support/a11y';
import { joinRoom } from '../support/poker';
import { openTopicTool, setTopic } from '../support/topic';

const BACK_LINK = '選択画面へ戻る';

/** トークンを画面上で解いて、その性質の計算値にする（`resolveColors` の性質を選べる版）。 */
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

/** 選択画面のツールの札（`support/topic.ts` の引き方と同じ）。 */
function toolCard(page: Page, name: string): Locator {
  return page.getByRole('list', { name: 'ツール' }).getByRole('link', { name: new RegExp(name) });
}

/** パネルの面（部品 `.ui-panel` が持つ値）が当たっていること。 */
async function expectPanelFace(page: Page, panel: Locator, label: string): Promise<void> {
  await expect(panel, label).toBeVisible();
  const [felt900, lineStrong] = await resolveColors(page, ['--felt-900', '--line-strong']);
  const radius = await resolveStyle(page, 'border-top-left-radius', '--radius-lg');
  const face = await panel.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      background: s.backgroundColor,
      border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
      radius: s.borderTopLeftRadius,
    };
  });
  expect(face, `${label} の面`).toEqual({ background: felt900, border: `1px solid ${lineStrong}`, radius });
}

/** 戻る導線が見出しと同じ行の右にあり、字の大きさが `--font-size-sm` であること。 */
async function expectBackBesideHeading(page: Page, heading: Locator, label: string): Promise<void> {
  const back = page.getByRole('link', { name: BACK_LINK, exact: true });
  await expect(heading, label).toBeVisible();
  await expect(back, label).toBeVisible();
  const sm = await resolveStyle(page, 'font-size', '--font-size-sm');
  expect(await back.evaluate((el) => getComputedStyle(el).fontSize), `${label} の戻る導線の字の大きさ`).toBe(sm);
  const h = (await heading.boundingBox())!;
  const b = (await back.boundingBox())!;
  // 同じ行: 縦の範囲が重なる。見出しの右: 見出しの右端より右から始まる（1280px の幅では折り返さない）
  expect(b.y < h.y + h.height && b.y + b.height > h.y, `${label} の戻る導線が見出しと同じ行にない`).toBe(true);
  expect(b.x, `${label} の戻る導線が見出しの右にない`).toBeGreaterThan(h.x + h.width);
}

test.describe('パネルの面と、見出し・戻る導線（#320 PR 3）', () => {
  test('Given 玄関でルームを作りお題ツールを開く / When 各画面のパネルと見出しを測る / Then 面は部品の値で、戻る導線は見出しの右に並ぶ', async ({
    page,
  }) => {
    // Given / When その1: 玄関の作成フォーム
    await page.goto('/');
    await expectPanelFace(page, page.getByRole('form', { name: 'ルームを作る' }), '玄関の作成フォーム');

    // When その2: 選択画面の参加者と招待
    await page.getByLabel('あなたの名前').fill('panel-topic');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    await expectPanelFace(page, page.getByRole('region', { name: '参加者', exact: true }), '選択画面の参加者');
    await expectPanelFace(page, page.getByRole('region', { name: '仲間を招く', exact: true }), '選択画面の招待');

    // When その3: お題ツールのルーム画面
    await toolCard(page, 'Topic Board').click();
    await expectBackBesideHeading(page, page.getByRole('heading', { level: 1, name: 'お題', exact: true }), 'お題ツール');
    for (const name of ['いまのお題', '書く', '作る']) {
      await expectPanelFace(page, page.getByRole('region', { name, exact: true }), `お題ツールの「${name}」`);
    }
  });

  test('Given お題を出したルーム / When 別の人が玄関の参加フォームから poker に入る / Then 参加フォームとお題の面は部品の値で、戻る導線は見出しの右に並ぶ', async ({
    page,
    openPeer,
  }) => {
    // Given: poker にお題の面（`.topic`）を出すため、先にお題を掲げる。文面は書体の常用の層に収まるもの
    const inviteUrl = await openTopicTool(page, 'panel-host');
    await setTopic(page, 'FizzBuzz', '3 のときは Fizz を出す');
    const poker = await openPeer('panel-poker');

    // When その1: 玄関の参加フォーム
    await poker.page.goto(inviteUrl);
    await expectPanelFace(poker.page, poker.page.getByRole('form', { name: '参加する' }), '玄関の参加フォーム');

    // When その2: poker のルーム画面
    await joinRoom(poker.page, inviteUrl, 'panel-poker');
    await expectPanelFace(poker.page, poker.page.getByRole('region', { name: 'お題', exact: true }), 'poker のお題');
    await expectBackBesideHeading(
      poker.page,
      poker.page.getByRole('heading', { level: 1, name: 'プランニングポーカー' }),
      'poker',
    );
  });

  test('Given お題ツールの同期サーバーへ繋がらない / When 入室を待つ画面を出す / Then 戻る導線は見出しの右に並ぶ', async ({
    page,
  }) => {
    // Given: 玄関でルームを作り、お題ツールの WS だけを成立させない（`notices-a11y.spec.ts` の `toolSyncIsDown` と同じ形）
    await page.goto('/');
    await page.getByLabel('あなたの名前').fill('panel-joining');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    await expect(page.getByLabel('参加用 URL')).toBeVisible();
    await page.routeWebSocket(/\/ws\?.*\btool=topic\b/, (ws) => {
      void ws.close();
    });

    // When: お題ツールを開く（入室が成立しないので、入室を待つ画面に留まる）
    await toolCard(page, 'Topic Board').click();

    // Then
    await expectBackBesideHeading(
      page,
      page.getByRole('heading', { level: 1, name: 'ルームに参加しています' }),
      'お題ツールの入室を待つ画面',
    );
  });
});
```

- [ ] **Step 2: main のマークアップのまま流して、見込みどおりに落ちることを見る**

Run: `cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/panels-headers.spec.ts; cd ..`
Expected:
- 1 本目（玄関→お題ツール）: **PASS**（対照実行。面は写しと部品が同じ値、お題ツールの見出しの行は main でも同じ組み方）
- 2 本目（poker）: **FAIL**。`poker の戻る導線の字の大きさ` で `12.8px` と `--font-size-sm` の計算値が食い違う
- 3 本目（入室を待つ画面）: **FAIL**。`お題ツールの入室を待つ画面 の戻る導線が見出しと同じ行にない`

**見込みと違う理由で落ちたら止めて原因を調べる**（`getByRole('region', …)` が複数に当たる・フォームに名前が付かない、など
前提の作り方が壊れている。main の画面でその前提が成り立たないなら、この計画の前提が誤っている）

- [ ] **Step 3: lint と型検査を通す**

Run: `corepack pnpm --filter @tasuki/e2e lint && corepack pnpm --filter @tasuki/e2e typecheck`
（e2e のパッケージ名が違えば `e2e/package.json` の `name` に合わせる）
Expected: PASS

- [ ] **Step 4: コミットする**

```bash
git add e2e/specs/panels-headers.spec.ts
git commit -m "test: パネルの面と見出しの行を測る E2E を足す（#320 PR 3）"
git push
```

---

### Task 3: お題ツールをパネルと見出しの行へ置き換え、m90 を当て直す

**Files:**
- Modify: `apps/topic-web/src/components/TopicEditor.tsx:26`
- Modify: `apps/topic-web/src/components/TopicMaker.tsx:36`
- Modify: `apps/topic-web/src/components/CurrentTopic.tsx:29`
- Modify: `apps/topic-web/src/screens/TopicRoom.tsx:50-58,68-73`
- Modify: `apps/topic-web/src/index.css`（見出しと戻る導線の節・`.topic-current`・`.topic-panel`）
- Modify: `scripts/mutations/m90-topic-editor-draft-overwritten.patch`（文脈行 1 行）

**Interfaces:**
- Consumes: Task 1 の `.ui-panel`・`.ui-page-header`・`.ui-page-header-back`

- [ ] **Step 1: パネルにクラスを当てる**

- `TopicEditor.tsx`: `<section className="topic-panel" aria-labelledby=…>` → `<section className="topic-panel ui-panel" aria-labelledby=…>`
- `TopicMaker.tsx`: 同じく `className="topic-panel"` → `className="topic-panel ui-panel"`
- `CurrentTopic.tsx`: `<section className="topic-current" …>` → `<section className="topic-current ui-panel" …>`

- [ ] **Step 2: 見出しの行を当てる**

`TopicRoom.tsx` の入室を待つ画面（P4）:

```tsx
        <main className="page">
          <header className="ui-page-header">
            <h1>{JOINING_HEADING}</h1>
            {/* 参加の返事が来ないまま待つ期限は無い（spec §10.1）。待たされた人が自分で戻れるように。 */}
            <a className="ui-page-header-back" href={hubPathFor(roomCode)}>
              {BACK_LINK}
            </a>
          </header>
          {sync.retryNotice && <p className="ui-note" role="status">{sync.retryNotice}</p>}
          {sync.error && <p className="ui-note ui-note--error" role="alert">{sync.error}</p>}
        </main>
```

ルーム画面:

```tsx
        <header className="ui-page-header">
          <h1>{PAGE_HEADING}</h1>
          <a className="ui-page-header-back" href={hubPathFor(roomCode)}>
            {BACK_LINK}
          </a>
        </header>
```

- [ ] **Step 3: 画面の CSS から写しを消す**

`apps/topic-web/src/index.css`:

1. 「見出しと戻る導線（poker-web の `.room-title` と同じ組み方）」の節（見出しの行のコメントと `.topic-header`・`.topic-back` の 2 規則）を、次の 1 行に置き換える:

```css
/* ---------- 見出しと戻る導線は部品層（`.ui-page-header`・ADR 0022）が持つ ---------- */
```

2. `.topic-current` のコメントと規則を次に置き換える（面は部品へ。並びだけ残す）:

```css
/* 面（不透明な地・枠・角丸・内側の余白）は部品（`.ui-panel`）が持つ。ここには並びだけを置く。 */
.topic-current {
  display: grid;
  gap: var(--space-3);
}
```

3. `.topic-panel` の規則を次に置き換える:

```css
/* 面は部品（`.ui-panel`）が持つ。ここには並びだけを置く。 */
.topic-panel {
  display: grid;
  gap: var(--space-2);
  align-content: start;
}
```

- [ ] **Step 4: 単体テスト・lint・型検査を通す**

Run: `corepack pnpm --filter @tasuki/topic-web test && corepack pnpm --filter @tasuki/topic-web lint && corepack pnpm --filter @tasuki/topic-web typecheck`
Expected: PASS（単体テストは `role` と文言で掴んでいるので、クラスの差し替えで落ちない。落ちたらクラス名で掴んでいる箇所を探す）

- [ ] **Step 5: E2E のお題ツールの 2 本を見る**

Run: `cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/panels-headers.spec.ts -g 'お題ツール'; cd ..`
Expected: 1 本目と 3 本目が PASS（3 本目は Task 2 で赤だったもの）

- [ ] **Step 6: m90 の文脈行を直し、当てて赤を見る**

`git status --porcelain` が空であることを見てから（Step 7 のコミットの後に行う）:

```bash
sed -i 's|^     <section className="topic-panel" aria-labelledby|     <section className="topic-panel ui-panel" aria-labelledby|' scripts/mutations/m90-topic-editor-draft-overwritten.patch
git diff --stat scripts/mutations/m90-topic-editor-draft-overwritten.patch   # 1 行の置き換えだけ
git apply --check scripts/mutations/m90-topic-editor-draft-overwritten.patch && echo APPLIES
git apply scripts/mutations/m90-topic-editor-draft-overwritten.patch
corepack pnpm --filter @tasuki/topic-web test; echo "exit=$?"
git apply -R scripts/mutations/m90-topic-editor-draft-overwritten.patch
git status --porcelain   # m90 のパッチだけが変更として残る
```

Expected: `APPLIES`。テストは `exit=1` で、落ちるのは `topic-room.test.tsx` の「Given 下書きの途中 / When 別の人のお題が届く / Then 下書きは残る」。
**文脈行の先頭の空白の数はパッチの現物に合わせる**（`sed` が 0 件置換なら `git diff --stat` が空になる。そのときはパッチを開いて行を直接直す）。
ほかの変異パッチが Task 3〜5 で触るファイルを文脈に持っていないことは計画の段で確かめた（m87 は `RoomChoice.tsx` の 130 行目付近で、Task 5 の変更は届かない）。
Task 5 の後に全件の `git apply --check` を Task 7 で流す

- [ ] **Step 7: コミットする**

Step 1〜5 の変更をコミットしてから Step 6 を行い、パッチを別にコミットする:

```bash
git add apps/topic-web
git commit -m "feat: お題ツールのパネルと見出しを部品層へ寄せる（#320 PR 3）"
git push
# Step 6 の後
git add scripts/mutations/m90-topic-editor-draft-overwritten.patch
git commit -m "test: m90 の文脈行をパネルの部品に合わせる（#320 PR 3）"
git push
```

---

### Task 4: poker をパネルと見出しの行へ置き換える

**Files:**
- Modify: `apps/poker-web/src/components/CurrentTopic.tsx:22`
- Modify: `apps/poker-web/src/pages/RoomPage.tsx:205-214`
- Modify: `apps/poker-web/src/index.css`（ルームヘッダー・節の見出し・いまのお題）

**Interfaces:**
- Consumes: Task 1 の `.ui-panel`・`.ui-page-header`・`.ui-page-header-back`

- [ ] **Step 1: マークアップのクラスを替える**

- `CurrentTopic.tsx`: `<section className="topic" aria-labelledby="poker-topic-heading">` → `<section className="topic ui-panel" aria-labelledby="poker-topic-heading">`
- `RoomPage.tsx`: `<div className="room-title">` → `<div className="ui-page-header">`、`<a className="room-back" href={inviteUrl}>` → `<a className="ui-page-header-back" href={inviteUrl}>`（上のコメントはそのまま）

- [ ] **Step 2: 画面の CSS から写しを消す**

`apps/poker-web/src/index.css`:

1. `.room-title` のコメント（「見出しと「選択画面へ戻る」を 1 行に組む…」）と規則、`.room-back` のコメントと規則を消し、`.room header h1` の前に次のコメントを置く:

```css
/* 見出しと「選択画面へ戻る」を 1 行に組む並びは部品（`.ui-page-header`・ADR 0022）が持つ（#95 S5c 追補）。
   ここには poker の見出し自身の大きさと余白だけを置く。 */
```

2. 節の見出しの規則（`.room > section:not(.topic) > h2`）のコメントの末尾に 1 文を足す（規則は変えない。P5）:

```css
 * 見出しだけに地を敷く形は poker にしか無いので、部品（`.ui-panel`）へは寄せない（#320 PR 3）。 */
```

（既存の最後の行 `…お題の見出しは `.topic` の地に乗るので外す。 */` の ` */` を取り、上の行を続ける）

3. `.topic` のコメントと規則を次に置き換える:

```css
/* 面（不透明な地・枠・角丸・内側の余白）は部品（`.ui-panel`）が持つ。地を持たない h2（`--gold`）は
 * 羅紗の最も明るい停止点（felt-700）の上で AA を割るので、お題はパネルに載せる。ここには並びだけを置く。 */
.topic {
  display: grid;
  gap: var(--space-3);
}
```

4. `.topic-body` のコメントの中の「`.topic` の暗い地（`--felt-900`）」は、地を部品が持つようになっても値は同じなので直さない

- [ ] **Step 3: 単体テスト・lint・型検査を通す**

Run: `corepack pnpm --filter @tasuki/poker-web test && corepack pnpm --filter @tasuki/poker-web lint && corepack pnpm --filter @tasuki/poker-web typecheck`
Expected: PASS

- [ ] **Step 4: E2E の poker を見る**

Run: `cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/panels-headers.spec.ts -g 'poker' specs/poker-a11y.spec.ts; cd ..`
Expected: どちらも PASS（`panels-headers` の 2 本目は Task 2 で赤だったもの。`poker-a11y` は `--gold` on `--felt-900` の組を固定していて、お題の面の地が消えると赤になる）

- [ ] **Step 5: コミットする**

```bash
git add apps/poker-web
git commit -m "feat: poker のお題の面と見出しを部品層へ寄せる（#320 PR 3）"
git push
```

---

### Task 5: 玄関のフォームとパネルを置き換える

**Files:**
- Modify: `apps/landing/src/screens/CreateRoom.tsx:68`
- Modify: `apps/landing/src/screens/JoinRoom.tsx:69`
- Modify: `apps/landing/src/screens/RoomChoice.tsx:79,94`
- Modify: `apps/landing/src/index.css`（`.hub-form`・`.hub-panel`）

**Interfaces:**
- Consumes: Task 1 の `.ui-panel`

- [ ] **Step 1: マークアップのクラスを替える**

- `CreateRoom.tsx`・`JoinRoom.tsx`: `<form className="hub-form" …>` → `<form className="hub-form ui-panel" …>`
- `RoomChoice.tsx` の 2 箇所: `<section className="hub-panel" …>` → `<section className="hub-panel ui-panel" …>`

- [ ] **Step 2: 画面の CSS から写しを消す**

`apps/landing/src/index.css`:

1. `.hub-form` を次に置き換える（枠・角丸・地を消す。内側の余白と影は部品と違う値なので残す）:

```css
/* 面は部品（`.ui-panel`）が持つ。フォームは卓の上に浮かせる札なので、内側の余白を広く取り影を落とす。 */
.hub-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  width: min(100%, 26rem);
  padding: var(--space-6);
  box-shadow: var(--shadow-popover);
}
```

2. `.hub-panel` を次に置き換える:

```css
/* 面は部品（`.ui-panel`）が持つ。 */
.hub-panel {
  min-width: 0;
}
```

3. `@media (max-width: 720px)` の中の `.hub-form { padding: var(--space-5); }` は**残す**（上の `.hub-form` の `--space-6` を打ち消すのに要る）

- [ ] **Step 3: 検査が緑に戻ることを見る**

Run: `node scripts/audit-ui-components.mjs; echo "exit=$?"`
Expected: `exit=0`（死んだ部品が消える）

- [ ] **Step 4: 単体テスト・lint・型検査と E2E を通す**

Run:
```bash
corepack pnpm --filter @tasuki/landing test && corepack pnpm --filter @tasuki/landing lint && corepack pnpm --filter @tasuki/landing typecheck
cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/panels-headers.spec.ts specs/landing-design.spec.ts; cd ..
```
Expected: すべて PASS（`landing.spec.ts` などの既存のテストがクラス名で掴んでいれば落ちる。`git grep -nE "hub-form|hub-panel" apps/landing/tests e2e` で先に確かめる。計画の段では 0 件）

- [ ] **Step 5: コミットする**

```bash
git add apps/landing
git commit -m "feat: 玄関のフォームとパネルの面を部品層へ寄せる（#320 PR 3）"
git push
```

---

### Task 6: 壊して赤を見る（破壊検証・コミットしない）

各項目の前に `git status --porcelain` が空であることを見る。壊したファイルは、赤を見たら `git checkout -- <そのファイル>` で戻し、
もう一度 `git status --porcelain` が空であることを見る。

Run（各項目の確認に使う）: `cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/panels-headers.spec.ts; cd ..`

- [ ] **Step 1: 玄関の参加フォームの部品を外す**

`apps/landing/src/screens/JoinRoom.tsx` の `hub-form ui-panel` を `hub-form` に替える。
Expected: 2 本目が FAIL（`玄関の参加フォーム の面`。地が透明になる）

- [ ] **Step 2: お題ツールの「作る」の部品を外す**

`apps/topic-web/src/components/TopicMaker.tsx` の `topic-panel ui-panel` を `topic-panel` に替える。
Expected: 1 本目が FAIL（`お題ツールの「作る」 の面`）

- [ ] **Step 3: poker の戻る導線の部品を外す**

`apps/poker-web/src/pages/RoomPage.tsx` の `className="ui-page-header-back"` を消す。
Expected: 2 本目が FAIL（`poker の戻る導線の字の大きさ`。`main` の本文の大きさになる）

- [ ] **Step 4: 見出しの行の並びを消す**

`packages/ui/src/components/page-header.css` の `.ui-page-header` から `display: flex;` を消す。
Expected: 1 本目・2 本目・3 本目が FAIL（`戻る導線が見出しと同じ行にない`。h1 が塊になりリンクが下の行へ落ちる）

- [ ] **Step 5: 部品の地を変える**

`packages/ui/src/components/panel.css` の `background: var(--felt-900);` を `background: var(--felt-800);` に替える。
Expected: 1 本目・2 本目が FAIL（面の判定が部品の値を読んでいること。**画面の CSS に地の写しが残っていれば、その画面だけ緑のまま通る** —— 緑で通ったパネルがあれば写しの消し残しなので直す）

- [ ] **Step 6: 結果を記録する**

5 項目の「壊し方・落ちたテスト・失敗の 1 行目」を PR 本文の「テスト方法」に書く。**緑のまま通った項目があれば、その判定は恒真なので直す**

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
git grep -nE "room-title|room-back|topic-header|topic-back" -- apps packages e2e
```
Expected: すべて緑。自己テストは `# fail 0` だけ。`NG:` と `NOT APPLY:` の行は出ない。最後の grep は 0 件（消したクラスがマークアップ・CSS・注釈に残っていない）。
**`| tail` や `| head` で終了コードを隠さない**

加えて、面の宣言が画面の CSS に残っていないことを目で見る（Review Focus 4）:

```bash
for f in apps/landing/src/index.css apps/topic-web/src/index.css apps/poker-web/src/index.css; do
  awk -v f="$f" '/^\.(hub-form|hub-panel|topic-panel|topic-current|topic) \{/{p=1} p{print f": "$0} /^\}/{p=0}' "$f"
done
```
Expected: 出てくる規則に `border`・`border-radius`・`background` が無い（`.hub-form` の `padding` と `box-shadow` は P1 のとおり残る）

- [ ] **Step 2: 構造監査の SC の行を main と並べる**

`SCRATCH` には実行するセッションのスクラッチパッドのディレクトリを入れる（リポジトリの中に置かない）。

Run:
```bash
git worktree add "$SCRATCH/main-wt" main
node scripts/audit-structure.mjs > "$SCRATCH/sc-branch.txt"
(cd "$SCRATCH/main-wt" && node scripts/audit-structure.mjs) > "$SCRATCH/sc-main.txt"
diff "$SCRATCH/sc-main.txt" "$SCRATCH/sc-branch.txt"
```
Expected: 差は走査量の件数（ファイルが増えた分）だけ。指標の値が後退していれば、原因を PR 本文に書く。
（`audit-structure.mjs` が main の worktree で依存無しに走らなければ、その旨を記録して次へ進む）

- [ ] **Step 3: E2E を全部流す**

Run: `corepack pnpm e2e`
Expected: 全件 PASS

- [ ] **Step 4: 見た目の変わる画面を main と並べて撮る**

使い捨ての spec を E2E のハーネスで流して撮る（PR 2 で worktree＋dev より軽かった）。撮ったら
`git checkout main -- apps packages` → 同じ spec で撮る → `git checkout HEAD -- apps packages` で戻す
（**戻す前後で `git status --porcelain` を見る**。使い捨ての spec はスクラッチパッドに置き、リポジトリへ入れない）。
1280px と 360px で次を撮る:
- 玄関: 作成画面・選択画面（参加者と招待のパネル）
- お題ツール: ルーム画面（見出しの行・いまのお題・書く・作る）・入室を待つ画面（WS を成立させない）
- poker: お題を出したルーム画面（見出しの行・お題の面・節の見出しの地 —— P5 の判断材料）

撮ったものはスクラッチパッドの `shots/` に置く（コミットしない）。
Expected: 差は、この計画の「正本 D7 の表に無い見た目の変化」の 2 項目だけ。**それ以外の差（パネルの余白・枠・地）が出たら止める**

終わったら main の worktree を `git worktree remove` で片付け、dev サーバーやポートを掴んだままにしない

- [ ] **Step 5: 利用者に Chrome での目視を頼む**

利用者に撮影の対・「正本 D7 の表に無い見た目の変化」の 2 項目・**P5（poker の節の見出しをパネルに寄せないこと）**を見せ、受け入れるかを聞く。
P5 が覆ったら、この PR には入れず別の PR にする（節の並びが変わるため）

---

### Task 8: PR を作り、レビューを通す

- [ ] **Step 1: PR を作る**

Run:
```bash
gh pr create --base main --title "feat: パネルの面と見出しの行を部品層へ寄せる（#320 PR 3）" --body-file <本文のファイル>
```

本文（`## 概要`・`## 変更内容`・`## テスト方法` の形。`Closes` は書かない —— #320 は epic で PR 5 まで続く。**地の文にも閉鎖キーワードを書かない**）に次を含める:
- 設計正本・この計画・ADR 0022 へのリンク
- この計画の「この計画で決めたこと」P1〜P8 の要約
- 見た目が変わる画面（表に無い 2 項目）と、Task 7 の撮影の要約・利用者の目視の結果（P5 を含む）
- Task 6 の破壊検証の結果
- 既知の見逃し: パネルの面をクラス名で写し直す形（画面のクラスに地・枠を書き戻す）は検査に出ない（ADR 0022 決定 6）。E2E の面の判定が見るのは 8 つのパネルだけで、同じ値の写しの残りは見た目にも E2E にも出ない（Task 7 Step 1 の目視で見た）

- [ ] **Step 2: 文脈を共有しない `/code-review` を PR 番号を明示して通す**

指摘は採点が出てから直す（採点の間に直さない）。直したら push し、Task 7 Step 1 を流し直す。

- [ ] **Step 3: マージの後に記録を直す**

マージは利用者が行う。マージの後、#320 に PR 3 の進捗コメントを書く（PR 4 の計画は PR 3 が入った main の現物を見てから書く）
