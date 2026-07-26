/**
 * checkPermission / isAllowed のテスト（Issue #22: 開始後は全員同格）
 *
 * 判定表を「段階（未開始/開始済み）× 役割（host/editor/viewer）× 対象（自分/他人）」で
 * 表駆動にテストする。境界（HOST_ONLY 13 件・default-deny）は目視に頼らず1件ずつ固定する。
 */

import { describe, it, expect } from "vitest";
import {
  checkPermission,
  isAllowed,
  type PermissionInput,
  type Role,
} from "../src/permissions.js";

/** テスト用の入力を組み立てる小ヘルパー。差分だけを書けば済むようにする。 */
function input(overrides: Partial<PermissionInput> & { command: string }): PermissionInput {
  return {
    role: "editor",
    started: false,
    isSelfTarget: false,
    ...overrides,
  };
}

describe("checkPermission — 判定表の基本（T001）", () => {
  it("開始後は editor が driver.assign を実行できる", () => {
    const verdict = checkPermission(
      input({ command: "driver.assign", role: "editor", started: true, isSelfTarget: false }),
    );

    expect(verdict.allowed).toBe(true);
  });

  it("開始前は editor が driver.assign を実行できない", () => {
    const verdict = checkPermission(
      input({ command: "driver.assign", role: "editor", started: false, isSelfTarget: false }),
    );

    expect(verdict.allowed).toBe(false);
  });

  it("viewer は他人対象の操作を実行できない", () => {
    const verdict = checkPermission(
      input({ command: "session.abort", role: "viewer", started: true, isSelfTarget: false }),
    );

    expect(verdict.allowed).toBe(false);
  });

  it("viewer は自分対象の participant.rename を実行できる", () => {
    const verdict = checkPermission(
      input({
        command: "participant.rename",
        role: "viewer",
        started: false,
        isSelfTarget: true,
      }),
    );

    expect(verdict.allowed).toBe(true);
  });
});

/**
 * T002: HOST_ONLY_BEFORE_START 13 コマンド全件のテスト。
 * ループで一括せず、1件ずつ明示して網羅が読み取れる形にする。
 */
describe("checkPermission — HOST_ONLY_BEFORE_START 13コマンド全件（T002）", () => {
  function expectHostOnlyBeforeStartThenEditorPlusAfterStart(command: string): void {
    // 開始前は host のみ実行できる
    expect(
      checkPermission(input({ command, role: "host", started: false, isSelfTarget: false }))
        .allowed,
    ).toBe(true);
    expect(
      checkPermission(input({ command, role: "editor", started: false, isSelfTarget: false }))
        .allowed,
    ).toBe(false);

    // 開始後は editor も実行できる
    expect(
      checkPermission(input({ command, role: "editor", started: true, isSelfTarget: false }))
        .allowed,
    ).toBe(true);
    expect(
      checkPermission(input({ command, role: "host", started: true, isSelfTarget: false }))
        .allowed,
    ).toBe(true);
  }

  it("session.complete", () => {
    expectHostOnlyBeforeStartThenEditorPlusAfterStart("session.complete");
  });

  it("session.abort", () => {
    expectHostOnlyBeforeStartThenEditorPlusAfterStart("session.abort");
  });

  it("session.reset", () => {
    expectHostOnlyBeforeStartThenEditorPlusAfterStart("session.reset");
  });

  it("phase.set", () => {
    expectHostOnlyBeforeStartThenEditorPlusAfterStart("phase.set");
  });

  it("role.set", () => {
    expectHostOnlyBeforeStartThenEditorPlusAfterStart("role.set");
  });

  it("room.passphrase.set", () => {
    expectHostOnlyBeforeStartThenEditorPlusAfterStart("room.passphrase.set");
  });

  it("ai.unlock", () => {
    expectHostOnlyBeforeStartThenEditorPlusAfterStart("ai.unlock");
  });

  it("host.transfer", () => {
    expectHostOnlyBeforeStartThenEditorPlusAfterStart("host.transfer");
  });

  it("participant.addProxy", () => {
    expectHostOnlyBeforeStartThenEditorPlusAfterStart("participant.addProxy");
  });

  it("participant.remove", () => {
    expectHostOnlyBeforeStartThenEditorPlusAfterStart("participant.remove");
  });

  it("member.move", () => {
    expectHostOnlyBeforeStartThenEditorPlusAfterStart("member.move");
  });

  it("member.shuffle", () => {
    expectHostOnlyBeforeStartThenEditorPlusAfterStart("member.shuffle");
  });

  it("driver.assign", () => {
    expectHostOnlyBeforeStartThenEditorPlusAfterStart("driver.assign");
  });
});

/**
 * T004: ROTATION_OWNERSHIP_COMMANDS（member.add / member.remove）の判定表全件。
 *
 * この2コマンドは層③（他人対象は host のみ・未開始時）と層①（EDITOR_PLUS による viewer 拒否）の
 * 両方を通る現行実装の性質を引き継ぐ。誤って SELF_SCOPED_COMMANDS に含めると
 * 「editor が他人のローテーションを未開始時に操作できる」（FR-066 違反）と
 * 「viewer が自分対象でも実行できる」（FR-067 違反）の2つの回帰が生じるため、
 * plan.md「期待される判定」の表12行を1件ずつ固定する。
 */
describe("checkPermission — ROTATION_OWNERSHIP_COMMANDS 判定表（T004）", () => {
  const ROTATION_OWNERSHIP_COMMANDS = ["member.add", "member.remove"] as const;

  for (const command of ROTATION_OWNERSHIP_COMMANDS) {
    it(`${command}: editor / 未開始 / 他人対象 → 拒否（FR-066）`, () => {
      const verdict = checkPermission(
        input({ command, role: "editor", started: false, isSelfTarget: false }),
      );
      expect(verdict.allowed).toBe(false);
    });

    it(`${command}: editor / 未開始 / 自分対象 → 許可`, () => {
      const verdict = checkPermission(
        input({ command, role: "editor", started: false, isSelfTarget: true }),
      );
      expect(verdict.allowed).toBe(true);
    });

    it(`${command}: host / 未開始 / 他人対象 → 許可`, () => {
      const verdict = checkPermission(
        input({ command, role: "host", started: false, isSelfTarget: false }),
      );
      expect(verdict.allowed).toBe(true);
    });

    it(`${command}: editor / 開始後 / 他人対象 → 許可`, () => {
      const verdict = checkPermission(
        input({ command, role: "editor", started: true, isSelfTarget: false }),
      );
      expect(verdict.allowed).toBe(true);
    });

    it(`${command}: viewer / 未開始 / 自分対象 → 拒否（FR-067）`, () => {
      const verdict = checkPermission(
        input({ command, role: "viewer", started: false, isSelfTarget: true }),
      );
      expect(verdict.allowed).toBe(false);
    });

    it(`${command}: viewer / 開始後 / 自分対象 → 拒否（現行挙動の維持。D3b で自己編集者復帰できるため詰まない）`, () => {
      const verdict = checkPermission(
        input({ command, role: "viewer", started: true, isSelfTarget: true }),
      );
      expect(verdict.allowed).toBe(false);
    });
  }
});

/**
 * HIGH-1: isAllowed() の戻り値そのものを検証する。
 * checkPermission() のラッパーだが、UI が実際に呼ぶのは isAllowed() であり、
 * これ自体がテストされていないとカバレッジの Funcs が 100% にならない。
 */
describe("isAllowed（HIGH-1）", () => {
  it("許可される入力に対して true を返す", () => {
    expect(
      isAllowed(input({ command: "driver.assign", role: "editor", started: true })),
    ).toBe(true);
  });

  it("拒否される入力に対して false を返す", () => {
    expect(
      isAllowed(input({ command: "driver.assign", role: "editor", started: false })),
    ).toBe(false);
  });
});

/**
 * HIGH-2: ステップ2（自己対象 role.set・開始後）の分岐テスト。
 * D3b / FR-073b（見学者だけが残る詰みの解消）の要となる分岐であり、未カバーだった。
 */
describe("checkPermission — 自己対象 role.set（HIGH-2・ステップ2）", () => {
  it("開始後・viewer・自己対象の role.set は許可される", () => {
    const verdict = checkPermission(
      input({ command: "role.set", role: "viewer", started: true, isSelfTarget: true }),
    );
    expect(verdict.allowed).toBe(true);
  });

  it("開始前・viewer・自己対象の role.set は拒否される", () => {
    const verdict = checkPermission(
      input({ command: "role.set", role: "viewer", started: false, isSelfTarget: true }),
    );
    expect(verdict.allowed).toBe(false);
  });

  it("開始後・editor・他人対象の role.set は許可される", () => {
    const verdict = checkPermission(
      input({ command: "role.set", role: "editor", started: true, isSelfTarget: false }),
    );
    expect(verdict.allowed).toBe(true);
  });
});

/**
 * MEDIUM-1: participant.remove の自己対象（自己退出・FR-079）が未テストだった。
 * 開始前・viewer・自分対象でも自己退出は許可されることを明示する。
 */
describe("checkPermission — participant.remove の自己対象（MEDIUM-1・FR-079）", () => {
  it("開始前・viewer・自己対象の participant.remove（自己退出）は許可される", () => {
    const verdict = checkPermission(
      input({
        command: "participant.remove",
        role: "viewer",
        started: false,
        isSelfTarget: true,
      }),
    );
    expect(verdict.allowed).toBe(true);
  });
});

/**
 * T003: default-deny のテスト。
 * ルームスコープかつ到達可能な 25 コマンドが規則表に登録されていることを固定する。
 * 在室前の4件・到達不能な2件はテスト内の除外リストとして明示する（plan.md の区分に基づく）。
 *
 * MEDIUM-2: このテストは「規則表への登録漏れの検出」のみを目的とし、
 * 役割別の可否（誰が実行できるか）は保証しない。host が開始前後いずれかで
 * 許可されることだけを確認しており、editor/viewer の可否は他の describe が担う。
 */
describe("checkPermission — default-deny（T003）", () => {
  it('規則表に無いコマンド名（"unknown.command"）が拒否される', () => {
    const verdict = checkPermission(
      input({ command: "unknown.command", role: "host", started: true, isSelfTarget: false }),
    );

    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.code).toBe("UNAUTHORIZED");
    }
  });

  // 在室前の4件: checkPermission を通らないコマンド（対象外）
  const NOT_ROOM_SCOPED_COMMANDS = ["room.create", "room.join", "presence.ping", "time.ping"];

  // 到達不能な2件: buildDomainCommand に case がなく受理されない（v2.10 で休憩機能を撤去済み）
  const UNREACHABLE_COMMANDS = ["break.start", "break.end"];

  // schemas.ts の CommandSchema は全31件。31 - 4 - 2 = 25 がルームスコープ・到達可能な件数。
  const TOTAL_COMMANDS_IN_SCHEMA = 31;
  const EXPECTED_REGISTERED_COUNT =
    TOTAL_COMMANDS_IN_SCHEMA - NOT_ROOM_SCOPED_COMMANDS.length - UNREACHABLE_COMMANDS.length;

  // ルームスコープ・到達可能な25コマンド（規則表に登録されているはずの全件）
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
  ];

  it("除外リストの検算: 31 - 4 - 2 = 25 件である", () => {
    expect(EXPECTED_REGISTERED_COUNT).toBe(25);
    expect(ROOM_SCOPED_REACHABLE_COMMANDS).toHaveLength(EXPECTED_REGISTERED_COUNT);
  });

  it("ルームスコープかつ到達可能な25コマンドすべてが規則表に登録されている（default-denyされない）", () => {
    for (const command of ROOM_SCOPED_REACHABLE_COMMANDS) {
      // 役割・段階は「必ず許可され得る」組み合わせ（host・開始前後どちらでも通る道がある）を選ぶ。
      // ここでは isSelfTarget と started を変えて、少なくとも1通りが allowed になることを確認する。
      const beforeStart = checkPermission(
        input({ command, role: "host", started: false, isSelfTarget: false }),
      );
      const afterStart = checkPermission(
        input({ command, role: "host", started: true, isSelfTarget: false }),
      );

      // 規則表に無いコマンド（default-deny）は常に拒否される。
      // 登録済みコマンドなら、host は開始前後いずれかで必ず許可される。
      expect(beforeStart.allowed || afterStart.allowed).toBe(true);
    }
  });
});
