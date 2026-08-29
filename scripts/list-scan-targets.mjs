#!/usr/bin/env node
/**
 * CI へ走査対象を渡す薄い CLI（#135・ADR-0014）。
 *
 * ワークフローの YAML に対象を書かないための入口。YAML に書くと、
 * ADR 0009 D6 の「deploy/** と scripts/** を対象」という記述と実装がずれても
 * 誰も気づかない（実際に非再帰のグロブのままだった）。
 *
 * 対象が 0 件なら非ゼロで終了する。除外は理由つきで宣言し、除外が
 * 1 件も一致しなくなったら落とす（死んだ除外行を残さない）。
 */
import { execFileSync } from "node:child_process";
import { listTrackedFiles, hasZeroScanTargets } from "./lib/scan-targets.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

/**
 * 種別ごとの実体と除外。
 *
 * shell:        除外は無い。追跡下の `*.sh` を全件対象にする（#71 で
 *               `.specify/scripts/**` の vendor 除外が宛先を失ったため。ADR 0009 追記）。
 * script-tests: `scripts/` に限定する。`*.test.mjs` にすると
 *               packages/ui/tests/tokens.test.mjs（ui 自身のテスト）まで拾う。
 *               `scripts/*.test.mjs` は git の `*` が `/` を跨ぐため再帰列挙になる。
 *               `**` は特別扱いされず `*` と同義なので使わない（直下を取りこぼす）。
 */
const KINDS = {
  shell: {
    patterns: ["*.sh"],
    exclusions: [],
  },
  "script-tests": {
    patterns: ["scripts/*.test.mjs"],
    exclusions: [],
  },
};

export function selectTargets(all, exclusions) {
  const problems = [];
  for (const e of exclusions) {
    if (!all.some((rel) => rel.startsWith(e.prefix))) {
      problems.push(`除外が 1 件も一致しません: ${e.prefix}（${e.reason}）`);
    }
  }
  const targets = all.filter((rel) => !exclusions.some((e) => rel.startsWith(e.prefix)));
  return { targets, problems };
}

function main() {
  const kind = process.argv[2];
  const spec = KINDS[kind];
  if (!spec) {
    console.error(`未知の種別です: ${kind}（使えるのは ${Object.keys(KINDS).join(" / ")}）`);
    process.exit(2);
  }

  const all = listTrackedFiles(REPO_ROOT, spec.patterns);
  const { targets, problems } = selectTargets(all, spec.exclusions);

  if (problems.length > 0) {
    for (const p of problems) console.error(`[list-scan-targets] ${p}`);
    process.exit(1);
  }
  // 0 件（空振り）の判定は共有モジュールへ寄せる（ADR-0014 決定 8。集約は #135 設計正本 D10）。
  // 同型の条件式を各スクリプトへ手書きすると「片側だけ直す」の再発源になる。
  if (hasZeroScanTargets(targets.length)) {
    console.error(`[list-scan-targets] ${kind} の対象が 0 件です（検査が空振りします）`);
    process.exit(1);
  }
  console.log(targets.join("\n"));
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
