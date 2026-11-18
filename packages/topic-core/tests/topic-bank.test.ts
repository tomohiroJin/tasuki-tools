import { describe, expect, it } from "vitest";
import { CATEGORIES, DIFFICULTIES, MAX_TOPIC_BODY, MAX_TOPIC_TITLE, type Category } from "../src/index.js";
import { TOPIC_BANK, type TopicBankEntry } from "../src/topic-bank.js";

/**
 * 定型バンクの健全性（#91 spec §10・#634）。
 *
 * `topic-core` は依存を持たない（`scripts/audit-dependency-direction.mjs` の許可表が空）ので、
 * `@tasuki/markdown` の解析には通さず、本文の文字列で囲みの開きと閉じを見る。
 */

/** 本文の行のうち、囲み（```）の開きと閉じの行の位置。数が奇数なら閉じ忘れがある */
function fenceLines(body: string): number[] {
  return body
    .split("\n")
    .map((line, i) => (line.startsWith("```") ? i : -1))
    .filter((i) => i >= 0);
}

/**
 * 見出し（例 `最初のテストの例:`）の直後に囲みが開き、その中身が `startsWith` で始まり、
 * 「ヒント:」より前で閉じているか。閉じだけでなく開きも見る —— 開きだけを見ると、閉じ忘れで
 * 以降の本文が全部コードになる誤りを通してしまう。
 */
function fencedAfter(body: string, label: string, startsWith: RegExp | null): { opened: boolean; closedBeforeHint: boolean; head: boolean } {
  const open = `${label}\n\`\`\`\n`;
  const at = body.indexOf(open);
  if (at < 0) return { opened: false, closedBeforeHint: false, head: false };
  const from = at + open.length;
  const close = body.indexOf("\n```", from);
  const hint = body.lastIndexOf("ヒント:");
  // 閉じが見つからないと indexOf は -1 を返し「ヒントより前」を素通りするので、閉じの在否を先に見る
  const closedBeforeHint = close >= 0 && hint >= 0 && close < hint;
  const head = startsWith === null || (close >= 0 && startsWith.test(body.slice(from, close)));
  return { opened: true, closedBeforeHint, head };
}

const OK = { opened: true, closedBeforeHint: true, head: true };

/** 種類ごとに、本文が持つべきコードの囲み。設計のお題はコードを必須にしない */
const REQUIRED_FENCES: Record<Category, readonly { label: string; startsWith: RegExp | null }[]> = {
  tdd: [{ label: "最初のテストの例:", startsWith: /^test\(/ }],
  refactoring: [{ label: "対象のコード:", startsWith: null }],
  design: [],
  debugging: [
    { label: "対象のコード:", startsWith: null },
    { label: "落ちるテスト:", startsWith: /^test\(/ },
  ],
};

const byCategory = (category: Category): readonly TopicBankEntry[] =>
  TOPIC_BANK.filter((e) => e.category === category);

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
 * @requirements #91(spec §10)・#634(足したお題は、題・本文の上限と Markdown の形を検査で確かめる)
 */
describe("定型バンクの形", () => {
  it("すべてが上限に収まり、空白だけのタイトルが無い", () => {
    for (const e of TOPIC_BANK) {
      expect(e.title.trim().length).toBeGreaterThan(0);
      expect(e.title.length).toBeLessThanOrEqual(MAX_TOPIC_TITLE);
      expect({ title: e.title, fits: e.body.length <= MAX_TOPIC_BODY }).toEqual({ title: e.title, fits: true });
    }
  });

  it("すべての本文が「## 背景」で始まり、「満たすこと:」と、最後の節の「ヒント:」を持つ", () => {
    for (const e of TOPIC_BANK) {
      const hint = e.body.lastIndexOf("ヒント:");
      const fences = fenceLines(e.body);
      const lastFenceAt = fences.length === 0 ? -1 : e.body.split("\n").slice(0, fences[fences.length - 1]! + 1).join("\n").length;
      expect({
        title: e.title,
        background: e.body.startsWith("## 背景\n"),
        requirements: e.body.includes("\n満たすこと:\n- "),
        hint: hint >= 0 && e.body.slice(hint).startsWith("ヒント:\n- "),
        hintIsLast: hint > lastFenceAt,
      }).toEqual({ title: e.title, background: true, requirements: true, hint: true, hintIsLast: true });
    }
  });

  it("すべての本文で、コードの囲みが閉じている（開きと閉じの行が対になる）", () => {
    for (const e of TOPIC_BANK) {
      expect({ title: e.title, balanced: fenceLines(e.body).length % 2 === 0 }).toEqual({ title: e.title, balanced: true });
    }
  });

  for (const category of CATEGORIES) {
    const required = REQUIRED_FENCES[category];
    if (required.length === 0) continue;
    it(`${category} の本文は、${required.map((r) => r.label).join("・")}の後ろにコードの囲みを持ち、ヒントより前で閉じる`, () => {
      for (const e of byCategory(category)) {
        for (const { label, startsWith } of required) {
          expect({ title: e.title, label, ...fencedAfter(e.body, label, startsWith) }).toEqual({ title: e.title, label, ...OK });
        }
      }
    });
  }

  it("design の本文は「話し合うこと:」の箇条書きを持つ", () => {
    for (const e of byCategory("design")) {
      expect({ title: e.title, discuss: e.body.includes("\n話し合うこと:\n- ") }).toEqual({ title: e.title, discuss: true });
    }
  });
});
