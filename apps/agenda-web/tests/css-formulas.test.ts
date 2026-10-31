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
 * 映している間の接続の告知の帯（#471 レビュー）。映す表示（`.projection`）は fixed で全面を覆うので、帯は映す表示の
 * 中の上端に置く（部品の z-index は上げない。上げると隅の音の切り替えを覆う）。jsdom は重なりを測れないので、
 * 書いてある式を見る。重なりの実測は E2E（notices-a11y の agenda）が elementFromPoint と箱で固める。
 */
describe('映す表示の中の接続の告知の帯', () => {
  const css = read('run.css');

  it('Given 映す表示の外枠 / When 規則を見る / Then 縦に並べる flex（上端の枠＋残りの領域の 2 段）で、中央寄せは外枠に持たない', () => {
    const body = ruleBody(css, '.projection');
    expect(body).toContain('display: flex;');
    expect(body).toContain('flex-direction: column;');
    expect(body).not.toContain('align-content');
  });

  it('Given 上端の枠 / When 規則を見る / Then 流れの中で全幅・上端に貼りつく（sticky・縦にスクロールしても画面の上に留まる）', () => {
    const body = ruleBody(css, '.projection-top');
    expect(body).toContain('position: sticky;');
    expect(body).toContain('top: 0;');
    expect(body).toContain('flex: none;');
    expect(body).not.toContain('position: absolute;');
  });

  it('Given 残りの領域 / When 規則を見る / Then 今の中央寄せの grid（盤と横の情報）を持ち、残りの高さを取る（画面いっぱいに固定しない）', () => {
    const body = ruleBody(css, '.projection-body');
    expect(body).toContain('display: grid;');
    expect(body).toContain('flex: 1 0 auto;');
    // 画面いっぱいに固定すると、帯が出たとき帯の高さだけ下へはみ出した（映している画面は誰もスクロールしない）
    expect(body).not.toContain('min-block-size: 100%;');
    expect(body).toContain('align-content: center;');
  });

  it('Given 音の切り替えの隅 / When 規則を見る / Then 帯が無いときは main と同じ右上の隅に浮かべ、帯が出ている間は帯の下の流れの中に置く', () => {
    const body = ruleBody(css, '.projection-corner');
    expect(body).toContain('position: absolute;');
    expect(body).toContain('top: var(--space-3);');
    expect(body).toContain('right: var(--space-4);');
    const withBanner = ruleBody(css, '.projection:has(> .projection-top > .ui-banner) > .projection-corner');
    expect(withBanner).toContain('position: static;');
    expect(withBanner).toContain('align-self: flex-end;');
  });

});
