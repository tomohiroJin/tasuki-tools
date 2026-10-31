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
 * 重い組から順に、その時点でいちばん軽い分け前へ入れる（貪欲法・LPT）。
 * 同点は組の鍵の辞書順・分け前の番号の若い順で決めるので、同じ表と同じ n からは、どの機械でも同じ割り当てになる。
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

  const weighted = groups.map((group) => {
    const weight = weightOf(group);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(`組の重さは正の有限の数です: ${weight}（${group.pkg}）`);
    }
    return { group, weight };
  });
  weighted.sort((a, b) => b.weight - a.weight || (a.group.key < b.group.key ? -1 : a.group.key > b.group.key ? 1 : 0));

  const loads = Array.from({ length: n }, () => 0);
  const assigned = Array.from({ length: n }, () => new Set());
  for (const { group, weight } of weighted) {
    let lightest = 0;
    for (let i = 1; i < n; i++) if (loads[i] < loads[lightest]) lightest = i;
    loads[lightest] += weight;
    for (const mutation of group.mutations) assigned[lightest].add(mutation);
  }
  return assigned.map((set) => mutations.filter((m) => set.has(m)));
}
