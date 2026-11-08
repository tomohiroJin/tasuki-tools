/**
 * 手元の操作の帯と映す表示の帯の地は不透明で、帯の下の余白は帯の高さ ＋ ホームバーの高さ（#554・#479 の #2。帯の約束は `packages/ui/README.md`）。
 * jsdom は描かないので、書いてある宣言そのものを見る。実際の見え方（字の点を帯が受ける・不透明・最下部で隠れない）は E2E の
 * `e2e/specs/header-and-dock.spec.ts` が見る。CSS を読む関数は部品の試験と共有する（`@tasuki/ui/test-support/css-text.mjs`。
 * 依存の向きの監査は相対パスの越境だけを止めるので、パッケージ名の取り込みなら通る）。
 * @requirements #554 帯の字の後ろに中身が透けて重なり、最下部で最後の行が帯に隠れた
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mediaBlocks, outsideMedia, rules } from '@tasuki/ui/test-support/css-text.mjs';

const css = readFileSync(path.resolve(__dirname, '../src/run.css'), 'utf8');

/** 選択子が `selector` で、`must` を含む規則の本体（ちょうど 1 つ）。`source` を渡すとその範囲だけを読む。 */
const bodyWith = (selector: string, must: string, source: string = css): string => {
  const bodies = rules(source).filter((r) => r.selector === selector && r.body.includes(must)).map((r) => r.body);
  expect(bodies).toHaveLength(1);
  return bodies[0] ?? '';
};

describe('手元の操作の帯', () => {
  it('Given 画面の下に固定する帯 / When 地を見る / Then 部品と同じ不透明なトークンで、透明へ溶かすグラデーションを使わない', () => {
    const body = bodyWith('.run-controls', 'position: fixed');
    expect(body).toMatch(/background:\s*var\(--dock-ground\);/);
    expect(body).toMatch(/border-top:\s*1px solid var\(--dock-edge\);/);
    expect(body).not.toMatch(/gradient|transparent|rgba/);
  });

  it('Given 画面の下に固定する帯 / When 上端の余白を見る / Then 上の内側の余白は --space-4（下限 --space-2）', () => {
    expect(bodyWith('.run-controls', 'position: fixed')).toMatch(/padding:\s*var\(--space-4\) /);
  });

  it('Given 帯の下の余白 / When 式を見る / Then 帯の下の余白は測った帯の高さの変数だけ（border-box で、帯の safe-area を含む。使う側では足さない）', () => {
    expect(bodyWith('.run-controls', 'position: fixed')).toMatch(/calc\(var\(--space-4\) \+ env\(safe-area-inset-bottom\)\)/);
    const run = bodyWith('.run', 'padding-bottom: var(--run-controls-height)');
    expect(run).toMatch(/padding-bottom:\s*var\(--run-controls-height\);/);
    expect(run).not.toMatch(/safe-area/); // 測った値（border-box）がホームバーを含むので足さない（二重にしない）
    // 変数は :root に無条件で 1 か所。Tab の送り先の余白（scroll-padding）は 64rem 未満だけ（帯が fixed の幅）で、:has は宣言を置く条件だけに使う
    // 既定値にホームバーの高さを含める（測った値は border-box で含むので、使う側では足さない）
    expect(bodyWith(':root', '--run-controls-height', outsideMedia(css))).toMatch(/--run-controls-height:\s*calc\(10\.5rem \+ env\(safe-area-inset-bottom\)\);/);
    // Tab の送り先の余白は 64rem 未満の @media の中だけ（64rem 以上は帯が流れの中なので掛けない）
    const narrow = mediaBlocks(css, '@media (width < 64rem)');
    expect(outsideMedia(css)).not.toContain('scroll-padding-block-end');
    const root = bodyWith('html:has(.run-controls)', 'scroll-padding-block-end', narrow);
    expect(root).toMatch(/scroll-padding-block-end:\s*var\(--run-controls-height\);/);
    expect(root).not.toMatch(/safe-area/);
    expect(root).not.toMatch(/--run-controls-height\s*:/);
  });
});

describe('映す表示の帯', () => {
  it('Given 映す表示の操作帯 / When 地を見る / Then 不透明で、透明へ溶かすグラデーションを使わない（後ろの大きな字がボタンの字に重なる）', () => {
    const body = bodyWith('.projection-strip', 'position: fixed');
    expect(body).toMatch(/background:\s*var\(--dock-ground\);/);
    expect(body).not.toMatch(/gradient|transparent|rgba|scrim/);
  });

  it('Given 映す表示 / When 中身の下の余白を見る / Then 40rem 未満と背の低い横向きは隠れる量だけ（盤を動かさず margin で）、40rem 以上 64rem 未満の高さ 48rem 以上は常に帯の高さぶんを取り、64rem 以上は取らない', () => {
    expect(bodyWith(':root', '--projection-strip-height', outsideMedia(css))).toMatch(/--projection-strip-height:\s*10rem;/);
    // 40rem 以上は帯が 1 行（実測 69px）なので、段ごとに 4.4rem（横向きのスマートフォンやタブレットで取りすぎない）
    expect(bodyWith(':root', '--projection-strip-height', mediaBlocks(css, '@media (width >= 40rem)'))).toMatch(/--projection-strip-height:\s*4\.4rem;/);
    // 余白は @media の外には無い（64rem 以上は帯が中身に重ならないので取らない。取ると盤が約 80px 上に寄る）
    expect(outsideMedia(css)).not.toMatch(/\.projection-body\s*\{[^}]*padding-block-end/);
    // 40rem 未満と、40rem 以上 64rem 未満で高さが 48rem 未満（背の低い横向き）: 帯が出ている間に隠れる量だけ（use-projection-clearance が測る。無条件に足すと盤が跳ね、常に取ると #471 の既存の検査が赤になる）
    const narrowRule = bodyWith('.projection-body', 'margin-block-end', mediaBlocks(css, '@media (width < 40rem), (width >= 40rem) and (width < 64rem) and (height < 48rem)'));
    expect(narrowRule).toMatch(/margin-block-end:\s*var\(--projection-clearance, 0px\);/);
    expect(narrowRule).toMatch(/min-block-size:\s*var\(--projection-body-pin, 0px\);/);
    expect(narrowRule).not.toMatch(/padding/);
    // 40rem 以上 64rem 未満で高さが 48rem 以上: 常に（通常の下の余白 --space-6 は足さず置き換える。足すと 768×1024 で縦のスクロールが出る）
    expect(bodyWith('.projection-body', 'padding-block-end', mediaBlocks(css, '@media (width >= 40rem) and (width < 64rem) and (height >= 48rem)'))).toMatch(/padding-block-end:\s*calc\(var\(--projection-strip-height\) \+ env\(safe-area-inset-bottom\)\);/);
  });
});
