import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { groupByControl, partitionMutations, distribute, controlGroupKey } from "./mutation-partition.mjs";

/**
 * `scripts/lib/mutation-partition.mjs` の自己テスト（#481）。
 *
 * 変異の全件を n 個に分ける。CI のシャード（`--shard k/n`）と、1 つのジョブの中の並列（`--jobs m`）の
 * 両方がこの 1 つの分け方を使う。**分けた n 個を合わせると全件になり、重ならない**ことが要である。
 * ここが崩れると、どこかの変異が黙って一度も流れなくなる（CI は緑のまま）。
 */

/** 造作。対照の組（pkg と tests が同じ）を 3 つ作る。組 A が重く、組 C が軽い。 */
const A1 = { id: 1, pkg: "apps/a", tests: ["t/a.test.ts"] };
const B1 = { id: 2, pkg: "apps/b", tests: ["t/b.test.ts"] };
const A2 = { id: 3, pkg: "apps/a", tests: ["t/a.test.ts"] };
const C1 = { id: 4, pkg: "apps/c", tests: ["t/c.test.ts"] };
const A3 = { id: 5, pkg: "apps/a", tests: ["t/a.test.ts"] };
const B2 = { id: 6, pkg: "apps/b", tests: ["t/b.test.ts"] };
// 同じ pkg でも tests が違えば別の組（対照のコマンドが違う）
const A_OTHER = { id: 7, pkg: "apps/a", tests: ["t/other.test.ts"] };
const MUTS = [A1, B1, A2, C1, A3, B2, A_OTHER];

/**
 * 参照実装: 重い組が入る前（f94c52b）の分け方。置き場ごとに散らす貪欲法。重い組が無い入力では、いまの実装と同じ割り当てになる
 * （浮動小数点の比較を含めて）ことを見るために、そのまま写してある。
 */
function legacyPartition(mutations, n, weightOf) {
  const groups = groupByControl(mutations);
  const pkgs = new Map();
  for (const group of groups) {
    const weight = weightOf(group);
    if (!pkgs.has(group.pkg)) pkgs.set(group.pkg, { pkg: group.pkg, total: 0, groups: [] });
    const entry = pkgs.get(group.pkg);
    entry.total += weight;
    entry.groups.push({ group, weight });
  }
  const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const pkgOrder = [...pkgs.values()].sort((a, b) => b.total - a.total || byName(a.pkg, b.pkg));
  const loads = Array.from({ length: n }, () => 0);
  const assigned = Array.from({ length: n }, () => new Set());
  for (const { groups: pkgGroups } of pkgOrder) {
    pkgGroups.sort((a, b) => b.weight - a.weight || byName(a.group.key, b.group.key));
    const pkgLoads = Array.from({ length: n }, () => 0);
    for (const { group, weight } of pkgGroups) {
      let target = 0;
      for (let i = 1; i < n; i++) {
        if (pkgLoads[i] < pkgLoads[target] || (pkgLoads[i] === pkgLoads[target] && loads[i] < loads[target])) target = i;
      }
      pkgLoads[target] += weight;
      loads[target] += weight;
      for (const mutation of group.mutations) assigned[target].add(mutation);
    }
  }
  return assigned.map((set) => mutations.filter((m) => set.has(m)));
}

/** 重さ: 起動 1 回を 1 として、対照 1 回＋変異の件数。 */
const launches = (group) => 1 + group.mutations.length;
const idsOf = (list) => list.map((m) => m.id);
/** 重い組が無い（置き場ごとの散らしだけ）。isHeavy は必ず渡す決まり */
const NONE = () => false;

describe("groupByControl: 対照の組にまとめる", () => {
  test("pkg と tests が同じ変異を 1 つの組にし、組は初めに現れた順に並ぶ", () => {
    const groups = groupByControl(MUTS);
    assert.deepEqual(
      groups.map((g) => idsOf(g.mutations)),
      [[1, 3, 5], [2, 6], [4], [7]],
    );
  });

  test("tests の並びが違えば別の組（対照のコマンドの引数が違う）", () => {
    const x = { id: 1, pkg: "p", tests: ["a", "b"] };
    const y = { id: 2, pkg: "p", tests: ["b", "a"] };
    assert.equal(groupByControl([x, y]).length, 2);
  });

  test("組は pkg と tests を持つ（重さの計算でランナーを判定するため）", () => {
    const [first] = groupByControl(MUTS);
    assert.equal(first.pkg, "apps/a");
    assert.deepEqual(first.tests, ["t/a.test.ts"]);
  });
});

describe("partitionMutations: n 個に分ける", () => {
  for (const n of [1, 2, 3, 4]) {
    test(`n=${n}: 合わせると全件で、重ならない`, () => {
      const parts = partitionMutations(MUTS, n, launches, NONE);
      assert.equal(parts.length, n);
      const all = parts.flat();
      assert.equal(all.length, MUTS.length, "件数が合わない（重なりか抜け）");
      assert.deepEqual(new Set(idsOf(all)), new Set(idsOf(MUTS)));
    });
  }

  test("対照の組を割らない（同じ組の変異は同じ分け前に入る）", () => {
    const parts = partitionMutations(MUTS, 3, launches, NONE);
    for (const part of parts) {
      const ids = new Set(idsOf(part));
      // 組 A（1・3・5）と組 B（2・6）は、まとめて入っているか、まったく入っていないか
      for (const group of [[1, 3, 5], [2, 6]]) {
        const inside = group.filter((id) => ids.has(id)).length;
        assert.ok(inside === 0 || inside === group.length, `組 ${group} が割れた: ${[...ids]}`);
      }
    }
  });

  test("どの分け前も空にならない", () => {
    for (const part of partitionMutations(MUTS, 4, launches, NONE)) assert.ok(part.length > 0);
  });

  test("分け前の中は宣言の順に並ぶ", () => {
    for (const part of partitionMutations(MUTS, 2, launches, NONE)) {
      const ids = idsOf(part);
      assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
    }
  });

  test("同じ入力からは同じ結果になる（どの機械でも同じ割り当て）", () => {
    assert.deepEqual(
      partitionMutations(MUTS, 3, launches, NONE).map(idsOf),
      partitionMutations([...MUTS], 3, launches, NONE).map(idsOf),
    );
  });

  test("置き場の重い順に、その置き場の中で軽い分け前へ入れ、同点は全体で軽い分け前へ", () => {
    // 置き場の重さ: apps/a 6（A 4・A_OTHER 2）・apps/b 3・apps/c 2。
    // apps/a: A は 1 つ目、A_OTHER は apps/a の中で軽い 2 つ目へ（全体 4 対 2）。
    // apps/b: 置き場の中では同点なので、全体で軽い 2 つ目へ（2 → 5）。apps/c: 全体で軽い 1 つ目へ（4 → 6）
    const parts = partitionMutations(MUTS, 2, launches, NONE);
    assert.deepEqual(parts.map(idsOf), [
      [1, 3, 4, 5],
      [2, 6, 7],
    ]);
  });

  test("重さが同じなら組の鍵の辞書順で決まり、宣言の並びに左右されない", () => {
    const x = { id: 1, pkg: "apps/x", tests: ["t"] };
    const y = { id: 2, pkg: "apps/y", tests: ["t"] };
    const one = partitionMutations([x, y], 2, launches, NONE).map(idsOf);
    const two = partitionMutations([y, x], 2, launches, NONE).map(idsOf);
    assert.deepEqual(one, [[1], [2]]);
    assert.deepEqual(two, [[1], [2]]);
  });

  test("渡した重さを使う（重さを無視して件数で配らない）", () => {
    // 件数では組 A（3 件）が最も重いが、重さの関数では組 C を最も重くする。
    // C が 1 つ目に入ると、残りの 3 組は 1 つ目（100）より軽い 2 つ目へ寄る。ただし apps/a の 2 組は
    // 置き場の中で散らすので、A_OTHER だけは 1 つ目へ入る。（重さが大きくても「重い組」の印（isHeavy）が無ければ、先には配らない）
    const heavyC = (g) => (g.pkg === "apps/c" ? 100 : 1);
    const parts = partitionMutations(MUTS, 2, heavyC, NONE);
    assert.deepEqual(parts.map(idsOf), [
      [4, 7],
      [1, 2, 3, 5, 6],
    ]);
  });

  test("同じ置き場の組は分け前に散らす（置き場ごとの速さの違いを分け前の間で打ち消す）", () => {
    // 重さの目安では同じでも、実際は置き場ごとに速さが違う（jsdom を使うアプリは core の 2〜3 倍）。
    // 全体の重さだけで配ると、遅い置き場の組が 1 つの分け前に固まりうる。置き場ごとに散らせば、
    // 目安がずれても偏りは打ち消し合う
    // 全体の重さだけで配ると、重さ 8 の 1 組が 1 つ目に入り、重さ 4 の 2 組はどちらも 2 つ目へ固まる
    const slow = [1, 2].map((i) => ({ id: i, pkg: "apps/slow", tests: [`t${i}`] }));
    const fast = { id: 3, pkg: "packages/fast", tests: ["t3"] };
    const weight = (g) => (g.pkg === "packages/fast" ? 8 : 4);
    const parts = partitionMutations([...slow, fast], 2, weight, NONE);
    for (const part of parts) {
      assert.equal(part.filter((m) => m.pkg === "apps/slow").length, 1, `apps/slow が偏った: ${idsOf(part)}`);
    }
  });

  test("置き場の中でも重い組から配る（鍵の順に配ると偏る）", () => {
    // 同じ置き場に重さ 1・1・2 の組。重い順なら 2 | 1+1 で揃う。鍵の順（x・y・z）に配ると 1+2 | 1 に偏る
    const x = { id: 1, pkg: "p", tests: ["x"] };
    const y = { id: 2, pkg: "p", tests: ["y"] };
    const z = { id: 3, pkg: "p", tests: ["z"] };
    const weight = (g) => (g.tests[0] === "z" ? 2 : 1);
    assert.deepEqual(partitionMutations([x, y, z], 2, weight, NONE).map(idsOf), [[3], [1, 2]]);
  });

  describe("重い組は重さで均す（#546）", () => {
    // 重い 1 組（100）と、軽い 30 組（各 8。2 つの置き場に 15 組ずつ。重い組の置き場より重いので、軽い組が先に配られる）。
    // 置き場ごとに均すだけだと、軽い組が 4 つの分け前に 1/4 ずつ入り、重い組の分け前が 100 + 60 になる。重さで均せば、重い組の分け前は 100 のまま
    const heavy = { id: 1, pkg: "scripts", tests: ["heavy"] };
    const lights = Array.from({ length: 30 }, (_, i) => ({ id: 10 + i, pkg: i % 2 ? "apps/x" : "packages/y", tests: [`l${String(i).padStart(2, "0")}`] }));
    // 重い組の印（本番は実測の表の行）は、heavy で始まる名前の組
    const isHeavy = (g) => g.tests[0].startsWith("heavy");
    const weight = (g) => (isHeavy(g) ? 100 : 8);
    const loadsOf = (parts) => parts.map((part) => groupByControl(part).reduce((sum, g) => sum + weight(g), 0));

    test("重い組の分け前に軽い組を足さず、最も長い分け前が重い組 1 つぶんに収まる", () => {
      const loads = loadsOf(partitionMutations([heavy, ...lights], 4, weight, isHeavy));
      assert.equal(Math.max(...loads), 100, `分け前の重さ: ${loads}`);
    });

    test("重い組が 2 つなら別の分け前へ入れる", () => {
      const heavy2 = { id: 2, pkg: "scripts", tests: ["heavy2"] };
      const parts = partitionMutations([heavy, heavy2, ...lights], 4, weight, isHeavy);
      const heavyCounts = parts.map((part) => part.filter((m) => m.tests[0].startsWith("heavy")).length);
      assert.deepEqual(heavyCounts.sort(), [0, 0, 1, 1]);
    });

    test("重い組があっても、合わせると全件で重ならず、空の分け前も作らない", () => {
      for (const n of [2, 3, 4, 5]) {
        const parts = partitionMutations([heavy, ...lights], n, weight, isHeavy);
        assert.deepEqual(parts.flat().map((m) => m.id).sort((a, b) => a - b), [heavy, ...lights].map((m) => m.id).sort((a, b) => a - b));
        assert.ok(parts.every((part) => part.length > 0), `n=${n}`);
      }
    });

    test("重い組があっても、置き場ごとに散らす性質は残る（軽い組どうしは置き場ごとに分け前へ散る）", () => {
      const parts = partitionMutations([heavy, ...lights], 4, weight, isHeavy);
      const light = parts.filter((part) => !part.includes(heavy));
      for (const pkg of ["apps/x", "packages/y"]) {
        const counts = light.map((part) => part.filter((m) => m.pkg === pkg).length);
        assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `${pkg}: ${counts}`);
      }
    });

    test("重い組の印が無い組は、重さが大きくても先に配らない（印は実測の表の行に限る。見積もりだけの重さは当てにしない）", () => {
      const loads = loadsOf(partitionMutations([heavy, ...lights], 4, weight, NONE));
      assert.ok(Math.max(...loads) > 100, `分け前の重さ: ${loads}`);
    });

    test("isHeavy を渡し忘れると、黙って落ちずに止まる", () => {
      assert.throws(() => partitionMutations([heavy, ...lights], 4, weight), /isHeavy は関数/);
    });

    test("重い組どうしは重い順に配る（鍵の順に配ると偏る）", () => {
      // 重さ 80・40・40。重い順なら 80 | 40+40 で揃う。鍵の順（a・b・c）に配ると 40+80 | 40 に偏る
      const mk = (id, name) => ({ id, pkg: "p", tests: [name] });
      const w = (g) => (g.tests[0] === "heavyC" ? 80 : 40);
      const parts = partitionMutations([mk(1, "heavyA"), mk(2, "heavyB"), mk(3, "heavyC")], 2, w, isHeavy);
      assert.deepEqual(parts.map(idsOf), [[3], [1, 2]]);
    });
  });

  // 固定の入力（組・件数・重さを手で書いた fixture）で、分け方の均し具合を見る。生きた宣言には頼らない
  describe("均し具合（固定の fixture・#546）", () => {
    // 置き場ごとに [組の名前, 重さ, 件数]。重さは組の合計ではなく 1 件あたりでなく、組 1 つの重さ（秒）
    const fixture = [
      ...["h1", "h2", "h3", "h4", "h5", "h6"].map((name, i) => ({ pkg: i < 3 ? "scripts" : "apps/a", name: `heavy-${name}`, weight: [170, 64, 56, 43, 34, 33][i] })),
      ...Array.from({ length: 60 }, (_, i) => ({ pkg: ["apps/a", "apps/b", "packages/c"][i % 3], name: `l${String(i).padStart(2, "0")}`, weight: [3, 5, 8, 12][i % 4] })),
    ];
    const muts = fixture.map((f, i) => ({ id: i + 1, pkg: f.pkg, tests: [f.name] }));
    const weightByName = new Map(fixture.map((f) => [f.name, f.weight]));
    const weightOf = (g) => weightByName.get(g.tests[0]);
    const isHeavy = (g) => g.tests[0].startsWith("heavy-");
    const total = fixture.reduce((sum, f) => sum + f.weight, 0);

    test("3 つに分けた重さが、平均の 3% 以内に揃う", () => {
      const { loads } = distribute(muts, 3, weightOf, isHeavy);
      const mean = total / 3;
      assert.ok((Math.max(...loads) - Math.min(...loads)) / mean <= 0.03, `分け前の重さ: ${loads.map((l) => l.toFixed(1))}（平均 ${mean.toFixed(1)}）`);
    });

    test("4 つに分けても、最も長い分け前は、最も重い組か平均のどちらか大きい方に軽い組 1 つぶん（12）を足した重さ以内", () => {
      const { loads } = distribute(muts, 4, weightOf, isHeavy);
      assert.ok(Math.max(...loads) <= Math.max(170, total / 4) + 12, `分け前の重さ: ${loads.map((l) => l.toFixed(1))}`);
    });
  });

  test("重い組が無い入力では、重さを足し算で作る浮動小数点の入力でも、今までの分け方（f94c52b）と同じ割り当てになる", () => {
    let seed = 12345;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let trial = 0; trial < 60; trial++) {
      const pkgs = ["scripts", "apps/a", "apps/b", "packages/c"].slice(0, 2 + (trial % 3));
      const count = 8 + Math.floor(rand() * 40);
      const muts = Array.from({ length: count }, (_, i) => ({ id: i, pkg: pkgs[Math.floor(rand() * pkgs.length)], tests: [`t${Math.floor(rand() * 20)}`] }));
      const costs = [{ c: 0.4, m: 0.4 }, { c: 3, m: 3 }, { c: 0.6, m: 2 }][trial % 3];
      const weightOf = (g) => costs.c + costs.m * g.mutations.length;
      const groups = groupByControl(muts).length;
      for (const n of [2, 3, 4, 5].filter((k) => k <= groups)) {
        assert.deepEqual(partitionMutations(muts, n, weightOf, NONE).map(idsOf), legacyPartition(muts, n, weightOf).map(idsOf), `trial ${trial} n=${n}`);
      }
    }
  });

  test("重い組があるとき、最も長い分け前は、（重い組だけを LPT で配った上限と平均のどちらか大きい方）に軽い組 1 つぶんを足した重さを超えない（ランダムな入力）", () => {
    let seed = 987;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let trial = 0; trial < 200; trial++) {
      const pkgs = ["scripts", "apps/a", "apps/b", "packages/c"];
      const heavyCount = 1 + Math.floor(rand() * 4);
      const lightCount = 6 + Math.floor(rand() * 60);
      const list = [
        ...Array.from({ length: heavyCount }, (_, i) => ({ name: `heavy-${i}`, pkg: pkgs[Math.floor(rand() * 4)], weight: 20 + rand() * 200 })),
        ...Array.from({ length: lightCount }, (_, i) => ({ name: `l${i}`, pkg: pkgs[Math.floor(rand() * 4)], weight: 0.5 + rand() * 10 })),
      ];
      const muts = list.map((f, i) => ({ id: i, pkg: f.pkg, tests: [f.name] }));
      const byName = new Map(list.map((f) => [f.name, f.weight]));
      const weightOf = (g) => byName.get(g.tests[0]);
      const isHeavy = (g) => g.tests[0].startsWith("heavy-");
      const total = list.reduce((sum, f) => sum + f.weight, 0);
      const heavyWeights = list.filter((f) => f.name.startsWith("heavy-")).map((f) => f.weight);
      const maxHeavy = Math.max(...heavyWeights);
      const sumHeavy = heavyWeights.reduce((p, q) => p + q, 0);
      const maxLight = Math.max(...list.filter((f) => !f.name.startsWith("heavy-")).map((f) => f.weight));
      for (const n of [2, 3, 4, 5]) {
        const { loads, parts } = distribute(muts, n, weightOf, isHeavy);
        assert.equal(parts.flat().length, muts.length);
        // LPT の上限: 重い組だけを配ったときの最長は 平均 + 最大の組 × (1 − 1/n) 以下
        const bound = Math.max(sumHeavy / n + maxHeavy * (1 - 1 / n), total / n) + maxLight;
        assert.ok(Math.max(...loads) <= bound + 1e-9, `trial ${trial} n=${n}: ${Math.max(...loads).toFixed(1)} > ${bound.toFixed(1)}`);
      }
    }
  });

  test("組の数より多くは分けられない（空の分け前を作らない）", () => {
    assert.throws(() => partitionMutations(MUTS, 5, launches, NONE), /対照の組が 4 個しかなく、5 個に分けられません/);
  });

  test("n が正の整数でなければエラー", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      assert.throws(() => partitionMutations(MUTS, bad, launches, NONE), /正の整数/, String(bad));
    }
  });

  test("重さが正の有限の数でなければエラー（0 の重さは 1 つの分け前へ寄せてしまう）", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => partitionMutations(MUTS, 2, () => bad, NONE), /重さ/, String(bad));
    }
  });
});

describe("controlGroupKey: 対照の組の鍵", () => {
  test("組の鍵（group.key）と同じ。pkg と tests の並びで決まり、空白を含む名前でも衝突しない", () => {
    const a = { pkg: "p", tests: ["x y"] };
    const b = { pkg: "p", tests: ["x", "y"] };
    assert.notEqual(controlGroupKey(a), controlGroupKey(b));
    assert.equal(groupByControl([{ id: 1, ...a }])[0].key, controlGroupKey(a));
  });
});
