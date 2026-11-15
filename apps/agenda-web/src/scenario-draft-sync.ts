/**
 * 下書きとルームのシナリオの付き合わせ（#595 で ScenarioBuilder から分けた純粋な判断）。
 * **ルームが変わっても、手元で変えた下書きは上書きしない**（#429 spec §4.2 の 4）。
 * - 下書きが空か、前のルームのシナリオと同じ（手を付けていない）なら、新しいルームのシナリオを下書きにする
 * - 手元で変えた下書きがあり、新しいルームのシナリオと違うなら、下書きを残して「シナリオが変わりました」
 * - ただし新しいルームのシナリオが自分の送ったもの（読み込んだ後に下書きを触った）なら知らせない
 * - 新しいルームのシナリオが下書きと同じなら、知らせを下ろす
 */
import type { ScenarioInput } from '@tasuki/agenda-core';
import { draftFromInput, inputFromDraft, isEmptyDraft, roundsOfDraft, scenarioKey, type Draft } from './scenario-draft';

export interface DraftState {
  readonly draft: Draft;
  /** 最後に見たルームのシナリオの鍵（他の人の置き換えを見分ける） */
  readonly roomKey: string;
  readonly changed: boolean;
  /** この端末が最後に送ったシナリオの鍵。返ってきた自分の置き換えを「変わりました」と言わない */
  readonly sentKey: string | null;
}

export function initDraftState(room: ScenarioInput): DraftState {
  return { draft: draftFromInput(room), roomKey: scenarioKey(room), changed: false, sentKey: null };
}

/** ルームのシナリオが変わっていたら、下書きとの付き合わせの結果を返す。変わっていなければ同じ状態をそのまま返す */
export function reconcileRoom(state: DraftState, room: ScenarioInput): DraftState {
  const key = scenarioKey(room);
  if (state.roomKey === key) return state;
  const draftKey = scenarioKey(inputFromDraft(state.draft));
  // 回数の欄を空にした下書きは `rounds` キーを落とし、回数 1 のルームと同じ鍵になる。触った下書きとして扱う
  const untouched = isEmptyDraft(state.draft) || (roundsOfDraft(state.draft) !== null && draftKey === state.roomKey);
  return untouched
    ? { ...state, draft: draftFromInput(room), roomKey: key, changed: false }
    : { ...state, roomKey: key, changed: key !== state.sentKey && draftKey !== key };
}

/** 下書きを編集した後の状態。下書きがルームと同じになれば知らせを下ろす */
export function afterDraftEdit(state: DraftState, draft: Draft): DraftState {
  return { ...state, draft, changed: state.changed && scenarioKey(inputFromDraft(draft)) !== state.roomKey };
}

/** 「ルームのに戻す」: 下書きをルームのシナリオにして知らせを下ろす */
export function adoptRoom(state: DraftState, room: ScenarioInput): DraftState {
  return { ...state, draft: draftFromInput(room), changed: false };
}

/** 送ったシナリオの鍵を覚える（返ってきた自分の置き換えを知らせない） */
export function markSent(state: DraftState, input: ScenarioInput): DraftState {
  return { ...state, sentKey: scenarioKey(input) };
}
