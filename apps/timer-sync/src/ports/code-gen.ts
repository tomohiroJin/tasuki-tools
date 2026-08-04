/**
 * RoomCodeGen ポート — ルームコード生成
 */

export interface RoomCodeGen {
  /** ルームコードを生成する（FR-011）。
   *  seed（ルーム名）があれば「slug-接尾辞」（例 morning-mob-7f3k）、無ければ
   *  推測困難なランダムコード。接尾辞で推測困難さ・衝突回避を担保する。 */
  generate(seed?: string): string;

  /** 参加者 ID を生成する */
  generateParticipantId(): string;

  /** リジュームトークンを生成する */
  generateResumeToken(): string;
}
