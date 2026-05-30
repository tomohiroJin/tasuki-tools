/**
 * プレゼンス管理
 * T049: FR-014, FR-018, FR-020
 * 状態変化時のみ配信（生存確認では間引く）
 */

import type { Room, Participant } from "@tdd-mob/core";
import type { RoomStore } from "../ports/room-store.js";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { Clock } from "../ports/clock.js";

/** ホスト不在の猶予時間（デフォルト30秒）*/
export const HOST_ABSENCE_GRACE_MS = 30 * 1000;

export class PresenceManager {
  private readonly store: RoomStore;
  private readonly broadcaster: Broadcaster;
  private readonly clock: Clock;
  /** ホスト不在タイマー: roomCode → timerHandle */
  private readonly hostAbsenceTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(deps: { store: RoomStore; broadcaster: Broadcaster; clock: Clock }) {
    this.store = deps.store;
    this.broadcaster = deps.broadcaster;
    this.clock = deps.clock;
  }

  /**
   * ping を受け取り、プレゼンスが変わった場合のみ snapshot 配信
   */
  handlePing(connId: string): void {
    const room = this.findRoomByConnId(connId);
    if (!room) return;

    const participant = room.participants.find((p) => p.connId === connId);
    if (!participant) return;

    if (participant.presence !== "online") {
      const updated = this.updatePresence(room, connId, "online");
      this.store.put(updated);
      this.broadcaster.broadcastSnapshot(room.code, updated);
    }
  }

  /**
   * 接続切断時にプレゼンスを offline に更新し、ホスト委譲判定
   */
  handleDisconnect(connId: string): void {
    const room = this.findRoomByConnId(connId);
    if (!room) return;

    const participant = room.participants.find((p) => p.connId === connId);
    if (!participant) return;

    const updated = this.updatePresence(room, connId, "offline");
    this.store.put(updated);
    this.broadcaster.broadcastSnapshot(room.code, updated);

    // ホストが切断した場合、猶予後に委譲（FR-018）
    if (participant.role === "host") {
      this.scheduleHostAbsence(room.code);
    }
  }

  /**
   * ホスト不在猶予後に最古のオンライン編集者へ主催者権限を委譲（FR-018）
   */
  private scheduleHostAbsence(roomCode: string): void {
    this.clearHostAbsenceTimer(roomCode);

    const timer = setTimeout(() => {
      this.hostAbsenceTimers.delete(roomCode);
      const room = this.store.get(roomCode);
      if (!room) return;

      // ホストが再接続していれば何もしない
      const host = room.participants.find(
        (p) => p.participantId === room.hostParticipantId,
      );
      if (host?.presence === "online") return;

      // 最古のオンライン編集者を探す
      const newHost = room.participants
        .filter((p) => p.role === "editor" && p.presence === "online")
        .sort((a, b) => a.joinedAt - b.joinedAt)[0];

      if (!newHost) return;

      const updatedRoom: Room = {
        ...room,
        hostParticipantId: newHost.participantId,
        participants: room.participants.map((p) =>
          p.participantId === newHost.participantId
            ? { ...p, role: "host" }
            : p.participantId === room.hostParticipantId
              ? { ...p, role: "editor" }
              : p,
        ),
      };

      this.store.put(updatedRoom);
      this.broadcaster.broadcastSnapshot(roomCode, updatedRoom);
    }, HOST_ABSENCE_GRACE_MS);

    this.hostAbsenceTimers.set(roomCode, timer);
  }

  private clearHostAbsenceTimer(roomCode: string): void {
    const timer = this.hostAbsenceTimers.get(roomCode);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.hostAbsenceTimers.delete(roomCode);
    }
  }

  private updatePresence(
    room: Room,
    connId: string,
    presence: Participant["presence"],
  ): Room {
    return {
      ...room,
      participants: room.participants.map((p) =>
        p.connId === connId ? { ...p, presence } : p,
      ),
    };
  }

  private findRoomByConnId(connId: string): Room | undefined {
    return this.store.list().find((r) =>
      r.participants.some((p) => p.connId === connId),
    );
  }
}
