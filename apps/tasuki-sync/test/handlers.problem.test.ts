/**
 * problem.request / problem.submit ハンドラ統合テスト
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { makeTestHandlers } from "./support/room-builder.js";
import { ProblemDelegator, PROBLEM_DEADLINE_MS } from "../src/application/problem-delegation.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { SessionConfig, Problem } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { roomViewOf, putRoomView, maybeRoomViewOf } from "./support/room-view.js";
import { testLogger, testRefEncoder } from "./support/test-logger.js";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  intervalMinutes: 5,
};

const validProblem: Problem = {
  title: "FizzBuzz",
  description: "d",
  requirements: ["r"],
  exampleTest: "t",
  hints: [],
};

/**
 * @requirements FR-025, FR-027, US3
 */
describe("handlers: problem.request / problem.submit", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let delegator: ProblemDelegator;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;
  let creatorId: string;

  beforeEach(async () => {
    jest.useFakeTimers();
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    delegator = new ProblemDelegator({ store, timers, clock, broadcaster, logger: testLogger, refEncoder: testRefEncoder });
    handlers = makeTestHandlers({ store, timers, clock, broadcaster, codeGen: new FakeCodeGen(), delegator });

    // 作成者が AI 鍵ありでルーム作成（room.create は hasAiKey を持たないため後で更新）
    const create = await handlers.handleCommand("host-conn", {
      command: "room.create",
      displayName: "Alice",
      config,
    });
    if (!create.isOk()) throw new Error("create failed");
    // 本番（server.ts）は handleCommand の戻り値を破棄する。値は本番と同じ観測点から取る（FR-100）。
    code = broadcaster.createdFor("host-conn").code;
    creatorId = broadcaster.createdFor("host-conn").participantId;

    // 作成者に AI 鍵を付与
    const room = roomViewOf(store, timers, code);
    putRoomView(store, timers, {
      ...room,
      participants: room.participants.map((p) =>
        p.participantId === creatorId ? { ...p, hasAiKey: true } : p,
      ),
    });
  });

  afterEach(() => {
    delegator.cancelAll();
    jest.useRealTimers();
  });

  it("problem.request で先頭候補へ need-problem が送られる", async () => {
    // Given
    const command = { command: "problem.request", requestId: "req-1" } as const;

    // When
    await handlers.handleCommand("host-conn", command);

    // Then
    const needProblem = broadcaster.sent.find(
      (s) => s.msg.type === "signal" && s.msg.signal === "need-problem",
    );
    expect(needProblem?.connId).toBe("host-conn");
  });

  it("代表の problem.submit で Room.problem が確定する", async () => {
    // Given（先に problem.request で代表を確定させる）
    await handlers.handleCommand("host-conn", {
      command: "problem.request",
      requestId: "req-1",
    });
    const command = {
      command: "problem.submit",
      requestId: "req-1",
      problem: validProblem,
      usedFallback: false,
    } as const;

    // When
    await handlers.handleCommand("host-conn", command);

    // Then
    expect(maybeRoomViewOf(store, timers, code)?.problem?.title).toBe("FizzBuzz");
  });

  // #95 S3 以前は「見学者は problem.request を実行できない（UNAUTHORIZED）」ことを
  // ここで固定していた。役割の廃止で在室者なら誰でも要求できるようになったため、
  // 期待を反転させて「要求が委譲へ届く」ことを固定する。
  it("後から参加した人も problem.request を実行でき、代表へ need-problem が送られる", async () => {
    // Given（AI 鍵を持たない参加者が後から加わる。代表は AI 鍵を持つ作成者になる）
    const join = await handlers.handleCommand("guest-conn", {
      command: "room.join",
      code,
      displayName: "Carol",
      hasAiKey: false,
    });
    join._unsafeUnwrap();
    broadcaster.sent.length = 0;

    // When
    await handlers.handleCommand("guest-conn", {
      command: "problem.request",
      requestId: "req-x",
    });

    // Then（拒否されず、代表（作成者）へ need-problem が届く）
    expect(broadcaster.errorsTo("guest-conn")).toEqual([]);
    const needProblem = broadcaster.sent.find(
      (s) => s.msg.type === "signal" && s.msg.signal === "need-problem",
    );
    expect(needProblem?.connId).toBe("host-conn");
  });

  /**
   * 旧 `permissions-after-start.test.ts` が「権限層は通過し、その先の委譲層で止まる」
   * ことの確認として持っていた性質。権限層が無くなっても、**委譲が配線されていなければ
   * 断られる**という境界は残るので、ここへ引き取って単独で固定する。
   *
   * ⚠ **request と submit の 2 本を対にして置くこと。** 旧ファイルにも 2 本あり、
   * `problem-request.ts` と `problem-submit.ts` はそれぞれ独立に `delegator` の
   * 有無を見て `DELEGATION_UNAVAILABLE` を返す（共通の前段があるわけではない）。
   * 片方だけを移すと、もう片方の分岐を誰も検証していない状態になる。
   *
   * @requirements FR-025
   */
  it("委譲が配線されていないハンドラでは problem.request が DELEGATION_UNAVAILABLE で断られる", async () => {
    // Given（delegator を渡さずに組んだハンドラでルームを作る）
    const bare = makeTestHandlers({
      store: new InMemoryRoomStore(),
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
    await bare.handleCommand("bare-conn", { command: "room.create", displayName: "Alice" });
    broadcaster.sent.length = 0;

    // When
    const result = await bare.handleCommand("bare-conn", {
      command: "problem.request",
      requestId: "req-bare",
    });

    // Then
    expect(result.isErr()).toBe(true);
    expect(broadcaster.errorsTo("bare-conn").at(-1)?.code).toBe("DELEGATION_UNAVAILABLE");
  });

  /**
   * 上のテストの対（`problem-submit.ts` 側の同じ分岐）。
   *
   * @requirements FR-025
   */
  it("委譲が配線されていないハンドラでは problem.submit が DELEGATION_UNAVAILABLE で断られる", async () => {
    // Given（delegator を渡さずに組んだハンドラでルームを作る）
    const bare = makeTestHandlers({
      store: new InMemoryRoomStore(),
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
    await bare.handleCommand("bare-conn2", { command: "room.create", displayName: "Alice" });
    broadcaster.sent.length = 0;

    // When（request を通していないので、代表の確定より手前で断られる）
    const result = await bare.handleCommand("bare-conn2", {
      command: "problem.submit",
      requestId: "req-bare2",
      problem: validProblem,
      usedFallback: false,
    });

    // Then（STALE_SUBMISSION ではなく DELEGATION_UNAVAILABLE であることまで固定する）
    expect(result.isErr()).toBe(true);
    expect(broadcaster.errorsTo("bare-conn2").at(-1)?.code).toBe("DELEGATION_UNAVAILABLE");
  });
});

/**
 * ロビーの依頼 ID は依頼ごとに変わる（#273 のレビュー①）。
 *
 * **#273 がこの穴を開けた。** それ以前、ロビーのお題の依頼は**ルームの一生で 1 回**
 * しか起きなかった（`problem` が null へ戻る経路が無かった）。#273 が「2 本目の
 * ロビーで再び null になる」経路を作ったので、`fillLobbyProblem` が使っていた
 * **固定文字列の requestId が衝突しうる状態になった**。
 *
 * 衝突すると何が起きるか:
 *
 *   - `ProblemDelegator.submit` の stale 防御は `state.requestId !== requestId` の
 *     **文字列比較だけ**で、候補一致と合わせても**同じ ID・同じ候補なら通る**
 *   - `apps/timer-web` の `handleNeedProblem` は `await provider.generate(...)` の後に
 *     **無条件で投入する**（deadline を見ない・中断しない）。期限に間に合わなかった
 *     応答は**後から必ず飛ぶ**
 *
 * つまり 1 本目の遅れた応答が 2 本目のロビーで受理され、**古い設定で作られたお題が
 * 2 本目に入り、本来の応答が捨てられる**。
 *
 * `regenerateLobbyProblem` は最初から `-cfg-${now}` で一意化しており、その docstring が
 * 理由を「古い委譲の応答を新しい依頼のものと取り違えないため」と書いている。
 * 埋める側だけが固定 ID のままだった。
 */
describe("ロビーの依頼 ID は依頼ごとに変わる（#273）", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let delegator: ProblemDelegator;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;

  /** 1 本目の生成が遅れて返したお題（この題名が 2 本目に出たら受理されている）。 */
  const staleProblem: Problem = {
    title: "1 本目の遅れたお題",
    description: "d",
    requirements: ["r"],
    exampleTest: "t",
    hints: [],
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    delegator = new ProblemDelegator({ store, timers, clock, broadcaster, logger: testLogger, refEncoder: testRefEncoder });
    handlers = makeTestHandlers({ store, timers, clock, broadcaster, codeGen: new FakeCodeGen(), delegator });

    // Alice が作り、**Bob が AI 鍵つきで参加する**。以後ロビーの依頼先は Bob になる
    // （`buildCandidates` は timer に居る鍵の持ち主を参加順に並べる）。
    const create = await handlers.handleCommand("host-conn", {
      command: "room.create",
      displayName: "Alice",
      config,
    });
    if (!create.isOk()) throw new Error("前提が崩れた: room.create に失敗した");
    code = broadcaster.createdFor("host-conn").code;
    const join = await handlers.handleCommand("bob-conn", {
      command: "room.join",
      code,
      displayName: "Bob",
      hasAiKey: true,
    });
    if (!join.isOk()) throw new Error("前提が崩れた: room.join に失敗した");
  });

  afterEach(() => {
    delegator.cancelAll();
    jest.useRealTimers();
  });

  /**
   * 1 本のセッションを走らせて完成させ、「新しいセッション」でロビーへ戻す。
   *
   * **開始は `session.reset` で送る。** 完成したセッションの時計は走ったままなので
   * （`SessionCompleted` は集約を畳み込まない）、2 本目以降の `session.act START` は
   * `PhaseConflict` で弾かれる。実クライアントも同じ判断をしている
   * （`apps/timer-web/src/ui/session-start.ts`）。
   */
  async function runSessionAndReturnToLobby(): Promise<void> {
    for (const command of [
      { command: "phase.set", phase: "session" },
      { command: "session.reset" },
      { command: "session.complete" },
      { command: "phase.set", phase: "setup" },
    ] as const) {
      const result = await handlers.handleCommand("host-conn", command);
      if (!result.isOk()) throw new Error(`前提が崩れた: ${command.command} に失敗した`);
    }
  }

  /** 直近に飛んだ need-problem の requestId（飛んでいなければ undefined）。 */
  function latestNeedProblemRequestId(): string | undefined {
    for (let i = broadcaster.sent.length - 1; i >= 0; i--) {
      const msg = broadcaster.sent[i]!.msg;
      if (msg.type === "signal" && msg.signal === "need-problem") return msg.requestId;
    }
    return undefined;
  }

  it("Given 1 本目のロビーの依頼が期限切れで畳まれた / When 2 本目のロビーで依頼し直す / Then 1 本目の遅れた投入は受理されない", async () => {
    // Given: 1 本目を終えてロビーへ戻ると、Bob へお題の依頼が飛ぶ
    clock.advance(60000);
    await runSessionAndReturnToLobby();
    const firstRequestId = latestNeedProblemRequestId();
    if (firstRequestId === undefined) {
      throw new Error("前提が崩れた: 1 本目のロビーで need-problem が飛んでいない");
    }

    // Given: Bob が期限までに答えず、定型で確定して委譲が畳まれる
    clock.advance(PROBLEM_DEADLINE_MS + 1000);
    jest.advanceTimersByTime(PROBLEM_DEADLINE_MS + 1000);
    if (roomViewOf(store, timers, code).problem === null) {
      throw new Error("前提が崩れた: 期限切れの後に定型で確定していない");
    }

    // Given: 2 本目を終えてロビーへ戻ると、**新しい**依頼が飛ぶ
    clock.advance(60000);
    await runSessionAndReturnToLobby();
    if (latestNeedProblemRequestId() === undefined) {
      throw new Error("前提が崩れた: 2 本目のロビーで need-problem が飛んでいない");
    }

    // When: 1 本目の生成がようやく返り、**古い requestId のまま**投入される
    const result = await handlers.handleCommand("bob-conn", {
      command: "problem.submit",
      requestId: firstRequestId,
      problem: staleProblem,
      usedFallback: false,
    });

    // Then: 取り違えずに断る。2 本目のロビーに 1 本目のお題は入らない
    expect(result.isErr(), "古い依頼の投入が受理された").toBe(true);
    expect(broadcaster.errorsTo("bob-conn").at(-1)?.code).toBe("STALE_SUBMISSION");
    expect(roomViewOf(store, timers, code).problem?.title).not.toBe(staleProblem.title);
  });
});
