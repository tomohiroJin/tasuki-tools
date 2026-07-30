/**
 * トークン保持（ホストトークン・リジュームトークン・ルームパスフレーズ）。
 *
 * `handlers.ts` の `makeHandlers` が抱えていた3個の可変 `Map`
 * （`hostTokens` / `resumeTokens` / `roomPassphrases`）を、ロジックを変えずに
 * 1モジュールへ切り出したもの（フェーズ2・純粋な移動）。
 *
 * ルーム作成・参加・パスフレーズ設定の各ハンドラが発行・照会し、
 * `releaseRoom` でルーム単位に一括解放する（ルーム回収時の後始末）。
 */

import type { Room } from "@tdd-mob/core";

/** リジュームトークンが指す再接続先（参加者ID・ルームコード） */
export interface ResumeTokenData {
  participantId: string;
  roomCode: Room["code"];
}

export interface TokenStore {
  /** ホストトークンを発行する（roomCode → hostToken）。 */
  issueHost(roomCode: string, hostToken: string): void;
  /** ホストトークンが一致するか照合する（発行後は現状どのハンドラも呼ばないが、
   *  `resumeTokens` と対称な照会手段として用意しておく）。 */
  verifyHost(roomCode: string, hostToken: string): boolean;
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
  /** ルーム回収時の後始末。当該ルームのホスト/リジュームトークンとパスフレーズを解放する。 */
  releaseRoom(roomCode: string): void;
}

export function createTokenStore(): TokenStore {
  const hostTokens = new Map<string, string>();
  const roomPassphrases = new Map<string, string>();
  const resumeTokens = new Map<string, ResumeTokenData>();

  return {
    issueHost(roomCode, hostToken) {
      hostTokens.set(roomCode, hostToken);
    },
    verifyHost(roomCode, hostToken) {
      return hostTokens.get(roomCode) === hostToken;
    },
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
      hostTokens.delete(roomCode);
      roomPassphrases.delete(roomCode);
      for (const [token, info] of resumeTokens) {
        if (info.roomCode === roomCode) resumeTokens.delete(token);
      }
    },
  };
}
