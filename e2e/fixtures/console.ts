/**
 * ブラウザのコンソール出力を集める。
 *
 * **登録は `page` を作った直後、最初の `goto()` より前でなければならない。**
 * `goto()` の後に登録すると初期ロード中のエラーを見逃す。そのため
 * `test.beforeEach` ではなくフィクスチャ（`fixtures/test.ts`）から呼ぶ。
 */
import type { Page, TestInfo } from '@playwright/test';

/** 収集結果。配列は監視中ずっと同じ実体を差し続ける（読み出し時点の内容が見える）。 */
export interface ConsoleWatcher {
  /** `console.error` と未捕捉例外だけを集めたもの。合否判定に使う。 */
  readonly errors: readonly string[];
  /** 種別を問わない全出力。落ちたときの診断に使う。 */
  readonly messages: readonly string[];
}

/**
 * ページのコンソールと未捕捉例外の監視を始める。
 *
 * `pageerror` も errors に含める。React の描画中に例外が飛んでも
 * `console` には出ないことがあり、そちらだけ見ていると取り逃す。
 */
export function watchConsole(page: Page): ConsoleWatcher {
  const errors: string[] = [];
  const messages: string[] = [];

  page.on('console', (message) => {
    const line = `[${message.type()}] ${message.text()}`;
    messages.push(line);
    if (message.type() === 'error') errors.push(line);
  });
  page.on('pageerror', (error) => {
    const line = `[pageerror] ${error.message}`;
    messages.push(line);
    errors.push(line);
  });

  return { errors, messages };
}

/**
 * 収集した出力を証跡として残す。
 *
 * **落ちたときだけ**添付する。成功時に毎回添付すると証跡が膨らむだけで、
 * 見られることもない。画面のスクリーンショットだけでは
 * 「JS が例外で止まったのか、要素が出るのが遅いだけなのか」が分からない。
 */
export async function attachConsoleLog(
  testInfo: TestInfo,
  label: string,
  watcher: ConsoleWatcher,
): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) return;
  if (watcher.messages.length === 0) return;
  await testInfo.attach(`console-${label}`, {
    body: watcher.messages.join('\n'),
    contentType: 'text/plain',
  });
}
