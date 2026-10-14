/**
 * SC-027: 製品コードの入口から到達しないモジュール（グラフ探索）。
 *
 * `scripts/audit-structure.mjs` から判定の部分だけを移したもの（#361）。走査の宣言と組み立ては
 * 入口に残る。ここに置くのは、解析対象の文字列や Map を受け取る純粋関数だけである。
 */

import path from "node:path";

/* ============================================================
 * SC-027: 製品コード入口から到達しないモジュール（グラフ探索）
 * ============================================================ */

/**
 * ソース中の import/export from 文・動的 import から相対指定子を抽出する。
 * 非相対（パッケージ間 import 等）は対象外（このスクリプトはパッケージ内の到達性のみ見る）。
 */
export function extractImportSpecifiers(source) {
  const specs = [];
  const staticRe = /(?:import|export)\s+(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']/g;
  const dynamicRe = /import\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = staticRe.exec(source))) specs.push(m[1]);
  while ((m = dynamicRe.exec(source))) specs.push(m[1]);
  return specs;
}

/**
 * 相対 import 指定子を files（Map<相対パス, 内容>）の中の実在キーへ解決する。
 * `.js` → `.ts`/`.tsx` の読み替え、拡張子省略、`index` 解決を行う。
 * 解決できなければ null（非相対 import・存在しないファイルへの参照など）。
 */
export function resolveRelativeImport(fromPath, spec, files) {
  if (!spec.startsWith(".")) return null;
  const fromDir = path.posix.dirname(fromPath);
  const target = path.posix.normalize(path.posix.join(fromDir, spec));
  const candidates = [];
  if (target.endsWith(".js")) {
    const stem = target.slice(0, -3);
    candidates.push(`${stem}.ts`, `${stem}.tsx`);
  } else if (/\.(ts|tsx)$/.test(target)) {
    candidates.push(target);
  } else {
    candidates.push(
      `${target}.ts`,
      `${target}.tsx`,
      `${target}/index.ts`,
      `${target}/index.tsx`,
    );
  }
  return candidates.find((c) => files.has(c)) ?? null;
}

/**
 * entries から辿って到達可能なファイル集合を返す（BFS によるグラフ探索）。
 * files: Map<相対パス, 内容>。entries: files に存在するキーの配列。
 */
export function computeReachableFiles(files, entries) {
  const reachable = new Set();
  const queue = entries.filter((e) => files.has(e));
  while (queue.length > 0) {
    const current = queue.shift();
    if (reachable.has(current)) continue;
    reachable.add(current);
    const source = files.get(current);
    for (const spec of extractImportSpecifiers(source)) {
      const resolved = resolveRelativeImport(current, spec, files);
      if (resolved && !reachable.has(resolved)) queue.push(resolved);
    }
  }
  return reachable;
}

/**
 * SC-027 本体。files（1 パッケージの src 配下）と entries（入口ファイルの相対パス配列）から、
 * 製品コードの入口から到達しないファイル数を返す。
 */
export function sc027UnreachableModules(files, entries) {
  const reachable = computeReachableFiles(files, entries);
  let count = 0;
  for (const key of files.keys()) {
    if (!reachable.has(key)) count++;
  }
  return count;
}
