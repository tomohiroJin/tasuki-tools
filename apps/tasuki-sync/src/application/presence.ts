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
 * ## #95 S4b: 接続の着脱そのものを扱う層になった
 *
 * S4a までは参加者が `connId` と `presence` の 2 欄を持ち、切断時は **presence だけを
 * `offline` にして `connId` を残す**という扱いだった。S4b で参加者は接続の集まりだけを
 * 持ち、presence はそこから導出される（D14）。したがってこの層の仕事は
 *
 *   - 切断: **その接続を名簿から外す**（`removeConnection`）。他の接続が残っていれば
 *     その人は `online` のままである（R17）
 *   - ping: **何も更新しない。** 生きた接続から届いた ping は「その接続が登録済み」
 *     という既知の事実しか運ばないので、presence は変わらない。残る仕事は
 *     ドライバー不在タイマーの解除だけである
 *
 * **ドライバー不在の判定は `presence` ではなく timer の在席で行う**（D21）。
 * ハブや poker のタブが生きていてもタイマーの前には誰も居ないので、
 * `presence === "online"` で繰り上げを止めると、走っているタイマーのドライバーが
 * 永久に交代しない。
 */

import {
  findParticipant,
  findParticipantByConnId,
  isPresentIn,
  presenceOf,
  removeConnection,
  type Room,
} from "@tasuki/room-core";
import { rotationEntryId } from "@tasuki/timer-core";
import type { RoomStore } from "../ports/room-store.js";
import type { TimerStore } from "../ports/timer-store.js";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { Clock } from "../ports/clock.js";
import { buildTimerSnapshotRoom } from "./timer-snapshot-dto.js";
import { TOOL_TIMER } from "./tool-id.js";

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
   * ping を受け取る。
   *
   * **名簿は書き換えない**（#95 S4b）。presence は接続の集まりからの導出なので、
   * 生きた接続からの ping で変わるものが無い。**現ドライバーが戻っていれば
   * 不在タイマーを解除する**のがこのメソッドの唯一の仕事である
   * （発火時の stale-check でも守られるが、待機中のタイマーを畳んでおく）。
   */
  handlePing(connId: string): void {
    const room = this.findRoomByConnId(connId);
    if (!room) return;
    const timer = this.timers.get(room.code);
    if (!timer) return;

    const participant = findParticipantByConnId(room, connId);
    if (!participant) return;

    // rotation は席の配列（#95 S4a）なので、席の識別子で突き合わせる。
    const current = timer.session.rotation[timer.session.currentIndex];
    if (current !== undefined && rotationEntryId(current) === participant.id) {
      this.clearDriverAbsenceTimer(room.code);
    }
  }

  /**
   * 接続が閉じたときに、その接続を名簿から外し、ドライバー不在の繰り上げを判定する。
   *
   * **接続の解放を timer の状態の有無に依存させない。** 先に外してから timer を引く ——
   * 逆順にすると、timer の状態が無いルーム（起こらないはずだが）で接続が名簿へ
   * 残り続ける。
   */
  handleDisconnect(connId: string): void {
    const room = this.findRoomByConnId(connId);
    if (!room) return;
    const participant = findParticipantByConnId(room, connId);
    if (!participant) return;

    const updated = removeConnection(room, connId);
    this.store.put(updated);

    const after = findParticipant(updated, participant.id);
    const timer = this.timers.get(room.code);
    if (!timer) return;

    // **状態が変わったときだけ配信する**（このファイル冒頭の方針）。他のタブが
    // 生きていればその人は `online` のままで、wire に載る値は 1 つも変わらない。
    if (after !== undefined && presenceOf(participant) !== presenceOf(after)) {
      this.broadcaster.broadcastSnapshot(room.code, buildTimerSnapshotRoom(updated, timer));
    }

    // 現ドライバーが**タイマーの前から居なくなり**、かつセッション稼働中なら猶予後に
    // 次へ繰り上げる（R2-1・D21）。ハブや poker のタブが残っていても、timer に
    // 在席していなければ「居ない」である。
    const current = timer.session.rotation[timer.session.currentIndex];
    const isCurrentDriver =
      current !== undefined && rotationEntryId(current) === participant.id;
    const stillWatchingTimer = after !== undefined && isPresentIn(after, TOOL_TIMER);
    if (timer.clock.running && isCurrentDriver && !stillWatchingTimer) {
      this.scheduleDriverAbsence(updated.code, participant.id);
    }
  }

  /**
   * ドライバー不在猶予後に次の eligible ドライバーへ繰り上げる（R2-1）。
   * 発火時に stale-check（現ドライバーが依然同一人物・timer に不在・稼働中）を行い、
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
      const driver = findParticipant(room, driverParticipantId);
      // **戻ってきた判定も timer の在席で行う**（D21）。ここを presence で見ると、
      // 選択画面のタブだけを開いた人がドライバーのまま居座れる。
      if (driver === undefined || isPresentIn(driver, TOOL_TIMER)) return;
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

  private findRoomByConnId(connId: string): Room | undefined {
    return this.store.list().find((r) => findParticipantByConnId(r, connId) !== undefined);
  }
}
