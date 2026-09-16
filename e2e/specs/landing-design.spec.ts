import { test, expect } from '../fixtures/test';
import type { Page, Request } from '@playwright/test';
import { composite, contrastRatio, effectiveBackground, parseColor, sampleInPage } from '../support/contrast';

async function checkText(page: Page): Promise<void> {
  const targets = page.locator('main :is(h1, h2, p, span, a, button, input):visible');
  let measured = 0;
  for (const element of await targets.all()) {
    const hasText = await element.evaluate((el) => el instanceof HTMLInputElement ||
      Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()));
    if (!hasText) continue;
    const sample = await element.evaluate(sampleInPage);
    const fg = parseColor(sample.color);
    const bg = effectiveBackground(sample.backgrounds);
    expect(fg, sample.text).not.toBeNull();
    expect(bg, sample.text).not.toBeNull();
    if (fg === null || bg === null) continue;
    expect(contrastRatio(composite(fg, bg), bg), sample.text).toBeGreaterThanOrEqual(4.5);
    measured += 1;
  }
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
