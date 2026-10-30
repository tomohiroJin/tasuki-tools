/**
 * 読み込み中の一言（#472）。部品層の規則は `.ui-note.loading-note` の組のセレクタ（`.ui-` 始まりを保つため）。
 * 組で書くと、`ui-note` を持たない要素には効かない。読み込み中の一言を描く 5 か所（web-kit の `LoadingView` と
 * poker の `App.tsx`）が、どちらも `loading-note` と `ui-note` の両方のクラスを持つことを固定する。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

test('Given 部品層の CSS / When 読み込み中の規則を探す / Then セレクタは .ui-note.loading-note の組', () => {
  const css = read('packages/ui/src/components/loading-note.css');
  assert.match(css, /^\.ui-note\.loading-note \{/m);
  assert.doesNotMatch(css, /^\.loading-note \{/m);
});

for (const file of ['packages/web-kit/src/room/loading-view.tsx', 'apps/poker-web/src/App.tsx']) {
  test(`Given ${file} / When 読み込み中の一言を探す / Then loading-note と ui-note の両方を持つ`, () => {
    const hits = [...read(file).matchAll(/className="([^"]*\bloading-note\b[^"]*)"/g)];
    assert.equal(hits.length, 1);
    assert.deepEqual(hits[0][1].split(/\s+/).sort(), ['loading-note', 'ui-note']);
  });
}

test('Given 4 アプリ / When LoadingView を見る / Then 自前の loading-note を持たず web-kit を読む', () => {
  for (const a of ['agenda', 'checkin', 'roulette', 'topic']) {
    assert.match(read(`apps/${a}-web/src/App.tsx`), /LoadingView.*from '@tasuki\/web-kit\/room'/);
    assert.doesNotMatch(read(`apps/${a}-web/src/index.css`), /\.loading-note/);
  }
});
