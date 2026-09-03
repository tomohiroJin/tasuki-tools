import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  GATE_BOUNDARY_DATE,
  extractPrinciples,
  parsePlanDate,
  classifyPlans,
  findGateSections,
  stripCodeFences,
  checkGate,
} from "./audit-plan-gate.mjs";

/** 憲法の原則見出しの写し（形式だけを再現した最小の本文）。 */
const CONSTITUTION = [
  "# Tasuki 憲法",
  "",
  "## 原則",
  "",
  "### I. テスト駆動開発（NON-NEGOTIABLE）",
  "本文",
  "### II. 技術選定は ADR を通す",
  "本文",
  "### III. 揮発インメモリと単純運用",
  "本文",
  "",
  "## Governance",
  "本文",
].join("\n");

const PRINCIPLES = extractPrinciples(CONSTITUTION);

/** 3 原則ぶんの判定表を持つ、通るべきゲート。 */
const GOOD_GATE = [
  "# 実装計画",
  "",
  "## Constitution Check",
  "",
  "| 原則 | 判定 | 根拠 |",
  "|---|---|---|",
  "| I. テスト駆動開発 | 通過 | Red → Green で書く |",
  "| II. 技術選定は ADR を通す | 該当なし | 新しい依存を足さない |",
  "| III. 揮発インメモリと単純運用 | 該当なし | 保存機構に触れない |",
  "",
  "**逸脱なし。**",
  "",
  "## Global Constraints",
  "",
  "| I. これは別の節の表 | x | y |",
].join("\n");

describe("GATE_BOUNDARY_DATE: 境界日の宣言", () => {
  test("ISO の日付である", () => {
    // Given / When / Then: 比較は文字列で行うので、桁の揃った形でなければならない
    assert.match(GATE_BOUNDARY_DATE, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("extractPrinciples: 憲法から原則を導出する", () => {
  test("ローマ数字と表題を順に取り出す", () => {
    // Given / When / Then
    assert.deepEqual(
      PRINCIPLES.map((p) => p.numeral),
      ["I", "II", "III"],
    );
    assert.equal(PRINCIPLES[0].title, "テスト駆動開発（NON-NEGOTIABLE）");
  });

  test("原則以外の見出しを拾わない", () => {
    // Given / When / Then: 「## 原則」「## Governance」は原則そのものではない
    assert.equal(PRINCIPLES.length, 3);
  });

  test("見出しの形式が変わると 0 件になる（呼び出し側が落とすための入力）", () => {
    // Given: ローマ数字の番号付けをやめた憲法
    const renamed = CONSTITUTION.replace(/^### [IVX]+\. /gm, "### ");
    // When / Then: **ここで空を返すこと自体が正しい**。0 件を「全部満たした」と読ませない
    //              責任は main() にある（設計正本 D4）
    assert.deepEqual(extractPrinciples(renamed), []);
  });
});

describe("parsePlanDate: ファイル名から日付を取る", () => {
  test("YYYY-MM-DD- 接頭辞を取り出す", () => {
    assert.equal(parsePlanDate("2026-09-04-foo-bar.md"), "2026-09-04");
  });

  test("接頭辞が無ければ null（分類できない）", () => {
    assert.equal(parsePlanDate("foo-bar.md"), null);
    assert.equal(parsePlanDate("2026-09-foo.md"), null);
  });

  test("日付が本文の途中にあっても拾わない", () => {
    assert.equal(parsePlanDate("plan-2026-09-04.md"), null);
  });
});

describe("classifyPlans: 境界日で切る", () => {
  const PLANS = [
    "docs/superpowers/plans/2026-08-28-old.md",
    "docs/superpowers/plans/2026-09-03-day-before.md",
    "docs/superpowers/plans/2026-09-04-boundary.md",
    "docs/superpowers/plans/2026-09-05-after.md",
  ];

  test("境界日ちょうどは要求対象に入る", () => {
    // Given / When
    const { required } = classifyPlans(PLANS, "2026-09-04");
    // Then: 「以降」なので境界日そのものを含む
    assert.deepEqual(required, [
      "docs/superpowers/plans/2026-09-04-boundary.md",
      "docs/superpowers/plans/2026-09-05-after.md",
    ]);
  });

  test("境界日より前は対象外（遡らない）", () => {
    // Given / When
    const { exempt } = classifyPlans(PLANS, "2026-09-04");
    // Then: 既存はこの一様な理由だけで外れる。除外表は持たない（設計正本 D2）
    assert.deepEqual(exempt, [
      "docs/superpowers/plans/2026-08-28-old.md",
      "docs/superpowers/plans/2026-09-03-day-before.md",
    ]);
  });

  test("日付を持たないものは分類できないものとして分ける", () => {
    // Given: 黙って対象外へ落ちる経路を残さない（設計正本 D1）
    const { undated, required, exempt } = classifyPlans(
      [...PLANS, "docs/superpowers/plans/no-date.md"],
      "2026-09-04",
    );
    // When / Then
    assert.deepEqual(undated, ["docs/superpowers/plans/no-date.md"]);
    assert.equal(required.includes("docs/superpowers/plans/no-date.md"), false);
    assert.equal(exempt.includes("docs/superpowers/plans/no-date.md"), false);
  });
});

describe("stripCodeFences: フェンスの中身を落とす", () => {
  test("``` で囲まれた中身を落とす", () => {
    // Given / When
    const out = stripCodeFences(["外側", "```markdown", "## Constitution Check", "```", "外側 2"].join("\n"));
    // Then
    assert.doesNotMatch(out, /Constitution Check/);
    assert.match(out, /外側 2/);
  });

  test("~~~ のフェンスも落とす", () => {
    const out = stripCodeFences(["~~~", "## Constitution Check", "~~~", "本文"].join("\n"));
    assert.doesNotMatch(out, /Constitution Check/);
  });

  test("行数を保つ（位置がずれない）", () => {
    const text = ["a", "```", "b", "```", "c"].join("\n");
    assert.equal(stripCodeFences(text).split("\n").length, text.split("\n").length);
  });

  test("開始より短いフェンスでは閉じない（4 バックティックの入れ子）", () => {
    // Given: ガイドの様式サンプルは ```markdown の中にあるので、**それを引用するには
    //        4 バックティックを使うのが自然**。3 文字固定で判定すると内側の ``` を
    //        閉じと誤認し、以降の本文が素通りする（レビューで実測）
    const out = stripCodeFences(
      ["````markdown", "```markdown", "## Constitution Check", "```", "````", "外側"].join("\n"),
    );
    // Then
    assert.doesNotMatch(out, /Constitution Check/);
    assert.match(out, /外側/);
  });

  test("違う文字のフェンスでは閉じない", () => {
    const out = stripCodeFences(["```", "## Constitution Check", "~~~", "まだ中", "```"].join("\n"));
    assert.doesNotMatch(out, /Constitution Check/);
    assert.doesNotMatch(out, /まだ中/);
  });
});

describe("findGateSections: ゲートの節を切り出す", () => {
  test("見出しから次の同位以上の見出しまでを返す", () => {
    // Given / When
    const [section] = findGateSections(GOOD_GATE);
    // Then: 節の中身は入り、次の節（Global Constraints）は入らない
    assert.match(section, /I\. テスト駆動開発/);
    assert.doesNotMatch(section, /別の節の表/);
  });

  test("日本語を混ぜた見出しでも見つける（#113 の実在の形）", () => {
    // Given: `## 規約チェック（Constitution Check）`
    const text = ["## 規約チェック（Constitution Check）", "", "| I. x | y | z |"].join("\n");
    // When / Then
    assert.match(findGateSections(text)[0], /I\. x/);
  });

  test("見出しが無ければ空", () => {
    assert.deepEqual(findGateSections("# 実装計画\n\n## Global Constraints\n"), []);
  });

  test("下位の見出しは節を終わらせない", () => {
    // Given: ## の節の中に ### がある
    const text = ["## Constitution Check", "### 補足", "| I. x | y | z |", "## 次の節"].join("\n");
    // When / Then
    assert.match(findGateSections(text)[0], /I\. x/);
  });

  test("レベル 1 の見出しも拾う（設計正本 D3「レベルは問わない」）", () => {
    assert.equal(findGateSections("# Constitution Check\n\n| I. x | y | z |").length, 1);
  });

  test("候補が複数あればすべて返す", () => {
    // Given: ゲートより前にタスクの見出しがある
    const text = ["### Task 1: Constitution Check の節を足す", "本文", "## Constitution Check", "| I. x | y | z |"].join("\n");
    // When / Then
    assert.equal(findGateSections(text).length, 2);
  });

  test("他の候補を丸ごと含む節は候補にしない（H1 の題に語が入る形）", () => {
    // Given: この機能を扱う実装計画がまさにこう名乗る。下位に H1 が無いので
    //        **文書全体が 1 つの節**になり、別の節の表と本文の「逸脱なし」で通ってしまう
    const text = [
      "# Constitution Check ゲート検査の実装計画",
      "",
      "## 背景",
      "| I. x | 通過 | y |",
      "**逸脱なし。**",
      "",
      "## Constitution Check",
      "（あとで書く）",
    ].join("\n");
    // When / Then: 本物のゲートだけが候補になる
    const sections = findGateSections(text);
    assert.equal(sections.length, 1);
    assert.match(sections[0], /あとで書く/);
  });

  test("フェンスの中の見出しは候補にしない", () => {
    // Given: ガイドの様式サンプルを引用しただけの plan
    const text = ["# 引用", "```markdown", "## Constitution Check", "| I. x | y | z |", "```"].join("\n");
    // When / Then
    assert.deepEqual(findGateSections(text), []);
  });
});

describe("checkGate: ゲートの中身（設計正本 D3）", () => {
  const rel = "docs/superpowers/plans/2026-09-04-example.md";

  test("見出し・全原則の行・逸脱の結論がそろっていれば問題なし", () => {
    assert.deepEqual(checkGate(rel, GOOD_GATE, PRINCIPLES), []);
  });

  test("節が無ければ落とす（E1）", () => {
    // Given / When
    const problems = checkGate(rel, "# 実装計画\n\n## Global Constraints\n", PRINCIPLES);
    // Then
    assert.equal(problems.length, 1);
    assert.equal(problems[0].file, rel);
    assert.match(problems[0].message, /Constitution Check/);
  });

  test("原則の行が欠けていれば、欠けた原則を名指しする（E2）", () => {
    // Given: II の行を落とす
    const text = GOOD_GATE.replace("| II. 技術選定は ADR を通す | 該当なし | 新しい依存を足さない |\n", "");
    // When
    const problems = checkGate(rel, text, PRINCIPLES);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /II/);
    assert.doesNotMatch(problems[0].message, /III/);
  });

  test("空の節は通さない（対策が自分の塞ぐ欠陥を持たないこと）", () => {
    // Given: 見出しだけ置いた plan
    const text = "# 実装計画\n\n## Constitution Check\n\n## Global Constraints\n";
    // When
    const problems = checkGate(rel, text, PRINCIPLES);
    // Then: 原則の欠落と結論の不在の両方が出る
    assert.equal(problems.length, 2);
  });

  test("逸脱の結論が無ければ落とす（E3）", () => {
    // Given
    const text = GOOD_GATE.replace("**逸脱なし。**", "");
    // When
    const problems = checkGate(rel, text, PRINCIPLES);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /逸脱/);
  });

  test("Complexity Tracking での正当化も結論として認める", () => {
    // Given: 憲法 Governance が認めている逃げ道。塞いではならない
    const text = GOOD_GATE.replace("**逸脱なし。**", "**Complexity Tracking**: 原則 X から逸脱する。理由は…");
    // When / Then
    assert.deepEqual(checkGate(rel, text, PRINCIPLES), []);
  });

  test("原則の行は節の中に無ければならない（他の節の表で代用できない）", () => {
    // Given: 判定表を Constitution Check の外へ出す
    const text = [
      "## Constitution Check",
      "",
      "**逸脱なし。**",
      "",
      "## Global Constraints",
      "| I. テスト駆動開発 | 通過 | x |",
      "| II. 技術選定は ADR を通す | 通過 | x |",
      "| III. 揮発インメモリと単純運用 | 通過 | x |",
    ].join("\n");
    // When / Then
    assert.equal(checkGate(text ? rel : rel, text, PRINCIPLES).length, 1);
  });

  test("ローマ数字で見る（原則名の文言修正で過去の plan を赤くしない）", () => {
    // Given: 表題を言い換えた行
    const text = GOOD_GATE.replace("| I. テスト駆動開発 |", "| I. テストを先に書く |");
    // When / Then: 設計正本 §7 の申し送りどおり、名前までは一致させない
    assert.deepEqual(checkGate(rel, text, PRINCIPLES), []);
  });

  test("様式サンプルを引用しただけでは通さない（フェンスの中身は数えない）", () => {
    // Given: docs/guides/plan-writing.md の見本をそのまま引用した plan。
    //        **この検査が塞ごうとしている「節はあるが実質が無い」そのもの**
    const quoted = ["# 引用しただけの plan", "", "```markdown", GOOD_GATE, "```", "", "## 背景"].join("\n");
    // When
    const problems = checkGate(rel, quoted, PRINCIPLES);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /節がありません/);
  });

  test("ゲートより前に紛らわしい見出しがあっても偽陽性にしない", () => {
    // Given: `### Task 1: Constitution Check の節を足す` が先にある正しい plan
    const text = ["# 実装計画", "", "### Task 1: Constitution Check の節を足す", "", "本文。", "", GOOD_GATE].join("\n");
    // When / Then: 候補のどれか 1 つが満たしていれば通す
    assert.deepEqual(checkGate(rel, text, PRINCIPLES), []);
  });

  test("落とすときは最も問題の少ない候補を報告する", () => {
    // Given: 無関係な候補（原則も結論も無い）と、結論だけ欠けた本物のゲート
    const text = [
      "### Task 1: Constitution Check の節を足す",
      "本文。",
      GOOD_GATE.replace("**逸脱なし。**", ""),
    ].join("\n");
    // When
    const problems = checkGate(rel, text, PRINCIPLES);
    // Then: 「原則が全部無い」ではなく「結論が無い」だけが出る
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /逸脱/);
  });

  test("逸脱の結論を判定表のセルで満たさせない", () => {
    // Given: すべてのセルに「逸脱なし」と書いただけで、節としての結論が無い
    const text = [
      "## Constitution Check",
      "",
      ...PRINCIPLES.map((p) => `| ${p.numeral}. x | 通過 | 逸脱なし |`),
    ].join("\n");
    // When
    const problems = checkGate(rel, text, PRINCIPLES);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /逸脱/);
  });

  test("字下げした判定表を落とさない（GFM では表として描画される）", () => {
    // Given: 各行を 2 スペース字下げした正しい判定表。**GitHub 上では表に見えているのに
    //        CI だけが赤くなる**形だったので、表の行の定義を結論判定と揃えた
    const text = ["## Constitution Check", ""]
      .concat(PRINCIPLES.map((p) => `  | ${p.numeral}. x | 通過 | y |`))
      .concat(["", "**逸脱なし。**"])
      .join("\n");
    // When / Then
    assert.deepEqual(checkGate(rel, text, PRINCIPLES), []);
  });

  test("ローマ数字の直後に空白が無くても拾う", () => {
    // Given: 日本語の表記では `| I.テスト駆動開発 |` と書くことがある
    const text = ["## Constitution Check", ""]
      .concat(PRINCIPLES.map((p) => `| ${p.numeral}.${p.title} | 通過 | y |`))
      .concat(["", "**逸脱なし。**"])
      .join("\n");
    // When / Then
    assert.deepEqual(checkGate(rel, text, PRINCIPLES), []);
  });

  test("4 バックティックで様式サンプルを引用しても通さない", () => {
    // Given: ガイドの見本（```markdown を含む）を丸ごと引用した plan
    const quoted = ["# 引用しただけの plan", "", "````markdown", "```markdown", GOOD_GATE, "```", "````"].join("\n");
    // When
    const problems = checkGate(rel, quoted, PRINCIPLES);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /節がありません/);
  });

  test("II の行があっても I の行の代わりにはならない", () => {
    // Given: I の行だけを落とす（前方一致で誤判定しないことを見る）
    const text = GOOD_GATE.replace("| I. テスト駆動開発 | 通過 | Red → Green で書く |\n", "");
    // When
    const problems = checkGate(rel, text, PRINCIPLES);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /\bI\b/);
  });
});
