/**
 * サイトの外側の確認（@smoke・#434）。ブラウザを開かず HTTP だけで確かめる。
 *
 * 紹介の画像・アイコン・robots.txt などの「ページの外に置くファイル」が実配信で届くこと、
 * 実体の無いファイルが index.html の 200 に化けず 404 になること、キャッシュの指定が
 * 資材とそれ以外で分かれていることを見る。
 */
import { expect, test } from '@playwright/test';

/** HTML から指定のタグ（meta / link）をすべて集め、属性を順序に依らず読めるようにする。 */
function tagsOf(html: string, name: 'meta' | 'link'): Array<Record<string, string>> {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => {
    const attrs: Record<string, string> = {};
    for (const a of m[0].matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) attrs[a[1] ?? ''] = a[2] ?? '';
    return attrs;
  });
}

/** 6 ページ（玄関と 5 ツール）。 */
const PAGES = ['/', '/timer/', '/poker/', '/topic/', '/roulette/', '/agenda/'] as const;

test.describe('@smoke サイトの外側', () => {
  test('Given 稼働中のサイト / When /robots.txt を GET / Then 200・text/plain で Disallow: / を含む', async ({
    request,
  }) => {
    // When
    const response = await request.get('/robots.txt');
    // Then
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/plain');
    expect(await response.text()).toContain('Disallow: /');
  });

  test('Given 稼働中のサイト / When /og.png を GET / Then 200・image/png', async ({ request }) => {
    const response = await request.get('/og.png');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  });

  test('Given 稼働中のサイト / When /site.webmanifest を GET / Then Content-Type が application/manifest+json', async ({
    request,
  }) => {
    // Go の MIME 表に .webmanifest が無く、明示しないと text/plain＋nosniff で返る
    const response = await request.get('/site.webmanifest');
    expect(response.headers()['content-type']).toContain('application/manifest+json');
  });

  for (const filePath of [
    '/favicon.ico',
    '/favicon.svg',
    '/apple-touch-icon.png',
    '/site.webmanifest',
    '/.well-known/security.txt',
  ]) {
    test(`Given 稼働中のサイト / When ${filePath} を GET / Then 200`, async ({ request }) => {
      const response = await request.get(filePath);
      expect(response.status(), `${filePath} の応答`).toBe(200);
    });
  }

  for (const missing of ['/no-such.txt', '/poker/no-such.png', '/timer/assets/no-such.js']) {
    test(`Given 実体の無いファイル / When ${missing} を GET / Then 404（index.html の 200 に化けない）`, async ({
      request,
    }) => {
      const response = await request.get(missing);
      expect(response.status(), `${missing} の応答`).toBe(404);
    });
  }

  test('Given 実体の無い資材 / When /timer/assets/no-such.js を GET / Then 404 に immutable が付かない', async ({
    request,
  }) => {
    // 付くと、あとで同名の資材を置いても長期キャッシュされた 404 が残る
    const response = await request.get('/timer/assets/no-such.js');
    expect(response.status()).toBe(404);
    expect(response.headers()['cache-control'] ?? '').not.toContain('immutable');
  });

  test('Given 拡張子の無い /timer/assets/no-such-page / When GET / Then index.html の 200 で no-cache（immutable な HTML にならない）', async ({
    request,
  }) => {
    const response = await request.get('/timer/assets/no-such-page');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    expect(response.headers()['cache-control']).toBe('no-cache');
  });

  for (const spaPath of ['/no-such-page', '/?room=E2E-abc1', '/poker/room/E2E-abc1']) {
    test(`Given 拡張子の無い経路 / When ${spaPath} を GET / Then index.html が 200 で返る`, async ({
      request,
    }) => {
      const response = await request.get(spaPath);
      expect(response.status(), `${spaPath} の応答`).toBe(200);
      expect(response.headers()['content-type']).toContain('text/html');
    });
  }

  for (const pagePath of PAGES) {
    test(`Given ${pagePath} の HTML / When 紹介の画像とアイコンを辿る / Then 同じ相手から取得できる`, async ({
      request,
    }) => {
      // Given
      const html = await (await request.get(pagePath)).text();

      // Then その1: og:image のパス部分を同じ相手へ GET して画像が返る
      const og = tagsOf(html, 'meta').find((t) => t.property === 'og:image');
      expect(og?.content, `${pagePath} に og:image が無い`).toBeTruthy();
      const ogPath = new URL(og?.content ?? '').pathname;
      const image = await request.get(ogPath);
      expect(image.status(), `${ogPath} の応答`).toBe(200);
      expect(image.headers()['content-type']).toContain('image/png');

      // Then その2: アイコンの参照は常にルート直下（サブパスに書き換わっていない）で、取得できる
      const hrefs = tagsOf(html, 'link')
        .filter((t) => t.rel === 'icon')
        .map((t) => t.href ?? '');
      expect(hrefs.length, `${pagePath} に rel=icon が無い`).toBeGreaterThan(0);
      for (const href of hrefs) {
        expect(href.startsWith('/'), `${href} が / で始まらない`).toBe(true);
        expect(href.startsWith('//'), `${href} がプロトコル相対`).toBe(false);
        expect((await request.get(href)).status(), `${href} の応答`).toBe(200);
      }
    });

    test(`Given ${pagePath} / When HTML と資材のヘッダを見る / Then HTML は no-cache・資材は immutable`, async ({
      request,
    }) => {
      // Given / When
      const page = await request.get(pagePath);
      // Then: HTML は毎回確かめさせる（配布で資材の名前が変わるため）
      expect(page.headers()['cache-control']).toBe('no-cache');

      // Then: ハッシュ付きの資材は長期キャッシュ
      const html = await page.text();
      const ref = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((m) => m[1] ?? '')
        .find((r) => r.includes('/assets/'));
      expect(ref, `${pagePath} に資材の参照が無い`).toBeDefined();
      const asset = await request.get(ref ?? '');
      expect(asset.status()).toBe(200);
      expect(asset.headers()['cache-control']).toContain('immutable');
    });
  }
});
