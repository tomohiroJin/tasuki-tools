/**
 * ハブ（玄関）からの合言葉の設定・解除を実 WebSocket 越しに叩く（#638）。
 *
 * 合言葉を設定するコマンド `room.passphrase.set` は、もと timer のコマンドだった。**ルーム全体の関門**
 * （`room-entry.ts`）を操作するので、ルーム（ハブ）の言葉へ移した。ここで見るのは次の 3 点である。
 *
 * 1. 設定・解除が、どの道具から入る新しい参加にも効くこと（関門はルームに 1 つ）
 * 2. 既に入っている人は、合言葉が変わっても入り直しを求められないこと（復帰の扱いを保つ）
 * 3. 平文が名簿にも他の接続にも出ないこと
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { startLiveSyncServer, type LiveHubClient, type LiveSyncServer } from "./support/live-sync-server.js";

let server: LiveSyncServer;

beforeEach(() => {
  server = startLiveSyncServer();
});
afterEach(async () => {
  await server.close();
});

/** ハブでルームを作り、コードと復帰の組を返す。 */
async function hubCreate(
  hub: LiveHubClient,
  displayName: string,
): Promise<{ code: string; participantId: string; resumeToken: string }> {
  hub.send({ command: "room.create", roomName: "朝会", displayName });
  const msg = await hub.take((m) => m.type === "room.created", "room.created");
  if (msg.type !== "room.created") throw new Error("room.created ではない");
  return { code: msg.code, participantId: msg.participantId, resumeToken: msg.resumeToken };
}

/** 次に届く名簿の合言葉の印。 */
async function nextProtected(hub: LiveHubClient, expected: boolean): Promise<void> {
  const roster = await hub.take(
    (m) => m.type === "roster" && (m.room.passphraseProtected === true) === expected,
    `passphraseProtected=${expected} の roster`,
  );
  if (roster.type !== "roster") throw new Error("roster ではない");
  expect(JSON.stringify(roster)).not.toContain("ひみつ");
}

describe("ハブの合言葉の設定（#638）", () => {
  it("Given 作成直後のルーム / When ハブが合言葉を設定する / Then 名簿に設定中の印が付き、平文は載らない", async () => {
    const owner = await server.connectHub("owner");
    await hubCreate(owner, "あや");
    const first = await owner.take((m) => m.type === "roster", "作成直後の roster");
    if (first.type !== "roster") throw new Error("roster ではない");
    expect(first.room.passphraseProtected).toBe(false);

    owner.send({ command: "room.passphrase.set", passphrase: "ひみつ" });

    await nextProtected(owner, true);
  });

  it("Given 合言葉つきのルーム / When 合言葉なしで新しく入る / Then どの入口でも PASSPHRASE_REQUIRED（関門はルームに 1 つ）", async () => {
    const owner = await server.connectHub("owner");
    const created = await hubCreate(owner, "あや");
    owner.send({ command: "room.passphrase.set", passphrase: "ひみつ" });
    await nextProtected(owner, true);

    const viaHub = await server.connectHub("via-hub");
    viaHub.send({ command: "room.join", code: created.code, displayName: "ハブ" });
    const viaTimer = await server.connect("via-timer");
    viaTimer.send({ command: "room.join", code: created.code, displayName: "タイマー" });

    const hubReply = await viaHub.take((m) => m.type === "error", "ハブの応答");
    const timerReply = await viaTimer.take("error");
    expect(hubReply.type === "error" && hubReply.code).toBe("PASSPHRASE_REQUIRED");
    expect(timerReply.code).toBe("PASSPHRASE_REQUIRED");
  });

  it("Given 合言葉つきのルーム / When 正しい合言葉（前後空白つき）で入る / Then 入れる", async () => {
    const owner = await server.connectHub("owner");
    const created = await hubCreate(owner, "あや");
    owner.send({ command: "room.passphrase.set", passphrase: "  ひみつ  " });
    await nextProtected(owner, true);

    const guest = await server.connectHub("guest");
    guest.send({ command: "room.join", code: created.code, displayName: "いずみ", passphrase: "ひみつ" });

    const reply = await guest.take((m) => m.type === "room.joined" || m.type === "error", "参加の応答");
    expect(reply.type).toBe("room.joined");
  });

  it("Given 合言葉つきのルーム / When 空文字で解除する / Then 名簿の印が外れ、合言葉なしで入れる", async () => {
    const owner = await server.connectHub("owner");
    const created = await hubCreate(owner, "あや");
    owner.send({ command: "room.passphrase.set", passphrase: "ひみつ" });
    await nextProtected(owner, true);

    owner.send({ command: "room.passphrase.set", passphrase: "" });
    await nextProtected(owner, false);

    const guest = await server.connectHub("guest");
    guest.send({ command: "room.join", code: created.code, displayName: "いずみ" });
    const reply = await guest.take((m) => m.type === "room.joined" || m.type === "error", "参加の応答");
    expect(reply.type).toBe("room.joined");
  });

  it("Given 空白だけの合言葉 / When 設定する / Then 解除として扱う", async () => {
    const owner = await server.connectHub("owner");
    await hubCreate(owner, "あや");
    owner.send({ command: "room.passphrase.set", passphrase: "ひみつ" });
    await nextProtected(owner, true);

    owner.send({ command: "room.passphrase.set", passphrase: "   " });

    await nextProtected(owner, false);
  });

  it("Given 後から入った参加者 / When その人が合言葉を設定する / Then 通る（役割は無く、在室者なら誰でも）", async () => {
    const owner = await server.connectHub("owner");
    const created = await hubCreate(owner, "あや");
    const guest = await server.connectHub("guest");
    guest.send({ command: "room.join", code: created.code, displayName: "いずみ" });
    await guest.take((m) => m.type === "room.joined", "参加");

    guest.send({ command: "room.passphrase.set", passphrase: "ひみつ" });

    await nextProtected(owner, true);
  });

  it("Given 既に入っている人 / When 合言葉が設定され変わる / Then 復帰の組での入り直しは合言葉を求められない", async () => {
    const owner = await server.connectHub("owner");
    const created = await hubCreate(owner, "あや");
    owner.send({ command: "room.passphrase.set", passphrase: "ひみつ" });
    await nextProtected(owner, true);
    owner.send({ command: "room.passphrase.set", passphrase: "べつ" });
    await owner.take((m) => m.type === "roster", "変更後の roster");

    const again = await server.connectHub("again");
    again.send({
      command: "room.join",
      code: created.code,
      displayName: "あや",
      resumeToken: created.resumeToken,
    });

    const reply = await again.take((m) => m.type === "room.joined" || m.type === "error", "復帰の応答");
    expect(reply.type).toBe("room.joined");
  });

  it("Given 別のルーム / When 片方に合言葉を設定する / Then もう片方は変わらない", async () => {
    const a = await server.connectHub("a");
    await hubCreate(a, "あや");
    const b = await server.connectHub("b");
    const roomB = await hubCreate(b, "いずみ");

    a.send({ command: "room.passphrase.set", passphrase: "ひみつ" });
    await nextProtected(a, true);

    const guest = await server.connectHub("guest");
    guest.send({ command: "room.join", code: roomB.code, displayName: "ゲスト" });
    const reply = await guest.take((m) => m.type === "room.joined" || m.type === "error", "参加の応答");
    expect(reply.type).toBe("room.joined");
  });

  it("Given ルームに入っていないハブの接続 / When 合言葉を設定する / Then NOT_IN_ROOM", async () => {
    const stray = await server.connectHub("stray");

    stray.send({ command: "room.passphrase.set", passphrase: "ひみつ" });

    const reply = await stray.take((m) => m.type === "error", "応答");
    expect(reply.type === "error" && reply.code).toBe("NOT_IN_ROOM");
  });

  it("Given 上限を超えた合言葉 / When 設定する / Then INVALID_COMMAND で、設定されない", async () => {
    const owner = await server.connectHub("owner");
    const created = await hubCreate(owner, "あや");

    owner.send({ command: "room.passphrase.set", passphrase: "a".repeat(129) });
    const reply = await owner.take((m) => m.type === "error", "応答");
    expect(reply.type === "error" && reply.code).toBe("INVALID_COMMAND");

    const guest = await server.connectHub("guest");
    guest.send({ command: "room.join", code: created.code, displayName: "いずみ" });
    const joined = await guest.take((m) => m.type === "room.joined" || m.type === "error", "参加の応答");
    expect(joined.type).toBe("room.joined");
  });

  it("Given 道具（topic）の接続 / When 合言葉の設定を送る / Then INVALID_COMMAND（設定はハブだけの言葉）", async () => {
    const owner = await server.connectHub("owner");
    const created = await hubCreate(owner, "あや");
    const topic = await server.connectTopic("topic");
    topic.send({ command: "room.join", code: created.code, displayName: "あや", resumeToken: created.resumeToken });
    await topic.take((m) => m.type === "room.joined", "お題の参加");

    topic.send({ command: "room.passphrase.set", passphrase: "ひみつ" } as never);

    const reply = await topic.take((m) => m.type === "error", "応答");
    expect(reply.type === "error" && reply.code).toBe("INVALID_COMMAND");
  });

  it("Given timer の接続 / When 旧い合言葉の設定を送る / Then INVALID_COMMAND（timer の言葉ではなくなった）", async () => {
    const timer = await server.connect("timer");
    timer.send({ command: "room.create", displayName: "あや" });
    await timer.take("room.created");

    timer.send({ command: "room.passphrase.set", passphrase: "ひみつ" } as never);

    expect((await timer.take("error")).code).toBe("INVALID_COMMAND");
  });
});
