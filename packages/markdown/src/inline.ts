/**
 * 行内要素の解析（#91 PR 3）。timer-web と topic-web に逐語で同じ写しがあったものを 1 つにした。
 *
 * **HTML を作らない。** 返すのはデータの木で、描画は各アプリが React 要素として組む
 * （innerHTML を使わないので、利用者の入力をそのまま渡しても XSS にならない）。
 */

export type MdInline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: MdInline[] }
  | { kind: 'em'; children: MdInline[] }
  /** `href` が null なら安全でない行き先。描画側は `<a>` にせず `text` を素の文字で出す。 */
  | { kind: 'link'; href: string | null; text: string };

/**
 * 許可するリンクスキームだけを通す（javascript: 等を無効化）。
 *
 * **公開しない**（ADR-0016 決定 2・SC-039③）。使うのはこのファイルの `toNode` だけで、
 * テストは `parseInline` のリンクの `href` を通して判定を見る。
 */
function safeHref(url: string): string | null {
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : null;
}

/**
 * リンクの表示と URL の長さの上限。
 *
 * **上限が無いと解析は O(N²) になる**（PR #311 の申し送り）。`[` を並べた入力では、
 * 各位置から `[^\]\n]*` が行末まで読んで失敗するのを N 回繰り返す。上限を置くと 1 位置あたりの
 * 読みが定数で止まる。お題の本文は 4000 字が上限なので、正当なリンクはこの中に収まる。
 */
const MAX_LINK_TEXT = 200;
const MAX_URL = 2000;

// コード→太字→斜体→リンク→生 URL の順で評価する（元の timer-web の順序のまま）。
// 生 URL は末尾の約物（`.` `,` `;` `:` `。` `、` `)` `）`）を含めない。
const INLINE_RE = new RegExp(
  [
    '(`[^`]+`)',
    '(\\*\\*[^*]+?\\*\\*)',
    '(\\*[^*]+?\\*)',
    `(\\[[^\\]\\n]{0,${MAX_LINK_TEXT}}\\]\\([^)\\s]{0,${MAX_URL}}\\))`,
    `((?:https?:\\/\\/|mailto:)[^\\s)]{0,${MAX_URL}}[^\\s).,;:。、）])`,
  ].join('|'),
  'g',
);

/**
 * 1 行を行内要素に分ける。
 *
 * **`lastIndex` で進める**（元の実装は一致のたびに `rest.slice` で残りを切り出しており、
 * 一致の数だけ文字列を複製していた）。
 */
export function parseInline(text: string): MdInline[] {
  const nodes: MdInline[] = [];
  const re = new RegExp(INLINE_RE.source, 'g');
  let pos = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index > pos) nodes.push({ kind: 'text', text: text.slice(pos, m.index) });
    nodes.push(toNode(m));
    pos = m.index + m[0].length;
  }
  if (pos < text.length) nodes.push({ kind: 'text', text: text.slice(pos) });
  return nodes;
}

function toNode(m: RegExpExecArray): MdInline {
  const token = m[0];
  if (m[1]) return { kind: 'code', text: token.slice(1, -1) };
  if (m[2]) return { kind: 'strong', children: parseInline(token.slice(2, -2)) };
  if (m[3]) return { kind: 'em', children: parseInline(token.slice(1, -1)) };
  if (m[4]) {
    const sep = token.indexOf('](');
    return { kind: 'link', href: safeHref(token.slice(sep + 2, -1)), text: token.slice(1, sep) };
  }
  return { kind: 'link', href: safeHref(token), text: token };
}
