/**
 * ハブ（選択画面）の入口を実 WebSocket 越しに叩く（#95 S5a・#247）。
 *
 * **配線を見る場所である。** ルームの作成・参加・名簿の配信が、本番と同じ
 * `createSyncServer()` の組み立てを通って利用者へ届くかを確かめる。
 * 規則そのもの（合言葉・レート制限・門）は `join-room.ts` が timer と共有しており、
 * ここで見るのは**その守りがハブの入口でも通ること**である。
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createRoom,
  startLiveSyncServer,
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

/** ハブでルームを作り、コードと復帰の組を返す。 */
async function hubCreate(
  hub: LiveHubClient,
  roomName: string,
  displayName: string,
): Promise<{ code: string; participantId: string; resumeToken: string }> {
  hub.send({ command: "room.create", roomName, displayName });
  const msg = await hub.take((m) => m.type === "room.created", "room.created");
  if (msg.type !== "room.created") throw new Error("room.created ではない");
  return { code: msg.code, participantId: msg.participantId, resumeToken: msg.resumeToken };
}

describe("ハブの入口（#95 S5a）", () => {
  it("Given ハブの接続 / When ルームを作る / Then 復帰の組と名簿が届く（R1）", async () => {
    // Given（準備）: ハブの入口へ繋ぐ
    const hub = await server.connectHub();

    // When（操作）: ルームを作る
    const created = await hubCreate(hub, "朝会モブ", "あや");
    const roster = await hub.take((m) => m.type === "roster", "roster");

    // Then: ルーム名はコードに入り、作成者が名簿に 1 人だけ載る
    if (roster.type !== "roster") throw new Error("roster ではない");
    expect(created.code).toContain("朝会モブ");
    expect(roster.room.participants).toHaveLength(1);
    expect(roster.room.participants[0]?.displayName).toBe("あや");
    // 選択画面に居る人はどのツールにも在席していない
    expect(roster.room.participants[0]?.tools).toEqual([]);
  });

  it("Given 作成者が待つルーム / When 別の人がハブから参加する / Then 双方へ新しい名簿が届く（R3）", async () => {
    // Given: 作成者が繋いだまま
    const host = await server.connectHub("host");
    const created = await hubCreate(host, "朝会モブ", "あや");
    await host.take((m) => m.type === "roster", "作成直後の roster");

    // When: 2 人目が参加する
    const guest = await server.connectHub("guest");
    guest.send({ command: "room.join", code: created.code, displayName: "いずみ" });

    // Then: **作成者にも**更新後の名簿が届く（R3。自分の操作でなくても届くこと）
    const hostRoster = await host.take((m) => m.type === "roster", "参加後の roster（作成者側）");
    const guestRoster = await guest.take((m) => m.type === "roster", "参加後の roster（参加者側）");
    if (hostRoster.type !== "roster" || guestRoster.type !== "roster") {
      throw new Error("roster ではない");
    }
    expect(hostRoster.room.participants.map((p) => p.displayName)).toEqual(["あや", "いずみ"]);
    expect(guestRoster.room.participants.map((p) => p.displayName)).toEqual(["あや", "いずみ"]);
  });

  it("Given 合言葉で保護された timer のルーム / When ハブから合言葉なしで参加する / Then 名簿は届かない", async () => {
    // Given: timer の入口でルームを作り、合言葉を掛ける
    const owner = await server.connect("owner");
    const room = await createRoom(owner, "ぬし");
    owner.send({ command: "room.passphrase.set", passphrase: "ひみつ" });
    await owner.take("snapshot");

    // When: 合言葉を知らない人がハブから入ろうとする
    const hub = await server.connectHub("stranger");
    hub.send({ command: "room.join", code: room.code, displayName: "よそもの" });

    // Then: 名簿ではなくエラーが返る（**選択画面から保護ルームを覗けない**）
    const reply = await hub.take((m) => m.type === "error" || m.type === "roster", "応答");
    expect(reply.type).toBe("error");
    if (reply.type === "error") expect(reply.code).toBe("PASSPHRASE_REQUIRED");
  });

  it("Given 同じ端末の復帰の組 / When ハブから入り直す / Then 名簿の人数が増えない（R16）", async () => {
    // Given: 一度ハブで作って、その組を控える
    const first = await server.connectHub("first");
    const created = await hubCreate(first, "朝会モブ", "あや");
    await first.take((m) => m.type === "roster", "作成直後の roster");
    await first.close();

    // When: 同じ組で入り直す（タブを閉じて開き直した形）
    const second = await server.connectHub("second");
    second.send({
      command: "room.join",
      code: created.code,
      displayName: "あや",
      resumeToken: created.resumeToken,
    });

    // Then: 同じ人として戻る（新しい参加者を作らない）
    const roster = await second.take((m) => m.type === "roster", "復帰後の roster");
    if (roster.type !== "roster") throw new Error("roster ではない");
    expect(roster.room.participants).toHaveLength(1);
    expect(roster.room.participants[0]?.participantId).toBe(created.participantId);
  });

  it("Given 存在しないルーム / When ハブから参加する / Then 門を通った timer と同じ文言で拒まれる", async () => {
    // Given（準備）: ハブの入口へ繋ぐ
    const hub = await server.connectHub();

    // When（操作）: 在りもしないコードで参加しようとする
    hub.send({ command: "room.join", code: "ないルーム-0000", displayName: "あや" });

    // Then: 「存在しない」と「入れない」を区別させない（ADR 0011）
    const reply = await hub.take((m) => m.type === "error", "error");
    if (reply.type !== "error") throw new Error("error ではない");
    expect(reply.code).toBe("ROOM_NOT_FOUND");
    expect(reply.message).toBe("指定されたルームコードが見つかりません");
  });

  it("Given ハブで作ったルーム / When timer の入口から入る / Then 門が開く（選択画面から timer へ行ける）", async () => {
    // Given: ハブでルームを作る（timer の状態も作られている）
    const hub = await server.connectHub();
    const created = await hubCreate(hub, "朝会モブ", "あや");

    // When: 同じコードへ timer の入口から入る
    const timer = await server.connect("timer");
    timer.send({
      command: "room.join",
      code: created.code,
      displayName: "あや",
      hasAiKey: false,
    });

    // Then: snapshot が届く（門が閉じていれば ROOM_NOT_FOUND になる）
    const reply = await timer.takeMatching(
      (m) => m.type === "snapshot" || m.type === "error",
      "timer からの参加の応答",
    );
    expect(reply.type).toBe("snapshot");
  });

  it("Given 在らぬルームコード / When ハブから生死を尋ねる / Then 見つからないと返る（#274）", async () => {
    const hub = await server.connectHub("asker");

    hub.send({ command: "room.check", code: "zzzzzzzz" });

    const reply = await hub.take((m) => m.type === "error", "照会への応答");
    if (reply.type !== "error") throw new Error("error ではない");
    expect(reply.code).toBe("ROOM_NOT_FOUND");
  });

  it("Given 在るルーム / When ハブから生死を尋ねる / Then 何も返らない（#274）", async () => {
    // Given: ハブでルームを作る（作成者は別の接続に居る）
    const owner = await server.connectHub("owner");
    const created = await hubCreate(owner, "朝会モブ", "あや");
    await owner.take((m) => m.type === "roster", "作成直後の roster");

    // When: まだ名乗っていない人が生死だけを尋ね、続けて在らぬコードも尋ねる
    const hub = await server.connectHub("asker");
    hub.send({ command: "room.check", code: created.code });
    hub.send({ command: "room.check", code: "zzzzzzzz" });

    // **関門を置く。** 応答が必ず返り、しかもエラーとは別の型で返る命令を最後に送る。
    // 接続ごとに順序は保たれるので、この応答が届いた時点で
    // **上の 2 つの照会への応答はすべて届き終えている。**
    hub.send({ command: "room.create", roomName: "関門", displayName: "みはり" });
    await hub.take((m) => m.type === "room.created", "関門の応答");

    // Then: 届いたエラーは **1 通だけ**。在るルームへの照会は無音である。
    //
    // ⚠ **`take` で 1 通目のエラーを掴んで code を見る形にしてはいけない。**
    // 誤って ROOM_NOT_FOUND を返した場合もそれが先に届き、在らぬコードへの応答と
    // 同じ形なので見分けがつかず、判定が恒真になる（2026-09-18 の破壊検証で実測）。
    // **関門の後に通数で見る。**
    const errors = hub.received.filter((m) => m.type === "error");
    expect(errors.length, "届いたエラーの通数").toBe(1);
  });

  it("Given 合言葉で保護されたルーム / When ハブから生死を尋ねる / Then 見つからないとは言わない（#274）", async () => {
    // **この 1 件が設計正本 D2（ハブの照会は合言葉の関門を通さない）を守る唯一の検査である。**
    // `mayEnter` を通すようにすると、合言葉を持つ正規の招待客に
    // 「存在しない」と答えることになる。
    //
    // Given: timer の入口でルームを作り、合言葉を掛ける
    const owner = await server.connect("owner");
    const room = await createRoom(owner, "ぬし");
    owner.send({ command: "room.passphrase.set", passphrase: "ひみつ" });
    // **関門を本物にする。** `createRoom` は `room.created` で止まるので、素の
    // `take("snapshot")` は**作成時の** snapshot に当たってその場で返り、
    // 合言葉が適用されたことを何も保証しない（2026-09-18 の最終レビューで判明）。
    // `passphraseProtected` が立った snapshot を待って、前提を主張する。
    await owner.takeMatching(
      (m) => m.type === "snapshot" && m.room.passphraseProtected === true,
      "合言葉が掛かった snapshot",
    );

    // When: 合言葉を知らない人が生死だけを尋ね、続けて在らぬコードも尋ねる
    const hub = await server.connectHub("asker");
    hub.send({ command: "room.check", code: room.code });
    hub.send({ command: "room.check", code: "zzzzzzzz" });

    // 関門: 応答が必ず返り、しかもエラーとは別の型で返る命令を最後に送る
    // （在るルーム側のテストと同じ理由。単独の `take` は先着の誤答と見分けがつかない）
    hub.send({ command: "room.create", roomName: "関門", displayName: "みはり" });
    await hub.take((m) => m.type === "room.created", "関門の応答");

    // Then: 届いたエラーは 1 通だけ（在らぬコードへの応答）。保護ルームへの照会は無音。
    const errors = hub.received.filter((m) => m.type === "error");
    expect(errors.length, "届いたエラーの通数").toBe(1);
  });
});
