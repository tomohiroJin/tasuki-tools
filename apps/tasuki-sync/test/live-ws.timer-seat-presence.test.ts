/**
 * timer の席の「番が回らない理由」が、ほかのツールの接続の出入りでも timer の画面へ届く（#374）。
 *
 * 席の理由（`seatSkipReason`）は **timer に在席しているか** で決まる（D21）。timer から
 * 選択画面（ハブ）や poker へ移った人は「別の画面（away）」で、どこにも接続が無ければ
 * 「未接続（disconnected）」である。かつて timer の画面へ snapshot を配るのは、
 * timer のコマンドと「presence（online / offline）が変わった切断」だけだった。
 * そのため次の 2 つが timer の画面に届かず、席が古い理由のまま止まっていた（E2E で実測）:
 *
 * - timer とハブを開いている人が timer だけ閉じる（presence は online のまま・理由は away へ）
 * - timer を閉じて未接続になった人がハブで入り直す（理由は disconnected → away）
 *
 * ナビ（⑦）は直前のドライバーが切断なら隠し、不在なら隠さない。理由が届かないと、
 * 不在の人のナビが「未接続」として消えたままになる。
 */
import { afterEach, describe, expect, it } from "bun:test";
import {
  createRoom,
  joinRoom,
  startLiveSyncServer,
  type LiveClient,
  type LiveSyncServer,
} from "./support/live-sync-server.js";

let server: LiveSyncServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** `client` に届いた snapshot のうち、`participantId` の席の理由が `reason` のものを待つ。 */
async function untilSeatReason(
  client: LiveClient,
  participantId: string,
  reason: string | null,
  what: string,
): Promise<void> {
  await client.until(
    (msgs) =>
      msgs.some(
        (m) =>
          m.type === "snapshot" &&
          m.room.session.seats.some((s) => s.id === participantId && s.skipReason === reason),
      ),
    what,
  );
}

describe("実 WS・timer の席の理由はほかのツールの出入りでも届く（#374）", () => {
  it("Given timer とハブを開いている人 / When timer だけ閉じる / Then ほかの人の timer に「別の画面」が届く", async () => {
    // Given: A が timer でルームを作り、ハブでも同じルームを開く。B は timer に居る
    server = startLiveSyncServer();
    const aTimer = await server.connect("a-timer");
    const b = await server.connect("b-timer");
    const created = await createRoom(aTimer, "あや");
    await joinRoom(b, created.code, "いずみ");
    const aHub = await server.connectHub("a-hub");
    aHub.send({ command: "room.join", code: created.code, displayName: "あや", resumeToken: created.resumeToken });
    await aHub.take((m) => m.type === "room.joined", "room.joined");

    // When: A が timer のタブだけ閉じる（ハブは残る。presence は online のまま）
    await aTimer.close();

    // Then: B の timer の画面に、A の席が「別の画面」として届く
    await untilSeatReason(b, created.participantId, "away", "A の席の away が B へ届く");
  });

  it("Given timer を閉じて未接続になった人 / When ハブで入り直す / Then ほかの人の timer で「未接続」が「別の画面」に変わる", async () => {
    // Given: A が timer を閉じ、B の画面で未接続になった
    server = startLiveSyncServer();
    const aTimer = await server.connect("a-timer");
    const b = await server.connect("b-timer");
    const created = await createRoom(aTimer, "あや");
    await joinRoom(b, created.code, "いずみ");
    await aTimer.close();
    await untilSeatReason(b, created.participantId, "disconnected", "A の席の disconnected が B へ届く");

    // When: A が選択画面（ハブ）で入り直す
    const aHub = await server.connectHub("a-hub");
    aHub.send({ command: "room.join", code: created.code, displayName: "あや", resumeToken: created.resumeToken });
    await aHub.take((m) => m.type === "room.joined", "room.joined");

    // Then: B の画面で A の席が「別の画面」になる
    await untilSeatReason(b, created.participantId, "away", "A の席の away が B へ届く");
  });

  it("Given timer を閉じて未接続になった人 / When poker で入り直す / Then ほかの人の timer で「別の画面」に変わる", async () => {
    // Given
    server = startLiveSyncServer();
    const aTimer = await server.connect("a-timer");
    const b = await server.connect("b-timer");
    const created = await createRoom(aTimer, "あや");
    await joinRoom(b, created.code, "いずみ");
    await aTimer.close();
    await untilSeatReason(b, created.participantId, "disconnected", "A の席の disconnected が B へ届く");

    // When: A が poker で入り直す（poker の復帰の印は timer と同じ resumeToken）
    const aPoker = await server.connectPoker("a-poker");
    aPoker.send({ type: "join-room", roomId: created.code, name: "あや", token: created.resumeToken });
    await aPoker.take((m) => m.type === "joined", "joined");

    // Then
    await untilSeatReason(b, created.participantId, "away", "A の席の away が B へ届く");
  });

  it("Given 席の表示が変わらない出入り / When 輪に居ない人がハブで入る / Then timer へ余分な snapshot を配らない", async () => {
    // Given: A・B が timer に居る。C はハブにだけ居る（輪に席が無く、timer の一覧にも載らない）
    server = startLiveSyncServer();
    const a = await server.connect("a-timer");
    const b = await server.connect("b-timer");
    const created = await createRoom(a, "あや");
    await joinRoom(b, created.code, "いずみ");
    // B の受信を落ち着かせる: 設定を 1 度変え、その snapshot が届くまで読み切ってから数える
    a.send({ command: "config.set", config: { navigatorEnabled: true } });
    await b.until((msgs) => msgs.some((m) => m.type === "snapshot" && m.room.config.navigatorEnabled === true), "設定 1");
    const before = b.all("snapshot").length;

    // When: C がハブで入る（timer の画面に映るものは何も変わらない）
    const c = await server.connectHub("c-hub");
    c.send({ command: "room.join", code: created.code, displayName: "うた" });
    await c.take((m) => m.type === "room.joined", "room.joined");
    // 対照: その後の timer のコマンドの snapshot は届く（配信が止まっていないことの錨）
    a.send({ command: "config.set", config: { navigatorEnabled: false } });
    await b.until((msgs) => msgs.some((m) => m.type === "snapshot" && m.room.config.navigatorEnabled === false), "設定 2");

    // Then: B に増えた snapshot は設定の 1 通だけ（C の入室では配らない）
    expect(b.all("snapshot").length - before).toBe(1);
  });
});
