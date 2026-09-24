/**
 * 安全な Markdown サブセット → React 要素レンダラ
 *
 * 文字列 HTML を一切生成せず（innerHTML 不使用）、React 要素を直接組み立てるため
 * 本質的に XSS 安全。お題の説明で使う。
 *
 * timer-web の `ui/components/Markdown.tsx` からの移植。解析は同じ。共有化は #91 PR 3 で
 * timer がお題を表示するときに決める。
 *
 * topic-web では札のタイトル（h3）の下に置くので段を 1 つ下げる（`#`→h4・`##`→h5・`###`→h6）。
 *
 * 対応記法:
 *  - ブロック: 見出し(# / ## / ###)、箇条書き(- / *)、番号付き(1.)、引用(>)、
 *              コードブロック(``` フェンス)、段落（空行区切り・行内改行は <br/>）
 *  - インライン: **太字**、*斜体*、`コード`、[表示](URL)、生 URL の autolink
 * リンクは http(s) / mailto のみ許可し、target=_blank rel=noopener を付与する。
 */

import React from 'react';

/** 許可するリンクスキームのみ通す（javascript: 等を無効化）。 */
function safeHref(url: string): string | null {
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : null;
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  const safe = safeHref(href);
  if (!safe) return <>{children}</>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer nofollow" className="md-link">
      {children}
    </a>
  );
}

// インライン記法の先頭一致を拾う正規表現（コード→太字→斜体→リンク→生URL の順で評価）。
// リンク部は lazy 量化子を避け文字クラスで閉じ括弧/空白/改行を除外して線形時間にする
// （`[` の羅列など病的入力での O(N^2) バックトラックを防ぐ）。
// 生 URL autolink は末尾の約物（. , ; : 。 、 ) ）等）を URL に含めない。
const INLINE_RE =
  /(`[^`]+`)|(\*\*[^*]+?\*\*)|(\*[^*]+?\*)|(\[[^\]\n]*\]\([^)\s\n]*\))|((?:https?:\/\/|mailto:)[^\s)]*[^\s).,;:。、）])/;

/** 1 行（インライン）をパースして React ノード配列にする。 */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let rest = text;
  let i = 0;
  while (rest.length > 0) {
    const m = INLINE_RE.exec(rest);
    if (!m || m.index === undefined) {
      nodes.push(rest);
      break;
    }
    if (m.index > 0) nodes.push(rest.slice(0, m.index));
    const token = m[0];
    const key = `${keyBase}-${i++}`;
    if (m[1]) {
      // `コード`
      nodes.push(
        <code key={key} className="md-code">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (m[2]) {
      // **太字**（内側もインライン解析）
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    } else if (m[3]) {
      // *斜体*
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    } else if (m[4]) {
      // [表示](URL)
      const sep = token.indexOf('](');
      const label = token.slice(1, sep);
      const url = token.slice(sep + 2, -1);
      nodes.push(
        <Link key={key} href={url}>
          {label}
        </Link>,
      );
    } else if (m[5]) {
      // 生 URL の autolink
      nodes.push(
        <Link key={key} href={token}>
          {token}
        </Link>,
      );
    }
    rest = rest.slice(m.index + token.length);
  }
  return nodes;
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'p'; lines: string[] };

/** 行配列をブロックに区切る。 */
function parseBlocks(src: string): Block[] {
  // U+2028 / U+2029（行区切り・段落区切り）も改行として扱う。正規表現の `.` はこれらに
  // 一致しないので、残すと見出しの判定と段落の停止条件が食い違う（下の前進の保証を参照）。
  const lines = src.replace(/\r\n?|[\u2028\u2029]/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    // コードフェンス
    if (line.trimStart().startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').trimStart().startsWith('```')) {
        body.push(lines[i] ?? '');
        i++;
      }
      i++; // 閉じフェンスを飛ばす
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    // 見出し
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ kind: 'heading', level: h[1]!.length, text: h[2]! });
      i++;
      continue;
    }
    // 引用
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? '')) {
        quote.push((lines[i] ?? '').replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ kind: 'quote', lines: quote });
      continue;
    }
    // 箇条書き
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }
    // 番号付き
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }
    // 空行
    if (line.trim() === '') {
      i++;
      continue;
    }
    // 段落（空行 or 別ブロックまで）
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() !== '' &&
      !/^(#{1,3})\s+/.test(lines[i] ?? '') &&
      !/^\s*[-*]\s+/.test(lines[i] ?? '') &&
      !/^\s*\d+\.\s+/.test(lines[i] ?? '') &&
      !/^>\s?/.test(lines[i] ?? '') &&
      !(lines[i] ?? '').trimStart().startsWith('```')
    ) {
      para.push(lines[i] ?? '');
      i++;
    }
    // 前進の保証: どの規則にも当たらずに止まった（段落が空の）ときは、その 1 行を段落として
    // 取り込んで進める。見出しの判定と段落の停止条件が食い違うと、空の段落を積み続けて
    // 止まらない（U+2028 で実際に起きた）。どちらの規則が変わっても前へ進むための守り。
    if (para.length === 0) {
      para.push(lines[i] ?? '');
      i++;
    }
    blocks.push({ kind: 'p', lines: para });
  }
  return blocks;
}

/** 行内の改行を <br/> で保持しつつインライン描画する。 */
function renderParagraphLines(lines: string[], keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  lines.forEach((ln, idx) => {
    if (idx > 0) out.push(<br key={`${keyBase}-br-${idx}`} />);
    out.push(...renderInline(ln, `${keyBase}-l${idx}`));
  });
  return out;
}

interface MarkdownProps {
  source: string;
  className?: string;
}

/** Markdown サブセットを描画する。空文字なら何も描かない。 */
export function Markdown({ source, className = '' }: MarkdownProps) {
  const blocks = parseBlocks(source);
  return (
    <div className={`md ${className}`}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.kind) {
          case 'heading': {
            // React 19 の型定義でグローバルの JSX 名前空間が廃止され、React.JSX へ移った。
            // 札のタイトルが h3 なので、説明側の見出しは 1 段下げる（h4/h5/h6）。
            const Tag = (b.level === 1 ? 'h4' : b.level === 2 ? 'h5' : 'h6') as keyof React.JSX.IntrinsicElements;
            return (
              <Tag key={key} className="md-h">
                {renderInline(b.text, key)}
              </Tag>
            );
          }
          case 'code':
            return (
              <pre key={key} className="md-pre">
                {b.text}
              </pre>
            );
          case 'quote':
            return (
              <blockquote key={key} className="md-quote">
                {renderParagraphLines(b.lines, key)}
              </blockquote>
            );
          case 'ul':
            return (
              <ul key={key} className="md-ul">
                {b.items.map((it, j) => (
                  <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key} className="md-ol">
                {b.items.map((it, j) => (
                  <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case 'p':
          default:
            return (
              <p key={key} className="md-p">
                {renderParagraphLines((b as { lines: string[] }).lines, key)}
              </p>
            );
        }
      })}
    </div>
  );
}
