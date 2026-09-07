/**
 * IdGen ポート — 識別子の生成。
 *
 * **衝突の再試行は呼び出し側の方針であり、ここではやらない。** ポートは候補を 1 つ返すだけで、
 * 既存 ID との突き合わせは RoomStore を持つアプリケーション層が行う。
 */
export interface IdGen {
  /** 8 文字英数字のルーム ID 候補を 1 つ返す（research R4） */
  roomIdCandidate(): string;
  participantId(): string;
  /** 再接続用トークン。本人以外へ配信してはならない */
  token(): string;
}
