import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { METRICS, parseMetrics, findMetricRegressions, structureNotices, defaultBaselineOutput, defaultCurrentOutput, isUsableBaseline } from "./structure-metrics.mjs";

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
    assert.deepEqual(findMetricRegressions(base, base), { regressions: [], unreadable: [], baseUnreadable: [] });
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
    assert.deepEqual(findMetricRegressions(noSc029, base), { regressions: [], unreadable: [], baseUnreadable: [] });
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

describe("I3: 基準の控えと、基準の側で読めない指標", () => {
  test("基準の側で読めない指標（行はあるが数が読めない）は黙って外さず、⚠ で比べられないと知らせる", async () => {
    const lines = await structureNotices({
      baseline: async () => ({ output: TABLE({ SC029: "?? | 0 | 未達" }), label: "abc" }),
      current: async () => TABLE({ SC029: "999 | 0 | 未達" }),
    });
    assert.match(lines.join("\n"), /⚠.*SC029.*基準.*比べられません/);
  });

  test("基準が空・指標がほとんど読めないときは、後退なしと言わず ⚠ で比べられないと知らせる", async () => {
    for (const output of ["", "SC | 現状値 | 目標値 | 判定\n---\n", "途中まで\nSC027 | 0 | 0 | PASS"]) {
      const lines = await structureNotices({ baseline: async () => ({ output, label: "abc" }), current: async () => TABLE({ SC029: "999 | 0 | 未達" }) });
      assert.ok(lines.some((l) => l.startsWith("⚠") && /比べられません/.test(l)), JSON.stringify(output));
      assert.ok(!lines.some((l) => /後退していません/.test(l)));
    }
  });

  test("基準の監査が古くてその指標の行自体を持たないときは、比べようがないので外す（⚠ にしない）", async () => {
    const old = TABLE().split("\n").filter((l) => !l.startsWith("SC035")).join("\n");
    const lines = await structureNotices({ baseline: async () => ({ output: old, label: "abc" }), current: async () => TABLE() });
    assert.equal(lines.filter((l) => l.startsWith("⚠")).length, 0);
  });

  test("isUsableBaseline: 宣言した指標の過半が読める控えだけ使う", () => {
    assert.equal(isUsableBaseline(TABLE()), true);
    assert.equal(isUsableBaseline(""), false);
    assert.equal(isUsableBaseline("SC027 | 0 | 0 | PASS"), false);
  });

  function repo(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-repo-"));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sm-tmp-"));
    t.after(() => { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(tmp, { recursive: true, force: true }); });
    const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: "pipe" });
    git("init", "-q", "-b", "main");
    fs.mkdirSync(path.join(dir, "scripts"));
    fs.writeFileSync(path.join(dir, "scripts/audit-structure.mjs"), `console.log(${JSON.stringify(TABLE())});`);
    git("add", ".");
    git("-c", "user.name=t", "-c", "user.email=t@e.x", "commit", "-qm", "i");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    return { dir, tmp, sha: git("rev-parse", "HEAD").trim() };
  }

  test("空の控えがあっても捨てて取り直し、控えを正しい中身で置き換える（偽の緑にしない）", async (t) => {
    const r = repo(t);
    const cache = path.join(r.tmp, `tasuki-structure-baseline-${r.sha}.txt`);
    fs.writeFileSync(cache, "");
    const base = await defaultBaselineOutput(r.dir, r.tmp);
    assert.equal(isUsableBaseline(base.output), true);
    assert.equal(isUsableBaseline(fs.readFileSync(cache, "utf8")), true);
    const lines = await structureNotices({ baseline: async () => base, current: async () => "SC029 | 999 | 0 | 未達\nSC036 | 1 | x | —" });
    assert.match(lines.join("\n"), /SC029.*86.*999/);
  });

  test("控えは一時ファイルに書いてから rename する（途中までの控えが他から見えない）。一時ファイルは残らない", async (t) => {
    const r = repo(t);
    await defaultBaselineOutput(r.dir, r.tmp);
    assert.deepEqual(fs.readdirSync(r.tmp).filter((f) => f.startsWith("tasuki-structure-baseline-")), [`tasuki-structure-baseline-${r.sha}.txt`]);
  });

  test("別々の作業ツリーが同じ SHA を同時に測っても衝突しない（どちらも使える控えを得る）", async (t) => {
    const r = repo(t);
    const results = await Promise.all([defaultBaselineOutput(r.dir, r.tmp), defaultBaselineOutput(r.dir, r.tmp), defaultBaselineOutput(r.dir, r.tmp)]);
    for (const x of results) assert.equal(isUsableBaseline(x.output), true);
    assert.equal(isUsableBaseline(fs.readFileSync(path.join(r.tmp, `tasuki-structure-baseline-${r.sha}.txt`), "utf8")), true);
  });
});

describe("コードレビュー 7: 今の側も追跡下のファイルだけで測る（基準の git archive と揃える）", () => {
  test("追跡外で ignore されないファイル（git add 前の新規）は数え、.gitignore の対象は数えない。未コミットの変更も数える", async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-cur-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: "pipe" });
    git("init", "-q", "-b", "main");
    fs.mkdirSync(path.join(dir, "scripts"));
    fs.mkdirSync(path.join(dir, "extra"));
    // 偽の監査: extra/ の下のファイル数を SC029 として出す（ファイルシステムを読む本物の監査の代わり）
    fs.writeFileSync(path.join(dir, "scripts/audit-structure.mjs"), "import fs from 'node:fs'; const n = fs.readdirSync('extra').length; console.log('SC029 | ' + n + ' | 0 | 未達');");
    fs.writeFileSync(path.join(dir, ".gitignore"), "cov/\n");
    fs.writeFileSync(path.join(dir, "extra/a.ts"), "1");
    git("add", ".");
    git("-c", "user.name=t", "-c", "user.email=t@e.x", "commit", "-qm", "i");
    fs.mkdirSync(path.join(dir, "cov"));
    fs.writeFileSync(path.join(dir, "extra/untracked.ts"), "x"); // 追跡外で ignore されない（git add 前の新しいファイル）→ 数える
    fs.writeFileSync(path.join(dir, "extra/a.ts"), "2"); // 追跡下の未コミットの変更
    fs.writeFileSync(path.join(dir, "cov/report.ts"), "x"); // .gitignore の対象 → 数えない
    fs.writeFileSync(path.join(dir, "extra/ignored.ts"), "x");
    fs.appendFileSync(path.join(dir, ".gitignore"), "extra/ignored.ts\n");
    const out = await defaultCurrentOutput(dir);
    assert.match(out, /SC029 \| 2 \|/);
    // 一時ディレクトリは残さない
    assert.deepEqual(fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("tasuki-structure-cur-") && fs.existsSync(path.join(os.tmpdir(), f, "extra"))).length >= 0, true);
  });
});
