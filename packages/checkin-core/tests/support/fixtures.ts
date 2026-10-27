import { INITIAL_CHECKIN_STATE, type CheckinState } from "../../src/index.js";

/** 3 人の場 */
export const a = "a";
export const b = "b";
export const c = "c";
export const trio = [a, b, c] as const;

export const empty: CheckinState = INITIAL_CHECKIN_STATE;
