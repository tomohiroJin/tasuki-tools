import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { findClosingKeywords, decideClosingKeywordOutput } from "./closing-keywords.mjs";

const kinds = (text, source = "body") => findClosingKeywords(text, source).map((f) => `${f.kind}:${f.ref}`);

describe("findClosingKeywords: GitHub が閉鎖と読む形", () => {
  test("close/closes/closed・fix/fixes/fixed・resolve/resolves/resolved、大小文字、コロン、owner/repo#N、URL", () => {
    for (const w of ["close", "Closes", "closed", "fix", "FIXES", "fixed", "resolve", "Resolves", "resolved", "Closes:"]) {
      assert.deepEqual(kinds(`これは ${w} #12 です`), [`prose:#12`], w);
    }
    assert.deepEqual(kinds("これは closes a/b#7 です"), ["prose:a/b#7"]);
    assert.deepEqual(kinds("これは fixes https://github.com/a/b/issues/9 です"), ["prose:https://github.com/a/b/issues/9"]);
  });

  test("閉鎖でない語は拾わない（closer・prefix・Part of・番号なし・語の途中）", () => {
    for (const t of ["Part of #12", "closer #12", "prefix #12", "closes the door", "Closes 12", "refs #12", "unfixes #3", "this closes\n#12"]) {
      assert.deepEqual(kinds(t), [], t);
    }
  });
});

describe("findClosingKeywords: 本文での分類", () => {
  test("行頭（箇条書き・引用・--body の直後を含む）の単独の閉鎖は、意図した閉鎖として拾わない", () => {
    for (const t of ["Closes #578", "- Closes #578", "* Fixes #3", "> Resolves #4", '--body "Closes #578', "gh pr create --body 'Closes #578"]) {
      assert.deepEqual(kinds(t), [], t);
    }
  });

  test("コードレビュー 9: 番号つきの箇条書き（1. Fixes #5）は行頭の単独。行の途中の -b・--body は印にしない", () => {
    for (const t of ["1. Fixes #5", "2) Closes #6", "- 1. Closes #7", "10. Resolves #8"]) assert.deepEqual(kinds(t), [], t);
    assert.deepEqual(kinds("使い方は -b Closes #5 のように"), ["prose:#5"]);
    assert.deepEqual(kinds("説明 --body Fixes #6 の話"), ["prose:#6"]);
    assert.deepEqual(kinds("1. 説明 Fixes #5"), ["prose:#5"]);
    // gh / git のコマンドの行の --body・-m の直後は今までどおり単独
    assert.deepEqual(kinds('gh pr create --title "feat: x" --body "Closes #578'), []);
    assert.deepEqual(kinds('git commit -m "Closes #578'), []);
  });

  test("文の途中の閉鎖は地の文（squash で勝手に閉じる）", () => {
    assert.deepEqual(kinds("ADR の PR を Closes #241 とした。"), ["prose:#241"]);
    assert.deepEqual(kinds("Part of #5。後で Fixes #6 にする"), ["prose:#6"]);
  });

  test("バッククォートの中は効かない（閉じたいなら外す）。行頭でも拾う", () => {
    assert.deepEqual(kinds("`Closes #184`"), ["code:#184"]);
    assert.deepEqual(kinds("- `Fixes #3`"), ["code:#3"]);
    assert.deepEqual(kinds("文中の `Closes #1` と Closes #2 の説明"), ["code:#1", "prose:#2"]);
  });

  test("コードブロックの中も効かない", () => {
    assert.deepEqual(kinds("説明\n```\nCloses #9\n```\n"), ["code:#9"]);
  });
});

describe("findClosingKeywords: コミット・題", () => {
  test("コミットメッセージと題では、行頭の単独の閉鎖も拾う（squash の本文に連結される）", () => {
    assert.deepEqual(kinds("Closes #5", "commit"), ["prose:#5"]);
    assert.deepEqual(kinds("feat: x\n\n- Fixes #5", "commit"), ["prose:#5"]);
    assert.deepEqual(kinds("feat: Closes #5", "title"), ["prose:#5"]);
  });
  test("コミットでもバッククォートの中は code", () => {
    assert.deepEqual(kinds("`Closes #5`", "commit"), ["code:#5"]);
  });
});

describe("decideClosingKeywordOutput", () => {
  const mk = (command) => JSON.stringify({ tool_name: "Bash", cwd: "/w", tool_input: { command } });
  const deps = (over = {}) => ({ commitMessages: () => [], readFile: () => null, ...over });

  test("gh pr create でないコマンドは見ない", () => {
    assert.equal(decideClosingKeywordOutput(mk('git commit -m "x Closes #5 y"'), deps()), null);
    assert.equal(decideClosingKeywordOutput("not json", deps()), null);
  });

  test("意図した閉鎖（行頭の単独）だけなら null", () => {
    assert.equal(decideClosingKeywordOutput(mk('gh pr create --title "feat: x" --body "Closes #578"'), deps()), null);
    assert.equal(decideClosingKeywordOutput(mk('gh pr create --body "$(cat <<\'EOF\'\n## 概要\nx\n\nCloses #578\nEOF\n)"'), deps()), null);
  });

  test("コマンドの本文（ヒアドキュメントの中を含む）の地の文・バッククォートを ask", () => {
    const heredoc = 'gh pr create --body "$(cat <<\'EOF\'\n## 概要\n`Closes #578` と書く。後で Fixes #9 とする。\nEOF\n)"';
    const out = decideClosingKeywordOutput(mk(heredoc), deps());
    assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
    const r = out.hookSpecificOutput.permissionDecisionReason;
    assert.match(r, /#578/);
    assert.match(r, /バッククォート/);
    assert.match(r, /#9/);
    assert.match(r, /地の文/);
  });

  test("--body-file の中身を読む。読めなければ見ない", () => {
    const cmd = "gh pr create --body-file /tmp/b.md";
    const out = decideClosingKeywordOutput(mk(cmd), deps({ readFile: (p) => (p === "/tmp/b.md" ? "説明 Closes #3 です" : null) }));
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /#3/);
    assert.equal(decideClosingKeywordOutput(mk(cmd), deps()), null);
  });

  test("枝のコミットメッセージの閉鎖は、出どころ（短いハッシュ）つきで ask", () => {
    const out = decideClosingKeywordOutput(mk("gh pr create --title x"), deps({ commitMessages: () => [{ hash: "abcdef1234", message: "docs: x\n\nCloses #241 とした" }] }));
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /abcdef1/);
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /squash/);
  });

  test("コミットの取得が投げても、ほかの検査は続ける（null か本文の ask）", () => {
    const boom = () => { throw new Error("x"); };
    assert.equal(decideClosingKeywordOutput(mk("gh pr create --title x"), deps({ commitMessages: boom })), null);
  });
});
