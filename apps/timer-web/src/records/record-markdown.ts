import type { CompletionRecord } from "@tasuki/timer-core";

export const NO_TOPIC_LABEL = "お題なし";

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}分${String(seconds % 60).padStart(2, "0")}秒`;
}

function markdownText(text: string): string {
  // 名前やお題の改行を畳み、Markdown 記法に使う記号をエスケープする。
  return text
    .replace(/\s*[\r\n\u2028\u2029]+\s*/g, " ")
    // 単語中の下線は強調にならない。表示名や URL をそのまま保つ。
    .replace(/(?<=[\p{L}\p{N}])(_+)(?=[\p{L}\p{N}])|[<>[\]*_`~\\]/gu, (symbol, wordUnderscores: string | undefined) =>
      wordUnderscores ?? `\\${symbol}`,
    )
    // R&D などの & は保ち、Markdown で文字参照として読まれる形だけを保護する。
    .replace(/&(?=(?:[a-z][a-z0-9]*|#[0-9]+|#x[0-9a-f]+);)/gi, "\\&");
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
