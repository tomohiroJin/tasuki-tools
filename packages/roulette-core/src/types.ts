/**
 * ルーレットの状態と、名簿の断片の型（#94 spec §5.1）。
 *
 * **この文脈は参加者 ID の中身を解釈しない**（`room-core` に依存しない・spec R3）。
 * 名簿の断片（{@link Member}）はアプリ層が `room-core` の `Room` から作って渡す。
 */

/** 抽選に入りうる 1 人。参加者 ID か、ゲストの ID（`g-` で始まる） */
export type EntryId = string;

export interface Entry {
  id: EntryId;
  name: string;
}

/** 名簿の断片。`present` は在室（online）かどうか */
export interface Member {
  id: EntryId;
  name: string;
  present: boolean;
}

export interface Spin {
  /** 回した通し番号（ルームごと・1 から）。web はこれで「新しい回転か」を見分ける */
  seq: number;
  /** 回す時点の並び（凍結）。2〜MAX_WHEEL 件 */
  wheel: Entry[];
  winnerIndex: number;
  /** 当たりの席の中のどこで止まるか（SETTLE_MIN〜SETTLE_MAX）。全画面で同じ */
  settle: number;
  /** 回した人の表示名 */
  spunBy: string;
  /** サーバーの単調時計（ms）。**wire には載せない**（spec R5） */
  startedAt: number;
}

export interface RouletteState {
  /** 外した人（参加者もゲストも） */
  excluded: EntryId[];
  /** 足した名前。最大 MAX_GUESTS */
  guests: Entry[];
  /** この一周で選ばれた人（選ばれた順） */
  drawn: EntryId[];
  lastSpin: Spin | null;
  /** ゲスト ID の採番（`g-1`, `g-2`, …）の次の番号 */
  nextGuestSeq: number;
}

export const INITIAL_ROULETTE_STATE: RouletteState = {
  excluded: [],
  guests: [],
  drawn: [],
  lastSpin: null,
  nextGuestSeq: 1,
};
