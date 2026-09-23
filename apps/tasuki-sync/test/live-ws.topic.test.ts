/**
 * お題ツールの接続（`?tool=topic`）を実 WebSocket 越しに確かめる（#91）。
 *
 * ## なぜ実 WS で見るか
 *
 * `topic-handlers.test.ts` 等の in-process テストは `handleMessage()` を直接呼び、送信は
 * モックの `send` で観測している。あれは規則そのもの（誰が変えられるか・配信先・
 * レート制限のゲート）を網羅する場所であり、正しい。
 *
 * ここは**それとは別の 1 点**——「`WsAdapter` → `topic-handlers` → `topic-broadcast` →
 * 実ソケット」の配線が本当につながっているか——を、他ツール（timer・hub・poker）と
 * 同じ実 WS ヘルパ（`test/support/live-sync-server.ts`）で見る。配線を外しても、
 * 送出フレームの `type` を変えても、in-process のテストは緑のまま通りうる。
 *
 * ## 用語
 *
 * - 「お題の接続」= `?tool=topic` で繋いだ {@link LiveTopicClient}。
 * - E1・E2・E4〜E6・E21 は spec §7.1/§7.2 の EARS 要件番号。テスト名には出さず、
 *   `@requirements` の JSDoc でのみ追跡する（列挙は腐る・テスト名は結果で語る）。
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DEFAULT_CAPACITY, DEFAULT_REFILL_PER_SEC } from "@tasuki/rate-limit";
import { INITIAL_TOPIC_STATE } from "@tasuki/topic-core";
import type { HubCommand } from "@tasuki/room-core";
import type { TopicServerMsg } from "../src/ports/topic-server-msg.js";
import {
  createRoom,
  joinRoom,
  startLiveSyncServer,
  LiveSetupError,
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

/**
 * ハブでルームを作り、コードと復帰の組を返す。
 *
 * **作成直後の初期お題フレームをここで消費する。** `hub-handlers.ts` の `handleCreate` は
 * `room.created` の直後に `topicBroadcaster.sendCurrent()` で「お題なし」の状態を 1 通
 * 送る（E4）。ここで読み飛ばしておかないと、後続の `hub.take(m => m.type === "topic")` が
 * 新しい配信ではなくこの初期フレームに一致してしまい、broadcast 検査が空振りのまま緑になる。
 */
async function hubCreate(
  hub: LiveHubClient,
  roomName: string,
  displayName: string,
): Promise<{ code: string; participantId: string; resumeToken: string }> {
  hub.send({ command: "room.create", roomName, displayName });
  const created = await hub.take((m) => m.type === "room.created", "room.created");
  if (created.type !== "room.created") throw new LiveSetupError("room.created ではない");
  await hub.take((m) => m.type === "topic", "作成直後の初期お題");
  return { code: created.code, participantId: created.participantId, resumeToken: created.resumeToken };
}

/** お題の接続でルームへ参加する。失敗したら throw する（前提の構築の失敗）。 */
async function topicJoin(
  client: LiveTopicClient,
  code: string,
  displayName: string,
  extra: { passphrase?: string; resumeToken?: string } = {},
): Promise<{ participantId: string; resumeToken: string }> {
  client.send({
    command: "room.join",
    code,
    displayName,
    ...(extra.resumeToken !== undefined ? { resumeToken: extra.resumeToken } : {}),
    ...(extra.passphrase !== undefined ? { passphrase: extra.passphrase } : {}),
  });
  const joined = await client.take(
    (m) => m.type === "room.joined" || m.type === "error",
    "room.joined",
  );
  if (joined.type !== "room.joined") {
    throw new LiveSetupError(
      `room.join("${displayName}") が ${joined.type === "error" ? joined.code : joined.type} で失敗した`,
    );
  }
  return { participantId: joined.participantId, resumeToken: joined.resumeToken };
}

/** これ以上メッセージが届かないことを確かめる（poker には `expectSilence` が無いための写し）。 */
async function expectPokerSilence(poker: LivePokerClient, ms = 200): Promise<void> {
  const before = poker.received.length;
  await Bun.sleep(ms);
  if (poker.received.length !== before) {
    const extra = poker.received.slice(before).map((m) => m.type);
    throw new LiveSetupError(`${poker.label}: 届かないはずのメッセージが来た（${extra.join(", ")}）`);
  }
}

/** 直近 `count` 件のお題エラーコード。 */
function lastTopicErrorCodes(client: LiveTopicClient, count: number): string[] {
  return client.received
    .filter((m): m is Extract<TopicServerMsg, { type: "error" }> => m.type === "error")
    .slice(-count)
    .map((m) => m.code);
}

/** `ai.unlock` を誤った合言葉で `count` 回叩き、その応答コードを集める。 */
async function drainTopicBadUnlocks(client: LiveTopicClient, count: number): Promise<string[]> {
  const before = client.received.filter((m) => m.type === "error").length;
  for (let i = 0; i < count; i++) client.send({ command: "ai.unlock", key: "wrong" });
  await client.until(
    (received) => received.filter((m) => m.type === "error").length >= before + count,
    `${count} 件のエラー応答`,
  );
  return lastTopicErrorCodes(client, count);
}

/** 存在しないコードで入室を試みる（timer の入口。逆方向のバケツ共有の確認に使う）。 */
function badTimerJoin(client: LiveClient): void {
  client.send({ command: "room.join", code: "NOPE99", displayName: "Bob", hasAiKey: false });
}

/** `count` 回失敗させ、その回数ぶんのエラー応答コードを集める（timer の入口）。 */
async function drainBadTimerJoins(client: LiveClient, count: number): Promise<string[]> {
  const before = client.all("error").length;
  for (let i = 0; i < count; i++) badTimerJoin(client);
  await client.until(
    (received) => received.filter((m) => m.type === "error").length >= before + count,
    `${count} 件のエラー応答`,
  );
  return client
    .all("error")
    .slice(-count)
    .map((m) => m.code);
}

/**
 * お題の接続に参加すると、いまのお題の状態が届く。
 *
 * @requirements #91 E1 E4
 */
describe("お題の接続に参加すると、いまのお題の状態が届く", () => {
  it("お題がまだ無いルームに参加すると、既定の状態（お題なし）が届く", async () => {
    // Given（準備）: ハブでルームだけ作る
    const hub = await server.connectHub();
    const created = await hubCreate(hub, "モブ", "あや");

    // When（操作）: お題の接続で参加する
    const topic = await server.connectTopic();
    await topicJoin(topic, created.code, "いずみ");

    // Then（検証）: 既定の状態がそのまま届く
    const initial = await topic.take((m) => m.type === "topic", "参加直後の初期お題");
    if (initial.type !== "topic") throw new Error("topic ではない");
    expect(initial.state).toEqual(INITIAL_TOPIC_STATE);
  });

  it("お題を掲げたあとに参加すると、既定ではなく最新のお題が届く", async () => {
    // Given: 1 人目がお題を掲げておく
    const hub = await server.connectHub();
    const created = await hubCreate(hub, "モブ", "あや");
    const setter = await server.connectTopic("setter");
    await topicJoin(setter, created.code, "あや");
    await setter.take((m) => m.type === "topic", "参加直後の初期お題");
    setter.send({ command: "topic.set", title: "朝会のお題", body: "近況" });
    await setter.take(
      (m) => m.type === "topic" && m.state.topic?.title === "朝会のお題",
      "掲げた直後のお題",
    );

    // When（操作）: 別の人が後から参加する
    const latecomer = await server.connectTopic("latecomer");
    await topicJoin(latecomer, created.code, "いずみ");

    // Then（検証）: 参加直後に、既に掲げられているお題が届く
    const received = await latecomer.take((m) => m.type === "topic", "参加直後のお題");
    if (received.type !== "topic") throw new Error("topic ではない");
    expect(received.state.topic).toEqual({ title: "朝会のお題", body: "近況", source: "manual" });
  });
});

/**
 * お題を掲げると、お題の接続とハブへ配信される。timer・poker はこの PR の配信先ではない。
 *
 * @requirements #91 E2
 */
describe("お題を掲げると、お題の接続とハブへ配信される", () => {
  it("topic.set の結果が、お題の接続とハブの接続の双方へ届く", async () => {
    // Given
    const hub = await server.connectHub();
    const created = await hubCreate(hub, "モブ", "あや");
    const topic = await server.connectTopic();
    await topicJoin(topic, created.code, "いずみ");
    await topic.take((m) => m.type === "topic", "参加直後の初期お題");

    // When
    topic.send({ command: "topic.set", title: "決めた", body: "本文" });

    // Then（両方へ届く）
    const onHub = await hub.take(
      (m) => m.type === "topic" && m.state.topic?.title === "決めた",
      "ハブへの配信",
    );
    const onTopic = await topic.take(
      (m) => m.type === "topic" && m.state.topic?.title === "決めた",
      "お題の接続への配信",
    );
    if (onHub.type !== "topic" || onTopic.type !== "topic") throw new Error("topic ではない");
    expect(onHub.state.topic?.body).toBe("本文");
    expect(onTopic.state.topic?.body).toBe("本文");
  });

  it("timer・poker の接続は、お題の配信を受け取らない（この PR の配信先ではない）", async () => {
    // Given: 同じルームに、お題・ハブ・timer・poker の 4 接続を揃える
    const hub = await server.connectHub("hub");
    const created = await hubCreate(hub, "モブ", "あや");
    const topic = await server.connectTopic("topic");
    await topicJoin(topic, created.code, "いずみ");
    await topic.take((m) => m.type === "topic", "参加直後の初期お題");
    const timer = await server.connect("timer");
    await joinRoom(timer, created.code, "かえで");
    const poker = await server.connectPoker("poker");
    poker.send({ type: "join-room", roomId: created.code, name: "こう" });
    await poker.take((m) => m.type === "room-state", "参加後の room-state");

    // When
    topic.send({ command: "topic.set", title: "決めた", body: "本文" });

    // Then: **ハブへ届いたことをもって配信が発生した事実を先に確定させてから**
    //       timer・poker には届いていないことを見る（発生前に沈黙を見ると、
    //       まだ届いていないだけの見かけ上の緑になりうる）
    await hub.take(
      (m) => m.type === "topic" && m.state.topic?.title === "決めた",
      "配信の発生（ハブ側で確定させる）",
    );
    await timer.expectSilence();
    await expectPokerSilence(poker);
  });
});

/**
 * お題ツールの接続以外からの topic.set は拒まれ、お題は変わらない。
 *
 * ブリーフはエラーコードを推測している（timer は INVALID_COMMAND）が、
 * ここでは**実測したコード**をそのまま固定し、より強い確認として
 * 「新しいお題の接続で読んでもお題が変わっていない」ことを見る（R6・R8）。
 *
 * @requirements #91 E5
 */
describe("お題ツールの接続以外からは topic.set が拒まれる", () => {
  it("timer の接続から topic.set を送っても拒まれ、お題は変わらない", async () => {
    // Given
    const hub = await server.connectHub();
    const created = await hubCreate(hub, "モブ", "あや");
    const timer = await server.connect("timer");
    await joinRoom(timer, created.code, "かえで");

    // When（timer の境界にお題のコマンドを直接投げる）
    timer.sendRaw(JSON.stringify({ command: "topic.set", title: "侵入", body: "" }));
    const reply = await timer.take("error");

    // Then（実測したコードを固定する。timer のコマンド境界には topic.set が無いので
    // 「コマンドとして解釈できない」の意味で INVALID_COMMAND が返る）
    expect(reply.code).toBe("INVALID_COMMAND");

    // より強い確認: 新しいお題の接続で読んでも、お題は変わっていない
    const watcher = await server.connectTopic("watcher");
    await topicJoin(watcher, created.code, "確認役");
    const state = await watcher.take((m) => m.type === "topic", "確認役への初期お題");
    if (state.type !== "topic") throw new Error("topic ではない");
    expect(state.state.topic).toBeNull();
  });

  it("hub の接続（選択画面）から topic.set を送っても拒まれ、お題は変わらない", async () => {
    // Given
    const hub = await server.connectHub();
    const created = await hubCreate(hub, "モブ", "あや");

    // When（ハブの境界にお題のコマンドを直接投げる。型では送れないので境界を迂回する）
    hub.send({ command: "topic.set", title: "侵入", body: "" } as unknown as HubCommand);
    const reply = await hub.take((m) => m.type === "error", "拒否の応答");

    // Then（実測したコードを固定する）
    if (reply.type !== "error") throw new Error("error ではない");
    expect(reply.code).toBe("INVALID_COMMAND");

    // より強い確認: 新しいお題の接続で読んでも、お題は変わっていない
    const watcher = await server.connectTopic("watcher");
    await topicJoin(watcher, created.code, "確認役");
    const state = await watcher.take((m) => m.type === "topic", "確認役への初期お題");
    if (state.type !== "topic") throw new Error("topic ではない");
    expect(state.state.topic).toBeNull();
  });

  it("poker の接続から topic.set を送っても拒まれ、お題は変わらない", async () => {
    // Given
    const hub = await server.connectHub();
    const created = await hubCreate(hub, "モブ", "あや");
    const poker = await server.connectPoker();
    poker.send({ type: "join-room", roomId: created.code, name: "かえで" });
    await poker.take((m) => m.type === "room-state", "参加後の room-state");

    // When（poker はもともと `command` という言葉を知らない。境界不一致として拒む）
    poker.send({ command: "topic.set", title: "侵入", body: "" });
    const reply = await poker.take((m) => m.type === "error", "拒否の応答");

    // Then（実測したコードを固定する。poker は JSON 不正とスキーマ不正を区別せず
    // どちらも invalid-message へ畳む）
    expect((reply as { code: string }).code).toBe("invalid-message");

    // より強い確認: 新しいお題の接続で読んでも、お題は変わっていない
    const watcher = await server.connectTopic("watcher");
    await topicJoin(watcher, created.code, "確認役");
    const state = await watcher.take((m) => m.type === "topic", "確認役への初期お題");
    if (state.type !== "topic") throw new Error("topic ではない");
    expect(state.state.topic).toBeNull();
  });
});

/**
 * 同じ人が複数のお題の接続（タブ）を持つとき、どちらにも同じお題が届く。
 *
 * @requirements #91 Review Focus 2
 */
describe("同じ人が 2 本のお題の接続を持つ", () => {
  it("復帰トークンで開いた 2 本目の接続にも、以後の配信が両方へ届く", async () => {
    // Given: 1 本目のお題の接続で参加する
    const hub = await server.connectHub();
    const created = await hubCreate(hub, "モブ", "あや");
    const tab1 = await server.connectTopic("tab1");
    const joined1 = await topicJoin(tab1, created.code, "あや");
    await tab1.take((m) => m.type === "topic", "タブ1の初期お題");

    // When: 同じ人が復帰トークンで 2 本目のお題の接続を開く（別タブを想定）
    const tab2 = await server.connectTopic("tab2");
    const joined2 = await topicJoin(tab2, created.code, "あや", {
      resumeToken: joined1.resumeToken,
    });
    await tab2.take((m) => m.type === "topic", "タブ2の初期お題");

    // Then: 同じ参加者として扱われる
    expect(joined2.participantId).toBe(joined1.participantId);

    // When: どちらか一方から掲げる
    tab1.send({ command: "topic.set", title: "決めた", body: "" });

    // Then: 両方のタブへ新しいお題が届く（同じ参加者の 2 接続とも配信先である）
    const onTab1 = await tab1.take(
      (m) => m.type === "topic" && m.state.topic?.title === "決めた",
      "タブ1への配信",
    );
    const onTab2 = await tab2.take(
      (m) => m.type === "topic" && m.state.topic?.title === "決めた",
      "タブ2への配信",
    );
    if (onTab1.type !== "topic" || onTab2.type !== "topic") throw new Error("topic ではない");
    expect(onTab1.state.topic?.title).toBe("決めた");
    expect(onTab2.state.topic?.title).toBe("決めた");
  });
});

/**
 * `ai.unlock` のレート制限は、`room.join` と同じゲート（同じバケツ）へ積算する。
 * 接続を張り直しても残量は戻らず、同じ IP の timer の `room.join` からも
 * 同じ枯渇が観測できる（1 IP 1 バケツ・#103 と同じ形の検証をお題の接続でも行う）。
 *
 * @requirements #91 E21
 */
describe("お題の ai.unlock は room.join と同じレート制限のバケツを共有する", () => {
  it("接続を張り直しても RATE_LIMITED が持ち越され、同じ IP の timer の room.join も拒まれる", async () => {
    // Given: AI 解錠が有効な構成で、ハブ経由でルームを作り、同じ IP からお題の接続で参加する
    await server.close(); // beforeEach の既定構成では AI が無効なので、独自構成へ張り替える
    server = startLiveSyncServer({
      AI_UNLOCK_KEY: "right",
      CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-dummy",
    });
    const xff = { "x-forwarded-for": "203.0.113.91" };
    const hub = await server.connectHub("hub", xff);
    const created = await hubCreate(hub, "AI 部屋", "あや");
    const first = await server.connectTopic("first", xff);
    await topicJoin(first, created.code, "攻撃者");

    // When 1: 合言葉を間違え続けてバケツを使い切る
    const drained = await drainTopicBadUnlocks(first, DEFAULT_CAPACITY + 1);
    expect(drained.at(-1)).toBe("RATE_LIMITED");

    // Then 1（逆方向）: 同じ IP の timer の room.join も同じバケツを見て拒否される
    const timerProbe = await server.connect("timer-probe", xff);
    const timerCodes = await drainBadTimerJoins(timerProbe, 3);
    expect(timerCodes).toContain("JOIN_RATE_LIMITED");
    await timerProbe.close();

    // When 2: 切断して繋ぎ直す（新しい connId・同じ IP）。バケツが空のままだと
    // `room.join` 自体が JOIN_RATE_LIMITED で拒まれる（`join-room.ts` が判定を
    // 照会より前に置くため）ので、補充を待ってから参加し直す。
    // 成功した room.join はバケツを消費しないので、補充された分はそのまま
    // 次の ai.unlock の判定に残る。
    await first.close();
    let reconnected: LiveTopicClient | undefined;
    for (let attempt = 0; attempt < 5 && reconnected === undefined; attempt++) {
      await Bun.sleep(Math.ceil(1000 / DEFAULT_REFILL_PER_SEC) + 200);
      const candidate = await server.connectTopic(`retry-${attempt}`, xff);
      candidate.send({ command: "room.join", code: created.code, displayName: "攻撃者2" });
      const reply = await candidate.take(
        (m) => m.type === "room.joined" || m.type === "error",
        "再参加の応答",
      );
      if (reply.type === "room.joined") {
        reconnected = candidate;
      } else {
        await candidate.close();
      }
    }
    if (reconnected === undefined) {
      throw new LiveSetupError("補充を待っても再参加できなかった");
    }

    // Then 2: 張り直した直後でも RATE_LIMITED が再び現れる
    // （バケツが connId ではなくクライアント鍵＝IP に紐づいている証拠）
    const after = await drainTopicBadUnlocks(reconnected, 3);
    expect(after).toContain("RATE_LIMITED");
  });
});

/**
 * ルームが破棄されたあとは、お題の接続からの参加も ROOM_NOT_FOUND になる。
 *
 * @requirements #91 E6
 */
describe("ルームが破棄されたあとのお題の接続", () => {
  it("最後の 1 人が timer から抜けてルームが消えると、お題の接続の参加は ROOM_NOT_FOUND になる", async () => {
    // Given: timer の入口で 1 人だけの部屋を作る
    const solo = await server.connect("solo");
    const created = await createRoom(solo, "ひとり");

    // When: 自分自身を退出させる（在室者が 0 人になり、ルームが破棄される・#79）
    solo.send({ command: "participant.remove", participantId: created.participantId });
    const left = await solo.take("error");
    // LEFT_ROOM は「自分自身の退出」の通知であると同時に、ここでは
    // 「ルームの破棄が完了した」ことを示す合図として使う（`participant-remove.ts`）。
    expect(left.code).toBe("LEFT_ROOM");

    // Then: そのコードへお題の接続で参加すると ROOM_NOT_FOUND になる
    const topic = await server.connectTopic();
    topic.send({ command: "room.join", code: created.code, displayName: "あとから" });
    const reply = await topic.take(
      (m) => m.type === "room.joined" || m.type === "error",
      "参加の応答",
    );
    if (reply.type !== "error") throw new Error("error ではない");
    expect(reply.code).toBe("ROOM_NOT_FOUND");
  });
});
