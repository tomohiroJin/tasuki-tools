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

import {
  findParticipantByConnId,
  type ConnId,
  type Participant as MembershipParticipant,
  type ToolId,
} from "@tasuki/room-core";
import type { Participant, Room } from "@tasuki/timer-core";
import { TOOL_TIMER } from "../../src/application/tool-id.js";
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

/**
 * 接続 ID の持ち主の参加者 ID を、**名簿から**引く（#95 S4b）。
 *
 * wire から `connId` が消えたので、「この接続は誰か」は wire を見ても分からない。
 * 参加者が接続を複数持てるようになった以上、wire に 1 本だけ載せる形には戻せない
 * （`packages/timer-core/src/wire.ts` の注記）。**名簿が唯一の答えである。**
 *
 * 見つからなければ throw する（前提の失敗と検証の失敗を分ける・FR-096）。
 */
export function participantIdOfConn(store: RoomStore, connId: string): string {
  for (const room of store.list()) {
    const owner = findParticipantByConnId(room, connId);
    if (owner) return owner.id;
  }
  throw new Error(`participantIdOfConn(): 接続 ${connId} の持ち主が名簿に居ない`);
}

/** その接続が名簿のどこにも居ないこと（切断・退出の確認用）。 */
export function hasNoOwner(store: RoomStore, connId: string): boolean {
  return store.list().every((room) => findParticipantByConnId(room, connId) === undefined);
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
/**
 * wire の presence から接続の集まりを復元する（#95 S4b）。
 *
 * **presence は導出値なので、逆写像は接続を 1 本でっち上げることになる。**
 * `offline` は「接続が無い」、それ以外は「timer を見ている接続が 1 本ある」である。
 *
 * ⚠ **wire は `connId` を持たなくなった**ので、接続 ID の出どころは 3 段で決まる。
 *
 * 1. 呼び出し側が `connIds` で明示した値（**その接続からコマンドを送るテストはこれを使う**）
 * 2. 既に名簿に居る人なら、**その人がいま持っている接続をそのまま保つ**
 *    （`room.create` / `room.join` で入った本物の接続 ID を壊さないため。
 *    これが無いと、前提を書き直した瞬間に既存の接続が別の ID に化けて
 *    `NOT_IN_ROOM` になる）
 * 3. どちらも無ければ `conn-<参加者 ID>`
 */
function connectionsOf(
  p: Participant,
  existing: MembershipParticipant | undefined,
  override: readonly ConnId[] | undefined,
): MembershipParticipant["connections"] {
  const connections = new Map<ConnId, ToolId | null>();
  if (p.presence === "offline") return connections;
  if (override !== undefined) {
    for (const connId of override) connections.set(connId, TOOL_TIMER);
    return connections;
  }
  if (existing !== undefined && existing.connections.size > 0) {
    return new Map(existing.connections);
  }
  connections.set(`conn-${p.participantId}`, TOOL_TIMER);
  return connections;
}

export function putRoomView(
  store: RoomStore,
  timers: TimerStore,
  room: Room,
  /** 参加者 ID → その人に持たせる接続 ID（`connectionsOf` の 1 段目）。 */
  connIds: Readonly<Record<string, readonly ConnId[]>> = {},
): void {
  const byId = new Map(room.participants.map((p) => [p.participantId, p]));
  const before = store.get(room.code);
  store.put({
    code: room.code,
    createdAt: room.createdAt,
    // 代理は名簿に居ない（輪の上の席としてだけ存在する）。
    participants: room.participants
      .filter((p) => p.isPlaceholder !== true)
      .map((p) => ({
        id: p.participantId,
        displayName: p.displayName,
        connections: connectionsOf(
          p,
          before?.participants.find((m) => m.id === p.participantId),
          connIds[p.participantId],
        ),
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
