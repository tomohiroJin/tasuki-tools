/**
 * UI からは到達しにくいルーム操作を実 WS で叩く（Issue #80）。
 *
 * 合言葉の検証・AI 解錠・並べ替え・中断は、実ソケットから直接叩いてはじめて
 * 「サーバーが実際にどう返すか」を確かめられる。
 *
 * ⚠ **元は `live-ws.permissions.test.ts` だった。** #95 S3 で役割とホストを廃止し、
 * 可否判定そのものが無くなったため、「非ホストは拒否される」を見ていた 3 件は
 * 期待を反転させ（在室者なら誰でも通る）、ファイル名も実態に合わせて改めた。
 * 合言葉・AI 解錠・並べ替えの配信はいずれも役割と無関係なのでそのまま残っている。
 *
 * 全員が同格であること自体の網羅は `all-equal-permissions.test.ts` の役目。
 * ここは**それが実経路でも効いているか**だけを見る。
 *
 * @requirements #95, R4-2
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

let server: LiveSyncServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** 作成者とゲストが在室しているルームを実 WS で用意する。 */
async function aLiveRoom(live: LiveSyncServer): Promise<{
  creator: LiveClient;
  guest: LiveClient;
  code: string;
  creatorId: string;
  guestId: string;
}> {
  const creator = await live.connect("creator");
  const guest = await live.connect("guest");
  const created = await createRoom(creator, "作成者");
  const joined = await joinRoom(guest, created.code, "ゲスト");
  return {
    creator,
    guest,
    code: created.code,
    creatorId: created.participantId,
    guestId: joined.participantId,
  };
}

describe("実 WS 越しのルーム操作（在室者は全員同格）", () => {
  // #95 S3 以前は「開始前は編集者でも拒否され、ホストなら通る」ことを見ていた。
  // 役割の廃止で、後から参加した人がそのまま通る。
  it("開始前でも、後から参加した人が phase.set を実行できる", async () => {
    // Given: 作成者ではないゲストが在室している
    server = startLiveSyncServer();
    const { guest } = await aLiveRoom(server);

    // When: ゲストが開始前に phase.set を送る
    guest.send({ command: "phase.set", phase: "session" });

    // Then: 通り、全員へ反映された snapshot が届く
    const snapshot = await guest.take("snapshot", (m) => m.room.phase === "session");
    expect(snapshot.room.phase).toBe("session");
  });

  // #95 S3 以前は「見学者は member.add を拒否され、自分の改名だけ通る」ことを見ていた。
  // 見学者という役割が無くなったので、どちらも通ることを見る。
  it("後から参加した人が自分をローテーションへ加え、自分を改名できる", async () => {
    // Given
    server = startLiveSyncServer();
    const { guest, guestId } = await aLiveRoom(server);

    // When: ゲストが自分をローテーションへ加える
    guest.send({ command: "member.add", participantId: guestId });

    // Then: 輪に並ぶ
    const added = await guest.take(
      "snapshot",
      (m) => m.room.session.rotation.includes(guestId),
    );
    expect(added.room.session.rotation).toContain(guestId);

    // When: ゲストが自分を改名する
    guest.send({ command: "participant.rename", participantId: guestId, displayName: "改名後" });

    // Then: 通る
    const renamed = await guest.take(
      "snapshot",
      (m) => m.room.participants.find((p) => p.participantId === guestId)?.displayName === "改名後",
    );
    expect(renamed.room.participants.find((p) => p.participantId === guestId)?.displayName).toBe("改名後");
  });

  it("開始後も、後から参加した人がセッションを畳める（実経路で効いている）", async () => {
    // Given: 開始済みのルーム
    server = startLiveSyncServer();
    const { creator, guest, guestId } = await aLiveRoom(server);
    await addToRotation(guest, guestId);
    creator.send({ command: "phase.set", phase: "session" });
    await creator.take("snapshot", (m) => m.room.phase === "session");
    creator.send({ command: "session.act", action: "START" });
    await creator.take("snapshot", (m) => m.room.clock.running);

    // When: 作成者ではない参加者が中断する
    guest.send({ command: "session.abort" });

    // Then: 受理され、実行者を伝える notice が全員へ届く
    await guest.take("snapshot", (m) => m.room.phase === "celebration");
    const notice = await creator.take("signal", (m) => m.signal === "notice");
    expect(notice).toMatchObject({
      signal: "notice",
      action: "session-aborted",
      actorName: "ゲスト",
      actorParticipantId: guestId,
    });
    // 中断は完成記録を残さない（FR-020）
    expect(creator.latestRoom().sessionRecords).toEqual([]);
  });
});

describe("実 WS 越しの合言葉（room.passphrase.set と join の検証）", () => {
  it("合言葉つきルームは、未指定なら PASSPHRASE_REQUIRED、誤りなら PASSPHRASE_MISMATCH、一致なら参加できる", async () => {
    // Given: ホストが合言葉を設定する
    server = startLiveSyncServer();
    const creator = await server.connect("creator");
    const created = await createRoom(creator, "作成者");
    await creator.take("snapshot");
    creator.send({ command: "room.passphrase.set", passphrase: "あいことば" });
    const protectedRoom = await creator.take("snapshot", (m) => m.room.passphraseProtected === true);
    // 平文は snapshot に載らない（サーバー側の tokenStore にだけ在る）
    expect(JSON.stringify(protectedRoom)).not.toContain("あいことば");

    // When 1: 合言葉なしで参加を試みる
    const noPass = await server.connect("no-pass");
    noPass.send({
      command: "room.join",
      code: created.code,
      displayName: "無指定",
    });
    // Then 1
    expect((await noPass.take("error")).code).toBe("PASSPHRASE_REQUIRED");

    // When 2: 誤った合言葉で参加を試みる
    const wrongPass = await server.connect("wrong-pass");
    wrongPass.send({
      command: "room.join",
      code: created.code,
      displayName: "誤り",
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
    const creator = await server.connect("creator");
    const created = await createRoom(creator, "作成者");
    await creator.take("snapshot");
    creator.send({ command: "room.passphrase.set", passphrase: "あいことば" });
    await creator.take("snapshot", (m) => m.room.passphraseProtected === true);

    // When
    creator.send({ command: "room.passphrase.set", passphrase: "" });
    await creator.take("snapshot", (m) => m.room.passphraseProtected === false);

    // Then: 合言葉なしで参加できる
    const guest = await server.connect("guest");
    const joined = await joinRoom(guest, created.code, "ゲスト");
    expect(joined.participantId).toMatch(/\S/);
  });
});

describe("実 WS 越しの member.move", () => {
  it("ローテーションの並べ替えが全員へ配信される", async () => {
    // Given: ホストとゲストが輪に並んでいる
    server = startLiveSyncServer();
    const { creator, guest, creatorId, guestId } = await aLiveRoom(server);
    await addToRotation(guest, guestId);
    const before = await creator.take("snapshot", (m) => m.room.session.rotation.length === 2);
    expect(before.room.session.rotation).toEqual([creatorId, guestId]);

    // When: 先頭を末尾へ動かす
    creator.send({ command: "member.move", fromIndex: 0, toIndex: 1 });

    // Then: 入れ替わった順序が全員へ届き、表示名ミラーも追随する
    const moved = await guest.take(
      "snapshot",
      (m) => m.room.session.rotation[0] === guestId,
    );
    expect(moved.room.session.rotation).toEqual([guestId, creatorId]);
    expect(moved.room.session.seats.map((s) => s.displayName)).toEqual(["ゲスト", "作成者"]);
  });

  // #95 S3 以前は「開始前は編集者による member.move を拒否する」ことを見ていた。
  // 役割の廃止で、後から参加した人の並べ替えもそのまま通る。
  it("開始前でも、後から参加した人が member.move を実行できる", async () => {
    // Given
    server = startLiveSyncServer();
    const { guest, guestId, creatorId } = await aLiveRoom(server);
    await addToRotation(guest, guestId);

    // When: 作成者ではない参加者が並べ替える
    guest.send({ command: "member.move", fromIndex: 0, toIndex: 1 });

    // Then
    const moved = await guest.take("snapshot", (m) => m.room.session.rotation[0] === guestId);
    expect(moved.room.session.rotation).toEqual([guestId, creatorId]);
  });
});

/**
 * 配布中の窓 3（古い web × 新しい同期サーバー）で、古い timer が送ってくるもの（spec §6）。
 *
 * #91 PR 3 で timer のお題（コマンド・`room.join` の AI 鍵の印・snapshot のお題）を
 * 撤去した。再起動の後も開いたままの古い画面は、撤去した形でまだ送ってくる。
 * 古い画面は新しい snapshot を読めず通知を出し続ける（spec §6 が受容した窓）が、
 * **サーバーの側は、古い形を受けても状態を壊さず接続も切らない**ことをここで固定する。
 *
 * @requirements #91
 */
describe("実 WS 越しの、古い timer が送るお題の形（配布中の窓 3）", () => {
  // 配布中の窓 3（古い web × 新しいサーバー）で古い timer が送るもの（spec §6）:
  // AI の鍵の印を付けた旧い形の room.join。
  it("hasAiKey を付けた旧い形の room.join でも参加できる", async () => {
    // Given: ルームがある
    server = startLiveSyncServer();
    const creator = await server.connect("creator");
    const created = await createRoom(creator, "作成者");
    const old = await server.connect("old");

    // When: 古い画面の形（`hasAiKey` はもうスキーマに無い）で参加する。型で守られた
    // `send` では書けない形なので、生のテキストで送る
    old.sendRaw(
      JSON.stringify({ command: "room.join", code: created.code, displayName: "古い画面", hasAiKey: true }),
    );

    // Then: 参加でき（スキーマは未知の項目を出力に残さない）、snapshot にもその印は載らない
    const joined = await old.takeMatching(
      (m) => m.type === "room.joined" || m.type === "error",
      "room.join の応答",
    );
    expect(joined.type).toBe("room.joined");
    const snapshot = await old.take("snapshot", (m) =>
      m.room.participants.some((p) => p.displayName === "古い画面"),
    );
    const me = snapshot.room.participants.find((p) => p.displayName === "古い画面")!;
    expect("hasAiKey" in me).toBe(false);
  });

  // 配布中の窓 3（古い web × 新しいサーバー）で古い timer が送るもの（spec §6）:
  // 在室中の timer から、撤去したお題のコマンド。
  it("在室中の timer が旧い ai.unlock / problem.request / problem.submit を送っても、状態は変わらず接続も切れない", async () => {
    // Given: 作成者とゲストが在室し、参加時の snapshot とお題（`topic` フレーム）を受け取り終えている
    server = startLiveSyncServer();
    const { creator, guest } = await aLiveRoom(server);
    await creator.take("snapshot", (m) => m.room.participants.length === 2);
    await creator.until(
      (received) => received.some((m) => (m as { type: string }).type === "topic"),
      "参加時のお題",
    );
    const roomBefore = JSON.stringify(creator.latestRoom());
    const seenBefore = creator.received.length;
    const legacyCommands = [
      { command: "ai.unlock", key: "あいことば" },
      { command: "problem.request", requestId: "req-1" },
      {
        command: "problem.submit",
        requestId: "req-1",
        problem: { title: "FizzBuzz", description: "d", requirements: [], exampleTest: "e", hints: [] },
        usedFallback: true,
      },
    ];

    // When: 古い画面の形で送り（型で守られた `send` では書けないので生のテキストで）、
    // 続けて正しいコマンドを 1 つ送る
    for (const cmd of legacyCommands) creator.sendRaw(JSON.stringify(cmd));
    creator.send({ command: "handoff.note.set", text: "続けて使える" });

    // Then: 接続は切れていない —— 続けて送った正しいコマンドが通り、全員へ届く
    await creator.take("snapshot", (m) => m.room.handoffNote === "続けて使える");
    const after = await guest.take("snapshot", (m) => m.room.handoffNote === "続けて使える");
    expect(after.room.handoffNote).toBe("続けて使える");
    // 古いコマンドにはそれぞれ INVALID_COMMAND が返り（実測した応答）、その間に状態の配信
    // （snapshot・お題の `topic` フレーム）は 1 つも起きていない
    const between = creator.received.slice(seenBefore);
    expect(between.map((m) => (m.type === "error" ? `error:${m.code}` : m.type))).toEqual([
      "error:INVALID_COMMAND",
      "error:INVALID_COMMAND",
      "error:INVALID_COMMAND",
      "snapshot",
    ]);
    // 正しいコマンドが変えたのは引き継ぎメモだけ（お題の撤去した項目が戻っていない）
    expect(JSON.stringify({ ...creator.latestRoom(), handoffNote: "" })).toBe(roomBefore);
  });
});
