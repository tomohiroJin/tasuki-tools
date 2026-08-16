import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * 走査対象の健全性（#135・ADR-0014）。
 *
 * 各検査は走査対象を**宣言**し、実行時に**実体**を列挙して全単射で照合する。
 * 「宣言にあるが実在しない」「実在するが宣言に無い」のどちらでも落とす。
 *
 * 判定は純粋関数、I/O と process.exit は呼び出し側に置く
 * （scripts/audit-log-hygiene.mjs の設計方針に合わせた）。追加依存は禁止。
 */

/**
 * 宣言と実体の差分を両方向で取る。
 *
 * missing:    宣言にあるが実体に無い（移設・改名で対象を失った）
 * unexpected: 実体にあるが宣言に無い（新設されたものが黙って対象外になった）
 *
 * **片方向では塞げない。** missing だけを見ると新設が素通りし（#103 が実際に踏んだ）、
 * unexpected だけを見ると移設が素通りする（#70 の最終レビューが見つけた経路）。
 */
export function diffTargets(declared, actual) {
  const declaredSet = new Set(declared);
  const actualSet = new Set(actual);
  return {
    missing: [...declaredSet].filter((x) => !actualSet.has(x)).sort(),
    unexpected: [...actualSet].filter((x) => !declaredSet.has(x)).sort(),
  };
}

/** どちらかの向きにずれがあるか。 */
export function hasTargetDrift(diff) {
  return diff.missing.length > 0 || diff.unexpected.length > 0;
}

/**
 * 走査対象が 0 件かどうか（ADR-0014 決定 8 の例外）。
 *
 * 件数の下限は直書きしない（決定 8 MUST NOT）が、0 件（空振り）だけは
 * 例外として必ず落とす。**書いてよい下限はこの「非空」判定のみ**であり、
 * `count < 2` のような 2 以上の下限は対象外（決定 8）。
 *
 * 全宣言を理由つき除外へ移せば全単射照合は素通りし、走査 0 件のまま
 * 合否表を出せてしまう経路をここで塞ぐ（#135・ADR-0014 決定 8）。
 */
export function hasZeroScanTargets(count) {
  return count === 0;
}

/**
 * ずれを人が読める形にする。
 *
 * **必ず 3 点を出す**: ずれの向き・向きごとの直し方・現在の走査量。
 * 走査量を出すのは、#103 の「11 パッケージ中 3 つしか見ていない」が長く
 * 気づかれなかった原因が「量を一度も出していなかったこと」だから。
 */
export function formatTargetDiff(name, diff, scanSummary) {
  const lines = [`[${name}] 走査対象の宣言が実体とずれています`];
  for (const m of diff.missing) {
    lines.push(`  宣言にあるが実在しない: ${m}    ← 移設したなら宣言を直す`);
  }
  for (const u of diff.unexpected) {
    lines.push(`  実在するが宣言に無い:   ${u}    ← 対象に入れるか、理由つきで除外する`);
  }
  lines.push(`  現在の走査対象: ${scanSummary}`);
  return lines.join("\n");
}

/** git のパス列挙。NUL 区切りで受け取り、空要素を落とす。 */
function gitLines(repoRoot, args) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);
}

/**
 * 追跡下のファイルを列挙する。
 *
 * **pathspec に `**` を書いてはならない。** git の pathspec で `**` は特別扱いされず、
 * `*` と同じく `/` を跨ぐ単なるワイルドカードとして振る舞う。したがって
 * `scripts/**\/*.test.mjs` は `scripts/*\/*.test.mjs` と同義になり、`scripts/` 直下の
 * ファイルを**静かに取りこぼす**。0 件になって空振りが露見するのではなく、
 * 一部だけ一致して残りが落ちるので、「0 件なら落とす」検査では救えない。
 * `*` が `/` を跨ぐため、再帰列挙には `scripts/*.test.mjs` だけで足りる。
 */
export function listTrackedFiles(repoRoot, patterns) {
  return gitLines(repoRoot, ["ls-files", "-z", ...patterns]).sort();
}

/**
 * 追跡下 ∪（未追跡かつ gitignore 対象外）を列挙する。
 *
 * **存在判定に使ってはならない。** 存在判定を未追跡へ広げると、未追跡ファイルへの
 * リンクがローカルでは通り CI では落ちる（PR-2 で踏んだ食い違いの逆向き）。
 * 走査対象を広げる用途に限る。gitignore 対象は従来どおり見ない。
 */
export function listRepoFiles(repoRoot, patterns) {
  const tracked = gitLines(repoRoot, ["ls-files", "-z", ...patterns]);
  const untracked = gitLines(repoRoot, [
    "ls-files",
    "-z",
    "--others",
    "--exclude-standard",
    ...patterns,
  ]);
  return [...new Set([...tracked, ...untracked])].sort();
}

/**
 * workspace のパッケージをリポジトリ相対パスで列挙する（ルートを除く）。
 *
 * **権威は pnpm 自身**（ADR-0014）。pnpm-workspace.yaml を手で解析してはならず、
 * `git ls-files '*package.json'` で代替してもならない。どちらも pnpm の解決規則の
 * 自作再実装になり、workspace の glob が変わったときに黙ってずれる。
 *
 * `pnpm install` 済みであることを要求する。install を走らせないジョブからは呼ばない。
 */
export function listWorkspacePackages(repoRoot) {
  const stdout = execFileSync("pnpm", ["-r", "list", "--depth", "-1", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const root = path.resolve(repoRoot);
  return JSON.parse(stdout)
    .map((entry) => path.resolve(entry.path))
    .filter((abs) => abs !== root)
    .map((abs) => path.relative(root, abs).split(path.sep).join("/"))
    .sort();
}
