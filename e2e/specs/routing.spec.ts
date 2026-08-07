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
      for (const ref of refs) {
        expect(ref, `${pagePath} の資材参照`).toContain(expectedPrefix);
      }

      // Then その3: **実際に取得できる。** 文字列の一致だけだと、
      //             資材が配信されていなくても緑になる
      for (const ref of refs) {
        const asset = await request.get(ref);
        expect(asset.status(), `${ref} の取得`).toBe(200);
      }
    });
  }
});
