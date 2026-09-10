/**
 * プレゼンス管理
 * T049: FR-014, FR-020
 * 状態変化時のみ配信（生存確認では間引く）
 *
 * #95 S3 でホストの概念が消えたため、ホスト不在の猶予後自動委譲（旧 FR-018）は
 * 撤去した。ここに残る不在タイマーはドライバー不在の繰り上げ（R2-1）だけで、
 * これは役割ではなくローテーションの話である。
 *
 * **在席は名簿（`@tasuki/room-core`）が持つ**（#95 S4a）。ドライバーが誰かは
 * ローテーション（timer の状態）にしか無いので、この 2 つを突き合わせる。
 *
 * ⚠ 切断時に `detachConnection`（room-core）は**使わない**。あちらは `connId` も
 * `null` にするが、S4a 以前の挙動は presence だけを `offline` にして `connId` を
 * 残していた。同一性と在席の模型を作り直すのは S4b（D12・D14）の仕事なので、
 * ここでは挙動を変えない。
 */

import { attachConnection, type Participant, type Room } from "@tasuki/room-core";
import { rotationEntryId } from "@tasuki/timer-core";
import type { RoomStore } from "../ports/room-store.js";
import type { TimerStore } from "../ports/timer-store.js";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { Clock } from "../ports/clock.js";
import { buildTimerSnapshotRoom } from "./timer-snapshot-dto.js";

/** ドライバー不在の猶予時間（デフォルト30秒）。猶予後に次の eligible へ繰り上げる（R2-1）。*/
export const DRIVER_ABSENCE_GRACE_MS = 30 * 1000;

export class PresenceManager {
  private readonly store: RoomStore;
  private readonly timers: TimerStore;
  private readonly broadcaster: Broadcaster;
  private readonly clock: Clock;
  /** ドライバー不在発火時に呼ぶコールバック（任意。create-sync-server.ts で handlers.advanceForAbsence に配線）。 */
  private readonly onDriverAbsence?: ((roomCode: string) => void) | undefined;
  /** ドライバー不在タイマー: roomCode → timerHandle */
  private readonly driverAbsenceTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(deps: {
    store: RoomStore;
    timers: TimerStore;
    broadcaster: Broadcaster;
    clock: Clock;
    onDriverAbsence?: ((roomCode: string) => void) | undefined;
  }) {
    this.store = deps.store;
    this.timers = deps.timers;
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
    const timer = this.timers.get(room.code);
    if (!timer) return;

    const participant = room.participants.find((p) => p.connId === connId);
    if (!participant) return;

    if (participant.presence !== "online") {
      const updated = attachConnection(room, participant.id, connId);
      this.store.put(updated);
      this.broadcaster.broadcastSnapshot(room.code, buildTimerSnapshotRoom(updated, timer));

      // 現ドライバーが復帰したら不在タイマーを解除（stale-check でも守られるが明示）。
      // rotation は席の配列（#95 S4a）なので、席の識別子で突き合わせる。
      const current = timer.session.rotation[timer.session.currentIndex];
      if (current !== undefined && participant.id === rotationEntryId(current)) {
        this.clearDriverAbsenceTimer(room.code);
      }
    }
  }

  /**
   * 接続切断時にプレゼンスを offline に更新し、ドライバー不在の繰り上げを判定する
   */
  handleDisconnect(connId: string): void {
    const room = this.findRoomByConnId(connId);
    if (!room) return;
    const timer = this.timers.get(room.code);
    if (!timer) return;

    const participant = room.participants.find((p) => p.connId === connId);
    if (!participant) return;

    const updated = this.updatePresence(room, connId, "offline");
    this.store.put(updated);
    this.broadcaster.broadcastSnapshot(room.code, buildTimerSnapshotRoom(updated, timer));

    // 現ドライバーが切断し、かつセッション稼働中なら猶予後に次へ繰り上げる（R2-1）。
    const current = timer.session.rotation[timer.session.currentIndex];
    const isCurrentDriver =
      current !== undefined && rotationEntryId(current) === participant.id;
    if (timer.clock.running && isCurrentDriver) {
      this.scheduleDriverAbsence(updated.code, participant.id);
    }
  }

  /**
   * ドライバー不在猶予後に次の eligible ドライバーへ繰り上げる（R2-1）。
   * 発火時に stale-check（現ドライバーが依然同一人物・offline・稼働中）を行い、
   * 既に交代/復帰済みなら何もしない（古いタイマーの誤発火を防ぐ）。
   * 同名の別人を取り違えないよう、突き合わせは参加者IDで行う（D6b）。
   */
  private scheduleDriverAbsence(roomCode: string, driverParticipantId: string): void {
    this.clearDriverAbsenceTimer(roomCode);
    const handle = setTimeout(() => {
      this.driverAbsenceTimers.delete(roomCode);
      const room = this.store.get(roomCode);
      const state = this.timers.get(roomCode);
      if (!room || !state || !state.clock.running) return;
      const current = state.session.rotation[state.session.currentIndex];
      if (current === undefined || rotationEntryId(current) !== driverParticipantId) return;
      const driver = room.participants.find((p) => p.id === driverParticipantId);
      if (driver?.presence !== "offline") return;
      this.onDriverAbsence?.(roomCode);
    }, DRIVER_ABSENCE_GRACE_MS);
    this.driverAbsenceTimers.set(roomCode, handle);
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
    this.clearDriverAbsenceTimer(roomCode);
  }

  /** シャットダウン時に全ルームのプレゼンス関連タイマーを解放する（Scheduler.clearAll と対）。 */
  clearAllTimers(): void {
    for (const roomCode of [...this.driverAbsenceTimers.keys()]) {
      this.clearDriverAbsenceTimer(roomCode);
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
