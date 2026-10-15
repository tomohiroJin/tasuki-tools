import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../src/index.js';

const text = (t: string) => [{ kind: 'text', text: t }];
const item = (t: string) => ({ inline: text(t), task: null });

/**
 * @requirements #91 spec §5.4（お題の本文を Markdown として描く・PR 2 §10.1）
 */
describe('ブロックを解析する', () => {
  it('Given 見出し 3 段 / When 解析する / Then 段の数が level になる', () => {
    // Given
    const src = '# 一\n## 二\n### 三';
    // When
    const blocks = parseMarkdown(src);
    // Then
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, inline: text('一') },
      { kind: 'heading', level: 2, inline: text('二') },
      { kind: 'heading', level: 3, inline: text('三') },
    ]);
  });

  it('Given 箇条書き・番号付き・引用 / When 解析する / Then 行ごとに項目になる', () => {
    // Given
    const src = '- a\n- b\n\n1. c\n2. d\n\n> e\n> f';
    // When
    const blocks = parseMarkdown(src);
    // Then
    expect(blocks).toEqual([
      { kind: 'ul', items: [item('a'), item('b')] },
      { kind: 'ol', items: [item('c'), item('d')] },
      { kind: 'quote', lines: [text('e'), text('f')] },
    ]);
  });

  it('Given コードの囲み / When 解析する / Then 中身は行内解析されない', () => {
    expect(parseMarkdown('```\n**a**\n```')).toEqual([{ kind: 'code', text: '**a**' }]);
  });

  it('Given 空行で区切った段落 / When 解析する / Then 段落が 2 つになり行内の改行は行として残る', () => {
    // Given
    const src = 'a\nb\n\nc';
    // When
    const blocks = parseMarkdown(src);
    // Then
    expect(blocks).toEqual([
      { kind: 'p', lines: [text('a'), text('b')] },
      { kind: 'p', lines: [text('c')] },
    ]);
  });

  it('Given CRLF の改行 / When 解析する / Then LF と同じ結果になる', () => {
    expect(parseMarkdown('a\r\nb')).toEqual(parseMarkdown('a\nb'));
  });

  it('Given 空文字 / When 解析する / Then ブロックは無い', () => {
    expect(parseMarkdown('')).toEqual([]);
  });
});

/**
 * 行区切りの文字（U+2028 / U+2029）で解析が止まらなくなった不具合（PR 2 の最終レビュー C1）の再発防止。
 * 在室者が 1 回貼るとルームの全員のタブが固まる。
 */
describe('行区切りの文字を含む本文', () => {
  it.each([' ', ' ', '# 見出し 続き', 'a  b'])(
    'Given %j / When 解析する / Then 終わって段落か見出しが返る',
    (src) => {
      // Given: 行区切りの文字を含む本文（src）
      // When
      const blocks = parseMarkdown(src);
      // Then: 終わること自体が主張。中身は改行と同じに扱われる
      expect(blocks.length).toBeGreaterThanOrEqual(0);
      expect(parseMarkdown(src.replace(/[\u2028\u2029]/g, '\n'))).toEqual(blocks);
    },
  );
});

const task = (t: string, checked: boolean) => ({ inline: text(t), task: { checked } });

/**
 * @requirements #315 spec FR-001・FR-002・FR-004・FR-005（D2・D3）
 */
describe('タスクリストを解析する', () => {
  it('Given - [ ] の項目 / When 解析する / Then チェックの外れたタスクで、文から [ ] が外れる', () => {
    expect(parseMarkdown('- [ ] a')).toEqual([{ kind: 'ul', items: [task('a', false)] }]);
  });

  it.each(['- [x] a', '- [X] a'])('Given %j / When 解析する / Then チェック済みのタスクになる', (src) => {
    expect(parseMarkdown(src)).toEqual([{ kind: 'ul', items: [task('a', true)] }]);
  });

  it('Given * の箇条書きと番号付き / When 解析する / Then どちらもタスクになる', () => {
    expect(parseMarkdown('* [ ] a\n\n1. [x] b')).toEqual([
      { kind: 'ul', items: [task('a', false)] },
      { kind: 'ol', items: [task('b', true)] },
    ]);
  });

  it('Given タスクとそうでない項目が混ざった列 / When 解析する / Then 項目ごとに task が付く・付かない', () => {
    expect(parseMarkdown('- [ ] a\n- b\n- [x] c')).toEqual([
      { kind: 'ul', items: [task('a', false), item('b'), task('c', true)] },
    ]);
  });

  it.each(['- [ ]', '- [ ]  ', '- [y] a', '- [] a', '- [ ]a'])(
    'Given %j / When 解析する / Then タスクにせず、文のまま残す',
    (src) => {
      // Given: 文が無い・印が違う・印の後に空白が無い（src）
      // When
      const blocks = parseMarkdown(src);
      // Then
      expect(blocks).toEqual([{ kind: 'ul', items: [item(src.replace(/^- /, ''))] }]);
    },
  );

  it('Given コードの囲みの中の - [ ] / When 解析する / Then コードのまま', () => {
    expect(parseMarkdown('```\n- [ ] a\n```')).toEqual([{ kind: 'code', text: '- [ ] a' }]);
  });

  it('Given 文に行内要素を含むタスク / When 解析する / Then 文は行内解析される', () => {
    expect(parseMarkdown('- [ ] **a** [b](https://example.com)')).toEqual([
      {
        kind: 'ul',
        items: [
          {
            inline: [
              { kind: 'strong', children: text('a') },
              { kind: 'text', text: ' ' },
              { kind: 'link', href: 'https://example.com', text: 'b' },
            ],
            task: { checked: false },
          },
        ],
      },
    ]);
  });
});
