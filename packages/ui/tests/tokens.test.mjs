/**
 * トークン層の契約を固定する。
 *
 * CSS には型も参照解決も無いので、壊れても実行するまで分からない。ここで見るのは
 * 「他のパッケージが依存している約束」だけに絞る。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

/** トークン層の全 CSS を連結したもの（定義の在処は問わず、層として持つかを見る）。 */
function tokensLayer() {
  return readdirSync(resolve(ROOT, 'src/tokens'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => read(`src/tokens/${f}`))
    .join('\n');
}

test('トークン層が、他のパッケージから参照される変数を定義している', () => {
  // Given（timer-web / poker-web / landing が var() で引いているもの）
  const required = [
    '--felt-950', '--felt-900', '--felt-800', '--felt-700',
    '--line', '--line-strong',
    '--ivory', '--ivory-dim', '--ivory-faint',
    '--coal', '--coal-soft',
    '--gold', '--gold-bright', '--gold-deep',
    '--rose', '--rose-bright', '--jade', '--pewter',
    // 派生（α をコンポーネントに直書きさせないための語彙）
    '--gold-lift', '--gold-tint', '--gold-veil', '--gold-edge', '--on-gold',
    '--jade-lift', '--jade-tint', '--jade-veil', '--jade-edge', '--on-jade',
    '--rose-lift', '--rose-tint', '--rose-veil', '--rose-edge', '--on-rose',
    '--rose-pale', '--rose-glow',
    '--felt-lift', '--felt-scrim', '--felt-shade', '--ivory-inset',
    '--font-display', '--font-body', '--font-mono',
    '--card-radius', '--shadow-card', '--shadow-popover',
  ];
  // When
  const css = tokensLayer();
  // Then
  for (const name of required) {
    assert.ok(new RegExp(`^\\s*${name}\\s*:`, 'm').test(css), `${name} の定義が無い`);
  }
});

test('トークン層に --ink を定義しない（timer の --ink と意味が正反対で衝突する）', () => {
  // Given / When
  const css = tokensLayer();
  // Then（`--ink-` で始まる別名は許すが、`--ink` そのものは禁止）
  assert.ok(!/^\s*--ink\s*:/m.test(css), '--ink が復活している。ADR-0001 を参照');
});

test('トークン層が素の要素セレクタを持たない（timer の Tailwind と衝突するため）', () => {
  // Given / When
  const css = tokensLayer()
    .replace(/\/\*[\s\S]*?\*\//g, '') // コメントを落とす
    .replace(/@font-face\s*\{[^}]*\}/g, '') // @font-face は要素を選ばない
    .replace(/@import[^;]*;/g, '');
  // Then（残るセレクタは :root だけであること）
  const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
  for (const s of selectors) {
    assert.equal(s, ':root', `トークン層に :root 以外のセレクタがある: ${s}`);
  }
});

test('@font-face が指す書体ファイルが実在する', () => {
  // Given
  const css = read('src/tokens/fonts.css');
  // When
  const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
  // Then
  assert.ok(urls.length > 0, '@font-face の url() が 1 つも無い');
  for (const u of urls) {
    const p = resolve(ROOT, 'src/tokens', u);
    assert.ok(existsSync(p), `書体ファイルが無い: ${u}`);
  }
});

test('書体のライセンス（OFL）を同梱している', () => {
  // Given / When / Then
  for (const f of ['LICENSE-Fraunces-OFL.txt', 'LICENSE-ZenKakuGothicNew-OFL.txt']) {
    const p = resolve(ROOT, 'src/fonts', f);
    assert.ok(existsSync(p), `${f} が無い`);
    assert.match(read(`src/fonts/${f}`), /SIL OPEN FONT LICENSE/i);
  }
});

test('要素層は tokens 層を経由せず読み込める（利用側の import 順を縛らない）', () => {
  // Given / When
  const barrel = read('src/index.css');
  // Then
  assert.match(barrel, /@import '\.\/tokens\/index\.css';/);
  assert.match(barrel, /@import '\.\/elements\/index\.css';/);
});
