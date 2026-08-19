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
 * レビュー（#167 Task 3 の I-1）で表駆動ケースを command 名だけの一致から
 * フレーム全体の一致へ強めた。role.set の role、member.move の fromIndex/toIndex、
 * config.set の config、handoff.note.set の text 等が壊れても command 名さえ合っていれば
 * 緑になっていたため、Task 6 の大移動がこの網をすり抜けないようにする。
 * requestId・participantId に乱数/現在時刻を含む2件（onRegenerateProblem・onAddProxy）は
 * 完全一致にできないため、command と接頭辞だけを見る個別テストに分けている。
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

/** send スパイの型。`ReturnType<typeof vi.spyOn>` を型引数なしで書くと、オーバーロードの
 *  型変数が解決されず mock.calls の要素が絞れないため、map のコールバック引数が
 *  暗黙 any になっていた（TS7006）。読み取りにしか使わないので、構造的に
 *  `mock.calls` の形だけを指定する（`Mock<(data?: string) => void>` の calls は
 *  `[data?: string][]` で、これは `unknown[][]` に代入可能）。 */
type SendSpy = { mock: { calls: unknown[][] } };

/** send 呼び出しを JSON にパースした配列で取り出す。 */
function sentFrames(sendSpy: SendSpy): Array<Record<string, unknown>> {
  return sendSpy.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
}

// prop 名 → 押したときにちょうど 1 通送られるべきフレーム全体。
// requestId/participantId に乱数・現在時刻を含む onRegenerateProblem・onAddProxy は
// 完全一致にできないため、この表には含めず個別テストで command と接頭辞だけを見る。
const LOBBY_CASES: Array<[string, Record<string, unknown>]> = [
  ["onEditProblem", { command: "problem.edit", patch: { title: "新タイトル" } }],
  ["onConfigSet", { command: "config.set", config: { difficulty: "hard" } }],
  ["onJoinRotation", { command: "member.add", participantId: "p-2" }],
  ["onLeaveRotation", { command: "member.remove", index: 1 }],
  ["onRemoveParticipant", { command: "participant.remove", participantId: "p-2" }],
  ["onRoleSet", { command: "role.set", participantId: "p-2", role: "editor" }],
  ["onTransferHost", { command: "host.transfer", participantId: "p-2" }],
  ["onMoveRotation", { command: "member.move", fromIndex: 0, toIndex: 1 }],
  ["onShuffle", { command: "member.shuffle" }],
  ["onSetPassphrase", { command: "room.passphrase.set", passphrase: "ひみつ" }],
  ["onAiUnlock", { command: "ai.unlock", key: "あいことば" }],
  ["onProblemModeSet", { command: "problem.mode.set", mode: "ai" }],
];

const SESSION_CASES: Array<[string, Record<string, unknown>]> = [
  ["onSkip", { command: "session.act", action: "SWITCH" }],
  ["onPause", { command: "session.act", action: "PAUSE" }],
  ["onResume", { command: "session.act", action: "RESUME" }],
  ["onRestartTimer", { command: "session.act", action: "RESTART" }],
  ["onComplete", { command: "session.complete" }],
  ["onAbort", { command: "session.abort" }],
  ["onReset", { command: "session.reset" }],
  ["onHandoffNoteSet", { command: "handoff.note.set", text: "引き継ぎメモ" }],
  ["onJoinRotation", { command: "member.add", participantId: "p-2" }],
  ["onLeaveRotation", { command: "member.remove", index: 1 }],
  ["onRenameParticipant", { command: "participant.rename", participantId: "p-2", displayName: "新しい名前" }],
  ["onDriverSkip", { command: "driver.skip", participantId: "p-2" }],
  ["onDriverResume", { command: "driver.resume", participantId: "p-2" }],
  ["onDriverAssign", { command: "driver.assign", participantId: "p-2" }],
  ["onRemoveParticipant", { command: "participant.remove", participantId: "p-2" }],
  ["onSelfRoleChange", { command: "role.set", participantId: HOST_ID, role: "editor" }],
  ["onTransferHost", { command: "host.transfer", participantId: "p-2" }],
  ["onMoveRotation", { command: "member.move", fromIndex: 0, toIndex: 1 }],
  ["onShuffle", { command: "member.shuffle" }],
  ["onEditProblem", { command: "problem.edit", patch: { title: "新タイトル" } }],
  ["onSetPassphrase", { command: "room.passphrase.set", passphrase: "ひみつ" }],
];

describe("App が子画面へ渡すコールバックと WS コマンドの対応（ロビー）", () => {
  it.each(LOBBY_CASES)("%s は期待するフレームをちょうど1通送る", (prop, expected) => {
    // Given
    const ws = enterRoom("ready");
    const sendSpy = vi.spyOn(ws, "send");
    // When
    fireEvent.click(screen.getByTestId(`lobby:${prop}`));
    // Then
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sentFrames(sendSpy)[0]).toEqual(expected);
  });

  it("onRegenerateProblem は problem.request を requestId の接頭辞 req-ROOM01-regen- で送る", () => {
    // Given
    const ws = enterRoom("ready");
    const sendSpy = vi.spyOn(ws, "send");
    // When
    fireEvent.click(screen.getByTestId("lobby:onRegenerateProblem"));
    // Then
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const sent = sentFrames(sendSpy)[0]!;
    expect(sent.command).toBe("problem.request");
    expect(sent.requestId).toMatch(/^req-ROOM01-regen-/);
  });

  it("onStartSession は problem.request を送らず phase.set と session.act START を送る（お題あり）", () => {
    // Given
    const ws = enterRoom("ready");
    const sendSpy = vi.spyOn(ws, "send");
    // When
    fireEvent.click(screen.getByTestId("lobby:onStartSession"));
    // Then
    const sent = sendSpy.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(sent.map((m) => m.command)).toEqual(["phase.set", "session.act"]);
    expect(sent[0].phase).toBe("session");
    expect(sent[1].action).toBe("START");
  });
});

describe("App が子画面へ渡すコールバックと WS コマンドの対応（セッション）", () => {
  it.each(SESSION_CASES)("%s は期待するフレームをちょうど1通送る", (prop, expected) => {
    // Given
    const ws = enterRoom("session");
    const sendSpy = vi.spyOn(ws, "send");
    // When
    fireEvent.click(screen.getByTestId(`session:${prop}`));
    // Then
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sentFrames(sendSpy)[0]).toEqual(expected);
  });

  it("onRegenerateProblem は problem.request を requestId の接頭辞 req-ROOM01-regen- で送る", () => {
    // Given
    const ws = enterRoom("session");
    const sendSpy = vi.spyOn(ws, "send");
    // When
    fireEvent.click(screen.getByTestId("session:onRegenerateProblem"));
    // Then
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const sent = sentFrames(sendSpy)[0]!;
    expect(sent.command).toBe("problem.request");
    expect(sent.requestId).toMatch(/^req-ROOM01-regen-/);
  });

  it("onAddProxy は participant.addProxy を proxy- で始まる participantId で送る", () => {
    // Given
    const ws = enterRoom("session");
    const sendSpy = vi.spyOn(ws, "send");
    // When
    fireEvent.click(screen.getByTestId("session:onAddProxy"));
    // Then
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const sent = sentFrames(sendSpy)[0]!;
    expect(sent.command).toBe("participant.addProxy");
    expect(sent.participantId).toMatch(/^proxy-/);
    expect(sent.displayName).toBe("代理さん");
  });

  it("session.act の action は押した操作ごとに違う", () => {
    // Given
    const ws = enterRoom("session");
    const sendSpy = vi.spyOn(ws, "send");
    // When
    for (const prop of ["onSkip", "onPause", "onResume", "onRestartTimer"]) {
      fireEvent.click(screen.getByTestId(`session:${prop}`));
    }
    // Then
    const actions = sendSpy.mock.calls
      .map((c) => JSON.parse(String(c[0])))
      .filter((m) => m.command === "session.act")
      .map((m) => m.action);
    expect(actions).toEqual(["SWITCH", "PAUSE", "RESUME", "RESTART"]);
  });

  it("driver.skip と driver.resume は取り違えていない", () => {
    // Given
    const ws = enterRoom("session");
    const sendSpy = vi.spyOn(ws, "send");
    // When
    fireEvent.click(screen.getByTestId("session:onDriverSkip"));
    fireEvent.click(screen.getByTestId("session:onDriverResume"));
    // Then
    const sent = sendSpy.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(sent.map((m) => m.command)).toEqual(["driver.skip", "driver.resume"]);
    expect(sent.every((m) => m.participantId === OTHER_ID)).toBe(true);
  });
});
