/**
 * 進行タイマーの接続（`?tool=agenda`）を実 WebSocket 越しに確かめる（#429）。
 *
 * ## なぜ実 WS で見るか
 *
 * `agenda-handlers.test.ts` は `handleMessage()` を直接呼び、送信は偽の `send` で観測している。
 * あれは規則そのものを網羅する場所である。ここが見るのは**別の 1 点** ——
 * 「`WsAdapter` → `agenda-handlers` → 名簿・お題の宛先 → 実ソケット」の**配線**が本当に
 * つながっているか。配線を外しても、in-process のテストは緑のまま通りうる。
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DEFAULT_CAPACITY } from "@tasuki/rate-limit";
import type { HubCommand, HubServerMsg } from "@tasuki/room-core";
import type { AgendaView } from "@tasuki/agenda-core";
import type { AgendaServerMsg } from "../src/ports/agenda-server-msg.js";
import {
  LiveSetupError,
  startLiveSyncServer,
  type LiveAgendaClient,
  type LiveHubClient,
  type LiveSyncServer,
} from "./support/live-sync-server.js";

let server: LiveSyncServer;

beforeEach(() => {
  server = startLiveSyncServer();
});
afterEach(async () => {
  await server.close();
});

const SCENARIO = {
  title: "定例",
  steps: [
    { name: "ふりかえり", durationSec: 60, onTimeout: "wait" as const },
    { name: "まとめ", durationSec: 60, onTimeout: "wait" as const },
  ],
};

/** ハブでルームを作り、コードを返す。作成直後の初期お題フレームを消費する。 */
async function hubCreate(hub: LiveHubClient, roomName: string, displayName: string): Promise<string> {
  hub.send({ command: "room.create", roomName, displayName });
  const created = await hub.take((m) => m.type === "room.created", "room.created");
  if (created.type !== "room.created") throw new LiveSetupError("room.created ではない");
  await hub.take((m) => m.type === "topic", "作成直後の初期お題");
  return created.code;
}

/** 進行タイマーの接続でルームへ参加する。参加後の `agenda` フレームまで読み進める。 */
async function agendaJoin(client: LiveAgendaClient, code: string, displayName: string): Promise<void> {
  client.send({ command: "room.join", code, displayName });
  const joined = await client.take((m) => m.type === "room.joined" || m.type === "error", "room.joined");
  if (joined.type !== "room.joined") {
    throw new LiveSetupError(`room.join("${displayName}") が ${joined.type === "error" ? joined.code : joined.type} で失敗した`);
  }
  await client.take((m) => m.type === "agenda", "参加直後の進行タイマーの状態");
}

type AgendaFrame = Extract<AgendaServerMsg, { type: "agenda" }>;
const viewOf = (m: AgendaServerMsg): AgendaView => (m as AgendaFrame).state as AgendaView;
const isAgendaWith =
  (pred: (v: AgendaView) => boolean) =>
  (m: AgendaServerMsg): boolean =>
    m.type === "agenda" && pred(viewOf(m));

/** ハブ・timer・poker・お題・ルーレットの接続を同じルームへ揃える。 */
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
  return { hub, timer, poker, topic, roulette };
}

describe("進行タイマーの配信", () => {
  it("片方の scenario.set → start が 2 本へ同じ currentId で届き、ほかのツールの接続には agenda フレームが届かない", async () => {
    // Given
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const a1 = await server.connectAgenda("a1");
    await agendaJoin(a1, code, "いずみ");
    const a2 = await server.connectAgenda("a2");
    await agendaJoin(a2, code, "かえで");
    const others = await otherTools(code, hub);

    // When
    a1.send({ command: "agenda.scenario.set", scenario: SCENARIO });
    await a1.take(isAgendaWith((v) => v.steps.length === 2), "シナリオの配信");
    a1.send({ command: "agenda.start" });

    // Then
    const r1 = viewOf(await a1.take(isAgendaWith((v) => v.phase === "running"), "a1 の開始"));
    const r2 = viewOf(await a2.take(isAgendaWith((v) => v.phase === "running"), "a2 の開始"));
    expect(r1.currentId).not.toBeNull();
    expect(r2.currentId).toBe(r1.currentId);

    await Bun.sleep(200);
    const types = (received: unknown[]): string[] => received.map((m) => (m as { type: string }).type);
    for (const received of [
      others.hub.received,
      others.timer.received,
      others.poker.received,
      others.topic.received,
      others.roulette.received,
    ]) {
      expect(types(received)).not.toContain("agenda");
    }
  });

  it("お題ツールで topic.set すると、進行タイマーの接続にも topic が届く", async () => {
    // Given
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const agenda = await server.connectAgenda("agenda");
    await agendaJoin(agenda, code, "いずみ");
    const topic = await server.connectTopic("topic");
    topic.send({ command: "room.join", code, displayName: "かえで" });
    await topic.take((m) => m.type === "topic", "参加直後のお題");

    // When
    topic.send({ command: "topic.set", title: "決めた", body: "本文" });

    // Then
    const frame = await agenda.take(
      (m) => (m as { type: string; state?: { topic?: { title?: string } } }).type === "topic" &&
        (m as { state: { topic?: { title?: string } } }).state.topic?.title === "決めた",
      "お題の配信",
    );
    // AgendaServerMsg の型は topic を含まない（配るが、画面の契約には載せない）ので文字列で見る
    expect((frame as { type: string }).type).toBe("topic");
  });
});

describe("進行タイマーの操作の競合", () => {
  it("2 本から同じ stepId の agenda.next をほぼ同時に送ると、currentId は 1 つだけ進む", async () => {
    // Given: 2 ステップを開始した 2 本の接続
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const a1 = await server.connectAgenda("a1");
    await agendaJoin(a1, code, "いずみ");
    const a2 = await server.connectAgenda("a2");
    await agendaJoin(a2, code, "かえで");
    a1.send({ command: "agenda.scenario.set", scenario: SCENARIO });
    a1.send({ command: "agenda.start" });
    const started = viewOf(await a2.take(isAgendaWith((v) => v.phase === "running"), "開始"));
    const firstId = started.currentId!;
    const secondId = started.steps[1]!.id;

    // When: 同じ stepId で 2 本から同時に次へ
    a1.send({ command: "agenda.next", stepId: firstId });
    a2.send({ command: "agenda.next", stepId: firstId });

    // Then: 2 ステップ目で止まる（2 回進めば完了になる）
    await a1.take(isAgendaWith((v) => v.currentId === secondId), "a1 に 2 ステップ目");
    await Bun.sleep(300);
    for (const c of [a1, a2]) {
      const last = [...c.received].reverse().find((m) => m.type === "agenda");
      expect(viewOf(last!).currentId).toBe(secondId);
      expect(viewOf(last!).phase).toBe("running");
    }
    // 負けた側には送り主だけへの現在の状態（エラーではなく状態 1 通）が返り、配られた進行は 1 回だけ
    const advances = (c: LiveAgendaClient): number =>
      c.received.filter((m) => m.type === "agenda" && viewOf(m).currentId === secondId).length;
    expect(advances(a1) + advances(a2)).toBeGreaterThanOrEqual(2);
  });
});

describe("進行タイマーの操作は進行タイマーの接続だけ", () => {
  it("ハブ・timer・poker・お題・ルーレットの接続から送った agenda.start は拒否され、状態は idle のまま", async () => {
    // Given
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const agenda = await server.connectAgenda("agenda");
    await agendaJoin(agenda, code, "いずみ");
    const { timer, poker, topic, roulette } = await otherTools(code, hub);

    // When: 5 種それぞれから送る（型では送れないので境界を迂回する）
    timer.sendRaw(JSON.stringify({ command: "agenda.start" }));
    poker.send({ command: "agenda.start" } as never);
    topic.send({ command: "agenda.start" } as never);
    hub.send({ command: "agenda.start" } as unknown as HubCommand);
    roulette.send({ command: "agenda.start" } as never);

    // Then: 5 種すべてで拒否される
    expect((await timer.take("error")).code).toBe("INVALID_COMMAND");
    const pokerErr = await poker.take((m) => m.type === "error", "poker の拒否");
    if (pokerErr.type !== "error") throw new Error("error ではない");
    expect(pokerErr.code).toBe("invalid-message");
    for (const [name, c] of [["お題", topic], ["ハブ", hub], ["ルーレット", roulette]] as const) {
      const err = await c.take((m) => m.type === "error", `${name}の拒否`);
      if (err.type !== "error") throw new Error("error ではない");
      expect(err.code).toBe("INVALID_COMMAND");
    }

    // Then: 拒否は 1 通ずつだけ（別の層が同じコマンドを拾って 2 通目を返していない）
    await Bun.sleep(200);
    const errorCount = (received: unknown[]): number =>
      received.filter((m) => (m as { type: string }).type === "error").length;
    expect([timer, poker, topic, hub, roulette].map((c) => errorCount(c.received))).toEqual([1, 1, 1, 1, 1]);

    // Then: 進行タイマーの状態は idle のまま
    agenda.send({ command: "agenda.sync" });
    const synced = viewOf(await agenda.take(isAgendaWith(() => true), "同期"));
    expect(synced.phase).toBe("idle");
  });
});

describe("進行タイマーの接続の参加の総当たり", () => {
  it("room.join を失敗させ続けると、接続を張り直しても枠が続く", async () => {
    // Given: 同じ IP を名乗る 2 本の進行タイマーの接続（A・B）
    const xff = { "x-forwarded-for": "203.0.113.202" };
    const a = await server.connectAgenda("a", xff);
    const b = await server.connectAgenda("b", xff);

    // When: A で失敗を使い切る
    const codes = async (c: LiveAgendaClient, count: number): Promise<string[]> => {
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
