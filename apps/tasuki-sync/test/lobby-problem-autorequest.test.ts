/**
 * ロビーのお題は**サーバーが用意する**（#271）。
 *
 * #249（#95 S5c）まで、お題の依頼はクライアントの「代表」が送っていた ——
 * 最初は「ルームを作った側」、S5c 以降は「輪の先頭」である。どちらも
 * **その人が timer に居ることを前提にしていた**が、輪は切断では変わらない
 * （`application/presence.ts` の `handleDisconnect` は名簿の接続だけを外す）。
 * 入口が玄関 1 つになってツール間の行き来が常態になると、輪の先頭が timer に
 * 居ない状態が普通に起きる。そのとき**誰も依頼を送らず、ロビーが行き止まりになる**。
 *
 * 実測（2026-09-17）:
 *
 *   - お題が未確定のまま先頭が不在だと、「セッションを開始」が永久に押せない。
 *     お題パネル自体が描画されないので「別のお題にする」という逃げ道も無い
 *   - 先頭が不在だと、難易度・言語を変えてもお題が作り直されない
 *     （バッジだけ「上級」になり、中身は初級のまま）
 *
 * **お題が未確定の状態（`problem: null`）を作っているのはサーバーである**
 * （`application/initial-timer-state.ts` が唯一の書き手）。それを埋める責任も
 * 同じ側に置く。クライアントに「代表」を置く限り、在席していない人に依頼を
 * 期待する構造が残り続ける。
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Problem, ServerMsg } from "@tasuki/timer-core";
import {
  createRoom,
  joinRoom,
  startLiveSyncServer,
  type LiveClient,
  type LiveHubClient,
  type LiveSyncServer,
} from "./support/live-sync-server.js";

/**
 * snapshot が運ぶルーム。
 *
 * **`Room` をそのまま使えない。** このパッケージは `exactOptionalPropertyTypes` で
 * 型検査するので、任意項目に `undefined` を許す wire 側の形とは代入互換にならない。
 */
type SnapshotRoom = Extract<ServerMsg, { type: "snapshot" }>["room"];

let server: LiveSyncServer;

beforeEach(() => {
  server = startLiveSyncServer();
});
afterEach(async () => {
  await server.close();
});

/**
 * 条件に合う snapshot が届くまで待ち、届かなければ `null` を返す。
 *
 * **時間切れを throw で終わらせない。** 「お題が用意されなかった」ことこそが
 * この Issue の症状なので、受信の失敗ではなく値として突き合わせる。
 */
async function awaitSnapshot(
  client: LiveClient,
  predicate: (room: SnapshotRoom) => boolean,
  timeoutMs = 2000,
): Promise<SnapshotRoom | null> {
  try {
    const msg = await client.takeMatching(
      (m) => m.type === "snapshot" && predicate(m.room),
      "条件に合う snapshot",
      timeoutMs,
    );
    return msg.type === "snapshot" ? msg.room : null;
  } catch {
    return null;
  }
}

/** お題が載った snapshot を待ち、届かなければ `null`。 */
async function awaitProblem(client: LiveClient, timeoutMs = 2000): Promise<Problem | null> {
  const room = await awaitSnapshot(client, (r) => r.problem !== null, timeoutMs);
  return room?.problem ?? null;
}

/** ハブでルームを作る（ツールの状態は作られない・#95 S5b の D8）。 */
async function hubCreate(hub: LiveHubClient, displayName: string): Promise<string> {
  hub.send({ command: "room.create", roomName: "朝会モブ", displayName });
  const msg = await hub.take((m) => m.type === "room.created", "room.created");
  if (msg.type !== "room.created") throw new Error("room.created ではない");
  return msg.code;
}

describe("ロビーのお題はサーバーが用意する（#271）", () => {
  it("Given ハブで作ったルーム / When timer の入口から入る / Then 依頼を 1 つも送らなくてもお題が届く", async () => {
    // Given: 選択画面でルームを作る（timer の状態はまだ無い）
    const hub = await server.connectHub();
    const code = await hubCreate(hub, "あや");

    // When: timer の入口から入るだけ。**`problem.request` は送らない**
    const timer = await server.connect("timer");
    await joinRoom(timer, code, "あや");

    // Then: お題が確定して配信される
    expect(await awaitProblem(timer)).not.toBeNull();
  });

  it("Given 最初に timer へ入った人が去ったルーム / When 別の人がロビーへ入る / Then その人にもお題が届く", async () => {
    // Given: 最初の 1 人が timer を開き、輪の先頭の席だけを残して去る。
    //        **この人はお題を依頼しない**（届く前にタブを閉じた端末と同じ）。
    const hub = await server.connectHub();
    const code = await hubCreate(hub, "あや");
    const first = await server.connect("first");
    await joinRoom(first, code, "きら");
    await first.close();

    // When: 別の人がロビーへ入る（この人は輪の先頭ではない）
    const second = await server.connect("second");
    await joinRoom(second, code, "ゆう");

    // Then: お題が確定している（＝「セッションを開始」が押せる）
    expect(await awaitProblem(second)).not.toBeNull();
  });

  it("Given お題なしで作ったルーム / When 誰かがお題ありへ戻す / Then お題が用意される", async () => {
    // Given: お題を使わない設定で作る（この間はお題を用意しない）
    const owner = await server.connect("owner");
    const created = await createRoom(owner, "あや", {
      config: {
        language: "TypeScript",
        difficulty: "easy",
        members: ["あや"],
        intervalMinutes: 5,
        problemEnabled: false,
      },
    });
    expect(await awaitProblem(owner, 500)).toBeNull();
    await owner.close();

    // When: 輪の先頭ではない人がお題ありへ戻す
    const guest = await server.connect("guest");
    await joinRoom(guest, created.code, "ゆう");
    guest.send({ command: "config.set", config: { problemEnabled: true } });

    // Then: お題が用意される
    expect(await awaitProblem(guest)).not.toBeNull();
  });

  /**
   * **お題を使う状態へ戻ったら、載っているお題は「前のもの」である**（#273・3 巡目①）。
   *
   * お題を使わないルームのお題は落とさない（落とすと完成記録まで消える）。
   * その代わり**1 本目のお題がロビーに残ったまま 2 本目へ持ち越される**ので、
   * 利用者が「お題あり」へ戻した瞬間、それがそのまま 2 本目のお題になる ——
   * `fillLobbyProblem` は `problem !== null` で抜けるため誰も作り直さない。
   * #273 が塞いだはずの症状が、設定を戻す経路で再発する。
   *
   * 言語・難易度の変更と同じ性質の変化なので、同じように作り直す。
   */
  it("Given お題なしで完了したルーム / When 新しいセッションでお題ありへ戻す / Then 1 本目のお題は残らない", async () => {
    // Given: お題ありで作り、1 本目のお題に印を付ける
    const owner = await server.connect("owner");
    await createRoom(owner, "あや", {
      config: {
        language: "TypeScript",
        difficulty: "easy",
        members: ["あや"],
        intervalMinutes: 5,
      },
    });
    if ((await awaitProblem(owner)) === null) {
      throw new Error("前提が崩れた: 1 本目のお題が用意されていない");
    }
    const firstTitle = "1 本目のお題（#273 の 3 巡目）";
    owner.send({ command: "problem.edit", patch: { title: firstTitle } });
    await owner.take("snapshot", (m) => m.room.problem?.title === firstTitle);

    // Given: ロビーで「お題なし」へ切り替えてから、1 本目を走らせて完成させる
    owner.send({ command: "config.set", config: { problemEnabled: false } });
    owner.send({ command: "phase.set", phase: "session" });
    owner.send({ command: "session.act", action: "START" });
    owner.send({ command: "session.complete" });
    await owner.take("snapshot", (m) => m.room.phase === "celebration");

    // Given: 「新しいセッション」でロビーへ戻す（お題なしのルームなので落とさない）
    owner.send({ command: "phase.set", phase: "setup" });
    await owner.take("snapshot", (m) => m.room.phase === "setup");

    // When: 2 本目のロビーで「お題あり」へ戻す
    owner.send({ command: "config.set", config: { problemEnabled: true } });

    // Then: 2 本目のお題が用意され、それは 1 本目のお題ではない。
    //
    // **設定が変わった snapshot で待たない。** `commit` は設定だけを反映した
    // snapshot を先に配り、作り直したお題はその後の snapshot で載る（実測した
    // 並びは `true/<1 本目>` → `true/<別のお題>`）。前者で止めると、実装が
    // 直っていても赤になる —— 見るのは**お題そのものが入れ替わったこと**である。
    const lobby = await awaitSnapshot(
      owner,
      (r) => r.config.problemEnabled !== false && r.problem !== null && r.problem.title !== firstTitle,
    );
    expect(
      lobby,
      `2 本目のお題へ入れ替わらない（最後に届いたお題: ${owner.latestRoom().problem?.title ?? "なし"}）`,
    ).not.toBeNull();
  });

  /**
   * **「お題あり」のまま設定を送り直しても作り直さない**（#273・3 巡目①の対）。
   *
   * `problemEnabled` は任意項目で、**未設定と `true` はどちらも「使う」**である
   * （`aggregate.ts` の `problemEnabled?: boolean`）。作り直しの判定を
   * 素の不一致（`configBefore.problemEnabled !== 次の値`）で書くと、
   * **`undefined` → `true` が「変化した」に化ける**。作り直しは走っている委譲を
   * 畳んで張り直すので（リロール相当）、AI 生成の途中なら**中断して定型へ縮退し、
   * 日次枠まで 1 消費する**（`ai-limits.ts`・#283 の 3 点目）。
   *
   * ここは「お題を使わない状態から戻ったとき」だけを引き金にしていることを固定する。
   */
  it("Given お題ありのルーム / When 同じ「お題あり」を送り直す / Then お題は作り直されない", async () => {
    // Given: お題ありで作る（`problemEnabled` は未設定＝使う）
    const owner = await server.connect("owner");
    await createRoom(owner, "あや", {
      config: {
        language: "TypeScript",
        difficulty: "easy",
        members: ["あや"],
        intervalMinutes: 5,
      },
    });
    const before = await awaitProblem(owner);
    if (before === null) throw new Error("前提が崩れた: お題が用意されていない");
    const marked = "作り直されたら消える印";
    owner.send({ command: "problem.edit", patch: { title: marked } });
    await owner.take("snapshot", (m) => m.room.problem?.title === marked);

    // When: 未設定から `true` を送る（人間には「何も変えていない」操作）
    owner.send({ command: "config.set", config: { problemEnabled: true } });

    // Then: 印が残ったまま（作り直されていない）。
    //       配信は来るので、静けさではなく**届いた snapshot の中身**で見る。
    await owner.take("snapshot", (m) => m.room.config.problemEnabled === true);
    expect(owner.latestRoom().problem?.title, "送り直しで作り直された").toBe(marked);
  });

  it("Given 輪の先頭が去ったロビー / When 残った人が難易度を変える / Then その難易度のお題へ作り直される", async () => {
    // Given: 先頭（あや）が timer でルームを作り、初級のお題が出た状態で去る。
    const owner = await server.connect("owner");
    const created = await createRoom(owner, "あや", {
      config: {
        language: "TypeScript",
        difficulty: "easy",
        members: ["あや"],
        intervalMinutes: 5,
      },
    });
    const before = await awaitProblem(owner);
    if (before === null) throw new Error("前提が崩れた: 初級のお題が用意されていない");
    await owner.close();

    // When: 輪の先頭ではない人が、難易度を上級へ変える
    const guest = await server.connect("guest");
    await joinRoom(guest, created.code, "ゆう");
    guest.send({ command: "config.set", config: { difficulty: "hard" } });

    // Then: 上級の設定でお題が作り直される（**どのお題が選ばれるかは timer-core の
    //       `pickFallback` の領分なので、ここでは「差し替わったこと」だけを見る**）。
    const after = await awaitSnapshot(
      guest,
      (room) =>
        room.config.difficulty === "hard" &&
        room.problem !== null &&
        room.problem.title !== before.title,
    );
    expect(after).not.toBeNull();
  });

  /**
   * 2 本目のお題（#273）。
   *
   * #249（#95 S5c）で「新しいセッション」は**ルームをロビーへ戻してから玄関へ送る**
   * ようになった（`apps/timer-web/src/sync/use-timer-sync.ts` の `newSession`）。
   * 送るのは `phase.set setup` の 1 通だけで、**お題の作り直しは誰も頼まない**。
   *
   * **お題の中身の比較では見分けられない。** `pickFallback` は
   * `Math.abs(now) % candidates.length` で選ぶので、作り直しても同じお題を引きうる
   * （#283）。そこで 1 本目に**この実行だけの印**を付けてから完成させる。
   *
   * **「いったん `problem: null` の snapshot が届くこと」は見ない。** それは
   * 「落として埋める」という現在の実装の道順であって、利用者への約束ではない。
   * 見るのは「2 本目のロビーに出るお題が 1 本目ではないこと」である。
   */
  it("Given 完了したセッション / When 「新しいセッション」でロビーへ戻す / Then 2 本目のお題が用意される", async () => {
    // Given: timer でルームを作り、1 本目のお題に印を付ける
    const owner = await server.connect("owner");
    await createRoom(owner, "あや", {
      config: {
        language: "TypeScript",
        difficulty: "easy",
        members: ["あや"],
        intervalMinutes: 5,
      },
    });
    if ((await awaitProblem(owner)) === null) {
      throw new Error("前提が崩れた: 1 本目のお題が用意されていない");
    }
    const firstTitle = "1 本目のお題（#273）";
    owner.send({ command: "problem.edit", patch: { title: firstTitle } });
    await owner.take("snapshot", (m) => m.room.problem?.title === firstTitle);

    // Given: 走らせて完成させる（phase=celebration）
    owner.send({ command: "phase.set", phase: "session" });
    owner.send({ command: "session.act", action: "START" });
    owner.send({ command: "session.complete" });
    await owner.take("snapshot", (m) => m.room.phase === "celebration");

    // When: 「新しいセッション」が送る 1 通だけを送る（お題の依頼は送らない）
    owner.send({ command: "phase.set", phase: "setup" });

    // Then: 2 本目のロビーにお題が出ており、それは 1 本目のお題ではない
    const lobby = await awaitSnapshot(owner, (r) => r.phase === "setup" && r.problem !== null);
    expect(lobby, "2 本目のお題が用意されない").not.toBeNull();
    expect(lobby?.problem?.title, "1 本目のお題が残っている").not.toBe(firstTitle);
  });
});
