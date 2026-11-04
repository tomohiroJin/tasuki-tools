/**
 * ランダムな順のテスト検査の部品（#524・#495 の B）。
 *
 * テストを毎回同じ順で流すだけでは、前のテストの状態に頼るテスト（順番依存）が入っても気づけない
 * （#496 の調査で 1 件、#499）。全件の段（CI の `shuffle` ジョブ）で、各パッケージの `test` スクリプトに
 * ランダムな順の指定を足して流す。
 *
 * - vitest: `--sequence.shuffle --sequence.seed=<種>`
 * - bun test: `--randomize --seed=<種>`
 * - `node --test`（packages/ui・scripts/）: Node 22 にランダムな順の指定が無いので対象外
 *
 * 指定は package.json の `test` から導くので、テストのコマンドを変えたパッケージは追随する。
 * **知らないランナーは黙って飛ばさず、落とす**（新しいランナーのパッケージが検査の外に出るのを防ぐ）。
 */
import fs from "node:fs";
import path from "node:path";

/** 種の範囲。vitest・bun とも整数を取る。0 は「種なし」と読まれうるので 1 から。 */
export const SEED_MAX = 2_147_483_647;

export function newSeed(random = Math.random) {
  return 1 + Math.floor(random() * SEED_MAX);
}

/** `--seed` で渡された値。整数以外・範囲外は受け付けない（黙って別の種にしない）。 */
export function parseSeed(value) {
  if (!/^[1-9]\d{0,9}$/.test(String(value)) || Number(value) > SEED_MAX) {
    throw new Error(`種は 1〜${SEED_MAX} の整数で指定してください: ${value}`);
  }
  return Number(value);
}

/**
 * `test` スクリプトから、ランダムな順で流すコマンド（単語の並び）を導く。
 * 戻り値は `{ args }`（流す）か `{ skip }`（理由つきで対象外）。知らない形は投げる。
 */
export function shuffledCommand(testScript, seed) {
  if (typeof testScript !== "string" || testScript.trim() === "") return { skip: "test スクリプトが無い" };
  const words = testScript.trim().split(/\s+/);
  if (words[0] === "node" && words[1] === "--test") return { skip: "node --test は Node 22 にランダムな順の指定が無い" };
  if (/[&|;<>$`"'()\\*]/.test(testScript)) throw new Error(`test スクリプトにシェルの記法があり、種の指定を足せません: ${testScript}`);
  if (words[0] === "vitest" && words[1] === "run") return { args: [...words, "--sequence.shuffle", `--sequence.seed=${seed}`] };
  if (words[0] === "bun" && words[1] === "test") return { args: [...words, "--randomize", `--seed=${seed}`] };
  throw new Error(`知らないテストランナーです。ランダムな順の指定を決めて shuffled-tests.mjs に足してください: ${testScript}`);
}

/** pnpm-workspace.yaml の `packages:` から、package.json を持つパッケージのディレクトリ（root からの相対）を列挙する。 */
export function workspacePackageDirs(root) {
  const yaml = fs.readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8");
  const block = /^packages:\n((?:[ \t]+- .*\n?)+)/m.exec(yaml)?.[1];
  if (!block) throw new Error("pnpm-workspace.yaml の packages が読めません");
  const dirs = [];
  for (const line of block.split("\n").filter(Boolean)) {
    const pattern = /^\s*- ["']?([^"']+?)["']?\s*$/.exec(line)?.[1];
    if (!pattern) throw new Error(`pnpm-workspace.yaml の packages の行を読めません: ${line}`);
    const candidates = pattern.endsWith("/*")
      ? fs.readdirSync(path.join(root, pattern.slice(0, -2)), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `${pattern.slice(0, -2)}/${d.name}`)
      : [pattern];
    for (const dir of candidates) if (fs.existsSync(path.join(root, dir, "package.json"))) dirs.push(dir);
  }
  if (dirs.length === 0) throw new Error("ワークスペースのパッケージが 1 つも見つかりません");
  return dirs.sort();
}

/** 全パッケージの計画。`{ dir, name, args }`（流す）か `{ dir, name, skip }`（対象外）。 */
export function planShuffledRuns(root, seed, dirs = workspacePackageDirs(root)) {
  return dirs.map((dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, dir, "package.json"), "utf8"));
    return { dir, name: pkg.name ?? dir, ...shuffledCommand(pkg.scripts?.test, seed) };
  });
}

/** 落ちたときに、同じ種で手元で再現するコマンド（リポジトリのルートから貼れる形）。 */
export function reproCommand(run) {
  return `cd ${run.dir} && pnpm exec ${run.args.join(" ")}`;
}
