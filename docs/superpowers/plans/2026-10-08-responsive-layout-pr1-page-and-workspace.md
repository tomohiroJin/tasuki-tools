# #316 PR 1: 幅の段・器・段組み 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 画面の幅の段を 3 つの境目（40rem・64rem・90rem）に絞り、器（`.ui-page` の 3 段）と段組み（`.ui-workspace`）を部品層に置いて、poker・お題ツール・玄関と timer の器へ当てる。方針を `packages/ui/README.md` と ADR 0025 に残す。

**Architecture:** 部品層に `layout.css` を足し、要素層の `.page` を消す。幅の境目と `.page` の再来は既存の `scripts/audit-ui-components.mjs` に検査を足して守る。段組みの並び替えは CSS の grid と `:has()` だけで行い、DOM は 1 回だけ描く。

**Tech Stack:** CSS（素の CSS・`@layer` なし）・React 19・postcss（検査）・node:test・Playwright

**Spec:** [`docs/superpowers/specs/2026-10-08-responsive-layout-design.md`](../specs/2026-10-08-responsive-layout-design.md)（D1・D2・D3・D9・§7.1）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 検査の述語は自己テストを先に書いて赤を見る（Task 1・2）。E2E は main の状態で赤を見てから器を替える（Task 4） |
| II. 技術選定は ADR を通す | 通過 | 新しい依存を足さない。幅の段・器・段組みの方針を ADR 0025 に記録する（Task 9） |
| III. 揮発インメモリと単純運用 | 該当なし | 同期サーバーに触れない。配布しない |
| IV. 境界の型安全 | 該当なし | 境界検証に触れない |
| V. 実画面検証 | 通過 | 洗い出しの撮影を main と並べ、変わった画面を利用者に Chrome で見てもらう（Task 10） |
| VI. 依存は内向き | 該当なし | `packages/ui` は依存を持たないまま。ドメインに触れない |
| VII. 検査は壊して確かめる | 通過 | 対照実行（Task 3）・変異 4 件（Task 3） |
| VIII. 記録が正本 | 通過 | 理由は設計正本・決定は ADR 0025・使い方は README（設計正本 §7.1） |
| IX. 小さく回す | 通過 | 設計正本 §4 の PR 1。配布しない |
| X. 抽象は実需で | 通過 | 部品のクラスはすべて 2 アプリ以上に当てる（死んだ部品の検査が守る） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密・個人情報を扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## Global Constraints

- 幅の段の境目は **`40rem`・`64rem`・`90rem` だけ**。書き方は範囲構文（`(width >= 40rem)`・`(width < 64rem)`・`(40rem <= width < 64rem)`）。`min-width` / `max-width` / px / em は書かない
- 器は `.ui-page`（`72rem`）・`.ui-page--prose`（`40rem`）・`.ui-page--wide`（`96rem`）。外の余白は `clamp(var(--space-4), 4vw, calc(var(--space-6) * 1.5))`
- 段組みの区画は `.ui-workspace-rail`（左脇 `18rem`）・`.ui-workspace-main`（主）・`.ui-workspace-aside`（右脇 `22rem`）。**DOM は 左脇 → 主 → 右脇 の順に書く**（compact の見た目の順と読み上げの順を揃える）
- 部品層の既存の規則（設計正本 #320 の D3〜D11）に従う: セレクタは `.ui-` から始める・詳細度は (0,1,0)〜(0,2,0)・`@layer` / 入れ子 / つまみの宣言 / 生の色 / `outline` を書かない・2 アプリ以上が使う
- 日本語のコメント・文書。数と画面の列挙を README と ADR に書かない
- **作業ブランチは `feature/issue-316-pr1-layout`**（`docs/issue-316-responsive-spec` から切る。設計正本と計画のコミットもこの PR に載る）
- **サブエージェントは push・マージ・`git stash`・`git checkout -- <path>`・`git reset --hard` をしない。** 変異パッチを作る手順は Task 3 に書いた形だけで行う
- `e2e/inventory-316/`（未追跡）を消さない・コミットしない

## Review Focus

1. **compact の並び順が DOM 順のままか。** 狭い幅で `grid-area` を当てると、存在しない区画の行と `gap` が空きを作る。compact では区画に配置を書かない → Task 4 の「320px では 左脇 → 主 → 右脇 が同じ x で縦に並ぶ」で固定する
2. **右脇が無い画面（お題ツール）の ultra で、空の 22rem の列が残らないか** → Task 4 の「主の右端が器の内側の右端に揃う」で固定する
3. **左脇が無い画面（timer）の wide で、右脇の上に `gap` だけの空きが出ないか** → Task 4 の timer の「右脇の上端が主の上端に揃う」で固定する
4. **`@media` の直前に説明のコメントがあると、免除のコメントが直前でなくなる**（`prev()` は 1 つ前のノードだけを見る）→ Task 2 の自己テスト「説明のコメントと @media の間に免除を書けば通る」「免除と @media の間に説明があれば落ちる」で固定する
5. **poker の節の見出しの地（`.room > section > h2`）が構造の変更で外れる** → Task 5 でセレクタを直し、既存の `poker-a11y.spec.ts` の走査で確かめる

## 見積もり（設計正本 §6）

| 区分 | 見積もり | 内訳 |
|---|---|---|
| 機械の待ち | 約 1 時間 | 手元の CI 一式 約 10 分・E2E 全件 約 10 分・`mutation-check` 約 14 分・撮影 約 5 分×2・対照実行 約 2 分 |
| 実作業 | 5〜7 時間 | 検査と自己テスト 2 時間・部品と画面 2 時間・E2E 1 時間・文書 1 時間 |

**2 倍（機械の待ち 2 時間・実作業 14 時間）を超えたら、その時点で利用者に報告する。** 各タスクの終わりに経過時間を記録する。

## ファイルの地図

| ファイル | 役割 | 変更 |
|---|---|---|
| `packages/ui/src/components/layout.css` | 器と段組みの部品 | 新規 |
| `packages/ui/src/components/index.css` | まとめ読み | `@import './layout.css';` を足す |
| `packages/ui/src/elements/reset.css` | 要素層 | `.page` と 420px の `@media` を消す |
| `packages/ui/src/elements/card.css` | 札 | `max-width: 420px` → `width < 40rem` |
| `scripts/audit-ui-components.mjs` | 検査 | 幅の境目・`.page` の検査を足す |
| `scripts/audit-ui-components.test.mjs` | 自己テスト | 上の逃げ道の族 |
| `scripts/mutations/m121〜m124-*.patch`・`scripts/mutation-check.mjs` | 変異 | 4 件を足す |
| `apps/landing/src/screens/*.tsx`・`apps/landing/src/index.css` | 玄関 | 器を `.ui-page*` に・720px を 40rem に |
| `apps/poker-web/src/App.tsx`・`src/pages/RoomPage.tsx`・`src/index.css` | poker | 器・段組み・420px |
| `apps/topic-web/src/components/LoadingView.tsx`・`src/screens/TopicRoom.tsx`・`src/index.css` | お題ツール | 器・段組み |
| `apps/timer-web/src/ui/primitives.tsx`・`src/styles/primitives.css` | timer の器 | `Stage` を `.ui-page` に |
| `apps/timer-web/src/ui/Session.tsx`・`src/styles/session.css` | timer の 2 列 | `.ui-workspace` に |
| `apps/timer-web/src/ui/use-breakpoint.ts`・`test/ui/use-breakpoint.test.ts` | timer の幅判定 | `matchMedia('(width >= 64rem)')` |
| `apps/timer-web/src/styles/{primitives,invite-panel,session,switch-alert,summary}.css` | timer の 48rem | PR 3 まで `ui-exempt:` |
| `e2e/specs/layout.spec.ts` | 器と段組みの E2E | 新規 |
| `e2e/specs/topic.spec.ts`・`e2e/specs/landing-design.spec.ts` | 既存 E2E | 器の幅の期待値・640px を足す |
| `docs/adr/0025-responsive-layout.md`・`docs/adr/README.md` | 決定 | 新規・索引 |
| `packages/ui/README.md` | 使い方 | 「画面を組む」の節 |
| `docs/superpowers/specs/2026-10-08-responsive-layout-design.md` | 設計正本 | PR 1 で決めた細部（下の「設計正本との差」）を反映 |

### 設計正本との差（Task 9 で正本へ反映する）

- **D3 の DOM 順**: 正本は「主 → 脇」としたが、compact の見た目の順（左脇 → 主 → 右脇）と読み上げの順を揃えるため **左脇 → 主 → 右脇** にする
- **D3 の主の最小幅**: grid の `minmax(32rem, 1fr)` は `.ui-page`（72rem）の中で使われると横に溢れるので、`minmax(0, 1fr)` にし、**`--wide` の器と段の境目の計算で 32rem 以上を保証する**（64rem の画面: 器の内側 ≒ 58.9rem ≥ 主 32 + 右脇 22 + 間 2・90rem の画面: 84rem ≥ 18 + 32 + 22 + 間 4）。E2E が 1280px と 1920px で主の幅 ≥ 32rem を測る
- **timer の一部を PR 1 で当てる**: 死んだ部品の検査（2 アプリ以上）を満たすため、`.ui-page`（既定）は玄関の道具選びと timer の `Stage`、`.ui-workspace-aside` は poker と timer のセッションが使う。timer の見た目はほぼ変わらない（Task 7 の表）
- **timer の 48rem は PR 3 まで `ui-exempt:`**（理由「#316 PR 3 で段へ寄せる」）。PR 3 で消す

---

### Task 1: 幅の境目の述語と自己テスト

**Files:**
- Modify: `scripts/audit-ui-components.mjs`（`findRawColors` の後ろに述語を足す）
- Test: `scripts/audit-ui-components.test.mjs`

**Interfaces:**
- Produces: `export const BREAKPOINTS_REM: Set<number>`・`export function mediaWidthViolations(params: string): string[]`（空なら守っている）・`export function legacyPageClassUses(text: string): string[]`（TSX の `className` に書いた裸の `page` を含む値の一覧）

- [ ] **Step 1: 失敗するテストを書く**（`audit-ui-components.test.mjs` の import に `mediaWidthViolations`・`legacyPageClassUses` を足し、末尾に追記）

```js
describe("mediaWidthViolations: 幅の境目は 40rem / 64rem / 90rem だけ（#316 D1）", () => {
  const ok = [
    ["(width >= 40rem)", "範囲構文"],
    ["(width < 64rem)", "未満"],
    ["(40rem <= width < 64rem)", "両側の範囲"],
    ["(width>=90rem)", "空白なし"],
    ["(WIDTH >= 40REM)", "大文字"],
    ["screen and (width >= 64rem)", "媒体の種類つき"],
    ["(hover: hover)", "幅ではない条件"],
    ["(prefers-reduced-motion: reduce)", "幅ではない条件"],
    ["(height >= 48rem)", "高さは対象外"],
    ["(min-height: 420px)", "高さの旧構文も対象外"],
    ["(orientation: landscape)", "向き"],
  ];
  for (const [params, why] of ok) {
    test(`${why}: ${params} は通す`, () => assert.deepEqual(mediaWidthViolations(params), []));
  }
  const ng = [
    ["(max-width: 420px)", "旧構文と px"],
    ["(min-width: 40rem)", "旧構文は値が段でも落とす"],
    ["(max-width: 64rem)", "旧構文の max も"],
    ["(min-device-width: 40rem)", "device-width"],
    ["(width >= 48rem)", "段ではない rem"],
    ["(width >= 40em)", "em"],
    ["(width >= 640px)", "px"],
    ["(width >= calc(40rem))", "計算"],
    ["(width >= var(--x))", "変数"],
    ["(width >= 0)", "単位なし"],
    ["(width >= 40rem) and (width < 48rem)", "and の後ろ側"],
    ["not all and (max-width: 720px)", "not の中"],
    ["(40rem <= width < 48rem)", "範囲の片側だけが外れる"],
  ];
  for (const [params, why] of ng) {
    test(`${why}: ${params} は落とす`, () => assert.ok(mediaWidthViolations(params).length > 0));
  }
});

describe("legacyPageClassUses: 要素層の .page を TSX が使っていないか（#316 D2）", () => {
  const hits = [
    ['<main className="page">', "単独"],
    ['<main className="page landing">', "先頭"],
    ['<main className="x page">', "末尾"],
    ["<main className='page'>", "単引用符"],
    ['<main className={"page"}>', "波括弧の文字列"],
    ["<main className={`page ${x}`}>", "テンプレート文字列"],
    ['<main className = "page">', "= の前後の空白"],
  ];
  for (const [text, why] of hits) {
    test(`${why}: ${text} を拾う`, () => assert.equal(legacyPageClassUses(text).length, 1));
  }
  const misses = [
    ['<main className="ui-page">', "部品の器"],
    ['<div className="ui-page-header">', "部品の見出し"],
    ['<main className="topic-page">', "画面のクラス"],
    ['<main className="page-x">', "接頭辞"],
    ["<p>このページ page です</p>", "本文の語"],
  ];
  for (const [text, why] of misses) {
    test(`${why}: ${text} は拾わない`, () => assert.deepEqual(legacyPageClassUses(text), []));
  }
});
```

- [ ] **Step 2: 赤を見る**

Run: `bash -c 'node --test scripts/audit-ui-components.test.mjs 2>&1 | tail -5'`
Expected: FAIL（`mediaWidthViolations is not a function` で import が落ちる）

- [ ] **Step 3: 述語を書く**（`findRawColors` の定義の直後に置く）

```js
/** 画面の幅の段の境目（rem）。#316・ADR 0025 決定 1。CSS のカスタムプロパティはメディアクエリに使えないので、値を直書きして検査で守る。 */
export const BREAKPOINTS_REM = new Set([40, 64, 90]);

/** 幅の旧構文（`min-width` / `max-width` / `device-width` 系）。高さ（`min-height`）は見ない。 */
const LEGACY_WIDTH = /(?:^|[^\w-])(?:min-|max-|(?:min-|max-)?device-)width\b/;
/** 幅の条件（範囲構文の `width` を含む）。 */
const ANY_WIDTH = /(?:^|[^\w-])(?:min-|max-)?(?:device-)?width\b/;

/**
 * `@media` の条件のうち、幅の段の約束を破っている箇所（#316 D1）。空なら守っている。
 *
 * **括弧ごとに見る。** `(width >= 40rem) and (width < 48rem)` は後ろ側だけが外れている。
 * 旧構文は**値が段でも落とす**（書き方を 1 つにして、目で突き合わせられるようにする）。
 */
export function mediaWidthViolations(params) {
  const out = [];
  for (const [, feature] of params.matchAll(/\(((?:[^()]|\([^()]*\))*)\)/g)) {
    const f = feature.toLowerCase();
    if (!ANY_WIDTH.test(f)) continue;
    if (LEGACY_WIDTH.test(f)) {
      out.push(`幅の旧構文です: (${feature.trim()})    ← (width >= 40rem) の形で書く`);
      continue;
    }
    if (/(?:calc|var|env|min|max|clamp)\(/.test(f)) {
      out.push(`境目を計算しています: (${feature.trim()})    ← 40rem / 64rem / 90rem を直書きする`);
      continue;
    }
    for (const [len, num, unit] of f.matchAll(/(-?\d*\.?\d+)([a-z%]*)/g)) {
      if (unit !== "rem" || !BREAKPOINTS_REM.has(Number(num))) {
        out.push(`幅の段の境目ではありません: ${len}    ← 40rem / 64rem / 90rem のどれか（ADR 0025 決定 1）`);
      }
    }
  }
  return out;
}

/**
 * TSX の `className` に書いた裸の `page`（#316 D2 で消した要素層の器）。
 * 見るのは文字列・波括弧の文字列・テンプレート文字列の 3 形。`clsx("page")` のような関数の引数は見ない。
 */
export function legacyPageClassUses(text) {
  const out = [];
  const re = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\}|\{\s*`([^`]*)`\s*\})/g;
  for (const m of text.matchAll(re)) {
    const value = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (value.split(/\s+/).includes("page")) out.push(value);
  }
  return out;
}
```

- [ ] **Step 4: 緑を見る**

Run: `bash -c 'node --test scripts/audit-ui-components.test.mjs 2>&1 | tail -5'`
Expected: `# fail 0`

- [ ] **Step 5: コミット**

```bash
git add scripts/audit-ui-components.mjs scripts/audit-ui-components.test.mjs
git commit -m "test: 幅の段の境目と要素層の .page を見分ける述語を足す（#316 PR 1）"
```

---

### Task 2: 検査へ配線する（画面の CSS・部品の CSS・TSX）

**Files:**
- Modify: `scripts/audit-ui-components.mjs`（`checkScreenCss`・`screenRuleViolations`・`checkComponentCss`・`main`・冒頭の注釈）
- Test: `scripts/audit-ui-components.test.mjs`

**Interfaces:**
- Consumes: Task 1 の `mediaWidthViolations`・`legacyPageClassUses`
- Produces: `checkScreenCss` / `checkComponentCss` が `@media` の幅の違反と `.page` のセレクタを返す。`main()` が TSX の `.page` を `[要素層の .page]` として落とす

- [ ] **Step 1: 失敗するテストを書く**（末尾に追記）

```js
describe("checkScreenCss: @media の幅の段（#316 D1）", () => {
  test("段ではない境目の @media を落とす", () => {
    assert.equal(messagesOf("@media (width >= 48rem) { .a { color: inherit; } }").length, 1);
  });
  test("直前の申告があれば通す", () => {
    assert.deepEqual(messagesOf("/* ui-exempt: #316 PR 3 で段へ寄せる */\n@media (width >= 48rem) { .a { color: inherit; } }"), []);
  });
  test("説明のコメントと @media の間に申告を書けば通す", () => {
    assert.deepEqual(messagesOf("/* 説明 */\n/* ui-exempt: 理由 */\n@media (max-width: 420px) { .a { color: inherit; } }"), []);
  });
  test("申告と @media の間に説明があれば、どちらも落とす", () => {
    const m = messagesOf("/* ui-exempt: 理由 */\n/* 説明 */\n@media (max-width: 420px) { .a { color: inherit; } }");
    assert.ok(m.some((x) => x.includes("幅")));
    assert.ok(m.some((x) => x.includes("何も免除していない")));
  });
  test("段の境目の @media は落とさない（申告も要らない）", () => {
    assert.deepEqual(messagesOf("@media (width >= 64rem) { .a { color: inherit; } }"), []);
  });
  test("規則の中に入れ子にした @media も見る", () => {
    assert.equal(messagesOf(".a { @media (width >= 48rem) { color: inherit; } }").length, 1);
  });
});

describe("checkScreenCss: 要素層の .page（#316 D2）", () => {
  test(".page のセレクタを落とす", () => {
    assert.equal(messagesOf(".page { margin: 0; }").length, 1);
  });
  test("子孫の位置の .page も落とす", () => {
    assert.equal(messagesOf("main .page > h1 { margin: 0; }").length, 1);
  });
  test(".ui-page と .topic-page は落とさない", () => {
    assert.deepEqual(messagesOf(".ui-page, .topic-page { margin: 0; }"), []);
  });
});

describe("checkComponentCss: @media の幅の段（#316 D1）", () => {
  const compMessages = (css) => checkComponentCss("packages/ui/src/components/x.css", css).map((p) => p.message);
  test("段ではない境目は申告があっても落とす", () => {
    assert.ok(compMessages("/* ui-exempt: x */\n@media (width >= 48rem) { .ui-x { color: inherit; } }").some((m) => m.includes("境目")));
  });
  test("段の境目は通す", () => {
    assert.deepEqual(compMessages("@media (width >= 90rem) { .ui-x { color: inherit; } }"), []);
  });
});
```

（`checkComponentCss` を import に足す。既に入っていれば足さない。）

- [ ] **Step 2: 赤を見る**

Run: `bash -c 'node --test scripts/audit-ui-components.test.mjs 2>&1 | grep -E "^# (pass|fail)"'`
Expected: `# fail` が 1 以上（新しい describe の各テスト）

- [ ] **Step 3: `checkScreenCss` を申告つきの報告で共通化し、`@media` を見る**

`checkScreenCss` の本体を次に置き換える（`walkRules` の中身は同じ判定を `reportWithExempt` へ渡すだけ）。

```js
/** 画面の CSS を見る。返り値が空なら違反なし。 */
export function checkScreenCss(file, css) {
  const root = postcss.parse(css, { from: file });
  const problems = [];
  const usedExempts = new Set();
  // 規則にも @media にも同じ申告の作法を当てる（直前の /* ui-exempt: 理由 */ が 1 つだけを免除する）。
  const reportWithExempt = (node, violations) => {
    if (violations.length === 0) return;
    const reason = exemptReasonOf(node);
    if (reason === undefined || reason === "") {
      for (const message of violations) problems.push({ ...where(file, node), message });
    }
    if (reason !== undefined) usedExempts.add(node.prev());
    if (reason === "") problems.push({ ...where(file, node), message: "ui-exempt: の理由が空です" });
  };
  root.walkRules((rule) => {
    reportWithExempt(rule, inKeyframes(rule)
      ? rawColorViolations(rule)
      : [...screenRuleViolations(rule), ...rawColorViolations(rule)]);
  });
  root.walkAtRules(/^media$/i, (at) => reportWithExempt(at, mediaWidthViolations(at.params)));
  root.walkComments((comment) => {
    if (!EXEMPT_RE.test(comment.text.trim()) || usedExempts.has(comment)) return;
    problems.push({ ...where(file, comment), message: "何も免除していない ui-exempt: です    ← 直したなら消す" });
  });
  return problems;
}
```

`exemptReasonOf(rule)` の引数名を `node` に改め、注釈を「規則か `@media` の直前の申告の理由」に直す。

- [ ] **Step 4: `screenRuleViolations` に `.page` を足す**（`return found;` の直前）

```js
  if (resolved.some((s) => classesOf(s).has("page"))) {
    found.push(`要素層の .page は消しました（#316 D2）: ${rule.selector}    ← 器は .ui-page / .ui-page--prose / .ui-page--wide を使う`);
  }
```

- [ ] **Step 5: `checkComponentCss` に `@media` を足す**（`root.walkAtRules((at) => {` の中、`@import` の判定の後ろ）

```js
    if (/^media$/i.test(at.name)) {
      for (const message of mediaWidthViolations(at.params)) report(at, message);
    }
```

- [ ] **Step 6: `main()` で TSX の `.page` を落とす**（`usageByApp.set(app, …)` の直前）

```js
    for (const f of tsx) {
      for (const value of legacyPageClassUses(f.text)) {
        problems.push(`[要素層の .page] ${f.rel} の className="${value}"    ← .ui-page / .ui-page--prose / .ui-page--wide を使う（#316 D2）`);
      }
    }
```

冒頭の注釈「何を見るか」の 1. に「`@media` の幅の境目は `40rem` / `64rem` / `90rem` だけ（`ui-exempt:` で外せる）・`.page` のセレクタは落とす」、2. に「`@media` の幅の境目（申告では外せない）」、3. の後ろに「4. **要素層の `.page`**: 各アプリの TSX の `className` に裸の `page` を書いたら落とす」を足す。「何を見ていないか」に「`clsx("page")` のような関数の引数に書いた `page`」「`@container` の境目（部品の内側の並び替えは器の幅で決まるので段の約束の外）」を足す。

- [ ] **Step 7: 緑を見る**

Run: `bash -c 'node --test scripts/audit-ui-components.test.mjs 2>&1 | grep -E "^# (pass|fail)"'`
Expected: `# fail 0`

- [ ] **Step 8: コミット**

```bash
git add scripts/audit-ui-components.mjs scripts/audit-ui-components.test.mjs
git commit -m "feat: 部品層の検査で幅の段の境目と要素層の .page を落とす（#316 PR 1）"
```

---

### Task 3: 対照実行と変異

**Files:**
- Create: `scripts/mutations/m121-ui-components-media-width-any-length.patch`・`m122-ui-components-media-legacy-syntax-accepted.patch`・`m123-ui-components-legacy-page-class-ignored.patch`・`m124-ui-components-screen-media-ignored.patch`
- Modify: `scripts/mutation-check.mjs`（`MUTATIONS` の末尾）

- [ ] **Step 1: 対照実行（壊さずに main の画面が赤に出ることを見る）**

Run: `node scripts/audit-ui-components.mjs 2>&1 | tee /tmp/claude-1000/-workspaces-claym-local-Tasuki/f9cf1c75-68af-4121-911f-8707c09354c8/scratchpad/audit-control.txt | grep -c "^  - "`
Expected: exit 1。**次がすべて名指しで出る**ことを `audit-control.txt` で 1 件ずつ確かめる（件数ではなく中身で見る）:
- `apps/landing/src/index.css` の `max-width: 720px` が 2 件
- `apps/poker-web/src/index.css` の `max-width: 420px` が 1 件
- `packages/ui/src/elements/reset.css` の `.page` の規則と `max-width: 420px`、`packages/ui/src/elements/card.css` の `max-width: 420px`
- timer の `48rem` が 6 件と `(40rem <= width < 48rem)` が 1 件
- `[要素層の .page]` が TSX で 13 件（玄関 5・poker 4・お題ツール 4）

1 つでも欠けたら検査が穴を持っている。直してから先へ進む。

- [ ] **Step 2: 作業ツリーが空であることを確かめる**

Run: `git status --porcelain`
Expected: `?? e2e/inventory-316/` の 1 行だけ。他の行があれば先へ進まない（変異パッチを作る手順は作業ツリーを書き戻す）。

- [ ] **Step 3: 変異 m121〜m124 を 1 件ずつ作る**（各変異で「編集 → `git diff` をパッチへ保存 → `git restore` で戻す」）

| ID | `scripts/audit-ui-components.mjs` に入れる壊し方 |
|---|---|
| m121 | `mediaWidthViolations` の `if (unit !== "rem" \|\| !BREAKPOINTS_REM.has(Number(num)))` を `if (false)` にする（どの長さも通す） |
| m122 | `mediaWidthViolations` の `if (LEGACY_WIDTH.test(f)) { … continue; }` の塊を消す（旧構文を値だけで見る） |
| m123 | `legacyPageClassUses` の `if (value.split(/\s+/).includes("page")) out.push(value);` を消す |
| m124 | `checkScreenCss` の `root.walkAtRules(/^media$/i, …);` の行を消す |

各変異で次を行う（例は m121）:

```bash
# 編集してから
git diff scripts/audit-ui-components.mjs > scripts/mutations/m121-ui-components-media-width-any-length.patch
git restore scripts/audit-ui-components.mjs
git apply --check scripts/mutations/m121-ui-components-media-width-any-length.patch && echo applies
```

Expected: 毎回 `applies`。4 件作ったら `git status --porcelain` が「パッチ 4 本と `e2e/inventory-316/`」だけであることを確かめる。

- [ ] **Step 4: `MUTATIONS` に登録する**（`id: 120` の要素の後ろ）

```js
  {
    id: 121,
    label: "audit-ui-components が @media の幅の境目の値を見ない",
    patch: "m121-ui-components-media-width-any-length.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: "#316 PR 1・ADR 0025 決定 1。48rem・px・em の境目が黙って通り、段の約束が崩れる。",
  },
  {
    id: 122,
    label: "audit-ui-components が幅の旧構文（min-width / max-width）を値だけで見る",
    patch: "m122-ui-components-media-legacy-syntax-accepted.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: "#316 PR 1。値が段（40rem）なら旧構文が通る。書き方が 2 つになり、目で突き合わせられなくなる。",
  },
  {
    id: 123,
    label: "audit-ui-components が TSX の要素層の .page を見ない",
    patch: "m123-ui-components-legacy-page-class-ignored.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: "#316 PR 1・設計正本 D2。消した .page を書き戻すと、器の幅を持たない素の main になる。",
  },
  {
    id: 124,
    label: "audit-ui-components が画面の CSS の @media を見ない",
    patch: "m124-ui-components-screen-media-ignored.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: "#316 PR 1。述語は正しくても、画面の CSS へ配線されていなければ検査は死んでいる。",
  },
```

- [ ] **Step 5: 新しい変異だけを流す**

Run: `bash -c 'node scripts/mutation-check.mjs 2>&1 | grep -E "m12[1-4]|変異数|検出"'`
Expected: m121〜m124 がすべて「検出」。**`| head` を付けない**（SIGPIPE で結果を見落とす）。全件は Task 10 で流す。

- [ ] **Step 6: コミット**

```bash
git add scripts/mutations/m12[1-4]-*.patch scripts/mutation-check.mjs
git commit -m "test: 幅の段と .page の検査の変異を 4 件足す（#316 PR 1）"
```

---

### Task 4: 器と段組みの E2E（赤を見る）

**Files:**
- Create: `e2e/specs/layout.spec.ts`

**Interfaces:**
- Consumes: `e2e/support/poker.ts` の `createRoom`・`e2e/support/topic.ts` の `joinTopicTool`・`setTopic`・`openTopicTool`・`e2e/support/timer.ts` の `createRoom`
- Produces: Task 5〜7 で緑にする E2E

- [ ] **Step 1: E2E を書く**

```ts
/**
 * 器の幅と段組み（#316 PR 1・設計正本 D1〜D3・E3・E4）。
 *
 * **タグを付けない（`local` 専用）。** 本番のルーム枠を消費して確かめる種類のものではない。
 *
 * 区画の位置は**区画どうしの相対位置**で見る（px の直値で見ると器の余白を変えるたびに壊れる）。
 * 押せる大きさ（44px）は PR 1 では合否にせず、件数を注釈に出すだけにする（設計正本 D9）。
 */
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { createRoom as createPokerRoom } from '../support/poker';
import { createRoom as createTimerRoom } from '../support/timer';
import { joinTopicTool, openTopicTool, setTopic } from '../support/topic';

const REM = 16;
const MAIN_MIN = 32 * REM;

interface Box { x: number; y: number; width: number; height: number }

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox();
  if (box === null) throw new Error(`${selector} が描かれていない（判定が空振りする）`);
  return box;
}

/** 器の外寸と、余白を除いた内側の幅・右端。 */
async function pageBox(page: Page): Promise<{ outer: number; inner: number; innerRight: number }> {
  return page.locator('main.ui-page').evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      outer: r.width,
      inner: el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight),
      innerRight: r.right - parseFloat(s.paddingRight),
    };
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

/** 44px 未満の操作を注釈に出す（PR 1 では合否にしない）。 */
async function noteSmallTargets(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  const small = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, a[href], summary, [role="tab"]'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
      .map(({ el, r }) => `${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`),
  );
  testInfo.annotations.push({ type: `44px 未満（${label}）`, description: `${small.length} 件: ${small.join(' / ')}` });
}

/** poker のルームにお題を掲げ、右脇（お題）まで描かれた状態にする。 */
async function openPokerWithTopic(page: Page, openPeer: (label: string) => Promise<{ page: Page }>): Promise<void> {
  const url = await createPokerRoom(page, 'layout-a');
  const topic = await openPeer('layout-topic');
  await joinTopicTool(topic.page, url, 'layout-t');
  await setTopic(topic.page, 'FizzBuzz', '3 のときは Fizz を出す');
  await expect(page.getByRole('region', { name: 'お題', exact: true })).toBeVisible();
}

test.describe('poker のルームは広い画面で 3 つの区画を並べる', () => {
  test('Given 幅 1920 / When ルームを開く / Then 器は 1536px で、左脇・主・右脇が横に並ぶ', async ({ page, openPeer }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await openPokerWithTopic(page, openPeer);
    expect((await pageBox(page)).outer).toBe(96 * REM);
    const rail = await boxOf(page, '.ui-workspace-rail');
    const main = await boxOf(page, '.ui-workspace-main');
    const aside = await boxOf(page, '.ui-workspace-aside');
    expect(rail.x + rail.width).toBeLessThanOrEqual(main.x);
    expect(main.x + main.width).toBeLessThanOrEqual(aside.x);
    expect(main.width).toBeGreaterThanOrEqual(MAIN_MIN);
    await noteSmallTargets(page, testInfo, 'poker 1920');
  });

  test('Given 幅 1280 / When ルームを開く / Then 器の内側は 1152px 以上で、左脇は右の列の上・右脇はその下', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPokerWithTopic(page, openPeer);
    expect((await pageBox(page)).inner).toBeGreaterThanOrEqual(72 * REM);
    const rail = await boxOf(page, '.ui-workspace-rail');
    const main = await boxOf(page, '.ui-workspace-main');
    const aside = await boxOf(page, '.ui-workspace-aside');
    expect(main.x + main.width).toBeLessThanOrEqual(rail.x);
    expect(rail.x).toBeCloseTo(aside.x, 0);
    expect(rail.y + rail.height).toBeLessThanOrEqual(aside.y);
    expect(main.width).toBeGreaterThanOrEqual(MAIN_MIN);
  });

  test('Given 幅 320 / When ルームを開く / Then 横に溢れず、左脇・主・右脇の順に縦へ積む', async ({ page, openPeer }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await openPokerWithTopic(page, openPeer);
    await expectNoHorizontalOverflow(page);
    const rail = await boxOf(page, '.ui-workspace-rail');
    const main = await boxOf(page, '.ui-workspace-main');
    const aside = await boxOf(page, '.ui-workspace-aside');
    expect(rail.y + rail.height).toBeLessThanOrEqual(main.y);
    expect(main.y + main.height).toBeLessThanOrEqual(aside.y);
    expect(main.x).toBeCloseTo(rail.x, 0);
    expect(aside.x).toBeCloseTo(rail.x, 0);
  });
});

test.describe('お題ツールの部屋は右脇を持たない', () => {
  test('Given 幅 1920 / When 部屋を開く / Then 左脇の右に主が並び、主の右端は器の内側の右端に揃う（空の列を残さない）', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await openTopicTool(page, 'layout-topic-wide');
    const box = await pageBox(page);
    expect(box.outer).toBe(96 * REM);
    const rail = await boxOf(page, '.ui-workspace-rail');
    const main = await boxOf(page, '.ui-workspace-main');
    expect(rail.x + rail.width).toBeLessThanOrEqual(main.x);
    expect(main.x + main.width).toBeCloseTo(box.innerRight, 0);
    await noteSmallTargets(page, testInfo, 'お題ツール 1920');
  });

  test('Given 幅 1280 / When 部屋を開く / Then 主の右に左脇（いまのお題）が並ぶ', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTopicTool(page, 'layout-topic-mid');
    const rail = await boxOf(page, '.ui-workspace-rail');
    const main = await boxOf(page, '.ui-workspace-main');
    expect(main.x + main.width).toBeLessThanOrEqual(rail.x);
    expect(main.width).toBeGreaterThanOrEqual(MAIN_MIN);
  });

  test('Given 幅 320 / When 部屋を開く / Then 横に溢れない', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await openTopicTool(page, 'layout-topic-narrow');
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('玄関の器', () => {
  test('Given 幅 1280 / When 名乗る画面を開く / Then 器は 640px（読む・入力する）', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.getByLabel('あなたの名前')).toBeVisible();
    expect((await pageBox(page)).outer).toBe(40 * REM);
    await noteSmallTargets(page, testInfo, '玄関 1280');
  });

  test('Given 幅 1280 / When ルームを作る / Then 道具選びの器は 1152px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByLabel('あなたの名前').fill('layout-hub');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    await expect(page.getByRole('list', { name: 'ツール' })).toBeVisible();
    expect((await pageBox(page)).outer).toBe(72 * REM);
  });
});

test.describe('timer のセッションは右脇を持ち、左脇を持たない', () => {
  test('Given 幅 1280 / When セッションを始める / Then 右脇は主の右にあり、上端は主の上端に揃う（上に空きを作らない）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await createTimerRoom(page, 'layout-timer');
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    const main = await boxOf(page, '.ui-workspace-main');
    const aside = await boxOf(page, '.ui-workspace-aside');
    expect(main.x + main.width).toBeLessThanOrEqual(aside.x);
    expect(aside.y).toBeCloseTo(main.y, 0);
  });
});
```

- [ ] **Step 2: 赤を見る**

Run: `cd e2e && TASUKI_E2E_TARGET=local pnpm exec playwright test specs/layout.spec.ts 2>&1 | tail -15`
Expected: FAIL（`.ui-workspace-rail が描かれていない` などで全件赤。`main.ui-page` が無いので器の測定も落ちる）

- [ ] **Step 3: コミット**

```bash
git add e2e/specs/layout.spec.ts
git commit -m "test: 器の幅と段組みの E2E を足す（#316 PR 1・まだ赤）"
```

---

### Task 5: 器と段組みの部品を置き、poker とお題ツールに当てる

**Files:**
- Create: `packages/ui/src/components/layout.css`
- Modify: `packages/ui/src/components/index.css`・`packages/ui/src/elements/reset.css`・`packages/ui/src/elements/card.css`
- Modify: `apps/poker-web/src/App.tsx:28`・`apps/poker-web/src/pages/RoomPage.tsx:34,181,200-230`・`apps/poker-web/src/index.css:41,176`
- Modify: `apps/topic-web/src/components/LoadingView.tsx:6`・`apps/topic-web/src/screens/TopicRoom.tsx:36,50,69-90`・`apps/topic-web/src/index.css:10-14`
- Modify: `e2e/specs/topic.spec.ts:275-293`

- [ ] **Step 1: 部品を書く**（`packages/ui/src/components/layout.css`）

```css
/* ============================================================
   器と段組み（#316・ADR 0025）

   幅の段の境目は 40rem / 64rem / 90rem の 3 つだけ（`scripts/audit-ui-components.mjs` が守る）。
     compact < 40rem ≤ medium < 64rem ≤ wide < 90rem ≤ ultra

   器（.ui-page）は画面の用途で 3 段から選ぶ。段組み（.ui-workspace）は --wide の器の中で使う
   （主の 32rem は --wide の器と段の境目の計算で保たれる。72rem の器の中で ultra の 3 列にすると溢れる）。
   区画に何を置くかは画面が決める。部品が持つのは区画の幅と並び替えだけ。
   ============================================================ */

/* 器。既定は「選ぶ・一覧する」画面の 72rem。最大幅を超える画面では中央に寄せ、両脇は卓の地を見せる。 */
.ui-page {
  box-sizing: border-box;
  width: 100%;
  max-width: 72rem;
  margin-inline: auto;
  padding-block: var(--space-6) calc(var(--space-6) * 2);
  padding-inline: clamp(var(--space-4), 4vw, calc(var(--space-6) * 1.5));
}

/* 読む・入力する画面。1 行の長さを抑える。 */
.ui-page--prose {
  max-width: 40rem;
}

/* 道具の部屋。区画を横に並べる。 */
.ui-page--wide {
  max-width: 96rem;
}

/* 段組み。compact と medium は DOM の順（左脇 → 主 → 右脇）に縦へ積む。
   **狭い幅で区画へ配置を書かない** —— 無い区画の行と gap が空きを作る。 */
.ui-workspace {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-6);
  align-items: start;
}

.ui-workspace-rail,
.ui-workspace-main,
.ui-workspace-aside {
  box-sizing: border-box;
  min-width: 0;
}

/* wide: 主の右に 1 本の列を立て、左脇を上・右脇を下に積む。
   右の列の 2 行目を 1fr にして、主の背が高いときの余りを右脇の行へ寄せる（左脇と右脇の間を開けない）。 */
@media (width >= 64rem) {
  .ui-workspace {
    grid-template-columns: minmax(0, 1fr) 22rem;
    grid-template-rows: auto 1fr;
  }

  .ui-workspace-main {
    grid-column: 1;
    grid-row: 1 / span 2;
  }

  .ui-workspace-rail {
    grid-column: 2;
    grid-row: 1;
  }

  .ui-workspace-aside {
    grid-column: 2;
    grid-row: 2;
  }

  /* 左脇が無ければ右脇を 1 行目へ上げる（上に gap だけの空きを作らない）。 */
  .ui-workspace:where(:not(:has(> .ui-workspace-rail))) > .ui-workspace-aside {
    grid-row: 1;
  }
}

/* ultra: 左脇を主の左へ出す。左脇が無い画面は wide の並びのまま。 */
@media (width >= 90rem) {
  .ui-workspace:where(:has(> .ui-workspace-rail)) {
    grid-template-columns: 18rem minmax(0, 1fr) 22rem;
    grid-template-rows: auto;
  }

  /* 右脇が無ければ右の列を作らない（空の 22rem を残さない）。 */
  .ui-workspace:where(:has(> .ui-workspace-rail):not(:has(> .ui-workspace-aside))) {
    grid-template-columns: 18rem minmax(0, 1fr);
  }

  .ui-workspace:where(:has(> .ui-workspace-rail)) > .ui-workspace-rail {
    grid-column: 1;
    grid-row: 1;
  }

  .ui-workspace:where(:has(> .ui-workspace-rail)) > .ui-workspace-main {
    grid-column: 2;
    grid-row: 1;
  }

  .ui-workspace:where(:has(> .ui-workspace-rail)) > .ui-workspace-aside {
    grid-column: 3;
    grid-row: 1;
  }
}
```

`packages/ui/src/components/index.css` の末尾に `@import './layout.css';` を足し、冒頭の注釈は変えない。

- [ ] **Step 2: 要素層から `.page` を消す**

`packages/ui/src/elements/reset.css` から `/* ---------- レイアウト ---------- */` の見出しと `.page { … }` の規則、`/* ---------- モバイル ---------- */` の見出しと `@media (max-width: 420px) { .page { … } }` を消す。消した場所に次の 1 行を残す。

```css
/* 器（旧 `.page`）は部品層の `.ui-page` が持つ（#316・ADR 0025）。 */
```

`packages/ui/src/elements/card.css` の `@media (max-width: 420px)` を `@media (width < 40rem)` に替える。

- [ ] **Step 3: poker に当てる**

`apps/poker-web/src/App.tsx:28` と `RoomPage.tsx:34`・`:181` の `className="page"` を `className="ui-page ui-page--prose"` に替える。`RoomPage.tsx` のルームの本体（`<main className="page room">` から `</main>` まで）を次に替える（`header` の中身はそのまま）。

```tsx
    <main className="ui-page ui-page--wide room">
      <header>
        {/* （既存の注釈と ui-page-header・InviteLink をそのまま置く） */}
      </header>
      <ErrorNote error={sync.error} onClose={sync.clearError} />
      {/* 段組み（#316・ADR 0025）。DOM は 左脇 → 主 → 右脇。狭い幅ではこの順に縦へ積む。 */}
      <div className="ui-workspace">
        <section className="ui-workspace-rail">
          <h2>参加者（{snapshot.participants.length}人）</h2>
          <ParticipantList participants={snapshot.participants} you={snapshot.you} />
        </section>
        <div className="ui-workspace-main">
          {isVoting ? (
            <VotingSection snapshot={snapshot} sync={sync} />
          ) : (
            <RevealedSection snapshot={snapshot} sync={sync} />
          )}
        </div>
        {sync.topic && (
          <div className="ui-workspace-aside">
            <CurrentTopic topic={sync.topic} />
          </div>
        )}
      </div>
    </main>
```

`apps/poker-web/src/index.css:41` の `.room > section:not(.topic) > h2` を `.room section:not(.topic) > h2` に替え、注釈の末尾に「節は段組み（`.ui-workspace`）の区画の中にあるので子孫で選ぶ（#316）」を足す。`:176` の `@media (max-width: 420px)` を `@media (width < 40rem)` に替える。

- [ ] **Step 4: お題ツールに当てる**

`LoadingView.tsx:6`・`TopicRoom.tsx:36`・`:50` の `className="page"` を `className="ui-page ui-page--prose"` に替える。`TopicRoom.tsx:69` からの本体を次に替える。

```tsx
      <main className="ui-page ui-page--wide">
        {/* header・InviteLink・retryNotice・error の行はそのまま */}
        {/* 段組み（#316・ADR 0025）。いまのお題を左脇に置く（狭い幅では先頭・広い幅では右の列の上・最も広い幅では左）。 */}
        <div className="ui-workspace">
          <div className="ui-workspace-rail">
            <CurrentTopic state={sync.topicState} notice={generationNotice(sync.topicState)} enabled={enabled} onClear={sync.clearTopic} />
          </div>
          <div className="ui-workspace-main topic-tools">
            {/* 作るはボタン 1 つで済む操作なので、長く書く「書く」より先に置く（#313 構成案 1） */}
            <TopicMaker aiUnlocked={sync.topicState?.aiUnlocked ?? false} enabled={enabled} onGenerate={sync.generate} onUnlock={sync.unlock} />
            <TopicEditor current={sync.topicState?.topic ?? null} enabled={enabled} onSubmit={sync.setTopic} />
          </div>
        </div>
      </main>
```

`apps/topic-web/src/index.css` の `.topic-page { max-width: 1120px; }` とその注釈を消す。

- [ ] **Step 5: お題ツールの既存 E2E の期待値を直す**（`e2e/specs/topic.spec.ts:275`）

テスト名を `'Given 幅 1920 / When お題ツールを開く / Then ページは 1536px で、書くは主の区画の幅いっぱい'` に替え、`expect(main.width).toBe(1120);` を `expect(main.width).toBe(1536);` に、`expect(write?.width).toBeCloseTo(main.inner, 0);` を次に替える。

```ts
    const column = await page.locator('.ui-workspace-main').boundingBox();
    expect(write?.width).toBeCloseTo(column?.width ?? -1, 0);
```

- [ ] **Step 6: 単体テストと型と検査**

Run: `pnpm --filter @tasuki/poker-web --filter @tasuki/topic-web test 2>&1 | tail -6 && pnpm --filter @tasuki/poker-web --filter @tasuki/topic-web typecheck 2>&1 | tail -3 && pnpm --filter @tasuki/ui lint && pnpm --filter @tasuki/ui test 2>&1 | tail -3`
Expected: すべて緑。落ちたら構造の変更に依存したテストを読んで直す（区画の DOM 順が変わった）。

- [ ] **Step 7: E2E の poker とお題ツールの節を流す**

Run: `cd e2e && TASUKI_E2E_TARGET=local pnpm exec playwright test specs/layout.spec.ts specs/topic.spec.ts specs/poker-a11y.spec.ts specs/poker.spec.ts 2>&1 | tail -15`
Expected: `layout.spec.ts` の poker とお題ツールの describe が緑。玄関と timer の describe はまだ赤（Task 6・7）。`poker-a11y` と `topic` と `poker` は緑。

- [ ] **Step 8: コミット**

```bash
git add packages/ui/src apps/poker-web/src apps/topic-web/src e2e/specs/topic.spec.ts
git commit -m "feat: 器と段組みの部品を置き、poker とお題ツールに当てる（#316 PR 1）"
```

---

### Task 6: 玄関に当てる

**Files:**
- Modify: `apps/landing/src/screens/{RoomGone,Resuming,JoinRoom,CreateRoom,RoomChoice}.tsx`
- Modify: `apps/landing/src/index.css:13-22,184,270-275,464`
- Modify: `e2e/specs/landing-design.spec.ts:86`

- [ ] **Step 1: 器を替える**

`RoomGone`・`Resuming`・`JoinRoom`・`CreateRoom` の `className="page landing"` を `className="ui-page ui-page--prose landing"` に、`RoomChoice` の `className="page landing landing-choice"` を `className="ui-page landing landing-choice"` に替える。

- [ ] **Step 2: 玄関の CSS から器の値を外す**

- `.landing` の `padding: var(--space-6) var(--space-5);` を消す（余白は器が持つ）
- `.landing-choice` の `max-width: 1120px;` を消す
- `@media (max-width: 720px)` を 2 つとも `@media (width < 40rem)` に替え、2 つ目の中の `.landing { padding: … }` を消す

- [ ] **Step 3: 札の文字が 640px でも 1 行に収まるかを見る**

`e2e/specs/landing-design.spec.ts:86` の `[1280, 1024, 768, 320]` を `[1280, 1024, 768, 640, 320]` に替えて流す。

Run: `cd e2e && TASUKI_E2E_TARGET=local pnpm exec playwright test specs/landing-design.spec.ts specs/layout.spec.ts -g "玄関|landing|札" 2>&1 | tail -12`
Expected: 緑。**640px で札の文字が 2 行になったら**（`lines` が 2）、札の並びの `@media`（1 つ目）だけを `(width < 64rem)` に替えて、1024px で札が縦に積まれる見た目を撮って利用者に諮る項目として Task 10 の報告に書く（勝手に決めない）。

- [ ] **Step 4: コミット**

```bash
git add apps/landing/src e2e/specs/landing-design.spec.ts
git commit -m "feat: 玄関の器を .ui-page に替え、720px の境目を 40rem に寄せる（#316 PR 1）"
```

---

### Task 7: timer の器と 2 列と幅判定

**Files:**
- Modify: `apps/timer-web/src/ui/primitives.tsx:17-19`・`apps/timer-web/src/styles/primitives.css:10-22`
- Modify: `apps/timer-web/src/ui/Session.tsx:221-225,338,357-359`・`apps/timer-web/src/styles/session.css:17-43`
- Modify: `apps/timer-web/src/ui/use-breakpoint.ts`
- Create: `apps/timer-web/test/ui/use-breakpoint.test.ts`
- Modify: timer の `48rem` の `@media`（`primitives.css` 2 件・`invite-panel.css`・`session.css`・`switch-alert.css` 2 件・`summary.css` の `(40rem <= width < 48rem)`）

timer の見た目の変化（受け入れる・Task 10 で撮影を並べる）:

| どこ | 前 | 後 |
|---|---|---|
| 全画面の外の余白（横） | 1rem | `clamp(1rem, 4vw, 3rem)`（1280px で 3rem） |
| セッションの 2 列 | 右 360px・間 1.5rem | 右 22rem（352px）・間 2rem |
| 狭い幅のセッションの縦の間隔 | 1.5rem | 2rem |

- [ ] **Step 1: 幅判定のテストを書く**（`apps/timer-web/test/ui/use-breakpoint.test.ts`）

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsWide } from "../../src/ui/use-breakpoint.js";

/** `matchMedia` の差し替え。渡した問い合わせを記録し、change を後から送れるようにする。 */
function stubMatchMedia(initial: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  const queries: string[] = [];
  vi.stubGlobal("matchMedia", (q: string) => {
    queries.push(q);
    return {
      matches: initial, media: q, onchange: null,
      addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
      removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    };
  });
  return { queries, fire: (matches: boolean) => listeners.forEach((l) => l({ matches })) };
}

describe("useIsWide（#316 D1: CSS と同じ 64rem の問い合わせで判定する）", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("matchMedia に (width >= 64rem) を問い合わせ、その答えを返す", () => {
    const mm = stubMatchMedia(true);
    const { result } = renderHook(() => useIsWide());
    expect(result.current).toBe(true);
    expect(mm.queries).toContain("(width >= 64rem)");
  });

  it("change を受けると答えが変わる", () => {
    const mm = stubMatchMedia(true);
    const { result } = renderHook(() => useIsWide());
    act(() => mm.fire(false));
    expect(result.current).toBe(false);
  });
});
```

Run: `pnpm --filter @tasuki/timer-web exec vitest run test/ui/use-breakpoint.test.ts 2>&1 | tail -6`
Expected: FAIL（`queries` に `(width >= 64rem)` が無い）

- [ ] **Step 2: 幅判定を替える**（`use-breakpoint.ts` の `useIsWide` と冒頭の注釈を置き換える。`useViewportWidth` はそのまま）

```ts
/**
 * 画面幅ブレークポイント購読フック（PC 主役のレイアウト切替に使う）。
 * **画面の CSS と同じ問い合わせ `(width >= 64rem)` で判定する**（#316 D1・ADR 0025 決定 1）。
 * px（`innerWidth >= 1024`）で判定すると、既定の文字の大きさを変えた利用者で CSS とずれた。
 * `matchMedia` が無い環境（jsdom の既定）では、従来どおり `innerWidth >= 1024` で答える。
 */

import { useEffect, useState } from "react";

const WIDE_QUERY = "(width >= 64rem)";
const FALLBACK_WIDE_PX = 1024;

function readWide(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return window.innerWidth >= FALLBACK_WIDE_PX;
  return window.matchMedia(WIDE_QUERY).matches;
}

export function useIsWide(): boolean {
  const [wide, setWide] = useState(readWide);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = (e: { matches: boolean }) => setWide(e.matches);
    mq.addEventListener("change", onChange);
    setWide(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}
```

`useIsWide(` を引数つきで呼んでいる箇所が無いことを `grep -rn "useIsWide(" apps/timer-web/src` で確かめる（`Session.tsx:203` の引数なしの 1 件だけのはず）。

Run: `pnpm --filter @tasuki/timer-web exec vitest run test/ui/use-breakpoint.test.ts 2>&1 | tail -4`
Expected: PASS

- [ ] **Step 3: 器を替える**

`primitives.tsx` の `<div className="stage-inner">` を `<div className="ui-page stage-inner">` に替え、直前の注釈を「器は部品層の `.ui-page`（72rem・#316）。`stage-inner` は timer の計器の縦の余白と重なりの基準だけを持つ。」に替える。`primitives.css` の `.stage-inner` を次に替える（`@media (width >= 48rem)` の塊は残し、直前に免除を書く）。

```css
/* 器の幅と横の余白は部品層の `.ui-page` が持つ（#316）。ここは計器の縦の余白と、子の重なりの基準だけ。 */
.stage-inner {
  position: relative;
  padding-block: 2.5rem;
}

/* ui-exempt: #316 PR 3 で段へ寄せる */
@media (width >= 48rem) {
```

- [ ] **Step 4: セッションの 2 列を段組みに替える**

`Session.tsx:223` の `<div className="session-layout">` を `<div className="ui-workspace">` に、`:225` の左の `<div className="session-column">` を `<div className="ui-workspace-main session-column">` に、`:338` の右の `<div className="session-column">` を `<div className="ui-workspace-aside session-column">` に替える。2 列の注釈に「段組みは部品層の `.ui-workspace`（#316）」を足す。

`session.css` の「2 カラムの外側」の 2 つの `@media`（`.session-layout`）と、`@media (width >= 64rem) { .session-column { min-width: 0; } }` を消す（`min-width: 0` は区画が持つ）。`:where(.session-column > :not(:last-child))` は残す。

- [ ] **Step 5: 残りの 48rem に免除を書く**

`primitives.css` の `.meter-panel` の `@media (width >= 48rem)`・`invite-panel.css:31`・`session.css` の 48rem・`switch-alert.css:34`・`:48`・`summary.css:73` の各 `@media` の**直前の行**に `/* ui-exempt: #316 PR 3 で段へ寄せる */` を置く（既存の説明のコメントがあれば、その後ろ・`@media` の直前）。

Run: `node scripts/audit-ui-components.mjs 2>&1 | tail -4`
Expected: `[audit-ui-components] OK（違反 0 件）`。落ちたら出力の 1 件ずつを直す（未使用の免除・置き忘れ）。

- [ ] **Step 6: timer の単体テスト・型・クラスの検査**

Run: `pnpm --filter @tasuki/timer-web test 2>&1 | tail -6 && pnpm --filter @tasuki/timer-web typecheck 2>&1 | tail -3 && node scripts/audit-timer-classes.mjs 2>&1 | tail -2`
Expected: すべて緑

- [ ] **Step 7: E2E の layout と timer を流す**

Run: `cd e2e && TASUKI_E2E_TARGET=local pnpm exec playwright test specs/layout.spec.ts specs/timer.spec.ts specs/timer-a11y.spec.ts 2>&1 | tail -10`
Expected: すべて緑

- [ ] **Step 8: コミット**

```bash
git add apps/timer-web
git commit -m "feat: timer の器と 2 列を部品層に載せ、幅判定を 64rem の問い合わせにする（#316 PR 1）"
```

---

### Task 8: 検査一式

- [ ] **Step 1: 手元の CI 一式**

Run: `bash -c 'pnpm test 2>&1 | tail -4; pnpm lint 2>&1 | tail -3; pnpm typecheck 2>&1 | tail -3; for f in scripts/audit-*.mjs; do case $f in *.test.mjs) continue;; esac; node $f >/dev/null 2>&1 || echo "NG $f"; done; node --test scripts/*.test.mjs 2>&1 | grep -E "^# (pass|fail)"; node scripts/check-links.mjs | tail -1'`
Expected: `NG` の行が 0・`# fail 0`・リンク検査 OK。**`pnpm test` に入っていない scripts の自己テストもここで流している**

- [ ] **Step 2: E2E 全件**

Run: `cd e2e && TASUKI_E2E_TARGET=local pnpm exec playwright test 2>&1 | tail -6`
Expected: 全件緑。`layout.spec.ts` の注釈（44px 未満の件数）を `test-results/html` で読み、Task 10 の報告に写す

- [ ] **Step 3: 変異全件**

Run: `bash -c 'node scripts/mutation-check.mjs > /tmp/claude-1000/-workspaces-claym-local-Tasuki/f9cf1c75-68af-4121-911f-8707c09354c8/scratchpad/mutation-pr1.txt 2>&1; echo exit=$?; grep -E "変異数|未検出|検出できなかった" /tmp/claude-1000/-workspaces-claym-local-Tasuki/f9cf1c75-68af-4121-911f-8707c09354c8/scratchpad/mutation-pr1.txt'`
Expected: `exit=0`・全件検出。**製品コードを触ったので既存のパッチが当たらなくなっていないか**を出力で確かめる（当たらないパッチがあるとそこで止まり、以降が無検査になる）。当たらなければ壊し方を変えずに作り直す

---

### Task 9: ADR 0025・README・設計正本

**Files:**
- Create: `docs/adr/0025-responsive-layout.md`
- Modify: `docs/adr/README.md`（索引の 0024 の行の後ろ）・`packages/ui/README.md`・`docs/superpowers/specs/2026-10-08-responsive-layout-design.md`

- [ ] **Step 1: ADR 0025 を書く**（`docs/adr/template.md` の様式）

```markdown
# ADR-0025: 幅の段・器・段組み・ボタンを部品層で揃える

- **ステータス**: Accepted
- **関連**: #316・設計正本 `docs/superpowers/specs/2026-10-08-responsive-layout-design.md`・ADR 0022（部品層）・ADR 0023 決定 4（timer は要素層を読まない）

## 背景

PC の幅で画面が狭く、ボタンの形と並びが画面ごとに違っていた（利用者のフィードバック・2026-09-26）。5 つの幅で撮った洗い出しでは、器の幅が画面ごとに 680px〜1152px に散り、幅の境目は 5 種類（rem と px が混在）、ボタンの形はアプリごとに別々だった（設計正本 §2）。

## 決定

1. **幅の段の境目は `40rem`・`64rem`・`90rem` の 3 つだけ。** 範囲構文（`(width >= 40rem)`）で書き、`min-width` / `max-width` / px / em を書かない。JS の判定も同じ問い合わせ（`matchMedia('(width >= 64rem)')`）を使う。コンテナクエリは対象外。`scripts/audit-ui-components.mjs` が守り、外すときは `ui-exempt:` で理由を書く
2. **器は部品層の `.ui-page` の 3 段から選ぶ。** 読む・入力する画面は `--prose`（40rem）、選ぶ・一覧する画面は既定（72rem）、区画を並べる道具の部屋は `--wide`（96rem）。要素層の `.page` は消した
3. **段組みは `.ui-workspace` の 3 つの区画（左脇・主・右脇）で組む。** DOM は 左脇 → 主 → 右脇 の順に書き、狭い幅ではその順に積む。広い幅で並べ替えるのは部品の CSS だけで行う。区画に何を置くかは画面が決める
4. **ボタンの見た目は部品層の `.ui-button`（形 1 つ・役割 4 種・大きさ 3 段）だけが持ち、要素層の `button` は見た目を持たない。** 押せる大きさは 44px 以上。決定した。実施は #316 PR 2（timer は PR 3）
5. **操作の並びは `.ui-actions` で組み、主は常に最後に置く。** 狭い幅では縦に積み、主の操作が画面の外へ流れる画面だけが下端に固定する。決定した。実施は #316 PR 2（timer は PR 3）
6. **timer に要素層を読ませない判断（ADR 0023 決定 4）は維持する。** ボタンの見た目が部品層から来るので、要素層を読ませる理由が無い

## 影響

- 新しい画面は器の段と区画を選ぶだけで、幅と並び替えを書かずに済む。使い方は `packages/ui/README.md` の「画面を組む」
- 段の境目が 3 つになり、画面ごとの細かな調整（420px・720px）は近い段へ寄った。寄せた結果は設計正本 §6 の撮影で確かめる
- 4 つ目の器の段や境目が要るときは、README の選び方に当てはめて足りない理由を書き、この ADR に追記する
```

`docs/adr/README.md` の索引に `| [0025](./0025-responsive-layout.md) | 幅の段・器・段組み・ボタンを部品層で揃える | Accepted |` を足す。

- [ ] **Step 2: README に「画面を組む」の節を書く**（`packages/ui/README.md` の「## 使い方」の直前に置く。部品の表に `.ui-page`・`.ui-workspace` の行も足す）

```markdown
## 画面を組む（#316・ADR 0025）

**新しい画面や機能を足すときは、器の段と区画を選ぶ。** 幅の値と並び替えは書かない。

### 幅の段

| 段 | 幅 | 想定する端末 |
|---|---|---|
| compact | `< 40rem` | スマホの縦持ち |
| medium | `40rem` 〜 `64rem` | タブレットの縦持ち・小さい窓 |
| wide | `64rem` 〜 `90rem` | ノート PC |
| ultra | `≥ 90rem` | 大きなモニター |

画面の CSS に `@media` を書くときは、この 3 つの境目だけを範囲構文で書く（`@media (width >= 64rem)`）。
`min-width` / `max-width` / px / em は検査（`scripts/audit-ui-components.mjs`）が落とす。JS で幅を判定するときも
`matchMedia('(width >= 64rem)')` の形で同じ境目を使う。部品の内側の並び替えはコンテナクエリで書いてよい（段の約束の外）。

### 器（`.ui-page`）の選び方

| 画面の用途 | 器 | 最大幅 |
|---|---|---|
| 読む・入力する（名乗る・待つ・見つからない・まとめ） | `.ui-page .ui-page--prose` | `40rem` |
| 選ぶ・一覧する（道具を選ぶ・履歴） | `.ui-page` | `72rem` |
| 道具の部屋（区画を横に並べる） | `.ui-page .ui-page--wide` | `96rem` |

器は `<main>` に当てる。外の余白も器が持つので、画面の CSS で `<main>` に `padding` や `max-width` を書かない。

### 段組み（`.ui-workspace`）

区画は 3 つ。**DOM は 左脇 → 主 → 右脇 の順に書く**（狭い幅ではこの順に積まれ、読み上げの順とも揃う）。

| 区画 | 置くもの | wide | ultra |
|---|---|---|---|
| `.ui-workspace-rail`（左脇・`18rem`） | 主の前に知っておきたいもの（参加者・いまのお題） | 右の列の上 | 主の左 |
| `.ui-workspace-main`（主） | この画面の操作の主役 | 左の広い列 | 中央 |
| `.ui-workspace-aside`（右脇・`22rem`） | 主の脇で参照するもの（お題・メモ） | 右の列の下 | 主の右 |

- 段組みは `--wide` の器の中で使う。主の幅（`32rem` 以上）は器と段の境目の計算で保たれる
- 使わない区画は書かなくてよい。空の列は作られない
- どの画面がどの器・区画を使っているかは `git grep -n "ui-page\|ui-workspace" apps` で引ける
```

同じ README の「3 層構造」の表の timer の行にある「読ませるかは #316 で判断する（ADR-0023 決定 4）」を「#316 でも読ませないと決めた（ADR 0025 決定 6）。ボタンの見た目は部品層から来る」に替える（`grep -n "#316 で判断" packages/ui/README.md` で 1 件であることを確かめてから替える）。

- [ ] **Step 3: 設計正本に PR 1 で決めた細部を反映する**

`docs/superpowers/specs/2026-10-08-responsive-layout-design.md` の D3 の「**左脇を DOM のどこに置くかを部品は強制しない。** …」の箇条を「**DOM は 左脇 → 主 → 右脇 の順に書く。** 狭い幅の見た目の順と読み上げの順を揃えるため（PR 1 で『主 → 脇』から改めた）」に替え、「主の区画は最小幅 `32rem` を持ち…」の箇条を、計画の「設計正本との差」の 2 点目の内容（`minmax(0, 1fr)` と計算による保証・E2E で測る）に替える。§4 の表の PR 1 の行に「timer の `Stage` と 2 列・`useIsWide`（死んだ部品の検査を満たすため）。timer の 48rem は PR 3 まで `ui-exempt:`」を足す。

- [ ] **Step 4: リンク検査と書き方の確認**

Run: `node scripts/check-links.mjs | tail -1 && node scripts/audit-plan-gate.mjs | tail -1 && grep -n "完了した\|済み" docs/adr/0025-responsive-layout.md`
Expected: リンク検査 OK・計画のゲート OK・ADR に完了形の記述が無い（決定 4・5 は「実施は PR 2」）

- [ ] **Step 5: コミット**

```bash
git add docs/adr packages/ui/README.md docs/superpowers/specs/2026-10-08-responsive-layout-design.md
git commit -m "docs: 幅の段・器・段組みを ADR 0025 と packages/ui の README に残す（#316 PR 1）"
```

---

### Task 10: 実画面の比較・利用者への確認・PR

- [ ] **Step 1: 洗い出しの撮影を流す**（main の撮影は `scratchpad/inventory/` に既にある）

Run: `cd e2e && INV_OUT=/tmp/claude-1000/-workspaces-claym-local-Tasuki/f9cf1c75-68af-4121-911f-8707c09354c8/scratchpad/inventory-pr1 TASUKI_E2E_TARGET=local pnpm exec playwright test -c inventory-316/playwright.config.ts 2>&1 | tail -4`
Expected: 4 件 passed。`report.json` の器の幅を main と並べ、poker・お題ツールが 1280px で 1184px・1920px で 1536px、玄関の名乗る画面が 640px であることを確かめる

- [ ] **Step 2: 画像を並べて読む**

次を main と PR 1 で 1 枚ずつ開いて見比べる: `poker-voting@{320,1280,1920}`・`topic-set@{320,1280,1920}`・`landing-create@1280`・`landing-choice@{320,1280}`・`timer-session@{320,1280}`。見た目の変化を「受け入れる変化」と「崩れ」に分けて書き出す（崩れがあれば直してから先へ進む）

- [ ] **Step 3: push して PR を作る**（マージしない）

```bash
git push -u origin feature/issue-316-pr1-layout
gh pr create --title "feat: 幅の段・器・段組みを部品層に置く（#316 PR 1）" --body-file <本文のファイル>
```

本文は `.claude/rules/git-workflow.md` の構成（概要・変更内容・テスト方法）に、「見た目の変化（Step 2 の書き出し）」「44px 未満の件数（Task 8 の注釈）」「次の PR（PR 2: ボタンと操作の並び）」を足す。**閉鎖キーワード（`Closes #316` など）を書かない**（PR 4 まで #316 は開いたまま）。末尾に Claude Code の生成の署名を付ける。

- [ ] **Step 4: #316 の本文に進み具合の節を置く**

`gh issue view 316 --json body -q .body` で本文を取り、末尾に「## 進み具合」の節（PR 1〜4 の表。PR 1 の行に PR 番号と状態）を足して `gh issue edit 316 --body-file` で戻す。

- [ ] **Step 5: 利用者に報告する**

PR の URL・見た目の変化・44px 未満の件数・見積もりと実際の時間・Task 6 で 640px の判断が要ったかを伝え、Chrome の実画面で poker（1280・1920・スマホ）とお題ツールを見てもらうよう頼む。
