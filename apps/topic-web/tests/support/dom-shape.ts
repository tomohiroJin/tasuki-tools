/**
 * 描画された DOM の形（タグ・クラス・見る属性）を行に書き出す（#371 の特性テスト用）。
 * クラスは `classList` で見る（属性の文字列の空白の違いは見ない）。
 */
const ATTRS = ['href', 'target', 'rel', 'tabindex', 'role'] as const;

export function domShape(root: Element): string[] {
  const lines: string[] = [];
  const walk = (el: Element, depth: number) => {
    const classes = [...el.classList].sort().map((c) => `.${c}`).join('');
    const attrs = ATTRS.filter((a) => el.hasAttribute(a))
      .map((a) => `[${a}=${el.getAttribute(a)}]`)
      .join('');
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent !== '')
      .map((n) => JSON.stringify(n.textContent))
      .join('');
    lines.push(`${'  '.repeat(depth)}${el.tagName.toLowerCase()}${classes}${attrs}${text ? ` ${text}` : ''}`);
    for (const child of el.children) walk(child, depth + 1);
  };
  walk(root, 0);
  return lines;
}

/** 3 つのアプリで同じに描くことを確かめる原稿（見出し・段落と行内・引用・箇条書き・番号・コード）。 */
export const SHAPE_SOURCE = [
  '# 見出し1',
  '## 見出し2',
  '### 見出し3',
  '',
  '段落 **太字** *斜体* `code` [リンク](https://example.com) と [危険](javascript:x)',
  '2 行目',
  '',
  '> 引用',
  '',
  '- 一つ',
  '- 二つ',
  '',
  '1. 番号',
  '',
  '```',
  'const a = 1;',
  '```',
].join('\n');
