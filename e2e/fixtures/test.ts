/**
 * `@core` 用の test 拡張。
 *
 * 役割は 2 つ。
 *
 * 1. **コンソール監視を取りこぼさない。** 既定の `page` にも、2 人目のために
 *    自分で作る文脈にも、`goto()` より前に監視を付ける。
 * 2. **2 人目を必ず別の `BrowserContext` で作らせる。** poker は `localStorage` の
 *    `poker:participant:<roomId>`、timer は `sessionStorage` に状態を持つため、
 *    同じ文脈でタブを 2 枚開くと 2 人目が 1 人目として復帰し、
 *    **「2 人居るつもりで 1 人」のまま緑になる**。素の `browser.newContext()` を
 *    直接呼ばず `openPeer` を通す規律にして、監視の付け忘れも同時に塞ぐ。
 */
import { test as base, type Page } from '@playwright/test';
import { attachConsoleLog, watchConsole, type ConsoleWatcher } from './console';

/** 1 人ぶんの文脈。`page` と、その文脈のコンソール監視。 */
export interface Peer {
  readonly page: Page;
  readonly console: ConsoleWatcher;
}

export interface CoreFixtures {
  /** 既定の `page`（1 人目）のコンソール監視。 */
  readonly consoleWatcher: ConsoleWatcher;
  /** 2 人目以降を別文脈で開く。`label` は証跡のファイル名に使う。 */
  readonly openPeer: (label: string) => Promise<Peer>;
}

/** 既定の `page` に付けた監視を、`consoleWatcher` フィクスチャから引くための対応表。 */
const watchers = new WeakMap<Page, ConsoleWatcher>();

export const test = base.extend<CoreFixtures>({
  // 既定の page を上書きして、テスト本体が動き出す前に監視を付ける。
  page: async ({ page }, use, testInfo) => {
    const watcher = watchConsole(page);
    watchers.set(page, watcher);
    await use(page);
    await attachConsoleLog(testInfo, 'page', watcher);
  },

  consoleWatcher: async ({ page }, use) => {
    const watcher = watchers.get(page);
    // page フィクスチャが必ず先に走るので、ここへ来て未登録なら拡張の配線が壊れている。
    if (watcher === undefined) throw new Error('page フィクスチャの監視が登録されていません。');
    await use(watcher);
  },

  openPeer: async ({ browser }, use, testInfo) => {
    const opened: { label: string; watcher: ConsoleWatcher; close: () => Promise<void> }[] = [];

    await use(async (label) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const watcher = watchConsole(page);
      opened.push({ label, watcher, close: () => context.close() });
      return { page, console: watcher };
    });

    for (const peer of opened) {
      await attachConsoleLog(testInfo, peer.label, peer.watcher);
      await peer.close();
    }
  },
});

export { expect } from '@playwright/test';
