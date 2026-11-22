/**
 * うちわけの接続（`?tool=track`）を実 WebSocket 越しに確かめる（#476）。
 *
 * ## なぜ実 WS で見るか
 *
 * `track-handlers.test.ts`・`track-auto-stop.test.ts` は関数を直接呼び、送信と猶予を偽物で観測している。
 * あれは規則そのものを網羅する場所である。ここが見るのは**別の 1 点** ——
 * 「`WsAdapter` → `track-handlers` → 名簿・お題の宛先 → 実ソケット」と、
 * 「切断 → 名簿の配信 → 全員不在の数え直し → 猶予 → 自動の停止」の**配線**が本当につながっているか。
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { TrackView } from "@tasuki/track-core";
import type { TrackServerMsg } from "../src/ports/track-server-msg.js";
import {
  LiveSetupError,
  startLiveSyncServer,
  type LiveHubClient,
  type LiveSyncServer,
  type LiveTrackClient,
} from "./support/live-sync-server.js";

/** 全員切断の猶予（試験用に縮める） */
const GRACE_MS = 200;

let server: LiveSyncServer;

beforeEach(() => {
  server = startLiveSyncServer({ TRACK_AUTO_STOP_GRACE_MS: String(GRACE_MS) });
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

type TrackFrame = Extract<TrackServerMsg, { type: "track" }>;
const viewOf = (m: TrackServerMsg): TrackView => (m as TrackFrame).state as TrackView;
const isTrackWith =
  (pred: (v: TrackView) => boolean) =>
  (m: TrackServerMsg): boolean =>
    m.type === "track" && pred(viewOf(m));

/** うちわけの接続でルームへ参加する。参加後の `track` フレームを返す。 */
async function trackJoin(client: LiveTrackClient, code: string, displayName: string): Promise<TrackView> {
  client.send({ command: "room.join", code, displayName });
  const joined = await client.take((m) => m.type === "room.joined" || m.type === "error", "room.joined");
  if (joined.type !== "room.joined") {
    throw new LiveSetupError(`room.join("${displayName}") が ${joined.type === "error" ? joined.code : joined.type} で失敗した`);
  }
  return viewOf(await client.take((m) => m.type === "track", "参加直後のうちわけの状態"));
}

describe("うちわけの配信", () => {
  it("片方の開始が 2 本へ同じ写しで届き、ほかのツールの接続には track フレームが届かない", async () => {
    // Given
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const t1 = await server.connectTrack("t1");
    await trackJoin(t1, code, "いずみ");
    const t2 = await server.connectTrack("t2");
    await trackJoin(t2, code, "かえで");
    const timer = await server.connect("timer");
    timer.send({ command: "room.join", code, displayName: "ひかり" });
    await timer.take("room.joined");
    const agenda = await server.connectAgenda("agenda");
    agenda.send({ command: "room.join", code, displayName: "みお" });
    await agenda.take((m) => m.type === "agenda", "参加直後の進行タイマー");

    // When
    t1.send({ command: "track.start", label: "実装", kind: "work" });

    // Then
    const v1 = viewOf(await t1.take(isTrackWith((v) => v.segments.length === 1), "t1 の開始"));
    const v2 = viewOf(await t2.take(isTrackWith((v) => v.segments.length === 1), "t2 の開始"));
    expect(v2.segments).toEqual(v1.segments);
    expect(v1.segments[0]).toMatchObject({ label: "実装", kind: "work", endMs: null });

    await Bun.sleep(200);
    const types = (received: unknown[]): string[] => received.map((m) => (m as { type: string }).type);
    for (const received of [hub.received, timer.received, agenda.received]) {
      expect(types(received)).not.toContain("track");
    }
  });

  it("ほぼ同時の 2 つの切り替えは、後に届いた方が残り、区切りは重ならない", async () => {
    // Given: 計測中
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const t1 = await server.connectTrack("t1");
    await trackJoin(t1, code, "いずみ");
    const t2 = await server.connectTrack("t2");
    await trackJoin(t2, code, "かえで");
    t1.send({ command: "track.start", label: "設計", kind: "work" });
    await t2.take(isTrackWith((v) => v.segments.length === 1), "開始");
    await Bun.sleep(1100);

    // When: 2 人がほぼ同時に別の作業へ切り替える
    t1.send({ command: "track.start", label: "実装", kind: "work" });
    t2.send({ command: "track.start", label: "調べもの", kind: "work" });
    t1.send({ command: "track.sync" });
    await Bun.sleep(200);
    t2.send({ command: "track.sync" });

    // Then: 1 秒未満の区切りは残らないので、閉じた「設計」と、計測中の 1 つだけになる
    const final = viewOf(await t2.take(isTrackWith((v) => v.segments.length === 2 && v.rev >= 3), "切り替えの後"));
    expect(final.segments.map((g) => g.label)[0]).toBe("設計");
    expect(["実装", "調べもの"]).toContain(final.segments[1]!.label);
    expect(final.segments[1]!.startMs).toBe(final.segments[0]!.endMs!);
    expect(final.segments[1]!.endMs).toBeNull();
  });

  it("後から入った人には、送る時点の位置で計った写しが届く（再読み込みで経過が合う）", async () => {
    // Given: 計測を始めて少し経った
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const t1 = await server.connectTrack("t1");
    await trackJoin(t1, code, "いずみ");
    t1.send({ command: "track.start", label: "実装", kind: "work" });
    const started = viewOf(await t1.take(isTrackWith((v) => v.segments.length === 1), "開始"));
    await Bun.sleep(300);

    // When: 別の端末が入る
    const t2 = await server.connectTrack("t2");
    const view = await trackJoin(t2, code, "かえで");

    // Then: 位置は開始から 300ms 以上進んでいる（単調時計で計った経過）
    expect(view.nowMs - started.segments[0]!.startMs).toBeGreaterThanOrEqual(290);
    expect(view.epochWallMs).toBe(started.epochWallMs);
  });

  it("お題ツールで topic.set すると、うちわけの接続にも topic が届く", async () => {
    // Given
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const track = await server.connectTrack("track");
    await trackJoin(track, code, "いずみ");
    const topic = await server.connectTopic("topic");
    topic.send({ command: "room.join", code, displayName: "かえで" });
    await topic.take((m) => m.type === "topic", "参加直後のお題");

    // When
    topic.send({ command: "topic.set", title: "決めた", body: "本文" });

    // Then
    const frame = await track.take(
      (m) => (m as { type: string; state?: { topic?: { title?: string } } }).type === "topic" &&
        (m as { state: { topic?: { title?: string } } }).state.topic?.title === "決めた",
      "お題の配信",
    );
    // TrackServerMsg の型は topic を含まない（配るが、画面の契約には載せない）ので文字列で見る
    expect((frame as { type: string }).type).toBe("topic");
  });
});

describe("うちわけを操作できるのは track の接続だけ", () => {
  it("ハブ・お題・進行タイマーの接続から track のコマンドを送っても、記録は変わらない", async () => {
    // Given
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const track = await server.connectTrack("track");
    await trackJoin(track, code, "いずみ");
    const topic = await server.connectTopic("topic");
    topic.send({ command: "room.join", code, displayName: "かえで" });
    await topic.take((m) => m.type === "topic", "参加直後のお題");
    const agenda = await server.connectAgenda("agenda");
    agenda.send({ command: "room.join", code, displayName: "みお" });
    await agenda.take((m) => m.type === "agenda", "参加直後の進行タイマー");

    // When
    const cmd = JSON.stringify({ command: "track.start", label: "外から", kind: "work" });
    hub.sendRaw(cmd);
    topic.sendRaw(cmd);
    agenda.sendRaw(cmd);

    // Then: どれも境界で拒まれ、うちわけの接続には何も配られない
    for (const client of [hub, topic, agenda]) {
      const err = await client.take((m) => (m as { type: string }).type === "error", "境界の拒否");
      expect((err as { code: string }).code).toBe("INVALID_COMMAND");
    }
    track.send({ command: "track.sync" });
    const view = viewOf(await track.take((m) => m.type === "track", "いまの状態"));
    expect(view.segments).toEqual([]);
  });
});

describe("うちわけの全員切断", () => {
  it("全員が切断して猶予を過ぎると、区切りが印つきで閉じ、戻った人に問いかけが立つ", async () => {
    // Given: 計測中に、ルームの接続がすべて切れる
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const track = await server.connectTrack("track");
    await trackJoin(track, code, "あや");
    track.send({ command: "track.start", label: "実装", kind: "work" });
    await track.take(isTrackWith((v) => v.segments.length === 1), "開始");
    await Bun.sleep(1100);
    const beforeClose = Date.now();
    await track.close();
    await hub.close();

    // When: 猶予より長く待ってから戻る
    await Bun.sleep(GRACE_MS + 300);
    const back = await server.connectTrack("back");
    const view = await trackJoin(back, code, "あや");

    // Then: 閉じた位置は切断の時刻（猶予の後ではない）
    expect(view.segments).toHaveLength(1);
    const [segment] = view.segments;
    expect(segment!.autoClosed).toBe(true);
    expect(view.resumeOffer).toBe(true);
    const closedAtWall = view.epochWallMs + segment!.endMs!;
    expect(Math.abs(closedAtWall - beforeClose)).toBeLessThan(GRACE_MS);
  });

  it("猶予の内に戻れば（再読み込み）、区切りは閉じない", async () => {
    // Given
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const track = await server.connectTrack("track");
    await trackJoin(track, code, "あや");
    track.send({ command: "track.start", label: "実装", kind: "work" });
    await track.take(isTrackWith((v) => v.segments.length === 1), "開始");
    await track.close();
    await hub.close();

    // When: すぐ戻り、猶予より長く居続ける
    const back = await server.connectTrack("back");
    await trackJoin(back, code, "あや");
    await Bun.sleep(GRACE_MS + 300);
    back.send({ command: "track.sync" });

    // Then
    const view = viewOf(await back.take((m) => m.type === "track", "いまの状態"));
    expect(view.segments[0]!.endMs).toBeNull();
    expect(view.resumeOffer).toBe(false);
  });

  it("うちわけの画面を閉じても、ほかの道具に接続が残っていれば計り続ける", async () => {
    // Given: 玄関の接続は残したまま、うちわけの接続だけ閉じる
    const hub = await server.connectHub("hub");
    const code = await hubCreate(hub, "モブ", "あや");
    const track = await server.connectTrack("track");
    await trackJoin(track, code, "あや");
    track.send({ command: "track.start", label: "実装", kind: "work" });
    await track.take(isTrackWith((v) => v.segments.length === 1), "開始");
    await track.close();

    // When
    await Bun.sleep(GRACE_MS + 300);
    const back = await server.connectTrack("back");
    const view = await trackJoin(back, code, "あや");

    // Then
    expect(view.segments[0]!.endMs).toBeNull();
  });
});
