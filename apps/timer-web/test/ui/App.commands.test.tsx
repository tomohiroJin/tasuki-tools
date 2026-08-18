/**
 * App が子画面へ渡すコールバックと、実際に WS へ流れるコマンドの対応を固定する
 * characterization test（#167 E4 の安全網）。
 *
 * 既存の App テスト 5 本が観測している送信コマンドは problem.request の 1 種だけで、
 * 残りの配線は誰も守っていない。子コンポーネントのテスト（Session.roster.test.tsx 等）は
 * props のスパイを見ているため、**App がどのラッパーをどの prop へ渡すか**は射程外である。
 * driver.skip と driver.resume を取り違えても 1 件も落ちない状態だった。
 *
 * このファイルは E4 の再編に着手する**前**に、現行の App.tsx に対して書いて緑を確認する。
 * 再編後に書くと「新しい実装に合わせて書いたテスト」になり、退行を検出できない。
 *
 * @requirements #167（#72 E4）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import App from "../../src/App.js";
import { FakeWS } from "../support/fakes.js";
import { aRoomView } from "../support/room-view.js";
import { clearPreferences } from "../../src/prefs/local-prefs.js";

vi.mock("../../src/records/indexeddb.js", () => ({
  saveRecord: vi.fn().mockResolvedValue(undefined),
}));

/** props のうち on〜 をボタンへ変えるだけの器。押すと ARGS の引数でコールバックを呼ぶ。 */
function propHarness(prefix: string) {
  return (props: Record<string, unknown>) => (
    <div>
      {Object.keys(props)
        .filter((k) => k.startsWith("on"))
        .map((k) => (
          <button
            key={k}
            data-testid={`${prefix}:${k}`}
            onClick={() => (props[k] as (...a: unknown[]) => void)(...(ARGS[k] ?? []))}
          >
            {k}
          </button>
        ))}
    </div>
  );
}

/** 各コールバックへ渡す引数。ここに無いものは引数なしで呼ばれる。 */
const ARGS: Record<string, unknown[]> = {
  onEditProblem: [{ title: "新タイトル" }],
  onConfigSet: [{ difficulty: "hard" }],
  onJoinRotation: ["p-2"],
  onLeaveRotation: ["p-2"],
  onRemoveParticipant: ["p-2"],
  onRoleSet: ["p-2", "editor"],
  onSelfRoleChange: ["editor"],
  onTransferHost: ["p-2"],
  onMoveRotation: [0, 1],
  onSetPassphrase: ["ひみつ"],
  onAiUnlock: ["あいことば"],
  onProblemModeSet: ["ai"],
  onHandoffNoteSet: ["引き継ぎメモ"],
  onRenameParticipant: ["p-2", "新しい名前"],
  onDriverSkip: ["p-2"],
  onDriverResume: ["p-2"],
  onDriverAssign: ["p-2"],
  onAddProxy: ["代理さん"],
};

vi.mock("../../src/ui/Lobby.js", () => ({ Lobby: propHarness("lobby") }));
vi.mock("../../src/ui/Session.js", () => ({ Session: propHarness("session") }));

const HOST_ID = "host-1";
const OTHER_ID = "p-2";

function participant(participantId: string, displayName: string, role: "host" | "editor" = "host") {
  return {
    participantId,
    connId: `c-${participantId}`,
    displayName,
    role,
    presence: "online" as const,
    hasAiKey: false,
    joinedAt: 0,
  };
}

function openLatestSocket(): FakeWS {
  const ws = FakeWS.instances[FakeWS.instances.length - 1]!;
  ws.readyState = FakeWS.OPEN;
  ws.onopen?.();
  return ws;
}

function sendServer(ws: FakeWS, msg: Record<string, unknown>): void {
  act(() => {
    ws.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent);
  });
}

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
  sessionStorage.clear();
  clearPreferences();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  clearPreferences();
  window.history.replaceState(null, "", "/");
});

/** ルームを作り、指定 phase の snapshot まで進めて FakeWS を返す。 */
function enterRoom(phase: "ready" | "session"): FakeWS {
  render(<App />);
  fireEvent.change(screen.getByLabelText("あなたの名前"), { target: { value: "Host" } });
  fireEvent.click(screen.getByRole("button", { name: /ルームを作る/ }));
  const ws = openLatestSocket();
  sendServer(ws, {
    type: "room.created",
    code: "ROOM01",
    hostToken: "ht",
    resumeToken: "rt",
    participantId: HOST_ID,
  });
  sendServer(ws, {
    type: "snapshot",
    room: aRoomView({
      code: "ROOM01",
      phase,
      hostParticipantId: HOST_ID,
      participants: [participant(HOST_ID, "Host"), participant(OTHER_ID, "Other", "editor")],
      session: { rotation: [HOST_ID, OTHER_ID], currentIndex: 0 },
      problem: {
        title: "お題",
        description: "説明",
        requirements: [],
        exampleTest: "",
        hints: [],
        source: "fallback",
      },
    }),
  });
  return ws;
}

/** 直近の send 呼び出しから command 名だけを取り出す。 */
function sentCommands(sendSpy: ReturnType<typeof vi.spyOn>): string[] {
  return sendSpy.mock.calls.map((c) => JSON.parse(String(c[0])).command as string);
}

const LOBBY_CASES: Array<[string, string]> = [
  ["onEditProblem", "problem.edit"],
  ["onRegenerateProblem", "problem.request"],
  ["onConfigSet", "config.set"],
  ["onJoinRotation", "member.add"],
  ["onLeaveRotation", "member.remove"],
  ["onRemoveParticipant", "participant.remove"],
  ["onRoleSet", "role.set"],
  ["onTransferHost", "host.transfer"],
  ["onMoveRotation", "member.move"],
  ["onShuffle", "member.shuffle"],
  ["onSetPassphrase", "room.passphrase.set"],
  ["onAiUnlock", "ai.unlock"],
  ["onProblemModeSet", "problem.mode.set"],
];

const SESSION_CASES: Array<[string, string]> = [
  ["onSkip", "session.act"],
  ["onPause", "session.act"],
  ["onResume", "session.act"],
  ["onRestartTimer", "session.act"],
  ["onComplete", "session.complete"],
  ["onAbort", "session.abort"],
  ["onReset", "session.reset"],
  ["onHandoffNoteSet", "handoff.note.set"],
  ["onJoinRotation", "member.add"],
  ["onLeaveRotation", "member.remove"],
  ["onRenameParticipant", "participant.rename"],
  ["onDriverSkip", "driver.skip"],
  ["onDriverResume", "driver.resume"],
  ["onDriverAssign", "driver.assign"],
  ["onAddProxy", "participant.addProxy"],
  ["onRemoveParticipant", "participant.remove"],
  ["onSelfRoleChange", "role.set"],
  ["onTransferHost", "host.transfer"],
  ["onMoveRotation", "member.move"],
  ["onShuffle", "member.shuffle"],
  ["onEditProblem", "problem.edit"],
  ["onRegenerateProblem", "problem.request"],
  ["onSetPassphrase", "room.passphrase.set"],
];

describe("App が子画面へ渡すコールバックと WS コマンドの対応（ロビー）", () => {
  it.each(LOBBY_CASES)("%s は %s を送る", (prop, command) => {
    const ws = enterRoom("ready");
    const sendSpy = vi.spyOn(ws, "send");
    fireEvent.click(screen.getByTestId(`lobby:${prop}`));
    expect(sentCommands(sendSpy)).toContain(command);
  });

  it("onStartSession は problem.request を送らず phase.set と session.act START を送る（お題あり）", () => {
    const ws = enterRoom("ready");
    const sendSpy = vi.spyOn(ws, "send");
    fireEvent.click(screen.getByTestId("lobby:onStartSession"));
    const sent = sendSpy.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(sent.map((m) => m.command)).toEqual(["phase.set", "session.act"]);
    expect(sent[0].phase).toBe("session");
    expect(sent[1].action).toBe("START");
  });
});

describe("App が子画面へ渡すコールバックと WS コマンドの対応（セッション）", () => {
  it.each(SESSION_CASES)("%s は %s を送る", (prop, command) => {
    const ws = enterRoom("session");
    const sendSpy = vi.spyOn(ws, "send");
    fireEvent.click(screen.getByTestId(`session:${prop}`));
    expect(sentCommands(sendSpy)).toContain(command);
  });

  it("session.act の action は押した操作ごとに違う", () => {
    const ws = enterRoom("session");
    const sendSpy = vi.spyOn(ws, "send");
    for (const prop of ["onSkip", "onPause", "onResume", "onRestartTimer"]) {
      fireEvent.click(screen.getByTestId(`session:${prop}`));
    }
    const actions = sendSpy.mock.calls
      .map((c) => JSON.parse(String(c[0])))
      .filter((m) => m.command === "session.act")
      .map((m) => m.action);
    expect(actions).toEqual(["SWITCH", "PAUSE", "RESUME", "RESTART"]);
  });

  it("driver.skip と driver.resume は取り違えていない", () => {
    const ws = enterRoom("session");
    const sendSpy = vi.spyOn(ws, "send");
    fireEvent.click(screen.getByTestId("session:onDriverSkip"));
    fireEvent.click(screen.getByTestId("session:onDriverResume"));
    const sent = sendSpy.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(sent.map((m) => m.command)).toEqual(["driver.skip", "driver.resume"]);
    expect(sent.every((m) => m.participantId === OTHER_ID)).toBe(true);
  });
});
