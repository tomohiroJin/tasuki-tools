import { controlGroupKey } from "./mutation-partition.mjs";

/**
 * 重い対照の組の、実測の所要時間の表（#546）。分け方（`scripts/lib/mutation-partition.mjs`）が使う重さの上書き。
 *
 * **なぜ表が要るか。** 重さの既定値はランナーごとの固定値（`RUNNER_COST_SECONDS`。node は 0.4 秒）で、
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
 * **値の出どころ。** main の CI の 2 つの run（42027659444 と 41981719850。いずれも mutation (1)〜(3)、4 ワーカー並列）のログから、
 * 変異ごとの「`--- 変異 #n` の行 → `対照:` の行 → `検出:` の行」の時刻の差を組ごとに平均し（対照の使い回しは数えない）、
 * 2 つの run の平均を半秒単位に丸めた。run どうしの差（1 回あたり）は、最大 36%（audit-test-focus の対照は 15.4 秒と 11.3 秒、
 * lib/toolchain＋check-toolchain の対照は 7.1 秒と 5.2 秒）。markdown の performance は 21%（26.0 秒と 31.5 秒）、
 * test-shuffled の対照は 19%（33.4 秒と 27.9 秒）。ほかは 10% 台以内。
 * **原則 X により、変異の無い組は載せない。** 入れる変異ができたら、その run のログで測って足す
 * （`docs/guides/procedures/mutations.md` の「重い組の実測の表」）。
 *
 * **この表の行が、分け方で「重い組」の印になる**（`isHeavyGroup`。重さで先に均す。`mutation-partition.mjs`）。
 * 見積もりだけが大きい組は印にしない。
 *
 * **値がずれても正しさは崩れない**（偏って遅くなるだけ）。CI の所要時間が偏ってきたら測り直す。
 */

/** 表に載せる組の、対照 1 回＋検出 1 回の最低の秒数（いちばん重い既定値 vitest の 3＋3 を超える）。自己テストが見る。 */
export const HEAVY_RUN_SECONDS = 7;

/**
 * 組の実測の秒数。`pkg`・`tests` が対照の組と同じ組を指す（鍵は {@link controlGroupKey}。表の下で作る）。
 * `control` は対照 1 回、`mutation` は検出 1 回。
 */
export const MEASURED_GROUPS = Object.freeze([
  Object.freeze({ pkg: "scripts", tests: Object.freeze(["test-shuffled.test.mjs"]), control: 31, mutation: 28 }),
  Object.freeze({ pkg: "scripts", tests: Object.freeze(["audit-test-focus.test.mjs"]), control: 13.5, mutation: 12.5 }),
  Object.freeze({ pkg: "scripts", tests: Object.freeze(["local-check.test.mjs"]), control: 4.5, mutation: 3 }),
  Object.freeze({ pkg: "scripts", tests: Object.freeze(["lib/toolchain.test.mjs", "check-toolchain.test.mjs"]), control: 6, mutation: 6 }),
  Object.freeze({ pkg: "apps/agenda-web", tests: Object.freeze(["tests/scenario-draft.test.ts", "tests/scenario-builder.test.tsx"]), control: 17, mutation: 15.5 }),
  Object.freeze({ pkg: "apps/agenda-web", tests: Object.freeze(["tests/agenda-room.test.tsx"]), control: 8, mutation: 8.5 }),
  Object.freeze({ pkg: "apps/timer-web", tests: Object.freeze(["test/ui/App.room-header.test.tsx"]), control: 7.5, mutation: 7 }),
  Object.freeze({ pkg: "apps/tasuki-sync", tests: Object.freeze(["test/ws-adapter-tool-query.test.ts", "test/live-ws.checkin.test.ts"]), control: 2, mutation: 30 }),
  Object.freeze({ pkg: "packages/markdown", tests: Object.freeze(["tests/performance.test.ts"]), control: 1, mutation: 29 }),
]);

/** 組の鍵（{@link controlGroupKey}）→ 秒数。 */
const BY_KEY = new Map(MEASURED_GROUPS.map((row) => [controlGroupKey(row), Object.freeze({ control: row.control, mutation: row.mutation })]));

/** 表にある組の実測の秒数。無ければ null（呼び出し側が、ランナーごとの既定値へ倒す）。 */
export function measuredCostOf(group) {
  return BY_KEY.get(controlGroupKey(group)) ?? null;
}
