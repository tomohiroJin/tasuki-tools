#!/usr/bin/env node
/**
 * 本番に配った後の確かめを 1 コマンドで流す（#675）。**読むだけ**で、本番へは何も書かない。
 *
 *     TASUKI_E2E_BASE_URL=https://<公開ドメイン> pnpm verify:prod          # 配信のハッシュ・公開パス・/ws
 *     TASUKI_E2E_BASE_URL=https://<公開ドメイン> pnpm verify:prod --e2e    # 揃っていれば、続けて pnpm e2e:prod
 *
 * 公開中の道具（`deploy/<app>/app.env` と `deploy/README.md` の「アプリ一覧」の表から導く）ごとに、
 * 配信の `index.html` が指す `assets/` の名前を手元の `dist/index.html` と比べ、`/ws` が 426 を返すことを見る。
 * ずれがあれば名指しして exit 1。接続先・引数が決まらなければ exit 2。
 *
 * **手元の `dist` は作り直さない**（配った時のビルドと比べるため）。配った端末で流すか、同じコミットを
 * 同じ版の道具（`toolchain.json`）で `pnpm build` してから流す。
 *
 * ## 何を確かめないか
 *
 * - 同期サーバーの `ActiveState`・`NRestarts`（`ssh` が要るので含めない。終わりに、手で流すコマンドを案内する）
 * - 配布そのもの（自動化しない。`docs/adr/0009` D5）
 *
 * 設計方針: 判定は `scripts/lib/prod-verify.mjs`。ここは環境・ファイル・ネットワークから値を集める配線だけ。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isDirectRun } from "./lib/direct-run.mjs";
import { resolveBaseUrl, planTargets, verifyProd, formatReport } from "./lib/prod-verify.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fetchImpl = globalThis.fetch;
const E2E_COMMAND = ["pnpm", ["e2e:prod"]];

/** 取得 1 回の上限。固まった接続を黙って待たない。 */
const FETCH_TIMEOUT_MS = 20_000;

const TAG = "[verify-prod]";

/** リダイレクトは追わない（別の場所の 200 を、公開パスの 200 と取り違えない）。 */
async function fetchText(url) {
  const res = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  return { status: res.status, contentType: res.headers.get("content-type"), body: await res.text() };
}

function readLocalIndex(webDist) {
  const file = path.join(REPO_ROOT, webDist, "index.html");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

/** `deploy/` の下で `app.env` を持つディレクトリ（道具）を集める。 */
function readAppEnvs() {
  const deployDir = path.join(REPO_ROOT, "deploy");
  return fs
    .readdirSync(deployDir)
    .filter((dir) => fs.existsSync(path.join(deployDir, dir, "app.env")))
    .sort()
    .map((dir) => ({ dir, text: fs.readFileSync(path.join(deployDir, dir, "app.env"), "utf8") }));
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== "--e2e");
  if (unknown.length > 0) {
    console.error(`${TAG} 知らない引数です: ${unknown.join(" ")}（使えるのは --e2e だけ）`);
    process.exitCode = 2;
    return;
  }
  const runE2e = args.includes("--e2e");

  const base = resolveBaseUrl(process.env);
  if (!base.ok) {
    console.error(`${TAG} ${base.problem}`);
    process.exitCode = 2;
    return;
  }

  const plan = planTargets({ appEnvs: readAppEnvs(), readme: fs.readFileSync(path.join(REPO_ROOT, "deploy", "README.md"), "utf8") });
  if (plan.problems.length > 0) {
    console.error(`${TAG} 確かめる道具を決められません（${plan.problems.length} 件）。本番を読まずに終わります`);
    for (const p of plan.problems) console.error(`  ${p}`);
    process.exitCode = 1;
    return;
  }

  console.log(`${TAG} ${base.baseUrl} の ${plan.targets.length} 本（${plan.targets.map((t) => t.app).join("・")}）と /ws を読みます`);
  if (plan.skipped.length > 0) console.log(`${TAG} 未公開なので飛ばします: ${plan.skipped.join("・")}（deploy/README.md の「アプリ一覧」）`);

  const report = await verifyProd({ baseUrl: base.baseUrl, targets: plan.targets, readLocalIndex, fetchText });
  console.log(formatReport(report));
  if (!report.ok) {
    if (runE2e) console.log(`${TAG} 揃っていないので、E2E は流しません`);
    process.exitCode = 1;
    return;
  }

  // E2E の終了コードは、案内を出し終えてから最後に立てる（立てた後に処理を続けない。#540）
  let e2eStatus = 0;
  if (runE2e) {
    const [command, commandArgs] = E2E_COMMAND;
    console.log(`${TAG} 続けて ${command} ${commandArgs.join(" ")} を流します`);
    const r = spawnSync(command, commandArgs, { cwd: REPO_ROOT, stdio: "inherit", env: process.env });
    if (r.error) console.error(`${TAG} ${command} を起動できません（${r.error.message}）`);
    // 起動できない・シグナルで落ちたとき（status が null）は失敗にする
    e2eStatus = r.status ?? 1;
    if (r.signal) console.error(`${TAG} ${command} がシグナル ${r.signal} で終わりました`);
    if (e2eStatus !== 0) console.error(`${TAG} NG: E2E が通っていません（終了コード ${e2eStatus}）`);
  }

  console.log(`${TAG} ここでは確かめていないもの:`);
  if (!runE2e) console.log("  画面の動き（外から通しで）: 同じ接続先で pnpm verify:prod --e2e");
  console.log("  同期サーバーの ActiveState・NRestarts（時間をおいた再確認）: deploy/README.md の「動作確認」の ③ を端末で流す");
  console.log("  配り忘れ（配っていない道具は、手元の dist も前のままなら揃って見える）: 配った道具の一覧は人が確かめる");
  process.exitCode = e2eStatus;
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
