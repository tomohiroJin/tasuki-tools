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

/**
 * @requirements #315 spec FR-001〜003・FR-006（D4）
 */
describe('Markdown のタスクリスト', () => {
  const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

  it('Given タスクとそうでない項目 / When 描く / Then タスクだけ label で包んだチェックボックスになる', () => {
    const { container } = render(<Markdown source={'- [ ] a\n- b\n1. [x] c'} headingBase={4} />);
    expect(shape(container.firstElementChild)).toEqual([
      'div.ui-md',
      '  ul.ui-md-ul',
      '    li.ui-md-task',
      '      label.ui-md-task-label',
      '        input.ui-md-check',
      '        span.ui-md-task-text "a"',
      '    li "b"',
      '  ol.ui-md-ol',
      '    li.ui-md-task',
      '      label.ui-md-task-label',
      '        input.ui-md-check',
      '        span.ui-md-task-text "c"',
    ]);
  });

  it('Given [ ] と [x] / When 描く / Then 項目の文を名前にし、状態が合う', () => {
    render(<Markdown source={'- [ ] first\n- [x] second'} headingBase={4} />);
    expect(checkbox('first').type).toBe('checkbox');
    expect(checkbox('first').checked).toBe(false);
    expect(checkbox('second').checked).toBe(true);
  });

  it('Given タスクの項目 / When 描く / Then 押せない（FR-006）', () => {
    render(<Markdown source="- [x] a" headingBase={4} />);
    expect(checkbox('a').disabled).toBe(true);
  });

  it('Given 文にリンクを含むタスク / When 描く / Then リンクは safeHref を通ったものだけ', () => {
    render(<Markdown source={'- [ ] see [doc](https://example.com) and [x](javascript:x)'} headingBase={4} />);
    expect(checkbox('see doc and x').checked).toBe(false);
    expect(screen.getByRole('link', { name: 'doc' }).getAttribute('href')).toBe('https://example.com');
    expect(screen.queryByRole('link', { name: 'x' })).toBeNull();
  });
});
