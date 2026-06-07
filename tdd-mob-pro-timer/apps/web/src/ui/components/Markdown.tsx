/**
 * 安全な Markdown サブセット → React 要素レンダラ
 *
 * 文字列 HTML を一切生成せず（innerHTML 不使用）、React 要素を直接組み立てるため
 * 本質的に XSS 安全。共有メモのプレビューとお題の説明で共用する。
 *
 * 対応記法:
 *  - ブロック: 見出し(# / ## / ###)、箇条書き(- / *)、番号付き(1.)、引用(>)、
 *              コードブロック(``` フェンス)、段落（空行区切り・行内改行は <br/>）
 *  - インライン: **太字**、*斜体*、`コード`、[表示](URL)、生 URL の autolink
 * リンクは http(s) / mailto のみ許可し、target=_blank rel=noopener を付与する。
 */

import React from "react";

/** 許可するリンクスキームのみ通す（javascript: 等を無効化）。 */
function safeHref(url: string): string | null {
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : null;
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  const safe = safeHref(href);
  if (!safe) return <>{children}</>;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-[var(--signal)] underline decoration-[var(--signal)]/50 underline-offset-2 hover:decoration-[var(--signal)] break-all"
    >
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
        <code key={key} className="rounded bg-[var(--panel)] border border-[var(--hairline)] px-1 py-0.5 text-[0.85em] font-mono text-[var(--bone)]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (m[2]) {
      // **太字**（内側もインライン解析）
      nodes.push(
        <strong key={key} className="font-bold text-[var(--bone)]">
          {renderInline(token.slice(2, -2), key)}
        </strong>,
      );
    } else if (m[3]) {
      // *斜体*
      nodes.push(
        <em key={key} className="italic">
          {renderInline(token.slice(1, -1), key)}
        </em>,
      );
    } else if (m[4]) {
      // [表示](URL)
      const sep = token.indexOf("](");
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
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; text: string }
  | { kind: "quote"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "p"; lines: string[] };

/** 行配列をブロックに区切る。 */
function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    // コードフェンス
    if (line.trimStart().startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").trimStart().startsWith("```")) {
        body.push(lines[i] ?? "");
        i++;
      }
      i++; // 閉じフェンスを飛ばす
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    // 見出し
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ kind: "heading", level: h[1]!.length, text: h[2]! });
      i++;
      continue;
    }
    // 引用
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) {
        quote.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", lines: quote });
      continue;
    }
    // 箇条書き
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    // 番号付き
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
    // 空行
    if (line.trim() === "") {
      i++;
      continue;
    }
    // 段落（空行 or 別ブロックまで）
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !/^(#{1,3})\s+/.test(lines[i] ?? "") &&
      !/^\s*[-*]\s+/.test(lines[i] ?? "") &&
      !/^\s*\d+\.\s+/.test(lines[i] ?? "") &&
      !/^>\s?/.test(lines[i] ?? "") &&
      !(lines[i] ?? "").trimStart().startsWith("```")
    ) {
      para.push(lines[i] ?? "");
      i++;
    }
    blocks.push({ kind: "p", lines: para });
  }
  return blocks;
}

const HEADING_CLASS: Record<number, string> = {
  1: "text-base font-bold text-[var(--bone)] mt-3 mb-1 first:mt-0",
  2: "text-sm font-bold text-[var(--bone)] mt-3 mb-1 first:mt-0",
  3: "text-sm font-semibold text-[var(--bone-muted)] mt-2 mb-1 first:mt-0",
};

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
export function Markdown({ source, className = "" }: MarkdownProps) {
  const blocks = parseBlocks(source);
  return (
    <div className={`text-sm leading-relaxed text-[var(--bone-muted)] space-y-2 ${className}`}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.kind) {
          case "heading": {
            const Tag = (b.level === 1 ? "h3" : b.level === 2 ? "h4" : "h5") as keyof JSX.IntrinsicElements;
            return (
              <Tag key={key} className={HEADING_CLASS[b.level]}>
                {renderInline(b.text, key)}
              </Tag>
            );
          }
          case "code":
            return (
              <pre key={key} className="rounded-md bg-[var(--panel)] border border-[var(--hairline)] p-3 text-xs font-mono text-[var(--bone)] overflow-x-auto whitespace-pre-wrap">
                {b.text}
              </pre>
            );
          case "quote":
            return (
              <blockquote key={key} className="border-l-2 border-[var(--signal)] pl-3 text-[var(--bone-subtle)]">
                {renderParagraphLines(b.lines, key)}
              </blockquote>
            );
          case "ul":
            return (
              <ul key={key} className="list-disc pl-5 space-y-0.5">
                {b.items.map((it, j) => (
                  <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="list-decimal pl-5 space-y-0.5">
                {b.items.map((it, j) => (
                  <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case "p":
          default:
            return (
              <p key={key} className="text-[var(--bone-muted)]">
                {renderParagraphLines((b as { lines: string[] }).lines, key)}
              </p>
            );
        }
      })}
    </div>
  );
}
