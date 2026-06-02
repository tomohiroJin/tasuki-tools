/**
 * 完成記録の永続化ポリシー（FR-020）
 *
 * 完成（complete）のときだけ記録を保存し、中断（abort）では保存しない
 * （途中終了を達成として記録しない）。保存実体（saver）は注入し、
 * 判断ロジックを副作用から切り離してテスト可能にする。
 */

import type { CompletionRecord } from "@tdd-mob/core";
import type { EndType } from "../ui/Summary.js";

/**
 * 終了種別が完成かつ記録があるときのみ saver を呼ぶ。
 * @param endType 終了種別（complete / abort）
 * @param record 完成記録（中断時は null）
 * @param saver 記録を永続化する関数（例: records/indexeddb の saveRecord）
 */
export async function persistRecordIfComplete(
  endType: EndType,
  record: CompletionRecord | null,
  saver: (record: CompletionRecord) => Promise<void>,
): Promise<void> {
  if (endType !== "complete" || record === null) return;
  await saver(record);
}
