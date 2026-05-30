/**
 * RoomCodeGen ポート — ルームコード生成
 */

export interface RoomCodeGen {
  /** 推測困難な一意のルームコードを生成する（FR-011） */
  generate(): string;

  /** 参加者 ID を生成する */
  generateParticipantId(): string;

  /** リジュームトークンを生成する */
  generateResumeToken(): string;
}
