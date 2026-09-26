import { describe, expect, it } from 'vitest';
import { parseInline } from '../src/inline';

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
    // Given
    const src = '**`a` b**';
    // When
    const nodes = parseInline(src);
    // Then
    expect(nodes).toEqual([
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
    // Given
    const src = 'https://example.com。';
    // When
    const nodes = parseInline(src);
    // Then
    expect(nodes).toEqual([
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
    // 行き先に `)` を書くとリンクの形がそこで閉じるので、同じ意味の百分率符号化で書く
    ['javascript:alert%281%29', null],
    ['data:text/html,x', null],
    ['//a.example', null],
  ])('Given %s / When 判定する / Then %s', (url, expected) => {
    // Given: 行き先（url）と、期待する判定（expected）。判定は公開しないので、リンクの形で通す
    const src = `[行き先](${url})`;
    // When
    const nodes = parseInline(src);
    // Then: リンク 1 つとして解析され、行き先だけが判定される
    expect(nodes).toEqual([{ kind: 'link', href: expected, text: '行き先' }]);
  });
});
