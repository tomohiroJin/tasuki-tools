/**
 * roomViewOf() — 名簿と timer の状態から wire の `Room` を組むテストヘルパ（#95 S4a）。
 *
 * S4a で保管が 2 つ（名簿 / timer の状態）に割れたため、**テストの観測点を利用者が
 * 見るもの（snapshot の形）へ揃える**ためのヘルパである。`store.get(code)` が返すのは
 * 名簿だけになったので、S4a 以前と同じ形を見たいテストはここを通す。
 *
 * 片方でも欠けていたら throw する。前提の失敗（ルームが作られていない）と、
 * テスト対象の検証の失敗（`expect`）を区別するためである（FR-096）。
 */

import type { Room } from "@tasuki/timer-core";
import type { RoomStore } from "../../src/ports/room-store.js";
import type { TimerStore } from "../../src/ports/timer-store.js";
import { buildTimerSnapshotRoom } from "../../src/application/timer-snapshot-dto.js";

export function roomViewOf(store: RoomStore, timers: TimerStore, code: string): Room {
  const membership = store.get(code);
  const timer = timers.get(code);
  if (!membership || !timer) {
    throw new Error(
      `roomViewOf(): ルーム ${code} が揃っていない（名簿=${Boolean(membership)} / timer=${Boolean(timer)}）`,
    );
  }
  return buildTimerSnapshotRoom(membership, timer);
}

/** 揃っていなければ undefined を返す版（破棄されたことを確かめるテスト用）。 */
export function maybeRoomViewOf(
  store: RoomStore,
  timers: TimerStore,
  code: string,
): Room | undefined {
  const membership = store.get(code);
  const timer = timers.get(code);
  return membership && timer ? buildTimerSnapshotRoom(membership, timer) : undefined;
}

/**
 * wire の形で書いた前提を、名簿と timer の状態へ**分解して**保管する（#95 S4a）。
 *
 * S4a 以前のテストは `store.put({ ...room, session: … })` のように「利用者が見る形」で
 * 前提を組んでいた。保管が 2 つに割れてもその書き方を保てるように、ここで逆写像を行う。
 * `buildTimerSnapshotRoom` の逆であり、**往復して同じ形に戻ることが前提**である
 * （代理は `isPlaceholder` から、適格は `driverEligible` から、AI 鍵は `hasAiKey` から復元する）。
 */
export function putRoomView(store: RoomStore, timers: TimerStore, room: Room): void {
  const byId = new Map(room.participants.map((p) => [p.participantId, p]));
  store.put({
    code: room.code,
    createdAt: room.createdAt,
    // 代理は名簿に居ない（輪の上の席としてだけ存在する）。
    participants: room.participants
      .filter((p) => p.isPlaceholder !== true)
      .map((p) => ({
        id: p.participantId,
        displayName: p.displayName,
        connId: p.connId,
        presence: p.presence,
        joinedAt: p.joinedAt,
      })),
  });
  const { members: _members, ...config } = room.config;
  timers.put({
    code: room.code,
    createdAt: room.createdAt,
    config,
    problem: room.problem,
    session: {
      ...room.session,
      rotation: room.session.rotation.map((id) => {
        const p = byId.get(id);
        const eligible = p?.driverEligible !== false;
        return p?.isPlaceholder === true
          ? { kind: "proxy" as const, id, label: p.displayName, eligible }
          : { kind: "member" as const, participantId: id, eligible };
      }),
    },
    clock: room.clock,
    phase: room.phase,
    sessionRecords: room.sessionRecords,
    handoffNote: room.handoffNote,
    onBreak: room.onBreak,
    ...(room.problemMode !== undefined ? { problemMode: room.problemMode } : {}),
    ...(room.passphraseProtected !== undefined
      ? { passphraseProtected: room.passphraseProtected }
      : {}),
    ...(room.aiUnlocked !== undefined ? { aiUnlocked: room.aiUnlocked } : {}),
    aiKeyHolders: room.participants.filter((p) => p.hasAiKey).map((p) => p.participantId),
  });
}
