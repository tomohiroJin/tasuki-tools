/**
 * 実 WebSocket 越しの業務プロトコル通し（Issue #80）。
 *
 * ⚠ **この層が無かった。** 業務ロジックのテスト 356 件は `handlers.handleCommand()` を
 * 直接呼ぶ in-process 方式で、送信は `SpyBroadcaster`（送信を模したもの）で見ている。
 * 既存の実 WS テスト 4 本はトランスポート層（Origin・接続数・ハートビート・HTTP フック）
 * だけを見ていて `onMessage` はダミーだった。つまり
 * **「WS で受けたコマンドが handlers に届き、その結果が JSON として実ソケットへ返る」
 * ことを確かめたテストが 1 件も無かった。**
 *
 * ここでは `SpyBroadcaster` を使わない。使った時点で「送信を模したもの」を見ることになり、
 * この層の存在理由（本物のソケットに何が届くか）が消えるため。
 *
 * @requirements FR-013
 */

import { describe, it, expect, afterEach } from "bun:test";
import * as v from "valibot";
import { ServerMsgSchema } from "@tasuki/timer-core";
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

describe("実 WS 越しの業務プロトコル", () => {
  it("room.create → join → member.add → phase.set → START → driver.assign → complete が実ソケットで通る", async () => {
    // Given: 起動したサーバーへホストとゲストが実際に接続する
    server = startLiveSyncServer();
    const host = await server.connect("host");
    const guest = await server.connect("guest");

    // When 1: ルーム作成
    const created = await createRoom(host, "ホスト");

    // Then 1: room.created の**中身**が届く（ルームコードと本人の識別子・トークン）
    expect(created.code).toMatch(/\S/);
    expect(created.participantId).toMatch(/\S/);
    expect(created.hostToken).toMatch(/\S/);
    expect(created.resumeToken).toMatch(/\S/);
    // 続けて自分のルームの snapshot が届く
    const firstSnapshot = await host.take("snapshot");
    expect(firstSnapshot.room.code).toBe(created.code);
    expect(firstSnapshot.room.hostParticipantId).toBe(created.participantId);
    expect(firstSnapshot.room.phase).toBe("setup");
    // 作成者は作成時点でローテーションに並んでいる（room-create.ts）
    expect(firstSnapshot.room.session.rotation).toEqual([created.participantId]);

    // When 2: ゲストが参加
    const joined = await joinRoom(guest, created.code, "ゲスト");

    // Then 2: 参加者本人には room.joined と snapshot が、ホストにも更新後の snapshot が届く
    expect(joined.participantId).not.toBe(created.participantId);
    await guest.take("snapshot", (m) => m.room.participants.length === 2);
    await host.until(
      (msgs) => msgs.some((m) => m.type === "snapshot" && m.room.participants.length === 2),
      "ホストへ 2 人ぶんの snapshot が届く",
    );

    // When 3: ゲストがローテーションへ加わる（作成者は作成時点で並んでいる）
    await addToRotation(guest, joined.participantId);

    // Then 3: rotation は参加者IDの配列で届き、config.members は表示名へ写される
    const rotated = await host.take(
      "snapshot",
      (m) => m.room.session.rotation.length === 2,
    );
    expect(rotated.room.session.rotation).toEqual([created.participantId, joined.participantId]);
    expect(rotated.room.config.members).toEqual(["ホスト", "ゲスト"]);

    // When 4: セッション段階へ移して開始する
    host.send({ command: "phase.set", phase: "session" });
    await host.take("snapshot", (m) => m.room.phase === "session");
    host.send({ command: "session.act", action: "START" });

    // Then 4: 時計が走った状態が全員へ配信される
    await host.take("snapshot", (m) => m.room.clock.running);
    await guest.until(
      (msgs) => msgs.some((m) => m.type === "snapshot" && m.room.clock.running),
      "ゲストへ稼働中の snapshot が届く",
    );
    expect(host.latestRoom().startedAt).toBeGreaterThan(0);

    // When 5: ゲストをドライバーに指名する
    host.send({ command: "driver.assign", participantId: joined.participantId });

    // Then 5: 現ドライバーがゲストへ移った状態が届く
    const assigned = await host.take(
      "snapshot",
      (m) => m.room.session.rotation[m.room.session.currentIndex] === joined.participantId,
    );
    expect(assigned.room.session.currentIndex).toBe(1);

    // When 6: お題を要求する。AI 鍵持ちの候補が誰も居ないので定型で確定する（FR-026 の末尾）
    host.send({ command: "problem.request", requestId: "req-1" });
    const withProblem = await host.take("snapshot", (m) => m.room.problem !== null);
    expect(withProblem.room.problem!.title).toMatch(/\S/);

    // When 7: 完成
    host.send({ command: "session.complete" });

    // Then 7: 完成フェーズの snapshot と、実行者を伝える notice シグナルが届く
    await host.take("snapshot", (m) => m.room.phase === "celebration");
    const notice = await guest.take("signal", (m) => m.signal === "notice");
    expect(notice).toMatchObject({
      type: "signal",
      signal: "notice",
      action: "session-completed",
      actorName: "ホスト",
      actorParticipantId: created.participantId,
    });
    // 完成記録が snapshot に載って全員へ届く（結果が利用者に見える経路）
    const completed = guest.latestRoom();
    expect(completed.sessionRecords).toHaveLength(1);
    expect(completed.sessionRecords[0]!.members).toEqual(["ホスト", "ゲスト"]);
  });

  it("実ソケットに届くフレームは、すべて ServerMsg スキーマに適合する", async () => {
    // Given: 上の通しと同じ操作を一通り流し、届いたフレームを集める
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
    host.send({ command: "session.complete" });
    await host.take("snapshot", (m) => m.room.phase === "celebration");

    // When: 生テキストをそのままスキーマに通す（配信側の型注釈ではなく wire の実物を見る）
    const frames = [...host.rawFrames, ...guest.rawFrames];
    const invalid = frames.filter(
      (raw) => !v.safeParse(ServerMsgSchema, JSON.parse(raw)).success,
    );

    // Then
    expect(frames.length).toBeGreaterThan(0);
    expect(invalid).toEqual([]);
  });

  it("time.ping には time.pong がそのソケットへ返る", async () => {
    // Given
    server = startLiveSyncServer();
    const client = await server.connect("client");

    // When: 在室していなくても応答する（在室を前提としないコマンド・FR-151）
    client.send({ command: "time.ping", clientTime: 12_345 });

    // Then
    const pong = await client.take("time.pong");
    expect(pong.serverTime).toBeGreaterThan(0);
  });
});
