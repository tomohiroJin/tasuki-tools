/**
 * お題の説明・共有メモの描画（#371 で poker・topic・timer の `Markdown.tsx` を 1 つにした）。
 *
 * **解析は `@tasuki/markdown` が持つ**（React を知らない。`docs/adr/0021` 決定 7 と追記）。
 * ここは解析結果の木を React 要素へ組むだけで、文字列 HTML を作らない（innerHTML 不使用）ので、
 * 本質的に XSS 安全。リンク先は解析が `safeHref` で許したもの（http(s) / mailto）だけで、
 * 許されないものは `href: null` で届き、文字だけを出す。
 *
 * 見た目は部品層（`packages/ui` の `markdown.css`。`.ui-md-*`）が持つ。
 * **クラス名は字面で書く**（部品の使用を検査が `.tsx` の字面で数えるため）。
 */
import React from 'react';
import { parseMarkdown, type MdBlock, type MdInline, type MdListItem } from '@tasuki/markdown';

/** 見出しの段の起点。`#` を何段目の見出しにするか（3 なら h3〜h5、4 なら h4〜h6）。 */
export type MarkdownHeadingBase = 3 | 4;

function Inline({ nodes, keyBase }: { nodes: readonly MdInline[]; keyBase: string }) {
  return (
    <>
      {nodes.map((n, i) => {
        const key = `${keyBase}-${i}`;
        switch (n.kind) {
          case 'text':
            return <React.Fragment key={key}>{n.text}</React.Fragment>;
          case 'code':
            return <code key={key} className="ui-md-code">{n.text}</code>;
          case 'strong':
            return <strong key={key}><Inline nodes={n.children} keyBase={key} /></strong>;
          case 'em':
            return <em key={key}><Inline nodes={n.children} keyBase={key} /></em>;
          case 'link':
            return n.href === null ? (
              <React.Fragment key={key}>{n.text}</React.Fragment>
            ) : (
              <a key={key} href={n.href} target="_blank" rel="noopener noreferrer nofollow" className="ui-md-link">
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

/**
 * 箇条書き・番号付きの項目。タスクの項目（#315）は `label` で包んだチェックボックスにし、
 * 項目の文をそのまま名前にする（正本 D4。文を押しても当たる）。**押せない**（`disabled`）—— 付け外しは #315 PR 2。
 */
function ListItem({ item, keyBase }: { item: MdListItem; keyBase: string }) {
  if (item.task === null) return <li><Inline nodes={item.inline} keyBase={keyBase} /></li>;
  return (
    <li className="ui-md-task">
      <label className="ui-md-task-label">
        <input type="checkbox" className="ui-md-check" checked={item.task.checked} disabled />
        <span className="ui-md-task-text"><Inline nodes={item.inline} keyBase={keyBase} /></span>
      </label>
    </li>
  );
}

// 見出しの段: level 1〜3 に headingBase - 1 を足す（3 なら h3〜h5、4 なら h4〜h6）
const tagFor = (level: 1 | 2 | 3, base: MarkdownHeadingBase) => `h${level + base - 1}` as 'h3' | 'h4' | 'h5' | 'h6';

function Block({ block, keyBase, headingBase }: { block: MdBlock; keyBase: string; headingBase: MarkdownHeadingBase }) {
  switch (block.kind) {
    case 'heading': {
      const Tag = tagFor(block.level, headingBase);
      return <Tag className="ui-md-h"><Inline nodes={block.inline} keyBase={keyBase} /></Tag>;
    }
    case 'code':
      // 横にスクロールするコードへキーボードでも届くように、フォーカスを受けさせる。
      return <pre className="ui-md-pre" tabIndex={0}>{block.text}</pre>;
    case 'quote':
      return <blockquote className="ui-md-quote"><Lines lines={block.lines} keyBase={keyBase} /></blockquote>;
    case 'ul':
    case 'ol': {
      const List = block.kind;
      return (
        <List className={block.kind === 'ul' ? 'ui-md-ul' : 'ui-md-ol'}>
          {block.items.map((item, j) => (
            <ListItem key={`${keyBase}-${j}`} item={item} keyBase={`${keyBase}-${j}`} />
          ))}
        </List>
      );
    }
    case 'p':
      return <p className="ui-md-p"><Lines lines={block.lines} keyBase={keyBase} /></p>;
  }
}

export interface MarkdownProps {
  readonly source: string;
  /**
   * 見出しの段の起点。**置く場所の見出しの下に来るように選ぶ**
   * （お題の札はタイトルが h3 なので 4、timer の共有メモは 3）。
   */
  readonly headingBase: MarkdownHeadingBase;
  /** 根（`.ui-md`）に足すクラス。 */
  readonly className?: string;
}

/** Markdown サブセットを描画する。空文字なら根だけを描く。 */
export function Markdown({ source, headingBase, className }: MarkdownProps) {
  return (
    <div className={className === undefined ? 'ui-md' : `ui-md ${className}`}>
      {parseMarkdown(source).map((b, i) => (
        <Block key={`b${i}`} block={b} keyBase={`b${i}`} headingBase={headingBase} />
      ))}
    </div>
  );
}
