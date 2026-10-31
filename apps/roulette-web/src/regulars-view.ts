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
  overflowNamesText,
  restoredText,
  blockedText,
  skippedText,
  tooManyInPoolText,
} from './copy';
import { stateOf, type PersonRow } from './roulette-view';
import { parseMemberLines, sameMemberName } from './storage/regulars';

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

/** 入れるとき既存の行を入れ直した結果（`restoreOf`） */
export interface RestoreCount {
  /** ルーレットに戻した人数 */
  restored: number;
  /** 同名の行はあるが、押せない（離席中・同名のゲスト）ので戻せなかった人数 */
  blocked: number;
}

/** 入れた後の知らせ（`role="status"` の 1 文）。区切りは句点。 */
export function batchNoticeText(plan: BatchPlan, restore: RestoreCount = { restored: 0, blocked: 0 }): string {
  const { added, overflow, overflowNames } = plan;
  const { restored, blocked } = restore;
  // 戻した人もルーレットに入る
  const poolAfter = plan.poolAfter + restored;
  // サーバーは同名をすべてとばす。そのうち戻した・戻せなかった分を引いた残りが「もう入っている」
  const skipped = Math.max(0, plan.skipped - restored - blocked);
  const who = overflowNames.length > 0 ? overflowNamesText(...overflowNames) : '';
  const parts: string[] = [];
  if (added + restored + blocked > 0) {
    if (added > 0) parts.push(addedText(added));
    if (restored > 0) parts.push(restoredText(restored));
    if (blocked > 0) parts.push(blockedText(blocked));
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

/**
 * 入れるとき、組の名前が既存の行（名簿・ゲスト）と同名で、**同名の行がどれも外れていて**、押せる行があるなら、その行を入れ直す対象にする。
 * サーバーの `addMany` は同名をとばすだけで、外れた人はルーレットに戻らないため（#469）。
 * - 同名の行のどれか 1 つでも入っていれば何もしない（もう入っている）
 * - 押せる行が無いとき（離席中・同名のゲスト）だけ `blocked`
 *
 * 比べ方はサーバーの `addGuests` と同じ `conflictsWithExisting`。名簿の表示名は入室時、ゲストと束の名前は追加時に
 * サーバーが `applyDisplayNameRule` で正規化済みで、組の名前も保存時に正規化済みなので、ここでは正規化し直さない。
 *
 * 戻すのは `addMany` とは別の `setIncluded` なので、知らせは**送った時点の見込み**（`planBatch` と同じ扱い）。
 */
export function restoreOf(rows: readonly PersonRow[], names: readonly string[]): { ids: string[]; blocked: number } {
  const ids: string[] = [];
  let blocked = 0;
  for (const name of names) {
    const same = rows.filter((r) => sameMemberName(r.name, name));
    if (same.length === 0 || same.some((r) => r.checked)) continue;
    const usable = same.find((r) => !r.disabled);
    if (usable === undefined) blocked += 1;
    else ids.push(usable.id);
  }
  return { ids, blocked };
}

/** 欄の候補（いまの人）。`checked` はいまルーレットに入っているか */
export interface Candidate {
  readonly name: string;
  readonly checked: boolean;
}

/**
 * 名簿とゲストの全員を、重複なく候補にする（#469 D1）。名前は保存と同じ正規化にそろえ、
 * 同じ名前（大小・全角半角・前後の空白違い。名簿とゲストの twin）は先に出た 1 人にまとめる。
 * まとめた人は、どちらかが入っていればチェック。見えない名前は落とす。
 */
export function candidatesOf(rows: readonly PersonRow[]): Candidate[] {
  const out: { name: string; checked: boolean }[] = [];
  for (const row of rows) {
    const [name] = parseMemberLines(row.name);
    if (name === undefined) continue;
    const found = out.find((c) => sameMemberName(c.name, name));
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
  const rows = candidates.map((c) => ({ name: c.name, checked: members.some((m) => sameMemberName(c.name, normalizeDisplayName(m))) }));
  const manual = members.filter((m) => !candidates.some((c) => sameMemberName(c.name, normalizeDisplayName(m))));
  return { rows, text: manual.join('\n') };
}

/**
 * 保存する名前の列。保存済みの組の名前（`saved`）のうち、まだチェックか手入力に残っているものは**保存済みの綴りで元の位置**に置き、
 * 新しくチェックした人・手入力した人は後ろ（チェック、手入力の順）へ。新しい組は `saved` を空にする。
 * 重複と正規化は保存と同じ（`parseMemberLines`）。
 */
export function orderedMembers(saved: readonly string[], checked: readonly string[], text: string): string[] {
  const wanted = parseMemberLines([...checked, text].join('\n'));
  const kept = saved.filter((m) => wanted.some((w) => sameMemberName(w, m)));
  const rest = wanted.filter((w) => !kept.some((m) => sameMemberName(w, m)));
  return [...kept, ...rest];
}
