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

/** 書体スケール段の名前パターン（数字と `-` を含む。e.g. `--font-size-2xl`）。 */
const FONT_SIZE_NAME = '--font-size-[a-z0-9-]+';

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
  return [...css.matchAll(new RegExp(`^\\s*(${FONT_SIZE_NAME})\\s*:`, 'gm'))].map((m) => m[1]);
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
 * 例外コメントの理由を取り出す。**理由まで求める**（空文字列は例外として認めない）。
 *
 * `scale-exempt:` から、同じ行にあるコメント終端（アスタリスクに続くスラッシュ）の
 * **手前まで**を理由とし、前後の空白を落として返す。理由が空なら `null`（＝例外ではない）。
 *
 * 旧実装は `/scale-exempt:\s*\S/` という正規表現で「印の直後に非空白が 1 文字あるか」
 * だけを見ていた。ところが理由が空のコメントでも、終端記号のアスタリスク自体が
 * `\S` に当たってしまい、「理由あり」と誤判定していた
 * （#280 Task 4 の破壊検証で発覚）。この関数は理由の**中身**を取り出して空かどうかを
 * 直接見ることで、終端記号を理由と誤認しないようにする。
 *
 * **同じ行にコメント終端が無い場合（複数行コメント）は判定しない。** 理由がどこで終わるか
 * 決められない入力は、例外を通す側ではなく赤へ倒す（fail-closed）。
 */
function exemptReason(text) {
  const m = /scale-exempt:([^]*?)\*\//.exec(text);
  if (!m) return null;
  const reason = m[1].trim();
  return reason === '' ? null : reason;
}

/** 5 段のいずれかを参照している形（フォールバック付きは許さない。段の不在を隠すため）。 */
const TOKEN_REF = new RegExp(`^var\\(\\s*${FONT_SIZE_NAME}\\s*\\)$`);

test('font-size は 5 段のトークンを参照するか、同じ行に理由のある例外である', () => {
  // Given / When
  const offenders = declarations()
    .filter((d) => !TOKEN_REF.test(d.value))
    .filter((d) => exemptReason(d.text) === null);
  // Then
  assert.deepEqual(
    offenders.map(where),
    [],
    '5 段へ寄せるか、同じ行に `/* scale-exempt: 理由 */` を書くこと（設計正本 D6）',
  );
});

test('例外コメントは理由が空だと通らない（コメント終端の `*` を理由と誤認しない）', () => {
  // Given / When / Then（理由あり → 例外として通る）
  assert.notEqual(
    exemptReason("  font-size: 0.6rem; /* scale-exempt: 札のコーナーピップ */"),
    null,
    '理由が書かれている例外は通るべき',
  );
  // 理由が空（スペースのみ）→ 通らない。これが今回の欠陥そのもの
  assert.equal(
    exemptReason('  font-size: 0.6rem; /* scale-exempt: */'),
    null,
    '理由が空の例外は通らないべき',
  );
  // 印だけで終端が続く形（同じ実体。空白すら無い）も同じ理由で落ちる
  assert.equal(
    exemptReason('  font-size: 0.6rem; /* scale-exempt:*/'),
    null,
    '理由が空（空白も無い）の例外は通らないべき',
  );
  // `scale-exempt` を含まない普通の行 → 例外ではない
  assert.equal(
    exemptReason("  font-size: var(--font-size-sm);"),
    null,
    '例外の印が無い行は例外として扱わないべき',
  );
});

test('参照している段が typography.css に実在する', () => {
  // Given
  const steps = new Set(definedSteps());
  // When（打ち間違いは CSS では黙って無効になり、継承値で描かれる）
  const unknown = declarations()
    .map((d) => ({ d, m: new RegExp(`^var\\(\\s*(${FONT_SIZE_NAME})\\s*\\)$`).exec(d.value) }))
    .filter(({ m }) => m !== null && !steps.has(m[1]))
    .map(({ d, m }) => `${d.file}:${d.line}  ${m[1]}`);
  // Then
  assert.deepEqual(unknown, [], '存在しない段を参照している');
});
