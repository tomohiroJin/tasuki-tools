/**
 * プレゼンス管理
 * T049: FR-014, FR-018, FR-020
 * 状態変化時のみ配信（生存確認では間引く）
 */

import { transferHost } from "@tasuki/timer-core";
import type { Room, Participant } from "@tasuki/timer-core";
import type { RoomStore } from "../ports/room-store.js";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { Clock } from "../ports/clock.js";

/** ホスト不在の猶予時間（デフォルト30秒）*/
export const HOST_ABSENCE_GRACE_MS = 30 * 1000;

/** ドライバー不在の猶予時間（デフォルト30秒）。猶予後に次の eligible へ繰り上げる（R2-1）。*/
export const DRIVER_ABSENCE_GRACE_MS = 30 * 1000;

export class PresenceManager {
  private readonly store: RoomStore;
  private readonly broadcaster: Broadcaster;
  private readonly clock: Clock;
  /** ドライバー不在発火時に呼ぶコールバック（任意。server.ts で handlers.advanceForAbsence に配線）。 */
  private readonly onDriverAbsence?: ((roomCode: string) => void) | undefined;
  /** ホスト不在タイマー: roomCode → timerHandle */
  private readonly hostAbsenceTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  /** ドライバー不在タイマー: roomCode → timerHandle */
  private readonly driverAbsenceTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(deps: {
    store: RoomStore;
    broadcaster: Broadcaster;
    clock: Clock;
    onDriverAbsence?: ((roomCode: string) => void) | undefined;
  }) {
    this.store = deps.store;
    this.broadcaster = deps.broadcaster;
    this.clock = deps.clock;
    this.onDriverAbsence = deps.onDriverAbsence;
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

      // 現ドライバーが復帰したら不在タイマーを解除（stale-check でも守られるが明示）。
      // rotation は参加者IDの配列（D6b）なので ID で突き合わせる。
      const curId = updated.session.rotation[updated.session.currentIndex];
      if (participant.participantId === curId) {
        this.clearDriverAbsenceTimer(room.code);
      }
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

    // 現ドライバーが切断し、かつセッション稼働中なら猶予後に次へ繰り上げる（R2-1）。
    const isCurrentDriver =
      updated.session.rotation[updated.session.currentIndex] === participant.participantId;
    if (updated.clock.running && isCurrentDriver) {
      this.scheduleDriverAbsence(updated.code, participant.participantId);
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

      // 二重実装の乖離を防ぐため core の純粋変換に統一（R2-4）。
      const updatedRoom = transferHost(room, newHost.participantId);

      this.store.put(updatedRoom);
      this.broadcaster.broadcastSnapshot(roomCode, updatedRoom);
    }, HOST_ABSENCE_GRACE_MS);

    this.hostAbsenceTimers.set(roomCode, timer);
  }

  /**
   * ドライバー不在猶予後に次の eligible ドライバーへ繰り上げる（R2-1）。
   * 発火時に stale-check（現ドライバーが依然同一人物・offline・稼働中）を行い、
   * 既に交代/復帰済みなら何もしない（古いタイマーの誤発火を防ぐ）。
   * 同名の別人を取り違えないよう、突き合わせは参加者IDで行う（D6b）。
   */
  private scheduleDriverAbsence(roomCode: string, driverParticipantId: string): void {
    this.clearDriverAbsenceTimer(roomCode);
    const timer = setTimeout(() => {
      this.driverAbsenceTimers.delete(roomCode);
      const room = this.store.get(roomCode);
      if (!room || !room.clock.running) return;
      const curId = room.session.rotation[room.session.currentIndex];
      if (curId !== driverParticipantId) return;
      const driver = room.participants.find((p) => p.participantId === driverParticipantId);
      if (driver?.presence !== "offline") return;
      this.onDriverAbsence?.(roomCode);
    }, DRIVER_ABSENCE_GRACE_MS);
    this.driverAbsenceTimers.set(roomCode, timer);
  }

  private clearDriverAbsenceTimer(roomCode: string): void {
    const timer = this.driverAbsenceTimers.get(roomCode);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.driverAbsenceTimers.delete(roomCode);
    }
  }

  /** ルーム回収時に、そのルームのプレゼンス関連タイマーを解放する。 */
  clearRoomTimers(roomCode: string): void {
    this.clearHostAbsenceTimer(roomCode);
    this.clearDriverAbsenceTimer(roomCode);
  }

  /** シャットダウン時に全ルームのプレゼンス関連タイマーを解放する（Scheduler.clearAll と対）。 */
  clearAllTimers(): void {
    for (const roomCode of [...this.hostAbsenceTimers.keys()]) {
      this.clearHostAbsenceTimer(roomCode);
    }
    for (const roomCode of [...this.driverAbsenceTimers.keys()]) {
      this.clearDriverAbsenceTimer(roomCode);
    }
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
