/**
 * 6 つの index.html の「外側」（OGP・Twitter Card・description・theme-color・アイコンの link）を固定する
 * （#434）。
 *
 * index.html は静的なので、紹介の文言は道具の札（`src/tools.ts`）の写しになる。
 * 写しが正本とずれると、Slack や X に出る紹介だけが古い名前になる —— それを機械的に止める。
 * 対象は `apps/` を走査して集める（列挙すると、アプリを足したときに黙って取り残す）。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { TOOLS } from '../src/tools';

/** jsdom 環境では import.meta.url が使えないので、カレントから遡ってルートを探す。 */
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

/** palette.css から 16 進値を取り出す。見つからなければ例外（トークン改名で検査だけ緑になるのを防ぐ）。 */
function paletteHex(name: string): string {
  const css = readFileSync(path.join(REPO_ROOT, 'packages/ui/src/tokens/palette.css'), 'utf8');
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!match?.[1]) throw new Error(`palette.css に --${name} が見つからない`);
  return match[1];
}

const OG_IMAGE = 'https://tasuki.niku9.click/og.png';
const OG_IMAGE_ALT = 'Tasuki — 緑の卓に置かれたトランプの札';
const LANDING_DESCRIPTION = 'チームで開発を回すための道具。ルームを作るか、招かれたルームに入ります。';
const EXPECTED_LINKS = [
  { rel: 'icon', href: '/favicon.ico', sizes: '32x32', type: null },
  { rel: 'icon', href: '/favicon.svg', sizes: null, type: 'image/svg+xml' },
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: null, type: null },
  { rel: 'manifest', href: '/site.webmanifest', sizes: null, type: null },
];

interface Page {
  name: string;
  doc: Document;
}

const PAGES: Page[] = readdirSync(path.join(REPO_ROOT, 'apps'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(path.join(REPO_ROOT, 'apps', entry.name, 'index.html')))
  .map((entry) => ({
    name: entry.name,
    doc: new DOMParser().parseFromString(
      readFileSync(path.join(REPO_ROOT, 'apps', entry.name, 'index.html'), 'utf8'),
      'text/html',
    ),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** `<meta name=…>` または `<meta property=…>` の content。無ければ null。 */
function meta(doc: Document, key: string): string | null {
  const el = doc.head.querySelector(`meta[name="${key}"], meta[property="${key}"]`);
  return el?.getAttribute('content') ?? null;
}

it('対象のページを apps/ から導けている（空振りすると下の検査は全部 0 件で緑になる）', () => {
  expect(PAGES.length).toBeGreaterThanOrEqual(6);
  expect(PAGES.map((p) => p.name)).toContain('landing');
});

describe('全ページ共通', () => {
  for (const page of PAGES) {
    describe(page.name, () => {
      const { doc } = page;

      it('OGP と Twitter Card の共通の値が揃う', () => {
        expect(meta(doc, 'og:type')).toBe('website');
        expect(meta(doc, 'og:site_name')).toBe('Tasuki');
        expect(meta(doc, 'og:locale')).toBe('ja_JP');
        expect(meta(doc, 'og:image')).toBe(OG_IMAGE);
        expect(meta(doc, 'og:image:width')).toBe('1200');
        expect(meta(doc, 'og:image:height')).toBe('630');
        expect(meta(doc, 'og:image:alt')).toBe(OG_IMAGE_ALT);
        expect(meta(doc, 'twitter:card')).toBe('summary_large_image');
      });

      it('og:title と twitter:title が同じ', () => {
        const title = meta(doc, 'og:title');
        expect(title).toBeTruthy();
        expect(meta(doc, 'twitter:title')).toBe(title);
      });

      it('description・og:description・twitter:description が同じ', () => {
        const description = meta(doc, 'description');
        expect(description).toBeTruthy();
        expect(meta(doc, 'og:description')).toBe(description);
        expect(meta(doc, 'twitter:description')).toBe(description);
      });

      it('og:url を書かない（招待 URL のルームが玄関に畳まれるのを避ける）', () => {
        expect(doc.head.querySelector('meta[property="og:url"], meta[name="og:url"]')).toBeNull();
      });

      it('theme-color が palette.css の --felt-900 と一致する', () => {
        expect(meta(doc, 'theme-color')?.toLowerCase()).toBe(paletteHex('felt-900').toLowerCase());
      });

      it('アイコンの link が 4 本、決まった順で並ぶ', () => {
        const links = [...doc.head.querySelectorAll('link')].map((el) => ({
          rel: el.getAttribute('rel'),
          href: el.getAttribute('href'),
          sizes: el.getAttribute('sizes'),
          type: el.getAttribute('type'),
        }));
        expect(links).toEqual(EXPECTED_LINKS);
      });

      it('data: の href を持つアイコン（絵文字）が無い', () => {
        const dataIcons = [...doc.head.querySelectorAll('link[rel~="icon"]')].filter((el) =>
          (el.getAttribute('href') ?? '').trim().toLowerCase().startsWith('data:'),
        );
        expect(dataIcons).toHaveLength(0);
      });
    });
  }
});

describe('玄関', () => {
  const landing = PAGES.find((p) => p.name === 'landing')!;

  it('紹介の題と説明が設計の表のとおり', () => {
    expect(meta(landing.doc, 'og:title')).toBe('Tasuki');
    expect(meta(landing.doc, 'og:description')).toBe(LANDING_DESCRIPTION);
    expect(meta(landing.doc, 'description')).toBe(LANDING_DESCRIPTION);
  });

  it('検索除外（robots）を残している', () => {
    expect(meta(landing.doc, 'robots')).toBe('noindex, nofollow');
  });
});

describe('道具（TOOLS が正本）', () => {
  for (const tool of TOOLS) {
    it(`${tool.id}: 紹介の題と説明が tools.ts の写しと一致する`, () => {
      const page = PAGES.find((p) => p.name === `${tool.id}-web`);
      expect(page, `apps/${tool.id}-web/index.html が無い（TOOLS に載っているのに）`).toBeDefined();
      expect(meta(page!.doc, 'og:title')).toBe(`${tool.name} — Tasuki`);
      expect(meta(page!.doc, 'og:description')).toBe(tool.summary);
      expect(meta(page!.doc, 'description')).toBe(tool.summary);
    });
  }
});
