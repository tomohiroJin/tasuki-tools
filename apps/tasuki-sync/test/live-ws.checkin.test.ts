/**
 * チェックインの接続（`?tool=checkin`）を実 WebSocket 越しに確かめる（#406）。
 *
 * `checkin-handlers.test.ts` などは `handleMessage()` を直接呼ぶ。ここが見るのは別の 1 点 ——
 * 「`WsAdapter` → `checkin-handlers` → 名簿・配信の宛先 → 実ソケット」の**配線**がつながっているか。
 * 特に匿名（送らないことで守る）と、名簿の変化（切断）で測り直される経路は、配線を外すと
 * 単体の試験が緑のまま壊れる。
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DEFAULT_CAPACITY } from "@tasuki/rate-limit";
import type { HubCommand, HubServerMsg } from "@tasuki/room-core";
import type { CheckinView } from "@tasuki/checkin-core";
import {
  LiveSetupError,
  startLiveSyncServer,
  type LiveCheckinClient,
  type LiveHubClient,
  type LiveSyncServer,
  type CheckinReceived,
} from "./support/live-sync-server.js";

let server: LiveSyncServer;

/**
 * 切断による自動公開の猶予（ADR 0028・既定 10 秒）を縮める。名簿の変化で開く経路（m508）を、
 * 猶予の後の開票で見る（猶予の長さそのものは `checkin-handlers.test.ts` が偽のタイマーで見る）。
 */
const GRACE_MS = 300;

beforeEach(() => {
  server = startLiveSyncServer({ CHECKIN_REVEAL_GRACE_MS: String(GRACE_MS) });
});
afterEach(async () => {
  await server.close();
});

/** ハブでルームを作り、コードを返す。作成直後の初期お題フレームを消費する。 */
async function hubCreate(hub: LiveHubClient, roomName: string, displayName: string): Promise<string> {
  hub.send({ command: "room.create", roomName, displayName });
  const created = await hub.take((m) => m.type === "room.created", "room.created");
  if (created.type !== "room.created") throw new LiveSetupError("room.created ではない");
  await hub.take((m) => m.type === "topic", "作成直後の初期お題");
  return created.code;
}

interface Joined {
  participantId: string;
  resumeToken: string;
}

/** チェックインの接続でルームへ参加する。参加後の `checkin` フレームまで読み進める。 */
async function checkinJoin(
  client: LiveCheckinClient,
  code: string,
  displayName: string,
  resumeToken?: string,
): Promise<Joined> {
  client.send({ command: "room.join", code, displayName, ...(resumeToken === undefined ? {} : { resumeToken }) });
  const joined = await client.take((m) => m.type === "room.joined" || m.type === "error", "room.joined");
  if (joined.type !== "room.joined") {
    throw new LiveSetupError(`room.join("${displayName}") が ${joined.type === "error" ? joined.code : joined.type} で失敗した`);
  }
  await client.take((m) => m.type === "checkin", "参加直後の状態");
  return { participantId: joined.participantId, resumeToken: joined.resumeToken };
}

type CheckinFrame = Extract<CheckinReceived, { type: "checkin" }>;
const viewOf = (m: CheckinReceived): CheckinView => (m as CheckinFrame).state;
const isCheckinWith =
  (pred: (v: CheckinView) => boolean) =>
  (m: CheckinReceived): boolean =>
    m.type === "checkin" && pred(viewOf(m));
const checkinFrames = (c: LiveCheckinClient): CheckinView[] =>
  c.received.filter((m) => m.type === "checkin").map(viewOf);

/** 新しいフレームが 150ms 届かなくなるまで待つ（最後の参加で起きる名簿の配信が届き終わるのを待つ）。 */
async function settle(client: LiveCheckinClient): Promise<void> {
  let seen = -1;
  while (seen !== client.received.length) {
    seen = client.received.length;
    await Bun.sleep(150);
  }
}

/** ハブ・timer・poker・お題・ルーレット・進行タイマーの接続を同じルームへ揃える。 */
async function otherTools(code: string, hub: LiveHubClient) {
  const timer = await server.connect("timer");
  timer.send({ command: "room.join", code, displayName: "ひかり" });
  await timer.take("room.joined");
  const poker = await server.connectPoker("poker");
  poker.send({ type: "join-room", roomId: code, name: "こう" });
  await poker.take((m) => m.type === "room-state", "参加後の room-state");
  const topic = await server.connectTopic("topic");
  topic.send({ command: "room.join", code, displayName: "みお" });
  await topic.take((m) => m.type === "topic", "参加直後のお題");
  const roulette = await server.connectRoulette("roulette");
  roulette.send({ command: "room.join", code, displayName: "れい" });
  await roulette.take((m) => m.type === "roulette", "参加直後のルーレット");
  const agenda = await server.connectAgenda("agenda");
  agenda.send({ command: "room.join", code, displayName: "あお" });
  await agenda.take((m) => m.type === "agenda", "参加直後の進行タイマー");
  return { hub, timer, poker, topic, roulette, agenda };
}

/** 2 本のチェックインの接続を同じルームへ参加させる。 */
async function twoCheckins() {
  const hub = await server.connectHub("hub");
  const code = await hubCreate(hub, "モブ", "あや");
  const a = await server.connectCheckin("a");
  const ja = await checkinJoin(a, code, "いずみ");
  const b = await server.connectCheckin("b");
  const jb = await checkinJoin(b, code, "かえで");
  return { hub, code, a, b, ja, jb };
}

describe("チェックインの配信", () => {
  it("a がやり方を選ぶと両方に同じ method・seq が届き、ほかのツールの接続には checkin フレームが届かない", async () => {
    // Given
    const { hub, code, a, b } = await twoCheckins();
    const others = await otherTools(code, hub);

    // When
    a.send({ command: "checkin.method.choose", seq: 0, method: "weather" });

    // Then
    const va = viewOf(await a.take(isCheckinWith((v) => v.round?.method === "weather"), "a のやり方"));
    const vb = viewOf(await b.take(isCheckinWith((v) => v.round?.method === "weather"), "b のやり方"));
    expect(va.round?.seq).toBe(vb.round?.seq);

    await Bun.sleep(200);
    const types = (received: unknown[]): string[] => received.map((m) => (m as { type: string }).type);
    for (const received of [
      others.hub.received,
      others.timer.received,
      others.poker.received,
      others.topic.received,
      others.roulette.received,
      others.agenda.received,
    ]) {
      expect(types(received)).not.toContain("checkin");
    }
  });

  it("2 人とも出すと両方に revealed が届き、名前つきの山の names に出した人の名前が載る", async () => {
    // Given
    const { a, b } = await twoCheckins();
    a.send({ command: "checkin.method.choose", seq: 0, method: "weather" });
    const seq = viewOf(await a.take(isCheckinWith((v) => v.round?.method === "weather"), "やり方")).round!.seq;

    // When
    a.send({ command: "checkin.card.play", seq, card: "sunny" });
    b.send({ command: "checkin.card.play", seq, card: "rain" });

    // Then
    for (const c of [a, b]) {
      const v = viewOf(await c.take(isCheckinWith((x) => x.round?.status === "revealed"), `${c.label} の開票`));
      if (v.round?.status !== "revealed") throw new Error("revealed ではない");
      const sunny = v.round.piles.find((p) => p.card === "sunny");
      expect(sunny?.names).toEqual(["いずみ"]);
    }
  });
});

describe("チェックインの匿名", () => {
  it("匿名で開いた後、a が受けたどの checkin フレームにも b の ID と札の組も yourCard の鍵も無い", async () => {
    // Given: roti は匿名が既定
    const { a, b, jb } = await twoCheckins();
    a.send({ command: "checkin.method.choose", seq: 0, method: "roti" });
    const seq = viewOf(await a.take(isCheckinWith((v) => v.round?.method === "roti"), "やり方")).round!.seq;

    // When
    a.send({ command: "checkin.card.play", seq, card: "2" });
    b.send({ command: "checkin.card.play", seq, card: "5" });
    await a.take(isCheckinWith((v) => v.round?.status === "revealed"), "開票");
    await Bun.sleep(200);

    // Then: 開いた後のフレームは山の枚数だけで、誰がどの札かも yourCard も持たない
    const revealed = a.received.filter((m) => m.type === "checkin" && viewOf(m).round?.status === "revealed");
    expect(revealed.length).toBeGreaterThan(0);
    for (const frame of revealed) {
      const json = JSON.stringify(frame);
      expect(json).not.toContain("yourCard");
      expect(json).not.toContain('"names"');
      const v = viewOf(frame);
      if (v.round?.status !== "revealed") throw new Error("revealed ではない");
      expect(v.round.piles.every((p) => Object.keys(p).sort().join() === "card,count")).toBe(true);
      // 枚数だけは届く（2 人が出した）
      expect(v.round.piles.reduce((n, p) => n + p.count, 0)).toBe(2);
    }
    // 開く前も開いた後も、a が受けたすべてのフレームで席の鍵は id・name・played だけ（札を載せる鍵が無い）
    const all = checkinFrames(a);
    expect(all.length).toBeGreaterThan(0);
    for (const v of all) {
      if (v.round === null) continue;
      for (const seat of v.round.seats) {
        expect(Object.keys(seat).sort().join()).toBe("id,name,played");
      }
      if (v.round.status === "open") expect(v.round.yourCard === null || v.round.yourCard === "2").toBe(true);
    }
    // b の席があるフレームが少なくとも 1 つあり、そこでも札は載っていない
    expect(all.some((v) => v.round?.seats.some((x) => x.id === jb.participantId))).toBe(true);
  });
});

describe("チェックインの名簿の変化", () => {
  it("b が出さずに接続を閉じて戻らないと、猶予の後に a だけで開く", async () => {
    // Given: a が出して、b の出番を待っている
    const { a, b } = await twoCheckins();
    a.send({ command: "checkin.method.choose", seq: 0, method: "weather" });
    const seq = viewOf(await a.take(isCheckinWith((v) => v.round?.method === "weather"), "やり方")).round!.seq;
    a.send({ command: "checkin.card.play", seq, card: "sunny" });
    await a.take(isCheckinWith((v) => v.round?.status === "open" && v.round.yourCard === "sunny"), "a の札");

    // When
    await b.close();

    // Then: 猶予の後に開く（b は戻らない）
    const v = viewOf(await a.take(isCheckinWith((x) => x.round?.status === "revealed"), "a だけの開票"));
    if (v.round?.status !== "revealed") throw new Error("revealed ではない");
    expect(v.round.piles.find((p) => p.card === "sunny")?.count).toBe(1);
  });

  it("b が出した後に閉じて、同じ resumeToken で張り直すと、b の札は b の札のまま", async () => {
    // Given: b だけが出した（a は出さないので開かない）
    const { code, a, b, jb } = await twoCheckins();
    a.send({ command: "checkin.method.choose", seq: 0, method: "weather" });
    const seq = viewOf(await a.take(isCheckinWith((v) => v.round?.method === "weather"), "やり方")).round!.seq;
    b.send({ command: "checkin.card.play", seq, card: "rain" });
    await b.take(isCheckinWith((v) => v.round?.status === "open" && v.round.yourCard === "rain"), "b の札");
    await b.close();

    // When
    const b2 = await server.connectCheckin("b2");
    b2.send({ command: "room.join", code, displayName: "かえで", resumeToken: jb.resumeToken });
    const joined = await b2.take((m) => m.type === "room.joined", "復帰");
    if (joined.type !== "room.joined") throw new Error("room.joined ではない");

    // Then
    expect(joined.participantId).toBe(jb.participantId);
    const v = viewOf(await b2.take((m) => m.type === "checkin", "復帰直後の状態"));
    if (v.round?.status !== "open") throw new Error("open ではない");
    expect(v.you).toBe(jb.participantId);
    expect(v.round.yourCard).toBe("rain");
  });
});

describe("チェックインの操作の競合", () => {
  it("checkin.reveal { seq: 1 } と checkin.again { seq: 1 } をほぼ同時に送っても、seq 2 の回は開かない", async () => {
    // Given: 1 人が出した回
    const { a, b } = await twoCheckins();
    a.send({ command: "checkin.method.choose", seq: 0, method: "weather" });
    const seq = viewOf(await a.take(isCheckinWith((v) => v.round?.method === "weather"), "やり方")).round!.seq;
    expect(seq).toBe(1);
    a.send({ command: "checkin.card.play", seq, card: "sunny" });
    await a.take(isCheckinWith((v) => v.round?.status === "open" && v.round.yourCard === "sunny"), "a の札");

    // When
    a.send({ command: "checkin.reveal", seq: 1 });
    b.send({ command: "checkin.again", seq: 1 });
    await Bun.sleep(400);

    // Then: どの順で届いても、seq 2 のフレームが revealed になることはない
    for (const c of [a, b]) {
      for (const v of checkinFrames(c)) {
        if (v.round?.seq === 2) expect(v.round.status).toBe("open");
      }
    }
  });
});

describe("チェックインの古い seq の操作", () => {
  it("again で seq 2 の回が始まった後に届いた checkin.reveal { seq: 1 } は、seq 2 の回を開かない", async () => {
    // Given: seq 1 で a が出し、again で seq 2 の受付中になった
    const { a, b } = await twoCheckins();
    a.send({ command: "checkin.method.choose", seq: 0, method: "weather" });
    const seq = viewOf(await a.take(isCheckinWith((v) => v.round?.method === "weather"), "やり方")).round!.seq;
    expect(seq).toBe(1);
    a.send({ command: "checkin.card.play", seq, card: "sunny" });
    await a.take(isCheckinWith((v) => v.round?.status === "open" && v.round.yourCard === "sunny"), "a の札");
    b.send({ command: "checkin.again", seq: 1 });
    await a.take(isCheckinWith((v) => v.round?.seq === 2 && v.round.status === "open"), "seq 2 の受付");
    await b.take(isCheckinWith((v) => v.round?.seq === 2 && v.round.status === "open"), "b の seq 2 の受付");

    // When: 遅れて届いた seq 1 の reveal
    a.send({ command: "checkin.reveal", seq: 1 });
    await Bun.sleep(300);

    // Then: seq 2 のフレームがあり、最後の状態は seq 2 のまま開いていない
    const frames = checkinFrames(a);
    expect(frames.filter((v) => v.round?.seq === 2).length).toBeGreaterThanOrEqual(1);
    const last = frames.at(-1);
    expect(last?.round?.seq).toBe(2);
    expect(last?.round?.status).toBe("open");
    const lastB = checkinFrames(b).at(-1);
    expect(lastB?.round?.seq).toBe(2);
    expect(lastB?.round?.status).toBe("open");
  });
});

describe("チェックインの操作はチェックインの接続だけ", () => {
  it("ハブ・timer・poker・お題・ルーレット・進行タイマーの接続から送った checkin.reveal は拒まれ、状態は変わらない", async () => {
    // Given
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const c = await server.connectCheckin("c");
    await checkinJoin(c, code, "いずみ");
    c.send({ command: "checkin.method.choose", seq: 0, method: "weather" });
    await c.take(isCheckinWith((v) => v.round?.method === "weather"), "やり方");
    const { timer, poker, topic, roulette, agenda } = await otherTools(code, hub);
    await settle(c);
    const before = checkinFrames(c).length;

    // When
    timer.sendRaw(JSON.stringify({ command: "checkin.reveal", seq: 1 }));
    poker.send({ command: "checkin.reveal", seq: 1 } as never);
    topic.send({ command: "checkin.reveal", seq: 1 } as never);
    hub.send({ command: "checkin.reveal", seq: 1 } as unknown as HubCommand);
    roulette.send({ command: "checkin.reveal", seq: 1 } as never);
    agenda.send({ command: "checkin.reveal", seq: 1 } as never);

    // Then
    expect((await timer.take("error")).code).toBe("INVALID_COMMAND");
    const pokerErr = await poker.take((m) => m.type === "error", "poker の拒否");
    if (pokerErr.type !== "error") throw new Error("error ではない");
    expect(pokerErr.code).toBe("invalid-message");
    for (const [name, x] of [["お題", topic], ["ハブ", hub], ["ルーレット", roulette], ["進行タイマー", agenda]] as const) {
      const err = await x.take((m) => m.type === "error", `${name}の拒否`);
      if (err.type !== "error") throw new Error("error ではない");
      expect(err.code).toBe("INVALID_COMMAND");
    }
    await Bun.sleep(200);
    const last = checkinFrames(c).at(-1);
    expect(last?.round?.status).toBe("open");
    expect(checkinFrames(c).length).toBe(before);
  });
});

describe("お題の配信", () => {
  it("お題ツールで topic.set すると、チェックインの接続にも topic が届く", async () => {
    // Given
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const c = await server.connectCheckin("c");
    await checkinJoin(c, code, "いずみ");
    const topic = await server.connectTopic("topic");
    topic.send({ command: "room.join", code, displayName: "かえで" });
    await topic.take((m) => m.type === "topic", "参加直後のお題");

    // When
    topic.send({ command: "topic.set", title: "決めた", body: "本文" });

    // Then
    const frame = await c.take(
      (m) =>
        (m as { type: string; state?: { topic?: { title?: string } } }).type === "topic" &&
        (m as { state: { topic?: { title?: string } } }).state.topic?.title === "決めた",
      "お題の配信",
    );
    expect((frame as { type: string }).type).toBe("topic");
  });
});

describe("チェックインの接続の参加の総当たり", () => {
  it("room.join を失敗させ続けると、接続を張り直しても枠が続く", async () => {
    // Given: 同じ IP を名乗る 2 本のチェックインの接続（A・B）
    const xff = { "x-forwarded-for": "203.0.113.206" };
    const a = await server.connectCheckin("a", xff);
    const b = await server.connectCheckin("b", xff);

    // When: A で失敗を使い切る
    const codes = async (c: LiveCheckinClient, count: number): Promise<string[]> => {
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

    // When: A を閉じ、先に張っておいた B で 1 回だけ試す
    await a.close();
    b.send({ command: "room.check", code: "NOPE99" });
    await b.take((m) => m.type === "error", "close 反映の往復確認");

    // Then: B の最初の試行がいきなり枠切れになる
    expect((await codes(b, 1)).at(-1)).toBe("JOIN_RATE_LIMITED");
  });
});
