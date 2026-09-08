/**
 * トークン保持（リジュームトークン・ルームパスフレーズ）。
 *
 * `handlers.ts` の `makeHandlers` が抱えていた可変 `Map`
 * （`resumeTokens` / `roomPassphrases`）を、ロジックを変えずに
 * 1モジュールへ切り出したもの（フェーズ2・純粋な移動）。
 * 3 個目の `hostTokens` は #95 S3 でホストの概念ごと廃止した
 * （照合経路が一度も存在せず、発行するだけのトークンだった）。
 *
 * ルーム作成・参加・パスフレーズ設定の各ハンドラが発行・照会し、
 * `releaseRoom` でルーム単位に一括解放する（ルーム回収時の後始末）。
 */

import type { Room } from "@tasuki/timer-core";

/** リジュームトークンが指す再接続先（参加者ID・ルームコード） */
export interface ResumeTokenData {
  participantId: string;
  roomCode: Room["code"];
}

export interface TokenStore {
  /** リジュームトークンを発行する（room.create/room.join の双方から呼ばれる）。 */
  issueResume(resumeToken: string, data: ResumeTokenData): void;
  /** リジュームトークンから再接続先を引く。無ければ `undefined`。 */
  getResume(resumeToken: string): ResumeTokenData | undefined;
  /** ルームのパスフレーズ（平文）を引く。未設定なら `undefined`。 */
  getPassphrase(roomCode: string): string | undefined;
  /** ルームのパスフレーズを設定する。 */
  setPassphrase(roomCode: string, passphrase: string): void;
  /** ルームのパスフレーズ保護を解除する。 */
  deletePassphrase(roomCode: string): void;
  /** ルーム回収時の後始末。当該ルームのリジュームトークンとパスフレーズを解放する。 */
  releaseRoom(roomCode: string): void;
}

export function createTokenStore(): TokenStore {
  const roomPassphrases = new Map<string, string>();
  const resumeTokens = new Map<string, ResumeTokenData>();

  return {
    issueResume(resumeToken, data) {
      resumeTokens.set(resumeToken, data);
    },
    getResume(resumeToken) {
      return resumeTokens.get(resumeToken);
    },
    getPassphrase(roomCode) {
      return roomPassphrases.get(roomCode);
    },
    setPassphrase(roomCode, passphrase) {
      roomPassphrases.set(roomCode, passphrase);
    },
    deletePassphrase(roomCode) {
      roomPassphrases.delete(roomCode);
    },
    releaseRoom(roomCode) {
      roomPassphrases.delete(roomCode);
      for (const [token, info] of resumeTokens) {
        if (info.roomCode === roomCode) resumeTokens.delete(token);
      }
    },
  };
}
