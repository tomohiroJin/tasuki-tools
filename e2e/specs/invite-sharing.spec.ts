import { test, expect } from '../fixtures/test';

test.describe('選択画面で参加 URL を配る（#269）', () => {
  test('Given 選択画面 / When URL をコピーし QR を開く / Then 同じ URL で別の人が参加できる', async ({ page, context, openPeer }, testInfo) => {
    // Given: 作成者が選択画面に居る。
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await page.getByLabel('ルーム名').fill('招待の確認');
    await page.getByLabel('あなたの名前').fill('あや');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    const urlField = page.getByLabel('参加用 URL');
    await expect(urlField).toBeVisible();
    const url = await urlField.inputValue();
    expect(new URL(url).pathname).toBe('/');
    expect(new URL(url).searchParams.get('room')).toBeTruthy();
    await expect(page.getByRole('img', { name: '参加用 URL の QR コード' })).toHaveCount(0);

    // When: 実ブラウザの clipboard へコピーする。
    await page.getByRole('button', { name: '参加用 URL をコピー' }).click();

    await expect(page.getByRole('status')).toHaveText('コピーしました。');
    const copiedUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiedUrl).toBe(url);
    await page.getByRole('button', { name: 'QR コードを表示' }).click();
    const qr = page.getByRole('img', { name: '参加用 URL の QR コード' });
    await expect(qr).toBeVisible();
    await expect.poll(() => qr.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(200);
    await page.screenshot({ path: testInfo.outputPath('invite-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'QR コードを閉じる' }).click();
    await expect(qr).toHaveCount(0);

    const guest = await openPeer('invite-copy-guest');
    await guest.page.goto(copiedUrl);
    await guest.page.getByLabel('あなたの名前').fill('いずみ');
    await guest.page.getByRole('button', { name: '参加する' }).click();
    await expect(guest.page.getByRole('list', { name: '参加者' })).toContainText('あや');
    await expect(page.getByRole('list', { name: '参加者' })).toContainText('いずみ');
  });

  test('Given clipboard の無いモバイル環境 / When コピーできない / Then URL を手動選択でき QR も使える', async ({ page }, testInfo) => {
    // Given: モバイル幅で自動コピーが使えない。
    await page.setViewportSize({ width: 390, height: 844 });
    // LAN の非セキュアオリジンと同じ API 不在を再現。従来コピーも使えない場合。
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      document.execCommand = () => false;
    });
    await page.goto('/');
    await page.getByLabel('ルーム名').fill('手動で招待');
    await page.getByLabel('あなたの名前').fill('あや');
    await page.getByRole('button', { name: 'ルームを作る' }).click();

    // When: コピーを試す。
    await page.getByRole('button', { name: '参加用 URL をコピー' }).click();

    await expect(page.getByRole('status')).toHaveText('コピーできません。URL を選んでコピーしてください。');
    const url = page.getByLabel('参加用 URL');
    await url.focus();
    await url.press('ControlOrMeta+A');
    const selected = await url.evaluate((input: HTMLInputElement) => input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0));
    expect(selected).toBe(await url.inputValue());
    expect(selected).toContain('/?room=');
    await page.getByRole('button', { name: 'QR コードを表示' }).click();
    await expect(page.getByRole('img', { name: '参加用 URL の QR コード' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('invite-mobile.png'), fullPage: true });
  });
});
