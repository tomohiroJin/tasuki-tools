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
    expect(css).toContain('--step-list-max-height: min(max(calc(100dvh - 14rem), 40rem), calc(100dvh - 4rem));');
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
