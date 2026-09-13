/**
 * ツール状態の遅延生成と、合言葉の関門（#95 S5b・#248）。
 *
 * S4a では**入口ごとの門**（`application/tool-gate.ts`）が越境を止めていた ——
 * 「そのツールの状態があるルームにだけ入れる」。名簿を 1 つにしたことでルームコードの
 * 空間が両ツールで共有され、合言葉を持たない poker の入口から timer の保護ルームへ
 * 入れてしまったためである（ADR 0011 決定 2 の S4a 追記）。
 *
 * **S5b でその門を廃止する。** ツール状態はそのツールへ初めて入ったときに作り（D8）、
 * 越境の遮断は**合言葉をルーム参加の唯一の関門にする**ことで達成する。
 * poker の入口は合言葉を送れないので、**保護ルームへの新規参加はハブ経由だけ**になる。
 *
 * このファイルは「門が守っていたものが、門を外しても守られているか」を実 WS で見る。
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createRoom,
  startLiveSyncServer,
  type LiveHubClient,
  type LivePokerClient,
  type LiveSyncServer,
} from "./support/live-sync-server.js";

let server: LiveSyncServer;

beforeEach(() => {
  server = startLiveSyncServer();
});
afterEach(async () => {
  await server.close();
});

/** ハブでルームを作り、コードと復帰の組を返す。 */
async function hubCreate(
  hub: LiveHubClient,
  roomName: string,
  displayName: string,
): Promise<{ code: string; participantId: string; resumeToken: string }> {
  hub.send({ command: "room.create", roomName, displayName });
  const msg = await hub.take((m) => m.type === "room.created", "room.created");
  if (msg.type !== "room.created") throw new Error("room.created ではない");
  return { code: msg.code, participantId: msg.participantId, resumeToken: msg.resumeToken };
}

/** poker の入口でルームを作り、ルーム ID と復帰トークンを返す。 */
async function pokerCreate(
  poker: LivePokerClient,
  name: string,
): Promise<{ roomId: string; token: string }> {
  poker.send({ type: "create-room", name });
  const msg = await poker.take((m) => m.type === "joined", "joined");
  if (msg.type !== "joined") throw new Error("joined ではない");
  return { roomId: msg.roomId, token: msg.token };
}

describe("ツール状態の遅延生成（#95 S5b）", () => {
  it("Given ハブで作ったルーム / When poker の入口から入る / Then ラウンドが生まれて参加できる", async () => {
    // Given: 選択画面でルームを作る（**timer の状態も poker のラウンドも作らない**）
    const hub = await server.connectHub();
    const created = await hubCreate(hub, "朝会モブ", "あや");

    // When: 選択画面から poker を選んだのと同じ経路で入る
    const poker = await server.connectPoker("poker");
    poker.send({
      type: "join-room",
      roomId: created.code,
      name: "あや",
      token: created.resumeToken,
    });

    // Then: 票を入れられる状態（voting のラウンド）が届く
    const reply = await poker.take(
      (m) => m.type === "room-state" || m.type === "error",
      "poker からの参加の応答",
    );
    expect(reply.type).toBe("room-state");
  });

  it("Given poker の入口で作ったルーム / When timer の入口から入る / Then タイマーが生まれて参加できる", async () => {
    // Given: poker の旧入口でルームを作る（timer の状態は無い）
    const poker = await server.connectPoker("poker");
    const room = await pokerCreate(poker, "あや");

    // When: 同じコードへ timer の入口から入る
    const timer = await server.connect("timer");
    timer.send({ command: "room.join", code: room.roomId, displayName: "いずみ", hasAiKey: false });

    // Then: snapshot が届く（門が閉じていれば ROOM_NOT_FOUND になっていた）
    const reply = await timer.takeMatching(
      (m) => m.type === "snapshot" || m.type === "error",
      "timer からの参加の応答",
    );
    expect(reply.type).toBe("snapshot");
  });

  it("Given ハブで作ったルーム / When 誰もツールへ入らない / Then タイマーもラウンドも作られない", async () => {
    // Given: 選択画面へ繋ぐ
    const hub = await server.connectHub();

    // When: ルームを作るだけで、どのツールも開かない
    const created = await hubCreate(hub, "朝会モブ", "あや");
    await hub.take((m) => m.type === "roster", "roster");

    // Then: ツールの状態は 1 つも無い（D8: ルーム作成時には作らない）
    expect(server.hasTimerState(created.code)).toBe(false);
    expect(server.hasRound(created.code)).toBe(false);
  });
});

describe("合言葉の関門（#95 S5b・門の置き換え）", () => {
  /** 合言葉を掛けた timer のルームを作り、コードを返す。 */
  async function protectedRoom(passphrase: string): Promise<string> {
    const owner = await server.connect("owner");
    const room = await createRoom(owner, "ぬし");
    owner.send({ command: "room.passphrase.set", passphrase });
    await owner.take("snapshot");
    return room.code;
  }

  it("Given 合言葉で保護されたルーム / When poker の入口から名前だけで入る / Then 存在しないルームと同じ応答で拒まれる", async () => {
    // Given: 合言葉を掛けたルーム（poker の入口には合言葉を送る手段が無い）
    const code = await protectedRoom("ひみつ");

    // When: 合言葉を知らない人が poker の入口から入ろうとする
    const poker = await server.connectPoker("stranger");
    poker.send({ type: "join-room", roomId: code, name: "よそもの" });

    const reply = await poker.take(
      (m) => m.type === "error" || m.type === "room-state",
      "poker からの参加の応答",
    );

    // Then: **どこにも無いコードへの応答と完全に同一**（違えば列挙の手がかりになる・ADR 0011）
    const stranger = await server.connectPoker("stranger-2");
    stranger.send({ type: "join-room", roomId: "zzzzzzzz", name: "よそもの" });
    const toNowhere = await stranger.take(() => true, "存在しないルームへの応答");

    expect(reply).toEqual(toNowhere);
    expect(reply).toMatchObject({ type: "error", code: "room-not-found" });
  });

  it("Given 合言葉で保護されたルーム / When 合言葉を通して得た組で poker へ入る / Then 参加できる", async () => {
    // Given: 合言葉を掛けたルームへ、ハブから合言葉を添えて参加する
    const code = await protectedRoom("ひみつ");
    const hub = await server.connectHub("guest");
    hub.send({ command: "room.join", code, displayName: "いずみ", passphrase: "ひみつ" });
    const joined = await hub.take((m) => m.type === "room.joined", "room.joined");
    if (joined.type !== "room.joined") throw new Error("room.joined ではない");

    // When: 選択画面から poker を選ぶ（復帰の組を持って行く）
    const poker = await server.connectPoker("guest-poker");
    poker.send({ type: "join-room", roomId: code, name: "いずみ", token: joined.resumeToken });

    // Then: 入れる（合言葉を一度通った人は、以後その組で入れる）
    const reply = await poker.take(
      (m) => m.type === "room-state" || m.type === "error",
      "poker からの参加の応答",
    );
    expect(reply.type).toBe("room-state");
  });

  it("Given 合言葉で保護されたルーム / When poker の入口で生死を尋ねる / Then 無いと答える", async () => {
    // Given: 合言葉を掛けたルーム
    const code = await protectedRoom("ひみつ");

    // When: 参加せずに生死だけを尋ねる（#76 J-1 の経路）
    const poker = await server.connectPoker("stranger");
    poker.send({ type: "check-room", roomId: code });

    const reply = await poker.take(() => true, "check-room への応答");

    // Then: **存在の神託にしない**（join と同じ関門を通す）。無音と room-not-found の
    //       差が出れば、そこから保護ルームの生死が漏れる
    const probe = await server.connectPoker("probe-fake");
    probe.send({ type: "check-room", roomId: "zzzzzzzz" });
    const toNowhere = await probe.take(() => true, "存在しないルームへの応答");

    expect(reply).toEqual(toNowhere);
    expect(reply).toMatchObject({ type: "error", code: "room-not-found" });
  });

  it("Given 合言葉のないルーム / When poker の入口で生死を尋ねる / Then 無音（生きている）", async () => {
    // Given: 合言葉を掛けていない timer のルーム（対照実行）
    const owner = await server.connect("owner");
    const room = await createRoom(owner, "ぬし");

    // When
    const poker = await server.connectPoker("asker");
    poker.send({ type: "check-room", roomId: room.code });

    // Then: 関門が「常に拒否」になっていないこと。無いときだけ応える契約なので、
    //       ここで room-not-found が返るなら選択画面からの導線が塞がっている
    const probe = await server.connectPoker("probe");
    probe.send({ type: "check-room", roomId: "zzzzzzzz" });
    await probe.take((m) => m.type === "error", "存在しないルームへの応答");
    expect(poker.received).toEqual([]);
  });
});
