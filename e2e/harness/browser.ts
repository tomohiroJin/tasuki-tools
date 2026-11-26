/**
 * E2E を流すブラウザを環境変数から決める（#674・docs/adr/0031 の追記）。
 *
 * - 既定は Chromium（`pnpm e2e`・`pnpm e2e:prod`）
 * - WebKit（iPhone の端末）は `pnpm e2e:webkit` が `TASUKI_E2E_BROWSER=webkit` を付けて選ぶ
 *
 * **1 回の実行で流すのはどちらか一方。** 両方を 1 つの設定の project に並べると、`playwright test` を
 * 直に叩いたとき（VSCode の拡張・1 本だけの実行）に WebKit の OS の依存が無い環境で全件が落ちる。
 */

export type E2eBrowser = 'chromium' | 'webkit';

/** 版の確認（`scripts/check-toolchain.mjs`）の段。 */
export type ToolchainStage = 'e2e' | 'e2e-webkit';

const BROWSERS: readonly E2eBrowser[] = ['chromium', 'webkit'];

function isE2eBrowser(value: string): value is E2eBrowser {
  return (BROWSERS as readonly string[]).includes(value);
}

/**
 * 知らない値は Chromium に読み替えずに落とす（WebKit で流したつもりで Chromium の結果を見ないため）。
 * 本番の E2E を WebKit で流すかは決めていない（#674 のスコープ外）ので、その組も落とす。
 */
export function resolveBrowser(env: Record<string, string | undefined>): E2eBrowser {
  const raw = env['TASUKI_E2E_BROWSER'];
  if (raw === undefined) return 'chromium';
  if (!isE2eBrowser(raw)) {
    throw new Error(
      `TASUKI_E2E_BROWSER は 'chromium' か 'webkit' を指定してください（受け取った値: ${JSON.stringify(raw)}）。` +
        ' WebKit はルートから `pnpm e2e:webkit` で流します。',
    );
  }
  if (raw === 'webkit' && env['TASUKI_E2E_TARGET'] === 'production') {
    throw new Error('本番の E2E（pnpm e2e:prod）は WebKit で流しません（#674 で決めていない）。');
  }
  return raw;
}

export function toolchainStageOf(browser: E2eBrowser): ToolchainStage {
  return browser === 'webkit' ? 'e2e-webkit' : 'e2e';
}
