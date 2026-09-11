/**
 * 名簿のドメイン（#95 S4a で新設、S4b で多接続模型へ）。
 *
 * **在席と presence は参加者の欄ではなく `connections` からの導出である**（D14）。
 * ここで固定するのは「導出であること」そのもの —— 欄として持たせた瞬間に、
 * 接続の着脱と欄の更新がずれる経路ができる。
 */
import { describe, expect, it } from "vitest";
import {
  addParticipant,
  attachConnection,
  connectionsIn,
  findParticipant,
  findParticipantByConnId,
  hasNoParticipants,
  isPresentIn,
  presenceOf,
  removeConnection,
  removeParticipant,
  type Participant,
  type Room,
} from "../src/room";

/** timer に 1 本繋いでいるアリス。 */
const alice: Participant = {
  id: "p_alice",
  displayName: "アリス",
  connections: new Map([["c1", "timer"]]),
  joinedAt: 1000,
};

const room: Room = { code: "mob-a1b2c3d4", createdAt: 500, participants: [alice] };

/** timer に 1 本繋いでいるボブ。 */
const bob: Participant = {
  ...alice,
  id: "p_bob",
  displayName: "ボブ",
  connections: new Map([["c2", "timer"]]),
};

describe("名簿の操作", () => {
  it("参加者を ID で引ける", () => {
    expect(findParticipant(room, "p_alice")).toEqual(alice);
  });

  it("居ない ID を引くと undefined を返す", () => {
    expect(findParticipant(room, "p_bob")).toBeUndefined();
  });

  it("参加者を足しても元の Room を書き換えない", () => {
    // Given: アリス 1 人の名簿
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

  it("名簿が空かどうかを判定できる", () => {
    expect(hasNoParticipants(room)).toBe(false);
    expect(hasNoParticipants({ ...room, participants: [] })).toBe(true);
  });
});

describe("接続を引く", () => {
  it("接続 ID から持ち主を引ける", () => {
    expect(findParticipantByConnId(room, "c1")?.id).toBe("p_alice");
  });

  it("知らない接続 ID では undefined を返す", () => {
    expect(findParticipantByConnId(room, "c9")).toBeUndefined();
  });

  it("2 本目の接続からも同じ持ち主を引ける", () => {
    // Given: アリスが timer とハブの 2 本を持つ
    const two: Room = {
      ...room,
      participants: [{ ...alice, connections: new Map([["c1", "timer"], ["c2", null]]) }],
    };

    // When / Then: どちらの接続からも同じ人に辿れる
    expect(findParticipantByConnId(two, "c1")?.id).toBe("p_alice");
    expect(findParticipantByConnId(two, "c2")?.id).toBe("p_alice");
  });
});

describe("在席（isPresentIn）", () => {
  it("接続が宣言したツールにだけ在席する", () => {
    expect(isPresentIn(alice, "timer")).toBe(true);
    expect(isPresentIn(alice, "poker")).toBe(false);
  });

  it("ハブ（tool: null）の接続はどのツールにも在席しない", () => {
    // これが R14 の要点である。**ハブに居る人は presence が online でも
    // timer に在席していない** —— offline だけを見る判定では捕まらない。
    // Given: ハブの接続だけを持つ人
    const inHub: Participant = { ...alice, connections: new Map([["c1", null]]) };

    // When / Then: online だが timer には在席していない
    expect(presenceOf(inHub)).toBe("online");
    expect(isPresentIn(inHub, "timer")).toBe(false);
  });

  it("2 つのツールに同時に在席できる（別タブ）", () => {
    // Given: timer と poker を別タブで開いている人
    const both: Participant = {
      ...alice,
      connections: new Map([["c1", "timer"], ["c2", "poker"]]),
    };

    // When / Then: どちらにも在席している
    expect(isPresentIn(both, "timer")).toBe(true);
    expect(isPresentIn(both, "poker")).toBe(true);
  });

  it("接続が無ければどのツールにも在席しない", () => {
    const gone: Participant = { ...alice, connections: new Map() };
    expect(isPresentIn(gone, "timer")).toBe(false);
  });
});

describe("presence（presenceOf）", () => {
  it("接続が 1 本でもあれば online", () => {
    expect(presenceOf(alice)).toBe("online");
  });

  it("接続が無ければ offline", () => {
    expect(presenceOf({ ...alice, connections: new Map() })).toBe("offline");
  });

  // R17: 1 人の参加者が複数の接続を持つ間、いずれかが生きている限り在室として扱う。
  it("2 本のうち 1 本を閉じても online のままである（R17）", () => {
    // Given: アリスが 2 本（timer と ハブ）繋いでいる
    const two: Room = {
      ...room,
      participants: [{ ...alice, connections: new Map([["c1", "timer"], ["c2", null]]) }],
    };

    // When: ハブの接続だけを閉じる
    const next = removeConnection(two, "c2");

    // Then: online のままで、timer の在席も保たれる
    const after = findParticipant(next, "p_alice")!;
    expect(presenceOf(after)).toBe("online");
    expect(isPresentIn(after, "timer")).toBe(true);
  });

  it("最後の接続を閉じると offline になるが、名簿からは消えない（§3.13）", () => {
    // Given: 接続 1 本のアリスだけが居る名簿（このファイルの `room`）
    // When: 唯一の接続を閉じる
    const next = removeConnection(room, "c1");

    // Then: offline だが在室者としては残る（消える経路は明示的な退出だけ）
    expect(presenceOf(findParticipant(next, "p_alice")!)).toBe("offline");
    expect(next.participants).toHaveLength(1);
  });
});

describe("接続を結ぶ（attachConnection）", () => {
  it("接続を結ぶとその接続がツールを宣言した状態になる", () => {
    // Given: 接続の切れたアリス
    const offline: Room = { ...room, participants: [{ ...alice, connections: new Map() }] };

    // When: timer を宣言する接続を結ぶ
    const next = attachConnection(offline, "p_alice", "c9", "timer");

    // Then: online で timer に在席する
    const after = findParticipant(next, "p_alice")!;
    expect(presenceOf(after)).toBe("online");
    expect(isPresentIn(after, "timer")).toBe(true);
    expect([...after.connections.keys()]).toEqual(["c9"]);
  });

  it("接続を足しても前の接続を奪わない（2 タブが 1 人になる）", () => {
    // Given: timer に 1 本繋いでいるアリス
    // When: 2 本目（ハブ）を結ぶ
    const next = attachConnection(room, "p_alice", "c2", null);

    // Then: 2 本とも生きている
    const after = findParticipant(next, "p_alice")!;
    expect([...after.connections.keys()]).toEqual(["c1", "c2"]);
    expect(isPresentIn(after, "timer")).toBe(true);
  });

  it("同じ接続 ID を結び直すと宣言が上書きされ、本数は増えない（冪等）", () => {
    // Given: timer を宣言した接続 c1 を持つアリス
    // When: 同じ c1 で poker を宣言し直す
    const next = attachConnection(room, "p_alice", "c1", "poker");
    const after = findParticipant(next, "p_alice")!;
    expect(after.connections.size).toBe(1);
    expect(isPresentIn(after, "poker")).toBe(true);
    expect(isPresentIn(after, "timer")).toBe(false);
  });

  it("元の Room と Map を書き換えない", () => {
    // Given: 接続 1 本のアリス（このファイルの `room`）
    // When: 2 本目を結ぶ
    attachConnection(room, "p_alice", "c2", "timer");
    expect(alice.connections.size).toBe(1);
    expect([...alice.connections.keys()]).toEqual(["c1"]);
  });

  it("居ない参加者へ結んでも何も起きない", () => {
    expect(attachConnection(room, "p_ghost", "c9", "timer")).toEqual(room);
  });

  // 以下 2 本は「対象外の参加者はそのまま返す」側を守る。ここが潰れる
  // （全員へ update を当てる）と、1 人の着脱で名簿全員の接続が同じになる。
  it("結ぶ相手以外の接続は触らない", () => {
    // Given: 2 人ともそれぞれ 1 本ずつ繋いでいる
    const pair: Room = { ...room, participants: [alice, bob] };

    // When: アリスにだけ接続を足す
    const next = attachConnection(pair, "p_alice", "c9", "timer");
    expect([...findParticipant(next, "p_alice")!.connections.keys()]).toEqual(["c1", "c9"]);
    expect([...findParticipant(next, "p_bob")!.connections.keys()]).toEqual(["c2"]);
  });

  it("閉じる接続以外は触らない", () => {
    // Given: 2 人ともそれぞれ 1 本ずつ繋いでいる
    const pair: Room = { ...room, participants: [alice, bob] };

    // When: アリスの接続だけを閉じる
    const next = removeConnection(pair, "c1");
    expect(presenceOf(findParticipant(next, "p_alice")!)).toBe("offline");
    expect(presenceOf(findParticipant(next, "p_bob")!)).toBe("online");
  });
});

describe("接続を閉じる（removeConnection）", () => {
  it("知らない接続 ID を閉じても何も起きない", () => {
    expect(removeConnection(room, "c9")).toEqual(room);
  });

  it("元の Map を書き換えない", () => {
    removeConnection(room, "c1");
    expect(alice.connections.size).toBe(1);
  });
});

describe("配信先の解決（connectionsIn）", () => {
  it("そのツールに在席している接続だけを返す", () => {
    // Given（準備）: timer に居るアリス（2 本）・poker に居るボブ・ハブのキャロル
    const carol: Participant = {
      ...alice,
      id: "p_carol",
      displayName: "キャロル",
      connections: new Map([["c4", null]]),
    };
    const crowd: Room = {
      ...room,
      participants: [
        { ...alice, connections: new Map([["c1", "timer"], ["c1b", "timer"]]) },
        { ...bob, connections: new Map([["c3", "poker"]]) },
        carol,
      ],
    };

    // When / Then（操作）: timer の配信先はアリスの 2 本だけ
    expect(connectionsIn(crowd, "timer")).toEqual(["c1", "c1b"]);
    expect(connectionsIn(crowd, "poker")).toEqual(["c3"]);
  });

  it("誰も在席していなければ空を返す", () => {
    expect(connectionsIn({ ...room, participants: [] }, "timer")).toEqual([]);
  });
});
