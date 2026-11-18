/**
 * 開票の演出の帯（#639）の CSS の契約。動きの長さ・操作を奪わないこと・動きを減らす設定で文言が消えないこと。
 * 見た目の配置（320・1280px で重ならない）は実画面（`docs/guides/procedures/live-check.md`）と E2E が見る。
 *
 * @requirements #639
 */
import { describe, expect, it } from 'vitest';
import { foundBody, readFromCwd as read, rulesOf } from '@tasuki/test-css/css-rules';

const css = read('src/index.css');
const KINDS = ['unanimous', 'scattered', 'complete'] as const;

/** `@keyframes name { ... }` の中身（波括弧の対応で切り出す） */
function keyframes(name: string): string {
  const head = css.indexOf(`@keyframes ${name}`);
  expect(head, `@keyframes ${name} が無い`).not.toBe(-1);
  const open = css.indexOf('{', head);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`@keyframes ${name} が閉じていない`);
}

const seconds = (value: string): number => (value.endsWith('ms') ? parseFloat(value) / 1000 : parseFloat(value));

describe('開票の演出の帯の CSS（#639）', () => {
  const base = foundBody(rulesOf(css, '.results-effect'), '.results-effect');

  it('Given 帯の規則 / Then ポインタを受けず、位置を取らない（流れの中・操作を奪わない・重ならない）', () => {
    expect(base).toMatch(/pointer-events:\s*none;/);
    expect(base).not.toMatch(/position:\s*(fixed|absolute|sticky)/);
    expect(base).not.toMatch(/z-index/);
  });

  it('Given 帯の動き / Then 遅れ + 長さは 2 秒以内（開票から。ひとつの演出は 2 秒以内）', () => {
    const delay = seconds(/animation-delay:\s*([0-9.]+m?s);/.exec(base)?.[1] ?? 'NaN');
    const duration = seconds(/animation-duration:\s*([0-9.]+m?s);/.exec(base)?.[1] ?? 'NaN');
    expect(delay + duration).toBeLessThanOrEqual(2);
    expect(duration).toBeGreaterThan(0);
    // 1 回だけ（繰り返さない）
    expect(base).not.toMatch(/animation-iteration-count:\s*(infinite|[2-9])/);
  });

  it.each(KINDS)('Given %s の帯 / Then 動きは終わりの姿が見える（動きを減らす設定は長さと遅延を 0 にするので、終わりの姿の文言が残る）', (kind) => {
    const rule = foundBody(rulesOf(css, `.results-effect[data-effect='${kind}']`), kind);
    const name = /animation-name:\s*([a-z-]+);/.exec(rule)?.[1];
    expect(name, `${kind} の動きの名前`).toBeTruthy();
    const frames = keyframes(name!);
    // 最後の枠は見える（opacity 0・見えない clip-path・表示なしにしない）
    const last = frames.slice(frames.lastIndexOf('100%'));
    expect(last).not.toMatch(/opacity:\s*0\b/);
    expect(last).not.toMatch(/visibility:\s*hidden|display:\s*none/);
    expect(last).not.toMatch(/clip-path:\s*inset\(0 100%/);
    // 色は既存のトークンだけ（新しい色を足さない）
    expect(rule).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    // 帯の規則は長さを持たず、要素層の reduced-motion の一括の手当て（長さ・遅延を 0）に任せる
    expect(rule).not.toMatch(/prefers-reduced-motion/);
  });

  it('Given 動きの枠 / Then 配置を動かす性質（width・height・margin・top・left）を使わない（札・統計・記録を押さない）', () => {
    for (const name of ['effect-cutin', 'effect-scatter', 'effect-settle']) {
      expect(keyframes(name), name).not.toMatch(/\b(width|height|margin|top|left|right|bottom|padding)\s*:/);
    }
  });
});
