#!/usr/bin/env node
/**
 * CI で走らせる範囲の判定（#70）。
 *
 * 変更ファイルの一覧から、各ジョブを走らせるかどうかを決めて
 * $GITHUB_OUTPUT へ書く。ジョブ自体は常に起動し、ステップ単位の if で
 * 早期成功させる（必須チェックに指定しても「未報告」にならない形）。
 *
 * **判定に迷ったら全部走らせる（fail-open）。** 走るべきときに走らない事故が
 * この仕組みで最も起きやすい失敗なので、不確かさは必ず「走らせる」側へ倒す。
 */

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** 依存を変えるファイルか。 */
function isDependencyFile(file) {
  return (
    file === "pnpm-lock.yaml" ||
    file === "pnpm-workspace.yaml" ||
    file === "package.json" ||
    file.endsWith("/package.json")
  );
}

/**
 * 変更ファイル一覧から走らせる範囲を決める。
 *
 * `code` は「走らせなくてよい条件」の許可リスト（*.md のみ）の否定で決める。
 * 分類の付かないファイルは必ず `code: true` になる。
 *
 * `e2e` に独立したフラグは持たせない（条件は `code` と同じ）。turbo.json・
 * ルート設定・.github/workflows/** はいずれも E2E の挙動を変えうるため、
 * 「利用者の通る経路」を狭く列挙すると必ず取りこぼす。
 */
export function decideScope(changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return { code: true, deps: true };
  }
  return {
    code: changedFiles.some((f) => !f.endsWith(".md")),
    deps: changedFiles.some(isDependencyFile),
  };
}

export function parseDiffOutput(stdout) {
  return stdout
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function formatOutputs(scope) {
  return `code=${scope.code}\ndeps=${scope.deps}\n`;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

/**
 * イベントに応じて変更ファイルの一覧を取る。
 * 取れない・判断できない場合は例外を投げ、呼び出し側が fail-open する。
 */
function changedFiles() {
  const eventName = process.env.GITHUB_EVENT_NAME;

  if (eventName === "pull_request") {
    const base = process.env.GITHUB_BASE_REF;
    if (!base) throw new Error("GITHUB_BASE_REF が空です");
    // 三点はマージベースからの差分。積み上げ PR でも base が親ブランチになるので正しい。
    return parseDiffOutput(git(["diff", "--name-only", `origin/${base}...HEAD`]));
  }

  if (eventName === "push") {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath) throw new Error("GITHUB_EVENT_PATH が空です");
    const before = JSON.parse(fs.readFileSync(eventPath, "utf8")).before;
    if (!before || /^0+$/.test(before)) {
      throw new Error("before が空または全 0 です（新規ブランチ）");
    }
    return parseDiffOutput(git(["diff", "--name-only", before, process.env.GITHUB_SHA]));
  }

  throw new Error(`判定に対応していないイベントです: ${eventName}`);
}

function main() {
  let scope;
  try {
    const files = changedFiles();
    scope = decideScope(files);
    console.log(`変更 ${files.length} ファイル → code=${scope.code} deps=${scope.deps}`);
    for (const f of files) console.log(`  ${f}`);
  } catch (error) {
    // **fail-open**: 判定できなければ全部走らせる
    scope = { code: true, deps: true };
    console.log(`判定できないため全ジョブを走らせます: ${error.message}`);
  }
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, formatOutputs(scope));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
