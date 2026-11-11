import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { METRICS, parseMetrics, findMetricRegressions, structureNotices } from "./structure-metrics.mjs";

const TABLE = (over = {}) => {
  const v = { SC027: "0 | 0 | PASS", SC028: "1 | 0 | 未達", SC029: "86 | 0 | 未達", SC030: "17 | 0 | 未達", SC031: "13 | 0 | 未達",
    SC032: "2420/3800（63.7%） | 100% | —", SC035: "0 | 0 | PASS", SC036: "4795 | P1 完了時の基準値以上 | —",
    SC039: "分岐 0（apps/tasuki-sync の既知パターンのみ）/ データ 38 行 / 公開記号 17 件 / 公開契約 24 件 | 分岐0 / データ0行 / 公開記号0件 / 公開契約0件 | —", ...over };
  return ["[audit-structure] 走査対象: x", "SC | 現状値 | 目標値 | 判定", "---", ...Object.entries(v).map(([k, r]) => `${k} | ${r}`)].join("\n");
};

describe("parseMetrics", () => {
  test("表の各行から、比べる数値を取る（SC032 は割合、SC039 は 4 つ）", () => {
    const m = parseMetrics(TABLE());
    assert.equal(m["SC029"], 86);
    assert.equal(m["SC032"], 63.7);
    assert.equal(m["SC036"], 4795);
    assert.equal(m["SC039.分岐"], 0);
    assert.equal(m["SC039.データ行"], 38);
    assert.equal(m["SC039.公開記号"], 17);
    assert.equal(m["SC039.公開契約"], 24);
  });
  test("宣言した指標はすべて、現物の表から読める（形が変わったら赤）", () => {
    const m = parseMetrics(TABLE());
    for (const key of Object.keys(METRICS)) assert.equal(typeof m[key], "number", key);
  });
  test("読めない行は欠ける", () => {
    assert.equal(parseMetrics(TABLE({ SC029: "?? | 0 | 未達" }))["SC029"], undefined);
    assert.deepEqual(parseMetrics("何もない"), {});
  });
});

describe("findMetricRegressions: 小さいほど良い指標は増えたら、大きいほど良い指標は減ったら後退", () => {
  const base = parseMetrics(TABLE());
  test("同じなら何もない", () => {
    assert.deepEqual(findMetricRegressions(base, base), { regressions: [], unreadable: [] });
  });
  test("増えた SC029 と、減った SC032・SC036 を後退として挙げる。良くなった側は挙げない", () => {
    const cur = parseMetrics(TABLE({ SC029: "90 | 0 | 未達", SC032: "2400/3800（63.1%） | 100% | —", SC036: "4000 | x | —", SC030: "10 | 0 | 未達" }));
    const { regressions } = findMetricRegressions(base, cur);
    assert.equal(regressions.length, 3);
    assert.match(regressions.join("\n"), /SC029.*86.*90/);
    assert.match(regressions.join("\n"), /SC032.*63\.7.*63\.1/);
    assert.match(regressions.join("\n"), /SC036.*4795.*4000/);
    assert.doesNotMatch(regressions.join("\n"), /SC030/);
  });
  test("SC039 は 4 つの内訳を別々に見る", () => {
    const cur = parseMetrics(TABLE({ SC039: "分岐 1（x）/ データ 38 行 / 公開記号 17 件 / 公開契約 25 件 | t | —" }));
    const { regressions } = findMetricRegressions(base, cur);
    assert.equal(regressions.length, 2);
    assert.match(regressions.join("\n"), /SC039\.分岐/);
    assert.match(regressions.join("\n"), /SC039\.公開契約/);
  });
  test("今の側が読めない指標は unreadable。基準に無い指標は無視", () => {
    const cur = parseMetrics(TABLE({ SC029: "?? | 0 | 未達" }));
    assert.deepEqual(findMetricRegressions(base, cur).unreadable, ["SC029"]);
    const { SC029, ...noSc029 } = base;
    assert.deepEqual(findMetricRegressions(noSc029, base), { regressions: [], unreadable: [] });
  });
});

describe("structureNotices", () => {
  test("後退があれば ⚠ の行にして最後の一覧に出る形で返す。基準の出どころ（短い SHA）を添える", async () => {
    const lines = await structureNotices({
      baseline: async () => ({ output: TABLE(), label: "abcdef1" }),
      current: async () => TABLE({ SC029: "90 | 0 | 未達" }),
    });
    assert.ok(lines[0].startsWith("⚠"));
    assert.match(lines.join("\n"), /abcdef1/);
    assert.match(lines.join("\n"), /SC029/);
  });
  test("後退が無ければ ⚠ を出さない（1 行の知らせ）", async () => {
    const lines = await structureNotices({ baseline: async () => ({ output: TABLE(), label: "abc" }), current: async () => TABLE() });
    assert.equal(lines.filter((l) => l.startsWith("⚠")).length, 0);
    assert.equal(lines.length, 1);
  });
  test("基準・現在が取れなければ、失敗でなく未実行と理由（⚠）を返す", async () => {
    const a = await structureNotices({ baseline: async () => { throw new Error("origin/main が無い"); }, current: async () => TABLE() });
    assert.match(a[0], /^⚠.*未実行.*origin\/main が無い/);
    const b = await structureNotices({ baseline: async () => ({ output: TABLE(), label: "x" }), current: async () => { throw new Error("落ちた"); } });
    assert.match(b[0], /^⚠.*未実行.*落ちた/);
  });
  test("表が読めない（形が変わった）ときも ⚠ で知らせる", async () => {
    const lines = await structureNotices({ baseline: async () => ({ output: TABLE(), label: "x" }), current: async () => TABLE({ SC029: "?? | 0 | 未達" }) });
    assert.match(lines.join("\n"), /⚠.*SC029.*読めません/);
  });
});
