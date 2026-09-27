# 部品層の骨組みと入力欄の系・写しを止める検査（#320 PR 1）実装計画

> **作業者へ:** 必須サブスキル —— `superpowers:subagent-driven-development`（推奨）または
> `superpowers:executing-plans` を使って 1 タスクずつ実装すること。
> 手順のチェックボックス（`- [ ]`）で進捗を追う。

**ゴール**: `@tasuki/ui` に部品層（`packages/ui/src/components/`）を足し、入力欄の系（`.ui-input`・`.ui-select`）を置く。
玄関・お題ツールの入力欄の写しと、timer のプルダウン 2 つをこの部品へ置き換え、写しと部品層の規則違反を
`scripts/audit-ui-components.mjs` で止める。

**方式**: 部品は `.ui-` で始まるクラスだけで書いた素の CSS（`@layer` 不使用）。つまみは `var()` の第 2 引数で既定値を持ち、
画面は `:root` で上書きする。検査は postcss で CSS を、postcss-selector-parser でセレクタを読む純粋関数にし、
`main()` は走査対象の導出・0 件ガード・出力だけを持つ。

**技術**: 素の CSS / Node v22（`node:test`）/ postcss 8.5.25・postcss-selector-parser 7.1.5（ルートの devDependencies に足す）/
Playwright（E2E）/ stylelint（既存）

**設計正本**: `docs/superpowers/specs/2026-09-27-ui-components-layer-design.md`（**計画は正本に従属する。両方を読むこと**）。
この計画は正本 §7 の **PR 1** だけを扱う。PR 2〜5 の計画は PR 1 が入った後の現物を見てから書く。

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。
様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | Task 3・4 で検査の自己テストを先に書いて赤を見る。Task 3 の終わりに実リポジトリで既知の写しが赤に出ることを見てから、Task 6・7 で写しを置き換える。Task 8 の配線テストは赤を見てから ci.yml を直す |
| II. 技術選定は ADR を通す | 通過 | 依存木に既にある postcss と postcss-selector-parser を直接の依存にすることを ADR 0022 に記録する（Task 1・2・正本 D13） |
| III. 揮発インメモリと単純運用 | 該当なし | CSS と検査のみ。配布は epic の区切りで利用者に諮る（この PR では配らない） |
| IV. 境界の型安全 | 該当なし | 境界を越えるデータを扱わない |
| V. 実画面検証 | 通過 | Task 10 で正本 D7 の画面（timer の 2 つのプルダウン・玄関とお題ツールの入力欄）を main と並べて撮り、Chrome で目視する |
| VI. 依存は内向き | 該当なし | ドメインに触れない。`packages/ui` は依存を持たないまま |
| VII. 検査は壊して確かめる | 通過 | Task 3 の対照実行（既知の写しが過不足なく赤）・Task 9 の変異 3 本・自己テストの逃げ道の族 |
| VIII. 記録が正本 | 通過 | 決定は ADR 0022、使い方は `packages/ui/README.md`、完了条件は正本 §8。**この計画に数値の正本を作らない** |
| IX. 小さく回す | 通過 | PR 1 は入力欄の系だけ。分割の理由は正本 §7（ガイドの理由 1・3） |
| X. 抽象は実需で | 通過 | 部品は 2 画面以上が使うものだけ（`.ui-input` は玄関とお題ツール、`.ui-select` はお題ツールと timer）。死んだ部品は検査で落とす |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密も個人情報も扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない（ADR 0007 基準 2 を部品に当てない判断は ADR 0022 に理由つきで記録する。憲法からの逸脱ではない）。

## 全体の制約

- **ブランチ**: `feature/issue-320-ui-components`（`docs/issue-320-ui-components-spec` から切る。設計正本とこの計画のコミットを含んだまま PR 1 にする）
- **破壊検証・変異パッチ作りの前に `git status --porcelain` が空であることを見る**（`git checkout --` で未コミットの実装を消す事故を 4 度踏んでいる）
- **コミットしたらすぐ push する**
- **本番へ配布しない**
- 部品のセレクタは `.ui-` で始まるクラスだけ。修飾は `.ui-<部品>--<変化>`。`@layer` を使わない（正本 D3・D5）
- 部品の CSS に `outline` 系を書かない（例外は `.ui-select option` の `outline: none` だけ）・つまみ（`--*`）を宣言しない・生の色を書かない（正本 D4・D6・D11）
- 部品の字の大きさは `font-size: 1rem` を**同じ行の** `/* scale-exempt: 理由 */` つきで書き、一括指定の `font:` を使わない（既存の `packages/ui/tests/typography-scale.test.mjs` が見る）
- `::picker(select)` を含むセレクタを一覧に他と同居させない
- timer で部品を当てるのは**プルダウン 2 つだけ**。ほかの timer の入力欄・共有メモは #321
- 検査の依存は `env -i` の素の node で解決できることを確かめる（vitest の中では宣言が無くても解決できてしまう）
- scripts の自己テストは **bash** で回す（zsh は偽の赤を出す）
- E2E が同期サーバーの起動で即死したら、headroom のプロキシが 8787 を持っていないかを先に疑う
- コメント・docstring は日本語。「なぜ」を書く。ADR に数（「4 アプリ」など）を写さない。決定は完了形で書かない

## Review Focus

仕様が含意するが、どのタスクのテストも直接は叩かない失敗の型。レビューで最初に見る。

1. **timer のプルダウンの一覧で、ホバーした選択肢が見えなくなる**（`--ui-field-hover` の上書き漏れ）→ Task 7 Step 1 の E2E（E7）が固定する
2. **部品を当てた欄の字が 16px を下回る**（画面側の `font-size` の後勝ち）→ Task 3 の検査（D10 の 2）と Task 7 Step 1 の E2E（E6）
3. **`::picker` を知らないブラウザで欄の地まで消える**（一覧の同居）→ Task 4 の自己テスト（D11 の 2）
4. **玄関・お題ツールのフォーカスのリングが消える**（部品が `outline` を書いて要素層の `:focus-visible` を打ち消す）→ 既存の `expectFocusVisibleOnTab`（topic.spec・landing 側）と Task 4 の自己テスト（D11 の 3）
5. **検査が新しい画面の CSS を見ていない**（走査対象の導出漏れ・0 件）→ Task 3 の自己テストの「新しい Vite アプリ」「0 件」「`.css` 以外の拡張子」

---

### Task 1: ADR 0022 を書き、旧 ADR に注記を足す

**Files:**
- Create: `docs/adr/0022-ui-components-layer.md`
- Modify: `docs/adr/0001-design-system-scope.md`（末尾へ追記）
- Modify: `docs/adr/0020-invite-browser-operations.md`（末尾へ追記）
- Modify: `docs/adr/0007-abstraction-criteria.md`（末尾へ追記）
- Modify: `docs/adr/README.md`（一覧に 0022 の行）

**Interfaces:**
- Produces: ADR 0022 の決定番号（決定 1〜7）。README と検査の docstring がこの番号を指す

- [ ] **Step 1: ADR 0022 を書く**

`docs/adr/0022-ui-components-layer.md`:

```markdown
# ADR-0022: 部品層を置き、共有は既定・外すなら申告する

- **ステータス**: Accepted（2026-09-27）
- **関連**: [#320](https://github.com/tomohiroJin/tasuki-tools/issues/320)・
  [設計正本](../superpowers/specs/2026-09-27-ui-components-layer-design.md)・
  [ADR-0001](./0001-design-system-scope.md)・[ADR-0007](./0007-abstraction-criteria.md)・
  [ADR-0020](./0020-invite-browser-operations.md)・[ADR-0021](./0021-topic-as-shared-context.md)

## 背景

`@tasuki/ui` が共有していたのはトークンと素の要素の見た目までで、入力欄・プルダウン・告知の帯のような部品は
各画面が「別の画面と同じ組み方」を写していた。#317 の修正（PR #319）では、同じプルダウンの直し方を 2 か所に書いた。
写しの間で値が食い違い、エラーの色は画面ごとに別々になっていた（設計正本 §3）。

利用者の方針（2026-09-27）: 画面は機能ごとに別々に考え、どう表現するかは機能側が決める。ただし複数の画面で
共通する部品はできる限り共有し、同じデザインシステムの上で統一感のある画面にする。共通部品を使うことは強制しない。

## 決定

### 1. 部品層を置く

`packages/ui/src/components/` を部品層とし、`@tasuki/ui/components.css` として公開する。
部品は **`.ui-` で始まるクラスだけ**で定義する（修飾は `.ui-<部品>--<変化>`）。クラスを当てたときだけ効く。
部品層は `@layer` を使わない（Tailwind のレイヤー構造に依存しない）。

### 2. 共有の条件（ADR-0007 の適用を狭める）

部品層に部品を置く条件は、**同じ見た目の知識を持つ**ことと、**2 画面以上が使う**ことの 2 つとする。
**ADR-0007 基準 2（20 行未満の重複は抽出しない）はデザインシステムの部品には当てない。**
基準 2 はロジックの抽出で間接参照のコストが重複のコストを上回ることを前提にしている。見た目の部品は、
数行の重複でも片方だけ直ると画面の見た目がずれ、a11y が割れる。基準 1（利用者 1 つは抽出しない）はそのまま当てる。

### 3. 共有は既定、外すなら申告する

画面は共有部品を使うことを既定とする。機能側が独自の見た目にしたいときは、その規則の直前に
`/* ui-exempt: 理由 */` を書けば外れてよい。**理由の中身は審査しない。** 理由が空の申告と、何も免除していない申告は
検査が落とす。中央の例外表は持たない（台帳は `git grep ui-exempt`）。

### 4. 部品と画面の役割

部品は見た目と、見た目に関わる知識を持つ。画面は配置と画面固有の上書きを持ち、配置もクラスで書く。
フォーカスのリングは部品が持たない（要素層の `:focus-visible`、timer は自前のもの）。
画面が変えてよい値は「つまみ」（`--ui-*`）として出し、部品の規則の中では宣言しない。

### 5. ADR-0020 と ADR-0001 決定 1 の一部を置き換える

- ADR-0020 の「表示の構造・スタイルは各画面が持ち」のうち**スタイル**を置き換える。見た目の部品は部品層が持つ。
  表示の構造（マークアップと React の部品）は各画面のままで、ADR-0021 決定 7 と設計正本 T13 は変えない
- ADR-0001 決定 1 の「timer はトークン層だけを読み」を置き換える。**timer はトークン層と部品層を読む。**
  要素層を読まない理由（素の要素を飾る規則が Tailwind のユーティリティと部分的に上書きし合う）は維持する

**決定の一部を別の ADR で置き換える作法**: 旧 ADR の本文は書き換えず、該当する決定の末尾の追記に
「現行の正本は ADR-0022」とだけ書く（ADR-0002）。旧 ADR のステータスは Superseded にしない（決定の残りは有効なため）。

### 6. 検査

写しと部品層の規則を `scripts/audit-ui-components.mjs` で止める。機械で止めるのは、要素型のセレクタで書いた
入力欄の系の写しと、部品層の規則違反と、部品を当てた入力欄の字の大きさの上書きである。クラス名で書いた写しは
レビューと `packages/ui/README.md` が担う。生の色の禁止をアプリの CSS と要素層へ広げることは決定した（実施は #320 の PR 5）。

### 7. 検査の依存

ルートの devDependencies に `postcss` と `postcss-selector-parser` を足す。どちらも依存木に既にある実体
（stylelint・vite の依存）で、新しい技術ではない。直接の依存にするのは、`scripts/` の検査が素の node で解決するため。
`scripts/` の「追加依存は禁止」の慣行は、この検査に限って外れる。

## 影響

- 新しい画面は、部品層にある部品を使えば入力欄の系の知識（16px の下限・白い一瞬の回避など）を写さずに済む
- 部品を当てた timer のプルダウンは、字が 16px になり欄が高くなる（iOS の自動拡大の修正を兼ねる）
- 告知・一言・パネル・見出し・招待・象牙の札・Markdown の見た目を部品層へ寄せることは決定した（実施は #320 の PR 2〜4）
- ボタンの形・大きさの段と、最大幅・段組みの段は #316 が部品層に足す。Markdown の描画（React）の置き場は #315 が決める
```

- [ ] **Step 2: 旧 ADR の末尾へ注記を足す**（**節の途中へ挟まない。末尾へ**）

`docs/adr/0001-design-system-scope.md` の末尾:

```markdown

## 追記（2026-09-27・#320）

決定 1 の「timer はトークン層だけを読み」は [ADR-0022](./0022-ui-components-layer.md) 決定 5 が置き換えた。
timer はトークン層と部品層を読み、要素層は読まない。**現行の正本は ADR-0022。** 要素層を読まない理由は変わらない。
```

`docs/adr/0020-invite-browser-operations.md` の末尾:

```markdown

## 追記（2026-09-27・#320）

決定の「表示の構造・スタイルは各画面が持ち」のうち**スタイル**は [ADR-0022](./0022-ui-components-layer.md) 決定 5 が
置き換えた。見た目の部品は `packages/ui` の部品層が持つ。**現行の正本は ADR-0022。** 表示の構造と、ブラウザ操作の共有は変わらない。
```

`docs/adr/0007-abstraction-criteria.md` の末尾:

```markdown

## 追記（2026-09-27・#320）

デザインシステムの部品には基準 2（20 行未満の重複は抽出しない）を当てない。条件と理由は
[ADR-0022](./0022-ui-components-layer.md) 決定 2。基準 1 と 3 はそのまま当てる。
```

- [ ] **Step 3: `docs/adr/README.md` の一覧の 0021 の行の下に足す**

```markdown
| [0022](./0022-ui-components-layer.md) | 部品層を置き、共有は既定・外すなら申告する | Accepted |
```

- [ ] **Step 4: リンク検査を通す**

Run: `node scripts/check-links.mjs`
Expected: `リンク検査 OK`

- [ ] **Step 5: コミットする**

```bash
git add docs/adr/0022-ui-components-layer.md docs/adr/0001-design-system-scope.md docs/adr/0020-invite-browser-operations.md docs/adr/0007-abstraction-criteria.md docs/adr/README.md
git commit -m "docs: 部品層の ADR 0022 を足し、ADR 0001・0007・0020 に注記する（#320）"
git push
```

---

### Task 2: 検査の依存を足す

**Files:**
- Modify: `package.json`（ルートの `devDependencies`）
- Modify: `pnpm-lock.yaml`（pnpm が書く）

**Interfaces:**
- Produces: `scripts/` から `import postcss from "postcss"` と `import selectorParser from "postcss-selector-parser"` が素の node で解決できる

- [ ] **Step 1: 足す前に、素の node で解決できないことを見る（対照）**

Run:
```bash
cd scripts && env -i PATH="$PATH" HOME="$HOME" node --input-type=module -e "await import('postcss'); await import('postcss-selector-parser'); console.log('resolved')"; cd ..
```
Expected: `ERR_MODULE_NOT_FOUND`（`Cannot find package 'postcss'`）

- [ ] **Step 2: 依存木にある実体と同じ版を足す**

Run: `corepack pnpm why postcss -r | head -5 ; corepack pnpm why postcss-selector-parser -r | head -5`
Expected: `postcss 8.5.25` と `postcss-selector-parser 7.1.5` が出る（違えば、出た版に読み替えて次へ進む）

Run: `corepack pnpm add -Dw postcss@8.5.25 postcss-selector-parser@7.1.5`
Expected: ルートの `package.json` の `devDependencies` に 2 行が入る。`pnpm-lock.yaml` の変更はルートの importer の 2 行が中心で、新しい版は入らない

- [ ] **Step 3: 素の node で解決できることを見る**

Run: Step 1 と同じコマンド
Expected: `resolved`

- [ ] **Step 4: 供給網の検査を通す**

Run:
```bash
node scripts/install-with-supply-chain-check.mjs
node scripts/audit-supply-chain-config.mjs
corepack pnpm audit --audit-level high
```
Expected: 3 本とも exit 0

- [ ] **Step 5: コミットする**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: 部品層の検査のために postcss と postcss-selector-parser をルートに足す（#320）"
git push
```

---

### Task 3: 画面の CSS の検査（走査対象・写し・申告・字の大きさ）

**Files:**
- Create: `scripts/audit-ui-components.mjs`
- Create: `scripts/audit-ui-components.test.mjs`

**Interfaces:**
- Consumes: `listRepoFiles`・`diffTargets`・`findEmptyScanDimensions`（`scripts/lib/scan-targets.mjs`）、`isDirectRun`（`scripts/lib/direct-run.mjs`）、`listWebAppDirs`（`scripts/audit-web-sync-boundary.mjs` の export）
- Produces（Task 4・9 が使う）:
  - `WEB_APPS: string[]`・`COMPONENTS_DIR: string`
  - `unescapeIdent(s: string): string`
  - `touchesFieldElement(selector: string): boolean`
  - `classesOf(selector: string): Set<string>`
  - `classifyStyleFiles(rels: string[]): { screen: string[], components: string[], foreign: string[] }`
  - `checkScreenCss(file: string, css: string): { file: string, line: number, message: string }[]`

- [ ] **Step 1: 自己テストを書く**

`scripts/audit-ui-components.test.mjs`:

```js
/**
 * `audit-ui-components.mjs` の自己テスト（#320・設計正本 §5・§9）。
 *
 * **逃げ道の族を全部ここへ置く。** 検査の述語を実装と同じ形で書くと、実装が見落とす書き方を
 * テストも見落とす（オラクルは実装より広く書く）。大文字・エスケープ・擬似クラスの引数・入れ子・
 * 一覧の後ろ側・`@media` の中を、それぞれ 1 件ずつ固定する。
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  checkScreenCss,
  classifyStyleFiles,
  touchesFieldElement,
  unescapeIdent,
} from "./audit-ui-components.mjs";

const messagesOf = (css) => checkScreenCss("apps/x/src/index.css", css).map((p) => p.message);

describe("touchesFieldElement: 入力欄の型か ::picker( を含むセレクタを見つける", () => {
  const hits = [
    [".topic-panel select", "子孫の位置"],
    ["SELECT", "大文字"],
    ["s\\65lect", "エスケープ"],
    [":is(select)", ":is の引数"],
    [":where(.a textarea)", ":where の引数"],
    [":global(input)", ":global の引数（.module.css）"],
    [":-webkit-any(option)", ":-webkit-any の引数"],
    ["select::picker(select)", "型と擬似要素"],
    [".x::picker(select)", "擬似要素だけ"],
    [".ui-select option", "部品の内側を画面が飾る"],
  ];
  for (const [selector, why] of hits) {
    test(`${why}: ${selector} は当たる`, () => {
      assert.equal(touchesFieldElement(selector), true);
    });
  }
  const misses = [
    [".hub-input", "クラス名だけ（射程外・README が担う）"],
    ["label", "label は対象にしない"],
    [".selector", "select を含む名前のクラス"],
    ["[type='text']", "属性だけ"],
  ];
  for (const [selector, why] of misses) {
    test(`${why}: ${selector} は当たらない`, () => {
      assert.equal(touchesFieldElement(selector), false);
    });
  }
});

describe("unescapeIdent", () => {
  test("16 進のエスケープと 1 文字のエスケープを解く", () => {
    assert.equal(unescapeIdent("s\\65lect"), "select");
    assert.equal(unescapeIdent("s\\65 lect"), "select");
    assert.equal(unescapeIdent("\\73 elect"), "select");
    assert.equal(unescapeIdent("a\\.b"), "a.b");
  });
});

describe("checkScreenCss: 写しの検出", () => {
  test("一覧の後ろ側だけが入力欄でも落とす", () => {
    assert.equal(messagesOf(".a, select { color: var(--x); }").length, 1);
  });
  test("@media の中の規則も落とす", () => {
    assert.equal(messagesOf("@media (min-width: 1px) { select { color: var(--x); } }").length, 1);
  });
  test("入れ子の子の規則も落とす", () => {
    assert.equal(messagesOf(".a { & select { color: var(--x); } }").length, 1);
  });
  test("入れ子の親が入力欄なら親を落とす", () => {
    assert.ok(messagesOf("select { &:hover { color: var(--x); } }").length >= 1);
  });
  test("クラス名だけの規則は落とさない", () => {
    assert.deepEqual(messagesOf(".hub-input { color: var(--x); }"), []);
  });
  test("@keyframes の from / 50% を解析して落ちない", () => {
    assert.deepEqual(messagesOf("@keyframes k { from { opacity: 0; } 50% { opacity: 1; } }"), []);
  });
  test("行番号を返す", () => {
    const [p] = checkScreenCss("f.css", "\n\nselect { color: var(--x); }");
    assert.equal(p.line, 3);
  });
});

describe("checkScreenCss: 申告（ui-exempt:）", () => {
  test("直前の申告があれば通す", () => {
    assert.deepEqual(messagesOf("/* ui-exempt: 計器の文字盤に合わせる */\nselect { color: var(--x); }"), []);
  });
  test("理由が空の申告は落とす", () => {
    assert.ok(messagesOf("/* ui-exempt: */\nselect { color: var(--x); }").some((m) => /理由が空/.test(m)));
  });
  test("何も免除していない申告は落とす", () => {
    assert.ok(messagesOf("/* ui-exempt: 昔の理由 */\n.a { color: var(--x); }").some((m) => /何も免除していない/.test(m)));
  });
  test("申告と規則の間に別の規則があれば、どちらも落とす", () => {
    const ms = messagesOf("/* ui-exempt: 理由 */\n.a { color: var(--x); }\nselect { color: var(--x); }");
    assert.ok(ms.some((m) => /何も免除していない/.test(m)));
    assert.ok(ms.some((m) => /入力欄の型/.test(m)));
  });
  test("申告は直後の規則 1 つだけを免除する", () => {
    const ms = messagesOf("/* ui-exempt: 理由 */\nselect { color: var(--x); }\ntextarea { color: var(--x); }");
    assert.equal(ms.length, 1);
  });
});

describe("checkScreenCss: 部品の入力欄の字の大きさ（16px の下限）", () => {
  test("部品のクラスに font-size を書いたら落とす", () => {
    assert.ok(messagesOf(".hub-form .ui-input { font-size: 0.8rem; }").some((m) => /16px/.test(m)));
  });
  test("一括指定の font も落とす", () => {
    assert.ok(messagesOf(".ui-select { font: inherit; }").some((m) => /16px/.test(m)));
  });
  test("字の大きさ以外は落とさない", () => {
    assert.deepEqual(messagesOf(".hub-invite.ui-input { font-family: var(--font-mono); }"), []);
  });
});

describe("classifyStyleFiles: 走査対象の仕分け", () => {
  test("トークン層と部品層を画面の CSS から外し、部品層は別に数える", () => {
    const r = classifyStyleFiles([
      "apps/landing/src/index.css",
      "packages/ui/src/elements/reset.css",
      "packages/ui/src/tokens/palette.css",
      "packages/ui/src/components/field.css",
    ]);
    assert.deepEqual(r.screen, ["apps/landing/src/index.css", "packages/ui/src/elements/reset.css"]);
    assert.deepEqual(r.components, ["packages/ui/src/components/field.css"]);
    assert.deepEqual(r.foreign, []);
  });
  test(".css 以外のスタイルの拡張子を名指しする", () => {
    const r = classifyStyleFiles(["apps/x/src/a.pcss", "apps/x/src/b.postcss", "apps/x/src/c.SCSS"]);
    assert.deepEqual(r.foreign, ["apps/x/src/a.pcss", "apps/x/src/b.postcss", "apps/x/src/c.SCSS"]);
  });
  test(".module.css は画面の CSS として数える", () => {
    assert.deepEqual(classifyStyleFiles(["apps/x/src/a.module.css"]).screen, ["apps/x/src/a.module.css"]);
  });
});
```

- [ ] **Step 2: 赤を見る**

Run: `bash -c 'node --test scripts/audit-ui-components.test.mjs'`
Expected: FAIL（`Cannot find module .../audit-ui-components.mjs`）

- [ ] **Step 3: 検査を書く（画面の CSS の部分と main）**

`scripts/audit-ui-components.mjs`:

```js
#!/usr/bin/env node
/**
 * 部品層の写しと規則を見る検査（#320・設計正本 §5・`docs/adr/0022` 決定 6）。
 *
 * ## 何を見るか
 *
 *   0. **走査対象の健全性**（`docs/adr/0014` 決定 1・8）: web アプリの宣言（{@link WEB_APPS}）と
 *      `vite.config.ts` の実在から導いた実体を照合する。スタイルのファイルは `apps/*` と `packages/*` の
 *      追跡下から導出し、`.css` 以外の拡張子があれば落とす。アプリごと・部品層の件数が 0 なら落とす
 *   1. **画面の CSS**（トークン層と部品層を除く全部。要素層を含む）:
 *      - 入力欄の型（`select` / `input` / `textarea` / `option`）か `::picker(` を含むセレクタの規則は落とす
 *      - 部品の入力欄（`.ui-input` / `.ui-select`）に字の大きさを書いたら落とす（16px の下限）
 *      - どちらも直前の `/* ui-exempt: 理由 *\/` で外せる。理由が空・何も免除していない申告は落とす
 *   2. **部品の CSS**: {@link checkComponentCss}（Task 4）
 *
 * ## 何を見ていないか —— 「足りる」とは言わない
 *
 * - **クラス名で書いた写し**（`.hub-input` の形・帯・一言・パネルなど）。CSS だけからは、そのクラスを
 *   どの要素に当てるか分からない。レビューと `packages/ui/README.md` が担う（ADR 0022 決定 6）
 * - `index.html` の `<style>` と `style` 属性、TSX の `style={{}}`、Tailwind のクラス（設計正本 D8 の残る穴）
 * - 属性だけのセレクタ（`[type='text']`）。型を名指ししない書き方は、画面の CSS では見逃す
 *
 * 設計方針: 判定は純粋関数、実 I/O と `process.exit` は `main()` の薄い配線だけに置く。
 * **依存は postcss と postcss-selector-parser だけ**（ADR 0022 決定 7。scripts の「追加依存は禁止」の例外）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import { diffTargets, findEmptyScanDimensions, listRepoFiles } from "./lib/scan-targets.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";
import { listWebAppDirs } from "./audit-web-sync-boundary.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** web アプリの宣言。実体（`vite.config.ts` の実在）と全単射で照合する。 */
export const WEB_APPS = ["apps/landing", "apps/poker-web", "apps/timer-web", "apps/topic-web"];

/** 部品層。ここは「画面の CSS」から外し、部品の規則で見る。 */
export const COMPONENTS_DIR = "packages/ui/src/components/";
/** トークン層。変数と `@font-face` だけなので、どちらの規則でも見ない（stylelint が要素・クラスを禁じている）。 */
const TOKENS_DIR = "packages/ui/src/tokens/";

/** 共有部品のある要素の型。`label` は入れない（要素層の `label` があり、画面ごとの配置で触る）。 */
const FIELD_TYPES = new Set(["select", "input", "textarea", "option"]);
/** 字の大きさを画面に上書きさせない部品のクラス（16px の下限）。 */
const FIELD_PART_CLASSES = new Set(["ui-input", "ui-select"]);

/** `.css` 以外のスタイルの拡張子。Vite はこれらもそのまま扱うので、見えないまま写しが入る。 */
const FOREIGN_STYLE = /\.(pcss|postcss|scss|sass|less|styl)$/i;

/**
 * 識別子の CSS エスケープを解く。`s\65lect` は `select` と同じ型を選ぶ。
 * postcss-selector-parser が解いた値を返す版もあるので、2 度通しても変わらない形にしてある。
 */
export function unescapeIdent(s) {
  return s.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([^\n])/g, (_, hex, ch) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : ch,
  );
}

function parseSelector(selector) {
  return selectorParser().astSync(selector);
}

/**
 * セレクタのどこかに入力欄の型か `::picker(` があるか。
 *
 * **`walk` は擬似クラスの引数の中まで降りる**ので、`:is(select)`・`:where()`・`:not()`・`:has()`・
 * `:global()` を 1 つの仕組みで拾える。型は大文字小文字を区別せず、エスケープを解いて比べる
 * （HTML の型名は大文字小文字を区別しない）。
 */
export function touchesFieldElement(selector) {
  let hit = false;
  parseSelector(selector).walk((node) => {
    if (node.type === "tag" && FIELD_TYPES.has(unescapeIdent(node.value).toLowerCase())) hit = true;
    if (node.type === "pseudo" && node.value.toLowerCase().startsWith("::picker")) hit = true;
  });
  return hit;
}

/** セレクタに現れるクラス名（エスケープを解いたもの）。 */
export function classesOf(selector) {
  const out = new Set();
  parseSelector(selector).walkClasses((c) => out.add(unescapeIdent(c.value)));
  return out;
}

/** 追跡下のスタイルのファイルを、画面の CSS・部品の CSS・`.css` 以外に仕分ける。 */
export function classifyStyleFiles(rels) {
  const screen = [];
  const components = [];
  const foreign = [];
  for (const rel of [...rels].sort()) {
    if (FOREIGN_STYLE.test(rel)) foreign.push(rel);
    else if (!rel.endsWith(".css")) continue;
    else if (rel.startsWith(COMPONENTS_DIR)) components.push(rel);
    else if (!rel.startsWith(TOKENS_DIR)) screen.push(rel);
  }
  return { screen, components, foreign };
}

const EXEMPT_RE = /^ui-exempt:([\s\S]*)$/;

/** 規則の直前の申告の理由。申告が無ければ `undefined`、理由が空なら `""`。 */
function exemptReasonOf(rule) {
  const prev = rule.prev();
  if (!prev || prev.type !== "comment") return undefined;
  const m = EXEMPT_RE.exec(prev.text.trim());
  return m ? m[1].trim() : undefined;
}

function where(file, node) {
  return { file, line: node.source?.start?.line ?? 0 };
}

/** `@keyframes` の中の規則か。`from` / `50%` はセレクタではないので、セレクタの解析器へ渡さない。 */
function inKeyframes(rule) {
  return rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name);
}

/** 画面の CSS の 1 つの規則が破っている事柄（申告を見る前）。 */
function screenRuleViolations(rule) {
  const found = [];
  const touched = rule.selectors.find(touchesFieldElement);
  if (touched !== undefined) {
    found.push(`入力欄の型か ::picker( を含むセレクタで見た目を書いています: ${touched}    ← 部品（.ui-input / .ui-select）を当てるか、直前に /* ui-exempt: 理由 */ を書く`);
  }
  const onPart = rule.selectors.some((s) => [...classesOf(s)].some((c) => FIELD_PART_CLASSES.has(c)));
  const setsSize = rule.nodes?.some((n) => n.type === "decl" && /^font(-size)?$/i.test(n.prop));
  if (onPart && setsSize) {
    found.push(`部品の入力欄の字の大きさを上書きしています（16px の下限を崩す）: ${rule.selector}`);
  }
  return found;
}

/** 画面の CSS を見る。返り値が空なら違反なし。 */
export function checkScreenCss(file, css) {
  const root = postcss.parse(css, { from: file });
  const problems = [];
  const usedExempts = new Set();
  root.walkRules((rule) => {
    if (inKeyframes(rule)) return;
    const violations = screenRuleViolations(rule);
    if (violations.length === 0) return;
    const reason = exemptReasonOf(rule);
    if (reason === undefined || reason === "") {
      for (const message of violations) problems.push({ ...where(file, rule), message });
    }
    if (reason !== undefined) usedExempts.add(rule.prev());
    if (reason === "") problems.push({ ...where(file, rule), message: "ui-exempt: の理由が空です" });
  });
  root.walkComments((comment) => {
    if (!EXEMPT_RE.test(comment.text.trim()) || usedExempts.has(comment)) return;
    problems.push({ ...where(file, comment), message: "何も免除していない ui-exempt: です    ← 直したなら消す" });
  });
  return problems;
}

/** 追跡下（と未追跡かつ gitignore 対象外）のスタイルのファイル。`**` は使わない（`*` が `/` を跨ぐ）。 */
function listStyleFiles() {
  const exts = ["css", "pcss", "postcss", "scss", "sass", "less", "styl"];
  return listRepoFiles(REPO_ROOT, ["apps", "packages"].flatMap((dir) => exts.map((ext) => `${dir}/*.${ext}`)));
}

function readExisting(rels, problems) {
  const out = [];
  for (const rel of rels) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      problems.push(`[走査対象の実体] ${rel} が見つかりません（git の追跡下だが作業ツリーに無い）    ← 復元するか git rm する`);
      continue;
    }
    out.push({ rel, text: fs.readFileSync(abs, "utf8") });
  }
  return out;
}

function parseOrReport(fn, file, text, problems) {
  try {
    return fn(file, text);
  } catch (e) {
    // 読めないファイルを飛ばすと、そこに書いた写しは永久に見えない。落とす。
    problems.push(`[構文] ${file} を解析できません: ${e.message}`);
    return [];
  }
}

function main() {
  const problems = [];
  const volume = [];

  const drift = diffTargets(WEB_APPS, listWebAppDirs());
  for (const m of drift.missing) problems.push(`[宣言と実体のずれ] 宣言した web アプリが見つかりません: ${m}`);
  for (const u of drift.unexpected) problems.push(`[宣言と実体のずれ] 実在する web アプリが WEB_APPS に宣言されていません: ${u}`);

  const { screen, components, foreign } = classifyStyleFiles(listStyleFiles());
  for (const f of foreign) problems.push(`[拡張子] ${f} は .css ではありません。この検査が読めないので .css にする`);

  const screenFiles = readExisting(screen, problems);
  for (const app of WEB_APPS) {
    volume.push({ label: `${app} の CSS`, count: screenFiles.filter((f) => f.rel.startsWith(`${app}/`)).length });
  }
  volume.push({ label: "packages の画面の CSS", count: screenFiles.filter((f) => f.rel.startsWith("packages/")).length });

  for (const f of screenFiles) {
    for (const p of parseOrReport(checkScreenCss, f.rel, f.text, problems)) {
      problems.push(`[画面の CSS] ${p.file}:${p.line} ${p.message}`);
    }
  }

  console.log(`[audit-ui-components] 走査対象: ${volume.map((v) => `${v.label} ${v.count} 件`).join(" / ")}`);
  const empty = findEmptyScanDimensions(volume);
  if (empty.length > 0) problems.push(`[走査対象] 走査対象が 0 件です（${empty.join(" / ")}）。検査が空振りしています`);

  if (problems.length > 0) {
    console.error("[audit-ui-components] NG");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("[audit-ui-components] OK（違反 0 件）");
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
```

- [ ] **Step 4: 緑を見る**

Run: `bash -c 'node --test scripts/audit-ui-components.test.mjs'`
Expected: PASS（全件）。`unescapeIdent` か `touchesFieldElement` のエスケープの件だけが落ちたら、postcss-selector-parser の `node.value` が生の綴りを返している。`node.value` の代わりに `unescapeIdent(String(node.raws?.value ?? node.value))` を見る形へ直して緑にする（テストは変えない）

- [ ] **Step 5: 実リポジトリで対照実行する（既知の写しが過不足なく赤に出る）**

Run: `node scripts/audit-ui-components.mjs; echo "exit=$?"`
Expected: `exit=1`。`[画面の CSS]` の行が**次のファイルだけ**から出る（行番号は main の現物で変わりうるので、ファイルとセレクタで照合する）:
- `apps/topic-web/src/index.css`: `.topic-panel input` を含む規則（入力欄の地の規則・`focus-visible` の規則）・`.topic-panel textarea`・`.topic-panel select`（`base-select` の規則）・`.topic-panel select::picker(select)`・`.topic-panel option`・`.topic-panel option:hover`
- `apps/timer-web/src/index.css`: `select`（`base-select` の規則）・`select::picker(select)`・`option`・`option:hover`

**`apps/landing/src/index.css` と `apps/poker-web/src/index.css` と `packages/ui/src/elements/` からは 1 行も出ない**こと（`.hub-input` はクラス名の写しなので出ないのが正しい。既知の見逃しとして PR 本文に書く）。
上の一覧に無いファイル・セレクタが出たら、その場で止めて設計正本 §2.1 と突き合わせる。
走査量の行（`走査対象: apps/landing の CSS 1 件 / …`）が出て、どの内訳も 0 でないこと。

- [ ] **Step 6: コミットする**（CI にはまだ繋がない。Task 8 で繋ぐ）

```bash
git add scripts/audit-ui-components.mjs scripts/audit-ui-components.test.mjs
git commit -m "feat: 画面の CSS が入力欄の写しを書いたら落とす検査を足す（#320）"
git push
```

---

### Task 4: 部品の CSS の検査（先頭のクラス・同居・outline・つまみ・生の色・死んだ部品）

**Files:**
- Modify: `scripts/audit-ui-components.mjs`
- Modify: `scripts/audit-ui-components.test.mjs`

**Interfaces:**
- Consumes: Task 3 の `classesOf`・`classifyStyleFiles`
- Produces（Task 9 が使う）:
  - `findRawColors(value: string): string[]`
  - `checkComponentCss(file: string, css: string): { file: string, line: number, message: string }[]`
  - `uiTokensIn(text: string): Set<string>`
  - `findDeadParts(defined: Set<string>, usageByApp: Map<string, Set<string>>): string[]`
  - `definedPartClasses(css: string): Set<string>`

- [ ] **Step 1: 自己テストを足す**

`scripts/audit-ui-components.test.mjs` の import を次に置き換える:

```js
import {
  checkComponentCss,
  checkScreenCss,
  classifyStyleFiles,
  definedPartClasses,
  findDeadParts,
  findRawColors,
  touchesFieldElement,
  uiTokensIn,
  unescapeIdent,
} from "./audit-ui-components.mjs";
```

ファイル末尾に足す:

```js
const partMessagesOf = (css) => checkComponentCss("packages/ui/src/components/x.css", css).map((p) => p.message);

describe("checkComponentCss: セレクタは .ui- のクラスから始める", () => {
  const ok = [".ui-select", ".ui-select option", "textarea.ui-input", ".ui-select::picker(select)", ".ui-select option:hover"];
  for (const selector of ok) {
    test(`${selector} は通す`, () => {
      assert.deepEqual(partMessagesOf(`${selector} { color: var(--ivory); }`), []);
    });
  }
  const bad = ["select", ":focus-visible", "*", "[type='text']", ":root", ".a .ui-b", "body .ui-select"];
  for (const selector of bad) {
    test(`${selector} は落とす（全アプリへ漏れる）`, () => {
      assert.ok(partMessagesOf(`${selector} { color: var(--ivory); }`).some((m) => /\.ui- のクラス/.test(m)));
    });
  }
  test("一覧の片側だけが外れていても落とす", () => {
    assert.ok(partMessagesOf(".ui-select, select { color: var(--ivory); }").some((m) => /\.ui- のクラス/.test(m)));
  });
  test("入れ子を落とす", () => {
    assert.ok(partMessagesOf(".ui-a { & .ui-b { color: var(--ivory); } }").some((m) => /入れ子/.test(m)));
  });
  test("@scope と @layer を落とす", () => {
    assert.ok(partMessagesOf("@scope (.ui-a) { .ui-b { color: var(--ivory); } }").some((m) => /@scope/.test(m)));
    assert.ok(partMessagesOf("@layer x { .ui-b { color: var(--ivory); } }").some((m) => /@layer/.test(m)));
  });
});

describe("checkComponentCss: ::picker を一覧に同居させない", () => {
  test("同居は落とす（::picker を知らないブラウザが一覧ごと捨てる）", () => {
    assert.ok(partMessagesOf(".ui-select, .ui-select::picker(select) { appearance: base-select; }").some((m) => /同居/.test(m)));
  });
  test("単独なら通す", () => {
    assert.deepEqual(partMessagesOf(".ui-select::picker(select) { appearance: base-select; }"), []);
  });
});

describe("checkComponentCss: outline は選択肢だけ", () => {
  test("部品に outline を書いたら落とす（要素層のリングを打ち消す）", () => {
    assert.ok(partMessagesOf(".ui-input { outline: 0; }").some((m) => /outline/.test(m)));
    assert.ok(partMessagesOf(".ui-input:focus-visible { outline-offset: 2px; }").some((m) => /outline/.test(m)));
  });
  test("選択肢の outline: none は通す", () => {
    assert.deepEqual(partMessagesOf(".ui-select option:hover, .ui-select option:focus-visible { outline: none; }"), []);
  });
  test("一覧に選択肢以外が混ざれば落とす", () => {
    assert.ok(partMessagesOf(".ui-select option, .ui-select { outline: none; }").some((m) => /outline/.test(m)));
  });
});

describe("checkComponentCss: つまみを宣言しない", () => {
  test("カスタムプロパティの宣言を落とす（画面の上書きが継承に負ける）", () => {
    assert.ok(partMessagesOf(".ui-select { --ui-field-bg: var(--felt-950); }").some((m) => /つまみ/.test(m)));
  });
  test("var() の第 2 引数で既定値を持つのは通す", () => {
    assert.deepEqual(partMessagesOf(".ui-select { background: var(--ui-field-bg, var(--felt-950)); }"), []);
  });
});

describe("findRawColors: 生の色", () => {
  const raw = [
    ["#fff", "3 桁"], ["#FFFF", "4 桁"], ["#071f18", "6 桁"], ["#071f18cc", "8 桁"],
    ["rgba(0, 0, 0, 0.45)", "rgba"], ["RGBA(0,0,0,.1)", "大文字"], ["hsl(10 20% 30%)", "hsl"],
    ["oklch(0.7 0.1 80)", "oklch"], ["color(srgb 1 0 0)", "color()"], ["white", "名前の色"],
    ["var(--a, #fff)", "var の第 2 引数の中"], ["0 10px 15px rgba(0,0,0,.45)", "影の中"],
  ];
  for (const [value, why] of raw) {
    test(`${why}: ${value} を見つける`, () => {
      assert.ok(findRawColors(value).length > 0);
    });
  }
  const clean = [
    "var(--gold)", "var(--ui-field-bg, var(--felt-950))", "transparent", "currentColor", "inherit",
    "color-mix(in srgb, var(--gold) 50%, transparent)", "1px solid var(--line-strong)", "thin", "base-select",
  ];
  for (const value of clean) {
    test(`${value} は生の色ではない`, () => {
      assert.deepEqual(findRawColors(value), []);
    });
  }
  test("部品の CSS の生の色を落とす", () => {
    assert.ok(partMessagesOf(".ui-a { color: #fff; }").some((m) => /生の色/.test(m)));
  });
});

describe("死んだ部品", () => {
  test("uiTokensIn は ui- で始まる語だけを拾う", () => {
    assert.deepEqual([...uiTokensIn('className="ui-select x-ui-input ui-banner--unreachable"')].sort(), ["ui-banner--unreachable", "ui-select"]);
  });
  test("definedPartClasses は部品の CSS に定義したクラスを拾う", () => {
    assert.deepEqual([...definedPartClasses(".ui-select option:hover {} textarea.ui-input {}")].sort(), ["ui-input", "ui-select"]);
  });
  test("2 つ以上のアプリが使っていないクラスを返す", () => {
    const usage = new Map([
      ["apps/a", new Set(["ui-input", "ui-select"])],
      ["apps/b", new Set(["ui-input"])],
    ]);
    assert.deepEqual(findDeadParts(new Set(["ui-input", "ui-select"]), usage), ["ui-select"]);
  });
});
```

- [ ] **Step 2: 赤を見る**

Run: `bash -c 'node --test scripts/audit-ui-components.test.mjs'`
Expected: FAIL（`checkComponentCss` などが export されていない）

- [ ] **Step 3: 実装する**

`scripts/audit-ui-components.mjs` の `checkScreenCss` の後ろ（`listStyleFiles` の前）に足す:

```js
/**
 * CSS の名前の色（CSS Color 4 の 148 語）とシステムの色。**生の色を列挙で禁じるのではなく、
 * 色の直書きの綴りを全部拾うための辞書**である。仕様が固定しているので腐らない。
 */
const NAMED_COLORS = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
  cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
  darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
  darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
  firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
  hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
  lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
  mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred
  midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
  palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple
  rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
  slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
  whitesmoke yellow yellowgreen
  canvas canvastext linktext visitedtext activetext buttonface buttontext buttonborder field fieldtext highlight
  highlighttext selecteditem selecteditemtext mark marktext graytext accentcolor accentcolortext`
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * 値に含まれる色の直書き。**書いてよいのは `var(--…)`・`transparent`・`currentColor`・`inherit` などと、
 * それらを引数にした `color-mix()` だけ**（設計正本 D10 の 3）。
 *
 * カスタムプロパティの名前（`--gold` など）は色の名前と綴りが重なるので先に消す。**`var()` ごと消しては
 * ならない** —— 第 2 引数に書いた生の色（`var(--a, #fff)`）まで消えてしまう。
 */
export function findRawColors(value) {
  const v = value
    .replace(/"[^"]*"|'[^']*'/g, " ")
    .replace(/url\([^)]*\)/gi, " ")
    .replace(/--[A-Za-z0-9_-]+/g, " ");
  const found = [];
  for (const m of v.matchAll(/#[0-9a-f]{3,8}(?![0-9a-z_-])/gi)) found.push(m[0]);
  for (const m of v.matchAll(/(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/gi)) found.push(`${m[1]}(`);
  for (const m of v.matchAll(/(?<![\w-])[a-z]+(?![\w-])/gi)) {
    if (NAMED_COLORS.has(m[0].toLowerCase())) found.push(m[0]);
  }
  return found;
}

/** セレクタの先頭の複合セレクタ（最初の結合子の手前まで）に `.ui-` のクラスがあるか。 */
function firstCompoundHasPart(selector) {
  const [sel] = parseSelector(selector).nodes;
  for (const node of sel.nodes) {
    if (node.type === "combinator") return false;
    if (node.type === "class" && unescapeIdent(node.value).startsWith("ui-")) return true;
  }
  return false;
}

/** セレクタの最後の複合セレクタに `option` の型があるか。 */
function lastCompoundIsOption(selector) {
  const [sel] = parseSelector(selector).nodes;
  let isOption = false;
  for (const node of sel.nodes) {
    if (node.type === "combinator") isOption = false;
    if (node.type === "tag" && unescapeIdent(node.value).toLowerCase() === "option") isOption = true;
  }
  return isOption;
}

/** 部品の CSS を見る。返り値が空なら違反なし。**申告（ui-exempt）は部品の CSS では効かない。** */
export function checkComponentCss(file, css) {
  const root = postcss.parse(css, { from: file });
  const problems = [];
  const report = (node, message) => problems.push({ ...where(file, node), message });
  root.walkAtRules((at) => {
    if (/^(scope|layer)$/i.test(at.name)) report(at, `@${at.name} を使わない（設計正本 D5・D11）`);
  });
  root.walkRules((rule) => {
    if (inKeyframes(rule)) return;
    if (rule.parent?.type === "rule") {
      report(rule, `入れ子にしない（セレクタの先頭を検査できない）: ${rule.selector}`);
      return;
    }
    for (const s of rule.selectors) {
      if (!firstCompoundHasPart(s)) report(rule, `セレクタの先頭が .ui- のクラスではありません（全アプリへ漏れる）: ${s}`);
    }
    if (rule.selectors.length > 1 && rule.selectors.some((s) => /::picker\(/i.test(s))) {
      report(rule, `::picker( を含むセレクタを一覧に同居させない（知らないブラウザが規則ごと捨てる）: ${rule.selector}`);
    }
    const optionOnly = rule.selectors.every(lastCompoundIsOption);
    rule.walkDecls((d) => {
      if (d.prop.startsWith("--")) report(d, `部品の中でつまみを宣言しない（画面の上書きが継承に負ける）: ${d.prop}`);
      if (/^outline/i.test(d.prop) && !optionOnly) report(d, `部品に outline を書かない（要素層のリングを打ち消す）: ${rule.selector}`);
      const raw = findRawColors(d.value);
      if (raw.length > 0) report(d, `生の色を書かない（トークンを使う）: ${d.prop}: ${d.value}`);
    });
  });
  return problems;
}

/** 部品の CSS に定義した `.ui-` のクラス。 */
export function definedPartClasses(css) {
  const out = new Set();
  postcss.parse(css).walkRules((rule) => {
    if (inKeyframes(rule)) return;
    for (const s of rule.selectors) for (const c of classesOf(s)) if (c.startsWith("ui-")) out.add(c);
  });
  return out;
}

/** TSX の本文に現れる `ui-` で始まる語。`x-ui-input` のような語の途中は拾わない。 */
export function uiTokensIn(text) {
  return new Set([...text.matchAll(/(?<![\w-])ui-[a-z0-9]+(?:-{1,2}[a-z0-9]+)*/g)].map((m) => m[0]));
}

/** 2 つ以上のアプリが使っていない部品のクラス（ADR 0022 決定 2・#280 の死んだ CSS の経緯）。 */
export function findDeadParts(defined, usageByApp) {
  const users = (c) => [...usageByApp.values()].filter((s) => s.has(c)).length;
  return [...defined].filter((c) => users(c) < 2).sort();
}
```

`main()` の `for (const f of screenFiles) { … }` の後ろ（`console.log` の前）に足す:

```js
  // 部品の CSS。index.css（まとめ読み）も走査するので、0 件なら部品層が消えている。
  const componentFiles = readExisting(components, problems);
  volume.push({ label: "部品の CSS", count: componentFiles.length });
  const defined = new Set();
  for (const f of componentFiles) {
    for (const p of parseOrReport(checkComponentCss, f.rel, f.text, problems)) {
      problems.push(`[部品の CSS] ${p.file}:${p.line} ${p.message}`);
    }
    for (const c of parseOrReport((_, t) => [...definedPartClasses(t)], f.rel, f.text, problems)) defined.add(c);
  }

  // 死んだ部品。各アプリの src 配下の .tsx に現れる ui- の語を数える。
  const usageByApp = new Map();
  for (const app of WEB_APPS) {
    const tsx = readExisting(listRepoFiles(REPO_ROOT, [`${app}/src/*.tsx`]), problems);
    volume.push({ label: `${app} の TSX`, count: tsx.length });
    usageByApp.set(app, new Set(tsx.flatMap((f) => [...uiTokensIn(f.text)])));
  }
  for (const c of findDeadParts(defined, usageByApp)) {
    problems.push(`[死んだ部品] .${c} を使うアプリが 2 つ未満です    ← 2 画面以上に当てるか、部品層から消す（ADR 0022 決定 2）`);
  }
```

docstring の「2. **部品の CSS**: {@link checkComponentCss}（Task 4）」の行を次に置き換える:

```js
 *   2. **部品の CSS**（`packages/ui/src/components/`）: セレクタは `.ui-` のクラスから始める・入れ子と
 *      `@scope` / `@layer` を使わない・`::picker(` を一覧に同居させない・`outline` は選択肢だけ・
 *      つまみ（`--*`）を宣言しない・生の色を書かない。**申告では外せない**
 *   3. **死んだ部品**: 部品の CSS に定義した `.ui-*` を、2 つ以上のアプリの `src` 配下の `.tsx` が使う
```

- [ ] **Step 4: 緑を見る**

Run: `bash -c 'node --test scripts/audit-ui-components.test.mjs'`
Expected: PASS（全件）

- [ ] **Step 5: 実リポジトリで走らせる（部品層がまだ無いので 0 件で落ちる）**

Run: `node scripts/audit-ui-components.mjs; echo "exit=$?"`
Expected: `exit=1`。Task 3 Step 5 と同じ `[画面の CSS]` の行に加えて `走査対象が 0 件です（部品の CSS）` が出る

- [ ] **Step 6: コミットする**

```bash
git add scripts/audit-ui-components.mjs scripts/audit-ui-components.test.mjs
git commit -m "feat: 部品の CSS の規則と死んだ部品を検査する（#320）"
git push
```

---

### Task 5: 部品層と入力欄の系を置く

**Files:**
- Create: `packages/ui/src/components/index.css`
- Create: `packages/ui/src/components/field.css`
- Modify: `packages/ui/src/index.css`
- Modify: `packages/ui/package.json`（`exports` と `"//"`）
- Modify: `packages/ui/README.md`
- Modify: 「2 層」「CSS トークンと静的資産」を現況として書いている文（Step 5 の grep で拾う）

**Interfaces:**
- Produces（Task 6・7 が使う）: クラス `.ui-input`（`<input>` と `<textarea>`）・`.ui-select`、つまみ `--ui-field-bg`（既定 `--felt-950`）・`--ui-field-hover`（既定 `--felt-700`）、入口 `@tasuki/ui/components.css`

- [ ] **Step 1: 部品の CSS を書く**

`packages/ui/src/components/field.css`:

```css
/* ============================================================
   Tasuki UI — 入力欄の系（#320・ADR 0022）
   1 行の欄と複数行の欄は `.ui-input`、プルダウンは `.ui-select`。
   **クラスを当てたときだけ効く。** 配置（幅の割り付け・並び・外側の余白）は画面が持つ。

   つまみ（画面が `:root` か容器で宣言する。**ここでは宣言しない** —— 宣言すると画面の
   上書きが継承に負けて黙って効かない）:
     --ui-field-bg     欄と一覧の地。既定は面より沈める felt-950
     --ui-field-hover  一覧の選択肢のホバーの地。地を変える画面は、地と同じ色にならないよう必ずこれも変える
   ============================================================ */

.ui-input,
.ui-select {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--ui-field-bg, var(--felt-950));
  color: var(--ivory);
  /* 一括指定の `font: inherit` は使わない。親の `label`（要素層）の小さい字まで継承し、
     後ろの `font-size` と順序で競う（玄関の `.hub-input` の注釈）。字の大きさ以外だけを継承する。 */
  font-family: inherit;
  font-weight: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  font-size: 1rem; /* scale-exempt: 16px を下回る入力欄は iOS Safari がフォーカス時に画面を拡大する。1rem は利用者の既定の文字サイズを尊重する */
}

textarea.ui-input {
  resize: vertical;
}

.ui-input::placeholder {
  color: var(--ivory-faint);
}

/* 素の <select> の一覧を、Chrome はページと別の窓で描き、開いた最初の一瞬を白で塗る（#317）。
   `base-select` にすると一覧はページの中に描かれる。解さないブラウザは素の <select> に上の規則だけが効く。
   **`::picker(select)` を下の一覧に混ぜない** —— 知らないブラウザは一覧ごと規則を捨て、欄の地まで消える。 */
.ui-select {
  appearance: base-select;
}

.ui-select::picker(select) {
  appearance: base-select;
  margin-top: var(--space-1);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--ui-field-bg, var(--felt-950));
  color: var(--ivory);
  box-shadow: var(--shadow-popover);
  /* 一覧が長いと出るスクロールバーを、既定の灰色から卓の色へ寄せる（つまみ・溝の順）。 */
  scrollbar-width: thin;
  scrollbar-color: var(--gold-edge) var(--felt-900);
}

.ui-select option {
  padding: var(--space-2) var(--space-4);
}

/* 選択の目印はホバーの地が担う。フォーカスの枠は選択肢にだけ消す（部品層で outline を書いてよい唯一の場所）。 */
.ui-select option:hover:not(:disabled),
.ui-select option:focus-visible {
  background: var(--ui-field-hover, var(--felt-700));
  outline: none;
}
```

`packages/ui/src/components/index.css`:

```css
/* ============================================================
   Tasuki UI — 部品層のまとめ読み（#320・ADR 0022）

   **`.ui-` で始まるクラスだけを定義する層。** クラスを当てたときだけ効くので、
   timer-web を含む全アプリが読める（timer は `main.tsx` から読む。#297 と同じ理由）。
   `@layer` は使わない。画面の上書きは、同じ詳細度なら後に読む画面の CSS が勝つ。
   ============================================================ */

@import './field.css';
```

- [ ] **Step 2: 入口と exports を足す**

`packages/ui/src/index.css` の `@import './elements/index.css';` の次の行に足す:

```css
@import './components/index.css';
```

同ファイル冒頭のコメントの「**2 層構造**（ADR-0001）:」から「elements/ … 素の要素セレクタを飾る。poker-web / landing / topic-web 専用」までを次に置き換える:

```css
   **3 層構造**（ADR-0001・ADR-0022）:
     tokens/     … 変数と @font-face だけ。4 アプリすべてが読める
     elements/   … 素の要素セレクタを飾る。poker-web / landing / topic-web 専用
     components/ … `.ui-` のクラスだけを定義する部品。4 アプリすべてが読める
```

同じコメントの読み込みの例の `import '@tasuki/ui/tokens.css';` の行の下に足す:

```css
     import '@tasuki/ui/components.css';  -- 部品だけ（timer-web。tokens の後・index.css の前）
```

`packages/ui/package.json` の `exports` に足す（`"./card.css"` の行の後ろ）:

```json
    "./components.css": "./src/components/index.css"
```

同ファイルの `"//"` を次に置き換える:

```json
  "//": "CSS と書体だけのパッケージ。build / typecheck は持たない（TS を足すまで不要）。層はトークン・要素・部品の 3 つ（ADR 0001・ADR 0022）。lint（stylelint: 構文と、トークン層に要素セレクタを置かせない境界の検査）と test（node:test: トークンの契約と書体ファイルの実在と文字の大きさ 5 段の検査）は持つ。部品層の規則は scripts/audit-ui-components.mjs が見る。",
```

- [ ] **Step 3: 既存の検査を通す**

Run:
```bash
corepack pnpm --filter @tasuki/ui test
corepack pnpm --filter @tasuki/ui lint
```
Expected: どちらも PASS。`typography-scale.test.mjs` が `field.css` の `font-size: 1rem` を「同じ行に理由のある例外」として通すこと（落ちたら `scale-exempt:` が同じ物理行にあるかを見る）

- [ ] **Step 4: 検査で部品の CSS が通り、死んだ部品が出ることを見る**

Run: `node scripts/audit-ui-components.mjs; echo "exit=$?"`
Expected: `exit=1`。`[部品の CSS]` の行は 0 件。`[死んだ部品] .ui-input` と `[死んだ部品] .ui-select` が出る（まだどのアプリも当てていない）。`[画面の CSS]` の行は Task 3 Step 5 と同じ

- [ ] **Step 5: 「2 層」の現況の文を直す**

Run: `git grep -n '2 層\|CSS トークンと静的資産\|CSS と静的資産\|tokens だけを読' -- packages docs/guides AGENTS.md apps/*/src`
Expected: 少なくとも `docs/guides/architecture.md` の層の表の `packages/ui` の行・`packages/ui/README.md` の「## 2 層構造」・`apps/timer-web/src/main.tsx` と `apps/timer-web/src/index.css` の注釈が出る。`docs/adr/` と `docs/superpowers/` は当時の記録なので直さない。

直し方:
- `docs/guides/architecture.md` の `| UI 資産 | \`packages/ui\` | なし（CSS トークンと静的資産） |` を `| UI 資産 | \`packages/ui\` | なし（CSS のトークン・要素・部品と静的資産。ADR 0022） |` にする
- timer の 2 か所の注釈は Task 7 で直す
- その他に出た行は、現況として「2 層」「トークンだけ」を述べていれば 3 層（部品層を含む）に直す

- [ ] **Step 6: README に部品層の節を書く**

`packages/ui/README.md` の見出し `## 2 層構造` を `## 3 層構造` に変え、その節の末尾に次を足す（既存の 2 層の説明は残す）:

```markdown
### 部品層（`components/`・ADR 0022）

`.ui-` で始まるクラスだけを定義する層です。**クラスを当てたときだけ効く**ので、timer-web を含む全アプリが読めます。

| 部品 | 当てる要素 | つまみ |
|---|---|---|
| `.ui-input` | `<input>`・`<textarea>`（1 行・複数行の欄） | `--ui-field-bg` |
| `.ui-select` | `<select>`（一覧は `base-select` でページの中に描く） | `--ui-field-bg`・`--ui-field-hover` |

**使い方**

- 読み込み: poker-web / landing / topic-web は `@import '@tasuki/ui';` に含まれます。timer-web は `main.tsx` で
  `@tasuki/ui/tokens.css` の次・`./index.css` の前に `import '@tasuki/ui/components.css';` を置きます
- 画面が持つのは配置（幅の割り付け・並び・外側の余白）と画面固有の上書きです。**配置もクラスで書きます**
  （画面の CSS で `select` / `input` / `textarea` / `option` の型を含むセレクタを書くと、検査が落とします）
- つまみは画面の `:root` か容器で宣言します。**欄の地を変える画面は、ホバーの地も変えます**（同じ色だと選択の目印が消えます）
- 部品の入力欄の字の大きさは上書きしません（16px の下限。検査が落とします）

**部品を足す条件**（ADR 0022 決定 2）: 同じ見た目の知識を持つこと・2 画面以上が使うこと。
20 行に満たない重複でも足します。どのアプリも使わない部品は検査が落とします。

**共有部品を使わないとき**（ADR 0022 決定 3）: その規則の直前に `/* ui-exempt: 理由 */` と書きます。
理由の中身は問いません。理由が空の申告と、何も免除していない申告は検査が落とします。
外している箇所の一覧は `git grep ui-exempt` で引けます。

**部品の CSS の約束**（`scripts/audit-ui-components.mjs` が見る）: セレクタは `.ui-` のクラスから始める・
入れ子と `@scope` / `@layer` を使わない・`::picker(select)` を一覧に同居させない・`outline` を書かない
（例外は選択肢の `outline: none`）・つまみを宣言しない（既定値は `var()` の第 2 引数）・生の色を書かない。
字の大きさは同じ行の `/* scale-exempt: 理由 */` つきで書きます。

**機械で止めていないもの**: クラス名で書いた写し（例: 入力欄に独自のクラスを当てて同じ見た目を書く）。
新しい画面を作るときは、まずこの表を見てください。
```

- [ ] **Step 7: リンク検査と自己テストを通してコミットする**

Run: `node scripts/check-links.mjs && bash -c 'node --test scripts/audit-ui-components.test.mjs'`
Expected: どちらも OK / PASS

```bash
git add packages/ui docs/guides/architecture.md
git commit -m "feat: @tasuki/ui に部品層と入力欄の系を置く（#320）"
git push
```

---

### Task 6: 玄関とお題ツールの写しを部品へ置き換える

**Files:**
- Modify: `apps/topic-web/src/components/TopicEditor.tsx:38-40`
- Modify: `apps/topic-web/src/components/TopicMaker.tsx:39,54,89`
- Modify: `apps/topic-web/src/index.css`（「入力欄（玄関の `.hub-input` と同じ組み方）」の節）
- Modify: `apps/landing/src/screens/CreateRoom.tsx`・`apps/landing/src/screens/JoinRoom.tsx`（`className="hub-input"`）
- Modify: `apps/landing/src/screens/RoomChoice.tsx:96`（`className="hub-invite"`）
- Modify: `apps/landing/src/index.css`（`.hub-input, .hub-invite` の規則・`::placeholder`・`:focus-visible`・`.hub-invite` の注釈）

**Interfaces:**
- Consumes: Task 5 の `.ui-input`・`.ui-select`

- [ ] **Step 1: お題ツールのマークアップにクラスを当てる**

`apps/topic-web/src/components/TopicEditor.tsx` の 38・40 行目:

```tsx
        <input id={titleId} className="ui-input" value={title} maxLength={MAX_TOPIC_TITLE} onChange={(e) => setTitle(e.target.value)} />
        <label htmlFor={bodyId}>{BODY_LABEL}</label>
        <textarea id={bodyId} className="ui-input" value={body} rows={6} maxLength={MAX_TOPIC_BODY} onChange={(e) => setBody(e.target.value)} />
```

`apps/topic-web/src/components/TopicMaker.tsx`: 2 つの `<select` の `id={…}` の次の行に `className="ui-select"` を、`<input` の `id={`${id}-key`}` の次の行に `className="ui-input"` を足す。

- [ ] **Step 2: お題ツールの CSS から写しを消す**

`apps/topic-web/src/index.css` の `/* ---------- 入力欄（玄関の `.hub-input` と同じ組み方） ---------- */` から、`.topic-panel input:focus-visible, … { outline: … }` の規則の終わりまでを**丸ごと消し**、次の 1 行の注釈に置き換える:

```css
/* ---------- 入力欄は `@tasuki/ui` の部品層（`.ui-input` / `.ui-select`・ADR 0022）が持つ ---------- */
```

消える規則: `.topic-panel input, .topic-panel textarea, .topic-panel select`・`.topic-panel textarea`（`resize`）・
`base-select` の規則・`::picker(select)` の規則・`option`・`option:hover, option:focus-visible`・`:focus-visible` の規則。

- [ ] **Step 3: 玄関のマークアップにクラスを当てる**

`CreateRoom.tsx` の 2 つ・`JoinRoom.tsx` の 2 つの `className="hub-input"` を `className="ui-input"` に置き換える。
`RoomChoice.tsx` 96 行目の `className="hub-invite"` を `className="ui-input hub-invite"` に置き換える。

Run: `git grep -n 'hub-input' -- apps/landing`
Expected: `apps/landing/src/index.css` の中だけ（次の Step で消す）

- [ ] **Step 4: 玄関の CSS から写しを消す**

`apps/landing/src/index.css`:
- `.hub-input, .hub-invite { … }` の規則（`font-size: 1rem` の注釈を含む）を消す
- `.hub-input::placeholder { … }` を消す
- `.hub-input:focus-visible, .hub-invite:focus-visible { … }` を消す（フォーカスのリングは要素層の `:focus-visible` に揃う。offset が 2px → 3px になる）
- `.hub-invite { … }` の中の注釈「`font-size` はここに置かない。この規則は `.hub-input, .hub-invite`（本ファイル上部）より後ろにあり、…」を次に置き換える:

```css
  /* `font-size` はここに置かない。字の大きさは部品（`.ui-input`）が 16px の下限で持ち、
     画面から上書きすると iOS Safari の自動拡大対策を踏みつぶす（検査が落とす）。 */
```

Run: `git grep -n 'hub-input\|same.*hub-input\|玄関の `.hub-input`' -- apps packages docs/guides`
Expected: 0 件（注釈に残った名指しも直す）

- [ ] **Step 5: 検査で写しが消えたことを見る**

Run: `node scripts/audit-ui-components.mjs; echo "exit=$?"`
Expected: `exit=1`。`[画面の CSS]` の行は `apps/timer-web/src/index.css` だけになる。`[死んだ部品] .ui-select` が出る（お題ツールしか使っていない）。`.ui-input` の死んだ部品は出ない（玄関とお題ツール）

- [ ] **Step 6: 単体テスト・型検査・lint を通す**

Run:
```bash
corepack pnpm --filter @tasuki/topic-web --filter @tasuki/landing test
corepack pnpm --filter @tasuki/topic-web --filter @tasuki/landing typecheck
corepack pnpm --filter @tasuki/topic-web --filter @tasuki/landing lint
```
Expected: すべて PASS。クラス名をテストが名指ししていて落ちたら、テストの期待を `ui-input` へ直す（振る舞いのテストは変えない）

- [ ] **Step 7: コミットする**

```bash
git add apps/topic-web apps/landing
git commit -m "refactor: 玄関とお題ツールの入力欄を部品層へ寄せる（#320）"
git push
```

---

### Task 7: timer のプルダウン 2 つを部品へ置き換え、E2E を足す

**Files:**
- Modify: `apps/timer-web/src/main.tsx`
- Modify: `apps/timer-web/src/index.css`（`:root` と、`select` / `option` の規則）
- Modify: `apps/timer-web/src/ui/components/NotifySettingsPanel.tsx:67,177`
- Modify: `e2e/support/a11y.ts`（`expectPickerInPage` と新しい `expectFieldsAtLeast16px`）
- Modify: `e2e/specs/timer-a11y.spec.ts`・`e2e/specs/topic.spec.ts`・`e2e/specs/landing-design.spec.ts`

**Interfaces:**
- Consumes: Task 5 のつまみ `--ui-field-bg`・`--ui-field-hover`
- Produces: `expectFieldsAtLeast16px(page: Page): Promise<void>`（`e2e/support/a11y.ts`）

- [ ] **Step 1: E2E を先に書く（E6・E7）**

`e2e/support/a11y.ts` の `expectPickerInPage` の `expect(picker.optionHeights.every(…))` の行の後ろ・`await select.page().keyboard.press('Escape');` の前に足す:

```ts
  // **ホバーした選択肢が一覧の地から浮くこと**（#320・E7）。欄の地を変える画面がホバーの地を
  // 変え忘れると、両方が同じ色になって選択の目印が消える（timer は --panel-2 = felt-700 で実際にそうなる）。
  const option = select.locator('option:not(:disabled)').first();
  await option.hover();
  const hovered = await option.evaluate((o) => getComputedStyle(o).backgroundColor);
  expect(hovered, '選択肢のホバーの地が一覧の地と同じ（選択の目印が見えない）').not.toBe(picker.background);
```

同ファイルの末尾に足す:

```ts
/**
 * 部品を当てた入力欄の字が 16px を下回らないこと（#320・E6）。
 *
 * 16px 未満の入力欄は iOS Safari がフォーカス時に画面を拡大する。部品は 1rem で持つが、画面の CSS が
 * 後から字の大きさを当てると同じ詳細度の後勝ちで潰れる。**計算後の値で見る**（CSS の検査より広いオラクル）。
 */
export async function expectFieldsAtLeast16px(page: Page): Promise<void> {
  const sizes = await page.locator('.ui-input, .ui-select').evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({
        name: el.getAttribute('aria-label') ?? el.id,
        px: Number.parseFloat(getComputedStyle(el).fontSize),
      })),
  );
  // 当たる欄が無いまま空回りすると、下の判定は 1 度も走らずに緑になる
  expect(sizes.length, '部品を当てた入力欄が画面に無い（判定が空振りする）').toBeGreaterThan(0);
  for (const s of sizes) expect(s.px, `${s.name} の字が 16px を下回る`).toBeGreaterThanOrEqual(16);
}
```

`e2e/specs/timer-a11y.spec.ts`: import に `expectFieldsAtLeast16px` を足し、「通知音のプルダウンを開く」テストの `expectPickerInPage(…)` の後ろに `await expectFieldsAtLeast16px(page);` を足す。

`e2e/specs/topic.spec.ts`: import に `expectFieldsAtLeast16px` を足し、「言語と難易度のプルダウンを開く」テストの `for` の後ろに `await expectFieldsAtLeast16px(page);` を足す。

`e2e/specs/landing-design.spec.ts`: `import` に `expectFieldsAtLeast16px`（`../support/a11y`）を足し、幅ごとのテストの `await page.getByLabel('あなたの名前').fill('あや');` の直後に `await expectFieldsAtLeast16px(page);` を足す。

- [ ] **Step 2: timer 側で赤を見る**

Run: `cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/timer-a11y.spec.ts -g 'プルダウンが白く光らない'; cd ..`
Expected: FAIL。`部品を当てた入力欄が画面に無い`（timer はまだ `.ui-select` を当てていない）

- [ ] **Step 3: timer に部品層を読ませ、つまみを宣言する**

`apps/timer-web/src/main.tsx` の `import "@tasuki/ui/tokens.css";` の次の行に足し、直前の注釈の最後の文を次のように直す:

```tsx
// ここで読めば Vite 自身が解決して `assets/` へ出す。**`./index.css` より先に置く**
// （トークン → 部品 → 画面固有の上書きの順 —— 同じ詳細度なら後勝ち）。部品層（`.ui-` のクラスだけ）は
// 要素層と違って素の要素を飾らないので、Tailwind のユーティリティと衝突しない（ADR 0022 決定 5）。
import "@tasuki/ui/tokens.css";
import "@tasuki/ui/components.css";
import "./index.css";
```

`apps/timer-web/src/index.css` 冒頭の注釈の「要素層（`@tasuki/ui/elements.css`）は `button` や `h2` を直接飾るため **読まない** —— Tailwind のユーティリティと衝突する（ADR-0001）。」の後ろに足す:

```css
 * 部品層（`@tasuki/ui/components.css`）は `main.tsx` が読む（`.ui-` のクラスだけなので衝突しない・ADR-0022）。
```

`:root { … }` の「派生」の小節の後ろ（`:root` の閉じ括弧の前）に足す:

```css
  /* --- 部品層のつまみ（ADR-0022） -----------------------------------------
   * 欄と一覧の地は、同じ画面のほかの入力欄（Tailwind・#321 まで）と揃えてサブ面に置く。
   * **地を変えたのでホバーも変える** —— 部品の既定のホバー（felt-700）は --panel-2 と同じ色で、
   * 選択の目印が消える（E2E の expectPickerInPage が見る）。 */
  --ui-field-bg: var(--panel-2);
  --ui-field-hover: var(--panel-hover);
```

- [ ] **Step 4: timer の写しを消し、プルダウンにクラスを当てる**

`apps/timer-web/src/index.css` の `/* 素の <select> の一覧を、Chrome はページと別の窓で描き、…（#317）` の注釈から `option:hover, option:focus-visible { … }` の規則の終わりまでを消し、次の 1 行に置き換える:

```css
/* プルダウン（`<select>`）の見た目は部品層の `.ui-select` が持つ（#317 の白い一瞬の回避を含む・ADR 0022）。 */
```

`apps/timer-web/src/ui/components/NotifySettingsPanel.tsx`:
- 67 行目の `className="flex-1 rounded-md border border-[var(--hairline-strong)] bg-[var(--panel-2)] px-2 py-1.5 text-sm text-[var(--bone)]"` を `className="ui-select flex-1"` にする
- 177 行目の `className="mt-1 w-full rounded-md border border-[var(--hairline-strong)] bg-[var(--panel-2)] px-2 py-1.5 text-sm text-[var(--bone)]"` を `className="ui-select mt-1"` にする（幅は部品が持つので `w-full` は外す）
- 61 行目の `<div className="mt-1 flex gap-2">` を `<div className="mt-1 flex items-center gap-2">` にする（欄が高くなり、`h-8` の試聴ボタンと高さが揃わなくなるので、ボタンを縦の中央に置く。正本 D7）

- [ ] **Step 5: 検査が緑になることを見る**

Run: `node scripts/audit-ui-components.mjs; echo "exit=$?"`
Expected: `exit=0`・`[audit-ui-components] OK（違反 0 件）`

- [ ] **Step 6: timer の単体テストと型検査と lint を通す**

Run:
```bash
corepack pnpm --filter @tasuki/timer-web test
corepack pnpm --filter @tasuki/timer-web typecheck
corepack pnpm --filter @tasuki/timer-web lint
```
Expected: すべて PASS。`design-tokens.test.ts` などがクラス名の Tailwind の色を名指ししていて落ちたら、落ちた理由を読んでから直す（振る舞いのテストは変えない）

- [ ] **Step 7: E2E の緑を見る**

Run:
```bash
cd e2e
TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/timer-a11y.spec.ts specs/topic.spec.ts specs/landing-design.spec.ts
cd ..
```
Expected: すべて PASS

- [ ] **Step 8: E7 が本当に守っていることを壊して見る**（コミットしない）

Run: `git status --porcelain`
Expected: 空（空でなければコミットしてから進む）

`apps/timer-web/src/index.css` の `--ui-field-hover: var(--panel-hover);` の行を消し、Step 2 と同じ E2E を流す。
Expected: FAIL（`選択肢のホバーの地が一覧の地と同じ`）

Run: `git checkout -- apps/timer-web/src/index.css && git status --porcelain`
Expected: 空

- [ ] **Step 9: コミットする**

```bash
git add apps/timer-web e2e
git commit -m "refactor: timer のプルダウンを部品層へ寄せ、ホバーと字の大きさを E2E で固定する（#320）"
git push
```

---

### Task 8: 検査を CI へ繋ぎ、配線をテストで固定する

**Files:**
- Modify: `scripts/scan-target-wiring.test.mjs`（末尾に describe を足す）
- Modify: `.github/workflows/ci.yml`（`audit-web-sync-boundary.mjs` の段の後ろ）

- [ ] **Step 1: 配線のテストを書く**

`scripts/scan-target-wiring.test.mjs` の末尾に足す（`fs`・`path`・`REPO_ROOT`・`listTrackedFiles` は既存の import と定義を使う。無ければ既存の他の describe と同じ形で import する）:

```js
/**
 * CI への配線: すべての `audit-*.mjs` が ci.yml から呼ばれる（#320・設計正本 D12）。
 *
 * 上の「走査量の出力」は検査が**走れば**名乗ることを見るが、**CI が走らせているか**は見ない。
 * ci.yml の行は 1 本ずつ手で足しており、書き忘れると自己テストだけが CI で緑になって、実リポジトリの
 * 走査は一度も走らない。列挙ではなく導出で見る。
 */
describe("CI への配線: すべての audit-*.mjs が ci.yml から呼ばれる（導出で見る）", () => {
  const audits = listTrackedFiles(REPO_ROOT, ["scripts/audit-*.mjs"])
    .map((rel) => path.basename(rel))
    .filter((name) => !name.endsWith(".test.mjs"));
  const ci = fs.readFileSync(path.join(REPO_ROOT, ".github/workflows/ci.yml"), "utf8");

  test("検査スクリプトが 0 件でない（このガード自身の空振り検出）", () => {
    assert.ok(audits.length > 0, "audit-*.mjs が 0 件（このガードが空振りしている）");
  });

  for (const name of audits) {
    test(`${name} を ci.yml が呼ぶ`, () => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(ci, new RegExp(`^\\s*- run: node scripts/${escaped}\\s*$`, "m"), `${name} が ci.yml から呼ばれていない`);
    });
  }
});
```

- [ ] **Step 2: 赤を見る**

Run: `bash -c 'node --test scripts/scan-target-wiring.test.mjs 2>&1 | grep -E "^# (pass|fail)|audit-ui-components.mjs を ci.yml"'`
Expected: `audit-ui-components.mjs を ci.yml が呼ぶ` が fail し、他の `audit-*.mjs` は pass（`# fail 1`）

- [ ] **Step 3: ci.yml に段を足す**

`.github/workflows/ci.yml` の `- run: node scripts/audit-web-sync-boundary.mjs` と、その `if:` 行の後ろに足す:

```yaml

      # 部品層の写しと規則。画面の CSS が入力欄の型で見た目を書いていないこと・部品の CSS の約束・
      # 死んだ部品を見る（ADR 0022 決定 6・#320）。postcss をルートの依存から読むので install の後ろに置く。
      - run: node scripts/audit-ui-components.mjs
        if: steps.scope.outputs.code == 'true'
```

- [ ] **Step 4: 緑を見る**

Run: `bash -c 'node --test scripts/scan-target-wiring.test.mjs 2>&1 | grep -E "^# (pass|fail)"'`
Expected: `# fail 0`

- [ ] **Step 5: コミットする**

```bash
git add scripts/scan-target-wiring.test.mjs .github/workflows/ci.yml
git commit -m "ci: 部品層の検査を CI に繋ぎ、すべての audit が CI から呼ばれることを固定する（#320）"
git push
```

---

### Task 9: 検査の変異を登録し、既存の変異パッチが当たることを見る

**Files:**
- Create: `scripts/mutations/m111-ui-components-type-case-sensitive.patch`
- Create: `scripts/mutations/m112-ui-components-dead-exempt-ignored.patch`
- Create: `scripts/mutations/m113-ui-components-var-fallback-hidden.patch`
- Modify: `scripts/mutation-check.mjs`（`MUTATIONS` の末尾）

**Interfaces:**
- Consumes: Task 3・4 の `touchesFieldElement`・`checkScreenCss`・`findRawColors`

**番号は着手時に `MUTATIONS` の最大の `id` を見て振り直す**（並列作業で衝突した前例がある。振り直したらパッチのファイル名と中身の両方を直す）。

- [ ] **Step 1: 作業ツリーが空であることを見る**

Run: `git status --porcelain`
Expected: 空

- [ ] **Step 2: 変異 1 を作る（型の大文字小文字を区別する）**

`scripts/audit-ui-components.mjs` の `touchesFieldElement` の `FIELD_TYPES.has(unescapeIdent(node.value).toLowerCase())` を `FIELD_TYPES.has(unescapeIdent(node.value))` に書き換える。

Run:
```bash
git diff scripts/audit-ui-components.mjs > scripts/mutations/m111-ui-components-type-case-sensitive.patch
git checkout -- scripts/audit-ui-components.mjs
git status --porcelain
```
Expected: `?? scripts/mutations/m111-ui-components-type-case-sensitive.patch` だけ

- [ ] **Step 3: 変異 2 を作る（何も免除していない申告を見逃す）**

`checkScreenCss` の `root.walkComments((comment) => { … });` の本体を `root.walkComments(() => {});` に書き換える。

Run:
```bash
git diff scripts/audit-ui-components.mjs > scripts/mutations/m112-ui-components-dead-exempt-ignored.patch
git checkout -- scripts/audit-ui-components.mjs
git status --porcelain
```
Expected: パッチ 2 本の `??` だけ

- [ ] **Step 4: 変異 3 を作る（var() ごと消して第 2 引数の生の色を隠す）**

`findRawColors` の `.replace(/--[A-Za-z0-9_-]+/g, " ")` を `.replace(/var\([^()]*\)/gi, " ")` に書き換える。

Run:
```bash
git diff scripts/audit-ui-components.mjs > scripts/mutations/m113-ui-components-var-fallback-hidden.patch
git checkout -- scripts/audit-ui-components.mjs
git status --porcelain
```
Expected: パッチ 3 本の `??` だけ

- [ ] **Step 5: `MUTATIONS` の末尾に登録する**

`scripts/mutation-check.mjs` の `MUTATIONS` の最後の要素の後ろに足す:

```js
  {
    id: 111,
    label: "audit-ui-components の型の照合で大文字小文字を区別する",
    patch: "m111-ui-components-type-case-sensitive.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note:
      "#320 PR 1・設計正本 D10 の 1。HTML の型名は大文字小文字を区別しないので、`SELECT {}` と書けば" +
      "写しが検査を素通りする（#280 の検査が大文字を見逃したのと同じ型）。",
  },
  {
    id: 112,
    label: "audit-ui-components が何も免除していない ui-exempt: を見逃す",
    patch: "m112-ui-components-dead-exempt-ignored.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note:
      "#320 PR 1・設計正本 D9。写しを直したのに申告だけが残り、`git grep ui-exempt` の台帳が" +
      "「外れている箇所」について嘘をつく。",
  },
  {
    id: 113,
    label: "audit-ui-components が var() の第 2 引数の生の色を隠す",
    patch: "m113-ui-components-var-fallback-hidden.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note:
      "#320 PR 1・設計正本 D10 の 3。カスタムプロパティの名前を消す代わりに `var()` ごと消すと、" +
      "`var(--a, #fff)` の `#fff` が見えなくなる。赤を消す最短の書き方がそのまま穴になる型。",
  },
```

- [ ] **Step 6: 3 本の変異が殺されることを見る**

Run: `node scripts/mutation-check.mjs --help 2>&1 | head -20`
Expected: 絞り込みの指定方法（id の指定）が出る。出た方法で 111・112・113 だけを流す。

Run（例。`--help` の出力に合わせて読み替える）: `node scripts/mutation-check.mjs 111 112 113`
Expected: 3 本とも「検出」（killed）。どれかが生き残ったら、自己テストの該当する describe が恒真になっている。テストを直す（変異を弱めない）

- [ ] **Step 7: 既存の変異パッチが全件当たることを見る**

Run:
```bash
for p in scripts/mutations/*.patch; do git apply --check "$p" 2>/dev/null || echo "当たらない: $p"; done
```
Expected: 何も出ない（この PR が触ったファイルに当たる m87・m90 を含め、全件が当たる）。
出たら、その変異の対象の行がこの PR で動いた。パッチの文脈を当て直し、`mutation-check.mjs` でその id が今も殺されることを見る

- [ ] **Step 8: コミットする**

```bash
git add scripts/mutations/m111-ui-components-type-case-sensitive.patch scripts/mutations/m112-ui-components-dead-exempt-ignored.patch scripts/mutations/m113-ui-components-var-fallback-hidden.patch scripts/mutation-check.mjs
git commit -m "test: 部品層の検査の変異を 3 本登録する（#320）"
git push
```

---

### Task 10: 通しで確かめ、実画面を main と並べる（コミットしない）

- [ ] **Step 1: 全体の検査を流す**

Run:
```bash
corepack pnpm test
corepack pnpm lint
corepack pnpm typecheck
bash -c 'set -euo pipefail; for t in $(node scripts/list-scan-targets.mjs script-tests); do node --test "$t"; done' 2>&1 | grep -E '^# (pass|fail)' | sort | uniq -c
for s in scripts/audit-*.mjs; do case "$s" in *.test.mjs) ;; *) node "$s" >/dev/null || echo "NG: $s";; esac; done
node scripts/audit-plan-gate.mjs
node scripts/check-links.mjs
corepack pnpm audit --audit-level high
```
Expected: すべて緑。自己テストは `# fail 0` だけ。`NG:` の行は出ない。**`| tail` や `| head` で終了コードを隠さない**

- [ ] **Step 2: 構造監査の SC の行を main と並べる**

Run:
```bash
git worktree add /tmp/claude-1000/-workspaces-claym-local-Tasuki/d4ca1303-1442-4244-8a2f-1b8e2cbd5d7b/scratchpad/main-wt main
node scripts/audit-structure.mjs > /tmp/claude-1000/-workspaces-claym-local-Tasuki/d4ca1303-1442-4244-8a2f-1b8e2cbd5d7b/scratchpad/sc-branch.txt
(cd /tmp/claude-1000/-workspaces-claym-local-Tasuki/d4ca1303-1442-4244-8a2f-1b8e2cbd5d7b/scratchpad/main-wt && node scripts/audit-structure.mjs) > /tmp/claude-1000/-workspaces-claym-local-Tasuki/d4ca1303-1442-4244-8a2f-1b8e2cbd5d7b/scratchpad/sc-main.txt
diff /tmp/claude-1000/-workspaces-claym-local-Tasuki/d4ca1303-1442-4244-8a2f-1b8e2cbd5d7b/scratchpad/sc-main.txt /tmp/claude-1000/-workspaces-claym-local-Tasuki/d4ca1303-1442-4244-8a2f-1b8e2cbd5d7b/scratchpad/sc-branch.txt
```
Expected: 差は走査量の件数（ファイルが増えた分）だけ。指標の値が後退していれば、原因を PR 本文に書く。
（main の worktree は依存を入れ直す必要がある。`audit-structure.mjs` が依存無しで走らなければ、その旨を記録して次へ進む）

- [ ] **Step 3: E2E を全部流す**

Run: `corepack pnpm e2e`
Expected: 全件 PASS

- [ ] **Step 4: 正本 D7 の画面を main と並べて撮る**

main の worktree とこのブランチの両方で dev サーバーを立て、Playwright（MCP）で次を 360px と 1280px で撮る:
- timer のロビーの通知設定（通知音のプルダウンを閉じた状態と開いた状態・声を選んだときの話者のプルダウン）
- お題ツールの「書く」「作る」（欄にフォーカスした状態を含む）
- 玄関の作成画面（欄にフォーカスした状態）と選択画面の招待の欄

撮ったものは `/tmp/claude-1000/-workspaces-claym-local-Tasuki/d4ca1303-1442-4244-8a2f-1b8e2cbd5d7b/scratchpad/shots/` に置く（コミットしない）。
Expected: 差は正本 D7 の表のもの（timer のプルダウンの字と高さ・余白・溝の色、フォーカスのリングの offset）だけ。
**表に無い差が出たら止める**

終わったら dev サーバーを止め、`git worktree remove` で main の worktree を片付ける（ポートを掴んだままにしない）

- [ ] **Step 5: 利用者に Chrome での目視を頼む**

利用者に次を伝え、見てもらう: timer のロビーで通知音のプルダウンを開き、①開いた一瞬に白く光らない ②ホバーした選択肢が浮く ③試聴ボタンとの並びが崩れていない。
（#319 で未確認だった項目。白い一瞬はヘッドレスでは再現しない）

---

### Task 11: PR を作り、レビューを通す

- [ ] **Step 1: PR を作る**

Run:
```bash
gh pr create --base main --title "feat: 部品層の骨組みと入力欄の系・写しを止める検査（#320 PR 1）" --body-file <本文のファイル>
```

本文（`## 概要`・`## 変更内容`・`## テスト方法` の形。`Closes` は書かない —— #320 は epic で PR 5 まで続く。**地の文にも閉鎖キーワードを書かない**）に次を含める:
- 設計正本と ADR 0022 へのリンク
- 見た目が変わる画面（正本 D7 の PR 1 の行）と、Task 10 の撮影の要約
- 既知の見逃し: `.hub-input` の形（クラス名の写し）は検査に出ない（ADR 0022 決定 6）
- 利用者の Chrome での目視の結果

- [ ] **Step 2: 文脈を共有しない `/code-review` を PR 番号を明示して通す**

指摘は採点が出てから直す（採点の間に直さない）。直したら push し、Task 10 Step 1 を流し直す。
