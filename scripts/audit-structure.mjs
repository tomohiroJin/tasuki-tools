#!/usr/bin/env node
/**
 * コードベース構造の走査スクリプト（Issue #28 G0）
 *
 * spec.md の「操作的定義（何を数えるか）」表を実装する。表が正本であり、本スクリプトはその実装にすぎない。
 * 各 SC 番号に 1 対 1 対応する関数を持つ（実装がズレたときに気づけるように）。
 *
 * 設計方針（T002 のテスト容易性のため）:
 * - 各 sc0XX 関数は「解析対象の文字列 / Map」を引数に取る**純粋関数**にする。
 *   実ファイルシステムを読むのは main() 内の薄い配線部分のみ。
 * - これにより単体テストは実リポジトリを一切スキャンしない（遅く壊れやすいテストを避ける）。
 *
 * **各 sc0XX 関数（判定）は `scripts/lib/structure/` にある**（#361 で移した）。このファイルが持つのは
 * 走査の宣言・宣言と実体の照合・組み立て（`runAudit` / `main`）だけである。宣言をここに残すのは、
 * `scan-target-wiring.test.mjs` がこのファイルの複製を書き換えて宣言を壊す検証を届かせるため。
 *
 * 追加依存は禁止のため、Node 標準の fs / path のみを使う。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listWorkspacePackages,
  diffTargets,
  hasTargetDrift,
  formatTargetDiff,
  findEmptyScanDimensions,
  findMissingPaths,
} from "./lib/scan-targets.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";
import {
  computeReachableFiles,
  sc027UnreachableModules,
} from "./lib/structure/reachability.mjs";
import {
  SPEC_ID_RE,
  extractTestNames,
  hasGwtMarkers,
  sc028DuplicateTestDoubles,
  sc029SpecIdsInNames,
  sc030CallNamesInNames,
  sc031GuardExpects,
  sc032GwtMarkers,
  sc036TestCount,
  splitIntoTestBodies,
  testNameOfBody,
} from "./lib/structure/test-conventions.mjs";
import {
  sc035MessageDefinitions,
} from "./lib/structure/message-definitions.mjs";
import {
  SC039A_SCOPE,
  extractPublicDeclarations,
  isReferencedElsewhere,
  sc039UnreachableElements,
} from "./lib/structure/unreachable-elements.mjs";

/* ============================================================
 * 汎用ユーティリティ（実ファイル I/O。テスト対象は Map 側の純粋関数）
 * ============================================================ */

/**
 * ディレクトリ配下の対象拡張子ファイルを再帰的に読み、
 * { "ルートからの相対パス(posix区切り)": "内容" } の Map を返す。
 * 存在しないディレクトリは空 Map を返す。
 */
export function readFilesRecursive(rootDir, extensions) {
  const result = new Map();
  if (!fs.existsSync(rootDir)) return result;

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".d.ts")) {
        // 環境宣言ファイル（vite-env.d.ts 等）は import/export で到達させる対象ではないため除外する。
        continue;
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        const rel = path.relative(rootDir, full).split(path.sep).join("/");
        result.set(rel, fs.readFileSync(full, "utf8"));
      }
    }
  };
  walk(rootDir);
  return result;
}

/* ============================================================
 * 実リポジトリへの配線（main）
 * ============================================================ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const EXT_TS = [".ts", ".tsx"];

/**
 * 走査するパッケージ。**src と test は独立に宣言する。**
 *
 * テストディレクトリ名は `test` と `tests` で割れている（実測）。規則で導出すると
 * 必ずどちらかを取りこぼすため、宣言して実体と照合する（#135 経路②⑪・ADR-0014）。
 * `entry` は SC-027 の到達性測定の起点。持たないパッケージは null。サブパスの入口を
 * 複数持つパッケージ（`package.json` の `exports`）は、非空の文字列の配列で宣言する（#371）。
 * 読む側は {@link entriesOf} で一覧を引く。
 */
export const SCANNED_PACKAGES = [
  { pkg: "packages/timer-core", src: "src", test: "test", entry: "index.ts" },
  { pkg: "packages/poker-core", src: "src", test: "tests", entry: "index.ts" },
  { pkg: "packages/protocol", src: "src", test: "tests", entry: "index.ts" },
  { pkg: "packages/room-core", src: "src", test: "tests", entry: "index.ts" },
  // お題の文脈（#91）。timer・poker と同格の 4 つ目の境界づけられた文脈。
  { pkg: "packages/topic-core", src: "src", test: "tests", entry: "index.ts" },
  // ルーレットの文脈（#94）。5 つ目の境界づけられた文脈。
  { pkg: "packages/roulette-core", src: "src", test: "tests", entry: "index.ts" },
  // 進行タイマーの文脈（#429）。6 つ目の境界づけられた文脈。
  { pkg: "packages/agenda-core", src: "src", test: "tests", entry: "index.ts" },
  { pkg: "packages/checkin-core", src: "src", test: "tests", entry: "index.ts" },
  { pkg: "packages/rate-limit", src: "src", test: "tests", entry: "index.ts" },
  // #95 S5a で新設（同期クライアントの接続部分・D18）。
  { pkg: "packages/sync-client", src: "src", test: "tests", entry: "index.ts" },
  { pkg: "packages/invite-ui", src: "src", test: "tests", entry: "index.ts" },
  // #369 で新設（web の同期フックが共有する React の部品）。入口は `./sync` と、#371 の `./reader`（読む面の部品）。
  { pkg: "packages/web-kit", src: "src", test: "tests", entry: ["sync/index.ts", "reader/index.ts"] },
  // #91 PR 3: Markdown サブセットの解析(純粋な関数)を timer-web/topic-web から出す。
  { pkg: "packages/markdown", src: "src", test: "tests", entry: "index.ts" },
  // #95 S5c 追補で新設（dev サーバー専用の Vite プラグインと玄関のポートの正本）。
  { pkg: "packages/dev-hub-redirect", src: "src", test: "tests", entry: "index.ts" },
  // #95 S2 で apps/timer-sync と apps/poker-sync がここへ統合された（1 パッケージ）。
  { pkg: "apps/tasuki-sync", src: "src", test: "test", entry: "server.ts" },
  { pkg: "apps/timer-web", src: "src", test: "test", entry: "main.tsx" },
  { pkg: "apps/poker-web", src: "src", test: "tests", entry: "main.tsx" },
  { pkg: "apps/landing", src: "src", test: "tests", entry: "main.tsx" },
  // #91 PR 2 で新設（お題ツール）。
  { pkg: "apps/topic-web", src: "src", test: "tests", entry: "main.tsx" },
  // #94 PR 2 で新設（ルーレット）。
  { pkg: "apps/roulette-web", src: "src", test: "tests", entry: "main.tsx" },
  // #429 で新設（進行タイマー）。
  { pkg: "apps/agenda-web", src: "src", test: "tests", entry: "main.tsx" },
  { pkg: "e2e", src: null, test: "tests", entry: null },
];

/** 走査から外すパッケージ。**理由が要る。** */
export const EXCLUDED_PACKAGES = [
  { pkg: "packages/ui", reason: "src・tests とも TS を 1 つも持たない（CSS トークンとフォント）" },
];

/**
 * SC-039③ の例外。**検査の土台になっている公開記号だけ**を、理由つきで載せる。
 *
 * FR-090 は「テストからの参照は生存の根拠に含めない」と定めており、原則はそのとおりでよい。
 * ただし、その記号を失うと**検査そのものが弱くなる**ものが実在する。それらは公開を残し、
 * ここへ理由つきで挙げる。理由を書けないものは例外にしない。
 *
 * **「まだ決めていない」は理由ではない**（#180）。走査を `packages/` 全体へ広げたとき、
 * 新たに 16 件が検出され、**うち 3 件をここへ載せ、残り 13 件は未決のまま見えた状態で残した**
 * （ADR-0014「広げた結果」）。判断を待つあいだ例外表へ入れると指標が 0 に戻って
 * **読むべき信号を消してしまう**ためである。測定値は落ちない
 * （ADR-0009 D2。実測で `audit-structure.mjs` は exit 0）。
 * #135 が走査を広げた結果 SC-031 が未達へ変わったときと同じ扱いである（ADR-0014「影響」）。
 *
 * **その未決は #223 で解いた（2026-09-02）。** ただし解いた時点の集合は上の 13 件とは違う ——
 * その後の変更で増減し、**着手時は 16 件だった**（数が同じなのは偶然で、同じ集合ではない）。
 * 内訳は 2 つに割れた。
 *
 * - **型 11 件**は、すべて `index.ts` に載っている公開契約の型だった。
 *   ③はこれを判定できないので、**型を数えるのをやめた**
 *   （{@link sc039cSelfOnlyPublicSymbols} の docstring）。
 * - **値 5 件**は、2 件が誰にも使われておらず宣言の `export` を落とし、
 *   1 件は公開入口への 1 行の委譲でしかなかったので削除し、残る 2 件を上へ載せた。
 *
 * ③と④は独立している。③が測るのは**宣言ファイルの `export` の要否**、
 * ④は**公開面（`index.ts`）に載せる理由の有無**である。
 * 実測: `computeStats` は `snapshot.ts` が相対 import で使うので③では生きており、
 * index 経由の利用者はゼロなので④では死んでいた。さらに {@link stripNamedReexports} が
 * index の再エクスポートを参照から外すため、**index から落としても③の件数は動かない**。
 *
 * **例外表は両方向に腐る。** 記号が消えたのに例外が残れば同名の別記号を静かに覆い、
 * 記号が製品から使われ始めれば例外そのものが不要になる。
 * どちらも {@link findStaleSymbolExceptions} が落とす。
 */
export const SC039C_EXCEPTIONS = [
  {
    file: "packages/poker-core/src/protocol.ts",
    name: "ERROR_CODES",
    reason:
      "エラーコードの権威列挙。packages/poker-core/tests/protocol.test.ts が it.each([...ERROR_CODES]) で全コードについて isKnownErrorCode の判定を回す起点にしている。落とすとコード表がテストへ複製され、列挙の追加・削除を検知する検査が写しを検査するだけになる（SYNC_ERROR_CODES と同型）",
  },
  {
    file: "packages/poker-core/src/round.ts",
    name: "shouldAutoReveal",
    reason:
      "自動公開の述語そのものを検証する唯一の土台。packages/poker-core/tests/round.test.ts が「全員が投票したか」の判定を直接検査している（#95 S4a で room.test.ts は消え、名簿の側は packages/room-core が引き取った）。公開入口の applyAutoReveal は述語と適用を一度に行うため、経由すると『判定が偽なのに公開された』と『判定は真だが適用が壊れた』を切り分けられない。**空の名簿で恒真化しないこと**を殺す 1 本（『在室者が 0 人なら自動公開しない』）も、この記号を直に呼べることに依存している",
  },
  {
    file: "packages/timer-core/src/errors.ts",
    name: "SYNC_ERROR_CODES",
    reason:
      "apps/tasuki-sync/test/error-code-coverage.test.ts がソースと双方向に照合済みの権威列挙として起点にしている（PR #34 のレビューで塞いだ穴の土台）",
  },
  {
    file: "packages/timer-core/src/schemas.ts",
    name: "RoomSchema",
    reason:
      "サーバーが組む snapshot.room が wire の契約を満たすことの錨。apps/tasuki-sync/test/timer-snapshot-dto.test.ts が組み立てた room をこのスキーマに直接通し、packages/timer-core/test/schemas.test.ts が旧いサーバーの snapshot（落とした項目を載せた形）が通ることを固定している。公開入口の ServerMsgSchema は snapshot フレームの外枠ごと検査するので、room 単体の契約を切り分けられない（#91 PR 3 で旧い理由の ai-unlock.test.ts は消えた）",
  },
  {
    file: "packages/timer-core/src/error-messages.ts",
    name: "DEFAULT_ERROR_MESSAGE",
    reason: "既定文言の正本。落とすと 3 ファイルへ文言リテラルが複製される",
  },
  {
    file: "packages/rate-limit/src/client-key.ts",
    name: "normalizeClientAddress",
    reason:
      "packages/rate-limit/tests/client-key.test.ts が IP 正規化そのものを直接検証している唯一の土台。index.ts は ADR-0012 D3 により意図的にこの記号を公開しておらず（生の IP を外へ出さない）、公開 API 経由では HMAC 済みの不透明な文字列しか観測できないため、/64 丸め・IPv4-mapped の畳み込みという安全上の不変条件を書けなくなる",
  },
  {
    file: "packages/rate-limit/src/token-bucket.ts",
    name: "DEFAULT_SWEEP_THRESHOLD",
    reason:
      "掃除の既定しきい値の正本（#103 設計正本 D4）。落とすと packages/rate-limit/tests/token-bucket.test.ts へ 1_000 という数値リテラルが複製され、値の変更を検知する検査が値の写しを検査するだけになる（DEFAULT_ERROR_MESSAGE と同型）",
  },
  {
    file: "packages/rate-limit/src/token-bucket.ts",
    name: "MAX_SWEEP_THRESHOLD",
    reason:
      "掃除しきい値の上限の正本（#103 設計正本 D4）。createTokenBucketLimiter の入力検証と例外文言が参照しており、テストは境界値（上限ちょうど・上限＋1）をこの記号から作る。落とすと 1_000_000 が検査側へ複製される",
  },
  {
    file: "packages/topic-core/src/schemas.ts",
    name: "TopicSchema",
    reason:
      "型のテスト（packages/topic-core/tests/wire-types.test.ts・#363）の土台。手書きの型 Topic とスキーマの出力が双方向に等しいことを型検査で見ている。落とすとスキーマ側の型を取れず、片側だけを変えたときに型検査が落ちなくなる。公開面（index.ts）からは #365 で外した",
  },
  {
    file: "packages/topic-core/src/schemas.ts",
    name: "TopicStateSchema",
    reason:
      "TopicSchema と同じ（手書きの型 TopicState とスキーマの出力の一致を見る型のテストの土台）。公開面（index.ts）からは #365 で外した",
  },
  {
    file: "packages/topic-core/src/schemas.ts",
    name: "TOPIC_ERROR_CODES",
    reason:
      "エラーコードの権威列挙。apps/topic-web/tests/copy-fits-font-base.test.ts（文言が書体に収まるか）と packages/topic-core/tests/error-messages.test.ts（文言表の網羅）が全コードを回す起点にしている。落とすとコード表がテストへ複製され、列挙の追加を検知できなくなる（ERROR_CODES・SYNC_ERROR_CODES と同型）",
  },
];

/**
 * 例外表が腐っていないかを見る（純粋）。問題が無ければ空配列。
 *
 * ## 何を見るか
 *
 * 例外 1 件ごとに、次の 3 つの向きで落とす。
 *
 *   1. 例外が指すファイルに その記号の公開宣言が無い（記号が消えた／改名された）。
 *      ファイルごと走査対象に無い場合も同じ向きの腐りとして落とす。
 *   2. 例外の記号が製品コードから参照されている（例外がもう要らない）
 *   3. 理由が空（{@link EXCLUDED_PACKAGES} と同じ作法。理由の書けない例外は置かない）
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **理由の内容が本当かは見ていない。** 空文字列でないことしか見ないので、
 *   でたらめな理由を書けば通る。理由はレビューが読むためのものである。
 * - **例外に挙げるべき記号が挙がっているかは見ていない。** これは
 *   「挙げた例外が腐っていないか」だけを見る片方向の検査であり、
 *   指標そのもの（{@link sc039cSelfOnlyPublicSymbols} が数える件数）が
 *   もう片方向を受け持つ。
 * - **参照の判定は `isReferencedElsewhere` と同じ精度しか持たない。**
 *   文字列リテラルとコメントを除いた素の `\bNAME\b` 照合なので、
 *   同名の別記号（別ファイルのローカル変数など）に当たれば「参照されている」に倒れる。
 *   その向きは例外が余計に消される側＝安全側である。
 * - **記号の宣言は `extractPublicDeclarations` が拾える書き方に限られる。**
 *   `export { X }` のような後置きの公開は拾えない（拾えなければ 1. で落ちる＝安全側）。
 *
 * @param exceptions 例外表（`{ file, name, reason }` の配列）
 * @param packageSrcFiles `Map<リポジトリ相対パス, ソース>`。SC-039③ が数える走査対象そのもの
 * @param productSources `Map<リポジトリ相対パス, ソース>`。参照元となる製品コード（テストを含めない）
 */
export function findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources) {
  const problems = [];
  for (const e of exceptions) {
    if (typeof e.reason !== "string" || e.reason.trim() === "") {
      problems.push(`SC-039③ の例外に理由がありません: ${e.file} ${e.name}`);
    }
    const content = packageSrcFiles.get(e.file);
    if (content === undefined) {
      problems.push(
        `SC-039③ の例外が指すファイルが走査対象にありません: ${e.file}（例外を消すか、走査対象を直してください）`,
      );
      continue;
    }
    const declared = extractPublicDeclarations(content).filter((d) => d.name === e.name);
    if (declared.length === 0) {
      problems.push(
        `SC-039③ の例外が指す公開宣言がありません: ${e.file} の ${e.name}（記号が消えたなら例外も消してください）`,
      );
      continue;
    }
    // **型だけの例外は何も落とさない。** ③は型を数えないので（#223）、載せても
    // 恒久的に不活性な項目が増えるだけである。散文で「値だけを載せる」と書くのでは
    // 腐りを止められないので、ここで機構として落とす。
    //
    // **同名の値があるなら通す。** 値が消えて同名の型だけが残った場合は落ちるので、
    // 後から値が復活したときに例外が本物の検出を静かに握り潰す経路も塞がる。
    if (declared.every((d) => d.kind === "interface" || d.kind === "type")) {
      problems.push(
        `SC-039③ の例外に型が載っています: ${e.file} の ${e.name}（③は型を数えないので、この例外は何も落としません。消してください）`,
      );
      continue;
    }
    if (isReferencedElsewhere(e.name, e.file, productSources)) {
      problems.push(
        `SC-039③ の例外が不要になりました: ${e.file} の ${e.name} は製品コードから参照されています`,
      );
    }
  }
  return problems;
}

/**
 * SC-029（FR-093）の例外。**テスト名に仕様の識別番号を含めてよいファイルだけ**を、理由つきで載せる。
 *
 * ADR-0006 決定 5（#168 で timer 限定の規約から全体規範へ昇格）は、仕様の識別番号を
 * テスト名ではなく `describe` 直上の JSDoc `@requirements` へ置くと定めている。
 * 名前へ書かざるを得ないファイル（組み合わせを名前で網羅する差分テスト等）は、
 * ここへ理由つきで挙げる。理由を書けないものは例外にしない。
 *
 * **除外は分母から行う。**「この規約の対象ではない」という意味であり、
 * 「満たしたことにする」のではない（SC-032 の例外表と同じ作法）。
 *
 * **例外表は両方向に腐る。** ファイルが消えたのに例外が残れば静かに空回りし、
 * 名前から識別番号が消えても例外だけが残る。どちらも
 * {@link findStaleSc029Exceptions} が落とす。
 *
 * **現在は 0 件。** timer 時代の唯一のエントリ
 * `packages/timer-core/test/permissions-differential.test.ts` は、そのテスト名から
 * 識別番号が既に消えており（`` `${label} → オラクルと一致する` `` /
 * `"対象コマンドは25件である"` など）、例外表から外しても SC-029 は 0 のままだった
 * （#184 で実測）。何も外していない例外だったので外した。
 */
export const SC029_EXCEPTIONS = [];

/**
 * SC-029 の例外表が腐っていないかを見る（純粋）。問題が無ければ空配列。
 *
 * ## 何を見るか
 *
 * 例外 1 件ごとに、次の 3 つの向きで落とす。**それぞれ違う文言で報告する。**
 *
 *   1. 例外が指すファイルが走査対象に無い（改名・移設・削除）
 *   2. そのファイルのテスト名に仕様の識別番号が 1 つも無い（例外がもう要らない）
 *   3. 理由が空（{@link EXCLUDED_PACKAGES} と同じ作法。理由の書けない例外は置かない）
 *
 * **2 は SC-032 の「分母に入らなくなった」とは違う。** {@link findStaleTestExceptions} が
 * その向きで落とさないのは、生死が理由と無関係な行数のしきい値に連動してしまうためである。
 * SC-029 の例外が外す条件（そのファイルの名前に識別番号があるか）は、例外の理由
 * そのものなので、条件が消えた例外は端的に空回りである。
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **理由の内容が本当かは見ていない。** 空文字列でないことしか見ない。
 * - **例外に挙げるべきファイルが挙がっているかは見ていない。** もう片方向は
 *   指標そのもの（{@link sc029SpecIdsInNames} の件数）が受け持つ。
 * - **識別番号の判定は {@link SPEC_ID_RE} と同じ精度しか持たない。**
 *
 * @param exceptions 例外表（`{ file, reason }` の配列）
 * @param testFiles `Map<リポジトリ相対パス, ソース>`。SC-029 が測る走査対象そのもの
 */
export function findStaleSc029Exceptions(exceptions, testFiles) {
  const problems = [];
  for (const e of exceptions) {
    if (typeof e.reason !== "string" || e.reason.trim() === "") {
      problems.push(`SC-029 の例外に理由がありません: ${e.file}`);
    }
    const content = testFiles.get(e.file);
    if (content === undefined) {
      problems.push(
        `SC-029 の例外が指すファイルが走査対象にありません: ${e.file}（例外を消すか、走査対象を直してください）`,
      );
      continue;
    }
    if (!extractTestNames(content).some((name) => SPEC_ID_RE.test(name))) {
      problems.push(
        `SC-029 の例外が不要になりました: ${e.file} のテスト名に仕様の識別番号はもうありません（例外を消してください）`,
      );
    }
  }
  return problems;
}

/**
 * SC-032 の例外。**前提・操作・検証の区切りが概念的に当てはまらないテストだけ**を、理由つきで載せる。
 *
 * ADR-0006 決定 2 は「本体が 2 行以下の自明なテストは対象外」と定めている。その意図は
 * 「区切っても読み手の役に立たないテストには求めない」ことである。ところが分母の判定は
 * **物理行**を数えるため、**1 つの式が複数行にまたがるだけ**で 3 行以上と見なされる。
 * その結果、操作が一つも無いテストが対象に入りうる。
 *
 * 判定を「文数え」へ変える案は #168 の敵対的検証で却下した（`it.each` の 41 件中 35 件が
 * 対象外に落ち、区切り済みの 34 行のテストまで分母から消えるため）。**尺度は変えず、
 * 当てはまらないものを名指しで挙げる。**
 *
 * 散文での前例もある（`apps/tasuki-sync/test/error-code-coverage.test.ts` が
 * 「メタテストであり、前提・操作・検証という区切りが通常の意味では当てはまらない」と明記）。
 *
 * **除外は分母から行う。**「この規約の対象ではない」という意味であり、
 * 分子に足して「満たしたことにする」のではない。
 *
 * **例外表は両方向に腐る。**{@link findStaleTestExceptions} が落とす。
 */
export const SC032_EXCEPTIONS = [
  {
    file: "packages/poker-core/tests/deck.test.ts",
    testName: "フィボナッチ10種を順序どおりに含む（0,1,2,3,5,8,13,21,?,☕）",
    reason:
      "import 済みのモジュール定数の形を expect で直接見るだけで、テスト本体の中に操作と呼べる処理が無い。// When を足すと操作を指すふりの飾りになる（#168 で実装者とレビュアが独立に同じ結論）",
  },
];

/**
 * SC-032 の例外表が腐っていないかを見る（純粋）。問題が無ければ空配列。
 *
 * ## 何を見るか
 *
 * 例外 1 件ごとに、次の 4 つの向きで落とす。**それぞれ違う文言で報告する**
 * （赤を見たときに、どの向きで腐ったのかが取り違えなく分かるように）。
 *
 *   1. 例外が指すファイルが走査対象に無い（改名・移設・削除）
 *   2. 例外が指すテスト名がそのファイルに無い（改名・削除）
 *   3. そのテストが区切りを持つようになった（例外がもう要らない）
 *   4. 理由が空（{@link EXCLUDED_PACKAGES} と同じ作法。理由の書けない例外は置かない）
 *
 * **「分母に入らなくなった」は落とさない。** 本体が縮んで
 * {@link countMeaningfulBodyLines} が 3 未満になったテストは、例外が無くても
 * SC-032 の分母に入らない。その状態の例外は何も外していない＝空回りだが、赤にはしない。
 *
 * 落とす向きへ倒すと、例外の生死が**行数のしきい値**に連動する。このしきい値は
 * 例外の理由（「テスト本体の中に操作と呼べる処理が無い」）とは無関係な尺度なので、
 * 主張が何も変わらないまま意味のある行が 1 行増減しただけで、例外が「要らない」と
 * 「要る」を往復し、そのたびに検査が赤くなって例外表の削除と再追加を強いる。
 * 空回りしたまま残る側の害は、表に 1 行残ることだけである。
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **理由の内容が本当かは見ていない。** 空文字列でないことしか見ないので、
 *   でたらめな理由を書けば通る。理由はレビューが読むためのものである。
 * - **例外に挙げるべきテストが挙がっているかは見ていない。** これは
 *   「挙げた例外が腐っていないか」だけを見る片方向の検査であり、
 *   もう片方向は指標そのもの（{@link sc032GwtMarkers} の割合）が受け持つ。
 * - **テストの同定は先頭行の名前だけで行う。** {@link testNameOfBody} の限界を
 *   そのまま引き継ぐ。名前が先頭行に無い書き方（`it.each`）は 2. で落ちる＝安全側。
 * - **区切りの有無は {@link hasGwtMarkers} と同じ精度しか持たない。**
 *   `// Given` / `// When` の文字列が本体のどこかにあれば「持っている」に倒れるので、
 *   飾りとして足したコメントも区切りと見なされる。その向きは例外が余計に消される側＝安全側である。
 *
 * @param exceptions 例外表（`{ file, testName, reason }` の配列）
 * @param testFiles `Map<リポジトリ相対パス, ソース>`。SC-032 が測る走査対象そのもの
 */
export function findStaleTestExceptions(exceptions, testFiles) {
  const problems = [];
  for (const e of exceptions) {
    if (typeof e.reason !== "string" || e.reason.trim() === "") {
      problems.push(`SC-032 の例外に理由がありません: ${e.file} の「${e.testName}」`);
    }
    const content = testFiles.get(e.file);
    if (content === undefined) {
      problems.push(
        `SC-032 の例外が指すファイルが走査対象にありません: ${e.file}（例外を消すか、走査対象を直してください）`,
      );
      continue;
    }
    const bodies = splitIntoTestBodies(content).filter(
      (bodyLines) => testNameOfBody(bodyLines) === e.testName,
    );
    if (bodies.length === 0) {
      problems.push(
        `SC-032 の例外が指すテストがありません: ${e.file} の「${e.testName}」（改名・削除したなら例外も消してください）`,
      );
      continue;
    }
    // 同名が複数あるときは、**すべてが区切りを持って初めて**不要と見なす。
    // 1 件でも区切りを持たないものが残っているなら、例外はまだ仕事をしている。
    if (bodies.every((bodyLines) => hasGwtMarkers(bodyLines.join("\n")))) {
      problems.push(
        `SC-032 の例外が不要になりました: ${e.file} の「${e.testName}」は前提・操作の区切りを持っています`,
      );
    }
  }
  return problems;
}

/**
 * SC-035 / SC-039① が名指しで参照するファイルピン。
 *
 * `web.srcFiles.get("App.tsx") ?? ""` / `sync.srcFiles.get("application/handlers.ts") ?? ""`
 * は、ファイルが無ければ空文字列へフォールバックする式になっている。空文字列を
 * 渡された `sc035MessageDefinitions` / `sc039aUnreachableBranchInApps` はカウント
 * しようがなく 0（＝目標達成）を返すため、このファイルが改名・移設されても
 * 指標は静かに PASS のまま動かない（#135 経路②⑪）。式自体（`?? ""`）は変えず、
 * 実在だけを独立に確認する。
 */
export const METRIC_FILE_PINS = [
  {
    path: "apps/timer-web/src/App.tsx",
    reason: "SC-035 の clientSource（メッセージ定義の突合対象）",
  },
  {
    path: "apps/tasuki-sync/src/application/handlers.ts",
    reason: "SC-039① の handlersSource（到達不能分岐の検査対象）",
  },
];

/**
 * 宣言の値が走査対象を指しているか。
 *
 * **走査対象かどうかの判定は、この 1 つの述語だけを使う**（ADR-0014 決定 9）。
 * 以前は数え上げが `d.src !== null`、読み込みが `d.src ? … : new Map()` と
 * **別々の条件**で書かれていた。両者は `""` で意味が割れ、
 * 「ガードは数えたのに実際には走査していない」状態を作れた（レビューで実測）。
 * 判定を分けて書くこと自体が穴の作り方なので、述語を 1 本に固定する。
 *
 * null（そのディレクトリを持たない）と非空の文字列（ディレクトリ名）だけが正当。
 * `""` や undefined は宣言の不備として `findInvalidDeclarations` が落とす。
 */
export function hasScanTarget(sub) {
  return typeof sub === "string" && sub.length > 0;
}

/**
 * 宣言の入口の一覧（#371）。`entry` は null・非空の文字列・非空の文字列の配列のどれか。
 * 不正な値（空文字・空の配列・空文字を含む配列）は {@link findInvalidDeclarations} が落とすので、
 * ここでは走査対象として数えられるものだけを返す。
 */
export function entriesOf(declaration) {
  const { entry } = declaration;
  if (Array.isArray(entry)) return entry.filter(hasScanTarget);
  return hasScanTarget(entry) ? [entry] : [];
}

/**
 * 宣言の値として不正なものを列挙する（ADR-0014 決定 1・決定 9）。
 *
 * 正当なのは null か非空の文字列だけ。`""` は「パッケージ直下」を指す形になり、
 * 走査対象を 1 つ静かに失わせる。**件数のガードは 1 件だけ失った状態を検知
 * できない**ため、宣言そのものの妥当性をここで見る。
 */
export function findInvalidDeclarations(declarations) {
  const invalid = [];
  for (const d of declarations) {
    for (const key of ["src", "test", "entry"]) {
      const value = d[key];
      if (value === null || hasScanTarget(value)) continue;
      // 入口だけは複数を配列で持てる（#371）。空の配列・空文字を含む配列は不正。
      if (key === "entry" && Array.isArray(value) && value.length > 0 && value.every(hasScanTarget)) continue;
      invalid.push(`${d.pkg}.${key} = ${JSON.stringify(value)}`);
    }
  }
  return invalid;
}

/**
 * 走査対象を読み込む。**走査量の算出も実走査もこの結果だけを使う**（ADR-0014 決定 9）。
 *
 * 以前は `main()` のガード用の計数と `runAudit()` の読み込みが別々に
 * ファイルを見ており、条件式が割れて食い違いを作った（上の `hasScanTarget` 参照）。
 * 読み込みを 1 か所に寄せることで、ガードが「走査した」と数えた集合と
 * 実際に指標を測る集合が**構造的に同一**になる。二重読み込みも同時に消える。
 *
 * `readDir(pkg, sub)` は Map<相対パス, 内容> を返す関数。
 * 実ファイル I/O は呼び出し側に置き、本関数は配線だけを持つ。
 */
export function loadScanTargets(declarations, readDir) {
  return declarations.map((d) => ({
    ...d,
    srcFiles: hasScanTarget(d.src) ? readDir(d.pkg, d.src) : new Map(),
    testFiles: hasScanTarget(d.test) ? readDir(d.pkg, d.test) : new Map(),
  }));
}

/**
 * 走査量を数える（ADR-0014 決定 6）。
 *
 * **宣言の行数ではなく、`loadScanTargets` が実際に読み込んだものを数える。**
 * `SCANNED_PACKAGES.length` を数えてはならない — 各要素の `src` / `test` を空に
 * すれば走査は 0 件になるのに、配列長は 10 のまま変わらないため、行数を見る限り
 * 「走査 0 件・全指標 PASS」の表が素通りする。
 *
 * ファイル件数は読み込んだ Map の大きさそのもの。**別経路で数え直さない。**
 */
export function measureScanVolume(loaded) {
  const volume = { srcPackages: 0, srcFiles: 0, testPackages: 0, testFiles: 0 };
  for (const p of loaded) {
    if (hasScanTarget(p.src)) {
      volume.srcPackages += 1;
      volume.srcFiles += p.srcFiles.size;
    }
    if (hasScanTarget(p.test)) {
      volume.testPackages += 1;
      volume.testFiles += p.testFiles.size;
    }
  }
  return volume;
}

/**
 * 走査量を人が読む 1 行にする。
 *
 * 書式は設計正本 §5.4 に合わせ、**パッケージ数だけでなくファイル件数も出す**
 * （決定 6 の「何を何件見たか」）。ガードが見る数と出力する数を同じ 1 か所から作る。
 */
export function formatScanVolume(volume) {
  return (
    `src ${volume.srcPackages} パッケージ / ${volume.srcFiles} 件、` +
    `test ${volume.testPackages} パッケージ / ${volume.testFiles} 件`
  );
}

/**
 * 0 件ガードが見る内訳（ADR-0014 決定 8）。
 *
 * **出力する走査量とまったく同じ 4 つ**を見る。どれか 1 つでも 0 件なら、
 * その分だけ検査は空振りしている。
 */
export function scanVolumeDimensions(volume) {
  return [
    { label: "src パッケージ", count: volume.srcPackages },
    { label: "src ファイル", count: volume.srcFiles },
    { label: "test パッケージ", count: volume.testPackages },
    { label: "test ファイル", count: volume.testFiles },
  ];
}

/**
 * FR-119②③ が層で切っている境界。
 *
 * FR-119 は対象を層の言葉で定めている（設計正本
 * `docs/plans/codebase-refactoring/spec.md` の FR-119）:
 * 「**`packages/` の公開データ（定数・テーブル）は対象である**」。
 * `packages/timer-core` のような**特定のパッケージ名は 1 つも出てこない**。
 * したがって走査対象はこの接頭辞から導き、パッケージ名を名指ししない
 * （名指しは #180 が実際に踏んだ形。「列挙は腐る。機構で指す」）。
 */
const PACKAGE_LAYER_PREFIX = "packages/";

/** 宣言されたパッケージが `packages/` 層かどうか。**判定はこの 1 か所だけ**（ADR-0014 決定 9）。 */
export function isPackageLayer(pkg) {
  return pkg.startsWith(PACKAGE_LAYER_PREFIX);
}

/**
 * SC-039②③ の**照合先**として宣言されているパッケージ（純粋）。
 *
 * `packages/` 層のうち src を持つもの。`loaded` ではなく**宣言**から導くので、
 * {@link buildSc039Sources} が実際に組み立てた一覧と全単射で照合できる（#135 の機構）。
 */
export function sc039DeclaredComparedPackages(declarations) {
  return declarations
    .filter((d) => isPackageLayer(d.pkg) && hasScanTarget(d.src))
    .map((d) => d.pkg)
    .sort();
}

/**
 * SC-039②③ の**参照元**として宣言されているパッケージ（純粋）。
 *
 * 層は問わない（`apps/` も `packages/` も製品コードである）。到達性で絞るために
 * エントリが要るので、src とエントリの両方を持つ宣言だけが参照元になる。
 * エントリを持たない src 宣言は {@link findSrcWithoutEntry} が別に落とす。
 */
export function sc039DeclaredReferencePackages(declarations) {
  return declarations
    .filter((d) => hasScanTarget(d.src) && entriesOf(d).length > 0)
    .map((d) => d.pkg)
    .sort();
}

/**
 * SC-039②③ の**照合先ファイル**として宣言されているファイル（純粋）。
 *
 * **パッケージ単位の名乗り（{@link sc039DeclaredComparedPackages}）では足りない。**
 * 「そのパッケージは 1 件以上寄与し続けるが、特定のファイルだけが集合から抜ける」
 * 狭め方は、パッケージ名の全単射照合にも 0 件ガードにも例外表の健全性にも掛からず
 * exit 0 で素通りする（#180 の敵対的レビューが実測。`stats.ts` 1 件を間引くと
 * 「照合先 4 パッケージ / 28 ファイル」で緑になった）。照合の粒度をファイルへ上げる。
 *
 * 導出は宣言（`packages/` 層で src を持つ）と、その src ディレクトリを実際に読んだ
 * 結果だけから行う。**パッケージ名もファイル名も名指ししない**（「列挙は腐る。機構で指す」）。
 * 照合先には絞り込みが一切無い（到達性でも絞らない）ので、読めたファイルがそのまま宣言になる。
 *
 * @param loaded {@link loadScanTargets} の結果
 */
export function sc039DeclaredComparedFiles(loaded) {
  const files = [];
  for (const p of loaded) {
    if (!isPackageLayer(p.pkg) || !hasScanTarget(p.src)) continue;
    for (const k of p.srcFiles.keys()) files.push(`${p.pkg}/${p.src}/${k}`);
  }
  return files.sort();
}

/**
 * SC-039②③ の**参照元ファイル**として宣言されているファイル（純粋）。
 *
 * 参照元には**意図した絞り込みが 1 つだけ**ある — 到達性
 * （{@link computeReachableFiles}）。死んだファイルからの参照は生存の根拠にならない
 * ため、これは宣言の一部である。したがって宣言側でも同じ絞り込みを適用する。
 *
 * **ここに書いてよい絞り込みは到達性だけ。** 追加の条件を書くと、その条件で
 * 組み立て側を狭めたときに宣言側も揃って狭まり、照合が素通りする。
 *
 * @param loaded {@link loadScanTargets} の結果
 */
export function sc039DeclaredReferenceFiles(loaded) {
  const files = [];
  for (const p of loaded) {
    if (!hasScanTarget(p.src) || entriesOf(p).length === 0) continue;
    const reachable = computeReachableFiles(p.srcFiles, entriesOf(p));
    for (const k of p.srcFiles.keys()) {
      if (!reachable.has(k)) continue;
      files.push(`${p.pkg}/${p.src}/${k}`);
    }
  }
  return files.sort();
}

/**
 * SC-039④ の**走査対象ファイル**として宣言されているファイル（純粋）。
 *
 * 公開契約は「`packages/` 層のエントリ」そのものである。`apps/` のエントリは
 * 公開契約ではないので入らない（`scripts/audit-public-surface.mjs` が `export *` を
 * 見る範囲より狭い。あちらは「エントリに `export *` を置く動機が無い」ことを根拠に
 * 広く採ったが、こちらは「外から取り込まれるか」を問うので、取り込まれる側に限る）。
 *
 * **絞り込みを書かない。** 実在確認は `main()` の `existenceTargets` が先に行っており、
 * ここで `srcFiles.has(entry)` のような条件を足すと、組み立て側が同じ条件で狭まったときに
 * 宣言側も揃って狭まり、照合が素通りする（{@link sc039DeclaredReferenceFiles} と同じ理由）。
 *
 * @param loaded {@link loadScanTargets} の結果
 */
export function sc039DeclaredContractFiles(loaded) {
  return loaded
    .filter((p) => isPackageLayer(p.pkg) && hasScanTarget(p.src))
    .flatMap((p) => entriesOf(p).map((e) => `${p.pkg}/${p.src}/${e}`))
    .sort();
}

/**
 * ファイル単位のずれを人が読める形にする（純粋）。
 *
 * **`formatTargetDiff` を流用しない。** あちらの文言は「宣言にあるが実在しない ←
 * 移設したなら宣言を直す」であり、ここで落ちるファイルは**実在している**。
 * 実在するのに集合へ入っていない、という別の失敗なので、直し方の案内も別になる。
 * 誤った案内を出す赤は、赤が出ないのと同じくらい人を遠回りさせる。
 *
 * 走査量を必ず添えるのは `formatTargetDiff` と同じ理由（#135 D5・ADR-0014 決定 6）。
 */
export function formatSc039FileDrift(diff, scanSummary) {
  const lines = ["[audit-structure/SC-039] 走査対象のファイルが宣言とずれています"];
  for (const m of diff.missing) {
    lines.push(`  宣言では走査するのに集合へ入っていない: ${m}    ← 組み立て側の絞り込みを外す`);
  }
  for (const u of diff.unexpected) {
    lines.push(`  集合に入っているが宣言では走査しない:  ${u}    ← 宣言へ足すか、集合へ入れない`);
  }
  lines.push(`  現在の走査対象: ${scanSummary}`);
  return lines.join("\n");
}

/**
 * src を持つのにエントリを持たない宣言を列挙する（純粋）。
 *
 * この形の宣言は**2 つの検査を同時に静かに失わせる**。SC-027 は
 * `hasScanTarget(p.entry)` で絞るので測定対象から外れ、SC-039 の参照元も
 * 到達性を計算できないため外れる。外れた分の走査量は他パッケージ分で
 * 非ゼロのままなので、0 件ガードにも全単射照合にも掛からない（#158 と同型）。
 *
 * 落とすのは呼び出し側（`process.exit` は呼ばない）。
 */
export function findSrcWithoutEntry(declarations) {
  return declarations
    .filter((d) => hasScanTarget(d.src) && entriesOf(d).length === 0)
    .map((d) => d.pkg)
    .sort();
}

/**
 * SC-039②③④ が使う 3 つの集合（純粋）を、読み込み済みの走査対象から組み立てる。
 *
 * **呼ぶのは `main()` の 1 回だけ。`runAudit()` はその結果を引数で受け取る**
 * （ADR-0014 決定 9）。以前は両者が同じ `loaded` から**別々に呼んで**いたため、
 * 決定 9 を「呼び出し箇所の数」では満たしても**同一性**では満たしておらず、
 * 照合が終わった後で指標側の集合だけを間引けた（#198）。
 * 2 か所で別々に組み立てると、条件式が割れた瞬間にガードが静かに空振りする
 * （このリポジトリが実際に踏んだ形。`loadScanTargets` の docstring を参照）。
 *
 * - `packageSrcFiles`: SC-039②③ が数える対象。**`packages/` 層で src を持つ宣言すべて**
 *   （FR-119②③は層で切っている。{@link isPackageLayer}）。到達性では絞らない。
 * - `productSources`: 参照元となる製品コード。**SC-027 が到達不能と判定したファイルを除く。**
 *   死んだファイルからの参照は生存の根拠にならない。これを除かないと、
 *   「撤去予定のファイルからしか参照されていない記号」が生きているように見え、
 *   G1 で撤去した瞬間に SC-039 の値が跳ね上がる（計測器が撤去を検知できない）。
 *   **テストは含めない**（FR-090）。
 * - `contractFiles`: SC-039④ が数える対象。**`packages/` 層のエントリそのもの**
 *   （＝そのパッケージの公開契約）。宣言は {@link sc039DeclaredContractFiles} が導く。
 * - `comparedPackages` / `referencePackages`: **実際に 1 件以上寄与したパッケージ**の一覧。
 *   宣言（{@link sc039DeclaredComparedPackages} / {@link sc039DeclaredReferencePackages}）と
 *   全単射で照合するために返す。ここを「宣言をそのまま写す」実装にしてはならない —
 *   写すと、組み立て側にパッケージ名の名指しが戻っても照合が素通りする。
 *
 * **#180 まで、ここは `packages/timer-core` を名指しで取り出していた。**
 * 指標は「公開記号 0 件」と報告していたが、それは timer-core についてのみ 0 で、
 * 他の 3 パッケージは一度も測られていなかった。
 *
 * ## 照合の粒度は**ファイル**
 *
 * 返す 3 つの Map のキーそのものが、宣言（{@link sc039DeclaredComparedFiles} /
 * {@link sc039DeclaredReferenceFiles} / {@link sc039DeclaredContractFiles}）と
 * 全単射で照合される。**パッケージ単位の
 * 名乗りだけでは足りない** — この関数の中に
 * `if (p.pkg === "packages/poker-core" && k === "stats.ts") continue;` の 1 行を
 * 差し込むと、そのパッケージは他の 7 ファイルで寄与し続けるためパッケージ名の照合を
 * 通り、走査量も 0 件にならず、例外表も腐らない。実測ではこの状態が
 * 「照合先 4 パッケージ / 28 ファイル」（正規は 29）で **exit 0** だった（#180 の
 * 敵対的レビュー）。ファイル単位へ上げるとこれは赤になり、抜けたファイルが名指しされる。
 *
 * ## 塞げていないこと（すべて実測。**緑は「走査範囲が正しい」ことを証明しない**）
 *
 * 落ちるのは**この関数の中の絞り込み**と、`main()` の照合より**手前**での間引きだけ。
 * 次の 4 つは落ちない。共通する形は「宣言側と実体側が同じ上流を通るので揃って狭まる」
 * か「照合より後段にある」かのどちらかである。
 *
 * 1. **層の述語（{@link isPackageLayer}）そのものの書き換え。** 宣言側も実体側も
 *    同じ述語を通る（判定を 1 本に固定する決まり・ADR-0014 決定 9 の裏返しであり、
 *    両立しない）。実測: `packages/` を timer-core と rate-limit の 2 つへ狭めると
 *    「照合先 2 パッケージ / 19 ファイル」で exit 0。**例外表（{@link SC039C_EXCEPTIONS}）が
 *    名指しするパッケージを外すと偶然落ちるが、それは例外表の中身に依存した
 *    偶然であって構造的な歯止めではない。**
 * 2. **読み込みそのものの書き換え**（`main()` が {@link loadScanTargets} へ渡す
 *    `readFilesRecursive` / 拡張子の集合）。宣言側も実体側も同じ `loaded` から導くので
 *    揃って狭まる。実測: 読み込み時に 1 ファイルを落とすと「照合先 28 / 参照元 185」で exit 0。
 * 3. **照合より後段での間引き**（指標を測る側の中）。照合は既に終わっている。
 *    **#198 で「走査対象そのものを間引く形」だけを塞いだ。** `runAudit()` は集合を
 *    組み立て直さず引数で受け取り、**自分が指標を測るのに使った走査対象の規模を名乗る**
 *    （{@link scanVolumeOf}）。`main()` が組み立て直後に控えた規模と突き合わせ、
 *    食い違えば指標の表を出す前に落とす（{@link findScanVolumeDrift}）。
 *    塞ぐ前の実測: 組み立て直した Map から 1 件 delete しても、`loaded` から 1 件
 *    落としても、走査量の表示すら変わらず exit 0（いずれも出力がバイト単位で同一）。
 *    **残るのは「別の集合を渡す形」**。`sc032GwtMarkers(new Map([...allTestFiles].slice(1)))`
 *    のように**絞り込んだ別の集合を指標関数へ渡す**と、名乗りは元の集合を読んだままなので
 *    差が出ない（実測で exit 0）。突き合わせが見るのは件数だけなので、**同数の入れ替え**も
 *    検知しない。そこを守るのは指標関数自身のテストと `scripts/mutation-check.mjs` である。
 * 4. **宣言の `entry` を別ファイルへ差し替えて到達性を痩せさせる。** 参照元の絞り込みは
 *    到達性であり、宣言側（{@link sc039DeclaredReferenceFiles}）も同じ到達性を通る。
 *    実測: poker-core の entry を `index.ts` → `deck.ts` にすると参照元 186 → 179 で exit 0。
 *
 * 1・2・4 の歯止めは、出力する走査量の数字が変わることと、それが 1 行の差分として
 * diff に現れることの 2 つに限られる（この 3 つは宣言側と実体側が同じ上流を通るため
 * 構造的に不可避。#196 で文書化した）。3 に残った形にはその歯止めすら無い。
 *
 * @param loaded {@link loadScanTargets} の結果
 */
export function buildSc039Sources(loaded) {
  const packageSrcFiles = new Map();
  const productSources = new Map();
  const contractFiles = new Map();
  const comparedPackages = [];
  const referencePackages = [];

  for (const p of loaded) {
    if (!hasScanTarget(p.src)) continue;
    const prefix = `${p.pkg}/${p.src}/`;

    if (isPackageLayer(p.pkg)) {
      // **名乗りは「実際に集合へ入ったか」で決める。** `p.srcFiles.size > 0` で
      // 判断すると、ここへ名指しの絞り込みが差し込まれても名乗りだけが残り、
      // 宣言との照合が素通りする（この検査自身が塞ぐはずの穴を自分で開ける）。
      const before = packageSrcFiles.size;
      for (const [k, v] of p.srcFiles) packageSrcFiles.set(prefix + k, v);
      if (packageSrcFiles.size > before) comparedPackages.push(p.pkg);

      // SC-039④ の走査対象は `packages/` 層のエントリそのもの（#182）。
      // **エントリが読めなかったときは入れない。** 宣言側
      // （{@link sc039DeclaredContractFiles}）は無条件に挙げるので、
      // 入れ損ねはファイル単位の照合で赤になる（空文字列で埋めると黙って 0 件になる）。
      for (const e of entriesOf(p)) {
        const entrySource = p.srcFiles.get(e);
        if (entrySource !== undefined) contractFiles.set(prefix + e, entrySource);
      }
    }

    if (entriesOf(p).length === 0) continue;
    const reachable = computeReachableFiles(p.srcFiles, entriesOf(p));
    const before = productSources.size;
    for (const [k, v] of p.srcFiles) {
      if (!reachable.has(k)) continue;
      productSources.set(prefix + k, v);
    }
    if (productSources.size > before) referencePackages.push(p.pkg);
  }

  return {
    packageSrcFiles,
    productSources,
    contractFiles,
    comparedPackages: comparedPackages.sort(),
    referencePackages: referencePackages.sort(),
  };
}

/**
 * SC-039②③ の走査量を人が読む 1 行にする（ADR-0014 決定 6）。
 *
 * **パッケージ数とファイル件数の両方を出す。** ファイル件数だけでは、
 * 「どこを測った 0 件なのか」が読み手に伝わらない（#180 の現象そのもの）。
 */
export function formatSc039ScanVolume(sources) {
  return (
    `照合先 ${sources.comparedPackages.length} パッケージ / ${sources.packageSrcFiles.size} ファイル、` +
    `参照元 ${sources.referencePackages.length} パッケージ / ${sources.productSources.size} ファイル、` +
    `公開契約 ${sources.contractFiles.size} ファイル`
  );
}

/**
 * SC-039②③ の 0 件ガードが見る内訳（ADR-0014 決定 8）。
 *
 * **{@link formatSc039ScanVolume} が出力するのとまったく同じ 5 つ**を見る。
 * **片方に足したらもう片方にも足すこと**（#182 で公開契約を足したとき、この数字だけが
 * 4 のまま取り残された）。
 */
export function sc039ScanVolumeDimensions(sources) {
  return [
    { label: "SC-039 の照合先パッケージ", count: sources.comparedPackages.length },
    { label: "SC-039 の照合先ファイル", count: sources.packageSrcFiles.size },
    { label: "SC-039 の参照元パッケージ", count: sources.referencePackages.length },
    { label: "SC-039 の参照元ファイル", count: sources.productSources.size },
    { label: "SC-039④ の公開契約ファイル", count: sources.contractFiles.size },
  ];
}

/**
 * テスト系の指標（SC-028/029/030/031/032/036）が見る 1 つの集合を組み立てる（純粋）。
 *
 * 鍵は**リポジトリ相対パス**（`packages/poker-core/tests/deck.test.ts` の形）。
 *
 * **呼ぶのは `main()` の 1 回だけ。`runAudit()` はその結果を引数で受け取る**
 * （ADR-0014 決定 9）。SC-032 の例外表はこの鍵でファイルを名指しするため、
 * 2 か所で組み立てると鍵の作り方が割れた瞬間に、例外表のガードは「実在する」と言い、
 * 指標側は 1 件も外さない、という食い違いが静かに成立する。以前は同じ `loaded` から
 * **別々に呼んで**いたため、照合が終わった後で指標側だけを間引けた（#198）。
 *
 * @param loaded {@link loadScanTargets} の結果
 */
export function buildAllTestFiles(loaded) {
  const allTestFiles = new Map();
  for (const p of loaded) {
    for (const [k, v] of p.testFiles) allTestFiles.set(`${p.pkg}/${p.test}/${k}`, v);
  }
  return allTestFiles;
}

/**
 * 走査対象の規模を、**その集合そのものから読む**（#198）。
 *
 * 照合した側（`main()`）と指標を測った側（`runAudit()`）の両方がこれを呼び、
 * 値が食い違えば「照合より後段で間引かれた」ことになる。
 *
 * **渡すのは実際に指標関数へ手渡した集合であること。** `sc039Sources` のような
 * 入れ物から読み直すと、中で別の集合へ差し替えられたときに気づけない。
 *
 * **`loaded` そのものも走査対象である。** SC-027 は `loaded` を直接たどり、
 * SC-035 / SC-039① は個々のパッケージの `srcFiles` を直接読む。3 つの派生集合だけを
 * 名乗ると、`loaded` を痩せさせる変更が丸ごと素通りする（実測: `loaded` から 1 件
 * 落としても出力がバイト単位で同一のまま exit 0 だった）。
 */
export function scanVolumeOf(loaded, packageSrcFiles, productSources, allTestFiles, contractFiles) {
  return {
    走査パッケージ: loaded.length,
    "src ファイル": loaded.reduce((n, p) => n + p.srcFiles.size, 0),
    "test ファイル": loaded.reduce((n, p) => n + p.testFiles.size, 0),
    "SC-039 照合先": packageSrcFiles.size,
    "SC-039 参照元": productSources.size,
    テスト集合: allTestFiles.size,
    "SC-039 公開契約": contractFiles.size,
  };
}

/**
 * 照合したときの規模と、指標が測ったときの規模のずれを名指しする（#198）。
 *
 * **照合の後で集合を間引く変更は、他のどのガードにも掛からない。** 全単射照合も
 * 0 件ガードも例外表の健全性も、指標より手前で終わっている。走査量の表示も
 * 手前なので数字にすら痕跡が残らない（#196 の時点で実測。出力がバイト単位で同一）。
 *
 * 判定は純粋関数、I/O と `process.exit` は呼び出し側に置く。
 * `measured` にキーが欠けていれば `undefined` との比較でずれとして出る（不足側へ倒す）。
 */
export function findScanVolumeDrift(scanned, measured) {
  return Object.keys(scanned)
    .filter((label) => scanned[label] !== measured[label])
    .map((label) => `${label}: ${scanned[label]} → ${measured[label]}`);
}

/**
 * 指標を測る。**読み込み済みの走査対象（`loadScanTargets` の結果）を受け取る。**
 * 自分で読み直さないこと — 読み込み条件が二重化した瞬間に、ガードが数えた集合と
 * ここで測る集合が食い違う（ADR-0014 決定 9）。
 */
function runAudit(loaded, sc039Sources, allTestFiles) {
  const byPkg = new Map(loaded.map((p) => [p.pkg, p]));

  // SC-035 / SC-039① は timer 固有の指標。走査を広げてもここは変えない
  // （SC-035 は timer の文言テーブル、SC-039① は timer の既知パターン 1 つが対象。
  //   測った範囲は SC039A_SCOPE として指標の値に添える）。
  // **SC-039②③ は #180 で `packages/` 全体へ広げた。** 集合は `buildSc039Sources` が
  // 宣言から導く。ここでは組み立てない。
  const sync = byPkg.get("apps/tasuki-sync");
  const web = byPkg.get("apps/timer-web");

  // **テスト集合は `main()` が照合したものをそのまま受け取る**（ADR-0014 決定 9）。
  // ここで組み立て直すと、呼び出し箇所の数では決定 9 を満たしても**同一性**では
  // 満たさず、照合が終わった後で静かに間引ける（#198）。

  // SC-027: エントリを持つパッケージごとに到達性を測り、合算する
  const sc027 = loaded
    .filter((p) => entriesOf(p).length > 0)
    .reduce((n, p) => n + sc027UnreachableModules(p.srcFiles, entriesOf(p)), 0);

  const sc028 = sc028DuplicateTestDoubles(allTestFiles);

  // FR-093 の例外表。**組み立ては SC029_EXCEPTIONS の 1 か所だけ**（ADR-0014 決定 9）。
  // ここで別の配列を書くと、`main()` の例外表ガードが見る表と指標が使う表が食い違う。
  const sc029 = sc029SpecIdsInNames(allTestFiles, SC029_EXCEPTIONS);
  const sc030 = sc030CallNamesInNames(allTestFiles);
  const sc031 = sc031GuardExpects(allTestFiles);
  const sc032 = sc032GwtMarkers(allTestFiles, SC032_EXCEPTIONS);
  const sc036 = sc036TestCount(allTestFiles);

  const serverSources = [...sync.srcFiles.values()];
  const clientSource = web.srcFiles.get("App.tsx") ?? "";
  const sc035 = sc035MessageDefinitions(serverSources, clientSource);

  const handlersSource = sync.srcFiles.get("application/handlers.ts") ?? "";
  // **走査対象は `main()` が照合したものをそのまま受け取る**（ADR-0014 決定 9）。
  // ここで組み立て直すと、腐った例外を抱えたまま静かに「0 件」を報告できてしまう。
  const { packageSrcFiles, productSources, contractFiles } = sc039Sources;
  const sc039 = sc039UnreachableElements({
    handlersSource,
    packageSrcFiles,
    productSources,
    contractFiles,
    exceptions: SC039C_EXCEPTIONS,
  });

  // **測った集合そのものから規模を名乗る**（#198）。`main()` が照合したときの値と
  // 突き合わせるための申告であり、ここで数え直しているのは「件数」ではなく
  // 「いま指標を測るのに使った集合の `size`」である。
  const measured = scanVolumeOf(loaded, packageSrcFiles, productSources, allTestFiles, contractFiles);

  const results = {
    sc027: { value: sc027, target: 0 },
    sc028: { value: sc028, target: 0 },
    sc029: { value: sc029, target: 0 },
    sc030: { value: sc030, target: 0 },
    sc031: { value: sc031, target: 0 },
    sc032: {
      value: `${sc032.numerator}/${sc032.denominator}（${(sc032.ratio * 100).toFixed(1)}%）`,
      target: "100%",
      raw: sc032,
    },
    sc035: { value: sc035, target: 0 },
    sc036: { value: sc036, target: "P1 完了時の基準値以上" },
    sc039: {
      value:
        `分岐 ${sc039.unreachableBranches}（${SC039A_SCOPE}）/ ` +
        `データ ${sc039.unusedPublicDataLines} 行 / ` +
        `公開記号 ${sc039.selfOnlyPublicSymbols} 件 / ` +
        `公開契約 ${sc039.contractOnlyValues} 件`,
      target: "分岐0 / データ0行 / 公開記号0件 / 公開契約0件",
      raw: sc039,
    },
  };

  return { results, measured };
}

/**
 * 監査結果を表にする。
 *
 * 判定は**目標値が数値の指標にだけ**出す。SC036 のように目標が文章の指標は
 * 「記録のための数値」であり、合否を持たない（以前は値が数値・目標が文字列で
 * `1382 === "P1 完了時の基準値以上"` が常に false になり、構造上いつまでも
 * 「未達」と表示されていた）。
 */
export function formatTable(results) {
  const rows = Object.entries(results).map(([id, r]) => {
    const judgeable = typeof r.value === "number" && typeof r.target === "number";
    const judged = judgeable ? (r.value === r.target ? "PASS" : "未達") : "—";
    return `${id.toUpperCase()} | ${r.value} | ${r.target} | ${judged}`;
  });
  const header = "SC | 現状値 | 目標値 | 判定";
  return [header, "---", ...rows].join("\n");
}

function main() {
  // 走査対象の宣言が実体とずれていないかを最初に見る（#135 経路②⑪）。
  //
  // **これは測定値の合否ではなく計測器の健全性の合否**（ADR-0014）。
  // ADR 0009 D2 の「構造監査は値を出すだけ」は測定値についての決定であり、
  // 走査対象を失ったまま全指標 PASS の表を出すことまで許してはいない。

  // 宣言の値そのものが正当か（null か非空の文字列か）を先に見る。
  // `""` は「パッケージ直下」を指す形になり、走査対象を 1 つ静かに失わせる。
  // 件数のガードは「1 件だけ失った」状態を検知できないため、ここで落とす。
  const invalidDeclarations = findInvalidDeclarations(SCANNED_PACKAGES);

  // **走査対象の読み込みはここ 1 回だけ。** 走査量のガードも指標の測定も、
  // この `loaded` から導出する（別々に導出すると条件式が割れて食い違う）。
  // `hasScanTarget` が `""` を 0 件として扱うため、不正な宣言があっても
  // この読み込みは安全に行える（落ちる前に走査量を出すために先に計算する）。
  const loaded = loadScanTargets(SCANNED_PACKAGES, (pkg, sub) =>
    readFilesRecursive(path.join(REPO_ROOT, pkg, sub), EXT_TS),
  );
  const volume = measureScanVolume(loaded);
  const summary = formatScanVolume(volume);

  if (invalidDeclarations.length > 0) {
    console.error("[audit-structure] 走査対象の宣言が不正です（null か非空の文字列のみ）");
    for (const d of invalidDeclarations) console.error(`  ${d}`);
    console.error(`  現在の走査対象: ${summary}`);
    process.exit(1);
  }

  // src を持つのにエントリを持たない宣言を落とす（#180）。
  // その形の宣言は SC-027 の測定対象からも SC-039 の参照元からも静かに外れる。
  // 外れても走査量は他パッケージ分で非ゼロのままなので、0 件ガードでは捕まらない。
  const srcWithoutEntry = findSrcWithoutEntry(SCANNED_PACKAGES);
  if (srcWithoutEntry.length > 0) {
    console.error(
      "[audit-structure] src を宣言したのにエントリ（entry）がありません（SC-027 と SC-039 の参照元を静かに失います）",
    );
    for (const pkg of srcWithoutEntry) console.error(`  ${pkg}`);
    console.error(`  現在の走査対象: ${summary}`);
    process.exit(1);
  }

  // 走査量のどの内訳も 0 件でないことを見る（ADR-0014 決定 8）。
  //
  // 走査 0 件のまま合否表を出す経路は 2 つある。全パッケージを理由つき除外へ移せば
  // 下の全単射照合は素通りし（除外側が workspace の全件を覆うため）、宣言を残したまま
  // 各要素の `src` / `test` を null にすれば全単射も実在確認も素通りする（null は
  // 実在確認の対象外）。**どちらも宣言の行数では検知できない**ため、出力している
  // 走査量そのものを見る。METRIC_FILE_PINS のファイル実在チェックは走査集合への
  // 所属を見ないため、この経路の歯止めにならない。
  const emptyDimensions = findEmptyScanDimensions(scanVolumeDimensions(volume));
  if (emptyDimensions.length > 0) {
    console.error(
      `[audit-structure] 走査対象が 0 件です（検査が空振りします）: ${emptyDimensions.join(" / ")}`,
    );
    console.error(`  現在の走査対象: ${summary}`);
    process.exit(1);
  }

  const packages = listWorkspacePackages(REPO_ROOT);
  const declared = [
    ...SCANNED_PACKAGES.map((d) => d.pkg),
    ...EXCLUDED_PACKAGES.map((e) => e.pkg),
  ];
  const drift = diffTargets(declared, packages);

  // ディレクトリ（src/test）とエントリ（SC-027 の到達性測定の起点）の実在を見る。
  // エントリが改名されても ADR 0009 D2 により測定値では落ちないため、ここで
  // 計測器の健全性として先に検知する（指摘4）。
  //
  // SC-035 / SC-039① が名指しで参照するファイルピンも同じ扱いにする（指摘1）。
  //
  // **実在確認そのものは共有モジュールの `findMissingPaths` に任せる**
  // （ADR-0014 決定 10）。ここで `fs.existsSync` を直に書くと、同型の実装が
  // ログ衛生側にもう 1 つできて「片側だけ直す」の再発源になる（#158）。
  const existenceTargets = [];
  for (const d of SCANNED_PACKAGES) {
    for (const sub of [d.src, d.test]) {
      if (hasScanTarget(sub)) existenceTargets.push(`${d.pkg}/${sub}`);
    }
    if (hasScanTarget(d.src)) {
      for (const e of entriesOf(d)) existenceTargets.push(`${d.pkg}/${d.src}/${e}`);
    }
  }
  for (const pin of METRIC_FILE_PINS) existenceTargets.push(pin.path);
  const missingTargets = findMissingPaths(REPO_ROOT, existenceTargets);

  if (hasTargetDrift(drift) || missingTargets.length > 0) {
    const merged = {
      missing: [...drift.missing, ...missingTargets].sort(),
      unexpected: drift.unexpected,
    };
    console.error(formatTargetDiff("audit-structure", merged, summary));
    process.exit(1);
  }

  // 派生集合の組み立てはここ 1 か所だけ（ADR-0014 決定 9）。`runAudit()` へは
  // **この同じオブジェクトを渡す**。以前は指標側でも組み立て直しており、
  // 呼び出し箇所の数では決定 9 を満たしても同一性では満たしていなかった（#198）。
  const sc039Sources = buildSc039Sources(loaded);
  const allTestFiles = buildAllTestFiles(loaded);

  // **規模を控えるのは組み立てた直後**（#198）。以降の照合・例外表・走査量の表示は
  // すべてこの控えと同じ集合を見る。**控えを後ろへ置くと、照合や表示のあとで
  // 間引かれた状態がそのまま基準値になり、突き合わせが素通りする**
  // （実測: 控えの直前で 1 件消すと、表示は 268 のまま SC-032 の分母だけが動いて exit 0）。
  const scannedVolume = scanVolumeOf(
    loaded,
    sc039Sources.packageSrcFiles,
    sc039Sources.productSources,
    allTestFiles,
    sc039Sources.contractFiles,
  );

  // SC-039②③ の走査範囲そのものの健全性（#180）。**指標を出す前に見る。**

  // 走査量は成否によらず必ず出す（#135 D5・ADR-0014 決定 6）。
  // **パッケージ数まで出す。** #180 まではファイル件数だけを出していたため、
  // 「照合先 14 ファイル」が 1 パッケージ分しか無いことが誰にも見えなかった。
  console.log(`[audit-structure] SC-039②③ の走査対象: ${formatSc039ScanVolume(sc039Sources)}`);

  // 宣言（SCANNED_PACKAGES から導いた一覧）と、実際に組み立てた一覧を全単射で照合する
  // （#135 の機構・ADR-0014 決定 1）。`buildSc039Sources` にパッケージ名の名指しが
  // 戻れば、照合先の一覧が宣言より短くなってここで落ちる。
  const sc039Drift = diffTargets(
    sc039DeclaredComparedPackages(SCANNED_PACKAGES),
    sc039Sources.comparedPackages,
  );
  const sc039RefDrift = diffTargets(
    sc039DeclaredReferencePackages(SCANNED_PACKAGES),
    sc039Sources.referencePackages,
  );
  if (hasTargetDrift(sc039Drift) || hasTargetDrift(sc039RefDrift)) {
    const merged = {
      missing: [...sc039Drift.missing, ...sc039RefDrift.missing].sort(),
      unexpected: [...sc039Drift.unexpected, ...sc039RefDrift.unexpected].sort(),
    };
    console.error(
      formatTargetDiff("audit-structure/SC-039", merged, formatSc039ScanVolume(sc039Sources)),
    );
    process.exit(1);
  }

  // **照合はファイル単位でも行う**（#180 の敵対的レビュー）。上のパッケージ単位の
  // 名乗りは「そのパッケージが 1 件以上寄与したか」しか見ないため、
  // 「パッケージは残るが特定のファイルだけが集合から抜ける」狭め方を素通りさせる。
  // 実測では `packages/poker-core/src/stats.ts` 1 件を間引いた状態が
  // 「照合先 4 パッケージ / 28 ファイル」（正規は 29）で exit 0 だった。
  //
  // 機構は上とまったく同じ（`diffTargets` の両方向）。粒度だけをファイルへ上げる。
  const sc039FileDrift = diffTargets(
    sc039DeclaredComparedFiles(loaded),
    [...sc039Sources.packageSrcFiles.keys()],
  );
  const sc039RefFileDrift = diffTargets(
    sc039DeclaredReferenceFiles(loaded),
    [...sc039Sources.productSources.keys()],
  );
  // SC-039④ の走査対象（`packages/` 層のエントリ）も同じ機構で照合する（#182）。
  const sc039ContractDrift = diffTargets(
    sc039DeclaredContractFiles(loaded),
    [...sc039Sources.contractFiles.keys()],
  );
  if (
    hasTargetDrift(sc039FileDrift) ||
    hasTargetDrift(sc039RefFileDrift) ||
    hasTargetDrift(sc039ContractDrift)
  ) {
    const merged = {
      missing: [
        ...sc039FileDrift.missing,
        ...sc039RefFileDrift.missing,
        ...sc039ContractDrift.missing,
      ].sort(),
      unexpected: [
        ...sc039FileDrift.unexpected,
        ...sc039RefFileDrift.unexpected,
        ...sc039ContractDrift.unexpected,
      ].sort(),
    };
    console.error(formatSc039FileDrift(merged, formatSc039ScanVolume(sc039Sources)));
    process.exit(1);
  }

  // 走査量のどの内訳も 0 件でないことを見る（ADR-0014 決定 8）。
  // 全体の走査量が非ゼロでも、SC-039 の照合先だけが空になる経路は独立に存在する。
  const emptySc039Dimensions = findEmptyScanDimensions(sc039ScanVolumeDimensions(sc039Sources));
  if (emptySc039Dimensions.length > 0) {
    console.error(
      `[audit-structure] SC-039 の走査対象が 0 件です（検査が空振りします）: ${emptySc039Dimensions.join(" / ")}`,
    );
    process.exit(1);
  }

  // 例外表の健全性（走査対象のずれと同じ扱いで合否を持つ）。
  // 指標を出す前に見る。腐った例外を抱えたまま「0 件」と報告させない。
  const staleExceptions = findStaleSymbolExceptions(
    SC039C_EXCEPTIONS,
    sc039Sources.packageSrcFiles,
    sc039Sources.productSources,
  );
  // 走査量は成否によらず必ず出す（#135 D5）。何件の例外を何件のファイルに照らしたかが赤の根拠になる。
  console.log(
    `[audit-structure] SC-039③ の例外表: ${SC039C_EXCEPTIONS.length} 件 / ` +
      `照合先 ${sc039Sources.packageSrcFiles.size} ファイル・参照元 ${sc039Sources.productSources.size} ファイル`,
  );
  if (staleExceptions.length > 0) {
    for (const p of staleExceptions) console.error(`[audit-structure] ${p}`);
    process.exit(1);
  }

  // SC-032 の例外表も同じ扱いで見る。**指標を出す前に**見る。
  // 腐った例外を抱えたまま「100.0%」と報告させない。
  // 見る集合は上で組み立てて控えた `allTestFiles` そのもの（ADR-0014 決定 9）。

  // SC-029 の例外表も同じ扱いで見る。**指標を出す前に**見る。
  // 腐った例外（実在しないパス・何も外していないエントリ）を抱えたまま「0 件」と報告させない。
  const staleSc029Exceptions = findStaleSc029Exceptions(SC029_EXCEPTIONS, allTestFiles);
  // 走査量は成否によらず必ず出す（#135 D5）。何件の例外を何件のファイルに照らしたかが赤の根拠になる。
  console.log(
    `[audit-structure] SC-029 の例外表: ${SC029_EXCEPTIONS.length} 件 / ` +
      `照合先 ${allTestFiles.size} ファイル`,
  );
  if (staleSc029Exceptions.length > 0) {
    for (const p of staleSc029Exceptions) console.error(`[audit-structure] ${p}`);
    process.exit(1);
  }

  const staleTestExceptions = findStaleTestExceptions(SC032_EXCEPTIONS, allTestFiles);
  // 走査量は成否によらず必ず出す（#135 D5）。何件の例外を何件のファイルに照らしたかが赤の根拠になる。
  console.log(
    `[audit-structure] SC-032 の例外表: ${SC032_EXCEPTIONS.length} 件 / ` +
      `照合先 ${allTestFiles.size} ファイル`,
  );
  if (staleTestExceptions.length > 0) {
    for (const p of staleTestExceptions) console.error(`[audit-structure] ${p}`);
    process.exit(1);
  }

  const { results, measured } = runAudit(loaded, sc039Sources, allTestFiles);

  // **指標が測った対象が、照合した対象と同じかを見る**（#198・ADR-0014 決定 9）。
  // 照合・0 件ガード・例外表の健全性・走査量の表示はすべて指標より手前で終わるため、
  // 後段で間引かれると数字にすら痕跡が残らないまま全指標 PASS の表が出る。
  // **指標の表より前に落とす**（腐った表を出させない。決定 7 と同じ扱い）。
  const measuredDrift = findScanVolumeDrift(scannedVolume, measured);
  if (measuredDrift.length > 0) {
    console.error("[audit-structure] 指標が測った走査対象が、照合した走査対象と食い違っています");
    for (const d of measuredDrift) {
      console.error(`  ${d}    ← 照合より後段で間引いています`);
    }
    // **控えた規模そのものを出す。** 全体走査の要約（`summary`）を出していたが、
    // 差分行が名指しする次元の数がそこに現れず、読み手が数字の出どころを追えなかった。
    const scanned = Object.entries(scannedVolume)
      .map(([label, n]) => `${label} ${n}`)
      .join("、");
    console.error(`  照合したときの走査対象: ${scanned}`);
    process.exit(1);
  }

  console.log(`[audit-structure] 走査対象: ${summary}`);
  console.log(formatTable(results));
}

// このファイルが直接実行された場合のみ走査する（テストからの import 時は実行しない）。
if (isDirectRun(import.meta.url, process.argv[1])) main();
