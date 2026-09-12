/**
 * トークン保持（リジュームトークン・ルームパスフレーズ）。
 *
 * **#95 S4a で poker の復帰トークンもここへ寄った。** それまでは poker の
 * `Participant.token` としてルームの中に住んでおり、`findParticipantByToken` が
 * ルーム内を線形探索していた。名簿が `@tasuki/room-core` へ移って `token` を
 * 持たなくなったため、発行と照会はこの 1 箇所になった（パスフレーズは timer だけが使う）。
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

import type { RoomCode } from "@tasuki/room-core";

/**
 * リジュームトークンが指す再接続先（参加者ID・ルームコード）。
 *
 * **復帰は 2 段で判定する。`roomCode` の突き合わせだけに頼ってはならない。**
 * 両方の入口（timer の `command-handlers/room-join.ts`、poker の
 * `application/poker-handlers.ts`）が
 * `tokenData.roomCode === 要求されたコード` → `findParticipant(room, participantId)`
 * の順で書かれている。
 *
 * **いま実際に越境を止めているのは後段（名簿の照合）である。** 参加者 ID は全ルームを
 * 通じて一意（poker は `crypto.randomUUID()`、timer は `p_${nanoid(16)}`）なので、
 * 別ルームのトークンは後段で必ず外れて新規参加に落ちる。前段の `roomCode` 照合は
 * **現状では到達しない分岐**であり、外しても全テストが緑のままである（2026-09-10 実測）。
 *
 * それでも前段を置くのは、**ID 生成が変わって同じ ID が 2 つのルームに現れうる形に
 * なったとき**の唯一の防波堤になるからである。逆に言えば、**後段を「冗長だ」として
 * 外すと、その瞬間に越境が成立する。** 消してよいのはどちらでもない。
 *
 * 旧 poker の `findParticipantByToken(room, token)` はルーム内を線形探索していたので、
 * 「トークンが指すルームが要求されたルームと同じか」は署名の側で済んでいた。
 * S4a で保管が全ルーム共通の 1 個の Map になり、その保証が署名から消えたぶんを
 * 上の 2 段が担っている。
 */
export interface ResumeTokenData {
  participantId: string;
  roomCode: RoomCode;
}

export interface TokenStore {
  /** リジュームトークンを発行する（room.create/room.join の双方から呼ばれる）。 */
  issueResume(resumeToken: string, data: ResumeTokenData): void;
  /** リジュームトークンから再接続先を引く。無ければ `undefined`。 */
  getResume(resumeToken: string): ResumeTokenData | undefined;
  /**
   * 発行済みのリジュームトークンを再接続先から逆引きする。無ければ `undefined`。
   *
   * poker の「同じ接続からの join-room 再送」（#171 の冪等分岐）だけが使う。あの分岐は
   * `joined` を返し直すので token を添える必要があるが、**発行し直してはいけない** ——
   * 画面が localStorage に持っている token が再送のたびに黙って古くなる
   * （`test/poker/rejoin.test.ts` の「再送しても同一参加者のまま」が同一性を見ている）。
   * S4a 以前は token が名簿の中（`Participant.token`）にあり、逆引きは要らなかった。
   */
  findResumeToken(roomCode: string, participantId: string): string | undefined;
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
    findResumeToken(roomCode, participantId) {
      for (const [token, info] of resumeTokens) {
        if (info.roomCode === roomCode && info.participantId === participantId) return token;
      }
      return undefined;
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
