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
    const handlers = makeTestHandlers({ store, broadcaster, ...this.depsOverrides });

    const ids: Record<string, string> = {};

    const created = await handlers.handleCommand(HOST_CONN, {
      command: "room.create",
      displayName: HOST_NAME,
    });
    if (!created.isOk()) {
      throw new RoomBuildError(`room.create に失敗した（${created.error}）`);
    }
    const code = created.value.code;
    ids[HOST_NAME] = created.value.participantId;

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
      ids[name] = joined.value.participantId;

      // join しただけではドライバーローテーションに加わらない（ローテーション加入は
      // 別操作＝「ドライバーに加わる」）。withParticipants は「モブに加わった」を表すため、
      // ここで自分自身を member.add する。
      const added = await handlers.handleCommand(connId, {
        command: "member.add",
        participantId: joined.value.participantId,
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
 * makeHandlers を既定の依存（InMemoryRoomStore / FakeClock / SpyBroadcaster / FakeCodeGen）で
 * 組み立てる。`aRoom()` の内部でも使うが、ビルダーの段組みを必要としない単発のテストからも使える。
 */
export function makeTestHandlers(
  overrides?: Partial<HandlerDeps>,
): ReturnType<typeof makeHandlers> {
  return makeHandlers({
    store: overrides?.store ?? new InMemoryRoomStore(),
    clock: overrides?.clock ?? new FakeClock(1_000_000),
    broadcaster: overrides?.broadcaster ?? new SpyBroadcaster(),
    codeGen: overrides?.codeGen ?? new FakeCodeGen(),
    ...overrides,
  });
}
