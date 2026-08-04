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
 * 安全性:
 * - 作業ツリーに未コミット変更がある状態では実行を拒否する（変異が復元で消えると
 *   取り返しがつかないため）。
 * - 復元は git checkout -- で行い、異常終了（Ctrl-C 含む）時にも必ず実行する。
 *   「現在適用中の変異」をモジュールスコープの変数で追跡し、シグナルハンドラ・
 *   uncaughtException ハンドラの両方から同じ復元処理を呼べるようにしている。
 */

import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

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
 * 対象パッケージで vitest を実行する。
 * full=false: 対応表のテストファイルのみ（絞り込み実行・既定）。
 * full=true : パッケージ全体（--full）。
 * @returns {boolean} テストが（1件以上）落ちたら true（＝変異を検出できた）
 */
function runTests(mutation, full) {
  const pkgDir = path.join(WORKSPACE_ROOT, mutation.pkg);
  const args = full ? ["vitest", "run"] : ["vitest", "run", ...mutation.tests];
  const result = spawnSync("npx", args, {
    cwd: pkgDir,
    stdio: "pipe",
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const detected = result.status !== 0;
  return { detected, exitCode: result.status, output };
}

function main() {
  const full = process.argv.includes("--full");

  // 未コミット変更の検査より前に行う。前回の異常終了で残った変異を、
  // その検査に引っかからせるのではなく自分で片付けるため。
  recoverFromCrashedRun();

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
    let outcome;
    try {
      applyMutation(mutation);
      const testResult = runTests(mutation, full);
      outcome = { ...mutation, ...testResult };
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
