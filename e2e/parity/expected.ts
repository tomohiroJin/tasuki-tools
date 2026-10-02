/**
 * 基準側の要約の期待値（#321・最終レビュー B-I4）。
 *
 * 比較は基準とブランチの**差**しか見ないので、両側で同じように空なら緑になる（操作の書き出しが 0 件・キーフレームを
 * 1 つも拾えない・状態に入れずに skipped が増える、など）。基準は `ba9249d` に固定なので、基準側の要約（状態ごと・幅ごとの
 * 要素数、動きの件数、キーフレームの名前、操作の種類ごとの件数と書き出し件数、skipped の名前）は変わらないはず。
 * それを `expected/base-summary.json` に固定し、毎回基準側の要約と突き合わせる（違えば赤）。
 *
 * **数の正本はこの JSON**（台帳の件数表はここを指す）。作り直すのは README の「期待値を作り直す」の手順だけ。
 *
 * このファイルは相対の import を持たない（`node --experimental-strip-types parity/expected.ts` で直に走らせて、
 * `out/<状態>/base-expectation.json` を束ねて書き出すため）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 期待値の置き場（コミットする）。 */
export const EXPECTED_FILE = path.join(HERE, 'expected', 'base-summary.json');

/** 比較の出力置き場（無視している）。各テストが `out/<キー>/base-expectation.json` に基準側の要約を書く。 */
const OUT = path.join(HERE, 'out');

/** 1 テストの出力のファイル名（基準側の要約のうち、期待値として固定する部分）。 */
export const BASE_EXPECTATION_FILE = 'base-expectation.json';

/** 期待値の JSON（キーはテストの出力の置き場の名前: 状態名か `<状態名>-touch`）。 */
export type ExpectedTable = Readonly<Record<string, unknown>>;

/** 期待値の JSON を読む。無ければ null（各テストが赤にする）。 */
export function loadExpected(file = EXPECTED_FILE): ExpectedTable | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as ExpectedTable;
}

/** 期待値の JSON のキーと、テストのキーの食い違い（どちらかにしか無いもの）。 */
export function expectedKeyProblems(expected: ExpectedTable, keys: readonly string[]): string[] {
  const want = new Set(keys);
  const have = new Set(Object.keys(expected));
  return [
    ...[...want].filter((k) => !have.has(k)).map((k) => `期待値に ${k} が無い`),
    ...[...have].filter((k) => !want.has(k)).map((k) => `期待値に目録に無い ${k} がある`),
  ];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 期待値と実際の値の食い違いを、場所つきで返す（オブジェクトはキーの和で・配列は位置ごとに比べる）。 */
export function diffExpectation(expected: unknown, actual: unknown, at = '$'): string[] {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const n = Math.max(expected.length, actual.length);
    const out: string[] = [];
    if (expected.length !== actual.length) out.push(`${at}: 件数 期待 ${expected.length}・実際 ${actual.length}`);
    for (let i = 0; i < n; i += 1) out.push(...diffExpectation(expected[i], actual[i], `${at}[${i}]`));
    return out;
  }
  if (isRecord(expected) && isRecord(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    return keys.flatMap((k) => diffExpectation(expected[k], actual[k], `${at}.${k}`));
  }
  return Object.is(expected, actual) ? [] : [`${at}: 期待 ${JSON.stringify(expected)}・実際 ${JSON.stringify(actual)}`];
}

/** 1 テストの基準側の要約を期待値と突き合わせる。期待値が無ければ、それ自体を 1 件の食い違いにする。 */
export function checkExpectation(table: ExpectedTable | null, key: string, actual: unknown): string[] {
  if (table === null) return [`期待値の JSON（${EXPECTED_FILE}）が無い。README の「期待値を作り直す」で作る`];
  if (!(key in table)) return [`期待値に ${key} が無い`];
  return diffExpectation(table[key], actual, key);
}

/**
 * `out/<キー>/base-expectation.json` を束ねて期待値の JSON を書く（README の「期待値を作り直す」からだけ呼ぶ）。
 * `--repeat-each` の 2 回目以降の置き場（`-r<n>`）は読まない。書いたキーの数を返す。
 */
export function writeExpectedFromOut(outDir = OUT, file = EXPECTED_FILE): number {
  const table: Record<string, unknown> = {};
  for (const name of readdirSync(outDir).sort()) {
    const src = path.join(outDir, name, BASE_EXPECTATION_FILE);
    if (/-r\d+$/.test(name) || !existsSync(src)) continue;
    table[name] = JSON.parse(readFileSync(src, 'utf8'));
  }
  if (Object.keys(table).length === 0) throw new Error(`${outDir} に ${BASE_EXPECTATION_FILE} が 1 つも無い（先に通常の比較を全件流す）`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(table, null, 2)}\n`);
  return Object.keys(table).length;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const count = writeExpectedFromOut();
  console.log(`${EXPECTED_FILE} に ${count} 件を書いた（目録との食い違いは次の比較の読み込みで止まる）`);
}
