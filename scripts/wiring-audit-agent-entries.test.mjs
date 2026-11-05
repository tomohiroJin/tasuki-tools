/**
 * audit-agent-entries.mjs の 0 件ガードと照合の配線（#483）を見るテスト（#135・ADR-0014 決定 8）。
 *
 * `scan-target-wiring.test.mjs` を検査スクリプトごとに分けた 1 つ（#544。経緯と補助は `lib/script-copy-harness.mjs`）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { listTrackedFiles } from "./lib/scan-targets.mjs";
import { REPO_ROOT, createScriptCopyHarness, countOf, assertBrokenBy } from "./lib/script-copy-harness.mjs";

const { runScriptCopy } = createScriptCopyHarness(".wiring-agentent-");

/**
 * `scripts/audit-agent-entries.mjs` の配線（#483・docs/adr/0030 決定 3）。
 *
 * 純粋関数の単体テストは合成の本文を渡すので、`main()` が実リポジトリの AGENTS.md や
 * 入口を読まなくなっても緑のままになる。複製を書き換えて、読む経路が生きていることを見る。
 */
describe("0 件ガードと照合の配線: scripts/audit-agent-entries.mjs（#483）", () => {
  test("対照実行: 書き換えない複製は exit 0 で走査量を出す", () => {
    // Given / When（恒等関数なので対照実行）
    const r = runScriptCopy("audit-agent-entries.mjs", (s) => s);
    // Then
    assert.equal(r.status, 0, `対照実行が緑になりません:\n${r.stderr}`);
    assert.match(
      r.stdout,
      /\[audit-agent-entries\] 走査対象: 入口 \d+ 件 \/ 候補 \d+ 件 \/ スキル \d+ 件 \/ 手順書 \d+ 件 \/ 原則 憲法 \d+ 本・AGENTS\.md \d+ 本/,
    );
  });

  test("スキルの列挙が空になると非ゼロで終了する（スキルを見なくなる経路。#489）", () => {
    const needle = "const skills = listTrackedFiles(REPO_ROOT, [`${SKILLS_DIR}*`]);";
    const mutate = (s) => s.replace(needle, "const skills = [];");
    const r = runScriptCopy("audit-agent-entries.mjs", mutate);
    assertBrokenBy("audit-agent-entries.mjs", r.source, needle, "スキルの列挙");
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /走査対象が 0 件です（スキル）/);
  });

  test("手順書の列挙が空になると非ゼロで終了する（#489）", () => {
    const needle = "const procedures = listTrackedFiles(REPO_ROOT, [`${PROCEDURES_DIR}*`]);";
    const mutate = (s) => s.replace(needle, "const procedures = [];");
    const r = runScriptCopy("audit-agent-entries.mjs", mutate);
    assertBrokenBy("audit-agent-entries.mjs", r.source, needle, "手順書の列挙");
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /走査対象が 0 件です（手順書）/);
  });

  test("実リポジトリのスキルを実際に読んで照合する（手順書の一覧を渡し損ねると名指しで落ちる。#489）", () => {
    // Given: スキルの照合に、追跡下の手順書の代わりに空の一覧を渡す（0 件ガードには掛からない）
    const needle = "for (const rel of skills) problems.push(...checkSkill(rel, read(rel), procedures));";
    const mutate = (s) => s.replace(needle, "for (const rel of skills) problems.push(...checkSkill(rel, read(rel), []));");
    // When
    const r = runScriptCopy("audit-agent-entries.mjs", mutate);
    // Then: 実在のスキルが「手順書へのリンクがありません」で名指しされる
    assertBrokenBy("audit-agent-entries.mjs", r.source, needle, "スキルの照合");
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /\.claude\/skills\/[^/]+\/SKILL\.md: 本文に手順書へのリンクがありません/);
  });

  test("AGENTS.md の原則の節を読めなくなると非ゼロで終了する（0 本を「一致した」と読ませない）", () => {
    // Given: 節の見出しの判定を壊し、AGENTS.md から原則を 1 本も拾えなくする
    const needle = "inSection = /^##\\s+絶対規則\\s*$/.test(line);";
    const mutate = (s) => s.replace(needle, "inSection = false;");
    // When
    const r = runScriptCopy("audit-agent-entries.mjs", mutate);
    // Then: まず「壊れたこと自体」を確かめる
    assertBrokenBy("audit-agent-entries.mjs", r.source, needle, "節の判定");
    // Then
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /走査対象が 0 件です（AGENTS\.md の原則）/);
  });

  test("候補の列挙が空になると非ゼロで終了する（宣言していない入口を見なくなる経路）", () => {
    const needle = "const candidates = listTrackedFiles(REPO_ROOT, ENTRY_CANDIDATE_PATTERNS).filter(isEntryCandidate);";
    const mutate = (s) => s.replace(needle, "const candidates = [];");
    const r = runScriptCopy("audit-agent-entries.mjs", mutate);
    assertBrokenBy("audit-agent-entries.mjs", r.source, needle, "候補の列挙");
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /走査対象が 0 件です（候補）/);
  });

  test("実在しない入口を宣言すると非ゼロで終了し、名指しする（宣言と実体の照合が生きている）", () => {
    // Given: 宣言に、追跡下に無いファイルを足す
    const needle = '{ path: "CLAUDE.md", tool: "Claude Code" },';
    const mutate = (s) => s.replace(needle, `${needle}\n  { path: "NO-SUCH-ENTRY.md", tool: "架空" },`);
    // When
    const r = runScriptCopy("audit-agent-entries.mjs", mutate);
    // Then
    assert.equal(countOf(r.source, "NO-SUCH-ENTRY.md"), 1, "宣言を足せていません");
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /NO-SUCH-ENTRY\.md: 宣言した入口（架空）が追跡下にありません/);
  });

  test("宣言から入口を外すと非ゼロで終了し、宣言されていない入口として名指しする", () => {
    // Given: GEMINI.md は追跡下にあるのに、宣言から外す
    const needle = '  { path: "GEMINI.md", tool: "Gemini CLI" },\n';
    const mutate = (s) => s.replace(needle, "");
    // When
    const r = runScriptCopy("audit-agent-entries.mjs", mutate);
    // Then
    assertBrokenBy("audit-agent-entries.mjs", r.source, needle, "宣言の行");
    assert.notEqual(r.status, 0, `落ちていません。stdout:\n${r.stdout}`);
    assert.match(r.stderr, /GEMINI\.md: 宣言されていない入口です/);
  });
});
