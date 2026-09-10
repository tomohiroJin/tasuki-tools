import { describe, expect, it } from "vitest";
import {
  addParticipant,
  attachConnection,
  detachConnection,
  findParticipant,
  hasNoParticipants,
  removeParticipant,
  type Participant,
  type Room,
} from "../src/room";

const alice: Participant = {
  id: "p_alice",
  displayName: "アリス",
  connId: "c1",
  presence: "online",
  joinedAt: 1000,
};

const room: Room = { code: "mob-a1b2c3d4", createdAt: 500, participants: [alice] };

describe("名簿の操作", () => {
  it("参加者を ID で引ける", () => {
    expect(findParticipant(room, "p_alice")).toEqual(alice);
  });

  it("居ない ID を引くと undefined を返す", () => {
    expect(findParticipant(room, "p_bob")).toBeUndefined();
  });

  it("参加者を足しても元の Room を書き換えない", () => {
    const bob: Participant = { ...alice, id: "p_bob", displayName: "ボブ", connId: "c2" };
    const next = addParticipant(room, bob);
    expect(next.participants.map((p) => p.id)).toEqual(["p_alice", "p_bob"]);
    expect(room.participants).toHaveLength(1);
  });

  it("参加者を外すと名簿から消える", () => {
    const next = removeParticipant(room, "p_alice");
    expect(next.participants).toEqual([]);
  });

  it("居ない ID を外しても何も起きない", () => {
    expect(removeParticipant(room, "p_bob").participants).toEqual([alice]);
  });

  it("接続を結ぶと online になり connId が入る", () => {
    const offline: Room = {
      ...room,
      participants: [{ ...alice, connId: null, presence: "offline" }],
    };
    const next = attachConnection(offline, "p_alice", "c9");
    expect(findParticipant(next, "p_alice")).toMatchObject({ connId: "c9", presence: "online" });
  });

  it("接続を切ると offline になり connId が null になる", () => {
    const next = detachConnection(room, "p_alice");
    expect(findParticipant(next, "p_alice")).toMatchObject({ connId: null, presence: "offline" });
  });

  it("名簿が空かどうかを判定できる", () => {
    expect(hasNoParticipants(room)).toBe(false);
    expect(hasNoParticipants({ ...room, participants: [] })).toBe(true);
  });
});
