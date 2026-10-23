/**
 * サイトのルートに置く公開テキストファイルを固定する（#434・設計 §4.4–§4.6）。
 *
 * - robots.txt は全面拒否の 1 本だけ（正本はルート。ツール別に重ねて置かない）
 * - site.webmanifest の色は palette.css の --felt-900 と揃える（生の色を書かない規約）
 * - security.txt の Expires は期限切れを放置すると RFC 9116 上「無効」になるため、
 *   30 日前から赤にして更新を促す
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** リポジトリルートを上方向に探す（jsdom では import.meta.url が使えないためカレントから遡る）。 */
function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, 'deploy')) && existsSync(path.join(dir, 'apps'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`リポジトリルートが見つからない（${from} から探索）`);
    dir = parent;
  }
}

const REPO_ROOT = findRepoRoot(process.cwd());
const PUBLIC_DIR = path.join(REPO_ROOT, 'apps/landing/public');

/** palette.css から 16 進値を取り出す。見つからなければ例外（トークン改名で偽の緑にしない）。 */
function paletteHex(name: string): string {
  const css = readFileSync(path.join(REPO_ROOT, 'packages/ui/src/tokens/palette.css'), 'utf8');
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!match?.[1]) throw new Error(`palette.css に --${name} が見つからない`);
  return match[1];
}

function readPublic(rel: string): string {
  return readFileSync(path.join(PUBLIC_DIR, rel), 'utf8');
}

/** 空行と `#` コメント行を除いた行。 */
function significantLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

describe('robots.txt', () => {
  it('User-agent: * と Disallow: / の 2 行だけ（全面拒否）', () => {
    expect(significantLines(readPublic('robots.txt'))).toEqual(['User-agent: *', 'Disallow: /']);
  });

  it('timer-web に重ねて置かない（正本はルートの 1 本）', () => {
    expect(existsSync(path.join(REPO_ROOT, 'apps/timer-web/public/robots.txt'))).toBe(false);
  });
});

describe('site.webmanifest', () => {
  const manifest = JSON.parse(readPublic('site.webmanifest')) as {
    name: string;
    short_name: string;
    start_url: string;
    display: string;
    theme_color: string;
    background_color: string;
    icons: { src: string; sizes: string }[];
  };

  it('名前・開始位置・表示方法', () => {
    expect(manifest.name).toBe('Tasuki');
    expect(manifest.short_name).toBe('Tasuki');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('browser');
  });

  it('theme_color と background_color が palette.css の --felt-900 と一致する', () => {
    const felt = paletteHex('felt-900').toLowerCase();
    expect(manifest.theme_color.toLowerCase()).toBe(felt);
    expect(manifest.background_color.toLowerCase()).toBe(felt);
  });

  it('icons の src が / 始まりで実体があり、192x192 と 512x512 を含む', () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/')).toBe(true);
      expect(existsSync(path.join(PUBLIC_DIR, icon.src.slice(1)))).toBe(true);
    }
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });
});

describe('.well-known/security.txt', () => {
  const text = readPublic('.well-known/security.txt');
  const SECURITY_URL = 'https://github.com/tomohiroJin/tasuki-tools/blob/main/SECURITY.md';

  it('Contact・Policy・Preferred-Languages・Expires を持つ', () => {
    expect(text).toMatch(new RegExp(`^Contact: ${SECURITY_URL}$`, 'm'));
    expect(text).toMatch(new RegExp(`^Policy: ${SECURITY_URL}$`, 'm'));
    expect(text).toMatch(/^Preferred-Languages: ja, en$/m);
    expect(text).toMatch(/^Expires: .+$/m);
  });

  it('Expires が現在から 30 日より先（期限が近い。Expires を 1 年先へ書き換える）', () => {
    const raw = /^Expires: (.+)$/m.exec(text)?.[1] ?? '';
    const expires = new Date(raw);
    expect(Number.isNaN(expires.getTime())).toBe(false);
    const limit = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(
      expires.getTime(),
      'apps/landing/public/.well-known/security.txt の Expires を 1 年先へ書き換える',
    ).toBeGreaterThan(limit);
  });

  it('メールアドレスを載せない', () => {
    expect(text).not.toMatch(/mailto:/i);
    expect(text).not.toMatch(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  });
});
