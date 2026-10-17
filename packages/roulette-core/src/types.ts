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

/** 止まる順の当たりの 1 人（#401 spec §5.1） */
export interface Pick {
  /** `wheel` の中の添字 */
  index: number;
  /** その席の中のどこで止まるか（SETTLE_MIN〜SETTLE_MAX） */
  settle: number;
}

export interface Spin {
  /** 回した通し番号（ルームごと・1 から）。web はこれで「新しい回転か」を見分ける */
  seq: number;
  /** 回す時点の並び（凍結）。2〜MAX_WHEEL 件 */
  wheel: Entry[];
  /** 1 人目（`picks[0]`）の席。古い web のために残す（#401 spec M9。意味は変えない） */
  winnerIndex: number;
  /** 1 人目の席の中のどこで止まるか（SETTLE_MIN〜SETTLE_MAX）。全画面で同じ */
  settle: number;
  /** 止まる順の当たり（1〜MAX_PICK 件・席は重ならない）。件数が回した時点の選ぶ人数（#401 spec M3） */
  picks: Pick[];
  /** 順番に回すときの、この回転で決まる番（1 から・#401 順番に回す T2）。1 回で決めるときは持たない */
  turn?: number;
  /** 回した人の表示名 */
  spunBy: string;
  /** サーバーの単調時計（ms）。**wire には載せない**（spec R5） */
  startedAt: number;
}

/** 決め方（#401 順番に回す T1）。`once` は 1 回で選ぶ人数ぶんを決める・`order` は回すたびに 1 人ずつ順番を決める */
export type RouletteMode = "once" | "order";

/** 順番に回す回（#401 順番に回す T5）。複数の回転にまたがる */
export interface OrderRound {
  /** 番が決まった人（決まった順）。名前も持つ（回の途中で名前が変わっても、決まったときの名前で出す） */
  done: readonly Entry[];
  /** 全員の番が決まった */
  finished: boolean;
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
  /** 1 回の回転で選ぶ人数（1〜MAX_PICK・#401）。ルームで共有する */
  pickCount: number;
  /** 決め方（#401 順番に回す T1）。ルームで共有する */
  mode: RouletteMode;
  /** 順番に回す回。回していない・やり直した・決め方を変えたら null */
  order: OrderRound | null;
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
  pickCount: 1,
  mode: "once",
  order: null,
});
