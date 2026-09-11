/**
 * aRoom() — ルーム構築ビルダー（apps/tasuki-sync 共有・新設4）
 *
 * Given を 1〜2 行に圧縮する。実際のコマンド（room.create / room.join /
 * driver.assign / phase.set）を handleCommand 経由で流すことで、
 * 「本物の App が組み立てられる経路」を通った Room だけを前提にする。
 *
 * 前提の構築（各コマンド）が失敗した場合は throw する（`expect` は使わない）。
 * これにより、前提の失敗（このヘルパのバグ／使い方の誤り）と、
 * テスト対象の検証の失敗（`expect` によるアサーション失敗）を区別できる（FR-096）。
 *
 * @requirements FR-096, FR-097, US2
 */

import { makeHandlers, type HandlerDeps } from "../../src/application/handlers.js";
import { PresenceManager } from "../../src/application/presence.js";
import { InMemoryRoomStore } from "../../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../../src/adapters/in-memory-timer-store.js";
import { InMemoryRoundStore } from "../../src/poker/adapters/in-memory-round-store.js";
import { createTokenStore } from "../../src/application/token-store.js";
import { createRoomDestroyer } from "../../src/application/destroy-room.js";
import { testToolGate } from "./tool-gate.js";
import {
  createTokenBucketLimiter,
  DEFAULT_CAPACITY,
  DEFAULT_REFILL_PER_SEC,
  type RateLimiter,
} from "@tasuki/rate-limit";
import { FakeClock } from "../../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./spy-broadcaster.js";
import { FakeCodeGen } from "./fake-code-gen.js";

/**
 * ルームを作る接続と表示名（作成者に特別な権限は無い。#95 S3 で全員同格）。
 *
 * **定数名は `CREATOR_*` へ直したが、値の `"host-conn"` / `"Host"` は意図的に据え置く。**
 * `"Host"` は {@link BuiltRoom.ids} の鍵として消費側から引かれ、`"host-conn"` は
 * **このビルダーを使わないテストが各自で同じ綴りを定義している**（このファイルを直しても
 * 向こうは変わらない）。**ここだけを改名すると語彙が二分される** —— 片側だけ直した状態に
 * なるので、改名するならテスト全体を一度に掃く別の作業として行う。
 * 現在の広がりは `grep -ro 'host-conn\|hostConn' apps/tasuki-sync/test | wc -l` で数える
 * （**件数はここに書かない。足すたびに腐る**）。
 *
 * 値は「作成者を指す固定のテストデータ」以上の意味を持たず、権限の表明はどこにも無い。
 * `isHost` は製品コードに識別子としては 1 つも無く、残っているのは廃止済み概念に言及する
 * コメントだけである（#95 S3）。
 */
const CREATOR_CONN = "host-conn";
const CREATOR_NAME = "Host";

export interface BuiltRoom {
  handlers: TestHandlers;
  /** 名簿の保管（#95 S4a）。**poker と共有する**（本番の配線もこの 1 個である）。 */
  store: InMemoryRoomStore;
  /** timer の状態の保管（#95 S4a）。名簿とは `code` で対になる。 */
  timers: InMemoryTimerStore;
  broadcaster: SpyBroadcaster;
  /** 作成されたルームコード */
  code: string;
  /** 表示名 → participantId */
  ids: Record<string, string>;
}

/** 前提の構築（コマンド実行）に失敗したことを表すエラー。検証の失敗と区別するための専用型。 */
class RoomBuildError extends Error {
  constructor(message: string) {
    super(`aRoom(): ${message}`);
    this.name = "RoomBuildError";
  }
}

export function aRoom(): RoomBuilder {
  return new RoomBuilder();
}

class RoomBuilder {
  private participantNames: string[] = [];
  private driverName: string | undefined;
  private shouldStart = false;
  private depsOverrides: TestHandlerOverrides = {};

  /** 参加者を join させる（作成者に続けて join した順）。 */
  withParticipants(...names: string[]): this {
    this.participantNames.push(...names);
    return this;
  }

  /** 現ドライバーを指名する（作成者または withParticipants で登場済みの名前のみ）。 */
  withDriver(name: string): this {
    this.driverName = name;
    return this;
  }

  /** セッションを開始状態（phase: "session"）にする。 */
  started(): this {
    this.shouldStart = true;
    return this;
  }

  /** makeHandlers への依存を上書きする（scheduler/delegator 等、必要になったときだけ使う）。 */
  withDeps(overrides: TestHandlerOverrides): this {
    this.depsOverrides = { ...this.depsOverrides, ...overrides };
    return this;
  }

  async build(): Promise<BuiltRoom> {
    const store = new InMemoryRoomStore();
    const timers = new InMemoryTimerStore();
    const broadcaster = new SpyBroadcaster();
    // ビルダーは配信メッセージ（room.created / room.joined）から participantId 等を取るため、
    // broadcaster を差し替えられると前提を組み立てられない。BuiltRoom.broadcaster も
    // 実際に配線されたものと食い違う。差し替えたい場合は makeTestHandlers を直接使うこと。
    if (this.depsOverrides.broadcaster !== undefined) {
      throw new RoomBuildError("withDeps({ broadcaster }) は差し替えできない");
    }
    const handlers = makeTestHandlers({ store, timers, broadcaster, ...this.depsOverrides });

    const ids: Record<string, string> = {};

    const created = await handlers.handleCommand(CREATOR_CONN, {
      command: "room.create",
      displayName: CREATOR_NAME,
    });
    if (!created.isOk()) {
      throw new RoomBuildError(`room.create に失敗した（${created.error}）`);
    }
    // ルームコード・participantId は本番と同じ観測点（配信された room.created）から取る。
    // 本番（server.ts）は handleCommand の戻り値を破棄しており、これらが利用者へ届く
    // 経路は配信メッセージだけである（FR-100）。
    const createdMsg = broadcaster.createdFor(CREATOR_CONN);
    const code = createdMsg.code;
    ids[CREATOR_NAME] = createdMsg.participantId;

    for (const [index, name] of this.participantNames.entries()) {
      const connId = `conn-${index + 1}`;
      const joined = await handlers.handleCommand(connId, {
        command: "room.join",
        code,
        displayName: name,
        hasAiKey: false,
      });
      if (!joined.isOk()) {
        throw new RoomBuildError(`room.join("${name}") に失敗した（${joined.error}）`);
      }
      const joinedParticipantId = broadcaster.joinedFor(connId).participantId;
      ids[name] = joinedParticipantId;

      // join しただけではドライバーローテーションに加わらない（ローテーション加入は
      // 別操作＝「ドライバーに加わる」）。withParticipants は「モブに加わった」を表すため、
      // ここで自分自身を member.add する。
      const added = await handlers.handleCommand(connId, {
        command: "member.add",
        participantId: joinedParticipantId,
      });
      if (!added.isOk()) {
        throw new RoomBuildError(`member.add("${name}") に失敗した（${added.error}）`);
      }
    }

    // driver.assign はセッション稼働中（クロック running）でなければ受理されない
    // （decide.ts の PhaseConflict ガード）。withDriver() を使うなら、明示的に
    // started() していなくても実 App と同じコマンド列（phase.set → session.act START）
    // で開始させる。
    if (this.shouldStart || this.driverName !== undefined) {
      const phased = await handlers.handleCommand(CREATOR_CONN, {
        command: "phase.set",
        phase: "session",
      });
      if (!phased.isOk()) {
        throw new RoomBuildError(`phase.set("session") に失敗した（${phased.error}）`);
      }
      const acted = await handlers.handleCommand(CREATOR_CONN, {
        command: "session.act",
        action: "START",
      });
      if (!acted.isOk()) {
        throw new RoomBuildError(`session.act("START") に失敗した（${acted.error}）`);
      }
    }

    if (this.driverName !== undefined) {
      const participantId = ids[this.driverName];
      if (participantId === undefined) {
        throw new RoomBuildError(
          `withDriver("${this.driverName}") は作成者 / withParticipants に存在しない名前`,
        );
      }
      const assigned = await handlers.handleCommand(CREATOR_CONN, {
        command: "driver.assign",
        participantId,
      });
      if (!assigned.isOk()) {
        throw new RoomBuildError(`driver.assign("${this.driverName}") に失敗した（${assigned.error}）`);
      }
    }

    return { handlers, store, timers, broadcaster, code, ids };
  }
}

/**
 * makeHandlers を既定の依存（InMemoryRoomStore / FakeClock / SpyBroadcaster / FakeCodeGen）で
 * 組み立てる。`aRoom()` の内部でも使うが、ビルダーの段組みを必要としない単発のテストからも使える。
 *
 * **`...overrides` は先頭に置く。** 必須キーを後ろで明示的に埋めることで、
 * `Partial<HandlerDeps>` を展開しても必須キーが欠けないことが型で保証される
 * （既定値の選び方は変わっていない —— どのキーも `overrides?.x ?? 既定` である）。
 */
/**
 * `makeTestHandlers` が受け取れる上書き。
 *
 * `rounds`（poker の状態の保管）は timer の `HandlerDeps` には無い（timer のハンドラは
 * ラウンドを知らない）。ここで受けるのは、**名簿が 1 つになった以上、ルームの寿命を
 * 見るテストが「名簿・timer の状態・ラウンドが揃って消えるか」を 1 組の保管で
 * 観測する必要がある**ためである（#95 S4a）。
 */
export interface TestHandlerOverrides extends Partial<HandlerDeps> {
  /**
   * poker の状態（投票ラウンド）の保管。省略時は空の `InMemoryRoundStore`。
   * 渡したインスタンスは `createRoomDestroyer` の解放対象として製品コードへ繋がる
   * （理由は {@link TestHandlers.rounds}）。
   */
  rounds?: InMemoryRoundStore;
}

export interface TestHandlers extends ReturnType<typeof makeHandlers> {
  /**
   * poker の状態（投票ラウンド）の保管（#95 S4a）。
   *
   * **{@link makeTestHandlers} の既定の破棄経路へ配線してある。** timer の `HandlerDeps` に
   * `rounds` は無い（timer のハンドラはラウンドを知らない）が、ルームの寿命は
   * ツールをまたいで 1 つなので、`createRoomDestroyer` はこの保管も解放する。
   * したがって「破棄したら `rounds` が空である」は**テストが `put` した実体が
   * 実際に消えたこと**を見る（配線前は誰も入れていないので常に緑だった）。
   *
   * ⚠ **`destroyRoom` を上書きすると、この配線も一緒に外れる**（上書きした関数が
   * 何を解放するかは上書き側の責任になる。`spyDestroyer` は自分の `rounds` を持つ）。
   */
  rounds: InMemoryRoundStore;
  /**
   * 配線された破棄経路。`makeHandlers` は依存として受け取るだけで返さないので、
   * テストから直接叩けるようここで露出する。
   *
   * **既定は本物**（`createRoomDestroyer` を、このハンドラ一式と同じ store / timers /
   * rounds / presence の上に組んだもの）である。以前は呼ばれたら throw する
   * `unwiredDestroyRoom` を既定にしていたが、**名簿が 1 つになって寿命の規則も 1 つに
   * なった以上、「破棄されたか」を見るテストが本番と同じ後始末を通らないほうが危うい**
   * （throw を避けるために各テストが自前の偽物を渡し、後始末の抜けが緑のまま残る）。
   *
   * ⚠ **`HandlerDeps.destroyRoom` を optional へ戻して型エラーを消すことはしない。**
   * 戻すと、本番の配線（`create-sync-server.ts`）から注入を外しても既定値が代わりに動き、
   * 不在タイマーの解放だけが静かに失われる状態へ後退する（理由はそちらの docstring）。
   *
   * 後始末の**呼び出し順序**そのものを観測したいテストは
   * {@link ./spy-destroyer.js spyDestroyer} を `destroyRoom` へ渡すこと
   * （`destroy-room.test.ts` / `solo-leave.test.ts` がそうしている）。
   */
  destroyRoom: (roomCode: string) => void;
  /**
   * 切断の後始末（`PresenceManager.handleDisconnect`）。本番の配線
   * （`create-sync-server.ts`）と同じく、同じ store / timers / broadcaster / clock の上に
   * 組み立てた 1 個のインスタンスを使う。
   */
  handleDisconnect: (connId: string) => void;
}

/**
 * テスト用のルーム数上限の既定。
 *
 * **本番の既定（`config.ts` の `MAX_ROOMS` 既定）と同じ値に揃えてある。**
 * `HandlerDeps.maxRooms` は必須なので（既定値を持たせると配線漏れが型検査を素通りする）、
 * 上限そのものを検査しないテストが毎回値を選ばずに済むよう、既定はここ 1 箇所が持つ。
 * 上限の境界を見るテストは `maxRooms` を明示的に上書きすること
 * （`handlers.room.test.ts` が `maxRooms: 1` でそうしている）。
 */
export const TEST_MAX_ROOMS = 100;

/**
 * テスト用のレート制限バケツ（本番と同じ既定容量・補充速度）。
 *
 * **テストごとに新しい 1 個を作る**（バケツの残量がテストをまたぐと、実行順で
 * 結果が変わる）。本番で timer と poker が同じ 1 個を共有していることは、
 * ここではなく `test/live-ws.rate-limit.test.ts` が実 WS で見る。
 */
export function testRateLimiter(): RateLimiter {
  return createTokenBucketLimiter({
    capacity: DEFAULT_CAPACITY,
    refillPerSec: DEFAULT_REFILL_PER_SEC,
  });
}

export function makeTestHandlers(overrides?: TestHandlerOverrides): TestHandlers {
  const store = overrides?.store ?? new InMemoryRoomStore();
  const timers = overrides?.timers ?? new InMemoryTimerStore();
  const rounds = overrides?.rounds ?? new InMemoryRoundStore();
  const clock = overrides?.clock ?? new FakeClock(1_000_000);
  const broadcaster = overrides?.broadcaster ?? new SpyBroadcaster();
  // 破棄経路は本番（`create-sync-server.ts`）と同じ形で組む。handlers が destroyRoom を
  // 要り、destroyRoom が handlers.releaseRoom と presence を要る相互依存を、後から代入する
  // クロージャで解く（本番も同じ解き方をしている）。
  let destroyRoom: (roomCode: string) => void;
  const handlers = makeHandlers({
    ...overrides,
    store,
    timers,
    tokens: overrides?.tokens ?? createTokenStore(),
    toolGate: overrides?.toolGate ?? testToolGate({ timers, rounds }),
    rateLimiter: overrides?.rateLimiter ?? testRateLimiter(),
    maxRooms: overrides?.maxRooms ?? TEST_MAX_ROOMS,
    clock,
    broadcaster,
    codeGen: overrides?.codeGen ?? new FakeCodeGen(),
    destroyRoom: (roomCode) => destroyRoom(roomCode),
  });
  const presence = new PresenceManager({
    store,
    timers,
    broadcaster,
    clock,
    onDriverAbsence: handlers.advanceForAbsence,
  });
  destroyRoom =
    overrides?.destroyRoom ??
    createRoomDestroyer({
      store,
      timers,
      rounds,
      // scheduler / delegator は `withDeps` で渡されたときだけ後始末に加わる
      // （渡されていなければ、そもそも予約を作る主体が居ない）。
      scheduler: overrides?.scheduler,
      delegator: overrides?.delegator,
      presence,
      releaseRoom: handlers.releaseRoom,
    });
  return {
    ...handlers,
    rounds,
    destroyRoom: (roomCode: string) => destroyRoom(roomCode),
    handleDisconnect: (connId: string) => presence.handleDisconnect(connId),
  };
}
