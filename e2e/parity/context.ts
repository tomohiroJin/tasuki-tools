/**
 * 比較で使うブラウザの文脈の作り方（#321・計画 P1）。状態を作る文脈も、タッチの文脈（Task 5）も、ここから作る。
 *
 * 側（基準・ブランチ）で違うのは、基準の側だけ `/timer/` を基準の dist から返すことだけ（対照実行ではブランチの側も返す）。
 * それ以外は両側で揃える。
 */
import type { Browser, BrowserContext, BrowserContextOptions, TestInfo } from '@playwright/test';
import { BASE_DIST, serveBaseDist, type BaseServing } from './base-dist';
import { snapshotGuardProblem } from './guard';

export type ParitySide = 'base' | 'branch';

/**
 * 対照実行（基準同士の比較）は**設定ファイルで選ぶ**（`parity.control.config.ts` の `metadata.parityControl`）。
 * 環境変数では選ばない —— シェルに取り残すと、通常の比較のつもりが基準同士の比較になって緑になる（偽の緑）。
 * 古い手順の `TASUKI_PARITY_CONTROL` が環境に立っていたら、取り残しとみなして読み込みの時点で止める。
 */
if (process.env['TASUKI_PARITY_CONTROL'] !== undefined) {
  throw new Error(
    'TASUKI_PARITY_CONTROL は使わなくなった（取り残しの疑い）。unset してから流す。' +
      '対照実行は -c parity/parity.control.config.ts で選ぶ（e2e/parity/README.md）。',
  );
}

/** 文脈を作る側と、対照実行か（対照実行ではブランチの側にも基準の dist を配る）。 */
export interface ParityRole {
  readonly side: ParitySide;
  readonly control: boolean;
}

/** その側で `/timer/` を基準の dist から返すか。基準の側と、対照実行のブランチの側。 */
export function servesBaseDist(role: ParityRole): boolean {
  return role.side === 'base' || role.control;
}

/** 文脈を作った時点で退避した本物の `requestAnimationFrame`（`page.clock` に差し替えられる前のもの）。 */
export interface RafWindow {
  __parityRaf: (callback: FrameRequestCallback) => number;
}

export interface ParityContext {
  readonly context: BrowserContext;
  /** 基準の dist を配る側だけ持つ（{@link servesBaseDist}）。それ以外は null。 */
  readonly serving: BaseServing | null;
}

/**
 * 比較用の文脈を作る。`options` は Playwright の文脈の設定（`viewport`・`hasTouch` など）で、下の 3 つは上書きしない。
 *
 * - `permissions: ['local-network-access']`: 基準の側は `/timer/` を `route.fulfill` で返すので、Chrome はその文書の
 *   アドレス空間を loopback と見なさず、`ws://127.0.0.1` への同期の接続を Local Network Access の検査で弾く
 *   （`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`・実測）。両側を揃えるため、どちらにも付与する
 * - `permissions: ['notifications']`: 「交代を音で知らせる」を入にすると OS 通知の許可を求める（`platform/notify.ts` の
 *   `requestPermissionIfEnabling`）。許可が無いと拒否され、通知設定のポップオーバーに「OS 通知は許可されていません」の文が
 *   残って切り替えを戻せない（実測）。許可しておけば granted が返り、スイッチの「入」の姿を比べられる。許可が効くのは
 *   背面タブでの OS 通知（`notifyDriverChange`）だけで、画面の見た目は変わらない
 * - `__parityRaf`: `page.clock` を止めるとページの rAF も止まる（実測）。差し替えられる前に本物を退避する
 */
export async function newParityContext(
  browser: Browser,
  role: ParityRole,
  options: BrowserContextOptions = {},
): Promise<ParityContext> {
  const permissions = [...(options.permissions ?? []), 'local-network-access', 'notifications'];
  const context = await browser.newContext({ ...options, permissions });
  await context.addInitScript(() => {
    Object.defineProperty(window, '__parityRaf', { value: window.requestAnimationFrame.bind(window) });
  });
  const serving = servesBaseDist(role) ? await serveBaseDist(context, BASE_DIST) : null;
  return { context, serving };
}

/**
 * 画素の基準（snapshot）を書き換える指定（`-u` / `--update-snapshots`）や、照合を飛ばす指定（`--ignore-snapshots`）で
 * 流していないことを断定する。各テストの先頭で呼ぶ。
 *
 * 比較は基準の画像を snapshot の置き場へ書いてからブランチの画像を照合する。`-u` を付けるとブランチの画像で
 * 基準の画像を上書きして、`--ignore-snapshots` を付けると照合そのものを飛ばして、どちらも画素を比べずに通る（偽の緑）。
 * 判定は {@link snapshotGuardProblem}（`guard.ts`・自己テストあり）。
 * 除去検査は画素を撮らないが、流し方を揃えるため同じく止める。
 */
export function assertSnapshotsNotUpdated(testInfo: TestInfo): void {
  const problem = snapshotGuardProblem({
    updateSnapshots: testInfo.config.updateSnapshots,
    ignoreSnapshots: testInfo.project.ignoreSnapshots,
  });
  if (problem !== null) throw new Error(problem);
}
