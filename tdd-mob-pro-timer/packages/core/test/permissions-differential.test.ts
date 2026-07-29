/**
 * checkPermission() の差分テスト（Issue #22）。
 *
 * 目的: 「開始前の判定は現行実装（`apps/sync/src/application/handlers.ts` の5層）と
 * 完全に一致する」ことが要件（FR-066）だが、現行の判定は5層に分散しており、
 * 人が突き合わせると必ず取りこぼす（実際に層⑤・層①・層②の見落としを3回起こした。
 * 直近では層②の3コマンドが5bから漏れる回帰が発生した）。
 *
 * そこで**参照実装（オラクル）を一度だけ書き下し**、全組み合わせで機械的に比較する。
 * 手による突き合わせを、このテストが完全に置き換える。
 *
 * オラクルの出典（この順で必ず両方適用する。詳細は下記オラクル関数のコメントを参照）:
 *   - 層②: handlers.ts:443-459（RELATIONAL_SELF_OR_HOST = 本人 or host）
 *   - 層③: handlers.ts:464-481（member.add / member.remove は非 host なら自分の分のみ）
 *   - 層①: handlers.ts:1078-1138（HOST_ONLY_COMMANDS は host のみ / EDITOR_PLUS_COMMANDS は viewer 拒否）
 *
 * 開始前（started: false）は上記オラクルと比較する。開始後（started: true）は
 * 緩和が入るため現行実装と一致しない。独立した述語で別途検証する。
 */

import { describe, it, expect } from "vitest";
import { checkPermission, type PermissionInput, type Role } from "../src/permissions.js";

// ─── 対象コマンド（ルームスコープかつ到達可能な25コマンド） ──────────────────────
// permissions.ts の REGISTERED_COMMANDS（規則表）と一致する。
// 在室前の4件（room.create / room.join / presence.ping / time.ping）は
// checkPermission を通らないため対象外（在室前提のコマンドではない）。
// 到達不能な2件（break.start / break.end）は buildDomainCommand に case が無く
// 受理されない（v2.10 で休憩機能を撤去済み・handlers.ts:93 のコメントが明言）ため対象外。
const ROOM_SCOPED_REACHABLE_COMMANDS = [
  "config.set",
  "phase.set",
  "problem.request",
  "problem.submit",
  "session.act",
  "session.complete",
  "session.abort",
  "session.reset",
  "member.add",
  "member.remove",
  "member.move",
  "member.shuffle",
  "handoff.note.set",
  "participant.addProxy",
  "participant.rename",
  "participant.remove",
  "driver.skip",
  "driver.resume",
  "driver.assign",
  "problem.edit",
  "problem.mode.set",
  "room.passphrase.set",
  "ai.unlock",
  "role.set",
  "host.transfer",
] as const;

const ROLES: readonly Role[] = ["host", "editor", "viewer"];
const SELF_TARGETS: readonly boolean[] = [true, false];

// ─── オラクル（参照実装。handlers.ts の現行ロジックの書き下し） ──────────────────

/**
 * 層②: handlers.ts:443-459 の RELATIONAL_SELF_OR_HOST。
 * participant.rename / driver.skip / driver.resume は「本人 or host」権限。
 */
const RELATIONAL_SELF_OR_HOST = new Set(["participant.rename", "driver.skip", "driver.resume"]);

/**
 * 層①: handlers.ts:1081-1092 の HOST_ONLY_COMMANDS（13件）。
 */
const HOST_ONLY_COMMANDS = new Set([
  "session.complete",
  "session.abort",
  "session.reset",
  "phase.set",
  "role.set",
  "room.passphrase.set",
  "ai.unlock",
  "host.transfer",
  "participant.addProxy",
  "participant.remove",
  "member.move",
  "member.shuffle",
  "driver.assign",
]);

/**
 * 層①: handlers.ts:1096-1106 の EDITOR_PLUS_COMMANDS（9件）。
 */
const EDITOR_PLUS_COMMANDS = new Set([
  "config.set",
  "member.add",
  "member.remove",
  "session.act",
  "problem.request",
  "problem.submit",
  "problem.edit",
  "problem.mode.set",
  "handoff.note.set",
]);

/**
 * オラクル本体: 現行実装（開始前・開始後の区別を持たない5層の判定）が、
 * 与えられた入力を許可するかどうかを返す。
 *
 * **重要（handlers.ts の制御フローを実際に読んで確認した根拠）:**
 * handlers.ts のハンドラでは、層②（443-459）・層③（464-481）は「失敗したら早期 return」
 * だが、**通過した場合は必ずその後 484 行目で authorize()（層①）が呼ばれる**。
 * つまり「層②③を通れば無条件許可」ではなく、「層②③はゲート、層①は追加のゲート」で
 * AND 条件になっている。この関数もその順序（層②③ → 層①）で両方を適用する。
 *
 * 層②③は現行実装が isSelfTarget（本人か否か）で判定する関係的権限であり、
 * 「対象の指定方法の違い」（participantId / 表示名 / rotation index）を本テストでは
 * `isSelfTarget` という抽象化済みの入力で受け取る（plan.md の resolver と同じ抽象化）。
 */
function oracleAllowsBeforeStart(command: string, role: Role, isSelfTarget: boolean): boolean {
  // 既知の意図的な逸脱（バグではない）: participant.remove の自己対象（自己退出）。
  // plan.md はこれを明記する: 「handlers.ts:497-503（participant.remove の自己対象拒否）は
  // 権限検査ではなく妥当性検査（INVALID）である」。したがってこの1件は本オラクルが再現する
  // 「5層の権限判定」の対象外であり、現行実装との一致要件（FR-066）の範囲外にある。
  // 新設計はここを FR-079 として意図的に緩和し、自己退出を役割によらず常に許可する
  // （permissions.ts の SELF_SCOPED_COMMANDS）。オラクルもこの意図的な仕様変更を期待値とする。
  if (command === "participant.remove" && isSelfTarget) {
    return true;
  }

  // 層②（handlers.ts:443-459）: 本人 or host。他人 かつ 非host なら即座に拒否して終わる
  // （早期 return と同じ効果。層①には到達しない＝この呼び出しはここで確定する）。
  if (RELATIONAL_SELF_OR_HOST.has(command)) {
    const isSelf = isSelfTarget;
    const isHost = role === "host";
    if (!isSelf && !isHost) {
      return false;
    }
    // 通過した場合（本人 or host）は、層①へ進む。
    // ただしこの3コマンドはどちらの層①集合にも属さないため、層①は常に許可を返す。
    return true;
  }

  // 層③（handlers.ts:464-481）: member.add / member.remove は非 host なら自分の分のみ。
  if (command === "member.add" || command === "member.remove") {
    if (role !== "host") {
      const ownsTarget = isSelfTarget;
      if (!ownsTarget) {
        return false;
      }
    }
    // 層③を通過（host、または非host かつ自分の分）しても、層①（EDITOR_PLUS_COMMANDS）で
    // viewer は拒否される。ここで早期 return せず、必ず層①に処理を委ねる。
  }

  // 層①（handlers.ts:1078-1138）: authorize()。
  if (HOST_ONLY_COMMANDS.has(command)) {
    return role === "host";
  }
  if (EDITOR_PLUS_COMMANDS.has(command)) {
    return role !== "viewer";
  }
  // どちらの集合にも属さないコマンドは authorize() が null（許可）を返す（fail-open）。
  return true;
}

// ─── 開始前 150 通り: オラクルと checkPermission を比較 ─────────────────────────

describe("checkPermission 差分テスト — 開始前（150通り、オラクルと比較）", () => {
  for (const command of ROOM_SCOPED_REACHABLE_COMMANDS) {
    for (const role of ROLES) {
      for (const isSelfTarget of SELF_TARGETS) {
        const label = `${command} / role=${role} / isSelfTarget=${isSelfTarget}`;

        it(`${label} → オラクルと一致する`, () => {
          // Given
          const input: PermissionInput = { command, role, started: false, isSelfTarget };
          // When
          const expected = oracleAllowsBeforeStart(command, role, isSelfTarget);
          const actual = checkPermission(input).allowed;
          // Then
          expect(actual, `不一致: ${label}（期待=${expected} 実際=${actual}）`).toBe(expected);
        });
      }
    }
  }
});

// ─── 開始後 150 通り: 独立した述語で検証（オラクルとは一致しない） ────────────────

/**
 * 対象が自分自身なら役割・段階を問わず常に許可されるコマンド（FR-068）。
 * permissions.ts の SELF_SCOPED_COMMANDS と同じ4件。
 */
const SELF_SCOPED_COMMANDS = new Set([
  "participant.rename",
  "driver.skip",
  "driver.resume",
  "participant.remove",
]);

/**
 * 開始後の期待される可否（独立した述語）。
 * - role !== "viewer" → 許可（FR-063/064/065: 開始後は編集者以上なら誰でも実行できる）
 * - role === "viewer" かつ自己対象かつ SELF_SCOPED_COMMANDS → 許可（既存挙動の維持）
 * - role === "viewer" かつ自己対象かつ role.set → 許可（D3b・FR-073b）
 * - それ以外（viewer） → 拒否
 */
function expectedAfterStart(command: string, role: Role, isSelfTarget: boolean): boolean {
  if (role !== "viewer") {
    return true;
  }
  if (isSelfTarget && SELF_SCOPED_COMMANDS.has(command)) {
    return true;
  }
  if (isSelfTarget && command === "role.set") {
    return true;
  }
  return false;
}

describe("checkPermission 差分テスト — 開始後（150通り、独立述語と比較）", () => {
  for (const command of ROOM_SCOPED_REACHABLE_COMMANDS) {
    for (const role of ROLES) {
      for (const isSelfTarget of SELF_TARGETS) {
        const label = `${command} / role=${role} / isSelfTarget=${isSelfTarget}`;

        it(`${label} → 開始後の期待述語と一致する`, () => {
          // Given
          const input: PermissionInput = { command, role, started: true, isSelfTarget };
          // When
          const expected = expectedAfterStart(command, role, isSelfTarget);
          const actual = checkPermission(input).allowed;
          // Then
          expect(actual, `不一致: ${label}（期待=${expected} 実際=${actual}）`).toBe(expected);
        });
      }
    }
  }
});

// ─── 組み合わせ数の検算 ─────────────────────────────────────────────────────

describe("checkPermission 差分テスト — 組み合わせ数の検算", () => {
  it("対象コマンドは25件である", () => {
    expect(ROOM_SCOPED_REACHABLE_COMMANDS).toHaveLength(25);
  });

  it("開始前・開始後それぞれ150通り（25 × 3 × 2）である", () => {
    const combinationCount = ROOM_SCOPED_REACHABLE_COMMANDS.length * ROLES.length * SELF_TARGETS.length;
    expect(combinationCount).toBe(150);
  });
});
