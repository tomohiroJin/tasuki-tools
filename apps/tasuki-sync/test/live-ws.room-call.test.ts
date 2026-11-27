/**
 * 全員を同じ道具へ呼ぶ `room.call`（#677）を実 WebSocket 越しに確かめる。
 *
 * in-process のテスト（`room-call.test.ts`・`hub-room-call.test.ts`）は規則を見る。ここは
 * 「WS アダプタ → ハブのメッセージ層 → 送る口 → 実ソケット」の配線が繋がっているか、特に
 * **知らせがハブ以外の道具の接続（timer・topic・poker）にも届くこと**と、**呼んだ本人には届かないこと**を見る。
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createRoom,
  joinRoom,
  startLiveSyncServer,
  type LiveClient,
  type LiveHubClient,
  type LivePokerClient,
  type LiveSyncServer,
  type LiveTopicClient,
} from "./support/live-sync-server.js";

let server: LiveSyncServer;

beforeEach(() => {
  server = startLiveSyncServer();
});
afterEach(async () => {
  await server.close();
});

interface Cast {
  code: string;
  /** 呼ぶ人（ハブ）。 */
  alice: LiveHubClient;
  /** timer に居る人。 */
  bob: LiveClient;
  /** ハブに居る人。 */
  carol: LiveHubClient;
  /** お題に居る人。 */
  dave: LiveTopicClient;
  /** poker に居る人。 */
  erin: LivePokerClient;
}

/** アリス（ハブ）がルームを作り、ボブ（timer）・キャロル（ハブ）・デイブ（お題）・エリン（poker）が入った状態。 */
async function cast(): Promise<Cast> {
  const alice = await server.connectHub("alice");
  alice.send({ command: "room.create", roomName: "朝会", displayName: "アリス" });
  const created = await alice.take((m) => m.type === "room.created", "room.created");
  if (created.type !== "room.created") throw new Error("room.created ではない");
  const code = created.code;

  const bob = await server.connect("bob");
  await joinRoom(bob, code, "ボブ");

  const carol = await server.connectHub("carol");
  carol.send({ command: "room.join", code, displayName: "キャロル" });
  await carol.take((m) => m.type === "room.joined", "キャロルの参加");

  const dave = await server.connectTopic("dave");
  dave.send({ command: "room.join", code, displayName: "デイブ" } as never);
  await dave.take((m: { type: string }) => m.type === "room.joined", "デイブの参加");

  const erin = await server.connectPoker("erin");
  erin.send({ type: "join-room", roomId: code, name: "エリン" });
  await erin.take((m) => m.type === "room-state", "エリンの参加");

  return { code, alice, bob, carol, dave, erin };
}

/** 受信の履歴に `room.call` の知らせがあるか。 */
function callsReceived(received: readonly { type: string }[]): { type: string }[] {
  return received.filter((m) => m.type === "room.call");
}

describe("ハブの room.call（実 WebSocket）", () => {
  it("Given 5 つの道具に人が居る / When アリスが timer 以外（agenda）へ呼ぶ / Then ほかの全員の接続へ名前つきの知らせが届き、アリス本人には知らせでなく受け付けだけが返る", async () => {
    const { alice, bob, carol, dave, erin } = await cast();

    alice.send({ command: "room.call", tool: "agenda" });

    const expected = { type: "room.call", call: { tool: "agenda", fromName: "アリス" } };
    const toHub = await carol.take((m) => m.type === "room.call", "キャロル（ハブ）への知らせ");
    expect(toHub).toMatchObject(expected);
    await bob.until((r) => callsReceived(r).length === 1, "ボブ（timer）への知らせ");
    await dave.until((r) => callsReceived(r).length === 1, "デイブ（お題）への知らせ");
    await erin.until((r) => callsReceived(r as { type: string }[]).length === 1, "エリン（poker）への知らせ");
    expect(callsReceived(bob.received)[0]).toMatchObject(expected);

    const accepted = await alice.take((m) => m.type === "room.called", "アリスへの受け付け");
    expect(accepted).toEqual({ type: "room.called", tool: "agenda" });
    expect(callsReceived(alice.received)).toEqual([]);
  });

  it("Given 道具ごとに人が居る / When timer へ呼ぶ / Then timer に居るボブには届かず、ほかの人には届く", async () => {
    const { alice, bob, carol, dave } = await cast();

    alice.send({ command: "room.call", tool: "timer" });

    await carol.take((m) => m.type === "room.call", "キャロルへの知らせ");
    await dave.until((r) => callsReceived(r).length === 1, "デイブへの知らせ");
    await alice.take((m) => m.type === "room.called", "受け付け");
    expect(callsReceived(bob.received)).toEqual([]);
  });

  it("Given 受け付けた直後 / When 5 秒たたないうちに同じルームでもう一度呼ぶ / Then 呼んだ人に CALL_TOO_SOON が返り、ほかの人へ 2 通目は届かない", async () => {
    const { alice, carol } = await cast();
    alice.send({ command: "room.call", tool: "agenda" });
    await alice.take((m) => m.type === "room.called", "1 回目の受け付け");
    await carol.take((m) => m.type === "room.call", "1 回目の知らせ");

    carol.send({ command: "room.call", tool: "timer" });

    const refused = await carol.take((m) => m.type === "error", "拒みの応答");
    expect(refused).toMatchObject({ type: "error", code: "CALL_TOO_SOON", message: "少し待ってから呼んでください。" });
    await alice.expectSilence();
    expect(callsReceived(alice.received)).toEqual([]);
  });

  it("Given 知らない道具の綴り / When 呼ぶ / Then INVALID_COMMAND で、誰にも知らせは届かない", async () => {
    const { alice, carol } = await cast();

    alice.send({ command: "room.call", tool: "nonexistent" });

    const refused = await alice.take((m) => m.type === "error", "拒みの応答");
    expect(refused).toMatchObject({ type: "error", code: "INVALID_COMMAND" });
    await carol.expectSilence();
    expect(callsReceived(carol.received)).toEqual([]);
  });

  it("Given ルームに入っていないハブの接続 / When 呼ぶ / Then NOT_IN_ROOM", async () => {
    const stranger = await server.connectHub("stranger");

    stranger.send({ command: "room.call", tool: "agenda" });

    const refused = await stranger.take((m) => m.type === "error", "拒みの応答");
    expect(refused).toMatchObject({ type: "error", code: "NOT_IN_ROOM" });
  });

  it("Given 道具の接続（お題・timer） / When room.call を送る / Then 受け付けられず、誰にも配られない", async () => {
    const { bob, carol, dave } = await cast();

    dave.send({ command: "room.call", tool: "agenda" } as never);
    const topicReply = await dave.take((m: { type: string }) => m.type === "error", "お題の拒み");
    expect(topicReply).toMatchObject({ type: "error", code: "INVALID_COMMAND" });

    bob.sendRaw(JSON.stringify({ command: "room.call", tool: "agenda" }));
    const timerReply = await bob.take("error");
    expect(timerReply.code).toBe("INVALID_COMMAND");

    await carol.expectSilence();
    expect(callsReceived(carol.received)).toEqual([]);
  });

  it("Given 道具の接続（poker） / When room.call を送る / Then 受け付けられず、誰にも配られない", async () => {
    const { erin, carol } = await cast();

    erin.send({ command: "room.call", tool: "agenda" });

    await erin.take((m) => m.type === "error", "poker の拒み");
    await carol.expectSilence();
    expect(callsReceived(carol.received)).toEqual([]);
  });
});

describe("createRoom（timer）で作ったルームへの room.call", () => {
  it("Given timer の入口で作ったルーム / When その作成者がハブからも入って呼ぶ / Then 受け付けられる", async () => {
    const owner = await server.connect("owner");
    const created = await createRoom(owner, "アリス");
    const hub = await server.connectHub("owner-hub");
    hub.send({ command: "room.join", code: created.code, displayName: "アリス", resumeToken: created.resumeToken });
    await hub.take((m) => m.type === "room.joined", "ハブへの参加");

    hub.send({ command: "room.call", tool: "poker" });

    const accepted = await hub.take((m) => m.type === "room.called", "受け付け");
    expect(accepted).toEqual({ type: "room.called", tool: "poker" });
  });
});
