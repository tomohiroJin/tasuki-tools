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

/**
 * クラスの対応表（`audit-timer-classes` が読めるよう名前は `_CLASS` で終わる const の字面）。
 * 強調・斜体はクラスを持たない（poker の部品の描画と同じく、ブラウザ既定の太字・斜体で足りる）。
 * 暗い面（共有メモ）の枠とリンクの色は、置く側が部品のつまみ（`--ui-md-edge`・`--ui-md-link`）で宣言する。
 */
const MARKDOWN_CLASS = {
  root: "ui-md",
  code: "ui-md-code",
  link: "ui-md-link",
  h1: "ui-md-h",
  h2: "ui-md-h",
  h3: "ui-md-h",
  pre: "ui-md-pre",
  quote: "ui-md-quote",
  ul: "ui-md-ul",
  ol: "ui-md-ol",
  p: "ui-md-p",
} as const;

function Inline({ nodes, keyBase }: { nodes: readonly MdInline[]; keyBase: string }) {
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
                className={MARKDOWN_CLASS.code}
              >
                {n.text}
              </code>
            );
          case "strong":
            return (
              <strong key={key}>
                <Inline nodes={n.children} keyBase={key} />
              </strong>
            );
          case "em":
            return (
              <em key={key}>
                <Inline nodes={n.children} keyBase={key} />
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
                className={MARKDOWN_CLASS.link}
              >
                {n.text}
              </a>
            );
        }
      })}
    </>
  );
}

function Lines({ lines, keyBase }: { lines: readonly MdInline[][]; keyBase: string }) {
  return (
    <>
      {lines.map((line, i) => (
        <React.Fragment key={`${keyBase}-l${i}`}>
          {i > 0 && <br />}
          <Inline nodes={line} keyBase={`${keyBase}-l${i}`} />
        </React.Fragment>
      ))}
    </>
  );
}

// 見出しの段: level 1〜3 に headingBase - 1 を足す（3 なら h3〜h5、4 なら h4〜h6）
const tagFor = (level: 1 | 2 | 3, base: 3 | 4) => `h${level + base - 1}` as "h3" | "h4" | "h5" | "h6";

function Block({ block, keyBase, headingBase }: { block: MdBlock; keyBase: string; headingBase: 3 | 4 }) {
  switch (block.kind) {
    case "heading": {
      const Tag = tagFor(block.level, headingBase);
      return (
        <Tag className={MARKDOWN_CLASS[`h${block.level}`]}>
          <Inline nodes={block.inline} keyBase={keyBase} />
        </Tag>
      );
    }
    case "code":
      return (
        // コードは横へスクロールするので、キーボードで届くよう Tab に載せる（poker の部品と同じ）
        <pre className={MARKDOWN_CLASS.pre} tabIndex={0}>
          {block.text}
        </pre>
      );
    case "quote":
      return (
        <blockquote className={MARKDOWN_CLASS.quote}>
          <Lines lines={block.lines} keyBase={keyBase} />
        </blockquote>
      );
    case "ul":
      return (
        <ul className={MARKDOWN_CLASS.ul}>
          {block.items.map((item, j) => (
            <li key={`${keyBase}-${j}`}><Inline nodes={item} keyBase={`${keyBase}-${j}`} /></li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className={MARKDOWN_CLASS.ol}>
          {block.items.map((item, j) => (
            <li key={`${keyBase}-${j}`}><Inline nodes={item} keyBase={`${keyBase}-${j}`} /></li>
          ))}
        </ol>
      );
    case "p":
      return (
        <p className={MARKDOWN_CLASS.p}>
          <Lines lines={block.lines} keyBase={keyBase} />
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
}

/** Markdown サブセットを描画する。空文字なら何も描かない。 */
export function Markdown({ source, headingBase = 3 }: MarkdownProps) {
  return (
    <div className={MARKDOWN_CLASS.root}>
      {parseMarkdown(source).map((b, i) => (
        <Block key={`b${i}`} block={b} keyBase={`b${i}`} headingBase={headingBase} />
      ))}
    </div>
  );
}
