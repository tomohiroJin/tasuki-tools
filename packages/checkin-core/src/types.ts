/** 会の始まりと終わりの札の状態の型（#406）。 */
import type { CardId, MethodId, Visibility } from "./methods.js";

export interface Round {
  /** 1 から。新しい回ごとに +1 */
  readonly seq: number;
  readonly method: MethodId;
  readonly visibility: Visibility;
  readonly status: "open" | "revealed";
  /** participantId → 札（最後に出したもの） */
  readonly cards: ReadonlyMap<string, CardId>;
  /**
   * participantId → 開いた時点の表示名。**名前つきで開いた回だけ**（`recordRevealedNames` が写す）。
   * 開いた後に名簿から外れた人も、名前つきの山の names に残すため（開いた回は結果を凍らせる）
   */
  readonly names?: ReadonlyMap<string, string>;
}

export interface CheckinState {
  readonly round: Round | null;
  /** 最後に始めた回の番号。回を捨てても戻らない（古い操作の取り違え防止） */
  readonly lastSeq: number;
  readonly spectators: ReadonlySet<string>;
}

export const INITIAL_CHECKIN_STATE: CheckinState = {
  round: null,
  lastSeq: 0,
  spectators: new Set(),
};
