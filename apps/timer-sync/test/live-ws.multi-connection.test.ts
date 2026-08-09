/**
 * 複数の実 WebSocket 接続をまたぐ振る舞い（Issue #80）。
 *
 * presence・再接続・スナップショット復帰・同時実行は、いずれも
 * **「別のソケットである」ことが本質**の性質である。in-process のテストは
 * `handleCommand("conn-1", …)` と文字列を変えるだけで別接続を演じており、
 * ソケットが実際に閉じたときの `onDisconnect` 配線も、再接続で新しい接続に
 * 状態が引き継がれる経路も通っていない。ここは本当に別ソケットで再現する。
 *
 * @requirements FR-014, FR-018, FR-020, FR-026
 */

import { describe, it, expect, afterEach } from "bun:test";
import {
  startLiveSyncServer,
  createRoom,
  joinRoom,
  addToRotation,
  type LiveSyncServer,
} from "./support/live-sync-server.js";

let server: LiveSyncServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("実 WS・複数接続", () => {
  it("ソケットを閉じると他の接続へ presence: offline が配信され、再接続で online に戻る", async () => {
    // Given: ホストとゲストが在室している
    server = startLiveSyncServer();
    const host = await server.connect("host");
    const guest = await server.connect("guest");
    const created = await createRoom(host, "ホスト");
    const joined = await joinRoom(guest, created.code, "ゲスト");

    // When: ゲストのソケットを**実際に閉じる**
    await guest.close();

    // Then: ホストへゲストが offline になった snapshot が届く
    await host.until(
      (msgs) =>
        msgs.some(
          (m) =>
            m.type === "snapshot" &&
            m.room.participants.some(
              (p) => p.participantId === joined.participantId && p.presence === "offline",
            ),
        ),
      "ゲストの offline がホストへ配信される",
    );

    // When: 別ソケットで resumeToken を付けて復帰する
    const revived = await server.connect("guest-again");
    revived.send({
      command: "room.join",
      code: created.code,
      displayName: "ゲスト",
      hasAiKey: false,
      resumeToken: joined.resumeToken,
    });

    // Then: ホストへ online に戻った snapshot が届く
    await host.until(
      (msgs) =>
        msgs.some(
          (m) =>
            m.type === "snapshot" &&
            m.room.participants.some(
              (p) => p.participantId === joined.participantId && p.presence === "online",
            ),
        ),
      "ゲストの online がホストへ配信される",
    );
  });

  it("resumeToken での復帰は新規参加者を増やさず、直前の状態を snapshot で受け取る", async () => {
    // Given: セッションを開始し、ローテーションまで組んだ状態を作る
    server = startLiveSyncServer();
    const host = await server.connect("host");
    const guest = await server.connect("guest");
    const created = await createRoom(host, "ホスト");
    const joined = await joinRoom(guest, created.code, "ゲスト");
    await addToRotation(guest, joined.participantId);
    host.send({ command: "phase.set", phase: "session" });
    await host.take("snapshot", (m) => m.room.phase === "session");
    host.send({ command: "session.act", action: "START" });
    await host.take("snapshot", (m) => m.room.clock.running);

    // When: ゲストが落ちて、別ソケットで resumeToken を使って復帰する
    await guest.close();
    const revived = await server.connect("guest-again");
    revived.send({
      command: "room.join",
      code: created.code,
      displayName: "ゲスト",
      hasAiKey: false,
      resumeToken: joined.resumeToken,
    });
    const restored = await revived.take("snapshot");

    // Then 1: 参加者は増えていない（新規 join として扱われていない）
    expect(restored.room.participants).toHaveLength(2);
    expect(restored.room.participants.map((p) => p.participantId)).toContain(
      joined.participantId,
    );

    // Then 2: 進行中の状態がそのまま届く（復帰した画面が続きから描ける）
    expect(restored.room.phase).toBe("session");
    expect(restored.room.clock.running).toBe(true);
    expect(restored.room.session.rotation).toEqual([created.participantId, joined.participantId]);

    // Then 3: 復帰経路は room.joined を返さない（新規参加とは別の経路であることの表れ）
    expect(revived.all("room.joined")).toEqual([]);
  });

  it("resumeToken が無いまま同じ名前で入り直すと、別人として増える（復帰との違い）", async () => {
    // Given
    server = startLiveSyncServer();
    const host = await server.connect("host");
    const guest = await server.connect("guest");
    const created = await createRoom(host, "ホスト");
    const first = await joinRoom(guest, created.code, "ゲスト");
    await guest.close();

    // When: トークンを持たずに同じ表示名で入り直す
    const stranger = await server.connect("stranger");
    const second = await joinRoom(stranger, created.code, "ゲスト2");

    // Then: 別の participantId が振られ、在室者が 3 人になる
    expect(second.participantId).not.toBe(first.participantId);
    const room = (await stranger.take("snapshot")).room;
    expect(room.participants).toHaveLength(3);
  });

  it("3 接続が同時に member.add を送っても、全員のローテーションが一致する", async () => {
    // Given: ホストと 3 人のゲストが在室している（ホストは作成時点で輪に並んでいる）
    server = startLiveSyncServer();
    const host = await server.connect("host");
    const a = await server.connect("a");
    const b = await server.connect("b");
    const c = await server.connect("c");
    const created = await createRoom(host, "ホスト");
    const aJoined = await joinRoom(a, created.code, "A");
    const bJoined = await joinRoom(b, created.code, "B");
    const cJoined = await joinRoom(c, created.code, "C");

    // When: 3 つのソケットから**同時に**自分をローテーションへ加える
    a.send({ command: "member.add", participantId: aJoined.participantId });
    b.send({ command: "member.add", participantId: bJoined.participantId });
    c.send({ command: "member.add", participantId: cJoined.participantId });

    // Then: 全員の手元に「4 人が 1 度ずつ入った」同じ最終状態が届く
    const expected = [
      created.participantId,
      aJoined.participantId,
      bJoined.participantId,
      cJoined.participantId,
    ].sort();
    for (const client of [host, a, b, c]) {
      await client.until(
        (msgs) => msgs.some((m) => m.type === "snapshot" && m.room.session.rotation.length === 4),
        `${client.label} へ 4 人ぶんの rotation が届く`,
      );
      expect([...client.latestRoom().session.rotation].sort()).toEqual(expected);
    }
    // エラーは 1 件も返っていない（取り合いで誰かが弾かれていない）
    expect([...host.all("error"), ...a.all("error"), ...b.all("error"), ...c.all("error")]).toEqual(
      [],
    );
  });

  it("AI 鍵を持つ別接続へ need-problem が届き、その接続からの problem.submit が確定する", async () => {
    // Given: AI 鍵を持つと申告したゲストが在室している（お題生成の代表候補・FR-026）
    server = startLiveSyncServer();
    const host = await server.connect("host");
    const guest = await server.connect("guest");
    const created = await createRoom(host, "ホスト");
    await joinRoom(guest, created.code, "ゲスト", { hasAiKey: true });

    // When: ホストがお題を要求する
    host.send({ command: "problem.request", requestId: "req-1" });

    // Then 1: 依頼は**ホストではなく代表候補のソケットへ**届く
    const needProblem = await guest.take("signal", (m) => m.signal === "need-problem");
    expect(needProblem).toMatchObject({ signal: "need-problem", requestId: "req-1" });
    expect(needProblem.deadlineMs).toBeGreaterThan(0);

    // When: 代表が生成結果を投入する
    guest.send({
      command: "problem.submit",
      requestId: "req-1",
      usedFallback: false,
      problem: {
        title: "FizzBuzz",
        description: "3 の倍数と 5 の倍数を置き換える",
        requirements: ["1 から 15 まで出力する"],
        exampleTest: "fizzbuzz(3) === 'Fizz'",
        hints: [],
      },
    });

    // Then 2: 投入したお題が全員へ配信される（投入した本人にも、依頼したホストにも）
    for (const client of [host, guest]) {
      await client.until(
        (msgs) => msgs.some((m) => m.type === "snapshot" && m.room.problem?.title === "FizzBuzz"),
        `${client.label} へ投入されたお題が配信される`,
      );
    }
    expect(host.latestRoom().problem?.description).toBe("3 の倍数と 5 の倍数を置き換える");
  });

  it("presence.ping は handlers へ渡らず、エラーを返さない（アダプタ手前で横取りされる配線）", async () => {
    // Given: ルームに入っていない接続（在室前提コマンドなら NOT_IN_ROOM が返る状況）
    server = startLiveSyncServer();
    const client = await server.connect("client");

    // When
    client.send({ command: "presence.ping" });

    // Then: 何も返らない。横取りの配線が外れると handleCommand の default へ落ち、
    // NOT_IN_ROOM が返ってくる。
    await client.expectSilence();
    expect(client.all("error")).toEqual([]);
  });
});
