/**
 * signal: "notice" — 破壊的操作の実行者を全員に伝える（host-spof-relaxation）
 *
 * 開始後は主催者以外も退出・中断・リセット・完成を実行できる。
 * 誰が実行したか分からないと、画面が突然変わった理由を追えず「勝手に壊された」と映る。
 * サーバーは意味（action と実行者）だけを運び、文言化は UI 側が行う。
 *
 * 設計: docs/plans/host-spof-relaxation/plan.md「API / インターフェース契約」1
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { ServerMsg, SessionConfig } from "@tdd-mob/core";
import { SpyBroadcaster as SharedSpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

/**
 * notice の内容と、配信時点での在室者を記録するスパイ。
 *
 * `bindStore()`（broadcastSignal 呼び出し時点のストア在室者を記録する仕組み）は
 * このファイルにしかない拡張のため、共有版 SpyBroadcaster には持たせていない
 * （T021: 和集合を超える機能は足さない・FR-118）。ここで共有版を継承し、
 * ローカルにだけ `bindStore()` と `residentsAtSignal`（signals と同じ添字で
 * 対応する在室者スナップショット）を足す。
 */
class NoticeSpyBroadcaster extends SharedSpyBroadcaster {
  readonly residentsAtSignal: string[][] = [];
  private residents: () => string[] = () => [];

  bindStore(fn: () => string[]): void { this.residents = fn; }

  override broadcastSignal(roomCode: string, msg: ServerMsg): void {
    super.broadcastSignal(roomCode, msg);
    this.residentsAtSignal.push(this.residents());
  }
}

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob", "Carol"],
  intervalMinutes: 5,
};

const HOST = "nt-host";
const BOB = "nt-bob";
const CAROL = "nt-carol";

/**
 * @requirements FR-077
 */
describe("signal: notice（実行者の通知）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: NoticeSpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;

  const pidOf = (name: string): string =>
    store.get(code)!.participants.find((p) => p.displayName === name)!.participantId;

  /** 記録された notice のうち最新のものを返す。 */
  const lastNotice = () => {
    for (let i = broadcaster.signals.length - 1; i >= 0; i--) {
      const s = broadcaster.signals[i]!;
      if (s.msg.type === "signal" && s.msg.signal === "notice") {
        return { ...s.msg, residentsAtSend: broadcaster.residentsAtSignal[i] ?? [] };
      }
    }
    return undefined;
  };

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new NoticeSpyBroadcaster();
    handlers = makeHandlers({
      store, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen(),
    });
    const created = await handlers.handleCommand(HOST, {
      command: "room.create", displayName: "Alice", config,
    });
    if (!created.isOk()) throw new Error("room.create failed");
    code = created.value.code;
    broadcaster.bindStore(() => store.get(code)?.participants.map((p) => p.participantId) ?? []);
    await handlers.handleCommand(BOB, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
    await handlers.handleCommand(CAROL, { command: "room.join", code, displayName: "Carol", hasAiKey: false });
    // 開始後は誰でも破壊的操作を実行できる。Bob（host でない editor）を実行者にする。
    await handlers.handleCommand(HOST, { command: "phase.set", phase: "session" });
    broadcaster.sent.length = 0;
    broadcaster.signals.length = 0;
    broadcaster.residentsAtSignal.length = 0;
  });

  describe("① 各操作で notice が配信される", () => {
    const cases: Array<[string, string, () => Record<string, unknown>]> = [
      ["session.abort", "session-aborted", () => ({ command: "session.abort" })],
      ["session.reset", "session-reset", () => ({ command: "session.reset" })],
      ["session.complete", "session-completed", () => ({ command: "session.complete" })],
    ];

    for (const [command, action, build] of cases) {
      it(`${command} の後に action: "${action}" の notice が配信される`, async () => {
        // When
        const result = await handlers.handleCommand(BOB, build());

        // Then
        expect(result.isOk()).toBe(true);
        expect(lastNotice()?.action).toBe(action);
      });
    }

    it('participant.remove の後に action: "participant-removed" の notice が配信される', async () => {
      // When
      const result = await handlers.handleCommand(BOB, {
        command: "participant.remove", participantId: pidOf("Carol"),
      });

      // Then
      expect(result.isOk()).toBe(true);
      expect(lastNotice()?.action).toBe("participant-removed");
    });
  });

  describe("② 実行者を指す", () => {
    it("actorName と actorParticipantId が実行者（host ではない）を指す", async () => {
      // Given
      const bobId = pidOf("Bob");

      // When
      await handlers.handleCommand(BOB, { command: "session.abort" });

      // Then
      const notice = lastNotice();
      expect(notice?.actorName).toBe("Bob");
      expect(notice?.actorParticipantId).toBe(bobId);
    });

    it("実行者が異なれば notice の実行者も変わる（ホスト固定になっていない）", async () => {
      // When
      await handlers.handleCommand(CAROL, { command: "session.reset" });

      // Then
      expect(lastNotice()?.actorName).toBe("Carol");
    });
  });

  describe("③ participant-removed は対象も伝える", () => {
    it("targetName と targetParticipantId が対象を指す", async () => {
      // Given
      const carolId = pidOf("Carol");

      // When
      await handlers.handleCommand(BOB, { command: "participant.remove", participantId: carolId });

      // Then
      const notice = lastNotice();
      expect(notice?.targetName).toBe("Carol");
      expect(notice?.targetParticipantId).toBe(carolId);
    });

    it("participant-removed 以外では target 系を付けない", async () => {
      // When
      await handlers.handleCommand(BOB, { command: "session.abort" });

      // Then
      const notice = lastNotice();
      expect(notice?.targetName).toBeUndefined();
      expect(notice?.targetParticipantId).toBeUndefined();
    });
  });

  describe("④ 退出させられた本人には notice が届かない", () => {
    it("notice の配信時点で対象は既に在室者から外れている", async () => {
      // Given
      const carolId = pidOf("Carol");

      // When
      await handlers.handleCommand(BOB, { command: "participant.remove", participantId: carolId });

      // Then（broadcastSignal は呼び出し時点のストアから宛先を決める＝server.ts。
      // 除去を永続化する前に配信すると本人にも「あなたが退出させられました」が届く）
      expect(lastNotice()?.residentsAtSend).not.toContain(carolId);
    });

    it("自己退出でも notice は残った人へ配信される（誰が抜けたかは全員に伝わる）", async () => {
      // Given
      const carolId = pidOf("Carol");

      // When
      await handlers.handleCommand(CAROL, { command: "participant.remove", participantId: carolId });

      // Then
      const notice = lastNotice();
      expect(notice?.action).toBe("participant-removed");
      expect(notice?.actorParticipantId).toBe(carolId);
      expect(notice?.targetParticipantId).toBe(carolId);
    });
  });

  describe("⑤ 失敗した操作では notice を配信しない", () => {
    it("権限で拒否された操作は notice を出さない", async () => {
      // Given（Carol を見学者に降格し、拒否される操作を送る）
      await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Carol"), role: "viewer" });
      broadcaster.signals.length = 0;
      broadcaster.residentsAtSignal.length = 0;

      // When
      const result = await handlers.handleCommand(CAROL, { command: "session.abort" });

      // Then
      expect(result.isErr()).toBe(true);
      expect(lastNotice()).toBeUndefined();
    });
  });
});

// ─── 退出通知の改称 ────────────────────────────────────────────────────────

/**
 * @requirements FR-075
 */
describe("退出させられた本人への通知", () => {
  let store: InMemoryRoomStore;
  let broadcaster: NoticeSpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new NoticeSpyBroadcaster();
    handlers = makeHandlers({
      store, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen(),
    });
    const created = await handlers.handleCommand(HOST, {
      command: "room.create", displayName: "Alice", config,
    });
    if (!created.isOk()) throw new Error("room.create failed");
    code = created.value.code;
    await handlers.handleCommand(BOB, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
    await handlers.handleCommand(CAROL, { command: "room.join", code, displayName: "Carol", hasAiKey: false });
    await handlers.handleCommand(HOST, { command: "phase.set", phase: "session" });
    broadcaster.sent.length = 0;
  });

  it("コードが REMOVED_FROM_ROOM になる（実行者はホストに限らないため）", async () => {
    // Given
    const carolId = store.get(code)!.participants.find((p) => p.displayName === "Carol")!.participantId;

    // When
    await handlers.handleCommand(BOB, { command: "participant.remove", participantId: carolId });

    // Then
    const notice = broadcaster.sent.find((s) => s.connId === CAROL && s.msg.type === "error");
    expect(notice?.msg.type === "error" && notice.msg.code).toBe("REMOVED_FROM_ROOM");
  });

  it("文言に実行者名と再参加できる旨が含まれる", async () => {
    // Given
    const carolId = store.get(code)!.participants.find((p) => p.displayName === "Carol")!.participantId;

    // When
    await handlers.handleCommand(BOB, { command: "participant.remove", participantId: carolId });

    // Then
    const notice = broadcaster.sent.find((s) => s.connId === CAROL && s.msg.type === "error");
    const message = notice?.msg.type === "error" ? notice.msg.message : "";
    expect(message).toContain("Bob");
    expect(message).toContain("再参加");
  });
});
