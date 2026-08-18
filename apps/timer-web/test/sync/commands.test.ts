/**
 * createCommands の全数テスト（#167 E4）。
 *
 * App.tsx に散っていた 1 行の送信ラッパーを純粋ファクトリへ集約したもの。
 * 「どの操作がどの command を送るか」をここで固定する。React に依存しない。
 *
 * @requirements #167（#72 E4）
 */
import { describe, it, expect, vi } from "vitest";
import { createCommands, type SendFn } from "../../src/sync/commands.js";
import { aRoomView } from "../support/room-view.js";
import type { Room } from "@tasuki/timer-core";

function setup(room: Room | null = null) {
  const send = vi.fn() as SendFn & ReturnType<typeof vi.fn>;
  const commands = createCommands(send, () => room);
  return { send, commands };
}

/** 送られた 1 通目のフレーム。 */
function firstFrame(send: ReturnType<typeof vi.fn>): Record<string, unknown> {
  expect(send).toHaveBeenCalledTimes(1);
  return send.mock.calls[0]![0] as Record<string, unknown>;
}

describe("createCommands: 引数をそのまま載せる操作", () => {
  const cases: Array<[string, (c: ReturnType<typeof setup>["commands"]) => void, Record<string, unknown>]> = [
    ["addMember", (c) => c.addMember("p-2"), { command: "member.add", participantId: "p-2" }],
    ["removeParticipant", (c) => c.removeParticipant("p-2"), { command: "participant.remove", participantId: "p-2" }],
    ["setRole", (c) => c.setRole("p-2", "editor"), { command: "role.set", participantId: "p-2", role: "editor" }],
    ["transferHost", (c) => c.transferHost("p-2"), { command: "host.transfer", participantId: "p-2" }],
    ["setPassphrase", (c) => c.setPassphrase("ひみつ"), { command: "room.passphrase.set", passphrase: "ひみつ" }],
    ["aiUnlock", (c) => c.aiUnlock("あいことば"), { command: "ai.unlock", key: "あいことば" }],
    ["setProblemMode", (c) => c.setProblemMode("ai"), { command: "problem.mode.set", mode: "ai" }],
    ["moveMember", (c) => c.moveMember(0, 2), { command: "member.move", fromIndex: 0, toIndex: 2 }],
    ["shuffleMembers", (c) => c.shuffleMembers(), { command: "member.shuffle" }],
    ["completeSession", (c) => c.completeSession(), { command: "session.complete" }],
    ["abortSession", (c) => c.abortSession(), { command: "session.abort" }],
    ["actSession", (c) => c.actSession("SWITCH"), { command: "session.act", action: "SWITCH" }],
    ["renameParticipant", (c) => c.renameParticipant("p-2", "新名"), { command: "participant.rename", participantId: "p-2", displayName: "新名" }],
    ["driverSkip", (c) => c.driverSkip("p-2"), { command: "driver.skip", participantId: "p-2" }],
    ["driverResume", (c) => c.driverResume("p-2"), { command: "driver.resume", participantId: "p-2" }],
    ["driverAssign", (c) => c.driverAssign("p-2"), { command: "driver.assign", participantId: "p-2" }],
    ["addProxy", (c) => c.addProxy("proxy-x", "代理"), { command: "participant.addProxy", participantId: "proxy-x", displayName: "代理" }],
    ["editProblem", (c) => c.editProblem({ title: "T" }), { command: "problem.edit", patch: { title: "T" } }],
    ["requestProblem", (c) => c.requestProblem("req-1"), { command: "problem.request", requestId: "req-1" }],
    ["setPhase", (c) => c.setPhase("session"), { command: "phase.set", phase: "session" }],
    ["setConfig", (c) => c.setConfig({ difficulty: "hard" }), { command: "config.set", config: { difficulty: "hard" } }],
    ["resetSession", (c) => c.resetSession(), { command: "session.reset" }],
    ["setHandoffNote", (c) => c.setHandoffNote("メモ"), { command: "handoff.note.set", text: "メモ" }],
  ];

  it.each(cases)("%s", (_name, call, expected) => {
    const { send, commands } = setup();
    call(commands);
    expect(firstFrame(send as ReturnType<typeof vi.fn>)).toEqual(expected);
  });
});

describe("createCommands: removeMember は送信時の snapshot から index を解決する", () => {
  it("輪に居るなら現在の index で member.remove を送る", () => {
    const room = aRoomView({ session: { rotation: ["a", "b", "c"], currentIndex: 0 } });
    const { send, commands } = setup(room);
    commands.removeMember("c");
    expect(firstFrame(send as ReturnType<typeof vi.fn>)).toEqual({ command: "member.remove", index: 2 });
  });

  it("輪に居ないなら何も送らない", () => {
    const room = aRoomView({ session: { rotation: ["a", "b"], currentIndex: 0 } });
    const { send, commands } = setup(room);
    commands.removeMember("z");
    expect(send).not.toHaveBeenCalled();
  });

  it("room が無いなら何も送らない", () => {
    const { send, commands } = setup(null);
    commands.removeMember("a");
    expect(send).not.toHaveBeenCalled();
  });

  it("index は生成時ではなく呼び出し時の snapshot から引く", () => {
    // 生成時は ["a"]、呼び出し時は ["x","a"] という順に変わる。
    // 生成時に固定していれば 0 が送られ、呼び出し時に引けば 1 が送られる。
    let room = aRoomView({ session: { rotation: ["a"], currentIndex: 0 } });
    const send = vi.fn();
    const commands = createCommands(send, () => room);
    room = aRoomView({ session: { rotation: ["x", "a"], currentIndex: 0 } });
    commands.removeMember("a");
    expect(firstFrame(send)).toEqual({ command: "member.remove", index: 1 });
  });
});
