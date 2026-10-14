/**
 * wire のコマンド → ドメインのコマンドの翻訳（`buildDomainCommand`）の特性テスト（#363 Task 1）。
 *
 * 翻訳は DDD の腐敗防止層にあたる。wire のコマンド（`RoomScopedCommand`。境界で検証済み）を、
 * `decide` が受けるドメインのコマンドへ写す。サーバーが後で埋める値（`driver.assign` の
 * `index`・`session.complete` の `topicTitle`・`session.act` の `ineligible`）は仮の値で返す。
 *
 * **翻訳が持つ、ここで初めて固定する知識**: wire の `session.act` は `action` に 7 つを受けるが、
 * ドメインが扱うのは 5 つで、`COMPLETE`・`RESET` は `null`（→ UNKNOWN_COMMAND）になる。
 *
 * 表のキーは `RoomScopedCommand["command"]` の全てである（`Record` の型が網羅を強いる）。
 * wire にコマンドが増えたら、ここで翻訳を決めるまで型検査が落ちる。
 */
import { describe, it, expect } from "bun:test";
import { buildDomainCommand } from "../src/application/build-domain-command.js";
import type { RoomScopedCommand } from "../src/application/handlers.js";

type Case = { readonly input: RoomScopedCommand; readonly expected: ReturnType<typeof buildDomainCommand> };

const TRANSLATIONS: Record<RoomScopedCommand["command"], readonly Case[]> = {
  "session.act": [
    ...(["START", "SWITCH", "PAUSE", "RESUME", "RESTART"] as const).map((action) => ({
      input: { command: "session.act" as const, action },
      expected: { command: "session.act" as const, action, ineligible: undefined },
    })),
    // wire は受けるが、ドメインは扱わない（UNKNOWN_COMMAND になる）
    { input: { command: "session.act", action: "COMPLETE" }, expected: null },
    { input: { command: "session.act", action: "RESET" }, expected: null },
  ],
  "session.complete": [
    // タイトルは保管から後で埋める（#91・spec T9）
    { input: { command: "session.complete" }, expected: { command: "session.complete", topicTitle: null } },
  ],
  "session.abort": [{ input: { command: "session.abort" }, expected: { command: "session.abort" } }],
  "session.reset": [{ input: { command: "session.reset" }, expected: { command: "session.reset" } }],
  "config.set": [
    {
      input: { command: "config.set", config: { intervalMinutes: 5 } },
      expected: { command: "config.set", config: { intervalMinutes: 5 } },
    },
  ],
  "phase.set": [
    { input: { command: "phase.set", phase: "ready" }, expected: { command: "phase.set", phase: "ready" } },
  ],
  "member.add": [
    { input: { command: "member.add", participantId: "p1" }, expected: { command: "member.add", participantId: "p1" } },
  ],
  "member.remove": [
    { input: { command: "member.remove", index: 2 }, expected: { command: "member.remove", index: 2 } },
  ],
  "member.move": [
    {
      input: { command: "member.move", fromIndex: 0, toIndex: 3 },
      expected: { command: "member.move", fromIndex: 0, toIndex: 3 },
    },
  ],
  // 順列はサーバーが生成する（handleRoomCommand が翻訳の手前で組む）
  "member.shuffle": [{ input: { command: "member.shuffle" }, expected: null }],
  "handoff.note.set": [
    {
      input: { command: "handoff.note.set", text: "次はテストから" },
      expected: { command: "handoff.note.set", text: "次はテストから" },
    },
  ],
  // wire スキーマには残るが処理しない（UNKNOWN_COMMAND。live-ws.errors.test.ts）
  "break.start": [{ input: { command: "break.start" }, expected: null }],
  "break.end": [{ input: { command: "break.end" }, expected: null }],
  "participant.addProxy": [
    {
      input: { command: "participant.addProxy", participantId: "x1", displayName: "代理" },
      expected: { command: "participant.addProxy", displayName: "代理", participantId: "x1" },
    },
  ],
  "participant.rename": [
    {
      input: { command: "participant.rename", participantId: "p1", displayName: "新しい名前" },
      expected: { command: "participant.rename", participantId: "p1", displayName: "新しい名前" },
    },
  ],
  // 名簿（Room レベル）の操作で、decide を通らない（handleRoomCommand の専用処理）
  "participant.remove": [{ input: { command: "participant.remove", participantId: "p1" }, expected: null }],
  "room.passphrase.set": [{ input: { command: "room.passphrase.set", passphrase: "aikotoba" }, expected: null }],
  "driver.skip": [
    { input: { command: "driver.skip", participantId: "p1" }, expected: { command: "driver.skip", participantId: "p1" } },
  ],
  "driver.resume": [
    {
      input: { command: "driver.resume", participantId: "p1" },
      expected: { command: "driver.resume", participantId: "p1" },
    },
  ],
  // index は参加者 ID から後で解決する（-1 は仮の値）
  "driver.assign": [
    { input: { command: "driver.assign", participantId: "p1" }, expected: { command: "driver.assign", index: -1 } },
  ],
};

describe("buildDomainCommand（wire → ドメインの翻訳）", () => {
  for (const [name, cases] of Object.entries(TRANSLATIONS)) {
    for (const { input, expected } of cases) {
      it(`Given wire の ${name}（${JSON.stringify(input)}）/ When 翻訳する / Then ${JSON.stringify(expected)}`, () => {
        // Given: 境界で検証済みの wire のコマンド
        const cmd = input;
        // When
        const domain = buildDomainCommand(cmd);
        // Then
        expect(domain).toEqual(expected);
      });
    }
  }
});
