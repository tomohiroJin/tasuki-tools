/**
 * 開票の演出の帯（#639）の CSS の契約。動きの長さ・操作を奪わないこと・動きを減らす設定で文言が消えないこと。
 * 見た目の配置（320・1280px で重ならない）は実画面（`docs/guides/procedures/live-check.md`）と E2E が見る。
 *
 * @requirements #639
 */
import { describe, expect, it } from 'vitest';
import { foundBody, readFromCwd as read, rulesOf } from '@tasuki/test-css/css-rules';
import { mediaBlock } from '@tasuki/test-css';
import { effectAnnounceDelay } from '../src/components/Results';

const css = read('src/index.css');
const KINDS = ['unanimous', 'scattered', 'complete'] as const;

/** `@keyframes name { ... }` の中身（コメントを除き、ちょうど 1 つあることを確かめる） */
const keyframes = (name: string): string => mediaBlock(css, `@keyframes ${name}`);

const seconds = (value: string): number => (value.endsWith('ms') ? parseFloat(value) / 1000 : parseFloat(value));

describe('開票の演出の帯の CSS（#639）', () => {
  const base = foundBody(rulesOf(css, '.results-effect'), '.results-effect');

  it('Given 帯の規則 / Then ポインタを受けず、位置を取らない（流れの中・操作を奪わない・重ならない）', () => {
    expect(base).toMatch(/pointer-events:\s*none;/);
    expect(base).not.toMatch(/position:\s*(fixed|absolute|sticky)/);
    expect(base).not.toMatch(/z-index/);
  });

  it('Given 帯の動き / Then 動きそのものの長さは 2 秒以内で 1 回だけ（遅れは札のめくりの待ちで、演出の長さに数えない）', () => {
    const duration = seconds(/animation-duration:\s*([0-9.]+m?s);/.exec(base)?.[1] ?? 'NaN');
    expect(duration).toBeLessThanOrEqual(2);
    expect(duration).toBeGreaterThan(0);
    // 1 回だけ（繰り返さない）
    expect(base).not.toMatch(/animation-iteration-count:\s*(infinite|[2-9])/);
  });

  it('Given 札が順にめくれる公開 / Then 帯の遅れは統計と同じ待ち（最後の札がめくれた後。結果のネタばらしをしない）', () => {
    const band = foundBody(rulesOf(css, '.results--after-flip .results-effect'), 'めくれる公開の帯');
    const stats = foundBody(rulesOf(css, '.results--after-flip .stats'), 'めくれる公開の統計');
    const delayOf = (body: string) => /animation-delay:\s*(calc\([^;]*\));/.exec(body)?.[1];
    expect(delayOf(band), '帯の遅れ').toBeTruthy();
    expect(delayOf(band)).toBe(delayOf(stats));
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

  it('Given 動きの枠 / Then レイアウトを変える性質を使わない（折り返し・高さの変化で下の統計を跳ねさせない。transform・opacity・clip-path・filter だけ）', () => {
    const layout =
      /\b(width|height|min-width|max-width|min-height|max-height|margin|margin-[a-z-]+|padding|padding-[a-z-]+|top|left|right|bottom|inset|letter-spacing|word-spacing|font-size|font-weight|line-height|gap|border-width|flex|display)\s*:/;
    for (const name of ['effect-cutin', 'effect-scatter', 'effect-settle']) {
      expect(keyframes(name), name).not.toMatch(layout);
    }
  });

  it.each(['.results--after-flip .stats', '.results--after-flip .results-spread', '.results--after-flip .results-effect'])(
    'Given %s の遅れ / Then JS の読み上げの待ち（effectAnnounceDelay）と同じ式（CSS だけ変えても緑にならない）',
    (selector) => {
      const body = foundBody(rulesOf(css, selector), selector);
      const m = /animation-delay:\s*calc\(min\(var\(--seat-count, 1\) - 1, (\d+)\) \* (\d+)ms \+ ([0-9.]+)s\);/.exec(body);
      expect(m, `${selector} の遅れの式が読めない`).not.toBeNull();
      const [cap, perSeat, base] = [Number(m![1]), Number(m![2]), Number(m![3])];
      for (const seats of [1, 2, 3, 8, 9, 20]) {
        expect(Math.min(seats - 1, cap) * perSeat + base * 1000, `席 ${seats}`).toBeCloseTo(effectAnnounceDelay(seats, true), 5);
      }
    },
  );

  it('Given バラバラの動き / Then 帯を大きくしない・外へ動かさない（320px で右端が画面の外へ出ない。scale は 1 以下・translate・rotate・skew を使わない）', () => {
    const frames = keyframes('effect-scatter');
    expect(frames).not.toMatch(/translate|rotate|skew/);
    for (const m of frames.matchAll(/scale\(([0-9.]+)\)/g)) expect(Number(m[1])).toBeLessThanOrEqual(1);
  });
});
