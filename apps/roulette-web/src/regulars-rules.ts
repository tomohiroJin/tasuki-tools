/**
 * いつものメンツの純粋な規則（#458 設計 §5・#592）。端末への保存（`storage/regulars.ts`）から分けた。
 * 組の数の上限・名前の比べ方・複数行欄の名前の列への整え方。React にも I/O にも依存しない。
 */
import { MAX_DISPLAY_NAME, conflictsWithExisting, normalizeDisplayName, rendersAsNothing } from '@tasuki/room-core';

/** 保存できる組の数。直すのは数えない */
export const MAX_GROUPS = 10;

/** 同じ名前か（参加の重複判定と同じ `conflictsWithExisting`: 大小・前後の空白を無視）。画面の比べ方もこれに揃える */
export const sameMemberName = (a: string, b: string): boolean => conflictsWithExisting([{ participantId: a, displayName: a }], b);

/** 名前の列にする。`normalizeDisplayName` を当て、空・見えない名前を捨て、同じ名前は先に出た方を残す */
export function foldMembers(candidates: readonly string[]): string[] {
  const out: string[] = [];
  for (const c of candidates) {
    const n = normalizeDisplayName(c);
    if (n === '' || n.length > MAX_DISPLAY_NAME || rendersAsNothing(n)) continue;
    if (out.some((d) => sameMemberName(d, n))) continue;
    out.push(n);
  }
  return out;
}

/** 複数行欄の文字列を名前の列にする（改行は CRLF も） */
export function parseMemberLines(text: string): string[] {
  return foldMembers(text.split(/\r?\n/));
}
