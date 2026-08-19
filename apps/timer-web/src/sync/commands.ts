/**
 * WS コマンドの送信操作（#167 E4）。
 *
 * かつては App.tsx に 1 行の送信ラッパーが 21 本と、JSX の中に直書きが 6 箇所あった。
 * どれも「引数を command の形に載せて送る」だけで、React にも state にも依存しない。
 * ここへ集約することで、画面は「何を送るか」を知らずに「操作」だけを呼べる。
 *
 * **この module は純粋である。** `send` と `getRoom` を外から受け取り、
 * 自分では WebSocket も React も触らない。乱数・現在時刻を必要とする値
 * （代理参加者の ID・requestId）は呼び出し側が作って引数で渡す
 * （`docs/adr/0016` の「環境から直接値を読まない」と同じ向き）。
 */

import type { Problem, Room, SessionConfig } from "@tasuki/timer-core";

/** WS へ 1 フレーム送る関数。`SyncClient.send` をそのまま渡せる形にしてある。 */
export type SendFn = (cmd: Record<string, unknown>) => void;

export interface TimerCommands {
  /** 参加者IDでローテーションへ加える（冪等はサーバー側の重複ガードに委ねる・D6b）。 */
  addMember(participantId: string): void;
  /** ローテーションから外す。index は**呼び出し時**の snapshot から解決する。 */
  removeMember(participantId: string): void;
  removeParticipant(participantId: string): void;
  setRole(participantId: string, role: "editor" | "viewer"): void;
  transferHost(participantId: string): void;
  /** 空文字で解除。 */
  setPassphrase(passphrase: string): void;
  aiUnlock(key: string): void;
  setProblemMode(mode: "ai" | "fallback"): void;
  moveMember(fromIndex: number, toIndex: number): void;
  /** 順列はサーバーが生成するため wire は command のみ。 */
  shuffleMembers(): void;
  completeSession(): void;
  abortSession(): void;
  actSession(action: "START" | "SWITCH" | "PAUSE" | "RESUME" | "RESTART"): void;
  renameParticipant(participantId: string, displayName: string): void;
  driverSkip(participantId: string): void;
  driverResume(participantId: string): void;
  driverAssign(participantId: string): void;
  /** participantId は呼び出し側が生成する（乱数をこの module に持ち込まない）。 */
  addProxy(participantId: string, displayName: string): void;
  editProblem(patch: Partial<Omit<Problem, "source" | "edited">>): void;
  /** requestId は呼び出し側が組み立てる（現在時刻をこの module に持ち込まない）。 */
  requestProblem(requestId: string): void;
  setPhase(phase: Room["phase"]): void;
  setConfig(config: Partial<SessionConfig>): void;
  resetSession(): void;
  setHandoffNote(text: string): void;
}

export function createCommands(send: SendFn, getRoom: () => Room | null): TimerCommands {
  return {
    addMember: (participantId) => send({ command: "member.add", participantId }),
    removeMember: (participantId) => {
      // 描画時ではなく送信時の最新 snapshot から解決する。同時編集による index ずれで
      // 別人を外す事故を防ぐ（照合は参加者ID なので、同名の別人の枠は外れない）。
      const idx = getRoom()?.session.rotation.indexOf(participantId) ?? -1;
      if (idx >= 0) send({ command: "member.remove", index: idx });
    },
    removeParticipant: (participantId) => send({ command: "participant.remove", participantId }),
    setRole: (participantId, role) => send({ command: "role.set", participantId, role }),
    transferHost: (participantId) => send({ command: "host.transfer", participantId }),
    setPassphrase: (passphrase) => send({ command: "room.passphrase.set", passphrase }),
    aiUnlock: (key) => send({ command: "ai.unlock", key }),
    setProblemMode: (mode) => send({ command: "problem.mode.set", mode }),
    moveMember: (fromIndex, toIndex) => send({ command: "member.move", fromIndex, toIndex }),
    shuffleMembers: () => send({ command: "member.shuffle" }),
    completeSession: () => send({ command: "session.complete" }),
    abortSession: () => send({ command: "session.abort" }),
    actSession: (action) => send({ command: "session.act", action }),
    renameParticipant: (participantId, displayName) =>
      send({ command: "participant.rename", participantId, displayName }),
    driverSkip: (participantId) => send({ command: "driver.skip", participantId }),
    driverResume: (participantId) => send({ command: "driver.resume", participantId }),
    driverAssign: (participantId) => send({ command: "driver.assign", participantId }),
    addProxy: (participantId, displayName) =>
      send({ command: "participant.addProxy", participantId, displayName }),
    editProblem: (patch) => send({ command: "problem.edit", patch }),
    requestProblem: (requestId) => send({ command: "problem.request", requestId }),
    setPhase: (phase) => send({ command: "phase.set", phase }),
    setConfig: (config) => send({ command: "config.set", config }),
    resetSession: () => send({ command: "session.reset" }),
    setHandoffNote: (text) => send({ command: "handoff.note.set", text }),
  };
}
