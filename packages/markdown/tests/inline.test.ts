import { describe, expect, it } from 'vitest';
import { parseInline, safeHref } from '../src/index';

/**
 * @requirements #91 spec §5.4（お題の本文を Markdown として描く・PR 2 §10.1）
 */
describe('行内要素を解析する', () => {
  it('Given 記法の無い文 / When 解析する / Then 文字が 1 つだけ返る', () => {
    expect(parseInline('ただの文')).toEqual([{ kind: 'text', text: 'ただの文' }]);
  });

  it('Given コード・太字・斜体 / When 解析する / Then それぞれの種類になる', () => {
    // Given
    const src = '`x` と **強く** と *弱く*';
    // When
    const nodes = parseInline(src);
    // Then
    expect(nodes).toEqual([
      { kind: 'code', text: 'x' },
      { kind: 'text', text: ' と ' },
      { kind: 'strong', children: [{ kind: 'text', text: '強く' }] },
      { kind: 'text', text: ' と ' },
      { kind: 'em', children: [{ kind: 'text', text: '弱く' }] },
    ]);
  });

  it('Given 太字の中のコード / When 解析する / Then 太字の子として解析される', () => {
    expect(parseInline('**`a` b**')).toEqual([
      { kind: 'strong', children: [{ kind: 'code', text: 'a' }, { kind: 'text', text: ' b' }] },
    ]);
  });

  it('Given 安全なリンクと危険なリンク / When 解析する / Then 危険なものは href が null になる', () => {
    // Given
    const src = '[見る](https://example.com) [罠](javascript:alert(1))';
    // When
    const nodes = parseInline(src);
    // Then
    expect(nodes[0]).toEqual({ kind: 'link', href: 'https://example.com', text: '見る' });
    expect(nodes.find((n) => n.kind === 'link' && n.text === '罠')).toEqual({
      kind: 'link',
      href: null,
      text: '罠',
    });
  });

  it('Given 文末の句点が付いた生 URL / When 解析する / Then 句点は URL に含まれない', () => {
    expect(parseInline('https://example.com。')).toEqual([
      { kind: 'link', href: 'https://example.com', text: 'https://example.com' },
      { kind: 'text', text: '。' },
    ]);
  });
});

describe('リンクの行き先の安全判定', () => {
  it.each([
    ['https://a.example', 'https://a.example'],
    ['http://a.example', 'http://a.example'],
    ['mailto:x@example.com', 'mailto:x@example.com'],
    ['javascript:alert(1)', null],
    ['data:text/html,x', null],
    ['//a.example', null],
  ])('Given %s / When 判定する / Then %s', (url, expected) => {
    expect(safeHref(url)).toBe(expected);
  });
});
