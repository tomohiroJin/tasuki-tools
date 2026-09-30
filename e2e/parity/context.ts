/**
 * 比較で使うブラウザの文脈の作り方（#321・計画 P1）。状態を作る文脈も、タッチの文脈（Task 5）も、ここから作る。
 *
 * 側（基準・ブランチ）で違うのは、基準の側だけ `/timer/` を基準の dist から返すことだけ。それ以外は両側で揃える。
 */
import type { Browser, BrowserContext, BrowserContextOptions } from '@playwright/test';
import { BASE_DIST, serveBaseDist, type BaseServing } from './base-dist';

export type ParitySide = 'base' | 'branch';

/** 文脈を作った時点で退避した本物の `requestAnimationFrame`（`page.clock` に差し替えられる前のもの）。 */
export interface RafWindow {
  __parityRaf: (callback: FrameRequestCallback) => number;
}

export interface ParityContext {
  readonly context: BrowserContext;
  /** 基準の側だけ持つ。ブランチの側は null。 */
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
  side: ParitySide,
  options: BrowserContextOptions = {},
): Promise<ParityContext> {
  const permissions = [...(options.permissions ?? []), 'local-network-access', 'notifications'];
  const context = await browser.newContext({ ...options, permissions });
  await context.addInitScript(() => {
    Object.defineProperty(window, '__parityRaf', { value: window.requestAnimationFrame.bind(window) });
  });
  const serving = side === 'base' ? await serveBaseDist(context, BASE_DIST) : null;
  return { context, serving };
}
