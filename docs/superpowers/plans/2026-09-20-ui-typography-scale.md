# `@tasuki/ui` の要素層を書体スケールへ寄せる（#280）実装計画

> **作業者へ:** 必須サブスキル —— `superpowers:subagent-driven-development`（推奨）または
> `superpowers:executing-plans` を使って 1 タスクずつ実装すること。
> 手順のチェックボックス（`- [ ]`）で進捗を追う。

**ゴール**: `packages/ui/src/elements/` の書体の直値 9 件を、`tokens/typography.css` の
5 段（`--font-size-xs` / `-sm` / `-base` / `-lg` / `-xl`）へ寄せる。寄せられない 2 件は
同じ行に理由を書いて残し、「5 段か、理由が書かれた例外か」を機械で検査する。

**方式**: `packages/ui/tests/typography-scale.test.mjs` を新設し、`src/**/*.css` を走査して
`font-size` の宣言を全件拾う。**許可リストを持たない** —— 段の名前は `typography.css` の
定義から導出し、対象は全 CSS である。例外は宣言と**同じ行**の `scale-exempt:` コメントで印を付ける。

**技術**: 素の CSS ＋ `node:test`（Node v22.23.2。新しい依存は足さない）/ stylelint（既存）/
Playwright（スクリーンショット比較のみ・コミットしない）

**設計正本**: `docs/superpowers/specs/2026-09-20-ui-typography-scale-design.md`
（**計画は正本に従属する。両方を読むこと**）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。
様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | Task 2 で検査を先に書き、要素層 9 件が違反する赤を見てから CSS を寄せる。Task 1・3 は対照実行（緑）→ 破壊（赤）→ 復元で閉じる |
| II. 技術選定は ADR を通す | 該当なし | 新しい依存を足さない。既存の `node:test` と stylelint だけを使う |
| III. 揮発インメモリと単純運用 | 該当なし | CSS と検査のみ。サーバー・状態・運用に触れない |
| IV. 境界の型安全 | 該当なし | 境界を越えるデータを扱わない |
| V. 実画面検証 | 通過 | Task 5 で `apps/landing` と `apps/poker-web` を **360px と 1280px の両端**で確認し、変更前後を並べる |
| VI. 依存は内向き | 該当なし | パッケージ間の依存の向きを変えない |
| VII. 検査は壊して確かめる | 通過 | Task 4 で対照実行を先に見てから 4 通り（直値へ戻す / 理由を空にする / 存在しない段 / 走査を空にする）で赤を確かめる |
| VIII. 記録が正本 | 通過 | 決定は設計正本、使い方は `packages/ui/README.md`（Task 6）。**この計画に数値の正本を作らない** |
| IX. 小さく回す | 通過 | 射程を `packages/ui/src` に限る。`apps/poker-web` の 12 件は別 Issue へ切り出す（正本 D2・§8）。PR 1 本・デプロイは伴わない |
| X. 抽象は実需で | 通過 | 許可リストを作らず、段の名前をトークン定義から導出する（正本 §5）。#270 が許可リストで詰まった実需がある |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密も個人情報も扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## 全体の制約

- **検査の射程は `packages/ui/src/**` に限る**（正本 D2）。`apps/` へ広げない
- **許可リストを作らない。** 段の名前は `typography.css` の定義から導出する（正本 §5）
- **例外は宣言と同じ行に書く**（正本 D6）。離すと片方だけが動く
- **`input[type='text']` の `1rem` は動かさない**（正本 D4。iOS Safari の自動拡大）
- **`.card::after` の `0.6rem` は動かさない**（正本 §3.4。ADR-0001 が 9.6px を名指し）
- **5 段の値（`clamp()` の係数）は触らない**（正本 §1・スコープ外）
- **破壊検証へ入る前に `git status --porcelain` が空であることを見る**
- コメント・docstring は日本語。「なぜ」を書く
- **各タスクの最後にコミットする**（Task 4・5 を除く）。ブランチは `refactor/280-ui-typography-scale`
- テストの実行は `corepack pnpm --filter @tasuki/ui test`

---

### Task 1: 走査の骨組みを置く

検査ファイルを新設し、**走査そのものが正しいこと**（空振りしない・段が 5 つ・宣言が 1 行に収まる）を
先に固める。この段階では既存の 9 件の直値をまだ咎めない。

**Files:**
- Create: `packages/ui/tests/typography-scale.test.mjs`

**Interfaces:**
- Produces: `cssFiles()` / `definedSteps()` / `declarations()` の 3 つの関数。
  `declarations()` は `{ file, line, value, terminated, text }` の配列を返す。
  Task 2・3 はこの `declarations()` を使う

- [ ] **Step 1: 検査ファイルを作る**

`packages/ui/tests/typography-scale.test.mjs`:

```js
/**
 * 書体の大きさが 5 段のトークンに従っていることを検査する（#280）。
 *
 * ## なぜ必要か
 * `tokens/typography.css` は 5 段の流動スケールを持つが、**それに合否の判定が無かった**ため、
 * `elements/` 層が直値で書いても何も赤くならなかった。同じことが #270 で
 * `apps/landing` に起きており、実寸 8 種類のリズムの無い自前スケールになっていた。
 *
 * ## 許可リストを持たない
 * 段の名前は `typography.css` の定義から導出し、対象は `src/` 配下の CSS 全件である。
 * 要素が増えても射程が自動で広がるので、**列挙に化けない**（設計正本 §5）。
 * #270 はこれを E2E の許可リストでやろうとして 9 件ぶん膨らみ、入れられなかった。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'src');

/** `src/` 配下の CSS を再帰で拾う（`src` からの相対パスで返す）。 */
function cssFiles() {
  return readdirSync(SRC, { recursive: true })
    .map(String)
    .filter((p) => p.endsWith('.css'))
    .sort();
}

/**
 * `typography.css` が定義している段の名前。
 *
 * **ここで列挙しない。** 定義そのものを正本にすることで、段を増やしたときに
 * 検査側の書き換えを忘れて射程が古いまま残る、という事故を防ぐ。
 */
function definedSteps() {
  const css = readFileSync(resolve(SRC, 'tokens/typography.css'), 'utf8');
  return [...css.matchAll(/^\s*(--font-size-[a-z]+)\s*:/gm)].map((m) => m[1]);
}

/**
 * `font-size` の宣言を拾う。
 *
 * **プロパティ名の直前が `-` のものは拾わない。** `--font-size-xs: clamp(...)` は
 * カスタムプロパティの**定義**であって `font-size` の宣言ではない。直前の 1 文字を
 * `[;{}\s]` か行頭に限ることで区別する。
 *
 * **1 行に複数あっても全部拾う**（`matchAll`）。1 つ目だけを見ると、
 * 2 つ目を並べるだけで検査をすり抜けられる。
 */
function declarations() {
  const found = [];
  for (const rel of cssFiles()) {
    const lines = readFileSync(join(SRC, rel), 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/(?:^|[;{}\s])font-size\s*:\s*([^;]*)(;?)/g)) {
        found.push({
          file: rel,
          line: i + 1,
          value: m[1].trim(),
          terminated: m[2] === ';',
          text: line,
        });
      }
    });
  }
  return found;
}

/** 失敗メッセージ用の位置表記。 */
const where = (d) => `${d.file}:${d.line}  font-size: ${d.value}`;

test('走査が空振りしていない（ファイルも宣言も実際に拾えている）', () => {
  // Given / When
  const files = cssFiles();
  const decls = declarations();
  // Then（0 件で緑になると、以降のすべての検査が無言で死ぬ）
  assert.ok(files.length > 0, 'src 配下に CSS が 1 つも無い');
  assert.ok(decls.length > 0, 'font-size の宣言を 1 つも拾えていない');
});

test('流動スケールの段は 5 つである', () => {
  // Given / When
  const steps = definedSteps();
  // Then（**ここだけは意図的に件数と名前を固定する**。段が黙って増減したら気づきたい）
  assert.deepEqual(
    [...steps].sort(),
    ['--font-size-base', '--font-size-lg', '--font-size-sm', '--font-size-xl', '--font-size-xs'],
    '段の構成が変わっている。増減させるなら設計正本と README を先に直すこと',
  );
});

test('font-size の宣言は 1 行に収まっている', () => {
  // Given / When（`;` で閉じていない = 値が次の行へ続いている）
  const spanning = declarations().filter((d) => !d.terminated);
  // Then（複数行にまたがると、例外の印を同じ行に置く規約が成立しない）
  assert.deepEqual(spanning.map(where), [], '宣言を 1 行に収めること（設計正本 D6）');
});
```

- [ ] **Step 2: 対照実行（壊さずに緑になることを見る）**

Run: `corepack pnpm --filter @tasuki/ui test`
Expected: PASS（3 件とも緑。既存の 9 件の直値はまだ咎めていない）

- [ ] **Step 3: 走査が空振りしたら赤くなることを確かめる**

`cssFiles()` の `filter` を `.filter(() => false)` に一時的に書き換える。

Run: `corepack pnpm --filter @tasuki/ui test`
Expected: FAIL（`src 配下に CSS が 1 つも無い`）

**書き換えを元に戻し、`git diff` が空であることを確認する。**

- [ ] **Step 4: 段の件数を変えたら赤くなることを確かめる**

`packages/ui/src/tokens/typography.css` に `--font-size-xxl: 3rem;` を一時的に足す。

Run: `corepack pnpm --filter @tasuki/ui test`
Expected: FAIL（`段の構成が変わっている`）

**元に戻し、`git diff` が空であることを確認する。**

- [ ] **Step 5: コミット**

```bash
git add packages/ui/tests/typography-scale.test.mjs
git commit -m "$(cat <<'EOF'
test: 書体スケール検査の走査の骨組みを置く（#280）

- src 配下の CSS を再帰で走査し、font-size の宣言を全件拾う
- 段の名前は typography.css の定義から導出する（許可リストを持たない）
- 空振り・段の増減・複数行の宣言を先に塞ぐ

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 「5 段か、理由つきの例外か」を検査し、要素層を寄せる

**このタスクが本体。** 検査を先に足して 9 件が違反する赤を見てから、CSS を書き換えて緑にする。

**Files:**
- Modify: `packages/ui/tests/typography-scale.test.mjs`（テストを 1 つ追加）
- Modify: `packages/ui/src/elements/reset.css:44,51`
- Modify: `packages/ui/src/elements/controls.css:10,17,39,78`
- Modify: `packages/ui/src/elements/card.css:39,45,78`

**Interfaces:**
- Consumes: Task 1 の `declarations()` / `where()`
- Produces: `EXEMPT`（`/scale-exempt:\s*\S/`）と `TOKEN_REF`（`/^var\(\s*--font-size-[a-z]+\s*\)$/`）。
  この 2 つが CSS 側の書き方を決めるので、Task 4 の破壊検証はこの規約に沿って壊す

- [ ] **Step 1: 失敗する検査を書く**

`packages/ui/tests/typography-scale.test.mjs` の末尾へ追加:

> ⚠ **この `EXEMPT` の正規表現は誤り。** 末尾の「追記（2026-09-20・#280 Task 4）」を見よ
> —— `\S` がコメント終端のアスタリスクにも一致し、理由が空の例外を通してしまう欠陥がある。
> このコード片自体は当時の記述のまま残し、訂正は追記で示す。

```js
/**
 * 例外の印。**理由まで求める**（`\S` で空でないことを見る）。
 *
 * 印だけで通せると「scale-exempt:」と書くだけの空手形になり、塞ごうとしている
 * 「直値が混ざっても何も赤くならない」をそのまま作り直すことになる。
 */
const EXEMPT = /scale-exempt:\s*\S/;

/** 5 段のいずれかを参照している形（フォールバック付きは許さない。段の不在を隠すため）。 */
const TOKEN_REF = /^var\(\s*--font-size-[a-z]+\s*\)$/;

test('font-size は 5 段のトークンを参照するか、同じ行に理由のある例外である', () => {
  // Given / When
  const offenders = declarations()
    .filter((d) => !TOKEN_REF.test(d.value))
    .filter((d) => !EXEMPT.test(d.text));
  // Then
  assert.deepEqual(
    offenders.map(where),
    [],
    '5 段へ寄せるか、同じ行に `/* scale-exempt: 理由 */` を書くこと（設計正本 D6）',
  );
});
```

- [ ] **Step 2: 赤を見る**

Run: `corepack pnpm --filter @tasuki/ui test`
Expected: FAIL。違反 **9 件**が列挙される:

```
elements/card.css:39  font-size: 0.6rem
elements/card.css:45  font-size: 1.5rem
elements/card.css:78  font-size: 1.1rem
elements/controls.css:10  font-size: 0.85rem
elements/controls.css:17  font-size: 1rem
elements/controls.css:39  font-size: 0.95rem
elements/controls.css:78  font-size: 0.66rem
elements/reset.css:44  font-size: 1.5rem
elements/reset.css:51  font-size: 0.8rem
```

**9 件ちょうどであることを数えること。** 少なければ走査が取りこぼしている。
この一覧は 2026-09-20 に同じ走査ロジックを現物へ当てて得たもので、
**走査対象の CSS は 10 ファイル・拾える宣言は 9 件・段の定義は 5 件**だった
（トークン定義 `--font-size-xs:` は宣言として拾われないことも同時に確認済み）。

- [ ] **Step 3: `reset.css` を寄せる（2 件）**

`packages/ui/src/elements/reset.css:44`（`h1`）:

```css
  font-size: var(--font-size-xl);
```

`packages/ui/src/elements/reset.css:51`（`h2`）:

```css
  font-size: var(--font-size-xs);
```

- [ ] **Step 4: `controls.css` を寄せる（3 件）と例外（1 件）**

`packages/ui/src/elements/controls.css:10`（`label`）:

```css
  font-size: var(--font-size-sm);
```

`packages/ui/src/elements/controls.css:17`（`input[type='text']`）—— **寄せない**:

```css
  font-size: 1rem; /* scale-exempt: 16px を下回らせない。iOS Safari は 16px 未満の入力欄にフォーカスすると画面を自動で拡大する。base の下限は 15.5px でこれに掛かる（設計正本 D4） */
```

`packages/ui/src/elements/controls.css:39`（`button`）:

```css
  font-size: var(--font-size-sm);
```

`packages/ui/src/elements/controls.css:78`（`.badge`）:

```css
  font-size: var(--font-size-xs);
```

- [ ] **Step 5: `card.css` を寄せる（2 件）と例外（1 件）**

`packages/ui/src/elements/card.css:39`（`.card::after` コーナーピップ）—— **寄せない**:

```css
  font-size: 0.6rem; /* scale-exempt: 札のコーナーピップ。ADR-0001 が Fraunces の opsz を残す理由として 9.6px を名指ししている（設計正本 §3.4） */
```

`packages/ui/src/elements/card.css:45`（`.card-face`）:

```css
  font-size: var(--font-size-xl);
```

`packages/ui/src/elements/card.css:78`（`.card.small`）:

```css
  font-size: var(--font-size-lg);
```

- [ ] **Step 6: 緑を見る**

Run: `corepack pnpm --filter @tasuki/ui test`
Expected: PASS（4 件とも緑）

Run: `corepack pnpm --filter @tasuki/ui lint`
Expected: PASS（stylelint。層の境界を壊していないこと）

- [ ] **Step 7: コミット**

```bash
git add packages/ui/tests/typography-scale.test.mjs packages/ui/src/elements/
git commit -m "$(cat <<'EOF'
refactor: @tasuki/ui の要素層を 5 段の書体スケールへ寄せる（#280）

- 直値 9 件のうち 7 件を --font-size-* へ置き換えた
- input[type='text'] は 16px を下回らせないため据え置き（iOS Safari の自動拡大）
- .card::after のコーナーピップは ADR-0001 が 9.6px を名指ししているため据え置き
- 5 段か、理由のある例外かを検査する（許可リストを持たない）

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 存在しない段への参照を落とす

`var(--font-size-md)` のような打ち間違いは、CSS では**黙って無効**になり継承値で描かれる。
Task 2 の検査は「`var(--font-size-…)` の形か」しか見ていないので、これを通してしまう。

**Files:**
- Modify: `packages/ui/tests/typography-scale.test.mjs`（テストを 1 つ追加）

**Interfaces:**
- Consumes: Task 1 の `declarations()` / `definedSteps()`。
  **Task 2 の `TOKEN_REF` は使わない** —— あちらは「形が合っているか」だけを見る真偽判定で、
  こちらは段の名前を取り出す必要があるため、捕捉群つきの別の正規表現を持つ

- [ ] **Step 1: 検査を書く**

`packages/ui/tests/typography-scale.test.mjs` の末尾へ追加:

```js
test('参照している段が typography.css に実在する', () => {
  // Given
  const steps = new Set(definedSteps());
  // When（打ち間違いは CSS では黙って無効になり、継承値で描かれる）
  const unknown = declarations()
    .map((d) => ({ d, m: /^var\(\s*(--font-size-[a-z-]+)\s*\)$/.exec(d.value) }))
    .filter(({ m }) => m !== null && !steps.has(m[1]))
    .map(({ d, m }) => `${d.file}:${d.line}  ${m[1]}`);
  // Then
  assert.deepEqual(unknown, [], '存在しない段を参照している');
});
```

- [ ] **Step 2: 対照実行**

Run: `corepack pnpm --filter @tasuki/ui test`
Expected: PASS（5 件とも緑）

- [ ] **Step 3: 存在しない段を書いて赤を見る**

`packages/ui/src/elements/reset.css:44` を一時的に `var(--font-size-md)` へ書き換える。

Run: `corepack pnpm --filter @tasuki/ui test`
Expected: FAIL（`存在しない段を参照している` に `elements/reset.css:44  --font-size-md` が出る）

**元に戻し、`git diff` が空であることを確認する。**

- [ ] **Step 4: コミット**

```bash
git add packages/ui/tests/typography-scale.test.mjs
git commit -m "$(cat <<'EOF'
test: 存在しない書体スケールの段への参照を落とす（#280）

- var(--font-size-md) のような打ち間違いは CSS では黙って無効になる
- 段の実在は typography.css の定義と突き合わせて判定する

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 破壊検証を通しで実施する（コミットしない）

設計正本 §6 の 4 通りを、**対照実行を先に見てから**通しで行う。

**Files:** なし（一時的な書き換えのみ。すべて元へ戻す）

- [ ] **Step 1: 作業ツリーが clean であることを確かめる**

Run: `git status --porcelain`
Expected: 出力が空

**空でなければここで止まる。** 復元に `git checkout --` を使うため、未コミットの変更があると
巻き込んで消す（このリポジトリで 4 回踏んでいる事故）。

- [ ] **Step 2: 対照実行（壊さずに緑）**

Run: `corepack pnpm --filter @tasuki/ui test`
Expected: PASS（5 件）

- [ ] **Step 3: ①直値へ戻す**

`packages/ui/src/elements/card.css:45` を `font-size: 1.5rem;` へ戻す。

Run: `corepack pnpm --filter @tasuki/ui test`
Expected: FAIL（`elements/card.css:45  font-size: 1.5rem`）

Run: `git checkout -- packages/ui/src/elements/card.css`

- [ ] **Step 4: ②例外の理由を空にする**

`packages/ui/src/elements/card.css:39` の行末コメントを `/* scale-exempt: */` にする。

Run: `corepack pnpm --filter @tasuki/ui test`
Expected: FAIL（`elements/card.css:39  font-size: 0.6rem`。**印があっても理由が無ければ落ちる**）

Run: `git checkout -- packages/ui/src/elements/card.css`

- [ ] **Step 5: ③存在しない段**

Task 3 の Step 3 で確認済み。**再実行して同じ赤が出ることを見る**（独立に 1 回）。

- [ ] **Step 6: ④走査を空にする**

Task 1 の Step 3 で確認済み。**再実行して同じ赤が出ることを見る**。

- [ ] **Step 7: 作業ツリーが clean へ戻ったことを確かめる**

Run: `git status --porcelain`
Expected: 出力が空

Run: `corepack pnpm --filter @tasuki/ui test`
Expected: PASS（復元できていることの確認）

---

### Task 5: 実画面で確かめ、変更前後を並べる（コミットしない）

要素層を読むのは `apps/landing` と `apps/poker-web` の 2 つ。
**360px と 1280px の両端**で見る —— `clamp()` は両端で効き方が逆になる。

**Files:**
- Create: `e2e/specs/shots-280.spec.ts`（**使い捨て。最後に消す**）

- [ ] **Step 1: ポートが空いていることを確かめる**

Run: `ss -tlnp | grep -E ':(8787|517[3-5])'`
Expected: 出力が空（居座っていれば止めてから進む）

- [ ] **Step 2: 撮影用の spec を書く**

`e2e/specs/shots-280.spec.ts`:

```ts
/**
 * #280 の見た目の退行を見るための**使い捨て** spec。**コミットしない。**
 *
 * `clamp()` は両端で効き方が逆になるので、狭い幅と広い幅の両方で撮る。
 * タグは付けない（タグ無し = `local` 専用。`PRODUCTION_TAGS` は `@smoke` / `@core` のみで、
 * 未知のタグを足すと `e2e/tests/spec-tags.test.ts` が落ちる）。
 */
import { test } from '../fixtures/test';
import { createRoom } from '../support/poker';

const DIR = process.env.TASUKI_SHOTS_DIR ?? '/tmp/shots';

for (const width of [360, 1280]) {
  test(`玄関 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    // 書体が届く前に撮ると、代替書体の字面を比べることになる
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${DIR}/landing-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  });

  test(`poker の卓 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await createRoom(page, 'しるし');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${DIR}/poker-${width}.png`,
      fullPage: true,
      animations: 'disabled',
      // ルームごとに変わるものを潰す（招待 URL にルームコードが載る）
      mask: [page.locator('.invite-url')],
    });
  });
}
```

⚠ **この spec が置かれている間は `pnpm test` を走らせない。**
`e2e/tests/spec-tags.test.ts` が `specs/` を走査するため、撮影中の一時ファイルを拾う。

- [ ] **Step 3: 変更前の姿を撮る**

```bash
git stash push -- packages/ui/src/elements/
cd e2e && TASUKI_SHOTS_DIR=/tmp/shots-before corepack pnpm exec playwright test specs/shots-280.spec.ts
cd .. && git stash pop
```

**`git stash push` にパスを与えているのは、撮影用 spec を巻き込まないため。**
戻した後に `git diff --stat packages/ui/src/elements/` で 9 行ぶん戻っていることを見る。

- [ ] **Step 4: 変更後の姿を撮る**

```bash
cd e2e && TASUKI_SHOTS_DIR=/tmp/shots-after corepack pnpm exec playwright test specs/shots-280.spec.ts
```

- [ ] **Step 5: 並べて見て、退行の有無を判断する**

**とくに見るところ:**

| 見るもの | 予想される動き |
|---|---|
| `h1`（両アプリの見出し） | 360px で 24 → 22.4px（**縮む**）/ 1280px で 24 → 30.4px（**伸びる**） |
| `.card.small`（poker の一覧の札） | 360px で +6% / 1280px で **+27%**。**折り返しが変わらないか** |
| `.badge` | 10.6 → 12.1〜13.1px（+14%）。バッジの幅が伸びて改行しないか |
| `button` / `label` | ほぼ変わらない（sm の上限が現状値と一致） |
| `input[type='text']` | **変わらないこと**（据え置きなので動いたら誤り） |

**`.card.small` の折り返しが崩れる場合は、設計正本 D5 を base へ倒し直すことを検討する**
（その場合は正本を先に直し、Task 2 の該当行を書き換えてから撮り直す）。

- [ ] **Step 6: 使い捨ての spec を消す**

```bash
rm e2e/specs/shots-280.spec.ts
git status --porcelain
```

Expected: 出力が空（**消し忘れると `pnpm e2e` の本数に混ざる**）

- [ ] **Step 7: dev サーバーを止める**

起動したままにすると利用者の `pnpm dev` を全滅させる。

---

### Task 6: 規約を `packages/ui/README.md` へ書く

**Files:**
- Modify: `packages/ui/README.md`（**末尾へ追記**）

- [ ] **Step 1: README の末尾へ節を足す**

**途中へ差さない。** 節を差すと直後の小節が親を変える（このリポジトリで 2 回踏んでいる）。
現在の末尾は「## ここに**入れていない**もの」なので、その後ろへ置く。

````markdown
## 書体の大きさ

**`font-size` は 5 段のトークン（`--font-size-xs` 〜 `-xl`）を使う。**
直値を書くと `tests/typography-scale.test.mjs` が落ちる。

5 段のどれにも当てはまらない大きさが要るときは、**同じ行に理由を書いて例外にする**。

```css
  font-size: 0.6rem; /* scale-exempt: 札のコーナーピップ。ADR-0001 が 9.6px を名指ししている */
```

- **印だけでは通らない。** `scale-exempt:` の後ろに理由が要る
- **理由は宣言と同じ行に置く。** 離すと片方だけが動く
- 「直すのが面倒」を例外の理由にしない
- 現在の例外は 2 件（`input[type='text']` の 16px 下限と、上のコーナーピップ）

判断の経緯は
[設計正本](../../docs/superpowers/specs/2026-09-20-ui-typography-scale-design.md)。
````

- [ ] **Step 2: リンク検査を通す**

```bash
git add packages/ui/README.md
node scripts/check-links.mjs
```

Expected: `リンク検査 OK`（**`git add` してからでないと走査対象に入らない**）

- [ ] **Step 3: コミット**

```bash
git commit -m "$(cat <<'EOF'
docs: 書体の大きさの規約を @tasuki/ui の README に書く（#280）

- font-size は 5 段のトークンを使い、外れるなら同じ行に理由を書く
- 現在の例外 2 件とその根拠を明示した

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 仕上げ

- [ ] **全緑を確かめる**

```bash
corepack pnpm test --force
```

Expected: 全タスク成功。**`Cached: 0 cached` を確認する**（turbo は既定でキャッシュに当てて
1.5 秒で「緑」を出す）

- [ ] **変異検査が止まっていないことを確かめる**

```bash
git status --porcelain   # 空であること
node scripts/mutation-check.mjs
```

Expected: `[mutation-check] 変異数: N` が出て、すべて検出される。
**製品コードを触ると既存の変異パッチが当たらなくなり、そこで止まって以降が全部無検査になる。**
今回 CSS しか触っていないが、**止まっていないことを目で確かめる**。

- [ ] **構造監査とリンク検査**

```bash
node scripts/audit-structure.mjs
node scripts/check-links.mjs
node --test scripts/audit-structure.test.mjs
```

- [ ] **`apps/poker-web` の直値を別 Issue として起票する**

正本 §8。本文には実測した 12 件の内訳（`0.72 / 0.78 / 0.8 / 0.85 / 1.6 / 1.9 / 2.3rem` と
`0.8em`）と、検査の射程を `apps/` へ広げる判断を預けることを書く。

- [ ] **PR を作る**

タイトル: `refactor: @tasuki/ui の elements 層を自分の書体スケールへ寄せる（#280）`

本文に **DoD 8 項目**を転記して埋める。予想される埋め方:

| # | 項目 | 埋め方 |
|---|---|---|
| 1 | テストを先に書き全緑 | ✅ Task 2 で Red → Green |
| 2 | E2E | **該当なし**（利用者の通る経路は変わらない。見た目だけが動く。実画面確認は Task 5 で実施し結果を記す） |
| 3 | 新しい検査を壊して赤を確認 | ✅ Task 4 の 4 通り |
| 4 | 既存テストの恒真化を変異で確認 | ✅ 仕上げの `mutation-check` |
| 5 | 実経路で確認 | ✅ Task 5（2 アプリ × 2 幅） |
| 6 | リファクタリング | ✅ 本 PR 自体が整地。`apps/poker-web` の 12 件は別 Issue へ切り出した |
| 7 | 文書への影響 | ✅ `packages/ui/README.md`（Task 6）。ADR-0001 は改版不要（正本 §9） |
| 8 | Issue の完了条件 | ✅ 6 項目すべて |

**`closes #280` を本文の地の文へ書かない**（squash マージで意図せず閉じる／バッククォートで
囲むと効かない、の両方に事故る）。

- [ ] **敵対的レビューを回す**

`/code-review` に **PR 番号を明示して**渡す（カレントブランチを見るため、番号が無いと
別の PR を検証しうる）。**採点が走っている間は直さない**（実在した指摘が
「もう直っている」を理由に 0 点になる）。

## 追記（2026-09-20・#280 Task 4）

**Task 2 に書いた `EXEMPT` の正規表現が、理由が空の例外コメントを通していた。**
Task 4 の破壊検証で発覚した欠陥で、Task 2 のブリーフに逐語で書かれていた
`EXEMPT = /scale-exempt:\s*\S/` そのものに誤り（本計画を書いた側の誤り）があった。
実装した作業者は指示どおり逐語で書き写しただけで、過失は無い。

**なぜ通ったか:** `\S` は「空白以外の 1 文字」を見るだけで、コメントの終端記号の
アスタリスクも `\S` に当たる。`/* scale-exempt: */` のように理由が空のコメントでも、
`scale-exempt:` の直後にある終端のアスタリスクが `\S` にマッチしてしまい、
「理由あり」と誤判定していた。塞ごうとしていた「直値が混ざっても何も赤くならない」を、
例外の仕組み自体が作り直していた。

**どう直したか:** `packages/ui/tests/typography-scale.test.mjs` に純関数 `exemptReason(text)`
を切り出した。`scale-exempt:` から同じ行にあるコメント終端の手前までを理由として取り出し、
前後の空白を落として、空文字列なら `null`（＝例外ではない）を返す。同じ行に終端が無い
（複数行コメント）場合も理由の終わりを決められないので `null` とし、fail-closed にした。
既存のテスト「font-size は 5 段のトークンを参照するか、同じ行に理由のある例外である」は
`EXEMPT` ではなくこの `exemptReason` を使うよう書き換え、回帰テスト
「例外コメントは理由が空だと通らない（コメント終端の `*` を理由と誤認しない）」を 1 本
追加した。理由あり／理由が空／印だけで終端が続く形（空白すら無い）／`scale-exempt` を
含まない普通の行の 4 通りを確かめている。

修正後、`corepack pnpm --filter @tasuki/ui test` は 12 件全緑、`lint` も PASS。
既存の 2 件の例外（`controls.css:17` の `input[type='text']` と `card.css:39` の
`.card::after`）は引き続き通ることを確認した。`card.css:39` の理由を実際に
`/* scale-exempt: */` へ書き換えて赤くなることを確かめたうえで `git checkout --` で復元した。

`exemptReason` を入れた後、設計正本 §6 の他の破壊検証（①寄せた 1 件を直値へ戻す／
③存在しない段を書く／④走査対象を空にする）が引き続き赤くなることも再実行して確認した
（②の理由を空にするケースは上で確認済み）。
