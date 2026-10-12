/**
 * 動きを抑える設定で、演出の遅延も止まることを検査する（#348）。
 *
 * `elements/reset.css` の一括の手当ては、長さを 0.01ms にするだけでは足りない。
 * `animation-fill-mode: both` の演出は遅延の間 0% の姿（`opacity: 0` など）で待つので、
 * 遅延が残ると「動きを抑える」設定でも要素が消えたまま待つ。遅延も 0 にする。
 *
 * ブロックの切り出しを誤って空を読むと検査が恒真になるので、対照として既存の
 * `animation-duration` が同じブロックで見つかることも見る。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(ROOT, 'src/elements/reset.css'), 'utf8');

/** `@media (prefers-reduced-motion: reduce) { ... }` の中身（波括弧の対応で切り出す）。 */
function reducedMotionBlock() {
  const head = css.indexOf('@media (prefers-reduced-motion: reduce)');
  assert.notEqual(head, -1, 'reduced-motion の @media が無い');
  const open = css.indexOf('{', head);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error('reduced-motion の @media が閉じていない');
}

test('動きを抑える設定のブロックは長さを 0.01ms にする（対照）', () => {
  const block = reducedMotionBlock();
  assert.match(block, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(block, /transition-duration:\s*0\.01ms\s*!important/);
});

test('動きを抑える設定のブロックは演出の遅延も 0 にする', () => {
  const block = reducedMotionBlock();
  assert.match(block, /animation-delay:\s*0s\s*!important/);
  assert.match(block, /transition-delay:\s*0s\s*!important/);
});
