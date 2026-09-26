/**
 * aRoomView() — apps/web のテスト共有 Room ビルダー（新設6・G2-c）
 *
 * apps/web の「Given」は「どの Room を、どのコンポーネントに渡して render するか」に尽きる。
 * これまで各テストが Room（snapshot の形）を丸ごと手で組み立てていたため Given が長くなっていた。
 * aRoomView(overrides) は既定値の Room を返し、渡した項目だけを上書きする。
 * 上書き分だけがテストに残るので「そのテストが何を前提にしているか」が差分として読める（FR-091）。
 *
 * 既定値は App.tsx（handleCreateRoom）が room.create で実際に送る config に合わせる
 * （intervalMinutes: 7。言語・難易度は #91 PR 3 で設定から消えた）。
 * テスト専用の都合のよい既定値を作ると、テストが通っても実画面で動かない状態を招くため避ける。
 *
 * @requirements FR-096, FR-097, FR-118, US2
 */

import type { CompletionRecord, Participant, Room, Seat, ServerClock, SessionConfig } from "@tasuki/timer-core";

// SessionState は T057 で自ファイル内専用の内部型として export を外した（FR-119③・SC-039）。
// 公開されている Room 型から同じ形を導出する（インデックスアクセス型）。verification 内容は変えない。
type SessionState = Room["session"];

const CREATOR_ID = "creator-p";

function defaultConfig(): SessionConfig {
  // App.tsx handleCreateRoom の既定値（intervalMinutes: 7 が実際の既定）。
  return { intervalMinutes: 7 };
}

/** 既定の席の表示名（既定の輪は作成者 1 人）。 */
const DEFAULT_MEMBER_NAMES = ["Creator"];

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
 * 表示名は `memberNames`（輪と同じ順の表示名）から引く。**wire の項目ではない** ——
 * `config.members` は #294 で落ちたので、これはこの造作だけが持つ入口である。
 * 理由（`skipReason`）や代理を持つ席を作りたいテストは、`session.seats` を丸ごと
 * 渡して上書きすること。
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
      joinedAt: 0,
    },
  ];
}

/**
 * サーバーが作った完成記録のうち、**名簿から引けない席が空文字で載ったもの**。
 *
 * `config.members` が wire から落ちた（#294）後も、ローテーション順の表示名は
 * サーバー側の完成記録（`apply-room-level-event.ts` の `SessionCompleted`）を通って
 * wire へ出る。`CompletionRecordSchema.members` の要素は最小長 1 なので、
 * **空文字が 1 つ載ると snapshot 全体が契約検査に落ちる**（`docs/adr/0005` が
 * 挙げた経路は、いまはここである）。契約違反の再現にはこの形を使う。
 */
export function aRecordWithUnresolvableName(): Record<string, unknown> {
  return {
    id: "rec-1",
    topicTitle: "FizzBuzz",
    elapsedSeconds: 300,
    members: [""],
    totalSwitches: 2,
    completedAt: 1_000_000,
  };
}

/**
 * サーバーが作った完成記録（#91 PR 3 の形）。渡した項目だけが変わる。
 *
 * 端末は記録を組み立てず、snapshot の `sessionRecords` に増えた 1 件をそのまま保存する
 * （`src/sync/snapshot-intents.ts`）。その「増えた 1 件」を作るための造作である。
 */
export function aRecord(overrides: Partial<CompletionRecord> = {}): CompletionRecord {
  return {
    id: "rec-1",
    roomId: "TEST01",
    topicTitle: "FizzBuzz",
    elapsedSeconds: 300,
    members: ["Creator"],
    totalSwitches: 2,
    completedAt: 1_000_000,
    driverCounts: [2],
    rounds: 2,
    ...overrides,
  };
}

/** aRoomView() の overrides。config / session / clock はネストの部分上書きを許す。 */
export type RoomViewOverrides = Partial<Omit<Room, "config" | "session" | "clock">> & {
  config?: Partial<SessionConfig>;
  session?: Partial<SessionState>;
  clock?: Partial<ServerClock>;
  /** 席に付ける表示名（輪と同じ順）。造作だけの入口で、wire には出ない（#294）。 */
  memberNames?: readonly string[];
};

/**
 * 既定値の Room を返す。overrides で渡した項目だけが変わり、他は既定のまま。
 * config / session / clock はネストしたオブジェクトなので、渡した項目だけをマージする
 * （丸ごと差し替えたい場合は participants のように配列やトップレベルの他フィールドで行う）。
 */
export function aRoomView(overrides: RoomViewOverrides = {}): Room {
  // `memberNames` は造作だけの入口なので、返す Room へ混ぜない（#294）。
  // スプレッドの余剰プロパティは型検査が拾わないため、ここで明示的に外す。
  const { memberNames, ...roomOverrides } = overrides;
  const config = { ...defaultConfig(), ...(overrides.config ?? {}) };
  const session = { ...defaultSession(), ...(overrides.session ?? {}) };
  // 席と次の番は、上書き後の輪から導く（明示的に渡されていれば、それを尊重する）。
  const seats =
    overrides.session?.seats ?? seatsFrom(session.rotation, memberNames ?? DEFAULT_MEMBER_NAMES);
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
    session: merged,
    clock,
    phase: "setup",
    participants: defaultParticipants(),
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
  };

  return { ...base, ...roomOverrides, config, session: merged, clock };
}
