# timer から Tailwind を外す — PR 1: 見た目を移さない土台（#321）実装計画

> **作業者へ:** 必須サブスキル `superpowers:subagent-driven-development`（推奨）または `superpowers:executing-plans` を使って 1 タスクずつ実装すること。
> 手順のチェックボックス（`- [ ]`）で進捗を追う。

**ゴール**: timer の見た目を 1 つも移さずに、移行の土台を入れる。土台は 5 つ: ADR 0023、基準（`ba9249d`）と並べる比較の仕組みと除去検査、`index.css` の分割とレイヤーの宣言、クラス名の恒久の検査、`design-tokens.test.ts` の ALLOW の締め直し。

**方式**: 比較の仕組みは `e2e/parity/` に置き、E2E のハーネスを 1 本だけ起動する。**基準の側のブラウザの文脈では、`/timer/` への要求を基準の dist から返す**（`context.route`）。これで 1 回の実行で基準とブランチの両方を撮り、その場で突き合わせられる。PR 1 では見た目を移さないので、**PR 1 自身の差は 0 件**になるはずで、それが比較の仕組みの対照実行を兼ねる。

**技術**: Playwright（`@playwright/test`）・vitest（`e2e/tests`）・`node --test`（`scripts/`）・postcss / postcss-selector-parser / typescript（ルートの devDependencies）・tailwindcss（`apps/timer-web` から解決。移行中だけ）

**正本**: `docs/superpowers/specs/2026-09-29-timer-without-tailwind-design.md`（3 版 `0fd1655`）。**計画は正本に従属する。両方を読むこと。** この計画は正本の §4 **PR 1** を実装する。関係する節: D1・D3・D8・D9・D10・§5・§6（E6）。

## この計画で決めたこと（正本に無い細部）

| # | 決めたこと | 理由 |
|---|---|---|
| P1 | **基準の配り方**: `/var/www` の symlink を差し替えず、基準の側のブラウザの文脈で `context.route(/\/timer\//)` が基準の dist のファイルを返す | 正本 §5.1 の「ハーネスは 1 本のまま」を、sudo も後始末も要らない形で満たす。1 回の実行で両側を撮り、その場で比べられる。WS（`/ws?tool=timer`）は経路の外（`routeWebSocket` は使わない） |
| P2 | **幅は、状態を 1 回作ってから `setViewportSize` で変えて撮る** | 状態を幅ごとに作り直すと、残りわずか（最短 3 分の間隔で約 3 分待つ）が 5 倍になる |
| P3 | **カスタムプロパティは、親と値が違う要素でだけ記録する**（`html` は全部） | 継承で全要素に同じ値が並ぶ。本当の差は、値が分かれた要素に必ず現れる |
| P4 | **`::before` / `::after` は `content` が `none` / `normal` でないときだけ記録する**。`::placeholder` は入力欄だけ、`::marker` は `display: list-item` だけ、`::picker(select)` は開いた `select` だけ | 描画されない擬似要素は見た目を持たない。片側だけに現れたら「道筋が片側にしか無い」差になる |
| P5 | **E8（規則の使用状況）と影のトークンは PR 2 へ送る**。正本 §5.6 の破壊検証の 5 つ目（当たらない規則）も PR 2 | PR 1 は新しい規則を足さない（`base.css` へ移すだけで、正本 §5.5 が E8 の対象外とした）。トークンは使い手と同じ PR に置く（使われないトークンを先に置かない） |
| P6 | **除去検査の範囲**: 状態の変種を持たないクラス（`sm:` などの幅の変種は含む）は、静止状態で全幅を判定する。状態の変種（`hover:`・`focus-visible:`・`focus:`・`focus-within:`・`active:`・`disabled:`・`checked:`・`open:`、および `group-` / `peer-` 付き）は、要素をその状態に入れられたときだけ判定し、入れられなければ「未判定」として台帳に書く。比べる範囲は、要素自身の全プロパティ・直下の子の全プロパティ・それより深い子孫の継承するプロパティ | 要素のクラスを外したときの影響は、自身・子への直接の規則（`space-y` など）・継承のどれかに出る。子孫全部の全プロパティを比べると、1 つのクラスあたり数十万回の読み取りになる |
| P7 | **Tailwind のユーティリティ名の判定は、`apps/timer-web` から解決した `tailwindcss` の `compile()` で行う**（PR 4 で判定ごと消す）。`scripts/` の検査が `typescript` を使うことと合わせて、ADR 0023 に例外として書く | ユーティリティ名は無数にあり、一覧では持てない。`compile().build([名前])` は素の node で動く（2026-09-30 実測: `container`・`hidden`・`sr-only`・`px-3` は真、`summary-stats`・`tabular` は偽） |
| P8 | **正本 D10 の 3「移したファイルでは Tailwind の構文を落とす」は、単独の規則にしない** | 移したファイルのクラス名は「timer の CSS か部品層に定義されている」（D10 の 2）を満たす必要があり、Tailwind のクラスはどちらにも定義されない。さらに D10 の 4 が、timer の CSS に Tailwind と同名のクラスを定義することを落とす。2 と 4 で包含される |
| P9 | **#316 への申し送りの本文は Task 13 に置き、利用者の承認を得てから投稿する** | 正本 D9。外部への書き込みは承認が要る |
| P10 | **基準の dist は `~/.cache/tasuki-parity/base-ba9249d/` に置く**（`TASUKI_PARITY_BASE_DIST` で渡す） | セッションをまたいで PR 2〜4 でも使う。scratch はセッションごとに消える |

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 比較の純関数（Task 2）・クラス名の検査（Task 10）・ALLOW の締め直し（Task 11）は、テストを先に書いて赤を見る。`index.css` の分割（Task 1）は、ビルド出力の CSS のバイト一致を特性テストとして先に固定する |
| II. 技術選定は ADR を通す | 通過 | Tailwind・PostCSS・`autoprefixer` を外す決定と、検査が `typescript` と `tailwindcss` を使う例外を、ADR 0023 に記録する（Task 12）。実施は PR 4 |
| III. 揮発インメモリと単純運用 | 通過 | 同期サーバーに触れない。配布しない |
| IV. 境界の型安全 | 該当なし | wire と境界の型に触れない |
| V. 実画面検証 | 通過 | 比較の仕組みそのものが実画面の検証。PR 1 の差が 0 件であることを実画面で確かめる（Task 6・Task 14） |
| VI. 依存は内向き | 通過 | `e2e/parity/` は `apps/` を相対パスで読まない（`audit-dependency-direction` が見る）。基準の dist はファイルとして読むだけ |
| VII. 検査は壊して確かめる | 通過 | 比較の仕組みの破壊検証（Task 7）・除去検査の既知の答え（Task 8）・クラス名の検査の変異 3 件（Task 10）・ALLOW の変異 1 件（Task 11） |
| VIII. 記録が正本 | 通過 | ADR 0023（Task 12）・差の台帳（Task 13）。PR 本文には台帳へのリンクだけを書く |
| IX. 小さく回す | 通過 | 正本 §4 の刻み方の PR 1。見た目を移さない土台だけ |
| X. 抽象は実需で | 通過 | 比較の仕組みは PR 4 で消す。検査は PR 4 以降も残る（Tailwind の判定だけ消す）。影のトークンは使い手の PR 2 へ送った（P5） |
| XI. 秘密と個人情報 | 該当なし | 秘密・個人情報に触れない |

**逸脱なし。**

## 全体の制約

- ブランチは `feature/issue-321-pr1-primitives`（設計正本の 3 コミットが載っている）。**main へ直接コミットしない**。**push はコミットのたびに行う**（サブエージェントが実装役のときは push もマージもさせない。統括が行う）
- **見た目を 1 つも変えない。** PR 1 の比較の差は 0 件でなければならない
- 基準は `ba9249d` に固定する。作業ツリーで `git checkout main -- …` をしない
- 破壊検証の前に `git status --porcelain` が空であることを確かめる。破壊はコミットしない
- 自己テストは bash で回す（zsh は未クォートの glob で偽の赤を出す）
- 出力を `| head` / `| tail` で切って数えない（数えるときは `grep -c` / `wc -l`）
- E2E は 8787 と 18080 を使う。利用者の `pnpm run dev` が掴んでいたら止めずに聞く。終わったら `ss -tlnp | grep -E ':(8787|18080)\b'` が空であることを見る
- 新しい E2E のタグを足さない（`e2e/specs/` には何も足さない）
- ADR・台帳に数を写さない。決定は「決定した。実施は PR n」と書き、完了形で書かない
- コミットメッセージは日本語。末尾に `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **状態に入れず、両側が同じ別の画面（玄関など）を撮って差 0 件になる** → Task 4 で、書き出しの前に状態ごとの目印を断定し、要素数の下限を置く。Task 7 の破壊 5（目印を外す）で赤を見る
2. **基準の側の文脈が、ブランチの資産を取り込む**（`context.route` が一部の要求を取り損ねる） → Task 3 の `serveBaseDist` が、返した件数と「dist に無かった要求」を数え、Task 4 で基準の側の件数が 0 のときに落とす
3. **`:focus-visible` や `:hover` に入れたつもりで入っていない** → Task 5 で `el.matches(…)` を断定し、入れなかった要素は差として出す
4. **`@import './styles/base.css'` の置き場で、中身が黙って消える**（`@config` の後に書くと、警告だけでビルドは成功する） → Task 1 で、分割前後のビルド出力の CSS のバイト一致を確かめる
5. **「まだ移していないファイル」の一覧が古くなり、移したファイルが免除されたまま残る** → Task 10 の検査が、一覧に載っているのにクラス名を 1 つも書いていないファイルを落とす（自己テストと変異 m116）

---

### Task 0: 基準の dist を用意する

**Files:** なし（リポジトリの外に作る）

**Interfaces:**
- Produces: `~/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist`（基準の timer の dist）。以後のタスクは環境変数 `TASUKI_PARITY_BASE_DIST` でこの場所を受け取る

- [ ] **Step 1: 作業ツリーが clean であることを確かめる**

Run: `cd /workspaces/claym/local/Tasuki && git status --porcelain`
Expected: 出力なし

- [ ] **Step 2: 基準の worktree を作る**

`/workspaces` は 9p で遅いので、worktree は `$HOME` の下に置く（9p ではないので、仮想ストアの逃がしは要らない）。

```bash
mkdir -p ~/.cache/tasuki-parity
cd /workspaces/claym/local/Tasuki
git worktree add ~/.cache/tasuki-parity/base-ba9249d ba9249d
cd ~/.cache/tasuki-parity/base-ba9249d
pnpm install --frozen-lockfile
```

Expected: install が成功する

- [ ] **Step 3: 基準の timer をビルドする**

```bash
cd ~/.cache/tasuki-parity/base-ba9249d
pnpm exec turbo run build --filter @tasuki/timer-web
ls apps/timer-web/dist/index.html apps/timer-web/dist/assets | wc -l
git -C ~/.cache/tasuki-parity/base-ba9249d rev-parse HEAD
```

Expected: `index.html` と `assets/` がある。`rev-parse` は `ba9249d` で始まる

- [ ] **Step 4: 本体のビルド出力の CSS を控える（Task 1 のバイト一致の基準）**

```bash
cd /workspaces/claym/local/Tasuki
pnpm exec turbo run build --filter @tasuki/timer-web
mkdir -p ~/.cache/tasuki-parity/before-split
cp apps/timer-web/dist/assets/index-*.css ~/.cache/tasuki-parity/before-split/timer.css
sha256sum ~/.cache/tasuki-parity/before-split/timer.css
```

Expected: ハッシュが出る（Task 1 で使う）

コミットはしない。

---

### Task 1: `index.css` を入口と `styles/base.css` に分け、レイヤーの順序を宣言する

**Files:**
- Create: `apps/timer-web/src/styles/base.css`
- Modify: `apps/timer-web/src/index.css`（全体を入口に書き換える）

**Interfaces:**
- Produces: `apps/timer-web/src/styles/`（PR 2 以降の画面の CSS の置き場）。`index.css` の並び「レイヤーの宣言 → `@import 'tailwindcss'` → `@import './styles/base.css'` → `@config`」

- [ ] **Step 1: いまの `index.css` の構成を確かめる**

Run: `grep -n "^@import\|^@config\|^@layer" apps/timer-web/src/index.css`
Expected: `@import 'tailwindcss';` と `@config '../tailwind.config.js';` の 2 行（レイヤーの宣言は無い）

- [ ] **Step 2: `@config` より後ろの全部を `styles/base.css` へ移す**

`@config '../tailwind.config.js';` の行の**次の行から末尾まで**を、1 バイトも変えずに `apps/timer-web/src/styles/base.css` へ移す。

```bash
cd /workspaces/claym/local/Tasuki/apps/timer-web/src
line=$(grep -n "^@config '../tailwind.config.js';" index.css | cut -d: -f1)
mkdir -p styles
tail -n +"$((line + 1))" index.css > styles/base.css
head -n "$line" index.css > index.css.head
wc -l index.css styles/base.css index.css.head
```

Expected: `styles/base.css` と `index.css.head` の行数の和が、元の `index.css` の行数と等しい

- [ ] **Step 3: `base.css` の先頭に注釈を置く**

`apps/timer-web/src/styles/base.css` の先頭に次を足す（既存の中身はそのまま）。

```css
/* timer の土台（#321 PR 1 で index.css から移した。中身は変えていない）。
 * 計器の語彙の別名・html / body・フォーカス・ステージ・計器ラベル・アニメーションを持つ。
 * **レイヤーに入れない**（`index.css` が `layer()` を付けずに読む）。Tailwind のユーティリティより強い、
 * いまの勝ち負けを保つため（設計正本 D1・D3）。画面の CSS は `layer(timer)` で読む別のファイルに置く。 */
```

- [ ] **Step 4: `index.css` を入口に書き換える**

`index.css.head` の注釈（冒頭の `/* … */`）は残し、`@import 'tailwindcss';` と `@config` の間に `base.css` の読み込みを置く。**`@import` は `@config` より前に置く**（後ろに書くと、Vite は警告だけ出して中身を捨てる。正本 §2 の 10）。書き換え後の `index.css` の本文（冒頭の注釈を除く）は次のとおり。

```css
/* レイヤーの順序（#321・設計正本 D3）。**`@import 'tailwindcss'` より前に置く** —— 後ろに置くと、
 * Tailwind が出す宣言が先に現れ、`timer` が `utilities` の後ろへ回って Tailwind に勝ってしまう。
 * `timer` は移した画面の CSS の置き場で、移行中は Tailwind のユーティリティに負ける（PR 4 で外す）。 */
@layer theme, base, timer, components, utilities;

/* Tailwind 4 は `@tailwind` の 3 行を 1 本の `@import` に置き換えた。 */
@import 'tailwindcss';

/* 土台（レイヤーに入れない）。**`@config` より前に置く**（後ろに書くと中身が黙って消える）。 */
@import './styles/base.css';

/* 既存の JS 設定（tailwind.config.js）を読み込む。**振る舞い不変を最優先し、
 * CSS-first（@theme）への全面移行は行わない** —— #78 で確立したトークン設計に
 * 踏み込むため、必要になったら別 Issue で扱う。 */
@config '../tailwind.config.js';
```

冒頭の注釈は、`base.css` を読む旨に合わせて 1 行だけ直す: 「要素層（…）は読まない」の段落はそのまま残し、末尾に「中身は `styles/base.css`（土台）と、PR 2 以降の画面の CSS に分けた（#321）。」を足す。

```bash
cd /workspaces/claym/local/Tasuki/apps/timer-web/src && rm index.css.head
```

- [ ] **Step 5: ビルド出力の CSS が分割前とバイトで一致することを確かめる**

```bash
cd /workspaces/claym/local/Tasuki
pnpm exec turbo run build --filter @tasuki/timer-web --force 2>&1 | grep -iE "warn|error|must precede" || true
cmp apps/timer-web/dist/assets/index-*.css ~/.cache/tasuki-parity/before-split/timer.css && echo IDENTICAL
```

Expected: `must precede` の警告が無い。`IDENTICAL` が出る。

一致しない場合は `diff <(tr '}' '\n' < ~/.cache/tasuki-parity/before-split/timer.css) <(tr '}' '\n' < apps/timer-web/dist/assets/index-*.css)` で差を見る。レイヤーの宣言の文が残っているだけなら（最小化で消えるはずだが）、その差だけであることを確かめて Step 6 へ進む。規則の順序や中身が変わっていたら、`@import` の位置を直す。

- [ ] **Step 6: timer のテストと型検査を通す**

Run: `pnpm --filter @tasuki/timer-web test && pnpm --filter @tasuki/timer-web typecheck && pnpm --filter @tasuki/timer-web lint`
Expected: すべて通る

- [ ] **Step 7: コミットして push する**

```bash
git add apps/timer-web/src/index.css apps/timer-web/src/styles/base.css
git commit -F - <<'EOF'
refactor: timer の index.css を入口と土台に分け、レイヤーの順序を宣言する（#321 PR 1）

- 中身は styles/base.css へ 1 バイトも変えずに移した（レイヤーに入れない）
- @layer の順序を @import 'tailwindcss' より前に宣言し、timer の層を用意した
- ビルド出力の CSS が分割前とバイトで一致することを確かめた

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git push -u origin feature/issue-321-pr1-primitives
```

---

### Task 2: 比較の純関数を書く（テストが先）

**Files:**
- Create: `e2e/parity/compare-lib.ts`
- Create: `e2e/tests/parity-compare.test.ts`

**Interfaces:**
- Produces（`e2e/parity/compare-lib.ts`）:
  - `interface StyleEntry { readonly path: string; readonly pseudo: string; readonly props: Readonly<Record<string, string>> }`
  - `interface StyleDiff { readonly path: string; readonly pseudo: string; readonly prop: string; readonly base: string | null; readonly branch: string | null }`
  - `interface IgnoreRule { readonly path: RegExp; readonly prop: RegExp; readonly reason: string }`
  - `interface CompareOptions { readonly tailwindThemeVars: ReadonlySet<string>; readonly ignore: readonly IgnoreRule[] }`
  - `function isTailwindCustomProp(name: string, themeVars: ReadonlySet<string>): boolean`
  - `function normalizeBoxShadow(value: string): string`
  - `function diffEntries(base: readonly StyleEntry[], branch: readonly StyleEntry[], options: CompareOptions): StyleDiff[]`
  - `function diffKeyframes(base: Readonly<Record<string, string>>, branch: Readonly<Record<string, string>>): string[]`（中身が違う・片側にしか無いキーフレームの名前）
  - `function themeVarNamesFromCss(css: string): Set<string>`（Tailwind の theme 層 `@layer theme{…}` が定義する `--*` の名前）

- [ ] **Step 1: 失敗するテストを書く**

`e2e/tests/parity-compare.test.ts`:

```ts
/**
 * 比較の仕組み（#321・設計正本 §5）の純関数の自己テスト。
 *
 * **無害として扱う差は §5.4 の 2 類だけ。** ここで広げると、利用者が承認していない差が黙って通る。
 * 「除く」テストと同じ数だけ「除かない」テストを置く（オラクルは実装より広く書く）。
 */
import { describe, expect, it } from 'vitest';
import {
  diffEntries,
  diffKeyframes,
  isTailwindCustomProp,
  normalizeBoxShadow,
  themeVarNamesFromCss,
  type CompareOptions,
  type StyleEntry,
} from '../parity/compare-lib';

const NO_IGNORE: CompareOptions = { tailwindThemeVars: new Set(['--spacing']), ignore: [] };

function entry(path: string, props: Record<string, string>, pseudo = ''): StyleEntry {
  return { path, pseudo, props };
}

describe('isTailwindCustomProp: §5.4 の類 1', () => {
  it('Given --tw- で始まる名前 / When 判定する / Then Tailwind のもの', () => {
    expect(isTailwindCustomProp('--tw-shadow', new Set())).toBe(true);
  });
  it('Given theme 層の名簿にある名前 / When 判定する / Then Tailwind のもの', () => {
    expect(isTailwindCustomProp('--spacing', new Set(['--spacing']))).toBe(true);
  });
  it('Given timer 自身のトークンの別名 / When 判定する / Then Tailwind のものではない（比べる）', () => {
    expect(isTailwindCustomProp('--ink', new Set(['--spacing']))).toBe(false);
    expect(isTailwindCustomProp('--signal-tint', new Set(['--spacing']))).toBe(false);
  });
  it('Given 名前に tw を含むだけの変数 / When 判定する / Then Tailwind のものではない', () => {
    expect(isTailwindCustomProp('--twin', new Set())).toBe(false);
  });
});

describe('normalizeBoxShadow: §5.4 の類 2（長さがすべて 0 で色の α が 0 の層だけを落とす）', () => {
  it('Given 透明な 0 層と実の影 / When 正規化する / Then 実の影だけが残る', () => {
    expect(
      normalizeBoxShadow('rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.5) 0px 10px 30px 0px'),
    ).toBe('rgba(0, 0, 0, 0.5) 0px 10px 30px 0px');
  });
  it('Given 透明な 0 層だけ / When 正規化する / Then none', () => {
    expect(normalizeBoxShadow('rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px')).toBe('none');
  });
  it('Given 色は透明だが長さが 0 でない層 / When 正規化する / Then 落とさない', () => {
    expect(normalizeBoxShadow('rgba(0, 0, 0, 0) 0px 1px 0px 0px')).toBe('rgba(0, 0, 0, 0) 0px 1px 0px 0px');
  });
  it('Given 長さは 0 だが色が不透明な層 / When 正規化する / Then 落とさない', () => {
    expect(normalizeBoxShadow('rgb(0, 0, 0) 0px 0px 0px 0px')).toBe('rgb(0, 0, 0) 0px 0px 0px 0px');
  });
  it('Given inset の透明な 0 層 / When 正規化する / Then 落とす', () => {
    expect(normalizeBoxShadow('rgba(0, 0, 0, 0) 0px 0px 0px 0px inset, rgb(1, 2, 3) 0px 0px 0px 1px')).toBe(
      'rgb(1, 2, 3) 0px 0px 0px 1px',
    );
  });
  it('Given rgba 以外の色表記（oklab など） / When 正規化する / Then 不透明とみなして落とさない（安全側）', () => {
    const v = 'oklab(0.5 0 0 / 0) 0px 0px 0px 0px';
    expect(normalizeBoxShadow(v)).toBe(v);
  });
});

describe('diffEntries: 基準とブランチの計算済みスタイルを突き合わせる', () => {
  it('Given 同じ値 / When 比べる / Then 差は 0 件', () => {
    const a = [entry('html>body', { color: 'rgb(0, 0, 0)' })];
    expect(diffEntries(a, a, NO_IGNORE)).toEqual([]);
  });
  it('Given 値が違う / When 比べる / Then 差として出る', () => {
    const d = diffEntries(
      [entry('html>body', { color: 'rgb(0, 0, 0)' })],
      [entry('html>body', { color: 'rgb(1, 0, 0)' })],
      NO_IGNORE,
    );
    expect(d).toEqual([{ path: 'html>body', pseudo: '', prop: 'color', base: 'rgb(0, 0, 0)', branch: 'rgb(1, 0, 0)' }]);
  });
  it('Given 道筋が片側にしか無い / When 比べる / Then 差として出る（無言で飛ばさない）', () => {
    const d = diffEntries([entry('html>body', {}), entry('html>body>p', { color: 'x' })], [entry('html>body', {})], NO_IGNORE);
    expect(d).toEqual([{ path: 'html>body>p', pseudo: '', prop: '*', base: '(あり)', branch: null }]);
  });
  it('Given 擬似要素が片側にしか無い / When 比べる / Then 差として出る', () => {
    const d = diffEntries([entry('html>body', {})], [entry('html>body', {}), entry('html>body', { content: '"x"' }, '::before')], NO_IGNORE);
    expect(d.map((x) => [x.pseudo, x.prop])).toEqual([['::before', '*']]);
  });
  it('Given プロパティが片側にしか無い / When 比べる / Then 差として出る', () => {
    const d = diffEntries([entry('html>body', { '--ink': 'a' })], [entry('html>body', {})], NO_IGNORE);
    expect(d).toEqual([{ path: 'html>body', pseudo: '', prop: '--ink', base: 'a', branch: null }]);
  });
  it('Given Tailwind のカスタムプロパティだけが違う / When 比べる / Then 差にしない（類 1）', () => {
    const d = diffEntries(
      [entry('html>body', { '--tw-shadow': '0 0 #0000', '--spacing': '0.25rem' })],
      [entry('html>body', {})],
      NO_IGNORE,
    );
    expect(d).toEqual([]);
  });
  it('Given 前置詞つきのプロパティが違う / When 比べる / Then 差として出る（除かない）', () => {
    const d = diffEntries(
      [entry('html>body', { '-webkit-text-size-adjust': '100%' })],
      [entry('html>body', { '-webkit-text-size-adjust': 'auto' })],
      NO_IGNORE,
    );
    expect(d).toHaveLength(1);
  });
  it('Given box-shadow が透明な 0 層の有無だけ違う / When 比べる / Then 差にしない（類 2）', () => {
    const d = diffEntries(
      [entry('p', { 'box-shadow': 'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgb(0, 0, 0) 0px 1px 2px 0px' })],
      [entry('p', { 'box-shadow': 'rgb(0, 0, 0) 0px 1px 2px 0px' })],
      NO_IGNORE,
    );
    expect(d).toEqual([]);
  });
  it('Given 除く規則に当たる差 / When 比べる / Then 差にしない。当たらない差は残る', () => {
    const options: CompareOptions = {
      tailwindThemeVars: new Set(),
      ignore: [{ path: /^html>body>p$/, prop: /^width$/, reason: 'ルームコードの字幅' }],
    };
    const d = diffEntries(
      [entry('html>body>p', { width: '10px', color: 'a' })],
      [entry('html>body>p', { width: '11px', color: 'b' })],
      options,
    );
    expect(d.map((x) => x.prop)).toEqual(['color']);
  });
});

describe('diffKeyframes: 使われているキーフレームの中身を突き合わせる', () => {
  it('Given 中身が違う / When 比べる / Then 名前が出る', () => {
    expect(diffKeyframes({ pulse: '@keyframes pulse { 50% { opacity: 0.5; } }' }, { pulse: '@keyframes pulse { 50% { opacity: 0.4; } }' })).toEqual(['pulse']);
  });
  it('Given 片側にしか無い / When 比べる / Then 名前が出る', () => {
    expect(diffKeyframes({ pulse: 'x' }, {})).toEqual(['pulse']);
  });
  it('Given 同じ / When 比べる / Then 空', () => {
    expect(diffKeyframes({ pulse: 'x' }, { pulse: 'x' })).toEqual([]);
  });
});

describe('themeVarNamesFromCss: Tailwind の theme 層が定義する変数の名簿', () => {
  it('Given @layer theme の中の :root / When 読む / Then その --* を返し、層の外の変数は含めない', () => {
    const css = '@layer theme{:root,:host{--spacing:.25rem;--text-sm:.875rem}}:root{--ink:#000}';
    expect([...themeVarNamesFromCss(css)].sort()).toEqual(['--spacing', '--text-sm']);
  });
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `cd e2e && pnpm exec vitest run tests/parity-compare.test.ts`
Expected: FAIL（`../parity/compare-lib` が見つからない）

- [ ] **Step 3: 実装を書く**

`e2e/parity/compare-lib.ts`:

```ts
/**
 * 比較の仕組み（#321・設計正本 §5）の純関数。ブラウザにも Playwright にも触れない。
 *
 * **差として扱わないのは §5.4 の 2 類と、名指しの除外（対照実行で揺れたもの・台帳で承認したもの）だけ。**
 * それ以外の差は、前置詞つきのプロパティも timer 自身のトークンの別名も、すべて差として返す。
 *
 * PR 4 の通しの比較の後で、比較の仕組みごと消す（設計正本 §5.1）。
 */

/** 1 要素（または擬似要素）の計算済みスタイル。 */
export interface StyleEntry {
  /** `html` からの DOM の道筋（`html>body>div:nth-of-type(1)>…`）。 */
  readonly path: string;
  /** 擬似要素（`::before` など）。要素そのものは空文字。 */
  readonly pseudo: string;
  readonly props: Readonly<Record<string, string>>;
}

export interface StyleDiff {
  readonly path: string;
  readonly pseudo: string;
  /** プロパティ名。道筋か擬似要素が片側にしか無いときは `*`。 */
  readonly prop: string;
  /** その側に無いときは null。道筋ごと片側にしか無いときは `(あり)`。 */
  readonly base: string | null;
  readonly branch: string | null;
}

/** 名指しの除外。理由を必ず持つ（台帳と `noise.ts` がこれを引用する）。 */
export interface IgnoreRule {
  readonly path: RegExp;
  readonly prop: RegExp;
  readonly reason: string;
}

export interface CompareOptions {
  /** Tailwind の theme 層が定義する変数の名前（§5.4 の類 1）。 */
  readonly tailwindThemeVars: ReadonlySet<string>;
  /** 名指しの除外（対照実行で揺れたもの・台帳で承認したもの）。 */
  readonly ignore: readonly IgnoreRule[];
}

/** §5.4 の類 1: `--tw-` で始まるか、Tailwind の theme 層が定義する変数。 */
export function isTailwindCustomProp(name: string, themeVars: ReadonlySet<string>): boolean {
  return name.startsWith('--tw-') || themeVars.has(name);
}

/** 括弧の外のカンマで分ける。 */
function splitTopLevel(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim() !== '') out.push(current.trim());
  return out;
}

/** 長さがすべて 0 で、色の α が 0 の層か。`rgb()` / `rgba()` / `transparent` 以外の色は不透明とみなす（安全側）。 */
function isTransparentZeroLayer(layer: string): boolean {
  const rgb = /rgba?\(([^)]*)\)/.exec(layer);
  let alpha: number;
  if (rgb !== null) {
    const parts = (rgb[1] ?? '').split(/[\s,/]+/).filter((s) => s !== '');
    alpha = parts.length >= 4 ? Number(parts[3]) : 1;
  } else if (/\btransparent\b/.test(layer)) {
    alpha = 0;
  } else {
    return false;
  }
  const lengths = layer
    .replace(/rgba?\([^)]*\)|\btransparent\b|\binset\b/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((s) => s !== '');
  return alpha === 0 && lengths.length > 0 && lengths.every((l) => /^-?0(?:px)?$/.test(l));
}

/** §5.4 の類 2: `box-shadow` の透明な 0 層を取り除く。 */
export function normalizeBoxShadow(value: string): string {
  if (value === 'none') return value;
  const kept = splitTopLevel(value).filter((layer) => !isTransparentZeroLayer(layer));
  return kept.length === 0 ? 'none' : kept.join(', ');
}

function normalize(prop: string, value: string): string {
  return prop === 'box-shadow' ? normalizeBoxShadow(value) : value;
}

function isIgnored(path: string, prop: string, rules: readonly IgnoreRule[]): boolean {
  return rules.some((r) => r.path.test(path) && r.prop.test(prop));
}

const keyOf = (e: { path: string; pseudo: string }): string => `${e.path}\u0000${e.pseudo}`;

/** 基準とブランチの計算済みスタイルを突き合わせる。道筋・擬似要素・プロパティが片側にしか無いものも差にする。 */
export function diffEntries(
  base: readonly StyleEntry[],
  branch: readonly StyleEntry[],
  options: CompareOptions,
): StyleDiff[] {
  const baseMap = new Map(base.map((e) => [keyOf(e), e]));
  const branchMap = new Map(branch.map((e) => [keyOf(e), e]));
  const keys = [...new Set([...baseMap.keys(), ...branchMap.keys()])].sort();
  const diffs: StyleDiff[] = [];
  for (const key of keys) {
    const b = baseMap.get(key);
    const r = branchMap.get(key);
    const sample = b ?? r;
    if (sample === undefined) continue;
    if (b === undefined || r === undefined) {
      if (isIgnored(sample.path, '*', options.ignore)) continue;
      diffs.push({
        path: sample.path,
        pseudo: sample.pseudo,
        prop: '*',
        base: b === undefined ? null : '(あり)',
        branch: r === undefined ? null : '(あり)',
      });
      continue;
    }
    const props = [...new Set([...Object.keys(b.props), ...Object.keys(r.props)])].sort();
    for (const prop of props) {
      if (prop.startsWith('--') && isTailwindCustomProp(prop, options.tailwindThemeVars)) continue;
      if (isIgnored(b.path, prop, options.ignore)) continue;
      const bv = b.props[prop];
      const rv = r.props[prop];
      if (bv !== undefined && rv !== undefined && normalize(prop, bv) === normalize(prop, rv)) continue;
      diffs.push({ path: b.path, pseudo: b.pseudo, prop, base: bv ?? null, branch: rv ?? null });
    }
  }
  return diffs;
}

/** 中身が違う・片側にしか無いキーフレームの名前。 */
export function diffKeyframes(
  base: Readonly<Record<string, string>>,
  branch: Readonly<Record<string, string>>,
): string[] {
  const names = [...new Set([...Object.keys(base), ...Object.keys(branch)])].sort();
  return names.filter((n) => base[n] !== branch[n]);
}

/** Tailwind の theme 層（`@layer theme{…}`）が定義する `--*` の名前。層の外は含めない。 */
export function themeVarNamesFromCss(css: string): Set<string> {
  const names = new Set<string>();
  const start = css.indexOf('@layer theme{');
  if (start < 0) return names;
  let depth = 0;
  let end = start;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) {
      end = i;
      break;
    }
  }
  for (const m of css.slice(start, end).matchAll(/(--[\w-]+)\s*:/g)) {
    if (m[1] !== undefined) names.add(m[1]);
  }
  return names;
}
```

- [ ] **Step 4: テストを走らせて通ることを確かめる**

Run: `cd e2e && pnpm exec vitest run tests/parity-compare.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: 型検査と lint の射程に `parity` を足す**

`e2e/tsconfig.json` の `include` に `"parity"` を足す（`"specs"` の次）。`e2e/package.json` の `lint` を `eslint harness fixtures support specs tests parity --no-error-on-unmatched-pattern` にする。

Run: `cd e2e && pnpm typecheck && pnpm lint`
Expected: 通る

- [ ] **Step 6: コミットして push する**

```bash
git add e2e/parity/compare-lib.ts e2e/tests/parity-compare.test.ts e2e/tsconfig.json e2e/package.json
git commit -F - <<'EOF'
test: 基準と並べる比較の純関数を足す（#321 PR 1）

- 差にしないのは設計正本 §5.4 の 2 類（Tailwind の変数・透明な 0 層の影）と名指しの除外だけ
- 道筋・擬似要素・プロパティが片側にしか無いものも差にする
- e2e の型検査と lint の射程に parity を足した

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git push
```

---

### Task 3: 比較の仕組みの骨組み（設定・基準の配り方・書き出し）

**Files:**
- Create: `e2e/parity/parity.config.ts`
- Create: `e2e/parity/base-dist.ts`
- Create: `e2e/parity/capture.ts`
- Create: `e2e/parity/README.md`
- Modify: `.gitignore`（`e2e/parity/out/` を足す）

**Interfaces:**
- Consumes: `StyleEntry`（Task 2）
- Produces:
  - `serveBaseDist(context: BrowserContext, distDir: string): Promise<BaseServing>`、`interface BaseServing { readonly served: () => number; readonly missing: () => readonly string[] }`
  - `captureStyles(page: Page, rootSelector?: string): Promise<StyleEntry[]>`（全要素と P4 の擬似要素）
  - `captureMotion(page: Page): Promise<StyleEntry[]>`（`transition-*` / `animation-*` だけ）
  - `captureKeyframes(page: Page): Promise<Record<string, string>>`
  - `captureElement(locator: Locator): Promise<StyleEntry[]>`（その要素と擬似要素だけ）
  - `BASE_DIST: string`（`TASUKI_PARITY_BASE_DIST` の値。無ければ設定の読み込みで落ちる）

- [ ] **Step 1: 設定を書く**

`e2e/parity/parity.config.ts`:

```ts
/**
 * 基準（`ba9249d`）と並べる比較の Playwright 設定（#321・設計正本 §5）。
 *
 * **`pnpm e2e` には数えない**（`e2e/specs/` の外で、既定の設定は `./specs` しか見ない）。
 * 実行: `cd e2e && TASUKI_E2E_TARGET=local TASUKI_PARITY_BASE_DIST=… pnpm exec playwright test -c parity/parity.config.ts`
 *
 * ハーネス（Caddy・同期サーバー・`/var/www` の symlink）は既定の設定と同じ `globalSetup` で 1 本だけ立てる。
 * 基準の側は、ブラウザの文脈ごとに `/timer/` を基準の dist から返す（`base-dist.ts`・計画 P1）。
 *
 * **このファイルの export は規約（名前付きエクスポート優先）の例外。** Playwright が default export を要求するため。
 */
import { defineConfig, devices } from '@playwright/test';
import { resolveTarget } from '../harness/target';

const target = resolveTarget(process.env);
if (target.kind === 'production') {
  throw new Error('比較の仕組みは local でだけ動かす（TASUKI_E2E_TARGET=local）。');
}

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.parity.ts',
  globalSetup: '../harness/global-setup.ts',
  outputDir: './out/artifacts',
  snapshotPathTemplate: '{testDir}/out/snapshots/{arg}{ext}',
  // 両側を順に撮って比べる。並列にすると同期サーバーの負荷で状態の作り方が揺れる。
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  // 残りわずか（最短 3 分の間隔）を待つ状態があるので長めに取る。
  timeout: 15 * 60_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: target.baseURL,
    trace: 'retain-on-failure',
  },
});
```

- [ ] **Step 2: 基準の配り方を書く**

`e2e/parity/base-dist.ts`:

```ts
/**
 * 基準の側のブラウザの文脈で、`/timer/` への要求を基準の dist から返す（#321・計画 P1）。
 *
 * **WS は経路の外**（`/ws?tool=timer` は `/timer/` を含まない。`routeWebSocket` は使わない ——
 * 掛けたページは同期を取りこぼす・`e2e/README.md`）。玄関（`/`）はハーネスが配るブランチのものを使う。
 *
 * dist に無いパスは `index.html` を返す（Caddy の SPA の断片と同じ振る舞い）。ただし**資産らしいパス
 * （拡張子を持つもの）が dist に無かったら数える** —— 基準とブランチで資産の名前がずれて、
 * 基準の側が HTML を資産として読んでいる状態を見逃さないため。
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { BrowserContext } from '@playwright/test';

/** 基準の timer の dist。無ければ、ここを読み込んだ時点で落とす。 */
export const BASE_DIST: string = (() => {
  const dir = process.env['TASUKI_PARITY_BASE_DIST'];
  if (dir === undefined || dir === '' || !existsSync(path.join(dir, 'index.html'))) {
    throw new Error(
      'TASUKI_PARITY_BASE_DIST に基準の timer の dist（index.html を含む）を渡してください。' +
        `（受け取った値: ${String(dir)}。作り方は e2e/parity/README.md）`,
    );
  }
  return path.resolve(dir);
})();

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

export interface BaseServing {
  /** 基準の dist から返した要求の件数。0 なら基準を撮っていない。 */
  readonly served: () => number;
  /** 拡張子を持つのに基準の dist に無かったパス。 */
  readonly missing: () => readonly string[];
}

export async function serveBaseDist(context: BrowserContext, distDir: string): Promise<BaseServing> {
  let served = 0;
  const missing: string[] = [];
  await context.route(/\/timer\//, async (route) => {
    const url = new URL(route.request().url());
    const rel = decodeURIComponent(url.pathname.replace(/^\/timer\//, ''));
    const candidate = path.join(distDir, rel);
    const inside = candidate.startsWith(distDir + path.sep);
    const isFile = inside && existsSync(candidate) && statSync(candidate).isFile();
    if (!isFile && path.extname(rel) !== '') missing.push(url.pathname);
    const file = isFile ? candidate : path.join(distDir, 'index.html');
    served += 1;
    await route.fulfill({
      status: 200,
      contentType: TYPES[path.extname(file)] ?? 'application/octet-stream',
      body: readFileSync(file),
    });
  });
  return { served: () => served, missing: () => [...missing] };
}
```

- [ ] **Step 3: 書き出しを書く**

`e2e/parity/capture.ts`:

```ts
/**
 * 計算済みスタイルの書き出し（#321・設計正本 §5.2）。
 *
 * - 要素は `html` から歩き、道筋（`tag:nth-of-type(n)` の連なり）で識別する
 * - カスタムプロパティは親と値が違う要素でだけ記録する（`html` は全部・計画 P3）
 * - 擬似要素は描画されるものだけ（計画 P4）
 *
 * `page.evaluate` に渡す関数は**自己完結**させる（Playwright は関数の本文だけをブラウザへ送る）。
 */
import type { Locator, Page } from '@playwright/test';
import type { StyleEntry } from './compare-lib';

/** 動きのプロパティ（`no-preference` の下でだけ読む・設計正本 §5.2 の 2）。 */
export const MOTION_PROPS = [
  'transition-property',
  'transition-duration',
  'transition-timing-function',
  'transition-delay',
  'transition-behavior',
  'animation-name',
  'animation-duration',
  'animation-timing-function',
  'animation-delay',
  'animation-iteration-count',
  'animation-direction',
  'animation-fill-mode',
  'animation-play-state',
] as const;

interface WalkOptions {
  readonly rootSelector: string;
  /** null なら全プロパティ。配列ならそのプロパティだけ（擬似要素は読まない）。 */
  readonly only: readonly string[] | null;
  /** true なら root の要素だけ（子孫を歩かない）。 */
  readonly single: boolean;
}

/** ブラウザ側で動く本体。**自己完結させる**（外の識別子を参照しない）。 */
function walkInPage(options: WalkOptions): StyleEntry[] {
  const root = document.querySelector(options.rootSelector);
  if (root === null) throw new Error(`書き出しの根が見つかりません: ${options.rootSelector}`);

  const pathOf = (el: Element): string => {
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur !== null) {
      const tag = cur.tagName.toLowerCase();
      const parent: Element | null = cur.parentElement;
      if (parent === null) {
        parts.unshift(tag);
        break;
      }
      const tagName = cur.tagName;
      const same = Array.from(parent.children).filter((c) => c.tagName === tagName);
      parts.unshift(`${tag}:nth-of-type(${same.indexOf(cur) + 1})`);
      cur = parent;
    }
    return parts.join('>');
  };

  const read = (cs: CSSStyleDeclaration, parent: CSSStyleDeclaration | null): Record<string, string> => {
    const props: Record<string, string> = {};
    if (options.only !== null) {
      for (const name of options.only) props[name] = cs.getPropertyValue(name);
      return props;
    }
    for (let i = 0; i < cs.length; i += 1) {
      const name = cs.item(i);
      const value = cs.getPropertyValue(name);
      if (name.startsWith('--') && parent !== null && parent.getPropertyValue(name) === value) continue;
      props[name] = value;
    }
    return props;
  };

  const out: StyleEntry[] = [];
  const visit = (el: Element): void => {
    const cs = getComputedStyle(el);
    const parent = el.parentElement === null ? null : getComputedStyle(el.parentElement);
    const path = pathOf(el);
    out.push({ path, pseudo: '', props: read(cs, parent) });
    if (options.only === null) {
      for (const pseudo of ['::before', '::after']) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content !== 'none' && ps.content !== 'normal') out.push({ path, pseudo, props: read(ps, cs) });
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        out.push({ path, pseudo: '::placeholder', props: read(getComputedStyle(el, '::placeholder'), cs) });
      }
      if (cs.display === 'list-item') {
        out.push({ path, pseudo: '::marker', props: read(getComputedStyle(el, '::marker'), cs) });
      }
      if (el instanceof HTMLSelectElement && el.matches(':open')) {
        out.push({ path, pseudo: '::picker(select)', props: read(getComputedStyle(el, '::picker(select)'), cs) });
      }
    }
    if (!options.single) for (const child of Array.from(el.children)) visit(child);
  };
  visit(root);
  return out;
}

export async function captureStyles(page: Page, rootSelector = 'html'): Promise<StyleEntry[]> {
  return page.evaluate(walkInPage, { rootSelector, only: null, single: false });
}

export async function captureMotion(page: Page): Promise<StyleEntry[]> {
  return page.evaluate(walkInPage, { rootSelector: 'html', only: [...MOTION_PROPS], single: false });
}

/** その要素と擬似要素だけ。操作の状態（ホバー・フォーカス・押下）の書き出しに使う。 */
export async function captureElement(locator: Locator): Promise<StyleEntry[]> {
  const marker = `parity-${Math.random().toString(36).slice(2)}`;
  await locator.evaluate((el, m) => el.setAttribute('data-parity-target', m), marker);
  try {
    return await locator.page().evaluate(walkInPage, {
      rootSelector: `[data-parity-target="${marker}"]`,
      only: null,
      single: true,
    });
  } finally {
    await locator.evaluate((el) => el.removeAttribute('data-parity-target'));
  }
}

/** 使われている `animation-name` ごとの `@keyframes` の中身（同じ名前が複数あれば連ねる）。 */
export async function captureKeyframes(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const used = new Set<string>();
    for (const el of Array.from(document.querySelectorAll('*'))) {
      for (const n of getComputedStyle(el).animationName.split(',')) {
        const name = n.trim();
        if (name !== '' && name !== 'none') used.add(name);
      }
    }
    const out: Record<string, string> = {};
    const visit = (rules: CSSRuleList): void => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSKeyframesRule) {
          if (used.has(rule.name)) out[rule.name] = (out[rule.name] ?? '') + rule.cssText;
        } else if ('cssRules' in rule) {
          visit((rule as CSSGroupingRule).cssRules);
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules);
    return out;
  });
}
```

`captureElement` は書き出しの間だけ `data-parity-target` 属性を付ける。属性セレクタで飾っている規則は timer に無いので、見た目は変わらない（Step 5 で確かめる）。

- [ ] **Step 4: 出力の置き場を無視する**

`.gitignore` の末尾に足す:

```
# 基準と並べる比較（#321）の書き出し。台帳（docs/superpowers/specs/…-parity-ledger.md）が正本
e2e/parity/out/
```

- [ ] **Step 5: 書き出しの前提を確かめる使い捨ての parity を流す（コミットしない）**

`e2e/parity/probe.parity.ts` を一時的に作る:

```ts
import { expect, test } from '@playwright/test';
import { captureStyles } from './capture';

test('前提の確認（使い捨て）', async ({ page }) => {
  await page.goto('/');
  const entries = await captureStyles(page);
  const html = entries.find((e) => e.path === 'html' && e.pseudo === '');
  // 計画 P3 の前提: Chromium の計算済みスタイルはカスタムプロパティを列挙する
  expect(Object.keys(html?.props ?? {}).some((k) => k.startsWith('--')), 'カスタムプロパティが列挙されない').toBe(true);
  expect(entries.length).toBeGreaterThan(20);
  // data-parity-target を飾る規則が無い（captureElement の前提）
  const hits = await page.evaluate(() =>
    Array.from(document.styleSheets).flatMap((s) => Array.from(s.cssRules)).filter((r) => r.cssText.includes('data-parity')).length,
  );
  expect(hits).toBe(0);
});
```

Run: `cd e2e && TASUKI_E2E_TARGET=local TASUKI_PARITY_BASE_DIST=$HOME/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist pnpm exec playwright test -c parity/parity.config.ts probe`
Expected: PASS。カスタムプロパティが列挙されなかったら、`read()` のカスタムプロパティの読み方を「`html` に対して `document.styleSheets` の `:root` 規則から名前を集め、その名前で `getPropertyValue` を読む」形に変えてから進む（そのときは計画 P3 の表に追記する）

確かめたら `rm e2e/parity/probe.parity.ts`。`ss -tlnp | grep -E ':(8787|18080)\b'` が空であることを見る。

- [ ] **Step 6: README を書く**

`e2e/parity/README.md`:

````markdown
# 基準と並べる比較（#321）

timer から Tailwind を外す間だけ置く比較の仕組み。**PR 4 の通しの比較の後で消す**（設計正本 §5.1）。
消した後に再現するときは、台帳に書いた比較の仕組みの SHA で `git checkout <SHA> -- e2e/parity` する。

## 基準の dist を作る（1 回だけ）

```bash
git worktree add ~/.cache/tasuki-parity/base-ba9249d ba9249d
cd ~/.cache/tasuki-parity/base-ba9249d && pnpm install --frozen-lockfile
pnpm exec turbo run build --filter @tasuki/timer-web
```

## 流す

```bash
cd e2e
TASUKI_E2E_TARGET=local \
TASUKI_PARITY_BASE_DIST=$HOME/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist \
pnpm exec playwright test -c parity/parity.config.ts
```

- turbo を経由しない（strict env に阻まれる）。WSLg では `WAYLAND_DISPLAY` が要る
- 8787・18080 を使う。終わったら `ss -tlnp | grep -E ':(8787|18080)\b'` が空であることを見る
- 結果は `e2e/parity/out/`（無視している）。**正本は台帳**（`docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md`）

## 何を比べるか

設計正本 §5 を読むこと。ここに写さない。
````

- [ ] **Step 7: 型検査・lint を通し、コミットして push する**

Run: `cd e2e && pnpm typecheck && pnpm lint && cd .. && node scripts/audit-dependency-direction.mjs`
Expected: 通る

```bash
git add e2e/parity/parity.config.ts e2e/parity/base-dist.ts e2e/parity/capture.ts e2e/parity/README.md .gitignore
git commit -F - <<'EOF'
test: 基準と並べる比較の骨組みを足す（#321 PR 1）

- 基準の側の文脈では /timer/ を基準の dist から返す（ハーネスは 1 本のまま）
- 計算済みスタイル・動き・キーフレーム・要素単体の書き出しを足した
- pnpm e2e には数えない（e2e/specs の外・専用の設定）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git push
```

---

### Task 4: 状態の目録と、静止・動き・キーフレーム・画素の比較

**Files:**
- Create: `e2e/parity/states.ts`
- Create: `e2e/parity/noise.ts`
- Create: `e2e/parity/timer.parity.ts`

**Interfaces:**
- Consumes: `serveBaseDist`・`BASE_DIST`（Task 3）、`captureStyles`・`captureMotion`・`captureKeyframes`（Task 3）、`diffEntries`・`diffKeyframes`・`themeVarNamesFromCss`（Task 2）、`createRoom`・`joinAsDriver`・`lobbyRotationRow`・`currentDriverRow`・`intervalButton`・`statusStrip`（`e2e/support/timer.ts`）
- Produces:
  - `interface ParityState { readonly name: string; readonly setup: (open: OpenPage) => Promise<Page>; readonly marker: (page: Page) => Locator; readonly minElements: number; readonly mask: (page: Page) => Locator[] }`
  - `type OpenPage = (label: string) => Promise<Page>`
  - `STATES: readonly ParityState[]`
  - `WIDTHS: readonly number[]`（`[360, 640, 768, 1024, 1280]`）
  - `NOISE: readonly IgnoreRule[]`（Task 6 で埋める。この時点では空）
  - 書き出し: `e2e/parity/out/<状態>/diff.json`（差の一覧）

- [ ] **Step 1: 雑音の置き場を空で作る**

`e2e/parity/noise.ts`:

```ts
/**
 * 対照実行（基準同士の比較）で揺れると分かった値の名指し（#321・設計正本 §5.2・§5.6）。
 *
 * **1 件ずつ理由を書く。** 理由の無い除外を足さない。ここに無い差は、すべて台帳で仕分ける。
 */
import type { IgnoreRule } from './compare-lib';

export const NOISE: readonly IgnoreRule[] = [];
```

- [ ] **Step 2: 状態の目録を書く**

`e2e/parity/states.ts`:

```ts
/**
 * 撮る状態の目録（#321・設計正本 §5.5）。
 *
 * **状態ごとに、その状態にしか無い目印を書き出しの前に断定する。** 状態を作り損ねて両側が玄関へ
 * 飛ぶと、同じ玄関を比べて差 0 件になる。目印は役割と名前で掴む（クラス名で掴まない）。
 *
 * 状態は既存 spec の作り方で作る。`routeWebSocket` は「繋がらない」（接続を閉じるだけ）にしか使わない
 * —— フレームを中継するページは同期を取りこぼす（`e2e/README.md`）。
 *
 * **網羅は規則の使用状況（E8・PR 2 から）で確かめる。** ここに足りない状態は、PR 2 以降で
 * 「一度も当たらない規則」として見つかる。
 */
import { expect, type Locator, type Page } from '@playwright/test';
import {
  createRoom,
  currentDriverRow,
  intervalButton,
  joinAsDriver,
  lobbyRotationRow,
  statusStrip,
} from '../support/timer';

export type OpenPage = (label: string) => Promise<Page>;

export interface ParityState {
  readonly name: string;
  /** 状態を作り、撮る対象のページを返す。`open` は側（基準・ブランチ）ごとの新しい文脈でページを開く。 */
  readonly setup: (open: OpenPage) => Promise<Page>;
  /** その状態にしか無い目印。 */
  readonly marker: (page: Page) => Locator;
  /** 比べる要素数の下限。これを下回ったら状態を作り損ねている。 */
  readonly minElements: number;
  /** 画素の比較で隠す要素（ルームコード・QR・招待 URL・経過時間）。 */
  readonly mask: (page: Page) => Locator[];
}

export const WIDTHS = [360, 640, 768, 1024, 1280] as const;

const HOST = 'ホスト';
const GUEST = 'ゲスト';

/** ルームコード・QR・招待 URL・残り時間は、部屋ごと・時刻ごとに変わる。 */
function roomMask(page: Page): Locator[] {
  return [
    page.getByRole('img', { name: /QR コード$/ }),
    page.getByRole('timer'),
    page.getByLabel('ステータス情報'),
    page.locator('text=/\\/\\?room=/'),
  ];
}

async function lobbyWithGuest(open: OpenPage): Promise<{ host: Page; guest: Page }> {
  const host = await open('host');
  const code = await createRoom(host, HOST);
  const guest = await open('guest');
  await joinAsDriver(guest, code, GUEST);
  await expect(lobbyRotationRow(host, GUEST, 2)).toHaveCount(1);
  return { host, guest };
}

async function startSession(host: Page): Promise<void> {
  await host.getByRole('button', { name: 'セッションを開始' }).click();
  await expect(host.getByRole('timer')).toBeVisible();
}

/**
 * 接続を記録し、あとから閉じられるようにする（`timer.spec.ts` の `armRoomLoss` と同じ差し込み方。
 * 行き先は変えない）。
 */
async function trackSockets(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const opened: WebSocket[] = [];
    Object.defineProperty(window, '__paritySockets', { value: opened });
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        opened.push(this);
      }
    };
  });
}

/** 記録の保存に失敗させる（`localStorage.setItem` を合図の後だけ投げさせる）。 */
async function armStorageFailure(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const flag = { failing: false };
    Object.defineProperty(window, '__parityStorage', { value: flag });
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, key: string, value: string): void {
      if (flag.failing) throw new DOMException('parity: 保存に失敗させた', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
}

async function completeSession(host: Page): Promise<void> {
  await host.getByRole('button', { name: '完成!', exact: true }).click();
  await host.getByRole('button', { name: '完成として記録する' }).click();
  await expect(host.getByRole('button', { name: /新しいセッション/ })).toBeVisible();
}

export const STATES: readonly ParityState[] = [
  {
    name: 'lobby-alone',
    async setup(open) {
      const host = await open('host');
      await createRoom(host, HOST);
      return host;
    },
    marker: (p) => p.getByRole('button', { name: 'セッションを開始' }),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'lobby-two',
    async setup(open) {
      return (await lobbyWithGuest(open)).host;
    },
    marker: (p) => lobbyRotationRow(p, GUEST, 2),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'lobby-notify-open',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await host.getByRole('button', { name: '通知設定' }).click();
      return host;
    },
    marker: (p) => p.getByLabel('交代通知の設定'),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-driver',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await startSession(host);
      return host;
    },
    marker: (p) => p.getByRole('timer'),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-navigator',
    async setup(open) {
      const { host, guest } = await lobbyWithGuest(open);
      await startSession(host);
      await expect(currentDriverRow(guest)).toContainText(HOST);
      return guest;
    },
    marker: (p) => p.getByRole('timer'),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-paused',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await startSession(host);
      await host.getByRole('button', { name: '一時停止', exact: true }).click();
      return host;
    },
    marker: (p) => p.getByRole('button', { name: '再開', exact: true }),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-switched',
    async setup(open) {
      const { host, guest } = await lobbyWithGuest(open);
      await startSession(host);
      await host.getByRole('button', { name: 'スキップ', exact: true }).click();
      await expect(currentDriverRow(guest)).toContainText(GUEST);
      return guest;
    },
    marker: (p) => p.getByLabel('ドライバー交代通知'),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-urgent',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await intervalButton(host, '3分').click();
      await startSession(host);
      // 残り 10 秒以下で緊急表示になる（Session.tsx）。最短の間隔でも約 3 分待つ。
      await expect(host.getByRole('timer')).toHaveAttribute('aria-label', /残り時間 0:(0\d|10)$/, { timeout: 200_000 });
      await host.getByRole('button', { name: '一時停止', exact: true }).click();
      return host;
    },
    marker: (p) => p.getByRole('timer'),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-remove-confirm',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await startSession(host);
      await host.getByRole('button', { name: `${GUEST} を退出させる` }).click();
      return host;
    },
    marker: (p) => p.getByRole('dialog'),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-proxy-form',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await startSession(host);
      await host.getByRole('button', { name: '代理参加者を追加' }).click();
      return host;
    },
    marker: (p) => p.getByLabel('代理参加者の名前'),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-memo',
    async setup(open) {
      const { host, guest } = await lobbyWithGuest(open);
      await startSession(host);
      await host.getByRole('tab', { name: /メモ/ }).click();
      await guest.getByRole('tab', { name: /メモ/ }).click();
      await guest.getByLabel('共有メモ').fill('parity の更新');
      await expect(host.getByLabel('共有メモ')).toHaveValue('parity の更新');
      return host;
    },
    marker: (p) => p.getByLabel('共有メモ'),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-end-confirm',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await startSession(host);
      await host.getByRole('button', { name: '完成!', exact: true }).click();
      return host;
    },
    marker: (p) => p.getByRole('dialog'),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'banner-warn-reconnecting',
    async setup(open) {
      const host = await open('host');
      await trackSockets(host);
      await createRoom(host, HOST);
      // これ以降に張られる接続は閉じる（フレームは中継しない）。いまの接続を落とすと再接続が続く。
      await host.routeWebSocket(/\/ws\?.*\btool=timer\b/, (ws) => void ws.close());
      const closed = await host.evaluate(() => {
        const sockets = (window as unknown as { __paritySockets: WebSocket[] }).__paritySockets;
        const last = sockets[sockets.length - 1];
        last?.close();
        return last !== undefined;
      });
      expect(closed, '落とす接続が見つからない').toBe(true);
      return host;
    },
    marker: (p) => p.getByRole('status').filter({ hasText: '再接続しています' }),
    minElements: 30,
    mask: roomMask,
  },
  {
    name: 'banner-error-save-failed',
    async setup(open) {
      const host = await open('host');
      await armStorageFailure(host);
      await createRoom(host, HOST);
      await startSession(host);
      await completeSession(host);
      await host.evaluate(() => {
        (window as unknown as { __parityStorage: { failing: boolean } }).__parityStorage.failing = true;
      });
      await host.getByRole('button', { name: /記録を保存/ }).click();
      return host;
    },
    marker: (p) => p.getByRole('alert').filter({ hasText: '記録の保存に失敗しました' }),
    minElements: 30,
    mask: roomMask,
  },
  {
    name: 'summary-complete',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await startSession(host);
      await completeSession(host);
      return host;
    },
    marker: (p) => p.getByLabel('達成'),
    minElements: 30,
    mask: roomMask,
  },
  {
    name: 'summary-abort',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await startSession(host);
      await host.getByRole('button', { name: /途中で終える/ }).click();
      await host.getByRole('button', { name: '終える（記録なし）' }).click();
      return host;
    },
    marker: (p) => p.getByRole('heading', { name: 'セッション終了（中断）' }),
    minElements: 20,
    mask: roomMask,
  },
  {
    name: 'history-empty',
    async setup(open) {
      const page = await open('host');
      await page.goto('/timer/?view=history');
      return page;
    },
    marker: (p) => p.getByRole('heading', { name: '完了記録の履歴' }),
    minElements: 15,
    mask: () => [],
  },
  {
    name: 'history-with-record',
    async setup(open) {
      const host = await open('host');
      await createRoom(host, HOST);
      await startSession(host);
      await completeSession(host);
      await host.getByRole('button', { name: /記録を保存/ }).click();
      await host.goto('/timer/?view=history');
      return host;
    },
    marker: (p) => p.getByRole('heading', { name: '完了記録の履歴' }),
    minElements: 20,
    mask: (p) => [p.locator('time')],
  },
  {
    name: 'loading-unreachable',
    async setup(open) {
      const page = await open('host');
      await page.routeWebSocket(/\/ws\?.*\btool=timer\b/, (ws) => void ws.close());
      await page.goto('/timer/?room=PARITY-UNREACHABLE');
      return page;
    },
    marker: (p) => p.getByLabel('接続状態'),
    minElements: 10,
    mask: () => [],
  },
  {
    name: 'status-strip-lobby',
    async setup(open) {
      const host = await open('host');
      await createRoom(host, HOST);
      await expect(statusStrip(host)).toContainText('ロビー');
      return host;
    },
    marker: (p) => statusStrip(p),
    minElements: 60,
    mask: roomMask,
  },
];
```

**目印・操作の名前は実画面で確かめる。** 上の名前は `apps/timer-web/src` の `aria-label` と既存の spec から取った。Step 4 で目印が見つからない状態があれば、その状態の作り方を実画面（`TASUKI_E2E_TARGET=local` の dev か `--headed`）で確かめて直す。ルームが無いときの Loading（`loading-unreachable`）は玄関へ送られる可能性がある（ルームコードの無い timer は玄関へ送る）。送られたら、`createRoom` の後に接続を閉じる形（`banner-warn-reconnecting` と同じ）へ変え、目印を接続状態の表示にする。**作れない状態が残ったら、その状態を目録から外さずに作業を止め、利用者に報告する**（設計正本 §5.5）。SessionLost は `timer.spec.ts` の `armRoomLoss` と同じ差し込みで作る状態として Step 3 の後に足す（`timer.spec.ts:639-700` を写し、目印は「セッションが見つかりません」の見出し）。

- [ ] **Step 3: 比較の本体を書く**

`e2e/parity/timer.parity.ts`:

```ts
/**
 * 基準（`ba9249d`）とブランチを状態ごと・幅ごとに並べる（#321・設計正本 §5）。
 *
 * 1 つの状態につき、側ごとに新しいブラウザの文脈で状態を 1 回作り、幅を変えながら撮る（計画 P2）。
 * 読み方は 2 通り: `no-preference` で動きのプロパティとキーフレーム、`reduce` で全プロパティと画素。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { BASE_DIST, serveBaseDist, type BaseServing } from './base-dist';
import { captureKeyframes, captureMotion, captureStyles } from './capture';
import { diffEntries, diffKeyframes, themeVarNamesFromCss, type StyleDiff, type StyleEntry } from './compare-lib';
import { NOISE } from './noise';
import { STATES, WIDTHS, type ParityState } from './states';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const HEIGHT = 900;

type Side = 'base' | 'branch';

interface Capture {
  readonly styles: Map<number, StyleEntry[]>;
  readonly screenshots: Map<number, Buffer>;
  readonly motion: StyleEntry[];
  readonly keyframes: Record<string, string>;
}

/** 基準の dist の CSS から、Tailwind の theme 層の変数の名簿を導く（§5.4 の類 1）。 */
function tailwindThemeVars(): Set<string> {
  const assets = path.join(BASE_DIST, 'assets');
  const css = readdirSync(assets).filter((f) => f.endsWith('.css'));
  const names = new Set<string>();
  for (const f of css) for (const n of themeVarNamesFromCss(readFileSync(path.join(assets, f), 'utf8'))) names.add(n);
  if (names.size === 0) throw new Error('基準の dist から Tailwind の theme 層の変数を 1 つも読めませんでした');
  return names;
}

async function captureSide(browser: Browser, state: ParityState, side: Side): Promise<Capture> {
  const contexts: BrowserContext[] = [];
  const servings: BaseServing[] = [];
  const open = async (): Promise<Page> => {
    const context = await browser.newContext({ viewport: { width: 1280, height: HEIGHT }, reducedMotion: 'no-preference' });
    if (side === 'base') servings.push(await serveBaseDist(context, BASE_DIST));
    contexts.push(context);
    return context.newPage();
  };
  try {
    const page = await state.setup(open);
    await expect(state.marker(page), `${state.name}（${side}）の目印`).toBeVisible();
    if (side === 'base') {
      const served = servings.reduce((n, s) => n + s.served(), 0);
      expect(served, `${state.name}: 基準の dist から 1 件も返していない`).toBeGreaterThan(0);
      expect(servings.flatMap((s) => s.missing()), `${state.name}: 基準の dist に無い資産を読もうとした`).toEqual([]);
    }

    // 1. no-preference: 動きのプロパティとキーフレーム（静的な値なので揺れない）
    const motion = await captureMotion(page);
    const keyframes = await captureKeyframes(page);

    // 2. reduce: 全プロパティと画素（遷移の途中の値と動く要素の揺れを止める）
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const styles = new Map<number, StyleEntry[]>();
    const screenshots = new Map<number, Buffer>();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: HEIGHT });
      await expect(state.marker(page)).toBeVisible();
      const entries = await captureStyles(page);
      expect(entries.length, `${state.name}@${width}（${side}）の要素数`).toBeGreaterThanOrEqual(state.minElements);
      styles.set(width, entries);
      screenshots.set(
        width,
        await page.screenshot({ fullPage: true, animations: 'disabled', mask: state.mask(page) }),
      );
    }
    return { styles, screenshots, motion, keyframes };
  } finally {
    for (const c of contexts) await c.close();
  }
}

const themeVars = tailwindThemeVars();

for (const state of STATES) {
  test(`${state.name}: 基準とブランチが一致する`, async ({ browser }, testInfo) => {
    const base = await captureSide(browser, state, 'base');
    const branch = await captureSide(browser, state, 'branch');

    const options = { tailwindThemeVars: themeVars, ignore: NOISE };
    const report: Record<string, StyleDiff[] | string[]> = {
      motion: diffEntries(base.motion, branch.motion, options),
      keyframes: diffKeyframes(base.keyframes, branch.keyframes),
    };
    for (const width of WIDTHS) {
      report[`styles@${width}`] = diffEntries(base.styles.get(width) ?? [], branch.styles.get(width) ?? [], options);
    }
    const dir = path.join(OUT, state.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'diff.json'), JSON.stringify(report, null, 2));

    // 画素: 基準の画像を snapshot の置き場へ書き、ブランチの画像を照合する（maxDiffPixels: 0）
    for (const width of WIDTHS) {
      const name = `${state.name}-${width}.png`;
      const snapshot = testInfo.snapshotPath(name);
      mkdirSync(path.dirname(snapshot), { recursive: true });
      writeFileSync(snapshot, base.screenshots.get(width) ?? Buffer.alloc(0));
      expect.soft(branch.screenshots.get(width), `画素 ${name}`).toMatchSnapshot(name, { maxDiffPixels: 0 });
    }

    const total = Object.values(report).reduce((n, list) => n + list.length, 0);
    expect(total, `${state.name} の差（${path.join(dir, 'diff.json')}）`).toBe(0);
  });
}
```

- [ ] **Step 4: 流して、目印と基準の配り方を確かめる**

Run:

```bash
cd /workspaces/claym/local/Tasuki/e2e
TASUKI_E2E_TARGET=local TASUKI_PARITY_BASE_DIST=$HOME/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist \
  pnpm exec playwright test -c parity/parity.config.ts 2>&1 | tee /tmp/claude-parity-run1.log
grep -cE "✓|passed" /tmp/claude-parity-run1.log; ss -tlnp | grep -E ':(8787|18080)\b' || echo PORTS-FREE
```

Expected: 各状態で目印が見つかる（見つからない状態は Step 2 の注記に従って直す）。**差が出るのは雑音**（ルームコードの字幅・残り時間など）で、Task 6 で名指しする。`PORTS-FREE`

この段階では差が出てもコミットしてよい（Task 6 で 0 件にする）。

- [ ] **Step 5: 型検査・lint を通し、コミットして push する**

Run: `cd e2e && pnpm typecheck && pnpm lint`

```bash
git add e2e/parity/states.ts e2e/parity/noise.ts e2e/parity/timer.parity.ts
git commit -F - <<'EOF'
test: timer の状態の目録と、基準と並べる比較の本体を足す（#321 PR 1）

- 状態ごとに目印と要素数の下限を断定してから書き出す
- no-preference で動き・キーフレーム、reduce で全プロパティと画素を比べる
- 幅は状態を 1 回作ってから変えて撮る

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git push
```

---

### Task 5: 操作の状態（ホバー・フォーカス・押下）とタッチの 1 本

**Files:**
- Create: `e2e/parity/interaction.ts`
- Modify: `e2e/parity/timer.parity.ts`（操作の比較と、タッチの 1 本を足す）

**Interfaces:**
- Consumes: `captureElement`（Task 3）、`diffEntries`（Task 2）、`STATES`（Task 4）
- Produces: `captureInteractions(page: Page): Promise<InteractionCapture>`、`interface InteractionCapture { readonly entries: StyleEntry[]; readonly notEntered: string[] }`（道筋に `#hover` / `#focus-visible` / `#active` を付けた書き出しと、状態に入れなかった要素）

- [ ] **Step 1: 操作の書き出しを書く**

`e2e/parity/interaction.ts`:

```ts
/**
 * 操作の状態の書き出し（#321・設計正本 §5.2）。**状態に入れたことを断定する**（入れなかった要素は `notEntered` に出す）。
 *
 * - ホバー: `locator.hover()` の後に `:hover` を確かめる
 * - フォーカス: Tab で順に送り、`:focus-visible` の要素を書き出す（キーボードで送るので `:focus-visible` の条件を満たす）
 * - 押下: `mouse.down()` → `:active` を確かめて書き出す → **要素の外へ動かしてから** `mouse.up()`（クリックを起こさない）
 */
import type { Page } from '@playwright/test';
import { captureElement } from './capture';
import type { StyleEntry } from './compare-lib';

export interface InteractionCapture {
  readonly entries: StyleEntry[];
  readonly notEntered: string[];
}

const TARGETS = 'button, a[href], [role="tab"], input, textarea, select, [tabindex]:not([tabindex="-1"])';

function tag(entries: readonly StyleEntry[], kind: string): StyleEntry[] {
  return entries.map((e) => ({ ...e, path: `${e.path}#${kind}` }));
}

export async function captureInteractions(page: Page): Promise<InteractionCapture> {
  const entries: StyleEntry[] = [];
  const notEntered: string[] = [];
  const targets = page.locator(TARGETS).filter({ visible: true });
  const count = await targets.count();

  for (let i = 0; i < count; i += 1) {
    const el = targets.nth(i);
    const label = (await el.getAttribute('aria-label')) ?? (await el.innerText()).slice(0, 20);
    await el.hover();
    if (await el.evaluate((e) => e.matches(':hover'))) entries.push(...tag(await captureElement(el), 'hover'));
    else notEntered.push(`hover: ${label}`);

    if (await el.isEnabled()) {
      await page.mouse.down();
      if (await el.evaluate((e) => e.matches(':active'))) entries.push(...tag(await captureElement(el), 'active'));
      else notEntered.push(`active: ${label}`);
      await page.mouse.move(0, 0);
      await page.mouse.up();
    }
  }
  await page.mouse.move(0, 0);

  // フォーカス: 文書の先頭から Tab で送る
  await page.locator('body').evaluate((b) => (b as HTMLElement).focus());
  for (let i = 0; i < count + 5; i += 1) {
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    if ((await focused.count()) === 0) continue;
    if (await focused.evaluate((e) => e.matches(':focus-visible'))) {
      entries.push(...tag(await captureElement(focused), 'focus-visible'));
    } else {
      notEntered.push(`focus-visible: ${await focused.evaluate((e) => e.outerHTML.slice(0, 60))}`);
    }
  }
  return { entries, notEntered };
}
```

- [ ] **Step 2: 比較の本体に操作とタッチを足す**

`e2e/parity/timer.parity.ts` の先頭に `import { captureInteractions, type InteractionCapture } from './interaction';` を足す。`Capture` に `readonly interactions: InteractionCapture` を足し、`captureSide` の reduce の読みの**前**（1280px のまま）で `captureInteractions(page)` を呼ぶ。比較に次を足す:

```ts
report['interactions'] = diffEntries(base.interactions.entries, branch.interactions.entries, options);
report['notEntered'] = [
  ...base.interactions.notEntered.map((s) => `base ${s}`),
  ...branch.interactions.notEntered.map((s) => `branch ${s}`),
];
```

`notEntered` は差の件数に含める（状態に入れなかった要素があれば赤）。**基準とブランチで同じ要素が入れなかった場合も赤にする** —— 入れなかった理由（要素が隠れている・無効）を確かめ、`captureInteractions` の対象から外す判断は台帳に書く。

ファイルの末尾に、タッチの 1 本を足す（設計正本 §5.5。`(hover: hover)` が偽になる）:

```ts
const TOUCH_STATES = new Set(['lobby-two', 'session-driver']);

for (const state of STATES.filter((s) => TOUCH_STATES.has(s.name))) {
  test(`${state.name}（タッチ・360px）: 基準とブランチが一致する`, async ({ browser }) => {
    const run = async (side: Side): Promise<StyleEntry[]> => {
      const contexts: BrowserContext[] = [];
      const open = async (): Promise<Page> => {
        const context = await browser.newContext({ viewport: { width: 360, height: HEIGHT }, hasTouch: true, reducedMotion: 'reduce' });
        if (side === 'base') await serveBaseDist(context, BASE_DIST);
        contexts.push(context);
        return context.newPage();
      };
      try {
        const page = await state.setup(open);
        await expect(state.marker(page)).toBeVisible();
        expect(await page.evaluate(() => matchMedia('(hover: hover)').matches), 'タッチの文脈で hover が真').toBe(false);
        const { entries } = await captureInteractions(page);
        return [...(await captureStyles(page)), ...entries];
      } finally {
        for (const c of contexts) await c.close();
      }
    };
    const diffs = diffEntries(await run('base'), await run('branch'), { tailwindThemeVars: themeVars, ignore: NOISE });
    const dir = path.join(OUT, `${state.name}-touch`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'diff.json'), JSON.stringify(diffs, null, 2));
    expect(diffs.length, `${state.name}（タッチ）の差`).toBe(0);
  });
}
```

- [ ] **Step 3: 流して、状態に入れない要素を確かめる**

Run: Task 4 の Step 4 と同じコマンド（`tee /tmp/claude-parity-run2.log`）
Expected: `notEntered` が空。空でなければ、入れなかった要素を 1 件ずつ見る（覆いの下に隠れている・画面外で hover できない など）。`el.scrollIntoViewIfNeeded()` で直るものは直し、直らないものは対象から外す理由を台帳（Task 13）に書く

- [ ] **Step 4: 型検査・lint を通し、コミットして push する**

```bash
git add e2e/parity/interaction.ts e2e/parity/timer.parity.ts
git commit -F - <<'EOF'
test: 操作の状態とタッチの 1 本を比較に足す（#321 PR 1）

- ホバー・押下・フォーカスは状態に入れたことを断定してから書き出す
- 入れなかった要素は差として出す
- タッチの文脈では (hover: hover) が偽であることを確かめる

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git push
```

---

### Task 6: 対照実行で雑音を名指しし、PR 1 の差を 0 件にする

**Files:**
- Modify: `e2e/parity/noise.ts`

**Interfaces:**
- Produces: `NOISE`（理由つきの除外）

- [ ] **Step 1: 基準同士を比べる（対照実行）**

ブランチの側にも基準の dist を配る一時的な環境変数を使う。`timer.parity.ts` の `captureSide` で `side === 'base'` の条件を `side === 'base' || process.env['TASUKI_PARITY_CONTROL'] === '1'` にする（**この 1 行は残す** —— PR 2〜4 の対照実行でも使う）。

```bash
cd /workspaces/claym/local/Tasuki/e2e
TASUKI_PARITY_CONTROL=1 TASUKI_E2E_TARGET=local TASUKI_PARITY_BASE_DIST=$HOME/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist \
  pnpm exec playwright test -c parity/parity.config.ts 2>&1 | tee /tmp/claude-parity-control1.log
```

Expected: 差が出るのは、部屋ごと・時刻ごとに変わる値だけ（ルームコードや招待 URL の字幅による `width` / `inline-size` / `block-size`、経過時間の `stroke-dashoffset` など）

- [ ] **Step 2: 揺れた値を 1 件ずつ名指しする**

`e2e/parity/out/*/diff.json` を読み、揺れた `(道筋, プロパティ)` を `NOISE` に足す。**道筋は正規表現でその要素だけに絞り、プロパティも名指しする**（`.*` で広げない）。1 件ずつ `reason` に何が揺らすのかを書く。例:

```ts
{ path: /^html>body>div:nth-of-type\(1\)>div:nth-of-type\(1\)>…$/, prop: /^(width|inline-size)$/, reason: 'ルームコードの字幅（部屋ごとに変わる）' },
```

- [ ] **Step 3: 対照実行をもう 1 度流し、差 0 件を確かめる**

Run: Step 1 のコマンド（`tee /tmp/claude-parity-control2.log`）
Expected: 全件 PASS。2 回目で新しく揺れた値があれば Step 2 に戻る

- [ ] **Step 4: ブランチと比べて差 0 件を確かめる**

Run: Task 4 の Step 4 のコマンド（`TASUKI_PARITY_CONTROL` を付けない）
Expected: 全件 PASS（PR 1 は見た目を移していないので、差は 0 件）。差が出たら Task 1 の分割を疑い、`diff.json` の差を読んで直す

- [ ] **Step 5: コミットして push する**

```bash
git add e2e/parity/noise.ts e2e/parity/timer.parity.ts
git commit -F - <<'EOF'
test: 対照実行で揺れる値を名指しし、PR 1 の差が 0 件であることを確かめる（#321 PR 1）

- 基準同士を 2 回比べ、部屋ごと・時刻ごとに変わる値だけを理由つきで除いた
- ブランチとの差は 0 件（index.css の分割は見た目を変えていない）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git push
```

---

### Task 7: 比較の仕組みを壊して赤を見る（破壊検証・コミットしない）

**Files:** 一時的な変更のみ（最後に戻す）

- [ ] **Step 1: 作業ツリーが clean であることを確かめる**

Run: `git status --porcelain`
Expected: 出力なし

- [ ] **Step 2: 5 つの壊し方を 1 つずつ当て、該当の物差しが赤になることを見る**

それぞれ当てて流し、赤を確かめてから `git checkout -- <そのファイル>` で戻す（**戻す前に `git status --porcelain` で、壊したファイル以外が変わっていないことを見る**）。ビルドを伴う壊し方は、流す前に `pnpm exec turbo run build --filter @tasuki/timer-web` を通す（ハーネスの `globalSetup` もビルドするが、確認のため明示する）。

| # | 壊し方（ブランチの側） | 赤になるべき物差し |
|---|---|---|
| 1 | `styles/base.css` の `.instrument-label` の `letter-spacing: 0.18em` を `0.19em` にする | 静止（`styles@*`）と画素 |
| 2 | `styles/base.css` の `.instrument-stage::before` の `background-size` を `41px 41px, 40px 40px, 100% 100%` にする | 静止の擬似要素（`::before`） |
| 3 | `styles/base.css` の `.boot-reveal` の `0.5s` を `0.6s` にする | 動き（`motion`） |
| 4 | `styles/base.css` の `@keyframes fade-up` の `translateY(20px)` を `translateY(21px)` にする | キーフレーム（`keyframes`） |
| 5 | `states.ts` の `lobby-alone` の `setup` から `createRoom` を外し、`host.goto('/')` だけにする | 目印の断定（状態を作り損ねた） |

Run（各回）: Task 4 の Step 4 のコマンドを、対象の状態に絞って流す（`-g lobby-alone` など）
Expected: 表の物差しで FAIL

- [ ] **Step 3: 戻したことを確かめる**

Run: `git status --porcelain && ss -tlnp | grep -E ':(8787|18080)\b' || echo PORTS-FREE`
Expected: 出力なし（作業ツリー）と `PORTS-FREE`

結果（どの壊し方がどの物差しで赤になったか）は Task 13 の台帳に書く。コミットはしない。

---

### Task 8: 除去検査（効いていないクラスを見つける）

**Files:**
- Create: `e2e/parity/removal-probe.ts`
- Create: `e2e/parity/removal.parity.ts`

**Interfaces:**
- Consumes: `STATES`・`WIDTHS`（Task 4）、`serveBaseDist`・`BASE_DIST`（Task 3）
- Produces: `e2e/parity/out/removal-probe.json`（`{ dead: ProbeHit[]; alive: ProbeHit[]; undecided: ProbeHit[] }`、`interface ProbeHit { readonly state: string; readonly path: string; readonly className: string; readonly token: string; readonly widths?: number[] }`）。PR 2・3 が「写さないクラス」を決めるのに使う

- [ ] **Step 1: ブラウザ側の除去の本体を書く**

`e2e/parity/removal-probe.ts`:

```ts
/**
 * 除去検査（#321・設計正本 D2・計画 P6）。基準のページで要素のクラスを 1 つずつ外し、
 * 計算済みスタイルが変わらなければ、そのクラスの宣言は死んでいる。
 *
 * 比べる範囲: 要素自身の全プロパティ・直下の子の全プロパティ・それより深い子孫の継承するプロパティ（計画 P6）。
 */
import type { Page } from '@playwright/test';

/** 状態の変種。これを含むクラスは、要素をその状態に入れたときだけ判定する（計画 P6）。 */
export const STATE_VARIANT = /(?:^|:)(?:group-|peer-)?(hover|focus|focus-visible|focus-within|active|disabled|checked|open):/;

export interface ProbeResult {
  readonly path: string;
  readonly className: string;
  readonly token: string;
  readonly changed: boolean;
}

/** 静止状態で、状態の変種を持たないクラスを判定する。**自己完結させる**。 */
export async function probeRest(page: Page): Promise<ProbeResult[]> {
  return page.evaluate((stateVariantSource) => {
    const stateVariant = new RegExp(stateVariantSource);
    const INHERITED = [
      'color', 'font-family', 'font-size', 'font-style', 'font-weight', 'font-variant-numeric', 'letter-spacing',
      'line-height', 'text-align', 'text-transform', 'text-indent', 'white-space', 'word-spacing', 'visibility',
      'cursor', 'direction', 'list-style-type', 'text-shadow', '-webkit-font-smoothing', 'text-wrap',
    ];
    const pathOf = (el: Element): string => {
      const parts: string[] = [];
      let cur: Element | null = el;
      while (cur !== null) {
        const parent: Element | null = cur.parentElement;
        const tagName = cur.tagName;
        if (parent === null) {
          parts.unshift(tagName.toLowerCase());
          break;
        }
        const same = Array.from(parent.children).filter((c) => c.tagName === tagName);
        parts.unshift(`${tagName.toLowerCase()}:nth-of-type(${same.indexOf(cur) + 1})`);
        cur = parent;
      }
      return parts.join('>');
    };
    const all = (el: Element): string => {
      const cs = getComputedStyle(el);
      const out: string[] = [];
      for (let i = 0; i < cs.length; i += 1) {
        const n = cs.item(i);
        if (!n.startsWith('--')) out.push(`${n}:${cs.getPropertyValue(n)}`);
      }
      return out.join(';');
    };
    const inherited = (el: Element): string => {
      const cs = getComputedStyle(el);
      return INHERITED.map((n) => cs.getPropertyValue(n)).join(';');
    };
    const signature = (el: Element): string => {
      const parts = [all(el)];
      for (const child of Array.from(el.children)) parts.push(all(child));
      for (const deep of Array.from(el.querySelectorAll(':scope > * *'))) parts.push(inherited(deep));
      return parts.join('|');
    };
    const results: ProbeResult[] = [];
    for (const el of Array.from(document.body.querySelectorAll('[class]'))) {
      const className = el.getAttribute('class') ?? '';
      const before = signature(el);
      for (const token of Array.from(el.classList)) {
        if (stateVariant.test(token)) continue;
        el.classList.remove(token);
        const after = signature(el);
        el.setAttribute('class', className);
        results.push({ path: pathOf(el), className, token, changed: before !== after });
      }
    }
    return results;
  }, STATE_VARIANT.source);
}
```

状態の変種を持つクラスの判定は Step 2 の本体で行う（要素を Playwright で状態に入れてから、その要素自身の全プロパティだけを比べる）。

- [ ] **Step 2: 除去検査の本体を書く**

`e2e/parity/removal.parity.ts`:

```ts
/**
 * 除去検査を基準のページで全状態・全幅に当て、死んでいるクラスの一覧を書き出す（#321・設計正本 D2）。
 *
 * - 状態の変種を持たないクラス: 全幅で「外しても変わらない」ときだけ死んでいる（1 幅でも変われば生きている）
 * - 状態の変種を持つクラス: `hover` / `group-hover` はホバー、`focus*` はキーボードでのフォーカス、`active` は押下、
 *   `disabled` / `checked` / `open` はいまその状態のときだけ判定する。入れられなければ「未判定」
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { BASE_DIST, serveBaseDist } from './base-dist';
import { probeRest, STATE_VARIANT, type ProbeResult } from './removal-probe';
import { STATES, WIDTHS } from './states';

interface ProbeHit {
  readonly state: string;
  readonly path: string;
  readonly className: string;
  readonly token: string;
  readonly widths?: number[];
}

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const dead: ProbeHit[] = [];
const alive: ProbeHit[] = [];
const undecided: ProbeHit[] = [];

/** その要素自身の全プロパティ（カスタムプロパティを除く）。 */
async function ownSignature(el: Locator): Promise<string> {
  return el.evaluate((e) => {
    const cs = getComputedStyle(e);
    const out: string[] = [];
    for (let i = 0; i < cs.length; i += 1) {
      const n = cs.item(i);
      if (!n.startsWith('--')) out.push(`${n}:${cs.getPropertyValue(n)}`);
    }
    return out.join(';');
  });
}

/** 要素を状態に入れる。入れられたら true。 */
async function enterState(page: Page, el: Locator, variant: string): Promise<boolean> {
  if (variant === 'hover') {
    await el.hover();
    return el.evaluate((e) => e.matches(':hover'));
  }
  if (variant.startsWith('focus')) {
    await page.keyboard.press('Shift');
    await el.focus();
    return el.evaluate((e) => e.matches(':focus-visible') || e.matches(':focus-within'));
  }
  if (variant === 'active') {
    await el.hover();
    await page.mouse.down();
    return el.evaluate((e) => e.matches(':active'));
  }
  return el.evaluate((e, v) => e.matches(`:${v}`), variant);
}

async function leaveState(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.locator('body').evaluate((b) => (b as HTMLElement).focus());
}

for (const state of STATES) {
  test(`除去検査: ${state.name}`, async ({ browser }) => {
    const contexts: BrowserContext[] = [];
    const open = async (): Promise<Page> => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
      await serveBaseDist(context, BASE_DIST);
      contexts.push(context);
      return context.newPage();
    };
    try {
      const page = await state.setup(open);
      await expect(state.marker(page)).toBeVisible();

      // 1. 状態の変種を持たないクラス: 全幅で判定する
      const byKey = new Map<string, { hit: ProbeResult; changedAt: number[] }>();
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        for (const r of await probeRest(page)) {
          const key = `${r.path}\u0000${r.token}`;
          const entry = byKey.get(key) ?? { hit: r, changedAt: [] };
          if (r.changed) entry.changedAt.push(width);
          byKey.set(key, entry);
        }
      }
      for (const { hit, changedAt } of byKey.values()) {
        const record = { state: state.name, path: hit.path, className: hit.className, token: hit.token, widths: changedAt };
        (changedAt.length === 0 ? dead : alive).push(record);
      }

      // 2. 状態の変種を持つクラス: 1280px で状態に入れて判定する
      await page.setViewportSize({ width: 1280, height: 900 });
      const variantTargets = await page.evaluate((src) => {
        const re = new RegExp(src);
        return Array.from(document.body.querySelectorAll('[class]')).flatMap((el, index) =>
          Array.from(el.classList)
            .filter((t) => re.test(t))
            .map((token) => ({ index, token, className: el.getAttribute('class') ?? '' })),
        );
      }, STATE_VARIANT.source);
      const all = page.locator('body [class]');
      for (const t of variantTargets) {
        const el = all.nth(t.index);
        const variant = STATE_VARIANT.exec(t.token)?.[1] ?? '';
        const path = await el.evaluate((e) => e.tagName.toLowerCase() + (e.id ? `#${e.id}` : ''));
        const record = { state: state.name, path, className: t.className, token: t.token };
        if (!(await el.isVisible()) || !(await enterState(page, el, variant))) {
          undecided.push(record);
          await leaveState(page);
          continue;
        }
        const before = await ownSignature(el);
        await el.evaluate((e, token) => e.classList.remove(token), t.token);
        const after = await ownSignature(el);
        await el.evaluate((e, cls) => e.setAttribute('class', cls), t.className);
        (before === after ? dead : alive).push(record);
        await leaveState(page);
      }
    } finally {
      for (const c of contexts) await c.close();
    }
  });
}

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, 'removal-probe.json'), JSON.stringify({ dead, alive, undecided }, null, 2));
});
```

- [ ] **Step 3: 流して、既知の答えと突き合わせる**

Run:

```bash
cd /workspaces/claym/local/Tasuki/e2e
TASUKI_E2E_TARGET=local TASUKI_PARITY_BASE_DIST=$HOME/.cache/tasuki-parity/base-ba9249d/apps/timer-web/dist \
  pnpm exec playwright test -c parity/parity.config.ts removal 2>&1 | tee /tmp/claude-parity-removal.log
node -e '
const r = require("./parity/out/removal-probe.json");
const has = (list, cls, tok) => list.some((h) => h.className.includes(cls) && h.token === tok);
const checks = [
  ["dead", "instrument-label", "text-[var(--signal)]"],
  ["dead", "px-6", "px-3"],
  ["dead", "px-6", "py-1.5"],
  ["alive", "p-6", "sm:p-4"],
  ["alive", "instrument-label", "instrument-label"],
];
for (const [kind, cls, tok] of checks) console.log(kind, tok, has(r[kind], cls, tok) ? "OK" : "NG");
console.log("dead", r.dead.length, "alive", r.alive.length, "undecided", r.undecided.length);
'
```

Expected: 5 行とも `OK`（正本 §2 の 4・5 の既知の答え: `.instrument-label` と同じ要素の色、`PrimaryButton` への `px-3` / `py-1.5` は死んでいる。`Card` への `sm:p-4` は 640〜767px で生きている）。`NG` があれば除去検査を疑い、直してから進む。`focus-visible:outline-none` が `dead` に入っていることも見る（グローバルの `:focus-visible` に負けている）

- [ ] **Step 4: コミットして push する**

```bash
git add e2e/parity/removal-probe.ts e2e/parity/removal.parity.ts
git commit -F - <<'EOF'
test: 効いていないクラスを見つける除去検査を足す（#321 PR 1）

- 基準のページでクラスを 1 つずつ外し、全幅で計算済みスタイルが変わらなければ死んでいると判定する
- 状態の変種は要素をその状態に入れたときだけ判定し、入れられなければ未判定として出す
- 既知の答え（instrument-label の色・PrimaryButton への px-3 など）と一致することを確かめた

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git push
```

---

### Task 9: 使い手の無いアニメーションの規則を消す

**Files:**
- Modify: `apps/timer-web/src/styles/base.css`（`.animate-confetti`・`.animate-shake`・`.animate-pulse-fast` と、それだけが使う `@keyframes confetti-fall`・`shake`・`pulse-fast`）

- [ ] **Step 1: 使い手が 0 件であることを確かめる**

Run: `git grep -nE "animate-(confetti|shake|pulse-fast)|confetti-fall|pulse-fast" -- apps/timer-web/src ':!apps/timer-web/src/styles/base.css'`
Expected: 出力なし。**出力があれば消さない**（この Task を飛ばし、台帳に理由を書く）

- [ ] **Step 2: 規則とキーフレームを消す**

`base.css` から次の 6 つを消す: `@keyframes confetti-fall`・`.animate-confetti`・`@keyframes shake`・`.animate-shake`・`@keyframes pulse-fast`・`.animate-pulse-fast`。直前の見出しの注釈「交代の shake/pulse・要素の fade-up/pop-in・confetti。」は「要素の fade-up/pop-in。」に直す（**消した記号を名指しする注釈を残さない**）。

Run: `git grep -nE "confetti|shake|pulse-fast" -- apps/timer-web`
Expected: 出力なし

- [ ] **Step 3: 比較を流し、差 0 件を確かめる**

Run: Task 4 の Step 4 のコマンド
Expected: 全件 PASS

- [ ] **Step 4: コミットして push する**

```bash
git add apps/timer-web/src/styles/base.css
git commit -F - <<'EOF'
refactor: timer の使い手の無いアニメーションの規則を消す（#321 PR 1）

- animate-confetti / animate-shake / animate-pulse-fast とそのキーフレームは使い手が 0 件だった
- 基準と並べた比較で差 0 件を確かめた

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git push
```

---

### Task 10: クラス名の恒久の検査（テストが先）

**Files:**
- Create: `scripts/audit-timer-classes.mjs`
- Create: `scripts/audit-timer-classes.test.mjs`
- Create: `scripts/mutations/m115-timer-classes-template-accepted.patch`
- Create: `scripts/mutations/m116-timer-classes-stale-unmigrated.patch`
- Create: `scripts/mutations/m117-timer-classes-tailwind-collision.patch`
- Modify: `scripts/mutation-check.mjs`（`MUTATIONS` の末尾に 3 件）
- Modify: `.github/workflows/ci.yml`（`audit-ui-components` の次に 1 ステップ）
- Modify: `docs/guides/development.md:775` の次（検査の一覧に 1 行）

**Interfaces:**
- Produces（`scripts/audit-timer-classes.mjs`）:
  - `UNMIGRATED: readonly string[]`（まだ移していないファイル。PR 2・3 で減り、PR 4 で空にして消す）
  - `KNOWN_COLLISIONS: ReadonlyMap<string, string>`（Tailwind のユーティリティ名と重なることを許すクラス名と理由）
  - `classUsagesIn(fileName: string, text: string): { classes: {name: string, line: number}[], problems: {line: number, message: string}[] }`
  - `cssClassNames(text: string): Set<string>`
  - `checkTimerClasses(input): string[]`（`input = { sources: {rel, text}[], timerCss: {rel, text}[], componentCss: {rel, text}[], elementCss: {rel, text}[], unmigrated: readonly string[], collisions: ReadonlyMap<string, string>, isTailwindUtility: (name: string) => boolean }`）
  - `loadTailwindDetector(repoRoot?: string): Promise<(name: string) => boolean>`

- [ ] **Step 1: 失敗するテストを書く**

`scripts/audit-timer-classes.test.mjs`:

```js
/**
 * `audit-timer-classes.mjs` の自己テスト（#321・設計正本 D1・D10）。
 *
 * **逃げ道の族を全部ここへ置く**: テンプレートの置換・連結・関数の呼び出し・`_CLASS` で終わらない表・
 * `.ts` の表・一覧に残ったまま移したファイル・Tailwind と同名のクラス。
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { checkTimerClasses, classUsagesIn, cssClassNames } from "./audit-timer-classes.mjs";

const messages = (text, file = "apps/timer-web/src/ui/X.tsx") => classUsagesIn(file, text).problems.map((p) => p.message);
const names = (text, file = "apps/timer-web/src/ui/X.tsx") => classUsagesIn(file, text).classes.map((c) => c.name);

describe("classUsagesIn: 許した書き方（設計正本 D1）", () => {
  const allowed = [
    ['<p className="a b" />', ["a", "b"], "文字列リテラル"],
    ["<p className={\"a\"} />", ["a"], "式の中の文字列リテラル"],
    ["<p className={`a b`} />", ["a", "b"], "置換の無いテンプレート"],
    ['<p className={on ? "a" : "b c"} />', ["a", "b", "c"], "字面の分岐"],
    ['<p className={on ? (x ? "a" : "b") : "c"} />', ["a", "b", "c"], "入れ子の分岐"],
    ["<p className={TONE_CLASS[kind]} />", [], "_CLASS の表を引く"],
    ["<p className={TONE_CLASS.online} />", [], "_CLASS の表のプロパティ"],
    ["<p className={className} />", [], "部品の受け渡し"],
    ["<p className={`card ${className}`} />", ["card"], "部品の受け渡しと字面の組み合わせ"],
    ['const TONE_CLASS = { online: "ok", lost: "ng x" } as const;', ["ok", "ng", "x"], "_CLASS の表の値"],
  ];
  for (const [src, expected, why] of allowed) {
    test(`${why}: ${src}`, () => {
      assert.deepEqual(messages(src), []);
      assert.deepEqual(names(src).sort(), [...expected].sort());
    });
  }
});

describe("classUsagesIn: 許さない書き方", () => {
  const rejected = [
    ["<p className={`a ${tone}`} />", "className 以外の置換"],
    ['<p className={"a " + tone} />', "連結"],
    ["<p className={cls(tone)} />", "関数の呼び出し"],
    ["<p className={tone} />", "className 以外の変数"],
    ["<p className={TONE[kind]} />", "_CLASS で終わらない表"],
    ['<p className={on && "a"} />', "論理式"],
    ['const TONE_CLASS = { online: `a ${x}` } as const;', "_CLASS の表の値に置換"],
    ["const TONE_CLASS = { online: pick() } as const;", "_CLASS の表の値に呼び出し"],
  ];
  for (const [src, why] of rejected) {
    test(`${why}: ${src}`, () => {
      assert.equal(messages(src).length, 1, `${why} を見逃した`);
    });
  }
  test(".ts の _CLASS の表も見る", () => {
    assert.equal(messages('const A_CLASS = { x: `a ${y}` } as const;', "apps/timer-web/src/ui/presence.ts").length, 1);
  });
});

describe("cssClassNames: timer の CSS が定義するクラス名", () => {
  test("子孫・擬似クラス・@media の中・エスケープを拾う", () => {
    const css = ".a .b:hover{} @media (width>=40rem){.c{}} .px-1\\.5{} @keyframes k{50%{opacity:.5}}";
    assert.deepEqual([...cssClassNames(css)].sort(), ["a", "b", "c", "px-1.5"]);
  });
});

const base = {
  sources: [],
  timerCss: [{ rel: "apps/timer-web/src/styles/base.css", text: ".tabular{} .sr-only{}" }],
  componentCss: [{ rel: "packages/ui/src/components/panel.css", text: ".ui-panel{}" }],
  elementCss: [{ rel: "packages/ui/src/elements/card.css", text: ".card{}" }],
  unmigrated: [],
  collisions: new Map([["sr-only", "理由"]]),
  isTailwindUtility: (n) => ["sr-only", "container", "px-3"].includes(n),
};

describe("checkTimerClasses: 定義・一覧・衝突（設計正本 D10）", () => {
  test("対照: 定義済みのクラスと部品のクラスだけなら 0 件", () => {
    const sources = [{ rel: "apps/timer-web/src/ui/A.tsx", text: '<p className="tabular ui-panel" />' }];
    assert.deepEqual(checkTimerClasses({ ...base, sources }), []);
  });
  test("移したファイルに Tailwind のクラスが残っていたら落とす", () => {
    const sources = [{ rel: "apps/timer-web/src/ui/A.tsx", text: '<p className="tabular px-3" />' }];
    assert.equal(checkTimerClasses({ ...base, sources }).length, 1);
  });
  test("一覧に載ったファイルは書き方も定義も見ない", () => {
    const sources = [{ rel: "apps/timer-web/src/ui/A.tsx", text: "<p className={cls(x)} />" }];
    assert.deepEqual(checkTimerClasses({ ...base, sources, unmigrated: ["apps/timer-web/src/ui/A.tsx"] }), []);
  });
  test("一覧に載っているのにクラス名を 1 つも書いていないファイルは落とす（古い一覧）", () => {
    const sources = [{ rel: "apps/timer-web/src/ui/A.tsx", text: "export const x = 1;" }];
    assert.equal(checkTimerClasses({ ...base, sources, unmigrated: ["apps/timer-web/src/ui/A.tsx"] }).length, 1);
  });
  test("一覧に実在しないファイルがあれば落とす", () => {
    assert.equal(checkTimerClasses({ ...base, unmigrated: ["apps/timer-web/src/ui/Gone.tsx"] }).length, 1);
  });
  test("timer の CSS が Tailwind と同名のクラスを定義したら落とす（理由つきの例外を除く）", () => {
    const timerCss = [{ rel: "apps/timer-web/src/styles/x.css", text: ".container{} .sr-only{}" }];
    const problems = checkTimerClasses({ ...base, timerCss });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /container/);
  });
  test("timer の CSS が要素層と同名のクラスを定義したら落とす", () => {
    const timerCss = [{ rel: "apps/timer-web/src/styles/x.css", text: ".card{} .sr-only{}" }];
    assert.equal(checkTimerClasses({ ...base, timerCss }).length, 1);
  });
  test("使われていない衝突の例外は落とす", () => {
    const timerCss = [{ rel: "apps/timer-web/src/styles/x.css", text: ".tabular{}" }];
    assert.equal(checkTimerClasses({ ...base, timerCss }).length, 1);
  });
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `bash -c 'node --test scripts/audit-timer-classes.test.mjs'`
Expected: FAIL（`./audit-timer-classes.mjs` が見つからない）

- [ ] **Step 3: 検査を書く**

`scripts/audit-timer-classes.mjs`:

```js
#!/usr/bin/env node
/**
 * timer のクラス名の書き方と定義を見る検査（#321・設計正本 D1・D10・`docs/adr/0023`）。
 *
 * ## 何を見るか
 *
 *   0. **走査対象の健全性**（`docs/adr/0014`）: timer の `.tsx` / `.ts`・timer の CSS・部品層と要素層の CSS の件数が 0 なら落とす。
 *      「まだ移していないファイル」の一覧（{@link UNMIGRATED}）に、実在しないファイルと、クラス名を 1 つも書いていない
 *      ファイルがあれば落とす（古い一覧が、移したファイルを免除し続けるのを止める）
 *   1. **書き方**（一覧に無いファイルだけ）: `className` に渡してよいのは、文字列リテラル・置換の無いテンプレート・
 *      それらを枝に持つ条件式・名前が `_CLASS` で終わる表の要素・`className` という名前の値（部品の受け渡し）と、
 *      それを置換に持つテンプレートだけ。`_CLASS` で終わる表の値は文字列リテラルだけ
 *   2. **定義**（一覧に無いファイルだけ）: 1 の形から字面で取り出したクラス名は、timer の CSS か部品層に定義されている。
 *      Tailwind のクラスはどちらにも定義されないので、移したファイルに残った Tailwind のクラスもここで落ちる（計画 P8）
 *   3. **衝突**: timer の CSS が定義したクラス名は、要素層のクラス名・Tailwind のユーティリティ名と重ならない
 *      （{@link KNOWN_COLLISIONS} に理由つきで載せたものを除く。使われていない例外は落とす）
 *
 * ## 何を見ていないか —— 「足りる」とは言わない
 *
 * - `data-*` 属性の値と CSS の対応（比較の仕組みと E2E が見る・設計正本 D10）
 * - `style={{}}`
 * - 一覧に載ったファイル（移行中の免除。PR 4 で一覧は空になる）
 * - timer の画面の CSS が部品層（`.ui-*`）を持つ要素のプロパティを上書きしていないか（設計正本 D3。PR ごとに人が見る）
 * - `className` 以外の名前の属性でクラス名を渡す書き方（`class=` は React では使わない）
 *
 * 依存: postcss・postcss-selector-parser（ADR 0022 決定 7）と typescript（ルートの devDependencies）。
 * Tailwind のユーティリティ名の判定は `apps/timer-web` の `tailwindcss` を解決して使う（移行中だけ。ADR 0023・計画 P7）。
 * 設計方針: 判定は純粋関数、実 I/O と `process.exit` は `main()` の薄い配線だけに置く。
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import ts from "typescript";
import { findEmptyScanDimensions, listRepoFiles } from "./lib/scan-targets.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * まだ移していないファイル（設計正本 D10 の 3）。**PR 2・3 で移したら消す。PR 4 で空にして、この一覧ごと消す。**
 * 一覧に載っているのにクラス名を 1 つも書いていないファイルは、検査が落とす。
 */
export const UNMIGRATED = [
  "apps/timer-web/src/App.tsx",
  "apps/timer-web/src/ui/History.tsx",
  "apps/timer-web/src/ui/Loading.tsx",
  "apps/timer-web/src/ui/Lobby.tsx",
  "apps/timer-web/src/ui/Session.tsx",
  "apps/timer-web/src/ui/SessionLost.tsx",
  "apps/timer-web/src/ui/Summary.tsx",
  "apps/timer-web/src/ui/presence.ts",
  "apps/timer-web/src/ui/primitives.tsx",
  "apps/timer-web/src/ui/components/CircularProgress.tsx",
  "apps/timer-web/src/ui/components/ConfirmDialog.tsx",
  "apps/timer-web/src/ui/components/EmptyHint.tsx",
  "apps/timer-web/src/ui/components/EndSessionZone.tsx",
  "apps/timer-web/src/ui/components/InvitePanel.tsx",
  "apps/timer-web/src/ui/components/Markdown.tsx",
  "apps/timer-web/src/ui/components/NotifyHint.tsx",
  "apps/timer-web/src/ui/components/NotifySettings.tsx",
  "apps/timer-web/src/ui/components/NotifySettingsPanel.tsx",
  "apps/timer-web/src/ui/components/PassphrasePanel.tsx",
  "apps/timer-web/src/ui/components/PresenceDot.tsx",
  "apps/timer-web/src/ui/components/RosterPanel.tsx",
  "apps/timer-web/src/ui/components/RotationLineup.tsx",
  "apps/timer-web/src/ui/components/SelfDriverToggle.tsx",
  "apps/timer-web/src/ui/components/SessionConfigPanel.tsx",
  "apps/timer-web/src/ui/components/SharedMemo.tsx",
  "apps/timer-web/src/ui/components/StatusStrip.tsx",
  "apps/timer-web/src/ui/components/SwitchAlert.tsx",
  "apps/timer-web/src/ui/components/Tabs.tsx",
  "apps/timer-web/src/ui/components/TeamOrbit.tsx",
  "apps/timer-web/src/ui/components/TopicCard.tsx",
];

/** Tailwind のユーティリティ名と重なることを許すクラス名（移行中だけ。PR 4 で消す）。 */
export const KNOWN_COLLISIONS = new Map([
  ["sr-only", "Tailwind 版とレイヤー外の版がそれぞれ別の宣言で効いている。PR 2 で両方の宣言の和を残す（設計正本 D2）"],
]);

/** CSS の識別子のエスケープを解く（`px-1\.5` → `px-1.5`）。 */
function unescapeIdent(s) {
  return s.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([^\n])/g, (_, hex, ch) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch));
}

/** CSS が定義するクラス名（`@keyframes` の段は除く）。 */
export function cssClassNames(text) {
  const names = new Set();
  postcss.parse(text).walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
    selectorParser((sel) => sel.walkClasses((c) => names.add(unescapeIdent(c.value)))).processSync(rule.selector);
  });
  return names;
}

const isClassTable = (name) => /_CLASS$/.test(name);
const tokensOf = (s) => s.split(/\s+/).filter((t) => t !== "");

/** `.tsx` / `.ts` から、許した形のクラス名と、許さない形の書き込みを取り出す。 */
export function classUsagesIn(fileName, text) {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const classes = [];
  const problems = [];
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const addLiteral = (node, value) => {
    for (const name of tokensOf(value)) classes.push({ name, line: lineOf(node) });
  };
  const reject = (node, what) =>
    problems.push({ line: lineOf(node), message: `${what} は許した書き方ではありません（${ts.SyntaxKind[node.kind]}）。字面のクラス名か _CLASS の表で書く（設計正本 D1）` });

  const checkExpr = (e) => {
    if (ts.isParenthesizedExpression(e)) return checkExpr(e.expression);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return addLiteral(e, e.text);
    if (ts.isConditionalExpression(e)) {
      checkExpr(e.whenTrue);
      checkExpr(e.whenFalse);
      return;
    }
    if ((ts.isElementAccessExpression(e) || ts.isPropertyAccessExpression(e)) && ts.isIdentifier(e.expression) && isClassTable(e.expression.text)) return;
    if (ts.isIdentifier(e) && e.text === "className") return;
    if (ts.isTemplateExpression(e)) {
      addLiteral(e, e.head.text);
      for (const span of e.templateSpans) {
        if (!(ts.isIdentifier(span.expression) && span.expression.text === "className")) reject(span.expression, "className に渡すテンプレートの置換");
        addLiteral(span, span.literal.text);
      }
      return;
    }
    reject(e, "className に渡す式");
  };

  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === "className") {
      const init = node.initializer;
      if (init === undefined) reject(node, "値の無い className");
      else if (ts.isStringLiteral(init)) addLiteral(init, init.text);
      else if (ts.isJsxExpression(init) && init.expression !== undefined) checkExpr(init.expression);
      else reject(init, "className の値");
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isClassTable(node.name.text) && node.initializer !== undefined) {
      let init = node.initializer;
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression;
      if (!ts.isObjectLiteralExpression(init)) reject(init, "_CLASS の表");
      else {
        for (const prop of init.properties) {
          if (ts.isPropertyAssignment(prop) && (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer))) {
            addLiteral(prop.initializer, prop.initializer.text);
          } else {
            reject(prop, "_CLASS の表の値");
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { classes, problems };
}

/** 判定の本体（純粋関数）。 */
export function checkTimerClasses({ sources, timerCss, componentCss, elementCss, unmigrated, collisions, isTailwindUtility }) {
  const problems = [];
  const defined = new Set(timerCss.flatMap((f) => [...cssClassNames(f.text)]));
  const parts = new Set(componentCss.flatMap((f) => [...cssClassNames(f.text)]).filter((n) => n.startsWith("ui-")));
  const elementNames = new Set(elementCss.flatMap((f) => [...cssClassNames(f.text)]));
  const listed = new Set(unmigrated);
  const byRel = new Map(sources.map((s) => [s.rel, s]));

  for (const rel of unmigrated) {
    const source = byRel.get(rel);
    if (source === undefined) {
      problems.push(`[移行の一覧] ${rel} は実在しません。一覧から外す`);
      continue;
    }
    const usage = classUsagesIn(rel, source.text);
    if (usage.classes.length === 0 && usage.problems.length === 0) {
      problems.push(`[移行の一覧] ${rel} はクラス名を 1 つも書いていません。移し終えたなら一覧から外す`);
    }
  }

  for (const source of sources) {
    if (listed.has(source.rel)) continue;
    const usage = classUsagesIn(source.rel, source.text);
    for (const p of usage.problems) problems.push(`[書き方] ${source.rel}:${p.line} ${p.message}`);
    for (const c of usage.classes) {
      if (!defined.has(c.name) && !parts.has(c.name)) {
        problems.push(`[定義] ${source.rel}:${c.line} .${c.name} は timer の CSS にも部品層にも定義されていません`);
      }
    }
  }

  for (const name of defined) {
    if (elementNames.has(name)) problems.push(`[衝突] timer の CSS の .${name} は要素層のクラスと同じ名前です（設計正本 D1）`);
    if (isTailwindUtility(name) && !collisions.has(name)) {
      problems.push(`[衝突] timer の CSS の .${name} は Tailwind のユーティリティと同じ名前です。移行中は Tailwind が勝つ（設計正本 D1）`);
    }
  }
  for (const name of collisions.keys()) {
    if (!defined.has(name)) problems.push(`[衝突の例外] .${name} は timer の CSS に定義されていません。例外から外す`);
  }
  return problems;
}

/** Tailwind のユーティリティ名か（`apps/timer-web` の tailwindcss の compile() で判定する・計画 P7）。 */
export async function loadTailwindDetector(repoRoot = REPO_ROOT) {
  const require = createRequire(path.join(repoRoot, "apps/timer-web/package.json"));
  const mod = await import(pathToFileURL(require.resolve("tailwindcss")).href);
  const tw = typeof mod.compile === "function" ? mod : mod.default;
  const compiler = await tw.compile('@import "tailwindcss";', {
    base: repoRoot,
    async loadStylesheet(id) {
      const file = require.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id);
      return { path: file, base: path.dirname(file), content: fs.readFileSync(file, "utf8") };
    },
  });
  const escapeCss = (n) => n.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (name) => new RegExp(`\\.${escapeRe(escapeCss(name))}(?![\\w-])`).test(compiler.build([name]));
}

function readAll(rels) {
  return rels.map((rel) => ({ rel, text: fs.readFileSync(path.join(REPO_ROOT, rel), "utf8") }));
}

async function main() {
  const sources = readAll(listRepoFiles(REPO_ROOT, ["apps/timer-web/src/*.tsx", "apps/timer-web/src/*.ts"]));
  const timerCss = readAll(listRepoFiles(REPO_ROOT, ["apps/timer-web/src/*.css"]));
  const componentCss = readAll(listRepoFiles(REPO_ROOT, ["packages/ui/src/components/*.css"]));
  const elementCss = readAll(listRepoFiles(REPO_ROOT, ["packages/ui/src/elements/*.css"]));
  const volume = [
    { label: "timer の .tsx / .ts", count: sources.length },
    { label: "timer の CSS", count: timerCss.length },
    { label: "部品の CSS", count: componentCss.length },
    { label: "要素層の CSS", count: elementCss.length },
  ];
  console.log(`[audit-timer-classes] 走査対象: ${volume.map((v) => `${v.label} ${v.count} 件`).join(" / ")}（移行中 ${UNMIGRATED.length} 件）`);

  const problems = checkTimerClasses({
    sources,
    timerCss,
    componentCss,
    elementCss,
    unmigrated: UNMIGRATED,
    collisions: KNOWN_COLLISIONS,
    isTailwindUtility: await loadTailwindDetector(),
  });
  const empty = findEmptyScanDimensions(volume);
  if (empty.length > 0) problems.push(`[走査対象] 走査対象が 0 件です（${empty.join(" / ")}）。検査が空振りしています`);

  if (problems.length > 0) {
    console.error("[audit-timer-classes] NG");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("[audit-timer-classes] OK（違反 0 件）");
}

if (isDirectRun(import.meta.url, process.argv[1])) await main();
```

- [ ] **Step 4: 自己テストと実リポジトリで通ることを確かめる**

Run: `bash -c 'node --test scripts/audit-timer-classes.test.mjs && node scripts/audit-timer-classes.mjs'`
Expected: 自己テストは全件 PASS。実リポジトリは `OK（違反 0 件）`。

実リポジトリで落ちたら、1 件ずつ読む。`[移行の一覧] … クラス名を 1 つも書いていません` は、そのファイルのクラス名が `className` 以外の形（関数の戻り値など）で書かれていることを意味する。`presence.ts` のように関数でクラス名を返すファイルは `classUsagesIn` が数えないので、**一覧の判定を「`classUsagesIn` のクラス名 0 件かつ問題 0 件、かつ本文に `className` / `_CLASS` / `Class` の字面が無い」に広げる**（自己テストに `presence.ts` の形を 1 件足してから直す）。

- [ ] **Step 5: 素の node で依存が解決することを確かめる**

Run: `env -i PATH="$PATH" HOME="$HOME" node scripts/audit-timer-classes.mjs`
Expected: `OK（違反 0 件）`（vitest などのランナーを経由しないで解決できる）

- [ ] **Step 6: 変異を 3 件足す**

`scripts/mutations/m115-timer-classes-template-accepted.patch`: `checkExpr` の `TemplateExpression` の枝で、置換が `className` でないときの `reject` を消す変異。`scripts/mutations/m116-timer-classes-stale-unmigrated.patch`: 一覧のファイルがクラス名を 1 つも書いていないときの `problems.push` を消す変異。`scripts/mutations/m117-timer-classes-tailwind-collision.patch`: `isTailwindUtility(name) && !collisions.has(name)` の判定を `false &&` にする変異。

パッチは実物から作る: 対象の行を編集 → `git diff scripts/audit-timer-classes.mjs > scripts/mutations/m11N-….patch` → `git checkout -- scripts/audit-timer-classes.mjs`（**この `checkout` の前に、`git status --porcelain` で検査のファイル以外が変わっていないことを見る**）。各パッチの先頭に、既存の m114 と同じ形の注釈（`# 変異 115: …`・検出を期待するテスト・適用と復元のコマンド・何の族か）を置く。

`scripts/mutation-check.mjs` の `MUTATIONS` の末尾に足す:

```js
  {
    id: 115,
    label: "audit-timer-classes が className の置換を見逃す",
    patch: "m115-timer-classes-template-accepted.patch",
    pkg: "scripts",
    tests: ["audit-timer-classes.test.mjs"],
    note:
      "#321 PR 1・設計正本 D1。`${tone}` のような置換を許すと、クラス名を組み立てる書き方が戻り、" +
      "取り残したクラスを字面で数えられなくなる。",
  },
  {
    id: 116,
    label: "audit-timer-classes が古い移行の一覧を見逃す",
    patch: "m116-timer-classes-stale-unmigrated.patch",
    pkg: "scripts",
    tests: ["audit-timer-classes.test.mjs"],
    note:
      "#321 PR 1・設計正本 D10 の 3。移し終えたファイルが一覧に残ると、書き方と定義の検査を免除され続ける。",
  },
  {
    id: 117,
    label: "audit-timer-classes が Tailwind と同名のクラスを見逃す",
    patch: "m117-timer-classes-tailwind-collision.patch",
    pkg: "scripts",
    tests: ["audit-timer-classes.test.mjs"],
    note:
      "#321 PR 1・設計正本 D1。移行中は同名のユーティリティが生成されて @layer timer に勝つ。見た目の比較では、" +
      "その要素に Tailwind の値がたまたま一致すると見えない。",
  },
```

各変異が赤になることを確かめる（`mutation-check.mjs --help` は全件を走らせるので使わない）:

```bash
bash -c 'for p in scripts/mutations/m11[5-7]-*.patch; do
  git apply "$p" && (node --test scripts/audit-timer-classes.test.mjs >/dev/null 2>&1 && echo "SURVIVED $p" || echo "KILLED $p"); git apply -R "$p";
done; git status --porcelain'
```

Expected: 3 件とも `KILLED`。最後の `git status --porcelain` に、パッチと新しいファイル以外の変更が無い

- [ ] **Step 7: CI と開発ガイドに配線する**

`.github/workflows/ci.yml` の `node scripts/audit-ui-components.mjs` のステップの次に足す:

```yaml
      # timer のクラス名。書き方（字面か _CLASS の表）・定義（timer の CSS か部品層）・Tailwind と要素層との衝突を見る
      # （ADR 0023・#321）。typescript と tailwindcss を読むので install の後ろに置く。
      - run: node scripts/audit-timer-classes.mjs
        if: steps.scope.outputs.code == 'true'
```

`docs/guides/development.md` の `node scripts/audit-ui-components.mjs …` の行の次に足す:

```
node scripts/audit-timer-classes.mjs             # timer のクラス名の書き方と定義（ADR-0023）
```

- [ ] **Step 8: scripts の自己テスト全体を回す**

Run: `bash -c 'node --test $(node scripts/list-scan-targets.mjs script-tests)'`
Expected: 全件 PASS（`scan-target-wiring.test.mjs` の「すべての audit-*.mjs が走査量を名乗る」と「ci.yml から呼ばれる」を含む）

- [ ] **Step 9: コミットして push する**

```bash
git add scripts/audit-timer-classes.mjs scripts/audit-timer-classes.test.mjs scripts/mutations/m115-*.patch scripts/mutations/m116-*.patch scripts/mutations/m117-*.patch scripts/mutation-check.mjs .github/workflows/ci.yml docs/guides/development.md
git commit -F - <<'EOF'
feat: timer のクラス名の書き方と定義を見る検査を足す（#321 PR 1）

- className は字面か _CLASS の表で書き、クラス名は timer の CSS か部品層に定義する
- 移行中はまだ移していないファイルの一覧で免除し、古い一覧は落とす
- timer の CSS が Tailwind・要素層と同名のクラスを定義したら落とす（変異 m115〜m117）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git push
```

---

### Task 11: `design-tokens.test.ts` の ALLOW を、使われていない項目で落ちる形にする（テストが先）

**Files:**
- Modify: `apps/timer-web/test/ui/design-tokens.test.ts`
- Create: `scripts/mutations/m118-design-tokens-unused-allow.patch`
- Modify: `scripts/mutation-check.mjs`

- [ ] **Step 1: 失敗するテストを書く**

`design-tokens.test.ts` の `describe` の中に足す:

```ts
  it("ALLOW の各項目は 1 度以上使われている（直した後に例外だけが残らない）", () => {
    // Given（走査対象の全 .tsx）
    const files = tsxFiles(ROOT);
    // When（項目ごとに当たった回数を数える）
    const used = new Map(ALLOW.map((a) => [a, 0]));
    for (const full of files) {
      const relative = full.slice(ROOT.length + 1);
      const body = stripComments(readFileSync(full, "utf8"));
      for (const hit of body.match(RAW_COLOR) ?? []) {
        for (const a of ALLOW) {
          if ((a.file === "*" || a.file === relative) && a.pattern.test(hit)) used.set(a, (used.get(a) ?? 0) + 1);
        }
      }
    }
    // Then
    const unused = [...used].filter(([, n]) => n === 0).map(([a]) => `${a.file}: ${a.pattern}`);
    expect(unused).toEqual([]);
  });
```

- [ ] **Step 2: 赤を見るために、使われていない項目を一時的に足して流す**

`ALLOW` に `{ file: "ui/Nope.tsx", pattern: /bg-black/ }` を一時的に足す。

Run: `pnpm --filter @tasuki/timer-web exec vitest run test/ui/design-tokens.test.ts`
Expected: 新しいテストが FAIL（`ui/Nope.tsx: /bg-black/`）。確かめたら一時的な項目を消す

- [ ] **Step 3: 通ることを確かめる**

Run: `pnpm --filter @tasuki/timer-web exec vitest run test/ui/design-tokens.test.ts`
Expected: PASS

- [ ] **Step 4: 変異を 1 件足す**

`m118-design-tokens-unused-allow.patch`: `ALLOW` に使われない項目 `{ file: "ui/Nope.tsx", pattern: /bg-black/ }` を足す変異（「例外だけが残った」状態を作る）。Step 2 と同じ編集を `git diff` でパッチにし、`git checkout -- apps/timer-web/test/ui/design-tokens.test.ts` で戻す（戻す前に `git status --porcelain` でそのファイル以外が変わっていないことを見る）。先頭に m114 と同じ形の注釈を置く。`mutation-check.mjs` に足す:

```js
  {
    id: 118,
    label: "design-tokens.test の ALLOW に使われない項目が残る",
    patch: "m118-design-tokens-unused-allow.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/design-tokens.test.ts"],
    note:
      "#321 PR 1・設計正本 D10。生の色を直した後に例外だけが残ると、同じ場所に生の色を書き戻しても通る。",
  },
```

Run: `bash -c 'git apply scripts/mutations/m118-*.patch && (pnpm --filter @tasuki/timer-web exec vitest run test/ui/design-tokens.test.ts >/dev/null 2>&1 && echo SURVIVED || echo KILLED); git apply -R scripts/mutations/m118-*.patch; git status --porcelain'`
Expected: `KILLED`

- [ ] **Step 5: コミットして push する**

```bash
git add apps/timer-web/test/ui/design-tokens.test.ts scripts/mutations/m118-*.patch scripts/mutation-check.mjs
git commit -F - <<'EOF'
test: timer の生の色の例外が使われなくなったら落とす（#321 PR 1）

- ALLOW の各項目が 1 度以上当たることを確かめる（変異 m118）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git push
```

---

### Task 12: ADR 0023 を立て、旧 ADR に注記する

**Files:**
- Create: `docs/adr/0023-timer-without-tailwind.md`
- Modify: `docs/adr/0001-design-system-scope.md`（末尾に追記）
- Modify: `docs/adr/0022-ui-components-layer.md`（末尾に追記）
- Modify: `docs/adr/README.md`（索引に 1 行）
- Modify: `apps/timer-web/src/styles/base.css`（`#321 まで` の注釈の宛先）

- [ ] **Step 1: ADR の様式を確かめる**

Run: `cat docs/adr/template.md; grep -n "0022" docs/adr/README.md`
Expected: 様式と索引の書き方が分かる。以下の本文を様式に合わせる（見出しの名前が違えば様式に従う）

- [ ] **Step 2: ADR 0023 を書く**

`docs/adr/0023-timer-without-tailwind.md`:

```markdown
# ADR-0023: timer は Tailwind を使わず、素の CSS とトークン層・部品層で組む

- **ステータス**: Accepted（2026-09-30）
- **関連**: [#321](https://github.com/tomohiroJin/tasuki-tools/issues/321) /
  設計正本 [`docs/superpowers/specs/2026-09-29-timer-without-tailwind-design.md`](../superpowers/specs/2026-09-29-timer-without-tailwind-design.md)
- **置き換えるもの**: [ADR-0001](./0001-design-system-scope.md) 決定 1 の「Tailwind のまま維持します」と
  2026-08-11 の追記 / [ADR-0022](./0022-ui-components-layer.md) 決定 1 の理由・決定 5 の理由・実施状況の #321 の行き先

## 背景

Tailwind を使っているのは timer だけで、poker・玄関・お題ツールは素の CSS と `@tasuki/ui` で組んでいる。
Tailwind が残っていることで、要素層を読まない理由が「ユーティリティと部分的に上書きし合う」になり、
トークン層を CSS の `@import` で読めず（#297）、共通の部品を置くたびに Tailwind のレイヤーとの勝ち負けを考える必要がある。

## 決定

### 1. timer は Tailwind・PostCSS・autoprefixer を使わない

timer の見た目を、素の CSS とトークン層・部品層で組み直し、`tailwindcss`・`@tailwindcss/postcss`・`autoprefixer`・`postcss` を
timer の直接の依存から外す。前置詞は、必要な分を Vite（lightningcss）が build の対象に従って付ける。
**決定した。実施は #321 の PR 4。**

### 2. 見た目を変えずに移す

移行の完了条件は、基準（`ba9249d`）と並べて見た目が変わらないこと。出た差は台帳に書いて個別に承認を得る。
部品層へ寄せて見た目が変わるもの（ボタンの形・段、入力欄・パネル・招待・Markdown の写し）は #316 に送った。

### 3. 移行中は画面の CSS を `@layer timer` に入れ、Tailwind のユーティリティより弱く置く

移行の途中に Tailwind と素の CSS が並ぶ間の勝ち負けを、いまと同じに保つため。**PR 4 で外す。**

### 4. 要素層は読まない（理由を差し替える）

見た目を変えない条件のもとで要素層を読ませると、timer のボタンや見出しの一つひとつに、要素層を打ち消す規則が要る。
読ませるかは、ボタンの形を部品層に足すときに決める（#316）。ADR-0022 決定 5 の「要素層を読まない理由」をこれで置き換える。

### 5. 部品層が `@layer` を使わない理由を差し替える

ADR-0022 決定 1 の「部品層は `@layer` を使わない」は維持する。理由を「Tailwind のレイヤー構造に依存しない」から
「部品の勝ち負けは読み込み順と詳細度で決まる」に置き換える。

### 6. 検査の依存の例外

`scripts/audit-timer-classes.mjs` は、ルートの devDependencies の `typescript` で `.tsx` を読む
（`scripts/` の「追加依存は禁止」の慣行の例外。ADR-0022 決定 7 と同じ扱い）。
移行中は、Tailwind のユーティリティ名の判定に `apps/timer-web` の `tailwindcss` を解決して使う。
**この判定は PR 4 で Tailwind と一緒に消す。**

## 影響

- timer の CSS は画面単位のファイルに分かれる（`apps/timer-web/src/styles/`）。クラス名は字面で書く
- 移行の間は、基準と並べる比較の仕組み（`e2e/parity/`）を置く。PR 4 の通しの比較の後で消す
- #321 の間は、timer に触れる他の Issue を main へマージしない（基準が固定なので差が混ざる）

## この ADR で決めないこと

- 要素層を timer に読ませるか・ボタンの形と段（#316）
```

- [ ] **Step 3: 旧 ADR に注記する**

`docs/adr/0001-design-system-scope.md` の末尾に足す（過去の追記の中は書き換えない）:

```markdown

## 追記（2026-09-30・#321）

決定 1 の「Tailwind のまま維持します」と、2026-08-11 の追記（`@tailwindcss/postcss` の位置づけ・CSS-first の見送り・
`autoprefixer` の申し送り）は [ADR-0023](./0023-timer-without-tailwind.md) が置き換えた。**現行の正本は ADR-0023。**
```

`docs/adr/0022-ui-components-layer.md` の末尾に足す:

```markdown

## 追記（2026-09-30・#321）

決定 1 の理由（「Tailwind のレイヤー構造に依存しない」）と、決定 5 の「要素層を読まない理由」、
実施状況の「timer の Tailwind の写し（#321）」の行き先は [ADR-0023](./0023-timer-without-tailwind.md) が置き換えた。
**現行の正本は ADR-0023。**
```

`docs/adr/README.md` の索引に、0022 の行と同じ形で 0023 の行を足す。

- [ ] **Step 4: 現況の注釈の宛先を直す**

Run: `git grep -n '#321' -- ':!docs/superpowers' ':!docs/retrospectives' ':!docs/adr'`
Expected: `apps/timer-web/src/styles/base.css` の「同じ画面のほかの入力欄（Tailwind・#321 まで）と揃えて」が出る（Task 1 で `index.css` から移った行）

その行を「同じ画面のほかの入力欄（Tailwind・#321 の PR 2〜3 で素の CSS へ移す。部品への寄せは #316）と揃えて」に直す。

- [ ] **Step 5: リンク検査を通す**

Run: `node scripts/check-links.mjs`
Expected: `リンク検査 OK`

- [ ] **Step 6: コミットして push する**

```bash
git add docs/adr/0023-timer-without-tailwind.md docs/adr/0001-design-system-scope.md docs/adr/0022-ui-components-layer.md docs/adr/README.md apps/timer-web/src/styles/base.css
git commit -F - <<'EOF'
docs: timer は Tailwind を使わないと決める ADR 0023 を立てる（#321 PR 1）

- Tailwind・PostCSS・autoprefixer を外す（実施は PR 4）・見た目を変えずに移す
- 要素層を読まない理由と、部品層が @layer を使わない理由を差し替える
- ADR 0001・0022 には「現行の正本は ADR 0023」とだけ注記した

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git push
```

---

### Task 13: 台帳を置き、#316 への申し送りの文案を利用者に見せる

**Files:**
- Create: `docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md`

- [ ] **Step 1: 台帳を書く**

`docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md`:

```markdown
# timer から Tailwind を外す — 差の台帳（#321）

設計正本 [`2026-09-29-timer-without-tailwind-design.md`](./2026-09-29-timer-without-tailwind-design.md) §5.1 の台帳。
**承認した差・消した死んだクラス・残した検索結果の正本はこの文書。** PR 本文にはここへのリンクだけを書く。

- **基準**: `ba9249d`（固定）
- **無害として扱う差**: 設計正本 §5.4 の 2 類だけ（ここに写さない）
- **比較の仕組み**: `e2e/parity/`。PR 4 で消した後は、下の各 PR の「比較の仕組みの SHA」で `git checkout <SHA> -- e2e/parity` して再現する

## 利用者が個別に承認した差

| 差 | 承認 | PR |
|---|---|---|
| autoprefixer を外すと `-moz-column-gap` 2 件が消える（Firefox は 63 以降、前置詞なしの `gap` で効く） | 2026-09-29 | 4 |

## PR 1（見た目を移さない土台）

- ブランチの SHA: （PR を作る直前の `git rev-parse HEAD`）
- 比較の仕組みの SHA: （同上）
- 対照実行: 基準同士 2 回（結果）
- 破壊検証: （Task 7 の 5 つの壊し方と、赤になった物差し）
- 比較: 状態数・幅・差の件数（Task 14 の結果）
- 状態に入れなかった要素と、対象から外した理由: （Task 5 の結果）
- 除去検査: 死んでいる・生きている・未判定の件数と、既知の答えとの突き合わせ（Task 8）。**死んでいるクラスの一覧は PR 2・3 で写さない判断に使う**（`e2e/parity/out/removal-probe.json` を PR 2 の着手時に取り直す）
- 消した死んだ規則: `.animate-confetti`・`.animate-shake`・`.animate-pulse-fast` とそのキーフレーム（使い手 0 件・Task 9）
```

括弧の中は、Task 14 で実測した値に置き換える（**括弧のまま残さない**）。

- [ ] **Step 2: #316 への申し送りの文案を利用者に見せる（投稿しない）**

次の文案を利用者に見せ、承認を待つ。**承認を得るまで `gh issue comment` を実行しない。**

```markdown
#321（timer から Tailwind を外す）の設計で、次の 4 つを #316 へ申し送ります（設計正本 D9）。

1. **timer の写しを部品へ寄せること。** #320 が #321 に預けていた timer の写し（1 行・複数行の入力欄・`Card`・`InvitePanel`・`Markdown.tsx`）は、#321 が「見た目を変えずに移す」ことに徹するため、#316 へ送りました。入力欄が 14px のまま（iOS で自動拡大される）の件を含みます
2. **要素層を timer に読ませるかの判断。** #321 では読ませません。見た目を変えない条件で読ませると、timer のボタンや見出しの一つひとつに要素層を打ち消す規則が要るためです（ADR 0023 決定 4）
3. **#321 は timer のボタンの形を変えません。** 以前のコメントで「timer のボタンは #321 で組み直す」と書きましたが、#321 は素の CSS へ移すだけです。ボタンの形・段は #316 が決めます。本文の「timer は Tailwind」は #321 の後は古くなります
4. **main で効いていない宣言の一覧。** 「ボタンの収まりが悪い」の手がかりになります。例: `PrimaryButton` に渡した `px-3 py-1.5` は、Tailwind の出力の並び順で `px-6 py-3` に負けていて効いていません。主ボタンのフォーカスでは、アウトラインとリングが両方出ています。一覧は #321 の台帳（`docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md`）にあり、PR 2・3 で増えます
```

承認を得たら `gh issue comment 316 --body-file <文案のファイル>` で投稿し、台帳の PR 1 の節に「#316 へ申し送った（コメントの URL）」を足す。

- [ ] **Step 3: コミットして push する（台帳は Task 14 の後にもう 1 度更新する）**

```bash
git add docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md
git commit -F - <<'EOF'
docs: 基準と並べた差の台帳を置く（#321 PR 1）

- 承認した差・消した死んだクラス・比較の結果の正本にする

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git push
```

---

### Task 14: 通しで確かめ、台帳を埋めて PR を作る

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md`

- [ ] **Step 1: 手元の検査を全部回す**

```bash
cd /workspaces/claym/local/Tasuki
pnpm test
pnpm lint
pnpm typecheck
bash -c 'node --test $(node scripts/list-scan-targets.mjs script-tests)'
for a in scripts/audit-*.mjs; do case "$a" in *.test.mjs) ;; *) node "$a" >/dev/null || echo "NG $a";; esac; done
pnpm audit --audit-level high
node scripts/audit-plan-gate.mjs
node scripts/check-links.mjs
```

Expected: すべて通る（`NG` の行が出ない）

- [ ] **Step 2: 変異検査を回す**

Run: `bash -c 'node scripts/mutation-check.mjs 2>&1 | tee /tmp/claude-mutation.log; grep -c SURVIVED /tmp/claude-mutation.log'`
Expected: 生き残り 0 件。**当たらなかったパッチ（適用に失敗したもの）が 0 件であることも見る** —— 1 件でも当たらないと、それ以降が無検査になる（`grep -ciE "apply.*(fail|error)" /tmp/claude-mutation.log` が 0）

- [ ] **Step 3: E2E を回す**

Run: `pnpm e2e`
Expected: 全件 PASS（`e2e/specs/` の件数は変わっていない。`e2e/parity/` は数えられない）

- [ ] **Step 4: 比較を通しで流す**

Run: Task 4 の Step 4 のコマンドと、`TASUKI_PARITY_CONTROL=1` を付けた対照実行を 1 回ずつ
Expected: どちらも全件 PASS。`ss -tlnp | grep -E ':(8787|18080)\b'` が空

- [ ] **Step 5: 台帳の PR 1 の節を実測で埋める**

Task 13 の台帳の括弧を、Step 1〜4 と Task 5・7・8 の実測で置き換える（SHA は `git rev-parse HEAD`）。

```bash
git add docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md
git commit -F - <<'EOF'
docs: PR 1 の比較の結果を台帳に書く（#321 PR 1）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git push
```

- [ ] **Step 6: PR を作る**

```bash
gh pr create --base main --head feature/issue-321-pr1-primitives \
  --title "feat: timer から Tailwind を外す土台を入れる（#321 PR 1）" \
  --body-file - <<'EOF'
## 概要
timer から Tailwind を外す移行（#321）の土台です。見た目は 1 つも移していません。
設計正本は `docs/superpowers/specs/2026-09-29-timer-without-tailwind-design.md`、実装計画は `docs/superpowers/plans/2026-09-30-timer-without-tailwind-pr1-foundation.md` です。

## 変更内容
- ADR 0023（timer は Tailwind を使わない・実施は PR 4）と、ADR 0001・0022 への注記
- 基準（`ba9249d`）と並べる比較の仕組み（`e2e/parity/`。`pnpm e2e` には数えない）と除去検査
- `index.css` を入口と `styles/base.css` に分け、レイヤーの順序を宣言（ビルド出力の CSS はバイト一致）
- 使い手の無いアニメーションの規則を削除
- クラス名の恒久の検査 `scripts/audit-timer-classes.mjs`（変異 m115〜m117）
- `design-tokens.test.ts` の ALLOW を、使われていない項目で落ちる形に（変異 m118）

比較の結果・承認した差は台帳（`docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md`）にあります。

## テスト方法
- [ ] `pnpm test` / `pnpm lint` / `pnpm typecheck`
- [ ] scripts の自己テスト・全 audit・`pnpm audit --audit-level high`
- [ ] `node scripts/mutation-check.mjs`
- [ ] `pnpm e2e`
- [ ] 比較（`e2e/parity/README.md` の手順）で差 0 件

Refs #321

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

**本文に `Closes` / `Fixes` を書かない**（#321 は PR 4 で閉じる。地の文に書くと squash マージで勝手に閉じる）。

- [ ] **Step 7: レビューを通す**

文脈を共有しない `/code-review <PR 番号>` を、**PR 番号を明示して**回す。指摘への対応は `superpowers:receiving-code-review` に従う。マージは利用者の判断を待つ。
