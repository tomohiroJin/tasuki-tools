/**
 * ブロックの解析(#91 PR 3)。規則は timer-web・topic-web の `parseBlocks` と同じ。
 *
 * 対応: 見出し(# / ## / ###)、箇条書き(- / *)、番号付き(1.)、引用(>)、
 * コードの囲み(```)、段落(空行区切り。行内の改行は行として残す)。
 */
import { parseInline, type MdInline } from './inline';

export type MdBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; inline: MdInline[] }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; lines: MdInline[][] }
  | { kind: 'ul'; items: MdInline[][] }
  | { kind: 'ol'; items: MdInline[][] }
  | { kind: 'p'; lines: MdInline[][] };

type RawBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'quote' | 'ul' | 'ol' | 'p'; lines: string[] };

export function parseMarkdown(src: string): MdBlock[] {
  return parseRawBlocks(src).map(toBlock);
}

function toBlock(b: RawBlock): MdBlock {
  switch (b.kind) {
    case 'heading':
      return { kind: 'heading', level: b.level, inline: parseInline(b.text) };
    case 'code':
      return b;
    case 'ul':
    case 'ol':
      return { kind: b.kind, items: b.lines.map(parseInline) };
    case 'quote':
    case 'p':
      return { kind: b.kind, lines: b.lines.map(parseInline) };
  }
}

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const QUOTE_RE = /^>\s?/;
const UL_RE = /^\s*[-*]\s+/;
const OL_RE = /^\s*\d+\.\s+/;
const isFence = (line: string) => line.trimStart().startsWith('```');

/** 同じ規則に当たる行が続く間を 1 つのブロックへ集める。 */
function collect(lines: string[], start: number, re: RegExp): { taken: string[]; next: number } {
  const taken: string[] = [];
  let i = start;
  while (i < lines.length && re.test(lines[i] ?? '')) {
    taken.push((lines[i] ?? '').replace(re, ''));
    i++;
  }
  return { taken, next: i };
}

/** 段落を止める行か(空行・別のブロックの始まり)。 */
function endsParagraph(line: string): boolean {
  return (
    line.trim() === '' || HEADING_RE.test(line) || UL_RE.test(line) || OL_RE.test(line) || QUOTE_RE.test(line) || isFence(line)
  );
}

// 規則は timer-web・topic-web の `parseBlocks` と同じ(見出しの判定だけ、段落の停止と同じ
// `HEADING_RE` を使うよう揃えた —— 元は `/^(#{1,3})\s+(.*)$/` と `/^(#{1,3})\s+/` の 2 つで、
// U+2028 を残すと食い違って止まらなくなった)。
function parseRawBlocks(src: string): RawBlock[] {
  // U+2028 / U+2029(行区切り・段落区切り)も改行として扱う。正規表現の `.` はこれらに
  // 一致しないので、残すと見出しの判定と段落の停止条件が食い違う(下の前進の保証を参照)。
  const lines = src.replace(/\r\n?|[\u2028\u2029]/g, '\n').split('\n');
  const blocks: RawBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (isFence(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !isFence(lines[i] ?? '')) {
        body.push(lines[i] ?? '');
        i++;
      }
      i++; // 閉じの囲みを飛ばす
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    const h = HEADING_RE.exec(line);
    if (h) {
      blocks.push({ kind: 'heading', level: h[1]!.length as 1 | 2 | 3, text: h[2]! });
      i++;
      continue;
    }
    const listLike: Array<[RegExp, 'quote' | 'ul' | 'ol']> = [[QUOTE_RE, 'quote'], [UL_RE, 'ul'], [OL_RE, 'ol']];
    const hit = listLike.find(([re]) => re.test(line));
    if (hit) {
      const { taken, next } = collect(lines, i, hit[0]);
      blocks.push({ kind: hit[1], lines: taken });
      i = next;
      continue;
    }
    if (line.trim() === '') {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && !endsParagraph(lines[i] ?? '')) {
      para.push(lines[i] ?? '');
      i++;
    }
    // 前進の保証: どの規則にも当たらずに止まった(段落が空の)ときは、その 1 行を段落として
    // 取り込んで進める。規則の片方だけが変わっても、空の段落を積み続けて止まらなくならない。
    if (para.length === 0) {
      para.push(lines[i] ?? '');
      i++;
    }
    blocks.push({ kind: 'p', lines: para });
  }
  return blocks;
}
