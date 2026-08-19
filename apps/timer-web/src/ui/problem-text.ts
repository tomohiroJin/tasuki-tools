/**
 * お題を可搬なプレーンテキストへ整形する（FR-013 コピー用・#167 E4）。
 *
 * `App.tsx` の private 関数だったため**テストから触れなかった**（`docs/adr/0015` MUST 1）。
 * 副作用も React も持たない純粋関数なので、画面から切り離して検証できる形にする。
 */

import type { Problem } from "@tasuki/timer-core";

export function formatProblemText(p: Problem): string {
  const lines: string[] = [p.title, "", p.description, ""];
  if (p.requirements.length > 0) {
    lines.push("要件:", ...p.requirements.map((r) => `- ${r}`), "");
  }
  if (p.exampleTest) lines.push("例示テスト:", p.exampleTest, "");
  if (p.hints.length > 0) lines.push("ヒント:", ...p.hints.map((h) => `- ${h}`));
  return lines.join("\n").trim();
}
