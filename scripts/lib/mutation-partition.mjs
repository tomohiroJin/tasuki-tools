/**
 * 変異の全件を n 個に分ける（#481・設計正本 `docs/superpowers/specs/2026-10-31-ci-wait-design.md` §4.2）。
 *
 * CI のシャード（`--shard k/n`。ジョブを分ける）と、1 つのジョブの中の並列（`--jobs m`。作業ツリーを分ける）の
 * **両方がこの 1 つの分け方を使う**。同じ規則を 2 か所に書かない。
 *
 * 判定は純粋関数で、git にも fs にも触らない。重さは呼び出し側が渡す（ランナーの判定は `package.json` を読むため）。
 *
 * **要は「分けた n 個を合わせると全件になり、重ならない」こと。** ここが崩れると、どこかの変異が
 * 黙って一度も流れなくなり、CI は緑のまま検出力だけが落ちる（自己テストで固定する）。
 *
 * **重さの値がずれても正しさは崩れない**（分け前が偏って遅くなるだけ）。偏りは各分け前の所要時間で見える。
 */

/** 対照の組の鍵。cwd（pkg）と、対照のコマンドの引数（tests の並び）が同じなら同じ組。 */
function controlGroupKey(mutation) {
  return `${mutation.pkg}\n${JSON.stringify(mutation.tests)}`;
}

/**
 * 変異を対照の組にまとめる。組は初めに現れた順に並ぶ。
 *
 * **組を分けない単位にする理由**: 同じ組の変異は、対照実行（変異を当てる前の素のコードで同じテストを流す）を
 * 1 回の結果で使い回せる（#387）。組を割ると、割った先ごとに対照を流し直すことになる。
 *
 * @returns {{ key: string, pkg: string, tests: string[], mutations: object[] }[]}
 */
export function groupByControl(mutations) {
  const groups = new Map();
  for (const mutation of mutations) {
    const key = controlGroupKey(mutation);
    if (!groups.has(key)) groups.set(key, { key, pkg: mutation.pkg, tests: mutation.tests, mutations: [] });
    groups.get(key).mutations.push(mutation);
  }
  return [...groups.values()];
}

/**
 * 全件を n 個に分ける。返り値は長さ n の配列で、各要素は宣言の順に並んだ変異の配列。
 *
 * **置き場（`pkg`）ごとに散らす貪欲法。** 置き場を重い順に取り、その置き場の組を重い順に、
 * 「その置き場の中で最も軽い分け前」へ入れる。置き場の中で同点なら全体で最も軽い分け前、それも同点なら番号の若い方。
 * 置き場の順は重さ→名前、組の順は重さ→鍵の辞書順で決めるので、同じ表と同じ n からは、どの機械でも同じ割り当てになる。
 *
 * **なぜ置き場ごとに散らすか。** 重さの目安はランナーごとの秒数だが、同じランナーでも置き場によって速さが違う
 * （2026-10-31 の実測で、jsdom を使う `apps/*-web` は `packages/*-core` の 2〜3 倍かかった）。全体の重さだけで配ると
 * （初めの形。CI の 2 つのシャードが 1.3〜2 倍偏った）、遅い置き場の組が 1 つの分け前に固まりうる。
 * 置き場ごとに散らせば、どの分け前も各置き場をおおむね同じ割合で持つので、目安のずれが分け前の間で打ち消し合う。
 * 置き場の名前で速さを決め打ちしない（置き場が増えるたびに腐る）。
 *
 * **空の分け前を作らない。** 組の数が n より少なければエラーにする（空の分け前は 0 件の緑になり、
 * 分ける数を誤ったことに気づけない）。重さが正なら、初めの n 個の組は必ず別々の分け前に入るので、
 * 組の数が n 以上なら空にはならない。
 *
 * @param {object[]} mutations - 宣言の表（`pkg`・`tests` を読む）
 * @param {number} n
 * @param {(group: { key: string, pkg: string, tests: string[], mutations: object[] }) => number} weightOf
 */
export function partitionMutations(mutations, n, weightOf) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`分ける数は正の整数です: ${n}`);
  const groups = groupByControl(mutations);
  if (groups.length < n) {
    throw new Error(`対照の組が ${groups.length} 個しかなく、${n} 個に分けられません`);
  }

  const pkgs = new Map();
  for (const group of groups) {
    const weight = weightOf(group);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(`組の重さは正の有限の数です: ${weight}（${group.pkg}）`);
    }
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
