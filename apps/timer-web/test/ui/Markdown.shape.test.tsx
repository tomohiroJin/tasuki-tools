/**
 * お題の説明と共有メモの描画の形（#371 の特性テスト）。poker・topic と同じ原稿で、いまの DOM の形を固定する。
 * 見出しの段は、お題（札のタイトル h3 の下）が 4 から、共有メモが 3 から。
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { Markdown as SharedMarkdown, type MarkdownHeadingBase } from "@tasuki/web-kit/reader";

/** timer での使い方（見出しの段の既定は共有メモの 3）。 */
const Markdown = ({ headingBase = 3, ...rest }: { source: string; headingBase?: MarkdownHeadingBase }) => (
  <SharedMarkdown headingBase={headingBase} {...rest} />
);
import { domShape, SHAPE_SOURCE } from "../support/dom-shape.js";

describe("Markdown の描画の形", () => {
  it("Given 見出しの段 4（お題） / When 描く / Then 今の DOM の形のまま", () => {
    const { container } = render(<Markdown source={SHAPE_SOURCE} headingBase={4} />);
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

  it("Given 見出しの段の既定（共有メモ） / When 描く / Then h3 から始まる", () => {
    const { container } = render(<Markdown source={SHAPE_SOURCE} />);
    expect(domShape(container.firstElementChild!)).toMatchInlineSnapshot(`
      [
        "div.ui-md",
        "  h3.ui-md-h "見出し1"",
        "  h4.ui-md-h "見出し2"",
        "  h5.ui-md-h "見出し3"",
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
});
