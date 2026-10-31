import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SOURCE_PATH,
  ENTRY_FILES,
  MAX_ENTRY_LINES,
  MAX_ENTRY_CHARS,
  isEntryCandidate,
  extractAgentsPrinciples,
  comparePrinciples,
  linksToSource,
  checkEntry,
  findUndeclaredEntries,
} from "./audit-agent-entries.mjs";

/** AGENTS.md の「絶対規則」節の写し（形式だけを再現した最小の本文）。 */
const AGENTS = [
  "# ガイド",
  "",
  "## 絶対規則",
  "",
  "正本は憲法。",
  "",
  "- I. テスト駆動開発（NON-NEGOTIABLE）",
  "- II. 技術選定は ADR を通す",
  "",
  "### AI 運用規則",
  "",
  "- III. これは原則ではない（下位の見出しの中の箇条書き）",
  "",
  "## 文書地図",
  "",
  "- IV. これも原則ではない",
].join("\n");

const CONSTITUTION_PRINCIPLES = [
  { numeral: "I", title: "テスト駆動開発（NON-NEGOTIABLE）" },
  { numeral: "II", title: "技術選定は ADR を通す" },
];

describe("宣言", () => {
  test("正本は AGENTS.md", () => {
    assert.equal(SOURCE_PATH, "AGENTS.md");
  });

  test("入口は 1 件以上あり、正本そのものを入口に数えない", () => {
    // Given / When / Then: 正本を入口に入れると「正本が正本へ向く」で通ってしまう
    assert.ok(ENTRY_FILES.length > 0);
    assert.ok(!ENTRY_FILES.some((e) => e.path === SOURCE_PATH));
  });

  test("入口の重複が無い", () => {
    const paths = ENTRY_FILES.map((e) => e.path);
    assert.equal(new Set(paths).size, paths.length);
  });
});

describe("extractAgentsPrinciples: AGENTS.md から原則の見出しを読む", () => {
  test("「絶対規則」節の直下の箇条書きだけを、順に取り出す", () => {
    // Given / When
    const got = extractAgentsPrinciples(AGENTS);
    // Then: 下位の見出し（### AI 運用規則）と別の節（## 文書地図）の箇条書きは拾わない
    assert.deepEqual(got, CONSTITUTION_PRINCIPLES);
  });

  test("節が無ければ 0 件（呼び出し側が 0 件で落とす）", () => {
    assert.deepEqual(extractAgentsPrinciples("# x\n\n- I. 何か\n"), []);
  });

  test("行末の空白を表題に含めない", () => {
    const got = extractAgentsPrinciples("## 絶対規則\n\n- I. テスト   \n");
    assert.deepEqual(got, [{ numeral: "I", title: "テスト" }]);
  });
});

describe("comparePrinciples: 憲法と AGENTS.md の見出しを突き合わせる", () => {
  test("一致すれば問題 0 件", () => {
    assert.deepEqual(comparePrinciples(CONSTITUTION_PRINCIPLES, CONSTITUTION_PRINCIPLES), []);
  });

  test("AGENTS.md に無い原則を報告する", () => {
    // Given: 憲法に III が増えたのに AGENTS.md が追従していない
    const constitution = [...CONSTITUTION_PRINCIPLES, { numeral: "III", title: "揮発インメモリと単純運用" }];
    // When
    const problems = comparePrinciples(constitution, CONSTITUTION_PRINCIPLES);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /III/);
    assert.match(problems[0], /AGENTS\.md にありません/);
  });

  test("憲法に無い原則を報告する", () => {
    const agents = [...CONSTITUTION_PRINCIPLES, { numeral: "XII", title: "架空" }];
    const problems = comparePrinciples(CONSTITUTION_PRINCIPLES, agents);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /XII/);
    assert.match(problems[0], /憲法にありません/);
  });

  test("表題の違いを報告する（憲法の見出しの改名に追従していない）", () => {
    const agents = [CONSTITUTION_PRINCIPLES[0], { numeral: "II", title: "技術スタックの固定" }];
    const problems = comparePrinciples(CONSTITUTION_PRINCIPLES, agents);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /II/);
    assert.match(problems[0], /技術スタックの固定/);
    assert.match(problems[0], /技術選定は ADR を通す/);
  });

  test("番号の重複を名指しする（Map の上書きで表題の違いを見落とさない）", () => {
    // Given: AGENTS.md に I が 2 本ある
    const agents = [{ numeral: "I", title: "Z" }, CONSTITUTION_PRINCIPLES[0], CONSTITUTION_PRINCIPLES[1]];
    // When
    const problems = comparePrinciples(CONSTITUTION_PRINCIPLES, agents);
    // Then
    assert.ok(problems.some((p) => /原則 I が AGENTS\.md に 2 本あります/.test(p)), problems.join("\n"));
  });

  test("順序の違いを報告する", () => {
    const agents = [CONSTITUTION_PRINCIPLES[1], CONSTITUTION_PRINCIPLES[0]];
    const problems = comparePrinciples(CONSTITUTION_PRINCIPLES, agents);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /順序/);
  });
});

describe("linksToSource: 入口が正本へ向いているか", () => {
  test("同じ階層からの相対リンクを正本と解く", () => {
    assert.equal(linksToSource("CLAUDE.md", "読んでください: [AGENTS.md](AGENTS.md)"), true);
  });

  test("下の階層からの ../ を正本と解く", () => {
    assert.equal(linksToSource(".github/copilot-instructions.md", "[AGENTS.md](../AGENTS.md)"), true);
  });

  test("./ つき・アンカーつきでも解く", () => {
    assert.equal(linksToSource("GEMINI.md", "[規則](./AGENTS.md#絶対規則)"), true);
  });

  test("題名つきのリンクも解く", () => {
    assert.equal(linksToSource("CLAUDE.md", '[規則](AGENTS.md "正本")'), true);
  });

  test("行頭の @ による取り込み（Claude Code・Gemini CLI）を正本と解く", () => {
    // Given: 取り込みなら本文が読み込まれる。リンクより強い向け方
    assert.equal(linksToSource("CLAUDE.md", "@AGENTS.md"), true);
    assert.equal(linksToSource("GEMINI.md", "@./AGENTS.md"), true);
    assert.equal(linksToSource("docs/CLAUDE.md", "@../AGENTS.md"), true);
  });

  test("文の途中の @ は取り込みと見なさない", () => {
    assert.equal(linksToSource("CLAUDE.md", "メールは x@AGENTS.md へ"), false);
  });

  test("コードブロックの中のリンクは向いていない", () => {
    assert.equal(linksToSource("CLAUDE.md", "```\n[a](AGENTS.md)\n@AGENTS.md\n```"), false);
  });

  test("HTML コメントの中のリンクは向いていない", () => {
    assert.equal(linksToSource("CLAUDE.md", "<!-- [a](AGENTS.md) -->"), false);
    assert.equal(linksToSource("CLAUDE.md", "<!--\n@AGENTS.md\n-->"), false);
  });

  test("リンクにせず名前を書いただけでは向いていない", () => {
    // Given: 文字として AGENTS.md と書いても、たどれなければ入口にならない
    assert.equal(linksToSource("CLAUDE.md", "AGENTS.md を読んでください"), false);
  });

  test("階層を解き違えたリンクは向いていない", () => {
    // Given: .github/ の下から ../ を付けずに書くと .github/AGENTS.md を指す
    assert.equal(linksToSource(".github/copilot-instructions.md", "[AGENTS.md](AGENTS.md)"), false);
  });

  test("別の場所の同名ファイルは向いていない", () => {
    assert.equal(linksToSource("CLAUDE.md", "[x](docs/AGENTS.md)"), false);
  });
});

describe("checkEntry: 入口は薄い", () => {
  const GOOD = "# CLAUDE.md\n\n決めごとは [AGENTS.md](AGENTS.md) を読んでください。\n";

  test("正本へ向く数行の入口は通る", () => {
    assert.deepEqual(checkEntry("CLAUDE.md", GOOD), []);
  });

  test("正本へ向いていない入口を報告する", () => {
    const problems = checkEntry("CLAUDE.md", "# CLAUDE.md\n\n決めごとは README を読んでください。\n");
    assert.equal(problems.length, 1);
    assert.match(problems[0], /AGENTS\.md へのリンクも取り込み/);
  });

  test("上限ちょうどの行数は通る（空行は数えない）", () => {
    // Given: 空でない行が上限ちょうど。空行を挟んでも数は変わらない
    const lines = ["[AGENTS.md](AGENTS.md)"];
    while (lines.length < MAX_ENTRY_LINES) lines.push("補足");
    const text = lines.join("\n\n");
    // When / Then
    assert.deepEqual(checkEntry("CLAUDE.md", text), []);
  });

  test("上限を超えた入口を報告する（規則を書き始めている）", () => {
    const lines = ["[AGENTS.md](AGENTS.md)"];
    while (lines.length < MAX_ENTRY_LINES + 1) lines.push("- 規則");
    const problems = checkEntry("CLAUDE.md", lines.join("\n"));
    assert.equal(problems.length, 1);
    assert.match(problems[0], new RegExp(`${MAX_ENTRY_LINES + 1} 行`));
  });
});

describe("checkEntry: 1 行に詰め込んだ規則", () => {
  test("上限ちょうどの文字数は通る", () => {
    const head = "[AGENTS.md](AGENTS.md)";
    const text = head + "あ".repeat(MAX_ENTRY_CHARS - head.length);
    assert.deepEqual(checkEntry("CLAUDE.md", text), []);
  });

  test("上限を超えた文字数を報告する", () => {
    const head = "[AGENTS.md](AGENTS.md)";
    const text = head + "あ".repeat(MAX_ENTRY_CHARS - head.length + 1);
    const problems = checkEntry("CLAUDE.md", text);
    assert.equal(problems.length, 1);
    assert.match(problems[0], new RegExp(`${MAX_ENTRY_CHARS + 1} 文字`));
  });
});

describe("isEntryCandidate: ツールが読みうるファイルか", () => {
  test("どの階層の CLAUDE.md・AGENTS.md・GEMINI.md も候補", () => {
    for (const rel of ["CLAUDE.md", "apps/x/CLAUDE.md", "AGENTS.md", "e2e/AGENTS.md", "GEMINI.md", "docs/GEMINI.md"]) {
      assert.equal(isEntryCandidate(rel), true, rel);
    }
  });

  test("名前の末尾が一致するだけのファイルは候補にしない", () => {
    for (const rel of ["docs/NOTCLAUDE.md", "MYAGENTS.md", "apps/x/XGEMINI.md"]) {
      assert.equal(isEntryCandidate(rel), false, rel);
    }
  });

  test("ツールが規則として読む他の置き場も候補", () => {
    for (const rel of [
      "AGENTS.override.md",
      "apps/x/AGENTS.override.md",
      "CLAUDE.local.md",
      ".claude/rules/style.md",
      ".github/copilot-instructions.md",
      ".github/instructions/a.instructions.md",
      ".cursorrules",
      ".cursor/rules/a.mdc",
      ".windsurfrules",
    ]) {
      assert.equal(isEntryCandidate(rel), true, rel);
    }
  });

  test("ふつうの文書は候補にしない", () => {
    for (const rel of ["README.md", "docs/README.md", ".github/pull_request_template.md"]) {
      assert.equal(isEntryCandidate(rel), false, rel);
    }
  });
});

describe("findUndeclaredEntries: 宣言されていない入口", () => {
  test("宣言と正本以外の候補を返す", () => {
    // Given: 下の階層に CLAUDE.md が足された（正本が 2 つになる形）
    const tracked = ["AGENTS.md", "CLAUDE.md", "apps/poker-web/CLAUDE.md"];
    // When
    const got = findUndeclaredEntries(tracked, [{ path: "CLAUDE.md" }]);
    // Then
    assert.deepEqual(got, ["apps/poker-web/CLAUDE.md"]);
  });

  test("下の階層の AGENTS.md も宣言されていない入口に数える", () => {
    // Given: 正本はリポジトリ直下の 1 つだけ
    const got = findUndeclaredEntries(["AGENTS.md", "e2e/AGENTS.md"], []);
    assert.deepEqual(got, ["e2e/AGENTS.md"]);
  });

  test("全部が宣言どおりなら空", () => {
    assert.deepEqual(findUndeclaredEntries(["AGENTS.md", "CLAUDE.md"], [{ path: "CLAUDE.md" }]), []);
  });
});
