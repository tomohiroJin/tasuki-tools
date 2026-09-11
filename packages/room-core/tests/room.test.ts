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
    // Given: アリス 1 人の名簿
    const bob: Participant = { ...alice, id: "p_bob", displayName: "ボブ", connId: "c2" };
    // When: ボブを足す
    const next = addParticipant(room, bob);
    // Then: 返り値には 2 人居るが、元の Room は 1 人のままである
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
    // Given: 接続の切れたアリス
    const offline: Room = {
      ...room,
      participants: [{ ...alice, connId: null, presence: "offline" }],
    };
    // When: 新しい接続を結ぶ
    const next = attachConnection(offline, "p_alice", "c9");
    // Then: その接続 ID で online になる
    expect(findParticipant(next, "p_alice")).toMatchObject({ connId: "c9", presence: "online" });
  });

  it("接続を切ると offline になり connId が null になる", () => {
    const next = detachConnection(room, "p_alice");
    expect(findParticipant(next, "p_alice")).toMatchObject({ connId: null, presence: "offline" });
  });

  // 以下 2 本は `updateParticipant` の「対象外の参加者はそのまま返す」側を守る。
  // ここが潰れる（全員へ update を当てる）と、1 人の着脱で名簿全員の connId と
  // presence が同じ値になる。参加者 1 人の名簿では区別できないので 2 人で見る。
  it("接続を切っても、対象外の参加者は online と connId のままである", () => {
    // Given: 2 人とも online の名簿
    const bob: Participant = { ...alice, id: "p_bob", displayName: "ボブ", connId: "c2" };
    const pair: Room = { ...room, participants: [alice, bob] };

    // When: アリスの接続だけを切る
    const next = detachConnection(pair, "p_alice");

    // Then: ボブは触られない
    expect(findParticipant(next, "p_alice")).toMatchObject({ connId: null, presence: "offline" });
    expect(findParticipant(next, "p_bob")).toMatchObject({ connId: "c2", presence: "online" });
  });

  it("接続を結んでも、対象外の参加者は自分の connId と presence のままである", () => {
    // Given: アリスだけ接続が切れている名簿
    const bob: Participant = { ...alice, id: "p_bob", displayName: "ボブ", connId: "c2" };
    const pair: Room = {
      ...room,
      participants: [{ ...alice, connId: null, presence: "offline" }, bob],
    };

    // When: アリスにだけ接続を結ぶ
    const next = attachConnection(pair, "p_alice", "c9");

    // Then: ボブの connId と presence は自分のものから変わらない
    expect(findParticipant(next, "p_alice")).toMatchObject({ connId: "c9", presence: "online" });
    expect(findParticipant(next, "p_bob")).toMatchObject({ connId: "c2", presence: "online" });
  });

  it("名簿が空かどうかを判定できる", () => {
    expect(hasNoParticipants(room)).toBe(false);
    expect(hasNoParticipants({ ...room, participants: [] })).toBe(true);
  });
});
