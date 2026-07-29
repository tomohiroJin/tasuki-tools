/**
 * aRoomView() — apps/web のテスト共有 Room ビルダー（新設6・G2-c）
 *
 * apps/web の「Given」は「どの Room を、どのコンポーネントに渡して render するか」に尽きる。
 * これまで各テストが Room（snapshot の形）を丸ごと手で組み立てていたため Given が長くなっていた。
 * aRoomView(overrides) は既定値の Room を返し、渡した項目だけを上書きする。
 * 上書き分だけがテストに残るので「そのテストが何を前提にしているか」が差分として読める（FR-091）。
 *
 * 既定値は App.tsx（handleCreateRoom）が room.create で実際に送る config に合わせる
 * （language: "TypeScript" / difficulty: "easy" / intervalMinutes: 7）。
 * テスト専用の都合のよい既定値を作ると、テストが通っても実画面で動かない状態を招くため避ける。
 *
 * @requirements FR-096, FR-097, FR-118, US2
 */

import type { Participant, Room, ServerClock, SessionConfig, SessionState } from "@tdd-mob/core";

const HOST_ID = "host-p";

function defaultConfig(): SessionConfig {
  // App.tsx handleCreateRoom の既定値（displayName は members[0] に入るが、
  // ここでは既定の host 名 "Host" を使う。intervalMinutes: 7 が実際の既定）。
  return { language: "TypeScript", difficulty: "easy", members: ["Host"], intervalMinutes: 7 };
}

function defaultSession(): SessionState {
  return { rotation: [HOST_ID], currentIndex: 0, isPaused: false, driverCounts: [0], totalSwitches: 0 };
}

function defaultClock(intervalMinutes: number): ServerClock {
  return {
    running: false,
    intervalSeconds: intervalMinutes * 60,
    anchorServerTime: 0,
    secondsLeftAtAnchor: intervalMinutes * 60,
    accumulatedElapsedMs: 0,
    runningSince: null,
  };
}

function defaultParticipants(): Participant[] {
  return [
    {
      participantId: HOST_ID,
      connId: "host-c",
      displayName: "Host",
      role: "host",
      presence: "online",
      hasAiKey: false,
      joinedAt: 0,
    },
  ];
}

/** aRoomView() の overrides。config / session / clock はネストの部分上書きを許す。 */
export type RoomViewOverrides = Partial<Omit<Room, "config" | "session" | "clock">> & {
  config?: Partial<SessionConfig>;
  session?: Partial<SessionState>;
  clock?: Partial<ServerClock>;
};

/**
 * 既定値の Room を返す。overrides で渡した項目だけが変わり、他は既定のまま。
 * config / session / clock はネストしたオブジェクトなので、渡した項目だけをマージする
 * （丸ごと差し替えたい場合は participants のように配列やトップレベルの他フィールドで行う）。
 */
export function aRoomView(overrides: RoomViewOverrides = {}): Room {
  const config = { ...defaultConfig(), ...(overrides.config ?? {}) };
  const session = { ...defaultSession(), ...(overrides.session ?? {}) };
  const clock = { ...defaultClock(config.intervalMinutes), ...(overrides.clock ?? {}) };

  const base: Room = {
    code: "TEST01",
    createdAt: 0,
    hostParticipantId: HOST_ID,
    config,
    problem: null,
    session,
    clock,
    phase: "setup",
    participants: defaultParticipants(),
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
  };

  return { ...base, ...overrides, config, session, clock };
}
