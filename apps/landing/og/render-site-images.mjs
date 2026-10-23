#!/usr/bin/env node
/**
 * サイトの紹介の画像とアイコンを書き出す（#434・設計 §4.1・§4.3）。
 *
 *     node apps/landing/og/render-site-images.mjs
 *
 * 絵の正本は `og-image.html`（紹介の画像）と `../public/favicon.svg`（アイコン）。
 * これを Chromium で撮り、`apps/landing/public/` へ PNG と ICO を書き出す。
 * **書き出した成果物はコミットする。** ビルドのたびに作らないのは、ビルドに
 * ブラウザを持ち込まないため（設計 S1）。
 *
 * Playwright は E2E（`e2e/`）が持つものを借りる。新しい依存は足さない（原則 II）。
 * ブラウザが無ければ `cd e2e && pnpm exec playwright install chromium`。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'apps/landing/public');

const { chromium } = createRequire(path.join(REPO_ROOT, 'e2e/package.json'))('@playwright/test');

/** 紹介の画像の大きさ（summary_large_image）。 */
const OG_SIZE = { width: 1200, height: 630 };

/**
 * 書き出すアイコン。`opaque` は角の透明を卓の色で埋める —— iOS は
 * apple-touch-icon の透明を黒で埋め、自前で角を丸めるため。
 */
const ICONS = [
  { file: 'apple-touch-icon.png', size: 180, opaque: true },
  { file: 'icon-192.png', size: 192, opaque: true },
  { file: 'icon-512.png', size: 512, opaque: true },
];

/** favicon.ico に包む PNG の大きさ。 */
const ICO_SIZE = 32;

/** 角を埋める卓の色（palette.css の --felt-950。アイコンの地の外縁と同じ）。 */
const OPAQUE_BACKGROUND = '#071f18';

async function renderOgImage(browser) {
  const page = await browser.newPage({ viewport: OG_SIZE, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(HERE, 'og-image.html')).href);
  await page.evaluate(() => document.fonts.ready);
  // fonts.ready は読み込みに失敗しても解決するので、代替書体のまま書き出さないよう確かめる
  const loaded = await page.evaluate(() =>
    document.fonts.check('600 112px Fraunces') && document.fonts.check('500 34px "Zen Kaku Gothic New"', 'チ'),
  );
  if (!loaded) throw new Error('書体が読み込めていません（packages/ui/src/fonts の woff2 を確かめてください）');
  const png = await page.locator('#og').screenshot({ type: 'png' });
  await page.close();
  return png;
}

async function renderIcon(browser, svgUrl, { size, opaque }) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const background = opaque ? OPAQUE_BACKGROUND : 'transparent';
  await page.setContent(
    `<body style="margin:0;background:${background}">` +
      `<img src="${svgUrl}" width="${size}" height="${size}" style="display:block"></body>`,
  );
  await page.locator('img').evaluate((img) => img.decode());
  const png = await page.screenshot({ type: 'png', omitBackground: !opaque });
  await page.close();
  return png;
}

/** PNG 1 枚を包む ICO を組む（ICONDIR 6 バイト＋項目 16 バイト＋PNG）。 */
function toIco(png, size) {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // 予約
  header.writeUInt16LE(1, 2); // 種別: アイコン
  header.writeUInt16LE(1, 4); // 項目の数
  header.writeUInt8(size, 6); // 幅
  header.writeUInt8(size, 7); // 高さ
  header.writeUInt8(0, 8); // パレットの色数（使わない）
  header.writeUInt8(0, 9); // 予約
  header.writeUInt16LE(1, 10); // 色面
  header.writeUInt16LE(32, 12); // 1 画素のビット数
  header.writeUInt32LE(png.length, 14); // 中身の長さ
  header.writeUInt32LE(header.length, 18); // 中身の位置
  return Buffer.concat([header, png]);
}

function write(file, bytes) {
  writeFileSync(path.join(PUBLIC_DIR, file), bytes);
  console.log(`書き出し: apps/landing/public/${file}（${bytes.length} バイト）`);
}

const browser = await chromium.launch();
try {
  write('og.png', await renderOgImage(browser));

  // 書体を使わない SVG なので、data: で渡せば file:// の読み込み制限に掛からない
  const svg = readFileSync(path.join(PUBLIC_DIR, 'favicon.svg'));
  const svgUrl = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  for (const icon of ICONS) write(icon.file, await renderIcon(browser, svgUrl, icon));
  write('favicon.ico', toIco(await renderIcon(browser, svgUrl, { size: ICO_SIZE, opaque: false }), ICO_SIZE));
} finally {
  await browser.close();
}
