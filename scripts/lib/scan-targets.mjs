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
