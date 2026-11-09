/**
 * ルーム画面の共通の見出し（`.ui-room-header`）の「段数」を測る（#554）。
 *
 * 高さの px は書体・Chromium の版・小数の丸めで揺れる（+1px の許容で比べると、CI で崖の際が赤くなる）ので、物差しは次の 2 つにする:
 *   - 段数: 見出しの中の見える部品（題・戻る・ボタン・ルームコード・URL）の縦の範囲を、重なるものを 1 つの帯にまとめて数えた帯の数。
 *   - URL の 1 行の字数: URL の字数 ÷ 折り返しの行数。日本語の長い URL が行の中で 6 行に折れて高くなる退行は、段数に出ないのでこちらで拾う。
 * 段数が main 以下で、かつ URL の 1 行が {@link MIN_URL_CHARS_PER_LINE} 字以上、を「main より悪くない」と見る。
 */
import type { Page } from '@playwright/test';

/** URL の 1 行の字数の下限。これより少ないと、URL が細い欄の中で何行にも折れて読みにくい。 */
export const MIN_URL_CHARS_PER_LINE = 16;

export const HEADER_URLS: Record<string, string | null> = {
  /** 実際の URL（E2E のローカルの 35 字） */
  actual: null,
  /** 本番相当の 39 字 */
  prod39: 'https://tasuki.example.jp/poker/?room=AB12CD',
  /** ASCII 90 字 */
  ascii90: `https://tasuki.example.jp/poker/?room=${'abcdefghij'.repeat(5)}`,
  /** 日本語 74 字 */
  jp74: `http://127.0.0.1:38557/?room=${'ながいなまえのへや'.repeat(8)}`,
};

export interface HeaderMeasure {
  rows: number;
  urlLines: number;
  urlChars: number;
  height: number;
}

/**
 * 見出しを測る。招待の URL を差し替える場合は、React が持つ文字のノードを書き換えるので、描画が落ち着いてから（2 フレーム後）書き直されていないことを確かめ、
 * 書き直されていたら同じ値に書き戻して測る。差し替えと測りは 1 回の evaluate で行う（往復の間に描画が動かない）。
 */
export async function measureHeader(page: Page, url: string | null): Promise<HeaderMeasure> {
  return page.evaluate(async (x) => {
    const urlEl = document.querySelector('.ui-room-header-invite .ui-invite-url') as HTMLElement;
    const frames = (n: number): Promise<void> => new Promise((resolve) => {
      const step = (left: number): void => { if (left === 0) resolve(); else requestAnimationFrame(() => step(left - 1)); };
      step(n);
    });
    if (x !== null) urlEl.textContent = x;
    await frames(2);
    if (x !== null && urlEl.textContent !== x) { urlEl.textContent = x; await frames(2); }
    const header = document.querySelector('.ui-room-header') as HTMLElement;
    const parts = Array.from(header.querySelectorAll('h1, a, button, .ui-room-header-code, .ui-invite-url'))
      .filter((e) => !e.closest('.ui-room-header-qr'))
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 2 && r.height > 2)
      .sort((a, b) => a.top - b.top);
    let rows = 0;
    let bottom = -Infinity;
    for (const r of parts) {
      if (r.top >= bottom - 2) { rows += 1; bottom = r.bottom; } else bottom = Math.max(bottom, r.bottom);
    }
    const node = urlEl.firstChild;
    let urlLines = 1;
    if (node) {
      const range = document.createRange();
      range.selectNodeContents(node);
      urlLines = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size || 1;
    }
    const urlChars = (urlEl.textContent ?? '').length / urlLines;
    return { rows, urlLines, urlChars, height: header.getBoundingClientRect().height };
  }, url);
}
