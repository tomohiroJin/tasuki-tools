/**
 * レート制限が**実 WS の配線を通して**クライアント単位で効いていることを確かめる（#103）。
 *
 * ## なぜ in-process のテストでは足りないか
 *
 * `join-rate-limit.test.ts` は `handlers.handleConnectionOpen()` を**テストが自分で
 * 呼んで**「同じクライアントの別接続」を組み立てている。つまり
 * **`create-sync-server.ts` が `onConnect` を handlers へ配線しているか**は見ていない。
 * その配線を外すと鍵は connId へ落ち、接続を張り直すだけで残量が戻る
 * （#103 が塞いだ回避経路そのもの）が、in-process のテストは全件緑のままになる。
 *
 * ここは「WS アダプタが X-Forwarded-For から導いた鍵が、handlers のバケツまで
 * 届いているか」の 1 点だけを、実ソケットで見る。
 *
 * ## 時間に対する余裕
 *
 * バケツは毎秒 1 個補充される。使い切った直後に張り直しても残量は戻らないが、
 * 実 I/O を挟むので「1 個だけ戻る」ことはありうる。そこで新しい接続では複数回試し、
 * **1 度でも JOIN_RATE_LIMITED が返ること**を条件にする（数秒ぶんの余裕がある）。
 * 鍵が接続単位に戻っていれば新しい接続は容量ぶん通るので、この条件でも取り違えない。
 */

import { describe, it, expect, afterEach } from "bun:test";
import { DEFAULT_CAPACITY } from "@tasuki/rate-limit";
import {
  createRoom,
  startLiveSyncServer,
  type LiveClient,
  type LivePokerClient,
  type LiveSyncServer,
} from "./support/live-sync-server.js";

let server: LiveSyncServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** 存在しないコードで入室を試みる。 */
function badJoin(client: LiveClient): void {
  client.send({ command: "room.join", code: "NOPE99", displayName: "Bob", hasAiKey: false });
}

/** `count` 回失敗させ、その回数ぶんのエラーが届くまで待つ。 */
async function drainBadJoins(client: LiveClient, count: number): Promise<void> {
  const before = client.all("error").length;
  for (let i = 0; i < count; i++) badJoin(client);
  await client.until(
    (received) => received.filter((m) => m.type === "error").length >= before + count,
    `${count} 件のエラー応答`,
  );
}

/** 直近 `count` 件のエラーコード。 */
function lastErrorCodes(client: LiveClient, count: number): string[] {
  return client
    .all("error")
    .slice(-count)
    .map((m) => m.code);
}

/** poker の入口で、存在しないルームへの参加を `count` 回試み、その応答を集める。 */
async function drainPokerBadJoins(poker: LivePokerClient, count: number): Promise<string[]> {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    poker.send({ type: "join-room", roomId: "nope9999", name: "Bob" });
    const msg = await poker.take((m) => m.type === "error", `${i + 1} 件目のエラー応答`);
    codes.push((msg as { code: string }).code);
  }
  return codes;
}

/** timer の `ai.unlock` を誤った合言葉で `count` 回叩き、その応答コードを集める。 */
async function drainBadUnlocks(client: LiveClient, count: number): Promise<string[]> {
  const before = client.all("error").length;
  for (let i = 0; i < count; i++) client.send({ command: "ai.unlock", key: "wrong" });
  await client.until(
    (received) => received.filter((m) => m.type === "error").length >= before + count,
    `${count} 件のエラー応答`,
  );
  return lastErrorCodes(client, count);
}

describe("実 WS 越しの入室レート制限", () => {
  it("使い切ったクライアントは、接続を張り直しても JOIN_RATE_LIMITED のままになる", async () => {
    // Given（同じ X-Forwarded-For を名乗る 1 本目の接続で使い切る）
    server = startLiveSyncServer();
    const xff = { "x-forwarded-for": "203.0.113.7" };
    const first = await server.connect("first", xff);
    await drainBadJoins(first, DEFAULT_CAPACITY + 1);
    expect(lastErrorCodes(first, 1)).toEqual(["JOIN_RATE_LIMITED"]);

    // When（切断して、同じ IP から新しい接続を開く）
    await first.close();
    const second = await server.connect("second", xff);
    await drainBadJoins(second, 3);

    // Then（接続単位に戻っていれば 3 件とも ROOM_NOT_FOUND になる）
    expect(lastErrorCodes(second, 3)).toContain("JOIN_RATE_LIMITED");
  });

  it("X-Real-IP を変えても、X-Forwarded-For が同じなら鍵は変わらない（X-Real-IP は鍵の材料にならない）", async () => {
    // Given（同じ X-Forwarded-For・X-Real-IP を名乗る 1 本目の接続で使い切る）
    server = startLiveSyncServer();
    const xff = "203.0.113.7";
    const first = await server.connect("first", {
      "x-forwarded-for": xff,
      "x-real-ip": "198.51.100.1",
    });
    await drainBadJoins(first, DEFAULT_CAPACITY + 1);
    expect(lastErrorCodes(first, 1)).toEqual(["JOIN_RATE_LIMITED"]);

    // When（同じ X-Forwarded-For・別の X-Real-IP で繋ぎ直す。X-Real-IP が鍵の材料なら
    // ここで別の鍵になり、残量がまっさらに戻ってしまう）
    await first.close();
    const second = await server.connect("second", {
      "x-forwarded-for": xff,
      "x-real-ip": "203.0.113.99",
    });
    await drainBadJoins(second, 3);

    // Then（X-Forwarded-For だけが鍵の材料なら、引き続き JOIN_RATE_LIMITED が混じる）
    expect(lastErrorCodes(second, 3)).toContain("JOIN_RATE_LIMITED");
  });

  it("別の IP のクライアントは巻き込まれない", async () => {
    // Given
    server = startLiveSyncServer();
    const attacker = await server.connect("attacker", { "x-forwarded-for": "203.0.113.7" });
    await drainBadJoins(attacker, DEFAULT_CAPACITY + 1);
    expect(lastErrorCodes(attacker, 1)).toEqual(["JOIN_RATE_LIMITED"]);

    // When
    const bystander = await server.connect("bystander", { "x-forwarded-for": "198.51.100.9" });
    await drainBadJoins(bystander, 3);

    // Then
    expect(lastErrorCodes(bystander, 3)).toEqual([
      "ROOM_NOT_FOUND",
      "ROOM_NOT_FOUND",
      "ROOM_NOT_FOUND",
    ]);
  });

  /**
   * **1 IP 1 バケツ**（#95 S4a）。timer の `room.join` / `ai.unlock` と poker の
   * `join-room` が、**同じ 1 本のバケツ**を消費することを実 WS で固定する。
   *
   * ## なぜここでしか見られないか
   *
   * S2 まではバケツが入口ごとに 2 本あり、それで実効枠が保たれていた（2 つの入口が
   * 別々のルームコード空間を見ていたため）。S4a で名簿が 1 つになってコード空間が
   * 1 つになり、**別のままだと 1 IP あたりの総当たり予算が単純に 2 倍**になる。
   * バケツを 1 本にしたのはそのためで、共有は `create-sync-server.ts` が
   * `createTokenBucketLimiter()` を 1 度だけ呼んで両方へ渡すことで成り立っている。
   *
   * ⚠ **これはもう構造では保証されない。** timer 側はかつて `makeHandlers` の内側で
   * 生成しており「1 インスタンスである」ことが構造の帰結だったが、注入に変えて外へ出た。
   * **その保証を引き受けているのがこのテストである**（`join-rate-limit.test.ts` の
   * 「room.join と ai.unlock のバケツの共有」は in-process なので、poker の入口は見ない）。
   *
   * 3 経路へ `DEFAULT_CAPACITY` を**分けて**消費させる。バケツが別々なら、どの経路も
   * 自分の容量の 1/3 しか使っておらず、最後の追い打ちは拒否されない。
   */
  it("timer の room.join・ai.unlock と poker の join-room が同じバケツを消費する（1 IP 1 バケツ）", async () => {
    // Given（同じ X-Forwarded-For を名乗る timer と poker の接続）
    server = startLiveSyncServer();
    const xff = "203.0.113.7";
    const timer = await server.connect("timer", { "x-forwarded-for": xff });
    const poker = await server.connectPoker("poker", { "x-forwarded-for": xff });
    // ai.unlock は在室者のコマンドなので、まずルームを 1 つ作って入っておく
    // （room.create はバケツを消費しない）。
    await createRoom(timer, "アリス");

    // When（容量を 3 経路へ 3 等分して使い切る）
    const share = DEFAULT_CAPACITY / 3;
    expect(Number.isInteger(share)).toBe(true); // 分け方が崩れたら前提から気づけるようにする
    expect(await drainBadUnlocks(timer, share)).not.toContain("RATE_LIMITED");
    expect(await drainPokerBadJoins(poker, share)).not.toContain("rate-limited");
    await drainBadJoins(timer, share);
    expect(lastErrorCodes(timer, share)).not.toContain("JOIN_RATE_LIMITED");

    // Then（どちらの入口から追い打ちしても拒否される＝合計が 1 つの上限に当たっている）
    //
    // 補充は毎秒 1 個で、ここまでに実 I/O のぶんの時間が経っている。**複数回試して
    // 1 度でも拒否が返ること**を条件にする（別バケツなら容量の 1/3 しか使っていないので、
    // 数回の追い打ちでは 1 度も拒否されない）。
    expect(await drainPokerBadJoins(poker, 5)).toContain("rate-limited");
    await drainBadJoins(timer, 5);
    expect(lastErrorCodes(timer, 5)).toContain("JOIN_RATE_LIMITED");
  });

  /**
   * 設計正本 §6.2 が D3（判定・照会・消費の順序）の検査手段として指定している
   * 「実 WebSocket 越しの統合テスト」。
   *
   * `join-rate-limit.test.ts` にも同じ主張の in-process テストがあるが、あちらは
   * handlers を直接呼ぶ。**実在するコードを実ソケット越しに投げたときも
   * `ROOM_NOT_FOUND` ではなく拒否が返る**ことを、poker 側
   * （`test/poker/rate-limit.test.ts`。統合前は apps/poker-sync/tests/）と同じ粒度でここでも押さえる。
   *
   * ここが逆順（照会してから判定）だと、攻撃者はトークンを消費せずに
   * 「そのコードが実在するか」を数え切れないほど試せる。
   */
  it("残量が無いとき、実在するコードでも JOIN_RATE_LIMITED を返す（照会より前に判定する）", async () => {
    // Given（ホストが実 WS でルームを作り、別 IP の攻撃者が残量を使い切る）
    server = startLiveSyncServer();
    const host = await server.connect("host", { "x-forwarded-for": "198.51.100.1" });
    const created = await createRoom(host, "ホスト");
    const attacker = await server.connect("attacker", { "x-forwarded-for": "203.0.113.7" });
    await drainBadJoins(attacker, DEFAULT_CAPACITY + 1);
    expect(lastErrorCodes(attacker, 1)).toEqual(["JOIN_RATE_LIMITED"]);

    // When（**実在する**コードで入室を試みる）
    attacker.send({
      command: "room.join",
      code: created.code,
      displayName: "侵入者",
      hasAiKey: false,
    });
    await attacker.until(
      (received) => received.filter((m) => m.type === "error").length >= DEFAULT_CAPACITY + 2,
      "実在コードでの入室に対する応答",
    );

    // Then（存在の有無が漏れないよう、実在しないコードのときと同じ拒否になる）
    expect(lastErrorCodes(attacker, 1)).toEqual(["JOIN_RATE_LIMITED"]);
  });
});
