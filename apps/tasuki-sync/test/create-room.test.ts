/**
 * ルームを作る（`application/create-room.ts`）の事後条件のテスト（#375）。
 *
 * **「返すコードは空いている」を確かめる。** 引き直しの上限まで使用中のコードしか
 * 出なかったときに最後のコードで先へ進むと、呼び出し側がそのコードで名簿を置き、
 * 既にあるルーム（参加者・トークン・状態）を上書きする。
 */

import { describe, it, expect } from "bun:test";
import { createRoom, type CreateRoomDeps } from "../src/application/create-room.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { createTokenStore } from "../src/application/token-store.js";
import type { RoomCodeGen } from "../src/ports/code-gen.js";

/** 候補を順に返す codeGen。尽きたら最後の候補を返し続ける。 */
function codeGenOf(candidates: readonly string[]): RoomCodeGen & { calls: () => number } {
  let i = 0;
  let id = 0;
  return {
    generate: () => candidates[Math.min(i++, candidates.length - 1)] ?? "",
    generateParticipantId: () => `pid-${++id}`,
    generateResumeToken: () => `rt-${++id}`,
    calls: () => i,
  };
}

function depsWith(codeGen: RoomCodeGen, store = new InMemoryRoomStore()): CreateRoomDeps {
  return {
    store,
    clock: new FakeClock(1000),
    codeGen,
    tokenStore: createTokenStore(),
    maxRooms: 100,
  };
}

const input = { connId: "conn-1", displayName: "Alice", tool: null } as const;

describe("createRoom: ルームのコードの事後条件（#375）", () => {
  it("Given いつも使用中のコードを返す codeGen / When 作る / Then 作らずに ROOM_LIMIT_EXCEEDED を返す", () => {
    // Given: TAKEN は既にあるルーム
    const store = new InMemoryRoomStore();
    store.put({ code: "TAKEN", createdAt: 0, participants: [] });
    const deps = depsWith(codeGenOf(["TAKEN"]), store);

    // When
    const result = createRoom(deps, input);

    // Then
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe("ROOM_LIMIT_EXCEEDED");
  });

  it("Given 使用中のコードが続いた後に空いたコードが出る / When 作る / Then 空いたコードで作る", () => {
    // Given: 5 回の引き直しのうち最後で空く（最初の 1 回 ＋ 引き直し 5 回 ＝ 6 回目）
    const store = new InMemoryRoomStore();
    store.put({ code: "TAKEN", createdAt: 0, participants: [] });
    const codeGen = codeGenOf(["TAKEN", "TAKEN", "TAKEN", "TAKEN", "TAKEN", "FREE"]);

    // When
    const result = createRoom(depsWith(codeGen, store), input);

    // Then
    expect(result._unsafeUnwrap().code).toBe("FREE");
    expect(codeGen.calls()).toBe(6);
  });

  it("Given 引き直しの上限を超えてようやく空く / When 作る / Then 上限で打ち切って作らない", () => {
    // Given: 7 回目で初めて空く。上限（6 回）では届かない
    const store = new InMemoryRoomStore();
    store.put({ code: "TAKEN", createdAt: 0, participants: [] });
    const codeGen = codeGenOf(["TAKEN", "TAKEN", "TAKEN", "TAKEN", "TAKEN", "TAKEN", "FREE"]);

    // When
    const result = createRoom(depsWith(codeGen, store), input);

    // Then
    expect(result._unsafeUnwrapErr()).toBe("ROOM_LIMIT_EXCEEDED");
    expect(codeGen.calls()).toBe(6);
  });
});
