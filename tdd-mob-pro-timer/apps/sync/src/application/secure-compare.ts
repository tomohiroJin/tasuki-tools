/**
 * 秘密値の定数時間比較（タイミングサイドチャネル緩和）。
 * 管理トークン（admin.ts）と AI 解錠合言葉（handlers.ts）で共用する。
 */
import { timingSafeEqual } from "node:crypto";

/** 定数時間で文字列を比較する。長さ不一致は即 false（timingSafeEqual は長さ違いで throw するため）。 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
