import { test, expect } from '../fixtures/test';
import type { Page, Request } from '@playwright/test';
import { measureSample, sampleInPage } from '../support/contrast';

/**
 * 札の文字は 1 行に収まっていること。
 *
 * 狭い幅で札を横に 2 枚並べると文字の入る幅が足りず、**一行説明の最後の 1 文字だけが
 * 次の行へ落ちる**（#270 の時点の 320px がこれで、札 131px・文字の入る幅 115px に対し
 * 説明は 133px 必要だった）。字面ではなく行数で見るので、**収める手段は問わない** ——
 * 積む・幅を変える・文言を縮める、どれで満たしても緑になる。
 *
 * **行箱を直接数える。** 札は 4° 傾けて配ってあるので、`getBoundingClientRect()` は
 * 回転後の外接矩形を返す —— 高さを行の高さで割ると、1 行でも 2 行と出た。
 * `Range` の矩形は 1 行につき 1 つなので、傾きに影響されない。
 */
async function checkCardText(page: Page): Promise<void> {
  const cards = page.locator('.tool-card');
  const count = await cards.count();
  if (count === 0) return;
  for (let i = 0; i < count; i += 1) {
    const measured = await cards.nth(i).evaluate((card) =>
      ['.tool-name', '.tool-summary'].map((selector) => {
        const el = card.querySelector(selector);
        if (el === null) return { selector, lines: 0, text: '' };
        const range = document.createRange();
        range.selectNodeContents(el);
        return {
          selector,
          lines: range.getClientRects().length,
          text: (el.textContent ?? '').trim(),
        };
      }));
    expect(measured.length).toBe(2);
    for (const one of measured) {
      expect(one.lines, `${one.selector}「${one.text}」`).toBe(1);
    }
  }
}

/**
 * 文字が地に対して読めること。**測り方は共有ヘルパに寄せてある**（#279）。
 *
 * 以前はここに札の面（グラデーション）を避ける仕掛けと、避けた分を測り直す仕掛けと、
 * 「グラデーションの地はこの 2 つだけ」という許可リストを置いていた。**穴を
 * `sampleInPage` 側で塞いだので、どれも要らなくなった** —— 取りこぼしは
 * 祖先へ黙って抜けるのではなく `measureSample` が `null` を返し、下の
 * `unmeasurable` が赤くする。列挙を維持する代わりに機構で拾う。
 */
async function checkText(page: Page): Promise<void> {
  await checkCardText(page);
  const targets = page.locator('main :is(h1, h2, p, span, a, button, input):visible');
  const failures: string[] = [];
  const unmeasurable: string[] = [];
  let measured = 0;
  for (const element of await targets.all()) {
    const hasText = await element.evaluate((el) => el instanceof HTMLInputElement ||
      Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()));
    if (!hasText) continue;
    const sample = await element.evaluate(sampleInPage);
    // 大きい文字は 3:1 で足りる。timer-a11y と同じ測り方に揃える（#270）。
    const measurement = measureSample(sample);
    const ground = sample.backgrounds.map((paint) => [paint.color, ...paint.stops].join('/')).join(' ← ');
    if (measurement === null) {
      unmeasurable.push(`「${sample.text}」 文字=${sample.ink.join('/')} 地=${ground}`);
      continue;
    }
    measured += 1;
    const { ratio, required } = measurement;
    if (ratio < required) {
      failures.push(
        `「${sample.text}」 ${ratio.toFixed(2)}:1（要 ${required}:1・${sample.fontSize}px/${sample.fontWeight}）` +
          ` 文字=${sample.ink.join('/')} 地=${ground}`,
      );
    }
  }
  expect(unmeasurable, `下地か字の色を決められない文字が ${unmeasurable.length} 件`).toEqual([]);
  expect(failures, `AA を満たさない文字が ${failures.length} 件`).toEqual([]);
  expect(measured).toBeGreaterThan(5);
}

for (const width of [1280, 320]) {
  test(`Given 玄関 / When 作成・参加・選択を幅 ${width} で表示 / Then 読めて横にはみ出さない`, async ({ page, openPeer }, testInfo) => {
    // Given: 実サーバーを通り、UI 文言だけで書体の追加取得を起こさない。
    const fonts: string[] = [];
    page.on('request', (request) => { if (request.url().endsWith('.woff2')) fonts.push(request.url()); });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'ルームを作る' })).toBeEnabled();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: testInfo.outputPath('create.png'), fullPage: true });
    await checkText(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // When
    await page.getByLabel('ルーム名').fill('朝会');
    await page.getByLabel('あなたの名前').fill('あや');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    const invite = page.getByLabel('参加用 URL');
    await expect(invite).toBeVisible();
    const guest = await openPeer('design-guest');
    const trackGuestFonts = (request: Request): void => { if (request.url().endsWith('.woff2')) fonts.push(request.url()); };
    guest.page.on('request', trackGuestFonts);
    await guest.page.setViewportSize({ width, height: 900 });
    await guest.page.goto(await invite.inputValue());
    await expect(guest.page.getByRole('button', { name: '参加する' })).toBeEnabled();
    await guest.page.evaluate(() => document.fonts.ready);
    await guest.page.screenshot({ path: testInfo.outputPath('join.png'), fullPage: true });
    await checkText(guest.page);
    expect(await guest.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await guest.page.getByLabel('あなたの名前').fill('いずみ');
    await guest.page.getByRole('button', { name: '参加する' }).click();
    await expect(guest.page.getByRole('list', { name: 'ツール' })).toBeVisible();
    await guest.page.evaluate(() => document.fonts.ready);
    guest.page.off('request', trackGuestFonts);
    await guest.page.getByRole('link', { name: /Planning Poker/ }).click();
    await expect(page.getByRole('list', { name: '参加者' })).toContainText('Planning Poker にいます');
    await page.mouse.move(0, 0);
    await page.screenshot({ path: testInfo.outputPath('choice.png'), fullPage: true });
    // Then: 情報は見出しつき領域に分かれ、道具が補助操作より先に現れる。
    const tools = page.getByRole('region', { name: '道具を選ぶ' });
    await expect(tools).toBeVisible();
    await expect(page.getByRole('region', { name: '参加者' })).toBeVisible();
    await expect(page.getByRole('region', { name: '仲間を招く' })).toBeVisible();
    const toolBox = await tools.boundingBox();
    const inviteBox = await invite.boundingBox();
    expect(toolBox!.y).toBeLessThan(inviteBox!.y);
    for (const p of [page, guest.page]) {
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await checkText(page);
    await guest.page.goto('about:blank');
    await expect(page.getByText('切断中', { exact: true })).toBeVisible();
    await checkText(page);
    await page.getByRole('button', { name: 'QR コードを表示' }).click();
    await expect(page.getByRole('img', { name: '参加用 URL の QR コード' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.filter((url) => /-ext[.-]/.test(url))).toEqual([]);
  });
}
