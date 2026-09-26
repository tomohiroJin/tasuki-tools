/**
 * お題の説明の描画（#91）。**解析は `@tasuki/markdown` が持つ**（PR 3 で 3 つのアプリへ共有した）。
 * ここは解析結果の木を React 要素へ組むだけで、文字列 HTML を作らない。
 *
 * topic-web では札のタイトル（h3）の下に置くので段を 1 つ下げる（`#`→h4・`##`→h5・`###`→h6）。
 */
import React from 'react';
import { parseMarkdown, type MdBlock, type MdInline } from '@tasuki/markdown';

function Inline({ nodes, keyBase }: { nodes: readonly MdInline[]; keyBase: string }) {
  return (
    <>
      {nodes.map((n, i) => {
        const key = `${keyBase}-${i}`;
        switch (n.kind) {
          case 'text':
            return <React.Fragment key={key}>{n.text}</React.Fragment>;
          case 'code':
            return <code key={key} className="md-code">{n.text}</code>;
          case 'strong':
            return <strong key={key}><Inline nodes={n.children} keyBase={key} /></strong>;
          case 'em':
            return <em key={key}><Inline nodes={n.children} keyBase={key} /></em>;
          case 'link':
            return n.href === null ? (
              <React.Fragment key={key}>{n.text}</React.Fragment>
            ) : (
              <a key={key} href={n.href} target="_blank" rel="noopener noreferrer nofollow" className="md-link">
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

const HEADING_TAG = { 1: 'h4', 2: 'h5', 3: 'h6' } as const;

function Block({ block, keyBase }: { block: MdBlock; keyBase: string }) {
  switch (block.kind) {
    case 'heading': {
      const Tag = HEADING_TAG[block.level];
      return <Tag className="md-h"><Inline nodes={block.inline} keyBase={keyBase} /></Tag>;
    }
    case 'code':
      // 横にスクロールするコードへキーボードでも届くように、フォーカスを受けさせる。
      return <pre className="md-pre" tabIndex={0}>{block.text}</pre>;
    case 'quote':
      return <blockquote className="md-quote"><Lines lines={block.lines} keyBase={keyBase} /></blockquote>;
    case 'ul':
    case 'ol': {
      const List = block.kind;
      return (
        <List className={`md-${block.kind}`}>
          {block.items.map((item, j) => (
            <li key={`${keyBase}-${j}`}><Inline nodes={item} keyBase={`${keyBase}-${j}`} /></li>
          ))}
        </List>
      );
    }
    case 'p':
      return <p className="md-p"><Lines lines={block.lines} keyBase={keyBase} /></p>;
  }
}

interface MarkdownProps {
  source: string;
  className?: string;
}

/** Markdown サブセットを描画する。空文字なら何も描かない。 */
export function Markdown({ source, className = '' }: MarkdownProps) {
  return (
    <div className={`md ${className}`}>
      {parseMarkdown(source).map((b, i) => <Block key={`b${i}`} block={b} keyBase={`b${i}`} />)}
    </div>
  );
}
