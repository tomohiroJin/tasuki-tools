/**
 * 配信対象のビルド成果物を最新化する。
 *
 * **ここが無いと、そのとき置いてある dist に対してテストが走る。**
 * `e2e/package.json` の `e2e` スクリプトはビルドを含まず、ビルドを与えていたのは
 * `turbo.json` の `dependsOn: ["^build"]` だけだった。VSCode の Playwright 拡張は
 * turbo を経由しないため、拡張から実行すると何に対する結果なのか分からない
 * （#162。通っても落ちても静かに間違える型なので、preflight より前に置く）。
 *
 * turbo がキャッシュするので、`pnpm e2e` 経由では既に済んだビルドを引き当てて
 * 実質ゼロ秒で戻る（実測: キャッシュヒットで 1.2 秒 / FULL TURBO）。
 * 拡張から実行したときだけ、必要な分が実際に走る。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './paths';

/** ワークスペース直下に置かれる turbo の実行ファイル。 */
export const TURBO_BIN = path.join(REPO_ROOT, 'node_modules/.bin/turbo');

/**
 * 最新化する対象のパッケージ名。
 *
 * **ここで列挙しない。** 配信対象は `e2e/package.json` が workspace 依存として
 * 既に宣言しており（`paths.ts` の説明を参照）、それが唯一の名簿である。
 * 二重に持つと、片方を足したときにもう片方が腐る。
 *
 * 絞らずに `turbo run build` を叩くと、配信に関係しないパッケージ
 * （`@tasuki/poker-sync` の `bun build` など）のビルド失敗でも E2E が
 * 起動しなくなる。turbo は `dependsOn: ["^build"]` を辿るので、
 * これらの依存パッケージは絞っても一緒にビルドされる。
 */
export function webAppPackages(): readonly string[] {
  const manifest: unknown = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'e2e/package.json'), 'utf8'),
  );
  const dependencies = (manifest as { dependencies?: Record<string, string> }).dependencies ?? {};
  return Object.keys(dependencies);
}

/**
 * `turbo run build` を実行し、turbo の出力を返す。
 *
 * `turboBin` は検査対象を差し替えるための引数（既定値は実体）。
 */
export function buildWebApps(turboBin: string = TURBO_BIN): string {
  if (!existsSync(turboBin)) {
    throw new Error(
      `turbo が見つかりません（探した場所: ${turboBin}）。\n` +
        '`pnpm install` を先に実行してください。',
    );
  }

  const filters = webAppPackages().flatMap((pkg) => ['--filter', pkg]);

  try {
    return execFileSync(turboBin, ['run', 'build', ...filters], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
  } catch (error) {
    // **execFileSync の message は「Command failed」しか言わない。**
    // ビルドの失敗理由が見えないと「E2E が起動しない」までしか分からないので、
    // turbo が吐いたものを必ず添える。
    const { stdout, stderr } = error as { stdout?: string; stderr?: string };
    throw new Error(
      'ビルドに失敗しました。E2E は古い成果物に対して走らせないため、ここで止めます。\n' +
        `${stdout ?? ''}${stderr ?? ''}`,
      { cause: error },
    );
  }
}
