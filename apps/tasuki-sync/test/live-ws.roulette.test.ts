/**
 * ルーレットの接続（`?tool=roulette`）を実 WebSocket 越しに確かめる（#94）。
 *
 * ## なぜ実 WS で見るか
 *
 * `roulette-handlers.test.ts` は `handleMessage()` を直接呼び、送信は偽の `send` で観測している。
 * あれは規則そのものを網羅する場所である。ここが見るのは**別の 1 点** ——
 * 「`WsAdapter` → `roulette-handlers` → 名簿・お題の宛先 → 実ソケット」の**配線**が本当に
 * つながっているか。配線を外しても、in-process のテストは緑のまま通りうる。
 *
 * E 番号は spec §8.1 の EARS 要件番号。テスト名には出さず `@requirements` でのみ追跡する。
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DEFAULT_CAPACITY } from "@tasuki/rate-limit";
import type { HubCommand, HubServerMsg } from "@tasuki/room-core";
import type { RouletteView } from "@tasuki/roulette-core";
import type { RouletteServerMsg } from "../src/ports/roulette-server-msg.js";
import {
  LiveSetupError,
  startLiveSyncServer,
  type LiveHubClient,
  type LiveRouletteClient,
  type LiveSyncServer,
} from "./support/live-sync-server.js";

let server: LiveSyncServer;

beforeEach(() => {
  server = startLiveSyncServer();
});
afterEach(async () => {
  await server.close();
});

/** ハブでルームを作り、コードを返す。作成直後の初期お題フレームを消費する（`live-ws.topic.test.ts` と同じ理由）。 */
async function hubCreate(hub: LiveHubClient, roomName: string, displayName: string): Promise<string> {
  hub.send({ command: "room.create", roomName, displayName });
  const created = await hub.take((m) => m.type === "room.created", "room.created");
  if (created.type !== "room.created") throw new LiveSetupError("room.created ではない");
  await hub.take((m) => m.type === "topic", "作成直後の初期お題");
  return created.code;
}

/** ルーレットの接続でルームへ参加する。参加後の `roulette` フレームまで読み進める。 */
async function rouletteJoin(
  client: LiveRouletteClient,
  code: string,
  displayName: string,
  extra: { passphrase?: string } = {},
): Promise<void> {
  client.send({
    command: "room.join",
    code,
    displayName,
    ...(extra.passphrase !== undefined ? { passphrase: extra.passphrase } : {}),
  });
  const joined = await client.take((m) => m.type === "room.joined" || m.type === "error", "room.joined");
  if (joined.type !== "room.joined") {
    throw new LiveSetupError(`room.join("${displayName}") が ${joined.type === "error" ? joined.code : joined.type} で失敗した`);
  }
  await client.take((m) => m.type === "roulette", "参加直後のルーレットの状態");
}

const isSpin = (m: RouletteServerMsg): m is Extract<RouletteServerMsg, { type: "roulette" }> =>
  m.type === "roulette" && m.state.spin !== null;

async function takeSpin(client: LiveRouletteClient, what: string): Promise<NonNullable<RouletteView["spin"]>> {
  const m = await client.take(isSpin, what);
  if (!isSpin(m)) throw new Error("roulette ではない");
  return m.state.spin!;
}

/**
 * 名簿・お題の宛先にルーレットの接続が入っている。
 */
describe("ルーレットの接続に名簿とお題が届く", () => {
  /**
   * @requirements #94 E11
   */
  it("参加すると room.joined・roster・roulette が届き、別の人がハブで参加すると新しい roster が届く", async () => {
    // Given
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const roulette = await server.connectRoulette("roulette");

    // When: ルーレットで参加する
    roulette.send({ command: "room.join", code, displayName: "いずみ" });

    // Then: 復帰の組・名簿・ルーレットの状態
    await roulette.take((m) => m.type === "room.joined", "room.joined");
    const roster = await roulette.take((m) => m.type === "roster", "roster");
    if (roster.type !== "roster") throw new Error("roster ではない");
    expect(roster.room.participants.map((p) => p.displayName)).toEqual(["あや", "いずみ"]);
    await roulette.take((m) => m.type === "roulette", "roulette");

    // When: 別の人がハブで参加する
    const other = await server.connectHub("other");
    other.send({ command: "room.join", code, displayName: "かえで" });

    // Then: ルーレットの接続へ、かえでを含む新しい roster が届く（宛先がハブだけなら届かない）
    const next = await roulette.take(
      (m) => m.type === "roster" && m.room.participants.some((p) => p.displayName === "かえで"),
      "かえでを含む roster",
    );
    expect(next.type).toBe("roster");
  });

  /**
   * @requirements #94 E12
   */
  it("お題ツールで topic.set すると、ルーレットの接続にも topic が届く", async () => {
    // Given
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const roulette = await server.connectRoulette("roulette");
    await rouletteJoin(roulette, code, "いずみ");
    const topic = await server.connectTopic("topic");
    topic.send({ command: "room.join", code, displayName: "かえで" });
    await topic.take((m) => m.type === "topic", "参加直後のお題");

    // When
    topic.send({ command: "topic.set", title: "決めた", body: "本文" });

    // Then
    const frame = await roulette.take((m) => m.type === "topic" && m.state.topic?.title === "決めた", "お題の配信");
    if (frame.type !== "topic") throw new Error("topic ではない");
    expect(frame.state.topic?.body).toBe("本文");
  });
});

/**
 * 回した結果は、同じルームの**ルーレットの接続だけ**へ同じ値で届く。
 */
describe("回した結果の配信", () => {
  /**
   * @requirements #94 E1・E8
   */
  it("roulette.spin の結果が 2 本のルーレットの接続へ同じ seq・winnerIndex・settle で届き、ほかのツールの接続には roulette フレームが届かない", async () => {
    // Given: ルーレット 2 本のほかに、ハブ・timer・poker・お題の接続を同じルームへ揃える
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const r1 = await server.connectRoulette("r1");
    await rouletteJoin(r1, code, "いずみ");
    const r2 = await server.connectRoulette("r2");
    await rouletteJoin(r2, code, "かえで");
    const timer = await server.connect("timer");
    timer.send({ command: "room.join", code, displayName: "ひかり" });
    await timer.take("room.joined");
    const poker = await server.connectPoker("poker");
    poker.send({ type: "join-room", roomId: code, name: "こう" });
    await poker.take((m) => m.type === "room-state", "参加後の room-state");
    const topic = await server.connectTopic("topic");
    topic.send({ command: "room.join", code, displayName: "みお" });
    await topic.take((m) => m.type === "topic", "参加直後のお題");

    // When
    r1.send({ command: "roulette.spin" });

    // Then: 2 本へ同じ値
    const a = await takeSpin(r1, "r1 への結果");
    const b = await takeSpin(r2, "r2 への結果");
    expect(a.seq).toBe(1);
    expect(b).toMatchObject({ seq: 1, winnerIndex: a.winnerIndex, settle: a.settle, spunBy: "いずみ" });
    expect(a.wheel.length).toBeGreaterThanOrEqual(2);

    // Then: ルーレット以外の 4 本には roulette フレームが届かない
    await Bun.sleep(200);
    const frameTypes = (received: unknown[]): string[] => received.map((m) => (m as { type: string }).type);
    for (const received of [hub.received, timer.received, poker.received, topic.received]) {
      expect(frameTypes(received)).not.toContain("roulette");
    }
  });

  /**
   * @requirements #94 E9
   */
  it("timer・poker・お題・ハブの接続から送った roulette.spin は不正として拒否され、ルーレットの状態は変わらない", async () => {
    // Given: ルーレット 2 本と、ほかの 4 種の接続
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const r1 = await server.connectRoulette("r1");
    await rouletteJoin(r1, code, "いずみ");
    const timer = await server.connect("timer");
    timer.send({ command: "room.join", code, displayName: "ひかり" });
    await timer.take("room.joined");
    const poker = await server.connectPoker("poker");
    poker.send({ type: "join-room", roomId: code, name: "こう" });
    await poker.take((m) => m.type === "room-state", "参加後の room-state");
    const topic = await server.connectTopic("topic");
    topic.send({ command: "room.join", code, displayName: "みお" });
    await topic.take((m) => m.type === "topic", "参加直後のお題");

    // When: 4 種それぞれから roulette.spin を送る（型では送れないので境界を迂回する）
    timer.sendRaw(JSON.stringify({ command: "roulette.spin" }));
    poker.send({ command: "roulette.spin" } as never);
    topic.send({ command: "roulette.spin" } as never);
    hub.send({ command: "roulette.spin" } as unknown as HubCommand);

    // Then: 4 種すべてで拒否される（実測したコードを固定する）
    expect((await timer.take("error")).code).toBe("INVALID_COMMAND");
    const pokerErr = await poker.take((m) => m.type === "error", "poker の拒否");
    if (pokerErr.type !== "error") throw new Error("error ではない");
    expect(pokerErr.code).toBe("invalid-message");
    const topicErr = await topic.take((m) => m.type === "error", "お題の拒否");
    if (topicErr.type !== "error") throw new Error("error ではない");
    expect(topicErr.code).toBe("INVALID_COMMAND");
    const hubErr = await hub.take((m) => m.type === "error", "ハブの拒否");
    if (hubErr.type !== "error") throw new Error("error ではない");
    expect(hubErr.code).toBe("INVALID_COMMAND");

    // Then: 拒否は 1 通ずつだけ（別の層が同じコマンドを拾って 2 通目を返していない）
    await Bun.sleep(200);
    const errorCount = (received: unknown[]): number =>
      received.filter((m) => (m as { type: string }).type === "error").length;
    expect([timer.received, poker.received, topic.received, hub.received].map(errorCount)).toEqual([1, 1, 1, 1]);

    // Then: ルーレットの状態は変わっていない。この後の本物の spin が seq 1 になる
    r1.send({ command: "roulette.spin" });
    expect((await takeSpin(r1, "本物の spin")).seq).toBe(1);
  });
});

/**
 * @requirements #401 E1・E2（選ぶ人数はルーレットの接続だけが変えられる）
 */
describe("選ぶ人数（実接続）", () => {
  it("ルーレットの接続から変えた人数が全ルーレットの接続へ届き、timer・ハブの接続からの roulette.pick.set は拒否される", async () => {
    // Given
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const r1 = await server.connectRoulette("r1");
    await rouletteJoin(r1, code, "いずみ");
    const r2 = await server.connectRoulette("r2");
    await rouletteJoin(r2, code, "けい");
    const timer = await server.connect("timer");
    timer.send({ command: "room.join", code, displayName: "ひかり" });
    await timer.take("room.joined");

    // When: ほかのツールから送る（型では送れないので境界を迂回する）
    timer.sendRaw(JSON.stringify({ command: "roulette.pick.set", count: 3 }));
    hub.send({ command: "roulette.pick.set", count: 3 } as unknown as HubCommand);

    // Then
    expect((await timer.take("error")).code).toBe("INVALID_COMMAND");
    const hubErr = await hub.take((m) => m.type === "error", "ハブの拒否");
    if (hubErr.type !== "error") throw new Error("error ではない");
    expect(hubErr.code).toBe("INVALID_COMMAND");

    // When: ルーレットの接続から送る
    r1.send({ command: "roulette.pick.set", count: 2 });

    // Then: 2 本のルーレットの接続に 2 が届く（ほかのツールの 3 は効いていない）
    const pickCountOf = (m: unknown): number | undefined =>
      (m as { type: string; state?: { pickCount?: number } }).type === "roulette"
        ? (m as { state: { pickCount?: number } }).state.pickCount
        : undefined;
    expect(pickCountOf(await r1.take((m) => pickCountOf(m) === 2, "r1 の人数"))).toBe(2);
    expect(pickCountOf(await r2.take((m) => pickCountOf(m) === 2, "r2 の人数"))).toBe(2);
    expect([...r1.received, ...r2.received].some((m) => pickCountOf(m) === 3)).toBe(false);
  });
});

/**
 * ルーレットの接続は poker の早期 return を通らない（`onConnect` を通る）。
 */
describe("ルーレットの接続の参加の総当たり", () => {
  /**
   * @requirements #94 §5.2（⚠ ws-adapter.ts の分岐に足してはならない）
   */
  it("room.join を失敗させ続けると、接続を張り直しても枠が続く", async () => {
    // Given: 同じ IP を名乗る 2 本のルーレットの接続（A・B）。存在しないコードへの参加の失敗が枠を減らす
    const xff = { "x-forwarded-for": "203.0.113.201" };
    const a = await server.connectRoulette("a", xff);
    const b = await server.connectRoulette("b", xff);

    // When: A で失敗を使い切る
    const codes = async (c: LiveRouletteClient, count: number): Promise<string[]> => {
      const before = c.received.filter((m) => m.type === "error").length;
      for (let i = 0; i < count; i++) {
        c.send({ command: "room.join", code: "NOPE99", displayName: "攻撃者" });
      }
      await c.until((r) => r.filter((m) => m.type === "error").length >= before + count, `${count} 件のエラー`);
      return c.received
        .filter((m): m is Extract<HubServerMsg, { type: "error" }> => m.type === "error")
        .slice(-count)
        .map((m) => m.code);
    };
    expect((await codes(a, DEFAULT_CAPACITY + 1)).at(-1)).toBe("JOIN_RATE_LIMITED");

    // When: A を閉じ、先に張っておいた B で 1 回だけ試す（待ち時間なし）
    await a.close();
    b.send({ command: "room.check", code: "NOPE99" });
    await b.take((m) => m.type === "error", "close 反映の往復確認");

    // Then: B の最初の試行がいきなり枠切れになる（枠が接続 ID に落ちていれば ROOM 側の拒否に戻る）
    expect((await codes(b, 1)).at(-1)).toBe("JOIN_RATE_LIMITED");
  });
});
