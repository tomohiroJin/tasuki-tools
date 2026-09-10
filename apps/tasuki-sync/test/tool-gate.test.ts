/**
 * 入口ごとの門（#95 S4a）。名簿の保管を 1 つにしたことで生まれた越境を塞ぐ。
 *
 * **1 つのサーバーに両方の入口があるので、実 WS で両方を叩く。**
 * timer は `ws://.../`、poker は `ws://.../poker/ws`（`ws-adapter.ts` の POKER_WS_PATH）。
 * どちらの入口も本番と同じ `createSyncServer()` の配線を通る ——
 * 門は「どのストアを見るか」を配線に依存するので、組み立てを書き写すと検査が死ぬ。
 *
 * ここが見るのは**入口をまたぐ 1 点だけ**である。timer / poker それぞれの規則は
 * 既存のテスト群（`test/*.test.ts` / `test/poker/*.test.ts`）が持つ。
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createRoom,
  startLiveSyncServer,
  type LivePokerClient,
  type LiveSyncServer,
} from "./support/live-sync-server.js";

let server: LiveSyncServer;

/** poker の入口へ繋ぎ、`join-room` を送って最初の応答を 1 つ受け取る。 */
async function pokerJoin(
  poker: LivePokerClient,
  roomId: string,
  name: string,
): Promise<{ type: string }> {
  poker.send({ type: "join-room", roomId, name });
  return (await poker.take(() => true, "join-room への最初の応答")) as { type: string };
}

beforeEach(() => {
  server = startLiveSyncServer();
});
afterEach(async () => {
  await server.close();
});

describe("入口の門（越境の遮断・#95 S4a）", () => {
  it("パスフレーズ保護された timer のルームへ poker の入口から入れない", async () => {
    // Given: 合言葉つきの timer ルーム
    const owner = await server.connect("owner");
    const created = await createRoom(owner, "アリス");
    owner.send({ command: "room.passphrase.set", passphrase: "secret" });
    await owner.until(
      (received) =>
        received.some((m) => m.type === "snapshot" && m.room.passphraseProtected === true),
      "passphraseProtected=true の snapshot",
    );

    // When: そのコードを poker の入口へ与える
    const poker = await server.connectPoker("intruder");
    const msg = await pokerJoin(poker, created.code, "侵入者");

    // Then: 合言葉を聞かれることもなく、存在しないルームとして拒まれる
    expect(msg).toMatchObject({ type: "error", code: "room-not-found" });
  });

  it("実在する timer のコードと、実在しないコードの応答が同一になる（列挙の手がかりを与えない）", async () => {
    // Given
    const owner = await server.connect("owner");
    const created = await createRoom(owner, "アリス");

    // When: 実在する timer のコードと、どこにも無いコードを同じ入口へ与える
    const real = await pokerJoin(await server.connectPoker("real"), created.code, "だれか");
    const fake = await pokerJoin(await server.connectPoker("fake"), "zzzzzzzz", "だれか");

    // Then: **コードも文言も含めて完全に同一**（違えば列挙の手がかりになる・ADR 0011）
    expect(real).toEqual(fake);
  });

  it("timer のルームコードの生死を poker の check-room から知れない", async () => {
    // `check-room` は「無いときだけ応える」ので、名簿だけを見ていると
    // **timer のルームコードが実在するかを答える神託**になる（無音＝実在）。
    // Given
    const owner = await server.connect("owner");
    const created = await createRoom(owner, "アリス");

    // When: 実在する timer のコードと、どこにも無いコードを check-room へ与える
    const probeReal = await server.connectPoker("probe-real");
    probeReal.send({ type: "check-room", roomId: created.code });
    const real = await probeReal.take(() => true, "check-room への応答");

    const probeFake = await server.connectPoker("probe-fake");
    probeFake.send({ type: "check-room", roomId: "zzzzzzzz" });
    const fake = await probeFake.take(() => true, "check-room への応答");

    // Then: 応答が完全に同一（無音と room-not-found の差が出れば生死が漏れる）
    expect(real).toEqual(fake);
    expect(real).toMatchObject({ type: "error", code: "room-not-found" });
  });

  it("poker のルームへ timer の入口から入れない", async () => {
    // Given: poker のルーム（poker の入口で作る）
    const poker = await server.connectPoker("poker-owner");
    poker.send({ type: "create-room", name: "ボブ" });
    const joined = (await poker.take((m) => m.type === "joined", "joined")) as {
      roomId: string;
    };

    // When / Then: timer の入口からは入れない
    const intruder = await server.connect("intruder");
    intruder.send({
      command: "room.join",
      code: joined.roomId,
      displayName: "侵入者",
      hasAiKey: false,
    });
    const msg = await intruder.takeMatching((m) => m.type === "error", "error");
    expect(msg).toMatchObject({ code: "ROOM_NOT_FOUND" });
  });

  it("自分のツールのルームへは今までどおり入れる（対照実行）", async () => {
    // 門が全部を塞いでいないことを確かめる。これが無いと、門を「常に拒否」にしても
    // 越境を見ている it は全部緑のままになる（数は書かない。足すたびに腐る）
    const owner = await server.connect("owner");
    const created = await createRoom(owner, "アリス");
    const guest = await server.connect("guest");
    guest.send({ command: "room.join", code: created.code, displayName: "ボブ", hasAiKey: false });
    const msg = await guest.takeMatching(
      (m) => m.type === "room.joined" || m.type === "error",
      "room.joined",
    );
    expect(msg.type).toBe("room.joined");
  });

  it("poker の入口から poker のルームへは今までどおり入れる（対照実行）", async () => {
    // 上の対照は timer 側だけを見ている。poker 側の門を「常に拒否」にしても
    // 気づけないので、poker の入口についても対照を置く。
    const poker = await server.connectPoker("poker-owner");
    poker.send({ type: "create-room", name: "ボブ" });
    const created = (await poker.take((m) => m.type === "joined", "joined")) as {
      roomId: string;
    };

    const guest = await server.connectPoker("poker-guest");
    const msg = await pokerJoin(guest, created.roomId, "キャロル");
    expect(msg.type).toBe("joined");
  });
});
