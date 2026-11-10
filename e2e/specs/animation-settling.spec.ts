/** レイアウトを測る補助が、演出の実時間や finished の通知に依存しない（#574）。 */
import { test, expect } from '../fixtures/test';
import { settleFiniteAnimations } from '../support/a11y';

test('有限の演出は終端を測り、無限・一時停止の演出は進めない', async ({ page }) => {
  // Given
  await page.setContent('<button style="width:100px;height:44px">測る</button>');
  await page.evaluate(() => {
    const button = document.querySelector('button')!;
    const finite = button.animate([{ transform: 'scale(.5)' }, { transform: 'scale(1)' }], { duration: 600_000, fill: 'both' });
    const infinite = button.animate([{ opacity: 1 }, { opacity: .8 }], { duration: 1000, iterations: Infinity });
    const paused = button.animate([{ color: 'black' }, { color: 'red' }], { duration: 600_000 });
    paused.pause();
    Object.assign(window, { testAnimations: { finite, infinite, paused } });
  });
  // When
  await settleFiniteAnimations(page);
  // Then
  const result = await page.evaluate(() => {
    const animations = (window as unknown as { testAnimations: Record<string, Animation> }).testAnimations;
    return {
      states: Object.fromEntries(Object.entries(animations).map(([key, a]) => [key, a.playState])),
      width: document.querySelector('button')!.getBoundingClientRect().width,
    };
  });
  expect(result.states).toEqual({ finite: 'finished', infinite: 'running', paused: 'paused' });
  expect(result.width).toBe(100);
});
