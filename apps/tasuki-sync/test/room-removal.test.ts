/**
 * `planRemoval`（`src/application/room-removal.ts`）の単体テスト（#419・G-6）。
 *
 * 純関数なので、保管も配信も要らない。名簿と timer の状態は `aRoom()` で組んだものを渡す。
 * timer の入口を通した結果は `participant-remove.test.ts` などが見ているので、
 * ここでは「timer が無いときの扱い」と、分けた計算そのものの境界を見る。
 */
import { describe, expect, it } from "bun:test";
import { rotationEntryId } from "@tasuki/timer-core";
import { planRemoval } from "../src/application/room-removal.js";
import { aRoom } from "./support/room-builder.js";

const NOW = 2_000_000;

describe("planRemoval", () => {
  it("名簿 2 人・timer 無し: 名簿だけ外れて timer は undefined のまま", async () => {
    const { store, code, ids } = await aRoom().withParticipants("Bob").build();
    const membership = store.get(code)!;

    const outcome = planRemoval({ membership, timer: undefined }, ids["Bob"]!, NOW)._unsafeUnwrap();

    expect(outcome.kind).toBe("removed");
    if (outcome.kind !== "removed") throw new Error("unreachable");
    expect(outcome.timer).toBeUndefined();
    expect(outcome.membership.participants.map((p) => p.id)).toEqual([ids["Host"]!]);
  });

  it("名簿 1 人: 外すと destroy", async () => {
    const { store, timers, code, ids } = await aRoom().build();

    const withTimer = planRemoval(
      { membership: store.get(code)!, timer: timers.get(code) },
      ids["Host"]!,
      NOW,
    )._unsafeUnwrap();
    const withoutTimer = planRemoval(
      { membership: store.get(code)!, timer: undefined },
      ids["Host"]!,
      NOW,
    )._unsafeUnwrap();

    expect(withTimer).toEqual({ kind: "destroy" });
    expect(withoutTimer).toEqual({ kind: "destroy" });
  });

  it("名簿に居ない ID: PARTICIPANT_NOT_FOUND（timer の有無によらない）", async () => {
    const { store, timers, code } = await aRoom().withParticipants("Bob").build();
    const membership = store.get(code)!;

    expect(planRemoval({ membership, timer: undefined }, "nobody", NOW)._unsafeUnwrapErr()).toBe(
      "PARTICIPANT_NOT_FOUND",
    );
    expect(
      planRemoval({ membership, timer: timers.get(code) }, "nobody", NOW)._unsafeUnwrapErr(),
    ).toBe("PARTICIPANT_NOT_FOUND");
  });

  it("timer あり・席を持つ人を外すと、輪からも外れる", async () => {
    const { store, timers, code, ids } = await aRoom().withParticipants("Bob").build();
    const timer = timers.get(code)!;
    expect(timer.session.rotation.map(rotationEntryId)).toContain(ids["Bob"]!);

    const outcome = planRemoval({ membership: store.get(code)!, timer }, ids["Bob"]!, NOW)._unsafeUnwrap();

    if (outcome.kind !== "removed" || outcome.timer === undefined) throw new Error("removed と timer を期待");
    expect(outcome.timer.session.rotation.map(rotationEntryId)).not.toContain(ids["Bob"]!);
    expect(outcome.membership.participants.map((p) => p.id)).toEqual([ids["Host"]!]);
  });

  it("timer あり・唯一の席の持ち主を外すと、見学の人を繰り上げてから外す", async () => {
    // Host だけが輪に居て、Bob は名簿にだけ居る（見学）状態を作る: Bob の席を外す
    const { store, timers, code, ids } = await aRoom().withParticipants("Bob").build();
    const first = planRemoval({ membership: store.get(code)!, timer: timers.get(code) }, ids["Bob"]!, NOW)._unsafeUnwrap();
    if (first.kind !== "removed" || first.timer === undefined) throw new Error("removed と timer を期待");
    // 輪は Host だけ。名簿も Host だけだと destroy になるので、Bob を名簿へ戻して見学者にする
    const membership = { ...first.membership, participants: [...first.membership.participants, store.get(code)!.participants.find((p) => p.id === ids["Bob"]!)!] };

    const outcome = planRemoval({ membership, timer: first.timer }, ids["Host"]!, NOW)._unsafeUnwrap();

    if (outcome.kind !== "removed" || outcome.timer === undefined) throw new Error("removed と timer を期待");
    expect(outcome.timer.session.rotation.map(rotationEntryId)).toEqual([ids["Bob"]!]);
    expect(outcome.membership.participants.map((p) => p.id)).toEqual([ids["Bob"]!]);
  });
});

// `removeFromRoom`（handlers.ts）の二段目の守り。poker の dispatch も同じ検査をするが、
// dispatch を通らずに直接呼んでも、接続している人と自分自身は外せない（G-5）。
describe("removeFromRoom の二段目の守り", () => {
  it("接続を持つ人・自分自身は not-removable で、名簿は変わらない", async () => {
    // Host も Bob も timer に接続している（接続を持つ）
    const { handlers, store, code, ids } = await aRoom().withParticipants("Bob").build();

    expect(handlers.removeFromRoom(code, ids["Host"]!, ids["Bob"]!)._unsafeUnwrapErr()).toBe("not-removable");
    expect(handlers.removeFromRoom(code, ids["Host"]!, ids["Host"]!)._unsafeUnwrapErr()).toBe("not-removable");
    expect(store.get(code)!.participants).toHaveLength(2);
  });
});
