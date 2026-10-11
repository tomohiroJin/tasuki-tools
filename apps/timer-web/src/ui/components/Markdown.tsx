/**
 * 安全な Markdown サブセット → React 要素レンダラ
 *
 * 文字列 HTML を一切生成せず（innerHTML 不使用）、React 要素を直接組み立てるため
 * 本質的に XSS 安全。共有メモのプレビューとお題の説明で共用する。
 *
 * **解析は `@tasuki/markdown` が持つ**（#91 PR 3 で 3 つのアプリへ共有した）。
 * ここは解析結果の木を React 要素へ組むだけで、文字列 HTML を作らない。
 *
 * 対応記法:
 *  - ブロック: 見出し(# / ## / ###)、箇条書き(- / *)、番号付き(1.)、引用(>)、
 *              コードブロック(``` フェンス)、段落（空行区切り・行内改行は <br/>）
 *  - インライン: **太字**、*斜体*、`コード`、[表示](URL)、生 URL の autolink
 * リンクは http(s) / mailto のみ許可し、target=_blank rel=noopener を付与する。
 */

import React from "react";
import { parseMarkdown, type MdBlock, type MdInline } from "@tasuki/markdown";

/** 描く面。`panel` は暗い地の共有メモ（`markdown-*`）、`card` は象牙の札（部品の `.ui-md-*`）。 */
type Surface = "panel" | "card";

/**
 * 面ごとのクラスの対応表（`audit-timer-classes` が読めるよう名前は `_CLASS` で終わる const の字面）。
 * `card` の強調・斜体はクラスを持たない（空文字。poker の部品の描画と同じく、ブラウザ既定の太字・斜体で足りる）。
 * #316 PR 4 で `markdown-*` を `.ui-md-*` へ寄せたら、`panel` の列と `surface` ごと消える。
 */
const MARKDOWN_CLASS = {
  "panel-root": "markdown",
  "panel-code": "markdown-code",
  "panel-strong": "markdown-strong",
  "panel-em": "markdown-em",
  "panel-link": "markdown-link",
  "panel-h1": "markdown-heading markdown-heading-1",
  "panel-h2": "markdown-heading markdown-heading-2",
  "panel-h3": "markdown-heading markdown-heading-3",
  "panel-pre": "markdown-pre",
  "panel-quote": "markdown-quote",
  "panel-ul": "markdown-ul",
  "panel-ol": "markdown-ol",
  "panel-p": "markdown-paragraph",
  "card-root": "ui-md",
  "card-code": "ui-md-code",
  "card-strong": "",
  "card-em": "",
  "card-link": "ui-md-link",
  "card-h1": "ui-md-h",
  "card-h2": "ui-md-h",
  "card-h3": "ui-md-h",
  "card-pre": "ui-md-pre",
  "card-quote": "ui-md-quote",
  "card-ul": "ui-md-ul",
  "card-ol": "ui-md-ol",
  "card-p": "ui-md-p",
} as const;

function Inline({ nodes, keyBase, surface }: { nodes: readonly MdInline[]; keyBase: string; surface: Surface }) {
  return (
    <>
      {nodes.map((n, i) => {
        const key = `${keyBase}-${i}`;
        switch (n.kind) {
          case "text":
            return <React.Fragment key={key}>{n.text}</React.Fragment>;
          case "code":
            return (
              <code
                key={key}
                className={MARKDOWN_CLASS[`${surface}-code`]}
              >
                {n.text}
              </code>
            );
          case "strong":
            return (
              <strong key={key} className={MARKDOWN_CLASS[`${surface}-strong`]}>
                <Inline nodes={n.children} keyBase={key} surface={surface} />
              </strong>
            );
          case "em":
            return (
              <em key={key} className={MARKDOWN_CLASS[`${surface}-em`]}>
                <Inline nodes={n.children} keyBase={key} surface={surface} />
              </em>
            );
          case "link":
            return n.href === null ? (
              <React.Fragment key={key}>{n.text}</React.Fragment>
            ) : (
              <a
                key={key}
                href={n.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={MARKDOWN_CLASS[`${surface}-link`]}
              >
                {n.text}
              </a>
            );
        }
      })}
    </>
  );
}

function Lines({ lines, keyBase, surface }: { lines: readonly MdInline[][]; keyBase: string; surface: Surface }) {
  return (
    <>
      {lines.map((line, i) => (
        <React.Fragment key={`${keyBase}-l${i}`}>
          {i > 0 && <br />}
          <Inline nodes={line} keyBase={`${keyBase}-l${i}`} surface={surface} />
        </React.Fragment>
      ))}
    </>
  );
}

// 見出しの段: level 1〜3 に headingBase - 1 を足す（3 なら h3〜h5、4 なら h4〜h6）
const tagFor = (level: 1 | 2 | 3, base: 3 | 4) => `h${level + base - 1}` as "h3" | "h4" | "h5" | "h6";

function Block({ block, keyBase, headingBase, surface }: { block: MdBlock; keyBase: string; headingBase: 3 | 4; surface: Surface }) {
  switch (block.kind) {
    case "heading": {
      const Tag = tagFor(block.level, headingBase);
      return (
        <Tag className={MARKDOWN_CLASS[`${surface}-h${block.level}`]}>
          <Inline nodes={block.inline} keyBase={keyBase} surface={surface} />
        </Tag>
      );
    }
    case "code":
      return (
        <pre className={MARKDOWN_CLASS[`${surface}-pre`]}>
          {block.text}
        </pre>
      );
    case "quote":
      return (
        <blockquote className={MARKDOWN_CLASS[`${surface}-quote`]}>
          <Lines lines={block.lines} keyBase={keyBase} surface={surface} />
        </blockquote>
      );
    case "ul":
      return (
        <ul className={MARKDOWN_CLASS[`${surface}-ul`]}>
          {block.items.map((item, j) => (
            <li key={`${keyBase}-${j}`}><Inline nodes={item} keyBase={`${keyBase}-${j}`} surface={surface} /></li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className={MARKDOWN_CLASS[`${surface}-ol`]}>
          {block.items.map((item, j) => (
            <li key={`${keyBase}-${j}`}><Inline nodes={item} keyBase={`${keyBase}-${j}`} surface={surface} /></li>
          ))}
        </ol>
      );
    case "p":
      return (
        <p className={MARKDOWN_CLASS[`${surface}-p`]}>
          <Lines lines={block.lines} keyBase={keyBase} surface={surface} />
        </p>
      );
  }
}

interface MarkdownProps {
  source: string;
  /**
   * `#` を何段の見出しにするか（#91 PR 3）。既定 3（`#`→h3・`##`→h4・`###`→h5）は共有メモの段。
   * お題の札（`TopicCard`）は h2「お題」・h3 タイトルの下に置くので 4 を渡す。
   */
  headingBase?: 3 | 4;
  /**
   * 描く面（#316 PR 3）。既定 `"panel"` は暗い地の共有メモ。`"card"` は象牙の札（お題）で、部品の `.ui-md-*` で描く。
   * 札の上では `markdown-*` の明るい字（`--bone`）が読めないため、面ごとに表を分ける。
   */
  surface?: Surface;
}

/** Markdown サブセットを描画する。空文字なら何も描かない。 */
export function Markdown({ source, headingBase = 3, surface = "panel" }: MarkdownProps) {
  return (
    <div className={MARKDOWN_CLASS[`${surface}-root`]}>
      {parseMarkdown(source).map((b, i) => (
        <Block key={`b${i}`} block={b} keyBase={`b${i}`} headingBase={headingBase} surface={surface} />
      ))}
    </div>
  );
}
