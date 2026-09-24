import { describe, expect, it } from "vitest";
import {
  DIFFICULTIES, LANGUAGES, MAX_TOPIC_BODY, MAX_TOPIC_TITLE, TOPIC_BANK, pickTopicFallback,
  type Language,
} from "../src/index.js";

/**
 * @requirements #91(定型バンクの健全性。spec §10)
 */
describe("定型バンク", () => {
  it("33 件すべてが上限に収まり、空白だけのタイトルが無い", () => {
    expect(TOPIC_BANK).toHaveLength(33);
    for (const e of TOPIC_BANK) {
      expect(e.title.trim().length).toBeGreaterThan(0);
      expect(e.title.length).toBeLessThanOrEqual(MAX_TOPIC_TITLE);
      expect(e.body.length).toBeLessThanOrEqual(MAX_TOPIC_BODY);
    }
  });

  it("どの言語×難易度でも候補が 2 件以上ある（直前を外しても空にならない）", () => {
    for (const language of LANGUAGES) {
      for (const difficulty of DIFFICULTIES) {
        const n = TOPIC_BANK.filter((e) => e.languages.includes(language) && e.difficulty === difficulty).length;
        expect(n).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

/**
 * @requirements #91 E7
 */
describe("pickTopicFallback", () => {
  it("選ばれた難易度のお題を source: fallback で返す", () => {
    const t = pickTopicFallback("Go", "hard", 0, null);
    const entry = TOPIC_BANK.find((e) => e.title === t.title);
    expect(entry?.difficulty).toBe("hard");
    expect(t.source).toBe("fallback");
  });

  it("直前と同じお題を返さない（どの種でも）", () => {
    for (let now = 0; now < 50; now++) {
      const first = pickTopicFallback("Python", "easy", now, null);
      const second = pickTopicFallback("Python", "easy", now, first);
      expect(second.title).not.toBe(first.title);
    }
  });

  it("境界を通り抜けて許可リストに無い言語が渡っても、難易度で絞らず全件から返す", () => {
    // 難易度を "easy" に固定して now を 0..32 で振る。プールが全 33 件なら
    // ちょうど 33 種のタイトルが出そろい、"easy" 以外の難易度も混ざる。
    // プールが誤って難易度で絞られたまま(この定型バンクは easy が 12 件)だと、
    // 33 種そろわず medium / hard も出てこない — その違いで区別する。
    const seen = new Set<string>();
    for (let now = 0; now < TOPIC_BANK.length; now++) {
      const t = pickTopicFallback("COBOL" as unknown as Language, "easy", now, null);
      expect(t.source).toBe("fallback");
      seen.add(t.title);
    }
    expect(seen.size).toBe(TOPIC_BANK.length);
    const gotDifficulties = new Set(
      [...seen].map((title) => TOPIC_BANK.find((e) => e.title === title)?.difficulty),
    );
    expect(gotDifficulties.has("medium")).toBe(true);
    expect(gotDifficulties.has("hard")).toBe(true);
  });
});
