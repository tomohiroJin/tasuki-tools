/**
 * ルームの生死だけを返す照会（#274）。
 *
 * **poker の `check-room` とは関門の扱いが逆である**（設計正本 D2）。
 * ここは合言葉の関門を通さない。通すと、合言葉を持つ正規の招待客に
 * 「存在しない」と答えることになる。保護ルームでも「在る」扱いになることは
 * `test/live-ws.hub.test.ts` が実プロトコル越しに見張る。
 */
import { describe, expect, it } from "bun:test";
import { checkRoom, type CheckRoomDeps } from "../src/application/check-room.js";

/** 指定したコードだけが在るストア。`checkRoom` は値の中身を見ないので空でよい。 */
function storeWith(codes: readonly string[]): CheckRoomDeps["store"] {
  return {
    get: (code: string) => (codes.includes(code) ? ({} as never) : undefined),
  };
}

/** 残量の有無を固定し、consume の回数を数えるゲート。 */
function gate(rejects: boolean): CheckRoomDeps["rateLimitGate"] & { consumed: () => number } {
  let consumed = 0;
  return {
    shouldReject: () => rejects,
    consume: () => {
      consumed += 1;
    },
    consumed: () => consumed,
  };
}

describe("ルームの生死の照会", () => {
  it("Given 在るルーム / When 照会する / Then 何も返さない", () => {
    const g = gate(false);

    const result = checkRoom({ store: storeWith(["朝会モブ-a1b2"]), rateLimitGate: g }, {
      connId: "conn-1",
      code: "朝会モブ-a1b2",
    });

    expect(result.isOk()).toBe(true);
    // **在るときはバケツを使わない。** 正常な招待客が枠を食うと、
    // 同じ NAT の後続が弾かれる
    expect(g.consumed()).toBe(0);
  });

  it("Given 無いルーム / When 照会する / Then ROOM_NOT_FOUND を返し、バケツを消費する", () => {
    const g = gate(false);

    const result = checkRoom({ store: storeWith([]), rateLimitGate: g }, {
      connId: "conn-1",
      code: "zzzzzzzz",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("ROOM_NOT_FOUND");
    expect(g.consumed()).toBe(1);
  });

  it("Given 残量が無い / When 照会する / Then ストアを引かずに JOIN_RATE_LIMITED を返す", () => {
    // **順序が肝である**（#103 設計正本 D3）。照会してから判定すると、
    // 残量が無いときに ROOM_NOT_FOUND が返り、攻撃者はトークンを消費せずに
    // 存在確認を続けられる
    let looked = 0;
    const store: CheckRoomDeps["store"] = {
      get: () => {
        looked += 1;
        return undefined;
      },
    };

    const result = checkRoom({ store, rateLimitGate: gate(true) }, {
      connId: "conn-1",
      code: "zzzzzzzz",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe("JOIN_RATE_LIMITED");
    expect(looked, "残量が無いのにストアを引いた").toBe(0);
  });
});
