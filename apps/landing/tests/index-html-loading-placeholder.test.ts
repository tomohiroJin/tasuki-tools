/**
 * 選択画面から timer / poker / topic へ移動する遷移中の白画面対策
 * （#95 S5c 追補・#91 PR 2・利用者の実画面フィードバック）。
 *
 * React が起動する前（HTML が届いて JS をダウンロード・パースする間）は
 * `Loading`（`apps/timer-web/src/ui/Loading.tsx`）を描けない。この区間を
 * 埋められるのは `index.html` の `<div id="root">` に置いた静的なプレースホルダ
 * だけである。4 つのアプリすべてに置かないと、置き忘れたアプリだけ
 * 白い画面が残る —— それを個別の `it` で検出する（まとめて OR で見ると
 * 1 つ消しても通ってしまう）。
 *
 * 色はインラインで書く必要がある（CSS がまだ当たっていないため）。
 * ただし「生の色を書かない」規約があるので、その値が
 * `packages/ui/src/tokens/palette.css` のトークンと一致することを
 * 機械的に固定する（`caddy-fragment-port.test.ts` と同じ作法）。
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

const REPO_ROOT = findRepoRoot(process.cwd());

/** 遷移中の白画面を埋める文言。`Loading.tsx` と揃える（利用者に見える言葉を統一する）。 */
const PLACEHOLDER_TEXT = '読み込んでいます…';

/**
 * トークンの実体（`packages/ui/src/tokens/palette.css`）から 16 進値を取り出す。
 * 見つからない場合は例外にする（トークン名が変わったのに検査だけ緑という事故を防ぐ）。
 */
function paletteHex(name: string): string {
  const css = readFileSync(path.join(REPO_ROOT, 'packages/ui/src/tokens/palette.css'), 'utf8');
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!match?.[1]) throw new Error(`palette.css に --${name} が見つからない`);
  return match[1];
}

const BG_HEX = paletteHex('felt-950'); // #071f18（timer-web の --ink の出所）
const TEXT_HEX = paletteHex('ivory'); // #f5efdd（4 アプリ共通の最明テキスト）

const APPS: { name: string; indexHtml: string }[] = [
  { name: 'landing', indexHtml: 'apps/landing/index.html' },
  { name: 'timer-web', indexHtml: 'apps/timer-web/index.html' },
  { name: 'poker-web', indexHtml: 'apps/poker-web/index.html' },
  { name: 'topic-web', indexHtml: 'apps/topic-web/index.html' },
];

describe('index.html の #root に、React 起動前を埋めるプレースホルダがある', () => {
  for (const app of APPS) {
    describe(app.name, () => {
      const html = readFileSync(path.join(REPO_ROOT, app.indexHtml), 'utf8');

      it('#root の中に読み込み中の文言がある', () => {
        // Given: React がまだ起動していない生の HTML
        // When: #root の内側を取り出す
        const rootMatch = /<div id="root">([\s\S]*?)<\/div>\s*<script/.exec(html);
        expect(rootMatch, `${app.indexHtml} の #root が見つからない`).not.toBeNull();

        // Then: 文言が入っている（React 起動前でも「待っている」と分かる）
        expect(rootMatch![1]).toContain(PLACEHOLDER_TEXT);
      });

      it('背景色がトークン（--felt-950）と一致する', () => {
        // CSS が当たる前に白い画面が見えないよう、背景をインラインで塗る必要がある。
        // その値がパレットの生成元と食い違うと、React 起動直後に色がずれてちらつく。
        expect(html.toLowerCase()).toContain(BG_HEX.toLowerCase());
      });

      it('文字色がトークン（--ivory）と一致する', () => {
        expect(html.toLowerCase()).toContain(TEXT_HEX.toLowerCase());
      });
    });
  }
});
