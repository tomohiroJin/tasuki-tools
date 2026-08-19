/**
 * UI からは到達しにくい経路を実 WS で叩く（Issue #80）。
 *
 * 画面は権限に応じてボタンを出し分ける（`isAllowed`）ため、拒否されるはずの操作は
 * そもそも押せない。つまり**サーバー側の拒否が本当に効いているかは画面からは試せない**。
 * 合言葉の検証・AI 解錠・並べ替え・中断も同様に、実ソケットから直接叩いてはじめて
 * 「拒否と許可が実際にどう返るか」を確かめられる。
 *
 * 判定規則そのものの網羅は `permissions-before-start.test.ts` /
 * `permissions-after-start.test.ts` / `packages/timer-core` 側の役目。
 * ここは**その判定が実経路に効いているか**だけを見る。
 *
 * @requirements FR-063, FR-066, FR-067, FR-071, R4-2
 */

import { describe, it, expect, afterEach } from "bun:test";
import {
  startLiveSyncServer,
  createRoom,
  joinRoom,
  addToRotation,
  type LiveClient,
  type LiveSyncServer,
} from "./support/live-sync-server.js";

/** テスト用の AI 解錠合言葉（本物の秘密ではない。ここでしか使わない）。 */
const TEST_AI_KEY = "テスト用-解錠合言葉";

let server: LiveSyncServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** ホストとゲストが在室しているルームを実 WS で用意する。 */
async function aLiveRoom(live: LiveSyncServer): Promise<{
  host: LiveClient;
  guest: LiveClient;
  code: string;
  hostId: string;
  guestId: string;
}> {
  const host = await live.connect("host");
  const guest = await live.connect("guest");
  const created = await createRoom(host, "ホスト");
  const joined = await joinRoom(guest, created.code, "ゲスト");
  return {
    host,
    guest,
    code: created.code,
    hostId: created.participantId,
    guestId: joined.participantId,
  };
}

describe("実 WS 越しの権限", () => {
  it("開始前は編集者でもホスト限定コマンドを拒否され、ホストなら通る", async () => {
    // Given: 参加しただけのゲストは editor（2 層モデル）
    server = startLiveSyncServer();
    const { host, guest } = await aLiveRoom(server);

    // When: 編集者が開始前に phase.set（HOST_ONLY_BEFORE_START）を送る
    guest.send({ command: "phase.set", phase: "session" });

    // Then: 拒否され、状態は変わらない
    const denied = await guest.take("error");
    expect(denied.code).toBe("UNAUTHORIZED");
    await guest.expectSilence();

    // When: 同じコマンドをホストが送る
    host.send({ command: "phase.set", phase: "session" });

    // Then: 通る
    const snapshot = await host.take("snapshot", (m) => m.room.phase === "session");
    expect(snapshot.room.phase).toBe("session");
  });

  it("見学者は状態変更を拒否されるが、自分自身の改名は通る", async () => {
    // Given: ゲストを viewer へ降格する
    server = startLiveSyncServer();
    const { host, guest, guestId } = await aLiveRoom(server);
    host.send({ command: "role.set", participantId: guestId, role: "viewer" });
    await guest.take(
      "snapshot",
      (m) => m.room.participants.find((p) => p.participantId === guestId)?.role === "viewer",
    );

    // When: 見学者が自分をローテーションへ加えようとする（EDITOR_PLUS_COMMANDS）
    guest.send({ command: "member.add", participantId: guestId });

    // Then: 自分対象でも拒否される（FR-067 がステップ1より先に効く枝）
    expect((await guest.take("error")).code).toBe("UNAUTHORIZED");

    // When: 見学者が自分を改名する（SELF_SCOPED_COMMANDS）
    guest.send({ command: "participant.rename", participantId: guestId, displayName: "見学者" });

    // Then: 通る
    const renamed = await guest.take(
      "snapshot",
      (m) => m.room.participants.find((p) => p.participantId === guestId)?.displayName === "見学者",
    );
    expect(renamed.room.participants.find((p) => p.participantId === guestId)?.role).toBe("viewer");
  });

  it("開始後は編集者もセッションを畳める（実経路で効いている）", async () => {
    // Given: 開始済みのルーム
    server = startLiveSyncServer();
    const { host, guest, guestId } = await aLiveRoom(server);
    await addToRotation(guest, guestId);
    host.send({ command: "phase.set", phase: "session" });
    await host.take("snapshot", (m) => m.room.phase === "session");
    host.send({ command: "session.act", action: "START" });
    await host.take("snapshot", (m) => m.room.clock.running);

    // When: ホストではない編集者が中断する
    guest.send({ command: "session.abort" });

    // Then: 受理され、実行者を伝える notice が全員へ届く
    await guest.take("snapshot", (m) => m.room.phase === "celebration");
    const notice = await host.take("signal", (m) => m.signal === "notice");
    expect(notice).toMatchObject({
      signal: "notice",
      action: "session-aborted",
      actorName: "ゲスト",
      actorParticipantId: guestId,
    });
    // 中断は完成記録を残さない（FR-020）
    expect(host.latestRoom().sessionRecords).toEqual([]);
  });
});

describe("実 WS 越しの合言葉（room.passphrase.set と join の検証）", () => {
  it("合言葉つきルームは、未指定なら PASSPHRASE_REQUIRED、誤りなら PASSPHRASE_MISMATCH、一致なら参加できる", async () => {
    // Given: ホストが合言葉を設定する
    server = startLiveSyncServer();
    const host = await server.connect("host");
    const created = await createRoom(host, "ホスト");
    await host.take("snapshot");
    host.send({ command: "room.passphrase.set", passphrase: "あいことば" });
    const protectedRoom = await host.take("snapshot", (m) => m.room.passphraseProtected === true);
    // 平文は snapshot に載らない（サーバー側の tokenStore にだけ在る）
    expect(JSON.stringify(protectedRoom)).not.toContain("あいことば");

    // When 1: 合言葉なしで参加を試みる
    const noPass = await server.connect("no-pass");
    noPass.send({
      command: "room.join",
      code: created.code,
      displayName: "無指定",
      hasAiKey: false,
    });
    // Then 1
    expect((await noPass.take("error")).code).toBe("PASSPHRASE_REQUIRED");

    // When 2: 誤った合言葉で参加を試みる
    const wrongPass = await server.connect("wrong-pass");
    wrongPass.send({
      command: "room.join",
      code: created.code,
      displayName: "誤り",
      hasAiKey: false,
      passphrase: "ちがう",
    });
    // Then 2
    expect((await wrongPass.take("error")).code).toBe("PASSPHRASE_MISMATCH");

    // When 3: 前後空白つきの正しい合言葉で参加する（保持側と同じ正規化が効く）
    const okPass = await server.connect("ok-pass");
    const joined = await joinRoom(okPass, created.code, "正解", { passphrase: "  あいことば  " });
    // Then 3
    expect(joined.participantId).toMatch(/\S/);
  });

  it("空文字の room.passphrase.set は保護を解除する", async () => {
    // Given: 合言葉つきのルーム
    server = startLiveSyncServer();
    const host = await server.connect("host");
    const created = await createRoom(host, "ホスト");
    await host.take("snapshot");
    host.send({ command: "room.passphrase.set", passphrase: "あいことば" });
    await host.take("snapshot", (m) => m.room.passphraseProtected === true);

    // When
    host.send({ command: "room.passphrase.set", passphrase: "" });
    await host.take("snapshot", (m) => m.room.passphraseProtected === false);

    // Then: 合言葉なしで参加できる
    const guest = await server.connect("guest");
    const joined = await joinRoom(guest, created.code, "ゲスト");
    expect(joined.participantId).toMatch(/\S/);
  });
});

describe("実 WS 越しの ai.unlock", () => {
  it("合言葉が一致すれば aiUnlocked が snapshot に載り、不一致なら AI_UNLOCK_FAILED が返る", async () => {
    // Given: AI 機能が有効な構成（トークンと合言葉が両方ある）で起動する
    server = startLiveSyncServer({
      AI_UNLOCK_KEY: TEST_AI_KEY,
      CLAUDE_CODE_OAUTH_TOKEN: "テスト用ダミートークン",
    });
    const host = await server.connect("host");
    await createRoom(host, "ホスト");
    const initial = await host.take("snapshot");
    expect(initial.room.aiUnlocked).toBeUndefined();

    // When 1: 誤った合言葉
    host.send({ command: "ai.unlock", key: "ちがう合言葉" });
    // Then 1
    expect((await host.take("error")).code).toBe("AI_UNLOCK_FAILED");

    // When 2: 正しい合言葉
    host.send({ command: "ai.unlock", key: TEST_AI_KEY });
    // Then 2: 解錠済みが配信される。合言葉そのものは wire に載らない
    const unlocked = await host.take("snapshot", (m) => m.room.aiUnlocked === true);
    expect(unlocked.room.problemMode).toBe("ai");
    expect(JSON.stringify(unlocked)).not.toContain(TEST_AI_KEY);
  });

  it("AI 機能が無効な構成では、どんな合言葉でも AI_UNLOCK_FAILED が返る（存在秘匿）", async () => {
    // Given: トークンも合言葉も無い既定構成
    server = startLiveSyncServer();
    const host = await server.connect("host");
    await createRoom(host, "ホスト");
    await host.take("snapshot");

    // When
    host.send({ command: "ai.unlock", key: TEST_AI_KEY });

    // Then: 「未設定」ではなく不一致と同じコードを返す
    expect((await host.take("error")).code).toBe("AI_UNLOCK_FAILED");
  });
});

describe("実 WS 越しの member.move", () => {
  it("ローテーションの並べ替えが全員へ配信される", async () => {
    // Given: ホストとゲストが輪に並んでいる
    server = startLiveSyncServer();
    const { host, guest, hostId, guestId } = await aLiveRoom(server);
    await addToRotation(guest, guestId);
    const before = await host.take("snapshot", (m) => m.room.session.rotation.length === 2);
    expect(before.room.session.rotation).toEqual([hostId, guestId]);

    // When: 先頭を末尾へ動かす
    host.send({ command: "member.move", fromIndex: 0, toIndex: 1 });

    // Then: 入れ替わった順序が全員へ届き、表示名ミラーも追随する
    const moved = await guest.take(
      "snapshot",
      (m) => m.room.session.rotation[0] === guestId,
    );
    expect(moved.room.session.rotation).toEqual([guestId, hostId]);
    expect(moved.room.config.members).toEqual(["ゲスト", "ホスト"]);
  });

  it("開始前は編集者による member.move を拒否する", async () => {
    // Given
    server = startLiveSyncServer();
    const { guest, guestId } = await aLiveRoom(server);
    await addToRotation(guest, guestId);

    // When: 編集者（＝ホストでない）が並べ替える
    guest.send({ command: "member.move", fromIndex: 0, toIndex: 1 });

    // Then
    expect((await guest.take("error")).code).toBe("UNAUTHORIZED");
  });
});
