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
