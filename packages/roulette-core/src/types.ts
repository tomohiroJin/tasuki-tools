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
  /** 外した人（参加者もゲストも）。配列は書き換えない（遷移関数が新しい配列を作る） */
  excluded: readonly EntryId[];
  /** 足した名前。最大 MAX_GUESTS */
  guests: readonly Entry[];
  /** この一周で選ばれた人（選ばれた順） */
  drawn: readonly EntryId[];
  lastSpin: Spin | null;
  /** ゲスト ID の採番（`g-1`, `g-2`, …）の次の番号 */
  nextGuestSeq: number;
}

/**
 * 名前の衝突判定（ポート）。**同期サーバーと web は `@tasuki/room-core` の `conflictsWithExisting` を渡す**
 * （参加の重複拒否と同じ関数・同じキー。spec R13）。この文脈は `room-core` に依存できないので
 * （`docs/adr/0017` 決定 1・2）、判定を写さずに受け取る。**ドメインは名前の文字列を自分で比べない。**
 *
 * `existing` の `participantId` は参加者 ID かゲストの ID（判定は `displayName` だけを見る）。
 */
export type NameConflict = (
  existing: readonly { participantId: string; displayName: string }[],
  name: string,
) => boolean;

/**
 * 既定の状態。**凍結する**（配列も）。全ルームで同じ参照を共有するので、誰かが書き換えると
 * 状態の無いすべてのルームへ漏れる。遷移関数は新しい配列を作るので、凍結しても困らない。
 */
export const INITIAL_ROULETTE_STATE: RouletteState = Object.freeze({
  excluded: Object.freeze([]),
  guests: Object.freeze([]),
  drawn: Object.freeze([]),
  lastSpin: null,
  nextGuestSeq: 1,
});
