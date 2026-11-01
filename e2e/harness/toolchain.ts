/**
 * 起動前に、開発環境の版を宣言と比べる（#487・docs/adr/0031）。
 *
 * 比べ方の正本は `scripts/check-toolchain.mjs`。`pnpm e2e` はルートでそれを先に呼ぶが、
 * turbo を経由しない起動（VSCode の拡張・`playwright test` の直叩き）はそこを通らないので、
 * ハーネスからも呼ぶ。**取り込まずに子プロセスで起動する**（判定を TS へ写すと 2 つがずれる）。
 *
 * 以前ここにあった Chromium の revision の検査（`browsers.ts`）は、#487 で同じ入口へ移した。
 * `PLAYWRIGHT_BROWSERS_PATH` が未設定のときに何も見なかった穴も、そこで塞いだ。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { REPO_ROOT } from './paths';

/** `node <args>` を起動して終了コードを返す。起動できなければ null。 */
export type ToolchainRunner = (args: readonly string[]) => number | null;

const runWithNode: ToolchainRunner = (args) =>
  spawnSync(process.execPath, args, { stdio: 'inherit' }).status;

export function assertToolchain(run: ToolchainRunner = runWithNode): void {
  const status = run([path.join(REPO_ROOT, 'scripts/check-toolchain.mjs'), 'e2e']);
  if (status === 0) return;
  throw new Error(
    '開発環境の版が宣言と合いません（上の [check-toolchain] の出力）。E2E のハーネスは起動しません。',
  );
}
