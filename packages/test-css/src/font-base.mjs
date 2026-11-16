/**
 * 書体の常用の層（base）の範囲に、文字が収まるかを判定する（`packages/ui/README.md`・#594）。
 *
 * base 層に無い字を 1 つ画面に出すと、その字が出た瞬間に拡張の層（約 210KB）を取りに行き、
 * `font-display: swap` で代替字形が一瞬見える。
 *
 * 12 か所（7 アプリ・4 パッケージ・web-kit）にあった写しを 1 つにした。`fonts.css` はこのファイルからの相対で
 * 1 か所を指す（呼び出し側の深さに依らない）。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FONTS_CSS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../ui/src/tokens/fonts.css');

/** `fonts.css` の `@font-face` のうち、ファイル名が `zkgn-` で始まり `-base` を含む面の範囲（太さごと）。 */
export function baseFaces() {
  const css = readFileSync(FONTS_CSS, 'utf8');
  const faces = new Map();
  for (const [, block] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const file = /url\('[^']*\/([^'/]+)'\)/.exec(block ?? '')?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(block ?? '')?.[1];
    if (file === undefined || range === undefined) continue;
    if (!file.startsWith('zkgn-') || !file.includes('-base')) continue;
    faces.set(
      file,
      range.split(',').map((part) => {
        const [from, to] = part.trim().replace(/^U\+/i, '').split('-');
        const start = Number.parseInt(from ?? '', 16);
        return [start, to === undefined ? start : Number.parseInt(to, 16)];
      }),
    );
  }
  return faces;
}

/** 文言ごとに、どれかの太さの base 層から外れる字を「面名「文言」: 字」の形で返す（外れなければ空）。 */
export function outsideBase(texts) {
  const failures = [];
  const faces = baseFaces();
  for (const text of texts) {
    for (const [file, ranges] of faces) {
      const outside = [...new Set(text)].filter((ch) => {
        const cp = ch.codePointAt(0) ?? 0;
        return cp > 0x7e && !ranges.some(([from, to]) => cp >= from && cp <= to);
      });
      if (outside.length > 0) failures.push(`${file}「${text}」: ${outside.join('')}`);
    }
  }
  return failures;
}
