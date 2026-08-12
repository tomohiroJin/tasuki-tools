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
