import type { CompletionRecord } from "@tasuki/timer-core";

export const NO_TOPIC_LABEL = "お題なし";

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}分${String(seconds % 60).padStart(2, "0")}秒`;
}

function escapeMarkdownText(text: string): string {
  return text
    // 単語中の下線は強調にならない。表示名や URL をそのまま保つ。
    .replace(/(?<=[\p{L}\p{N}])(_+)(?=[\p{L}\p{N}])|[<>[\]*_`~\\]/gu, (symbol, wordUnderscores: string | undefined) =>
      wordUnderscores ?? `\\${symbol}`,
    )
    // R&D などの & は保ち、Markdown で文字参照として読まれる形だけを保護する。
    .replace(/&(?=(?:[a-z][a-z0-9]*|#[0-9]+|#x[0-9a-f]+);)/gi, "\\&");
}

function urlWithoutTrailingPunctuation(token: string): string {
  let depth = 0;
  let end = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token[i];
    if (char === "(") depth++;
    if (char === ")") {
      if (depth === 0) break;
      depth--;
    }
    if (depth === 0) end = i + 1;
  }
  return token.slice(0, end).replace(/[.,;:!?]+$/, "");
}

function markdownText(text: string): string {
  const line = text.replace(/\s*[\r\n\u2028\u2029]+\s*/g, " ");
  // 自動リンクの構文で囲み、エスケープや隣の本文がリンクの行き先に入るのを防ぐ。
  // 空白と日本語の句読点を境界にし、対応する丸括弧は URL 内に残す。
  return line.split(/(\bhttps?:\/\/[^\s\p{Cc}<>"'`\\「」『』（）【】、。！？；：]+)/giu).map((part, index) => {
    if (index % 2 === 0) return escapeMarkdownText(part);
    const url = urlWithoutTrailingPunctuation(part);
    const link = URL.canParse(url) ? `<${url}>` : escapeMarkdownText(url);
    return link + escapeMarkdownText(part.slice(url.length));
  }).join("");
}

export function formatRecordMarkdown(record: CompletionRecord): string {
  const participants = record.members.map((name, index) => {
    const count = record.driverCounts?.[index];
    const assignment = count === undefined ? "担当回数は未記録" : `担当${count}回`;
    return `  - 「${markdownText(name)}」（${assignment}）`;
  });
  const rounds = record.rounds === undefined ? "未記録" : `${record.rounds}周`;

  return [
    "セッションまとめ",
    "",
    `- お題：${markdownText(record.topicTitle ?? NO_TOPIC_LABEL)}`,
    `- 所要時間：${formatDuration(record.elapsedSeconds)}`,
    `- 交代回数：${record.totalSwitches}回`,
    `- 周回数：${rounds}`,
    `- 参加者（${record.members.length}人）`,
    ...participants,
  ].join("\n");
}
