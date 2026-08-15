#!/usr/bin/env node
/**
 * 変異検査（FR-098）。
 *
 * `scripts/mutations/*.patch` の変異を1件ずつ適用し、対応する「検出を期待するテスト」
 * （既定）または属するパッケージ全体（--full）を実行して、検出できたか（テストが落ちたか）
 * を記録したあと、必ず `git checkout --` で元に戻す。
 *
 * plan.md 「変異と『検出を期待するテスト』の対応表」の実装。表が正本であり、
 * このスクリプトの MUTATIONS 定義はその実装にすぎない。
 *
 * 使い方:
 *   node scripts/mutation-check.mjs         絞り込み実行（対応表のテストファイルのみ）
 *   node scripts/mutation-check.mjs --full   変異の属するパッケージ全体を実行
 *
 * テストランナー:
 * リポジトリには 3 種類のランナーが混在する（apps/timer-sync は bun test、
 * packages/ui は node --test、それ以外は vitest）。全パッケージへ npx vitest を
 * 決め打ちすると、ランナーが違うパッケージでは「コマンドが見つからない」まま
 * exit code が非 0 になり、テストを 1 件も実行せずに「検出」と誤報告する
 * （#136 で発覚。apps/timer-sync の変異 #3・#5・#10 がこの状態だった）。
 * これを避けるため、対象パッケージの package.json の scripts.test からランナーを
 * 判定し（detectRunner）、そのランナーで直接テストファイルを指定して実行する。
 *
 * 対照実行（コントロール）:
 * 各変異について、**変異を当てる前の素のコードで同じコマンドを実行し、まず
 * 通ることを確認する**。対照が通らない場合は「検出」と報告せず、即座にエラー
 * 終了する。対照が無いと、ランナー自体が起動できない・テストが存在しない
 * といった「検査が空振りしているだけ」の状態を「全件検出」と読み違える
 * （上と同じ #136 の欠陥）。対照はこれを一般的に塞ぐので、ランナーごとに
 * 「テストが見つからない」旨のメッセージを文字列一致で拾う個別ガードは不要になる
 * （かつてはここに vitest 専用の "No test files found" 一致があったが、対照実行に
 * 一本化して削除した）。
 *
 * 安全性:
 * - 作業ツリーに未コミット変更がある状態では実行を拒否する（変異が復元で消えると
 *   取り返しがつかないため）。
 * - 復元は git checkout -- で行い、異常終了（Ctrl-C 含む）時にも必ず実行する。
 *   「現在適用中の変異」をモジュールスコープの変数で追跡し、シグナルハンドラ・
 *   uncaughtException ハンドラの両方から同じ復元処理を呼べるようにしている。
 */

import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { diffTargets, hasTargetDrift, formatTargetDiff } from "./lib/scan-targets.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(SCRIPT_DIR, ".."); // Tasuki/（ワークスペースのルート）
const MUTATIONS_DIR = path.join(SCRIPT_DIR, "mutations");

/**
 * リポジトリのルート（`.git` を持つ場所）。単一ワークスペース化により
 * WORKSPACE_ROOT と一致するが、git 操作は常に rev-parse で解決した値を使う。
 * パッチの diff パスはリポジトリルート起点なので、git 操作の cwd はここに固定する。
 */
const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: WORKSPACE_ROOT,
  encoding: "utf8",
}).trim();

/**
 * 変異定義。
 *
 * pkg: パッケージのディレクトリ（WORKSPACE_ROOT からの相対パス）。--full 実行時と、
 *      絞り込み実行時に vitest を呼ぶ cwd の両方に使う。
 * tests: 検出を期待するテストファイル（pkg からの相対パス）。
 * note: plan.md の対応表からの読み替えがあれば、その内容と理由をここに記録する。
 */
const MUTATIONS = [
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
  {
    id: 2,
    label: "checkPermission のある規則の許可/拒否を反転（viewer 拒否 → 許可）",
    patch: "m02-permissions-viewer-invert.patch",
    pkg: "packages/timer-core",
    tests: ["test/permissions-differential.test.ts", "test/permissions.test.ts"],
  },
  {
    id: 3,
    label: "computeIneligibleIndices から placeholder の除外を削る",
    patch: "m03-ineligible-placeholder.patch",
    pkg: "apps/timer-sync",
    tests: ["test/proxy-auto-switch.test.ts", "test/manual-skip-eligible.test.ts"],
  },
  {
    id: 4,
    label: "normalizeDisplayName の正規化を1段無効化（制御文字の除去を外す）",
    patch: "m04-display-name-control-chars.patch",
    pkg: "packages/timer-core",
    tests: ["test/display-name.test.ts"],
  },
  {
    id: 5,
    label: "canRemoveParticipant の呼び出しを削る（LAST_MANAGER ガードの無効化）",
    patch: "m05-can-remove-participant-guard.patch",
    pkg: "apps/timer-sync",
    tests: ["test/participant-remove.test.ts"],
    note:
      "plan.md の対応表は検出元を packages/timer-core/test/participants.test.ts としていたが、" +
      "これは canRemoveParticipant という純粋関数そのものを検証するテストであり、" +
      "apps/timer-sync/src/application/handlers.ts 側の「呼び出しを削る」変異（呼び出し元の" +
      "欠陥）は検出できない（純粋関数自体は変えていないため）。実際に検出できるのは" +
      "その呼び出しが実際に守っている振る舞い（LAST_MANAGER）を検証している" +
      "apps/timer-sync/test/participant-remove.test.ts（③・③' のケース）であるため、" +
      "こちらに読み替えた。",
  },
  {
    id: 6,
    label: "freezeRunningClock の凍結を外す（一時停止で満タンに戻る）",
    patch: "m06-freeze-running-clock.patch",
    pkg: "packages/timer-core",
    tests: ["test/pause-freeze.test.ts", "test/break-freeze.test.ts"],
  },
  {
    id: 7,
    label: "shouldClearGenerating の内容比較を参照比較に変える",
    patch: "m07-should-clear-generating-refcompare.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/problem-generation.test.ts"],
  },
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
  },
  {
    id: 10,
    label: "createRefEncoder.room が相関 ID ではなくルームコードをそのまま返す",
    patch: "m10-ref-encoder-passthrough.patch",
    pkg: "apps/timer-sync",
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
    pkg: "apps/timer-sync",
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
    pkg: "apps/timer-sync",
    tests: ["test/fail-closed.test.ts", "test/live-ws.rate-limit.test.ts"],
    note:
      "最終レビュー W-1。X-Real-IP は攻撃者が自由に付けられるヘッダ（Caddy は除去・" +
      "上書きしない）。接続のたびに値を変えるだけで毎回まっさらな鍵になり、#103 が" +
      "塞いだ「再接続でリセット」が復活する欠陥。poker-sync にも同型のテストを足したが、" +
      "mutation-check の対象は timer-sync 側の 1 件のみとした（W-1 の指示どおり）。",
  },
];

/**
 * 作業ツリーの汚れを見る。ただし本スクリプト自身の置き場（scripts/mutation-check.mjs と
 * scripts/mutations/）は除外する。
 *
 * 理由（鶏と卵の問題）: T004〜T006（本スクリプトと変異パッチの新設）は、この安全確認の
 * 対象になる「作業ツリーの変更」そのものである。これらは patch の適用・復元が一切
 * 触らないパスであり、除外しても「変異を適用してから git checkout -- で戻す」際の
 * 安全性には影響しない。真に守るべきは、パッチが触る製品/テストコードに既存の
 * 未コミット変更が残っていないことである。
 */
function gitStatusPorcelain() {
  return execFileSync(
    "git",
    [
      "status",
      "--porcelain",
      "--",
      ".",
      ":(exclude)scripts/mutation-check.mjs",
      ":(exclude)scripts/mutations",
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );
}

/** パッチ本文から、変更対象ファイル（REPO_ROOT からの相対パス）を抽出する。 */
function affectedFilesOf(patchPath) {
  const content = fs.readFileSync(patchPath, "utf8");
  const files = new Set();
  for (const line of content.split("\n")) {
    const m = line.match(/^\+\+\+ b\/(.+)$/);
    if (m) files.add(m[1]);
  }
  return [...files];
}

/** 現在適用中（未復元）の変異のファイル一覧。異常終了時の復元に使う。 */
let currentlyAppliedFiles = [];

/**
 * 適用中の変異をディスクに残すマーカー。
 *
 * **なぜメモリだけでは足りないか。** 下の signal ハンドラは SIGINT/SIGTERM/SIGHUP しか捕まえられない。
 * **SIGKILL と、親プロセスごと殺される形の中断は捕捉できず**、`currentlyAppliedFiles` は
 * 復元されないまま失われる。実際にこれが起き、変異を適用したままの製品コードが
 * 作業ツリーに残った（`deriveConnectionStatus` の分岐が反転したまま）。
 *
 * そのときの唯一の防波堤は main() 冒頭の「未コミット変更があれば実行を拒否する」検査だが、
 * これは**次の実行を止めるだけで、変異が残っていること自体は教えてくれない**。
 * マーカーを残せば、次回起動時に何が適用されたままかが分かり、自動で戻せる。
 */
const MARKER_PATH = path.join(MUTATIONS_DIR, ".applied");

function writeMarker(files) {
  fs.writeFileSync(MARKER_PATH, files.join("\n"), "utf8");
}

function clearMarker() {
  if (fs.existsSync(MARKER_PATH)) fs.rmSync(MARKER_PATH);
}

/**
 * 前回の実行が変異を適用したまま異常終了していないかを調べ、していれば復元する。
 * **未コミット変更の検査より前に呼ぶこと。** そうしないと自分が残した変異で自分が止まる。
 */
function recoverFromCrashedRun() {
  if (!fs.existsSync(MARKER_PATH)) return;
  const files = fs
    .readFileSync(MARKER_PATH, "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  clearMarker();
  if (files.length === 0) return;
  // eslint-disable-next-line no-console
  console.error(
    "[mutation-check] 前回の実行が変異を適用したまま異常終了していました。復元します:\n" +
      files.map((f) => `  - ${f}`).join("\n"),
  );
  try {
    execFileSync("git", ["checkout", "--", ...files], { cwd: REPO_ROOT, stdio: "inherit" });
    // eslint-disable-next-line no-console
    console.error("[mutation-check] 復元しました。");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[mutation-check] 復元に失敗しました。手動で確認してください。");
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  }
}

function restoreCurrentMutation() {
  // マーカーは git apply の**前**に書くため、apply 自体が失敗した場合は
  // currentlyAppliedFiles が空のままマーカーだけが残る。ここで先に消しておかないと、
  // 次回の実行が「前回は異常終了した」と誤って報告する（実際に m05 のパッチが
  // 適用できなくなったときにこれが起きた）。
  clearMarker();
  if (currentlyAppliedFiles.length === 0) return;
  const files = currentlyAppliedFiles;
  currentlyAppliedFiles = [];
  try {
    execFileSync("git", ["checkout", "--", ...files], { cwd: REPO_ROOT, stdio: "inherit" });
    // eslint-disable-next-line no-console
    console.error(`[mutation-check] 復元しました: ${files.join(", ")}`);
  } catch (e) {
    // 復元自体が失敗するのは最悪のケース。ここで握りつぶさず必ず知らせる。
    // eslint-disable-next-line no-console
    console.error(`[mutation-check] 復元に失敗しました。手動で確認してください: ${files.join(", ")}`);
    // eslint-disable-next-line no-console
    console.error(e);
  }
}

// 異常終了（Ctrl-C・kill・未捕捉例外）でも必ず復元する。
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    restoreCurrentMutation();
    process.exit(130);
  });
}
process.on("uncaughtException", (err) => {
  // eslint-disable-next-line no-console
  console.error("[mutation-check] 捕捉されない例外:", err);
  restoreCurrentMutation();
  process.exit(1);
});

function applyMutation(mutation) {
  const patchPath = path.join(MUTATIONS_DIR, mutation.patch);
  const files = affectedFilesOf(patchPath);
  // マーカーを**先に**書く。git apply の後に書くと、その間に殺された場合に取りこぼす。
  writeMarker(files);
  execFileSync("git", ["apply", patchPath], { cwd: REPO_ROOT, stdio: "inherit" });
  currentlyAppliedFiles = files;
}

function restoreMutation() {
  restoreCurrentMutation();
}

/**
 * 変異が検出を期待するテストファイルが実在するか確かめる。
 *
 * vitest は指定したテストファイルが 1 つも見つからないとき「No test files found」で
 * exit 1 を返す。runTests は status !== 0 を「検出」とみなすので、**テストが消えると
 * 変異検査は全件「検出」と報告して緑になる**。検査が守るはずの「検査が静かに効かなく
 * なる」を、検査自身が起こしていた（#70 の破壊検証で発覚）。
 */
function assertMutationTestsExist() {
  const missing = [];
  for (const mutation of MUTATIONS) {
    for (const rel of mutation.tests) {
      const abs = path.join(WORKSPACE_ROOT, mutation.pkg, rel);
      if (!fs.existsSync(abs)) missing.push(`変異 #${mutation.id}: ${mutation.pkg}/${rel}`);
    }
  }
  if (missing.length === 0) return;
  console.error("検出を期待するテストファイルが見つかりません:");
  for (const m of missing) console.error(`  ${m}`);
  console.error("\n対応表（MUTATIONS）と実ファイルがずれています。どちらかを直してください。");
  process.exit(1);
}

/**
 * 対応表と patch ファイルが全単射であることを確かめる（#135 経路①）。
 *
 * **限界**: 対応表の項目と patch ファイルを**両方**消せば全単射は保たれ、
 * この検査は通る。件数の下限を直書きする対策は採らない — 下限を下げるのが
 * 赤を消す最短経路になり、対応表から項目を消すのと同じ穴になるため
 * （ADR-0014）。patch の削除が diff に現れることをレビューの拠り所とする。
 */
function assertMutationPatchesBijective() {
  if (MUTATIONS.length === 0) {
    console.error("[mutation-check] 変異が 0 件です（検査が空振りします）");
    process.exit(1);
  }
  const declared = MUTATIONS.map((m) => m.patch);
  const actual = fs.readdirSync(MUTATIONS_DIR).filter((f) => f.endsWith(".patch"));
  const diff = diffTargets(declared, actual);
  if (hasTargetDrift(diff)) {
    console.error(formatTargetDiff("mutation-check", diff, `変異 ${declared.length} 件`));
    process.exit(1);
  }
}

/**
 * bun の実行体を解決する。PATH 上に無ければ既定の設置場所へフォールバックする
 * （CI では oven-sh/setup-bun@v2 が PATH へ足すが、ローカルの導入形態は環境によって
 * ばらつくため）。
 */
const BUN_BIN = (() => {
  const onPath = spawnSync("bun", ["--version"], { encoding: "utf8" });
  if (onPath.status === 0) return "bun";
  const fallback = path.join(os.homedir(), ".bun", "bin", "bun");
  if (fs.existsSync(fallback)) return fallback;
  throw new Error(
    "bun 実行体が見つかりません（PATH にも ~/.bun/bin/bun にも無い）。" +
      "apps/timer-sync の変異には bun test が必要です。",
  );
})();

/**
 * パッケージの package.json の scripts.test を見て、実際のテストランナーを判定する。
 * 決め打ちしないのは、ランナーが違うパッケージへ間違ったコマンドを投げると
 * 「テストを1件も実行せずに exit code が非 0 になる」形で誤検出するため
 * （このファイル冒頭のコメント参照）。
 */
function detectRunner(pkgDir) {
  const pkgJsonPath = path.join(pkgDir, "package.json");
  let testScript;
  try {
    testScript = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")).scripts?.test ?? "";
  } catch (e) {
    throw new Error(`package.json の読み込みに失敗しました（${pkgJsonPath}）: ${e.message}`, { cause: e });
  }
  if (testScript.includes("bun test")) return "bun";
  if (/^node --test\b/.test(testScript)) return "node";
  if (testScript.includes("vitest")) return "vitest";
  throw new Error(
    `未知のテストランナーです。scripts.test の内容から判定できません: "${testScript}"（${pkgJsonPath}）`,
  );
}

/** ランナーごとに、実行コマンドと引数を組み立てる。 */
function buildCommand(runner, mutation, full) {
  switch (runner) {
    case "vitest":
      return { cmd: "npx", args: full ? ["vitest", "run"] : ["vitest", "run", ...mutation.tests] };
    case "bun":
      return { cmd: BUN_BIN, args: full ? ["test"] : ["test", ...mutation.tests] };
    case "node": {
      if (full) {
        // scripts.test（例: "node --test tests/*.test.mjs"）をそのまま使う。
        const pkgJsonPath = path.join(WORKSPACE_ROOT, mutation.pkg, "package.json");
        const testScript = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")).scripts.test;
        const [cmd, ...args] = testScript.split(/\s+/);
        return { cmd, args };
      }
      return { cmd: "node", args: ["--test", ...mutation.tests] };
    }
    default:
      throw new Error(`未対応のランナーです: ${runner}`);
  }
}

/**
 * 対象パッケージのテストを、パッケージの実際のランナー（bun test / node --test / vitest）で
 * 実行する。
 * full=false: 対応表のテストファイルのみ（絞り込み実行・既定）。
 * full=true : パッケージ全体（--full）。
 * @returns {{passed: boolean, exitCode: number|null, output: string, command: string}}
 *          passed は「テストが 1 件も落ちずに完走した」= exit code 0。
 *          「検出」かどうかの解釈は呼び出し側（対照実行か変異後の実行か）で決める。
 */
function runTests(mutation, full) {
  const pkgDir = path.join(WORKSPACE_ROOT, mutation.pkg);
  const runner = detectRunner(pkgDir);
  const { cmd, args } = buildCommand(runner, mutation, full);
  const result = spawnSync(cmd, args, {
    cwd: pkgDir,
    stdio: "pipe",
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return {
    passed: result.status === 0,
    exitCode: result.status,
    output,
    command: `${cmd} ${args.join(" ")}（cwd: ${mutation.pkg}, runner: ${runner}）`,
  };
}

function main() {
  const full = process.argv.includes("--full");

  // 未コミット変更の検査より前に行う。前回の異常終了で残った変異を、
  // その検査に引っかからせるのではなく自分で片付けるため。
  recoverFromCrashedRun();

  assertMutationTestsExist();
  assertMutationPatchesBijective();

  const status = gitStatusPorcelain();
  if (status.trim() !== "") {
    console.error(
      "[mutation-check] 作業ツリーに未コミットの変更があります。変異検査は復元のために\n" +
        "git checkout -- を使うため、未コミット変更があると消えてしまいます。\n" +
        "コミットまたは退避してから再実行してください。\n\n" +
        "git status --porcelain の出力:\n" +
        status,
    );
    process.exit(1);
  }

  console.log(`[mutation-check] モード: ${full ? "--full（パッケージ全体）" : "絞り込み実行（対応表のテストのみ）"}`);
  console.log(`[mutation-check] リポジトリルート: ${REPO_ROOT}`);
  console.log(`[mutation-check] 変異数: ${MUTATIONS.length}\n`);

  const results = [];

  for (const mutation of MUTATIONS) {
    console.log(`--- 変異 #${mutation.id}: ${mutation.label} ---`);

    // 対照実行: 変異を当てる前の素のコードで、同じコマンドがまず通ることを確認する。
    // ここが通らない場合、この後の「検出」判定はランナーが起動できているかどうかすら
    // 保証されておらず無意味なので、「検出」とは報告せず即座に止める。
    const control = runTests(mutation, full);
    if (!control.passed) {
      console.error(
        `\n[mutation-check] 変異 #${mutation.id} の対照実行が失敗しました` +
          `（変異を当てる前の素のコードでテストが通りませんでした）。\n` +
          `  実行コマンド: ${control.command}\n` +
          `  exit code: ${control.exitCode}\n\n` +
          "対応表（MUTATIONS）のパッケージ・テストパス・ランナー判定を確認してください。\n" +
          "この状態で先へ進むと、変異が原因で落ちたのか元から落ちていたのか区別できません。\n\n" +
          "--- 対照実行の出力（末尾） ---\n" +
          control.output.split("\n").slice(-40).join("\n"),
      );
      process.exit(1);
    }
    console.log(`  対照: ○ 通過（${control.command}）`);
    console.log(
      "    " +
        control.output
          .trim()
          .split("\n")
          .slice(-3)
          .join("\n    "),
    );

    let outcome;
    try {
      applyMutation(mutation);
      const testResult = runTests(mutation, full);
      outcome = { ...mutation, detected: !testResult.passed, exitCode: testResult.exitCode, output: testResult.output };
    } finally {
      restoreMutation();
    }
    console.log(
      `  検出: ${outcome.detected ? "○ 検出された" : "× 検出されなかった"}` +
        `（exit code ${outcome.exitCode}）`,
    );
    if (!outcome.detected) {
      // 検出できなかった詳細はベースラインの妥当性検査で重要になるので出力しておく。
      console.log("  --- テスト出力（末尾） ---");
      console.log(outcome.output.split("\n").slice(-40).join("\n"));
    }
    results.push(outcome);
  }

  // ─── 結果表 ────────────────────────────────────────────────────────────
  console.log("\n=== 変異検査 結果表 ===");
  console.log("# | 検出 | 対象パッケージ | 変異");
  for (const r of results) {
    console.log(`${r.id} | ${r.detected ? "検出" : "未検出"} | ${r.pkg} | ${r.label}`);
  }

  const undetected = results.filter((r) => !r.detected);

  // ─── T006: ベースラインの妥当性検査 ────────────────────────────────────
  // 「検出されない変異は前後比較の材料にならず、表が一致したという誤った安心を
  //  与える」（plan.md）ため、1件でも未検出があれば必ずエラー終了する。
  if (undetected.length > 0) {
    console.error(
      `\n[mutation-check] ベースラインの妥当性検査に失敗しました: ` +
        `${undetected.length} 件の変異が検出されませんでした（# ${undetected.map((r) => r.id).join(", ")}）。\n` +
        "変異を差し替えるか、検出できるテストを先に追加してください（FR-098）。",
    );
    process.exit(1);
  }

  console.log("\n[mutation-check] 全変異が検出されました（ベースラインとして妥当）。");
  process.exit(0);
}

main();
