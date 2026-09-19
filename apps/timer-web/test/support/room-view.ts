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

import type { Participant, Room, Seat, ServerClock, SessionConfig } from "@tasuki/timer-core";

// SessionState は T057 で自ファイル内専用の内部型として export を外した（FR-119③・SC-039）。
// 公開されている Room 型から同じ形を導出する（インデックスアクセス型）。verification 内容は変えない。
type SessionState = Room["session"];

const CREATOR_ID = "creator-p";

function defaultConfig(): SessionConfig {
  // App.tsx handleCreateRoom の既定値（displayName は members[0] に入るが、
  // ここでは既定の作成者名 "Creator" を使う。intervalMinutes: 7 が実際の既定）。
  return { language: "TypeScript", difficulty: "easy", members: ["Creator"], intervalMinutes: 7 };
}

function defaultSession(): SessionState {
  return {
    rotation: [CREATOR_ID],
    currentIndex: 0,
    isPaused: false,
    driverCounts: [0],
    totalSwitches: 0,
    seats: [{ id: CREATOR_ID, displayName: "Creator", isProxy: false, skipReason: null }],
    nextIndex: 0,
  };
}

/**
 * 席と「次の番」は輪から導く（#276）。
 *
 * 固定値を置くと、`session: { rotation: [...] }` だけを上書きしたテストで
 * 席と輪の長さが食い違う造作ができる。型検査はそれを拾わないので、
 * **黙って嘘の前提を持つテスト**になる。サーバーは常に輪と同じ順・同じ長さで
 * 送るので、造作もそう振る舞わせる。
 *
 * 表示名は `config.members`（輪と同じ順の表示名）から引く。理由を持つ席を作りたい
 * テストは `session.seats` を丸ごと渡して上書きすること。
 */
function seatsFrom(rotation: readonly string[], memberNames: readonly string[]): Seat[] {
  return rotation.map((id, i) => ({
    id,
    displayName: memberNames[i] ?? "",
    isProxy: false,
    skipReason: null,
  }));
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
      participantId: CREATOR_ID,
      displayName: "Creator",
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
  // 席と次の番は、上書き後の輪から導く（明示的に渡されていれば、それを尊重する）。
  const seats = overrides.session?.seats ?? seatsFrom(session.rotation, config.members);
  // ⚠ ここでの `(currentIndex + 1) % len` は造作の都合であって、製品の規則ではない。
  // 製品側でこの式を使ってよい場所は 1 つも無い（それが #276 の主題である）。
  const nextIndex =
    overrides.session?.nextIndex !== undefined
      ? overrides.session.nextIndex
      : session.rotation.length > 0
        ? (session.currentIndex + 1) % session.rotation.length
        : null;
  const merged = { ...session, seats, nextIndex };
  const clock = { ...defaultClock(config.intervalMinutes), ...(overrides.clock ?? {}) };

  const base: Room = {
    code: "TEST01",
    createdAt: 0,
    config,
    problem: null,
    session: merged,
    clock,
    phase: "setup",
    participants: defaultParticipants(),
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
  };

  return { ...base, ...overrides, config, session: merged, clock };
}
