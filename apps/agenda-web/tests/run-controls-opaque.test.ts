/**
 * 手元の操作の帯と映す表示の帯の地は不透明で、帯の下の余白は帯の高さ ＋ ホームバーの高さ（#554・#479 の #2。帯の約束は `packages/ui/README.md`）。
 * jsdom は描かないので、書いてある宣言そのものを見る。実際の見え方（字の点を帯が受ける・不透明・最下部で隠れない）は E2E の
 * `e2e/specs/header-and-dock.spec.ts` が見る。
 *
 * CSS を読む小さな関数は `packages/ui/tests/support/css-text.mjs` と同じ働きだが、アプリのテストから部品の tests を import しない
 * （型の無い .mjs で typecheck が通らず、部品の内側の置き場に依存するため）。ここは規則を 1 つ引くだけなので写しを持つ。
 * @requirements #554 帯の字の後ろに中身が透けて重なり、最下部で最後の行が帯に隠れた
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// CSS を字で読む関数は `packages/ui/tests/support/css-text.mjs` と同じ働きの写し。共有しない理由: アプリのテストが別パッケージの tests を
// 相対パスで取り込むのは `audit-dependency-direction` が止め（パッケージの外を相対パスで取り込まない）、型の無い .mjs は typecheck も通らない。
const css = readFileSync(path.resolve(__dirname, '../src/run.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** 選択子が `selector` で、`must` を含む規則の本体（ちょうど 1 つ）。 */
const bodyWith = (selector: string, must: string): string => {
  const bodies = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => (m[1] ?? '').trim() === selector && (m[2] ?? '').includes(must))
    .map((m) => m[2] ?? '');
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

  it('Given 帯の下の余白 / When 式を見る / Then 帯の高さの変数 ＋ env(safe-area-inset-bottom)（帯も同じ safe-area を足している）', () => {
    expect(bodyWith('.run-controls', 'position: fixed')).toMatch(/calc\(var\(--space-4\) \+ env\(safe-area-inset-bottom\)\)/);
    const run = bodyWith('.run', 'padding-bottom: calc(');
    expect(run).toMatch(/padding-bottom:\s*calc\(var\(--run-controls-height\) \+ env\(safe-area-inset-bottom\)\);/);
    // 変数は :root に無条件で 1 か所。Tab の送り先の余白（scroll-padding）は 64rem 未満だけ（帯が fixed の幅）で、:has は宣言を置く条件だけに使う
    expect(bodyWith(':root', '--run-controls-height')).toMatch(/--run-controls-height:\s*10\.5rem;/);
    const root = bodyWith('html:has(.run-controls)', 'scroll-padding-block-end');
    expect(root).toMatch(/scroll-padding-block-end:\s*calc\(var\(--run-controls-height\) \+ env\(safe-area-inset-bottom\)\);/);
    expect(root).not.toMatch(/--run-controls-height\s*:/);
  });
});

describe('映す表示の帯', () => {
  it('Given 映す表示の操作帯 / When 地を見る / Then 不透明で、透明へ溶かすグラデーションを使わない（後ろの大きな字がボタンの字に重なる）', () => {
    const body = bodyWith('.projection-strip', 'position: fixed');
    expect(body).toMatch(/background:\s*var\(--dock-ground\);/);
    expect(body).not.toMatch(/gradient|transparent|rgba|scrim/);
  });
});
