/**
 * ワイヤ形式のコマンド（`{ command: string; [key: string]: unknown }`）を
 * core の `DecideCommand` へ変換する（FR-161）。
 *
 * `handlers.ts` が抱えていた `buildDomainCommand`（付随定数 `VALID_ACTIONS`/
 * `VALID_PHASES` を含む）を、ロジックを変えずに1モジュールへ切り出したもの
 * （フェーズ4・純粋な移動）。
 */

import type { SessionConfig, ProblemMode } from "@tdd-mob/core";

// RESTART は「現ドライバーのまま持ち時間をやり直す」（Issue #14）。session.act として
// 受理するため権限は既存の EDITOR_PLUS_COMMANDS（session.act）がそのまま効く。
const VALID_ACTIONS = new Set(["START", "SWITCH", "PAUSE", "RESUME", "RESTART"]);
const VALID_PHASES = new Set(["setup", "ready", "session", "celebration"]);

export function buildDomainCommand(cmd: { command: string; [key: string]: unknown }) {
  switch (cmd.command) {
    case "session.act": {
      const action = cmd.action;
      if (typeof action !== "string" || !VALID_ACTIONS.has(action)) return null;
      // ineligible は SWITCH のときだけ handlers.ts 側で後から埋める（B-2統合）。
      // ここでは常に未設定の型付きプロパティとして持たせ、他コマンドと同様に
      // 呼び出し側での型安全な代入を可能にする。
      return {
        command: "session.act" as const,
        action: action as "START" | "SWITCH" | "PAUSE" | "RESUME" | "RESTART",
        ineligible: undefined as ReadonlySet<number> | undefined,
      };
    }
    case "session.complete":
      return { command: "session.complete" as const };
    case "session.reset":
      return { command: "session.reset" as const };
    case "config.set": {
      if (typeof cmd.config !== "object" || cmd.config === null) return null;
      // members は受け付けない（D6b）。core の ConfigSet は members から rotation を
      // 組み直すため、表示名の配列を通すと rotation が名前に戻り識別子の不変条件が壊れる。
      // 輪の出入りは member.add/remove/move・addProxy・participant.remove だけが担う。
      const { members: _ignored, ...config } = cmd.config as Partial<SessionConfig>;
      return { command: "config.set" as const, config };
    }
    case "member.add":
      // 誰を輪に並べるかは参加者IDで指す（D6b）。名前→IDの解決という曖昧さを発生源で消す。
      if (typeof cmd.participantId !== "string") return null;
      return { command: "member.add" as const, participantId: cmd.participantId };
    case "member.remove":
      if (typeof cmd.index !== "number") return null;
      return { command: "member.remove" as const, index: cmd.index };
    case "member.move":
      if (typeof cmd.fromIndex !== "number" || typeof cmd.toIndex !== "number") return null;
      return { command: "member.move" as const, fromIndex: cmd.fromIndex, toIndex: cmd.toIndex };
    case "phase.set": {
      const phase = cmd.phase;
      if (typeof phase !== "string" || !VALID_PHASES.has(phase)) return null;
      return { command: "phase.set" as const, phase: phase as "setup" | "ready" | "session" | "celebration" };
    }
    case "handoff.note.set":
      if (typeof cmd.text !== "string") return null;
      return { command: "handoff.note.set" as const, text: cmd.text };
    // ─── v2 新コマンド ─────────────────────────────────────────────────────
    case "session.abort":
      return { command: "session.abort" as const };
    case "participant.addProxy":
      if (typeof cmd.displayName !== "string" || typeof cmd.participantId !== "string") return null;
      return { command: "participant.addProxy" as const, displayName: cmd.displayName, participantId: cmd.participantId };
    case "participant.rename":
      if (typeof cmd.participantId !== "string" || typeof cmd.displayName !== "string") return null;
      // 表示名の一意性は呼び出し側（handleRoomCommand）が participants に対して検査する（T052）
      return { command: "participant.rename" as const, participantId: cmd.participantId, displayName: cmd.displayName };
    case "driver.skip":
      if (typeof cmd.participantId !== "string") return null;
      return { command: "driver.skip" as const, participantId: cmd.participantId };
    case "driver.resume":
      if (typeof cmd.participantId !== "string") return null;
      return { command: "driver.resume" as const, participantId: cmd.participantId };
    case "driver.assign":
      if (typeof cmd.participantId !== "string") return null;
      // index は handleRoomCommand が participantId から解決して埋める（-1 はプレースホルダ）。
      return { command: "driver.assign" as const, index: -1 };
    case "problem.edit":
      if (typeof cmd.patch !== "object" || cmd.patch === null) return null;
      return { command: "problem.edit" as const, patch: cmd.patch as { title?: string; description?: string; requirements?: string[]; exampleTest?: string; hints?: string[] } };
    case "problem.mode.set":
      if (cmd.mode !== "ai" && cmd.mode !== "fallback") return null;
      return { command: "problem.mode.set" as const, mode: cmd.mode as ProblemMode };
    default:
      return null;
  }
}
