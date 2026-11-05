/**
 * 手元の操作の帯の地は不透明（#554・#479 の #2。帯の約束は `packages/ui/README.md`）。
 * jsdom は描かないので、書いてある地の宣言そのものを見る。実際の見え方（字の点を帯が受ける・不透明）は E2E の
 * `e2e/specs/header-and-dock.spec.ts` が見る。
 * @requirements #554 帯の字「このステップに」の後ろに進行表の字が透けて重なり、読めなかった
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(__dirname, '../src/run.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** `.run-controls { ... }` の本体のうち、画面の下に固定する規則（`position: fixed`）のもの。 */
const fixedBody = (): string => {
  const bodies = [...css.matchAll(/\.run-controls\s*\{([^{}]*)\}/g)].map((m) => m[1] ?? '').filter((b) => b.includes('position: fixed'));
  expect(bodies).toHaveLength(1);
  return bodies[0] ?? '';
};

describe('手元の操作の帯', () => {
  it('Given 画面の下に固定する帯 / When 地を見る / Then 不透明なフェルトで、透明へ溶かすグラデーションを使わない', () => {
    const body = fixedBody();
    expect(body).toMatch(/background:\s*var\(--felt-950\);/);
    expect(body).not.toMatch(/gradient|transparent|rgba/);
  });

  it('Given 画面の下に固定する帯 / When 上端の余白を見る / Then 上の内側の余白は --space-4（下限 --space-2）', () => {
    expect(fixedBody()).toMatch(/padding:\s*var\(--space-4\) /);
  });
});
