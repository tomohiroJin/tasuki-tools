import { describe, expect, it } from "vitest";
import {
  CATEGORIES, DIFFICULTIES, LANGUAGES, MAX_TOPIC_BODY, MAX_TOPIC_TITLE,
  type Category, type Language,
} from "../src/index.js";
import { TOPIC_BANK, type TopicBankEntry } from "../src/topic-bank.js";
import { renderTopicBody } from "../src/topic-render.js";

/**
 * 定型バンクの健全性（#91 spec §10・#634）。
 *
 * `topic-core` は依存を持たない（`scripts/audit-dependency-direction.mjs` の許可表が空）ので、
 * `@tasuki/markdown` の解析には通さず、本文の文字列で囲みの開きと閉じを見る。
 *
 * 本文は言語ごとに組む（`topic-render.ts`）。形の検査は、**10 言語それぞれで組んだ本文**に当てる。
 */

/** 本文の行のうち、囲み（```）の開きと閉じの行の位置。数が奇数なら閉じ忘れがある */
function fenceLines(body: string): number[] {
  return body
    .split("\n")
    .map((line, i) => (line.startsWith("```") ? i : -1))
    .filter((i) => i >= 0);
}

/**
 * 見出し（例 `最初のテストの例:`）の直後に囲みが開き、その中身が `pattern` に当たり、
 * 「ヒント:」より前で閉じているか。閉じだけでなく開きも見る —— 開きだけを見ると、閉じ忘れで
 * 以降の本文が全部コードになる誤りを通してしまう。
 */
function fencedAfter(body: string, label: string, pattern: RegExp | null): { opened: boolean; closedBeforeHint: boolean; matches: boolean } {
  const open = `${label}\n\`\`\`\n`;
  const at = body.indexOf(open);
  if (at < 0) return { opened: false, closedBeforeHint: false, matches: false };
  const from = at + open.length;
  const close = body.indexOf("\n```", from);
  const hint = body.lastIndexOf("ヒント:");
  // 閉じが見つからないと indexOf は -1 を返し「ヒントより前」を素通りするので、閉じの在否を先に見る
  const closedBeforeHint = close >= 0 && hint >= 0 && close < hint;
  const matches = pattern === null || (close >= 0 && pattern.test(body.slice(from, close)));
  return { opened: true, closedBeforeHint, matches };
}

const OK = { opened: true, closedBeforeHint: true, matches: true };

/**
 * 言語ごとのテストの書き方（定型の約束。`docs` ではなくここが正本）。テストの囲みの中身はこれに当たること。
 * 書き方を変えるときは、定型の本文と一緒に変える。
 */
const TEST_SHAPE: Record<Language, RegExp> = {
  TypeScript: /^test\(/m, // Jest / Vitest
  JavaScript: /^test\(/m, // Jest / Vitest
  Python: /^def test_\w*\(/m, // pytest
  Java: /^@Test\s*$/m, // JUnit 5
  Go: /^func Test\w*\(t \*testing\.T\)/m, // testing
  Ruby: /^\s*def test_\w*/m, // minitest
  Rust: /^#\[test\]\s*$/m, // cargo test
  "C#": /^\[Fact\]\s*$/m, // xUnit
  Kotlin: /^@Test\s*$/m, // JUnit 5 + kotlin.test
  Swift: /^func test\w*\(\)/m, // XCTest
};

/** 種類ごとに、本文が持つべきコードの囲み（`true` はテストの書き方を見る）。設計のお題はコードを必須にしない */
const REQUIRED_FENCES: Record<Category, readonly { label: string; isTest: boolean }[]> = {
  tdd: [{ label: "最初のテストの例:", isTest: true }],
  refactoring: [{ label: "対象のコード:", isTest: false }],
  design: [],
  debugging: [
    { label: "対象のコード:", isTest: false },
    { label: "落ちるテスト:", isTest: true },
  ],
};

/** 必須でないが、置いたらテストの書き方を見る囲み */
const OPTIONAL_TEST_FENCES = ["最初のテストの例:"];

const byCategory = (category: Category): readonly TopicBankEntry[] =>
  TOPIC_BANK.filter((e) => e.category === category);

const SLOT_MARKER = /\{\{slot:([A-Za-z][A-Za-z0-9_]*)\}\}/g;

/** テンプレートのうち、コードの囲みの中に置いた差し込み口の名前 */
function slotsInsideFences(template: string): Set<string> {
  const inside = new Set<string>();
  let fenced = false;
  for (const line of template.split("\n")) {
    if (line.startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced) for (const m of line.matchAll(SLOT_MARKER)) inside.add(m[1]!);
  }
  return inside;
}

/**
 * @requirements #634(定型が 100 件以上あり、どの難易度・種類にも、続けて引いて重ならない数がある)
 */
describe("定型バンクの件数", () => {
  it("100 件以上ある", () => {
    expect(TOPIC_BANK.length).toBeGreaterThanOrEqual(100);
  });

  it("どの種類・難易度の組にも 5 件以上ある（直前を外しても続けて引いて重ならない）", () => {
    for (const category of CATEGORIES) {
      for (const difficulty of DIFFICULTIES) {
        const n = byCategory(category).filter((e) => e.difficulty === difficulty).length;
        expect({ category, difficulty, enough: n >= 5 }).toEqual({ category, difficulty, enough: true });
      }
    }
  });

  it("TDD のお題は難易度ごとに 20 件以上ある（hard の偏りを埋めた）", () => {
    for (const difficulty of DIFFICULTIES) {
      const n = byCategory("tdd").filter((e) => e.difficulty === difficulty).length;
      expect({ difficulty, n: Math.min(n, 20) }).toEqual({ difficulty, n: 20 });
    }
  });

  it("種類と難易度は許可リストの値だけ", () => {
    for (const e of TOPIC_BANK) {
      expect(CATEGORIES).toContain(e.category);
      expect(DIFFICULTIES).toContain(e.difficulty);
    }
  });

  it("タイトルが重ならない（直前を外す判定はタイトルで見るので、重なると別のお題まで外れる）", () => {
    const titles = TOPIC_BANK.map((e) => e.title);
    const dup = titles.filter((t, i) => titles.indexOf(t) !== i);
    expect(dup).toEqual([]);
  });
});

/**
 * @requirements #634（PR #643 のレビュー: 定型を選んだ言語で出す）
 */
describe("定型バンクの差し込み口", () => {
  it("本文の差し込み口と slots の名前が一致し、どの差し込み口も 10 言語すべての値を持つ", () => {
    for (const e of TOPIC_BANK) {
      const used = [...new Set([...e.body.matchAll(SLOT_MARKER)].map((m) => m[1]!))].sort();
      expect({ title: e.title, slots: Object.keys(e.slots).sort() }).toEqual({ title: e.title, slots: used });
      for (const [name, values] of Object.entries(e.slots)) {
        expect({ title: e.title, name, languages: Object.keys(values).sort() }).toEqual({
          title: e.title,
          name,
          languages: [...LANGUAGES].sort(),
        });
      }
    }
  });

  /**
   * 訳し忘れ（別の言語のコードの写し）を見る。空白（字下げ・改行）を除いて比べる ——
   * 字下げを変えただけの写しを通さないため（PR #643 の 2 回目のレビューで、字下げを 4 字にした
   * JavaScript の写しと、Kotlin に置いた Java の写しが緑のまま通った）。
   * 同じでよいのは JavaScript と TypeScript の組だけ（型を付けるところが無いテストの例がある）。
   */
  it("コードの囲みの中の差し込み口は、どの 2 言語でも同じコードの写しになっていない（JavaScript と TypeScript の組を除く）", () => {
    const squash = (s: string) => s.replace(/\s+/g, "");
    const copies: string[] = [];
    for (const e of TOPIC_BANK) {
      for (const name of slotsInsideFences(e.body)) {
        const values = e.slots[name]!;
        LANGUAGES.forEach((a, i) => {
          for (const b of LANGUAGES.slice(i + 1)) {
            if ((a === "TypeScript" && b === "JavaScript") || (a === "JavaScript" && b === "TypeScript")) continue;
            if (squash(values[a]) === squash(values[b])) copies.push(`${e.title} / ${name} / ${a} = ${b}`);
          }
        });
      }
    }
    expect(copies).toEqual([]);
  });
});

/**
 * 言語ごとの書き方の取り違えのうち、機械で見られるもの（PR #643 のレビューで見つかった型）。
 *
 * @requirements #634（PR #643 のレビュー: 定型を選んだ言語で出す）
 */
describe("定型バンクの言語ごとの書き方", () => {
  it("Python で組んだ地の文（囲みの外）に、JavaScript の真偽値 true / false が無い（Python は True / False）", () => {
    const found: string[] = [];
    for (const e of TOPIC_BANK) {
      const prose = renderTopicBody(e, "Python").split(/\n```\n[\s\S]*?\n```/).join("\n");
      for (const m of prose.matchAll(/(?<![A-Za-z_])(true|false)(?![A-Za-z_])/g)) found.push(`${e.title}: ${m[0]}`);
    }
    expect(found).toEqual([]);
  });

  it("Kotlin のバッククォートで書いたテスト名に、JVM の名前に使えない字（. ; [ ] / < > : \\）が無い", () => {
    const found: string[] = [];
    for (const e of TOPIC_BANK) {
      for (const [name, values] of Object.entries(e.slots)) {
        for (const m of values.Kotlin.matchAll(/fun `([^`]*)`/g)) {
          if (/[.;[\]/<>:\\]/.test(m[1]!)) found.push(`${e.title} / ${name}: ${m[1]}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});

/**
 * @requirements #91(spec §10)・#634(足したお題は、題・本文の上限と Markdown の形を検査で確かめる)
 */
describe("定型バンクの形（10 言語それぞれで組んだ本文）", () => {
  it("タイトルが上限に収まり、空白だけのタイトルが無い", () => {
    for (const e of TOPIC_BANK) {
      expect(e.title.trim().length).toBeGreaterThan(0);
      expect(e.title.length).toBeLessThanOrEqual(MAX_TOPIC_TITLE);
    }
  });

  for (const language of LANGUAGES) {
    describe(language, () => {
      const rendered = TOPIC_BANK.map((e) => ({ e, body: renderTopicBody(e, language) }));

      it("本文が上限に収まり、差し込み口が残っていない", () => {
        for (const { e, body } of rendered) {
          expect({ title: e.title, fits: body.length <= MAX_TOPIC_BODY, leftover: body.match(SLOT_MARKER) }).toEqual({
            title: e.title,
            fits: true,
            leftover: null,
          });
        }
      });

      it("本文が「## 背景」で始まり、「満たすこと:」と、最後の節の「ヒント:」を持ち、囲みが閉じている", () => {
        for (const { e, body } of rendered) {
          const hint = body.lastIndexOf("ヒント:");
          const fences = fenceLines(body);
          const lastFenceAt = fences.length === 0 ? -1 : body.split("\n").slice(0, fences[fences.length - 1]! + 1).join("\n").length;
          expect({
            title: e.title,
            background: body.startsWith("## 背景\n"),
            requirements: body.includes("\n満たすこと:\n- "),
            hint: hint >= 0 && body.slice(hint).startsWith("ヒント:\n- "),
            hintIsLast: hint > lastFenceAt,
            balanced: fences.length % 2 === 0,
          }).toEqual({ title: e.title, background: true, requirements: true, hint: true, hintIsLast: true, balanced: true });
        }
      });

      for (const category of CATEGORIES) {
        const required = REQUIRED_FENCES[category];
        if (required.length === 0) continue;
        it(`${category} の本文は、${required.map((r) => r.label).join("・")}の後ろにコードの囲みを持ち、テストは ${language} の書き方で、ヒントより前で閉じる`, () => {
          for (const { e, body } of rendered.filter((r) => r.e.category === category)) {
            for (const { label, isTest } of required) {
              const got = fencedAfter(body, label, isTest ? TEST_SHAPE[language] : null);
              expect({ title: e.title, label, ...got }).toEqual({ title: e.title, label, ...OK });
            }
          }
        });
      }

      it(`任意で置いたテストの例も ${language} の書き方になっている`, () => {
        for (const { e, body } of rendered) {
          for (const label of OPTIONAL_TEST_FENCES) {
            if (!body.includes(`${label}\n\`\`\`\n`)) continue;
            expect({ title: e.title, label, ...fencedAfter(body, label, TEST_SHAPE[language]) }).toEqual({ title: e.title, label, ...OK });
          }
        }
      });

      it("design の本文は「話し合うこと:」の箇条書きを持つ", () => {
        for (const { e, body } of rendered.filter((r) => r.e.category === "design")) {
          expect({ title: e.title, discuss: body.includes("\n話し合うこと:\n- ") }).toEqual({ title: e.title, discuss: true });
        }
      });
    });
  }
});
