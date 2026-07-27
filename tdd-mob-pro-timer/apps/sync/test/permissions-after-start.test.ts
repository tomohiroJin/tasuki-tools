/**
 * 開始後は全員同格であることを検証するテスト（host-spof-relaxation G2・T013）
 *
 * 一度でもセッションを開始したルーム（`Room.startedAt !== null`）では、
 * 進行に必要な操作から主催者という条件を外す（FR-063/064）。
 * ホストが落ちても残った編集者だけで進行・撤収できる状態を作ることが目的。
 *
 * **回帰検出点:** `role.set` / `room.passphrase.set` / `ai.unlock` / `host.transfer` の4件は
 * `handleCommand` の switch で分岐し `authorize()` に到達しない（層⑤）。
 * 集合表（HOST_ONLY_COMMANDS）だけを直しても緩和されないため、必ずここで検証する。
 *
 * 設計: docs/plans/host-spof-relaxation/plan.md「④⑤ の内訳と、二重定義によるデッドコード」
 * 要件: FR-063, FR-064, FR-067, US1
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { RoomCodeGen } from "../src/ports/code-gen.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { ServerMsg, SessionConfig } from "@tdd-mob/core";

class FakeCodeGen implements RoomCodeGen {
  private _c = 0;
  generate(): string { return `PA${String(++this._c).padStart(2, "0")}`; }
  generateParticipantId(): string { return `pid-pa-${++this._c}`; }
  generateResumeToken(): string { return `rt-pa-${++this._c}`; }
}

class SpyBroadcaster implements Broadcaster {
  readonly sent: Array<{ connId: string; msg: ServerMsg }> = [];
  broadcastSnapshot(): void {}
  sendTo(connId: string, msg: ServerMsg): void { this.sent.push({ connId, msg }); }
  broadcastSignal(): void {}
}

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Host", "Editor", "Carol"],
  intervalMinutes: 5,
};

const HOST_CONN = "after-host";
const EDITOR_CONN = "after-editor";
const CAROL_CONN = "after-carol";
const VIEWER_CONN = "after-viewer";

describe("開始後の権限（FR-063/064・主催者を条件にしない）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let roomCode: string;
  let carolPid: string;
  let viewerPid: string;

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store,
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
      aiUnlockKey: "secret",
    });

    const created = await handlers.handleCommand(HOST_CONN, {
      command: "room.create",
      displayName: "Host",
      config,
    });
    if (!created.isOk()) throw new Error("room.create failed");
    roomCode = created.value.code;

    for (const [connId, displayName] of [
      [EDITOR_CONN, "Editor"],
      [CAROL_CONN, "Carol"],
      [VIEWER_CONN, "Viewer"],
    ] as const) {
      await handlers.handleCommand(connId, {
        command: "room.join", code: roomCode, displayName, hasAiKey: false,
      });
    }

    const joined = store.get(roomCode)!;
    carolPid = joined.participants.find((p) => p.displayName === "Carol")!.participantId;
    viewerPid = joined.participants.find((p) => p.displayName === "Viewer")!.participantId;

    // Viewer を降格してから開始する（開始前なのでホストのみが実行できる）。
    await handlers.handleCommand(HOST_CONN, {
      command: "role.set", participantId: viewerPid, role: "viewer",
    });

    // セッションを開始する。以降 startedAt は消えない（G1・単調フラグ）。
    await handlers.handleCommand(HOST_CONN, { command: "phase.set", phase: "session" });
    if (store.get(roomCode)!.startedAt == null) throw new Error("startedAt が記録されていない");

    broadcaster.sent.length = 0;
  });

  /** 直近に connId 宛へ送られた error メッセージを返す（無ければ undefined）。 */
  function lastError(connId: string): { code: string; message: string } | undefined {
    const found = [...broadcaster.sent].reverse().find(
      (s) => s.connId === connId && s.msg.type === "error",
    );
    if (!found || found.msg.type !== "error") return undefined;
    return { code: found.msg.code, message: found.msg.message };
  }

  describe("host でない editor が進行操作を実行できる", () => {
    // 開始前は UNAUTHORIZED だった 7 コマンド（T012 と同じ集合）。
    const cases: Array<[string, () => Record<string, unknown>]> = [
      ["member.shuffle", () => ({ command: "member.shuffle" })],
      ["member.move", () => ({ command: "member.move", fromIndex: 0, toIndex: 2 })],
      ["role.set", () => ({ command: "role.set", participantId: carolPid, role: "viewer" })],
      ["room.passphrase.set", () => ({ command: "room.passphrase.set", passphrase: "pw" })],
      ["ai.unlock", () => ({ command: "ai.unlock", key: "secret" })],
      ["participant.remove", () => ({ command: "participant.remove", participantId: carolPid })],
    ];

    for (const [name, build] of cases) {
      it(`editor が ${name} を実行できる`, async () => {
        const result = await handlers.handleCommand(EDITOR_CONN, build());

        expect(lastError(EDITOR_CONN)?.code).not.toBe("UNAUTHORIZED");
        expect(result.isOk()).toBe(true);
      });
    }

    // driver.assign はタイマー稼働中でなければドメイン側が PhaseConflict を返すため
    // （権限とは別の妥当性検査）、この 1 件だけ稼働状態を作ってから検証する。
    it("editor が driver.assign を実行できる", async () => {
      await handlers.handleCommand(HOST_CONN, { command: "session.act", action: "START" });
      broadcaster.sent.length = 0;

      const result = await handlers.handleCommand(EDITOR_CONN, {
        command: "driver.assign", participantId: carolPid,
      });

      expect(lastError(EDITOR_CONN)?.code).not.toBe("UNAUTHORIZED");
      expect(result.isOk()).toBe(true);
      const room = store.get(roomCode)!;
      expect(room.session.rotation[room.session.currentIndex]).toBe("Carol");
    });

    // 層⑤の4件目。他の3件と違い participant.remove ではなく host.transfer 側の経路を通る。
    it("editor が host.transfer を実行できる（層⑤・専用ハンドラ）", async () => {
      const result = await handlers.handleCommand(EDITOR_CONN, {
        command: "host.transfer", participantId: carolPid,
      });

      expect(lastError(EDITOR_CONN)?.code).not.toBe("UNAUTHORIZED");
      expect(result.isOk()).toBe(true);
      expect(store.get(roomCode)!.hostParticipantId).toBe(carolPid);
    });
  });

  describe("見学者の制限は段階に関わらず維持される（FR-067）", () => {
    it("viewer は開始後も他人対象の driver.assign を実行できない", async () => {
      const result = await handlers.handleCommand(VIEWER_CONN, {
        command: "driver.assign", participantId: carolPid,
      });

      expect(result.isErr()).toBe(true);
      expect(lastError(VIEWER_CONN)?.code).toBe("UNAUTHORIZED");
    });

    // requireEditor 経由（層④）の2件。ここも authorize() に到達しないため個別に検証する。
    // editor 側は権限層を通過したことだけを見る（お題生成の委譲先は本テストの関心外で、
    // delegator 未設定のため DELEGATION_UNAVAILABLE になるのが正しい）。
    it("viewer は problem.request を実行できない", async () => {
      const result = await handlers.handleCommand(VIEWER_CONN, {
        command: "problem.request", requestId: "req-1",
      });

      expect(result.isErr()).toBe(true);
      expect(lastError(VIEWER_CONN)?.code).toBe("UNAUTHORIZED");
    });

    it("editor は problem.request で権限拒否されない", async () => {
      await handlers.handleCommand(EDITOR_CONN, {
        command: "problem.request", requestId: "req-2",
      });

      // 権限層は通過し、その先の委譲層で止まる。コードを固定して検証することで、
      // 将来 UNAUTHORIZED 以外の誤った拒否が混入した場合も検出できるようにする。
      expect(lastError(EDITOR_CONN)?.code).toBe("DELEGATION_UNAVAILABLE");
    });

    it("viewer は problem.submit を実行できない", async () => {
      const result = await handlers.handleCommand(VIEWER_CONN, {
        command: "problem.submit",
        requestId: "req-3",
        problem: { title: "t", description: "d", requirements: [], exampleTest: "", hints: [] },
        usedFallback: false,
      });

      expect(result.isErr()).toBe(true);
      expect(lastError(VIEWER_CONN)?.code).toBe("UNAUTHORIZED");
    });

    it("editor は problem.submit で権限拒否されない", async () => {
      await handlers.handleCommand(EDITOR_CONN, {
        command: "problem.submit",
        requestId: "req-4",
        problem: { title: "t", description: "d", requirements: [], exampleTest: "", hints: [] },
        usedFallback: false,
      });

      expect(lastError(EDITOR_CONN)?.code).toBe("DELEGATION_UNAVAILABLE");
    });
  });
});
