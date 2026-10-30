/**
 * いつものメンツを入れるときの画面の判断（#458 設計 §6）。React にも I/O にも依存しない。
 *
 * ルーレットの通信には返事が無いので、知らせは押した時点の状態から、サーバーと**同じ関数**
 * （`addGuests`・`poolOf`）で数えて組む。間に誰かが名前を足していなければサーバーと一致する
 * （ずれるのは知らせの数だけで、状態はサーバーが正）。
 */
import { conflictsWithExisting, normalizeDisplayName } from '@tasuki/room-core';
import { MAX_WHEEL, addGuests, poolOf, type Member, type RouletteView } from '@tasuki/roulette-core';
import {
  ALL_PRESENT_TEXT,
  NONE_ADDED_OVERFLOW_TEXT,
  addedText,
  overflowText,
  skippedText,
  tooManyInPoolText,
} from './copy';
import { overflowNamesText } from './copy';
import { stateOf, type PersonRow } from './roulette-view';
import { parseMemberLines } from './storage/regulars';

export interface BatchPlan {
  /** 足した人数 */
  added: number;
  /** 名簿・ゲストと同じ名前でとばした人数 */
  skipped: number;
  /** ゲストの上限で入らなかった人数 */
  overflow: number;
  /** 上限で入らなかった人の名前（もう入っていた人の名前は持たない） */
  overflowNames: string[];
  /** 入れた後の「入る人」の数 */
  poolAfter: number;
}

/** 組の名前を入れたら何人入るか。受け取った状態と名簿で、サーバーと同じ `addGuests` を呼ぶ。 */
export function planBatch(input: { view: RouletteView; members: readonly Member[]; names: readonly string[] }): BatchPlan {
  const { view, members, names } = input;
  const batch = addGuests(stateOf(view), names, members, conflictsWithExisting);
  return {
    added: batch.added.length,
    skipped: batch.skipped.length,
    overflow: batch.overflow.length,
    overflowNames: [...batch.overflow],
    // 足した人は誰とも同名でないので、いまの入る人に足すだけでよい。
    // （`stateOf` は `nextGuestSeq` を持たないので、足した後の状態から数えると新しい ID が既存の `g-1`… とぶつかる）
    poolAfter: poolOf(members, stateOf(view), conflictsWithExisting).length + batch.added.length,
  };
}

/** 入れた後の知らせ（`role="status"` の 1 文）。区切りは句点。 */
export function batchNoticeText(plan: BatchPlan): string {
  const { added, skipped, overflow, overflowNames, poolAfter } = plan;
  const who = overflowNames.length > 0 ? overflowNamesText(overflowNames.join('、')) : '';
  const parts: string[] = [];
  if (added > 0) {
    parts.push(addedText(added));
    if (skipped > 0) parts.push(skippedText(skipped));
    if (overflow > 0) parts.push(overflowText(overflow) + who);
  } else if (overflow > 0) {
    parts.push(NONE_ADDED_OVERFLOW_TEXT + who);
  } else if (skipped > 0) {
    parts.push(ALL_PRESENT_TEXT);
  }
  if (poolAfter > MAX_WHEEL) parts.push(tooManyInPoolText(poolAfter));
  return parts.join('。');
}

/** 欄の候補（いまの人）。`checked` はいまルーレットに入っているか */
export interface Candidate {
  readonly name: string;
  readonly checked: boolean;
}

const sameName = (a: string, b: string): boolean => conflictsWithExisting([{ participantId: a, displayName: a }], b);

/**
 * 名簿とゲストの全員を、重複なく候補にする（#469 D1）。名前は保存と同じ正規化にそろえ、
 * 同じ名前（大小・全角半角・前後の空白違い。名簿とゲストの twin）は先に出た 1 人にまとめる。
 * まとめた人は、どちらかが入っていればチェック。見えない名前は落とす。
 */
export function candidatesOf(rows: readonly PersonRow[]): Candidate[] {
  const out: { name: string; checked: boolean }[] = [];
  for (const row of rows) {
    const [name] = parseMemberLines(normalizeDisplayName(row.name));
    if (name === undefined) continue;
    const found = out.find((c) => sameName(c.name, name));
    if (found === undefined) out.push({ name, checked: row.checked });
    else found.checked = found.checked || row.checked;
  }
  return out;
}

/**
 * 直す欄の振り分け（#469 D3）。組の名前のうち候補にいる人はチェック、いない人は手入力の行へ。
 * 候補との照合は保存と同じ正規化・大小無視（手入力へ同じ人を重ねない）。
 */
export function splitForEdit(candidates: readonly Candidate[], members: readonly string[]): { rows: Candidate[]; text: string } {
  const rows = candidates.map((c) => ({ name: c.name, checked: members.some((m) => sameName(c.name, normalizeDisplayName(m))) }));
  const manual = members.filter((m) => !candidates.some((c) => sameName(c.name, normalizeDisplayName(m))));
  return { rows, text: manual.join('\n') };
}

/** チェックした人（先）と手入力の行（後）から組の名前の列を作る。保存と同じ正規化・重複除去 */
export function buildMembers(checked: readonly string[], text: string): string[] {
  return parseMemberLines([...checked, text].join('\n'));
}
