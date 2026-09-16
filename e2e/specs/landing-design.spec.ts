import { test, expect } from '../fixtures/test';
import type { Page, Request } from '@playwright/test';
import {
  composite,
  contrastRatio,
  effectiveBackground,
  parseColor,
  relativeLuminance,
  requiredRatio,
  sampleInPage,
  type Rgba,
} from '../support/contrast';

/**
 * 下地を色で取れない要素は、札の面（設計正本 §5.7 でグラデーションを保つ）だけに限る。
 *
 * **`sampleInPage` は透明な層を飛ばして祖先まで遡る。** グラデーションの地は
 * `background-color` が `rgba(0, 0, 0, 0)` になるので、放っておくと札の上の文字を
 * 羅紗と比べて測ることになり、測れていないのに数字が出る。だから札は `checkText` の
 * 走査から外すが、**外した分をここで数え上げて許可リストと突き合わせる** ——
 * 新しくグラデーションの地が増えたら、黙って穴が広がる代わりに赤くなる。
 */
const GROUND_NOT_IN_COLOR = ['card tool-card'];

async function checkGround(page: Page): Promise<void> {
  const found = await page.evaluate(() => {
    const names = new Set<string>();
    for (const el of document.querySelectorAll('main *')) {
      const style = getComputedStyle(el);
      // `background-clip: text` は**字**を塗るもので、箱の下地は祖先のまま測れる
      // （ワードマークがこれ。字の側は `checkText` が停止点で測る）。
      const paintsGlyphs = style.backgroundClip === 'text' || style.webkitBackgroundClip === 'text';
      if (paintsGlyphs) continue;
      if (style.backgroundImage.includes('gradient') && style.backgroundColor === 'rgba(0, 0, 0, 0)') {
        names.add(el.className);
      }
    }
    return [...names].sort();
  });
  expect(found.filter((name) => !GROUND_NOT_IN_COLOR.includes(name))).toEqual([]);
  // 対照: 札が出ている画面では、地が本当にグラデーションであることを見る。
  // 単色に戻されたら走査から外す理由も消えるので、黙って除外が残らないようにする。
  if (await page.locator('.tool-card').count() > 0) expect(found).toContain('card tool-card');
}

/**
 * 札の面の文字は、地の **一番暗い停止点** を下地にして測る。
 *
 * 面はグラデーションなので `checkText` の走査からは外れる（`checkGround` を参照）。
 * 外した分をここで測り直すので、外したことが穴にならない。一番暗いところで足りて
 * いれば面のどこに字が乗っても足りる。停止点は実際に効いている `background-image`
 * から読むため、グラデーションを差し替えても書き直さなくて済む。
 */
async function checkCardFace(page: Page): Promise<void> {
  const cards = page.locator('.tool-card');
  for (let i = 0; i < await cards.count(); i += 1) {
    const samples = await cards.nth(i).evaluate((card) => {
      const stops = [...getComputedStyle(card).backgroundImage.matchAll(/rgba?\([^)]*\)/g)].map((m) => m[0]);
      return [...card.querySelectorAll('*')]
        .filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()))
        .map((el) => {
          const style = getComputedStyle(el);
          return {
            stops,
            color: style.color,
            fontSize: Number.parseFloat(style.fontSize),
            fontWeight: Number(style.fontWeight) || 400,
            text: (el.textContent ?? '').trim().slice(0, 40),
          };
        });
    });
    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) {
      const stops = sample.stops.map(parseColor).filter((c): c is Rgba => c !== null);
      // 停止点が 1 つしか取れないなら、もう地はグラデーションではない（測り方を疑う）。
      expect(stops.length, sample.text).toBeGreaterThan(1);
      const ground = stops.reduce((a, b) => (relativeLuminance(a) <= relativeLuminance(b) ? a : b));
      const fg = parseColor(sample.color);
      expect(fg, sample.text).not.toBeNull();
      if (fg === null) continue;
      const required = requiredRatio(sample.fontSize, sample.fontWeight);
      expect(contrastRatio(composite(fg, ground), ground), sample.text).toBeGreaterThanOrEqual(required);
    }
  }
}

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

async function checkText(page: Page): Promise<void> {
  await checkGround(page);
  await checkCardFace(page);
  await checkCardText(page);
  const targets = page.locator('main :is(h1, h2, p, span, a, button, input):visible:not(.tool-card, .tool-card *)');
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
    // 大きい文字は 3:1 で足りる。timer-a11y と同じ測り方に揃える（#270）。
    const required = requiredRatio(sample.fontSize, sample.fontWeight);
    if (fg.a === 0) {
      // 字が透明 = 色ではない何かで塗られている（`background-clip: text` のグラデーション）。
      // そのまま測ると下地と同色になって比が 1.0 になり、落ちる理由が嘘になる。
      // 塗りの停止点すべてで足りていることを見る（#279 の穴の「字」側）。
      const stops = await element.evaluate((el) =>
        [...getComputedStyle(el).backgroundImage.matchAll(/rgba?\([^)]*\)/g)].map((m) => m[0]));
      expect(stops.length, sample.text).toBeGreaterThan(1);
      for (const stop of stops) {
        const ink = parseColor(stop);
        expect(ink, `${sample.text} の停止点 ${stop}`).not.toBeNull();
        if (ink === null) continue;
        expect(contrastRatio(composite(ink, bg), bg), `${sample.text} の停止点 ${stop}`)
          .toBeGreaterThanOrEqual(required);
      }
      measured += 1;
      continue;
    }
    expect(contrastRatio(composite(fg, bg), bg), sample.text).toBeGreaterThanOrEqual(required);
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
