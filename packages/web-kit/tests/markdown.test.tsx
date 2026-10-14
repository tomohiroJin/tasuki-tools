/**
 * お題の説明・共有メモの描画（#371。poker・topic・timer の `Markdown.tsx` を 1 つにした）。
 *
 * 期待する DOM の形は、寄せる前に 3 つのアプリで固定した形と同じ（各アプリの特性テスト）。
 * 文字列 HTML を作らない（解析は `@tasuki/markdown`。リンク先は `safeHref` を通ったものだけ）。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Markdown } from '../src/reader/markdown.js';
import { domShape, SHAPE_SOURCE } from './support/dom-shape.js';

const shape = (el: Element | null) => domShape(el!);

afterEach(cleanup);

describe('Markdown', () => {
  it('Given 見出しの段 4 / When 各記法を描く / Then 3 つのアプリで固定した形のまま', () => {
    const { container } = render(<Markdown source={SHAPE_SOURCE} headingBase={4} />);
    expect(shape(container.firstElementChild)).toEqual([
      'div.ui-md',
      '  h4.ui-md-h "見出し1"',
      '  h5.ui-md-h "見出し2"',
      '  h6.ui-md-h "見出し3"',
      '  p.ui-md-p "段落 "" "" "" "" と ""危険""2 行目"',
      '    strong "太字"',
      '    em "斜体"',
      '    code.ui-md-code "code"',
      '    a.ui-md-link[href=https://example.com][target=_blank][rel=noopener noreferrer nofollow] "リンク"',
      '    br',
      '  blockquote.ui-md-quote "引用"',
      '  ul.ui-md-ul',
      '    li "一つ"',
      '    li "二つ"',
      '  ol.ui-md-ol',
      '    li "番号"',
      '  pre.ui-md-pre[tabindex=0] "const a = 1;"',
    ]);
  });

  it('Given 見出しの段 3（共有メモ） / When 描く / Then h3 から始まる', () => {
    const { container } = render(<Markdown source={'# a\n## b\n### c'} headingBase={3} />);
    expect(shape(container.firstElementChild)).toEqual(['div.ui-md', '  h3.ui-md-h "a"', '  h4.ui-md-h "b"', '  h5.ui-md-h "c"']);
  });

  it('Given 根のクラスを渡す / When 描く / Then ui-md に足す', () => {
    const { container } = render(<Markdown source="a" headingBase={4} className="topic-body" />);
    expect(container.firstElementChild?.className).toBe('ui-md topic-body');
  });

  it('Given 根のクラスを渡さない / When 描く / Then ui-md だけ', () => {
    const { container } = render(<Markdown source="" headingBase={4} />);
    expect(container.firstElementChild?.className).toBe('ui-md');
  });

  it('Given javascript: のリンク / When 描く / Then <a> にせず文字だけ出す（XSS 防止）', () => {
    render(<Markdown source="[クリック](javascript:steal)" headingBase={4} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('クリック')).toBeTruthy();
  });
});
