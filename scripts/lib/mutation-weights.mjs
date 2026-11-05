import { controlGroupKey } from "./mutation-partition.mjs";

/**
 * 重い対照の組の、実測の所要時間の表（#546）。分け方（`scripts/lib/mutation-partition.mjs`）が使う重さの上書き。
 *
 * **なぜ表が要るか。** 重さの既定値はランナーごとの固定値（`RUNNER_COST_SECONDS`。node は 1＋0.6 秒）で、
 * 組ごとの違いを知らない。実際は、テストの組によって対照 1 回・検出 1 回が 0.2 秒から 60 秒まで開く。
 * 重い組を指す変異が増えても既定値では軽く数えるので、同じシャード・ワーカーに寄り、そこだけが長くなる
 * （#544 では `scan-target-wiring.test.mjs`（約 4 分）を指す 4 件が寄り、1 つのシャードが 18 分になった）。
 *
 * **なぜ「重い組だけ」を載せるか**（原則 X。保守の手間を小さく）。全組（約 250）の秒数を持つと、テストを足すたびに腐る。
 * 軽い組は既定値で十分に近く、ずれても分け前がわずかに偏るだけ。分け前を壊すのは、既定値の何倍も重い少数の組。
 * 載せる目安は **「組の合計（対照 1 回＋検出 × 件数）が約 30 秒以上で、既定値の見積もりの半分以下」**（かつ宣言に変異がある組）。
 *
 * **なぜ組の単位（置き場＋テストの並び）で持つか。** 測れるのが「対照の組ごと」の所要時間だから
 * （CI のログは変異ごとに対照と検出の時刻を出す）。1 ファイルずつに割ると、複数ファイルの組では按分の推測になる。
 * 代わりに、組の並びが変わると表から外れて既定値へ戻る（古くなる側に倒れる。表を直す手順は
 * `docs/guides/procedures/mutations.md` の「重い組の実測の表」）。
 *
 * **値の出どころ。** main の CI の 5 つの run（42040543527・42038371106・42027659444・41981719850・41969924963。いずれも mutation (1)〜(3)、4 ワーカー並列）のログから、
 * 変異ごとの「`--- 変異 #n` の行 → `対照:` の行 → `検出:` の行」の時刻の差を組ごとに平均し（対照の使い回しは数えない）、
 * 5 つの run の平均を半秒単位に丸めた（`scripts/measure-mutation-costs.mjs`。#550）。run どうしの差（1 回あたり）は大きい組で 2 倍近く
 * （test-shuffled の対照は 27.9〜56.7 秒、audit-test-focus は 8.9〜18.4 秒、markdown の performance の検出は 26.0〜81.5 秒）。
 * #547 の後の run は 2 つだけで、audit-test-focus の「軽くなった」は確かめられなかった（対照/検出の平均は #547 の前の 3 run で 12.7/11.6 秒、後の 2 run で 13.7/10.5 秒。run の揺れの範囲）。
 * **原則 X により、変異の無い組は載せない。** 入れる変異ができたら、その run のログで測って足す
 * （`docs/guides/procedures/mutations.md` の「重い組の実測の表」）。
 *
 * **この表の行が、分け方で「重い組」の印になる**（`isHeavyGroup`。重さで先に均す。`mutation-partition.mjs`）。
 * 見積もりだけが大きい組は印にしない。
 *
 * **値がずれても正しさは崩れない**（偏って遅くなるだけ）。CI の所要時間が偏ってきたら測り直す。
 */

/**
 * 対照の組の重さの目安（秒）。分け方（`scripts/lib/mutation-partition.mjs`）が、シャードとワーカーへ
 * 偏りなく配るために使う。値は **CI の実測**（main の CI の 5 つの run、`mutation (1)〜(3)`、`--jobs 4`）から、
 * 実測の表（下の `MEASURED_GROUPS`）に載せた組を除いた組について、ランナーごとに **合計を合わせる平均** で決めた
 * （対照 = 組ごとの対照の平均、検出 = 検出の合計 ÷ 変異の件数。0.1 秒単位）。
 * 測り方は `docs/guides/procedures/mutations.md` の「重い組の実測の表」、道具は `scripts/measure-mutation-costs.mjs`。
 *
 * **なぜ平均か（中央値でないか）。** 分け方が均すのはワーカー・シャードごとの**合計**で、分布の裾が長い
 * （bun の `live-ws.*` や node のプロセスを起こすテストは何十倍も重い）。中央値だと、表に無い組の合計が実測より何倍も小さくなる。
 * 表に無い組の、実測の合計 → 見積もりの合計（組 47・34・164 個）:
 *
 * | ランナー | 実測 | 直す前（手元の値） | 中央値（0.1/0.2・0.2/0.3・2.6/2.6） | 平均（この値） |
 * |---|---|---|---|---|
 * | bun | 185 秒 | 216 秒 | 24 秒 | 188 秒 |
 * | node | 138 秒 | 79 秒 | 56 秒 | 132 秒 |
 * | vitest | 1516 秒 | 1611 秒 | 1396 秒 | 1499 秒 |
 *
 * 他の run から測った案で残した run を分ける検証（`--leave-one-out`）では、中央値と平均で最長のワーカーの合計は同じ程度
 * （5 run の最長の合計: 中央値 1346 秒・平均 1341 秒。差の合計: 564 秒・562 秒）で、中央値が有利とは言えなかった。
 * 合計が合う方を採る。直す前の値（2026-10-31 の手元・4 コアの平均。vitest 3/3・bun 0.6/2・node 0.4/0.4）は、
 * bun は合計がほぼ合うが node の合計が約 0.6 倍の過小だった（#550）。
 *
 * **粒度はランナーのまま**（置き場やテストファイルの種類では分けない）。vitest の `apps/*-web`（jsdom）は `packages/*` の約 2 倍、
 * 複数ファイルの組はファイル数に近い倍率、bun の `live-ws.*`（13 組。実測 141 秒に対し見積もり 55 秒）や
 * node の「プロセスを起こすテスト」は桁違いに重く、ランナーだけでは毎回同じ向きにずれる組はある。
 * 今の既定値の組ごとの誤差は、対数の絶対値の中央値で 0.61（実測 ÷ 既定値の中央値は bun 0.13・node 0.37・vitest 0.91。
 * 合計を合わせた帰結で、典型的な軽い組は重く数え、少数の重い組が合計を埋め合わせる）。分ければ 0.3 前後に縮む（試算）が、
 * 模擬した最長と最短のワーカーの差は縮まなかった（run ごとの揺れの範囲）。差の大半は、割れない大きな組（test-shuffled は 1 組で約 4 分）と
 * 同じ組の run ごとの揺れ（2 倍）から来る。ずれの大きい組は、表（合計 30 秒以上の目安）で個別に持てば足りる（原則 X）。
 *
 * **値がずれても正しさは崩れない**（偏って遅くなるだけ）。偏りは各シャード・各ワーカーの所要時間に出るので、
 * 最長と最短の差が開いてきたら測り直す。
 */
export const RUNNER_COST_SECONDS = Object.freeze({
  vitest: Object.freeze({ control: 3, mutation: 2.7 }),
  bun: Object.freeze({ control: 0.6, mutation: 1.7 }),
  node: Object.freeze({ control: 1, mutation: 0.6 }),
});

/** 表に載せる組の、対照 1 回＋検出 1 回の最低の秒数（いちばん重い既定値 vitest の 3＋2.7 を超える）。自己テストが見る。 */
export const HEAVY_RUN_SECONDS = 7;

/**
 * 組の実測の秒数。`pkg`・`tests` が対照の組と同じ組を指す（鍵は {@link controlGroupKey}。表の下で作る）。
 * `control` は対照 1 回、`mutation` は検出 1 回。
 */
export const MEASURED_GROUPS = Object.freeze([
  Object.freeze({ pkg: "scripts", tests: Object.freeze(["test-shuffled.test.mjs"]), control: 43.5, mutation: 39.5 }),
  Object.freeze({ pkg: "scripts", tests: Object.freeze(["audit-test-focus.test.mjs"]), control: 13, mutation: 11 }),
  Object.freeze({ pkg: "scripts", tests: Object.freeze(["local-check.test.mjs"]), control: 4, mutation: 3 }),
  Object.freeze({ pkg: "scripts", tests: Object.freeze(["lib/toolchain.test.mjs", "check-toolchain.test.mjs"]), control: 8, mutation: 8.5 }),
  Object.freeze({ pkg: "scripts", tests: Object.freeze(["check-toolchain.test.mjs"]), control: 9.5, mutation: 8.5 }),
  Object.freeze({ pkg: "apps/agenda-web", tests: Object.freeze(["tests/scenario-draft.test.ts", "tests/scenario-builder.test.tsx"]), control: 16, mutation: 15.5 }),
  Object.freeze({ pkg: "apps/agenda-web", tests: Object.freeze(["tests/agenda-room.test.tsx"]), control: 8, mutation: 8 }),
  Object.freeze({ pkg: "apps/timer-web", tests: Object.freeze(["test/ui/App.room-header.test.tsx"]), control: 7, mutation: 6.5 }),
  Object.freeze({ pkg: "apps/tasuki-sync", tests: Object.freeze(["test/ws-adapter-tool-query.test.ts", "test/live-ws.checkin.test.ts"]), control: 2, mutation: 30.5 }),
  Object.freeze({ pkg: "packages/markdown", tests: Object.freeze(["tests/performance.test.ts"]), control: 1.5, mutation: 53 }),
]);

/** 組の鍵（{@link controlGroupKey}）→ 秒数。 */
const BY_KEY = new Map(MEASURED_GROUPS.map((row) => [controlGroupKey(row), Object.freeze({ control: row.control, mutation: row.mutation })]));

/** 表にある組の実測の秒数。無ければ null（呼び出し側が、ランナーごとの既定値へ倒す）。 */
export function measuredCostOf(group) {
  return BY_KEY.get(controlGroupKey(group)) ?? null;
}
