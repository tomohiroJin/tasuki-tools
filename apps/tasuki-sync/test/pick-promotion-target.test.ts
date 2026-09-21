/**
 * 輪の最後の席が抜けるときの繰り上げ先の選択（#290・D2）。
 *
 * **候補を必ず 2 人以上置く。** 1 人しか置かないと「誰でも繰り上げる」実装と
 * 区別が付かず、緑でも何も守らない。
 */
import { describe, it, expect } from "bun:test";
import { pickPromotionTarget } from "../src/application/pick-promotion-target.js";
import type { Participant } from "@tasuki/room-core";

const person = (
  id: string,
  joinedAt: number,
  online: boolean,
): Participant => ({
  id,
  displayName: id,
  connections: online ? new Map([[`c-${id}`, null]]) : new Map(),
  joinedAt,
});

describe("pickPromotionTarget", () => {
  it("在席の人を優先する（先に参加した離席者より後）", () => {
    // Given: 離席の Bob が先に、在席の Carol が後から参加している
    const participants = [person("bob", 100, false), person("carol", 200, true)];

    // When
    const picked = pickPromotionTarget(participants, new Set(), "alice");

    // Then: joinedAt では Bob が先だが、在席の Carol が選ばれる
    expect(picked?.id).toBe("carol");
  });

  it("在席が並ぶときは joinedAt の早い順で選ぶ", () => {
    // Given: どちらも在席で、Bob のほうが先に参加している
    const participants = [person("carol", 200, true), person("bob", 100, true)];

    // When
    const picked = pickPromotionTarget(participants, new Set(), "alice");

    // Then
    expect(picked?.id).toBe("bob");
  });

  it("全員が離席なら joinedAt の早い順で選ぶ", () => {
    // Given
    const participants = [person("carol", 200, false), person("bob", 100, false)];

    // When
    const picked = pickPromotionTarget(participants, new Set(), "alice");

    // Then
    expect(picked?.id).toBe("bob");
  });

  it("既に席を持つ人は候補にしない", () => {
    // Given: 在席の Carol は既に輪の席を持っている
    const participants = [person("bob", 100, false), person("carol", 200, true)];

    // When
    const picked = pickPromotionTarget(participants, new Set(["carol"]), "alice");

    // Then: 席を持たない Bob が選ばれる（在席優先より席の有無が先）
    expect(picked?.id).toBe("bob");
  });

  it("退出する本人は候補にしない", () => {
    // Given: 在席で最も早く参加しているのは、いま抜ける本人である
    const participants = [person("alice", 50, true), person("bob", 100, true)];

    // When
    const picked = pickPromotionTarget(participants, new Set(), "alice");

    // Then
    expect(picked?.id).toBe("bob");
  });

  it("候補が居なければ null を返す", () => {
    // Given: 名簿には抜ける本人しか居ない
    const participants = [person("alice", 50, true)];

    // When
    const picked = pickPromotionTarget(participants, new Set(), "alice");

    // Then
    expect(picked).toBeNull();
  });
});
