/**
 * セッションの下端の帯の寸法の宣言（#554・#479 の #19。帯の約束は `packages/ui/README.md`）。
 * jsdom は寸法を測れないので、書いてある宣言そのものを見る。実際の見え方（320px で字が折れない・2 段まで）は
 * `e2e/specs/header-and-dock.spec.ts` が見る。
 * @requirements #554 timer の帯の「時間リセット」が 320px で 2 行に折れていた
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(__dirname, '../src/styles/session.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const body = (selector: string): string => {
  const found = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => (m[1] ?? '').trim() === selector);
  expect(found).toHaveLength(1);
  return found[0]?.[2] ?? '';
};

describe('timer のセッションの帯', () => {
  it('Given 40rem 未満の帯 / When 左右の余白を見る / Then 帯もボタンも余白を 1 段詰めて、1 列（約 122px）に字が収まる', () => {
    expect(body('.session-driver-card > .session-actions')).toMatch(/padding-inline:\s*var\(--space-4\);/);
    expect(body('.session-driver-card > .session-actions > *')).toMatch(/padding-inline:\s*var\(--space-1\);/);
  });
});
