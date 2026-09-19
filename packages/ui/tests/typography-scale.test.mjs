/**
 * 書体の大きさが 5 段のトークンに従っていることを検査する（#280）。
 *
 * ## なぜ必要か
 * `tokens/typography.css` は 5 段の流動スケールを持つが、**それに合否の判定が無かった**ため、
 * `elements/` 層が直値で書いても何も赤くならなかった。同じことが #270 で
 * `apps/landing` に起きており、実寸 8 種類のリズムの無い自前スケールになっていた。
 *
 * ## 許可リストを持たない
 * 段の名前は `typography.css` の定義から導出し、対象は `src/` 配下の CSS 全件である。
 * 要素が増えても射程が自動で広がるので、**列挙に化けない**（設計正本 §5）。
 * #270 はこれを E2E の許可リストでやろうとして 9 件ぶん膨らみ、入れられなかった。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'src');

/** `src/` 配下の CSS を再帰で拾う（`src` からの相対パスで返す）。 */
function cssFiles() {
  return readdirSync(SRC, { recursive: true })
    .map(String)
    .filter((p) => p.endsWith('.css'))
    .sort();
}

/**
 * `typography.css` が定義している段の名前。
 *
 * **ここで列挙しない。** 定義そのものを正本にすることで、段を増やしたときに
 * 検査側の書き換えを忘れて射程が古いまま残る、という事故を防ぐ。
 */
function definedSteps() {
  const css = readFileSync(resolve(SRC, 'tokens/typography.css'), 'utf8');
  return [...css.matchAll(/^\s*(--font-size-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]);
}

/**
 * `font-size` の宣言を拾う。
 *
 * **プロパティ名の直前が `-` のものは拾わない。** `--font-size-xs: clamp(...)` は
 * カスタムプロパティの**定義**であって `font-size` の宣言ではない。直前の 1 文字を
 * `[;{}\s]` か行頭に限ることで区別する。
 *
 * **1 行に複数あっても全部拾う**（`matchAll`）。1 つ目だけを見ると、
 * 2 つ目を並べるだけで検査をすり抜けられる。
 */
function declarations() {
  const found = [];
  for (const rel of cssFiles()) {
    const lines = readFileSync(join(SRC, rel), 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/(?:^|[;{}\s])font-size\s*:\s*([^;]*)(;?)/g)) {
        found.push({
          file: rel,
          line: i + 1,
          value: m[1].trim(),
          terminated: m[2] === ';',
          text: line,
        });
      }
    });
  }
  return found;
}

/** 失敗メッセージ用の位置表記。 */
const where = (d) => `${d.file}:${d.line}  font-size: ${d.value}`;

test('走査が空振りしていない（ファイルも宣言も実際に拾えている）', () => {
  // Given / When
  const files = cssFiles();
  const decls = declarations();
  // Then（0 件で緑になると、以降のすべての検査が無言で死ぬ）
  assert.ok(files.length > 0, 'src 配下に CSS が 1 つも無い');
  assert.ok(decls.length > 0, 'font-size の宣言を 1 つも拾えていない');
});

test('流動スケールの段は 5 つである', () => {
  // Given / When
  const steps = definedSteps();
  // Then（**ここだけは意図的に件数と名前を固定する**。段が黙って増減したら気づきたい）
  assert.deepEqual(
    [...steps].sort(),
    ['--font-size-base', '--font-size-lg', '--font-size-sm', '--font-size-xl', '--font-size-xs'],
    '段の構成が変わっている。増減させるなら設計正本と README を先に直すこと',
  );
});

test('font-size の宣言は 1 行に収まっている', () => {
  // Given / When（`;` で閉じていない = 値が次の行へ続いている）
  const spanning = declarations().filter((d) => !d.terminated);
  // Then（複数行にまたがると、例外の印を同じ行に置く規約が成立しない）
  assert.deepEqual(spanning.map(where), [], '宣言を 1 行に収めること（設計正本 D6）');
});

/**
 * 例外の印。**理由まで求める**（`\S` で空でないことを見る）。
 *
 * 印だけで通せると「scale-exempt:」と書くだけの空手形になり、塞ごうとしている
 * 「直値が混ざっても何も赤くならない」をそのまま作り直すことになる。
 */
const EXEMPT = /scale-exempt:\s*\S/;

/** 5 段のいずれかを参照している形（フォールバック付きは許さない。段の不在を隠すため）。 */
const TOKEN_REF = /^var\(\s*--font-size-[a-z]+\s*\)$/;

test('font-size は 5 段のトークンを参照するか、同じ行に理由のある例外である', () => {
  // Given / When
  const offenders = declarations()
    .filter((d) => !TOKEN_REF.test(d.value))
    .filter((d) => !EXEMPT.test(d.text));
  // Then
  assert.deepEqual(
    offenders.map(where),
    [],
    '5 段へ寄せるか、同じ行に `/* scale-exempt: 理由 */` を書くこと（設計正本 D6）',
  );
});

test('参照している段が typography.css に実在する', () => {
  // Given
  const steps = new Set(definedSteps());
  // When（打ち間違いは CSS では黙って無効になり、継承値で描かれる）
  const unknown = declarations()
    .map((d) => ({ d, m: /^var\(\s*(--font-size-[a-z-]+)\s*\)$/.exec(d.value) }))
    .filter(({ m }) => m !== null && !steps.has(m[1]))
    .map(({ d, m }) => `${d.file}:${d.line}  ${m[1]}`);
  // Then
  assert.deepEqual(unknown, [], '存在しない段を参照している');
});
