#!/usr/bin/env node
/**
 * 実装計画の Constitution Check ゲートを見る検査（#155・#135 経路⑨）。
 *
 * ## 何を見るか
 *
 * 憲法 Governance は「すべての plan は Constitution Check ゲートを通過しなければならない」を
 * MUST としているが、機械検査が無いためゲートを持たない plan が増えても CI は緑のままだった。
 * 実測（2026-09-04）では、憲法批准以降の 28 件のうちゲートを持つのは **3 件**である。
 *
 * **境界日（{@link GATE_BOUNDARY_DATE}）以降の日付を持つ plan にのみ要求する。**
 * 既存の未達へは遡らない。当時通していないゲートを後から書き足すのは「通したことにする」
 * 記録の改竄であり、`docs/adr/0002` の「記録は当時の記述を保つ」に反する。
 *
 * **除外表を持たない。** 既存 25 件は「境界日より前」という一様な理由で対象外になる。
 * 25 行の理由つき除外表は「空文化している」を列挙し直したものにしかならない。
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **判定の中身を読まない。** 全原則の行があり結論があることまでしか見ない。
 *   「該当なし」で埋めた表は通る。ゲートは人が考えるためのもので、検査はその**場所**を守る
 * - **`docs/superpowers/specs/` は射程外。** 憲法の MUST は plan を名指ししている
 * - **境界日をずらせば回避できる**（#135 経路①と同じ型の残余）。宣言を緩める変更は
 *   diff に現れるので、レビューを拠り所とする
 * - **原則名を見ない。ローマ数字だけで突き合わせる。** 名前まで一致させると、憲法の
 *   文言修正のたびに過去の plan が赤くなる
 *
 * 設計方針: 判定は純粋関数、実 I/O と `process.exit` は `main()` の薄い配線だけに置く。
 * 追加依存は禁止。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  listTrackedFiles,
  findEmptyScanDimensions,
} from "./lib/scan-targets.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";

/**
 * ゲートを要求し始める日（この日を**含む**）。
 *
 * **既存の未達へ遡らないための線引きであって、免除ではない。** 決定と理由は
 * `docs/adr/0003` の追記と設計正本 D1・D2 にある。
 */
export const GATE_BOUNDARY_DATE = "2026-09-04";

/** 実装計画の置き場。git の `*` は `/` を跨ぐので、これで配下も含めて列挙される。 */
export const PLAN_PATTERNS = ["docs/superpowers/plans/*.md"];

/** 憲法の正本。原則の一覧はここから導出する（検査に直書きしない）。 */
export const CONSTITUTION_PATH = "docs/constitution.md";

/**
 * 憲法から原則の一覧を導出する（設計正本 D4）。
 *
 * `### I. テスト駆動開発（NON-NEGOTIABLE）` の形の見出しを拾う。
 * **検査に原則名を直書きしない** ので、原則が増減しても腐らない。
 *
 * **0 件を返しうる**（憲法の見出し形式が変わったとき）。それを「原則 0 本を全部満たした」と
 * 読ませない責任は呼び出し側にある。`main()` が 0 件で落とす。
 */
export function extractPrinciples(constitutionText) {
  const principles = [];
  for (const line of constitutionText.split("\n")) {
    const m = /^#{2,4}\s+([IVXLC]+)\.\s+(.+?)\s*$/.exec(line);
    if (m) principles.push({ numeral: m[1], title: m[2] });
  }
  return principles;
}

/** ファイル名の `YYYY-MM-DD-` 接頭辞。持たなければ `null`（分類できない）。 */
export function parsePlanDate(basename) {
  const m = /^(\d{4}-\d{2}-\d{2})-/.exec(basename);
  return m ? m[1] : null;
}

/**
 * 境界日で切る（設計正本 D1）。
 *
 * **日付を持たないものを `exempt` へ落とさない。** 落とすと、日付規約から外れた
 * ファイルが黙って対象外になる。分類できないことは問題として扱う。
 *
 * 比較は文字列で行う。ISO の日付は桁が揃っているので辞書順が時系列順と一致する。
 */
export function classifyPlans(relPaths, boundary) {
  const undated = [];
  const required = [];
  const exempt = [];
  for (const rel of relPaths) {
    const date = parsePlanDate(path.basename(rel));
    if (date === null) undated.push(rel);
    else if (date >= boundary) required.push(rel);
    else exempt.push(rel);
  }
  return { undated, required, exempt };
}

/**
 * コードフェンスの中身を落とす。
 *
 * **これが無いと、様式サンプルを引用しただけの plan が通る。**
 * `docs/guides/plan-writing.md` は ```` ```markdown ```` で囲んだ見本を持つ。その見本を
 * そのまま引用すれば、見出しも全原則の表も逸脱の結論もそろっているように見えるが、
 * **その plan 自身は何も判定していない**。塞ごうとしている「節はあるが実質が無い」を、
 * 検査の側が作り出す形になる（レビューで実測。問題 0 件で通った）。
 *
 * 行数は保つ（フェンスの中身を空行へ置き換える）。位置がずれると読みにくい。
 */
export function stripCodeFences(text) {
  let inFence = false;
  let marker = null;
  return text
    .split("\n")
    .map((line) => {
      const m = /^\s*(```|~~~)/.exec(line);
      if (m) {
        if (!inFence) {
          inFence = true;
          marker = m[1];
          return "";
        }
        if (m[1] === marker) {
          inFence = false;
          marker = null;
        }
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
}

/**
 * ゲートの節を**すべて**切り出す。
 *
 * **見出しの文言もレベルも固定しない。** 実在するゲートは `## Constitution Check` と
 * `## 規約チェック（Constitution Check）` の 2 種類がある（#113 が後者）。
 *
 * **1 つ目だけを採ってはならない。** ゲートより前に `Constitution Check` を含む見出し
 * （例: `### Task 1: Constitution Check の節を足す`）があると、そのタスク節をゲートと
 * みなして**正しい plan を偽陽性で落とす**（レビューで実測。誤検出 2 件）。
 * 候補を全部返し、**どれか 1 つが要求を満たせば通す**のは呼び出し側の仕事。
 *
 * 節は「同位以上の見出し」で終わる。下位の見出し（`###`）は節を終わらせない
 * ——終わらせると、小見出しを挟んだだけで判定表が節の外に出てしまう。
 */
export function findGateSections(text) {
  const lines = stripCodeFences(text).split("\n");
  const sections = [];
  for (let start = 0; start < lines.length; start++) {
    if (!/^#{1,6}\s.*Constitution Check/.test(lines[start])) continue;
    const level = /^(#+)/.exec(lines[start])[1].length;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      const m = /^(#+)\s/.exec(lines[i]);
      if (m && m[1].length <= level) {
        end = i;
        break;
      }
    }
    sections.push(lines.slice(start, end).join("\n"));
  }
  return sections;
}

/** 1 つの候補節が要求を満たしているか。 */
function evaluateSection(rel, section, principles) {
  const problems = [];
  const missing = principles
    .filter(({ numeral }) => !new RegExp(`^\\|\\s*${numeral}\\.\\s`, "m").test(section))
    .map(({ numeral }) => numeral);
  if (missing.length > 0) {
    problems.push({
      file: rel,
      message: `判定表に無い原則があります: ${missing.join(" / ")}    ← 憲法の全原則について「通過 / 該当なし / 逸脱」を書いてください`,
    });
  }

  // **表のセルで満たさせない。** `| I. x | 通過 | 逸脱なし |` の 1 行だけで結論の要求が
  // 満たせてしまうと、節全体の判断を書かずに通る（レビューで実測。問題 0 件で通った）。
  const hasConclusion = section
    .split("\n")
    .some((line) => !/^\s*\|/.test(line) && /逸脱なし|Complexity Tracking/.test(line));
  if (!hasConclusion) {
    problems.push({
      file: rel,
      message:
        "逸脱の結論がありません    ← 表の外に「逸脱なし」と書くか、Complexity Tracking で正当化してください",
    });
  }
  return problems;
}

/**
 * ゲートの中身を見る（設計正本 D3）。
 *
 * **見出しの存在だけでは通さない。** 空の節を置けば通る検査は、塞ごうとしている
 * 「節はあるが実質が無い」をそのまま再生産する。コードフェンスの中身を落とすのも
 * 同じ理由である（様式サンプルの引用で満たさせない）。
 *
 * 原則の行は**節の中**に無ければならない。他の節の表で代用できてしまうと、
 * ゲートを置く場所の意味が消える。
 */
export function checkGate(rel, text, principles) {
  const sections = findGateSections(text);
  if (sections.length === 0) {
    return [
      {
        file: rel,
        message:
          "Constitution Check の節がありません    ← docs/guides/plan-writing.md の様式で節を足してください",
      },
    ];
  }
  // **候補が複数あるときは、1 つでも満たしていれば通す。** 落とすときは最も問題の少ない
  // 候補を報告する（無関係な見出しの分まで並べると、直すべき節が埋もれる）。
  return sections
    .map((section) => evaluateSection(rel, section, principles))
    .sort((a, b) => a.length - b.length)[0];
}

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

function main() {
  const plans = listTrackedFiles(REPO_ROOT, PLAN_PATTERNS);
  const principles = extractPrinciples(
    fs.readFileSync(path.join(REPO_ROOT, CONSTITUTION_PATH), "utf8"),
  );
  const { undated, required, exempt } = classifyPlans(plans, GATE_BOUNDARY_DATE);

  const summary = `plan ${plans.length} 件 / ゲート要求 ${required.length} 件（境界日 ${GATE_BOUNDARY_DATE} 以降）`;

  // 走査量は成否によらず必ず出す（ADR-0014 決定 6）。何を見たかが赤の根拠になる。
  console.log(`[audit-plan-gate] 走査対象: ${summary}`);

  // 0 件ガードは「plan の総数」と「憲法から導出した原則」に掛ける（ADR-0014 決定 8）。
  // **「ゲート要求」の件数に掛けてはならない。** 0 件は正しい状態でありうる
  // （境界日以降に plan がまだ 1 本も無い、が現在の状態）。ここへ下限を置くと、
  // 「plan を書いていない」ことを検査の失敗として報告することになる。
  const emptyDimensions = findEmptyScanDimensions([
    { label: "plan", count: plans.length },
    { label: "憲法の原則", count: principles.length },
  ]);
  if (emptyDimensions.length > 0) {
    console.error(
      `[audit-plan-gate] 走査対象が 0 件です（${emptyDimensions.join(" / ")}）。検査が空振りしています`,
    );
    process.exit(1);
  }

  const problems = [];
  for (const rel of undated) {
    problems.push({
      file: rel,
      message: `ファイル名が YYYY-MM-DD- で始まっていません    ← 境界日で分類できないため対象外にできません`,
    });
  }
  for (const rel of required) {
    problems.push(...checkGate(rel, fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"), principles));
  }

  if (problems.length > 0) {
    console.error(
      `[audit-plan-gate] Constitution Check ゲートを通っていない実装計画があります（${problems.length} 件）`,
    );
    for (const p of problems) console.error(`  ${p.file}: ${p.message}`);
    console.error(`  様式の正本: docs/guides/plan-writing.md`);
    console.error(`  根拠: docs/constitution.md Governance / docs/adr/0003 / docs/adr/0014 決定 6`);
    process.exit(1);
  }

  console.log(
    `[audit-plan-gate] OK（原則 ${principles.length} 本 / 境界日より前の ${exempt.length} 件は対象外）`,
  );
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
