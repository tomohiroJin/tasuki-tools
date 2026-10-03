/**
 * timer の CSS のビルドの切り替え（`apps/timer-web/vite-timer-css.ts`・#321 の比較の仕組み `e2e/parity/`）の取り残しを止める。
 * PR 4 で切り替えと一緒に消す。
 *
 * 切り替えは比較の設定ファイル（`parity.unlayered.config.ts` / `parity.usage.config.ts`）が自分で立てる。シェルに残すと、
 * 通常の比較・`pnpm e2e`・配布前のビルドにも届き（turbo は `turbo.json` に宣言した変数をビルドへ渡す）、囲い無しの CSS や
 * 最小化しない CSS を通常の比較で緑にする・本番へ配る。**設定ファイルが自分で立てたのでない限り、立っていたら止める。**
 *
 * 「自分で立てた」は控えの変数（{@link OWNED}）で見分ける。Playwright の worker は設定ファイルを読み直すので、
 * 「読み込みの時点で既に立っている」だけで止めると、worker で自分の立てた変数に止められる。
 */

/** ビルドの切り替えの変数。 */
export const PARITY_BUILD_SWITCHES = ['TASUKI_TIMER_UNLAYERED', 'TASUKI_TIMER_CSS_UNMINIFIED'] as const;

export type ParityBuildSwitch = (typeof PARITY_BUILD_SWITCHES)[number];

/** 設定ファイルが自分で立てた切り替えの名前の控え。 */
const OWNED = 'TASUKI_PARITY_BUILD_SWITCH_OWNED';

/** 設定ファイルが切り替えを自分で立てる（控えに名前を残す）。 */
export function setParityBuildSwitch(env: NodeJS.ProcessEnv, name: ParityBuildSwitch): void {
  env[name] = '1';
  env[OWNED] = name;
}

/** 立っている（空でない）切り替えのうち、設定ファイルが自分で立てたのでないもの。 */
export function leftoverParityBuildSwitches(env: NodeJS.ProcessEnv): ParityBuildSwitch[] {
  return PARITY_BUILD_SWITCHES.filter((name) => (env[name] ?? '') !== '' && env[OWNED] !== name);
}

/** 取り残しがあれば止める（`where` は止めた設定の名前）。 */
export function assertNoLeftoverParityBuildSwitches(env: NodeJS.ProcessEnv, where: string): void {
  const leftovers = leftoverParityBuildSwitches(env);
  if (leftovers.length === 0) return;
  throw new Error(
    `${where}: timer の CSS のビルドの切り替え（${leftovers.join(', ')}）がシェルに残っている（取り残しの疑い）。unset してから流す。` +
      '切り替えは -c parity/parity.unlayered.config.ts / parity.usage.config.ts で選ぶ（e2e/parity/README.md）。',
  );
}
