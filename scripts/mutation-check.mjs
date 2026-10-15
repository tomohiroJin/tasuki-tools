#!/usr/bin/env node
/**
 * 変異検査（FR-098）。
 *
 * `scripts/mutations/*.patch` の変異を1件ずつ適用し、対応する「検出を期待するテスト」
 * （既定）または属するパッケージ全体（--full）を実行して、検出できたか（テストが落ちたか）
 * を記録したあと、必ず `git checkout --` で元に戻す。
 *
 * plan.md 「変異と『検出を期待するテスト』の対応表」の実装。表が正本であり、
 * 宣言の表 MUTATIONS（`scripts/lib/mutation-declarations.mjs`。#380 で機構から分けた）はその実装にすぎない。
 *
 * 使い方:
 *   node scripts/mutation-check.mjs         対応表のテストのみ実行
 *   node scripts/mutation-check.mjs --full   変異の属するパッケージ全体を実行
 *   node scripts/mutation-check.mjs --changed           origin/main との差分に関係する変異だけ（#387）
 *   node scripts/mutation-check.mjs --changed --base <ref>  基準を変える（積み上げた枝・機構を変えた枝）
 *   node scripts/mutation-check.mjs --id 150,151        番号で選ぶ
 *   node scripts/mutation-check.mjs --pkg apps/roulette-web  pkg の完全一致で選ぶ
 *   選び方は 1 回に 1 つ。知らない指定はエラー。CI は指定なし（全件）で流す。
 *   選び方の規則は scripts/lib/mutation-select.mjs と設計正本
 *   docs/superpowers/specs/2026-10-14-test-weight-design.md §4。
 *
 * テストランナー:
 * リポジトリには 3 種類のランナーが混在する（apps/tasuki-sync は bun test、
 * packages/ui は node --test、それ以外は vitest）。全パッケージへ npx vitest を
 * 決め打ちすると、ランナーが違うパッケージでは「コマンドが見つからない」まま
 * exit code が非 0 になり、テストを 1 件も実行せずに「検出」と誤報告する
 * （#136 で発覚。apps/tasuki-sync の変異 #3・#5・#10 がこの状態だった）。
 * これを避けるため、対象ディレクトリの package.json の scripts.test からランナーを
 * 判定し（detectRunner）、そのランナーで直接テストファイルを指定して実行する。
 *
 * 変異の対象は「パッケージ」に限らない。`scripts/` は package.json を持たないが
 * 検査本体とその自己テストが同居しており、ここも変異対象にする（#174）。
 * package.json を持たないディレクトリのランナーは node（`node --test`）を既定にする
 * （detectRunner の docstring を参照）。
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
 * - **同じ作業ツリーで 2 つ以上を同時に走らせない**（ロックで拒む）。
 *   2 つが同時に走ると、片方の `git apply` を片方の `git checkout --` が消し、
 *   互いの復元の帳簿（`currentlyAppliedFiles` とマーカー）が食い違う。結果として
 *   **変異が当たったまま残り、マーカーも消える**という、どちらの復旧経路でも
 *   拾えない状態になる。2026-09-08 に実際に起きた —— レビューを並列で回した
 *   エージェントの 1 体が共有の作業ツリーでこれを完走させ、`stale-frame.ts` に
 *   変異が残った。踏んだ側は原因を「9p マウント固有の失敗」と誤診している。
 */

import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  diffTargets,
  hasTargetDrift,
  formatTargetDiff,
  hasZeroScanTargets,
} from "./lib/scan-targets.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";
import { parseSelector, selectMutations, mechanismFilesFrom, formatSelectionHeader } from "./lib/mutation-select.mjs";
import { createControlCache } from "./lib/mutation-control-cache.mjs";
import { MUTATIONS } from "./lib/mutation-declarations.mjs";

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
 * 作業ツリーの汚れを見る。ただし本スクリプト自身の置き場（scripts/mutation-check.mjs・
 * 宣言の表 scripts/lib/mutation-declarations.mjs・scripts/mutations/）は除外する（表は #380 で分けた）。
 *
 * 理由（鶏と卵の問題）: T004〜T006（本スクリプトと変異パッチの新設）は、この安全確認の
 * 対象になる「作業ツリーの変更」そのものである。これらは patch の適用・復元が一切
 * 触らないパスであり、除外しても「変異を適用してから git checkout -- で戻す」際の
 * 安全性には影響しない。真に守るべきは、パッチが触る製品/テストコードに既存の
 * 未コミット変更が残っていないことである。
 */
export const DIRTY_CHECK_EXCLUDES = ["scripts/mutation-check.mjs", "scripts/lib/mutation-declarations.mjs", "scripts/mutations"];

function gitStatusPorcelain() {
  return execFileSync(
    "git",
    ["status", "--porcelain", "--", ".", ...DIRTY_CHECK_EXCLUDES.map((p) => `:(exclude)${p}`)],
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
 * 同時実行を拒むためのロック。自分の PID を書く。
 *
 * **マーカー（`.applied`）とは役目が違う。** あちらは「異常終了した過去の実行」の
 * 後始末で、こちらは「いま並走している別の実行」を止める。片方だけでは、
 * 2 つが同時に走って互いの復元を潰し合う経路（ヘッダの docstring）を塞げない。
 */
const LOCK_PATH = path.join(MUTATIONS_DIR, ".lock");

/**
 * その PID のプロセスが生きているか。
 *
 * `process.kill(pid, 0)` はシグナルを送らずに存在だけを確かめる。`EPERM` は
 * 「居るが自分には送れない」なので**生きている**側に数える（別ユーザーの実行を
 * 死んだものと見なして踏み潰さない）。
 */
export function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

/**
 * 既存のロックを見て、実行を拒む理由を返す（拒まないなら null）。
 *
 * **判定を純粋関数にしてある**（I/O は呼び出し側）。ロックの有無で分岐する経路は
 * 実際に 2 つ走らせないと再現できず、そのままではテストが書けないため。
 *
 * 壊れたロック（PID として読めない中身）は**無いものとして扱う**。中身が壊れるのは
 * 書き込みの途中で殺された場合が主で、そのとき書き手はもう死んでいる。拒む側へ
 * 倒すと、誰も走っていないのに永久に実行できなくなる（消し方を知らない人が詰む）。
 * 代わりに呼び出し側が警告を出す。
 */
export function lockRefusalReason(rawLockText, isAlive = isPidAlive) {
  if (rawLockText === null || rawLockText === undefined) return null;
  const pid = Number.parseInt(String(rawLockText).trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (!isAlive(pid)) return null;
  return (
    `[mutation-check] 同じ作業ツリーで別の実行（PID ${pid}）が走っています。\n` +
    "2 つを同時に走らせると、片方の変異をもう片方の復元が消し、**変異が当たったまま**\n" +
    "残ることがあります。終わるのを待ってから再実行してください。\n\n" +
    `そのプロセスがもう居ないと分かっている場合だけ、${path.relative(REPO_ROOT, LOCK_PATH)} を消してください。`
  );
}

/** ロックを取る。取れなければ理由を出して非 0 で終わる。 */
function acquireLock() {
  const raw = fs.existsSync(LOCK_PATH) ? fs.readFileSync(LOCK_PATH, "utf8") : null;
  const reason = lockRefusalReason(raw);
  if (reason !== null) {
    console.error(reason);
    process.exit(1);
  }
  if (raw !== null) {
    console.error(
      `[mutation-check] 前回の実行が残したロックを引き取ります（中身: ${JSON.stringify(raw.trim())}）。`,
    );
  }
  // 置き場が無いことがある（エントリ判定のテストはこのスクリプトだけを一時ディレクトリへ
  // 複製して起動する）。ロックが取れないせいで main() に入れないのは筋が違うので作る。
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  fs.writeFileSync(LOCK_PATH, String(process.pid), "utf8");
  // **exit で必ず外す。** main() は複数の場所で process.exit するので、
  // 呼び出し箇所ごとに解放を書くと必ずどれかが漏れる。
  process.on("exit", releaseLock);
}

/** ロックを外す。**自分が書いたものだけ**を消す。 */
function releaseLock() {
  try {
    if (!fs.existsSync(LOCK_PATH)) return;
    if (fs.readFileSync(LOCK_PATH, "utf8").trim() !== String(process.pid)) return;
    fs.rmSync(LOCK_PATH);
  } catch {
    // 解放に失敗しても終了は妨げない。次の実行が「死んだ PID のロック」として引き取る。
  }
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

  const outcome = decideCrashRecovery(files, {
    checkoutFn: () =>
      execFileSync("git", ["checkout", "--", ...files], { cwd: REPO_ROOT, stdio: "inherit" }),
    isRestoredFn: () => isRestoredToHead(files),
    waitFn: () => sleepSync(RESTORE_RETRY_DELAY_MS),
    clearMarkerFn: clearMarker,
    // eslint-disable-next-line no-console
    logFn: (msg) => console.error(msg),
  });

  // 致命的（戻らなかった）ときだけ非 0 で終了する。マーカーは decideCrashRecovery が
  // 意図的に残しているので、ここで消さない。
  if (outcome.restored === false) process.exit(1);
}

/** 復元の再試行回数と待機時間。index.lock の競合は一過性という前提で決めた値。 */
const RESTORE_MAX_ATTEMPTS = 5;
const RESTORE_RETRY_DELAY_MS = 300;

/**
 * 復元を再試行込みで実行し、最終的に戻ったかどうかを判定する。
 *
 * **「コマンドが成功した」と「実際に戻った」は別の事実である。** `git checkout --` の
 * 失敗（`.git/index.lock` の競合等）は一過性なので、`checkoutFn` が例外を投げても
 * 即座には諦めない。一方 `checkoutFn` が例外を投げずに終わっても、それだけでは
 * 戻ったとは判定しない —— 必ず `isRestoredFn` で実際に HEAD と一致したかを確かめる。
 * 両方の意味で「コマンドの結果」を鵜呑みにしない。
 *
 * **判定を純粋関数にしてある**（実 I/O は呼び出し側が注入する）。git のロック競合は
 * 実際に再現しなくても、「コマンドは成功したのにファイルが戻っていない」状況を
 * 注入した関数で作れば、再試行の回数・打ち切りの判定はテストできる。
 *
 * @param {string[]} files - 復元対象（REPO_ROOT からの相対パス）
 * @param {object} io
 * @param {() => void} io.checkoutFn - 復元コマンドを 1 回試みる。失敗時は投げてよい
 *   （ここで捕まえ、次の試行へ回す。最後の試行の例外も握りつぶし、戻ったかどうかは
 *   常に isRestoredFn で判定する）
 * @param {() => boolean} io.isRestoredFn - files が HEAD と一致していれば true
 * @param {(attempt: number) => void} io.waitFn - 次の試行前の待機（試行番号を渡す）
 * @param {number} [io.maxAttempts]
 * @returns {{ restored: boolean, attempts: number }}
 */
export function restoreWithRetry(
  files,
  { checkoutFn, isRestoredFn, waitFn, maxAttempts = RESTORE_MAX_ATTEMPTS },
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      checkoutFn();
    } catch {
      // 投げても即座には諦めない。index.lock の競合は一過性であり得るため、
      // 最終判定は下の isRestoredFn に委ねる（コマンドの成否では判定しない）。
    }
    if (isRestoredFn()) return { restored: true, attempts: attempt };
    if (attempt < maxAttempts) waitFn(attempt);
  }
  return { restored: false, attempts: maxAttempts };
}

/**
 * 復元に失敗したときの、見逃しようのないメッセージを組み立てる（純粋関数）。
 *
 * 長い走行のログに `console.error` の 1 行が流れて見逃された実例があるため、
 * **致命的である旨・試行回数・残っているファイル名**を必ず含める。
 */
export function formatRestoreFailureMessage(files, attempts) {
  return (
    `[mutation-check] 致命的: ${attempts} 回試行しても復元できませんでした。\n` +
    "製品コードに変異が当たったままです（認証バイパスや入力検証の迂回を含みうる）。\n" +
    "手動で以下を確認し、必要なら git checkout -- で戻してください:\n" +
    files.map((f) => `  - ${f}`).join("\n")
  );
}

/**
 * 復元を再試行込みで実行し、**戻ったと確認できてから初めてマーカーを消す**。
 * `restoreCurrentMutation`（通常サイクルの復元）と `recoverFromCrashedRun`
 * （前回の異常終了からの復旧）の両方が、この 1 つの関数を通してマーカーを消す。
 *
 * **なぜ 2 箇所から呼ぶ 1 つの関数にしたか。** 「検証してから消す」という規則を
 * 最初は `recoverFromCrashedRun` 側の判定（旧 `decideCrashRecovery` 独自実装）
 * にだけ入れ、`restoreCurrentMutation` の主経路（毎回の変異適用→復元）には
 * 入れ忘れていた実績がある（レビューで指摘された）。あちらは
 * `clearMarker()` が `currentlyAppliedFiles.length === 0` の判定より**前**にあり、
 * 通常サイクルでも復元の成否に関わらずマーカーが先に消えていた。同じ規則を
 * 2 箇所に別々に書くと、片方を直したときもう片方が古いまま取り残される
 * （このリポジトリの記録にある「対策は自分が塞ぐ欠陥を持つ」そのもの）。
 * ここで一本化し、二度目の取り残しを構造的に起こせなくする。
 *
 * `files.length === 0` のときだけ、検証を待たずにマーカーを消す。これは
 * 「そもそも戻すものが無い」ケース（`restoreCurrentMutation` 側でいう、
 * `git apply` 自体が失敗して何も適用されていない状態。マーカーは `git apply`
 * の**前**に書くため、apply が失敗すると空の `currentlyAppliedFiles` と
 * マーカーだけが残る。実際に m05 のパッチでこれが起きた）と、
 * `recoverFromCrashedRun` 側でいう「マーカーの中身が壊れて空」のケースを兼ねる。
 * どちらも戻す対象が無いので、検証する意味がない。
 *
 * `files.length > 0` のときは、`restoreWithRetry` が「戻った」と確認できてから
 * `clearMarkerFn` を呼ぶ。戻らなければマーカーは**残したまま**致命的な結果を返す。
 * ここで消してしまうと、復元が失敗したときに「変異が製品コードに残っている」
 * という唯一の記録が消え、次回の起動（`recoverFromCrashedRun`）が
 * 復旧を試みなくなる（`process.exit(1)` で人には見えても、状態としては失われる）。
 *
 * @param {string[]} files
 * @param {object} io
 * @param {() => void} io.checkoutFn
 * @param {() => boolean} io.isRestoredFn
 * @param {(attempt: number) => void} io.waitFn
 * @param {() => void} io.clearMarkerFn - 戻ったこと（または戻すものが無いこと）が
 *   確認できたときだけ呼ばれる
 * @param {(attempts: number) => void} [io.onRestored] - 戻ったときに 1 度だけ呼ばれる
 *   （呼び出し側ごとに文言が違うログはここで出す）
 * @param {number} [io.maxAttempts]
 * @returns {{ restored: boolean | null, attempts?: number }} restored が null なら
 *   「戻すものが無かった」（files が空）。
 */
export function verifyRestoreAndClearMarker(
  files,
  { checkoutFn, isRestoredFn, waitFn, clearMarkerFn, onRestored = () => {}, maxAttempts = RESTORE_MAX_ATTEMPTS },
) {
  if (files.length === 0) {
    clearMarkerFn();
    return { restored: null };
  }

  const result = restoreWithRetry(files, { checkoutFn, isRestoredFn, waitFn, maxAttempts });

  if (result.restored) {
    // ここまで来て初めて「戻った」と確認できたので、ここでマーカーを消す。
    clearMarkerFn();
    onRestored(result.attempts);
    return { restored: true, attempts: result.attempts };
  }

  // マーカーはあえて消さない（上のコメント参照）。次回の起動がここをもう一度拾う。
  return { restored: false, attempts: result.attempts };
}

/**
 * 前回の実行が変異を適用したまま終了していた場合の復旧を判定する（recoverFromCrashedRun の判定部分）。
 * マーカーを消すタイミングの規則は `verifyRestoreAndClearMarker` に一本化してある。
 *
 * @param {string[]} files - マーカーから読んだ、適用中だったはずのファイル一覧
 * @param {object} io
 * @param {() => void} io.checkoutFn
 * @param {() => boolean} io.isRestoredFn
 * @param {(attempt: number) => void} io.waitFn
 * @param {() => void} io.clearMarkerFn
 * @param {(msg: string) => void} [io.logFn]
 * @param {number} [io.maxAttempts]
 * @returns {{ restored: boolean | null, attempts?: number }}
 */
export function decideCrashRecovery(
  files,
  { checkoutFn, isRestoredFn, waitFn, clearMarkerFn, logFn = () => {}, maxAttempts = RESTORE_MAX_ATTEMPTS },
) {
  if (files.length > 0) {
    logFn(
      "[mutation-check] 前回の実行が変異を適用したまま異常終了していました。復元します:\n" +
        files.map((f) => `  - ${f}`).join("\n"),
    );
  }

  const outcome = verifyRestoreAndClearMarker(files, {
    checkoutFn,
    isRestoredFn,
    waitFn,
    clearMarkerFn,
    onRestored: (attempts) => {
      logFn(
        "[mutation-check] 復元しました。" +
          (attempts > 1 ? `（${attempts} 回目の試行で確認）` : ""),
      );
    },
    maxAttempts,
  });

  if (outcome.restored === false) {
    logFn(formatRestoreFailureMessage(files, outcome.attempts));
  }

  return outcome;
}

/**
 * files が HEAD と一致しているか（`git status --porcelain` の出力が空かどうかで見る）。
 *
 * **将来の注意（Minor・レビュー指摘）**: 変異パッチが**新規ファイルを追加する**形になると、
 * `git checkout --` では新規ファイルは消えず `git status --porcelain` が「?? 」行を
 * 返し続けるため、`isRestoredFn` が永久に false を返し `restoreWithRetry` が
 * 毎回致命的終了する（安全側の誤検知であり本番へは出ないが、そのままでは復旧不能）。
 * 現行の `MUTATIONS`（既存ファイルの変更のみ）には該当が無い。新規ファイルを追加する
 * 変異を足す場合は、`git clean` 等で未追跡ファイルも戻す手当てが別途必要になる。
 */
function isRestoredToHead(files) {
  const out = execFileSync("git", ["status", "--porcelain", "--", ...files], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return out.trim() === "";
}

/** 再試行の待機（同期）。SharedArrayBuffer + Atomics.wait は追加依存なしで同期待機できる。 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * `restoreCurrentMutation`（通常サイクルの復元）の判定部分。`decideCrashRecovery`
 * と対になる形（実 I/O を呼び出し側が注入する・ログ文言だけ持つ）にして、
 * `restoreCurrentMutation` 本体を「モジュール変数を読んで実 I/O を注入するだけの
 * 配線」に薄く保つ。マーカーを消すタイミングの規則自体は `verifyRestoreAndClearMarker`
 * に一元化してあるので、ここでは持たない（**同じ規則を 2 つ持たない**）。
 *
 * @param {string[]} files - 直前の変異で `git apply` した（はずの）ファイル一覧
 * @param {object} io
 * @param {() => void} io.checkoutFn
 * @param {() => boolean} io.isRestoredFn
 * @param {(attempt: number) => void} io.waitFn
 * @param {() => void} io.clearMarkerFn
 * @param {(msg: string) => void} [io.logFn]
 * @param {number} [io.maxAttempts]
 * @returns {{ restored: boolean | null, attempts?: number }}
 */
export function decideMutationRestore(
  files,
  { checkoutFn, isRestoredFn, waitFn, clearMarkerFn, logFn = () => {}, maxAttempts = RESTORE_MAX_ATTEMPTS },
) {
  const outcome = verifyRestoreAndClearMarker(files, {
    checkoutFn,
    isRestoredFn,
    waitFn,
    clearMarkerFn,
    onRestored: (attempts) => {
      logFn(
        `[mutation-check] 復元しました: ${files.join(", ")}` +
          (attempts > 1 ? `（${attempts} 回目の試行で確認）` : ""),
      );
    },
    maxAttempts,
  });

  if (outcome.restored === false) {
    logFn(formatRestoreFailureMessage(files, outcome.attempts));
  }

  return outcome;
}

/**
 * `restoreCurrentMutation` 本体。判定は `decideMutationRestore`（→
 * `verifyRestoreAndClearMarker`）に委ねてあり、そちらは単体テストで直接検証している
 * （`mutation-check.test.mjs` の「マーカーを消すタイミング」「通常サイクルの復元判定」節）。
 *
 * **この関数自体は単体テストの対象に入っていない。** モジュール内変数
 * （`currentlyAppliedFiles`）と実 `execFileSync`・実 `fs`・`process.exit` に
 * 直接依存しており、シグナルハンドラ（下）からも呼ばれる副作用の塊のため、
 * 安く注入可能な形にできなかった（`recoverFromCrashedRun` も同じ理由で同様）。
 * ここを直接壊す変更（例: 実引数の組み方や `process.exit` の条件）は、
 * E2E（`tests/e2e` のルーム離脱系）と、CI 上で本検査自身が自分の変異パッチを
 * 実際に適用・復元して回る実行でしか捕まらない。
 */
function restoreCurrentMutation() {
  const files = currentlyAppliedFiles;
  currentlyAppliedFiles = [];

  const outcome = decideMutationRestore(files, {
    checkoutFn: () =>
      execFileSync("git", ["checkout", "--", ...files], { cwd: REPO_ROOT, stdio: "inherit" }),
    isRestoredFn: () => isRestoredToHead(files),
    waitFn: () => sleepSync(RESTORE_RETRY_DELAY_MS),
    clearMarkerFn: clearMarker,
    // eslint-disable-next-line no-console
    logFn: (msg) => console.error(msg),
    maxAttempts: RESTORE_MAX_ATTEMPTS,
  });

  if (outcome.restored === false) process.exit(1);
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
 * （ADR-0014 決定 8）。patch の削除が diff に現れることをレビューの拠り所とする。
 *
 * 下の 0 件ガードは「下限の直書き」の例外（ADR-0014 決定 8 の但し書き）。
 * 0 件（空振り）は「何も検証していない」状態そのものであり、維持コストが
 * 要る閾値ではないため、下限を直書きしない MUST NOT の対象に含めない。
 */
function assertMutationPatchesBijective() {
  // 0 件（空振り）の判定は共有モジュールへ寄せる（ADR-0014 決定 8。集約は #135 設計正本 D10）。
  if (hasZeroScanTargets(MUTATIONS.length)) {
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
let bunBinCache = null;
function resolveBunBin() {
  if (bunBinCache !== null) return bunBinCache;
  const onPath = spawnSync("bun", ["--version"], { encoding: "utf8" });
  if (onPath.status === 0) {
    bunBinCache = "bun";
    return bunBinCache;
  }
  const fallback = path.join(os.homedir(), ".bun", "bin", "bun");
  if (fs.existsSync(fallback)) {
    bunBinCache = fallback;
    return bunBinCache;
  }
  throw new Error(
    "bun 実行体が見つかりません（PATH にも ~/.bun/bin/bun にも無い）。" +
      "apps/tasuki-sync の変異には bun test が必要です。",
  );
}

/**
 * 対象ディレクトリの package.json の scripts.test を見て、実際のテストランナーを判定する。
 * 決め打ちしないのは、ランナーが違うパッケージへ間違ったコマンドを投げると
 * 「テストを1件も実行せずに exit code が非 0 になる」形で誤検出するため
 * （このファイル冒頭のコメント参照）。
 *
 * **package.json を持たないディレクトリは node（`node --test`）を既定にする**（#174）。
 * `scripts/` がそれで、検査本体とその自己テストが同居しているのに package.json が無いため、
 * 以前はここが例外で落ちて変異対象にできなかった。既定を node にするのは、
 * 「設定を持たないディレクトリで、設定なしに動く唯一のランナー」だからである。
 * **`pkgDir` の名前を見て `scripts` なら node、という特別扱いはしない** — 対象が
 * 増えるたびに腐る（列挙ではなく機構で指す）。
 *
 * この既定が誤った対象へ当たっても、誤検出には育たない。宣言の `pkg` が実在しない
 * ディレクトリなら {@link assertMutationTestsExist} が先に落とし、ランナーが違えば
 * 変異を当てる前の対照実行が落ちる。既定は「静かに間違える」経路を新しく作らない。
 *
 * **「無い」と「読めない」は混ぜない。** package.json が実在するのに壊れている・
 * 未知のランナーを指しているときは、既定へ倒さず例外にする。倒すと、設定を
 * 黙って無視して別のランナーで走らせることになる。
 */
export function detectRunner(pkgDir) {
  const pkgJsonPath = path.join(pkgDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) return "node";
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
export function buildCommand(runner, mutation, full) {
  switch (runner) {
    case "vitest":
      return { cmd: "npx", args: full ? ["vitest", "run"] : ["vitest", "run", ...mutation.tests] };
    case "bun":
      return { cmd: resolveBunBin(), args: full ? ["test"] : ["test", ...mutation.tests] };
    case "node": {
      if (full) {
        // package.json があれば scripts.test（例: "node --test tests/*.test.mjs"）を
        // そのまま使う。パッケージが自分で決めた「全体実行」がそれだからである。
        const pkgJsonPath = path.join(WORKSPACE_ROOT, mutation.pkg, "package.json");
        if (fs.existsSync(pkgJsonPath)) {
          const testScript = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")).scripts.test;
          const [cmd, ...args] = testScript.split(/\s+/);
          return { cmd, args };
        }
        // package.json が無い対象（scripts/ 等）は、ファイルを 1 つも指定せずに
        // `node --test` を対象ディレクトリで走らせ、**探索は node 自身に任せる**。
        // ここへテストファイルの列挙やグロブを書くと、CI が使っている導出
        // （`node scripts/list-scan-targets.mjs script-tests`）と二重管理になり、
        // 片側だけ直したときに黙ってずれる（#135・ADR-0014）。
        return { cmd: "node", args: ["--test"] };
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
 * full=false: 対応表のテストファイルのみ（既定）。
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

/**
 * `--changed` の差分: 基準と HEAD の merge-base から HEAD までのコミット済みの変更に、
 * 未コミットの変更と未追跡のファイルを足したもの（#387）。
 * `gitStatusPorcelain` が機構とパッチの置き場を除外するので、そこの未コミットの変更は
 * 実行が止まらない。数えないと変異を書き足した直後の `--changed` が新しい変異を選ばない。
 * **`--no-renames`**: 既定の改名検出は旧パスを出さず、パッケージの外へ移したファイルの元の側を落とす。
 * 取れなければ null を返し、選び方の側が全件に倒す。
 */
function changedFilesSince(base) {
  try {
    const opts = { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
    const mergeBase = execFileSync("git", ["merge-base", base, "HEAD"], opts).trim();
    const lines = (args) =>
      execFileSync("git", ["-c", "core.quotePath=false", ...args], opts)
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    return [
      ...new Set([
        ...lines(["diff", "--name-only", "--no-renames", mergeBase, "HEAD"]),
        ...lines(["diff", "--name-only", "--no-renames", "HEAD"]),
        ...lines(["ls-files", "--others", "--exclude-standard"]),
      ]),
    ];
  } catch {
    return null;
  }
}

/** git の ref（コミットを指すもの）が存在するか。--base の打ち間違いを検出する。 */
function refExists(ref) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
      cwd: REPO_ROOT,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * parseSelector の結果に、`--changed` のときだけ選び方の材料を足す。
 * リポジトリのルートとワークスペースのルートが違うときは、`pkg`（ワークスペース基準）と
 * 差分（リポジトリ基準）を比べられないので、差分を null にして全件に倒す。
 */
function resolveSelector(selector) {
  if (selector.kind !== "changed") return selector;
  const self = fileURLToPath(import.meta.url);
  return {
    ...selector,
    changedFiles: REPO_ROOT === WORKSPACE_ROOT ? changedFilesSince(selector.base) : null,
    mechanismFiles: mechanismFilesFrom(fs.readFileSync(self, "utf8"), path.relative(REPO_ROOT, self)),
    patchDir: path.relative(REPO_ROOT, MUTATIONS_DIR),
    affectedFilesOf: (m) => affectedFilesOf(path.join(MUTATIONS_DIR, m.patch)),
  };
}

/** 対照実行の使い回しの鍵。cwd（pkg）と、実際に流すコマンドと引数。 */
export function controlKeyOf(mutation, full) {
  const runner = detectRunner(path.join(WORKSPACE_ROOT, mutation.pkg));
  return JSON.stringify([mutation.pkg, buildCommand(runner, mutation, full)]);
}

function main() {
  const full = process.argv.includes("--full");

  // **指定の誤りはロックより前に止める。** 何も触らずに終わらせるため（#387）。
  let selector;
  let selection;
  try {
    selector = parseSelector(process.argv.slice(2));
    if (selector.kind === "changed" && selector.baseExplicit && !refExists(selector.base)) {
      throw new Error(`--base の ref が見つかりません: ${selector.base}`);
    }
    selection = selectMutations(MUTATIONS, resolveSelector(selector));
  } catch (e) {
    console.error(`[mutation-check] ${e.message}`);
    process.exit(1);
  }
  const header = formatSelectionHeader(selector, selection, MUTATIONS.length);
  // **復元より前にロックを取る。** 復元自体が `git checkout --` を撃つので、
  // 並走している実行の変異をここで消してしまう経路がある。
  acquireLock();

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

  if (selection.selected.length === 0) {
    // `--changed` の 0 件は正常な結果（docs だけの枝など）。--id / --pkg の 0 件は selectMutations がエラーにする。
    // **ロック・復元・健全性の検査・未コミット変更の検査を通ったあとで終える**（緑が「検査した」を意味するため）。
    // ロックの解放は process.on("exit") が行う
    console.log(`[mutation-check] ${header}。この差分に該当する変異はありません。`);
    process.exit(0);
  }

  console.log(`[mutation-check] モード: ${full ? "--full（パッケージ全体）" : "対応表のテストのみ"}`);
  console.log(`[mutation-check] リポジトリルート: ${REPO_ROOT}`);
  console.log(`[mutation-check] ${header}\n`);
  const startedAt = Date.now();
  let controlMs = 0;
  const controls = createControlCache(
    (m) => controlKeyOf(m, full),
    (m) => {
      const t = Date.now();
      const r = runTests(m, full);
      controlMs += Date.now() - t;
      return r;
    },
    // 使い回す直前に、作業ツリーが汚れていないことを main の冒頭と同じ検査で確かめる
    () => gitStatusPorcelain().trim() === "",
  );

  const results = [];

  for (const { mutation, reasons } of selection.selected) {
    console.log(`--- 変異 #${mutation.id}: ${mutation.label} ---`);
    if (selector.kind === "changed" && selection.fallbackToAll === null) {
      console.log(`  選んだ理由: ${reasons.join("・")}`);
    }

    // 対照実行: 変異を当てる前の素のコードで、同じコマンドがまず通ることを確認する。
    // ここが通らない場合、この後の「検出」判定はランナーが起動できているかどうかすら
    // 保証されておらず無意味なので、「検出」とは報告せず即座に止める。
    const control = controls.run(mutation);
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
    console.log(`  対照: ○ 通過${control.reused ? "（使い回し）" : ""}（${control.command}）`);
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
  console.log(`\n=== 変異検査 結果表（${header}）===`);
  console.log("# | 検出 | 対象パッケージ | 変異");
  for (const r of results) {
    console.log(`${r.id} | ${r.detected ? "検出" : "未検出"} | ${r.pkg} | ${r.label}`);
  }

  const sec = (ms) => (ms / 1000).toFixed(0);
  console.log(
    `\n[mutation-check] 所要時間: ${sec(Date.now() - startedAt)} 秒` +
      `（対照実行 ${sec(controlMs)} 秒・対照の使い回し ${controls.reusedCount} 回・変異 ${results.length} 件）`,
  );

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

  console.log(
    selector.kind === "all" || selection.fallbackToAll !== null
      ? "\n[mutation-check] 全変異が検出されました（ベースラインとして妥当）。"
      : `\n[mutation-check] 選んだ ${results.length} 件の変異がすべて検出されました（全件ではありません。全件は CI が流します）。`,
  );
  process.exit(0);
}

// 直接実行されたときだけ走らせる。自己テスト（mutation-check.test.mjs）は
// このファイルから import するだけで、変異は当てない。
if (isDirectRun(import.meta.url, process.argv[1])) main();
