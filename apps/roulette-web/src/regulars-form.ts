/**
 * 「いつものメンツ」の組を作る・直す欄の、状態と検証（画面を持たない判断）。
 * RegularsSection から切り出した。DOM・フォーカス・保存は持たない。
 */
import { rendersAsNothing } from '@tasuki/room-core';
import { MAX_GUESTS } from '@tasuki/roulette-core';
import {
  REGULARS_ERROR_BAD_NAME,
  REGULARS_ERROR_FULL,
  REGULARS_ERROR_NAME_EMPTY,
  REGULARS_ERROR_NAME_TAKEN,
  REGULARS_ERROR_NO_MEMBERS,
  REGULARS_ERROR_TOO_MANY_MEMBERS,
  REGULARS_ERROR_UNREADABLE,
  REGULARS_ERROR_WRITE_FAILED,
} from './copy';
import { orderedMembers, type Candidate } from './regulars-view';
import { isValidGroupName, parseMemberLines } from './regulars-rules';

/** エラーの印を付ける欄（名前の欄か、複数行の欄か、チェックの一覧か） */
export type ErrorField = 'name' | 'members' | 'people';

/** 保存・削除の失敗の原因ごとの文 */
export const REASON_TEXT = {
  invalid: REGULARS_ERROR_BAD_NAME,
  unreadable: REGULARS_ERROR_UNREADABLE,
  'write-failed': REGULARS_ERROR_WRITE_FAILED,
  full: REGULARS_ERROR_FULL,
  'name-taken': REGULARS_ERROR_NAME_TAKEN,
} as const;

/** 人数・保存の失敗の原因が一覧だけか。手入力がチェックに無い人を 1 人も足していなければ一覧（両方が原因なら入力欄） */
export function countFieldOf(hasList: boolean, checked: readonly string[], text: string): ErrorField {
  const manualAdds = orderedMembers([], checked, text).length > orderedMembers([], checked, '').length;
  return hasList && !manualAdds ? 'people' : 'members';
}

/** 入力の検証。保存の関数が黙って落とす名前（長すぎる・見えない）も、ここで見つけて止める */
export function validate(
  name: string,
  saved: readonly string[],
  checked: readonly string[],
  text: string,
  hasList: boolean,
): { error: string; field: ErrorField } | { members: string[] } {
  if (name.trim() === '' || rendersAsNothing(name)) return { error: REGULARS_ERROR_NAME_EMPTY, field: 'name' };
  if (!isValidGroupName(name.trim())) return { error: REGULARS_ERROR_BAD_NAME, field: 'name' };
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.some((l) => parseMemberLines(l).length === 0)) return { error: REGULARS_ERROR_BAD_NAME, field: 'members' };
  const members = orderedMembers(saved, checked, text);
  // 人数の誤りは、手入力が一人も足していなければチェックだけが原因（一覧の側）。手入力が足しているなら入力欄の側に寄せる（両方が原因のときは入力欄）
  const countField = countFieldOf(hasList, checked, text);
  if (members.length === 0) return { error: REGULARS_ERROR_NO_MEMBERS, field: countField };
  if (members.length > MAX_GUESTS) return { error: REGULARS_ERROR_TOO_MANY_MEMBERS, field: countField };
  return { members };
}

/** 欄の入力と、エラーの印 */
export interface RegularFormState {
  name: string;
  text: string;
  /** 欄を開いた時点の「いまの人」とチェック。開いている間は人が出入りしても動かさない */
  checkRows: readonly Candidate[];
  error: string;
  errorField: ErrorField;
}

export const INITIAL_FORM: RegularFormState = { name: '', text: '', checkRows: [], error: '', errorField: 'members' };

export type RegularFormAction =
  | { type: 'open'; name: string; text: string; rows: readonly Candidate[] }
  | { type: 'name'; value: string }
  | { type: 'text'; value: string }
  | { type: 'check'; index: number; on: boolean }
  | { type: 'fail'; message: string; field: ErrorField }
  | { type: 'clear-error' };

export function formReducer(state: RegularFormState, action: RegularFormAction): RegularFormState {
  switch (action.type) {
    case 'open':
      return { ...state, name: action.name, text: action.text, checkRows: action.rows, error: '' };
    case 'name':
      return { ...state, name: action.value };
    case 'text':
      return { ...state, text: action.value };
    case 'check':
      return { ...state, checkRows: state.checkRows.map((x, j) => (j === action.index ? { name: x.name, checked: action.on } : x)) };
    case 'fail':
      return { ...state, error: action.message, errorField: action.field };
    case 'clear-error':
      return { ...state, error: '' };
  }
}
