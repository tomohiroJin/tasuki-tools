/**
 * aRoom() — ルーム構築ビルダー（apps/sync 共有・新設4）
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
import { InMemoryRoomStore } from "../../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./spy-broadcaster.js";
import { FakeCodeGen } from "./fake-code-gen.js";

const HOST_CONN = "host-conn";
const HOST_NAME = "Host";

export interface BuiltRoom {
  handlers: ReturnType<typeof makeHandlers>;
  store: InMemoryRoomStore;
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
  private depsOverrides: Partial<HandlerDeps> = {};

  /** 参加者を join させる（host に続けて join した順）。 */
  withParticipants(...names: string[]): this {
    this.participantNames.push(...names);
    return this;
  }

  /** 現ドライバーを指名する（host または withParticipants で登場済みの名前のみ）。 */
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
  withDeps(overrides: Partial<HandlerDeps>): this {
    this.depsOverrides = { ...this.depsOverrides, ...overrides };
    return this;
  }

  async build(): Promise<BuiltRoom> {
    const store = new InMemoryRoomStore();
    const broadcaster = new SpyBroadcaster();
    // ビルダーは配信メッセージ（room.created / room.joined）から participantId 等を取るため、
    // broadcaster を差し替えられると前提を組み立てられない。BuiltRoom.broadcaster も
    // 実際に配線されたものと食い違う。差し替えたい場合は makeTestHandlers を直接使うこと。
    if (this.depsOverrides.broadcaster !== undefined) {
      throw new RoomBuildError("withDeps({ broadcaster }) は差し替えできない");
    }
    const handlers = makeTestHandlers({ store, broadcaster, ...this.depsOverrides });

    const ids: Record<string, string> = {};

    const created = await handlers.handleCommand(HOST_CONN, {
      command: "room.create",
      displayName: HOST_NAME,
    });
    if (!created.isOk()) {
      throw new RoomBuildError(`room.create に失敗した（${created.error}）`);
    }
    // ルームコード・participantId は本番と同じ観測点（配信された room.created）から取る。
    // 本番（server.ts）は handleCommand の戻り値を破棄しており、これらが利用者へ届く
    // 経路は配信メッセージだけである（FR-100）。
    const createdMsg = broadcaster.createdFor(HOST_CONN);
    const code = createdMsg.code;
    ids[HOST_NAME] = createdMsg.participantId;

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
      const phased = await handlers.handleCommand(HOST_CONN, {
        command: "phase.set",
        phase: "session",
      });
      if (!phased.isOk()) {
        throw new RoomBuildError(`phase.set("session") に失敗した（${phased.error}）`);
      }
      const acted = await handlers.handleCommand(HOST_CONN, {
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
          `withDriver("${this.driverName}") は host / withParticipants に存在しない名前`,
        );
      }
      const assigned = await handlers.handleCommand(HOST_CONN, {
        command: "driver.assign",
        participantId,
      });
      if (!assigned.isOk()) {
        throw new RoomBuildError(`driver.assign("${this.driverName}") に失敗した（${assigned.error}）`);
      }
    }

    return { handlers, store, broadcaster, code, ids };
  }
}

/**
 * 配線されていない `destroyRoom`（#173）。
 *
 * `HandlerDeps.destroyRoom` は**必須**である（理由はそちらの docstring）。この必須指定は
 * 長らく「テストが型検査の射程外にある」ことに依存しており、テストは渡さずに済んでいた。
 * #173 でテストを射程へ入れたので、既定をここ 1 箇所に置く。
 *
 * **`destroyRoom` を optional へ戻して型エラーを消すことはしない。** 戻すと、本番の配線
 * （`create-sync-server.ts`）から注入を外しても既定値が代わりに動き、不在タイマーの解放
 * だけが静かに失われる状態へ後退する。
 *
 * **既定を no-op にしないのは、振る舞いを静かに変えないため。** これまでテストは
 * `destroyRoom` を渡しておらず、破棄経路に入れば `undefined` が呼ばれて `TypeError` で
 * 落ちていた。no-op にするとその場面が黙って成功へ変わる。throw なら現状のままである。
 *
 * 破棄そのものを観測したいテストは {@link ./spy-destroyer.js spyDestroyer} を
 * `destroyRoom` へ渡すこと（`destroy-room.test.ts` / `solo-leave.test.ts` がそうしている）。
 */
function unwiredDestroyRoom(roomCode: string): never {
  throw new Error(
    `destroyRoom がこのテストへ配線されていません（roomCode=${roomCode}）。` +
      "破棄経路を通るなら spyDestroyer を destroyRoom へ渡してください。",
  );
}

/**
 * makeHandlers を既定の依存（InMemoryRoomStore / FakeClock / SpyBroadcaster / FakeCodeGen）で
 * 組み立てる。`aRoom()` の内部でも使うが、ビルダーの段組みを必要としない単発のテストからも使える。
 *
 * **`...overrides` は先頭に置く。** 必須キーを後ろで明示的に埋めることで、
 * `Partial<HandlerDeps>` を展開しても必須キーが欠けないことが型で保証される
 * （既定値の選び方は変わっていない —— どのキーも `overrides?.x ?? 既定` である）。
 */
export function makeTestHandlers(
  overrides?: Partial<HandlerDeps>,
): ReturnType<typeof makeHandlers> {
  return makeHandlers({
    ...overrides,
    store: overrides?.store ?? new InMemoryRoomStore(),
    clock: overrides?.clock ?? new FakeClock(1_000_000),
    broadcaster: overrides?.broadcaster ?? new SpyBroadcaster(),
    codeGen: overrides?.codeGen ?? new FakeCodeGen(),
    destroyRoom: overrides?.destroyRoom ?? unwiredDestroyRoom,
  });
}
