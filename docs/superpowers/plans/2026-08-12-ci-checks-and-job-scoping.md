# 検査の CI 組み込みとジョブ絞り込み 実装計画（#70）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手動でしか走らない検査（構造監査・自己テスト・変異検査）とリンク検査・shellcheck を CI へ寄せ、変更内容に応じて走らせるジョブを絞る。

**Architecture:** GitHub Actions のジョブを 3 から 5 へ増やす（`ci` / `quality` 新設 / `docs` 新設 / `audit` / `e2e`）。絞り込みは各ジョブの先頭で `scripts/ci-scope.mjs` を走らせ、ステップ単位の `if:` で早期成功させる形（ジョブは常に起動し常に `success` を報告する）。判定とリンク検査はいずれも純関数へ閉じ込め、`node --test` の自己テストで守る。

**Tech Stack:** GitHub Actions / Node 22（`node --test`）/ pnpm 11.5.0 / shellcheck 0.9

**設計書:** [`docs/superpowers/specs/2026-08-12-ci-checks-and-job-scoping-design.md`](../specs/2026-08-12-ci-checks-and-job-scoping-design.md)

## Global Constraints

- **作業は overlay 側のクローン `/home/vscode/tasuki-work` で行う。** `/workspaces/claym/local/Tasuki` は 9p マウントで約 48 倍遅く、ディレクトリの rename と `rm -rf` が壊れる
- **利用者が見ているのは `/workspaces/claym/local/Tasuki` の方。** 成果物を overlay にだけ作って「書きました」と言わない
- Node は `>=22.22.2`、pnpm は 11.5.0（`packageManager` 宣言に従う）
- **新しい検査を足したら、わざと壊して赤を見てからコミットする（MUST・憲法 原則 VII）**
- **1 PR は 1 つの論理的変更に留める（MUST・憲法 原則 IX）**
- **利用者から見える振る舞いを変えない（epic #67 の全体制約）。** 本計画は CI と文書のみを触り、`packages/**` と `apps/**` の製品コードには一切手を入れない
- コメント・docstring・文書は日本語。コミットメッセージは Conventional Commits（`<type>: <日本語の説明>`）
- **ADR は不変の記録。** 判断が覆ったら削除せず新しい ADR で `Superseded` する
- **`docs/adr/0003` と `docs/adr/0008` の `docs/BACKLOG.md` への言及は直さない。** 不在は ADR 0003 の決定が実行された結果であり、記録として正しい

## File Structure

| ファイル | 責務 |
|---|---|
| `scripts/check-links.mjs`（新規） | 文書のリンク検査。Markdown のコード領域を除外し、相対リンク・アンカー・コードパスの 3 種を検査する |
| `scripts/check-links.test.mjs`（新規） | 上の純関数部分の自己テスト。fixture は文字列リテラルで渡し、ファイルシステムに依存しない |
| `scripts/ci-scope.mjs`（新規） | 変更ファイル一覧から `code` / `deps` を判定し `$GITHUB_OUTPUT` へ書く。判定不能なら全部 true |
| `scripts/ci-scope.test.mjs`（新規） | `decideScope` の自己テスト |
| `scripts/audit-structure.mjs`（変更） | `formatTable` を export し、数値目標を持たない指標の判定列を `—` にする |
| `scripts/audit-structure.test.mjs`（変更） | `formatTable` の自己テストを追加 |
| `.github/workflows/ci.yml`（変更） | 5 ジョブ構成・`concurrency`・絞り込みの配線 |
| `docs/adr/0009-ci-scope-and-checks.md`（新規） | 決定 D1〜D6 |
| `docs/guides/development.md`（変更） | CI の構成表と、必須チェックが永久待ちにならない理由 |
| `deploy/README.md`（変更） | 手作業が残る箇所の明示 |
| 文書 5 ファイル（変更） | 壊れたリンク 4 件・アンカー 1 件の修正 |

## PR の割り方（憲法 原則 IX: 1 PR = 1 論理変更）

| PR | 論理変更 | Task |
|---|---|---|
| PR-1 | 設計書と実装計画（本文書） | — |
| PR-2 | **リンク検査を新設して CI で回す** | Task 1〜5 |
| PR-3 | **手動でしか走らない検査を CI へ寄せる** | Task 6〜7 |
| PR-4 | **変更内容に応じて走らせるジョブを絞る** | Task 8〜11 |
| PR-5 | **決定と手順を文書化する** | Task 12〜15 |
| PR-6 | 振り返り | Task 16 |

ブランチは次の順で積む。**`--delete-branch` を付けない**（積み上げ中のブランチが消えると後続 PR の base が失われる）。

```
main
 └ docs/70-ci-design        PR-1  設計書・実装計画
    └ feat/70-check-links    PR-2
       └ chore/70-checks-to-ci  PR-3
          └ ci/70-job-scoping      PR-4
             └ docs/70-decisions      PR-5
                └ docs/70-retrospective  PR-6
```

**PR-2 以降は `docs/70-ci-design` の上に積みます**（当初 PR-2 の base を `main` としていたのを変更）。設計書と実装計画が作業ツリーに存在しないと、Task 11 Step 4（実測値を設計書へ追記する）が実行できないためです。

---

## Task 1: リンク検査のコード領域除外と slug 生成

**Files:**
- Create: `scripts/check-links.mjs`
- Test: `scripts/check-links.test.mjs`

**Interfaces:**
- Produces: `fenceMask(src) → boolean[]`（各行がフェンス内か。判定はここ 1 箇所に集約する）、`stripCodeRegions(src) → string[]`（行数を保ったまま、フェンス内の行とインラインコードを空白で潰す）、`toAnchor(heading) → string`、`collectAnchors(src) → Set<string>`

**背景（実装者向け）:** この 2 つの関数が検査全体の土台です。コード領域を読まないのは検出精度の話ではなく正しさの話で、リポジトリには `[x](no-such-file.md)` のように**意図的に壊れたリンクを説明文として書いた文書**があります。これを直すと検査手順の記録が壊れます。`toAnchor` は GitHub のアンカー生成規則の再現で、**空白の連続を 1 個のハイフンに潰してはいけません**（1 空白 = 1 ハイフン）。この規則は `docs/poker/specs/001-planning-poker-mvp/contracts/ws-protocol.md` の 18 見出しを GitHub の HTML レンダリング API と突き合わせて確認済みです。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/check-links.test.mjs` を新規作成:

```js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stripCodeRegions, toAnchor, collectAnchors } from "./check-links.mjs";

describe("stripCodeRegions", () => {
  test("フェンス内の行を空にする", () => {
    // Given: フェンスに囲まれた壊れたリンクを含む文書
    const src = ["本文の [ok](./a.md)", "```bash", "[x](no-such-file.md)", "```", "末尾"].join("\n");
    // When
    const lines = stripCodeRegions(src);
    // Then: 行数は保たれ、フェンスの中身は消える
    assert.equal(lines.length, 5);
    assert.equal(lines[0], "本文の [ok](./a.md)");
    assert.equal(lines[2], "");
    assert.equal(lines[4], "末尾");
  });

  test("本文中のインラインコードを空白で潰す", () => {
    // Given: 説明文としてインラインコードに入れた壊れたリンク
    const src = "実在しないリンク `[x](no-such-file.md)` を一時的に書く";
    // When
    const lines = stripCodeRegions(src);
    // Then: 元の文字数は保たれ、リンク記法は残らない
    assert.equal(lines[0].length, src.length);
    assert.ok(!lines[0].includes("no-such-file.md"));
  });

  test("チルダのフェンスも閉じる", () => {
    // Given
    const src = ["~~~", "[x](no.md)", "~~~", "[ok](./a.md)"].join("\n");
    // When
    const lines = stripCodeRegions(src);
    // Then
    assert.equal(lines[1], "");
    assert.equal(lines[3], "[ok](./a.md)");
  });

  test("4 個で開いたフェンスは 3 個の行では閉じない", () => {
    // Given: バッククォート 4 個の中に 3 個のフェンスがネストしている
    //        （docs/superpowers/plans/2026-06-07-tasuki-vps-deployment.md の実例）
    const src = ["````markdown", "```bash", "# コメント", "```", "````", "[ok](./a.md)"].join("\n");
    // When
    const lines = stripCodeRegions(src);
    // Then: 外側フェンスの中身はすべて空になり、閉じた後の本文だけ残る
    assert.deepEqual(lines, ["", "", "", "", "", "[ok](./a.md)"]);
  });

  test("情報文字列つきの行は閉じフェンスにならない", () => {
    // Given
    const src = ["```", "text", "```bash", "まだフェンス内", "```", "[ok](./a.md)"].join("\n");
    // When
    const lines = stripCodeRegions(src);
    // Then
    assert.equal(lines[3], "");
    assert.equal(lines[5], "[ok](./a.md)");
  });

  test("開いたフェンスより長い行でも閉じられる", () => {
    // Given: CommonMark は「同じ長さ以上」を閉じフェンスとして認める
    const src = ["```", "text", "`````", "[ok](./a.md)"].join("\n");
    // When / Then
    assert.equal(stripCodeRegions(src)[3], "[ok](./a.md)");
  });

  test("チルダで開いたフェンスはバッククォートでは閉じない", () => {
    // Given
    const src = ["~~~", "```", "まだフェンス内", "~~~", "[ok](./a.md)"].join("\n");
    // When
    const lines = stripCodeRegions(src);
    // Then
    assert.equal(lines[2], "");
    assert.equal(lines[4], "[ok](./a.md)");
  });
});

describe("toAnchor", () => {
  // GitHub の HTML レンダリング API と突き合わせて 18/18 一致を確認した対応表
  const CASES = [
    ["Contract: WebSocket メッセージプロトコル", "contract-websocket-メッセージプロトコル"],
    ["共通事項", "共通事項"],
    ["C→S メッセージ", "cs-メッセージ"],
    ["create-room — ルーム作成（FR-001, FR-002）", "create-room--ルーム作成fr-001-fr-002"],
    ["vote — 投票・票の変更（FR-005〜007）", "vote--投票票の変更fr-005007"],
    ["公開に耐えるための防御（#63）", "公開に耐えるための防御63"],
    ["サーバー内部イベント（メッセージ以外の契約）", "サーバー内部イベントメッセージ以外の契約"],
    ["結合テスト観点（apps/sync, research R7）", "結合テスト観点appssync-research-r7"],
  ];
  for (const [heading, expected] of CASES) {
    test(`${heading} → ${expected}`, () => {
      assert.equal(toAnchor(heading), expected);
    });
  }

  test("空白の連続を 1 個に潰さない", () => {
    // Given: 記号を挟んで空白が 2 つ並ぶ見出し（GitHub はハイフン 2 個を出す）
    // When / Then
    assert.equal(toAnchor("a — b"), "a--b");
  });
});

describe("collectAnchors", () => {
  test("フェンス内の # 行を見出しと誤認しない", () => {
    // Given: シェルのコメントがフェンス内にある
    const src = ["# 本物の見出し", "```bash", "# これはコメント", "```"].join("\n");
    // When
    const anchors = collectAnchors(src);
    // Then
    assert.deepEqual([...anchors], ["本物の見出し"]);
  });

  test("同名の見出しには連番を付ける", () => {
    // Given
    const src = ["## 決定", "## 決定", "## 決定"].join("\n");
    // When
    const anchors = collectAnchors(src);
    // Then: GitHub と同じく 2 個目以降へ -1 / -2 が付く
    assert.deepEqual([...anchors].sort(), ["決定", "決定-1", "決定-2"]);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `cd /home/vscode/tasuki-work && node --test scripts/check-links.test.mjs`
Expected: FAIL（`Cannot find module './check-links.mjs'`）

- [ ] **Step 3: 最小の実装を書く**

`scripts/check-links.mjs` を新規作成:

```js
#!/usr/bin/env node
/**
 * 文書のリンク検査（#70）。
 *
 *   node scripts/check-links.mjs
 *
 * 3 種を検査する。
 *   1. 相対リンク  [text](path)         全 *.md
 *   2. アンカー    [text](path#anchor)  全 *.md
 *   3. コードパス  `packages/foo.ts`    LIVE_DOCS に属する文書のみ
 *
 * **Markdown のコード領域（フェンス・インラインコード）はリンク検査の対象外。**
 * 検査手順を説明する文書が `[x](no-such-file.md)` のような例示を含むため、
 * ここを読むと「意図的に壊れたリンク」を実害として報告してしまう。
 */

/**
 * 各行がコードフェンスの内側（フェンス行自体を含む）かどうかを返す。
 *
 * **閉じフェンスは「開いたフェンスと同じ文字」「同じ長さ以上」「他に内容が無い」の
 * 3 つを満たす必要がある**（CommonMark）。長さを見ないと、```` で開いたブロックの
 * 中にある ``` が外側を閉じてしまい、コード領域の中身が本文として漏れる。
 * リポジトリの `docs/superpowers/plans/2026-06-07-tasuki-vps-deployment.md`（425 行で
 * ```` で開き、495 行に ```bash がある）で実際に再現した欠陥。
 *
 * フェンス判定はここ 1 箇所に集約する。stripCodeRegions と findInlineCodePaths が
 * 別々に持つと、片方だけ直したときに同じ穴が残る。
 */
export function fenceMask(src) {
  const mask = [];
  let fence = null; // { char, length }
  for (const line of src.split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (marker && fence === null) {
      fence = { char: marker[0], length: marker.length };
      mask.push(true);
      continue;
    }
    // ```bash のような情報文字列つきの行は開始フェンスであって閉じフェンスではない
    if (
      marker &&
      fence !== null &&
      marker[0] === fence.char &&
      marker.length >= fence.length &&
      line.trim() === marker
    ) {
      fence = null;
      mask.push(true);
      continue;
    }
    mask.push(fence !== null);
  }
  return mask;
}

/**
 * フェンス内の行を空文字にし、本文中のインラインコードを同じ長さの空白へ置き換える。
 * 行番号を報告できるように、行数と各行の文字数は保つ。
 */
export function stripCodeRegions(src) {
  const mask = fenceMask(src);
  return src
    .split("\n")
    .map((line, i) => (mask[i] ? "" : line.replace(/`[^`\n]*`/g, (s) => " ".repeat(s.length))));
}

/**
 * 見出しの文字列を GitHub のアンカーへ変換する。
 *
 * **空白の連続を 1 個のハイフンへ潰さない**（`\s+` ではなく `\s`）。
 * GitHub は空白 1 個につきハイフン 1 個を出すため、`a — b` は `a--b` になる。
 * ws-protocol.md の 18 見出しで GitHub のレンダリング結果と一致を確認済み。
 */
export function toAnchor(heading) {
  return heading
    .replace(/`/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** 文書中の見出しから、GitHub と同じ規則でアンカーの集合を作る（同名は -1, -2 …）。 */
export function collectAnchors(src) {
  const seen = new Map();
  const anchors = new Set();
  for (const line of stripCodeRegions(src)) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (!m) continue;
    const base = toAnchor(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  return anchors;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd /home/vscode/tasuki-work && node --test scripts/check-links.test.mjs`
Expected: PASS（`# pass 13` / `# fail 0`）

- [ ] **Step 5: わざと壊して赤を見る**

`toAnchor` の `.replace(/\s/g, "-")` を `.replace(/\s+/g, "-")` に一時的に変える。

Run: `cd /home/vscode/tasuki-work && node --test scripts/check-links.test.mjs`
Expected: FAIL（`create-room — ルーム作成…` と `a — b` の 2 件以上が落ちる）

確認したら元に戻す: `git checkout -- scripts/check-links.mjs` ではなく、変えた 1 文字だけを手で戻す（このファイルはまだコミットしていないため `git checkout` では消える）。

- [ ] **Step 6: コミット**

```bash
cd /home/vscode/tasuki-work
git switch -c feat/70-check-links
git add scripts/check-links.mjs scripts/check-links.test.mjs
git commit -m "feat: #70 リンク検査のコード領域除外と slug 生成を追加する

- Markdown のフェンス・インラインコードを検査対象から外す
- GitHub のアンカー生成規則を再現（空白 1 個 = ハイフン 1 個）
- ws-protocol.md の 18 見出しを GitHub のレンダリング結果と突き合わせた対応表をテストに持つ"
```

---

## Task 2: 3 種の検査本体

**Files:**
- Modify: `scripts/check-links.mjs`
- Test: `scripts/check-links.test.mjs`

**Interfaces:**
- Consumes: `fenceMask`, `stripCodeRegions`, `collectAnchors`（Task 1）
- Produces: `findRelativeLinks(src) → {target, line}[]`、`findInlineCodePaths(src) → {text, line}[]`、`isRepoPathLike(text) → boolean`

**背景（実装者向け）:** 検査そのものはファイルシステムを触りますが、**抽出は純関数に分けます**。テストがファイルの実在に依存すると、リポジトリの中身が変わるたびにテストが壊れるためです。`isRepoPathLike` は「バッククォートの中身がリポジトリ内のファイルパスに見えるか」の判定で、拡張子が無いもの（`docs/adr/0002` のような ADR 番号の接頭辞参照）を弾くのが要点です。これを入れないと、現役文書だけで 193 件の偽陽性が出ます。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/check-links.test.mjs` の末尾に追記:

```js
import { findRelativeLinks, findInlineCodePaths, isRepoPathLike } from "./check-links.mjs";

describe("findRelativeLinks", () => {
  test("相対リンクを行番号つきで拾う", () => {
    // Given
    const src = ["# 見出し", "本文 [a](./a.md) と [b](../b.md#節)", "[外](https://example.com)"].join("\n");
    // When
    const links = findRelativeLinks(src);
    // Then: http は対象外
    assert.deepEqual(links, [
      { target: "./a.md", line: 2 },
      { target: "../b.md#節", line: 2 },
    ]);
  });

  test("フェンス内のリンクは拾わない", () => {
    // Given
    const src = ["```", "[x](no-such-file.md)", "```"].join("\n");
    // When / Then
    assert.deepEqual(findRelativeLinks(src), []);
  });

  test("同一文書内のアンカーだけのリンクも拾う", () => {
    // Given
    const src = "[節へ](#見出し)";
    // When / Then
    assert.deepEqual(findRelativeLinks(src), [{ target: "#見出し", line: 1 }]);
  });
});

describe("isRepoPathLike", () => {
  test("拡張子つきのリポジトリ内パスを受け入れる", () => {
    assert.equal(isRepoPathLike("packages/timer-core/src/evolve.ts"), true);
    assert.equal(isRepoPathLike("docs/adr/0002-document-system-three-layers.md"), true);
  });

  test("ADR 番号の接頭辞参照を弾く", () => {
    // Given: 拡張子が無い。実ファイルは 0002-document-system-three-layers.md
    // When / Then
    assert.equal(isRepoPathLike("docs/adr/0002"), false);
  });

  test("グロブ・変数展開・空白を含むものを弾く", () => {
    assert.equal(isRepoPathLike("packages/*/src/index.ts"), false);
    assert.equal(isRepoPathLike("apps/${APP}/dist/main.js"), false);
    assert.equal(isRepoPathLike("docs/a b.md"), false);
  });

  test("リポジトリ外に見えるものを弾く", () => {
    assert.equal(isRepoPathLike("node_modules/foo/index.js"), false);
    assert.equal(isRepoPathLike("./relative.md"), false);
  });
});

describe("findInlineCodePaths", () => {
  test("行番号を落として拾う", () => {
    // Given: 行番号つきの引用
    const src = "詳細は `packages/timer-core/src/problem.ts:70` と `scripts/audit-structure.mjs:5-6` を見る";
    // When
    const found = findInlineCodePaths(src);
    // Then: 突き合わせ用に行番号を落とし、原文も残す
    assert.deepEqual(found, [
      { path: "packages/timer-core/src/problem.ts", raw: "packages/timer-core/src/problem.ts:70", line: 1 },
      { path: "scripts/audit-structure.mjs", raw: "scripts/audit-structure.mjs:5-6", line: 1 },
    ]);
  });

  // 次の 2 件は対照実験。フェンスの有無だけが違う。
  // フェンス内の行にバッククォート引用を置かないと、fenceMask への委譲を丸ごと
  // 無効化してもテストが通ってしまう（恒真になる）。
  test("フェンス内のバッククォート引用は拾わない", () => {
    // Given: フェンスの中に、バッククォートで囲んだリポジトリパスがある
    const src = ["```bash", "詳細は `scripts/nonexistent.mjs` を見る", "```"].join("\n");
    // When / Then
    assert.deepEqual(findInlineCodePaths(src), []);
  });

  test("同じ内容でもフェンスの外なら拾う", () => {
    // Given: 上のテストからフェンスだけを外したもの
    const src = "詳細は `scripts/nonexistent.mjs` を見る";
    // When / Then
    assert.deepEqual(findInlineCodePaths(src), [
      { path: "scripts/nonexistent.mjs", raw: "scripts/nonexistent.mjs", line: 1 },
    ]);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `cd /home/vscode/tasuki-work && node --test scripts/check-links.test.mjs`
Expected: FAIL（`findRelativeLinks is not a function` 等）

- [ ] **Step 3: 実装を書く**

`scripts/check-links.mjs` の `collectAnchors` の下に追記:

```js
/** リポジトリのルート直下で、コードパスの引用があり得るディレクトリ。 */
const REPO_TOP_LEVEL = /^(packages|apps|scripts|docs|deploy|e2e|\.github|\.specify)\//;

/** バッククォートの中身がリポジトリ内のファイルパスに見えるか。 */
export function isRepoPathLike(text) {
  if (!REPO_TOP_LEVEL.test(text)) return false;
  if (/\s/.test(text)) return false;
  // グロブ・変数展開・リダイレクトを含むものはコマンド例なので対象外
  if (/[*?<>{}$|]/.test(text)) return false;
  // 拡張子が無いものは参照記法（`docs/adr/0002` のような ADR 番号の接頭辞）とみなす
  return /\.[a-z0-9]+(:\d+(-\d+)?)?$/i.test(text);
}

/** コード領域の外にある相対リンクを、行番号つきで拾う。 */
export function findRelativeLinks(src) {
  const found = [];
  stripCodeRegions(src).forEach((line, i) => {
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:)/.test(target)) continue;
      found.push({ target, line: i + 1 });
    }
  });
  return found;
}

/**
 * フェンスの外にあるインラインコードからパスを拾う。
 *
 * フェンスの判定は fenceMask に委ねる（Task 1）。ここで独自に持つと、
 * 片方だけ直したときに同じ穴が残る。
 */
export function findInlineCodePaths(src) {
  const found = [];
  const mask = fenceMask(src);
  src.split("\n").forEach((line, i) => {
    if (mask[i]) return;
    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      const raw = m[1].trim();
      if (!isRepoPathLike(raw)) continue;
      found.push({ path: raw.replace(/:\d+(-\d+)?$/, ""), raw, line: i + 1 });
    }
  });
  return found;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd /home/vscode/tasuki-work && node --test scripts/check-links.test.mjs`
Expected: PASS（`# fail 0`）

- [ ] **Step 5: わざと壊して赤を見る**

`isRepoPathLike` の最後の `return /\.[a-z0-9]+(:\d+(-\d+)?)?$/i.test(text);` を `return true;` に一時的に変える。

Run: `cd /home/vscode/tasuki-work && node --test scripts/check-links.test.mjs`
Expected: FAIL（`ADR 番号の接頭辞参照を弾く` が落ちる）

確認したらその 1 行を手で戻す。

- [ ] **Step 6: コミット**

```bash
cd /home/vscode/tasuki-work
git add scripts/check-links.mjs scripts/check-links.test.mjs
git commit -m "feat: #70 リンク検査の抽出関数 3 つを追加する

- 相対リンク・インラインコード内パスの抽出を純関数に分ける
- 拡張子の無い参照記法（docs/adr/0002 のような ADR 番号）を弾く
- 拡張子判定を外すと現役文書だけで 193 件の偽陽性が出る"
```

---

## Task 3: 対象範囲・例外表・空振り防止

**Files:**
- Modify: `scripts/check-links.mjs`
- Test: `scripts/check-links.test.mjs`

**Interfaces:**
- Consumes: `findRelativeLinks`, `findInlineCodePaths`, `collectAnchors`（Task 1〜2）
- Produces: `LIVE_DOCS`（配列）、`MISSING_PATH_EXCEPTIONS`（配列）、`isLiveDoc(relPath) → boolean`、`checkConstants({exists}) → string[]`、`checkStaleExceptions(usedPaths) → string[]`、`runCheck({root}) → {findings, scanned}`

**背景（実装者向け）:** ここが本スクリプトで最も重要な部分です。過去にこのリポジトリは「構造監査が存在しないパスを走査して全指標 0 で PASS 表示」という事故を踏んでおり、いま #71 が抱えている `.specify/feature.json` も実在しないディレクトリを指してスクリプトを全滅させています。**同じ穴を最初から塞いだ形で作ります。**

例外表は 1 エントリだけです。`docs/BACKLOG.md` は `docs/adr/0003` の決定「バックログは GitHub Issues に一本化する。`docs/BACKLOG.md` は廃止する」が実行された結果として存在しないので、ADR 本文の言及は記録として正しく、**直してはいけません**。例外表は形骸化の入口なので、**使われなくなったエントリを落とす検査**を必ず併設します。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/check-links.test.mjs` の末尾に追記:

```js
import {
  LIVE_DOCS,
  MISSING_PATH_EXCEPTIONS,
  isLiveDoc,
  checkConstants,
  checkStaleExceptions,
} from "./check-links.mjs";

describe("isLiveDoc", () => {
  test("現役の規範文書を受け入れる", () => {
    assert.equal(isLiveDoc("README.md"), true);
    assert.equal(isLiveDoc("docs/adr/0009-ci-scope-and-checks.md"), true);
    assert.equal(isLiveDoc("deploy/README.md"), true);
  });

  test("履歴文書と vendor を弾く", () => {
    // Given: monorepo 統合前の表記で書かれた当時の記録、および spec-kit の vendor
    // When / Then
    assert.equal(isLiveDoc("docs/superpowers/plans/2026-08-04-monorepo-s0-s1.md"), false);
    assert.equal(isLiveDoc("docs/poker/specs/001-planning-poker-mvp/tasks.md"), false);
    assert.equal(isLiveDoc("docs/timer/adr/0009-test-conventions.md"), false);
    assert.equal(isLiveDoc(".claude/skills/speckit-plan/SKILL.md"), false);
  });

  test("docs/README.md は現役だが docs/ 全体は現役ではない", () => {
    // Given: 完全一致のエントリと前方一致のエントリを混ぜている
    // When / Then
    assert.equal(isLiveDoc("docs/README.md"), true);
    assert.equal(isLiveDoc("docs/BACKLOG.md"), false);
  });

  test("完全一致のエントリを前方一致で判定しない", () => {
    // Given: 完全一致エントリの名前で始まるだけの別ファイル
    //        （この 2 行が無いと、完全一致の条件を前方一致へ壊しても検出できない）
    // When / Then
    assert.equal(isLiveDoc("docs/README.md.bak"), false);
    assert.equal(isLiveDoc("AGENTS.md.bak"), false);
  });
});

describe("checkConstants", () => {
  test("LIVE_DOCS に実在しないパスがあれば報告する", () => {
    // Given: 実在しないと答える exists
    const exists = (p) => p !== "docs/guides/";
    // When
    const errors = checkConstants({ exists });
    // Then
    assert.equal(errors.length, 1);
    assert.match(errors[0], /docs\/guides\//);
  });

  test("すべて実在すれば空", () => {
    // Given
    const exists = () => true;
    // When / Then
    assert.deepEqual(checkConstants({ exists }), []);
  });
});

describe("checkStaleExceptions", () => {
  test("一度も使われなかった例外を報告する", () => {
    // Given: 例外表のどのパスにも触れなかった走査
    const used = new Set();
    // When
    const errors = checkStaleExceptions(used);
    // Then
    assert.equal(errors.length, MISSING_PATH_EXCEPTIONS.length);
    assert.match(errors[0], /docs\/BACKLOG\.md/);
  });

  test("使われた例外は報告しない", () => {
    // Given
    const used = new Set(MISSING_PATH_EXCEPTIONS.map((e) => e.path));
    // When / Then
    assert.deepEqual(checkStaleExceptions(used), []);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `cd /home/vscode/tasuki-work && node --test scripts/check-links.test.mjs`
Expected: FAIL（`LIVE_DOCS is not defined` 等）

- [ ] **Step 3: 実装を書く**

`scripts/check-links.mjs` に追記（`findInlineCodePaths` の下）:

```js
/**
 * コードパス検査の対象になる「現役の規範文書」。
 *
 * 設定ファイルではなく定数として持つ。設定ファイルにすると
 * 「対象から外した」変更がコード差分に出ず、静かに検査が痩せるため。
 * 末尾が "/" のものは前方一致、そうでないものは完全一致。
 */
export const LIVE_DOCS = [
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "docs/README.md",
  "docs/adr/",
  "docs/guides/",
  "deploy/",
  ".github/",
  "e2e/",
  ".specify/memory/",
];

/**
 * 「実在しないことが正しい」パス。
 *
 * 削除されたファイルへの言及が、決定の記録として正しい場合がある。
 * コードフェンスの除外では救えない（記法で区別できない）ため例外表を持つ。
 * **使われなくなったエントリは checkStaleExceptions が落とす。**
 */
export const MISSING_PATH_EXCEPTIONS = [
  {
    path: "docs/BACKLOG.md",
    reason: "docs/adr/0003 の決定により廃止済み。ADR 本文の言及は記録として正しい",
  },
  {
    path: "apps/timer-sync/.env",
    reason: "gitignore 対象。deploy/timer/NOTES.md は、この実 env を各自で作る手順を案内している",
  },
];

export function isLiveDoc(relPath) {
  return LIVE_DOCS.some((entry) =>
    entry.endsWith("/") ? relPath.startsWith(entry) : relPath === entry,
  );
}

/**
 * 定数が実在しないパスを指していないか検査する。
 *
 * 構造監査が存在しないパスを走査して全指標 0 で PASS した過去、および
 * .specify/feature.json が実在しないディレクトリを指してスクリプトを
 * 全滅させている現状と同型の事故を、最初から塞ぐ。
 */
export function checkConstants({ exists }) {
  const errors = [];
  for (const entry of LIVE_DOCS) {
    if (!exists(entry)) errors.push(`LIVE_DOCS が実在しないパスを指しています: ${entry}`);
  }
  return errors;
}

/** 一度も検出を抑えなかった例外を報告する（腐った例外表を残さない）。 */
export function checkStaleExceptions(usedPaths) {
  return MISSING_PATH_EXCEPTIONS.filter((e) => !usedPaths.has(e.path)).map(
    (e) => `使われていない例外が残っています: ${e.path}（${e.reason}）`,
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd /home/vscode/tasuki-work && node --test scripts/check-links.test.mjs`
Expected: PASS（`# fail 0`）

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add scripts/check-links.mjs scripts/check-links.test.mjs
git commit -m "chore: #70 リンク検査の対象範囲・例外表・空振り防止を追加する

- コードパス検査の対象を現役の規範文書に限る（履歴文書は当時の表記のため）
- docs/BACKLOG.md を例外表へ 1 件登録（ADR 0003 の決定により不在が正しい）
- 定数が実在しないパスを指していたら落とす
- 使われなくなった例外を落とす"
```

---

## Task 4: 実行部と既存の壊れ 5 件の修正

**Files:**
- Modify: `scripts/check-links.mjs`
- Modify: `docs/poker/README.md:56`
- Modify: `docs/superpowers/specs/2026-06-14-v2.4-feedback-fixes-design.md:5`
- Modify: `docs/timer/experiments/2026-06-14-ai-problem-quality-sonnet-vs-haiku.md:5`
- Modify: `docs/poker/specs/001-planning-poker-mvp/quickstart.md:31`

**Interfaces:**
- Consumes: すべての抽出・定数関数（Task 1〜3）
- Produces: `main()`（`process.exitCode` を設定する）

**背景（実装者向け）:** 修正する 5 件は実測で確定しています。**`docs/adr/0003` と `docs/adr/0008` の `docs/BACKLOG.md` 参照は直しません**（Task 3 の例外表が担当）。アンカーの修正先 `結合テスト観点appssync-research-r7` は GitHub の HTML レンダリング API が生成した実際の値です（`apps-sync` ではなく `appssync`）。

- [ ] **Step 1: 実行部を実装する**

**`import` の 3 行はファイル冒頭（先頭コメントの直後）へ置く。** ES モジュールの import は
巻き上げられるので末尾に書いても動くが、読み手が依存を見つけられなくなる。残りは末尾へ追記する。

```js
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
```

```js
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

/** git が知っているパスを NUL 区切りで取る。 */
function gitList(args) {
  return execFileSync("git", ["-C", REPO_ROOT, ...args, "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

/**
 * 走査対象と存在判定は、**ファイルシステムではなく git の追跡対象**を見る。
 *
 * ファイルシステムを見ると、gitignore 対象のもの（`apps/timer-sync/.env`・`dist/`・
 * SDD の作業ディレクトリなど）が開発者の手元にはあり CI のフレッシュな checkout には
 * 無いため、**同じコミットでもローカルと CI で結果が食い違う**。PR-2 の初回 CI で
 * 実際に踏んだ（`deploy/timer/NOTES.md:104` の `apps/timer-sync/.env` がローカルでは
 * 緑・CI では赤）。git 基準なら両者が構造的に一致する。
 */
function trackedPaths() {
  const files = gitList(["ls-files"]);
  const set = new Set(files);
  // ディレクトリも「存在する」と答えられるように、各ファイルの親を末尾 "/" 付きで積む
  for (const file of files) {
    const parts = file.split("/");
    for (let i = 1; i < parts.length; i++) set.add(parts.slice(0, i).join("/") + "/");
  }
  return set;
}

function main() {
  const tracked = trackedPaths();
  const exists = (rel) => tracked.has(rel) || tracked.has(rel.endsWith("/") ? rel : `${rel}/`);
  const errors = checkConstants({ exists });

  const files = gitList(["ls-files", "*.md"]).sort();
  if (files.length === 0) {
    errors.push("走査対象の .md が 1 件もありません（検査が空振りしています）");
  }

  const anchorCache = new Map();
  const anchorsFor = (abs) => {
    if (!anchorCache.has(abs)) {
      anchorCache.set(abs, fs.existsSync(abs) ? collectAnchors(fs.readFileSync(abs, "utf8")) : null);
    }
    return anchorCache.get(abs);
  };
  const usedExceptions = new Set();
  const exceptionPaths = new Set(MISSING_PATH_EXCEPTIONS.map((e) => e.path));

  for (const rel of files) {
    const abs = path.resolve(REPO_ROOT, rel);
    const src = fs.readFileSync(abs, "utf8");
    const dir = path.dirname(abs);

    for (const { target, line } of findRelativeLinks(src)) {
      const [filePart, hash] = target.split("#");
      const targetAbs = filePart ? path.resolve(dir, filePart) : abs;
      // 相対リンクの解決先も git 基準で見る（リポジトリ外を指すものは追跡集合に無い）
      if (filePart && !exists(path.relative(REPO_ROOT, targetAbs))) {
        errors.push(`${rel}:${line} 参照先がありません → ${target}`);
        continue;
      }
      if (!hash || !targetAbs.endsWith(".md")) continue;
      const anchors = anchorsFor(targetAbs);
      if (anchors && !anchors.has(decodeURIComponent(hash).toLowerCase())) {
        errors.push(`${rel}:${line} アンカーがありません → ${target}`);
      }
    }

    if (!isLiveDoc(rel)) continue;
    for (const { path: p, raw, line } of findInlineCodePaths(src)) {
      if (exceptionPaths.has(p)) {
        usedExceptions.add(p);
        continue;
      }
      if (!exists(p)) errors.push(`${rel}:${line} 実在しないパスです → \`${raw}\``);
    }
  }

  errors.push(...checkStaleExceptions(usedExceptions));

  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    console.error(`\n${errors.length} 件の問題があります（走査 ${files.length} ファイル）`);
    process.exitCode = 1;
    return;
  }
  console.log(`リンク検査 OK（走査 ${files.length} ファイル）`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 2: 実行して、既存の壊れ 5 件が報告されることを確認する**

Run: `cd /home/vscode/tasuki-work && node scripts/check-links.mjs`
Expected: exit 1。次の 5 行が出る（順序は問わない）:

```
docs/poker/README.md:56 参照先がありません → ../../deploy/poker/README.md
docs/superpowers/specs/2026-06-14-v2.4-feedback-fixes-design.md:5 参照先がありません → ../../experiments/2026-06-14-ai-problem-quality-sonnet-vs-haiku.md
docs/timer/experiments/2026-06-14-ai-problem-quality-sonnet-vs-haiku.md:5 参照先がありません → ../superpowers/specs/2026-06-12-ai-problem-generation-design.md
docs/timer/experiments/2026-06-14-ai-problem-quality-sonnet-vs-haiku.md:5 参照先がありません → ../superpowers/specs/2026-06-14-ai-status-visibility-design.md
docs/poker/specs/001-planning-poker-mvp/quickstart.md:31 アンカーがありません → ./contracts/ws-protocol.md#結合テスト観点apps-sync-research-r7
```

**`docs/adr/0003` と `docs/adr/0008` は 1 行も出ないこと**を確認する（例外表が効いている証拠）。

- [ ] **Step 3: 壊れ 5 件を直す**

```bash
cd /home/vscode/tasuki-work
sed -i 's|(\.\./\.\./deploy/poker/README\.md)|(../../deploy/README.md)|' docs/poker/README.md
sed -i 's|(\.\./\.\./experiments/2026-06-14-ai-problem-quality-sonnet-vs-haiku\.md)|(../../timer/experiments/2026-06-14-ai-problem-quality-sonnet-vs-haiku.md)|' docs/superpowers/specs/2026-06-14-v2.4-feedback-fixes-design.md
sed -i 's|(\.\./superpowers/specs/|(../../superpowers/specs/|g' docs/timer/experiments/2026-06-14-ai-problem-quality-sonnet-vs-haiku.md
sed -i 's|#結合テスト観点apps-sync-research-r7|#結合テスト観点appssync-research-r7|' docs/poker/specs/001-planning-poker-mvp/quickstart.md
```

修正後の各行を目視で確認する:

```bash
sed -n '56p' docs/poker/README.md
sed -n '5p' docs/superpowers/specs/2026-06-14-v2.4-feedback-fixes-design.md
sed -n '5p' docs/timer/experiments/2026-06-14-ai-problem-quality-sonnet-vs-haiku.md
sed -n '31p' docs/poker/specs/001-planning-poker-mvp/quickstart.md
```

- [ ] **Step 4: 緑になることを確認する**

Run: `cd /home/vscode/tasuki-work && node scripts/check-links.mjs; echo "exit=$?"`
Expected: `リンク検査 OK（走査 <N> ファイル）` / `exit=0`（N は実測値。`.superpowers` を除いた .md の総数）

- [ ] **Step 5: わざと壊して赤を見る（3 通り）**

```bash
cd /home/vscode/tasuki-work

# ① 壊れたリンクを 1 本足すと赤
echo '[x](no-such-file-xyz.md)' >> docs/guides/development.md
node scripts/check-links.mjs; echo "exit=$?"   # Expected: 参照先がありません / exit=1
git checkout -- docs/guides/development.md

# ② コードフェンス内の壊れたリンクは緑のまま
printf '\n```\n[x](no-such-file-xyz.md)\n```\n' >> docs/guides/development.md
node scripts/check-links.mjs; echo "exit=$?"   # Expected: OK / exit=0
git checkout -- docs/guides/development.md

# ③ 例外表が使われなくなると赤
#    ADR 0003 の docs/BACKLOG.md 参照を一時的に消して再実行する
sed -i 's|`docs/BACKLOG.md`|docs-BACKLOG-md|g' docs/adr/0003-agile-operations.md docs/adr/0008-dependency-supply-chain.md
node scripts/check-links.mjs; echo "exit=$?"   # Expected: 使われていない例外が残っています / exit=1
git checkout -- docs/adr/0003-agile-operations.md docs/adr/0008-dependency-supply-chain.md

# ④ 対象範囲の定数に実在しないパスを足すと赤
#    LIVE_DOCS の末尾へ実在しないディレクトリを一時的に足す
sed -i 's|^  ".specify/memory/",$|  ".specify/memory/",\n  "docs/no-such-dir/",|' scripts/check-links.mjs
node scripts/check-links.mjs; echo "exit=$?"   # Expected: LIVE_DOCS が実在しないパスを指しています / exit=1
sed -i '/"docs\/no-such-dir\/",/d' scripts/check-links.mjs
node scripts/check-links.mjs; echo "exit=$?"   # Expected: OK / exit=0
```

**4 つとも期待どおりになるまで次へ進まない。**

- [ ] **Step 6: コミット**

```bash
cd /home/vscode/tasuki-work
git add scripts/check-links.mjs docs/poker/README.md docs/superpowers/specs/2026-06-14-v2.4-feedback-fixes-design.md docs/timer/experiments/2026-06-14-ai-problem-quality-sonnet-vs-haiku.md docs/poker/specs/001-planning-poker-mvp/quickstart.md
git commit -m "fix: #70 リンク検査の実行部を追加し、既存の壊れ 5 件を直す

- 相対リンク 4 件・アンカー 1 件を修正
- アンカーの修正先は GitHub のレンダリング API が生成した実値（appssync）
- docs/adr/0003・0008 の docs/BACKLOG.md 参照は例外表が担当するため直さない"
```

---

## Task 5: `docs` ジョブの追加

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `scripts/check-links.mjs`（Task 4）

**背景（実装者向け）:** `docs` ジョブは絞り込みません。リンク検査は**コードを変えたときにこそ壊れる**（ファイルを移動・削除すると現役文書のバッククォート内パスが宙に浮く）ため、「文書が変わったときだけ走らせる」とその経路を取り逃がします。`pnpm install` は不要です。

- [ ] **Step 1: ジョブを足す**

`.github/workflows/ci.yml` の `jobs:` の末尾に追記:

```yaml
  # リンク検査。**絞り込まない。**
  # リンクはコードを変えたときにこそ壊れる（ファイルの移動・削除で
  # 現役文書のバッククォート内パスが宙に浮く）。「文書が変わったときだけ」
  # にすると、その経路を取り逃がす。pnpm install は不要。
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node scripts/check-links.mjs
```

- [ ] **Step 2: ローカルで最終確認する**

Run: `cd /home/vscode/tasuki-work && node scripts/check-links.mjs && node --test scripts/check-links.test.mjs`
Expected: 両方 PASS

- [ ] **Step 3: コミットして PR を出す**

```bash
cd /home/vscode/tasuki-work
git add .github/workflows/ci.yml
git commit -m "ci: #70 リンク検査のジョブを追加する

- 絞り込まず常時走らせる（コード変更時にこそ壊れるため）
- pnpm install 不要の素の node で走る"
git push -u origin feat/70-check-links
gh pr create --base docs/70-ci-design --title "feat: #70 リンク検査を新設して CI で回す" --body "$(cat <<'BODY'
## 概要

手動でしか走らない検査を CI へ寄せる作業の第 1 弾。リポジトリに存在しなかったリンク検査を新設し、`docs` ジョブとして常時走らせる。#68 からの申し送り（アンカーとバッククォート内のコードパスの両方を対象に含める）に応えるもの。

## 変更内容

- `scripts/check-links.mjs` / `scripts/check-links.test.mjs` を新設
- Markdown のコード領域（フェンス・インラインコード）を検査対象から外す
- アンカーの slug は GitHub のレンダリング結果と 18/18 一致を確認した規則
- 対象範囲は種類ごとに分ける（相対リンクとアンカーは全 .md、コードパスは現役の規範文書のみ）
- 空振り防止 3 種（定数の実在検査・走査 0 件で落とす・使われない例外を落とす）
- 既存の壊れ 5 件を修正
- `.github/workflows/ci.yml` に `docs` ジョブを追加

## テスト方法

- [x] `node --test scripts/check-links.test.mjs` が緑
- [x] `node scripts/check-links.mjs` が緑
- [x] 壊れたリンクを 1 本足すと赤になる
- [x] コードフェンス内の壊れたリンクでは緑のまま
- [x] 例外表が使われなくなると赤になる

Refs #70
BODY
)"
```

---

## Task 6: SC036 の欠陥修正

**Files:**
- Modify: `scripts/audit-structure.mjs:813`
- Test: `scripts/audit-structure.test.mjs`

**Interfaces:**
- Produces: `formatTable(results) → string`（export を新設）

**背景（実装者向け）:** `formatTable` は判定列を `typeof r.value === "number" ? (r.value === r.target ? "PASS" : "未達") : "—"` で決めています。`sc036` は値が数値（1382）で目標が文字列（`"P1 完了時の基準値以上"`）なので、比較が常に false になり、**構造上いつまでも「未達」と出ます**。CI のログで値を読ませる以上、これは直します。`formatTable` は現在 export されておらず自己テストもありません。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/audit-structure.test.mjs` の import に `formatTable` を足し、末尾に追記:

```js
describe("formatTable", () => {
  test("数値目標を持つ指標は PASS / 未達 を出す", () => {
    // Given
    const results = { sc027: { value: 0, target: 0 }, sc029: { value: 7, target: 0 } };
    // When
    const table = formatTable(results);
    // Then
    assert.match(table, /SC027 \| 0 \| 0 \| PASS/);
    assert.match(table, /SC029 \| 7 \| 0 \| 未達/);
  });

  test("数値目標を持たない指標は判定を出さない", () => {
    // Given: 目標が文字列の指標（記録のためだけの数値）
    const results = { sc036: { value: 1382, target: "P1 完了時の基準値以上" } };
    // When
    const table = formatTable(results);
    // Then: 「未達」と誤って出さない
    assert.match(table, /SC036 \| 1382 \| P1 完了時の基準値以上 \| —/);
    assert.doesNotMatch(table, /未達/);
  });

  test("値が文字列の指標も判定を出さない", () => {
    // Given
    const results = { sc032: { value: "1023/1051（97.3%）", target: "100%" } };
    // When
    const table = formatTable(results);
    // Then
    assert.match(table, /SC032 \| 1023\/1051（97\.3%） \| 100% \| —/);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `cd /home/vscode/tasuki-work && node --test scripts/audit-structure.test.mjs`
Expected: FAIL（`formatTable is not a function`）

- [ ] **Step 3: 実装を直す**

`scripts/audit-structure.mjs:813` の `function formatTable(results) {` を次に置き換える:

```js
/**
 * 監査結果を表にする。
 *
 * 判定は**目標値が数値の指標にだけ**出す。SC036 のように目標が文章の指標は
 * 「記録のための数値」であり、合否を持たない（以前は値が数値・目標が文字列で
 * `1382 === "P1 完了時の基準値以上"` が常に false になり、構造上いつまでも
 * 「未達」と表示されていた）。
 */
export function formatTable(results) {
  const rows = Object.entries(results).map(([id, r]) => {
    const judgeable = typeof r.value === "number" && typeof r.target === "number";
    const judged = judgeable ? (r.value === r.target ? "PASS" : "未達") : "—";
    return `${id.toUpperCase()} | ${r.value} | ${r.target} | ${judged}`;
  });
  const header = "SC | 現状値 | 目標値 | 判定";
  return [header, "---", ...rows].join("\n");
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd /home/vscode/tasuki-work && node --test scripts/audit-structure.test.mjs`
Expected: PASS（`# fail 0`・件数は 36 + 3 = 39）

- [ ] **Step 5: 実行結果を確認する**

Run: `cd /home/vscode/tasuki-work && node scripts/audit-structure.mjs`
Expected: SC036 の行が `SC036 | 1382 | P1 完了時の基準値以上 | —` になる。SC029 は `未達`、SC027 は `PASS` のまま変わらない。

- [ ] **Step 6: わざと壊して赤を見る**

`judgeable` の `&& typeof r.target === "number"` を一時的に削る。

Run: `cd /home/vscode/tasuki-work && node --test scripts/audit-structure.test.mjs`
Expected: FAIL（`数値目標を持たない指標は判定を出さない` が落ちる）

確認したら戻す。

- [ ] **Step 7: コミット**

```bash
cd /home/vscode/tasuki-work
git switch -c chore/70-checks-to-ci
git add scripts/audit-structure.mjs scripts/audit-structure.test.mjs
git commit -m "fix: #70 構造監査 SC036 が常に未達と出る欠陥を直す

- 判定は目標値が数値の指標にだけ出す
- SC036 は値が数値・目標が文字列で、比較が常に false になっていた
- formatTable を export し、自己テストを 3 件追加"
```

---

## Task 7: `quality` ジョブの追加

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `scripts/audit-structure.mjs`（Task 6）、`scripts/check-links.test.mjs`（Task 1〜3）

**背景（実装者向け）:** `quality` を `ci` に混ぜません。変異検査は `node_modules` を要求するため `pnpm install` が要り、`ci` に足すと臨界経路が 2 分 12 秒から 2 分 42 秒へ伸びます。別ジョブなら並列に隠れます。**`setup-bun` は不要です** — `mutation-check.mjs` は `apps/timer-sync` の変異も含めて `npx vitest run` で実行し（`scripts/mutation-check.mjs:283`）、パッケージの `test` スクリプト（`bun test`）を経由しません。

shellcheck はこの PR で新規に入れます。リポジトリには抑制ディレクティブ（`deploy/deploy.sh:75` / `deploy/lib/common.sh:58`）だけが存在し、検査は存在しませんでした。

- [ ] **Step 1: ローカルで shellcheck が緑であることを確認する**

Run:
```bash
cd /home/vscode/tasuki-work
shellcheck -x --source-path=deploy --severity=warning deploy/*.sh deploy/lib/*.sh scripts/*.sh; echo "exit=$?"
```
Expected: 出力なし / `exit=0`

`-x --source-path=deploy` が無いと `source "$(dirname …)/lib/common.sh"` で SC1091 が出て落ちる。`--severity=warning` が無いと `deploy/setup.sh:40` の SC2153（`ENV_FILE` の綴り誤り疑い・`app.env` から読む変数に対する偽陽性）で落ちる。

- [ ] **Step 2: 変異検査がローカルで緑であることを確認する**

> ⚠ **`ci.yml` を編集する前に行う。** 変異検査は作業ツリーに未コミット変更があると
> 実行を拒否する（変異がパッチの復元で消えると取り返しがつかないため）。

Run: `cd /home/vscode/tasuki-work && git status --short && node scripts/mutation-check.mjs`
Expected: `git status --short` が空で、9 件すべて「検出」。約 10 秒。

- [ ] **Step 3: ジョブを足す**

`.github/workflows/ci.yml` の `docs` ジョブの下に追記:

```yaml
  # 手動でしか走らなかった検査を寄せる。ci に混ぜると臨界経路が
  # 2 分 12 秒 → 2 分 42 秒 に伸びるので独立ジョブにする。
  # **setup-bun は不要**: mutation-check.mjs は timer-sync の変異も
  # npx vitest run で実行し、パッケージの test スクリプト（bun test）を通らない。
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: corepack enable
      - run: pnpm install --frozen-lockfile

      # 構造監査は値を出すだけ。合否は自己テストと変異検査で取る（ADR 0009 D2）。
      - run: node scripts/audit-structure.mjs

      - run: node --test scripts/audit-structure.test.mjs scripts/check-links.test.mjs

      # 変異検査は作業ツリーが clean であることを要求する。
      # actions/checkout 直後は clean で、pnpm install は追跡ファイルを変更しない。
      - run: node scripts/mutation-check.mjs

      # shellcheck。.specify/scripts/** は vendor のため対象外（ADR 0009 D6）。
      - run: shellcheck -x --source-path=deploy --severity=warning deploy/*.sh deploy/lib/*.sh scripts/*.sh
```

- [ ] **Step 4: コミットして PR を出す**

```bash
cd /home/vscode/tasuki-work
git add .github/workflows/ci.yml
git commit -m "ci: #70 手動でしか走らない検査を quality ジョブへ寄せる

- 構造監査・自己テスト 36 件・変異検査 9 件・shellcheck を CI で走らせる
- ci に混ぜず独立ジョブにする（臨界経路を 2 分 12 秒のまま保つ）
- setup-bun は不要（変異検査は npx vitest run を使う）"
git push -u origin chore/70-checks-to-ci
gh pr create --base feat/70-check-links --title "chore: #70 手動でしか走らない検査を CI へ寄せる" --body "$(cat <<'BODY'
## 概要

構造監査・その自己テスト・変異検査は手動でしか走っていなかった。あわせて、shellcheck は抑制ディレクティブだけが存在し検査そのものが無かった。これらを `quality` ジョブへ寄せる。

## 変更内容

- `quality` ジョブを新設（構造監査・自己テスト・変異検査・shellcheck）
- 構造監査 SC036 が構造上いつまでも「未達」と出る欠陥を修正
- `formatTable` を export し自己テストを追加

## テスト方法

- [ ] CI の `quality` ジョブが緑
- [ ] 変異検査 9 件すべて検出
- [ ] shellcheck が findings 0 件
- [ ] テストを 1 つ消すと `quality` が赤（破壊検証）
- [ ] シェルスクリプトに警告を入れると `quality` が赤（破壊検証）

Refs #70
BODY
)"
```

- [ ] **Step 5: CI 上で破壊検証する（PR を出した後）**

PR のブランチに次の変更を順に積み、**それぞれ CI が赤になることを確認してから revert する**。

```bash
cd /home/vscode/tasuki-work

# ⑥ 変異が検出されない状態にすると quality が赤
#    m01 が検出を期待するテストを 1 つ落とす
git rm packages/timer-core/test/driver-switch-equivalence.test.ts
git commit -m "test: 破壊検証（変異検査） — このコミットは revert する"
git push
# → CI の quality が赤になることを確認したら
git revert --no-edit HEAD && git push

# ⑧ 監査ロジックを 1 つ壊すと quality が赤
#    sc029SpecIdsInNames が常に 0 を返すようにする（未達 7 件を見落とす状態）
sed -i 's|^export function sc029SpecIdsInNames(testFiles, exceptFiles = \[\]) {|export function sc029SpecIdsInNames(testFiles, exceptFiles = []) {\n  return 0; // 破壊検証|' scripts/audit-structure.mjs
node --test scripts/audit-structure.test.mjs   # ローカルで先に赤を見る
git commit -am "chore: 破壊検証（構造監査ロジック） — このコミットは revert する"
git push
# → CI の quality が赤になることを確認したら
git revert --no-edit HEAD && git push

# ⑨ shellcheck の警告を入れると quality が赤
printf '\nfoo=$(echo hi)\necho $foo\n' >> scripts/gen-sounds.sh   # SC2086: quote to prevent globbing
git commit -am "chore: 破壊検証（shellcheck） — このコミットは revert する"
git push
# → CI の quality が赤になることを確認したら
git revert --no-edit HEAD && git push
```

**3 つとも CI が赤になることを確認してから次へ進む。**「ローカルで赤を見た」で代替しない
（この Issue が問題にしているのは、まさに CI で走っていないことなので）。

---

## Task 8: `decideScope` の実装

**Files:**
- Create: `scripts/ci-scope.mjs`
- Test: `scripts/ci-scope.test.mjs`

**Interfaces:**
- Produces: `decideScope(changedFiles) → { code: boolean, deps: boolean }`

**背景（実装者向け）:** 規則の向きが要です。「走らせる条件」を列挙するのではなく、**「走らせなくてよい条件」を許可リストで書き、それ以外はすべて走らせます**。未知のパスは必ず「走らせる」側へ倒れます。`e2e` に独立したフラグは持たせません（`turbo.json`・ルート設定・`.github/workflows/**` はいずれも E2E の挙動を変えうるため、「利用者の通る経路」を狭く列挙すると必ず取りこぼす）。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/ci-scope.test.mjs` を新規作成:

```js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decideScope } from "./ci-scope.mjs";

describe("decideScope", () => {
  test("文書だけの変更では code も deps も false", () => {
    // Given
    const files = ["docs/adr/0009-ci-scope-and-checks.md", "README.md"];
    // When / Then
    assert.deepEqual(decideScope(files), { code: false, deps: false });
  });

  test("コードが 1 行でも混ざれば code は true", () => {
    // Given
    const files = ["docs/README.md", "packages/timer-core/src/evolve.ts"];
    // When / Then
    assert.equal(decideScope(files).code, true);
  });

  test("lockfile の変更で deps が true", () => {
    assert.deepEqual(decideScope(["pnpm-lock.yaml"]), { code: true, deps: true });
  });

  test("どの階層の package.json でも deps が true", () => {
    assert.equal(decideScope(["apps/timer-web/package.json"]).deps, true);
    assert.equal(decideScope(["package.json"]).deps, true);
    assert.equal(decideScope(["pnpm-workspace.yaml"]).deps, true);
  });

  test("package.json に似た別名を deps と誤認しない", () => {
    // Given: package.json ではないファイル
    // When / Then
    assert.equal(decideScope(["docs/my-package.json.md"]).deps, false);
    assert.equal(decideScope(["scripts/not-package.json"]).deps, false);
  });

  test("未知の拡張子は走らせる側へ倒す", () => {
    // Given: 分類の付かないファイル
    // When / Then
    assert.equal(decideScope(["foo.txt"]).code, true);
    assert.equal(decideScope([".github/workflows/ci.yml"]).code, true);
    assert.equal(decideScope(["turbo.json"]).code, true);
  });

  test("差分が空なら全部走らせる（fail-open）", () => {
    assert.deepEqual(decideScope([]), { code: true, deps: true });
  });

  test("配列でない入力でも全部走らせる（fail-open）", () => {
    assert.deepEqual(decideScope(null), { code: true, deps: true });
    assert.deepEqual(decideScope(undefined), { code: true, deps: true });
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `cd /home/vscode/tasuki-work && node --test scripts/ci-scope.test.mjs`
Expected: FAIL（`Cannot find module './ci-scope.mjs'`）

- [ ] **Step 3: 実装を書く**

`scripts/ci-scope.mjs` を新規作成:

```js
#!/usr/bin/env node
/**
 * CI で走らせる範囲の判定（#70）。
 *
 * 変更ファイルの一覧から、各ジョブを走らせるかどうかを決めて
 * $GITHUB_OUTPUT へ書く。ジョブ自体は常に起動し、ステップ単位の if で
 * 早期成功させる（必須チェックに指定しても「未報告」にならない形）。
 *
 * **判定に迷ったら全部走らせる（fail-open）。** 走るべきときに走らない事故が
 * この仕組みで最も起きやすい失敗なので、不確かさは必ず「走らせる」側へ倒す。
 */

/** 依存を変えるファイルか。 */
function isDependencyFile(file) {
  return (
    file === "pnpm-lock.yaml" ||
    file === "pnpm-workspace.yaml" ||
    file === "package.json" ||
    file.endsWith("/package.json")
  );
}

/**
 * 変更ファイル一覧から走らせる範囲を決める。
 *
 * `code` は「走らせなくてよい条件」の許可リスト（*.md のみ）の否定で決める。
 * 分類の付かないファイルは必ず `code: true` になる。
 *
 * `e2e` に独立したフラグは持たせない（条件は `code` と同じ）。turbo.json・
 * ルート設定・.github/workflows/** はいずれも E2E の挙動を変えうるため、
 * 「利用者の通る経路」を狭く列挙すると必ず取りこぼす。
 */
export function decideScope(changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return { code: true, deps: true };
  }
  return {
    code: changedFiles.some((f) => !f.endsWith(".md")),
    deps: changedFiles.some(isDependencyFile),
  };
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd /home/vscode/tasuki-work && node --test scripts/ci-scope.test.mjs`
Expected: PASS（`# fail 0`）

- [ ] **Step 5: わざと壊して赤を見る**

`decideScope` の fail-open を一時的に消す（`if (!Array.isArray…) return { code: false, deps: false };` にする）。

Run: `cd /home/vscode/tasuki-work && node --test scripts/ci-scope.test.mjs`
Expected: FAIL（`差分が空なら全部走らせる` と `配列でない入力でも…` の 2 件が落ちる）

確認したら戻す。

- [ ] **Step 6: コミット**

```bash
cd /home/vscode/tasuki-work
git switch -c ci/70-job-scoping
git add scripts/ci-scope.mjs scripts/ci-scope.test.mjs
git commit -m "feat: #70 走らせる範囲を決める純関数を追加する

- 走らせなくてよい条件（*.md のみ）を許可リストで書き、それ以外は全部走らせる
- 差分が空・配列でない入力は全部 true（fail-open）
- e2e に独立フラグは持たせない（狭く列挙すると設定変更を取りこぼす）"
```

---

## Task 9: 差分の取得と `$GITHUB_OUTPUT` への出力

**Files:**
- Modify: `scripts/ci-scope.mjs`
- Test: `scripts/ci-scope.test.mjs`

**Interfaces:**
- Consumes: `decideScope`（Task 8）
- Produces: `parseDiffOutput(stdout) → string[]`、`formatOutputs(scope) → string`

**背景（実装者向け）:** git を叩く部分はテストしません（CI の環境変数とリポジトリの状態に依存するため）。代わりに**パースと出力の整形を純関数に切り出して**テストします。git の呼び出しが失敗したら例外を握って fail-open します。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/ci-scope.test.mjs` の末尾に追記:

```js
import { parseDiffOutput, formatOutputs } from "./ci-scope.mjs";

describe("parseDiffOutput", () => {
  test("改行区切りを配列にし、空行を落とす", () => {
    // Given: git diff --name-only の出力（末尾に改行）
    const stdout = "docs/a.md\npackages/timer-core/src/evolve.ts\n\n";
    // When / Then
    assert.deepEqual(parseDiffOutput(stdout), ["docs/a.md", "packages/timer-core/src/evolve.ts"]);
  });

  test("空の出力は空配列", () => {
    assert.deepEqual(parseDiffOutput(""), []);
    assert.deepEqual(parseDiffOutput("\n"), []);
  });
});

describe("formatOutputs", () => {
  test("GITHUB_OUTPUT の形式で書き出す", () => {
    // Given
    const scope = { code: true, deps: false };
    // When / Then
    assert.equal(formatOutputs(scope), "code=true\ndeps=false\n");
  });
});
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `cd /home/vscode/tasuki-work && node --test scripts/ci-scope.test.mjs`
Expected: FAIL（`parseDiffOutput is not a function`）

- [ ] **Step 3: 実装を書く**

**`import` の 3 行はファイル冒頭（先頭コメントの直後）へ置く。** 残りは末尾へ追記する。

```js
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
```

```js
export function parseDiffOutput(stdout) {
  return stdout
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function formatOutputs(scope) {
  return `code=${scope.code}\ndeps=${scope.deps}\n`;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

/**
 * イベントに応じて変更ファイルの一覧を取る。
 * 取れない・判断できない場合は例外を投げ、呼び出し側が fail-open する。
 */
function changedFiles() {
  const eventName = process.env.GITHUB_EVENT_NAME;

  if (eventName === "pull_request") {
    const base = process.env.GITHUB_BASE_REF;
    if (!base) throw new Error("GITHUB_BASE_REF が空です");
    // 三点はマージベースからの差分。積み上げ PR でも base が親ブランチになるので正しい。
    return parseDiffOutput(git(["diff", "--name-only", `origin/${base}...HEAD`]));
  }

  if (eventName === "push") {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath) throw new Error("GITHUB_EVENT_PATH が空です");
    const before = JSON.parse(fs.readFileSync(eventPath, "utf8")).before;
    if (!before || /^0+$/.test(before)) {
      throw new Error("before が空または全 0 です（新規ブランチ）");
    }
    return parseDiffOutput(git(["diff", "--name-only", before, process.env.GITHUB_SHA]));
  }

  throw new Error(`判定に対応していないイベントです: ${eventName}`);
}

function main() {
  let scope;
  try {
    const files = changedFiles();
    scope = decideScope(files);
    console.log(`変更 ${files.length} ファイル → code=${scope.code} deps=${scope.deps}`);
    for (const f of files) console.log(`  ${f}`);
  } catch (error) {
    // **fail-open**: 判定できなければ全部走らせる
    scope = { code: true, deps: true };
    console.log(`判定できないため全ジョブを走らせます: ${error.message}`);
  }
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, formatOutputs(scope));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd /home/vscode/tasuki-work && node --test scripts/ci-scope.test.mjs`
Expected: PASS（`# fail 0`）

- [ ] **Step 5: fail-open をローカルで確かめる**

Run:
```bash
cd /home/vscode/tasuki-work
GITHUB_OUTPUT=/tmp/out.txt GITHUB_EVENT_NAME=unknown node scripts/ci-scope.mjs && cat /tmp/out.txt
```
Expected: `判定できないため全ジョブを走らせます: 判定に対応していないイベントです: unknown` と出て、`/tmp/out.txt` に `code=true` / `deps=true`

- [ ] **Step 6: コミット**

```bash
cd /home/vscode/tasuki-work
git add scripts/ci-scope.mjs scripts/ci-scope.test.mjs
git commit -m "feat: #70 差分の取得と GITHUB_OUTPUT への出力を追加する

- pull_request はマージベースからの三点差分、push は before..sha
- 新規ブランチ（before が全 0）・未知のイベント・git の失敗は fail-open
- パースと出力整形を純関数へ切り出して自己テストする"
```

---

## Task 10: `ci.yml` の配線

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `scripts/ci-scope.mjs`（Task 9）

**背景（実装者向け）:** **ジョブ単位の `if:` は使いません。** ステップ単位の `if:` にすることで、ジョブは常に起動して常に `success` を報告します。将来 `main` にブランチ保護をかけて必須チェックに指定しても、「チェック待ち」で永久にマージできなくなる事故が原理的に起きません。`fetch-depth: 0` は差分の取得に必要です（`.git` は 17MB / 713 コミットで数秒）。

- [ ] **Step 1: `concurrency` を足す**

`.github/workflows/ci.yml` の `env:` ブロックの下に追記:

```yaml
# 連続 push で古い実行を打ち切る。**main への push は打ち切らない**
# （マージ後の実行は「main が緑である」という記録そのもののため）。
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

- [ ] **Step 2: `ci` ジョブへ判定を入れる**

`ci` ジョブの `steps:` を次に置き換える。**`docs` ジョブには入れない**（絞り込まないため）。

```yaml
    steps:
      - uses: actions/checkout@v4
        with:
          # 差分の取得に必要。.git は 17MB / 713 コミットで数秒。
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      # 走らせる範囲を決める。ジョブ単位の if ではなくステップ単位の if を使い、
      # ジョブは常に起動して常に success を報告する（必須チェックにしても壊れない）。
      - id: scope
        run: node scripts/ci-scope.mjs

      - run: corepack enable
        if: steps.scope.outputs.code == 'true'

      - uses: oven-sh/setup-bun@v2
        if: steps.scope.outputs.code == 'true'
        with:
          bun-version: latest

      - run: pnpm install --frozen-lockfile
        if: steps.scope.outputs.code == 'true'

      - run: pnpm typecheck
        if: steps.scope.outputs.code == 'true'
      - run: pnpm lint
        if: steps.scope.outputs.code == 'true'
      - run: pnpm test
        if: steps.scope.outputs.code == 'true'
      - run: pnpm build
        if: steps.scope.outputs.code == 'true'
```

- [ ] **Step 3: `quality` ジョブへ判定を入れる**

`quality` ジョブの各ステップに、`checkout` / `setup-node` / `scope` を除いて `if: steps.scope.outputs.code == 'true'` を足す。`checkout` に `fetch-depth: 0` を足し、`setup-node` の直後に `scope` ステップを置く:

```yaml
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - id: scope
        run: node scripts/ci-scope.mjs
      - run: corepack enable
        if: steps.scope.outputs.code == 'true'
      - run: pnpm install --frozen-lockfile
        if: steps.scope.outputs.code == 'true'
      - run: node scripts/audit-structure.mjs
        if: steps.scope.outputs.code == 'true'
      - run: node --test scripts/audit-structure.test.mjs scripts/check-links.test.mjs scripts/ci-scope.test.mjs
        if: steps.scope.outputs.code == 'true'
      - run: node scripts/mutation-check.mjs
        if: steps.scope.outputs.code == 'true'
      - run: shellcheck -x --source-path=deploy --severity=warning deploy/*.sh deploy/lib/*.sh scripts/*.sh
        if: steps.scope.outputs.code == 'true'
```

- [ ] **Step 4: `audit` ジョブへ判定を入れる（条件は `deps`）**

```yaml
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - id: scope
        run: node scripts/ci-scope.mjs
      - run: corepack enable
        if: steps.scope.outputs.deps == 'true'
      - run: pnpm install --frozen-lockfile
        if: steps.scope.outputs.deps == 'true'
      - run: pnpm audit || true
        if: steps.scope.outputs.deps == 'true'
      - run: pnpm audit --audit-level high
        if: steps.scope.outputs.deps == 'true'
```

- [ ] **Step 5: `e2e` ジョブへ判定を入れる（条件は `code`）**

`e2e` ジョブの `checkout` に `fetch-depth: 0` を足し、`setup-node` の直後に `scope` ステップを置いて、**それ以降のすべてのステップ**に `if: steps.scope.outputs.code == 'true'` を足す（キャッシュのステップ、`sudo mkdir -p /var/www`、Playwright の 2 つの条件つきステップ、`pnpm build`、`pnpm e2e` を含む）。

Playwright の 2 ステップは既存の条件と `&&` で結合する:

```yaml
      - run: pnpm --filter @tasuki/e2e exec playwright install --with-deps chromium
        if: steps.scope.outputs.code == 'true' && steps.playwright-cache.outputs.cache-hit != 'true'
      - run: pnpm --filter @tasuki/e2e exec playwright install-deps chromium
        if: steps.scope.outputs.code == 'true' && steps.playwright-cache.outputs.cache-hit == 'true'
```

失敗時のアーティファクト回収は `if: failure()` のままにする（早期成功したジョブでは失敗が起きないため走らない）。

- [ ] **Step 6: YAML の妥当性を確認する**

Run:
```bash
cd /home/vscode/tasuki-work
node -e "const y=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); console.log('ジョブ数:', (y.match(/^  [a-z-]+:$/gm)||[]).length); console.log('scope ステップ数:', (y.match(/id: scope/g)||[]).length); console.log('if 条件数:', (y.match(/steps\.scope\.outputs/g)||[]).length)"
```
Expected: ジョブ数 5 / scope ステップ数 4（`docs` には無い）/ if 条件数 21 以上

- [ ] **Step 7: コミットして PR を出す**

```bash
cd /home/vscode/tasuki-work
git add .github/workflows/ci.yml
git commit -m "ci: #70 変更内容に応じて走らせるジョブを絞る

- ジョブは常に起動し、ステップ単位の if で早期成功させる
- 必須チェックに指定しても永久待ちにならない形（(a) 形）
- PR の連続 push で古い実行を打ち切る（main への push は打ち切らない）"
git push -u origin ci/70-job-scoping
gh pr create --base chore/70-checks-to-ci --title "ci: #70 変更内容に応じて走らせるジョブを絞る" --body "$(cat <<'BODY'
## 概要

文書だけの変更でも全ジョブが走っていた（直近 40 実行のうち 18 件が文書のみで、実行時間の 43% を占めていた）。変更内容に応じて絞る。

パブリックリポジトリのためランナー時間は無料（`actions/runs/*/timing` の `billable.UBUNTU.total_ms` が 0）。目的は費用削減ではなく待ち時間の短縮。

## 変更内容

- `scripts/ci-scope.mjs` / `scripts/ci-scope.test.mjs` を新設
- `ci` / `quality` / `e2e` は `code`、`audit` は `deps` を条件に早期成功
- `docs` は絞らない（リンクはコード変更時にこそ壊れるため）
- ジョブ単位ではなくステップ単位の `if` を使う（必須チェックにしても壊れない）
- `concurrency` で PR の連続 push を打ち切る

## テスト方法

- [ ] コードを 1 行だけ変えた PR で `ci` / `quality` / `e2e` が確実に走る
- [ ] 文書だけの PR で `ci` / `quality` / `e2e` が no-op 成功し `docs` だけ走る
- [ ] 判定スクリプトに例外を投げさせると全部走る（fail-open）
- [ ] 待ち時間を実測して設計書へ追記

Refs #70
BODY
)"
```

---

## Task 11: 絞り込みの破壊検証と実測

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-ci-checks-and-job-scoping-design.md`（実測値の追記）

**背景（実装者向け）:** #70 本文が「絞り込みは検査を走らせない仕組みを意図的に作る作業なので、走るべきときに走らないという事故が最も起きやすい」と名指ししている経路です。**3 つとも実際の PR で確かめます。**

- [ ] **Step 1: 文書だけの PR で早期成功することを確認する**

```bash
cd /home/vscode/tasuki-work
echo "" >> docs/guides/development.md
git commit -am "docs: 破壊検証（文書のみ） — このコミットは revert する"
git push
gh run watch
```
Expected: `docs` だけが実質的に走り、`ci` / `quality` / `e2e` / `audit` は「判定できないため…」ではなく `変更 1 ファイル → code=false deps=false` を出して全ステップを飛ばし、**success で終わる**。

`gh run list --limit 1 --json databaseId -q '.[0].databaseId'` で run id を取り、`gh api repos/tomohiroJin/tasuki-tools/actions/runs/<id>/timing` で `run_duration_ms` を記録する。

確認したら `git revert --no-edit HEAD && git push`。

- [ ] **Step 2: コードを 1 行だけ変えた PR で確実に走ることを確認する**

```bash
cd /home/vscode/tasuki-work
printf '\n// 破壊検証: このコミットは revert する\n' >> packages/timer-core/src/index.ts
git commit -am "chore: 破壊検証（コード 1 行） — このコミットは revert する"
git push
gh run watch
```
Expected: `ci` / `quality` / `e2e` のすべてが `code=true` で本体を実行し、緑で終わる。`run_duration_ms` を記録する。

確認したら `git revert --no-edit HEAD && git push`。

- [ ] **Step 3: fail-open を確認する**

```bash
cd /home/vscode/tasuki-work
# 判定スクリプトの先頭で例外を投げさせる
sed -i 's|^function main() {|function main() {\n  throw new Error("破壊検証");|' scripts/ci-scope.mjs
git commit -am "chore: 破壊検証（fail-open） — このコミットは revert する"
git push
gh run watch
```
Expected: 各ジョブのログに `判定できないため全ジョブを走らせます: 破壊検証` が出て、**すべてのジョブが本体を実行する**。

> ⚠ この変更は `scripts/**` への変更なので `code=true` が期待値だが、それは
> 「例外で fail-open した」結果と区別が付かない。**ログの文言で区別すること。**

確認したら `git revert --no-edit HEAD && git push`。

- [ ] **Step 4: 実測値を設計書へ追記する**

`docs/superpowers/specs/2026-08-12-ci-checks-and-job-scoping-design.md` の「見込みの効果」表を、Step 1〜2 で記録した実測値へ差し替える。「**見積り**」の注記を「実測（2026-08-12）」へ書き換える。`quality` ジョブの所要時間も、CI の実行結果から埋める。

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add docs/superpowers/specs/2026-08-12-ci-checks-and-job-scoping-design.md
git commit -m "docs: #70 絞り込みの効果を実測値へ差し替える"
git push
```

---

## Task 12: ADR 0009

**Files:**
- Create: `docs/adr/0009-ci-scope-and-checks.md`
- Modify: `docs/adr/README.md`（一覧へ 1 行追加）

**背景（実装者向け）:** ADR は Michael Nygard 形式（背景 / 決定 / 影響 / ステータス）です。テンプレートは `docs/adr/template.md`、採番規約の正本は `docs/adr/0002` です。

- [ ] **Step 1: テンプレートを確認する**

Run: `cd /home/vscode/tasuki-work && cat docs/adr/template.md`

- [ ] **Step 2: ADR 0009 を書く**

`docs/adr/0009-ci-scope-and-checks.md` を、テンプレートの節構成に従って作成する。決定は次の 6 件を、それぞれ理由つきで書く。

```
D1 リポジトリが持つ検査はすべて CI で走らせる（手動専用の検査を残さない）
   理由: 「検査が静かに効かなくなる」失敗を繰り返し踏んでいる（#50 の CI 未実行、
         eslint の対象がアプリ名固定で移設のたびに死んだ 2 回、構造監査が存在しない
         パスを走査して全指標 0 で PASS 表示）

D2 構造監査は値を出すだけとし、合否は自己テストと変異検査で取る
   但し書き: この形では指標の退行そのものは止まらない。自己テストが守るのは
             「計測器が壊れていないこと」だけ。閾値を設けるかどうかは未達指標
             （SC029=7 / SC030=3 / SC032 の未付与 28 件 / SC039 の公開記号 34 件）の
             解消とセットで判断すべきで、それは #72 の領分

D3 カバレッジは timer-core の lines / branches 90 のみを gate とし、他パッケージでは測らない
   理由: テストランナーが 3 種（vitest 8 / bun test 1 / node --test 1）で、
         カバレッジの出力形式も閾値の指定方法もランナーごとに異なる。統合した
         見方を作る作業が別途必要になる

D4 ジョブの絞り込みは (a) 形（常に起動し、中で判定して早期成功）
   理由: paths フィルタでジョブごと止めると、必須チェックに指定した瞬間に
         対象外のパスしか触らない PR が永久待ちになる。main は現在ブランチ保護が
         無いが（2026-08-11 に 404 Branch not protected を確認）、将来かけた時点で踏む

D5 デプロイは自動化しない。ローカルからの手作業を正とする
   理由: 再起動で稼働中のルームが全消滅するため、タイミングの判断は利用状況を
         知っている人にしかできない

D6 shellcheck を導入し、deploy/** と scripts/** の 6 本を対象に CI で走らせる
   .specify/scripts/** は vendor のため対象外。info は合否の対象にしない
   理由: 抑制ディレクティブ（deploy/deploy.sh:75 / deploy/lib/common.sh:58）だけが
         存在し、検査そのものが無かった。抑制だけが残って検査が無いのは
         「検査が静かに効かなくなる」の最終形
```

「影響」の節には次を書く:

- CI のジョブが 3 から 5 へ増える
- コードを変える PR は検査が 4 種増えるぶん遅くなる
- 文書だけの PR は大幅に速くなる
- `docs/adr/0003` と `docs/adr/0008` の `docs/BACKLOG.md` への言及は、リンク検査の例外表で扱う（不在が正しいため直さない）

- [ ] **Step 3: 一覧へ追加する**

`docs/adr/README.md` の一覧表の末尾に追記:

```markdown
| [0009](./0009-ci-scope-and-checks.md) | CI が守る範囲と検査の配置 | Accepted |
```

- [ ] **Step 4: リンク検査を通す**

Run: `cd /home/vscode/tasuki-work && node scripts/check-links.mjs`
Expected: `リンク検査 OK`

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git switch -c docs/70-decisions
git add docs/adr/0009-ci-scope-and-checks.md docs/adr/README.md
git commit -m "docs: #70 CI が守る範囲の決定を ADR 0009 に記録する

- 決定 D1〜D6（検査の CI 化・構造監査の扱い・カバレッジ・絞り込みの形・
  デプロイ自動化をしないこと・shellcheck の導入）"
```

---

## Task 13: 開発ガイドへの CI 構成表

**Files:**
- Modify: `docs/guides/development.md`

**背景（実装者向け）:** #70 の完了条件が「絞り込みによって必須チェックが永久待ちにならないことを、(a)/(b) のどちらを採ったかとあわせて記録した」を要求しています。

- [ ] **Step 1: 節を追記する**

`docs/guides/development.md` に「## CI」の節を足し、次を書く。

```markdown
## CI

`.github/workflows/ci.yml` は 5 つのジョブを持ちます。

| ジョブ | 中身 | 走らせる条件 |
|---|---|---|
| `ci` | typecheck / lint / test / build | コードに関わる変更（`*.md` 以外が 1 つでもある） |
| `quality` | 構造監査・自己テスト・変異検査・shellcheck | 同上 |
| `docs` | リンク検査 | **常時** |
| `audit` | `pnpm audit` | 依存の変更（`pnpm-lock.yaml` / `pnpm-workspace.yaml` / `package.json`） |
| `e2e` | E2E | コードに関わる変更 |

判定は `scripts/ci-scope.mjs` が行い、`$GITHUB_OUTPUT` へ `code` と `deps` を書きます。
**判定できないときは全部走らせます（fail-open）。**

### 必須チェックが永久待ちにならない理由

絞り込みは **(a) 常にジョブを起動し、ステップ単位の `if:` で早期成功させる形**を採っています。
`on.push.paths` でジョブ自体を起動させない (b) の形は採りません。

(b) を採ると、そのチェックを必須（required status check）に指定した瞬間、対象外のパスしか
触らない PR が「チェック待ち」で永久にマージできなくなります。GitHub がスキップされた
ワークフローを「成功」ではなく「未報告」として扱うためです。

(a) ではジョブが常に `success` を報告するので、この事故が原理的に起きません。
決定の記録は [`docs/adr/0009`](../adr/0009-ci-scope-and-checks.md) の D4 にあります。
```

- [ ] **Step 2: リンク検査を通す**

Run: `cd /home/vscode/tasuki-work && node scripts/check-links.mjs`
Expected: `リンク検査 OK`（相対リンク `../adr/0009-ci-scope-and-checks.md` が解決すること）

- [ ] **Step 3: コミット**

```bash
cd /home/vscode/tasuki-work
git add docs/guides/development.md
git commit -m "docs: #70 CI の構成と絞り込みの安全形を開発ガイドへ記録する"
```

---

## Task 14: `deploy/README.md` への手作業の明示

**Files:**
- Modify: `deploy/README.md`

**背景（実装者向け）:** デプロイは自動化しないと決めました（ADR 0009 D5）。**手でやると決めたなら、何を手でやるのかが書いてある価値はむしろ上がります。** #70 の完了条件「デプロイ手順のうち手作業が残る箇所が `deploy/README.md` に明示されている」に対応します。

- [ ] **Step 1: 現状を読む**

Run: `cd /home/vscode/tasuki-work && cat deploy/README.md`

- [ ] **Step 2: 節を追記する**

`deploy/README.md` に「## 自動化していない作業」の節を足し、次を書く。

```markdown
## 自動化していない作業

**デプロイの自動化は行わないと決めています**（[`docs/adr/0009`](../docs/adr/0009-ci-scope-and-checks.md) D5）。
再起動で稼働中のルームが全消滅するため、実行のタイミングは利用状況を知っている人が判断します。
CI から自動デプロイもしません。

`deploy/deploy.sh` が行うのはアプリ 1 つ分のビルド・転送・再起動だけです。
次は**すべて手作業**です。

| 作業 | 内容 |
|---|---|
| Caddy 断片の設置 | `deploy/caddy/tasuki.conf` をサーバーへ置き、旧ファイルを消す |
| 反映前の検証 | `caddy validate` を通してから reload する |
| 全アプリの一括切替 | 一括の手段は無い。`deploy.sh` をアプリごとに叩く |
| 切り戻し | スクリプト化していない。本 README の手順を手でたどる |
| デプロイ後の検証 | 配信ハッシュの一致・`/timer/ws` と `/poker/ws` の応答・`NRestarts` の据え置き・3 系統の応答を手で確認する（`deploy.sh` は確認コマンドを案内するだけで実行しない） |

最後に、サイト全体を外から通しで確認します。

```bash
TASUKI_E2E_BASE_URL=https://<公開ドメイン> pnpm e2e:prod
```
```

- [ ] **Step 3: リンク検査を通す**

Run: `cd /home/vscode/tasuki-work && node scripts/check-links.mjs`
Expected: `リンク検査 OK`

> ⚠ `deploy/` は LIVE_DOCS に含まれるので、**この節に書いたコードパスは実在検査を受ける**。
> `deploy/caddy/tasuki.conf` と `deploy/deploy.sh` が実在することを確認すること。

- [ ] **Step 4: コミット**

```bash
cd /home/vscode/tasuki-work
git add deploy/README.md
git commit -m "docs: #70 デプロイで手作業が残る箇所を明示する

- 自動化しないと決めた（ADR 0009 D5）ので、何を手でやるかを書く
- Caddy 断片の設置・caddy validate・一括切替・切り戻し・デプロイ後検証"
```

---

## Task 15: #70 本文の訂正

**Files:** なし（GitHub の Issue 本文とコメント）

**背景（実装者向け）:** #70 本文は 2026-08-05 時点の実測で、9 項目のうち 7 項目が既に成立しません。**本文をそのままにして閉じると、次に読む人が古い前提を引き継ぎます。**

- [ ] **Step 1: 訂正コメントを投稿する**

```bash
gh issue comment 70 --body "$(cat <<'BODY'
## 本文の訂正（2026-08-12 実測・`34db348`）

本文の現状記述は 2026-08-05 時点のもので、9 項目のうち 7 項目が既に成立しません。

| 本文の記述 | 実測 |
|---|---|
| CI は 1 ジョブで全 6 パッケージ | 3 ジョブ（`ci` / `audit` / `e2e`） |
| `pnpm audit` は未設定 | **#69 で対応済み**。独立ジョブで稼働・破壊検証済み |
| E2E は存在しない | **#73 で対応済み**。CI ジョブで 25 シナリオが走る |
| PR / Issue テンプレートが無い | **#68 PR-4 で対応済み** |
| timer-core に coverage gate は無い | `lines: 90` / `branches: 90` が実在し CI で効いている |
| SC029=6 | **SC029=7** |
| 完了条件「全 30 タスク緑」 | turbo 実測 **40 タスク** |

今も本文どおりなのは次の 2 点です。

- 構造監査・その自己テスト・変異検査が手動でしか走らない
- `deploy.sh` が Caddy 断片を扱わず、一括切替・切り戻しも無い

## スコープの変更

**「3. デプロイの自動化」はスコープから外します。** デプロイは自動化せず、ローカルからの
手作業を正とすることを決定しました（ADR 0009 D5）。完了条件のうち
「手作業が残る箇所が `deploy/README.md` に明示されている」は残します。

**「4. エコシステム」のリリースのタグ運用は今回決めません。** 手動デプロイでリリース成果物が
無く、タグが指す対象がありません。

## 本文に無い項目の追加

**shellcheck を導入します（ADR 0009 D6）。** リポジトリには抑制ディレクティブ
（`deploy/deploy.sh:75` / `deploy/lib/common.sh:58`）だけが存在し、shellcheck を走らせる
仕組みがどこにもありませんでした。**抑制だけが残って検査が無い**のは、本文が問題にしている
「検査が静かに効かなくなる」の最終形であり、完了条件「リポジトリが持つ検査がすべて CI で走る」の
対象に含めるべきものです。

設計は `docs/superpowers/specs/2026-08-12-ci-checks-and-job-scoping-design.md`、
実装計画は `docs/superpowers/plans/2026-08-12-ci-checks-and-job-scoping.md` にあります。
BODY
)"
```

- [ ] **Step 2: 本文を編集する**

`gh issue edit 70 --body-file -` で本文を更新する。編集内容:

- 「現状」表の `pnpm audit` 行と E2E 行を「対応済み（#69 / #73）」に書き換える
- 「1. 検査系を CI へ組み込む」の SC029 を 6 から **7** に直す
- 「2. カバレッジ」を「gate は timer-core に実在する。他パッケージへ広げるかを決める」に書き換える
- 「**3. デプロイの自動化**」の 5 項目を削除し、「デプロイは自動化しない（ADR 0009 D5）。手作業が残る箇所を `deploy/README.md` に明示する」に置き換える
- 「4. エコシステム」から「PR テンプレート / Issue テンプレート」（#68 で対応済み）と「リリースのタグ運用を決めるか」（今回決めない）を削除する
- 「4. エコシステム」に「shellcheck の導入」を追加する
- 完了条件の「全 30 タスク緑」を「全 **40** タスク緑」に直す

- [ ] **Step 3: PR を出す**

```bash
cd /home/vscode/tasuki-work
git push -u origin docs/70-decisions
gh pr create --base ci/70-job-scoping --title "docs: #70 決定と手順を文書化する" --body "$(cat <<'BODY'
## 概要

#70 で下した決定を ADR 0009 に記録し、CI の構成とデプロイの手作業を文書へ落とす。#70 本文の古い記述も訂正する。

## 変更内容

- `docs/adr/0009-ci-scope-and-checks.md` を新設（決定 D1〜D6）
- `docs/guides/development.md` に CI の構成表と、必須チェックが永久待ちにならない理由
- `deploy/README.md` に手作業が残る箇所を明示
- #70 本文の訂正（9 項目のうち 7 項目が古い・デプロイ自動化をスコープ外へ・shellcheck を追加）

## テスト方法

- [x] `node scripts/check-links.mjs` が緑
- [ ] CI 全ジョブが緑

Refs #70
BODY
)"
```

---

## Task 16: 振り返り

**Files:**
- Create: `docs/retrospectives/2026-08-12-issue-70-ci-checks.md`

**背景（実装者向け）:** #68 で入った運用に従い、機能系 Issue の完了時には振り返りを書きます。既存の振り返り（`docs/retrospectives/2026-08-11-issue-113-major-dependency-updates.md`）の節構成に倣ってください。

- [ ] **Step 1: 既存の振り返りの構成を確認する**

Run: `cd /home/vscode/tasuki-work && grep -n "^#\{1,3\} " docs/retrospectives/2026-08-11-issue-113-major-dependency-updates.md`

- [ ] **Step 2: 振り返りを書く**

最低限、次を含める。

- **設計段階で潰した誤り**: 設計書の敵対的検証で 6 件を修正した。最大のものは「直す対象 10 件」のうち 5 件が**直してはいけないもの**だったこと（`docs/BACKLOG.md` の不在は `docs/adr/0003` の決定が実行された結果であり、記録として正しい）。実測値は正しかったが**解釈が誤っていた**
- **自作 slug が GitHub と 18 件中 8 件で食い違っていた**こと。空白の連続を 1 個のハイフンへ潰していた。GitHub の HTML レンダリング API（`Accept: application/vnd.github.html`）に生成させて突き合わせるまで気づけなかった。**規則を実装する前に、その規則の正本に生成させて突き合わせる**
- **前提が調査で入れ替わった**こと。#70 のコメントは「ランナー時間の 43% が無駄」を絞り込みの根拠にしていたが、リポジトリが PUBLIC で `billable.UBUNTU.total_ms` が 0 だった。目的は費用削減から待ち時間短縮へ置き換わった
- **抑制だけが残って検査が無い**という型を見つけたこと（shellcheck）。「検査が静かに効かなくなる」の一覧に加える
- 破壊検証 10 件の結果
- 実測した待ち時間の削減幅

- [ ] **Step 3: リンク検査を通してコミット**

```bash
cd /home/vscode/tasuki-work
node scripts/check-links.mjs
git switch -c docs/70-retrospective
git add docs/retrospectives/2026-08-12-issue-70-ci-checks.md
git commit -m "docs: #70 の振り返りを追加する"
git push -u origin docs/70-retrospective
gh pr create --base docs/70-decisions --title "docs: #70 の振り返りを追加する" --body "Refs #70"
```

---

## 完了条件（#70 のクローズ前に確認する）

- [ ] リポジトリが持つ検査がすべて CI で走る（構造監査・自己テスト・変異検査・リンク検査・shellcheck）
- [ ] 検査を 1 つ無効化すると CI が落ちることを確認した（破壊検証 10 件）
- [ ] デプロイ手順のうち手作業が残る箇所が `deploy/README.md` に明示されている
- [ ] 文書のみを変更した PR で、意図したジョブが早期成功することを実際の PR で確認した
- [ ] **コードを 1 行だけ変更した PR で、対象のジョブが確実に走ることを確認した**
- [ ] 絞り込みで必須チェックが永久待ちにならないことを、(a) を採った旨とあわせて `docs/guides/development.md` に記録した
- [ ] 待ち時間の削減幅を実測して記録した（基準: 文書のみ PR 128〜141 秒）
- [ ] 全 40 タスク緑
- [ ] #70 本文の古い記述を訂正した
- [ ] 振り返りを書いた
