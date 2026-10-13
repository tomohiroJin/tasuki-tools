/**
 * SC-035: 利用者向け文言の定義箇所（正規表現の近接ペアリングは使わない）。
 *
 * `scripts/audit-structure.mjs` から判定の部分だけを移したもの（#361）。走査の宣言と組み立ては
 * 入口に残る。ここに置くのは、解析対象の文字列を受け取る純粋関数だけである。
 */

/* ============================================================
 * SC-035: 利用者向け文言の定義箇所（正規表現の近接ペアリングは使わない）
 * ============================================================ */

function findEnclosingBraceStart(source, fromIdx) {
  let depth = 0;
  for (let i = fromIdx; i >= 0; i--) {
    const ch = source[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

function findMatchingBraceEnd(source, fromIdx) {
  let depth = 0;
  for (let i = fromIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * ソースから「同一のオブジェクトリテラル内にある code / message の組」だけを抽出する。
 * `code:` の位置から波括弧の対応を辿って同一スコープを特定し、その中の `message:` のみ拾う
 * （正規表現の近接ペアリングでは誤対応するため、これを避ける設計。plan.md/spec.md の指示）。
 */
export function extractCodeMessagePairs(source) {
  const pairs = [];
  const codeRe = /\bcode:\s*["'`]([A-Za-z0-9_]+)["'`]/g;
  let m;
  while ((m = codeRe.exec(source))) {
    const braceStart = findEnclosingBraceStart(source, m.index);
    if (braceStart === -1) continue;
    const braceEnd = findMatchingBraceEnd(source, braceStart);
    if (braceEnd === -1) continue;
    const scope = source.slice(braceStart, braceEnd + 1);
    const msgMatch =
      /\bmessage:\s*(["'])((?:\\.|(?!\1)[\s\S])*?)\1/.exec(scope) ??
      /\bmessage:\s*`([^`]*)`/.exec(scope);
    if (msgMatch) {
      pairs.push({ code: m[1], message: msgMatch[2] ?? msgMatch[1] });
    }
  }
  return pairs;
}

/**
 * クライアント側の `ERROR_MESSAGES = { CODE: "文言", ... }` 形式のテーブルからコード集合を抽出する。
 */
export function extractClientErrorTable(source) {
  const match = /ERROR_MESSAGES[^={]*[:=]\s*\{([\s\S]*?)\n\}/.exec(source);
  if (!match) return new Set();
  const body = match[1];
  const codes = new Set();
  const re = /(?:^|\n)\s*([A-Za-z][A-Za-z0-9_]*)\s*:/g;
  let m;
  while ((m = re.exec(body))) codes.add(m[1]);
  return codes;
}

/**
 * SC-035: 同一のエラーコードに対する文言の定義箇所が 2 箇所以上あるものの件数。
 * serverSources: サーバー側ソース文字列の配列。clientSource: クライアント側の文言テーブルを含むソース。
 */
export function sc035MessageDefinitions(serverSources, clientSource) {
  const serverCodeCounts = new Map();
  for (const src of serverSources) {
    for (const { code } of extractCodeMessagePairs(src)) {
      serverCodeCounts.set(code, (serverCodeCounts.get(code) ?? 0) + 1);
    }
  }
  const clientCodes = extractClientErrorTable(clientSource);
  let count = 0;
  for (const [code, serverSites] of serverCodeCounts) {
    const totalSites = serverSites + (clientCodes.has(code) ? 1 : 0);
    if (totalSites >= 2) count++;
  }
  return count;
}
