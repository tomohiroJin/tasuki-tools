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
 * **お題が未確定の状態（`problem: null`）を作るのも埋めるのもサーバーである。**
 * だから埋める責任もサーバー側に置く —— クライアントに「代表」を置く限り、
 * 在席していない人に依頼を期待する構造が残り続ける。
 *
 * **書き手を数えて書かない**（`application/lobby-problem.ts` の注記と同じ理由）。
 * かつてここには「`initial-timer-state.ts` が唯一の書き手」とあったが、#273 で
 * 2 つ目が増えてその 1 文だけが嘘になった。見るべきは人数ではなく、
 * **ロビーで `problem` が null なら誰かが用意する**という不変条件のほうである。
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
   * **お題の中身を決める入力が変わっていないなら、設定を送り直しても作り直さない。**
   *
   * `regenerateLobbyProblem` は `problem !== null` も `isRequesting` も見ずに張り直す。
   * つまり呼べば**利用者が手編集した／貼り付けたお題をそのまま捨てる**し、AI 解錠
   * ルームでは日次枠を 1 消費し、クールダウン中なら定型へ格下げされる
   * （`ai-limits.ts`・#283 の 3 点目）。作り直しの引き金を広げるほど、
   * **古さを直すつもりで正当なお題を巻き添えにする**。
   *
   * ここで送るのは `problemEnabled: true` である。**未設定と `true` はどちらも
   * 「使う」**なので（`aggregate.ts` の `problemEnabled?: boolean`）、人間には
   * 「何も変えていない」操作にあたる。引き金を素の不一致で書くと
   * `undefined → true` が「変化した」に化けてここが赤くなる。
   *
   * **この 1 本が、全 sync テストのうち唯一この性質を見ている**（実測: 判定を
   * `true` に固定する変異を当てると、719 件のうち落ちるのはこれだけだった）。
   */
  it("Given お題ありのルーム / When 同じ「お題あり」を送り直す / Then お題は作り直されない", async () => {
    // Given: お題ありで作る（`problemEnabled` は未設定＝使う）
    const owner = await server.connect("owner");
    await createRoom(owner, "あや", {
      config: {
        language: "TypeScript",
        difficulty: "easy",
        intervalMinutes: 5,
      },
    });
    const before = await awaitProblem(owner);
    if (before === null) throw new Error("前提が崩れた: お題が用意されていない");
    const marked = "作り直されたら消える印";
    owner.send({ command: "problem.edit", patch: { title: marked } });
    await owner.take("snapshot", (m) => m.room.problem?.title === marked);

    // 印が載った時点から先だけを見るために、いまの受信数を控える。
    const snapshotsBefore = owner.all("snapshot").length;

    // When: 未設定から `true` を送る（人間には「何も変えていない」操作）
    owner.send({ command: "config.set", config: { problemEnabled: true } });

    // **往復を 1 つ挟んでから読む。** `config.set` が起こす配信は 2 通になりうる ——
    // `commit` が配る「設定を反映した snapshot」（お題はまだ印のまま）と、そのあとに
    // `finalize` から飛ぶ「作り直したお題の snapshot」である。**前者だけを `take` で
    // 掴んで `latestRoom()` を読むと、2 通目が届く前に継続が走ったときに退行があっても
    // 緑になる**（`latestRoom` は受信済みのものしか見ない）。
    //
    // 同じ接続のフレームは送信順に届くので、**`config.set` より後に投げた
    // `time.ping` の応答**を待てば、その時点で `config.set` 由来の配信はすべて
    // 受信済みだと言い切れる。`time.pong` は snapshot を伴わないので、待つこと自体が
    // 観測対象を動かさない。
    owner.send({ command: "time.ping", clientTime: 0 });
    await owner.take("time.pong");

    // Then: この操作で届いた snapshot は、1 通も印を書き換えていない。
    //       **`latestRoom()` の 1 点ではなく、届いた全通に対して主張する。**
    const titles = owner
      .all("snapshot")
      .slice(snapshotsBefore)
      .map((m) => m.room.problem?.title ?? "（お題なし）");
    expect(titles.length, "config.set の配信が 1 通も届いていない").toBeGreaterThan(0);
    expect([...new Set(titles)], "送り直しで作り直された").toEqual([marked]);
    // 設定そのものは反映されている（空振りで緑になっていないことの確認）。
    expect(owner.latestRoom().config.problemEnabled).toBe(true);
  });

  it("Given 輪の先頭が去ったロビー / When 残った人が難易度を変える / Then その難易度のお題へ作り直される", async () => {
    // Given: 先頭（あや）が timer でルームを作り、初級のお題が出た状態で去る。
    const owner = await server.connect("owner");
    const created = await createRoom(owner, "あや", {
      config: {
        language: "TypeScript",
        difficulty: "easy",
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
