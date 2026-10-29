import { INITIAL_CHECKIN_STATE, chooseMethod, type CheckinState, type MethodId } from "../../src/index.js";

/** 3 人の場 */
export const a = "a";
export const b = "b";
export const c = "c";
export const trio = [a, b, c] as const;

export const empty: CheckinState = INITIAL_CHECKIN_STATE;

/** いまの回（無ければ 0）を置き換える形でやり方を選ぶ（試験の手短な書き方） */
export const choose = (s: CheckinState, method: MethodId): CheckinState =>
  chooseMethod(s, { seq: s.round?.seq ?? 0, method });
