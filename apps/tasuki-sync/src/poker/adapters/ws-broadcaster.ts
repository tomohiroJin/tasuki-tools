/**
 * Broadcaster の実装。接続レジストリ（roomId → participantId → **ソケットの集合**）を
 * 内側に持つ。
 *
 * 受信者別スナップショットの共有部分は 1 回だけ構築する（research R1）。
 *
 * ## #95 S4b: 1 人が複数のソケットを持てる
 *
 * S4a までは `participantId → socket` の 1 対 1 で、同じ参加者が 2 つ目のタブから
 * 繋ぐと**後から繋いだソケットが前のソケットを置き換えていた**。配信の宛先はこの
 * レジストリなので、**前のタブは以後 1 通も受け取らない**（画面が黙って古くなる）。
 * D14 が多接続模型を要求した理由の実体がここである。
 *
 * 1 対多にした帰結として `detach` の意味も変わった —— S4a の「登録が同一のときだけ
 * 外す（別ソケットに入れ替わっていたら何もしない）」という防御は、集合から
 * **そのソケットだけ**を外す形になったので要らなくなった（古いソケットの close が
 * 新しい接続を蹴り出すことは構造的に起こらない）。
 */
// Round / ParticipantFragment / ServerMessage の型は Broadcaster の戻り値型から文脈的に付くため、
// ここでは import しない（import すると @typescript-eslint/no-unused-vars に掛かる）。
import { createSnapshotBuilder } from '@tasuki/poker-core';
import type { Broadcaster, RoomSocket } from '../ports/broadcaster';

export function createWsBroadcaster(): Broadcaster {
  const byRoom = new Map<string, Map<string, Set<RoomSocket>>>();

  return {
    attach(roomId, participantId, socket) {
      const sockets = byRoom.get(roomId) ?? new Map<string, Set<RoomSocket>>();
      const forParticipant = sockets.get(participantId) ?? new Set<RoomSocket>();
      forParticipant.add(socket);
      sockets.set(participantId, forParticipant);
      byRoom.set(roomId, sockets);
    },

    detach(roomId, participantId, socket) {
      const sockets = byRoom.get(roomId);
      if (!sockets) return false;
      const forParticipant = sockets.get(participantId);
      // **そのソケットが登録されていたときだけ外す。** 他のタブのソケットは残す。
      if (!forParticipant?.delete(socket)) return false;
      if (forParticipant.size === 0) sockets.delete(participantId);
      if (sockets.size === 0) byRoom.delete(roomId);
      return true;
    },

    // 空の集合を置き直すのと同じ。attach が新しい Map を作る
    resetRoom: (roomId) => void byRoom.delete(roomId),

    broadcastSnapshot(roomId, round, participants) {
      const sockets = byRoom.get(roomId);
      if (!sockets) return;
      const snapshotOf = createSnapshotBuilder(roomId, round, participants);
      for (const [participantId, forParticipant] of sockets) {
        // 受信者別スナップショットは**参加者ごとに 1 回だけ**組む。同じ人の
        // 2 つのタブは同じものを見るので、ソケットごとに組み直す意味は無い。
        const json = JSON.stringify(snapshotOf(participantId));
        for (const socket of forParticipant) socket.send(json);
      }
    },

    sendTo: (socket, msg) => socket.send(JSON.stringify(msg)),
  };
}
