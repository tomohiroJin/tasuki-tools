/**
 * カットイン（`.ui-cutin`・#670）の CSS の契約を固定する。
 *
 * 画面全体に重なる層なので、**操作を奪わない**（`pointer-events: none`）・**横の scroll を出さない**
 * （`overflow: hidden`）・**動きを減らす設定では描かない**・**字が 1 行に収まる**（`nowrap`）が崩れると、
 * 見た目の不具合でなく、押せない・動かせない不具合になる。値の中身（色・秒数）は見ない。
 *
 * ブロックの切り出しを誤って空を読むと検査が恒真になるので、対照として宣言が見つかることも見る。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(ROOT, 'src/components/cut-in.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** セレクタが完全に一致する規則（`@media` の外）の宣言ブロックを全部連結して返す。 */
function declarationsOf(selector) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const selectors = m[1].split(',').map((s) => s.trim());
    if (selectors.includes(selector)) out.push(m[2]);
  }
  assert.ok(out.length > 0, `${selector} の規則が無い`);
  return out.join('\n');
}

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

test('.ui-cutin は画面全体に固定され、操作を奪わず、はみ出しを隠す', () => {
  const d = declarationsOf('.ui-cutin');
  assert.match(d, /position:\s*fixed/);
  assert.match(d, /inset:\s*0/);
  assert.match(d, /pointer-events:\s*none/);
  assert.match(d, /overflow:\s*hidden/);
});

test('.ui-cutin は既存のダイアログ・帯より上に重なる', () => {
  const d = declarationsOf('.ui-cutin');
  const z = /z-index:\s*(\d+)/.exec(d);
  assert.ok(z, 'z-index が無い');
  // 接続の告知の帯・agenda の映す表示（20）より上
  assert.ok(Number(z[1]) > 20, `z-index が低い: ${z[1]}`);
});

test('子の層も操作を奪わない（pointer-events は継承されるが、明示して守る）', () => {
  const d = declarationsOf('.ui-cutin-stage');
  assert.match(d, /pointer-events:\s*none/);
});

/** 宣言の並びのうち、最後に書かれたその性質の値（後勝ち。共有の規則の後に個別の規則が来る） */
function lastValue(declarations, property) {
  const values = [...declarations.matchAll(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`, 'g'))].map((m) => m[1].trim());
  return values.at(-1);
}

test('添え書きは画面の幅の中に置き、長ければ折り返す（#670 のレビュー。320px で 23 字の要約の両端が切れた）', () => {
  const d = declarationsOf('.ui-cutin-sub');
  assert.equal(lastValue(d, 'white-space'), 'normal');
  // 舞台は画面の 120% 幅。左右を舞台の 10% 以上詰めないと、画面の外へ出る
  const inset = lastValue(d, 'inset-inline');
  assert.match(inset ?? '', /^\d+(\.\d+)?%$/, `inset-inline が割合でない: ${inset}`);
  assert.ok(Number.parseFloat(inset) >= 10, `inset-inline が 10% 未満: ${inset}`);
});

test('題は 1 行に収める（nowrap）', () => {
  const d = declarationsOf('.ui-cutin-title');
  assert.match(d, /white-space:\s*nowrap/);
});

test('動かすのは transform・opacity・clip-path・filter だけ（レイアウトを揺らさない）', () => {
  const props = [...css.matchAll(/animation-name:\s*([^;]+);/g)].length;
  assert.ok(props > 0, 'animation-name が無い');
  const keyframes = [...css.matchAll(/@keyframes\s+[\w-]+\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)];
  assert.ok(keyframes.length > 0, '@keyframes が無い');
  for (const k of keyframes) {
    for (const decl of k[1].matchAll(/\{([^{}]*)\}/g)) {
      for (const line of decl[1].split(';')) {
        const name = line.split(':')[0].trim();
        if (name === '') continue;
        assert.ok(
          ['transform', 'opacity', 'clip-path', 'filter', 'animation-timing-function'].includes(name),
          `@keyframes が ${name} を動かしている`,
        );
      }
    }
  }
});

test('時間の数を CSS に写さず、--cutin-duration から引く', () => {
  assert.match(css, /animation-duration:\s*var\(--cutin-duration\)/);
  assert.doesNotMatch(css, /animation-duration:\s*\d/);
});

test('動きを減らす設定では層を表示しない', () => {
  const block = reducedMotionBlock();
  assert.match(block, /\.ui-cutin\s*\{[^}]*display:\s*none/);
});
