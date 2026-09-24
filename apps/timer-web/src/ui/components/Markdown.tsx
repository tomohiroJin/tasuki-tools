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
                className="rounded bg-[var(--panel)] border border-[var(--hairline)] px-1 py-0.5 text-[0.85em] font-mono text-[var(--bone)]"
              >
                {n.text}
              </code>
            );
          case "strong":
            return (
              <strong key={key} className="font-bold text-[var(--bone)]">
                <Inline nodes={n.children} keyBase={key} />
              </strong>
            );
          case "em":
            return (
              <em key={key} className="italic">
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
                className="text-[var(--signal)] underline decoration-[var(--signal)]/50 underline-offset-2 hover:decoration-[var(--signal)] break-all"
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

const HEADING_CLASS: Record<number, string> = {
  1: "text-base font-bold text-[var(--bone)] mt-3 mb-1 first:mt-0",
  2: "text-sm font-bold text-[var(--bone)] mt-3 mb-1 first:mt-0",
  3: "text-sm font-semibold text-[var(--bone-muted)] mt-2 mb-1 first:mt-0",
};

// 見出しの段: level 1〜3 に headingBase - 1 を足す（3 なら h3〜h5、4 なら h4〜h6）
const tagFor = (level: 1 | 2 | 3, base: 3 | 4) => `h${level + base - 1}` as "h3" | "h4" | "h5" | "h6";

function Block({ block, keyBase, headingBase }: { block: MdBlock; keyBase: string; headingBase: 3 | 4 }) {
  switch (block.kind) {
    case "heading": {
      const Tag = tagFor(block.level, headingBase);
      return (
        <Tag className={HEADING_CLASS[block.level]}>
          <Inline nodes={block.inline} keyBase={keyBase} />
        </Tag>
      );
    }
    case "code":
      return (
        <pre
          className="rounded-md bg-[var(--panel)] border border-[var(--hairline)] p-3 text-xs font-mono text-[var(--bone)] overflow-x-auto whitespace-pre-wrap"
        >
          {block.text}
        </pre>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-[var(--signal)] pl-3 text-[var(--bone-subtle)]">
          <Lines lines={block.lines} keyBase={keyBase} />
        </blockquote>
      );
    case "ul":
      return (
        <ul className="list-disc pl-5 space-y-0.5">
          {block.items.map((item, j) => (
            <li key={`${keyBase}-${j}`}><Inline nodes={item} keyBase={`${keyBase}-${j}`} /></li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="list-decimal pl-5 space-y-0.5">
          {block.items.map((item, j) => (
            <li key={`${keyBase}-${j}`}><Inline nodes={item} keyBase={`${keyBase}-${j}`} /></li>
          ))}
        </ol>
      );
    case "p":
      return (
        <p className="text-[var(--bone-muted)]">
          <Lines lines={block.lines} keyBase={keyBase} />
        </p>
      );
  }
}

interface MarkdownProps {
  source: string;
  className?: string;
  /**
   * `#` を何段の見出しにするか（#91 PR 3）。既定 3（`#`→h3・`##`→h4・`###`→h5）は共有メモの段。
   * お題の札（`TopicCard`）は h2「お題」・h3 タイトルの下に置くので 4 を渡す。
   */
  headingBase?: 3 | 4;
}

/** Markdown サブセットを描画する。空文字なら何も描かない。 */
export function Markdown({ source, className = "", headingBase = 3 }: MarkdownProps) {
  return (
    <div className={`text-sm leading-relaxed text-[var(--bone-muted)] space-y-2 ${className}`}>
      {parseMarkdown(source).map((b, i) => (
        <Block key={`b${i}`} block={b} keyBase={`b${i}`} headingBase={headingBase} />
      ))}
    </div>
  );
}
