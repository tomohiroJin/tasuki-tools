/**
 * セッションの下端の帯の寸法の宣言（#554・#479 の #19。帯の約束は `packages/ui/README.md`）。
 * jsdom は寸法を測れないので、書いてある宣言そのものを見る。実際の見え方（320px で字が折れない・2 段まで）は
 * `e2e/specs/header-and-dock.spec.ts` が見る。
 * CSS を読む関数は部品の試験と共有する（`@tasuki/ui/test-support/css-text.mjs`。依存の向きの監査は相対パスの越境だけを止める）。
 * @requirements #554 timer の帯の「時間リセット」が 320px で 2 行に折れていた
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mediaBlock, only, rules } from '@tasuki/ui/test-support/css-text.mjs';

const css = readFileSync(path.resolve(__dirname, '../src/styles/session.css'), 'utf8');
const base = readFileSync(path.resolve(__dirname, '../src/styles/base.css'), 'utf8');

describe('timer のセッションの帯', () => {
  it('Given 40rem 未満の帯 / When 左右の余白を見る / Then 帯もボタンも余白を 1 段詰めて、1 列（約 122px）に字が収まる', () => {
    expect(only(rules(css), '.session-driver-card > .session-actions')).toMatch(/padding-inline:\s*var\(--space-4\);/);
    expect(only(rules(css), '.session-driver-card > .session-actions > *')).toMatch(/padding-inline:\s*var\(--space-1\);/);
  });

  it('Given timer の逃がし余白 / When base.css を読む / Then 既定は 6rem で、帯のある画面だけ 2 段の帯の最大の高さ ＋ ホームバー（部品層と同じ式）', () => {
    const narrow = rules(mediaBlock(base, '@media (width < 40rem)'));
    expect(only(narrow, 'html')).toMatch(/scroll-padding-block-end:\s*6rem;/);
    expect(only(narrow, 'html:has(.session-actions)')).toMatch(/scroll-padding-block-end:\s*calc\(var\(--dock-max-height\) \+ env\(safe-area-inset-bottom\)\);/);
  });
});
