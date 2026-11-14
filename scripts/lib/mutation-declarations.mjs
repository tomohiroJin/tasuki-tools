/**
 * 変異検査（`scripts/mutation-check.mjs`）の宣言の表（#380 で機構から分けた）。
 *
 * 変異を足すときは、ここに宣言を足し、`scripts/mutations/` にパッチを置く。宣言とパッチは 1 対 1
 * （`mutation-check.mjs` の `assertMutationPatchesBijective` が実行の初めに見る）。
 * **ID は詰めない・使い回さない**（過去の記録が ID で変異を指している）。
 *
 * このファイルは `--changed` の「変異検査の機構」に数える（入口が import するため。宣言を書き足した枝は
 * 全件に倒れる）。作業ツリーの汚れの検査からは除外する（宣言を書き足した直後でも流せるように）。
 * どちらも `mutation-check.test.mjs` の「宣言の表の置き場（#380）」が見る。
 */

/**
 * 変異定義。
 *
 * pkg: 対象ディレクトリ（WORKSPACE_ROOT からの相対パス）。--full 実行時と、
 *      対応表のテストのみの実行時にランナーを呼ぶ cwd の両方に使う。パッケージとは限らない
 *      （`scripts/` のように package.json を持たないディレクトリも取れる。#174）。
 * tests: 検出を期待するテストファイル（pkg からの相対パス）。
 * note: plan.md の対応表からの読み替えがあれば、その内容と理由をここに記録する。
 *       **plan.md より後に足した変異もここに理由を書く。** 対応表は
 *       `docs/plans/codebase-refactoring/plan.md` の作業記録であり、以後に
 *       書き換えた実装（ADR-0006 決定 4 が変異を要求する）はそこに追記されない。
 */
const RESERVED_220_229 =
  "**対応表より後に足した変異。** 200〜249 は 2026-10-15 の並列修正（#373・#374・#376・#381・#382）に 10 ずつ割り当てた予約の範囲（#376 は 220〜229）。";

const RESERVED_700_719 =
  "**対応表より後に足した変異。** 700〜719 は #487（PR #492）に割り当てた予約の範囲。2026-11-01 に並行の PR（#493 は 634〜636 のち 640〜650、#494 は 634〜639）と 2 度重なったため、離れた範囲を取った。";

const RESERVED_760_779 =
  "**対応表より後に足した変異。** 760〜779 は #490（PR #498）に割り当てた予約の範囲。720〜725、ついで 740〜749 を取ったが、どちらも並行の PR #497（#488）と重なった（PR #498 のレビュー 4・再レビュー 2）。2026-11-01 時点でどのブランチも使っていない帯へ移した。";

const RESERVED_800_809 =
  "**対応表より後に足した変異。** 800〜809 は #480 に割り当てた範囲。2026-11-01 時点の最大（771）から離し、並行の枝と重ならない帯を取った。";

const RESERVED_810_819 =
  "**対応表より後に足した変異。** 810〜819 は #508 に割り当てた範囲（並行の #505・#509 と重ならないよう、利用者が割り当てた）。";

const RESERVED_820_829 =
  "**対応表より後に足した変異。** 820〜829 は #509 に割り当てた範囲（#505・#508 と並行に進めたため、帯を分けた）。";

const RESERVED_840_849 =
  "**対応表より後に足した変異。** 840〜849 は #504 に割り当てた範囲（並行の作業と重ならないよう、割り当てられた）。";

const RESERVED_860_869 =
  "**対応表より後に足した変異。** 860〜869 は #504 に追加で割り当てた範囲（840〜849 を使い切ったため。850〜859 は #506）。";

const RESERVED_870_879 =
  "**対応表より後に足した変異。** 870〜879 は #504 に追加で割り当てた範囲（860〜869 を使い切ったため）。";

const RESERVED_250_259 =
  "**対応表より後に足した変異。** 250〜259 は 2026-10-15 の並列修正で #376 に追加で割り当てた予約の範囲（220〜229 が埋まったため）。";

const RESERVED_900_909 =
  "**対応表より後に足した変異。** 900〜909 は #499 に割り当てた範囲。";

const RESERVED_950_959 =
  "**対応表より後に足した変異。** 950〜959 は #524 に割り当てた範囲。";

const RESERVED_965_969 =
  "**対応表より後に足した変異。** 965〜969 は #534 に割り当てた範囲。";

const RESERVED_980_984 =
  "**対応表より後に足した変異。** 980〜984 は #534 に追加で割り当てた範囲（965〜969 を使い切ったため）。";

const RESERVED_995_999 =
  "**対応表より後に足した変異。** 995〜999 は #525 に割り当てた範囲。";

const RESERVED_960_964 =
  "**対応表より後に足した変異。** 960〜964 は #533 に割り当てた範囲。";

const RESERVED_970_979 =
  "**対応表より後に足した変異。** 970〜979 は #535 に割り当てた範囲。";

const RESERVED_880_889 =
  "**対応表より後に足した変異。** 880〜889 は #506 の宣言の検査に追加で割り当てた範囲（850〜859 を使い切ったため）。";

const RESERVED_920_924 =
  "**対応表より後に足した変異。** 920〜924 は #522 の roulette-core に割り当てた範囲。";

const RESERVED_925_929 =
  "**対応表より後に足した変異。** 925〜929 は #522 の agenda-core に割り当てた範囲。";
const RESERVED_930_934 =
  "**対応表より後に足した変異。** 930〜934 は #522 の timer-core に割り当てた範囲。";
const RESERVED_935_939 =
  "**対応表より後に足した変異。** 935〜939 は #522 の poker-core に割り当てた範囲。";

const RESERVED_940_949 =
  "**対応表より後に足した変異。** 940〜949 は #523 に割り当てた範囲。";

const RESERVED_850_859 =
  "**対応表より後に足した変異。** 850〜859 は #506 に割り当てた範囲。";

const RESERVED_910_919 =
  "**対応表より後に足した変異。** 910〜919 は #521 に割り当てた範囲。2.5 の行ごと（IPv6 の展開・転送ヘッダーの取り出し・NODE_ENV の引用符・ループバックの判定・設定の検査・掃除の境目・フレームの上限）に代表を 1 件ずつ選んだ。全件は宣言しない。";

const RESERVED_985_994 =
  "**対応表より後に足した変異。** 985〜994 は #540 に割り当てた範囲。";

const RESERVED_1000_1009 =
  "**対応表より後に足した変異。** 1000〜1009 は #544 に割り当てた範囲。";

const RESERVED_1010_1019 =
  "**対応表より後に足した変異。** 1010〜1019 は #546 に割り当てた範囲。";

const RESERVED_1020_1029 =
  "**対応表より後に足した変異。** 1020〜1029 は #547 に割り当てた範囲。";

const RESERVED_1360_1369 =
  "**対応表より後に足した変異。** 1360〜1369 は #554 に追加で割り当てた範囲（1350〜1359 を使い切ったため。1340〜1349 は #553 の予約を避けた）。";

const RESERVED_1350_1359 =
  "**対応表より後に足した変異。** 1350〜1359 は #554 に追加で割り当てた範囲（1330〜1339 を使い切ったため。1340〜1349 は #553 の予約を避けた）。";

const RESERVED_1330_1339 =
  "**対応表より後に足した変異。** 1330〜1339 は #554 に追加で割り当てた範囲（1320〜1329 を使い切ったため。main の宣言は 1083・#553 の枝は 1200〜1289 で重ならない）。";

const RESERVED_1320_1329 =
  "**対応表より後に足した変異。** 1320〜1329 は #554 に追加で割り当てた範囲（1310〜1319 を使い切る前に、11 回目の指摘で足した。main の宣言は 1083・#553 の枝は 1200〜1289 で重ならない）。";

const RESERVED_1310_1319 =
  "**対応表より後に足した変異。** 1310〜1319 は #554 に追加で割り当てた範囲（1300〜1309 を使い切ったため。main の宣言は 1083 までで重ならないことを確かめた）。";

const RESERVED_1300_1309 =
  "**対応表より後に足した変異。** 1300〜1309 は #554 に追加で割り当てた範囲（1290〜1299 を使い切ったため）。";

const RESERVED_1290_1299 =
  "**対応表より後に足した変異。** 1290〜1299 は #554 に追加で割り当てた範囲（1260〜1269 を使い切ったため）。";

const RESERVED_1260_1269 =
  "**対応表より後に足した変異。** 1260〜1269 は #554 に追加で割り当てた範囲（1240〜1249 の 3 回目のレビュー分で足りなくなった場合に備える）。";

const RESERVED_1240_1249 =
  "**対応表より後に足した変異。** 1240〜1249 は #554 に追加で割り当てた範囲（1220〜1229 を使い切る前に、2 回目のレビューの指摘で足した）。";

const RESERVED_1220_1229 =
  "**対応表より後に足した変異。** 1220〜1229 は #554 に割り当てた範囲（Issue の 1010〜1019 は #546 が、のちに取った 1070〜1079 は #562（PR #564）が先に main へ入れたため、離れた帯へ移した）。";

const RESERVED_1030_1039 =
  "**対応表より後に足した変異。** 1030〜1039 は #550 に割り当てた範囲。";

const RESERVED_1040_1049 =
  "**対応表より後に足した変異。** 1040〜1049 は #542 に割り当てた範囲。";

const RESERVED_1050_1059 =
  "**対応表より後に足した変異。** 1050〜1059 は #542 の続き（/code-review の指摘）に割り当てた範囲。";

const RESERVED_1230_1239 =
  "**対応表より後に足した変異。** 1230〜1239 は #556 に追加で割り当てた範囲。";

const RESERVED_1110_1119 =
  "**対応表より後に足した変異。** 1110〜1119 は #556 に割り当てた範囲。";

const RESERVED_1380_1389 =
  "**対応表より後に足した変異。** 1380〜1389 は #556 のレビュー（最後の指摘）に割り当てた範囲。";

const RESERVED_1060_1069 =
  "**対応表より後に足した変異。** 1060〜1069 は #562（E2E の繰り返し実行の集計と、ci.yml との写しの比較）に割り当てた範囲。";

const RESERVED_1070_1079 =
  "**対応表より後に足した変異。** 1070〜1079 は #562 の続き（敵対的レビューの指摘）に割り当てた範囲。";

const RESERVED_1080_1089 =
  "**対応表より後に足した変異。** 1080〜1089 は #566（presence の切断の重なり・猶予中の操作）に割り当てた範囲。";

const RESERVED_1200_1209 =
  "**対応表より後に足した変異。** 1200〜1209 は #553 に割り当てた範囲（Issue の 1000〜1009 は #544 が、のちに取った 1060〜1069 は #562（PR #564）が先に main へ入れたため、離れた帯へ移した）。";

const RESERVED_1210_1219 =
  "**対応表より後に足した変異。** 1210〜1219 は #553 に追加で割り当てた範囲（1200〜1209 の続き。もとは #553 が 1080〜1089 として足した変異（1080〜1082）を、同じ帯を #566 が main で先に使ったため、この範囲へ振り直した）。";

const RESERVED_1250_1259 =
  "**対応表より後に足した変異。** 1250〜1259 は #553 に追加で割り当てた範囲（1213〜1219 を使い切ったため。3 回目の敵対的レビューの指摘で足した）。";

const RESERVED_1270_1279 =
  "**対応表より後に足した変異。** 1270〜1279 は #553 に追加で割り当てた範囲（1250〜1259 を使い切ったため。4 回目の敵対的レビューと /code-review の指摘で足した）。";

const RESERVED_1280_1289 =
  "**対応表より後に足した変異。** 1280〜1289 は #553 に追加で割り当てた範囲（1270〜1279 を使い切ったため。7 回目の指摘で足した）。";

const RESERVED_1340_1349 =
  "**対応表より後に足した変異。** 1340〜1349 は #553 に追加で割り当てた範囲（1280〜1289 を使い切ったため。10 回目の指摘で足した。#554 は 1290〜1339 と 1350 番台を使う）。";

const RESERVED_1370_1379 =
  "**対応表より後に足した変異。** 1370〜1379 は #553 に追加で割り当てた範囲（1340〜1349 を使い切ったため。13 回目の指摘で足した）。";

const RESERVED_1100_1109 =
  "**対応表より後に足した変異。** 1100〜1109 は #555 に割り当てた範囲。";

const RESERVED_1390_1399 =
  "**対応表より後に足した変異。** 1390〜1399 は #555 に追加で割り当てた範囲（1100〜1109 を使い切ったため。PR #575 の指摘で足した。#556 は 1380〜1389 を使う）。";

const RESERVED_1480_1499 =
  "**対応表より後に足した変異。** 1480〜1499 は #578 の PR 3（Codex）に割り当てた予約の範囲（1440〜1479 は PR #583 が予約）。";

const RESERVED_1400_1409 =
  "**対応表より後に足した変異。** 1400〜1409 は #555 に追加で割り当てた範囲（1390〜1399 を使い切ったため。PR #575 の最後のレビューの指摘で足した）。";

const RESERVED_1130_1139 =
  "**対応表より後に足した変異。** 1130〜1139 は #558 に割り当てた範囲。";

const RESERVED_1430_1439 =
  "**対応表より後に足した変異。** 1430〜1439 は #558 に追加で割り当てた範囲（1130〜1139 を使い切ったため。PR #579 のレビューの指摘で足した）。";

const RESERVED_1120_1129 =
  "**対応表より後に足した変異。** 1120〜1129 は #557 に割り当てた範囲。";

const RESERVED_1500_1569 =
  "**対応表より後に足した変異。** 1500〜1569 は #578（PR 2 機械化）に割り当てた範囲（main の #574 が 1440〜1442 を使ったので付け替えた。PR 3 は 1480〜1489）。";

const RESERVED_1570_1579 =
  "**対応表より後に足した変異。** 1570〜1579 は #578（PR 2 機械化）の続き（1500〜1569 を使い切った）。PR 3 は 1480〜1499。";

const RESERVED_1600_1619 =
  "**対応表より後に足した変異。** 1600〜1619 は #590（道具の列挙を 1 か所から）に割り当てた範囲。";

const RESERVED_1640_1659 =
  "**対応表より後に足した変異。** 1640〜1659 は #593（checkin のやり方の分岐を Record に寄せる）に割り当てた範囲。";

const RESERVED_1420_1429 =
  "**対応表より後に足した変異。** 1420〜1429 は #557 に追加で割り当てた範囲（1120〜1129・1410〜1419 を使い切ったため。PR #580 のレビューの指摘で足した）。";

const RESERVED_1410_1419 =
  "**対応表より後に足した変異。** 1410〜1419 は #557 に追加で割り当てた範囲（1120〜1129 を使い切ったため。除く規則ごとの変異と、検査が見つけた CSS の直しの変異）。";

export const MUTATIONS = [
  {
    id: 1,
    label: "advanceDriver の交代を (i+1)%n → (i+2)%n",
    patch: "m01-advance-driver-plus2.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts"],
    note:
      "advanceDriver は nextEligibleIndex(aggregate.ts) に委譲しているため、" +
      "実際の変異先は同ファイルの (currentIndex + 1) % len。関数の分割位置が" +
      "異なるだけで、同じ「交代先の計算式が1つずれる」欠陥の型。",
  },
  // id 2（checkPermission の viewer 拒否を反転）と id 5（canRemoveParticipant の
  // 呼び出しを削る）は #95 S3 で削除した。役割とホストを廃止したことで、
  // どちらも「守っていた性質が概念ごと消えた」変異である（設計正本 §6.5）。
  // 番号は詰めない —— 過去の記録が id で変異を指しているため。
  {
    id: 3,
    label: "computeIneligibleIndices から placeholder の除外を削る",
    patch: "m03-ineligible-placeholder.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/proxy-auto-switch.test.ts", "test/manual-skip-eligible.test.ts"],
  },
  {
    id: 4,
    label: "normalizeDisplayName の正規化を1段無効化（制御文字の除去を外す）",
    patch: "m04-display-name-control-chars.patch",
    pkg: "packages/room-core",
    tests: ["tests/display-name.test.ts"],
  },
  // id 48（normalizeDisplayName の段を #284 以前の順序へ戻す）は #284 の 3 巡目で削除した。
  // **等価変異になったためである。** 段の順序は「制御文字でラベルの見出しを割る」ことを
  // 防いでいたが、3 巡目でラベルの照合が**伏せた写し**の上で行われるようになり、
  // その写しは `\p{Cc}`（制御文字を含む）も伏せる。順序を戻しても出力は変わらない
  // —— 生成した 30 万件で差 0 件を実測した。いま同じ性質を守るのは id 49（照合を生の
  // 文字列に戻す）と id 53（伏せる集合を狭める）である。
  // 番号は詰めない —— 過去の記録が id で変異を指しているため。
  {
    id: 49,
    label: "ラベルの照合を「目に映る姿」ではなく生の文字列に戻す（画面に出ない文字で見出しを割れる）",
    patch: "m49-label-match-without-view.patch",
    pkg: "packages/room-core",
    tests: ["tests/display-name.test.ts"],
    note:
      "#284。**対応表より後に足した変異。** ラベルの照合を「目に映る姿」ではなく生の文字列に戻す。ZWJ や U+00AD のように**出力からは落とせない**文字で見出しを割れるようになる（総当たりで 544 件）。",
  },
  {
    id: 50,
    label: "第2層の不可視文字を性質から旧列挙へ戻す（見た目が同じ名前の骨格が割れる）",
    patch: "m50-skeleton-invisible-enumeration.patch",
    pkg: "packages/room-core",
    tests: ["tests/display-name.test.ts"],
    note:
      "#284。**対応表より後に足した変異。** 第 2 層（`nameSkeleton`）が不可視を抜いた後の NFKC を外す。抜いたことで解禁された合成が適用されず、`\"Jose\" + ZWJ + U+0301` が `\"José\"` と別の骨格になって曖昧判定が発火しない。",
  },
  {
    id: 51,
    label: "normalizeDisplayName の末尾の NFKC を外す（掛けた回数で答えが変わる）",
    patch: "m51-normalize-not-idempotent.patch",
    pkg: "packages/room-core",
    tests: ["tests/display-name.test.ts"],
    note:
      "#284。**対応表より後に足した変異。** `normalizeDisplayName` 末尾の NFKC を外す。不可視・制御文字を抜くとそこで合成が解禁されるため、掛けた回数で答えが変わる（`\"A\" + U+200B + U+030A`）。玄関が提示した値とサーバーが保存する値が食い違う。",
  },
  {
    id: 52,
    label: "剥がしを 20 回で打ち切る（入れ子 21 段で剥がし残しが通る）",
    patch: "m52-strip-passes-capped.patch",
    pkg: "packages/room-core",
    tests: ["tests/display-name.test.ts"],
    note:
      "#284。**対応表より後に足した変異。** 剥がしの回数上限（20）を戻す。上限 40 文字は正規化の**後**に課されるので「表示名は短いから数回で収まる」は成り立たず、境界の前段が通す 720 文字ぶんだけ入れ子を書ける。21 段で `\"Bob(ID: rqdK)ID: rqdK)\"` がそのまま返り、冪等性も同時に崩れる。",
  },
  {
    id: 53,
    label: "伏せる集合を Default_Ignorable 単独へ狭める（\p{Cf} の 32 点が漏れる）",
    patch: "m53-invisible-source-narrowed.patch",
    pkg: "packages/room-core",
    tests: ["tests/display-name.test.ts"],
    note:
      "#284。**対応表より後に足した変異。** `Default_Ignorable_Code_Point` は `\\p{Cf}` から前置結合記号・割注・聖刻文字の書式制御を差し引いて定義される。単独で使うと U+0600–0605 / U+FFF9–FFFB / U+13430–1343F など 32 点が漏れ、そこでラベルの見出しを割れる。**和集合であることが要件である。**",
  },
  {
    id: 54,
    label: "字面の無い表示名の判定を長さだけに戻す（何も見えない参加者が名簿に並ぶ）",
    patch: "m54-renders-as-nothing-length-only.patch",
    pkg: "packages/room-core",
    tests: ["tests/display-name.test.ts"],
    note:
      "#284。**対応表より後に足した変異。** ZWJ・U+FE0F・U+00AD などは正当な用途のために出力へ残すので、それ 1 文字だけの名前は「長さ 1」で通る。境界も玄関も弾かず、名簿に**何も見えない行**が並ぶ。",
  },
  {
    id: 55,
    label: "同名の代理追加を理由も出さずにフォームごと畳む（黙って失敗する姿へ戻す）",
    patch: "m55-proxy-duplicate-silent.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/RosterPanel.duplicate-proxy.test.tsx"],
    note:
      "#291。**対応表より後に足した変異。** 拒否そのものは残し、**押した場所に何も残さない**形へ戻す" +
      "（理由を出さず、フォームを閉じ、入力を捨てる）。利用者が実画面で踏んだのはこの姿である ——" +
      "サーバーの `DuplicateName` バナーはページ上端に出ていたが、名簿を下までスクロールした操作地点からは" +
      "**ビューポートの 1075px 上**で、4 秒で自動消去されていた。**「フォームを閉じる処理を共通化した」で" +
      "実際に起こりうる形**にしてあり、判定も早期 return も残るのでコードを読んだだけでは欠陥に見えない。",
  },
  {
    id: 56,
    label: "代理を送った直後に無条件でフォームを畳む（サーバーの返事を待たない）",
    patch: "m56-proxy-closes-before-server-answers.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/RosterPanel.duplicate-proxy.test.tsx"],
    note:
      "#291 の敵対的レビュー。**#291 の最初の修正が実際にこの形だった。** 画面の同名判定は名簿と席しか" +
      "見ておらず、サーバーの `occupants` より狭い。**選択画面に居るだけの人との同名**は実 WS で" +
      "`DuplicateName` が返ることを測ってある（輪が満席・表示名の規約違反も画面には予測できない）。" +
      "畳むとその経路だけで入力ごと消え、**#291 の症状が戻る**。",
  },
  {
    id: 57,
    label: "改名の同名判定から自分自身の除外を落とす（画面がサーバーより厳しくなる）",
    patch: "m57-rename-forgets-to-exclude-self.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/RosterPanel.duplicate-proxy.test.tsx"],
    note:
      "#291 の敵対的レビュー。サーバーは `conflictsWithExisting(residents, displayName, target.participantId)` と" +
      "対象を除外して比べる。落とすと**こちら向きの誤り（画面のほうが厳しい）**になり、" +
      "**保険が無い** —— サーバーが通す操作を画面が拒むので、利用者は正当な操作をできなくなる。",
  },
  {
    id: 58,
    label: "拒否の理由を名簿の変化に追随させない（もう追加できる名前に「まだ駄目」と言う）",
    patch: "m58-rejection-ignores-roster-change.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/RosterPanel.duplicate-proxy.test.tsx"],
    note:
      "#291 の敵対的レビュー。**理由の文言そのものを state に置く素朴な実装は必ずこうなる。**" +
      "正規形を持って描画時にいまの名簿へ尋ねる形にしてあるのはそのためである。",
  },
  {
    id: 59,
    label: "代理が現れたとき入力欄の中身を見ずに畳む（打ちかけの入力が黙って消える）",
    patch: "m59-arrival-discards-retyped-input.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/RosterPanel.duplicate-proxy.test.tsx"],
    note:
      "#291。**対策そのものが持つ欠陥である**（[[countermeasures-carry-the-flaw-they-fix]]）。" +
      "送ったあと返事を待つ間に別の名前を打ち始めていると、あとから届いた名簿で畳んだ拍子に" +
      "**打ちかけの入力が黙って消える** —— #291 が直しているものとまったく同じ形。",
  },
  {
    id: 73,
    label: "色を決められない塗り（url）の層を読み飛ばす（読めた層だけで緑を出す）",
    patch: "m73-unreadable-layer-ignored.patch",
    pkg: "e2e",
    tests: ["tests/contrast.test.ts"],
    note:
      "#296。**対応表より後に足した変異。** これは #279 まで実在した欠陥そのもので、" +
      "羅紗の織り目のような薄い粒なら実害は無いが、**不透明な写真を重ねると検査が嘘をつく**。" +
      "落とすと、読めた層（照明のグラデーション）だけで測って緑を出す形に戻る。",
  },
  {
    id: 74,
    label: "流れの中に箱を持つ擬似要素（罫線など）も地に数える",
    patch: "m74-in-flow-pseudo-counted-as-ground.patch",
    pkg: "e2e",
    tests: ["tests/contrast.test.ts"],
    note:
      "#296。**対応表より後に足した変異。** 擬似要素を地に含めるとき、`position` を見ないと" +
      "見出しの下の罫線まで下地に混ざる（実測で玄関に実在する）。**乗っていない塗りで字を測る**" +
      "ことになり、地が明るい側へ嘘をつく。対策そのものが持つ欠陥の型。" +
      "**判定は許可リスト（`absolute` / `fixed`）である** —— `static` だけを弾く形だと" +
      "`relative` と `sticky` が漏れ、この変異でも見えなかった（レビュー 2 巡目）。",
  },
  {
    id: 75,
    label: "字を塗る擬似要素（background-clip: text）も地に数える",
    patch: "m75-pseudo-glyph-paint-counted-as-ground.patch",
    pkg: "e2e",
    tests: ["tests/contrast.test.ts"],
    note:
      "#296。**対応表より後に足した変異。** 要素自身の背景には #279 でこのガードを入れたが、" +
      "#296 で新設した**擬似要素の経路には無かった**（敵対的検証の指摘）。落とすと、" +
      "擬似要素が字を塗る層の色をその擬似要素の**地**として測ることになる —— " +
      "**過去に一度塞いだ穴を、新しい経路で開け直す型**である。",
  },
  {
    id: 76,
    label: "language の検証を許可リストから任意の非空文字列へ戻す",
    patch: "m76-topic-language-not-enumerated.patch",
    pkg: "packages/topic-core",
    tests: ["tests/schemas.test.ts"],
    note:
      "#91・E13・docs/adr/0012 D10。`language` の検証を許可リスト（v.picklist）から" +
      "任意の非空文字列（v.pipe(v.string(), v.minLength(1))）へ戻す。プロンプトへ" +
      "任意の文字列が届く——2026-08-13 に持ち出し経路が本番で成立した入口。",
  },
  {
    id: 77,
    label: "お題生成の起動引数から --tools \"\" を落とす",
    patch: "m77-topic-provider-tools-flag-dropped.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/claude-cli-topic-provider.test.ts"],
    note:
      "#91・E12・docs/adr/0012 D10・spec §10。起動引数から `--tools \"\"` を消す。" +
      "本番の CLI（2.1.178）で `--tools \"\"` を落とすと、利用者設定のプラグインが" +
      "足す LSP 等の組み込みツールが残ることを実測している（2026-09-24）。",
  },
  {
    id: 78,
    label: "topic.set が進行中の生成を止めずに書く",
    patch: "m78-topic-set-skips-cancel.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/topic-handlers.test.ts"],
    note:
      "#91・E11。`topic.set` から `generator.cancel(roomCode)` を消す。止めずに掲げると、" +
      "あとから届いた生成の結果が利用者の掲げたお題を上書きしうる。",
  },
  {
    id: 79,
    label: "クールダウンの判定を中断（cancel）より後ろへ移す",
    patch: "m79-cooldown-check-after-cancel.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/topic-generation.test.ts"],
    note:
      "#91・E22・spec §5.3。`isCoolingDown` の判定を `cancel` より後ろへ移す。" +
      "先に中断すると、作り直しを拒んだはずのクールダウン中でも進行中の生成が" +
      "消え（signal が abort され）、「進行中の生成とお題を残す」という契約が壊れる。",
  },
  {
    id: 80,
    label: "ルーム破棄がお題の生成を中断しない",
    patch: "m80-destroy-room-skips-topic-cancel.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/destroy-room.test.ts"],
    note:
      "#91・E6。ルーム破棄から `topicGenerator.cancel(roomCode)` を消す。" +
      "破棄されたルームの進行中のお題生成（子プロセス・AI の枠）が止まらないまま" +
      "走り続ける欠陥。#91 PR 3 で隣の `delegator?.cancel` が消えたので作り直した。",
  },
  {
    id: 81,
    label: "お題の ai.unlock へ room.join と別のレート制限ゲートを渡す",
    patch: "m81-topic-unlock-fresh-rate-limit-gate.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.topic.test.ts"],
    note:
      "#91・E21・spec §9。`makeTopicHandlers` へ渡す `rateLimitGate` を" +
      "`handlers.rateLimitGate`（room.join と共有する 1 個）ではなく、" +
      "`createRateLimitGate(rateLimiter)` で新しく作った別インスタンスにする。" +
      "バケツが connId→clientKey の登録ごと分かれるため、room.join を枯渇させても" +
      "ai.unlock は素通りし（逆も同様）、同じ IP からの総当たりが片方のツールを" +
      "迂回すれば通ってしまう。",
  },
  {
    id: 82,
    label: "お題の接続を poker の早期 return に乗せる",
    patch: "m82-topic-takes-poker-early-return.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/ws-adapter-tool-query.test.ts", "test/live-ws.topic.test.ts"],
    note:
      "#91・E21・spec §5.3 の MUST。お題の接続を poker と同じ早期 return（onConnect を" +
      "呼ばずに抜ける）に乗せる。onConnect が呼ばれないと `rateLimitGate.open` が" +
      "接続とクライアント鍵を結ばず、鍵が connId へ落ちる —— ai.unlock の総当たりが" +
      "接続を張り直すだけで枠を回避できる（直前の行のコメントが禁じている変更そのもの）。",
  },
  {
    id: 83,
    label: "timer の生 JSON が TopicCommandSchema に通るとお題の経路へ奪われる",
    patch: "m83-timer-messages-hijacked-by-topic-schema.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.topic.test.ts"],
    note:
      "#91・E5・spec T4「お題を変えられるのはお題ツールの接続だけ」。timer の接続の" +
      "メッセージも、生 JSON が `TopicCommandSchema` に通ればお題の経路" +
      "（`onTopicMessage`）へ回してしまう。2 段目（`roomCodeOf` がお題ツールの接続だけを" +
      "数える。m86 が壊す）があるのでお題そのものは変わらないが、timer 側の INVALID_COMMAND" +
      "ではなくお題の経路の NOT_IN_ROOM が返り、テストは応答コードの違いで検出する。",
  },
  {
    id: 84,
    label: "お題生成の起動引数から --setting-sources \"\" を落とす",
    patch: "m84-topic-provider-setting-sources-dropped.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/claude-cli-topic-provider.test.ts"],
    note:
      "R11・docs/adr/0012 D10・spec §10。起動引数から `--setting-sources \"\"` を消す" +
      "（`--tools \"\"` は残す）。本番の CLI（2.1.178）で `--tools \"\"` だけでは" +
      "利用者設定のプラグインが足す LSP 等の組み込みツールが残ることを実測している" +
      "（2026-09-24）——`--setting-sources \"\"` はその実測を埋める側であり、これを" +
      "落とすと利用者・プロジェクト設定を読み込む状態へ戻る。",
  },
  {
    id: 85,
    label: "お題の配信先からハブを落とす",
    patch: "m85-topic-broadcast-drops-hub.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/topic-handlers.test.ts"],
    note:
      "R9・spec §9。`TOPIC_RECIPIENT_TOOLS` からハブ（`TOOL_HUB`）を落とし、" +
      "お題の接続だけへ配る。ハブ（玄関の選択画面）はお題の掲げ直しを見られなくなり、" +
      "「玄関で待っている間もお題が読める」という契約（spec §9・E2・E4）が壊れる。" +
      "#91 PR 3 で配信先に timer・poker が加わり行が変わったので作り直した" +
      "（timer を落とす形は m96）。#590 で一覧から導く形に作り直した。",
  },
  {
    id: 86,
    label: "お題の在室判定がツールを見ず、接続 ID だけでルームを引く",
    patch: "m86-topic-room-lookup-ignores-tool.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/topic-handlers.test.ts"],
    note:
      "#91・E5・spec T4 の 2 段目。`roomCodeOf` がお題ツールの接続かどうかを見ない。" +
      "1 段目（ws-adapter の `?tool=topic` による振り分け。m83 が壊す）が崩れると、" +
      "timer やハブの接続として在席している接続がお題を掲げ・下ろせてしまう。",
  },
  {
    id: 6,
    label: "freezeRunningClock の凍結を外す（一時停止で満タンに戻る）",
    patch: "m06-freeze-running-clock.patch",
    pkg: "packages/timer-core",
    tests: ["test/pause-freeze.test.ts", "test/break-freeze.test.ts"],
  },
  // id 7（帳簿を持たない snapshot を生成中側へ倒す）は #91 PR 3 で削除した。
  // お題の生成中の帳簿（`Room.problemGeneration`）と timer-web の生成中の表示
  // （`ui/problem-generation.ts`）が実装ごと消えた —— お題はお題ツールが作り、timer は配られた
  // お題を読むだけになった（spec T11）。番号は詰めない —— 過去の記録が id で変異を指しているため。
  {
    id: 8,
    label: "deriveConnectionStatus の sessionLost 分岐を反転",
    patch: "m08-derive-connection-status-invert.patch",
    pkg: "apps/timer-web",
    // ⚠ apps/timer-web/test/ui/connection-status.test.tsx ではない。同名の別ファイルで、
    // そちらは StatusStrip コンポーネントの表示を検証する別物（plan.md 参照）。
    tests: ["test/connection-status.test.ts"],
  },
  {
    id: 9,
    label: "buildNoticeMessage の「あなた」判定を反転",
    patch: "m09-build-notice-message-invert.patch",
    pkg: "apps/timer-web",
    tests: ["test/sync/notice-message.test.ts"],
    note:
      "#276 の呼び名プールの統一（labelPool・敵対的レビュー #276 指摘1）で label() 周辺に" +
      "行が足されて当たらなくなったので当て直した。反転する条件式" +
      "（`participantId === ctx.selfParticipantId` → `!==`）自体は元のパッチと一字一句同じで、" +
      "作る欠陥（実行者が自分なのに「あなた」と出ない／他人なのに「あなた」と出る）も変わらない。",
  },
  {
    id: 10,
    label: "createRefEncoder.room が相関 ID ではなくルームコードをそのまま返す",
    patch: "m10-ref-encoder-passthrough.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/log/ref-encoder.test.ts", "test/log/reclaim-log.test.ts"],
    note:
      "資格情報がログへ戻る欠陥の型。ADR 0012 D2 の「部分表示も生の値も出さない」" +
      "という決定がテストで固定されていることを確かめる。",
  },
  {
    id: 11,
    label: "IPv6 の /64 丸めを無効化（アドレス全体を鍵にする）",
    patch: "m11-ipv6-prefix-full-address.patch",
    pkg: "packages/rate-limit",
    tests: ["tests/client-key.test.ts"],
    note:
      "攻撃者が /64 内で送信元アドレスを回すだけでレート制限を回避できる欠陥。" +
      "client-key.test.ts の「下位 64 ビットが違っても同じ鍵になる」が検出する" +
      "（実測確認済み。同義表記の丸めを固定する他のテストも複数連鎖して落ちる）。",
  },
  {
    id: 12,
    label: "レート制限の判定をルーム照会の後ろへ移す",
    patch: "m12-rate-limit-check-after-lookup.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/join-rate-limit.test.ts", "test/live-ws.rate-limit.test.ts"],
    note:
      "残量が無いときに ROOM_NOT_FOUND が返り、トークンを消費せずに存在確認を" +
      "続けられる欠陥。設計正本 D3 が API を分けている理由そのもの。" +
      "in-process（join-rate-limit）と実 WS（live-ws.rate-limit）の両方で検出することを" +
      "実測で確認済み（設計正本 6.2 は実 WS を指定している）。",
  },
  {
    id: 13,
    label: "WS アダプタの鍵導出が X-Real-IP を（X-Forwarded-For より優先して）読む",
    patch: "m13-adapter-reads-x-real-ip.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/fail-closed.test.ts", "test/live-ws.rate-limit.test.ts"],
    note:
      "最終レビュー W-1。X-Real-IP は攻撃者が自由に付けられるヘッダ（Caddy は除去・" +
      "上書きしない）。接続のたびに値を変えるだけで毎回まっさらな鍵になり、#103 が" +
      "塞いだ「再接続でリセット」が復活する欠陥。poker 側にも同型のテストを足したが、" +
      "mutation-check の対象は timer 側の 1 件のみとした（W-1 の指示どおり）。",
  },
  {
    id: 14,
    label: "audit-domain-side-effects の FORBIDDEN から Math.random( を落とす",
    patch: "m14-forbidden-drop-math-random.patch",
    pkg: "scripts",
    tests: ["audit-domain-side-effects.test.mjs"],
    note:
      "検査の射程を「赤を消す最短経路」で狭める欠陥の型（#174）。検査本体だけを狭めても " +
      "audit-domain-side-effects.test.mjs の REQUIRED_FORBIDDEN が落ちる、という " +
      "同ファイルの docstring の主張を実際に確かめる。scripts/ は package.json を " +
      "持たないため、以前は detectRunner が例外で落ちてこの型を検査できなかった。",
  },
  {
    id: 16,
    label: "indicatesStaleRoom から room 配下の経路の判定を落とす",
    patch: "m16-stale-frame-room-prefix.patch",
    pkg: "apps/timer-web",
    tests: ["test/sync/stale-frame.test.ts"],
    note:
      "#209 で新設した判定。plan.md の対応表より後に書いたので、そちらには載っていない。" +
      "落とすと壊れた snapshot（room.config.members.0）が「画面を古くしない」側へ回り、" +
      "利用者への表出そのものが消える。",
  },
  {
    id: 17,
    label: "handleRoom から syncStale の解除を落とす",
    patch: "m17-sync-stale-never-cleared.patch",
    pkg: "apps/timer-web",
    tests: ["test/sync/use-timer-sync.test.tsx"],
    note:
      "#209 で新設した解除点。plan.md の対応表より後に書いたので、そちらには載っていない。" +
      "落とすと「同期できていません」が一度立ったきり二度と下りない。" +
      "**立てる側だけを変異させても、この欠陥は捕まらない。**",
  },
  {
    id: 18,
    label: "捨てたときに syncStale を立てるのをやめる",
    patch: "m18-poker-stale-never-raised.patch",
    pkg: "apps/poker-web",
    tests: ["tests/sync-stale-notice.test.tsx"],
    note:
      "#212 で新設した表出の起点。plan.md の対応表より後に書いたので、そちらには載っていない。" +
      "落とすと #212 以前へ戻る（捨てるが黙る）。**devtools の記録だけが残るので、" +
      "console を見ている開発者には気づけて利用者には気づけない**という、" +
      "本 Issue が塞いだ状態そのものになる。",
  },
  {
    id: 19,
    label: "有効なフレームを受け取ったときの syncStale の解除を落とす",
    patch: "m19-poker-stale-never-cleared.patch",
    pkg: "apps/poker-web",
    tests: ["tests/sync-stale-notice.test.tsx"],
    note:
      "#212 で新設した解除点。plan.md の対応表より後に書いたので、そちらには載っていない。" +
      "落とすと「同期できていません」が一度立ったきり二度と下りない。" +
      "**立てる側だけを変異させても、この欠陥は捕まらない。**",
  },
  {
    id: 15,
    label: "list-scan-targets から死んだ除外の検知を削る",
    patch: "m15-dead-exclusion-detection-removed.patch",
    pkg: "scripts",
    tests: ["list-scan-targets.test.mjs"],
    note:
      "「除外が 1 件も一致しなくなったら落とす」（#135・ADR-0014 決定 2）が静かに " +
      "消える欠陥の型。除外は本番の宣言では空なので、この検知が消えても走査結果は " +
      "1 バイトも変わらない。落ちるのは単体テストだけであり、そのテストが本当に " +
      "恒真化していないことをここで見る。",
  },
  {
    id: 20,
    label: "audit-supply-chain-config から「版を持たない除外」の検出を削る",
    patch: "m20-versionless-exclusion-undetected.patch",
    pkg: "scripts",
    tests: ["audit-supply-chain-config.test.mjs"],
    note:
      "#135 経路⑤そのもの。除外エントリが `名前@版` から `名前` へ退化すると、以後その " +
      "パッケージの全版が降格検査の対象外になる。pnpm から見れば「より広い除外」として " +
      "正常に動作し、警告も出ない。**本番の宣言は正しい書式なので、この検出が消えても " +
      "検査結果は 1 バイトも変わらない**（id 15 と同じ型）。落ちるのは単体テストだけであり、" +
      "そのテストが恒真化していないことをここで見る。",
  },
  {
    id: 21,
    label: "install-with-supply-chain-check の証跡判定を「常に見つかった」にする",
    patch: "m21-verification-evidence-always-found.patch",
    pkg: "scripts",
    tests: ["install-with-supply-chain-check.test.mjs"],
    note:
      "#135 経路⑫。供給網ポリシーの検証は 2 段の短絡（optimisticRepeatInstall / " +
      "検証キャッシュ）で無警告のまま走らなくなる。証跡の判定が甘くなると、CI は " +
      "install が成功しただけで緑を出し、minimumReleaseAge と trustPolicy の再適用が " +
      "止まったことに誰も気づけない。**CI では現に検証が走っているので、この判定を " +
      "壊しても CI の色は変わらない**。落ちるのは単体テストだけである。",
  },
  {
    id: 22,
    label: "audit-plan-gate から原則の突き合わせを外す（見出しの有無だけを見る）",
    patch: "m22-plan-gate-principles-unchecked.patch",
    pkg: "scripts",
    tests: ["audit-plan-gate.test.mjs"],
    note:
      "#135 経路⑨。ゲートの検査が「節があるか」だけになると、**空の節を置けば通る** —— " +
      "塞ごうとしている「節はあるが実質が無い」をそのまま再生産する（対策が自分の塞ぐ " +
      "欠陥を持つ型）。**要求対象は現在 0 件なので、この判定を外しても検査結果は " +
      "1 バイトも変わらない**（id 15・20 と同じ型）。落ちるのは単体テストだけであり、" +
      "そのテストが恒真化していないことをここで見る。",
  },
  {
    id: 23,
    label: "audit-log-hygiene の走査対象から .tsx を落とす",
    patch: "m23-log-hygiene-drops-tsx.patch",
    pkg: "scripts",
    tests: ["audit-log-hygiene.test.mjs"],
    note:
      "#157 で広げた射程を、赤を消す最短経路で狭める欠陥の型（#174 と同じ）。" +
      "**この変異は検査本体も赤にする** —— ALLOWED_FILES に載せた History.tsx が " +
      "走査結果から消え、findStaleAllowances が「陳腐化した許可」として落とすためである。" +
      "ここで見たいのはそちらではなく、**拡張子を主張する単体テストが恒真化していないこと**。" +
      "宣言を切り出す前は、収集から .tsx を落としても自己テストは緑のままだった。",
  },
  {
    id: 24,
    label: "shouldAutoReveal から「接続中が 0 人なら立たない」の番人を外す",
    patch: "m24-should-auto-reveal-empty-roster.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note:
      "#95 S4a で名簿を poker-core の外へ出し、`shouldAutoReveal` は在室者を**引数で**" +
      "受け取るようになった（設計正本 §6.4）。`every` は空集合で真になるので、" +
      "`connected.length > 0` の番人が無いと**名簿を渡し忘れた／空の名簿しか渡さない**" +
      "呼び出しが全部『全員投票済み』になる。番人そのものを外すのがこの変異で、" +
      "殺す 1 本は「接続中が 0 人なら自動公開しない」である。" +
      "**番人が無い実装でも、空でない名簿しか渡さないテストは全部緑のまま通る** —— " +
      "この変異は、その恒真化を殺す 1 本が実在することだけを見る。",
  },
  {
    id: 25,
    label: "ドライバーの適格判定を presence へ戻す（timer の在席を見なくする）",
    patch: "m25-ineligible-by-presence.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/presence-model.test.ts"],
    note:
      "#95 S4b（D21）。S4a までは `presence === \"online\"` が「timer を見ている」と" +
      "同義だった（参加者が持てる接続が timer のものだけだったため）。多接続模型では" +
      "**ハブや poker のタブが生きている人も online** なので、この変異は" +
      "「タイマーを見ていない人にドライバーが回る」を作る。" +
      "**S4a のテストでは殺せない変異である** —— 殺すには「online だが timer に" +
      "在席していない参加者」を作るテストが要る（設計正本 §6.2 が R14 に要求した形）。",
  },
  {
    id: 27,
    label: "timer の参加者一覧から在席の絞り込みを外す（選択画面に居る人が出る）",
    patch: "m27-timer-roster-not-filtered.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/timer-snapshot-dto.test.ts"],
    note:
      "#95 S5a（R5 / R6）。選択画面へ戻った人が timer の一覧に残り続ける欠陥。" +
      "**名簿からは消えないので、サーバーの状態を見ても気づけない** —— wire の形だけが違う。" +
      "#91 PR 3 で直前の行（AI の鍵を持つ人の集合）が消えたので、同じ壊し方で作り直した。",
  },
  {
    id: 28,
    label: "ハブへの配信先を timer の接続へすり替える（選択画面が更新されない）",
    patch: "m28-hub-broadcast-to-timer.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.hub.test.ts"],
    note:
      "#95 S5a（R3）。名簿が変わっても選択画面に届かない欠陥。" +
      "**timer は正しく動き続ける**ので、ハブの実 WS テストでしか捕まらない。",
  },
  {
    id: 29,
    label: "参加の合言葉の照合を落とす（保護ルームの名簿が読める）",
    patch: "m29-join-skips-passphrase.patch",
    pkg: "apps/tasuki-sync",
    tests: [
      "test/live-ws.hub.test.ts",
      "test/passphrase.test.ts",
      "test/live-ws.tool-entry.test.ts",
    ],
    note:
      "#95 S5a で timer とハブが守りを共有し、**S5b で poker も同じ関門を通る**ように" +
      "なった（`room-entry.ts`。入口の門の置き換え）。照合そのものを落とす。" +
      "S4a では同型の欠陥（合言葉を通さずに保護ルームの snapshot が読めた）が実機で出ている。",
  },
  {
    id: 33,
    label: "poker の参加者一覧から在席の絞り込みを外す（選択画面に居る人が切断中として出る）",
    patch: "m33-poker-roster-not-filtered.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.tool-entry.test.ts"],
    note:
      "#95 S5b（R5）。timer 側の m27 と対になる。**実画面で見つけた欠陥である** ——" +
      "1 つのルームが両ツールを持つようになり、選択画面に居るだけの人が poker の一覧に" +
      "「切断中」として並んだ。接続は生きているので事実に反する。",
  },
  {
    id: 30,
    label: "poker のラウンドを遅延生成しない（選択画面から poker へ入れない）",
    patch: "m30-poker-round-not-lazily-created.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.tool-entry.test.ts"],
    note:
      "#95 S5b（D8）。ハブで作ったルームはラウンドを持たないので、遅延生成が無いと" +
      "**選択画面から poker を選んだ人が「ルームが見つかりません」に落ちる**。" +
      "poker の既存テストは自分で作ったルームしか見ないので、この欠陥を捕まえない。",
  },
  {
    id: 31,
    label: "timer の状態を遅延生成しない（poker で作ったルームへ timer から入れない）",
    patch: "m31-timer-state-not-lazily-created.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.tool-entry.test.ts"],
    note:
      "#95 S5b（D8）。m30 の裏返し。**片方だけ遅延生成にしても気づけない**ので、" +
      "両方向に変異を置く。",
  },
  {
    id: 32,
    label: "退出しても票を捨てない（名簿に居ない人の票が集計に混ざる）",
    patch: "m32-discard-vote-noop.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.tool-entry.test.ts"],
    note:
      "#95 S5b（R8）。S4a では到達経路が無く実装ごと落としていた。1 つのルームが" +
      "両ツールを持てるようになって経路が生まれたので、呼び出し元ごと戻した。" +
      "**`packages/poker-core` を変異させ、配線側のテストで殺す**（純関数のテストだけだと" +
      "呼び出し元が外れても緑のまま）。",
  },
  {
    id: 26,
    label: "attachConnection が前の接続を奪う（1 本模型へ戻す）",
    patch: "m26-attach-steals-connection.patch",
    pkg: "packages/room-core",
    tests: ["tests/room.test.ts"],
    note:
      "#95 S4b（D14・R17）。後から繋いだタブが前のタブの接続を名簿から追い出すので、" +
      "配信の宛先（`connectionsIn`）から前のタブが消え、その画面は以後 1 通も更新を" +
      "受け取らない（黙って古くなる）。復帰の組を localStorage へ置いた D12 によって" +
      "「選択画面とツールを別タブ」が現実的な経路になったため、実害のある変異である。",
  },
  {
    id: 34,
    label: "?view=history でも room.join を送る（判定の正本を decideEntry から外す）",
    patch: "m34-history-view-joins-room.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.entry.test.tsx"],
    note:
      "#95 S5c（#249）。**レビューで実際に見つかった欠陥である。** 入口の判定を " +
      "`decideEntry` 1 つに寄せる前は、ここが独自に `?room=` だけを見ていた。" +
      "選択画面の「記録を見る」は `?view=history&room=CODE` を作り、開く人は必ず " +
      "そのルームの復帰の組を持っているので、**記録を見るだけのつもりの人が " +
      "`room.join` を送り、他の参加者の名簿に現れた**（在席は接続に紐づく・#95 S4b）。" +
      "変異は当時の実装そのもので、`?view=` が無い経路は変えない —— " +
      "**対照（`?room=` だけなら送る）を持つテストでしか殺せない**。",
  },
  {
    id: 35,
    label: "「新しいセッション」でルームをロビーへ戻さない（phase.set を送らない）",
    patch: "m35-new-session-keeps-celebration.patch",
    pkg: "apps/timer-web",
    tests: ["test/sync/use-timer-sync.test.tsx"],
    note:
      "#95 S5c（C-1）。**実画面で見つけた欠陥である。** 玄関へ送るだけで `celebration` を " +
      "残すと、同じルームへ戻った人は timer を開くたび完了画面に着き、往復のたびに " +
      "端末の完了記録が増え続ける。**poker は使えるのに timer だけ死んだルーム**になる。" +
      "遷移（`redirectTo`）は残すので、**行き先だけを見るテストでは捕まらない** —— " +
      "送るコマンドを見て初めて殺せる。",
  },
  {
    id: 36,
    label: "接続 URL の ?tool= を無視して常に timer の層へ流す",
    patch: "m36-tool-query-always-timer.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/ws-adapter-tool-query.test.ts"],
    note:
      "#95 S5c（#249）。入口を `/ws` の 1 本に畳んだので、**経路ではツールを決められない**。" +
      "振り分けの根拠はクエリだけになった。無視すると poker のコマンドが timer の " +
      "メッセージ層へ落ち、**繋がるのにコマンドが通らない**という静かな壊れ方をする。" +
      "`?tool=` 無し（ハブ）は変えないので、**ハブの接続を見るテストでは緑のまま**である。" +
      "#590 で一覧から導く形に作り直した。",
  },
  {
    id: 37,
    label: "旧リンク（/poker/room/<id>）の誘導先からルームコードを落とす",
    patch: "m37-poker-legacy-path-drops-code.patch",
    pkg: "apps/poker-web",
    tests: ["tests/router.test.ts"],
    note:
      "#95 S5c（R9）。旧入口を撤去して玄関へ送るようにしたが、**コードを落とすと " +
      "ブックマークから来た人が入りたかったルームを失う**。玄関そのものは開くので、" +
      "**「玄関へ送る」ことだけを見るテストは素通りする**。",
  },
  {
    id: 38,
    label: "ルームコードが無くても玄関へ送り返さない（空のコードでルーム扱いにする）",
    patch: "m38-entry-without-code-stays.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/entry.test.ts"],
    note:
      "#95 S5c（R9）。旧入口（`Setup` / `Join`）を撤去した以上、**ルームコードを伴わない " +
      "URL には行き先が無い**。送り返さないと、空のコードのまま入室しようとして " +
      "**名乗る場所の無い画面に取り残される**（撤去前はそこに `Setup` が居た）。" +
      "この段の前提そのものなので、退化を無言で許さないように置く。",
  },
  // id 39・40（「新しいセッション」でロビーへ戻るときに前のお題を落とす規則を壊す。#273）は
  // #91 PR 3 で削除した。お題は timer のルームの状態ではなくなり、落とす規則ごと廃止した
  // （spec T11。お題は掲げた人が下ろすまで残る）。番号は詰めない。
  {
    id: 41,
    label: "seatSkipReason から一時離脱の優先を削る",
    patch: "m41-seat-skip-reason-ignores-standdown.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/timer-snapshot-dto.test.ts"],
    note:
      "#276 D3。一時離脱（entry.eligible === false）は在席より先に見る。" +
      "削ると、timer に在席したまま一時離脱している人の理由が null（番が回る）に" +
      "化けるか、away/disconnected という別の理由に化ける。" +
      "**画面が言う理由とサーバーの判断がずれる**という #276 そのものの欠陥。",
  },
  {
    id: 42,
    label: "snapshot の nextIndex を (currentIndex + 1) % len へ戻す",
    patch: "m42-next-index-naive.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/timer-snapshot-dto.test.ts", "test/handlers.driver-advance.test.ts"],
    note:
      "#276 が直した欠陥そのもの。飛ばされる席を数に入れるため、画面が出す「次」と" +
      "実際の交代先が食い違う。殺せないなら、直したことの証拠が無い。",
  },
  // id 43〜47（お題の生成の帳簿 `ProblemDelegator` と `pickFallback` を壊す。#283）は
  // #91 PR 3 で削除した。`problem-delegation.ts` と timer-core の `problem.ts` が実装ごと消えた
  // （お題の生成はお題ツールの `TopicGenerator` が担う。そちらは m80 などが守る）。番号は詰めない。
  {
    id: 60,
    label: "room.join の答えを待つ期限を張らない（無言で永久に待つ状態へ戻る）",
    patch: "m60-join-deadline-never-armed.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx"],
    note:
      "#292。**対応表より後に足した変異。** 入口の effect が `room.join` を送った直後の" +
      "期限を張らなくなる。切断ならバナーが出るが、**繋がっているのに答えが返らない場合は" +
      "「読み込んでいます…」だけが永久に出続ける** —— #292 が塞いだ欠陥そのものである。",
  },
  {
    id: 61,
    label: "混雑で入室を拒まれたときに期限を畳まない（待てば入れる人を無応答と断じる）",
    patch: "m61-join-deadline-survives-rate-limit.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx"],
    note:
      "#292。**対応表より後に足した変異。** `JOIN_RATE_LIMITED` は「待てば入れる」経路で、" +
      "#147 の待ちは回を追うごとに倍になり最大 30 秒＋ばらつき。**期限（10 秒）を必ず追い越す。**" +
      "⚠ **1 回目の拒否だけでは検出できない** —— 入り直しの送信が期限を張り直してしまうため、" +
      "検出には**待ちが期限を追い越す回**まで進める必要がある（テスト側の注記を参照）。",
  },
  {
    id: 62,
    label: "退出が成立したときに期限を畳まない（去った後に行き止まりが出る）",
    patch: "m62-join-deadline-survives-leave.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx"],
    note:
      "#292。**対応表より後に足した変異。** `leave-room` は `mode` を `null` に戻すので、" +
      "玄関へ遷移し終えるまでの間この受け皿が出る。畳まないと、抜けたはずの人が最後に" +
      "「ルームの情報を読み込めませんでした」を見る（`cancelJoinRetry` が #147 で塞いだのと同じ型）。",
  },
  {
    id: 63,
    label: "待っている間の接続状態を Loading から落とす（読み込み中に接続が読めなくなる）",
    patch: "m63-loading-hides-connection-state.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx", "test/ui/Loading.test.tsx"],
    note:
      "#292 EARS 2。**対応表より後に足した変異。** `StatusStrip` は `mode !== null` の" +
      "ときしか描かれないので、ここを落とすと**ルームの画面が決まる前は接続状態を読む場所が" +
      "どこにも無くなる**。切断と無応答の区別が付かなくなるのが実害である。",
  },
  {
    id: 64,
    label: "snapshot が届いても期限のタイマーを畳まない（印が立ったまま残る）",
    patch: "m64-join-deadline-survives-snapshot.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx"],
    note:
      "#292。**対応表より後に足した変異。** ⚠ **画面には何も出ない** —— ルームの画面が" +
      "決まった後は `Loading` が描かれないので、印が立っても誰の目にも触れない。" +
      "「表示が出ないこと」を見るアサーションでは**畳んでも畳まなくても緑になる**ため、" +
      "検出しているのは残っているタイマーの数そのものを測るテストである。",
  },
  {
    id: 65,
    label: "混雑の入り直しを使い切っても待ち続ける（諦めのバナーの下で読み込み中が残る）",
    patch: "m65-join-retry-exhausted-keeps-waiting.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx"],
    note:
      "#292 のレビュー。使い切りの枝は**送信せずに `return` する**ので、" +
      "期限を張り直す相手が居ない。印を立てないと、諦めのバナー（`autoDismiss: false`）の下で" +
      "本文が「読み込んでいます…」と言い続け、**次にできることが出ない**。" +
      "⚠ 期限の発火を待つ形では直らない —— **張られていないものは切れない。**",
  },
  {
    id: 66,
    label: "接続状態の初期値を online へ戻す（繋がる前から接続中と断言する）",
    patch: "m66-conn-state-starts-online.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx"],
    note:
      "#292 のレビュー。`SyncConnection` が通知するのは `onopen` と `onclose` だけで、" +
      "**確立前は何も来ない**。ソケットが `CONNECTING` のまま滞留する状況（中間装置が " +
      "SYN を落とす・キャプティブポータル）で、行き止まりの横に「接続中」が並ぶ —— " +
      "接続状態を読める場所を足した目的と逆向きになる。",
  },
  {
    id: 67,
    label: "再読み込みを置き換え遷移で代用する（# を持つ URL で効かない）",
    patch: "m67-reload-via-replace.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx"],
    note:
      "#292 のレビュー。`location.replace()` はフラグメントだけが違う URL への遷移を" +
      "**同一文書内のスクロール**として扱うため、`#` があると再読み込みが起きない。" +
      "いま timer に `#` を作る経路は無いが、**行き止まりの唯一の主操作がこの一行に乗る。**",
  },
  {
    id: 68,
    label: "入り直しの時刻に復帰の組が無くても待ち続ける（送れないまま読み込み中が残る）",
    patch: "m68-resume-missing-keeps-waiting.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx"],
    note:
      "#292 のレビュー。m65 と同じ穴のもう 1 つの枝。**別タブが同じルームの復帰の組を" +
      "捨てた場合**（鍵は `localStorage`・ルームコード別）に成立し、送信が無いので" +
      "期限も張られない。2 つの枝を別の変異にしてあるのは、片方だけ直しても" +
      "もう片方が残るためである。",
  },
  {
    id: 69,
    label: "繰り上げの在席優先を潰す（presenceRank が常に同じ値を返す）",
    patch: "m69-pick-promotion-target-presence-rank-flat.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/pick-promotion-target.test.ts"],
    note:
      "#290・D2。`presenceRank` が在席・離席を区別しなくなると、joinedAt の早い順だけで" +
      "繰り上げ先が決まる。**先に参加した離席者が、後から来た在席者より優先される** —— " +
      "#276 が扱った「席は在るのに誰も居ない」状態を、繰り上げ自身が作り直すことになる。",
  },
  {
    id: 70,
    label: "玄関の departed 分岐を潰す（gone のとき常に 'gone' を返す）",
    patch: "m70-hub-departed-branch-flat.patch",
    pkg: "apps/landing",
    tests: ["tests/hub/hub-state.test.ts"],
    note:
      "#290・D4。`screenFor` が `departed` を見なくなると、`?left=`（自分の退出の結果" +
      "ルームが消えた）を持つ人にも死んだ招待 URL と同じ「不在の知らせ」が出る。" +
      "**自分で押した操作の結果なのに、何かが壊れたように読める画面へ落ちる。**",
  },
  {
    id: 71,
    label: "自分を引けないときの縮退で輪の先頭の席の名前を借りる",
    patch: "m71-self-name-borrows-first-seat.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.self-name.test.tsx"],
    note:
      "#294。#294 以前の縮退（当時の出所は `config.members[0]`。値は席の 0 番と同じ）へ" +
      "戻す変異。輪は並べ替えられるので、出るのは自分でも作成者でもない他人である。" +
      "**復帰トークンが拒まれてから新しい participantId が届くまでの窓**で実際に効く。",
  },
  // id 72（端末が完成記録の表示名を席ではなく名簿の並びから引く。#294）は #91 PR 3 で削除した。
  // 端末は完成記録を組み立てなくなり（Task 6）、サーバーが作った記録をそのまま保存する。
  // 同じ性質（記録の表示名は輪の順）を守る場所はサーバーへ移ったので、m109 が引き継ぐ。
  {
    id: 87,
    label: "玄関の whereLabel が ID ではなく並び順で名前を引く",
    patch: "m87-whereLabel-index-not-id.patch",
    pkg: "apps/landing",
    tests: ["tests/room-choice-layout.test.tsx"],
    note:
      "#91 PR 2。`whereLabel` が `TOOLS.find` によるツール ID 引きをやめ、" +
      "`['timer', 'poker']` という古い並び順の添字で名前を引くようになる。この表に" +
      "お題ツールは無いので `indexOf('topic')` が -1 になり、`TOOLS[-1]` は undefined で" +
      "名前の代わりに生の ID「topic」が出る（「Topic Board」と出ない）。",
  },
  {
    id: 88,
    label: "玄関の use-hub-sync.ts が topic フレームを検めずに捨てる",
    patch: "m88-hub-topic-frame-not-checked.patch",
    pkg: "apps/landing",
    tests: ["tests/hub/use-hub-sync.test.tsx"],
    note:
      "#91 PR 2・spec T3。`TopicFrameSchema` で見分ける分岐を消し、`topic` フレームを" +
      "ハブのスキーマにしか通さなくなる。ハブの契約に合わないので黙って捨てられ、" +
      "選択画面の「いまのお題」が一生更新されない。",
  },
  {
    id: 89,
    label: "お題ツールの操作可否が参加を見ない",
    patch: "m89-topic-web-operate-ignores-join.patch",
    pkg: "apps/topic-web",
    tests: ["tests/topic-room.test.tsx", "tests/topic-view.test.ts"],
    note:
      "#91 PR 2。`canOperate` が `joined` を見ず `status === 'open'` だけで決める。" +
      "**切断中だけを見るテストはこの変異で緑のまま残る**（切断で `joined` も下りるため、" +
      "参加の判定が壊れていても隠れる・検出力の検証で実測）。殺すのは" +
      "「繋ぎ直して参加の返事を待つ窓」を見るテストである —— `SyncConnection` は" +
      "入り直しの `room.join` より先に送信キューを流すため、参加前に押した操作は" +
      "`NOT_IN_ROOM` で拒まれ、利用者から見ると押したのに何も起きない。",
  },
  {
    id: 90,
    label: "お題ツールの下書きが届いたお題で上書きされる",
    patch: "m90-topic-editor-draft-overwritten.patch",
    pkg: "apps/topic-web",
    tests: ["tests/topic-room.test.tsx"],
    note:
      "#91 PR 2。`TopicEditor` に `current` が変わるたび下書きを上書きする `useEffect` を" +
      "足す。書いている途中に別の人がお題を変えると、打ちかけの下書きが黙って消える —— " +
      "コンポーネント冒頭のコメントが禁じている性質（「届いたお題で上書きしない」）そのもの。",
  },
  {
    id: 91,
    label: "GENERATION_COOLDOWN の文が書体の base 層から外れる字へ戻る",
    patch: "m91-generation-cooldown-kanji-reverts.patch",
    pkg: "apps/topic-web",
    tests: ["tests/copy-fits-font-base.test.ts"],
    note:
      "#91 PR 2。topic-core の `GENERATION_COOLDOWN` を「暫く待ってから、もう一度" +
      "作ってください。」へ変える。「暫」は書体の常用の層（base）の範囲に無い。元は「少し」だったが、" +
      "#406 で「少」を base 層に足したので、まだ範囲外の「暫」に替えた（2026-10-29）。" +
      "「しばらく」へ言い換えたのは計画を書く段の実測で「少」が外れていたためである" +
      "（global-constraints「実測で spec から外したこと」）。`packages/topic-core/" +
      "tests/error-messages.test.ts` も赤になるが、対応表に載せるのは書体の検査である" +
      "（「base 層に収める」を守っている本体はこちら）。",
  },
  {
    id: 92,
    label: "同期フックの onClose から cancelRetry() を外す",
    patch: "m92-use-topic-sync-onclose-skips-cancel-retry.patch",
    pkg: "apps/topic-web",
    tests: ["tests/use-topic-sync.test.tsx"],
    note:
      "#91 PR 2。混雑で入り直しの待ちが走っている途中に切れると、待っていたタイマーが" +
      "生き残ったまま繋ぎ直り、`onReconnected` の送信と合わせて `room.join` が 2 通" +
      "流れる（2 通目はサーバーが「コマンドの形式が不正です」で拒む）。",
  },
  {
    id: 93,
    label: "planForError が抜けた知らせを left ではなく show へ落とす",
    patch: "m93-join-error-plan-left-falls-to-show.patch",
    pkg: "apps/topic-web",
    // #94 PR 2 で規則を `@tasuki/sync-client` の `planForJoinError` へ寄せた（パッチの対象もそちら）。
    // 単体は sync-client のテストが持ち、ここでは利用側の同期フックの配線で見る。
    tests: ["tests/use-topic-sync.test.tsx"],
    note:
      "#91 PR 2。`LEFT_ROOM` / `REMOVED_FROM_ROOM` / `REMOVED_BY_HOST` の 2 行を消す。" +
      "抜けた・外された知らせが、玄関へ理由つきで戻す `left` ではなく「その場でサーバーの" +
      "文を伝える」`show` へ落ちる。本人は玄関へ戻らず、お題の画面にエラー文だけが" +
      "出た状態に取り残される。",
  },
  // id 94・95（topic-web・timer-web の Markdown の写しを行区切りで止まらなくする）は #91 PR 3 で
  // 削除した。解析は `@tasuki/markdown` の 1 か所へ移り、両アプリの写しは消えた。m107 が引き継ぐ。
  {
    id: 96,
    label: "お題の配信先から timer を落とす",
    patch: "m96-topic-broadcast-drops-timer.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.topic.test.ts"],
    note:
      "#91 PR 3・spec T3・E2。`TOPIC_RECIPIENT_TOOLS` から `TOOL_TIMER` を落とす。" +
      "timer を開いている人には、お題の掲げ直しも取り下げも届かなくなる" +
      "（参加の直後の 1 通だけが届き、そのあと古いお題を読み続ける）。" +
      "#590 で一覧から導く形に作り直した。",
  },
  {
    id: 97,
    label: "お題を掲げて完了したときだけ完成記録を作る",
    patch: "m97-record-only-with-topic.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/handlers.lifecycle.test.ts"],
    note:
      "#91 PR 3・spec T9・E17。`SessionCompleted` で `event.topicTitle === null` なら記録を作らずに" +
      "celebration へ移す。お題なしが既定なので、大半のセッションで完成記録が消える" +
      "（#273 の欠陥の拡大版）。",
  },
  {
    id: 98,
    label: "timer の参加でいまのお題を送らない",
    patch: "m98-timer-join-skips-topic.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.topic.test.ts"],
    note:
      "#91 PR 3・E4。timer の `room.join`（`command-handlers/room-join.ts`）から" +
      "`topicBroadcaster.sendCurrent` を消す。後から timer を開いた人・再読込した人は、" +
      "次にお題が掲げ直されるまで、いま掲げられているお題を読めない。",
  },
  {
    id: 99,
    label: "timer-web の dispatch がお題のフレームを先に見分けない",
    patch: "m99-timer-dispatch-drops-topic-frame.patch",
    pkg: "apps/timer-web",
    tests: ["test/sync/dispatch.test.ts"],
    note:
      "#91 PR 3・spec §5.5・E15。`TopicFrameSchema` で先に見分ける分岐を消す。`topic` フレームが" +
      "timer の契約で落ち、お題が画面に出ないうえ、届くたびに「同期できていません」（#209）が立つ。",
  },
  {
    id: 100,
    label: "poker-web の useSync がお題のフレームを先に見分けない",
    patch: "m100-poker-sync-drops-topic-frame.patch",
    pkg: "apps/poker-web",
    tests: ["tests/topic-sync.test.tsx"],
    note:
      "#91 PR 3・spec §5.5・E15。`TopicFrameSchema` で先に見分ける分岐を消す。`topic` フレームが" +
      "poker の契約で落ち、お題が画面に出ないうえ、届くたびに #212 の告知（同期できていません）が立つ。",
  },
  {
    id: 101,
    label: "端末の旧い記録の problemTitle を読まない",
    patch: "m101-stored-record-ignores-problem-title.patch",
    pkg: "apps/timer-web",
    tests: ["test/records/stored-record.test.ts"],
    note:
      "#91 PR 3・E18。`normalizeStoredRecord` が旧い記録の `problemTitle` を読まず null にする。" +
      "#91 PR 3 より前に端末へ保存した記録が、履歴ですべて「お題なし」に化ける" +
      "（端末の記録には他所に写しが無いので取り返せない）。",
  },
  {
    id: 102,
    label: "履歴の削除ボタンの名前から完了日時を落とす",
    patch: "m102-history-delete-name-without-date.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/History.test.tsx"],
    note:
      "#91 PR 3・E23。お題なしが既定になったので「お題なし」の記録が並びやすく、" +
      "支援技術からどの記録の削除ボタンかを区別できなくなる。",
  },
  {
    id: 103,
    label: "完了へ入ったとき、記録が増えたかを見ずに保存する",
    patch: "m103-intents-persist-without-new-record.patch",
    pkg: "apps/timer-web",
    tests: ["test/sync/snapshot-intents.test.ts"],
    note:
      "#91 PR 3（Task 6）・E17。記録が 1 件でもあれば末尾を保存して「完成」と出す。" +
      "別の人が中断した回でも、押していない端末は前の回の記録をもう一度保存し、" +
      "画面は「完成」と言う（終わり方は記録が増えたかでしか分からない）。",
  },
  {
    id: 104,
    label: "前の snapshot が無くても完了の判定をする",
    patch: "m104-intents-decide-without-prev.patch",
    pkg: "apps/timer-web",
    tests: ["test/sync/snapshot-intents.test.ts"],
    note:
      "#91 PR 3（Task 6）・spec §10。比べる相手が無いのに「前は 0 件」とみなす。" +
      "再読込や完了の後に入ってきた端末が、その回に居なかった人の端末にも記録を保存し、" +
      "終わり方を決めてしまう。",
  },
  {
    id: 105,
    label: "完了の topicTitle をお題の保管から埋めない（常に null）",
    patch: "m105-complete-skips-topic-title.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/handlers.lifecycle.test.ts"],
    note:
      "#91 PR 3・spec T9・E17。`handleRoomCommand` で `session.complete` の `topicTitle` を埋める" +
      "3 行を消す。お題を掲げて完了しても、完成記録はすべて「お題なし」になる。",
  },
  {
    id: 106,
    label: "@tasuki/markdown のリンクの表示と URL の上限を外す",
    patch: "m106-markdown-link-unbounded.patch",
    pkg: "packages/markdown",
    tests: ["tests/performance.test.ts"],
    note:
      "#91 PR 3・spec §5.4（PR #311 の申し送り）。`INLINE_RE` の `{0,200}` / `{0,2000}` を `*` に戻す。" +
      "`[` を並べた本文の解析が O(N²) になる（20 万字で手元約 23 秒・上限 7 秒）。本文はサーバーが長さしか" +
      "見ずに配るので、そのルームでお題を表示する全員のタブが固まる。",
  },
  {
    id: 107,
    label: "@tasuki/markdown の改行の正規化から U+2028 / U+2029 を外し、前進の保証を消す",
    patch: "m107-markdown-line-separator.patch",
    pkg: "packages/markdown",
    tests: ["tests/blocks.test.ts"],
    note:
      "#91 PR 3・spec §5.4。m94 / m95 の引き継ぎ。**m94 / m95 と違い、無限ループにはならない**" +
      "（実測。ワーカーのメモリ切れではなくアサーションで落ち、手元で数秒）。`@tasuki/markdown` は" +
      "見出しの判定と段落の停止条件が同じ `HEADING_RE` を使うので両者が食い違わず、前進の保証は" +
      "いま到達しない（保証だけを外す変異は等価）。殺すのは「行区切りを改行と同じに扱う」ことを" +
      "見る等値のアサーションで、行区切りを含む本文が 1 行の段落として解析されるため赤になる。",
  },
  {
    id: 108,
    label: "ハブの room.join が二重参加を拒まない",
    patch: "m108-hub-join-allows-double.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.hub.test.ts"],
    note:
      "#91 PR 3（Task 5 のレビュー）。`hub-handlers.ts` の `room.join` から `isInAnyRoom` による" +
      "拒否を外す。1 本のハブ接続が 2 つのルームの名簿に載り（同じルームなら人数が増え）、" +
      "お題の配信先と在席の数え上げがずれる。",
  },
  {
    id: 109,
    label: "サーバーの完成記録の表示名を輪ではなく名簿の並びから引く",
    patch: "m109-record-names-from-roster-order.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/handlers.lifecycle.test.ts"],
    note:
      "#294 → #91 PR 3（Task 6）。m72 の引き継ぎ（端末が記録を組み立てなくなり、性質の住所が" +
      "サーバーへ移った）。記録の `members` は `driverCounts` と添字で対になって描かれる" +
      "（timer-web の `ui/Summary.tsx`）ので、**別人の回数が別人の名前の横に並ぶ**。" +
      "名簿は輪の外の人も含み、代理を含まないので長さも合わない。",
  },
  {
    id: 110,
    label: "ハブの room.create が二重参加を拒まない",
    patch: "m110-hub-create-allows-double.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.hub.test.ts"],
    note:
      "#91 PR 3（Task 5 のレビュー）。m108 の片割れ。既にルームに居るハブ接続が新しいルームを" +
      "作れてしまい、1 本の接続が 2 つのルームの名簿に載る。1 本の変異で両方を外すと" +
      "片方のテストだけで殺せてしまうので、入口ごとに分けた。",
  },
  {
    id: 111,
    label: "audit-ui-components の型の照合で大文字小文字を区別する",
    patch: "m111-ui-components-type-case-sensitive.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note:
      "#320 PR 1・設計正本 D10 の 1。HTML の型名は大文字小文字を区別しないので、`SELECT {}` と書けば" +
      "写しが検査を素通りする（#280 の検査が大文字を見逃したのと同じ型）。",
  },
  {
    id: 112,
    label: "audit-ui-components が何も免除していない ui-exempt: を見逃す",
    patch: "m112-ui-components-dead-exempt-ignored.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note:
      "#320 PR 1・設計正本 D9。写しを直したのに申告だけが残り、`git grep ui-exempt` の台帳が" +
      "「外れている箇所」について嘘をつく。",
  },
  {
    id: 113,
    label: "audit-ui-components が var() の第 2 引数の生の色を隠す",
    patch: "m113-ui-components-var-fallback-hidden.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note:
      "#320 PR 1・設計正本 D10 の 3。カスタムプロパティの名前を消す代わりに `var()` ごと消すと、" +
      "`var(--a, #fff)` の `#fff` が見えなくなる。赤を消す最短の書き方がそのまま穴になる型。",
  },
  {
    id: 114,
    label: "audit-ui-components が画面の CSS の生の色を見逃す",
    patch: "m114-ui-components-screen-raw-colors-ignored.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note:
      "#320 PR 5・設計正本 D10 の 3。画面の CSS の通常の規則から生の色の判定を外す。@keyframes の段と" +
      "部品の CSS の側は落とし続けるので、画面の通常の規則の族だけが赤になる。",
  },
  {
    id: 115,
    label: "audit-timer-classes が className の置換を見逃す",
    patch: "m115-timer-classes-template-accepted.patch",
    pkg: "scripts",
    tests: ["audit-timer-classes.test.mjs"],
    note:
      "#321 PR 1・設計正本 D1。`${tone}` のような置換を許すと、クラス名を組み立てる書き方が戻り、" +
      "取り残したクラスを字面で数えられなくなる。",
  },
  {
    id: 118,
    label: "design-tokens.test の ALLOW に使われない項目が残る",
    patch: "m118-design-tokens-unused-allow.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/design-tokens.test.ts"],
    note:
      "#321 PR 1・設計正本 D10。生の色を直した後に例外だけが残ると、同じ場所に生の色を書き戻しても通る。",
  },
  {
    id: 119,
    label: "audit-timer-classes が timer の CSS にも部品層にも定義の無いクラス名を見逃す",
    patch: "m119-timer-classes-undefined-class-accepted.patch",
    pkg: "scripts",
    tests: ["audit-timer-classes.test.mjs"],
    note:
      "#321 PR 1・設計正本 D1・計画 P8。字面のクラス名が timer の CSS にも部品層にも無くても落とさない。" +
      "定義の無いクラス名（打ち間違い・消した CSS の取り残し）が黙って通る。Tailwind のクラスはどちらにも定義されないので、書き戻したときもここで落ちる。",
  },
  {
    id: 120,
    label: "audit-supply-chain-config が Renovate の脆弱性の PR の待機期間を見ない",
    patch: "m120-renovate-vulnerability-age-unchecked.patch",
    pkg: "scripts",
    tests: ["audit-supply-chain-config.test.mjs"],
    note:
      "#334・docs/adr/0024。Renovate の既定は vulnerabilityAlerts.minimumReleaseAge: null で、" +
      "書かなければ脆弱性の PR だけが待機期間を素通りする。本番の renovate.json は正しく書いてあるので、" +
      "この検出が消えても検査結果は変わらない（id 20 と同じ型）。",
  },
  {
    id: 121,
    label: "audit-ui-components が @media の幅の境目の値を見ない",
    patch: "m121-ui-components-media-width-any-length.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: "#316 PR 1・ADR 0025 決定 1。48rem・px・em の境目が黙って通り、段の約束が崩れる。",
  },
  {
    id: 122,
    label: "audit-ui-components が幅の旧構文（min-width / max-width）を値だけで見る",
    patch: "m122-ui-components-media-legacy-syntax-accepted.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: "#316 PR 1。値が段（40rem）なら旧構文が通る。書き方が 2 つになり、目で突き合わせられなくなる。",
  },
  {
    id: 123,
    label: "audit-ui-components が TSX の要素層の .page を見ない",
    patch: "m123-ui-components-legacy-page-class-ignored.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: "#316 PR 1・設計正本 D2。消した .page を書き戻すと、器の幅を持たない素の main になる。",
  },
  {
    id: 124,
    label: "audit-ui-components が画面の CSS の @media を見ない",
    patch: "m124-ui-components-screen-media-ignored.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: "#316 PR 1。述語は正しくても、画面の CSS へ配線されていなければ検査は死んでいる。",
  },
  {
    id: 125,
    label: "文字の大きさの検査の射程からアプリの CSS を落とす",
    patch: "m125-typography-scale-apps-out-of-scope.patch",
    pkg: "packages/ui",
    tests: ["tests/typography-scale.test.mjs"],
    note: "#316 PR 4。射程からアプリが落ちても、部品層だけを見て緑になる。射程の自己テストが捕まえる。",
  },
  {
    id: 130,
    label: "まとめの器を部屋の器から外す（完了の瞬間に帯ごと幅が跳ねる）",
    patch: "m130-timer-summary-page-prose.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.page-tier.test.tsx"],
    note: "#352・設計 D1。まとめはロビー・セッションと同じ部屋の段階。器を変えると、上のステータスの帯ごと 1536px から 640px へ縮む。",
  },
  {
    id: 131,
    label: "器の既定の枝を wide にする（読み込み中まで 96rem になる）",
    patch: "m131-timer-default-page-wide.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.page-tier.test.tsx"],
    note: "#352・設計 D1。「全部 wide にすれば跳ねない」という直し方を止める。読み込み中と行き先の無い URL の画面は読む画面の段のまま。",
  },
  {
    id: 140,
    label: "公開で席の札を作り直す",
    patch: "m140-seat-card-remounts-on-reveal.patch",
    pkg: "apps/poker-web",
    tests: ["tests/participant-list.test.tsx"],
    note: "#348・設計正本 D1。key に状態を混ぜると transition の起点が無く、めくれずに表が出る。U2 が同じ要素かを見る。",
  },
  {
    id: 141,
    label: "席の札のめくり順を定数にする",
    patch: "m141-seat-flip-order-constant.patch",
    pkg: "apps/poker-web",
    tests: ["tests/participant-list.test.tsx"],
    note: "#348・設計正本 D2。--seat-order が全員 0 だと一斉にめくれる。U3 が席順を見る。",
  },
  {
    id: 142,
    label: "公開後も席の札の名前が投票済みのまま",
    patch: "m142-seat-name-stays-voted-after-reveal.patch",
    pkg: "apps/poker-web",
    tests: ["tests/participant-list.test.tsx"],
    note: "#348・設計正本 D6。表の値が読み上げに出ない。U1 が公開後の名前を見る。",
  },
  {
    id: 143,
    label: "閉じたお題の脇を DOM から外す",
    patch: "m143-topic-side-unmounts-when-closed.patch",
    pkg: "apps/poker-web",
    tests: ["tests/current-topic.test.tsx"],
    note: "#348・設計正本 D7。閉じると区画ごと消え、列が滑って閉じられない。U5 が区画が同じ要素で残ることを見る。",
  },
  {
    id: 144,
    label: "閉じたお題の脇が inert にならない",
    patch: "m144-topic-side-not-inert-when-closed.patch",
    pkg: "apps/poker-web",
    tests: ["tests/current-topic.test.tsx"],
    note: "#348・設計正本 D7。閉じた札が Tab の行き先と読み上げに残る。U5・U6 が inert を見る。",
  },
  {
    id: 145,
    label: "動きを抑える設定でも演出の遅延が残る",
    patch: "m145-reduced-motion-keeps-delays.patch",
    pkg: "packages/ui",
    tests: ["tests/reduced-motion.test.mjs"],
    note: "#348・設計正本 D5。遅延が残ると fill-mode: both の演出が 0% の姿で消えたまま待つ。実際の効きは poker-a11y の E2E も見る。",
  },
  {
    id: 154,
    label: "poolOf が離席中の参加者も入れる",
    patch: "m154-pool-includes-offline.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/pool.test.ts"],
    note: "#94 E4・spec R7。離席中の 1 人を除くと 2 人未満になる局面で、回せてしまう誤りとして出る。",
  },
  {
    id: 155,
    label: "poolOf が外した人を除かない",
    patch: "m155-pool-ignores-excluded.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/pool.test.ts"],
    note: "#94 E4・spec R7。外した参加者が入ってしまう。",
  },
  {
    id: 153,
    label: "回転中の拒否を外す",
    patch: "m153-spin-allows-while-spinning.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette.test.ts"],
    note: "#94 E5・spec R9。2 回目の回転が 1 回目を上書きし、画面ごとにどちらを見ているかがずれる。",
  },
  {
    id: 157,
    label: "ゲストの上限を見ない",
    patch: "m157-guest-limit-unchecked.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette.test.ts"],
    note: "#94 E13・spec R13。",
  },
  {
    id: 168,
    label: "ルーレットのコマンドの strictObject を object に戻す",
    patch: "m168-command-schema-loosened.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/schemas.test.ts"],
    note: "#94 E15・docs/adr/0011 決定 2 S3。余剰フィールドが黙って通る。",
  },
  {
    id: 160,
    label: "ルーム破棄でルーレットの状態を消さない",
    patch: "m160-destroy-keeps-roulette.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/destroy-room.test.ts"],
    note: "#94 E10・spec §5.4。破棄したルームのコードを引き継いだ別のルームに、古い一周の記録が残る。",
  },
  {
    id: 156,
    label: "ゲストの名前を表示名の規約に通さない",
    patch: "m156-guest-name-skips-display-rule.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#94 E13・spec R13。空白だけ・不可視文字だけの名前が全員の画面に出る。",
  },
  {
    id: 161,
    label: "elapsedMs を回した時点の値のまま送る",
    patch: "m161-elapsed-sent-as-started.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#94 E7・E8・spec R5。回転の途中で参加した接続で見る（回した直後の 1 通では見分けが付かない）。",
  },
  {
    id: 150,
    label: "ハブの層からルーレットのハンドラも呼ぶ",
    patch: "m150-hub-message-reaches-roulette.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.roulette.test.ts"],
    note: "#94 E9・spec R11。ルーレットの層は『ルーレットとして在席しているか』で 2 段目を守るので状態は変わらないが、ハブの接続が 2 通目の拒否を受け取る。4 種の接続で拒否が 1 通ずつであることを見る。",
  },
  {
    id: 158,
    label: "名簿の宛先からルーレットの接続を落とす",
    patch: "m158-roster-excludes-roulette.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.roulette.test.ts"],
    note: "#94 E11・spec R14。ルーレットの画面が入る人を描けない。",
  },
  {
    id: 159,
    label: "お題の配信先からルーレットを落とす",
    patch: "m159-topic-excludes-roulette.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.roulette.test.ts"],
    note: "#94 E12・spec R15。ルーレットの画面が『お題「…」の進行役を決めます』を出せない。#590 で一覧から導く形に作り直した。",
  },
  {
    id: 167,
    label: "ルーレットの接続の受理で onConnect を通さない",
    patch: "m167-roulette-skips-on-connect.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.roulette.test.ts"],
    note: "#94 §5.2。poker の早期 return に足す。レート制限の鍵が接続 ID に落ち、room.join の総当たりが接続を張り直すだけで枠を回避できる。",
  },
  {
    id: 170,
    label: "poolOf が在室者と同じ名前のゲストを外さない",
    patch: "m170-pool-keeps-same-name-guest.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/pool.test.ts"],
    note: "#94 E4・E13・spec R13（PR #355 のレビュー）。ゲストを足した後で同じ名前の人が参加すると、同じ人が円盤に 2 席になる。",
  },
  {
    id: 171,
    label: "ルーレットの commit が状態の変わらないときも保管・配信する",
    patch: "m171-commit-publishes-unchanged.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#94 §5.2（PR #355 のレビュー）。知らない ID の押下や連打のたびに全接続へ同じフレームが飛ぶ。",
  },
  {
    id: 172,
    label: "回す要求の失敗の経路で状態を保管する",
    patch: "m172-failed-spin-stores-pruned.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#94 §5.2（PR #355 のレビュー）。名簿から消えた記録を落とした状態を保管だけして配らず、保管と画面が食い違う。",
  },
  {
    id: 173,
    label: "同名で外れたゲストに印を付けない",
    patch: "m173-twin-guest-unmarked.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/roulette-view.test.ts"],
    note: "#94 spec R13。在室者と同じ名前のゲストが、理由の分からないまま円盤から居なくなる（黙って外れる姿）。",
  },
  {
    id: 165,
    label: "回し始めた時点で結果の一言に当たりの名前を出す",
    patch: "m165-caption-names-winner-while-spinning.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/roulette-room.test.tsx", "tests/roulette-view.test.ts"],
    note: "#94 E19・spec §6.8。読み上げが演出（回転）より先に結果を言う。止まった後に見るだけのテストでは殺せない（最後は同じ文になる）ので、回っている最中に見る。",
  },
  {
    id: 169,
    label: "玄関の札の ID が同期サーバーの綴りとずれる",
    patch: "m169-hub-tool-id-mismatch.patch",
    pkg: "apps/landing",
    tests: ["tests/room-choice-layout.test.tsx"],
    note: "#94 spec §7.3。在席の表示がルーレットに居る人を札の名前で出せず、「roulette にいます」と生の綴りが出る。型は綴りのずれを拾わない。#590 で一覧から導く形に作り直した。",
  },
  {
    id: 162,
    label: "web が状態を受けるたびに回転の時刻の基準を取り直す",
    patch: "m162-web-receivedat-refreshed-every-frame.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/use-roulette-sync.test.tsx"],
    note: "#94 E17・spec §6.4。同じ回転（seq が同じ）の状態を繰り返し受けるたびに経過が 0 に戻り、円盤が回し直しになる。",
  },
  {
    id: 180,
    label: "同じ回転のフレームで基準の時刻は古いまま新しい経過を採る",
    patch: "m180-web-same-seq-takes-new-elapsed.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/use-roulette-sync.test.tsx"],
    note: "#94 E17・spec §6.4（PR #357 のレビュー）。回転中の外す・戻すや再接続で同じ seq が届くたびに経過を二重に数え、止まる時刻が前へずれる。",
  },
  {
    id: 181,
    label: "同名で外れたゲストのチェックを押せるままにする",
    patch: "m181-twin-guest-check-enabled.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/roulette-view.test.ts", "tests/roulette-room.test.tsx"],
    note: "#94 spec R13（PR #357 のレビュー）。押しても入る人に戻らない（何も起きない）チェックが残る。",
  },
  {
    id: 182,
    label: "結果の一言で入る人の数を止まった結果より先に見る",
    patch: "m182-caption-too-few-hides-result.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/roulette-view.test.ts"],
    note: "#94 spec §6.8（PR #357 のレビュー）。発表の後で入る人が 1 人に減ると、発表した結果が「2 人から回せます」に消える。",
  },
  {
    id: 163,
    label: "止まる角度の端数が回し始めの角度を引かない",
    patch: "m163-final-angle-ignores-start.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel-motion.test.ts"],
    note: "#94 spec §6.4。回し始めの角度が 0° 以外の画面（前の回転の止まった位置から回す画面）だけ別の席で止まる。開始角 0° だけのテストでは殺せない。",
  },
  {
    id: 164,
    label: "動きを減らす設定でも回す",
    patch: "m164-reduced-motion-still-spins.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel.test.tsx", "tests/roulette-room.test.tsx"],
    note:
      "#94 spec §6.5。rAF の回転は CSS の一括の手当ての外なので JS が止める。忘れると設定を無視して 4 秒回り、当たりの席と札が回転の後まで出ない。" +
      "止まったかの判定は局面（`phaseOf`）の 1 か所なので、壊す場所もそこ（PR #383 のレビュー）。",
  },
  {
    id: 174,
    label: "回転の終わりを timer で保証しない",
    patch: "m174-spin-end-relies-on-raf.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel.test.tsx"],
    note:
      "#94 spec §6.4。裏のタブ・ヘッドレスでは rAF が止まる。終わりを rAF に頼ると、当たりの席と札の表が出ないまま止まって見える。" +
      "終わりの timer は画面の `useNowMs` の 1 つ（PR #383 のレビューで円盤の自前の timer を外した）。",
  },
  {
    id: 175,
    label: "止まったとき札が見えていても必ず寄せる",
    patch: "m175-scroll-card-always.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel.test.tsx"],
    note: "#94 spec §6.4・E22。見えているのに画面を動かす。隠れているときに呼ぶことだけを見るテストでは殺せない。",
  },
  {
    id: 176,
    label: "札が見えるかの判定が下端の帯を数えない",
    patch: "m176-scroll-ignores-dock.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel.test.tsx"],
    note: "#94 spec E22・§6.7。320×640 で下端に留まる帯が札を覆っても、窓に収まっていれば寄せない（名前が帯に隠れたまま）。",
  },
  {
    id: 177,
    label: "縦書きの席の欧文の字を立てない（text-orientation を既定の mixed に戻す）",
    patch: "m177-vertical-latin-sideways.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel-glyphs.test.tsx"],
    note:
      "#94 spec §6.3。縦書きの欧文の字が 90° 回って横倒しに描かれる（2026-10-13 の実画面の「Mika」）。" +
      "4 版では全角主体の名前に混じった欧文の字だけがここに来る。関数の戻り値だけを測る単体では殺せない。" +
      "ブラウザの実際の姿は E2E（`roulette.spec.ts` の `expectWheelGlyphsUpright`）が `getRotationOfChar` で測る。",
  },
  {
    id: 178,
    label: "当たりの席の名前を 700 の太さで描く（名前の漢字がシステムの書体に落ちる）",
    patch: "m178-winner-label-bold.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel-glyphs.test.tsx"],
    note:
      "#94 spec §6.3。書体の 700 には base 層しか無い。落ちた先は縦書きの送りが 0 で、当たりの席の「健太」が" +
      "1 字に重なり縁の外へはみ出した（2026-10-13 の 320）。E2E は CDP で使われた書体を読む（`expectWheelLabelsUseWebFonts`）。",
  },
  {
    id: 179,
    label: "縦の半径の席の欧文を縦に積む（半径を横切る横書きにしない）",
    patch: "m179-latin-stacked-vertical.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel-glyphs.test.tsx", "tests/wheel-motion.test.ts"],
    note:
      "#94 spec §6.3 の 4 版（利用者の決定 案 2）。立てて積んだ「M／i／k／a」は読めない。" +
      "字の傾きは 30° 以内に収まるので、字の傾きだけを見る物差しでは殺せない。",
  },
  {
    id: 183,
    label: "回転中にマウントした舞台を、測る前の既定値（縦積み）のまま凍らせる",
    patch: "m183-stage-layout-frozen-before-measure.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel.test.tsx"],
    note:
      "#94 spec §6.7（PR #383 のレビュー）。再読み込み・途中入室の画面が広い舞台でも回っている間ずっと縦積み（指し針が下）で、" +
      "止まった瞬間に横並びへ跳び、止まる角度が 90° 変わって円盤が一瞬で回る。",
  },
  {
    id: 184,
    label: "円盤が自前の時計で「止まった」を決める",
    patch: "m184-wheel-settles-on-own-clock.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel.test.tsx"],
    note:
      "#94 spec §6.4（PR #383 のレビュー）。終わり際に札と当たりの席は止まった姿、結果の一言と脇の一覧はまだ回転中、と食い違う。" +
      "止まった後だけを見るテストでは殺せない（終わりの時刻の前後を細かく刻んで見る）。",
  },
  {
    id: 185,
    label: "止まった後の円盤を、いまの入る人の並びで描く",
    patch: "m185-settled-wheel-draws-current-pool.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel.test.tsx"],
    note:
      "#94 spec §6.3（PR #383 のレビュー）。止まった角度は回したときの席数で計算するので、止まった後にゲストを足す・" +
      "名簿の順が変わると、針が別の人を指し、札は本当の当たりを見せる。",
  },
  {
    id: 186,
    label: "--changed の条件 1（pkg 配下の変更で選ぶ）を外す",
    patch: "m186-select-without-pkg-rule.patch",
    pkg: "scripts",
    tests: ["lib/mutation-select.test.mjs"],
    note: "#387。**対応表より後に足した変異。** 選び方そのものが静かに狭まると、手元で流すべき変異を流さなくなる。",
  },
  {
    id: 187,
    label: "変異検査の機構が変わっても --changed を全件に倒さない",
    patch: "m187-select-without-mechanism-fallback.patch",
    pkg: "scripts",
    tests: ["lib/mutation-select.test.mjs"],
    note: "#387。**対応表より後に足した変異。** 機構を変えた枝で、変えた機構の影響を手元で見ない。",
  },
  {
    id: 240,
    label: "INVALID_SETTLE を受けてもログを残さない",
    patch: "m240-invalid-settle-without-log.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#382。**対応表より後に足した変異。** 乱数源の契約違反の片方だけが痕跡を残さない元の欠陥。内部の誤りを本番で知る手がかりが消える。",
  },
  {
    id: 241,
    label: "INVALID_SETTLE のログを error より軽い水準にする",
    patch: "m241-invalid-settle-log-below-error.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#382。**対応表より後に足した変異。** INVALID_RANDOM の行（error）と水準を揃える。warn では error を拾う監視から外れる。",
  },
  {
    id: 242,
    label: "INVALID_SETTLE を INVALID_RANDOM と同じ行で残す",
    patch: "m242-invalid-settle-logs-as-range-error.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#382。**対応表より後に足した変異。** 2 つの契約違反がログで区別できなくなる（理由を語彙に置いた意味が消える）。",
  },
  {
    id: 243,
    label: "乱数源の契約違反の判定を全失敗に広げる",
    patch: "m243-violation-check-always-true.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#382（/code-review）。**対応表より後に足した変異。** `isRandomViolation` を常に真にする。人数不足など利用者の操作で起きる失敗が、契約違反として扱われる（本物の違反でない失敗にログと INTERNAL_ERROR を返す）。",
  },
  {
    id: 244,
    label: "INVALID_RANDOM の reason を invalid-settle にする",
    patch: "m244-invalid-random-reason-is-invalid-settle.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#382（/code-review）。**対応表より後に足した変異。** 監視が reason で 2 つの契約違反を区別できなくなる。",
  },
  {
    id: 230,
    label: "timer の内部エラーが、また timer だけの別の文を返す",
    patch: "m230-timer-internal-error-own-text.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/connection-error-text.test.ts", "test/connection-error-text-sources.test.ts"],
    note:
      "#381。**対応表より後に足した変異。** timer の内部エラーのフレームを正本（`connectionErrorFrame`）から" +
      "取らず「内部エラーが発生しました」を直書きすると、timer だけ文が違う状態（#381 以前）に戻る。",
  },
  {
    id: 231,
    label: "メッセージ層の reject で on-message-error を残さない",
    patch: "m231-reject-without-log.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/connection-error-text.test.ts"],
    note:
      "#381。**対応表より後に足した変異。** 非同期の失敗（reject）のログを落とすと、かつての timer のように" +
      "失敗が無言になる。4 つの接続で同じログが出ることを固定したテストが検出する。",
  },
  {
    id: 232,
    label: "on-message-error に、どの接続の失敗かを示す protocol を出さない",
    patch: "m232-log-without-protocol.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/connection-error-text.test.ts", "test/ws-adapter.message.test.ts"],
    note:
      "#381。**対応表より後に足した変異。** 4 つの接続が同じログ行を出すので、`protocol` が無いと" +
      "ログからどの接続の失敗か分からない。接続ごとの `protocol` の値を固定したテストが検出する。",
  },
  {
    id: 233,
    label: "poker の失敗のログに protocol を出さない",
    patch: "m233-poker-log-without-protocol.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/ws-adapter.message.test.ts", "test/connection-error-text.test.ts"],
    note:
      "#381。**対応表より後に足した変異。** poker の受け口は `createTextChannel` ではなく自前の `try/catch` でログを" +
      "出すので、m232 では検出されない。poker の隔離のテストが `protocol=poker` を固定している。",
  },
  {
    id: 234,
    label: "poker の close 失敗のログに protocol を出さない",
    patch: "m234-poker-close-failure-log-without-protocol.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/connection-error-text.test.ts"],
    note:
      "#381。**対応表より後に足した変異。** m233 は poker の失敗の 1 行目だけで、close 自体の失敗の 2 行目は" +
      "実 WS では起こしにくい。受け口を直接呼び、close も throw させるテストが検出する。",
  },
  {
    id: 200,
    label: "ルーレットのゲストの名前欄の上限を、表示名の規約でなく 24 に戻す",
    patch: "m200-roulette-guest-name-cap-24.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/roulette-room.test.tsx"],
    note: "#373。輪に載せられる数の上限（24）と取り違え、25〜40 字の名前を入れられなかった。",
  },
  {
    id: 201,
    label: "結果の札の名前を、長さによらず最大の段（lg）で描く",
    patch: "m201-card-name-always-large.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/card-name-size.test.ts"],
    note: "#373。40 字の名前が札の上下にはみ出し、一言と回すボタンに重なる。",
  },
  {
    id: 202,
    label: "結果の札が名前の段（data-size）を付けない",
    patch: "m202-result-card-without-data-size.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/result-card.test.tsx"],
    note: "#373。段の選び方が正しくても描画に届かず、長い名前が札からはみ出す。",
  },
  {
    id: 203,
    label: "札の名前の表示幅を、書記素でなくコードポイントで数える",
    patch: "m203-card-name-counts-code-points.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/card-name-size.test.ts"],
    note: "#373。ZWJ の絵文字・国旗が複数字と数えられ、段が不必要に下がる。",
  },
  {
    id: 204,
    label: "最大の段（lg）の名前の要素から 2 行の line-clamp を外す",
    patch: "m204-card-name-lg-without-clamp.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/result-card.test.tsx"],
    note: "#373。幅の広い欧文が札の上下にはみ出す安全網が無くなる。",
  },
  {
    id: 205,
    label: "円盤の席の名前（fitLabel）を、書記素でなくコードポイントで回す",
    patch: "m205-fit-label-counts-code-points.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/card-name-size.test.ts"],
    note: "#373。ZWJ の絵文字・国旗・結合文字が途中で切られる。",
  },
  {
    id: 206,
    label: "Intl.Segmenter が無いときの代替が、コードポイントでなく全体を 1 つとして返す",
    patch: "m206-grapheme-fallback-returns-whole.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/card-name-size.test.ts"],
    note: "#373。無い環境で幅が全く数えられず、段が常に最大になる。",
  },
  {
    id: 207,
    label: "札の最大の段の上限を、1 行に収まる 5.5 でなく 6 に戻す",
    patch: "m207-card-name-lg-limit-6.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/card-name-size.test.ts"],
    note: "#373。全角 6 字が 2 行になり、札の高さを超える。",
  },
  {
    id: 208,
    label: "札の「さん」から white-space: nowrap を外す",
    patch: "m208-card-san-without-nowrap.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/result-card.test.tsx"],
    note: "#373。「さん」が 1 字ずつ縦に折れる。",
  },
  {
    id: 220,
    label: "空の輪・範囲外の添字で次の担当に NaN を返す",
    patch: "m220-evolve-empty-rotation-nan.patch",
    pkg: "packages/timer-core",
    tests: ["test/aggregate.test.ts"],
    note:
      RESERVED_220_229 +
      "#376。空の輪で `(removedIndex + 1) % 0` が NaN を作る（修正前の evolve の `% 0` と同じ欠陥の型）。",
  },
  {
    id: 221,
    label: "範囲外の添字の MemberRemoved を無視しない",
    patch: "m221-evolve-remove-out-of-range-index.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392 のレビュー）。誰も外さずに現ドライバーの番号だけを詰める。decide の InvalidIndex が止めるので、evolve へ直接渡すテストで殺す。",
  },
  {
    id: 222,
    label: "範囲外の添字の MemberMoved を無視しない",
    patch: "m222-evolve-move-out-of-range-index.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392 のレビュー）。負の添字は splice が末尾から数え、別の席を動かす。",
  },
  {
    id: 223,
    label: "運転中の末尾の人を外したとき先頭へ回さない",
    patch: "m223-evolve-remove-without-wrap.patch",
    pkg: "packages/timer-core",
    tests: ["test/decide.test.ts", "test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392 のレビュー）。末尾の運転者を外すと次の担当が輪の長さちょうどになり、範囲外を指す。",
  },
  {
    id: 224,
    label: "輪が空でも時計を止めない",
    patch: "m224-evolve-empty-rotation-keeps-running.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392 のレビュー）。担当の居ない輪でタイマーが回る。",
  },
  {
    id: 225,
    label: "整数でない添字を席の添字として受け入れる",
    patch: "m225-evolve-fractional-seat-index.patch",
    pkg: "packages/timer-core",
    tests: ["test/decide.test.ts", "test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392）。decide と evolve が共有する述語。0.5 は splice が 0 に切り捨て、先頭の席を動かす。",
  },
  {
    id: 226,
    label: "範囲外の交代先の DriverSwitched を無視しない",
    patch: "m226-evolve-switch-out-of-range-index.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392）。currentIndex が範囲外を指し、担当回数・交代回数も進む。",
  },
  {
    id: 227,
    label: "順列でない order の MembersShuffled を無視しない",
    patch: "m227-evolve-shuffle-non-permutation.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392）。席が欠ける・増える・undefined が入る。",
  },
  {
    id: 228,
    label: "順列の判定から長さの一致を外す",
    patch: "m228-evolve-permutation-without-length.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392）。重複で集合の大きさだけが輪の長さに一致する長い order を順列とみなし、席が 1 つ増える。",
  },
  {
    id: 229,
    label: "順列の判定から重複の無さを外す",
    patch: "m229-evolve-permutation-without-distinct.patch",
    pkg: "packages/timer-core",
    tests: ["test/decide.test.ts", "test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392）。重複する order を順列とみなし、同じ席が 2 つ並び別の席が消える。",
  },
  {
    id: 250,
    label: "運転中の人を外したとき、運ばれた次の担当を使わない",
    patch: "m250-evolve-remove-ignores-next-driver.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 2 巡目）。decide が資格で選んだ次の担当が捨てられ、位置で次の席（一時離脱の人でも）に運転が回る。",
  },
  {
    id: 251,
    label: "運ばれた次の担当を範囲を確かめずに使う",
    patch: "m251-evolve-remove-trusts-next-driver.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 3 巡目）。範囲外の nextDriverIndex で currentIndex が範囲外を指す（ほかの不正な入力と違い、集約が変わる）。",
  },
  {
    id: 252,
    label: "decide の member.remove が資格を見ずに次の担当を選ぶ",
    patch: "m252-decide-remove-without-ineligible.patch",
    pkg: "packages/timer-core",
    tests: ["test/decide.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 2 巡目）。運転中の人が外れると、一時離脱・不在の人に運転が回る（本番の経路）。",
  },
  {
    id: 253,
    label: "participant.remove が資格を見ずに次の担当を選ぶ",
    patch: "m253-participant-remove-without-ineligible.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/manual-skip-eligible.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 2 巡目）。運転中の人がルームを抜けると、一時離脱・不在の人に運転が回る（本番の経路）。",
  },
  {
    id: 254,
    label: "member.remove に資格の集合を埋めない",
    patch: "m254-member-remove-without-ineligible-filled.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/manual-skip-eligible.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 2 巡目）。decide は全員適格として次の担当を選び、一時離脱の人に運転が回る。",
  },
  {
    id: 255,
    label: "止まっている時計にも空の輪で一時停止を立てる",
    patch: "m255-evolve-empty-rotation-pauses-stopped-clock.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 2 巡目）。休憩中に輪が空になると一時停止が立ち、席を足し直しても BreakEnded で走り出せない。",
  },
  {
    id: 256,
    label: "空の輪の時計を走らせる操作を拒まない",
    patch: "m256-decide-switch-on-empty-rotation.patch",
    pkg: "packages/timer-core",
    tests: ["test/decide.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 3 巡目）。空の輪へ開始・再開・交代・やり直しを出す（evolve は時計を止め直すが、拒否は decide の仕事）。",
  },
  {
    id: 257,
    label: "次の担当を外した後の添字へ詰めない",
    patch: "m257-next-driver-without-shift.patch",
    pkg: "packages/timer-core",
    tests: ["test/decide.test.ts", "test/aggregate.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 2 巡目）。外した席より後ろの人を選ぶと、1 つ後ろの人に運転が回る（外した後の輪で数え直していない）。",
  },
  {
    id: 258,
    label: "外した後の輪が空のとき、次の担当 0 を正しい値とみなさない",
    patch: "m258-current-index-rejects-empty-rotation.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 3 巡目）。最後の 1 席を外す MemberRemoved が常に無視され、空の輪へ届かない（evolve の全域の主張が、空の輪を作らないことで成り立ってしまう）。",
  },
  {
    id: 259,
    label: "空の輪の拒否を BelowMinMembers で返す",
    patch: "m259-decide-empty-rotation-as-below-min.patch",
    pkg: "packages/timer-core",
    tests: ["test/decide.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 3 巡目）。「最後のドライバーは外れられません。」が出て、状況と食い違う。",
  },
  {
    id: 210,
    label: "evolve が交代のときに直前のドライバーを書かない",
    patch: "m210-evolve-forgets-previous-driver.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts"],
    note: "#374。**対応表より後に足した変異。** 集約が直前のドライバーを持たなければ、ナビは常に出ない。",
  },
  {
    id: 211,
    label: "snapshot が直前のドライバーの席を送らない（常に null）",
    patch: "m211-dto-drops-previous-driver-index.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/timer-snapshot-dto.test.ts", "test/manual-skip-eligible.test.ts"],
    note: "#374。**対応表より後に足した変異。** 集約が正しくても wire に載らなければ画面はナビを出さない。",
  },
  {
    id: 212,
    label: "ナビが直前のドライバーの席の飛ばされる状態を見ない",
    patch: "m212-navigator-ignores-skip-state.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/session-view.test.ts"],
    note: "#374。**対応表より後に足した変異。** 運転した後に見送り・切断した人（ナビを務められない人）をナビに出す。",
  },
  {
    id: 213,
    label: "ナビを輪の上の 1 つ前の席へ戻す",
    patch: "m213-navigator-is-seat-before-current.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/session-view.test.ts", "test/ui/Session.derived.test.tsx"],
    note: "#374。**対応表より後に足した変異。** 欠陥そのもの —— 飛ばされた席の人（運転していない人）をナビに出す。",
  },
  {
    id: 214,
    label: "運転中の人が輪から外れても、直前のドライバーを書き換えない",
    patch: "m214-removal-keeps-stale-previous-driver.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts"],
    note: "#374（PR #396 のレビュー）。**対応表より後に足した変異。** 新しい運転者のナビに 2 つ前の人が出る。",
  },
  {
    id: 215,
    label: "snapshot が、いまの運転者と同じ席を直前のドライバーとして送る",
    patch: "m215-dto-sends-current-as-previous.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/timer-snapshot-dto.test.ts"],
    note: "#374（PR #396 のレビュー）。**対応表より後に足した変異。** wire の注記（同じ席なら null）と食い違う。",
  },
  {
    id: 216,
    label: "不在（away）でもナビを隠す",
    patch: "m216-navigator-hides-on-away.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/session-view.test.ts"],
    note: "#374（PR #396 のレビュー）。**対応表より後に足した変異。** timer のタブを切り替えるたびに全員の画面でナビが点滅する。",
  },
  {
    id: 217,
    label: "名簿の変化で席の情報が変わっても timer の画面へ配らない",
    patch: "m217-tool-join-skips-timer-broadcast.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.timer-seat-presence.test.ts", "test/save-roster.timer-seat.test.ts"],
    note: "#374。**対応表より後に足した変異。** timer から選択画面へ移った人が、ほかの人の timer で「未接続」のまま残り、ナビが隠れる。",
  },
  {
    id: 218,
    label: "開始が直前のドライバーを null に戻さない",
    patch: "m218-start-keeps-previous-driver.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts"],
    note: "#374（PR #396 のレビュー）。**対応表より後に足した変異。** ロビーの名残の人が、開始直後からナビに出る。",
  },
  {
    id: 219,
    label: "呼び出し側が自分で配るときも timer へ配る（二重に配る）",
    patch: "m219-save-roster-double-broadcast.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/save-roster.timer-seat.test.ts"],
    note: "#374（PR #396 のレビュー）。**対応表より後に足した変異。** timer のコマンドで名簿が変わるたびに snapshot が 2 通届く。",
  },
  {
    id: 260,
    label: "上限まで空いたコードが出なくても、最後に引いたコードでルームを作る",
    patch: "m260-create-room-proceeds-with-taken-code.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/create-room.test.ts", "test/handlers.room.test.ts"],
    note: "#375。**対応表より後に足した変異。** 事後条件（返すコードは空いている）が外れ、既にあるルームを上書きする。",
  },
  {
    id: 261,
    label: "poker のルーム ID が上限まで空かなくても、最後に引いた ID で作る",
    patch: "m261-poker-room-id-returns-taken-id.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/poker/create-sync-server.substitution.test.ts"],
    note: "#375。**対応表より後に足した変異。** 既にあるルーム（名簿・ラウンド）を上書きする。",
  },
  {
    id: 262,
    label: "玄関の room.join の合言葉に、timer と違う上限を掛ける",
    patch: "m262-hub-join-passphrase-without-limit.patch",
    pkg: "packages/room-core",
    tests: ["tests/wire.test.ts"],
    note: "#377。**対応表より後に足した変異。** 入口ごとに合言葉の長さの契約が違う（玄関・topic・roulette だけが超過を通す）。",
  },
  {
    id: 263,
    label: "timer の受け口が合言葉の長さの規約を当てない",
    patch: "m263-timer-receiver-skips-passphrase-rule.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.passphrase-limit.test.ts"],
    note: "#377。**対応表より後に足した変異。** timer の wire スキーマは形だけを見るので、timer の入口だけが上限なしになる。",
  },
  {
    id: 264,
    label: "合言葉を掛けるときに長さの上限を見ない",
    patch: "m264-passphrase-rule-skips-set.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/passphrase-rule.test.ts", "test/live-ws.passphrase-limit.test.ts"],
    note: "#377。**対応表より後に足した変異。** 上限を超える合言葉を掛けられ、どの入口からもその合言葉では入れないルームができる。",
  },
  {
    id: 265,
    label: "timer の既定のエラーの文言だけを句点付きに戻す",
    patch: "m265-timer-default-error-with-period.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/default-error-text.test.ts"],
    note: "#378。**対応表より後に足した変異。** コードの分からないエラーの文言が、timer だけほかのツールと違う。",
  },
  {
    id: 266,
    label: "玄関の合言葉の欄に上限を掛けない",
    patch: "m266-landing-passphrase-field-without-limit.patch",
    pkg: "apps/landing",
    tests: ["tests/join-room-passphrase.test.tsx"],
    note: "#377。**対応表より後に足した変異。** 長い合言葉を貼った人が「コマンドの形式が不正です」で断られ、理由を知る手段が無い。",
  },
  {
    id: 270,
    label: "見積もりの割れの閾値を超えたときだけにする（2 段で割れない）",
    patch: "m270-spread-threshold-exclusive.patch",
    pkg: "packages/poker-core",
    tests: ["tests/spread.test.ts"],
    note: "#405。**対応表より後に足した変異。** 270〜279 は #405 に割り当てた（#402 の並行作業とぶつからないよう 267〜269 を空けた）。3 と 8 のように 2 段離れた票で促しが出ない。",
  },
  {
    id: 271,
    label: "見積もりの割れを段ではなく札の値の差で比べる",
    patch: "m271-spread-compares-values.patch",
    pkg: "packages/poker-core",
    tests: ["tests/spread.test.ts"],
    note: "#405。**対応表より後に足した変異。** 270〜279 は #405 に割り当てた（#402 の並行作業とぶつからないよう 267〜269 を空けた）。13 と 21 のような隣同士が割れに数えられる。",
  },
  {
    id: 272,
    label: "見積もりの割れで、同じ札を出した人を 1 人に絞る",
    patch: "m272-spread-keeps-one-voter.patch",
    pkg: "packages/poker-core",
    tests: ["tests/spread.test.ts"],
    note: "#405。**対応表より後に足した変異。** 270〜279 は #405 に割り当てた（#402 の並行作業とぶつからないよう 267〜269 を空けた）。最大や最小を複数人が出したとき、先に出した人だけが名指しされる。",
  },
  {
    id: 273,
    label: "結果の節が見積もりの割れの促しを描かない",
    patch: "m273-results-hides-spread.patch",
    pkg: "apps/poker-web",
    tests: ["tests/results.test.tsx", "tests/room-page-derived.test.tsx"],
    note: "#405。**対応表より後に足した変異。** 270〜279 は #405 に割り当てた（#402 の並行作業とぶつからないよう 267〜269 を空けた）。",
  },
  {
    id: 274,
    label: "ルーム画面が見積もりの割れを結果の節へ渡さない",
    patch: "m274-room-page-drops-spread.patch",
    pkg: "apps/poker-web",
    tests: ["tests/room-page-derived.test.tsx"],
    note: "#405。**対応表より後に足した変異。** 270〜279 は #405 に割り当てた（#402 の並行作業とぶつからないよう 267〜269 を空けた）。判定と描画の単体テストは緑のまま、画面に促しが出ない（配線の変異）。",
  },
  {
    id: 275,
    label: "最大の側の名前が 1 人も引けなくても促しを出す",
    patch: "m275-spread-prompt-ignores-missing-high.patch",
    pkg: "apps/poker-web",
    tests: ["tests/room-view.test.ts"],
    note: "#405（PR #412 のレビュー）。**対応表より後に足した変異。** 最大の札を出した人が抜けると、名前の無い「を出した  と、」の促しが出る。",
  },
  {
    id: 280,
    label: "@tasuki/markdown が文の無いタスクの項目もタスクにする",
    patch: "m280-markdown-task-empty-text.patch",
    pkg: "packages/markdown",
    tests: ["tests/blocks.test.ts"],
    note: "#315 PR 1・spec D2・NFR-002。**対応表より後に足した変異。** 280〜289 は #315 に割り当てた（267〜269 は #402 のために、270〜279 は #405 のために空けてある）。印の後が空白だけの項目が名前の無いチェックボックスになる。",
  },
  {
    id: 281,
    label: "@tasuki/markdown が [X] をチェック済みにしない",
    patch: "m281-markdown-task-upper-x.patch",
    pkg: "packages/markdown",
    tests: ["tests/blocks.test.ts"],
    note: "#315 PR 1・spec D2・FR-002。**対応表より後に足した変異。** 280〜289 は #315 に割り当てた。GitHub と同じ `- [X]` が「[X] 文」という文のまま出る。",
  },
  {
    id: 282,
    label: "Markdown のタスクの項目が label で包まれず、チェックボックスが名前を失う",
    patch: "m282-web-kit-task-no-label.patch",
    pkg: "packages/web-kit",
    tests: ["tests/markdown.test.tsx"],
    note: "#315 PR 1・spec D4・FR-003。**対応表より後に足した変異。** 280〜289 は #315 に割り当てた。見た目は同じまま、支援技術からどの項目のチェックか区別できない。",
  },
  {
    id: 290,
    label: "isBreakDue が適格 0/1 席の周回でも休憩を入れる",
    patch: "m290-is-break-due-ignores-single-seat.patch",
    pkg: "packages/timer-core",
    tests: ["test/break-policy.test.ts"],
    note: "#402。**対応表より後に足した変異。** 席が 1 つ以下だと閾値が 0 席ぶんになり、交代のたびに休憩に入る。",
  },
  {
    id: 291,
    label: "知らせるだけの基準を常に baseline にする（知らせ直しを間隔まで待たない）",
    patch: "m291-suggest-uses-baseline.patch",
    pkg: "packages/timer-core",
    tests: ["test/break-policy.test.ts"],
    note: "#402。**対応表より後に足した変異。** 知らせたあとも毎回の交代で知らせ直す。",
  },
  {
    id: 292,
    label: "休憩中の拒否から driver.assign を外す",
    patch: "m292-decide-allows-assign-on-break.patch",
    pkg: "packages/timer-core",
    tests: ["test/decide-v3.test.ts"],
    note: "#402。**対応表より後に足した変異。** 休憩中に担当の指定で時計が走り出す。",
  },
  {
    id: 293,
    label: "完成・中断で時計を止めない",
    patch: "m293-session-ended-keeps-clock-running.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts"],
    note: "#402。**対応表より後に足した変異。** 完成・中断のあとも時計が走り、自動交代が予約される。",
  },
  {
    id: 294,
    label: "交代が無くても休憩を判定する",
    patch: "m294-break-after-switch-without-switch-check.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/break-after-switch.test.ts"],
    note: "#402。**対応表より後に足した変異。** 交代の無いコミット（メモ更新など）のあとに休憩に入る。",
  },
  {
    id: 295,
    label: "休憩明けの運転者の繰り上げを外す",
    patch: "m295-break-end-skips-advance.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/break-after-switch.test.ts"],
    note: "#402。**対応表より後に足した変異。** 席を外した運転者のまま休憩が明ける。",
  },
  {
    id: 296,
    label: "休憩に入る交代の全画面の知らせを抑えない",
    patch: "m296-switch-alert-ignores-suppressed.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/Session.break.test.tsx"],
    note: "#402。**対応表より後に足した変異。** 休憩の知らせと全画面の知らせが二重に出る。",
  },
  {
    id: 302,
    label: "回転中の判定が人数を見ない",
    patch: "m302-spin-duration-ignores-picks.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-multi-pick.test.ts"],
    note: "#401 PR 1・spec M6・E6。2 人目以降が止まる前に次の回転が始まる。",
  },
  {
    id: 303,
    label: "回すの下限が人数を見ない",
    patch: "m303-spin-min-two.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-multi-pick.test.ts"],
    note: "#401 PR 1・spec M5・E5。入る人がちょうど k 人で全員が選ばれる。",
  },
  {
    id: 304,
    label: "選ぶ人数の上限を緩める",
    patch: "m304-pick-count-allows-five.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-multi-pick.test.ts"],
    note: "#401 PR 1・spec M5・E2。札の 4 行に収まらない人数が通る。",
  },
  {
    id: 305,
    label: "wire の durationMs が人数を見ない",
    patch: "m305-view-duration-ignores-picks.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-multi-pick.test.ts"],
    note: "#401 PR 1・spec §5.1・E3。画面が 2 人目以降を待たずに止まる。",
  },
  {
    id: 306,
    label: "同期サーバーが送られた人数を使わない",
    patch: "m306-sync-pick-set-ignores-count.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#401 PR 1・spec M2・E1。人数を変えても全員の画面が 1 人のまま。",
  },
  {
    id: 307,
    label: "一人ずつ決まる時刻が止まる時刻とずれる",
    patch: "m307-web-reveals-late.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/roulette-view.test.ts"],
    note: "#401 PR 2・spec §6.2・E9。止まってから 200ms 遅れて決まる。円盤は止まっているのに札・一覧がまだ前の人数のまま。",
  },
  {
    id: 308,
    label: "止まった後の「置く」間を飛ばす",
    patch: "m308-web-move-skips-hold.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel-motion.test.ts"],
    note: "#401 PR 2・spec M6。止まった瞬間に次へ動き出し、誰に止まったかが見えない。",
  },
  {
    id: 309,
    label: "1 人のときに組の札を出す",
    patch: "m309-web-single-uses-group-card.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/multi-pick.test.tsx"],
    note: "#401 PR 2・spec M11・E7。1 人の画面が #94 の札から変わる（崩さない約束を破る）。",
  },
  {
    id: 310,
    label: "画面の時計が次の 1 人ぶんしか起きない",
    patch: "m310-web-wakes-only-next-stop.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/multi-pick.test.tsx"],
    note: "#401 PR 2・spec §6.2・E8。rAF の止まった画面（裏のタブ）で、1 人目の後に止まったままになる。",
  },
  {
    id: 360,
    label: "recordReveal が閉じた束のあとでも末尾の束に行を足す",
    patch: "m360-core-record-appends-to-closed-group.patch",
    pkg: "packages/poker-core",
    tests: ["tests/estimate-log.test.ts"],
    note: "#93。**対応表より後に足した変異。** 360〜369 は #93 に割り当てた（300〜319 と 340〜359 は #401 の帯・#422 のレビュー）。閉じた束に次の開票が混ざり、アイテムごとの束が崩れる。",
  },
  {
    id: 361,
    label: "上限で落とすときに束の ID を振り直す",
    patch: "m361-core-trim-renumbers-groups.patch",
    pkg: "packages/poker-core",
    tests: ["tests/estimate-log.test.ts"],
    note: "#93。画面の束の同一性（key・ポイントの入れ直しの宛先）が揺れる。",
  },
  {
    id: 362,
    label: "自動公開が記録を足さない",
    patch: "m362-core-auto-reveal-skips-log.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note: "#93。全員投票の自動公開だけ記録が落ちる（手動公開は記録される）。",
  },
  {
    id: 363,
    label: "再投票が item を空にする",
    patch: "m363-core-revote-clears-item.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note: "#93。再投票でアイテム名が消える。",
  },
  {
    id: 364,
    label: "next-round を次のアイテムへ向ける",
    patch: "m364-sync-next-round-closes-group.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/poker/estimate-log.test.ts", "test/poker/next-round.test.ts"],
    note: "#93。古いクライアントの next-round で束が閉じ item が消える。",
  },
  {
    id: 365,
    label: "アイテム名の欄が編集中に props の item で打ちかけを上書きする",
    patch: "m365-web-item-field-overwrites-draft.patch",
    pkg: "apps/poker-web",
    tests: ["tests/estimate-item-field.test.tsx"],
    note: "#93。他の参加者の入力で自分の打ちかけが消える。",
  },
  {
    id: 320,
    label: "順番に回すとき、番が決まった人がまた選ばれる",
    patch: "m320-order-ignores-done.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-turn-order.test.ts"],
    note: "#401 順番に回す T2。まだの人から引かず、入る人の全体から引く。番が決まった人がまた選ばれ、円盤から抜けない。",
  },
  {
    id: 321,
    label: "最後の 1 人も回す",
    patch: "m321-order-spins-last-one.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-turn-order.test.ts"],
    note: "#401 順番に回す T3。まだの人が 1 人でも回す。1 席の円盤が回り、壊れて見える（モック 2 版）。",
  },
  {
    id: 322,
    label: "回が終わった後に新しい回を始めない",
    patch: "m322-order-never-restarts.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-turn-order.test.ts"],
    note: "#401 順番に回す T4。回が終わった後に押しても新しい回を始めない。「次の回を始める」が効かない。",
  },
  {
    id: 323,
    label: "回の途中でも決め方を変えられる",
    patch: "m323-mode-changes-mid-round.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-turn-order.test.ts"],
    note: "#401 順番に回す T8。回の途中でも決め方を変えられる。済んだ人の記録の意味が変わる。",
  },
  {
    id: 324,
    label: "番が 0 から始まる",
    patch: "m324-order-turn-off-by-one.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-turn-order.test.ts"],
    note: "#401 順番に回す §5.1。番を 0 から数える。札と一言が「0 番」から始まる。",
  },
  {
    id: 325,
    label: "名簿から消えた人を番の記録から落とす",
    patch: "m325-prune-drops-order.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-turn-order.test.ts"],
    note: "#401 順番に回す T6・PR #418 のレビュー。名簿から消えた人を番の記録から落とす。後ろの人の番が繰り上がり、次の番が既出の番と重なる。",
  },
  {
    id: 326,
    label: "同期サーバーが決め方を使わない",
    patch: "m326-sync-mode-set-ignores-mode.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#401 順番に回す T1。同期サーバーが送られた決め方を使わない。1 回で決めるへ戻せない。",
  },
  {
    id: 327,
    label: "1 回で決めるで順番の回転の結果を出す",
    patch: "m327-web-once-shows-order-spin.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/turn-order-view.test.ts", "tests/turn-order.test.tsx"],
    note: "#401 順番に回す §5.1。1 回で決めるへ戻した後も、順番の回転の結果を「次の進行役」として出す。",
  },
  {
    id: 328,
    label: "回っている間に番の印を出す",
    patch: "m328-web-reveals-turn-while-spinning.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/turn-order-view.test.ts", "tests/turn-order.test.tsx"],
    note: "#401 順番に回す §5.3。回っている間に、いま選ばれる人の番の印を脇に出す（止まる前に結果が分かる）。",
  },
  {
    id: 329,
    label: "回が終わっても円盤を空にしない",
    patch: "m329-web-finished-keeps-wheel.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/turn-order-view.test.ts", "tests/turn-order.test.tsx"],
    note: "#401 順番に回す T3（案 A）。回が終わっても円盤を空にしない。",
  },
  {
    id: 330,
    label: "主ボタンが「最後の 1 人」にならない",
    patch: "m330-web-no-last-button.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/turn-order-view.test.ts", "tests/turn-order.test.tsx"],
    note: "#401 順番に回す T3。まだの人が 1 人でも主ボタンが「次の人を決める」のまま（回さずに出すことが伝わらない）。",
  },
  {
    id: 340,
    label: "止まった後の押下で上書きされる",
    patch: "m340-press-later-press-wins.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-press.test.ts"],
    note: "#401 押して止める P3。止まった後の押下も採る。後から押した人の位置で上書きされ、画面ごとに違う人が出る。",
  },
  {
    id: 341,
    label: "位置が逆向きに進む",
    patch: "m341-press-position-wrong-way.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-press.test.ts"],
    note: "#401 押して止める P2。位置が逆向きに進む。円盤の回る向きと指し針が指す席が食い違う。",
  },
  {
    id: 342,
    label: "30 秒で止まらない",
    patch: "m342-press-never-auto-stops.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-press.test.ts"],
    note: "#401 押して止める P5。誰も押さないと止まらない。部屋が回りっぱなしになる。",
  },
  {
    id: 343,
    label: "席の中の位置 1 を受ける",
    patch: "m343-press-settle-allows-one.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-press.test.ts"],
    note: "#401 押して止める P4。席の中の位置 1 を受ける。次の席の端と同じ位置になり、札と真鍮の席が隣の人を指しうる。",
  },
  {
    id: 344,
    label: "押した人の名前が載らない",
    patch: "m344-sync-stop-drops-presser.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#401 押して止める §4.1。同期サーバーが押した人の名前を載せない。「○○ さんが止めました」が出ない。",
  },
  {
    id: 345,
    label: "押した画面がその場で止まらない",
    patch: "m345-web-presser-keeps-spinning.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/press.test.tsx"],
    note: "#401 押して止める P3。押した画面がその場で止まらず、返事が来るまで回り続ける（押した位置と見えた位置が食い違う）。",
  },
  {
    id: 346,
    label: "ほかの画面が寄せずに跳ぶ",
    patch: "m346-web-others-jump.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/press.test.tsx"],
    note: "#401 押して止める P3。ほかの画面が寄せずに止まった位置へ跳ぶ。",
  },
  {
    id: 347,
    label: "名前の欄の Space で止まる",
    patch: "m347-web-space-in-input-stops.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/press.test.tsx"],
    note: "#401 押して止める P9。名前の欄で空白を打つと止まってしまう。",
  },
  {
    id: 348,
    label: "動きを減らす設定で回らない",
    patch: "m348-web-reduced-motion-stops-press.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/press.test.tsx"],
    note: "#401 押して止める P8。動きを減らす設定で円盤が回らない（このときも回すと決めた）。",
  },
  {
    id: 349,
    label: "同じ回転の止まった位置を捨てる",
    patch: "m349-web-sync-keeps-old-spin.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/use-roulette-sync.test.tsx", "tests/press.test.tsx"],
    note: "#401 押して止める。同じ回転のうちに届いた止まった位置を捨てる。ほかの人が止めても回り続ける。",
  },
  {
    id: 350,
    label: "自動の停止で札が空",
    patch: "m350-web-auto-stop-not-written.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/press-view.test.ts", "tests/press.test.tsx"],
    note: "#401 押して止める P5。30 秒の自動の停止を回転に書き込まない。一言は出るが、札と真鍮の席が空のまま。",
  },
  {
    id: 370,
    label: "止まり方が毎回出る",
    patch: "m370-style-hits-every-roll.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-stop-style.test.ts"],
    note: "#420 spec S3。1/24 の目を見ずに、毎回変わった止まり方を選ぶ（ごくまれでなくなる）。",
  },
  {
    id: 371,
    label: "止まり方で回転中の判定が延びない",
    patch: "m371-style-duration-not-extended.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-stop-style.test.ts"],
    note: "#420 spec S2。サーバーの回転中の判定が止まり方の分だけ延びない。画面が止まる前に次の回転を受け付ける。",
  },
  {
    id: 372,
    label: "wire の長さが止まり方を見ない",
    patch: "m372-view-duration-ignores-style.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-stop-style.test.ts"],
    note: "#420 spec S2・S5。wire の durationMs が延びない。画面が変わった止まり方の途中で結果を出す。",
  },
  {
    id: 373,
    label: "押して止めるにも止まり方を掛ける",
    patch: "m373-press-gets-style.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-stop-style.test.ts"],
    note: "#420 spec S4。押して止めるにも止まり方を載せる（押した位置と違う動きで嘘に見える）。",
  },
  {
    id: 374,
    label: "同期サーバーが止まり方を引かない",
    patch: "m374-sync-never-draws-style.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#420 spec S1。同期サーバーが止まり方の乱数を渡さない。変わった止まり方が一度も出ない。",
  },
  {
    id: 375,
    label: "画面が止まり方の延びを見ずに 2 人目を出す",
    patch: "m375-web-reveal-ignores-style.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/stop-style.test.tsx"],
    note: "#420 振る舞い 4。2 人以上のとき、真鍮の席・札の行が延びる前の時刻で決まる（円盤はまだ動いている）。",
  },
  {
    id: 376,
    label: "円盤が止まり方を描かない",
    patch: "m376-web-wheel-ignores-style.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/stop-style.test.tsx"],
    note: "#420 spec S1。円盤が止まり方を描かず普通に止まり、結果だけが遅れて出る。",
  },
  {
    id: 377,
    label: "止まり方の最後が当たりの位置からずれる",
    patch: "m377-motion-ends-off-seat.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/stop-style-motion.test.ts", "tests/stop-style.test.tsx"],
    note: "#420 振る舞い 3。じりじりの最後が当たりの席の位置まで進まない。止まった瞬間に跳ぶ。",
  },
  {
    id: 378,
    label: "動きの長さが core の表とずれる",
    patch: "m378-motion-length-off-table.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/stop-style-motion.test.ts"],
    note: "#420 spec S2。行き過ぎて戻るの動きが表より長い。結果が出た後も円盤が動いている（止まった瞬間に跳ぶ）。",
  },
  {
    id: 390,
    label: "自動公開が見学者を分母から外さない",
    patch: "m390-core-auto-reveal-counts-spectators.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。見学者が票を入れないので、残りが全員投票しても自動公開が立たない。",
  },
  {
    id: 391,
    label: "見学に切り替えても投票中の票を捨てない",
    patch: "m391-core-spectate-keeps-vote.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。見学者の票が集計に残る。",
  },
  {
    id: 392,
    label: "見学者の票を受ける",
    patch: "m392-core-cast-vote-accepts-spectator.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。spectating を返さず、見学者が投票できてしまう。",
  },
  {
    id: 393,
    label: "退出で見学の集合から外さない",
    patch: "m393-core-discard-keeps-spectator.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。退出した人が見学に残り、再入室しても見学のままになる。",
  },
  {
    id: 394,
    label: "commitRoomAction が名簿に居ない人を通す",
    patch: "m394-sync-commit-room-action-skips-roster-check.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/poker/commit-room-action.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。G-9。片付けで外された人の接続が状態を動かす。",
  },
  {
    id: 395,
    label: "remove-participant が接続中の人も外す",
    patch: "m395-sync-remove-participant-removes-connected.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/poker/commit-room-action.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。G-5。dispatch の門だけから接続中の対象を拒む条件を抜く。m395 は dispatch 側の門、m398 は removeFromRoom 側の門を守る。殺すテストは removeFromRoom を呼ばれたら throw するスタブにした commit-room-action.test.ts の dispatch 側の門。",
  },
  {
    id: 396,
    label: "removeFromRoom が timer の状態の無いルームで timers.put する",
    patch: "m396-sync-remove-from-room-creates-timer.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/poker/remove-participant.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。G-6。poker だけのルームに timer の初期状態ができ、のちの timer 入室の遅延生成（D8）が働かない。",
  },
  {
    id: 397,
    label: "shortParticipantId が先頭 4 文字を取る",
    patch: "m397-room-core-short-id-takes-head.patch",
    pkg: "packages/room-core",
    tests: ["tests/participant-label.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。先頭は p_ で全員同じなので、同名の呼び分けにならない。",
  },
  {
    id: 398,
    label: "removeFromRoom の二段目の門が接続中の対象を拒まない",
    patch: "m398-sync-remove-from-room-gate-skips-connected.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/room-removal.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。G-5。m395 は dispatch 側の門、m398 は removeFromRoom 側の門だけを守る。removeFromRoom の「接続中の対象を拒む条件」だけを外す（dispatch の門は触らない）ので、dispatch を通らずに直接呼ぶ単体テストだけが殺せる。",
  },
  {
    id: 410,
    label: "記録しない間も開票で行を足す",
    patch: "m410-core-reveal-records-when-off.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note: "#427 設計 D。**対応表より後に足した変異。** 410〜419 は #427 に割り当てた。記録のスイッチが開票に効かない。",
  },
  {
    id: 411,
    label: "切り替えで open の束を閉じない",
    patch: "m411-core-set-recording-keeps-open-group.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note: "#427 J7。しない間の行が前の束に混ざる。",
  },
  {
    id: 412,
    label: "束の名前の書き換えが最後の行だけを変える",
    patch: "m412-core-set-group-item-last-entry-only.patch",
    pkg: "packages/poker-core",
    tests: ["tests/estimate-log.test.ts"],
    note: "#427 設計 E。古い行の名前が残る。",
  },
  {
    id: 413,
    label: "同期サーバーが set-group-item を受けても名前を捨てる",
    patch: "m413-sync-set-group-item-drops-name.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/poker/estimate-log.test.ts"],
    note: "#427 設計 E。dispatch の枝が ok(round) を返し、束の名前が変わらない。",
  },
  {
    id: 414,
    label: "open の束が無くても開票後にポイントの欄を出す",
    patch: "m414-web-points-select-without-open-group.patch",
    pkg: "apps/poker-web",
    tests: ["tests/room-page-estimate.test.tsx"],
    note: "#427 設計 J8。記録していれば open の束が無くても帯にポイントの欄が出る。",
  },
  {
    id: 415,
    label: "poker が REMOVED_FROM_ROOM を未知のエラーとして帯に出す",
    patch: "m415-poker-removed-shown-as-unknown-error.patch",
    pkg: "apps/poker-web",
    tests: ["tests/room-page-redirect.test.tsx"],
    note: "#427 設計 A。外された・抜けた印を扱わず、組も接続も残して玄関へ戻らない。",
  },
  {
    id: 416,
    label: "1 回の回転で、すでに選んだ人を候補から外さない",
    patch: "m416-draw-repeats-within-spin.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/draw-picks.test.ts"],
    note: "#427 設計 F。1 回で決めるとき、1 回の回転の中で同じ人が 2 度選ばれる。",
  },
  {
    id: 417,
    label: "当たり以外の席にも winner の塗りを付ける",
    patch: "m417-wheel-non-winner-gets-winner-fill.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel.test.tsx"],
    note: "#427 設計 F。円盤の色が「当たりかどうか」を表さなくなる（全席が真鍮の地になる）。",
  },
  {
    id: 430,
    label: "次へが区切り ID を見ず、古い押下で区切りが飛ぶ",
    patch: "m430-next-ignores-step-id.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda.test.ts"],
    note: "#429 区切り ID が違う `next` を捨てず進めてしまう（古い押下で飛ぶ）。",
  },
  {
    id: 431,
    label: "区切りの所要から一時停止の時間が落ちる",
    patch: "m431-spent-excludes-pause.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda-invariant.test.ts"],
    note: "#429 区切りの所要を一時停止を除いた計時から計算する。所要は実時間であるべき。",
  },
  {
    id: 432,
    label: "終わる見込みに、飛ばした区切りの持ち時間が入る",
    patch: "m432-projection-counts-skipped.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/projection.test.ts"],
    note: "#429 終わる見込みに、飛ばした未開始の区切りの持ち時間を含める。",
  },
  {
    id: 433,
    label: "自動で次へが期限ではなく発火した時刻を境にし、発火の遅れを持ち込む",
    patch: "m433-auto-advance-starts-at-fire-time.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda.test.ts"],
    note: "#429 自動で次へが、期限ではなく発火した時刻を境にする。発火の遅れが次の区切りへ持ち込まれる。",
  },
  {
    id: 434,
    label: "延長が区切り ID を見ず、違う区切りの延長も受け付ける",
    patch: "m434-extend-ignores-step-id.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda.test.ts"],
    note: "#429 区切り ID が違う延長を捨てず、いまの区切りに適用してしまう。",
  },
  {
    id: 435,
    label: "一時停止中に次へを押すと、次の区切りが止まったまま始まる",
    patch: "m435-next-while-paused-stays-paused.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda.test.ts"],
    note: "#429 一時停止中の次へで、次の区切りが動いて始まらず一時停止のまま残る。",
  },
  {
    id: 436,
    label: "コマンドの検めが緩み、余計なフィールドを通す",
    patch: "m436-command-schema-loosened.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/schemas.test.ts"],
    note: "#429 `agenda.next` のコマンドの検めが `v.strictObject` から `v.object` に緩み、余計なフィールドを通す。",
  },
  {
    id: 437,
    label: "進行中でもシナリオを置き換えられる",
    patch: "m437-replace-allowed-while-running.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda.test.ts"],
    note: "#429 進行中でもシナリオの置き換えを許す。",
  },
  {
    id: 439,
    label: "ルーム破棄で進行タイマーの状態を消さない",
    patch: "m439-destroy-keeps-agenda.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/destroy-room.test.ts"],
    note: "#429 設計 §5.2。ルーム破棄で進行タイマーの状態を消さない。破棄したルームのコードを引き継いだ別のルームに、古い進行の状態が残る。",
  },
  {
    id: 440,
    label: "延長しても自動で次へ進む期限を張り直さない",
    patch: "m440-extend-does-not-rearm.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/agenda-handlers.test.ts"],
    note: "#429 延長しても期限を張り直さない。延長した区切りが、元の期限で自動で次へ進んでしまう。",
  },
  {
    id: 438,
    label: "ハブの層から進行タイマーのハンドラも呼ぶ",
    patch: "m438-hub-message-reaches-agenda.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.agenda.test.ts"],
    note: "#429 進行タイマーの層は『進行タイマーとして在席しているか』で 2 段目を守るので状態は変わらないが、ハブの接続が 2 通目の拒否を受け取る。5 種の接続で拒否が 1 通ずつであることを見る。",
  },
  {
    id: 441,
    label: "お題の宛先から進行タイマーの接続を外す",
    patch: "m441-topic-excludes-agenda.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.agenda.test.ts"],
    note: "#429 進行タイマーを開いている人に、お題の掲げ直しも取り下げも届かなくなる。#590 で一覧から導く形に作り直した。",
  },
  {
    id: 442,
    label: "進行タイマーの接続の受理で onConnect を通さない",
    patch: "m442-agenda-skips-on-connect.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.agenda.test.ts"],
    note: "#429 poker の早期 return に足す。レート制限の鍵が接続 ID に落ち、room.join の総当たりが接続を張り直すだけで枠を回避できる。",
  },
  {
    id: 443,
    label: "途中参加の画面へ届く経過が開始の瞬間で計られ 0 になる",
    patch: "m443-elapsed-sent-as-zero-on-join.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/agenda-handlers.test.ts"],
    note: "#429 状態を送るとき、経過を送る時点でなく開始の瞬間で計り、途中参加の画面の経過が 0 になる。publish の経路の経過にも効く。",
  },
  {
    id: 448,
    label: "表に戻ったとき agenda.sync を送らない",
    patch: "m448-visibility-does-not-resync.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/use-agenda-sync.test.tsx"],
    note: "#429 裏のタブで止まった時計が、次の操作かフレームまで直らない。表に戻ったときの 1 通を見る。",
  },
  {
    id: 444,
    label: "最初の描画で残りが 0 以下なら時打ちの合図を出す",
    patch: "m444-signal-on-first-view.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/timeout-signal.test.ts", "tests/agenda-room.test.tsx"],
    note: "#429 途中参加・再接続の画面が、過去に過ぎた 0 に対して鳴る。prev が null の 1 回を見る。",
  },
  {
    id: 446,
    label: "オーバー中の数字から「+」を落とす",
    patch: "m446-overrun-without-plus.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-view.test.ts"],
    note: "#429 残りとオーバーを見分ける手がかりが色だけになる（金と赤銅は明度がほぼ同じ）。",
  },
  {
    id: 447,
    label: "針をいまのステップの計時で進める",
    patch: "m447-needle-ignores-pause.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/dial-geometry.test.ts"],
    note: "#429 一時停止の間に針が止まり、内の環の先端と離れる。一時停止を挟んだ後でしか値が分かれないので、性質テストと一時停止の例で見る。",
  },
  {
    id: 450,
    label: "動きを減らす設定で針を描かない",
    patch: "m450-reduced-motion-hides-needle.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/dial.test.tsx"],
    note: "#429 timer の chrono-hand と同じ扱いにすると、押し巻きを読む要が盤から消える。",
  },
  {
    id: 445,
    label: "現在の版でない保存を移行せずに捨てる",
    patch: "m445-old-saved-version-dropped.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/saved-scenarios.test.ts"],
    note: "#429 版を上げたとき、利用者が端末に保存したシナリオが全部消える。偽の旧版を migrations に差し込んで読む。",
  },
  {
    id: 449,
    label: "玄関の札の ID が agenda の綴りとずれる",
    patch: "m449-hub-tool-id-mismatch-agenda.patch",
    pkg: "apps/landing",
    tests: ["tests/room-choice-layout.test.tsx"],
    note: "#429。在席の表示が進行タイマーに居る人を札の名前で出せず、「agenda にいます」と生の綴りが出る。型は綴りのずれを拾わない。#590 で一覧から導く形に作り直した。",
  },
  {
    id: 451,
    label: "操作を当てる前に自動で次へ進めない",
    patch: "m451-command-skips-advance-if-due.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/agenda-handlers.test.ts"],
    note: "#429 PR #431 のレビュー。期限を過ぎてから予約が発火するまでの隙に届いた操作が古い区切りに当たり、所要が持ち時間を超えて確定し、一時停止なら終わったはずの区切りで止まる。",
  },
  {
    id: 452,
    label: "最初からに戻すとき、展開済みの区切りをまた回数倍して展開する",
    patch: "m452-reset-expands-already-expanded-steps.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda.test.ts", "tests/agenda-invariant.test.ts"],
    note: "#429 第 2 段。`reset` が展開済みの区切りを定義として再展開すると、回数 3 の進行が戻すたびに 3 倍（N²）に増える。",
  },
  {
    id: 453,
    label: "合計の上限を 1 回あたりで見て、回数を掛けない",
    patch: "m453-total-limit-ignores-rounds.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/schemas.test.ts"],
    note: "#429 第 2 段。1 区切り 25 分 × 29 回（725 分）が 1 回あたり 25 分で通り、720 分の上限を回数で破れる（#455 で値を改めた）。",
  },
  {
    id: 454,
    label: "展開後の区切りの数の上限を見ない",
    patch: "m454-expanded-step-count-unchecked.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/schemas.test.ts"],
    note: "#429 第 2 段。4 区切り × 16 回（64 区切り）が定義の上限 40 以下で通り、展開後の上限 60 を破れる。",
  },
  {
    id: 455,
    label: "ルームのシナリオを下書きへ写すとき、展開済みの全部を写す",
    patch: "m455-view-copies-all-expanded-steps.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/scenario-draft.test.ts"],
    note: "#429 第 2 段。回数 6 の朝会が 6 区切り（回数なし）の下書きになり、読み込むたびに回数倍へ増える。",
  },
  {
    id: 456,
    label: "比べる鍵から回数を外す",
    patch: "m456-key-ignores-rounds.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/scenario-draft.test.ts"],
    note: "#429 第 2 段。回数だけ違う下書きがルームと同じに見え、読み込みや変更の知らせが働かない。",
  },
  {
    id: 457,
    label: "回数 1 でも rounds: 1 を送る",
    patch: "m457-draft-sends-rounds-one.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/scenario-draft.test.ts"],
    note: "#429 第 2 段。回数なしの定義と別の形になり、ルームとの比べが食い違う。",
  },
  {
    id: 458,
    label: "回の札を回数 1 でも出す",
    patch: "m458-round-badge-shows-for-single-round.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-view.test.ts"],
    note: "#429 第 2 段。回数 1 の盤の中央に「1 / 1 回」が出て、第 1 段の盤と変わる（回数 1 は第 1 段のまま、の反目標）。",
  },
  {
    id: 459,
    label: "進行表のいまの行へ scrollIntoView で合わせる",
    patch: "m459-step-list-scrolls-page.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/step-list.test.tsx", "tests/projection-view.test.tsx", "tests/rendered-text-fits-font-base.test.tsx"],
    note: "#429 第 2 段。scrollIntoView は祖先のページまで動かし、区切りが移るたびに盤がページの外へ出る。枠の scrollTop だけを動かす。",
  },
  {
    id: 460,
    label: "進行表の行の位置を測るとき、枠の scrollTop を足し戻さない",
    patch: "m460-step-list-ignores-box-scroll-top.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/step-list.test.tsx"],
    note: "#429 第 2 段。スクロール済みの枠では行の座標が scrollTop の分だけ手前に出る。足し戻さないと二段目の移動が足りず、いまの行が枠の外に残る。",
  },
  {
    id: 461,
    label: "下書きに中身があっても、確かめずにサンプルで置き換える",
    patch: "m461-sample-replaces-draft-unasked.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/scenario-builder.test.tsx"],
    note: "#429 フィードバック F3。組みかけの下書きが黙って消える。中身のある下書きでは「いまの下書きを消して読み込みますか」と確かめ、やめれば下書きはそのまま。",
  },
  {
    id: 462,
    label: "1 回あたり 1 ステップの回でも、回の見出しを出す",
    patch: "m462-single-step-rounds-show-headings.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/step-list.test.tsx"],
    note: "#429 フィードバック F4。朝会（1 ステップ × 6 回）で見出しと行が交互に並び、12 項目になって枠からはみ出してバーが出る。1 回あたり 1 ステップは見出しを出さず、行の番号に回の数を出す。",
  },
  {
    id: 463,
    label: "poker の index.html から og:image を外す",
    patch: "m463-poker-drops-og-image.patch",
    pkg: "apps/landing",
    tests: ["tests/index-html-exterior.test.ts"],
    note: "#434。Slack などに貼った poker のリンクに画像が出ず、文字だけの地味な紹介になる。",
  },
  {
    id: 464,
    label: "agenda の og:description を tools.ts と食い違わせる",
    patch: "m464-agenda-og-description-diverges.patch",
    pkg: "apps/landing",
    tests: ["tests/index-html-exterior.test.ts"],
    note: "#434。貼ったリンクの紹介文が玄関の説明と食い違い、同じ道具が場所によって違う説明で見える。",
  },
  {
    id: 465,
    label: "timer の index.html から icon・apple-touch-icon・manifest の link を外す",
    patch: "m465-timer-drops-icon-links.patch",
    pkg: "apps/landing",
    tests: ["tests/index-html-exterior.test.ts"],
    note: "#434。タブにアイコンが出ず、ホーム画面に追加しても既定の絵になる。",
  },
  {
    id: 466,
    label: "お題ツールの配信を try_files {path} /index.html に戻す",
    patch: "m466-topic-spa-fallback-hides-missing.patch",
    pkg: "apps/landing",
    tests: ["tests/caddy-fragment-order.test.ts"],
    note: "#434。消えた資材や存在しないファイルが index.html の 200 に化け、欠落に気づけず画面が壊れたまま表示される。",
  },
  {
    id: 467,
    label: "エラーの応答を no-cache に上書きする handle_errors を外す",
    patch: "m467-error-responses-keep-immutable.patch",
    pkg: "apps/landing",
    tests: ["tests/caddy-fragment-order.test.ts"],
    note: "#434。404 や将来のエラーページにも 1 年の immutable が付き、配布の途中に覚えた欠落を利用者のブラウザが 1 年持ち続ける。",
  },
  {
    id: 468,
    label: "security.txt の Expires を近い日付にする",
    patch: "m468-security-txt-expires-soon.patch",
    pkg: "apps/landing",
    tests: ["tests/site-files.test.ts"],
    note: "#434。期限が切れた security.txt は無効と読まれ、脆弱性を見つけた人が連絡先を失う。",
  },
  {
    id: 469,
    label: "robots.txt の Disallow を空にして全クローラを許可する",
    patch: "m469-robots-allows-all.patch",
    pkg: "apps/landing",
    tests: ["tests/site-files.test.ts"],
    note: "#434。個人・チーム用の道具が検索結果に出てしまい、意図せず公開された形になる。",
  },
  {
    id: 470,
    label: "immutable の header に match status 2xx を戻す",
    patch: "m470-header-match-status-returns.patch",
    pkg: "apps/landing",
    tests: ["tests/caddy-fragment-order.test.ts"],
    note: "#434。Caddy 2.6.2（当時の本番）は match を条件と読まず、validate も E2E も通ったまま 404 に 1 年の immutable が付いた。",
  },
  {
    id: 471,
    label: "audit-supply-chain-config が hoistWorkspacePackages: true を通す",
    patch: "m471-hoist-workspace-packages-accepts-true.patch",
    pkg: "scripts",
    tests: ["audit-supply-chain-config.test.mjs"],
    note:
      "#439。CI は仮想ストアを逃がさないので true でも緑のまま、逃がした手元の install だけが " +
      "ERR_PNPM_INVALID_DEPENDENCY_NAME で止まる。本番の pnpm-workspace.yaml は false なので、" +
      "この検出が消えても検査結果は変わらない（id 20 と同じ型）。",
  },
  {
    id: 472,
    label: "audit-supply-chain-config が lockFileMaintenance の無効を見ない",
    patch: "m472-lockfile-maintenance-unchecked.patch",
    pkg: "scripts",
    tests: ["audit-supply-chain-config.test.mjs"],
    note:
      "#444・docs/adr/0024 の追記。Renovate は推移依存の修正を lockFileMaintenance にしか届けないので、" +
      "消えても CI は緑のまま推移依存の勧告が放置される。本番の renovate.json は有効なので、" +
      "この検出が消えても検査結果は変わらない（id 20 と同じ型）。",
  },
  {
    id: 473,
    label: "audit-supply-chain-config が絞り込みを足した規則の待機期間の外しを通す",
    patch: "m473-lockfile-maintenance-age-release-widened.patch",
    pkg: "scripts",
    tests: ["audit-supply-chain-config.test.mjs"],
    note:
      "#444。待機期間を外してよいのは種類が lockFileMaintenance だけで絞り込みの無い規則に限る。" +
      "絞り込みを足した規則まで通すと、例外の形を借りて特定のパッケージの待機期間を外せる。",
  },
  {
    id: 474,
    label: "見出しの QR を閉じている間も作る（useInviteQr(inviteUrl, true)）",
    patch: "m474-qr-built-while-closed.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: "#447。開かない人まで qrcode を読み込み、閉じた欄に画像が残る。QR は開くまで生成ライブラリを読まない約束。",
  },
  {
    id: 475,
    label: "見出しの QR の欄から hidden を外す",
    patch: "m475-qr-region-not-hidden.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: "#447。閉じたはずの欄（準備中・失敗の案内）が見えたまま残り、ボタンの aria-expanded と見た目が食い違う。",
  },
  {
    id: 476,
    label: "QR のボタンの aria-controls が QR の欄ではなく包む欄を指す",
    patch: "m476-qr-toggle-controls-wrong-id.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: "#447。開閉する先の読み上げが嘘になる。試験は aria-controls から欄を引いて hidden を見るので、指す先がずれると赤くなる。",
  },
  {
    id: 477,
    label: "見出しの戻るリンクが backHref を使わず根へ飛ぶ",
    patch: "m477-back-link-ignores-back-href.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: "#447。ルームの選択画面ではなく玄関の入口へ戻され、ルームを離れる。",
  },
  {
    id: 478,
    label: "titleExtras を見出しの隣ではなく .ui-page-header の直下に置く",
    patch: "m478-title-extras-under-page-header.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: "#447。行の子が 3 つになり、両端寄せの並びで戻るリンクが真ん中に浮く（poker の「お題を隠す」「記録する」を差し込む画面で起きる）。",
  },
  {
    id: 479,
    label: "見出しの URL の欄に aria-label を付ける",
    patch: "m479-invite-url-with-aria-label.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: "#447。設計 R2。揃える向きは「付けない」。role の無い span の aria-label は読み上げの扱いが揺れ、見えている字と名前が二重になる。",
  },
  {
    id: 480,
    label: "玄関の札を作った順（topic が roulette の前）に戻す",
    patch: "m480-hub-tools-in-creation-order.patch",
    pkg: "apps/landing",
    tests: ["tests/App.test.tsx"],
    note: "#447。使う流れ（交代 → 見積もり → 進行 → お題 → 予定）と札の並びがずれる。",
  },
  {
    id: 481,
    label: "ルーレットの脇に「仲間を招く」を戻す（招待が二重）",
    patch: "m481-roulette-side-invite-returns.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/roulette-room.test.tsx"],
    note: "#447。設計 R1。招待が見出しと脇の二重になり、320px で脇の分だけ縦に伸びる。消した InviteLink は戻さず、同じ形の欄を書いて戻す。",
  },
  {
    id: 482,
    label: "agenda が映している間も共通の見出しを描く",
    patch: "m482-agenda-header-while-projecting.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/projection-view.test.tsx"],
    note: "#447。全画面の重ねの裏に押せるリンクとボタンが残り、Tab で映す表示から抜け出せる。",
  },
  {
    id: 483,
    label: "広い幅で「仲間を招く」を隠す規則の詳細度を (0,1,0) に戻す",
    patch: "m483-wide-invite-toggle-specificity-010.patch",
    pkg: "packages/ui",
    tests: ["tests/room-header-wide-toggle.test.mjs"],
    note:
      "#447。設計 R6。後に読み込む `.ui-button` の `display: inline-flex` が後勝ちし、広い幅にも開閉のボタンが出る。" +
      "jsdom は @media を解かないので部品の試験では見えず、実際の見え方は E2E（`e2e/specs/panels-headers.spec.ts` の" +
      "「1280×800 と 320×640」）が見る。E2E の spec は変異検査のランナー（e2e は vitest で tests/ だけ）に載らないので、" +
      "変異検査の中で拾う側として詳細度と読み込み順を字で読む試験を足した。",
  },
  {
    id: 484,
    label: "狭い幅で招待の欄をたたむ display: none を消す",
    patch: "m484-narrow-invite-fold-removed.patch",
    pkg: "packages/ui",
    tests: ["tests/room-header-wide-toggle.test.mjs"],
    note:
      "#447。設計 §8 R6。320px で開く前から招待の欄が出て見出しが約 210px 高くなり、ルーレットの止まった札が下端の帯に隠れる。" +
      "jsdom は @media を解かないので部品の試験では見えない。m483 と同じ理由で、変異検査の中で拾う側として 40rem 未満の規則を字で読む。",
  },
  {
    id: 485,
    label: "compact を受け取っても見出しに詰めた見た目のクラスを付けない",
    patch: "m485-room-header-compact-class-dropped.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: "#447 段 2。timer のセッションで見出しが通常の高さに戻り、広い幅では「仲間を招く」が消えて招待の欄が開いたまま出る。",
  },
  {
    id: 486,
    label: "詰めた見た目で 40rem 以上の「仲間を招く」を出す規則を消す",
    patch: "m486-compact-wide-invite-toggle-hidden.patch",
    pkg: "packages/ui",
    tests: ["tests/room-header-wide-toggle.test.mjs"],
    note:
      "#447 段 2。広い幅の timer のセッションで、招待の欄はたたまれたまま開くボタンも消え、招待に辿り着けない。" +
      "jsdom は @media を解かないので部品の試験では見えない。m483 と同じ理由で、変異検査の中で拾う側として 40rem 以上の規則を字で読む。",
  },
  {
    id: 487,
    label: "timer のセッションで見出しに compact を渡さない",
    patch: "m487-timer-session-not-compact.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.room-header.test.tsx"],
    note: "#447 段 2。見出しが通常の高さになり、390×844 で計器が下端の帯に潜る。",
  },
  {
    id: 488,
    label: "timer の完了の画面で見出しを描かない",
    patch: "m488-timer-header-hidden-on-celebration.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.room-header.test.tsx"],
    note: "#447 段 2。帯から戻るリンクを外したので、完了の画面からルームの選択画面へ戻る道が無くなる。",
  },
  {
    id: 489,
    label: "timer の休憩中に見出しを包む要素の inert を外す",
    patch: "m489-timer-header-not-inert-on-break.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.room-header.test.tsx"],
    note: "#447 段 2。休憩の覆いの裏の戻るリンクと「仲間を招く」に Tab で入れ、覆いから抜け出せる。",
  },
  {
    id: 490,
    label: "timer でルームを失っても見出しを描く",
    patch: "m490-timer-header-after-room-lost.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.room-header.test.tsx"],
    note: "#447 段 2。失ったルームの招待（コード・URL・QR）を配れてしまい、描かない帯とも食い違う。",
  },
  {
    id: 491,
    label: "timer の見出しの戻る先を /（ルームを付けない）にする",
    patch: "m491-timer-back-link-to-root.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.room-header.test.tsx"],
    note: "#447 段 2。ルームの選択画面ではなく玄関の入口へ戻され、ルームを離れる（m477 の、timer の配線の側）。",
  },
  {
    id: 492,
    label: "40rem 未満の詰めた見た目で道具名を隠す規則を消す",
    patch: "m492-compact-narrow-title-shown.patch",
    pkg: "packages/ui",
    tests: ["tests/room-header-wide-toggle.test.mjs"],
    note:
      "#447 段 2。見出しが 2 行（約 90px）になり、390×844 の timer のセッションで計器が下端の帯に潜る。" +
      "実際の見え方は E2E（`e2e/specs/layout.spec.ts` の timer の幅 390）が見るが、E2E の spec は変異検査のランナーに載らないので、" +
      "m483 と同じ理由で、変異検査の中で拾う側として 40rem 未満の規則を字で読む試験を足した。",
  },
  {
    id: 493,
    label: "詰めた見た目で幅によらず招待の欄をたたむ規則を消す",
    patch: "m493-compact-invite-fold-removed.patch",
    pkg: "packages/ui",
    tests: ["tests/room-header-wide-toggle.test.mjs"],
    note:
      "#447 段 2。広い幅の timer のセッションで開く前から招待の欄が出て見出しが高くなり、「仲間を招く」の aria-expanded と見た目が食い違う。" +
      "40rem 未満は通常の見た目のたたみの規則が重ねて隠すので、狭い幅では見えない。@media の外の規則を字で読む試験を足した。",
  },
  {
    id: 495,
    label: "開く前の席に各人の札を載せる",
    patch: "m495-view-leaks-others-card-before-reveal.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/projection.test.ts", "tests/projection-invariant.test.ts"],
    note: "#406 段 1。誰が何を出したかが開く前に全員へ届き、札を伏せる意味が無くなる（設計 §6・E5）。匿名をサーバーで守る変異。",
  },
  {
    id: 496,
    label: "匿名で開いた後の山に出した人の名前を載せる",
    patch: "m496-anonymous-piles-carry-names.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/projection.test.ts"],
    note: "#406 段 1。匿名を選んだ回で誰がどの札かが全員に分かる（設計 §6・E6）。匿名をサーバーで守る変異。",
  },
  {
    id: 497,
    label: "匿名で開いた後も受け手に自分の札を返す",
    patch: "m497-anonymous-reveal-keeps-your-card.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/projection.test.ts"],
    note: "#406 段 1。画面が自分の札の山を印すと、肩越しに見た人に自分の札が分かる（判断 7）。匿名をサーバーで守る変異。",
  },
  {
    id: 498,
    label: "札が出た後も公開の仕方を変えられる",
    patch: "m498-visibility-unlocked-after-play.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note: "#406 段 1。匿名のつもりで出した札が名前つきで開かれる（判断 5・E7）。匿名をサーバーで守る変異。",
  },
  {
    id: 499,
    label: "もう一回で前の回の公開の仕方を引き継ぐ",
    patch: "m499-again-keeps-visibility.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note: "#406 段 1。前の回で名前つきに切り替えた ROTI が、次の回も名前つきのまま始まる（判断 8）。",
  },
  {
    id: 500,
    label: "自動公開で players から見学者を除かない",
    patch: "m500-auto-reveal-counts-spectators.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note:
      "#406 段 1。見学者は札を出せないので、見学者が混じると全員が出しても開かない（E9）。" +
      "隣の「players が全員見学なら…開かない」はこの変異では赤にならない（除外の後の 0 人の判定を守る試験）。",
  },
  {
    id: 501,
    label: "くじの候補にいまのやり方を残す",
    patch: "m501-draw-includes-current-method.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note: "#406 段 1。引き直しても同じやり方が出る（E2）。",
  },
  {
    id: 502,
    label: "出し直しを受けず最初の札が残る",
    patch: "m502-replay-keeps-first-card.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note: "#406 段 1。札を選び直せない（E10）。",
  },
  {
    id: 503,
    label: "札を出す操作で回の番号を見ない",
    patch: "m503-stale-seq-applies.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note:
      "#406 段 1。もう一回の直後に届いた古い回の札が新しい回に入る（Review Focus 2）。" +
      "seq の検査を他の検査の後ろへ回す変形（playCard）も同じ試験が赤にすることを手で確かめた。setVisibility 側は m519 が受け持つ。",
  },
  {
    id: 504,
    label: "コマンドのスキーマが余計なフィールドを拒まない",
    patch: "m504-command-schema-loosened.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/schemas.test.ts"],
    note: "#406 段 1。v.strictObject を v.object に緩める。`docs/adr/0011` 決定 2 S3 の MUST に反する。",
  },
  {
    id: 505,
    label: "配信が受け手ごとでなく全員へ同じ投影を送る",
    patch: "m505-broadcast-one-view-to-all.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/checkin-handlers.test.ts"],
    note: "#406 段 2。開く前に名簿の先頭の人の札が全員へ届く（設計 §6・E5）。匿名をサーバーで守る変異。",
  },
  {
    id: 506,
    label: "札を出す人をチェックインでなくルームの在席で数える",
    patch: "m506-players-by-presence-not-tool.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/checkin-handlers.test.ts"],
    note: "#406 段 2。分母の誤り（選択画面〔ハブ〕だけに居る人が数えられ、チェックインを開いている全員が出しても開かない。判断 10）。匿名の漏れではなく、自動で開く判断が狂う実害を固定する。",
  },
  {
    id: 507,
    label: "名簿の変化で自動公開を測り直さない",
    patch: "m507-roster-change-skips-auto-reveal.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/checkin-handlers.test.ts"],
    note: "#406 段 2。最後のまだの人がタブを閉じても、残った全員が出していながら開かない（Review Focus 3）。",
  },
  {
    id: 508,
    label: "合成ルートで名簿の変化をチェックインへ渡さない",
    patch: "m508-roster-hook-unwired.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.checkin.test.ts"],
    note: "#406 段 2。ハンドラの試験は rosterChanged を直に呼ぶので緑のまま。実 WS で、まだの人が閉じても開かないことを見る（Review Focus 3）。",
  },
  {
    id: 509,
    label: "チェックインの接続の受け口がハブの層へ渡す",
    patch: "m509-hub-message-reaches-checkin.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/ws-adapter-tool-query.test.ts", "test/live-ws.checkin.test.ts"],
    note: "#406 段 2。?tool=checkin の振り分けを崩す。チェックインの接続の札の操作がハブの層で拒まれる。",
  },
  {
    id: 510,
    label: "ルーム破棄でチェックインの状態を消さない",
    patch: "m510-destroy-keeps-checkin.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/destroy-room.test.ts"],
    note: "#406 段 2。破棄したルームのコードを引き継いだ別のルームに、古い回の札が残る。",
  },
  {
    id: 511,
    label: "お題の宛先からチェックインの接続を外す",
    patch: "m511-topic-excludes-checkin.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.checkin.test.ts"],
    note: "#406 段 2。チェックインを開いている人に、お題の掲げ直しも取り下げも届かなくなる。#590 で一覧から導く形に作り直した。",
  },
  {
    id: 512,
    label: "チェックインの接続の受理で onConnect を通さない",
    patch: "m512-checkin-skips-on-connect.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.checkin.test.ts"],
    note: "#406 段 2。poker の早期 return に足す。レート制限の鍵が接続 ID に落ち、room.join の総当たりが接続を張り直すだけで枠を回避できる。",
  },
  {
    id: 519,
    label: "公開の仕方を変える操作で回の番号を見ない",
    patch: "m519-stale-seq-sets-visibility.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note:
      "#406 段 1。古い回の「名前つきにする」が既定が匿名の新しい回に当たり、匿名のつもりで出す札が名前つきで開かれる（判断 5・8）。" +
      "帯の予備を統括の判断で使った（匿名の保護に直結する）。",
  },
  {
    id: 520,
    label: "開いた回の prune が札を落とす",
    patch: "m520-revealed-prune-drops-cards.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts", "tests/projection.test.ts", "tests/projection-invariant.test.ts"],
    note:
      "#406 最終レビューの修正。匿名で開いた後に誰かが退出すると、前後 2 枚のフレームの山の差で抜けた人の札が分かる。" +
      "同期サーバーの試験（checkin-handlers.test.ts の〈m520〉）も赤になるが、宣言はパッケージ 1 つに絞る。帯の予備を統括の判断で使った。",
  },
  {
    id: 521,
    label: "公開の仕方を変えても回の番号を進めない",
    patch: "m521-visibility-change-keeps-seq.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note:
      "#406 PR の自動レビューの修正。匿名の画面で押した札が、先に届いた「名前つき」の後の回に受理され、名前が付いて開かれる（判断 5・設計 §6）。" +
      "同期サーバーの試験（checkin-handlers.test.ts の〈m521〉）も赤になるが、宣言はパッケージ 1 つに絞る。帯を 521 まで広げた（統括の判断）。",
  },
  {
    id: 522,
    label: "やり方を選ぶ・引く操作で置き換える回の番号を見ない",
    patch: "m522-method-ignores-replaced-seq.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note:
      "#406 PR の自動レビューの修正。ほぼ同時の「ランダム」2 回や開いたままの選択画面からの押下が、札の入った新しい回を黙って捨てる。" +
      "同期サーバーの試験（checkin-handlers.test.ts の〈m522〉）も赤になるが、宣言はパッケージ 1 つに絞る。統括の判断で帯の外に 1 本足した。",
  },
  {
    id: 523,
    label: "切断による自動公開に猶予を置かない",
    patch: "m523-disconnect-reveals-without-grace.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/checkin-handlers.test.ts"],
    note:
      "#406 PR のレビューの修正。まだの人が再読み込みで一瞬切れただけで匿名の回が開き、戻った人には山 1 枚で残った人の札が分かる（ADR 0028）。" +
      "統括の判断で帯を 523 まで広げた。",
  },
  {
    id: 513,
    label: "見学中も手札を出す",
    patch: "m513-spectator-sees-hand.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/checkin-room.test.tsx", "tests/hand.test.tsx"],
    note: "#406 段 3。札を出す人に数えない見学者が札を押せ、見学をやめるも出ない（E9・判断 10）。",
  },
  {
    id: 514,
    label: "動きを減らす設定でも札の裏返る遅れを付ける",
    patch: "m514-reduced-motion-still-staggers.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/reveal-view.test.ts"],
    note: "#406 段 3。E12。RevealBoard は reduced で遅れを渡さないので画面の試験は緑のまま。純粋関数 revealSchedule の契約を守る変異。",
  },
  {
    id: 515,
    label: "誰かが出したあとも公開の仕方を押せる",
    patch: "m515-visibility-toggle-enabled-when-locked.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/prompt-panel.test.tsx", "tests/checkin-room.test.tsx"],
    note: "#406 段 3。サーバーは LOCKED で拒むが、押せる見た目が「変えられる」と誤らせる（E7・判断 5）。",
  },
  {
    id: 516,
    label: "同数の最多の山の最初の 1 つだけを強調する",
    patch: "m516-top-pile-first-only.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/reveal-view.test.ts", "tests/reveal-board.test.tsx"],
    note: "#406 段 3。割れているのに札の順で先の 1 つが勝ったように見え、要約も「ずつ」にならない（設計 §5）。",
  },
  {
    id: 517,
    label: "開く動きを席の側で起こす",
    patch: "m517-flip-at-seats.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/reveal-board.test.tsx"],
    note:
      "#406 段 3。席の行を開く動きの板の中に置き、出した席の伏せ札を山と同じ動きで裏返す。匿名で席と札が結びついて見える（Review Focus 1）。" +
      "試験は 3.5 の修正で CheckinRoom に組んだ開いた後を reveal-board.test.tsx の中で描く。",
  },
  {
    id: 518,
    label: "玄関の札の ID が同期サーバーの綴り（checkin）とずれる",
    patch: "m518-hub-tool-id-mismatch-checkin.patch",
    pkg: "apps/landing",
    tests: ["tests/room-choice-layout.test.tsx"],
    note:
      "#406 段 4。m169・m449 と同じ型。札の id を引く在席の表示が、知らない綴りを生のまま「checkin にいます」と出す。#590 で一覧から導く形に作り直した（型は TOOLS から導かれるので、綴りのずれを型は拾えない。検出はテストが担う）。",
  },
  {
    id: 540,
    label: "役の判定で A-2-3-4-5 をストレートと認めない",
    patch: "m540-wheel-straight-not-recognized.patch",
    pkg: "packages/poker-core",
    tests: ["tests/hand-rank.test.ts"],
    note: "#403。A を 1 として使うストレートがハイカードに落ちる。",
  },
  {
    id: 541,
    label: "ゲームの投影で、開く前の手を全員へ載せる",
    patch: "m541-table-leaks-hands-before-show.patch",
    pkg: "packages/poker-core",
    tests: ["tests/snapshot-game.test.ts"],
    note: "#403 G-3。配った瞬間に他人の札が手元の JS に届く（隠しモードの手の秘匿が崩れる）。",
  },
  {
    id: 542,
    label: "全員 ☕ の開票 1 回でゲームを始める",
    patch: "m542-coffee-entry-starts-on-first.patch",
    pkg: "packages/poker-core",
    tests: ["tests/coffee-entry.test.ts"],
    note: "#403 E-1・E-2。普段の見積もりで全員がコーヒーブレイクを出しただけで隠しモードに入る。",
  },
  {
    id: 543,
    label: "チェンジを何度でも受ける",
    patch: "m543-exchange-twice.patch",
    pkg: "packages/poker-core",
    tests: ["tests/card-game.test.ts"],
    note: "#403 G-6。1 回だけの約束が崩れ、引き直しで役を作れる。",
  },
  {
    id: 544,
    label: "ゲームの最中も見積もりの操作を通す",
    patch: "m544-vote-during-game.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/poker/card-game.test.ts"],
    note: "#403 G-11。テーブルに隠れた画面の裏で見積もりが動く。拒むのは振り分けの受けてよい操作の一覧 1 か所（コードレビュー 2026-10-28 の指摘 7 でドメインの 4 か所から寄せた）。",
  },
  {
    id: 545,
    label: "ゲームの最中も見積もりの帯を出す",
    patch: "m545-estimate-dock-during-game.patch",
    pkg: "apps/poker-web",
    tests: ["tests/room-page-card-table.test.tsx"],
    note: "#403 設計 §5.2。押しても table-in-play で拒まれるだけのボタンが並ぶ。",
  },
  {
    id: 546,
    label: "切れた人を猶予なしで待たない",
    patch: "m546-reveal-ignores-away-grace.patch",
    pkg: "packages/poker-core",
    tests: ["tests/card-game.test.ts"],
    note: "#403 G-8a。一瞬の切断で、その人のチェンジを待たずに全員の手が開く（コードレビュー 2026-10-28 の指摘 2）。",
  },
  {
    id: 547,
    label: "テーブルの操作を返事の前にもう一度送れる",
    patch: "m547-exchange-sent-twice.patch",
    pkg: "apps/poker-web",
    tests: ["tests/card-table.test.tsx"],
    note: "#403。二重送信で正しい操作のあとに「チェンジは 1 回だけです」が出る（コードレビュー 2026-10-28 の指摘 3）。",
  },
  {
    id: 548,
    label: "テーブルの読み込みの失敗を受け止めない",
    patch: "m548-table-load-failure-unhandled.patch",
    pkg: "apps/poker-web",
    tests: ["tests/room-page-card-table-fallback.test.tsx"],
    note: "#403。ルーム画面ごと消え、ゲームを終える操作も失う（コードレビュー 2026-10-28 の指摘 1）。",
  },
  {
    id: 530,
    label: "長い会の境目を 180 分ちょうどから外す（`>=` を `>`）",
    patch: "m530-long-clock-threshold-exclusive.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-view.test.ts"],
    note: "#455。設計 §3.1。予定の合計がちょうど 180 分の会が m:ss（180:00）で出る。境目は「以上」と決めた。",
  },
  {
    id: 531,
    label: "時計の書き方を会でなく値の大きさで決める",
    patch: "m531-clock-style-per-value.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-view.test.ts"],
    note: "#455。設計 §3.1。同じ会の中で 1 時間をまたぐと桁の形が変わり（59:59 の次が 1:00:00）、長い会でも 1 時間未満の値が m:ss になる。書き方は会ごとに 1 つと決めた。",
  },
  {
    id: 532,
    label: "時計の書き方を延長込みの見込みで決める",
    patch: "m532-clock-style-from-projection.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-view.test.ts"],
    note: "#455。設計 §3.1。179 分の会を延長すると途中で h:mm:ss へ切り替わり、進行中に桁の形が変わる。",
  },
  {
    id: 533,
    label: "h:mm:ss の分を 2 桁に詰めない",
    patch: "m533-hms-minutes-not-padded.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-view.test.ts"],
    note: "#455。3 時間 5 分 9 秒が 3:5:09 と出て、桁の位置が揺れる。",
  },
  {
    id: 534,
    label: "結果の一覧が会の書き方を見ず、いつも m:ss で書く",
    patch: "m534-summary-table-always-mss.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/summary-table.test.tsx"],
    note: "#455。長い会の一覧が 180:00 のように m:ss で出て、文字盤の h:mm:ss と食い違う。",
  },
  {
    id: 535,
    label: "長い会の数字に dial-time--hms を付けない",
    patch: "m535-dial-time-without-hms-class.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/dial.test.tsx"],
    note: "#455。設計 §3.3。h:mm:ss の数字（最長 8 字）が m:ss の字の大きさのまま出て、文字盤の読む欄（盤の 56%）に収まらない。jsdom は大きさを測らないので、クラスの有無で見る。",
  },
  {
    id: 536,
    label: "回数 1 の進行表は行が多くても枠を持たない",
    patch: "m536-flat-list-never-scrolls.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/step-list.test.tsx"],
    note: "#455。定義の上限が 40 になり、回数 1 の 40 行が枠なしで縦に伸びて文字盤を押し下げる。20 行を超えたら枠を持つ。",
  },
  {
    id: 537,
    label: "回の見出しを枠の有無から導く",
    patch: "m537-grouped-follows-scrolling.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/step-list.test.tsx"],
    note: "#455。回数 1 で 21 行を超えて枠を持つと「1 回」の見出しが出る。見出しは回数 2 以上で 1 回に 2 ステップ以上のときだけ。",
  },
  {
    id: 538,
    label: "ステップを足せる条件を 1 つずらし、41 行目を足せる",
    patch: "m538-add-step-allows-one-over.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/scenario-draft.test.ts", "tests/scenario-builder.test.tsx"],
    note: "#455。組む画面で定義の上限 40 を超えて足せ、送ると `checkDraft` がスキーマで止めて汎用の理由を出す。",
  },
  {
    id: 539,
    label: "開始を押した本人かを見ず、進行中に変わった全員の画面を寄せる",
    patch: "m539-start-arrival-for-everyone.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-room.test.tsx"],
    note: "#455。他の参加者が開始した画面（位相が進行中に変わっただけ）までページの先頭へ戻し、読んでいる途中の画面が勝手に動く。",
  },
  {
    id: 549,
    label: "切断の猶予の締切が過ぎても予約を返す",
    patch: "m549-away-deadline-includes-past.patch",
    pkg: "packages/poker-core",
    tests: ["tests/card-game.test.ts"],
    note: "#403 G-8a。残り 0 の予約がその場で発火し続け、同期サーバーがスタックの溢れで落ちる（コードレビュー 2026-10-29 の Critical）。sync の `test/poker/card-game-grace.test.ts` も本物の Scheduler で同じ場面を見る。",
  },
  {
    id: 550,
    label: "送った後の封鎖を、エラーと接続の切り替わりで解かない",
    patch: "m550-lock-kept-after-error.patch",
    pkg: "apps/poker-web",
    tests: ["tests/card-table.test.tsx"],
    note: "#403。拒まれた・失われた操作のあとも押せないまま残り、ゲームが止まる（コードレビュー 2026-10-29）。",
  },
  {
    id: 560,
    label: "束の中で先に足した名前と比べない",
    patch: "m560-batch-checks-only-existing.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-guest-batch.test.ts"],
    note: "#458。`addGuests` が同名の相手を呼ぶ前のゲストだけにし、束の中の表記違いの同じ名前（alice と ALICE）が 2 人とも入る。",
  },
  {
    id: 561,
    label: "同名が 1 人でもいれば束の全員を飛ばす",
    patch: "m561-batch-rejects-on-conflict.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-guest-batch.test.ts"],
    note: "#458。同名だけを飛ばして残りを足す決まりを、1 人でも同名がいれば何も足さない形に変える。いつものメンツの大半が在室していると誰も入らない。",
  },
  {
    id: 562,
    label: "束の同名の判定を在室の参加者だけと比べる",
    patch: "m562-batch-compares-present-only.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-guest-batch.test.ts"],
    note: "#458。比べる相手は名簿の全参加者（在室を問わない・`addGuest` と同じ）。在室だけにすると、席を外した参加者と同じ名前のゲストが入り、戻ったときに同じ名前が 2 人になる。",
  },
  {
    id: 563,
    label: "上限で入らない名前を skipped に数える",
    patch: "m563-batch-overflow-counted-as-skipped.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-guest-batch.test.ts"],
    note: "#458。ゲストの上限で入らなかった名前を「同名で飛ばした」と数え、画面の知らせが「もういる」と誤る。`planBatch` が同じ関数を呼ぶので apps/roulette-web/tests/regulars-view.test.ts でも赤になる（宣言の pkg は 1 つなので tests は中核の試験だけ）。",
  },
  {
    id: 564,
    label: "addMany の境界で束の大きさを縛らない",
    patch: "m564-batch-schema-unbounded.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/schemas.test.ts"],
    note: "#458。`v.maxLength(MAX_GUESTS)` を外すと、名前の規約を当てる前に巨大な配列がサーバーへ通る。",
  },
  {
    id: 565,
    label: "1 回で決めるときの主ボタンが入る人の上限を見ない",
    patch: "m565-spin-allows-over-wheel.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/roulette-view.test.ts"],
    note: "#458。いつものメンツを入れて入る人が 25 人以上になっても回すボタンが押せ、サーバーが拒む（円盤は 24 席まで）。",
  },
  {
    id: 566,
    label: "順番に回す回の途中も入る人の総数で上限を見る",
    patch: "m566-order-blocks-mid-round.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/turn-order-view.test.ts"],
    note: "#458。回の途中は「まだの人」で見る。総数で見ると、途中で人が増えて総数が 25 人以上になっただけで、まだの人が 24 人以下でも回の続きを押せない。",
  },
  {
    id: 567,
    label: "読めない保存のときも空として書き込む",
    patch: "m567-regulars-overwrites-unreadable.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-storage.test.ts"],
    note: "#458。設計 §5。壊れた JSON・知らない版の保存を空とみなして上書きし、新しい版の画面が書いた組を消す。",
  },
  {
    id: 568,
    label: "書き戻しで合わない項目を捨てる",
    patch: "m568-regulars-drops-invalid-items.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-storage.test.ts"],
    note: "#458。設計 §5。今の版で読めない項目を書き戻しで落とし、別の版の画面が持つ組を消す。",
  },
  {
    id: 569,
    label: "名前の列の重複を文字列の完全一致でだけ畳む",
    patch: "m569-regulars-parse-keeps-duplicates.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-storage.test.ts"],
    note: "#458。`foldMembers` が `conflictsWithExisting` を使わず、NFKC の後に大小だけが違う同じ名前を 2 人として残す（参加の重複拒否と食い違う）。`parseMemberLines` と `saveGroup` の両方を通る。",
  },
  {
    id: 570,
    label: "同期サーバーが束の名前に表示名の規約を当てない",
    patch: "m570-sync-batch-skips-name-rule.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#458。`roulette.guest.addMany` が `applyDisplayNameRule` を通さず生の名前を足す。制御文字や見えない名前が円盤に入り、正規化しないので同名の判定もすり抜ける。",
  },
  {
    id: 571,
    label: "入れた後に札へフォーカスを戻さない",
    patch: "m571-insert-focus-lost.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-section.test.tsx"],
    note: "#458。入れると usedAt が変わって札が先頭へ移り、要素が付け替わってフォーカスが body へ落ちる。キーボードで続けて操作できない。",
  },
  {
    id: 572,
    label: "上限を足す前の件数で比べる",
    patch: "m572-batch-cap-compares-before-batch.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-guest-batch.test.ts"],
    note: "#458。設計 §8。`addGuests` が上限を `state.guests.length`（束を足す前）で比べ、ゲスト 20 人に 8 人を渡すと 28 人入る。",
  },
  {
    id: 580,
    label: "やり方の選択の札の行を 1fr で揃えない",
    patch: "m580-picker-rows-not-equalized.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/picker-layout-css.test.ts"],
    note: "#468 D1。説明文の長さで札の高さがばらつく。jsdom は配置を測れないので宣言で守り、実測は E2E（checkin.spec.ts）。",
  },
  {
    id: 581,
    label: "回が無いときも「新しい回が始まります」を札の説明に結ぶ",
    patch: "m581-picker-note-always-shown.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/method-picker.test.tsx"],
    note: "#468 D5。回が無いのに「いまの回の札は消えます」と偽る。",
  },
  {
    id: 582,
    label: "狭い幅でも札を 4 列にする",
    patch: "m582-picker-four-columns-always.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/picker-layout-css.test.ts"],
    note: "#468 D2。320px で札が潰れる。",
  },
  {
    id: 583,
    label: "見出しの行の「いまの回に戻る」を右に寄せない",
    patch: "m583-picker-back-not-right-aligned.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/picker-layout-css.test.ts"],
    note: "#468 D5。狭い幅で折り返した「いまの回に戻る」が左端に落ちる。右寄せを共有部品へ戻して checkin の規則を消す変更も捕まえる。",
  },
  {
    id: 590,
    label: "チェックと手入力の重複を畳まない",
    patch: "m590-build-members-keeps-checked-duplicates.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-view.test.ts"],
    note: "#469。`orderedMembers` がチェックした人と手入力の重複を畳まない。同じ人が二度入る。",
  },
  {
    id: 591,
    label: "直す欄の振り分けが完全一致",
    patch: "m591-split-matches-exact-only.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-view.test.ts"],
    note: "#469。`splitForEdit` の照合が完全一致。大小・全角違いの名前が手入力へ重なる。",
  },
  {
    id: 592,
    label: "入らなかった人の名前を知らせに持たない",
    patch: "m592-batch-notice-drops-overflow-names.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-view.test.ts"],
    note: "#469。`planBatch` が入らなかった人の名前を持たず、知らせが数だけになる。",
  },
  {
    id: 593,
    label: "候補が同名の twin を畳まない",
    patch: "m593-candidates-keep-twins.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-view.test.ts"],
    note: "#469。`candidatesOf` が名簿とゲストの同名を 1 人にまとめない。",
  },
  {
    id: 594,
    label: "押せない行も戻す対象にする",
    patch: "m594-restore-picks-disabled-row.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-view.test.ts"],
    note: "#469。`restoreOf` が押せない行も戻す対象にし、知らせが嘘をつく。",
  },
  {
    id: 595,
    label: "保存順を候補側に書き換える",
    patch: "m595-ordered-members-uses-candidate-order.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-view.test.ts"],
    note: "#469。`orderedMembers` が保存済みの順と綴りを保たない。",
  },
  {
    id: 596,
    label: "同名の行の片方が入っていても戻す",
    patch: "m596-restore-ignores-checked-twin.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-view.test.ts"],
    note: "#469。`restoreOf` が twin の片方が入っていても外れた行を戻す。",
  },
  {
    id: 597,
    label: "戻した人を入る人の数に足さない",
    patch: "m597-notice-pool-ignores-restored.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-view.test.ts"],
    note: "#469。知らせの入る人の数に戻した人を足さない。",
  },
  {
    id: 600,
    label: "parseRoomRoute が先頭の base を確かめない",
    patch: "m600-room-route-base-not-checked.patch",
    pkg: "packages/room-core",
    tests: ["tests/room-route.test.ts"],
    note: "#470。`parseRoomRoute` が pathname の先頭が base かを見ずに長さだけで切る。他アプリの base や大文字違いのパスが入口として通ってしまう。",
  },
  {
    id: 601,
    label: "玄関への道が理由を別の名前で運ぶ",
    patch: "m601-room-route-hub-drops-departure.patch",
    pkg: "packages/room-core",
    tests: ["tests/room-route.test.ts"],
    note: "#470。`roomHubPath` が `DEPARTURE_PARAM` でなく別の名前で理由を運ぶ。玄関が読めず退出の告知が出ない。",
  },
  {
    id: 605,
    label: "届かない帯も status で出す",
    patch: "m605-banner-unreachable-is-status.patch",
    pkg: "packages/web-kit",
    tests: ["tests/connection-banner.test.tsx"],
    note: "#471。`ConnectionBanner` が届かないでも `role=\"status\"` で出し、割り込みで読まれるべき「繋がらない」が静かな更新に埋もれる。",
  },
  {
    id: 606,
    label: "同期できていないに再接続中の文を当てる",
    patch: "m606-notice-stale-says-reconnecting.patch",
    pkg: "packages/web-kit",
    tests: ["tests/connection-banner.test.tsx"],
    note: "#471。`connectionNotice('stale')` が再接続中の文を返し、画面が古いままなのに待てば戻ると伝える。文は手で書いた文字列と比べる。",
  },
  {
    id: 607,
    label: "agenda の帯へ notice を渡さない",
    patch: "m607-agenda-banner-not-wired.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-room.test.tsx"],
    note: "#471。進行中の画面の `ConnectionBanner` へ同期フックの `notice` を渡さず、切断しても告知が出ない（寄せる前の agenda の欠陥そのもの）。",
  },
  {
    id: 608,
    label: "agenda の入室前の画面に帯を描かない",
    patch: "m608-agenda-joining-without-banner.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-room.test.tsx"],
    note: "#471（#472 で部品へ寄せたのでパッチを作り直し）。入室前の画面（見出しだけ）で帯を渡さず、同期サーバーに繋がらないまま理由が伝わらない。",
  },
  {
    id: 609,
    label: "映している間も帯を映す表示の外に描く",
    patch: "m609-banner-outside-projection.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/projection-view.test.tsx"],
    note: "#471 レビュー。映している間も告知の帯を映す表示の外（手前）に描き、fixed・全面の映す表示に覆われて切断が伝わらない。",
  },
  {
    id: 610,
    label: "参加中の画面で帯の位置の指定を無視する",
    patch: "m610-joining-banner-placement-ignored.patch",
    pkg: "packages/web-kit",
    tests: ["tests/room-gate.test.tsx"],
    note: "#472。`RoomJoiningView` が帯の位置の指定を無視して常に main の中へも描く。main の前に置くアプリ（roulette・topic）で帯が 2 重に出る。",
  },
  {
    id: 611,
    label: "ルームが無い画面の見出しを h1 にしない",
    patch: "m611-gone-heading-not-h1.patch",
    pkg: "packages/web-kit",
    tests: ["tests/room-gate.test.tsx"],
    note: "#472。`RoomGoneView` の見出しが h2 になり、ページの見出しの階層が壊れる（読み上げの見出し一覧に出ない）。",
  },
  {
    id: 612,
    label: "玄関への送り返しで理由つきを後回しにする",
    patch: "m612-hub-redirect-drops-departure.patch",
    pkg: "packages/web-kit",
    tests: ["tests/use-hub-redirect.test.tsx"],
    note: "#472。`useHubRedirect` が玄関が要る判定を理由つきの判定より先に見て、外された人に理由が運ばれない（玄関が告知を出せない・#290）。",
  },
  {
    id: 613,
    label: "動きを減らす設定を最初の描画で読まない",
    patch: "m613-reduced-motion-initial-ignored.patch",
    pkg: "packages/web-kit",
    tests: ["tests/use-prefers-reduced-motion.test.tsx"],
    note: "#472。`usePrefersReducedMotion` の初期値が常に false で、動きを減らす設定の人に、変化が来るまで回転が見える。",
  },
  {
    id: 614,
    label: "読み込み中の一言から status の役割を外す",
    patch: "m614-loading-view-without-status-role.patch",
    pkg: "packages/web-kit",
    tests: ["tests/room-gate.test.tsx"],
    note: "#472。`LoadingView` の一言が `role=\"status\"` を持たず、読み上げに「読み込んでいます」が伝わらない。",
  },
  {
    id: 615,
    label: "poker の告知で everConnected を固定する",
    patch: "m615-poker-notice-ever-connected-fixed.patch",
    pkg: "apps/poker-web",
    tests: ["tests/connection-banner-wiring.test.tsx"],
    note: "#471。poker の `notice` が `everConnected: true` 固定で、一度も繋がらないのに「再接続中」と出し、繋がらないことが伝わらない。",
  },
  {
    id: 616,
    label: "poker の告知で failedAttempts を固定する",
    patch: "m616-poker-notice-failed-attempts-zero.patch",
    pkg: "apps/poker-web",
    tests: ["tests/connection-banner-wiring.test.tsx"],
    note: "#471。poker の `notice` が `failedAttempts: 0` 固定で、失敗が続いても「繋がらない」へ移らない。",
  },
  // 620〜627: 変異検査を分けて流す仕組み（#481・設計正本 docs/superpowers/specs/2026-10-31-ci-wait-design.md §5.5）。
  // **ここが崩れると変異の一部が黙って流れなくなり、CI は緑のまま検出力だけが落ちる**ので、分け方そのものを変異させる。
  {
    id: 620,
    label: "分け方が最後の分け前に配らない",
    patch: "m620-partition-skips-last-part.patch",
    pkg: "scripts",
    tests: ["lib/mutation-partition.test.mjs"],
    note: "#481。最後のシャード（ワーカー）が空になり、0 件の緑で終わる。空にしない約束（組の数 ≥ n なら空にならない）が守る。",
  },
  {
    id: 621,
    label: "対照の組の鍵から tests を落とす",
    patch: "m621-control-group-ignores-tests.patch",
    pkg: "scripts",
    tests: ["lib/mutation-partition.test.mjs"],
    note: "#481。同じ pkg で tests の違う変異が 1 つの組にまとまり、重さを見誤る。対照の使い回しの鍵（controlKeyOf）とずれる。",
  },
  {
    id: 622,
    label: "分け方が置き場の中で組の重さを見ず、鍵の順だけで配る",
    patch: "m622-partition-ignores-weight.patch",
    pkg: "scripts",
    tests: ["lib/mutation-partition.test.mjs"],
    note: "#481。重い組が 1 つのシャードに固まり、そのシャードが律速になる（正しさは崩れないが、分けた意味が薄れる）。",
  },
  {
    id: 623,
    label: "--shard の k が n を超えても通す",
    patch: "m623-shard-index-over-total.patch",
    pkg: "scripts",
    tests: ["lib/mutation-select.test.mjs"],
    note: "#481。`--shard 5/4` が範囲の外の分け前（undefined）を選び、打ち間違いで止まらない。",
  },
  {
    id: 624,
    label: "ワーカーの数を対照の組の数で抑えない",
    patch: "m624-workers-not-capped-by-groups.patch",
    pkg: "scripts",
    tests: ["lib/mutation-parallel.test.mjs"],
    note: "#481。`--changed` で数件だけ選んだときに `--jobs 4` が分けられずに止まる（組の数より多くは分けられない）。",
  },
  {
    id: 625,
    label: "残骸の作業ツリーを持ち主の生死を見ずに消す",
    patch: "m625-stale-worktree-ignores-owner.patch",
    pkg: "scripts",
    tests: ["lib/mutation-parallel.test.mjs"],
    note: "#481。別の端末で並走している実行の作業ツリーを消し、その実行を途中で壊す。",
  },
  {
    id: 626,
    label: "シグナルで止まったワーカーを成功に数える",
    patch: "m626-worker-killed-counts-as-success.patch",
    pkg: "scripts",
    tests: ["lib/mutation-parallel.test.mjs"],
    note: "#481。メモリ不足などで殺されたワーカー（終了コード null）を見逃し、流れなかった変異があるのに緑になる。",
  },
  {
    id: 627,
    label: "シャードの緑を「全変異が検出されました」と言う",
    patch: "m627-shard-success-says-all.patch",
    pkg: "scripts",
    tests: ["lib/mutation-select.test.mjs"],
    note: "#481。1 つのシャードの緑を全件の緑と取り違える（手元で 1 つだけ流して全件と思い込む）。",
  },
  // 628〜631: #481 のレビュー（ロックの理由のホスト・テストランナーの並列の上限・出力をその場で流す）。
  {
    id: 628,
    label: "残骸の作業ツリーを、別のホストのものでも PID だけで消す",
    patch: "m628-stale-worktree-ignores-host.patch",
    pkg: "scripts",
    tests: ["lib/mutation-parallel.test.mjs"],
    note: "#481 のレビュー。.git を共有する別の環境（9p 越しのコンテナなど）の PID はこちらから見えず、相手が実行中の作業ツリーを消す。",
  },
  {
    id: 629,
    label: "ワーカーへテストランナーの並列の上限を渡さない",
    patch: "m629-worker-args-drop-test-workers.patch",
    pkg: "scripts",
    tests: ["lib/mutation-parallel.test.mjs"],
    note: "#481 のレビュー。子のテストランナーがそれぞれコアの数だけ並列に起動して取り合い、時間切れの失敗を「検出」と数えうる。",
  },
  {
    id: 630,
    label: "テストランナーの並列の上限をワーカーの数で割らない",
    patch: "m630-test-workers-not-split-by-jobs.patch",
    pkg: "scripts",
    tests: ["lib/mutation-parallel.test.mjs"],
    note: "#481 のレビュー。上限を渡しても、コアの数のままでは取り合いが減らない。",
  },
  {
    id: 631,
    label: "子の出力の、行の途中で切れた断片をそのまま 1 行として出す",
    patch: "m631-line-prefixer-splits-partial-lines.patch",
    pkg: "scripts",
    tests: ["lib/mutation-parallel.test.mjs"],
    note: "#481 のレビュー。その場で流す出力で、1 行が 2 行に割れて別のワーカーの行と混ざる。",
  },
  {
    id: 632,
    label: "audit-agent-entries が原則の表題の違いを見ない（番号だけを突き合わせる）",
    patch: "m632-agent-entries-ignores-title.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note:
      "#483・docs/adr/0030 決定 3。憲法の見出しを改名しても AGENTS.md が古い表題のまま通る。" +
      "docs/adr/0002 決定 5 の見出し同期が、番号の数合わせに痩せる。",
  },
  {
    id: 633,
    label: "audit-agent-entries がコードブロックの中のリンクと取り込みを数える",
    patch: "m633-agent-entries-counts-fenced-links.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note:
      "#485 のレビュー。描画も読み込みもされない例文の中の [x](AGENTS.md) で、正本へ向いていない入口が通る。",
  },
  // 660〜677 は #489（PR #493）の audit-agent-entries のスキルの判定。#493 の最初の版では 634〜636、次の版では 640〜650 に
  // 置いたが、並行していた PR とどちらの範囲でもぶつかったので、merge の前に 660 からへ付け直した（どちらの番号も main には
  // 入っていない）。**並行する PR の範囲はここに書かない**（相手が動くたびに古くなる）。merge の前に宣言どうしを突き合わせる。
  {
    id: 660,
    label: "audit-agent-entries がスキルのリンクの行き先を見ない（手順書の置き場の外・追跡下に無いファイルへのリンクで通る）",
    patch: "m660-agent-entries-skill-any-link.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note:
      "#489。スキルが開発ガイドや存在しないファイルを指したまま通り、手順書へ向ける薄い入口という形が崩れる。",
  },
  {
    id: 661,
    label: "audit-agent-entries がスキルの description の長さを測らない",
    patch: "m661-agent-entries-skill-description-unbounded.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: "#489。本文を薄く保ったまま、手順を description に詰め込む抜け道が開く。",
  },
  {
    id: 662,
    label: "audit-agent-entries がスキルの本文に frontmatter を含めて数える",
    patch: "m662-agent-entries-skill-counts-frontmatter.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note:
      "#489。frontmatter の中のリンクで「手順書へ向いている」と数え、薄さの物差しも frontmatter の分だけずれる。",
  },
  {
    id: 663,
    label: "audit-agent-entries がスキルの frontmatter の知らないキーを通す",
    patch: "m663-agent-entries-skill-unknown-key-accepted.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note:
      "#493 のレビュー。allowed-tools のように権限を前もって許すキーや、手順を詰めた任意のキーが入口に載る。",
  },
  {
    id: 664,
    label: "audit-agent-entries がスキルの frontmatter のブロックの書き方（> と |）を通す",
    patch: "m664-agent-entries-skill-block-scalar-accepted.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: "#493 のレビュー。値を「>-」の 2 字と読み、字下げした行に何千字書いても description の上限を通る。",
  },
  {
    id: 665,
    label: "audit-agent-entries がスキルの frontmatter の読めない行（続きの行・字下げ）を黙って飛ばす",
    patch: "m665-agent-entries-skill-continuation-ignored.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: "#493 のレビュー。description を続きの行で延ばし、上限の外に手順を書ける。",
  },
  {
    id: 666,
    label: "audit-agent-entries がスキルの frontmatter のキーの重複を通す",
    patch: "m666-agent-entries-skill-duplicate-key-accepted.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: "#493 のレビュー。検査が読む値と、ツールが読む値が食い違いうる（どちらが勝つかは読み手しだい）。",
  },
  {
    id: 667,
    label: "audit-agent-entries がスキルの name とディレクトリ名を照合しない",
    patch: "m667-agent-entries-skill-name-not-matched.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: "#493 のレビュー。呼び出す名前と置き場がずれ、どの手順書へ向く入口かが名前から分からなくなる。",
  },
  {
    id: 668,
    label: "audit-agent-entries がスキルの置き場の SKILL.md 以外のファイルをスキルとして読む",
    patch: "m668-agent-entries-skill-other-files-accepted.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: "#493 のレビュー。スキルの隣に置いた参照文書やスクリプトに手順を持ち込める。",
  },
  {
    id: 669,
    label: "audit-agent-entries が frontmatter の無いスキルを通す（本文が手順書へ向いていれば）",
    patch: "m669-agent-entries-skill-missing-frontmatter-accepted.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: "#493 のレビュー。description が無く、ツールがいつ使うかを決められないスキルが入る。",
  },
  {
    id: 670,
    label: "audit-agent-entries がスキルの名前の形（小文字・数字・ハイフン）を見ない",
    patch: "m670-agent-entries-skill-name-shape-unchecked.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: "#493 のレビュー。Upper_Case のような、ツールによっては呼び出せない名前のスキルが通る。",
  },
  {
    id: 671,
    label: "audit-agent-entries がスキルの frontmatter の、YAML の記号で始まる素の値を通す",
    patch: "m671-agent-entries-skill-yaml-indicator-accepted.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note:
      "#493 の再レビュー。description: [Bash, Read]・- a・%TAG x のように、ツールが文字列として読めない description のスキルが通る。" +
      "最初は拒む記号を並べていたが、並べ漏れが再々レビューで見つかったので、通す形を決める判定に改めた（パッチもその形で作り直した）。",
  },
  {
    id: 672,
    label: "audit-agent-entries がスキルの frontmatter の、閉じていない一重引用符を通す",
    patch: "m672-agent-entries-skill-unclosed-quote-accepted.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: "#493 の再レビュー。'説明 や 'a' b' のように、ツールによっては frontmatter ごと読めないスキルが通る。",
  },
  {
    id: 673,
    label: "audit-agent-entries がスキルの frontmatter の二重引用符の中で、どのエスケープも通す",
    patch: "m673-agent-entries-skill-double-quote-any-escape.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: "#493 の再々レビュー。\\n のように読み方がツールで割れうるエスケープが通り、検査が測った長さと読まれる中身がずれる。",
  },
  {
    id: 674,
    label: "audit-agent-entries がスキルの frontmatter の、値の途中の注釈（ #）を見ない",
    patch: "m674-agent-entries-skill-comment-accepted.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: "#493 の再々レビュー。YAML は「説明 # 注釈」を「説明」と読むので、検査が測った値とツールが読む値がずれる。",
  },
  {
    id: 675,
    label: "audit-agent-entries がスキルの一重引用符の値の長さを、'' のエスケープのまま数える",
    patch: "m675-agent-entries-skill-quoted-length-counts-escapes.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: "#493 の再々レビュー。読まれる中身が上限の中でも、エスケープの分だけ長く数えて落とす。",
  },
  {
    id: 676,
    label: "audit-agent-entries がスキルの frontmatter の、YAML が文字列以外に読む素の値（null・真偽値・数値・日付）を通す",
    patch: "m676-agent-entries-skill-implicit-types-accepted.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: "#493 の Codex 再レビュー。description: null が「null の 4 字」として通り、説明の無いスキルが正常と判定される。",
  },
  {
    id: 677,
    label: "audit-agent-entries がスキルの frontmatter の、末尾の : を見ない",
    patch: "m677-agent-entries-skill-trailing-colon-accepted.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: "#493 の Codex 再レビューの後の js-yaml との突き合わせ。description: abc: は YAML として読めない（js-yaml はエラー）。",
  },
  {
    "id": 634,
    "label": "worker へ決定済みポートを渡さない",
    "patch": "m634-e2e-worker-ports-not-inherited.patch",
    "pkg": "e2e",
    "tests": [
      "tests/run-isolation.test.ts"
    ],
    "note": "#494・#486 のレビュー。対応表より後に追加。実行分離・所有者確認と診断表示の回帰を継続的に検出する。"
  },
  {
    "id": 635,
    "label": "使用中ポート番号をエラーから落とす",
    "patch": "m635-e2e-busy-port-number-hidden.patch",
    "pkg": "e2e",
    "tests": [
      "tests/preflight.test.ts"
    ],
    "note": "#494・#486 のレビュー。対応表より後に追加。実行分離・所有者確認と診断表示の回帰を継続的に検出する。"
  },
  {
    "id": 636,
    "label": "保持プロセスの診断をエラーから落とす",
    "patch": "m636-e2e-port-holder-hidden.patch",
    "pkg": "e2e",
    "tests": [
      "tests/preflight.test.ts"
    ],
    "note": "#494・#486 のレビュー。対応表より後に追加。実行分離・所有者確認と診断表示の回帰を継続的に検出する。"
  },
  {
    "id": 637,
    "label": "sync が子自身の bind 完了を待たない",
    "patch": "m637-e2e-sync-accepts-other-listener.patch",
    "pkg": "e2e",
    "tests": [
      "tests/startup-ownership.test.ts"
    ],
    "note": "#494・#486 のレビュー。対応表より後に追加。実行分離・所有者確認と診断表示の回帰を継続的に検出する。"
  },
  {
    "id": 638,
    "label": "Caddy が子自身の bind 完了を待たない",
    "patch": "m638-e2e-caddy-accepts-other-listener.patch",
    "pkg": "e2e",
    "tests": [
      "tests/startup-ownership.test.ts"
    ],
    "note": "#494・#486 のレビュー。対応表より後に追加。実行分離・所有者確認と診断表示の回帰を継続的に検出する。"
  },
  {
    "id": 639,
    "label": "E2E の断片コピーに本番ポートを残す",
    "patch": "m639-e2e-fragment-keeps-production-port.patch",
    "pkg": "e2e",
    "tests": [
      "tests/local-fragments.test.ts"
    ],
    "note": "#494・#486 のレビュー。対応表より後に追加。実行分離・所有者確認と診断表示の回帰を継続的に検出する。"
  },
  {
    "id": 640,
    "label": "トップの import パスを引用しない",
    "patch": "m640-e2e-top-import-unquoted.patch",
    "pkg": "e2e",
    "tests": [
      "tests/caddy-imports.test.ts"
    ],
    "note": "#494 の再レビュー。空白を含む設定パスと SO_REUSEPORT による実行混在の回帰を検出する。"
  },
  {
    "id": 641,
    "label": "site.conf の断片 import を引用しない",
    "patch": "m641-e2e-fragment-import-unquoted.patch",
    "pkg": "e2e",
    "tests": [
      "tests/caddy-imports.test.ts"
    ],
    "note": "#494 の再レビュー。空白を含む設定パスと SO_REUSEPORT による実行混在の回帰を検出する。"
  },
  {
    "id": 642,
    "label": "子の spawn 前のポート排他を取らない",
    "patch": "m642-e2e-spawn-without-port-lock.patch",
    "pkg": "e2e",
    "tests": [
      "tests/port-locks.test.ts"
    ],
    "note": "#494 の再レビュー。空白を含む設定パスと SO_REUSEPORT による実行混在の回帰を検出する。"
  },
  {
    "id": 643,
    "label": "ロック取得を原子的な排他にしない",
    "patch": "m643-e2e-port-lock-nonexclusive.patch",
    "pkg": "e2e",
    "tests": [
      "tests/port-locks.test.ts"
    ],
    "note": "#494 の再レビュー。空白を含む設定パスと SO_REUSEPORT による実行混在の回帰を検出する。"
  },
  {
    id: 700,
    label: "check-toolchain が Bun・pnpm・Caddy の版を major だけで比べる",
    patch: "m700-toolchain-exact-compares-major.patch",
    pkg: "scripts",
    tests: ["lib/toolchain.test.mjs"],
    note:
      RESERVED_700_719 +
      " " +
      "#487・docs/adr/0031 決定 1。#493 と番号が重なったため、634 から 640 を経て予約の範囲 700〜719 へ移した。Bun 1.4.4 と宣言 1.4.3 が「合っている」になり、#487 で観測した無関係のテストの赤が戻る。",
  },
  {
    id: 701,
    label: "check-toolchain が Node の major を見ない（下限以上なら通す）",
    patch: "m701-toolchain-node-ignores-major.patch",
    pkg: "scripts",
    tests: ["lib/toolchain.test.mjs"],
    note:
      RESERVED_700_719 +
      " " +
      "#487。Node 24 の手元が CI（22.22.2）と違う major のまま検査を始める。",
  },
  {
    id: 702,
    label: "check-toolchain が Chromium の headless shell の revision を見ない",
    patch: "m702-toolchain-chromium-skips-headless-shell.patch",
    pkg: "scripts",
    tests: ["lib/toolchain.test.mjs"],
    note:
      RESERVED_700_719 +
      " " +
      "#487。本体だけ入っていると検査は通り、既定のヘッドレスの起動の瞬間に落ちる。",
  },
  {
    id: 703,
    label: "check-toolchain の e2e の段が Chromium を見ない",
    patch: "m703-toolchain-e2e-skips-chromium.patch",
    pkg: "scripts",
    tests: ["lib/toolchain.test.mjs"],
    note:
      RESERVED_700_719 +
      " " +
      "#487 の 2。revision の違うブラウザしか無い環境で E2E が始まる。",
  },
  {
    id: 704,
    label: "audit-toolchain が setup-bun の bun-version を見ない",
    patch: "m704-audit-toolchain-ignores-setup-bun.patch",
    pkg: "scripts",
    tests: ["audit-toolchain.test.mjs"],
    note:
      RESERVED_700_719 +
      " " +
      "#487・docs/adr/0031 決定 3。CI の Bun が宣言から外れても（別の版を直書きしても）通る。",
  },
  {
    id: 705,
    label: "pnpm test が版を比べずに turbo を始める",
    patch: "m705-pnpm-test-skips-toolchain-check.patch",
    pkg: "scripts",
    tests: ["check-toolchain.test.mjs"],
    note:
      RESERVED_700_719 +
      " " +
      "#487・docs/adr/0031 決定 2。ルートの package.json の入口から比較が外れ、版の違う環境でテストが始まる。",
  },
  {
    id: 706,
    label: "check-toolchain が版の後ろの付記（-canary・+build）を落として読む",
    patch: "m706-toolchain-version-accepts-suffix.patch",
    pkg: "scripts",
    tests: ["lib/toolchain.test.mjs"],
    note:
      RESERVED_700_719 +
      " " +
      "#492 のレビュー 1。1.4.3-canary.12+deadbeef の Bun が「完全一致」を通る。",
  },
  {
    id: 707,
    label: "check-toolchain が Playwright の npm_config_ の別名を読まない",
    patch: "m707-toolchain-browsers-ignores-npm-config.patch",
    pkg: "scripts",
    tests: ["lib/toolchain.test.mjs"],
    note:
      RESERVED_700_719 +
      " " +
      "#492 のレビュー 2。Playwright と違う置き場を見て、入っているブラウザを「無い」、無いブラウザを「ある」と読みうる。",
  },
  {
    id: 708,
    label: "check-toolchain が browsers.json の別のブラウザ（firefox）の revision を Chromium のものとして読む",
    patch: "m708-check-toolchain-reads-wrong-browser.patch",
    pkg: "scripts",
    tests: ["lib/toolchain.test.mjs", "check-toolchain.test.mjs"],
    note:
      RESERVED_700_719 +
      " " +
      "#492 のレビュー 3。宣言を読む分岐が別の項目を読んでも、純粋関数のテストは緑のままだった。headless shell は revision が同じ（等価になる）ので、別の revision を持つ firefox を読ませる。" +
      "#509 のレビューで読み取りを scripts/lib/toolchain.mjs の readBrowserRevisions へ移し、パッチを作り直した（壊し方は同じ）。",
  },
  {
    id: 709,
    label: "audit-toolchain が toolchain の段が参照される出力を書いているかを見ない",
    patch: "m709-audit-toolchain-ignores-missing-outputs.patch",
    pkg: "scripts",
    tests: ["audit-toolchain.test.mjs"],
    note:
      RESERVED_700_719 +
      " " +
      "#492 のレビュー 5。bun を書かない段のまま setup-bun が空の版で latest を入れる。",
  },
  {
    id: 710,
    label: "turbo の e2e タスクが XDG_CACHE_HOME を渡さない",
    patch: "m710-turbo-e2e-drops-xdg-cache-home.patch",
    pkg: "scripts",
    tests: ["check-toolchain.test.mjs"],
    note:
      RESERVED_700_719 +
      " " +
      "#492 の Codex レビュー 1。ルートの版の比較は通るのに、turbo の中のハーネスと Playwright が別の置き場を見て止まる。",
  },
  {
    id: 711,
    label: "check-toolchain が相対パスの置き場を、e2e/ ではなく起動した場所の INIT_CWD から解く",
    patch: "m711-check-toolchain-relative-from-root.patch",
    pkg: "scripts",
    tests: ["check-toolchain.test.mjs"],
    note:
      RESERVED_700_719 +
      " " +
      "#492 の再レビュー。ルートの検査はルートの下を見て通るのに、ハーネスと Playwright は e2e/ の下を見て止まる。",
  },
  // #497 のレビュー: #498（予約 720〜729）との重複を避け、720〜727 は同じ変異のまま 740〜747 へ移した。
  // #488 は 740〜759 を使用する。番号の移動で変異を削除・弱体化しない。
  {
    id: 740,
    label: "版チェックで失敗しても検査を始める",
    patch: "m740-local-preflight-bypassed.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: "#488。手元の検査が CI とずれる・事前に止まらない・失敗を成功と報告する経路を守る。",
  },
  {
    id: 741,
    label: "CI の通常の検査を手元の一覧から落とす",
    patch: "m741-local-ci-check-dropped.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: "#488。手元の検査が CI とずれる・事前に止まらない・失敗を成功と報告する経路を守る。",
  },
  {
    id: 742,
    label: "全件の段でも E2E と build を省略する",
    patch: "m742-local-full-becomes-fast.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: "#488。手元の検査が CI とずれる・事前に止まらない・失敗を成功と報告する経路を守る。",
  },
  {
    id: 743,
    label: "最後の変異シャードを流さない",
    patch: "m743-local-shard-missing.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: "#488。手元の検査が CI とずれる・事前に止まらない・失敗を成功と報告する経路を守る。",
  },
  {
    id: 744,
    label: "検査が失敗しても成功の終了コードを返す",
    patch: "m744-local-failure-exits-zero.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: "#488。手元の検査が CI とずれる・事前に止まらない・失敗を成功と報告する経路を守る。",
  },
  {
    id: 745,
    label: "全件の段で Chromium の事前確認を省く",
    patch: "m745-local-full-preflight-test-only.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: "#488。手元の検査が CI とずれる・事前に止まらない・失敗を成功と報告する経路を守る。",
  },
  {
    id: 746,
    label: "文書とコードの混在した差分でコード検査を省略する",
    patch: "m746-local-doc-scope-misses-code.patch",
    pkg: "scripts",
    tests: ["ci-scope.test.mjs"],
    note: "#488。共有モジュールへ移した判定と分割が既存の振る舞いを保つことを守る。",
  },
  {
    id: 747,
    label: "workflow の最初のステップ以外を落とす",
    patch: "m747-workflow-drops-steps.patch",
    pkg: "scripts",
    tests: ["audit-toolchain.test.mjs"],
    note: "#488。共有モジュールへ移した判定と分割が既存の振る舞いを保つことを守る。",
  },
  {
    id: 748,
    label: "導入済みの手元で CI 専用の供給網 install を実行する",
    patch: "m748-local-runs-ci-install.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: "#497 のレビュー（#488）。供給網 install の省略・実 git 差分の配線・改名の旧パス・一覧表示を守る。予約 740〜759。",
  },
  {
    id: 749,
    label: "差分から未追跡のコードを落とす",
    patch: "m749-local-ignores-untracked.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: "#497 のレビュー（#488）。供給網 install の省略・実 git 差分の配線・改名の旧パス・一覧表示を守る。予約 740〜759。",
  },
  {
    id: 750,
    label: "速い段が常に文書だけと判定する",
    patch: "m750-local-scope-always-docs.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: "#497 のレビュー（#488）。供給網 install の省略・実 git 差分の配線・改名の旧パス・一覧表示を守る。予約 740〜759。",
  },
  {
    id: 751,
    label: "基準や差分を取得できないとコード検査を省略する",
    patch: "m751-local-scope-fails-closed.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: "#497 のレビュー（#488）。供給網 install の省略・実 git 差分の配線・改名の旧パス・一覧表示を守る。予約 740〜759。",
  },
  {
    id: 752,
    label: "コードから文書への改名で削除側を落とす",
    patch: "m752-local-loses-renamed-code.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: "#497 のレビュー（#488）。供給網 install の省略・実 git 差分の配線・改名の旧パス・一覧表示を守る。予約 740〜759。",
  },
  {
    id: 753,
    label: "一覧表示の複数行コマンドを一行に揃えない",
    patch: "m753-local-list-keeps-newlines.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: "#497 のレビュー（#488）。供給網 install の省略・実 git 差分の配線・改名の旧パス・一覧表示を守る。予約 740〜759。",
  },
  {
    id: 760,
    label: "agent-guard が sudo を包むコマンドとして読まない",
    patch: "m760-agent-guard-ignores-sudo.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note:
      RESERVED_760_779 +
      " " +
      "#490。`sudo systemctl restart …` が人に聞かれずに走る（本番で最も踏みやすい形）。",
  },
  {
    id: 761,
    label: "agent-guard が bash -c の文字列を読み直さない",
    patch: "m761-agent-guard-skips-shell-c.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note:
      RESERVED_760_779 +
      " " +
      "#490。`bash -c 'systemctl restart …'` で包むと素通りする。",
  },
  {
    id: 762,
    label: "agent-guard のフックが読めない入力を通す（ask に倒さない）",
    patch: "m762-agent-guard-unreadable-input-passes.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note:
      RESERVED_760_779 +
      " " +
      "#490。ツールの入力の形が変わったとき、黙って全部のコマンドを通す。",
  },
  {
    id: 763,
    label: "audit-agent-guard が deploy/ の宣言の無いスクリプトを見ない",
    patch: "m763-audit-agent-guard-ignores-undeclared-deploy-script.patch",
    pkg: "scripts",
    tests: ["audit-agent-guard.test.mjs"],
    note:
      RESERVED_760_779 +
      " " +
      "#490。デプロイの入口を足したのに止める一覧へ足し忘れても CI が緑のまま。",
  },
  {
    id: 764,
    label: ".claude/settings.json のフックの matcher を Bash|Monitor から Edit にする",
    patch: "m764-claude-settings-hook-matches-edit.patch",
    pkg: "scripts",
    tests: ["audit-agent-guard.test.mjs"],
    note:
      RESERVED_760_779 +
      " " +
      "#490。設定の配線が外れ、Claude Code が Bash のコマンドで判定を呼ばなくなる。",
  },
  {
    id: 765,
    label: "agent-guard が caddy のどの下位コマンドでも当てる",
    patch: "m765-agent-guard-caddy-any-subcommand.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note:
      RESERVED_760_779 +
      " " +
      "#490。caddy version・validate まで人に聞くようになり、E2E や版の確認の作業を妨げる（#490 の EARS 2）。",
  },
  {
    id: 766,
    label: "agent-guard が短い選択肢のまとまり（sudo -iu root）の値を読み飛ばさない",
    patch: "m766-agent-guard-clustered-options-ignore-value.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note:
      RESERVED_760_779 +
      " " +
      "PR #498 のレビュー 1。値の root をコマンドの名前と読み、`sudo -iu root systemctl …` が人に聞かれずに走る（実経路で再現した）。",
  },
  {
    id: 767,
    label: "agent-guard が su・runuser の -c の文字列を読み直さない",
    patch: "m767-agent-guard-su-skips-command-string.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note:
      RESERVED_760_779 +
      " " +
      "PR #498 のレビュー 3。`su -c 'systemctl restart …'` が素通りする。",
  },
  {
    id: 768,
    label: "agent-guard のフックが Bash だけを判定し、Monitor のコマンドを見ない",
    patch: "m768-agent-guard-judges-bash-only.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note:
      RESERVED_760_779 +
      " " +
      "PR #498 のレビュー 2。Claude Code の版が Monitor を Bash のフックへ回さなくなったとき、Monitor 経由で素通りする。",
  },
  {
    id: 769,
    label: "audit-agent-guard が matcher を Bash についてだけ見る",
    patch: "m769-audit-agent-guard-checks-bash-matcher-only.patch",
    pkg: "scripts",
    tests: ["audit-agent-guard.test.mjs"],
    note:
      RESERVED_760_779 +
      " " +
      "PR #498 のレビュー 2。settings.json の matcher から Monitor が落ちても CI が緑のまま。",
  },
  {
    id: 770,
    label: "agent-guard が短い選択肢のまとまりの最後の文字だけを見る（-uroot の t を値を取る選択肢と読む）",
    patch: "m770-agent-guard-clustered-options-read-last-char.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note:
      RESERVED_760_779 +
      " " +
      "PR #498 の再レビュー 1。f23fa9d の読み方そのもの。`sudo -uroot systemctl …` で systemctl を値として飛ばし、人に聞かれずに走る（実経路で再現された）。",
  },
  {
    id: 771,
    label: "agent-guard のフックが Monitor の WebSocket の形（command 無し）でも人に聞く",
    patch: "m771-agent-guard-monitor-ws-asks.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note:
      RESERVED_760_779 +
      " " +
      "PR #498 の再レビュー 3。シェルを走らせない Monitor の使い方のたびに確認を求め、作業を妨げる（#490 の EARS 2）。",
  },
  {
    id: 800,
    label: "手札の札のボタンを名前の要素へ結ばない（読み上げ名に意味まで入る）",
    patch: "m800-hand-card-name-includes-meaning.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/hand.test.tsx"],
    note:
      RESERVED_800_809 +
      " " +
      "#480。読み上げ名が「晴れ絶好調」になり、説明の意味と合わせて意味を 2 度読む（名前を 1 回だけ読む、が崩れる）。",
  },
  {
    id: 801,
    label: "手札の札の下の名前・意味を CSS（display: none）で隠す",
    patch: "m801-hand-caption-hidden-by-css.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/hand-caption-css.test.ts"],
    note:
      RESERVED_800_809 +
      " " +
      "#480（PR #502 のレビュー指摘 1）。札が絵だけに戻り、何を示すかが手札で分からなくなる。読み上げ名・説明は隠した参照先からも作られるので読み上げの試験は緑のまま。" +
      "実際の見え方は E2E（checkin.spec.ts の その6）も見るが、E2E の spec は変異検査のランナーに載らないので、宣言で守る。",
  },
  {
    id: 802,
    label: "手札の札の下の名前・意味を要素の属性（hidden）で隠す",
    patch: "m802-hand-caption-hidden-inline.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/hand.test.tsx"],
    note:
      RESERVED_800_809 +
      " " +
      "#480（PR #502 のレビュー指摘 1）。レビューが再現した壊し方（添え書きを隠しても手札の試験が 35/35 で通った）の属性版。",
  },
  {
    id: 803,
    label: "手札の見出しに、いまのやり方ではなく今日の天気の問いを出す",
    patch: "m803-hand-prompt-fixed-to-weather.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/hand.test.tsx"],
    note:
      RESERVED_800_809 +
      " " +
      "#480（PR #502 の敵対的レビュー 2）。どの問いへの答えかを手札で誤らせる。天気だけを試していたときは通っていた。",
  },
  {
    id: 804,
    label: "手札の札のボタンを意味の要素へ結ばない（aria-describedby を外す）",
    patch: "m804-hand-card-meaning-not-described.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/hand.test.tsx"],
    note:
      RESERVED_800_809 +
      " " +
      "#480（PR #502 の敵対的レビュー 3）。見た目には意味が出ているのに、読み上げでは札の意味が聞こえない。",
  },
  {
    id: 805,
    label: "手札の札のボタンの幅を固定の 7rem に戻す（名前の字の大きさから決めない）",
    patch: "m805-hand-card-width-by-breakpoint.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/hand-caption-css.test.ts"],
    note:
      RESERVED_800_809 +
      " " +
      "#480（PR #502 の敵対的レビュー 1）。字は画面の幅で流れるので、幅の広い側で 8 字の名前が 1 字だけ次の行に落ちる。" +
      "実際の見え方は E2E（checkin.spec.ts の その6・639px）も見るが、E2E の spec は変異検査のランナーに載らないので、宣言で守る。",
  },
  {
    id: 810,
    label: "検査の赤の分類が本物の失敗の印（FAIL・×・Tests N failed など）を見ない",
    patch: "m810-check-outcome-ignore-real-failures.patch",
    pkg: "scripts",
    tests: ["lib/check-outcome.test.mjs"],
    note: RESERVED_810_819 + " " + "#508。テストが落ちた赤を「未実行」と出し、壊したのに負荷のせいだと読ませる。",
  },
  {
    id: 811,
    label: "turbo の失敗したタスクのうち 1 つでも起動の失敗だけなら、全体を未実行と分類する",
    patch: "m811-check-outcome-some-task-not-run.patch",
    pkg: "scripts",
    tests: ["lib/check-outcome.test.mjs"],
    note: RESERVED_810_819 + " " + "#508。別のパッケージの本物の失敗が、未実行の陰に隠れる。",
  },
  {
    id: 812,
    label: "vitest の未処理のエラーの数を見ず、起動の失敗があれば未実行と分類する",
    patch: "m812-check-outcome-ignore-unhandled-count.patch",
    pkg: "scripts",
    tests: ["lib/check-outcome.test.mjs"],
    note: RESERVED_810_819 + " " + "#508。テストが投げた未処理のエラーが、同じタスクの起動の失敗と一緒に未実行へ化ける。",
  },
  {
    id: 813,
    label: "--changed の基準がリモートと違っても「同じ」と言う",
    patch: "m813-base-freshness-stale-reported-fresh.patch",
    pkg: "scripts",
    tests: ["lib/base-freshness.test.mjs"],
    note: RESERVED_810_819 + " " + "#508。古い origin/main のまま取り込み済みの変異まで選び、手元で長く走る（#491 の準備のセッション）。",
  },
  {
    id: 814,
    label: "リモートに問い合わせられないとき、何も知らせない",
    patch: "m814-base-freshness-ls-remote-failure-silent.patch",
    pkg: "scripts",
    tests: ["lib/base-freshness.test.mjs"],
    note: RESERVED_810_819 + " " + "#508。確かめていないのに知らせが無く、基準が新しいと読ませる。",
  },
  {
    id: 815,
    label: "--changed が全件に倒れても、見込みの行に知らせと絞る --id を出さない",
    patch: "m815-forecast-no-fallback-notice.patch",
    pkg: "scripts",
    tests: ["lib/mutation-select.test.mjs"],
    note: RESERVED_810_819 + " " + "#508。宣言を触った枝の check:fast が、知らせなしに手元で全件（9p で数時間）を流し始める。",
  },
  {
    id: 816,
    label: "手元で絞る候補を選び直すとき、機構の変更を外さない（全件をそのまま候補にする）",
    patch: "m816-narrowing-keeps-mechanism.patch",
    pkg: "scripts",
    tests: ["lib/mutation-select.test.mjs"],
    note: RESERVED_810_819 + " " + "#508。絞る道として示す --id が全件になり、絞れない。",
  },
  {
    id: 817,
    label: "check:fast の結果で、ワーカーが起動しなかっただけの赤も「失敗」と出す",
    patch: "m817-local-check-not-run-as-failed.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: RESERVED_810_819 + " " + "#508。走らなかったのに失敗と区別できず、無い不具合を探しに行く（#491 の罠 6）。",
  },
  {
    id: 818,
    label: "check:fast が未実行の検査を残しても 0 で終わる",
    patch: "m818-local-check-not-run-exits-zero.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: RESERVED_810_819 + " " + "#508。走らなかった単体を緑と数える（偽の緑）。",
  },
  {
    id: 819,
    label: "check:fast の速い段で、変異の見込みを出さない",
    patch: "m819-local-check-forecast-after-checks.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: RESERVED_810_819 + " " + "#508。全件に倒れたことに、変異が流れ始めてから途中で気づく（#491 の罠 5）。",
  },
  {
    id: 820,
    label: "check-toolchain の e2e の段が ffmpeg を見ない（段の道具から外す）",
    patch: "m820-toolchain-e2e-skips-ffmpeg.patch",
    pkg: "scripts",
    tests: ["lib/toolchain.test.mjs", "check-toolchain.test.mjs"],
    note:
      RESERVED_820_829 +
      " " +
      "#509。Chromium だけを揃えた環境で OK を出し、画面を開く spec が全件「ffmpeg が無い」で落ちる（クラウドのセッションで実測）。",
  },
  {
    id: 821,
    label: "check-toolchain が browsers.json の chromium の revision を ffmpeg のものとして読む",
    patch: "m821-check-toolchain-reads-chromium-as-ffmpeg.patch",
    pkg: "scripts",
    tests: ["lib/toolchain.test.mjs", "check-toolchain.test.mjs"],
    note:
      RESERVED_820_829 +
      " " +
      "#509。宣言を読む分岐が別の項目を読んでも、純粋関数のテストは緑のまま。入っている ffmpeg を「無い」と読んで止まるか、別の revision を探す。",
  },
  {
    id: 822,
    label: "checkFfmpeg が別の revision の ffmpeg でも通す（名前の頭だけを見る）",
    patch: "m822-check-ffmpeg-accepts-any-revision.patch",
    pkg: "scripts",
    tests: ["lib/toolchain.test.mjs", "check-toolchain.test.mjs"],
    note:
      RESERVED_820_829 +
      " " +
      "#509。クラウドの /opt/pw-browsers にある ffmpeg-1011 を要求の 1013 と取り違え、Playwright が起動の時に落ちる。",
  },
  {
    id: 823,
    label: "browsers.json の ffmpeg に OS ごとの revision（revisionOverrides）があっても止めない",
    patch: "m823-browser-revisions-ignores-ffmpeg-overrides.patch",
    pkg: "scripts",
    tests: ["lib/toolchain.test.mjs"],
    note:
      RESERVED_820_829 +
      " " +
      "#509 のレビュー 2。OS によって探す revision が変わるのに、既定の revision で比べて「ある」「無い」を誤る。",
  },
  {
    id: 824,
    label: "browsers.json に revision が無いとき、理由を言わずに先へ進む",
    patch: "m824-browser-revisions-silent-on-missing-revision.patch",
    pkg: "scripts",
    tests: ["lib/toolchain.test.mjs"],
    note:
      RESERVED_820_829 +
      " " +
      "#509 のレビュー 3。止まりはするが「ffmpeg-null が無い」と出て、Playwright の版の側の問題だと分からない。",
  },
  {
    id: 850,
    label: "check-links の LIVE_DOCS から docs/superpowers/README.md を外す",
    patch: "m850-links-live-docs-drops-superpowers-readme.patch",
    pkg: "scripts",
    tests: ["check-links.test.mjs"],
    note: RESERVED_850_859 + " " + "#506。設計文書の案内がリンク検査から外れ、ガイドへのリンクが壊れても緑のままになる。",
  },
  {
    id: 851,
    label: "audit-plan-gate の宣言の検査が、冒頭の範囲を無視して文書全体から探す",
    patch: "m851-plan-gate-declaration-ignores-window.patch",
    pkg: "scripts",
    tests: ["audit-plan-gate.test.mjs"],
    note: RESERVED_850_859 + " " + "#506。末尾にだけ宣言がある文書が通り、どの節から入っても決まりに当たるという狙いが外れる。",
  },
  {
    id: 852,
    label: "audit-plan-gate の宣言の検査が、コードフェンスの中の引用でも満たされたとみなす",
    patch: "m852-plan-gate-declaration-counts-fenced-quote.patch",
    pkg: "scripts",
    tests: ["audit-plan-gate.test.mjs"],
    note: RESERVED_850_859 + " " + "#506。ガイドの雛形を引用しただけの文書が通り、宣言していないのに宣言したことになる。",
  },
  {
    id: 853,
    label: "audit-plan-gate が宣言を要求する文書を 1 件も検査しない",
    patch: "m853-plan-gate-declaration-never-required.patch",
    pkg: "scripts",
    tests: ["wiring-audit-plan-gate.test.mjs"],
    note: RESERVED_850_859 + " " + "#506。要求対象は現在 0 件なので、検査が配線ごと外れても CI の色は変わらない。落ちるのは境界日を動かす配線のテストだけ。",
  },
  {
    id: 854,
    label: "audit-plan-gate の宣言の検査が、ガイドのパスを含むかを見ない",
    patch: "m854-plan-gate-declaration-ignores-guide-path.patch",
    pkg: "scripts",
    tests: ["audit-plan-gate.test.mjs"],
    note: RESERVED_850_859 + " " + "#506。「書き換えない」と書いてあれば通り、決まりの正本へ辿れない宣言が通る。",
  },
  {
    id: 855,
    label: "audit-plan-gate の宣言の検査が、plans/ を列挙しない",
    patch: "m855-plan-gate-declaration-drops-plans-dir.patch",
    pkg: "scripts",
    tests: ["wiring-audit-plan-gate.test.mjs"],
    note: RESERVED_850_859 + " " + "#506 のレビュー。実装計画の側で宣言が無くても赤にならず、specs/ だけを見る検査になる。",
  },
  {
    id: 856,
    label: "audit-plan-gate の設計文書の 0 件ガードを無効にする",
    patch: "m856-plan-gate-declaration-empty-guard-off.patch",
    pkg: "scripts",
    tests: ["wiring-audit-plan-gate.test.mjs"],
    note: RESERVED_850_859 + " " + "#506 のレビュー。列挙が空になっても緑のままで、宣言の検査が空振りしても気づけない。",
  },
  {
    id: 857,
    label: "audit-plan-gate の宣言の検査が、日付つきディレクトリの下の付属ファイルも設計文書として数える",
    patch: "m857-plan-gate-declaration-includes-nested-files.patch",
    pkg: "scripts",
    tests: ["audit-plan-gate.test.mjs"],
    note: RESERVED_850_859 + " " + "#506 のレビュー。以前から許された置き方（specs/<日付>-<名前>/notes.md）で、日付の無いファイルとして検査が落ちる。",
  },
  {
    id: 858,
    label: "audit-plan-gate の宣言の検査が、README.md を設計文書として数える",
    patch: "m858-plan-gate-declaration-includes-readme.patch",
    pkg: "scripts",
    tests: ["audit-plan-gate.test.mjs"],
    note: RESERVED_850_859 + " " + "#506 のレビュー。置き場の案内 README に宣言を要求し、検査が落ちる。",
  },
  {
    id: 859,
    label: "audit-plan-gate の宣言の検査が、4 字下げのコードブロックの引用行でも満たされたとみなす",
    patch: "m859-plan-gate-declaration-accepts-indented-code.patch",
    pkg: "scripts",
    tests: ["audit-plan-gate.test.mjs"],
    note: RESERVED_850_859 + " " + "#506 のレビュー。コードブロックに雛形を貼っただけの文書が、宣言したことになる。",
  },
  {
    id: 880,
    label: "audit-plan-gate の宣言の検査が、続く引用行を塊にせず 1 行ずつ判定する",
    patch: "m880-plan-gate-declaration-judges-line-by-line.patch",
    pkg: "scripts",
    tests: ["audit-plan-gate.test.mjs"],
    note: RESERVED_880_889 + " " + "#506 のコードレビュー。宣言を折り返すと「書き換えない」とガイドが別の行に分かれて落ち、正しい宣言が赤になる。",
  },
  {
    id: 881,
    label: "audit-plan-gate が、宣言の正本のガイドの実在を確かめない",
    patch: "m881-plan-gate-declaration-skips-guide-existence.patch",
    pkg: "scripts",
    tests: ["wiring-audit-plan-gate.test.mjs"],
    note: RESERVED_880_889 + " " + "#506 のコードレビュー。設計文書の置き場はリンク検査の外なので、ガイドを改名・削除しても宣言は古いパスを指したまま緑になる。",
  },
  {
    id: 882,
    label: "audit-plan-gate の宣言の検査が、ガイドのパスを末尾の一致だけで認める（文書の位置から解決しない）",
    patch: "m882-plan-gate-declaration-guide-path-by-suffix.patch",
    pkg: "scripts",
    tests: ["audit-plan-gate.test.mjs"],
    note: RESERVED_880_889 + " " + "#506 のレビュー。別の置き場（docs/old-guides/…）や深さを間違えた相対リンクが通り、存在しないガイドを指す宣言が宣言として数えられる。",
  },
  {
    id: 840,
    label: "先行 PR の探索が、番号が前方一致の別 ISSUE の PR（#5040）も拾う",
    patch: "m840-prior-work-pr-prefix-number.patch",
    pkg: "scripts",
    tests: ["lib/prior-work.test.mjs"],
    note: RESERVED_840_849 + " " + "#504。別の ISSUE の PR を「同じ ISSUE の先行 PR」と知らせ、無関係な PR で作業が止まる／知らせが信用されなくなる。",
  },
  {
    id: 841,
    label: "先行する枝の探索が、番号が前方一致の別 ISSUE の枝（5040）も拾う",
    patch: "m841-prior-work-branch-prefix-number.patch",
    pkg: "scripts",
    tests: ["lib/prior-work.test.mjs"],
    note: RESERVED_840_849 + " " + "#504。別の ISSUE の枝を先行の作業と知らせる。",
  },
  {
    id: 842,
    label: "先行 PR の探索が、自分の枝の PR を除かない",
    patch: "m842-prior-work-own-pr-included.patch",
    pkg: "scripts",
    tests: ["lib/prior-work.test.mjs"],
    note: RESERVED_840_849 + " " + "#504。自分の PR を「他の PR」と知らせ続け、知らせが常に出て無視される。",
  },
  {
    id: 843,
    label: "検索がちょうど上限に当たっても、切れた可能性を知らせない",
    patch: "m843-prior-work-truncation-undetected.patch",
    pkg: "scripts",
    tests: ["lib/prior-work.test.mjs"],
    note: RESERVED_840_849 + " " + "#504。上限で黙って切れ、先行 PR が無いと読ませる（番号 4 のような小さい番号で起きる）。",
  },
  {
    id: 844,
    label: "片方の引き方が失敗して何も見つからないとき、「無い」と言う",
    patch: "m844-prior-work-lookup-failure-reads-none.patch",
    pkg: "scripts",
    tests: ["lib/prior-work.test.mjs"],
    note: RESERVED_840_849 + " " + "#504。gh が使えない環境で、確かめていないのに先行 PR は無いと読ませる。",
  },
  {
    id: 845,
    label: "gh pr create の直前に先行 PR を引けなかったとき、人に聞かず通す",
    patch: "m845-prior-pr-hook-lookup-failure-passes.patch",
    pkg: "scripts",
    tests: ["lib/prior-pr-hook.test.mjs"],
    note: RESERVED_840_849 + " " + "#504。docs/adr/0032 は読めないときに聞く側へ倒す。通すと、引けていないのに確認済みに見える。",
  },
  {
    id: 846,
    label: "gh pr create の番号を --title から取らない",
    patch: "m846-prior-pr-hook-ignores-title-number.patch",
    pkg: "scripts",
    tests: ["lib/prior-pr-hook.test.mjs"],
    note: RESERVED_840_849 + " " + "#504。ブランチ名に番号が無い枝（main や名前だけの枝）の PR で、先行 PR を確かめない。",
  },
  {
    id: 847,
    label: "gh pr create の判定が、pr か create のどちらかの語があれば当たる",
    patch: "m847-agent-guard-args-match-any-word.patch",
    pkg: "scripts",
    tests: ["lib/prior-pr-hook.test.mjs"],
    note: RESERVED_840_849 + " " + "#504。gh pr list・gh issue create のたびに先行 PR を引いて聞き、フックが邪魔になって外される。",
  },
  {
    id: 848,
    label: "check:fast の先行 PR の知らせを、最後の一覧でもう一度出さない",
    patch: "m848-local-check-notices-not-repeated.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: RESERVED_840_849 + " " + "#504。検査の長い出力に最初の知らせが流れて見落とされる（#508 と同じ型）。",
  },
  {
    id: 849,
    label: "ブランチ名の番号を、語に混ざった数字（fix/504def）からも取る",
    patch: "m849-prior-work-branch-number-inside-word.patch",
    pkg: "scripts",
    tests: ["lib/prior-work.test.mjs"],
    note: RESERVED_840_849 + " " + "#504。無関係な数字で別の ISSUE の先行 PR を引く。",
  },
  {
    id: 860,
    label: "入口のフックが、本番デプロイの判定の後に先行 PR の判定を呼ばない",
    patch: "m860-agent-guard-hook-drops-prior-pr-wiring.patch",
    pkg: "scripts",
    tests: ["agent-guard-hook.test.mjs"],
    note: RESERVED_860_869 + " " + "#504 のレビュー 4。部品のテストは緑のまま、gh pr create の直前に聞かなくなる。",
  },
  {
    id: 861,
    label: "gh pr new（gh pr create の別名）で先行 PR を確かめない",
    patch: "m861-prior-pr-hook-misses-gh-pr-new.patch",
    pkg: "scripts",
    tests: ["lib/prior-pr-hook.test.mjs"],
    note: RESERVED_860_869 + " " + "#504 のレビュー 4。別名で先行 PR の確認を抜ける。",
  },
  {
    id: 862,
    label: "--title / -t の値が 1 語（-t<値>）のとき題を取らない",
    patch: "m862-prior-pr-hook-misses-glued-title.patch",
    pkg: "scripts",
    tests: ["lib/prior-pr-hook.test.mjs"],
    note: RESERVED_860_869 + " " + "#504 のレビュー 4。-t<値> の形でブランチに番号が無いと確認を抜ける。",
  },
  {
    id: 863,
    label: "ブランチに番号があると、題の別の番号を引かない",
    patch: "m863-prior-pr-hook-title-overrides-branch.patch",
    pkg: "scripts",
    tests: ["lib/prior-pr-hook.test.mjs"],
    note: RESERVED_860_869 + " " + "#504 の /code-review（PR #517）。ブランチの番号と違う ISSUE を題に書いた PR で、題の ISSUE の先行 PR を確かめない（最初は 1 つに絞っていたのを、最大 2 つに改めた）。",
  },
  {
    id: 864,
    label: "日付のブランチ名（docs/2026-11-03-retro）を ISSUE 2026 と読む",
    patch: "m864-prior-work-branch-date-read-as-number.patch",
    pkg: "scripts",
    tests: ["lib/prior-work.test.mjs"],
    note: RESERVED_860_869 + " " + "#504 のレビュー 4。無関係な PR を先行として挙げる。",
  },
  {
    id: 865,
    label: "issue-<番号> の形のブランチ名から番号を取らない",
    patch: "m865-prior-work-misses-issue-prefix.patch",
    pkg: "scripts",
    tests: ["lib/prior-work.test.mjs"],
    note: RESERVED_860_869 + " " + "#504 のレビュー 4。docs/issue-505-… の枝で先行 PR の確認が未実行になる。",
  },
  {
    id: 866,
    label: "題の取り出しが、値を取る選択肢（-T・-b・-r）まで束ねた頭として読み、その値を題と読む",
    patch: "m866-prior-pr-hook-title-bundle-too-wide.patch",
    pkg: "scripts",
    tests: ["lib/prior-pr-hook.test.mjs"],
    note: RESERVED_860_869 + " " + "#504 のレビュー 5。-Tmytemplate の値を題と読んで --title まで進まず確認を抜ける、-rteam/#3 の値で無関係な ISSUE を引く。",
  },
  {
    id: 867,
    label: "先行が無くても検索が上限で切れているとき、フックが人に聞かず通す",
    patch: "m867-prior-pr-hook-truncated-none-passes.patch",
    pkg: "scripts",
    tests: ["lib/prior-pr-hook.test.mjs"],
    note: RESERVED_860_869 + " " + "#504 の /code-review（PR #517）。小さい番号で上限に当たって先行 PR を取りこぼしても、聞かずに gh pr create が進む。",
  },
  {
    id: 868,
    label: "gh pr create --head <枝> のとき、自分の枝を --head でなく作業場所の今の枝にする",
    patch: "m868-prior-pr-hook-ignores-head.patch",
    pkg: "scripts",
    tests: ["lib/prior-pr-hook.test.mjs"],
    note: RESERVED_860_869 + " " + "#504 の /code-review（PR #517）。別の枝の PR を作るとき、その枝の番号を引かず、自分の PR を「他の PR」と挙げる。",
  },
  {
    id: 869,
    label: "gh pr create の判定が、選択肢を除いた最初の語でなく、引数のどこに並んでいても当たる",
    patch: "m869-agent-guard-args-not-anchored.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_860_869 + " " + "#504 の /code-review（PR #517）。gh issue list --search 'pr create' のたびに先行 PR を引いて聞き、フックが邪魔になって外される。",
  },
  {
    id: 870,
    label: "cd の先が登録済みの worktree でなくても信用して、そこで git・gh を流す",
    patch: "m870-prior-pr-hook-unregistered-cd-trusted.patch",
    pkg: "scripts",
    tests: ["lib/prior-pr-hook.test.mjs"],
    note: RESERVED_870_879 + " " + "#504 の自動セキュリティレビュー。信用できない場所の .git/config（core.fsmonitor・core.sshCommand）が、人の承認より前に実行される。",
  },
  {
    id: 871,
    label: "本番デプロイに当たるコマンドでも、先行 PR の確認（gh・git）を流してから ask を返す",
    patch: "m871-agent-guard-hook-deploy-also-runs-prior-pr.patch",
    pkg: "scripts",
    tests: ["agent-guard-hook.test.mjs"],
    note: RESERVED_870_879 + " " + "#504 の自動セキュリティレビュー。確認が遅れたり時間切れになったりすると、本番デプロイの ask が出ないまま通る（fail-open）。",
  },
  {
    id: 872,
    label: "先行 PR の確認に全体の壁時計の上限を付けない",
    patch: "m872-prior-pr-hook-overall-timeout-removed.patch",
    pkg: "scripts",
    tests: ["lib/prior-pr-hook.test.mjs"],
    note: RESERVED_870_879 + " " + "#504 の自動セキュリティレビュー。引き方が終わらないとフックが時間切れまで待ち、ask が出ない。",
  },
  {
    id: 873,
    label: "時間切れで直接の子だけを SIGKILL し、孫（gh の下の git・git の下の ssh）を残す",
    patch: "m873-prior-work-timeout-kills-only-direct-child.patch",
    pkg: "scripts",
    tests: ["lib/prior-work.test.mjs"],
    note: RESERVED_870_879 + " " + "#504 の 7 回目のレビュー。孫が出力の管を握ったまま残り、フックが Claude Code の時間切れを超えて終わらない。終わりを支えるのは、グループごとの SIGKILL と、時間切れのときの管の destroy（ADR-0032 の追記）。",
  },
  {
    id: 900,
    label: "timer-web の vitest 設定が、vi.fn() の呼び出しの記録をテストごとに消さない（clearMocks を外す）",
    patch: "m900-timer-web-clear-mocks-removed.patch",
    pkg: "apps/timer-web",
    tests: ["test/config/mock-isolation.test.ts"],
    note: RESERVED_900_909 + " " + "#499。vi.mock の工場の vi.fn() の記録が次のテストへ漏れ、ランダムな順で App.session-lost などが落ちる。このテストは記録をファイルの読み込み時（テストより前）に作り、各テストの前に消えていることを見る。テスト同士の順に頼らないので、ランダムな順でも -t で 1 本だけ流しても検出される。",
  },
  {
    id: 901,
    label: "roulette-web の vitest 設定が、vi.fn() の呼び出しの記録をテストごとに消さない（clearMocks を外す）",
    patch: "m901-roulette-web-clear-mocks-removed.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/mock-isolation.test.ts"],
    note: RESERVED_900_909 + " " + "#499。vi.mock の工場の vi.fn() の記録が次のテストへ漏れ、ランダムな順で前のテストの呼び出しが残って落ちるテストが出る。このテストは記録をファイルの読み込み時（テストより前）に作り、各テストの前に消えていることを見る。テスト同士の順に頼らないので、ランダムな順でも -t で 1 本だけ流しても検出される。",
  },
  {
    id: 902,
    label: "agenda-web の vitest 設定が、vi.fn() の呼び出しの記録をテストごとに消さない（clearMocks を外す）",
    patch: "m902-agenda-web-clear-mocks-removed.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/mock-isolation.test.ts"],
    note: RESERVED_900_909 + " " + "#499。vi.mock の工場の vi.fn() の記録が次のテストへ漏れ、ランダムな順で前のテストの呼び出しが残って落ちるテストが出る。このテストは記録をファイルの読み込み時（テストより前）に作り、各テストの前に消えていることを見る。テスト同士の順に頼らないので、ランダムな順でも -t で 1 本だけ流しても検出される。",
  },
  {
    id: 903,
    label: "checkin-web の vitest 設定が、vi.fn() の呼び出しの記録をテストごとに消さない（clearMocks を外す）",
    patch: "m903-checkin-web-clear-mocks-removed.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/mock-isolation.test.ts"],
    note: RESERVED_900_909 + " " + "#499。vi.mock の工場の vi.fn() の記録が次のテストへ漏れ、ランダムな順で前のテストの呼び出しが残って落ちるテストが出る。このテストは記録をファイルの読み込み時（テストより前）に作り、各テストの前に消えていることを見る。テスト同士の順に頼らないので、ランダムな順でも -t で 1 本だけ流しても検出される。",
  },
  {
    id: 904,
    label: "poker-web の vitest 設定が、vi.fn() の呼び出しの記録をテストごとに消さない（clearMocks を外す）",
    patch: "m904-poker-web-clear-mocks-removed.patch",
    pkg: "apps/poker-web",
    tests: ["tests/mock-isolation.test.ts"],
    note: RESERVED_900_909 + " " + "#499。vi.mock の工場の vi.fn() の記録が次のテストへ漏れ、ランダムな順で前のテストの呼び出しが残って落ちるテストが出る。このテストは記録をファイルの読み込み時（テストより前）に作り、各テストの前に消えていることを見る。テスト同士の順に頼らないので、ランダムな順でも -t で 1 本だけ流しても検出される。",
  },
  {
    id: 905,
    label: "topic-web の vitest 設定が、vi.fn() の呼び出しの記録をテストごとに消さない（clearMocks を外す）",
    patch: "m905-topic-web-clear-mocks-removed.patch",
    pkg: "apps/topic-web",
    tests: ["tests/mock-isolation.test.ts"],
    note: RESERVED_900_909 + " " + "#499。vi.mock の工場の vi.fn() の記録が次のテストへ漏れ、ランダムな順で前のテストの呼び出しが残って落ちるテストが出る。このテストは記録をファイルの読み込み時（テストより前）に作り、各テストの前に消えていることを見る。テスト同士の順に頼らないので、ランダムな順でも -t で 1 本だけ流しても検出される。",
  },
  {
    id: 906,
    label: "landing の vitest 設定が、vi.fn() の呼び出しの記録をテストごとに消さない（clearMocks を外す）",
    patch: "m906-landing-clear-mocks-removed.patch",
    pkg: "apps/landing",
    tests: ["tests/mock-isolation.test.ts"],
    note: RESERVED_900_909 + " " + "#499。vi.mock の工場の vi.fn() の記録が次のテストへ漏れ、ランダムな順で前のテストの呼び出しが残って落ちるテストが出る。このテストは記録をファイルの読み込み時（テストより前）に作り、各テストの前に消えていることを見る。テスト同士の順に頼らないので、ランダムな順でも -t で 1 本だけ流しても検出される。",
  },
  {
    id: 907,
    label: "invite-ui の vitest 設定が、vi.fn() の呼び出しの記録をテストごとに消さない（clearMocks を外す）",
    patch: "m907-invite-ui-clear-mocks-removed.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/mock-isolation.test.ts"],
    note: RESERVED_900_909 + " " + "#499。vi.mock の工場の vi.fn() の記録が次のテストへ漏れ、ランダムな順で前のテストの呼び出しが残って落ちるテストが出る。このテストは記録をファイルの読み込み時（テストより前）に作り、各テストの前に消えていることを見る。テスト同士の順に頼らないので、ランダムな順でも -t で 1 本だけ流しても検出される。",
  },
  {
    id: 908,
    label: "e2e の vitest 設定が、vi.fn() の呼び出しの記録をテストごとに消さない（clearMocks を外す）",
    patch: "m908-e2e-clear-mocks-removed.patch",
    pkg: "e2e",
    tests: ["tests/mock-isolation.test.ts"],
    note: RESERVED_900_909 + " " + "#499。vi.mock の工場の vi.fn() の記録が次のテストへ漏れ、ランダムな順で前のテストの呼び出しが残って落ちるテストが出る。このテストは記録をファイルの読み込み時（テストより前）に作り、各テストの前に消えていることを見る。テスト同士の順に頼らないので、ランダムな順でも -t で 1 本だけ流しても検出される。",
  },
  {
    id: 910,
    label: "IPv6 の `::` の展開で、欠けるグループ数を 8 から頭の数を引く代わりに足す（尻が切れる）",
    patch: "m910-ipv6-expand-missing-plus-head.patch",
    pkg: "packages/rate-limit",
    tests: ["tests/client-key.test.ts"],
    note: RESERVED_910_919 + " " + "#521。IPv6 の `::` の展開（toGroups・expandIPv6Groups）の代表。頭が短く尻の長い射影（0:0::ffff:1.2.3.4）で尻が切れ、射影の IPv4 が v6 の鍵に落ちて、束ねる粒度が変わる。",
  },
  {
    id: 911,
    label: "転送ヘッダーの角括弧剥がしの先頭の錨 `^` を外す（途中の `[` まで剥がす）",
    patch: "m911-forwarded-bracket-strip-unanchored.patch",
    pkg: "packages/rate-limit",
    tests: ["tests/client-key.test.ts"],
    note: RESERVED_910_919 + " " + "#521。転送ヘッダーからのアドレスの取り出し（normalizeClientAddress）の代表。不正な値（203.0.113.[7）が IP として通り、鍵になる。",
  },
  {
    id: 912,
    label: "転送ヘッダーのゾーン ID（`%eth0`）剥がしを無くす",
    patch: "m912-forwarded-zone-id-kept.patch",
    pkg: "packages/rate-limit",
    tests: ["tests/client-key.test.ts"],
    note: RESERVED_910_919 + " " + "#521。転送ヘッダーからのアドレスの取り出しの代表。ゾーン ID つきの射影（::ffff:203.0.113.7%eth0）の IPv4 部が壊れ、同じクライアントが別の鍵になる。",
  },
  {
    id: 913,
    label: "ループバック判定の IPv4 の正規表現から先頭の錨 `^` を外す",
    patch: "m913-loopback-regex-head-anchor-dropped.patch",
    pkg: "packages/rate-limit",
    tests: ["tests/server-env.test.ts"],
    note: RESERVED_910_919 + " " + "#521。ループバックの判定（IPV4_LOOPBACK）の代表。1127.0.0.1 のような外部の値がループバック扱いになり、本番の HOST 検査をすり抜ける。",
  },
  {
    id: 914,
    label: "ループバック判定の 100〜199 のオクテットの `\\d` を `\\D` にする",
    patch: "m914-loopback-regex-octet-digit-class.patch",
    pkg: "packages/rate-limit",
    tests: ["tests/server-env.test.ts"],
    note: RESERVED_910_919 + " " + "#521。ループバックの判定のオクテットの範囲の代表。127.x.x.100〜199 が通らなくなり、正当な設定で本番が起動しなくなる（可用性）。",
  },
  {
    id: 915,
    label: "NODE_ENV の引用符の剥がしを「両側」から「片側でも」にする（&& を || に）",
    patch: "m915-node-env-one-sided-quote.patch",
    pkg: "packages/rate-limit",
    tests: ["tests/server-env.test.ts"],
    note: RESERVED_910_919 + " " + "#521。NODE_ENV の引用符の正規化（normalizeNodeEnv）の代表。片側だけ引用符のある値の先頭と末尾が黙って削られて既知の値に化け、未知の値を throw で止める防御がすり抜ける。",
  },
  {
    id: 916,
    label: "poker の受け口の上限の判定を `bytes > max` から `bytes >= max` にする",
    patch: "m916-poker-frame-limit-inclusive.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/poker/guards.test.ts"],
    note: RESERVED_910_919 + " " + "#521。フレームの上限（poker の受け口）の代表。上限ちょうどのメッセージが message-too-large で弾かれる。",
  },
  {
    id: 917,
    label: "refillPerSec の設定の検査を `<= 0` から `< 0` にする（0 を手前の検査で弾かない）",
    patch: "m917-refill-per-sec-zero-accepted-early.patch",
    pkg: "packages/rate-limit",
    tests: ["tests/token-bucket.test.ts"],
    note: RESERVED_910_919 + " " + "#521。設定の検査（token-bucket.ts の refillPerSec・capacity）の代表。後段の refillFullMs の検査が同じ入力を投げるので throw の有無では見えず、文言（どの設定が悪いか）が別の設定のものにすり替わる。",
  },
  {
    id: 918,
    label: "掃除を始める件数の境目を `size > sweepThreshold` から `>=` にする",
    patch: "m918-sweep-threshold-inclusive.patch",
    pkg: "packages/rate-limit",
    tests: ["tests/token-bucket.test.ts"],
    note: RESERVED_910_919 + " " + "#521。掃除を始める境目の代表。しきい値ちょうどの件数で全走査が走り、掃除の頻度が設計（D4）からずれる。",
  },
  {
    id: 919,
    label: "テキスト受け口（hub・topic・roulette・agenda・checkin・timer）の上限の判定を `bytes > max` から `bytes >= max` にする",
    patch: "m919-text-frame-limit-inclusive.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/ws-adapter.message.test.ts"],
    note: RESERVED_910_919 + " " + "#521。フレームの上限（テキストの受け口。createTextChannel 経由の全ツール）の代表。上限ちょうど（64KB）のメッセージが MESSAGE_TOO_LARGE で弾かれる。",
  },
  {
    id: 920,
    label: "順番に回すの輪の人数の上限を >= にして、24 人ちょうどを拒む",
    patch: "m920-roulette-order-wheel-limit-off-by-one.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-bounds.test.ts"],
    note: RESERVED_920_924 + " " + "#522。順番に回すで、上限ちょうど（24 人）の輪が ROULETTE_TOO_MANY で回せなくなる。他の決め方の上限（:83・:154）とずれる。",
  },
  {
    id: 921,
    label: "押して止めるの輪の人数の上限を >= にして、24 人ちょうどを拒む",
    patch: "m921-roulette-press-wheel-limit-off-by-one.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-bounds.test.ts"],
    note: RESERVED_920_924 + " " + "#522。押して止めるで、上限ちょうど（24 人）の輪が回せなくなる。",
  },
  {
    id: 922,
    label: "押して止めるの起点の揺らぎの上端（0.8）ちょうどを INVALID_SETTLE で拒む",
    patch: "m922-roulette-press-settle-max-exclusive.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-bounds.test.ts"],
    note: RESERVED_920_924 + " " + "#522。乱数源が上端ちょうどを返すと、押して止める回転が始まらない（下端・他の決め方の両端も同じ形で守る）。",
  },
  {
    id: 923,
    label: "押した位置の席の中の位置 0 ちょうどを ROULETTE_STOP_INVALID で拒む",
    patch: "m923-roulette-stop-settle-zero-rejected.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-bounds.test.ts"],
    note: RESERVED_920_924 + " " + "#522。席の境目ちょうどで押した人の押下が捨てられ、止まらないまま 30 秒の自動停止まで回り続ける。",
  },
  {
    id: 924,
    label: "押して止める回転の回転中の判定が、経過を now + startedAt で測る",
    patch: "m924-roulette-press-spinning-elapsed-sign.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-bounds.test.ts"],
    note: RESERVED_920_924 + " " + "#522。回し始めの時刻が 0 でないと、押して止める回転が回し始めの直後に止まったと見なされ、回転中の拒否と決め方の変更の拒否が効かない。",
  },
  // #522 agenda-core の変異を宣言しない形（id 48 の書き方）。**等価なもの（宣言しても殺せない）と、925 と観測が同じもの（重複になる）の 2 つがある。**
  // - agenda.ts:117 `step === undefined` → `false`: 等価。`deadlineOf` が同じ `currentId` で区切りを探し、
  //   無ければ `null` を返すので、`deadline === null` が先に効いて `step` は未定義にならない。
  // - agenda.ts:73 の `i > idx` → `i >= idx`・`i > idx` → `true`: 等価。`i === idx` は前の分岐で済み、
  //   現在より前の飛ばし済みの区切りは通り過ぎた時点で spentMs がすでに 0。
  // - agenda.ts:73 の `i < limit` → `i <= limit`: 等価。limit は飛ばしていない次の区切り（終了なら steps.length）で、
  //   その位置は `x.skipped` が偽になる。
  // - agenda.ts:73 の `x.skipped` → `true`: 等価。(idx, nextIdx) の区間は定義上すべて飛ばし済み。
  // - agenda.ts:73 の論理演算の変異（`(i > idx || i < limit) && x.skipped`・`(i > idx && i < limit) || x.skipped`・
  //   `i > idx && (i < limit || x.skipped)`）: 等価ではないが、観測できる振る舞いが 925 と同じ（現在より前の飛ばし済みは
  //   すでに 0 なので、書き換わるのは次より後ろの飛ばし済みだけ）。ランダムな操作列 2 万件で 925 と出力の差 0 を確かめたので、
  //   重複を避けて 925 だけを宣言する（これらも足したテストが殺す）。
  // - agenda.ts:73 の `settle(nextIdx)` → `settle(nextIdx + 1)`: 等価（nextIdx の位置は飛ばしていない）。
  //   （ランダムな操作列 10 万件で元と比べて差 0。等価でない `i < limit` → `true` は 3,822 件で差が出る。）
  {
    id: 925,
    label: "next が所要を確定するとき、次に来る区切りより後ろの飛ばし済みの区切りまで spentMs を 0 にする（i < limit の条件を外す）",
    patch: "m925-agenda-settle-skipped-beyond-next.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda-bounds.test.ts"],
    note: RESERVED_925_929 + " " + "#522。まだ来ていない飛ばし済みの区切りが「所要 0 で通り過ぎた」ことになり、後で飛ばしを戻しても所要が 0 のまま残る。代表は条件を外す形。範囲の条件の論理演算を入れ替えた形も観測が同じなので、これで代表する。",
  },
  {
    id: 926,
    label: "next が終了へ進むとき、所要の確定の範囲を steps.length - 1 までにする（最後の区切りが飛ばし済みでも 0 にならない）",
    patch: "m926-agenda-settle-finish-misses-last.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda-bounds.test.ts", "tests/agenda.test.ts"],
    note: RESERVED_925_929 + " " + "#522。残りをすべて飛ばして終えるとき、最後の飛ばし済みの区切りの所要が 0 にならず null のまま残る（範囲の上端）。前からある agenda.test.ts の「残りをすべて飛ばした後」も落ちる。足した性質テストと「最後だけが飛ばし済み」の例は、最後の区切りだけが飛ばし済みの場合でも守る。",
  },
  {
    id: 927,
    label: "next の所要の確定の範囲を i < idx にする（現在の直後から先の、通り過ぎた飛ばし済みが 0 にならない）",
    patch: "m927-agenda-settle-before-current.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda-bounds.test.ts"],
    note: RESERVED_925_929 + " " + "#522。通り過ぎた飛ばし済みの区切りが 0 にならず null のまま残る（範囲の向きを逆にして、現在の直後から先を外す）。現在より前の飛ばし済みはすでに 0 なので、書き換わりそのものは観測できない。",
  },
  {
    id: 928,
    label: "advanceIfDue が、期限を過ぎても「次へ自動」の区切りを進めない（onTimeout の判定を常に真にして早期に返す）",
    patch: "m928-agenda-advance-if-due-never-advances.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda-bounds.test.ts", "tests/agenda.test.ts"],
    note: RESERVED_925_929 + " " + "#522。agenda.ts:117 の判断を常に「進めない」にする形。期限が来ても自動で次へ移らず、会議が止まったままになる。この形は前からある agenda.test.ts でも落ちる（足したテストで初めて殺されるわけではない）。:117 の判断そのものを壊す形として、既存のテストが守っていることの記録に残す。",
  },
  {
    id: 929,
    label: "advanceIfDue が、期限ちょうどの「次へ自動」の区切りを進めない（deadline > now を deadline >= now にする）",
    patch: "m929-agenda-advance-if-due-at-deadline-held.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda-bounds.test.ts"],
    note: RESERVED_925_929 + " " + "#522。期限ちょうどの時刻に呼ばれても次へ移らず、1ms 後まで区切りが残る（期限ちょうどで確定する約束が崩れ、所要が 1 回の呼び出しぶん遅れる）。前からある agenda.test.ts は期限ちょうどを見ないので、足したテスト（期限の -1・0・+1ms を機械に選ばせる性質テストと、期限ちょうどで呼ぶ例）が殺す。",
  },
  {
    id: 930,
    label: "代理の参加者を足す上限の判定を rotation.length >= MAX_MEMBERS → > にする（上限ちょうどの人数でも足せてしまう）",
    patch: "m930-timer-core-addproxy-limit-off-by-one.patch",
    pkg: "packages/timer-core",
    tests: ["test/bounds.properties.test.ts"],
    note: RESERVED_930_934 + " " + "#522。上限ちょうど（10 人）の輪にもう 1 人入り、11 人になる。上限の検査を丸ごと外す変異も同じテストが落とす（代表は 1 つずれの形）。",
  },
  {
    id: 931,
    label: "席の移動で、運転手より前の席を運転手の席ちょうどへ動かす判断を toIndex >= currentIndex → > にする（運転手の位置がずれない）",
    patch: "m931-timer-core-move-driver-lands-on-seat-forward.patch",
    pkg: "packages/timer-core",
    tests: ["test/bounds.properties.test.ts"],
    note: RESERVED_930_934 + " " + "#522。運転手より前の席を運転手の席へ動かすと、運転手が 1 つ前へずれるのに currentIndex が追わず、別の人の番になる。",
  },
  {
    id: 932,
    label: "席の移動で、運転手より後ろの席を運転手の席ちょうどへ動かす判断を toIndex <= currentIndex → < にする（運転手の位置がずれない）",
    patch: "m932-timer-core-move-driver-lands-on-seat-backward.patch",
    pkg: "packages/timer-core",
    tests: ["test/bounds.properties.test.ts"],
    note: RESERVED_930_934 + " " + "#522。運転手より後ろの席を運転手の席へ動かすと、運転手が 1 つ後ろへずれるのに currentIndex が追わず、別の人の番になる。",
  },
  {
    id: 933,
    label: "周回での休憩の判定を totalSwitches - base.switches → totalSwitches + base.switches にする（基準が 0 でないと狂う）",
    patch: "m933-timer-core-break-rounds-adds-baseline.patch",
    pkg: "packages/timer-core",
    tests: ["test/bounds.properties.test.ts"],
    note: RESERVED_930_934 + " " + "#522。休憩のあと（基準の交代回数が 0 でない）に、次の休憩が早く来すぎる。",
  },
  {
    id: 934,
    label: "稼働経過時間の時計のずれを now + clockOffset → now - clockOffset にする（ずれの符号が逆）",
    patch: "m934-timer-core-elapsed-clock-offset-sign.patch",
    pkg: "packages/timer-core",
    tests: ["test/bounds.properties.test.ts"],
    note: RESERVED_930_934 + " " + "#522。クライアントの時計がずれているとき、稼働時間の表示と休憩の判定がずれの向きと逆に狂う。",
  },
  // card-game.ts:77 の範囲の検査（`i >= 0 && i < hand.length`）を壊す 6 件（filter を外す・条件を true・&& を ||・
  // 下端の検査を true・上端の検査を true・上端を <=）は、**等価変異なので宣言しない**（#522）。結果の `drop` は
  // `hand.filter((_, i) => drop.has(i))` で位置 0〜4 だけを引くので、範囲外の番号が `drop` に入っても振る舞いが変わらない。
  // 無作為に生成した入力（fast-check。種 1・20,000 runs。±1e300・2**53・4.999999・±MIN_VALUE・任意の double・1〜10 人の連続したチェンジ）で、元と出力の差は 0 件だった。
  // 範囲の両端そのもの（`> 0`・`hand.length - 1` 未満）は既存のテストが殺すので、これも代表にしない。
  {
    id: 935,
    label: "山札が足りているときも捨て札を切り直して山に足す（:81 の条件を常に真にする）",
    patch: "m935-poker-exchange-deck-always-reshuffles-discards.patch",
    pkg: "packages/poker-core",
    tests: ["tests/card-game-bounds.test.ts"],
    note: RESERVED_935_939 + " " + "#522。山の残りに前の人の捨て札が混ざり、捨て札が空になる。既存のテストでは生き残る形（調査の 2.5 の 81 行目の `true`）。",
  },
  {
    id: 936,
    label: "山札がちょうど足りるときにも捨て札を切り直して山に足す（:81 を <= にする）",
    patch: "m936-poker-exchange-deck-exact-reshuffles-discards.patch",
    pkg: "packages/poker-core",
    tests: ["tests/card-game-bounds.test.ts"],
    note: RESERVED_935_939 + " " + "#522。山の残りと捨て札の中身が仕様とずれる。既存のテストでは生き残る形（2.5 の 81 行目の `<=`）。",
  },
  {
    id: 937,
    label: "山札と捨て札を合わせてちょうど足りるときにも、今捨てた札を山へ戻す（:85 を <= にする）",
    patch: "m937-poker-exchange-pool-exact-reshuffles-thrown.patch",
    pkg: "packages/poker-core",
    tests: ["tests/card-game-bounds.test.ts"],
    note: RESERVED_935_939 + " " + "#522。捨てた札が捨て札に残らず山へ戻る。既存のテストでは生き残る形（2.5 の 85 行目の `<=`）。",
  },
  {
    id: 938,
    label: "山札が 1 枚足りないときに捨て札を切り直さない（:81 を thrown.length - 1 未満にする）",
    patch: "m938-poker-exchange-deck-one-short-undefined-card.patch",
    pkg: "packages/poker-core",
    tests: ["tests/card-game-bounds.test.ts"],
    note: RESERVED_935_939 + " " + "#522。山が 1 枚足りないのに捨て札を足さず、手に undefined の札が入る。既存のテストでは生き残る。",
  },
  {
    id: 939,
    label: "山札と捨て札を合わせて 1 枚足りないときに、今捨てた札を山へ戻さない（:85 を thrown.length - 1 未満にする）",
    patch: "m939-poker-exchange-pool-one-short-undefined-card.patch",
    pkg: "packages/poker-core",
    tests: ["tests/card-game-bounds.test.ts"],
    note: RESERVED_935_939 + " " + "#522。山と捨て札を合わせて 1 枚足りないのに戻さず、手に undefined の札が入る。既存のテストでは生き残る。",
  },
  {
    id: 950,
    label: "ランダムな順の検査が、vitest のパッケージに --sequence.shuffle を足さない（種だけ渡して同じ順で流す）",
    patch: "m950-shuffled-vitest-drops-shuffle.patch",
    pkg: "scripts",
    tests: ["lib/shuffled-tests.test.mjs"],
    note: RESERVED_950_959 + " " + "#524。vitest のテストが毎回同じ順で流れ、順番依存が入っても全件の段が緑のまま。種をログに出して「ランダムな順で緑」に見えるので、検査があるという安心だけが残る。",
  },
  {
    id: 951,
    label: "ランダムな順の検査が、bun のパッケージ（同期サーバー）に --randomize を足さない",
    patch: "m951-shuffled-bun-drops-randomize.patch",
    pkg: "scripts",
    tests: ["lib/shuffled-tests.test.mjs"],
    note: RESERVED_950_959 + " " + "#524。同期サーバーのテストだけが毎回同じ順で流れ、vitest 側が緑でもサーバー側の順番依存を見逃す。",
  },
  {
    id: 952,
    label: "ランダムな順の検査が、知らないテストランナーのパッケージを落とさず黙って対象外にする",
    patch: "m952-shuffled-unknown-runner-skipped.patch",
    pkg: "scripts",
    tests: ["lib/shuffled-tests.test.mjs"],
    note: RESERVED_950_959 + " " + "#524。新しいランナーのパッケージが足されても検査の外に出たまま緑になり、ランダムな順で流れていないことに誰も気づかない。",
  },
  {
    id: 953,
    label: "ランダムな順の検査の再現のコマンドが、順と種の指定を落とす（同じ順にならない）",
    patch: "m953-shuffled-repro-drops-seed.patch",
    pkg: "scripts",
    tests: ["lib/shuffled-tests.test.mjs"],
    note: RESERVED_950_959 + " " + "#524。落ちた順番依存を手元で再現しようとしても、ログのコマンドは普通の順で流れて緑になり、原因を追えない。",
  },
  {
    id: 954,
    label: "ランダムな順の検査が、パッケージが落ちても終了コード 0 で終わる",
    patch: "m954-shuffled-exit-code-always-zero.patch",
    pkg: "scripts",
    tests: ["test-shuffled.test.mjs"],
    note: RESERVED_950_959 + " " + "#524。順番依存のテストが落ちても CI のジョブが緑のままで、検査が何も止めない。",
  },
  {
    id: 955,
    label: "手元の速い段が、ランダムな順のテストの job を省略せず流す",
    patch: "m955-local-check-fast-runs-shuffle.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: RESERVED_950_959 + " " + "#524。全件の段に置いたはずの重い検査（23 パッケージで数分）が pnpm check:fast にも入り、実装中の速さが落ちる。段の置き場が文書とずれる。",
  },
  {
    id: 956,
    label: "ランダムな順の検査が、流したパッケージが 0 件（全部が対象外）でも緑で終わる",
    patch: "m956-shuffled-zero-runs-is-green.patch",
    pkg: "scripts",
    tests: ["test-shuffled.test.mjs"],
    note: RESERVED_950_959 + " " + "#524のレビュー。テストランナーの判定が全パッケージで対象外に倒れても検査が緑のまま残り、何も流していないことに誰も気づかない。",
  },
  {
    id: 957,
    label: "ランダムな順の検査が、--all も --pkg も無い起動で使い方を出さず全パッケージを流す",
    patch: "m957-shuffled-runs-without-selection.patch",
    pkg: "scripts",
    tests: ["test-shuffled.test.mjs"],
    note: RESERVED_950_959 + " " + "#524のレビュー。引数なしで起動する別の自己テスト（entry-point-wiring）が数分の検査を走らせて時間切れになる。無指定で重い検査が走る。",
  },
  {
    id: 958,
    label: "ランダムな順の検査が、版の確かめ（check-toolchain）の結果を見ずに流し始める",
    patch: "m958-shuffled-toolchain-check-skipped.patch",
    pkg: "scripts",
    tests: ["test-shuffled.test.mjs"],
    note: RESERVED_950_959 + " " + "#524のレビュー。合わない版の Node・Bun でランダムな順のテストを流し、版の違いによる落ち方を順番依存と取り違える（docs/adr/0031 決定 2）。",
  },
  {
    id: 959,
    label: "ランダムな順の検査の最初の行の再現コマンドが、--all / --pkg を落とす",
    patch: "m959-shuffled-rerun-command-drops-selection.patch",
    pkg: "scripts",
    tests: ["test-shuffled.test.mjs"],
    note: RESERVED_950_959 + " " + "#524のレビュー。ログの先頭の「同じ種で再現」を貼っても使い方を出して終わり、種で流し直せない。",
  },
  {
    id: 940,
    label: "audit-test-focus が .only を見つけない（止める名前の表から only を外す）",
    patch: "m940-test-focus-only-not-detected.patch",
    pkg: "scripts",
    tests: ["lib/focused-skipped-tests.test.mjs"],
    note: RESERVED_940_949 + " " + "#523。`.only` が 1 つ残っても検査が緑のまま、同じファイルの他のテストが黙って流れなくなる。",
  },
  {
    id: 941,
    label: "audit-test-focus が、空行で離れたコメントの「理由:」も理由と認める",
    patch: "m941-test-focus-reason-comment-across-blank-lines.patch",
    pkg: "scripts",
    tests: ["lib/focused-skipped-tests.test.mjs"],
    note: RESERVED_940_949 + " " + "#523。`.skip` と無関係な離れたコメントが理由として通り、理由の無い skip が残る。",
  },
  {
    id: 942,
    label: "audit-test-focus が、テストを定義する関数以外（agenda.skip・driver.skip など）の .skip も止める",
    patch: "m942-test-focus-any-receiver-skip-flagged.patch",
    pkg: "scripts",
    tests: ["lib/focused-skipped-tests.test.mjs"],
    note: RESERVED_940_949 + " " + "#523。コマンド名・メソッド名の `.skip` で誤検出し、正しいテストが赤くなって検査が信用されなくなる。",
  },
  {
    id: 943,
    label: "audit-test-focus が node:test のオプション（{ skip: … }・{ only: true }）を見ない",
    patch: "m943-test-focus-node-test-options-ignored.patch",
    pkg: "scripts",
    tests: ["lib/focused-skipped-tests.test.mjs"],
    note: RESERVED_940_949 + " " + "#523。`node --test` のテストの `only` / `skip` が検査をすり抜ける。",
  },
  {
    id: 944,
    label: "audit-test-focus が、中身の無い「理由:」だけのコメントも理由と認める",
    patch: "m944-test-focus-empty-reason-accepted.patch",
    pkg: "scripts",
    tests: ["lib/focused-skipped-tests.test.mjs"],
    note: RESERVED_940_949 + " " + "#523。「理由:」と書くだけで skip が通り、飛ばす理由が記録に残らない。",
  },
  {
    id: 945,
    label: "audit-test-focus が違反を見つけても非ゼロで終了しない",
    patch: "m945-test-focus-violation-does-not-exit.patch",
    pkg: "scripts",
    tests: ["audit-test-focus.test.mjs"],
    note: RESERVED_940_949 + " " + "#523。違反を表示するだけで CI が緑になり、`.only` が main に入る。",
  },
  {
    id: 946,
    label: "audit-test-focus の走査対象から *.spec.ts（e2e/specs の Playwright）を外す",
    patch: "m946-test-focus-spec-files-not-scanned.patch",
    pkg: "scripts",
    tests: ["audit-test-focus.test.mjs"],
    note: RESERVED_940_949 + " " + "#523。各パッケージの test ディレクトリの外にある E2E の `.only` が検査をすり抜ける（Playwright の forbidOnly は CI でしか効かない）。",
  },
  {
    id: 948,
    label: "audit-test-focus の「名前で分かるテストの一覧が 0 件」のガードを外す",
    patch: "m948-test-focus-zero-named-tests-allowed.patch",
    pkg: "scripts",
    tests: ["audit-test-focus.test.mjs"],
    note: RESERVED_940_949 + " " + "#523。一覧の取得が壊れても、test ディレクトリの分だけで緑になり、E2E・scripts・ui のテストが静かに検査から外れる。",
  },
  {
    id: 947,
    label: "audit-test-focus の走査の型から bun の *_test.* / *_spec.* を外す",
    patch: "m947-test-focus-underscore-test-names-not-scanned.patch",
    pkg: "scripts",
    tests: ["audit-test-focus.test.mjs"],
    note: RESERVED_940_949 + " " + "#523 のレビュー。`src` の中などにある bun の `*_test.ts` の `.only` が検査をすり抜ける。",
  },
  {
    id: 949,
    label: "audit-test-focus が、行の途中の「理由:」（「この理由: …」）も理由と認める",
    patch: "m949-test-focus-reason-anywhere-in-line.patch",
    pkg: "scripts",
    tests: ["lib/focused-skipped-tests.test.mjs"],
    note: RESERVED_940_949 + " " + "#523 のレビュー。無関係なコメントが理由として通り、文書の形より緩くなる。",
  },
  {
    id: 965,
    label: "メンバー追加の上限の検査を rotation.length >= MAX_MEMBERS → > にする（上限ちょうどの 10 人の輪にも足せて 11 人になる）",
    patch: "m965-timer-core-member-add-limit-gt.patch",
    pkg: "packages/timer-core",
    tests: ["test/bounds.properties.test.ts"],
    note: RESERVED_965_969 + " " + "#534。メンバー追加（member.add）の 1 つずれ。上限（10 人）の輪にさらに足せて 11 人になる。上限の検査を丸ごと外す・`>= MAX + 1` は、席が MAX を超えない不変条件（test/properties.test.ts:129）の下で同じ振る舞いなので宣言しない（代表は 1 つずれの形）。",
  },
  {
    id: 966,
    label: "メンバー追加の上限の検査を >= MAX_MEMBERS → >= MAX_MEMBERS - 1 にする（上限の 1 つ手前の 9 人の輪に足せない）",
    patch: "m966-timer-core-member-add-limit-minus-one.patch",
    pkg: "packages/timer-core",
    tests: ["test/bounds.properties.test.ts"],
    note: RESERVED_965_969 + " " + "#534。メンバー追加の上限が 1 人少なく、9 人の輪に足せない。既存の「10人超過はエラー」では生き残る形。",
  },
  {
    id: 967,
    label: "メンバー追加の上限の数え方を、席の数 → member の席だけ（代理を数えない）にする（代理を混ぜた満員の輪にも足せる）",
    patch: "m967-timer-core-member-add-limit-counts-members-only.patch",
    pkg: "packages/timer-core",
    tests: ["test/bounds.properties.test.ts"],
    note: RESERVED_965_969 + " " + "#534のレビュー。代理の席が上限に数えられず、member 9 人＋代理 1 人の輪にも足せて 11 席になる。",
  },
  {
    id: 968,
    label: "メンバー追加で、上限の判定を重複（DuplicateName）の判定より先に行う（満員の輪に既にいる ID の送り直しが上限の誤りになる）",
    patch: "m968-timer-core-member-add-limit-before-duplicate.patch",
    pkg: "packages/timer-core",
    tests: ["test/bounds.properties.test.ts"],
    note: RESERVED_965_969 + " " + "#534のレビュー。満員の輪で送り直し（既にいる ID）が重複の誤りでなく上限の誤りになり、再送の吸収の合図が変わる。",
  },
  {
    id: 969,
    label: "メンバー追加が上限で断るときのエラーの limit を MAX_MEMBERS → MAX_MEMBERS - 1 にする（種類は同じで上限の値だけが狂う）",
    patch: "m969-timer-core-member-add-limit-value.patch",
    pkg: "packages/timer-core",
    tests: ["test/bounds.properties.test.ts"],
    note: RESERVED_965_969 + " " + "#534のレビュー。上限で断られたときに画面へ伝わる上限の人数が実際とずれる（エラーの種類だけを見るテストでは気づけない）。",
  },
  {
    id: 970,
    label: "並列の作業ツリーへの依存の入れ方が、本体のストアを --store-dir で渡さない",
    patch: "m970-install-drops-store-dir.patch",
    pkg: "scripts",
    tests: ["lib/mutation-parallel.test.mjs"],
    note: RESERVED_970_979 + " " + "#535。一時ディレクトリが別のファイルシステム（CI の /tmp・TMPDIR=/dev/shm）だと pnpm が空のストアに切り替え、--offline で依存を入れられずに変異検査のシャードが落ちる。",
  },
  {
    id: 971,
    label: "並列の作業ツリーへの依存の入れ方が、--offline を落とす",
    patch: "m971-install-drops-offline.patch",
    pkg: "scripts",
    tests: ["lib/mutation-parallel.test.mjs"],
    note: RESERVED_970_979 + " " + "#535。ストアに無い依存を黙ってネットワークから取りに行き、CI で本体の pnpm install 漏れに気づけず、取得の揺れで落ちる。",
  },
  {
    id: 972,
    label: "本体のストアの場所の取り出しが、絶対パスでない出力を受ける",
    patch: "m972-store-path-accepts-relative.patch",
    pkg: "scripts",
    tests: ["lib/mutation-parallel.test.mjs"],
    note: RESERVED_970_979 + " " + "#535。空や警告まじりの出力が相対パスのストアとして作業ツリーの中で解かれ、本体とは別の空のストアを指して依存が入らない。",
  },
  {
    id: 973,
    label: "本体のストアの場所の取り出しが、出力の末尾の改行を落とさない",
    patch: "m973-store-path-keeps-newline.patch",
    pkg: "scripts",
    tests: ["lib/mutation-parallel.test.mjs"],
    note: RESERVED_970_979 + " " + "#535。改行つきのパスが --store-dir に渡り、存在しないストアを指して依存が入らない。",
  },
  {
    id: 974,
    label: "本体のストアの場所を、本体でなく呼び出し元の cwd で引く",
    patch: "m974-store-path-wrong-cwd.patch",
    pkg: "scripts",
    tests: ["lib/mutation-parallel.test.mjs"],
    note: RESERVED_970_979 + " " + "#535 のレビュー。作業ツリーの中で pnpm store path を引くと、その作業ツリーのファイルシステムのストアを指し、別のファイルシステムでは元の失敗（--offline で依存を入れられない）に戻る。",
  },
  {
    id: 975,
    label: "本体のストアの場所の取り出しが、複数行の出力を受ける",
    patch: "m975-store-path-accepts-multiline.patch",
    pkg: "scripts",
    tests: ["lib/mutation-parallel.test.mjs"],
    note: RESERVED_970_979 + " " + "#535 のレビュー。先頭だけ絶対パスで後ろに警告が混ざった出力が通り、改行つきのパスが --store-dir に渡って依存が入らない。",
  },
  {
    id: 976,
    label: "本体のストアの場所を引けなかったときの文言から、本体のパスを落とす",
    patch: "m976-store-error-drops-repo-root.patch",
    pkg: "scripts",
    tests: ["lib/mutation-parallel.test.mjs"],
    note: RESERVED_970_979 + " " + "#535 のレビュー。どの作業ツリーで pnpm store path が失敗したか分からず、何を直せばよいか辿れない。",
  },
  {
    id: 980,
    label: "メンバー追加の上限の数え方を、席の数 → 一時離脱でない席（eligible）だけにする（離脱中の人がいる満員の輪にも足せる）",
    patch: "m980-timer-core-member-add-limit-counts-eligible-only.patch",
    pkg: "packages/timer-core",
    tests: ["test/bounds.properties.test.ts"],
    note: RESERVED_980_984 + " " + "#534のレビュー。一時離脱中の人が席を持つのに上限に数えられず、10 席の輪にも足せて 11 席になる。",
  },
  {
    id: 981,
    label: "メンバー追加の上限の数え方を、席の数 → member の席と一時離脱でない席だけにする（離脱中の代理の席を数えず、満員の輪にも足せる）",
    patch: "m981-timer-core-member-add-limit-skips-away-proxy.patch",
    pkg: "packages/timer-core",
    tests: ["test/bounds.properties.test.ts"],
    note: RESERVED_980_984 + " " + "#534のレビュー。一時離脱中の代理が席を持つのに上限に数えられず、10 席の輪にも足せて 11 席になる。",
  },
  {
    id: 985,
    label: "audit-plan-gate が、設計文書の問題を一覧で書いた直後に process.exitCode を立てず globalThis.process.exit(1) で終わる（構文木の走査は見ない書き方。動的なテストだけが拾う）",
    patch: "m985-plan-gate-failure-path-process-exit.patch",
    pkg: "scripts",
    tests: ["exit-flush.test.mjs"],
    note: RESERVED_985_994 + " " + "#540。stderr がパイプのとき process.exit は書き出し途中の出力を捨てる。失敗の一覧が途中で切れ、末尾の「様式の正本」が届かない。負荷の下で 変異 853 の対照実行が CI でときどき落ちた形。親が遅れて読む実行で決定的に赤くなる。",
  },
  {
    id: 986,
    label: "audit-log-hygiene が、問題の一覧を書いた直後に process.exitCode を立てず process.exit(1) で終わる",
    patch: "m986-log-hygiene-failure-path-process-exit.patch",
    pkg: "scripts",
    tests: ["exit-flush.test.mjs"],
    note: RESERVED_985_994 + " " + "#540。audit-plan-gate 以外の検査へ process.exit が戻る形（導出の検査が拾う）。長い一覧が負荷の下で切れる。",
  },
  {
    id: 987,
    label: "audit-plan-gate が、設計文書の 0 件ガードで process.exitCode を立てた後に return せず、検査を続ける",
    patch: "m987-plan-gate-empty-guard-no-return.patch",
    pkg: "scripts",
    tests: ["exit-flush.test.mjs"],
    note: RESERVED_985_994 + " " + "#540。立てた後も後続の検査が走り、失敗の経路で OK の行や別の一覧まで出る。構文木の検査（exitCode の直後は return か関数の最後）が拾う。",
  },
  {
    id: 960,
    label: "チェンジで山が足りないとき、捨て札を切り直さず捨てた順のまま山へ足す（:82 の shuffle を外す）",
    patch: "m960-poker-exchange-discards-not-reshuffled.patch",
    pkg: "packages/poker-core",
    tests: ["tests/card-game-reshuffle.test.ts"],
    note: RESERVED_960_964 + " " + "#533。直前の人が捨てた札の順で次の人が引くので、引く札が読める。既存のテストは乱数に identity を渡すので生き残る形。",
  },
  {
    id: 961,
    label: "チェンジで捨て札でも足りないとき、今捨てた札を切り直さず捨てた順のまま山へ足す（:86 の shuffle を外す）",
    patch: "m961-poker-exchange-thrown-not-reshuffled.patch",
    pkg: "packages/poker-core",
    tests: ["tests/card-game-reshuffle.test.ts"],
    note: RESERVED_960_964 + " " + "#533。今捨てた札が捨てた順で戻り、引く札が読める。既存のテストでは生き残る形。",
  },
  {
    id: 962,
    label: "捨て札の切り直しが、注入された乱数を捨てて常に 0 を返す乱数を使う（:82）",
    patch: "m962-poker-exchange-discards-shuffle-ignores-random.patch",
    pkg: "packages/poker-core",
    tests: ["tests/card-game-reshuffle.test.ts"],
    note: RESERVED_960_964 + " " + "#533。乱数の注入が効かず、捨て札が毎回同じ並べ替えで戻る。レビューで、乱数の列が常に 0 のテストでは生き残ると分かり、0 以外を含む列に直した。並べ替えない乱数（`(n) => n - 1`）に替える形も、同じテストで赤くなる（手で確かめた）。",
  },
  {
    id: 963,
    label: "今捨てた札の切り直しが、注入された乱数を捨てて常に 0 を返す乱数を使う（:86）",
    patch: "m963-poker-exchange-thrown-shuffle-ignores-random.patch",
    pkg: "packages/poker-core",
    tests: ["tests/card-game-reshuffle.test.ts"],
    note: RESERVED_960_964 + " " + "#533。乱数の注入が効かず、今捨てた札が毎回同じ並べ替えで戻る。0 以外を含む列で赤くなる。並べ替えない乱数（`(n) => n - 1`）に替える形も同じテストで赤くなる（手で確かめた）。",
  },
  {
    id: 964,
    label: "捨て札の切り直しの結果を逆順にして山へ足す（:82）",
    patch: "m964-poker-exchange-discards-reshuffle-reversed.patch",
    pkg: "packages/poker-core",
    tests: ["tests/card-game-reshuffle.test.ts"],
    note: RESERVED_960_964 + " " + "#533。乱数のとおりの並びにならず、決まった乱数から並びを求められない。",
  },
  {
    id: 995,
    label: "孫の生死の判定が、ゾンビ（状態 Z）を生きていると数える",
    patch: "m995-process-alive-counts-zombie-as-alive.patch",
    pkg: "scripts",
    tests: ["lib/process-alive.test.mjs", "lib/prior-work.test.mjs"],
    note: RESERVED_995_999 + " " + "#525。PID 1 が孤児を回収しないクラウドのコンテナで、SIGKILL で死んだ孫を「生き残った」と読み、孫を止める性質（変異 873）のテストが毎回落ちる。",
  },
  {
    id: 996,
    label: "孫の生死の判定が、存在しないプロセス（ESRCH）を生きていると数える",
    patch: "m996-process-alive-counts-missing-as-alive.patch",
    pkg: "scripts",
    tests: ["lib/process-alive.test.mjs"],
    note: RESERVED_995_999 + " " + "#525。存在しないプロセスも「生きている」と読むので、死んで回収された孫を生き残りと誤読する（孫を止める性質のテスト（変異 873）が、本当は止まっていても赤くなる）。検出は process-alive.test.mjs の「存在しない」テスト。",
  },
  {
    id: 997,
    label: "状態を読めない（null）ときを、生きていると数えず死んだと数える",
    patch: "m997-process-alive-counts-unreadable-as-dead.patch",
    pkg: "scripts",
    tests: ["lib/process-alive.test.mjs"],
    note: RESERVED_995_999 + " " + "#525 のレビュー。/proc も ps も読めない環境で、本当に生き残った孫を死んだと読んで見逃す（生き残りの検査が通ってしまう）。",
  },
  {
    id: 998,
    label: "stat の状態を、最後でなく最初の ')' の後ろから読む",
    patch: "m998-process-alive-stat-reads-first-paren.patch",
    pkg: "scripts",
    tests: ["lib/process-alive.test.mjs"],
    note: RESERVED_995_999 + " " + "#525 のレビュー。comm に ')' を含むプロセスの状態を取り違え、ゾンビを生きている（またはその逆）と読む。",
  },
  {
    id: 999,
    label: "/proc があるのに stat が ENOENT（回収されて消えた）のとき、死んだと読まず ps へ落とす",
    patch: "m999-process-alive-enoent-falls-through-to-ps.patch",
    pkg: "scripts",
    tests: ["lib/process-alive.test.mjs"],
    note: RESERVED_995_999 + " " + "#525 の /code-review。kill 0 の後に回収された孫を、ps も見つけられず null → 生きていると読み、孫のテストが誤って落ちる。",
  },
  {
    id: 1000,
    label: "複製の接頭辞の重なりの判定が、重なりを常に見逃す",
    patch: "m1000-copy-harness-overlap-never-reported.patch",
    pkg: "scripts",
    tests: ["script-copy-harness.test.mjs"],
    note: RESERVED_1000_1009 + " " + "#544。接頭辞が別のファイルの接頭辞の前方一致になっても気づけず、並列に走るテストの複製が互いの掃除で消えて、原因の分かりにくい失敗になる。",
  },
  {
    id: 1001,
    label: "複製の起動時の掃除が、自分の接頭辞より広く（`.` で始まる名前すべて）消す",
    patch: "m1001-copy-harness-cleanup-removes-any-dot-file.patch",
    pkg: "scripts",
    tests: ["script-copy-harness.test.mjs"],
    note: RESERVED_1000_1009 + " " + "#544。同時に走る別のファイルの複製（や scripts/ の隠しファイル）を消し、走行中のテストが落ちる。",
  },
  {
    id: 1010,
    label: "実測の表の引きが、表にある組も常に「表に無い」を返す（重さがランナーごとの固定値に戻る）",
    patch: "m1010-measured-lookup-always-misses.patch",
    pkg: "scripts",
    tests: ["lib/mutation-weights.test.mjs"],
    note: RESERVED_1010_1019 + " " + "#546。重い組（約 1 分の検査スクリプトのテストなど）も 0.4 秒として数えられ、それを指す変異が同じシャード・ワーカーに寄って、そこだけが時間切れに近づく（#544 では 1 つのシャードが 18 分になった）。",
  },
  {
    id: 1011,
    label: "実測の表の鍵が、行の最初のテストファイルだけで作られる（複数ファイルの組の行が引けなくなる）",
    patch: "m1011-table-key-uses-first-test-only.patch",
    pkg: "scripts",
    tests: ["lib/mutation-weights.test.mjs"],
    note: RESERVED_1010_1019 + " " + "#546。重いファイルを含む別の組（軽いファイルを足した組など）まで重い組として数えられ、分け前が逆に偏る。",
  },
  {
    id: 1012,
    label: "分け方が重い組を先に重さで均さず、全部を置き場ごとの散らしだけで配る",
    patch: "m1012-partition-no-heavy-first.patch",
    pkg: "scripts",
    tests: ["lib/mutation-partition.test.mjs"],
    note: RESERVED_1010_1019 + " " + "#546。重い組の分け前にも軽い組が 1/n ずつ足され、最も長いシャード・ワーカーが短くならない。",
  },
  {
    id: 1013,
    label: "軽い組の配り方が、重い組で埋まった分け前の空きを見ず、どの分け前にも同じ量を配る",
    patch: "m1013-partition-ignores-room.patch",
    pkg: "scripts",
    tests: ["lib/mutation-partition.test.mjs"],
    note: RESERVED_1010_1019 + " " + "#546。重い組を持つ分け前に軽い組が余分に載り、そこだけが長くなる。",
  },
  {
    id: 1014,
    label: "分け方が重い組を重い順でなく鍵の順に配る",
    patch: "m1014-partition-heavy-in-key-order.patch",
    pkg: "scripts",
    tests: ["lib/mutation-partition.test.mjs"],
    note: RESERVED_1010_1019 + " " + "#546。重い組が鍵の順に配られ、重い組どうしが同じ分け前に寄って最も長い分け前が伸びる。",
  },
  {
    id: 1020,
    label: "複製の実行が、渡された引数（`args`）を子へ渡さない",
    patch: "m1020-copy-harness-drops-args.patch",
    pkg: "scripts",
    tests: ["script-copy-harness.test.mjs"],
    note: RESERVED_1020_1029 + " " + "#547。check-toolchain.test.mjs の段（test / e2e / mutation）が子へ届かず、段ごとの配線の確認が全部「段なし」の経路に変わる。",
  },
  {
    id: 1021,
    label: "複製を使う非同期の処理（`withScriptCopy`）が、処理の決着を待たずに複製を消す",
    patch: "m1021-copy-harness-removes-copy-before-async-settles.patch",
    pkg: "scripts",
    tests: ["script-copy-harness.test.mjs"],
    note: RESERVED_1020_1029 + " " + "#547。exit-flush.test.mjs の子が起動する前に複製が消え、子が見つからずに落ちる（またはテストが原因の分かりにくい失敗になる）。",
  },
  {
    id: 1022,
    label: "複製の実行が、渡された環境（`env`）を親の環境の下に重ねる（親の値が勝ち、`undefined` で打ち消せない）",
    patch: "m1022-copy-harness-env-parent-overrides-given.patch",
    pkg: "scripts",
    tests: ["script-copy-harness.test.mjs"],
    note: RESERVED_1020_1029 + " " + "#547。check-toolchain.test.mjs が渡す環境（npm_config_user_agent の除去ほか）が効かず、pnpm の版を確かめる経路を通らなくなる。",
  },
  {
    id: 1030,
    label: "CI のログの検出の秒数を「対照:」の行でなく「変異」の行から数える（対照の秒数が検出に二重に入る）",
    patch: "m1030-detect-counted-from-mutation-line.patch",
    pkg: "scripts",
    tests: ["measure-mutation-costs.test.mjs"],
    note: RESERVED_1030_1039 + " " + "#550。測り直しの道具が検出の秒数を対照ぶん多く数え、ランナーごとの既定値と表の値が重い側へずれる。",
  },
  {
    id: 1031,
    label: "CI のログの使い回しの対照を、対照の秒数として数える（0 秒に近い値が平均に入る）",
    patch: "m1031-reused-control-counted.patch",
    pkg: "scripts",
    tests: ["measure-mutation-costs.test.mjs"],
    note: RESERVED_1030_1039 + " " + "#550。測り直しの道具が対照の秒数を軽く数え、既定値と表の対照が軽い側へずれる。",
  },
  {
    id: 1032,
    label: "表に載せる目安が、見積もりの 2 倍以上でなく 1 倍以上になる（既定値で足りる組まで案に出る）",
    patch: "m1032-table-threshold-loosened.patch",
    pkg: "scripts",
    tests: ["measure-mutation-costs.test.mjs"],
    note: RESERVED_1030_1039 + " " + "#550。測り直しの道具が、既定値で足りる組まで表の案に出し、表が腐りやすくなる（原則 X）。",
  },
  {
    id: 1033,
    label: "測り直した案の重みが、全組を重い組として数える（重い組の印が意味を失う）",
    patch: "m1033-weights-everything-heavy.patch",
    pkg: "scripts",
    tests: ["measure-mutation-costs.test.mjs"],
    note: RESERVED_1030_1039 + " " + "#550。案の効果の模擬が、本番の分け方（表の行だけを重い組として先に配る）と別の形になり、模擬の差が当てにならなくなる。",
  },
  {
    id: 1034,
    label: "`--leave-one-out` の取り置きが、残す run を除かず全 run を返す（案を測った run そのもので分ける）",
    patch: "m1034-hold-out-keeps-all-runs.patch",
    pkg: "scripts",
    tests: ["measure-mutation-costs.test.mjs"],
    note: RESERVED_1030_1039 + " " + "#550。取り置きの検証が、案を測った run そのものを分けて、良く見えすぎる（他の run への効きを確かめられない）。",
  },
  {
    id: 1035,
    label: "宣言の組の絞り込みが、宣言にある組を落とし、無い組を残す",
    patch: "m1035-only-declared-inverted.patch",
    pkg: "scripts",
    tests: ["measure-mutation-costs.test.mjs"],
    note: RESERVED_1030_1039 + " " + "#550。消した・並びを変えた組の実測が案に混ざり、いまの表にも既定値にも効かない値で見積もりがずれる。",
  },
  {
    id: 1036,
    label: "表に載せる目安から、自己テストの下限（対照 1 回＋検出 1 回が `HEAVY_RUN_SECONDS` 以上）の条件を外す",
    patch: "m1036-table-drops-run-floor.patch",
    pkg: "scripts",
    tests: ["measure-mutation-costs.test.mjs"],
    note: RESERVED_1030_1039 + " " + "#550。案をそのまま写すと表の自己テストが赤になる（件数の多い軽い組が案に出る）。",
  },
  {
    id: 1037,
    label: "ランナーごとの既定値の検出が、件数で重みを付けずに組ごとの平均になる（合計が合わない）",
    patch: "m1037-defaults-mutation-unweighted.patch",
    pkg: "scripts",
    tests: ["measure-mutation-costs.test.mjs"],
    note: RESERVED_1030_1039 + " " + "#550。表に無い組の見積もりの合計が実測とずれ、ランナーの混ざり方の違うワーカーが偏る。",
  },
  {
    id: 1038,
    label: "`--leave-one-out` の CLI が、残した run を除かずに案を測る（取り置きの配線が外れる）",
    patch: "m1038-cli-leave-one-out-keeps-all-runs.patch",
    pkg: "scripts",
    tests: ["measure-mutation-costs.test.mjs"],
    note: RESERVED_1030_1039 + " " + "#550。CLI の取り置きの検証が、案を測った run そのものを分けて良く見えすぎる。",
  },
  {
    id: 1039,
    label: "CLI がログを読むとき、宣言に無い組の変異を除かない（絞り込みの配線が外れる）",
    patch: "m1039-cli-reads-undeclared-groups.patch",
    pkg: "scripts",
    tests: ["measure-mutation-costs.test.mjs"],
    note: RESERVED_1030_1039 + " " + "#550。消した・並びを変えた組の実測が案に混ざり、いまの表にも既定値にも効かない値で見積もりがずれる。",
  },
  {
    id: 1040,
    label: "変異検査のロックの拒否が、既定の生死の判定に kill 0 だけを使う（ゾンビを生きていると数える）",
    patch: "m1040-lock-refusal-counts-zombie-as-alive.patch",
    pkg: "scripts",
    tests: ["mutation-check-liveness.test.mjs"],
    note: RESERVED_1040_1049 + " " + "#542。PID 1 が孤児を回収しないクラウドのコンテナで、中断された実行のゾンビの PID が書かれたロックが永久に「別の実行が動いている」と読まれ、変異検査を始められない。",
  },
  {
    id: 1041,
    label: "古い作業ツリーの掃除が、既定の生死の判定に kill 0 だけを使う（持ち主がゾンビでも生きていると数える）",
    patch: "m1041-stale-worktree-counts-zombie-as-alive.patch",
    pkg: "scripts",
    tests: ["mutation-check-liveness.test.mjs"],
    note: RESERVED_1040_1049 + " " + "#542。中断された --jobs の親がゾンビで残ると、その作業ツリーが古いものとして拾われず、git worktree list に溜まり続ける。",
  },
  {
    id: 1042,
    label: "exitAfterFlush が、書き出しの完了を待たずに終わる",
    patch: "m1042-exit-after-flush-skips-the-wait.patch",
    pkg: "scripts",
    tests: ["lib/exit-after-flush.test.mjs"],
    note: RESERVED_1040_1049 + " " + "#542。シグナル・uncaughtException の後の終わり方が、パイプへの書き出しを捨てて出力（復元のログ・致命的な警告）を切る。",
  },
  {
    id: 1043,
    label: "exitAfterFlush の既定が、stderr の書き出しを待たず stdout だけを待つ",
    patch: "m1043-exit-after-flush-waits-only-stdout.patch",
    pkg: "scripts",
    tests: ["lib/exit-after-flush.test.mjs"],
    note: RESERVED_1040_1049 + " " + "#542。シグナル・uncaughtException の後の終わり方で、stderr に書いた復元のログ・致命的な警告が、パイプの読み手が遅れると途中で切れる。",
  },
  {
    id: 1044,
    label: "exitAfterFlush が、時間切れの後に書き出しの通知が来ると、exit を 2 回呼ぶ（二重の呼び出しを止める印を外す）",
    patch: "m1044-exit-after-flush-exits-twice.patch",
    pkg: "scripts",
    tests: ["lib/exit-after-flush.test.mjs"],
    note: RESERVED_1040_1049 + " " + "#542。exit を差し替えた呼び出し（自己テスト）で、時間切れの終わりと遅れて来た通知の両方から exit が呼ばれる。本物の process.exit は同期で終わるので本番では起きず、この印が効くのは exit を差し替えたときだけ（呼び出し側が 1 回だけ終わると仮定できる契約を守る）。",
  },
  {
    id: 1045,
    label: "復元に失敗した後の判定が、進まず止まる代わりに次へ進む",
    patch: "m1045-restore-verdict-proceeds-after-failure.patch",
    pkg: "scripts",
    tests: ["lib/mutation-restore-verdict.test.mjs"],
    note: RESERVED_1040_1049 + " " + "#542 のレビュー。復元に失敗した後も次の変異を当て、writeMarker が .applied を上書きして、戻っていないファイルの唯一の記録が消える。",
  },
  {
    id: 1046,
    label: "復元に失敗したときの終了コードが、1 でなく成功側の値（シグナルなら 130）になる",
    patch: "m1046-restore-verdict-failure-keeps-success-code.patch",
    pkg: "scripts",
    tests: ["lib/mutation-restore-verdict.test.mjs"],
    note: RESERVED_1040_1049 + " " + "#542 のレビュー。復元に失敗した中断が、復元できたときと同じ終了コードで終わり、呼び出し側が致命的な失敗に気づけない。",
  },
  {
    id: 1047,
    label: "古い作業ツリーの掃除が、読めないロックの pid（0・桁あふれ）を生死の判定へ渡す",
    patch: "m1047-stale-worktree-passes-unreadable-pid.patch",
    pkg: "scripts",
    tests: ["mutation-check-liveness.test.mjs"],
    note: RESERVED_1040_1049 + " " + "#542 のレビュー。ロックの理由に pid=0 があると isProcessAlive が TypeError を投げ、--jobs の掃除で変異検査が落ちる。",
  },
  {
    id: 1048,
    label: "復元の後に、成否を見ずに適用中のファイルの一覧を空にする（失敗の後も空）",
    patch: "m1048-restore-clears-applied-files-before-knowing.patch",
    pkg: "scripts",
    tests: ["lib/mutation-restore-verdict.test.mjs", "mutation-check-restore-failure.test.mjs"],
    note: RESERVED_1040_1049 + " " + "#542 の /code-review。復元に失敗した後に待っていたシグナル・未捕捉の例外が空の一覧を復元の検証へ渡し、マーカー .applied が消えて、戻っていないファイルの唯一の記録が失われる。",
  },
  {
    id: 1049,
    label: "終わり始めた印が再入を止めない（begin が毎回 true）",
    patch: "m1049-shutdown-gate-lets-reentry.patch",
    pkg: "scripts",
    tests: ["lib/exit-after-flush.test.mjs"],
    note: RESERVED_1040_1049 + " " + "#542 の /code-review。最大 10 秒待つシグナルのハンドラに別のシグナル・例外が再入し、子を再び止め、復元をやり直し、別の終了コードで競う。",
  },
  {
    id: 1050,
    label: "exitAfterFlush が、読み手の消えた stdout / stderr の error を捕まえない",
    patch: "m1050-exit-after-flush-ignores-stream-error.patch",
    pkg: "scripts",
    tests: ["lib/exit-after-flush.test.mjs"],
    note: RESERVED_1050_1059 + " " + "#542 の /code-review。SIGHUP や | head で読み手が消えると error が未捕捉の例外になり、中断の終わり方が uncaughtException に入る。",
  },
  {
    id: 1051,
    label: "pid の読み方が上限（2**31-1）を見ない",
    patch: "m1051-parse-pid-drops-upper-bound.patch",
    pkg: "scripts",
    tests: ["lib/process-alive.test.mjs", "mutation-check-liveness.test.mjs"],
    note: RESERVED_1050_1059 + " " + "#542 の /code-review。ロックの拒否と作業ツリーの掃除の pid の境界が割れる、または範囲外の pid が生死の判定に渡る。",
  },
  {
    id: 1060,
    label: "E2E 繰り返しの集計が、1 回の実行の最後でなく最初の結果を数える",
    patch: "m1060-summarize-counts-first-result.patch",
    pkg: "scripts",
    tests: ["summarize-e2e-repeat.test.mjs"],
    note: RESERVED_1060_1069 + " " + "#562 のレビュー。再試行つきで流したとき、失敗して再試行で通った回を失敗に数え、繰り返しの数と成功・失敗の数が食い違う。",
  },
  {
    id: 1061,
    label: "E2E 繰り返しの集計が、結果の無い回を成功に数える",
    patch: "m1061-summarize-counts-no-result-as-pass.patch",
    pkg: "scripts",
    tests: ["summarize-e2e-repeat.test.mjs"],
    note: RESERVED_1060_1069 + " " + "#562 のレビュー。実行されなかったテストが成功の回数を水増しし、揺れの測定が実際より安定して見える。",
  },
  {
    id: 1062,
    label: "E2E 繰り返しの集計が、reporter の errors が 1 件だけのとき要約に出さない",
    patch: "m1062-summarize-hides-single-error.patch",
    pkg: "scripts",
    tests: ["summarize-e2e-repeat.test.mjs"],
    note: RESERVED_1060_1069 + " " + "#562 のレビュー。globalSetup の失敗（errors に 1 件・suites が空）の原因が要約に出ず、「1 件のテストもありません」だけが残る。",
  },
  {
    id: 1063,
    label: "turbo の e2e タスクが PLAYWRIGHT_JSON_OUTPUT_NAME を渡さない",
    patch: "m1063-turbo-e2e-drops-json-output-name.patch",
    pkg: "e2e",
    tests: ["tests/turbo-env.test.ts"],
    note: RESERVED_1060_1069 + " " + "#562 のレビュー。strict モードで JSON の出力先が届かず、繰り返し実行の結果のファイルが残らない（集計が「結果が無い」で止まる）。",
  },
  {
    id: 1064,
    label: "ワークフローの写しの比較が、steps.scope の除去を写しの側にもかける",
    patch: "m1064-workflow-compare-strips-scope-both-sides.patch",
    pkg: "scripts",
    tests: ["e2e-repeat-workflow.test.mjs"],
    note: RESERVED_1060_1069 + " " + "#562 のレビュー。e2e-repeat.yml に steps.scope を見る if が残っても一致と見なされ、本番では Chromium の導入が飛ばされる。",
  },
  {
    id: 1065,
    label: "ワークフローの写しの比較が、build から pnpm e2e の間の段を見ない",
    patch: "m1065-workflow-compare-ignores-steps-after-build.patch",
    pkg: "scripts",
    tests: ["e2e-repeat-workflow.test.mjs"],
    note: RESERVED_1060_1069 + " " + "#562 のレビュー。ci.yml の e2e が build と pnpm e2e の間に段を足しても、写しのずれが黙って通る。",
  },
  {
    id: 1066,
    label: "ワークフローの写しの比較が、scope の段を写しの側からも外す",
    patch: "m1066-workflow-compare-drops-scope-step-both-sides.patch",
    pkg: "scripts",
    tests: ["e2e-repeat-workflow.test.mjs"],
    note: RESERVED_1060_1069 + " " + "#562 の /code-review。e2e-repeat.yml に scope の段を足しても比較で見えない。",
  },
  {
    id: 1067,
    label: "E2E 繰り返しの集計が、止められた（interrupted）回を失敗に数える",
    patch: "m1067-summarize-counts-interrupted-as-fail.patch",
    pkg: "scripts",
    tests: ["summarize-e2e-repeat.test.mjs"],
    note: RESERVED_1060_1069 + " " + "#562 の /code-review。止められた回が「揺れた」を水増しする。",
  },
  {
    id: 1068,
    label: "E2E 繰り返しの集計が、1 回落ちて残りが飛ばし・未実行のテストを「いつも落ちた」に数える",
    patch: "m1068-summarize-always-failed-ignores-skipped.patch",
    pkg: "scripts",
    tests: ["summarize-e2e-repeat.test.mjs"],
    note: RESERVED_1060_1069 + " " + "#562 の /code-review。全回で落ちたのではないテストが、安定して壊れているものに混ざる。",
  },
  {
    id: 1069,
    label: "ワークフローの写しの比較が、pnpm e2e の段の run 以外の鍵（env など）を見ない",
    patch: "m1069-workflow-compare-ignores-e2e-step-keys.patch",
    pkg: "scripts",
    tests: ["e2e-repeat-workflow.test.mjs"],
    note: RESERVED_1060_1069 + " " + "#562 の敵対的レビュー。ci.yml が e2e の段に env を足しても写しのずれが黙って通る。",
  },
  {
    id: 1070,
    label: "ワークフローの写しの比較が、pnpm e2e の引数を比べない",
    patch: "m1070-workflow-compare-ignores-e2e-args.patch",
    pkg: "scripts",
    tests: ["e2e-repeat-workflow.test.mjs"],
    note: RESERVED_1070_1079 + " " + "#562 の敵対的レビュー。ci.yml が pnpm e2e の引数を変えても写しのずれが黙って通る。",
  },
  {
    id: 1071,
    label: "E2E 繰り返しの集計が、reporter の errors の ANSI 色符号を外さない",
    patch: "m1071-summarize-keeps-ansi-in-errors.patch",
    pkg: "scripts",
    tests: ["summarize-e2e-repeat.test.mjs"],
    note: RESERVED_1070_1079 + " " + "#562 の敵対的レビュー。要約に色の制御文字が混ざる。",
  },
  {
    id: 1072,
    label: "ワークフローの写しの比較が、写しだけが足した pnpm e2e の引数（--grep など）を許す",
    patch: "m1072-workflow-compare-allows-extra-repeat-args.patch",
    pkg: "scripts",
    tests: ["e2e-repeat-workflow.test.mjs"],
    note: RESERVED_1070_1079 + " " + "#562 の敵対的レビュー（3 回目）。写しだけの --grep @smoke で測る範囲が縮んでも一致と見なされる。",
  },
  {
    id: 1073,
    label: "ワークフローの写しの比較が、ci.yml の e2e の段の run にある pnpm e2e 以外の行を見ない",
    patch: "m1073-workflow-compare-ignores-ci-extra-run-lines.patch",
    pkg: "scripts",
    tests: ["e2e-repeat-workflow.test.mjs"],
    note: RESERVED_1070_1079 + " " + "#562 の敵対的レビュー（3 回目）。ci.yml が run に export などを足しても写しのずれが黙って通る。",
  },
  {
    id: 1080,
    label: "handleDisconnect が、ドライバーでない人の切断も「現ドライバーの切断」と見なす",
    patch: "m1080-presence-disconnect-any-participant-is-driver.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/driver-absence.test.ts"],
    note: RESERVED_1080_1089 + " " + "#566。ドライバーの切断の猶予中に別の人が切断すると、保留中のドライバー不在タイマーが別の人のものに張り替わり、繰り上げが失われる。",
  },
  {
    id: 1081,
    label: "handleDisconnect が、タイマーから居なくなった人の切断なら、稼働中か・現ドライバーかを問わず不在タイマーを張る（running && isCurrentDriver を || でつなぐ）",
    patch: "m1081-presence-disconnect-schedules-when-not-watching.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/driver-absence.test.ts"],
    note: RESERVED_1080_1089 + " " + "#566。ドライバーでない人の切断が、保留中のドライバー不在タイマーを上書きして消す。",
  },
  {
    id: 1082,
    label: "ドライバー不在の発火時に、セッションが稼働中かを見ない",
    patch: "m1082-presence-absence-fires-when-clock-stopped.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/driver-absence.test.ts"],
    note: RESERVED_1080_1089 + " " + "#566。猶予中に別の人がタイマーを止めても、止まったセッションで繰り上げが発火する。",
  },
  {
    id: 1083,
    label: "ドライバー不在の発火時に、現ドライバーが同一人物かを見ない",
    patch: "m1083-presence-absence-fires-after-driver-changed.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/driver-absence.test.ts"],
    note: RESERVED_1080_1089 + " " + "#566。猶予中に別の人が手動でドライバーを進めても、古い切断のタイマーが新しいドライバーを重ねて繰り上げる。",
  },
  {
    id: 1200,
    label: "`.ui-stack` から縦の間（gap）を消す",
    patch: "m1200-stack-without-gap.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1200_1209 + " " + "#553。縦に積む並びの間が 0 になり、見出しの行と一覧が接して重なって見える（poker の参加者の欄の再発）。",
  },
  {
    id: 1201,
    label: "`.ui-stack` の直下の子の縦の外側の余白を 0 にする規則を消す",
    patch: "m1201-stack-children-keep-margin.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1200_1209 + " " + "#553。要素層の h2 などの margin が gap に足され、並びの間が画面ごとにずれる。",
  },
  {
    id: 1202,
    label: "`.ui-section-head` から折り返し（flex-wrap）を消す",
    patch: "m1202-section-head-no-wrap.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1200_1209 + " " + "#553。狭い幅で見出しと操作が縮み合い、「プレビューに戻る」が 2 行・見出しが 1 字ずつ縦に折れる。",
  },
  {
    id: 1203,
    label: "Markdown のブロックの間の規則を、子のリセット（`.ui-md-p { margin: 0 }` ほか）より前に置く（後勝ちで負けて段落の間が 0 になる）",
    patch: "m1203-markdown-sibling-margin-loses.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1200_1209 + " " + "#553。段落の間が 0 に戻り、行の折り返しと区別できない（一覧 #3 の再発）。",
  },
  {
    id: 1204,
    label: "poker の参加者の区画から `.ui-stack` を外す",
    patch: "m1204-poker-participants-not-stack.patch",
    pkg: "apps/poker-web",
    tests: ["tests/room-page-spectator.test.tsx"],
    note: RESERVED_1200_1209 + " " + "#553。見出しの行と札の並びの間が 0px に戻る（一覧 #1 の再発）。描いた結果（RoomPage）の vitest で検出する。",
  },
  {
    id: 1205,
    label: "poker の参加者の見出しの行から `.ui-section-head` と `--beside` を外す",
    patch: "m1205-poker-participants-head-not-part.patch",
    pkg: "apps/poker-web",
    tests: ["tests/room-page-spectator.test.tsx"],
    note: RESERVED_1200_1209 + " " + "#553。見出しの行の並び（折り返し・間・寄せ）の部品が当たらなくなる。",
  },
  {
    id: 1206,
    label: "timer の `SectionHeader` から `.ui-section-head` を外す",
    patch: "m1206-timer-section-header-not-part.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/section-head-parts.test.tsx"],
    note: RESERVED_1200_1209 + " " + "#553。timer の見出しの行の横の間が 3px に戻る（一覧 #33 の再発）。",
  },
  {
    id: 1207,
    label: "timer の名簿の「ランダム」を見出しの行の外へ出す",
    patch: "m1207-timer-shuffle-outside-header.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/RosterPanel.shuffle-in-header.test.tsx"],
    note: RESERVED_1200_1209 + " " + "#553。「ランダム」がどの一覧に効く操作か読めない位置（見出しの外）に戻る（一覧 #6 の再発）。",
  },
  {
    id: 1208,
    label: "roulette のいつものメンツの区画から `.ui-stack` を外す",
    patch: "m1208-roulette-regulars-not-stack.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-section.test.tsx"],
    note: RESERVED_1200_1209 + " " + "#553。区画の中の縦の間を誰も持たなくなり、見出しの行と一覧が接する。",
  },
  {
    id: 1209,
    label: "timer の見出しの行の操作の塊を右寄せ（flex-end）に戻す",
    patch: "m1209-timer-head-actions-right-aligned.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/spacing-css.test.ts"],
    note: RESERVED_1200_1209 + " " + "#553。折り返したときに操作が見出しから離れて右寄せで下の行に落ち、どの見出しに効くか読めない（レビュー指摘）。",
  },
  {
    id: 1210,
    label: "roulette の空の知らせに `hidden` 属性を足す（読み上げの木から外す）",
    patch: "m1210-roulette-empty-notice-hidden-attribute.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-section.test.tsx"],
    note: RESERVED_1210_1219 + " " + "#553。role=status のライブリージョンが木から外れ、あとから入る知らせが読み上げに届かない。",
  },
  {
    id: 1211,
    label: "roulette の空の知らせから部品 `ui-visually-hidden` を外す（空でも流れに残り、親の gap を取る）",
    patch: "m1211-roulette-empty-notice-not-visually-hidden.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-section.test.tsx"],
    note: RESERVED_1210_1219 + " " + "#553。空の知らせが区画の gap を取り、一覧と操作の間が開く。",
  },
  {
    id: 1212,
    label: ".ui-section-head の折り返した行の間を --space-2 から --space-1 にする",
    patch: "m1212-section-head-row-gap-changed.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1210_1219 + " " + "#553。折り返した操作と見出しの間が ADR・README の値（8px）とずれ、E2E の 8px の判定も崩れる。",
  },
  {
    id: 1213,
    label: "poker の束の名前の列の `min-width: 0` を `min-width: 12rem` にする（名前の列が縮められず、選択欄が行の外へ押し出される）",
    patch: "m1213-poker-estimate-name-min-width-12rem.patch",
    pkg: "apps/poker-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1210_1219 + " " + "#553。名前の列が 12rem より縮まず、320px の「A」の束（13）で短い名前が選択欄と同じ行に収まらず、選択欄が下の行へ落ちる。E2E の `spacing.spec.ts` の「幅 320・『A』の束（13）: 短い名前は選択欄と同じ行」の判定で赤になる。",
  },
  {
    id: 1214,
    label: "部品 `.ui-section-head--beside` の `justify-content: flex-start` の宣言を空にする",
    patch: "m1214-section-head-beside-declaration-removed.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1210_1219 + " " + "#553。修飾を当てた画面（poker の参加者・timer の名簿）が両端寄せに戻り、広い幅で「見学する」「ランダム」が見出しから反対の端へ離れる。",
  },
  {
    id: 1215,
    label: "roulette のいつものメンツの見出しの行を基準線揃え（baseline）から中央揃えに戻す",
    patch: "m1215-roulette-head-centered.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1210_1219 + " " + "#553。字の大きさの違う見出しと「この端末だけ」の基準線がずれる（レビュー指摘）。",
  },
  {
    id: 1216,
    label: "roulette の知らせの規則に `visibility: hidden` を足す（読み上げの木から外す）",
    patch: "m1216-roulette-notice-visibility-hidden.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1210_1219 + " " + "#553。role=status のライブリージョンが木から外れ、知らせが読み上げに届かない。E2E の `getByRole('status')` の数でも赤になる。",
  },
  {
    id: 1217,
    label: "roulette の知らせに aria-hidden 属性を足す（読み上げの木から外す）",
    patch: "m1217-roulette-notice-aria-hidden.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-section.test.tsx"],
    note: RESERVED_1210_1219 + " " + "#553。role=status のライブリージョンが木から外れ、知らせが読み上げに届かない。",
  },
  {
    id: 1218,
    label: "timer の名簿の「ランダム」を ShuffleButton でなくボタンの写しにする",
    patch: "m1218-roster-own-shuffle-button.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/RosterPanel.shuffle-in-header.test.tsx"],
    note: RESERVED_1210_1219 + " " + "#553。ロビーと名簿で「ランダム」のボタンが別々に書かれ、片方だけ直って見た目がずれる。",
  },
  {
    id: 1219,
    label: "roulette の知らせを、中身があっても常に `ui-visually-hidden` にする",
    patch: "m1219-roulette-notice-always-visually-hidden.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-section.test.tsx"],
    note: RESERVED_1210_1219 + " " + "#553。知らせが入っても見えない（目に見える一言が出ない）。",
  },
  {
    id: 1250,
    label: "timer の `SectionHeader` から `--beside` の修飾を外す",
    patch: "m1250-timer-section-header-not-beside.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/section-head-parts.test.tsx"],
    note: RESERVED_1250_1259 + " " + "#553。広い幅（ロビー 768・ルームのタブ 1024）で「ランダム」が見出しから行の反対の端まで 400〜580px 離れる。",
  },
  {
    id: 1251,
    label: "timer の名簿の見出しの行から `beside` を外す",
    patch: "m1251-timer-roster-not-beside.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/section-head-parts.test.tsx"],
    note: RESERVED_1250_1259 + " " + "#553。名簿の見出しの行が部品の両端寄せに戻り、操作が見出しから離れる。",
  },
  {
    id: 1252,
    label: "poker の束のポイントの選択に `max-inline-size: 3rem` を足す（字が切れる）",
    patch: "m1252-poker-points-select-width-capped.patch",
    pkg: "apps/poker-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1250_1259 + " " + "#553。選択した選択肢の字が切れて読めなくなる。",
  },
  {
    id: 1253,
    label: "poker の束のポイントの選択を、省略記号で切る形（max-inline-size: 45%・overflow: hidden）に戻す",
    patch: "m1253-poker-points-select-clipped.patch",
    pkg: "apps/poker-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1250_1259 + " " + "#553。選択した選択肢の字が切れて読めなくなる（「ポイン」）。",
  },
  {
    id: 1254,
    label: "poker の束のポイントの選択から margin-inline-start: auto を外す",
    patch: "m1254-poker-points-select-not-right-aligned.patch",
    pkg: "apps/poker-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1250_1259 + " " + "#553。狭い幅で選択欄が名前の下の行の左端に落ちる（右端へ寄らない）。",
  },
  {
    id: 1255,
    label: "poker の束の見出しの行を折り返さない（flex-wrap: nowrap）にする",
    patch: "m1255-poker-estimate-head-nowrap.patch",
    pkg: "apps/poker-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1250_1259 + " " + "#553。狭い幅で名前の列か選択欄が縮み、選択欄の字が切れるか、名前が何行にも折れる。",
  },
  {
    id: 1256,
    label: "poker の束の名前の列を `flex: 1 1 100%` にする（収まる名前でも選択欄が下の行へ落ちる）",
    patch: "m1256-poker-estimate-name-column-full-width.patch",
    pkg: "apps/poker-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1250_1259 + " " + "#553。名前が 1 行に収まるときも選択欄が名前の下の行に落ち、同じ記録の中で 1 行の束と 2 行の束が混ざる。",
  },
  {
    id: 1257,
    label: "`.ui-stack--tight` の間を `--space-3` にする",
    patch: "m1257-stack-tight-gap-space-3.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1250_1259 + " " + "#553。束の見出しの行と回の記録の間が 8px から 12px に広がる（ADR 0035 決定 2 の表と食い違う）。",
  },
  {
    id: 1258,
    label: "poker の束（`li.estimate-group`）から `.ui-stack--tight` を外す",
    patch: "m1258-poker-estimate-group-not-tight.patch",
    pkg: "apps/poker-web",
    tests: ["tests/estimate-log.test.tsx"],
    note: RESERVED_1250_1259 + " " + "#553。束の見出しの行と回の記録の間が 12px に広がる。",
  },
  {
    id: 1259,
    label: "poker の参加者の見出しの行から `--beside` を外す",
    patch: "m1259-poker-participants-head-not-beside.patch",
    pkg: "apps/poker-web",
    tests: ["tests/room-page-spectator.test.tsx"],
    note: RESERVED_1250_1259 + " " + "#553。広い幅で「見学する」が見出しから操作の面の反対の端まで飛ぶ。",
  },
  {
    id: 1270,
    label: "`.ui-reader-preview` の縦の余白を margin から padding に戻す（4 行目の上端が覗く）",
    patch: "m1270-reader-preview-vertical-padding.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1270_1279 + " " + "#553。3 行の写しの padding の帯に 4 行目の上端が半分覗く（`reader.css` の注釈が名指ししている崩れ）。",
  },
  {
    id: 1271,
    label: "timer のロビーが ShuffleButton に輪の人数を渡さない（常に 0 人）",
    patch: "m1271-lobby-shuffle-button-without-rotation.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/Lobby.rotation.test.tsx"],
    note: RESERVED_1270_1279 + " " + "#553。ロビーで「ランダム」が 2 人以上でも出なくなる（出す条件は ShuffleButton の 1 か所が持つので、人数を渡し忘れると消える）。",
  },
  {
    id: 1272,
    label: "timer の `ShuffleButton` のアイコンから `session-action-icon` のクラスを外す",
    patch: "m1272-timer-shuffle-button-icon-class-removed.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/section-head-parts.test.tsx"],
    note: RESERVED_1270_1279 + " " + "#553。「ランダム」のアイコンの大きさ（1rem）が当たらなくなる（セッションの操作ボタンと同じクラスを使う形に 9 回目で寄せたあとの作り直し）。E2E の `spacing.spec.ts`（アイコンは 16px 角）でも赤になる。",
  },
  {
    id: 1276,
    label: "`ShuffleButton` の出す条件を 2 人以上から 1 人以上にする",
    patch: "m1276-shuffle-button-shown-for-one.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/Session.shuffle.test.tsx"],
    note: RESERVED_1270_1279 + " " + "#553。1 人の輪でも「ランダム」が出る（並べ替える意味が無い）。ロビーと名簿が同じ条件（ShuffleButton の 1 か所）を使う。",
  },
  {
    id: 1273,
    label: "timer の共有メモの `.shared-memo-lead` を縮められない形（main の形）に戻す",
    patch: "m1273-timer-shared-memo-lead-no-shrink.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/spacing-css.test.ts"],
    note: RESERVED_1270_1279 + " " + "#553。22rem の脇（1280 以上）で「編集」が見出しの下の行へ落ちる（一覧 #18 の再発）。E2E の `spacing.spec.ts`（1280・1920 で同じ行が必須）でも赤になる。",
  },
  {
    id: 1274,
    label: "`.ui-reader-preview` に `min-height: 12rem` を足して箱を伸ばす（字の行数は 3 のまま）",
    patch: "m1274-reader-preview-box-min-height.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1270_1279 + " " + "#553。3 行の写しの箱が伸びて、4 行目以降の字が覗く。検出は契約テスト（`.ui-reader-preview` が高さの宣言を持たない）。E2E の `layout.spec.ts` では、先に字の行の数え上げ（見えている行は 3 以下）で赤になる（実測。箱の高さの上限はその次の判定）。",
  },
  {
    id: 1275,
    label: "agenda の保存した流れの一覧を `display: grid` に戻す（長い名前で横に溢れる）",
    patch: "m1275-agenda-saved-list-grid.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1270_1279 + " " + "#553。40 字の保存名で 320〜1280 のページが横に溢れる。E2E の `spacing.spec.ts` でも赤になる。",
  },
  {
    id: 1277,
    label: "poker の閉じた束の名前の入力を編集中に場所を取る見えない複製（`.estimate-item-sizer`）を流れから外す（長い名前で、入力に替えると選択欄が同じ行へ跳ぶ）",
    patch: "m1277-poker-estimate-sizer-not-in-flow.patch",
    pkg: "apps/poker-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1270_1279 + " " + "#553。名前の変更を始めると選択欄の行が跳ぶ（短い名前は次の行へ落ち、長い名前は同じ行へ上がる）。E2E の `spacing.spec.ts` でも赤になる。",
  },
  {
    id: 1278,
    label: "Markdown の段落の間を 4rem にする（広げても箱の上限が一緒に広がらないことを確かめる）",
    patch: "m1278-markdown-paragraph-gap-4rem.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1270_1279 + " " + "#553。段落の間が 64px に広がる。E2E の `spacing.spec.ts`（8px ±1）と `layout.spec.ts`（3 行の箱の上限）の両方でも赤になる。",
  },
  {
    id: 1279,
    label: "`.ui-stack` のリセットを `:where(.ui-stack) > …`（詳細度 0）にする",
    patch: "m1279-stack-reset-where-zero-specificity.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1270_1279 + " " + "#553。リセットが要素層の h2 の margin に負けて、gap に margin が足され、間が開きすぎる。",
  },
  {
    id: 1280,
    label: "poker の閉じた束の名前の入力に、幅 0 の規則（前の形の名残）を後ろへ戻す（絶対配置の幅 100% を上書きして 18px に潰す）",
    patch: "m1280-poker-estimate-input-width-zero-leftover.patch",
    pkg: "apps/poker-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1280_1289 + " " + "#553。名前の変更中の入力が 18px に潰れて打てない。E2E の `spacing.spec.ts`（入力の幅が包みと 1px 以内・5rem 以上）でも赤になる。",
  },
  {
    id: 1281,
    label: "poker の見えない複製ボタンから `aria-hidden` を外す",
    patch: "m1281-poker-sizer-not-aria-hidden.patch",
    pkg: "apps/poker-web",
    tests: ["tests/estimate-item-field.test.tsx"],
    note: RESERVED_1280_1289 + " " + "#553。編集中に読み上げが同じ名前のボタンを二重に読む。",
  },
  {
    id: 1282,
    label: "poker の見えない複製ボタンから `tabIndex=-1`・`disabled` を外す",
    patch: "m1282-poker-sizer-tabbable.patch",
    pkg: "apps/poker-web",
    tests: ["tests/estimate-item-field.test.tsx"],
    note: RESERVED_1280_1289 + " " + "#553。見えない複製に Tab が止まる（見えない所へフォーカスが行く）。",
  },
  {
    id: 1283,
    label: "`.ui-stack` の読み込みを部品層の最後から外す（reader の直後へ。後に読む部品の margin に負ける）",
    patch: "m1283-ui-stack-imported-before-visually-hidden.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1280_1289 + " " + "#553。stack のリセットが、後に読む部品の margin に負ける（パッチ名は最初の形の名残。11 回目に visually-hidden を最後にしたため、reader の直後へ移す形に作り直した）。",
  },
  {
    id: 1284,
    label: "timer の `.section-header` に `column-gap: 3px` を足す（一覧 #33 の再発）",
    patch: "m1284-timer-section-header-column-gap-3px.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/spacing-css.test.ts"],
    note: RESERVED_1280_1289 + " " + "#553。timer の見出しの行の横の間が 3px に詰まる。E2E の `spacing.spec.ts`（横の間の下限 11px）でも赤になる。",
  },
  {
    id: 1285,
    label: "poker の開いた束の「見積もり中」から `margin-inline-start: auto` を外す",
    patch: "m1285-poker-estimate-open-not-right-aligned.patch",
    pkg: "apps/poker-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1280_1289 + " " + "#553。長い名前で「見積もり中」が次の行の左端へ落ちる。E2E の `spacing.spec.ts`（開いた束・40 字・狭い幅で下の行に落ちたとき右端に揃う）でも赤になる。同じ行のときは名前の列が伸びて行を埋めるので、この規則の有無で位置は変わらない（同じ行の幅では等価。同じ行でも右端に揃うことは測っている）。",
  },
  {
    id: 1286,
    label: "poker の名前の入力の高さを包みの高さ（100%）にする（複製が何行に折れても入力が伸びる）",
    patch: "m1286-poker-estimate-input-block-size-stretch.patch",
    pkg: "apps/poker-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1280_1289 + " " + "#553。40 字の名前で 1 行の入力が約 100px に伸びる。E2E の `spacing.spec.ts`（入力の高さ 44〜48px）でも赤になる。",
  },
  {
    id: 1287,
    label: "poker の見えない複製ボタンに `.estimate-item-title` のクラスを付ける",
    patch: "m1287-poker-sizer-has-title-class.patch",
    pkg: "apps/poker-web",
    tests: ["tests/estimate-item-field.test.tsx"],
    note: RESERVED_1280_1289 + " " + "#553。`.estimate-item-title` を名指しする既存のセレクタが、編集中に複製に当たる。",
  },
  {
    id: 1288,
    label: "Markdown の根のブロックの間の規則 `.ui-md > * + *` を、段落どうしだけ（`.ui-md-p + .ui-md-p`）に狭める",
    patch: "m1288-md-gap-rule-paragraphs-only.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1280_1289 + " " + "#553。見出し・リスト・引用・コードと隣のブロックの間が 0 に戻る（段落どうしの間だけが残る）。",
  },
  {
    id: 1289,
    label: "roulette のいつものメンツの区画自身の `min-inline-size: 0` を外す",
    patch: "m1289-roulette-regulars-min-inline-size-removed.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1280_1289 + " " + "#553。親の列の守り（`.roulette-people` の `minmax(0, 1fr)`）が無い置き場では、折り返さない長い字を持つ子に区画が引かれて広がる。E2E の `spacing.spec.ts`（親の列を `1fr` に替えて外し、区画が親の右端に収まること）でも赤になる。",
  },
  {
    id: 1340,
    label: "poker の `.estimate-group-head` に `@media` の中で `flex-wrap: nowrap` を書き戻す（部品の折り返しを止める）",
    patch: "m1340-poker-media-group-head-nowrap.patch",
    pkg: "apps/poker-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1340_1349 + " " + "#553。行頭に書かれていない規則（`@media` の中・字下げ）を拾い損ねた `ruleBody` では、`toBe(null)` が空振りして緑だった。すべての規則を集める形で赤になる。",
  },
  {
    id: 1341,
    label: "agenda の `.builder-saved-list` に `@media` の中で `display: grid` と `gap` を書き戻す（長い名前で横に溢れる）",
    patch: "m1341-agenda-media-saved-list-grid.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1340_1349 + " " + "#553。縦の並びの写しが `@media` の中に戻る。すべての規則を集める形で赤になる。",
  },
  {
    id: 1342,
    label: "roulette の `.roulette-regulars-notice` に `@media` の中で `display: none` を書く（ライブリージョンが読み上げの木から外れる）",
    patch: "m1342-roulette-media-notice-display-none.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1340_1349 + " " + "#553。あとから入る知らせが読み上げに届かなくなる書き方が `@media` の中に戻る。すべての規則を集める形で赤になる。",
  },
  {
    id: 1343,
    label: "timer の `.section-header` に `@media` の中で `column-gap: 3px` を書き戻す（一覧 #33 の再発）",
    patch: "m1343-timer-media-section-header-gap.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/spacing-css.test.ts"],
    note: RESERVED_1340_1349 + " " + "#553。見出しの行の横の間が、ある幅で 3px に詰まる。すべての規則を集める形で赤になる。",
  },
  {
    id: 1344,
    label: "`.ui-reader-preview` に 64rem 未満の `@media` の中で `min-height: 12rem` を足す（3 行の写しの箱が伸びる）",
    patch: "m1344-ui-media-reader-preview-min-height.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1340_1349 + " " + "#553。3 行の写しの箱が縦に伸びる。`@media` の中の規則も含めて判定する契約で赤になる（E2E の `layout.spec.ts` の箱の上限でも赤になる）。",
  },
  {
    id: 1345,
    label: "poker の見えない複製を、名前のボタンと寸法を共有する規則（`.estimate-item--inline .estimate-item-title, … .estimate-item-sizer`）から外す",
    patch: "m1345-poker-sizer-not-in-shared-dimension-rule.patch",
    pkg: "apps/poker-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1340_1349 + " " + "#553。複製が名前のボタンの寸法の宣言と別になり、ボタン側を変えると複製がずれる（編集中に選択欄の行が跳ぶ）。",
  },
  {
    id: 1346,
    label: "poker の見えない複製だけの規則に `padding-inline: 0; width: 3rem` を足す（寸法の写しが共有の規則の外に戻る）",
    patch: "m1346-poker-sizer-own-rule-copies-dimensions.patch",
    pkg: "apps/poker-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1340_1349 + " " + "#553。複製だけの規則が寸法を持つと、名前のボタンを変えても複製がずれる。以前の契約は規則を本文の中身（padding-inline・flex:）で除いたので、この足しが判定から外れて緑だった（11 回目の指摘）。セレクタで共有の規則を除く形で赤になる。",
  },
  {
    id: 1347,
    label: "`.ui-visually-hidden` の読み込みを `.ui-stack` より前へ移す（リセットの `margin-block: 0` が `margin: -1px` に勝つ）",
    patch: "m1347-ui-visually-hidden-imported-before-stack.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1340_1349 + " " + "#553。`.ui-stack` の直下の読み上げ専用の要素の `margin: -1px` が 0 になり、形が崩れる（11 回目の指摘）。",
  },
  {
    id: 1348,
    label: "`.ui-stack` のリセットを `> *`（`<dialog>` を外さない）に戻す",
    patch: "m1348-ui-stack-reset-includes-dialog.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1340_1349 + " " + "#553。`.ui-stack` の直下の `<dialog>` の UA の中央寄せ（`margin: auto`）がリセットに消される。E2E の `spacing.spec.ts`（`.removal-confirm` の margin を外しても中央に出る）でも赤になる（12 回目の指摘）。",
  },
  {
    id: 1349,
    label: "`.ui-reader-preview` に `min-block-size: 12rem`（論理寸法）を足して箱を伸ばす",
    patch: "m1349-ui-reader-preview-min-block-size.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1340_1349 + " " + "#553。3 行の写しの箱が伸びる。以前の契約の正規表現は論理プロパティ（`min-block-size`・`block-size`・`padding-block-end`）を見ていなかった。宣言の名前を許可リスト（名前→値）と比べる形で赤になる（12・14 回目の指摘）。",
  },
  {
    id: 1370,
    label: "`.ui-reader-preview` に 40rem 未満の `@media` の中で縦のある `padding`（一括指定）を足す",
    patch: "m1370-ui-reader-preview-media-vertical-padding.patch",
    pkg: "packages/ui",
    tests: ["tests/spacing-owner.test.mjs"],
    note: RESERVED_1370_1379 + " " + "#553。3 行の写しの箱が縦の padding で伸びて、4 行目の上端が覗く。以前の契約は `padding` の一括指定を見ず緑だった（13 回目の指摘）。許可リスト（名前→値）に無い値として赤になる（14 回目の指摘で、禁止の一覧から許可リストに替えた）。",
  },
  {
    id: 1220,
    label: "下端の帯（.ui-actions--dock）の地を不透明な felt-950 から透ける暗幕（felt-scrim）に戻す",
    patch: "m1220-dock-background-translucent.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1220_1229 + " " + "#554。帯の地が暗幕（α 0.92）に戻り、後ろの中身の字が帯の字に透けて重なって読めない。",
  },
  {
    id: 1221,
    label: "下端の帯の 2 列の格子の指定（grid-template-columns）を消す",
    patch: "m1221-dock-grid-columns-removed.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1220_1229 + " " + "#554。40rem 未満の帯が 1 列に積まれ、3 つの操作が 3 段になって 320×568 で画面の 3 割を覆い、結果の数字や手札が初期表示で隠れる。",
  },
  {
    id: 1222,
    label: "下端の帯の奇数の最後の子（主）が全幅の段を取る規則を外す",
    patch: "m1222-dock-last-primary-not-full-width.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1220_1229 + " " + "#554。奇数の最後の主が半分の幅になり、押しやすい主の操作が小さくなる（3 つなら 3 段にもなる）。",
  },
  {
    id: 1223,
    label: "40rem 未満の戻るの字下げを、左の余白と枠を持たない形から負の margin での打ち消しに戻す（道具のボタンの右隣で間が縮む）",
    patch: "m1223-back-indent-negative-margin.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1220_1229 + " " + "#554。戻るが道具のボタンの右隣に並ぶ幅（662〜700px 前後）で、負の margin（-9px）が flex の gap から引かれ、ボタンとの間が 3.8px まで縮む。E2E は poker のお題あり・390px で左の隣の操作との間が 7px（8px 以上のはず）になって赤になる（662px の 3.8px は実測の根拠）。",
  },
  {
    id: 1224,
    label: "招待の URL に white-space: nowrap を足す（折り返さず欄の外へ出る）",
    patch: "m1224-invite-url-wraps.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1220_1229 + " " + "#554。招待の URL に nowrap を足すと、折り返さず長い URL が欄の外へ出る（単体は規則を読み、E2E は長い URL が欄の内に収まることを測る）。",
  },
  {
    id: 1225,
    label: "agenda の手元の帯（.run-controls）の地を、上へ透明に溶けるグラデーションに戻す",
    patch: "m1225-run-controls-gradient-restored.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1220_1229 + " " + "#554。agenda の手元の帯の上が透明に溶け、帯の「このステップに」が後ろの進行表の字と重なって読めない。",
  },
  {
    id: 1226,
    label: "下端の帯のボタンの左右の余白の詰め（--space-2）を、元の --lg の余白（1.8rem）に戻す",
    patch: "m1226-dock-button-padding-restored.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1220_1229 + " " + "#554。320px の帯の 1 列（約 138px）でボタンの字（「次のアイテムへ」）が 2 行に折れ、帯が高くなる。",
  },
  {
    id: 1227,
    label: "通常の見出しの戻るに order を足して目の順だけを変える（40rem 未満の折り返しで Tab の順が食い違う）",
    patch: "m1227-narrow-back-order-first.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1220_1229 + " " + "#554 のレビュー。40rem 未満で戻るを order で道具のボタンの前に出し、Tab と読み上げの順が見た目と食い違う（右から左へ戻る）。",
  },
  {
    id: 1228,
    label: "40rem 未満の通常の見出しで、招待の欄に order: -1 を足す（見た目では見出しの上、Tab の順は最後）",
    patch: "m1228-narrow-share-order-first.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1220_1229 + " " + "#554 のレビュー。招待の欄に order: -1 を足すと、見た目では見出しの上に出るのに Tab の順は DOM のまま最後になる（WCAG 2.4.3）。欄はもともと DOM の最後の子なので order: 4 は等価で、見た目の順が変わる -1 にした。招待を開いた後の Tab の順を測る E2E で赤になる。",
  },
  {
    id: 1229,
    label: "timer のセッションの帯のボタンの左右の余白を詰める指定を消す",
    patch: "m1229-timer-dock-button-padding-removed.patch",
    pkg: "apps/timer-web",
    tests: ["test/session-actions-fit.test.ts"],
    note: RESERVED_1220_1229 + " " + "#554。320px で timer の帯の「時間リセット」が 2 行に折れ、帯が高くなる。",
  },
  {
    id: 1240,
    label: "下端の帯の主の全幅の規則を、目に見える操作だけを数える形から、全部の子を数える :last-child:nth-child(odd) に戻す",
    patch: "m1240-dock-counts-hidden-children.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1240_1249 + " " + "#554 のレビュー。帯の主の全幅の規則が、見えない子や選択欄・控えの包みまで数え、数がずれて主が半分の幅になる。",
  },
  {
    id: 1241,
    label: "下端の帯の選択欄が 1 段を使う規則を外す",
    patch: "m1241-dock-select-full-width-removed.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1240_1249 + " " + "#554 のレビュー。選択欄が 1 列の幅（約 138px）に押し込まれ、選んだ字（約 128px）が選択欄の中の幅（約 104px）に収まらず切れる。E2E は選択欄の字の自然な幅 ≤ 選択欄の中の幅を測る検査（320px の poker の公開後）で赤になる。",
  },
  {
    id: 1242,
    label: "帯の地のトークン --dock-ground を不透明な felt-950 から透ける暗幕に戻す",
    patch: "m1242-dock-ground-translucent.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1240_1249 + " " + "#554 のレビュー。帯の地（部品も agenda も同じトークン）が暗幕に戻り、後ろの字が帯の字に透けて重なる。",
  },
  {
    id: 1243,
    label: "agenda の帯の高さの既定値（--run-controls-height）から、ホームバーの高さを外す",
    patch: "m1243-run-padding-without-safe-area.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1240_1249 + " " + "#554 のレビュー。既定値（測れない環境・JS が動く前）からホームバーの高さが抜け、iPhone で最下部の最後の行や「最初から」が不透明な帯に隠れる。E2E では env(safe-area-inset-bottom) が 0 なので緑のまま（検出役は agenda の vitest の単体）。",
  },
  {
    id: 1244,
    label: "agenda の手元の下の余白を 0 にする",
    patch: "m1244-run-padding-zero.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1240_1249 + " " + "#554 のレビュー。最下部で進行表の最後の行が不透明な帯に隠れる。",
  },
  {
    id: 1245,
    label: "映す表示の操作帯（.projection-strip）の地を、透明へ溶けるグラデーションに戻す",
    patch: "m1245-projection-strip-gradient-restored.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1240_1249 + " " + "#554 のレビュー。映す表示の操作帯の地が透明へ溶け、ボタンの字の後ろに映す大きな字が透けて重なる。",
  },
  {
    id: 1246,
    label: "招待の URL の span に title を付ける",
    patch: "m1246-invite-url-title-added.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: RESERVED_1240_1249 + " " + "#554 のレビュー。URL の span に title を付けると、触る端末ではツールチップが出ず、読み上げで URL が二重になる。",
  },
  {
    id: 1247,
    label: "40rem 未満・compact 以外の戻るの字下げを消す規則（左の余白と枠を持たない）を消す",
    patch: "m1247-back-indent-rule-removed-all-widths.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1240_1249 + " " + "#554 のレビュー。40rem 未満の通常の見出しで、戻るが行の先頭に落ちたとき字が 9px 字下がって題と左端が揃わない。E2E は poker のお題あり・320px などで赤。",
  },
  {
    id: 1248,
    label: "帯の中の [hidden] の子を描かない規則を消す",
    patch: "m1248-dock-hidden-child-rendered.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1240_1249 + " " + "#554 のレビュー。帯の直下の [hidden] を描かない規則を消す。単体が拾う。E2E は拾わない（ボタンは .ui-button[hidden] の規則と重なって、帯の規則が無くても描かれないため。ボタン以外の子のための規則）。",
  },
  {
    id: 1249,
    label: "agenda の帯が fixed の幅で、Tab の送り先の余白（scroll-padding-block-end）を外す",
    patch: "m1249-run-scroll-padding-removed.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1240_1249 + " " + "#554 のレビュー。64rem 未満で進行表の「スキップ」に Tab で行くと、不透明な帯の後ろに隠れる（WCAG 2.4.11）。",
  },
  {
    id: 1260,
    label: "agenda の帯の高さの変数 --run-controls-height を実測（約 161px）より低い 8rem にする（余白と scroll-padding が同時に縮む）",
    patch: "m1260-run-controls-height-too-small.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1260_1269 + " " + "#554 のレビュー。帯の高さの変数を 8rem に縮めると、`.run` の下の余白と 64rem 未満の scroll-padding が同時に縮む。最下部で最後の行の下 33px が不透明な帯に隠れ、Tab で送った先も 33px ぶん帯の後ろに残る。E2E は帯の実高さが変数を超えることで赤になる。",
  },
  {
    id: 1261,
    label: "Tab の送り先の余白（reset.css の scroll-padding-block-end）を、2 段の帯の最大の高さから 6rem に戻す",
    patch: "m1261-reset-scroll-padding-6rem.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1260_1269 + " " + "#554 のレビュー。Tab の送り先の余白が 6rem（96px）に戻り、2 段の帯（最大 142px）のすぐ上の操作へ Tab で移ると帯の後ろに残る（WCAG 2.4.11）。E2E は 320px の poker の公開後で赤になる。",
  },
  {
    id: 1262,
    label: "帯の [hidden] を描かない規則を 40rem 未満の @media の中へ入れる",
    patch: "m1262-dock-hidden-rule-inside-media.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1260_1269 + " " + "#554 のレビュー。[hidden] を描かない規則が 40rem 未満だけになり、40rem 以上で hidden の子が描かれる（README は幅によらないと読める）。",
  },
  {
    id: 1263,
    label: "帯の主の全幅の規則の、最後を決める集合を数える集合と食い違わせる（控えの包みと選択欄を含める）",
    patch: "m1263-dock-last-set-includes-start.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1260_1269 + " " + "#554 のレビュー。数える集合と最後を決める集合が食い違い、[操作, 操作, 操作, 控えの包み] や [操作, 選択欄] で奇数の最後の操作が全幅にならない。E2E は一時の帯で赤になる。",
  },
  {
    id: 1264,
    label: "agenda の帯の高さの変数を、無条件の :root から 64rem 未満の html:has(.run-controls) の中へ戻す",
    patch: "m1264-run-controls-height-under-has.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1260_1269 + " " + "#554 のレビュー。変数が 64rem 以上で未定義になり、`.run` の下の余白が無効になる。無条件の :root に置く約束を破る。",
  },
  {
    id: 1265,
    label: "40rem 未満の通常の見出しで、招待の欄の flex-basis: 100% を消す",
    patch: "m1265-narrow-share-basis-removed.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1260_1269 + " " + "#554 のレビュー。開いた招待の欄が行いっぱいでなくなり、「仲間を招く」と同じ行に並んで潰れる。既存の panels-headers.spec.ts（E2E・変異検査の外）も守る。",
  },
  {
    id: 1266,
    label: "映す表示の 40rem 以上 64rem 未満・高さ 48rem 以上の余白（常に取る帯の高さぶん）を消す",
    patch: "m1266-projection-body-padding-removed.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1260_1269 + " " + "#554 のレビュー。映す表示の下端の情報が不透明な帯に隠れる。E2E は映す表示の最下部の中身が帯と重ならないことで赤になる。",
  },
  {
    id: 1267,
    label: "timer の Tab の送り先の既定の余白（6rem）を、帯の無い画面にも 2 段の帯の高さにする",
    patch: "m1267-timer-scroll-padding-everywhere.patch",
    pkg: "apps/timer-web",
    tests: ["test/session-actions-fit.test.ts"],
    note: RESERVED_1260_1269 + " " + "#554 のレビュー。帯の無い画面（ロビー）にまで 152px の余白が掛かる。E2E は timer のロビーで 96px でなく 152px になって赤。",
  },
  {
    id: 1268,
    label: "要素層の Tab の送り先の既定の余白（6rem）を、帯の無い画面にも 2 段の帯の高さにする",
    patch: "m1268-reset-scroll-padding-everywhere.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1260_1269 + " " + "#554 のレビュー。帯の無い画面（玄関）にまで 152px の余白が掛かる。E2E は玄関で 96px でなく 152px になって赤。",
  },
  {
    id: 1269,
    label: "映す表示の帯の高さの変数 --projection-strip-height を実測（320px で 149px）より低い 4rem にする",
    patch: "m1269-projection-strip-height-too-small.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1260_1269 + " " + "#554 のレビュー。下の余白が帯より低く、狭い幅で下端の中身が帯に隠れる。E2E は帯の実際の高さが変数を超えて赤。",
  },
  {
    id: 1290,
    label: "映す表示の 40rem 未満の余白を、盤を動かさない margin から、中央寄せがやり直される padding に戻す（帯が出るたびに盤が跳ねる）",
    patch: "m1290-projection-clearance-as-padding.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1290_1299 + " " + "#554 のレビュー。余白を body の外の margin から padding に戻すと、中央寄せがやり直されて、帯が出るたびに盤が跳ねる（320×568 で約 17px）。E2E は 390×844・320×568 で帯の出し入れによる盤の y の差が 1px 以内であることで赤になる。",
  },
  {
    id: 1291,
    label: "下端の帯に負の margin-block-start を足す（帯が前の中身に重なる）",
    patch: "m1291-dock-negative-margin.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1290_1299 + " " + "#554 のレビュー。帯が前の中身に重なる。E2E の最下部の測り（矩形）が拾い、単体は帯の規則に負の margin・transform・top が無いことで拾う。",
  },
  {
    id: 1292,
    label: "招待の URL の min-inline-size・max-inline-size を外す",
    patch: "m1292-invite-url-limits-removed.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1290_1299 + " " + "#554 のレビュー。長い URL が 30〜54rem の欄で画面の外へ出る。E2E は長い URL の箱が欄の内に収まることで赤になる。",
  },
  {
    id: 1293,
    label: "要素層の逃がし余白の @media を全幅にする（6rem の既定が 40rem 以上へ漏れる）",
    patch: "m1293-reset-scroll-padding-outside-media.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1290_1299 + " " + "#554 のレビュー。帯の逃がし余白が 40rem 以上にも掛かる。E2E は poker の 640〜900px で scroll-padding が auto であることで赤になる（timer は要素層を読まないので buttons.spec.ts の 1280 は timer の base.css を見る）。",
  },
  {
    id: 1294,
    label: "依存の向きの監査から、試験専用のパッケージを製品コードが読む違反の判定を外す",
    patch: "m1294-audit-test-only-check-removed.patch",
    pkg: "scripts",
    tests: ["audit-dependency-direction.test.mjs"],
    note: RESERVED_1290_1299 + " " + "#554 のレビュー。製品コード（src・設定ファイル）による @tasuki/test-css の取り込みを監査が見逃す。自己テストが拾う。",
  },
  {
    id: 1295,
    label: "映す表示の下の余白の @media（40rem 以上 64rem 未満）を 40rem 以上の全部にする（64rem 以上にも余白が掛かる）",
    patch: "m1295-projection-padding-all-widths.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1290_1299 + " " + "#554 のレビュー。余白が 64rem 以上にも掛かり、盤が約 80px 上に寄る。E2E は 1280×720 で縦のスクロールが出て赤。",
  },
  {
    id: 1296,
    label: "agenda の Tab の送り先の余白の @media（64rem 未満）を全幅にする",
    patch: "m1296-run-scroll-padding-all-widths.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1290_1299 + " " + "#554 のレビュー。帯が流れの中の幅（64rem 以上）にも余白が掛かる。",
  },
  {
    id: 1297,
    label: ".ui-button[hidden] を描かない規則を消す",
    patch: "m1297-button-hidden-rule-removed.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1290_1299 + " " + "#554 のレビュー。hidden のボタンが描かれる。E2E は帯でない .ui-actions の hidden のボタンで赤。",
  },
  {
    id: 1298,
    label: "トークン --dock-max-height を shape.css から消す",
    patch: "m1298-dock-max-height-token-removed.patch",
    pkg: "packages/ui",
    tests: ["tests/tokens.test.mjs"],
    note: RESERVED_1290_1299 + " " + "#554 のレビュー。Tab の送り先の余白が無効になる。",
  },
  {
    id: 1302,
    label: "映す表示の帯の高さの変数（40rem 以上の段）を実測より低い 2rem にする",
    patch: "m1302-projection-strip-height-wide-too-small.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1300_1309 + " " + "#554 のレビュー。余白が足りず中身が帯に隠れる。E2E は 844×390 で帯の実高が変数を超えて赤。",
  },
  {
    id: 1303,
    label: "共有の outsideMedia が @layer の塊まで外す",
    patch: "m1303-css-text-layer-dropped.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1300_1309 + " " + "#554 のレビュー。@layer の中の規則を外側として数えなくなる。",
  },
  {
    id: 1304,
    label: "映す表示の帯の高さの変数の 40rem 以上の段を消す",
    patch: "m1304-projection-strip-height-wide-removed.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1300_1309 + " " + "#554 のレビュー。段が無くなり、40rem 以上でも 10rem の余白を取りすぎる。E2E の測り（帯の実高 ≤ 変数・重ならない）は緑のままで、単体が段の有無を読む。",
  },
  {
    id: 1307,
    label: "共有の mediaBlocks が頭を前方一致で探す（長い条件の @media も拾う）",
    patch: "m1307-css-text-media-head-prefix.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1300_1309 + " " + "#554 のレビュー。長い条件の @media を同じ頭として拾う。",
  },
  {
    id: 1308,
    label: "共有の blockRange が、{ が見つからなくても throw しない",
    patch: "m1308-css-text-block-range-no-throw.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1300_1309 + " " + "#554 のレビュー。壊れた CSS を空として読み、恒真になる。",
  },
  {
    id: 1309,
    label: "詰めた見た目（timer）の戻るの左の余白も 0 にする",
    patch: "m1309-back-padding-rule-on-compact.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1300_1309 + " " + "#554 のレビュー。timer の戻るのフォーカスの輪と押せる範囲が左だけ詰まる。",
  },
  {
    id: 1310,
    label: "agenda の帯の高さを測る hook が、測った値を変数へ書かない",
    patch: "m1310-measured-block-size-not-written.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/use-measured-block-size.test.tsx"],
    note: RESERVED_1310_1319 + " " + "#554 のレビュー。文字を大きくしたとき帯の下に最後の行が隠れる。E2E は文字 200% で帯が既定の値を超えて赤。",
  },
  {
    id: 1311,
    label: "招待の URL を、折り返しから省略（nowrap・ellipsis）に戻す",
    patch: "m1311-invite-url-ellipsis-restored.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1310_1319 + " " + "#554 のレビュー。URL の末尾が隠れ、全文を読めない。E2E は長い URL が省略されて赤。",
  },
  {
    id: 1313,
    label: "共有の mediaBlocks が、頭と { の間の条件でないもの（別の規則の始まり）を throw しない",
    patch: "m1313-css-text-broken-media-no-throw.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1310_1319 + " " + "#554 のレビュー。壊れた CSS を読んで恒真になる。",
  },
  {
    id: 1314,
    label: "招待の行に固定の境目（container query の 54rem）を置く（URL を自分の行にし、864〜939px で見出しが 3 段になる）",
    patch: "m1314-invite-fixed-container-breakpoint-54rem.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1310_1319 + " " + "#554 のレビュー。固定の境目を置くと、864〜939px で見出しが 1 段から 3 段になる。E2E は 6 アプリ × 幅で見出しの高さが main 以下であることで赤になる。",
  },
  {
    id: 1315,
    label: "映す表示の帯に隠れる量の余白を、1 度も足さない",
    patch: "m1315-projection-clearance-never-added.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/use-projection-clearance.test.tsx"],
    note: RESERVED_1310_1319 + " " + "#554 のレビュー。中身の下端が帯に隠れる。E2E は最下部の中身が帯に隠れて赤。",
  },
  {
    id: 1316,
    label: "映す表示の body の高さの固定（--projection-body-pin）を書かない",
    patch: "m1316-projection-body-pin-dropped.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/use-projection-clearance.test.tsx"],
    note: RESERVED_1310_1319 + " " + "#554 のレビュー。余白を足すと中央寄せがやり直されて盤が跳ねる。E2E は 320×568 で盤の y が動いて赤。",
  },
  {
    id: 1319,
    label: "映す表示の余白の hook が、帯のフォーカスの移動で測り直さない",
    patch: "m1319-projection-clearance-focus-listeners-dropped.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/use-projection-clearance.test.tsx"],
    note: RESERVED_1310_1319 + " " + "#554 のレビュー。Tab で帯へ入ると帯は見える（:focus-within）のに余白が 0 のままで、最下部で中身が帯に隠れる。E2E は Tab だけで帯へ入ったときの最下部で赤。",
  },
  {
    id: 1320,
    label: "映す表示の余白の hook が、中身（body とその子）の大きさの変化を見ない",
    patch: "m1320-projection-clearance-content-not-observed.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/use-projection-clearance.test.tsx"],
    note: RESERVED_1310_1319 + " " + "#554 のレビュー。帯が出ている間に中身が伸びても測り直さず、最下部で隠れる。E2E は帯が出ている間に中身が伸びたときの最下部で赤。",
  },
  {
    id: 1321,
    label: "agenda の帯の下の余白に、測った高さへさらにホームバーの高さを足す（二重になる）",
    patch: "m1321-run-controls-safe-area-doubled.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1320_1329 + " " + "#554 のレビュー。測った帯の高さ（border-box）がホームバーを含むのに使う側でも足し、iPhone で二重になる。E2E では safe-area が 0 で緑のまま。",
  },
  {
    id: 1322,
    label: "映す表示の余白の hook が、帯が中身に重ならなくても余白を足す（重なり 0 なら何もしない、を崩す）",
    patch: "m1322-projection-clearance-always-added.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/use-projection-clearance.test.tsx"],
    note: RESERVED_1320_1329 + " " + "#554 のレビュー。帯が中身に重ならなくても余白を足し、盤が動く。単体は広い画面で 0 のままであることを確かめる。",
  },
  {
    id: 1324,
    label: "共有の mediaBlock が、同じ頭の @media の個数を確かめない",
    patch: "m1324-css-text-media-block-prefix.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1320_1329 + " " + "#554 のレビュー。同じ頭が複数あっても赤にならない。",
  },
  {
    id: 1326,
    label: "映す表示の余白の hook が、予約した測り直し（requestAnimationFrame）を止めるとき取り消さない",
    patch: "m1326-projection-clearance-raf-not-cancelled.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/use-projection-clearance.test.tsx"],
    note: RESERVED_1320_1329 + " " + "#554 のレビュー。アンマウントや張り直しのあとに古い測定が走って変数を書き戻す。",
  },
  {
    id: 1327,
    label: "映す表示の余白の hook の effect が shown に依存する（帯の出し入れのたびに observer を作り直す）",
    patch: "m1327-projection-clearance-effect-depends-on-shown.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/use-projection-clearance.test.tsx"],
    note: RESERVED_1320_1329 + " " + "#554 のレビュー。observer・focus・matchMedia を毎回作り直し、古い shown を持つ closure が残る。",
  },
  {
    id: 1329,
    label: "依存の監査が、e2e パッケージを製品コードとして扱う",
    patch: "m1329-audit-e2e-treated-as-product.patch",
    pkg: "scripts",
    tests: ["audit-dependency-direction.test.mjs"],
    note: RESERVED_1320_1329 + " " + "#554 のレビュー。E2E から試験専用のパッケージを読むと誤って止まる。",
  },
  {
    id: 1330,
    label: "hidden のボタンを描かない規則を button.css に置く",
    patch: "m1330-button-hidden-rule-in-button-css.patch",
    pkg: "packages/ui",
    tests: ["tests/room-header-wide-toggle.test.mjs"],
    note: RESERVED_1330_1339 + " " + "#554 のレビュー。button.css で display を宣言する規則が 2 つになり、既存の検査が赤になる（除外を足さずに済む置き場は actions.css）。",
  },
  {
    id: 1331,
    label: "映す表示の余白の hook が、最初の ResizeObserver の通知を飛ばす",
    patch: "m1331-projection-clearance-first-notification-skipped.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/use-projection-clearance.test.tsx"],
    note: RESERVED_1330_1339 + " " + "#554 のレビュー。測った直後から最初の通知までの間に伸びた中身の変化を取りこぼし、帯が隠れたままになる。",
  },
  {
    id: 1333,
    label: "招待の URL の基準を max-content に戻す（広い幅で自分の行へ落ちる）",
    patch: "m1333-invite-url-basis-max-content.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1330_1339 + " " + "#554 のレビュー。広い幅で URL が自分の行へ落ちて 3 段になり、見出しが main より高くなる。E2E は 6 アプリ × URL 4 種 × 幅 13 の表で赤。",
  },
  {
    id: 1334,
    label: "映す表示の余白の規則を、64rem 未満の幅の条件に戻す",
    patch: "m1334-projection-clearance-wide-media-gate.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1330_1339 + " " + "#554 のレビュー。広い画面で文字を 200% にすると不透明な帯が中身を覆い、送っても出せない（WCAG 1.4.4）。E2E は 1280×720・文字 200% で赤。",
  },
  {
    id: 1335,
    label: "招待の URL の max-inline-size: max-content を外す（枠が行の余りいっぱいに伸びる）",
    patch: "m1335-invite-url-max-inline-size-removed.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1330_1339 + " " + "#554 のレビュー。短い URL でも何百 px の空の枠になる。E2E は枠が中身の幅以下であることで赤。",
  },
  {
    id: 1336,
    label: "招待の URL の基準の幅を 14rem に戻す",
    patch: "m1336-invite-url-basis-14rem.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1330_1339 + " " + "#554 のレビュー。日本語の長い URL が行の中で 6 行に折れ、見出しが main より高くなる。E2E は 640〜900px を 4px 刻みで測る表で赤。",
  },
  {
    id: 1337,
    label: "コピーの結果でボタンの字を変える（main の形に戻す）",
    patch: "m1337-copy-label-changes.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: RESERVED_1330_1339 + " " + "#554 のレビュー。ボタンの幅が変わり、折り返しで見出しの段数が変わる。E2E はコピー失敗の前後で見出しの高さが変わって赤。",
  },
  {
    id: 1338,
    label: "映す表示の余白の hook が、帯が消えるとき余白を残さない",
    patch: "m1338-projection-clearance-hold-removed.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/use-projection-clearance.test.tsx"],
    note: RESERVED_1330_1339 + " " + "#554 のレビュー。帯が消えると scrollTop が詰められて盤が跳ねる。E2E（320×568・568×320）が拾い、単体は拾わない。",
  },
  {
    id: 1339,
    label: "映す表示の余白の hook が、取り除かれた子を unobserve しない",
    patch: "m1339-projection-clearance-unobserve-removed.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/use-projection-clearance.test.tsx"],
    note: RESERVED_1330_1339 + " " + "#554 のレビュー。12 時間の会で、外れた要素を観測し続けてリークする。",
  },
  {
    id: 1350,
    label: "帯の高さを測る hook の後片付けが、変数を無条件に消す",
    patch: "m1350-measured-block-size-cleanup-unconditional.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/use-measured-block-size.test.tsx"],
    note: RESERVED_1350_1359 + " " + "#554 のレビュー。2 つのインスタンスが重なると片方が生きた値を消す。",
  },
  {
    id: 1351,
    label: "hidden のボタンの規則が hidden=until-found にも当たる",
    patch: "m1351-button-hidden-rule-matches-until-found.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1350_1359 + " " + "#554 のレビュー。ページ内検索で現れる動きを壊す。",
  },
  {
    id: 1352,
    label: "映す表示の帯の padding からホームバーの高さを外す",
    patch: "m1352-projection-strip-safe-area-padding-removed.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1350_1359 + " " + "#554 のレビュー。iPhone でボタンがホームバーに重なる。E2E では safe-area が 0 で緑のまま。",
  },
  {
    id: 1353,
    label: "コピーの結果の知らせを浮かべず流れに入れる",
    patch: "m1353-copy-note-in-flow.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1350_1359 + " " + "#554 のレビュー。知らせが出ると見出しの高さが変わる。E2E はコピー失敗の前後の高さで赤。",
  },
  {
    id: 1354,
    label: "依存の向きの監査の「試験専用」の一覧を空にする",
    patch: "m1354-audit-test-only-list-emptied.patch",
    pkg: "scripts",
    tests: ["audit-dependency-direction.test.mjs"],
    note: RESERVED_1350_1359 + " " + "#554 のレビュー。試験専用のパッケージの名前が一覧から落ちると、製品コードからの取り込みが違反にならない。",
  },
  {
    id: 1355,
    label: "帯の hidden の規則が until-found にも当たる",
    patch: "m1355-dock-hidden-rule-matches-until-found.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1350_1359 + " " + "#554 のレビュー。ページ内検索で現れる動きを壊す。",
  },
  {
    id: 1356,
    label: "通常の見出しの題を 100% にして自分の行へ追い出す",
    patch: "m1356-header-title-flex-100.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1350_1359 + " " + "#554 のレビュー。文字 200% の 416〜504px で 3 段になり main より高くなる。E2E は段数でも赤。",
  },
  {
    id: 1357,
    label: "コピーの知らせが点を受ける（pointer-events を外す）",
    patch: "m1357-copy-note-captures-pointer.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1350_1359 + " " + "#554 のレビュー。知らせが下の操作（見学する・タブ）を 2 秒押せなくする。",
  },
  {
    id: 1358,
    label: "映す表示の外枠の scrollbar-gutter を外す",
    patch: "m1358-projection-scrollbar-gutter-removed.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/run-controls-opaque.test.ts"],
    note: RESERVED_1350_1359 + " " + "#554 のレビュー。帯の出し入れでスクロールバーが出入りして盤の幅が 15px 変わる。E2E も赤。",
  },
  {
    id: 1359,
    label: "コピーの結果の読み上げの知らせ（aria-live）を消す",
    patch: "m1359-copy-live-region-removed.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: RESERVED_1350_1359 + " " + "#554 のレビュー。見える知らせだけが残り、読み上げ利用者に結果が伝わらない。",
  },
  {
    id: 1360,
    label: "コピーの見える知らせを読み上げから隠さない",
    patch: "m1360-copy-note-not-aria-hidden.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: RESERVED_1360_1369 + " " + "#554 のレビュー。見える知らせが読み上げの知らせと二重に読まれる。",
  },
  {
    id: 1361,
    label: "URL の基準を崖の向こう（17rem）にする",
    patch: "m1361-invite-url-basis-17rem.patch",
    pkg: "packages/ui",
    tests: ["tests/dock-and-narrow-header.test.mjs"],
    note: RESERVED_1360_1369 + " " + "#554 のレビュー。本番相当の URL が自分の行へ落ちて 1 段増える。E2E は段数で赤。",
  },
  {
    id: 1362,
    label: "依存の向きの監査から、製品コードが同じパッケージの tests・test を相対パスで読む違反の判定を外す",
    patch: "m1362-audit-relative-tests-read-removed.patch",
    pkg: "scripts",
    tests: ["audit-dependency-direction.test.mjs"],
    note: RESERVED_1360_1369 + " " + "#554 のレビュー。製品コードが自分の tests を相対パスで読み、そこが試験専用のパッケージを再輸出すると、監査が緑のまま素通りする。",
  },
  {
    id: 1363,
    label: "映す表示の余白の hook が、帯が出ているとき帯の高さを無条件に余白へ足す（縦に長い 40〜64rem の画面）",
    patch: "m1363-projection-clearance-unconditional.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/use-projection-clearance.test.tsx"],
    note: RESERVED_1360_1369 + " " + "#554 のレビュー。帯が中身に重ならなくても余白を足し、無用のスクロールが出る。単体（768×1024 の寸法を差し替えた試験）と E2E（768×1024）が拾う。",
  },
  {
    id: 1364,
    label: "依存の向きの監査が、製品コードが tests・test のディレクトリそのもの（\"../tests\"）を読む取り込みを拾わない",
    patch: "m1364-audit-relative-tests-dir-itself-removed.patch",
    pkg: "scripts",
    tests: ["audit-dependency-direction.test.mjs"],
    note: RESERVED_1360_1369 + " " + "#554 のレビュー。読む先が末尾に / の付かない形に畳まれ、再輸出の経由を見逃す。",
  },
  {
    id: 1110,
    label: "timer の名簿の名前の基準の幅を一定にしない（auto に戻す）",
    patch: "m1110-roster-name-basis-auto.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1110_1119 + " " + "#556。 長い名前の行だけ名前が自分の段へ回り 4 段になる（一覧 #15 の再発）。",
  },
  {
    id: 1111,
    label: "timer のロビーの操作を行の幅いっぱいの段に固定する",
    patch: "m1111-lobby-actions-not-own-line.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1110_1119 + " " + "#556 のレビュー。収まる幅でも全員の行が 2 段になり、10 人で一覧が約 400px 伸びる（E5）。",
  },
  {
    id: 1112,
    label: "roulette の入る人の行を折り返さない",
    patch: "m1112-roulette-row-wraps.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1110_1119 + " " + "#556 のレビュー。文字 200% の 320・390 で名前が 0px に潰れ、行がはみ出す（E3。一覧 #20 の高さ揃えの裏）。",
  },
  {
    id: 1113,
    label: "agenda の「上へ」「下へ」の最小幅を外す",
    patch: "m1113-builder-tools-narrow.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1110_1119 + " " + "#556。 当たりが 43×44 に戻る（一覧 #23 の再発）。",
  },
  {
    id: 1114,
    label: "agenda の 2 段目を、行の幅が足りるときも全幅から始める",
    patch: "m1114-builder-controls-full-width.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1110_1119 + " " + "#556。 2 段目が名前の欄と揃わなくなる（一覧 #24 の再発）。",
  },
  {
    id: 1115,
    label: "timer の交代間隔を折り返さない並びにする",
    patch: "m1115-interval-chips-wrap.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1110_1119 + " " + "#556 のレビュー。文字 200% の 320・390 で選択肢の字が隣に重なる（E2）。",
  },
  {
    id: 1116,
    label: "timer の共有メモの Card から `meter-panel-stack` を外す",
    patch: "m1116-shared-memo-card-not-stack.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1110_1119 + " " + "#556。 見出しの行と本文の間を誰も持たなくなる（ADR 0035 決定 1 の再発）。",
  },
  {
    id: 1117,
    label: "timer の状態の帯を grid でなく flex に戻す",
    patch: "m1117-status-strip-not-grid.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1110_1119 + " " + "#556。「通知」だけが 2 段目に落ちる並びに戻る（一覧 #14 の再発）。",
  },
  {
    id: 1118,
    label: "timer の状態の帯に order を足す",
    patch: "m1118-status-strip-uses-order.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1110_1119 + " " + "#556。目の順と DOM の順（Tab・読み上げ）がずれる（WCAG 1.3.2・2.4.3）。",
  },
  {
    id: 1119,
    label: "timer の状態の帯の右の列を左寄せにする",
    patch: "m1119-status-strip-right-column-left.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1110_1119 + " " + "#556。2 段目の接続状態と通知の左右の揃えがばらばらになる（一覧 #14 の再発）。",
  },
  {
    id: 1230,
    label: "timer の見出しの行に margin-bottom を持たせる",
    patch: "m1230-timer-section-header-margin.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1230_1239 + " " + "#556。見出しの下の間を子が持つ形に戻る（ADR 0035 決定 1 の例外の再発）。",
  },
  {
    id: 1231,
    label: "timer のパスフレーズのパネルの根から `panel-stack` を外す",
    patch: "m1231-passphrase-root-not-stack.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1230_1239 + " " + "#556。見出しの下の間を誰も持たなくなり、見出しと中身が接する。",
  },
  {
    id: 1232,
    label: "timer の名簿の根から `panel-stack` を外す",
    patch: "m1232-roster-root-not-stack.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1230_1239 + " " + "#556。見出しの下の間を誰も持たなくなり、見出しと一覧が接する。",
  },
  {
    id: 1233,
    label: "timer の見出しの行に `margin-block: 0 var(--space-4)` を持たせる（margin-bottom 以外の書き方）",
    patch: "m1233-timer-section-header-margin-block-end.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1230_1239 + " " + "#556 のレビュー。見出しの下の間を子が持つ形に別の書き方で戻る（字面の margin-bottom だけを見る検査をすり抜けた）。",
  },
  {
    id: 1234,
    label: "timer の状態の帯の列を `auto minmax(0, 1fr)` に戻す",
    patch: "m1234-status-strip-left-column-auto.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1230_1239 + " " + "#556 のレビュー。左の列が中身の幅まで広がり、右の列（名前・通知）が 0 に潰れる（文字 200%・長い接続状態・E1）。",
  },
  {
    id: 1235,
    label: "roulette の入る人の名前の列から最小の幅を外す",
    patch: "m1235-roulette-label-min-width-zero.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1230_1239 + " " + "#556 のレビュー。名前が 0px まで潰れ、読める字数が残らない（E3）。",
  },
  {
    id: 1236,
    label: "agenda の 2 段目の既定を名前の列（2 列目）にする",
    patch: "m1236-builder-controls-always-column-2.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1230_1239 + " " + "#556 のレビュー。狭い幅・文字 200% で「＋」「分」が行をはみ出し、「押すまで待つ」が 2 行に割れる（E4）。",
  },
  {
    id: 1237,
    label: "agenda の進行中の会の名前を太字（700）にする",
    patch: "m1237-agenda-run-title-bold.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1230_1239 + " " + "#556 のレビュー。自己ホスト書体の 700 は base 層しか無く、利用者が入れる字（「議」など）が別の書体で描かれる（E6）。",
  },
  {
    id: 1238,
    label: "timer の交代順の札の名前から最小の幅を外す",
    patch: "m1238-rotation-lineup-name-no-min.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1230_1239 + " " + "#556 のレビュー（F1）。名前の最小の幅が無くなる。札の flex-wrap が入った今の形では 320・390・1280 の E2E では等価で、検出は契約テスト（rows-alignment.test.mjs）の字面だけ。",
  },
  {
    id: 1239,
    label: "timer の交代順の札の長い文言に nowrap を付ける",
    patch: "m1239-rotation-lineup-when-nowrap.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1230_1239 + " " + "#556 のレビュー（F1）。「約10分後」が札を越える。",
  },
  {
    id: 1380,
    label: "roulette の行のボタンの字を折り返さない",
    patch: "m1380-roulette-button-nowrap.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1380_1389 + " " + "#556 のレビュー（F2）。行のボタンが折り返せなくなる。いまは `min-width: var(--tap-target)` が行に収めているので E2E では等価で、検出は契約テストの字面だけ。",
  },
  {
    id: 1381,
    label: "timer の名簿の名前を 2 行で切って省略する",
    patch: "m1381-roster-name-line-clamp.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1380_1389 + " " + "#556 のレビュー（F3）。長い名前の全文がタッチで読めない。",
  },
  {
    id: 1382,
    label: "roulette の名前を 2 行で切って省略する",
    patch: "m1382-roulette-name-line-clamp.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1380_1389 + " " + "#556 のレビュー（F3）。長い名前の全文がタッチで読めない。",
  },
  {
    id: 1383,
    label: "timer の縦の並びに子のリセットを自前で書く",
    patch: "m1383-panel-stack-own-reset.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1380_1389 + " " + "#556 のレビュー（F4）。読み上げ専用の要素（margin: -1px）の形が崩れる。",
  },
  {
    id: 1384,
    label: "timer の共有メモの偽の側から ui-stack を外す",
    patch: "m1384-shared-memo-false-side-no-stack.patch",
    pkg: "packages/ui",
    tests: ["tests/rows-alignment.test.mjs"],
    note: RESERVED_1380_1389 + " " + "#556 のレビュー（F5）。更新が無いときに見出しの下の間と読み上げの要素の守りが外れる。",
  },
  {
    id: 1100,
    label: "poker の席の並びを grid から flex の折り返しに戻す",
    patch: "m1100-poker-seats-not-grid.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1100_1109 + " " + "#555。固定幅の席が左から詰まり、行の右に端数の空きが残る（一覧 #9 の再発）。",
  },
  {
    id: 1101,
    label: "poker の席の名前の省略を 3 行から 6 行にする",
    patch: "m1101-poker-name-no-clamp-3.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1100_1109 + " " + "#555。28 字の名前が 6 行に折れて席が伸びる（一覧 #4 の再発）。",
  },
  {
    id: 1102,
    label: "poker のお題も記録も無いときの操作の面を 46rem の中央寄せに戻す",
    patch: "m1102-poker-main-centered-again.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1100_1109 + " " + "#555。お題の無い画面で本体だけが細い列に寄り、見出しと左右の端が揃わない（一覧 #8 の再発）。",
  },
  {
    id: 1103,
    label: "landing の 40rem 未満の道具の札に縦長の比（5 / 7）を戻す",
    patch: "m1103-landing-card-keeps-ratio.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1100_1109 + " " + "#555。札が 1 枚約 330px の縦長に戻り、6 枚で約 2000px になる（一覧 #21 の再発）。",
  },
  {
    id: 1104,
    label: "checkin の手札の並びを grid から flex の折り返しに戻す",
    patch: "m1104-checkin-hand-not-grid.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1100_1109 + " " + "#555。390px で手札の右に約 1/3 の空きが残る（一覧 #27 の再発）。",
  },
  {
    id: 1105,
    label: "checkin のやり方の説明の `text-wrap: balance` を外す",
    patch: "m1105-checkin-prompt-default-wrap.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1100_1109 + " " + "#555。説明の最後の 1〜2 字だけが 2 行目へ落ちる（一覧 #30 の再発）。",
  },
  {
    id: 1106,
    label: "poker の席の並びの `align-items: start` を `stretch` にする",
    patch: "m1106-poker-seats-stretch.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1100_1109 + " " + "#555。長い名前の席が同じ行の席を同じ高さに引き伸ばし、中が空く（一覧 #4 の再発）。",
  },
  {
    id: 1107,
    label: "checkin の人数の行を中央寄せから左寄せに戻す",
    patch: "m1107-checkin-seat-count-left.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1100_1109 + " " + "#555。「2 / 6 人が出しました」が席の並びの中央と揃わない（一覧 #28 の再発）。席の並びは常に中央なので、人数の行も常に中央。",
  },
  {
    id: 1108,
    label: "landing の札の幅が狭いとき絵を上に回す @container をやめる",
    patch: "m1108-landing-card-stays-row-when-narrow.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1100_1109 + " " + "#555。文字 200%・320px で名前の列が 36px、名前が 10 行に折れる（PR #575 の指摘 D1 の再発）。",
  },
  {
    id: 1109,
    label: "poker の手札を中央に置く指定を外す",
    patch: "m1109-poker-hand-left-again.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1100_1109 + " " + "#555。1920px で手札が左の 1/3 に寄り、右が約 1150px 空く（PR #575 の指摘 D3 の再発）。",
  },
  {
    id: 1390,
    label: "checkin の手札の札の最小幅 --hand-card-min を素の 7rem に戻す",
    patch: "m1390-checkin-hand-card-min-plain.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1390_1399 + " " + "#555。最長 8 字の名前（「持ち帰れなかった」）が、字が大きいときに 1 行に収まらない（#502 の敵対的レビュー 1 の再発。D7）。",
  },
  {
    id: 1391,
    label: "checkin のやり方の説明に word-break: auto-phrase を足す",
    patch: "m1391-checkin-prompt-auto-phrase.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1390_1399 + " " + "#555。320・640 で「…持ち帰りたいです／か？」と最後の行が 2 字になる（D8）。",
  },
  {
    id: 1392,
    label: "poker の席の列を auto-fill の 6.5rem から auto-fit の 6.5rem〜10rem に戻す",
    patch: "m1392-poker-seats-auto-fit-10rem.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1390_1399 + " " + "#555。列の数が 10rem で数えられ、1 行の席の数が main の約半分になる（320px・12 人で 1 列・高さ 1372px・G1）。",
  },
  {
    id: 1393,
    label: "checkin の席の列を auto-fill の 6.5rem から auto-fit の 6.5rem〜10rem に戻す",
    patch: "m1393-checkin-seats-auto-fit-10rem.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1390_1399 + " " + "#555。列の数が 10rem で数えられ、1 行の席の数が main の約半分になり、手札が押し下げられる（G1）。",
  },
  {
    id: 1394,
    label: "poker の開いた名前の overflow を hidden に戻す",
    patch: "m1394-poker-name-expanded-stays-clipped.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1390_1399 + " " + "#555。押しても名前の全文が出ない（タッチ・キーボードで全文を読めない・D4）。",
  },
  {
    id: 1395,
    label: "checkin の手札の align-items を stretch から start に戻す",
    patch: "m1395-checkin-hand-align-start.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1390_1399 + " " + "#555。同じ行の札のボタンの高さが揃わない（D5）。",
  },
  {
    id: 1396,
    label: "poker の席の並びに人数相当の max-width と中央寄せを足す",
    patch: "m1396-poker-seats-capped-by-count.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1390_1399 + " " + "#555。列が中身の幅で決まる .room-main の中で、3 人以上でも席が 1 行に並び続けて、ルーム全体が横にはみ出す（390px・6 人で 302px）。",
  },
  {
    id: 1397,
    label: "poker の席の名前に title を付ける",
    patch: "m1397-poker-name-title-again.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1390_1399 + " " + "#555。名前を読み上げが二度読む（名前と説明・D4）。",
  },
  {
    id: 1398,
    label: "checkin の席の並びの幅を人数までに絞る max-width を外す",
    patch: "m1398-checkin-seats-no-cap.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1390_1399 + " " + "#555。人数が少ないとき席が全幅に伸びて右が空き、人数の行の中央と席の並びの中央がずれる（D2）。",
  },
  {
    id: 1399,
    label: "checkin の席の並びの margin-inline: auto を外す",
    patch: "m1399-checkin-seats-not-centered.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1390_1399 + " " + "#555。絞った席の並びが左に寄り、人数の行の中央とずれる（D2）。",
  },
  {
    id: 1400,
    label: "poker の席の並びへ --seat-count を渡す",
    patch: "m1400-poker-seat-count-passed-again.patch",
    pkg: "packages/ui",
    tests: ["tests/card-rows.test.mjs"],
    note: RESERVED_1400_1409 + " " + "#555。席の並びの幅を人数で絞る足場が戻り、横にはみ出す形に戻りやすくなる（契約で禁止）。",
  },
  {
    id: 1401,
    label: "ClampedName が書体の完了（loadingdone）で測り直さない",
    patch: "m1401-clamped-name-no-font-remeasure.patch",
    pkg: "packages/web-kit",
    tests: ["tests/clamped-name.test.tsx"],
    note: RESERVED_1400_1409 + " " + "#555。書体が届いて行数が変わっても省略の有無が古いままで、全文に開けない（G3）。",
  },
  {
    id: 1402,
    label: "ClampedName が省略の無くなったフォーカス中の名前をボタンのまま残さない",
    patch: "m1402-clamped-name-loses-focus.patch",
    pkg: "packages/web-kit",
    tests: ["tests/clamped-name.test.tsx"],
    note: RESERVED_1400_1409 + " " + "#555。開いたまま幅を変えて閉じるとフォーカスが body へ落ちる（G4）。",
  },
  {
    id: 1403,
    label: "ClampedName が名前の変わりで状態を作り直さない",
    patch: "m1403-clamped-name-keeps-open-on-rename.patch",
    pkg: "packages/web-kit",
    tests: ["tests/clamped-name.test.tsx"],
    note: RESERVED_1400_1409 + " " + "#555。開いたまま別の名前になる（G4）。",
  },
  {
    id: 1130,
    label: "見本の検査が、載っていない部品のクラスを落とさない",
    patch: "m1130-gallery-parts-gap-ignored.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: RESERVED_1130_1139 + " " + "#558。部品を足しても見本に載せ忘れたまま検査が緑になる。",
  },
  {
    id: 1131,
    label: "見本の検査が、トークン名の前の境界を見ない（部品の修飾 ui-button--danger の --danger を載っているとみなす）",
    patch: "m1131-gallery-token-prefix-match.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: RESERVED_1130_1139 + " " + "#558。部品の修飾に同じ綴りがあるだけで、載せていないトークンが載っていることになる。",
  },
  {
    id: 1132,
    label: "見本の検査が、class の区切りに ASCII 以外の空白（U+3000・NBSP）も使う（ブラウザは区切りにしない）",
    patch: "m1132-gallery-class-from-text.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: RESERVED_1130_1139 + " " + "#558 のレビュー。全角スペースでつないだ class は実物では 1 つの名前なのに、載っていることになる。",
  },
  {
    id: 1133,
    label: "見本の検査が、描かれない状態（hidden・open の無い dialog など）の要素の class も載っているとみなす",
    patch: "m1133-gallery-drops-drawer-body.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: RESERVED_1130_1139 + " " + "#558 のレビュー。描かれない要素にだけ残った部品が、載っていることになる。",
  },
  {
    id: 1134,
    label: "見本の検査が、トークン名を本文のどこに書いても載っているとみなす（<code> の本文と var() だけを数えない）",
    patch: "m1134-gallery-token-counted-anywhere.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: RESERVED_1130_1139 + " " + "#558 のレビュー。コメントや説明文に名前を書いただけで、並べていないトークンが載っていることになる。",
  },
  {
    id: 1135,
    label: "見本の検査の CLI が、載っていないトークンを問題に積まない",
    patch: "m1135-gallery-cli-ignores-missing-tokens.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: RESERVED_1130_1139 + " " + "#558 のレビュー。関数は正しくても配線が外れ、トークンの載せ忘れで CI が緑になる。",
  },
  {
    id: 1136,
    label: "見本の検査が、gallery.css の .ui- のセレクタを見ない",
    patch: "m1136-gallery-css-ui-selector-ignored.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: RESERVED_1130_1139 + " " + "#558 のレビュー。見本の枠が部品の値を上書きしても気づけない。",
  },
  {
    id: 1137,
    label: "見本の検査が、属性名が class で終わるもの（data-class）も class 属性として数える",
    patch: "m1137-gallery-class-attr-name-suffix.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: RESERVED_1130_1139 + " " + "#558 のレビュー。data-class=\"ui-x\" を書いただけで、並べていない部品が載っていることになる。",
  },
  {
    id: 1138,
    label: "見本の許可リストが script を禁じない",
    patch: "m1138-gallery-script-body-counted.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: RESERVED_1130_1139 + " " + "#558 のレビュー。script の中に書いた文字列で、並べていない部品が載っていることになる（許可リストの外）。",
  },
  {
    id: 1139,
    label: "見本の許可リストが、同じ属性の 2 回書きを違反にしない",
    patch: "m1139-gallery-duplicate-attr-allowed.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: RESERVED_1130_1139 + " " + "#558 のレビュー。class=\"x\" class=\"ui-x\" の後ろの値（ブラウザは取らない）で、並べていない部品が載っていることになる。",
  },
  {
    id: 1430,
    label: "見本の走査が、閉じタグで積みから戻らない",
    patch: "m1430-gallery-close-tag-not-popped.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: RESERVED_1430_1439 + " " + "#558 のレビュー。描かれない状態が、閉じた後ろの兄弟へ残る。",
  },
  {
    id: 1431,
    label: "見本の走査が、文書の終わりに閉じていない要素を違反にしない",
    patch: "m1431-gallery-unclosed-at-end-allowed.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: RESERVED_1430_1439 + " " + "#558 のレビュー。閉じ忘れたまま、ブラウザと違う入れ子を許す。",
  },
  {
    id: 1432,
    label: "見本の走査が、生の要素（textarea）も積みに載せる",
    patch: "m1432-gallery-raw-element-pushed.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: RESERVED_1430_1439 + " " + "#558 のレビュー。textarea の後ろの要素が、積みから戻らず違反か偽の状態になる。",
  },
  {
    id: 1433,
    label: "見本の走査が、閉じタグと積みの一番上の食い違いを違反にしない",
    patch: "m1433-gallery-close-mismatch-allowed.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: RESERVED_1430_1439 + " " + "#558 のレビュー。終了タグの省略で、描かれる要素を描かれないと数える（偽の赤・偽の緑）。",
  },
  {
    id: 1434,
    label: "見本の走査が、svg の自己閉じ要素（<path />）も開いた要素として積む",
    patch: "m1434-gallery-svg-self-closed-pushed.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: RESERVED_1430_1439 + " " + "#558 のレビュー。svg のアイコンを持つ部品の見本が、閉じタグの食い違いの違反で落ちる。",
  },
  {
    id: 1120,
    label: "重なりと間の検査で、箱どうしの縦の間の下限（MIN_BLOCK_GAP）を 8px から 4px に緩める",
    patch: "m1120-block-gap-floor-lowered.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1120_1129 + " " + "#557。箱どうしの 4〜7px の詰まりが緑になる（余白の持ち主の約束の下限が効かない）。E2E の `block-gaps.spec.ts` は、この判定を呼ぶ。",
  },
  {
    id: 1121,
    label: "重なりの判定が縦の食い込みを見ない（横の食い込みだけで重なりと読む）",
    patch: "m1121-overlap-ignores-vertical-extent.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1120_1129 + " " + "#557。縦に積んだだけの箱が「重なる」と出て、間の不足と区別がつかなくなる（赤の種類が変わり、横に並んだ箱の偽陽性も出る）。",
  },
  {
    id: 1122,
    label: "重なりと間の検査が、position: fixed の帯を除かない（sticky だけ除く）",
    patch: "m1122-fixed-band-not-skipped.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1120_1129 + " " + "#557。下端に貼りつく帯がスクロールの位置で中身に乗るのを「重なる」と読み、検査が全画面で偽の赤になる。",
  },
  {
    id: 1123,
    label: "重なりと間の検査が、変形した部品（傾けた札・浮き上がり）を除かない",
    patch: "m1123-transformed-not-skipped.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1120_1129 + " " + "#557。意図して重ねた札の扇や手札の浮き上がりが「重なる」と出て、検査が全画面で偽の赤になる。",
  },
  {
    id: 1124,
    label: "2 行以上の段落（p）どうしの間の下限を 8px でなく 4px にする（1 行の文章と同じにする）",
    patch: "m1124-paragraph-gap-not-measured.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1120_1129 + " " + "#557。2 行以上の段落の間が 4〜7px でも緑になる（行間と区別しにくい段落の間を、文章の間の下限 8px で測らない）。",
  },
  {
    id: 1125,
    label: "重なりと間の検査が、字を切る面（省略・行数の上限）を除かない",
    patch: "m1125-truncated-not-skipped.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1120_1129 + " " + "#557。切られて見えない字の分まで箱に入り、隣と「重なる」と出る偽の赤が全画面で出る。",
  },
  {
    id: 1126,
    label: "重なりと間の検査が、罫線の有無に関わらずすべての組の間を測らない（線で区切った行の規則を常に真にする）",
    patch: "m1126-ruled-rows-always-skipped.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1120_1129 + " " + "#557。罫線のない箱どうしの間 0 まで緑になり、検査が何も測らなくなる。",
  },
  {
    id: 1127,
    label: "字だけの 2 つの重なりの許容（字の高さ・幅の 1/4）を 0 にする",
    patch: "m1127-ink-overlap-ratio-zero.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1120_1129 + " " + "#557。行の高さより字の枠が広いだけの食い込み（字は接していない）を「重なる」と読み、盤の時間と差の行などで偽の赤が出る。",
  },
  {
    id: 1128,
    label: "一覧の行（li）どうしの縦の間の下限を、箱どうしの 8px にする（行を 4px で詰める作りを許さない）",
    patch: "m1128-list-rows-use-block-floor.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1120_1129 + " " + "#557。roulette の入る人の行（4px で詰めた一覧）が全画面で偽の赤になる。",
  },
  {
    id: 1129,
    label: "字と箱の組の間を、箱の間だけで測る（字の端から測った間を使わない）",
    patch: "m1129-caption-gap-box-only.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1120_1129 + " " + "#557。見出しの箱の余白（padding）が字を離している所（topic の題と本文）が、間 0 として偽の赤になる。",
  },
  {
    id: 1410,
    label: "重なりと間の検査が、折り返した inline の字（行をまたぐ外接の矩形）を除かない",
    patch: "m1410-inline-text-not-skipped.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1410_1419 + " " + "#557。通知の見出しの「OFF」と「/ 音: …」など、折り返した inline の字が互いに重なると出る偽の赤が出る。",
  },
  {
    id: 1411,
    label: "重なりと間の検査が、タブの帯（role=tablist）と下の面の間 0 を除かない",
    patch: "m1411-tablist-not-skipped.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1410_1419 + " " + "#557。接して 1 つの塊に見せるタブの帯と面（topic の読む面）が、間 0 として偽の赤になる。",
  },
  {
    id: 1412,
    label: "重なりと間の検査が、表の行（display: table*）の間 0 を除かない",
    patch: "m1412-table-rows-not-skipped.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1410_1419 + " " + "#557。線で区切った表（終了後の表）の行が、間 0 として偽の赤になる。",
  },
  {
    id: 1413,
    label: "重なりと間の検査が、流れの外（position: absolute）の部品を除かない",
    patch: "m1413-absolute-not-skipped.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1410_1419 + " " + "#557。QR の浮かぶカード・バッジ・盤の針など意図した重ねが「重なる」と出て、検査が偽の赤になる。",
  },
  {
    id: 1414,
    label: "重なりと間の検査が、高さか幅が 2px 未満の線を除かない",
    patch: "m1414-thin-lines-not-skipped.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1410_1419 + " " + "#557。区切り線が隣の箱と間 0 で接して偽の赤になる。",
  },
  {
    id: 1415,
    label: "timer の共有メモの見出しの印が題の下へ折り返したとき、行の間を 0 に戻す",
    patch: "m1415-shared-memo-lead-row-gap-zero.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/spacing-css.test.ts"],
    note: RESERVED_1410_1419 + " " + "#557。印（Markdown）が題の字と 3px で詰まる（重なりと間の E2E が見つけた崩れの再発）。",
  },
  {
    id: 1416,
    label: "roulette の入る人の行の間を、列の間だけにする（行の間を 0 に戻す）",
    patch: "m1416-roulette-row-no-row-gap.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1410_1419 + " " + "#557。文字 200% の 320・390 で名前と「名前を消す」が次の行へ回ったとき、2 段が 0px で接する（重なりと間の E2E が見つけた崩れの再発）。",
  },
  {
    id: 1417,
    label: "agenda の延長の群の 4 列を、帯の幅（容器クエリ）でなく画面の幅（@media (width >= 40rem)）で切り替える形に戻す",
    patch: "m1417-agenda-extend-columns-shrink.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/spacing-css.test.ts"],
    note: RESERVED_1410_1419 + " " + "#557。文字 200% の 1280 で「+1 分」「+3 分」「+5 分」のボタンが隣と 17〜18px 重なる（重なりと間の E2E が見つけた崩れの再発）。",
 },
  {
    id: 1418,
    label: "字だけの判定が、要素の種類の許可リストを見ない（button・a・input・img も字だけにする）",
    patch: "m1418-text-only-ignores-tag.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1410_1419 + " " + "#557 のレビュー。ボタンどうしの間 0・ラベルと入力の間 0・見出しに重なるボタンが「字の行」として素通りする（poker の手札・landing の欄・見出しの行）。",
  },
  {
    id: 1419,
    label: "字だけの判定が、自分で背景・枠・影を塗るかを見ない",
    patch: "m1419-text-only-ignores-paint.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1410_1419 + " " + "#557 のレビュー。塗った札・チップ（span・p）が字の行として扱われ、間の下限が 8px から 4px に緩む。",
  },
  {
    id: 1420,
    label: "負の間（箱が食い込む）を下限と比べず飛ばす",
    patch: "m1420-negative-gap-skipped.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1420_1429 + " " + "#557 のレビュー。重なりの許容（0.5px）以下の接触や、字の矩形が離れている食い込みが、重なりにも間の不足にも出ない。",
  },
  {
    id: 1421,
    label: "1 行の文章（p・h*・li）どうしの間を測らない（2 行以上の段落どうしだけ測る）",
    patch: "m1421-one-line-prose-not-measured.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1420_1429 + " " + "#557 のレビュー。短い段落どうし・見出しと 1 行の段落が間 0 で並んでも素通りする（一覧 #3 の型が短い段落で再発する）。",
  },
  {
    id: 1422,
    label: "親より狭い sticky（読む面の脇の欄）も貼りつく帯として除く",
    patch: "m1422-sticky-all-skipped.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1420_1429 + " " + "#557 のレビュー。topic・poker の読む面の脇の欄が主の欄に重なっても素通りする。",
  },
  {
    id: 1423,
    label: "変形した部品の子孫を除かない",
    patch: "m1423-transformed-descendants-measured.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1420_1429 + " " + "#557 のレビュー。3D で回した札の中身（ルーレットの札の見出しと名前）が、射影された矩形で間が足りないと出る偽の赤になる。",
  },
  {
    id: 1424,
    label: "塗らない入れ物の padding を間に数えない",
    patch: "m1424-transparent-padding-not-counted.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1420_1429 + " " + "#557 のレビュー。padding で中身と離している見出しの下の入れ物（topic の読む面）が、間 0 として偽の赤になる。",
  },
  {
    id: 1425,
    label: "div の字だけの判定が、子が inline の字だけかを見ない（入れ物の div も字の行にする）",
    patch: "m1425-div-allows-block-children.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1420_1429 + " " + "#557 のレビュー。字を含む入れ物の div（手札の 2 段・欄）が字の行になり、間の下限が緩む。",
  },
  {
    id: 1426,
    label: "timer のロビーの参加者の行の折り返しの間を 0.375rem（6px）に戻す",
    patch: "m1426-lobby-participant-row-gap-6px.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/spacing-css.test.ts"],
    note: RESERVED_1420_1429 + " " + "#557 のレビュー。名前の段と操作の段が 6px に詰まる（ボタンの当たりは 44px だが、見た目では 2 段が接する。重なりと間の E2E が見つけた）。",
  },
  {
    id: 1427,
    label: "恒等の行列（matrix(1, 0, 0, 1, 0, 0)）や平行移動の行列も、形を歪める変形として読む（子孫を測らなくなる）",
    patch: "m1427-identity-transform-counted.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1420_1429 + " " + "#557 のレビュー。終わった入場の演出（timer の .boot-reveal）の区画とその子孫が判定から外れ、セッションの 2 つの部品が 80px 重なっても緑になる。",
  },
  {
    id: 1428,
    label: "平行移動だけの変形の子孫も測らない（distorted でなく transformed で子孫を外す）",
    patch: "m1428-translate-only-ancestor-excludes.patch",
    pkg: "e2e",
    tests: ["tests/block-gaps.test.ts"],
    note: RESERVED_1420_1429 + " " + "#557 のレビュー。translate だけの区画（agenda の盤の読み取り）の子孫が判定から外れる。",
  },
  {
    id: 1500,
    label: 'サブエージェントの判定が agent_id を見ず、まとめ役の呼び出しにも掛ける',
    patch: "m1500-subagent-guard-ignores-agent-id.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。サブエージェントでないまとめ役の git push・枝の切り替えまで毎回聞かれ、まとめ役が作業できない。',
  },
  {
    id: 1501,
    label: 'reset --hard の省略形（--h・--ha・--har）を拾わず完全一致だけにする',
    patch: "m1501-reset-hard-abbrev-exact-only.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs", "lib/discard-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。git reset --har がサブエージェントの reset --hard の歯止めをすり抜ける。',
  },
  {
    id: 1502,
    label: 'git checkout の -- の後ろが空でもファイルの取り出しと読む',
    patch: "m1502-checkout-empty-pathspec-is-restore.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。git checkout main -- が枝の切り替えとして聞かれず、サブエージェントが枝を動かす。',
  },
  {
    id: 1503,
    label: 'git の全体の選択肢 --config-env の値を飛ばさない',
    patch: "m1503-git-global-option-config-env-not-skipped.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs", "lib/discard-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。git --config-env a.b=X push の値を下位コマンドと読み違え、サブエージェントの push が素通りする。',
  },
  {
    id: 1504,
    label: 'ヒアドキュメントの終端が見つからなくても本文として隠す（終端の後ろのコマンドが見えなくなる）',
    patch: "m1504-tame-heredoc-body-not-stripped-to-end.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。閉じないヒアドキュメントの後ろの git push が読むだけの形として通る。',
  },
  {
    id: 1505,
    label: 'gh api の書き込み（-X PUT・-f）も読む形として通す',
    patch: "m1505-tame-gh-api-write-allowed.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。gh api -X PUT …/merge がサブエージェントのマージとして聞かれない。',
  },
  {
    id: 1506,
    label: 'サブエージェントの「読み切れない形は聞く」フォールバックを外す',
    patch: "m1506-subagent-fallback-removed.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。変数・別名・入れ子の経由で push・kill がサブエージェントから素通りする。',
  },
  {
    id: 1507,
    label: '単純でない形の候補（cd && git stash ほか）を、確かめずに通す',
    patch: "m1507-discard-unknown-form-passes.patch",
    pkg: "scripts",
    tests: ["lib/discard-guard.test.mjs", "agent-guard-hook.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。cd 先や GIT_DIR を使った git stash・restore が、変更の有無を確かめられずに素通りし、別の作業の未コミットの変更が消える。',
  },
  {
    id: 1508,
    label: 'checkout/restore の変更の数え方に、ステージ済みも含める（手順書の往復を止める）',
    patch: "m1508-discard-worktree-scope-counts-staged.patch",
    pkg: "scripts",
    tests: ["lib/discard-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。adversarial-review の git checkout HEAD -- <テスト> が毎回聞かれ、手順が進まない。',
  },
  {
    id: 1509,
    label: '未コミットの変更の確かめが失敗（unknown）したときに通す',
    patch: "m1509-discard-dirty-check-failure-passes.patch",
    pkg: "scripts",
    tests: ["lib/discard-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。git が答えなかったとき（所有者の不一致・時間切れ）に、変更があるか分からないまま消す操作が通る。',
  },
  {
    id: 1510,
    label: 'git status が 128 で落ちたら（理由を問わず）変更なしと扱う',
    patch: "m1510-discard-128-means-clean.patch",
    pkg: "scripts",
    tests: ["lib/discard-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。壊れた git 設定・所有者の不一致で確かめられないのに、変更なしと誤って通る。',
  },
  {
    id: 1511,
    label: 'restore --staged だけの形も作業ツリーの変更の確かめに回す（誤って聞く）',
    patch: "m1511-discard-staged-only-restore-is-checked.patch",
    pkg: "scripts",
    tests: ["lib/discard-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。ステージを外すだけの git restore --staged が、作業ツリーに変更があると毎回聞かれる。',
  },
  {
    id: 1512,
    label: 'スコープ無しの名前（sync）が @*/名前 に当たるのを見ない',
    patch: "m1512-pnpm-filter-unscoped-name-not-matched.patch",
    pkg: "scripts",
    tests: ["lib/pnpm-filter-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。pnpm --filter sync が実在するのに聞かれる（誤検出）。',
  },
  {
    id: 1513,
    label: 'どのパッケージにも当たらない --filter を聞かない',
    patch: "m1513-pnpm-filter-nonmatching-passes.patch",
    pkg: "scripts",
    tests: ["lib/pnpm-filter-guard.test.mjs", "agent-guard-hook.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。@tasuki/tasuki-sync のような実在しない名前で、テストが 1 本も走らずに緑になる。',
  },
  {
    id: 1514,
    label: 'バッククォートの中の閉鎖キーワードを検出しない（効かない書き方を見逃す）',
    patch: "m1514-closing-keyword-code-span-as-prose.patch",
    pkg: "scripts",
    tests: ["lib/closing-keywords.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。`Closes #N` と書いた PR をマージしても ISSUE が閉じない事故を、PR を立てる前に知らせない。',
  },
  {
    id: 1515,
    label: 'コミットメッセージでも行頭の単独の閉鎖を意図した閉鎖として通す',
    patch: "m1515-closing-keyword-commit-standalone-skipped.patch",
    pkg: "scripts",
    tests: ["lib/closing-keywords.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。squash で連結されるコミットメッセージの閉鎖キーワードが、ISSUE を勝手に閉じるのを知らせない。',
  },
  {
    id: 1516,
    label: '「大きいほど良い」指標（SC032・SC036）の後退の向きを逆にする',
    patch: "m1516-structure-metrics-regression-direction-flipped.patch",
    pkg: "scripts",
    tests: ["lib/structure-metrics.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。テスト対象の割合（SC032）が下がっても知らせず、上がると誤って知らせる。',
  },
  {
    id: 1517,
    label: '表から読めなくなった指標を黙って外す',
    patch: "m1517-structure-metrics-unreadable-silent.patch",
    pkg: "scripts",
    tests: ["lib/structure-metrics.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。監査の表の形が変わると、指標の比較が黙って効かなくなる（検査が死んだまま緑）。',
  },
  {
    id: 1518,
    label: 'audit-agent-guard が入口の import をたどらない',
    patch: "m1518-audit-agent-guard-ignores-entry-imports.patch",
    pkg: "scripts",
    tests: ["wiring-audit-agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。入口が読む判定の部品が追跡下から外れても検査が緑のまま、入口が起動せず本番デプロイの判定も働かない。',
  },
  {
    id: 1519,
    label: 'ヒアドキュメントとして飛ばしたテキストの危ない操作の名前を見ない（引用符の中の << で続く行を隠す）',
    patch: "m1519-tame-heredoc-body-with-operation-names-skipped.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs", "lib/discard-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。echo "<<EOF" の後ろの git stash・git push が本文として隠れ、読むだけの形として通る。',
  },
  {
    id: 1520,
    label: 'gh の短い選択肢の束（-XPUT）の先頭の 2 文字だけで既知と判定する',
    patch: "m1520-tame-gh-short-option-bundle-allowed.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578。gh api -XPUT …/merge が -X として既知と読まれ、サブエージェントのマージが素通りする。',
  },
  {
    id: 1521,
    label: '入口が複数の判定の理由をまとめず、最初の 1 つだけ返す',
    patch: "m1521-hook-reasons-not-merged.patch",
    pkg: "scripts",
    tests: ["agent-guard-hook.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR 2 のレビュー。本文に git の語がある gh pr create で、先行 PR と閉鎖キーワードの知らせが的外れの理由に隠れる。',
  },
  {
    id: 1522,
    label: 'heredoc の本文をデータとして隠す形を認めない（本文に git push 等があれば常に読めない）',
    patch: "m1522-heredoc-data-never.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR 2 のレビュー。本文に git push の語がある普通の git commit・gh pr create が毎回聞かれる。',
  },
  {
    id: 1523,
    label: 'heredoc の終端の後ろが )" と空白だけかを見ず、後ろに続く行がある形の本文も文章として隠す',
    patch: "m1523-heredoc-data-any-consumer.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR 2 のレビュー。終端の後ろに続く行（git push など）があっても、本文を隠した形として通る。',
  },
  {
    id: 1524,
    label: '基準の控えを中身を確かめずに使う',
    patch: "m1524-baseline-cache-not-validated.patch",
    pkg: "scripts",
    tests: ["lib/structure-metrics.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR 2 のレビュー。空・途中までの控えで、後退があっても「後退していません」と出る。',
  },
  {
    id: 1525,
    label: '基準の側で読めない指標を黙って外す',
    patch: "m1525-baseline-unreadable-silent.patch",
    pkg: "scripts",
    tests: ["lib/structure-metrics.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR 2 のレビュー。基準の表の形が壊れていても、比べずに緑になる。',
  },
  {
    id: 1526,
    label: 'git branch -D などの消す形も読むだけとして通す',
    patch: "m1526-git-branch-delete-tame.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR 2 のレビュー。サブエージェントの git branch -D が聞かれずに枝を消す。',
  },
  {
    id: 1527,
    label: "git fetch の選択肢・refspec を見ず、読むだけとして通す（--force・+refspec・--prune）",
    patch: "m1527-git-fetch-force-tame.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR 2 のレビュー。サブエージェントの git fetch origin +main:main や --prune が聞かれず、他の作業ツリーの参照が消える。",
  },
  {
    id: 1528,
    label: "--output（ファイルへ書く）を、git のサブコマンド共通では拒まない",
    patch: "m1528-git-output-option-not-rejected.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR 2 のレビュー。git reflog --output=ファイル や stash show --output が読むだけとして通り、ファイルを上書きする。",
  },
  {
    id: 1529,
    label: "heredoc の行の可変部が、区切り・コメント・引用符を含められる（改行以外なら何でも）",
    patch: "m1529-heredoc-line-allows-separators.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR 2 のレビュー。git commit -m x; git push && … のように別のコマンドを混ぜた行の heredoc 本文が隠れ、git push が通る。",
  },
  {
    id: 1530,
    label: "git reflog を拒否リスト（expire・delete ほか）で判定し、drop・list・裸の語を通す",
    patch: "m1530-git-reflog-denylist.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR 2 のレビュー。新しい git の git reflog drop のように、拒否リストに無いサブコマンドが読むだけとして通り、reflog を消す。",
  },
  {
    id: 1531,
    label: '投げた判定を ask に倒さず、無かったことにする',
    patch: "m1531-combine-throw-passes.patch",
    pkg: "scripts",
    tests: ["lib/hook-combine.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 /code-review 583。1 つの判定が投げると通る側に倒れ、ほかの ask の理由も黙って消える。',
  },
  {
    id: 1532,
    label: 'サブエージェントの宣言を、heredoc の本文を取り除かずに当てる',
    patch: "m1532-subagent-heredoc-body-not-stripped.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 /code-review 583。本文に git push と書いた普通の git commit が、サブエージェントでは毎回聞かれる。',
  },
  {
    id: 1533,
    label: '{a,b} や ~ を含む pathspec を展開前の文字のまま確かめる',
    patch: "m1533-discard-brace-expansion-checked-literally.patch",
    pkg: "scripts",
    tests: ["lib/discard-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 /code-review 583。git checkout -- {a,b}.ts が 0 件で「変更なし」と読まれ、シェルが展開した a.ts b.ts の未コミットの変更が消える。',
  },
  {
    id: 1534,
    label: 'git rm -f を消さない形として通す',
    patch: "m1534-discard-rm-force-safe.patch",
    pkg: "scripts",
    tests: ["lib/discard-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 /code-review 583。git rm -f が未コミットの変更のあるファイルを聞かずに削除する。',
  },
  {
    id: 1535,
    label: '行頭の配列（- "apps/*"）を packages の節の終わりと読む',
    patch: "m1535-workspace-globs-dash-ends-section.patch",
    pkg: "scripts",
    tests: ["lib/pnpm-filter-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 /code-review 583。packages: の下を行頭に置いた workspace で名前の一覧が root だけになり、実在する --filter まで毎回聞かれる。',
  },
  {
    id: 1536,
    label: '番号つきの箇条書き（1. Fixes #5）を行頭の単独と読まない',
    patch: "m1536-closing-numbered-bullet-is-prose.patch",
    pkg: "scripts",
    tests: ["lib/closing-keywords.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 /code-review 583。PR 本文の 1. Fixes #5 が、意図した閉鎖なのに毎回地の文として知らされる。',
  },
  {
    id: 1537,
    label: "今の側の構造監査に追跡外で ignore されないファイルを写さない（git add 前の新しいファイルを見落とす）",
    patch: "m1537-structure-current-includes-untracked.patch",
    pkg: "scripts",
    tests: ["lib/structure-metrics.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR #583 のレビュー。git add 前の新しいテストによる指標の後退が、check:fast では知らされない（偽の緑）。",
  },
  {
    id: 1538,
    label: '構造監査の比較を検査の開始時でなく最後に始める（直列に延ばす）',
    patch: "m1538-structure-metrics-awaited-serially.patch",
    pkg: "scripts",
    tests: ["local-check.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 /code-review 583。check:fast が構造監査の比較の分（十数秒）だけ毎回延びる。',
  },
  {
    id: 1539,
    label: '未コミットの変更を消す git の候補の語から rm を外す',
    patch: "m1539-discard-words-miss-rm.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 /code-review 583。git rm -f が候補にならず、聞かれずに通る。',
  },
  {
    id: 1440,
    label: "上端の帯の下端を描画後に測り、休憩の最初の描画で覆いの見出しを隠す",
    patch: "m1440-top-band-after-paint.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/use-top-band-height.test.tsx"],
    note: "#574 のレビュー。通常の effect では初回の描画前に --top-band-height が空のままで、320px の長い名前の休憩の知らせが見出しを覆う。",
  },
  {
    id: 1441,
    label: "休憩から再開した最初の表示へ、休憩中の古い時刻を持ち越す",
    patch: "m1441-resumed-tick-stale.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/use-now-tick.test.tsx"],
    note: "#574 のレビュー。秒境界に揃わない休憩で2秒の不正消費が1秒に見え、E2Eの下限を通る。",
  },
  {
    id: 1442,
    label: "休憩中の別コミットで知らせが増えても、描画前に帯の下端を測り直さない",
    patch: "m1442-top-band-separate-notice-stale.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/use-top-band-height.test.tsx"],
    note: "#574 のレビュー。enabledが変わらない知らせの更新ではResizeObserverの通知前に古い余白が残る。",
  },
  {
    id: 1540,
    label: 'path 指定の未コミットの確かめで追跡外のファイルを見ない',
    patch: "m1540-discard-ignores-untracked-same-name.patch",
    pkg: "scripts",
    tests: ["lib/discard-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR #583 のレビュー。git checkout <rev> -- <path> が、同名の追跡外のファイルを聞かずに上書きする。',
  },
  {
    id: 1541,
    label: 'サブエージェントの git branch -D/-m/-f を宣言で聞かない',
    patch: "m1541-subagent-branch-modify-not-guarded.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR #583 のレビュー。宣言が外れても迷う形の受け皿で聞かれるが、理由の文が「読み切れない形」に変わり、どの操作に当たったか（git-branch-modify）が分からなくなる（テストは理由の id を見る）。",
  },
  {
    id: 1542,
    label: 'サブエージェントの gh api の書き込み（-X PUT/DELETE・-f）を宣言で聞かない',
    patch: "m1542-subagent-gh-api-write-not-guarded.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR #583 のレビュー。宣言が外れても迷う形の受け皿で聞かれるが、理由が「読み切れない形」に変わり、どの操作かが分からなくなる（テストは理由の id を見る）。',
  },
  {
    id: 1543,
    label: 'サブエージェントの tmux kill-* を宣言で聞かない',
    patch: "m1543-subagent-tmux-kill-session-not-guarded.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR #583 のレビュー。宣言が外れても受け皿で聞かれるが、理由の id が変わる。kill-window・killp など受け皿の語に無い形は素通りする。',
  },
  {
    id: 1544,
    label: 'OPERATION_WORDS の gh から api・review を外す',
    patch: "m1544-operation-words-miss-gh-api-review.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 自動レビュー。heredoc の中の gh api -X DELETE・gh pr review --approve が文章として隠れ、サブエージェントから通る。',
  },
  {
    id: 1545,
    label: 'gh pr review の許可リストが、a・r を含まない未知の選択肢（-x ほか）を通す',
    patch: "m1545-gh-review-short-bundle-passes.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 自動レビュー。-a=true・--approve=true などの未知の形で承認・変更要求がすり抜ける。',
  },
  {
    id: 1546,
    label: "cat > <パス> <<'TAG' の本文を文章として扱わない",
    patch: "m1546-heredoc-cat-redirect-not-data.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR #583 の再レビュー。レビュー役が報告を heredoc で書くと、本文の git・branch などの語で毎回聞かれる。',
  },
  {
    id: 1547,
    label: '読む・作る形（git branch・fuser・gh pr review の決めない形・gh api GET）を受け皿の前で通さない',
    patch: "m1547-subagent-benign-forms-fall-to-fallback.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR #583 の再レビュー。git branch --show-current や fuser 5173/tcp が、サブエージェントで毎回聞かれる。',
  },
  {
    id: 1548,
    label: 'tmux send-keys の C-c を聞かない',
    patch: "m1548-tmux-send-keys-ctrl-c-not-guarded.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR #583 の再レビュー。利用者の dev サーバーのペインへ Ctrl-C を送って止める。',
  },
  {
    id: 1549,
    label: 'rev の無い checkout/restore でも追跡外のファイルを数える',
    patch: "m1549-discard-counts-untracked-without-rev.patch",
    pkg: "scripts",
    tests: ["lib/discard-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR #583 のコメント・自動レビュー。git checkout -- . ・git restore . が、追跡外のファイルがあるだけで毎回聞かれる。',
  },
  {
    id: 1550,
    label: "gh api graphql を全部聞く判定を外す（query でも mutation でも通る）",
    patch: "m1550-gh-api-graphql-not-asked.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 自動レビュー。gh api graphql が、$'…' や波括弧で mutation を組み立てた形を含めて、聞かれずに通る。",
  },
  {
    id: 1551,
    label: "heredoc の演算子の行が前の行の継続の続きでも本文を取り除く（行末の \ だけを見る）",
    patch: "m1551-heredoc-continuation-ignored.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR #583 の自動レビュー。echo x \ の次の行の cat <<'EOF' の本文を、継続された 1 つのコマンドの heredoc として取り除き、本文の $'…' や操作の名前の判定をすり抜ける。",
  },
  {
    id: 1552,
    label: 'おとなしい形の判定が、先頭の環境変数の代入を読み飛ばす',
    patch: "m1552-benign-skips-env-assignment.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR #583 のコメント・自動レビュー。GIT_SSH_COMMAND=… git branch など、環境変数で別のプログラムを走らせる形が通る。',
  },
  {
    id: 1553,
    label: 'おとなしい形の git branch が、選択肢を見ずに全部通す',
    patch: "m1553-benign-git-branch-any-option.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR #583 のコメント・自動レビュー。git branch -u origin/x・--edit-description が聞かれずに通る。',
  },
  {
    id: 1554,
    label: 'cat の heredoc の本文を、終端の後ろにコマンドが続いても隠す',
    patch: "m1554-cat-heredoc-hides-with-trailing-command.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR #583 の再々レビュー。cat > x.sh <<'EOF' … EOF の後ろの bash x.sh で、書いたスクリプトの中の git push が聞かれずに通る。",
  },
  {
    id: 1555,
    label: 'tmux respawn-pane/-window の -k を聞かない',
    patch: "m1555-tmux-respawn-k-not-guarded.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR #583 の再々レビュー。走っている dev サーバーのペインを、サブエージェントが殺して起動し直す。',
  },
  {
    id: 1556,
    label: 'git branch --format <値> の値を読み飛ばさない',
    patch: "m1556-git-branch-format-value-not-skipped.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR #583 の再々レビュー。git branch --format '%(refname)' が名前の引数と読まれ、毎回聞かれる。",
  },
  {
    id: 1557,
    label: "受け皿の読み直しで、除くものが無いときも語を引用符なしでつなぎ直す（quote の保存をやめる）",
    patch: "m1557-residual-rejoins-quoted-words.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR #583 の再レビュー。grep -E \"kill|pkill\" や git commit -m \"fix: reset; kill\" のように引用符の中に区切り文字がある読むだけのコマンドが、サブエージェントで毎回聞かれる。",
  },
  {
    id: 1558,
    label: "$'…'・$\"…\" を lex が読めない引用として検出しない",
    patch: "m1558-ansi-c-quote-not-detected.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR #583 の自動レビュー。echo $'\\'' ; git push ; echo $'\\'' で lex が git push を引用符の中と読み、サブエージェントの git push が聞かれずに通る。",
  },
  {
    id: 1559,
    label: "読むだけ・記録するだけの許可リストから mkdir を外す",
    patch: "m1559-tame-heads-miss-mkdir.patch",
    pkg: "scripts",
    tests: ["lib/discard-guard.test.mjs", "lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR #583 の再レビュー。mkdir -p … && cat > … << 'EOF' の本文に操作の名前があると、まとめ役もサブエージェントも「形が単純でない」で毎回聞かれる。",
  },
  {
    id: 1560,
    label: "$'・$\" を語の先頭に来るときだけ読めない引用とする（語の途中の echo x$'\'' ; git push がすり抜ける）",
    patch: "m1560-ansi-c-quote-requires-word-start.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs", "lib/discard-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR #583 の自動レビュー。語の途中の $' で lex が git push を引用符の中と読み、サブエージェントの git push が聞かれずに通る。",
  },
  {
    id: 1561,
    label: "$'…' の検出を、データの heredoc の本文を取り除かずに当てる",
    patch: "m1561-ansi-c-quote-not-stripped-of-heredoc-body.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs", "lib/discard-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + '#578 PR #583 の再レビュー。$\'…\' を題に含むコミットメッセージの git commit -m "$(cat <<\'EOF\' …)" が毎回聞かれる。',
  },
  {
    id: 1562,
    label: "$'・$\" の検出の前に、行の継続（\\ と改行）をつながない",
    patch: "m1562-ansi-c-quote-line-continuation-not-joined.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR #583 の自動レビュー。$ と引用符の間に行の継続を挟むと、$'…' の検出をすり抜け、サブエージェントの git push が聞かれずに通る。",
  },
  {
    id: 1563,
    label: "heredoc の演算子の行が行の継続のとき（行末の \\・前の行の継続の続き）も本文を取り除く",
    patch: "m1563-heredoc-strip-ignores-operator-line-continuation.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR #583 の自動レビュー。bash は継続されたコマンドが終わってから本文を始めるので、行の分け方が食い違い、実行される行を「データ」として取り除き、$'…' の検出や操作の名前の判定をすり抜ける。",
  },
  {
    id: 1564,
    label: "二重引用符の中の $'・$\" も読めない引用とする",
    patch: "m1564-ansi-c-quote-flags-inside-double-quotes.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 2026-11-12 の利用者の決定。正規表現の行末の錨（grep \"main$\"・grep -E \"^ M.*x\\\\.mjs$\"）の $ に続く閉じる引用符で、サブエージェントの日常の読む形が聞かれる。",
  },
  {
    id: 1565,
    label: "引用の状態をたどるとき、語の頭の # からのコメントを読み飛ばさない",
    patch: "m1565-ansi-c-quote-comment-not-skipped.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 2026-11-12 の利用者の決定の直し。コメントの中の ' で状態がずれ、続く $'…' ; git push がすり抜ける。",
  },
  {
    id: 1566,
    label: "引用の状態をたどる前に、行の継続（\\ と改行）を先につなぐ",
    patch: "m1566-ansi-c-quote-continuation-joined-before-tracking.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR #583 の自動レビュー（HIGH）。bash はコメントの末尾の \\ を継続にしないのに、先につなぐと # x\\ の次の行がコメントに飲まれ、続く $'…' ; git push がすり抜ける。",
  },
  {
    id: 1567,
    label: "引用の状態をたどるとき、行の継続（\\ と改行）を語の切れ目にする",
    patch: "m1567-ansi-c-quote-continuation-breaks-word.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR #583 の自動レビュー（HIGH）。bash は echo a\\<改行>#… を語の途中として読むのに、コメントと読んで次の $'…' ; git push を見落とす。",
  },
  {
    id: 1568,
    label: "CR を含む文字列でも、引用の状態をたどる（読めない側へ倒さない）",
    patch: "m1568-ansi-c-quote-cr-not-fail-closed.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR #583 の自動レビュー（HIGH）。\\<CR> の扱いで継続とコメントの境が bash と食い違い、続く $'…' ; git push がすり抜ける。",
  },
  {
    id: 1569,
    label: "置換 $( … ) の閉じを語の切れ目にする",
    patch: "m1569-ansi-c-quote-substitution-close-breaks-word.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1500_1569 + " " + "#578 PR #583 の自動レビュー（HIGH）。echo $(true)#$'…' の # をコメントと読み、続く $'…' ; git push を見落とす。",
  },
  {
    id: 1570,
    label: "バッククォートの中の \\ でも、引用の状態をたどる",
    patch: "m1570-ansi-c-quote-backslash-in-backtick-tracked.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1570_1579 + " " + "#578 bash との差分テストの型 A。bash はバッククォートの中で先に \\$ を $ に戻すので、守られる 1 字の規則と食い違い、$'…' を見落とす。",
  },
  {
    id: 1571,
    label: "置換・バッククォートと case が同じ文字列にあっても、引用の状態をたどる",
    patch: "m1571-ansi-c-quote-case-in-substitution-tracked.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1570_1579 + " " + "#578 bash との差分テストの型 B。case のパターンの ) を置換の閉じと取り違え、続く $'…' を二重引用符の中と読む。",
  },
  {
    id: 1572,
    label: "バッククォートの中の # も、語の頭なら改行までのコメントとして読み飛ばす",
    patch: "m1572-ansi-c-quote-comment-in-backtick-tracked.patch",
    pkg: "scripts",
    tests: ["lib/agent-guard.test.mjs"],
    note: RESERVED_1570_1579 + " " + "#578 bash との差分テストの型 C と PR #583 の再レビュー 8 回目。バッククォートの中のコメントは閉じのバッククォートで終わり、開いた直後の `#'` もコメント。読み違えると内外が反転し、$'…' ; git push がすり抜ける。",
  },
  {
    id: 1480,
    label: "Codex の入口が、本番デプロイに deny でなく ask を返す",
    patch: "m1480-codex-guard-asks-instead-of-denies.patch",
    pkg: "scripts",
    tests: ["codex-guard-hook.test.mjs"],
    note: RESERVED_1480_1499 + " " + "#578 PR 3。Codex は ask を扱わず、コマンドがそのまま走る（実測）。止まる出力は deny だけ。",
  },
  {
    id: 1481,
    label: "Codex の入口が、判定の失敗を握りつぶして何も出さない（通す）",
    patch: "m1481-codex-guard-swallows-decide-failure.patch",
    pkg: "scripts",
    tests: ["codex-guard-hook.test.mjs"],
    note: RESERVED_1480_1499 + " " + "#578 PR 3。判定が想定外に投げたとき、歯止めが黙って外れる（fail-open）。",
  },
  {
    id: 1482,
    label: "audit-codex-guard が hooks.json を期待の形と比べず、PreToolUse があれば通す",
    patch: "m1482-audit-codex-guard-ignores-command.patch",
    pkg: "scripts",
    tests: ["audit-codex-guard.test.mjs"],
    note: RESERVED_1480_1499 + " " + "#578 PR 3。Claude Code の入口（ask を返す）を配線しても CI が緑のまま、Codex では止まらない。",
  },
  {
    id: 1483,
    label: "Codex のフックのコマンドから、起動の失敗を deny に倒す || の後ろを外す",
    patch: "m1483-codex-hooks-launch-failure-allows.patch",
    pkg: "scripts",
    tests: ["audit-codex-guard.test.mjs"],
    note: RESERVED_1480_1499 + " " + "#578 PR 3。入口を起動できないとき Codex はコマンドを走らせる。包みが無いと歯止めが黙って外れる（自動のセキュリティレビューの指摘）。",
  },
  {
    id: 1484,
    label: "audit-agent-entries が、入れ子の階層の .agents/skills を候補にしない（直下だけ）",
    patch: "m1484-entries-nested-agents-skills-ignored.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: RESERVED_1480_1499 + " " + "#578 PR 3。Codex は cwd から Git のルートまでの各階層の .agents/skills を規則として読むのに、サブディレクトリへ置かれても検査が見逃す。",
  },
  {
    id: 1485,
    label: "Codex の入口が、読めない入力を deny でなく通す",
    patch: "m1485-codex-guard-unreadable-input-passes.patch",
    pkg: "scripts",
    tests: ["codex-guard-hook.test.mjs"],
    note: RESERVED_1480_1499 + " " + "#578 PR 3。入力の形が変わったとき、歯止めが黙って外れる（fail-open）。",
  },
  {
    id: 1486,
    label: "audit-agent-entries が、入れ子の階層の .codex/ を候補にしない",
    patch: "m1486-entries-nested-codex-dir-ignored.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: RESERVED_1480_1499 + " " + "#578 PR 3。入れ子の .codex/config.toml（developer_instructions・hooks の無効化）が検査を素通りする（レビュー I3）。",
  },
  {
    id: 1487,
    label: "audit-codex-guard が hooks.json を文字列でなく構造（JSON.parse 後）で比べ、キーの重複を通す",
    patch: "m1487-audit-codex-guard-ignores-extra-keys.patch",
    pkg: "scripts",
    tests: ["audit-codex-guard.test.mjs"],
    note: RESERVED_1480_1499 + " " + "#578 PR 3。キーが重複したファイルで Codex が先のキーを採ると、歯止めが無いまま CI が緑になる（#584 の 2 回目のレビュー 4）。",
  },
  {
    id: 1488,
    label: "Codex のフックのコマンドを、入口の出力を受けずに node … || printf の形へ戻す（node が書いた後に落ちると JSON が 2 つ連なる）",
    patch: "m1488-codex-hooks-double-json-wrapper.patch",
    pkg: "scripts",
    tests: ["codex-guard-hook.test.mjs"],
    note: RESERVED_1480_1499 + " " + "#578 PR 3。#584 のレビュー。JSON が 2 つ連なると Codex は失敗とみなしてコマンドを通す。",
  },
  {
    id: 1489,
    label: "Codex の入口が、command が文字列でないとき deny でなく通す",
    patch: "m1489-codex-guard-passes-when-command-missing.patch",
    pkg: "scripts",
    tests: ["codex-guard-hook.test.mjs"],
    note: RESERVED_1480_1499 + " " + "#578 PR 3。#584 のレビュー。入力の形が変わったとき歯止めが黙って外れる（fail-open）。",
  },
  {
    id: 1490,
    label: "audit-agent-entries の列挙のパターンから .agents/skills/ の 2 行（直下・入れ子）を消す",
    patch: "m1490-entries-agents-skills-patterns-dropped.patch",
    pkg: "scripts",
    tests: ["audit-agent-entries.test.mjs"],
    note: RESERVED_1480_1499 + " " + "#584 の 2 回目のレビュー 2。.md 以外のファイル（run.sh・openai.yaml）が列挙から漏れ、入口の検査を素通りする。",
  },
  {
    id: 1491,
    label: "Codex のフックのコマンドから、入口の無い版では何も出さず終わる分岐を外す",
    patch: "m1491-codex-hooks-no-entry-denies.patch",
    pkg: "scripts",
    tests: ["codex-guard-hook.test.mjs"],
    note: RESERVED_1480_1499 + " " + "#584 の 2 回目のレビュー 1。歯止めの無い古い版・bisect で ls・git switch - まで deny になり、Codex 自身では戻れない。",
  },
  {
    id: 1492,
    label: "Codex のフックのコマンドから、Git のルートが引けないときの deny を外す",
    patch: "m1492-codex-hooks-root-failure-allows.patch",
    pkg: "scripts",
    tests: ["codex-guard-hook.test.mjs"],
    note: RESERVED_1480_1499 + " " + "#584 の再レビュー 4。どのリポジトリにも属さない場所で、歯止めが無いまま Bash が通る（① が外れても気づけない）。",
  },
  {
    id: 1493,
    label: "Codex のフックのコマンドで、.codex/hooks.json の有無を見ずに、入口が無ければ何も出さず通す",
    patch: "m1493-codex-hooks-entry-missing-allows.patch",
    pkg: "scripts",
    tests: ["codex-guard-hook.test.mjs"],
    note: RESERVED_1480_1499 + " " + "#584 の再レビュー（3 回目のコメント）1。いまの版で入口だけが欠けた（git mv・作業ツリーから消した・ディレクトリや壊れた symlink）とき、本番デプロイが黙って通る（fail open）。",
  },
  {
    id: 1494,
    label: "audit-codex-guard の main が、必須ファイルが作業ツリーに在るかを見ない（常に在るとみなす）",
    patch: "m1494-audit-codex-guard-ignores-worktree.patch",
    pkg: "scripts",
    tests: ["wiring-audit-codex-guard.test.mjs"],
    note: RESERVED_1480_1499 + " " + "#584 の再レビュー 2 回目の 1。入口を作業ツリーから消しても検査が緑のまま（純粋関数のテストだけでは main の配線を覆えない）。",
  },
  {
    id: 1495,
    label: "Codex のフックのコマンドで、.codex/hooks.json が壊れた symlink のときの分岐（[ -L ]）を外す",
    patch: "m1495-codex-hooks-broken-symlink-hooks-allows.patch",
    pkg: "scripts",
    tests: ["codex-guard-hook.test.mjs"],
    note: RESERVED_1480_1499 + " " + "#584 の再レビュー 2 回目の 2。hooks.json が壊れた symlink で入口も無いとき、本番デプロイが通る。",
  },
  {
    id: 1600,
    label: "isKnownToolId が常に true を返す（?tool= の許可リストが消える）",
    patch: "m1600-is-known-tool-id-always-true.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/ws/connection-gate.test.ts"],
    note: RESERVED_1600_1619 + " " + "#590。許可リストに無い宣言（?tool=hub・?tool=Timer）が unknown にならず、「繋がるのにコマンドが通らない」静かな壊れ方になる。",
  },
  {
    id: 1601,
    label: "TOOL_IDS から TOOL_CHECKIN を落とす",
    patch: "m1601-tool-ids-drops-checkin.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/ws/connection-gate.test.ts"],
    note: RESERVED_1600_1619 + " " + "#590。一覧から導く許可リストが checkin を知らなくなり、チェックインの接続が unknown に落ちて拒否される。",
  },
  {
    id: 1602,
    label: "isKnownToolId を前方一致（startsWith）にする",
    patch: "m1602-is-known-tool-id-prefix-match.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/ws/connection-gate.test.ts"],
    note: RESERVED_1600_1619 + " " + "#590 の敵対的レビュー（記録 4）。綴りの末尾に余計な字がついた宣言（?tool=timerx）が unknown にならずに通る。述語にした今は 1 行で開く穴。",
  },
  {
    id: 1640,
    label: "focus の顔が割の数でなく札の ID をそのまま出す",
    patch: "m1640-focus-numeral-shows-card-id.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/card-face.test.tsx"],
    note: RESERVED_1640_1659 + " " + "#593。表の値に持たせた focus の特例（20…100 を 2・5・8・10 に割る）が落ち、数字の札が 20・50・80・100 と出る。",
  },
  {
    id: 1641,
    label: "ROTI の顔が数字でなく絵になる（数のやり方の正本 CARD_FACES の kind がずれる）",
    patch: "m1641-roti-face-not-numeral.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/card-face.test.tsx", "tests/reveal-view.test.ts"],
    note: RESERVED_1640_1659 + " " + "#593。NUMERIC_METHODS を顔の表から導くので、顔が絵に変わると開いた後の要約の言い方も変わる。顔と要約のずれを突く。",
  },
];
