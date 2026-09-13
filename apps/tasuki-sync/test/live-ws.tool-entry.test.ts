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

/**
 * 退出した人の票を捨てる（R8・#95 S5b）。
 *
 * S4a では**到達経路が無かった** —— 入口ごとの門により 1 つのルームは片方のツールの
 * 状態しか持たず、名簿から人を消す `participant.remove` は timer 専用コマンドだった。
 * **S5b で 1 つのルームが両ツールを持てるようになった**ので、timer から外された人の票が
 * poker のラウンドに残る経路が生まれた。
 */
describe("退出で票を捨てる（R8・#95 S5b）", () => {
  it("Given 投票済みの 2 人 / When 片方が timer から外される / Then 票が消え、残りが全員投票済みなら公開される", async () => {
    // Given: ハブでルームを作った人が timer に居る（退出させる操作は timer の入口にある）
    const hub = await server.connectHub("host");
    const created = await hubCreate(hub, "見積もり", "あや");
    const timer = await server.connect("timer");
    timer.send({
      command: "room.join",
      code: created.code,
      displayName: "あや",
      hasAiKey: false,
      resumeToken: created.resumeToken,
    });
    await timer.take("snapshot");

    // Given: poker に 2 人居て、片方だけが投票している（未投票が 1 人なので公開されない）
    const voter = await server.connectPoker("voter");
    voter.send({ type: "join-room", roomId: created.code, name: "いずみ" });
    await voter.take((m) => m.type === "room-state", "参加後の room-state");
    const idle = await server.connectPoker("idle");
    idle.send({ type: "join-room", roomId: created.code, name: "かえで" });
    const idleJoined = await idle.take((m) => m.type === "joined", "joined");
    if (idleJoined.type !== "joined") throw new Error("joined ではない");
    voter.send({ type: "vote", card: { kind: "number", value: 5 } });
    const beforeRemoval = await voter.take(
      (m) => m.type === "room-state" && m.round.status === "voting",
      "投票後の room-state（まだ voting）",
    );
    if (beforeRemoval.type !== "room-state") throw new Error("room-state ではない");

    // When: 未投票の人を timer の入口から外す
    timer.send({ command: "participant.remove", participantId: idleJoined.participantId });

    // Then: 残った全員が投票済みになったので公開される（票の破棄が自動公開へ効く）
    const revealed = await voter.take(
      (m) => m.type === "room-state" && m.round.status === "revealed",
      "退出後の room-state（revealed）",
    );
    if (revealed.type !== "room-state" || revealed.round.status !== "revealed") {
      throw new Error("revealed ではない");
    }
    // 外された人は参加者一覧にも票にも残らない
    expect(revealed.participants.map((p) => p.id)).not.toContain(idleJoined.participantId);
    expect(revealed.round.votes.map((v) => v.participantId)).not.toContain(
      idleJoined.participantId,
    );
  });

  it("Given 公開済みのラウンド / When 投票した人が外される / Then その票が集計から消える", async () => {
    // Given: ハブで作ったルームに timer の人が 1 人、poker の人が 2 人居る
    const hub = await server.connectHub("host");
    const created = await hubCreate(hub, "見積もり", "あや");
    const timer = await server.connect("timer");
    timer.send({
      command: "room.join",
      code: created.code,
      displayName: "あや",
      hasAiKey: false,
      resumeToken: created.resumeToken,
    });
    await timer.take("snapshot");

    const leaving = await server.connectPoker("leaving");
    leaving.send({ type: "join-room", roomId: created.code, name: "いずみ" });
    const leavingJoined = await leaving.take((m) => m.type === "joined", "joined");
    if (leavingJoined.type !== "joined") throw new Error("joined ではない");
    const staying = await server.connectPoker("staying");
    staying.send({ type: "join-room", roomId: created.code, name: "かえで" });
    await staying.take((m) => m.type === "room-state", "参加後の room-state");

    // Given: 2 人とも投票して公開済み（集計に 2 票ある）
    leaving.send({ type: "vote", card: { kind: "number", value: 8 } });
    staying.send({ type: "vote", card: { kind: "number", value: 3 } });
    const revealed = await staying.take(
      (m) => m.type === "room-state" && m.round.status === "revealed",
      "全員投票後の room-state（revealed）",
    );
    if (revealed.type !== "room-state" || revealed.round.status !== "revealed") {
      throw new Error("revealed ではない");
    }
    expect(revealed.round.votes).toHaveLength(2);

    // When: 投票した人を timer の入口から外す
    timer.send({ command: "participant.remove", participantId: leavingJoined.participantId });

    // Then: 集計から 1 票消える（名簿に居ない人の票を残さない）
    const after = await staying.take(
      (m) =>
        m.type === "room-state" &&
        !m.participants.some((p) => p.id === leavingJoined.participantId),
      "退出後の room-state",
    );
    if (after.type !== "room-state" || after.round.status !== "revealed") {
      throw new Error("revealed ではない");
    }
    expect(after.round.votes).toHaveLength(1);
    expect(after.round.votes.map((v) => v.participantId)).not.toContain(
      leavingJoined.participantId,
    );
  });
});
