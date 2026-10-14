/**
 * お題の説明の描画（#371 の特性テスト）。
 *
 * 描画の部品を 3 つのアプリで 1 つにする前に、**いまの DOM の形を固定する**
 * （タグ・クラス・リンクの属性・コードのフォーカス・見出しの段）。poker は札のタイトル（h3）の下に
 * 置くので、見出しは h4 から始まる。
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Markdown as SharedMarkdown } from '@tasuki/web-kit/reader';
const Markdown = (props: { source: string; className?: string }) => <SharedMarkdown headingBase={4} {...props} />;
import { domShape, SHAPE_SOURCE } from './support/dom-shape';

describe('Markdown の描画の形', () => {
  it('Given 各記法を含む原稿 / When 描く / Then 今の DOM の形のまま', () => {
    const { container } = render(<Markdown source={SHAPE_SOURCE} />);
    expect(domShape(container.firstElementChild!)).toMatchInlineSnapshot(`
      [
        "div.ui-md",
        "  h4.ui-md-h "見出し1"",
        "  h5.ui-md-h "見出し2"",
        "  h6.ui-md-h "見出し3"",
        "  p.ui-md-p "段落 "" "" "" "" と ""危険""2 行目"",
        "    strong "太字"",
        "    em "斜体"",
        "    code.ui-md-code "code"",
        "    a.ui-md-link[href=https://example.com][target=_blank][rel=noopener noreferrer nofollow] "リンク"",
        "    br",
        "  blockquote.ui-md-quote "引用"",
        "  ul.ui-md-ul",
        "    li "一つ"",
        "    li "二つ"",
        "  ol.ui-md-ol",
        "    li "番号"",
        "  pre.ui-md-pre[tabindex=0] "const a = 1;"",
      ]
    `);
  });

  it('Given 空の原稿 / When 描く / Then 根だけを描く', () => {
    const { container } = render(<Markdown source="" />);
    expect(domShape(container.firstElementChild!)).toMatchInlineSnapshot(`
      [
        "div.ui-md",
      ]
    `);
  });
});
