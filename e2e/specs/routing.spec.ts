/**
 * 経路の確認（@smoke）。ブラウザを開かず HTTP だけで確かめる。
 *
 * ここが落ちるということは、Caddy 断片・base パス・リバースプロキシの
 * いずれかが壊れているということ。#73 が挙げた「検出できていないもの」の中核。
 */
import { expect, test } from '@playwright/test';

const PAGES = ['/', '/timer/', '/poker/'] as const;

test.describe('@smoke 3 系統が並存する', () => {
  for (const pagePath of PAGES) {
    test(`Given 稼働中のサイト / When ${pagePath} を GET / Then 200 が返る`, async ({ request }) => {
      // Given: ハーネス（または本番）が動いている
      // When
      const response = await request.get(pagePath);
      // Then: 断片が欠けると包括フォールバックに吸われるが、それは 200 のまま。
      //       どのアプリが返っているかは資材の接頭辞（別シナリオ）で見分ける。
      expect(response.status(), `${pagePath} の応答`).toBe(200);
    });
  }
});

/** HTML から資材（js / css）の参照を抜き出す。 */
function extractAssetRefs(html: string): string[] {
  const refs: string[] = [];
  const pattern = /(?:src|href)="([^"]+)"/g;
  for (;;) {
    const match = pattern.exec(html);
    if (match === null) break;
    const ref = match[1];
    if (ref !== undefined && ref.includes('/assets/')) refs.push(ref);
  }
  return refs;
}

const ASSET_PREFIXES: Readonly<Record<string, string>> = {
  '/': '/assets/',
  '/timer/': '/timer/assets/',
  '/poker/': '/poker/assets/',
};

/** 資材の拡張子から、期待される Content-Type の断片を返す。 */
function expectedContentType(ref: string): string {
  if (ref.includes('.js')) return 'javascript';
  if (ref.includes('.css')) return 'css';
  throw new Error(`想定していない資材の種類です: ${ref}`);
}

test.describe('@smoke 資材が正しい接頭辞を持ち、実際に取得できる', () => {
  for (const pagePath of PAGES) {
    test(`Given ${pagePath} の HTML / When 資材の参照を辿る / Then 接頭辞が正しく 200 で取得できる`, async ({
      request,
    }) => {
      // Given: 各アプリの index.html
      const html = await (await request.get(pagePath)).text();
      const refs = extractAssetRefs(html);

      // Then その1: 参照が 1 つ以上ある。0 件だと以降の検査が素通りする
      expect(refs.length, `${pagePath} に資材の参照が無い`).toBeGreaterThan(0);

      // Then その2: 接頭辞が正しい。ここが崩れるのが #76 F-1 と同じ壊れ方であり、
      //             どのアプリが返っているかの見分けにもなる
      const expectedPrefix = ASSET_PREFIXES[pagePath];
      if (expectedPrefix === undefined) throw new Error(`${pagePath} の期待接頭辞が未定義`);
      for (const ref of refs) {
        // **toContain では駄目。** `/timer/assets/...` も `/assets/` を含むため、
        // `/` の判定が常に真になり、玄関が別アプリに化けても緑になる（実測）。
        expect(ref.startsWith(expectedPrefix), `${ref} が ${expectedPrefix} で始まらない`).toBe(true);
      }

      // Then その3: **実際に取得でき、しかも中身がその資材であること。**
      // status だけを見てはいけない。断片は try_files {path} /index.html を持つため、
      // **資材が消えていても SPA フォールバックが index.html を 200 で返す**。
      // 実測で確認済み: 資材を削除しても status は 200 のままだった。
      // Content-Type で「返ってきたのが JS/CSS か、HTML へ縮退したか」を見分ける。
      for (const ref of refs) {
        const asset = await request.get(ref);
        expect(asset.status(), `${ref} の取得`).toBe(200);
        expect(asset.headers()['content-type'], `${ref} の Content-Type`).toContain(
          expectedContentType(ref),
        );
      }
    });
  }
});

test.describe('@smoke 末尾スラッシュの救済', () => {
  for (const [from, to] of [
    ['/timer', '/timer/'],
    ['/poker', '/poker/'],
  ] as const) {
    test(`Given ${from} / When GET する / Then 301 で ${to} へ送られる`, async ({ request }) => {
      // Given / When: **追跡させない。** 既定では追跡され、最終的な 200 を見て
      //               「301 を確認したつもり」になる
      const response = await request.get(from, { maxRedirects: 0 });
      // Then
      expect(response.status()).toBe(301);
      // **行き先まで固定する。** 301 であることだけでは、行き先が壊れても緑になる
      expect(response.headers()['location']).toBe(to);
    });
  }
});

test.describe('@smoke 旧共有リンクの救済', () => {
  test('Given /?room=ABC123 / When GET する / Then 301 で /timer/ へクエリごと送られる', async ({
    request,
  }) => {
    // Given / When
    const response = await request.get('/?room=ABC123', { maxRedirects: 0 });
    // Then: クエリを落とす改変（redir @legacy-room /timer/ permanent）でも 301 は
    //       返り続けるため、Location の値まで固定しないと #76 J-1 と同じ壊れ方が素通りする
    expect(response.status()).toBe(301);
    expect(response.headers()['location']).toBe('/timer/?room=ABC123');
  });

  test('Given room の無い / / When GET する / Then 200 で玄関のまま', async ({ request }) => {
    // Given / When: 玄関の役割が損なわれていないこと
    const response = await request.get('/', { maxRedirects: 0 });
    // Then
    expect(response.status()).toBe(200);
  });
});

test.describe('@smoke WebSocket が SPA に吸われていない', () => {
  /**
   * 応答コードが違うのは実装の差。timer-sync（ws-adapter）は Upgrade が無ければ 426、
   * poker-sync は `url.pathname === '/ws'` を検査したうえで upgrade に失敗して 400 を返す。
   * 「200 でないこと」ではなく具体値で固定する。値が変わったら実装が変わったということ。
   *
   * **注意: これは timer 側の経路の正しさを保証しない。** timer-sync はパスを見ずに
   * 無条件で upgrade を試みるため、断片から `rewrite * /ws` を削っても 426 は返り続ける。
   * timer の経路の正しさは第 2 段の実接続（@core）に委ねる。
   */
  for (const [wsPath, expectedStatus] of [
    ['/timer/ws', 426],
    ['/poker/ws', 400],
  ] as const) {
    test(`Given ${wsPath} / When 素の GET を送る / Then ${expectedStatus} が返る（SPA の 200 ではない）`, async ({
      request,
    }) => {
      // Given / When
      const response = await request.get(wsPath);
      // Then
      expect(response.status()).toBe(expectedStatus);
    });
  }
});

test.describe('@smoke サイトブロックのヘッダ', () => {
  /**
   * Strict-Transport-Security も対象に含める。`header {}` の静的指定なので
   * TLS の有無に関係なく付与される（http でも実測で確認済み）。
   */
  const EXPECTED_HEADERS: Readonly<Record<string, string>> = {
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-robots-tag': 'noindex, nofollow',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'referrer-policy': 'same-origin',
  };

  test('Given / / When GET する / Then 5 種のヘッダがすべて付いている', async ({ request }) => {
    // Given / When
    const headers = (await request.get('/')).headers();
    // Then
    for (const [name, value] of Object.entries(EXPECTED_HEADERS)) {
      expect(headers[name], `${name} の値`).toBe(value);
    }
  });
});
