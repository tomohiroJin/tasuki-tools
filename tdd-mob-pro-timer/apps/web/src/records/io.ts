/**
 * 完成記録の JSON 入出力（持ち運び可能形式）
 * T029: FR-029, SC-008
 */

import { ok, err, type Result } from "neverthrow";
import * as v from "valibot";
import { CompletionRecordSchema } from "@tdd-mob/core/schemas";
import type { CompletionRecord } from "@tdd-mob/core";

/** エクスポートファイルの構造 */
const ExportFileSchema = v.object({
  version: v.literal(1),
  exportedAt: v.number(),
  records: v.array(CompletionRecordSchema),
});

type ExportFile = v.InferOutput<typeof ExportFileSchema>;

/**
 * 完成記録を JSON 文字列に書き出す（FR-029）
 */
export function exportRecords(records: CompletionRecord[]): string {
  const file: ExportFile = {
    version: 1,
    exportedAt: Date.now(),
    records,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * JSON 文字列から完成記録を読み込む（FR-029, SC-008）
 * 不正な JSON・スキーマ不正は Err を返す
 */
export function importRecords(
  json: string,
): Result<CompletionRecord[], string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return err("Invalid JSON");
  }

  const result = v.safeParse(ExportFileSchema, parsed);
  if (!result.success) {
    return err(`Schema validation failed: ${JSON.stringify(result.issues)}`);
  }

  return ok(result.output.records);
}
