/**
 * サイトの紹介の画像とアイコンの形式・寸法を固定する（#434・設計 §4.1・§4.3）。
 *
 * 画像は `apps/landing/og/render-site-images.mjs` で書き出してコミットする（ビルドでは作らない）。
 * 書き出し直したときに寸法や形式が崩れても、見た目では気づきにくい —— Slack は
 * 1200×630 を外れた画像を切り抜くし、iOS は 180×180 でない apple-touch-icon を縮める。
 * ここで数値として固定する。絵の良し悪しは見ない（撮って目で確かめる）。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * リポジトリルートを上方向に探す。
 * jsdom 環境では `import.meta.url` が file スキームにならず fileURLToPath が使えないため、
 * 実行時のカレントから遡って deploy と apps が揃う場所を見つける。
 */
function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, 'deploy')) && existsSync(path.join(dir, 'apps'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`リポジトリルートが見つからない（${from} から探索）`);
    dir = parent;
  }
}

const PUBLIC_DIR = path.join(findRepoRoot(process.cwd()), 'apps/landing/public');

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * 紹介の画像の大きさの上限。Slack・X は 5MB まで受けるが、軽いほど取得が速い。
 * 卓のグラデーションで Chromium の書き出しは約 420KB になる（2026-10-24 実測）。圧縮の道具は足さない。
 */
const OG_IMAGE_MAX_BYTES = 512 * 1024;

function readPublic(name: string): Buffer {
  return readFileSync(path.join(PUBLIC_DIR, name));
}

function isPng(bytes: Buffer): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/** PNG の IHDR から幅と高さを読む（署名 8 バイト・長さ 4・種別 4 の後ろ）。 */
function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('紹介の画像（og.png）', () => {
  const bytes = readPublic('og.png');

  it('PNG で 1200×630（summary_large_image の大きさ）', () => {
    expect(isPng(bytes)).toBe(true);
    expect(pngSize(bytes)).toEqual({ width: 1200, height: 630 });
  });

  it(`大きさが ${OG_IMAGE_MAX_BYTES} バイト以下`, () => {
    expect(bytes.length).toBeLessThanOrEqual(OG_IMAGE_MAX_BYTES);
  });
});

describe('アイコンの PNG', () => {
  const cases = [
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
  ] as const;

  for (const { name, size } of cases) {
    it(`${name} が PNG で ${size}×${size}`, () => {
      const bytes = readPublic(name);
      expect(isPng(bytes)).toBe(true);
      expect(pngSize(bytes)).toEqual({ width: size, height: size });
    });
  }
});

describe('favicon.ico', () => {
  const bytes = readPublic('favicon.ico');

  it('ICO の見出し（予約 0・種別 1）で、項目が 1 つ以上ある', () => {
    expect(bytes.readUInt16LE(0)).toBe(0);
    expect(bytes.readUInt16LE(2)).toBe(1);
    expect(bytes.readUInt16LE(4)).toBeGreaterThanOrEqual(1);
  });

  it('1 つ目の項目が 32×32 で、中身が PNG', () => {
    // 項目は見出し 6 バイトの直後。幅・高さは 1 バイトずつ、中身の長さと位置は 8・12 バイト目
    expect(bytes[6]).toBe(32);
    expect(bytes[7]).toBe(32);
    const length = bytes.readUInt32LE(6 + 8);
    const offset = bytes.readUInt32LE(6 + 12);
    const image = bytes.subarray(offset, offset + length);
    expect(image.length).toBe(length);
    expect(isPng(image)).toBe(true);
    expect(pngSize(image)).toEqual({ width: 32, height: 32 });
  });
});

describe('favicon.svg', () => {
  it('SVG で viewBox を持つ（どの大きさでも縮尺が決まる）', () => {
    const svg = readPublic('favicon.svg').toString('utf8');
    expect(svg).toMatch(/<svg\b[^>]*\bviewBox="[^"]+"/);
  });
});
