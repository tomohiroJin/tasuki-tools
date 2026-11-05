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

/**
 * 対照の組の鍵。cwd（pkg）と、対照のコマンドの引数（tests の並び）が同じなら同じ組。
 * 組（`group.key`）の鍵であり、実測の表（`mutation-weights.mjs`）の鍵もこれを使う（鍵を 2 通りに作らない）。
 * `pkg` と `tests` を持つものなら変異でも組でも引ける。
 */
export function controlGroupKey(mutation) {
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
 * 各分け前の空き: `extra` を軽い分け前から水を張るように足したときの水面と、いまの重さとの差（水面より上の分け前は 0）。
 * 空きの合計は `extra` に等しい（`extra` が 0 なら全部 0）。
 */
function fillRoom(loads, extra) {
  const sorted = [...loads].sort((a, b) => a - b);
  let level = sorted[0];
  let remaining = extra;
  for (let k = 1; k <= sorted.length; k++) {
    const next = k < sorted.length ? sorted[k] : Infinity;
    const need = (next - level) * k;
    if (remaining <= need) {
      level += remaining / k;
      break;
    }
    remaining -= need;
    level = next;
  }
  return loads.map((load) => Math.max(0, level - load));
}

/**
 * 全件を n 個に分ける。返り値は長さ n の配列で、各要素は宣言の順に並んだ変異の配列。
 *
 * 組（対照の組。{@link groupByControl}）を割らずに配る。手順は 2 段:
 *
 * 1. **重い組を、重さで均す（LPT）。** `isHeavy(group)` が真の組（本番は実測の表に載った組。
 *    `mutation-weights.mjs`）を、置き場を問わず、重い順（同点は鍵の辞書順）に「いま全体で最も軽い分け前」へ入れる。
 *    重い組の重さは実測で当てになるので、下の置き場ごとの散らしの理由（目安のずれを打ち消す）が当たらない。
 *    置き場ごとに均すだけだと、軽い組が重い組の分け前にも 1/n ずつ入り、最も長い分け前が短くならない（#546）。
 *    **印は見積もりの大きさでなく、実測の表の行に限る。** 見積もりだけが大きい組は、実測では軽いことがある。
 * 2. **残りの軽い組を、置き場（`pkg`）ごとに散らす貪欲法。** 置き場を重い順（同点は名前）に取り、その置き場の組を
 *    重い順（同点は鍵の辞書順）に、「その置き場に割り当てるべき量に最も足りない分け前」へ入れる。割り当てるべき量は、
 *    置き場の重さを、各分け前の空き（残りの軽い組を軽い分け前から水を張るように入れたときの水面 − いまの重さ。{@link fillRoom}）に比例して配ったもの。置き場ごとにその時点の
 *    空きで決め直す（前の置き場の端数のずれを次で直す）。重い組が無ければ空きは全分け前で等しく、「その置き場の中で最も軽い分け前」へ入れるのと同じになる。
 *    同点は全体で最も軽い分け前、それも同点なら番号の若い方。
 *
 * 順序は重さ→名前（鍵）で決めるので、同じ表と同じ n からは、どの機械でも同じ割り当てになる。
 *
 * **なぜ軽い組を置き場ごとに散らすか。** 既定値の重さはランナーごとの秒数だが、同じランナーでも置き場によって速さが違う
 * （2026-10-31 の実測で、jsdom を使う `apps/*-web` は `packages/*-core` の 2〜3 倍かかった）。全体の重さだけで配ると
 * （初めの形。CI の 2 つのシャードが 1.3〜2 倍偏った）、遅い置き場の組が 1 つの分け前に固まりうる。
 * 置き場ごとに散らせば、どの分け前も各置き場をおおむね同じ割合で持つので、目安のずれが分け前の間で打ち消し合う。
 * 置き場の名前で速さを決め打ちしない（置き場が増えるたびに腐る）。
 *
 * **空の分け前を作らない。** 組の数が n より少なければエラーにする（空の分け前は 0 件の緑になり、
 * 分ける数を誤ったことに気づけない）。組の数が n 以上なら、重い組は別々の分け前へ入り、軽い組は空きの大きい分け前
 * （空の分け前は空きが最も大きい）へ入るので、空にならない（自己テストで見る）。
 *
 * @param {object[]} mutations - 宣言の表（`pkg`・`tests` を読む）
 * @param {number} n
 * @param {(group: { key: string, pkg: string, tests: string[], mutations: object[] }) => number} weightOf 組の重さ（秒）
 * @param {(group: object) => boolean} isHeavy 重い組か（本番は実測の表の行）。**必ず渡す**（重い組が無いなら `() => false`）
 */
export function partitionMutations(mutations, n, weightOf, isHeavy) {
  return distribute(mutations, n, weightOf, isHeavy).parts;
}

/**
 * {@link partitionMutations} と同じ分け方で、分け前ごとの重さ（`loads`。`weightOf` の和）も返す。
 * 見込みの時間（最も長い分け前）は、分け方を写さずにこれから出す。
 *
 * @returns {{ parts: object[][], loads: number[] }}
 */
export function distribute(mutations, n, weightOf, isHeavy) {
  if (typeof isHeavy !== "function") throw new TypeError("isHeavy は関数で渡します（重い組が無ければ () => false。渡し忘れで重い組の扱いが黙って落ちないように）");
  if (!Number.isInteger(n) || n < 1) throw new Error(`分ける数は正の整数です: ${n}`);
  const groups = groupByControl(mutations);
  if (groups.length < n) {
    throw new Error(`対照の組が ${groups.length} 個しかなく、${n} 個に分けられません`);
  }

  const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  const loads = Array.from({ length: n }, () => 0);
  const assigned = Array.from({ length: n }, () => new Set());
  const put = (box, group, weight) => {
    loads[box] += weight;
    for (const mutation of group.mutations) assigned[box].add(mutation);
  };

  // 1. 重い組（実測の表の行。isHeavy）を、重い順に、いま全体で最も軽い分け前へ入れる（LPT。理由は上の JSDoc）
  const heavy = [];
  const light = new Map();
  let totalWeight = 0;
  for (const entry of groups.map((group) => ({ group, weight: weightOf(group) }))) {
    if (!Number.isFinite(entry.weight) || entry.weight <= 0) {
      throw new Error(`組の重さは正の有限の数です: ${entry.weight}（${entry.group.pkg}）`);
    }
    totalWeight += entry.weight;
    if (isHeavy(entry.group)) {
      heavy.push(entry);
      continue;
    }
    if (!light.has(entry.group.pkg)) light.set(entry.group.pkg, { pkg: entry.group.pkg, total: 0, groups: [] });
    const pkgEntry = light.get(entry.group.pkg);
    pkgEntry.total += entry.weight;
    pkgEntry.groups.push(entry);
  }
  heavy.sort((x, y) => y.weight - x.weight || byName(x.group.key, y.group.key));
  for (const { group, weight } of heavy) {
    let target = 0;
    for (let i = 1; i < n; i++) if (loads[i] < loads[target]) target = i;
    put(target, group, weight);
  }

  // 2. 残り（軽い組）は、置き場ごとに散らす貪欲法（上の JSDoc）
  const pkgOrder = [...light.values()].sort((a, b) => b.total - a.total || byName(a.pkg, b.pkg));
  let remainingLight = pkgOrder.reduce((sum, entry) => sum + entry.total, 0);
  for (const { total, groups: pkgGroups } of pkgOrder) {
    const pkgLoads = Array.from({ length: n }, () => 0);
    pkgGroups.sort((a, b) => b.weight - a.weight || byName(a.group.key, b.group.key));
    // 重い組があるときだけ、その時点の空きに比例して置き場を配る（前の置き場の端数のずれを次で直す）。空きは、残りの軽い組を
    // 軽い分け前から水を張るように入れたときの水面（fillRoom）との差。空きの合計が残りの軽い組の合計に等しいので、
    // 重い組が平均を超えていても、軽い組が分け前を水面より上に押し上げない。
    // 重い組が無いときは、今までの「その置き場の中で最も軽い分け前」を、浮動小数点の比較も含めてそのまま使う
    const room = fillRoom(loads, remainingLight);
    const roomSum = room.reduce((p, q) => p + q, 0);
    const share = roomSum > 0 ? room.map((r) => r / roomSum) : room.map(() => 1 / n);
    for (const { group, weight } of pkgGroups) {
      let target = 0;
      for (let i = 1; i < n; i++) {
        if (heavy.length === 0) {
          if (pkgLoads[i] < pkgLoads[target] || (pkgLoads[i] === pkgLoads[target] && loads[i] < loads[target])) target = i;
          continue;
        }
        const d = total * share[i] - pkgLoads[i];
        const best = total * share[target] - pkgLoads[target];
        if (d > best + 1e-9 || (Math.abs(d - best) <= 1e-9 && loads[i] < loads[target])) target = i;
      }
      pkgLoads[target] += weight;
      put(target, group, weight);
    }
    remainingLight -= total;
  }
  return { parts: assigned.map((set) => mutations.filter((m) => set.has(m))), loads };
}
