/**
 * CSS の寸法の式（jsdom では寸法を測れないので、書いてある式そのものを見る。見た目は撮影で確かめる）。
 * @requirements #429 利用者フィードバック（進行表の枠・読み上げのボタン・小さな印の線）
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../src');
const read = (file: string): string => readFileSync(path.join(SRC, file), 'utf8');

/** 規則 `selector { ... }` の本体（最初の一致） */
const ruleBody = (css: string, selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
};

describe('進行表の枠の高さの上限', () => {
  const css = read('run.css');

  it('Given 狭い幅 / When 式を見る / Then 下限を付けたうえで画面の高さ − 4rem で上から押さえる', () => {
    expect(ruleBody(css, '.step-list')).toContain('--step-list-max-height: min(max(70dvh, 36rem), calc(100dvh - 4rem));');
  });

  it('Given 広い幅 / When 式を見る / Then 下限を付けたうえで画面の高さ − 4rem で上から押さえる', () => {
    expect(css).toContain('--step-list-max-height: min(max(calc(100dvh - 17.25rem), 40rem), calc(100dvh - 4rem));');
  });
});

describe('読み上げのボタン（フォーカスで現れたとき）', () => {
  it('Given フォーカスが当たる / When 規則を見る / Then ui-button--sm と同じ最小の高さと上下の padding に戻す', () => {
    const body = ruleBody(read('run.css'), '.run-speak.ui-visually-hidden:focus-visible');
    expect(body).toContain('min-height: 2.25rem;');
    expect(body).toMatch(/padding:\s*0 var\(--space-4\);/);
    expect(body).not.toContain('padding-inline');
  });
});

describe('小さな終了見込みの印の線', () => {
  it('Given 盤の下の一行・見出しの小さな印 / When 規則を見る / Then 線は小さな大きさに合わせて 1 で、色の段の規則に勝つ', () => {
    const css = read('dial.css');
    expect(ruleBody(css, '.dial-end-mark .dial-marker')).toContain('stroke-width: 1;');
    // 盤の縁の印の線（1。巻きは 2.2）は変えない
    expect(ruleBody(css, '.dial-marker')).toContain('stroke-width: 1;');
    expect(ruleBody(css, '.dial-marker--early')).toContain('stroke-width: 2.2;');
  });
});

/**
 * 映している間も接続の告知の帯が見えること（#471 レビュー）。映す表示（`.projection`）は fixed で全面を覆うので、
 * 帯（sticky）の層がそれ以下だと覆われて見えない。jsdom は重なりを測れないので、書いてある層の値を比べる。
 * 実際に最前面にあることは E2E（notices-a11y の agenda）が elementFromPoint で見る。
 */
describe('接続の告知の帯は映す表示より前に出る', () => {
  const zOf = (css: string, selector: string): number => {
    const m = /z-index:\s*(\d+)/.exec(ruleBody(css, selector));
    expect(m, `${selector} に z-index が無い`).not.toBeNull();
    return Number(m![1]);
  };

  it('Given 帯と映す表示の CSS / When z-index を比べる / Then 帯の方が大きい', () => {
    const banner = readFileSync(path.resolve(__dirname, '../../../packages/ui/src/components/banner.css'), 'utf8');
    expect(zOf(banner, '.ui-banner')).toBeGreaterThan(zOf(read('run.css'), '.projection'));
  });
});
