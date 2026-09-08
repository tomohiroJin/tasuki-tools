/**
 * `ProblemDelegator` が定型お題の選択を `Clock` ポート経由で行うことを見る（#166 / #72 E3）。
 *
 * **`problem-delegation.ts` から `this.clock` を消したら赤くなること**がこのファイルの要件である。
 * `pickFallback` は 3 つの経路（即時確定・検証失敗の縮退・候補の使い切り）から呼ばれるので、
 * 3 つとも押さえる。
 *
 * 期待値は `Math.abs(now) % candidates.length` を書き写して組み立てない。
 * **`pickFallback` を実際に呼んで**得る。写経すると本番の配線が消えてもテストが緑のままになる
 * （検査と同じ判定をテストが再実装していて配線の消滅を見逃した #158 と同じ事故）。
 */

import { describe, it, expect, afterEach } from "bun:test";
import { pickFallback, type Room } from "@tasuki/timer-core";
import { ProblemDelegator } from "../src/application/problem-delegation.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { aRoom } from "./support/room-builder.js";
import { testLogger, testRefEncoder } from "./support/test-logger.js";

/**
 * 固定時刻。0 を使うと「渡し忘れて undefined→NaN」との区別が付きにくいので避ける。
 * この値で選ばれるお題が「配線が無いとき」に選ばれるお題と違うことは
 * `assertDiscriminating()` が実際に `pickFallback` を呼んで確かめる。
 */
const FIXED_NOW = 7;

/** `aRoom()` が host に与える表示名 */
const HOST_NAME = "Host";

/** 後片付け用。テスト内で組んだ delegator を貯めておく（残ったタイマーを解除する） */
const delegators: ProblemDelegator[] = [];

afterEach(() => {
  for (const d of delegators) d.cancelAll();
  delegators.length = 0;
});

/**
 * FIXED_NOW が「時刻が届いていない」場合と区別できることを前提として確かめる。
 *
 * 定型お題バンクの件数が変わって `FIXED_NOW % 件数 === 0` になると、配線を消しても
 * 同じお題が選ばれてしまい、このファイルは何も検査しなくなる。その状態を黙って
 * 通さないための前提確認である。前提の失敗は `throw`（検証の失敗＝`expect` と区別する・FR-096）。
 */
function assertDiscriminating(language: string, difficulty: string): void {
  const wired = pickFallback(language, difficulty, FIXED_NOW).problem;
  const unwired = pickFallback(language, difficulty, 0).problem;
  if (wired.title === unwired.title) {
    throw new Error(
      `前提: FIXED_NOW=${FIXED_NOW} は now=0 と同じお題（${wired.title}）を選ぶため、配線の有無を判別できない`,
    );
  }
}

interface Fixture {
  /** 対象ルーム（`mutate` 適用後の実体） */
  room: Room;
  code: string;
  /** 表示名 → participantId */
  ids: Record<string, string>;
  broadcaster: SpyBroadcaster;
  delegator: ProblemDelegator;
}

/**
 * `aRoom()` が組んだ実ルームを土台に、`clock.now()` が FIXED_NOW を返す delegator を用意する。
 * ルームの一部（problemMode・AI 鍵の有無）は経路ごとに `mutate` で差し替える。
 */
async function setup(mutate: (room: Room) => Room): Promise<Fixture> {
  const built = await aRoom().build();
  const base = built.store.get(built.code);
  if (base === undefined) {
    throw new Error("前提: aRoom() が作ったルームが store から引けない");
  }
  const room = mutate(base);
  built.store.put(room);

  assertDiscriminating(room.config.language, room.config.difficulty);

  // aRoom() の broadcaster には構築時の配信が積まれているので、観測用は新しく用意する。
  const broadcaster = new SpyBroadcaster();
  const delegator = new ProblemDelegator({
    store: built.store,
    clock: new FakeClock(FIXED_NOW),
    broadcaster,
    logger: testLogger,
    refEncoder: testRefEncoder,
  });
  delegators.push(delegator);

  return { room, code: built.code, ids: built.ids, broadcaster, delegator };
}

/** 確定したお題（＝最後に配信された snapshot のお題）を返す。配信が無ければ throw する。 */
function finalizedProblem(broadcaster: SpyBroadcaster): NonNullable<Room["problem"]> {
  const problem = broadcaster.latestSnapshot()?.problem;
  if (problem === null || problem === undefined) {
    throw new Error("前提: お題が確定した snapshot が配信されていない");
  }
  return problem;
}

/**
 * @requirements FR-024, FR-037, FR-043
 */
describe("ProblemDelegator: 定型お題の選択が Clock ポートを通る", () => {
  it("problemMode=fallback の即時確定で、clock.now() に対応するお題が確定する", async () => {
    // Given（problemMode=fallback。候補を確認せず即座に定型で確定する経路）
    const { room, code, broadcaster, delegator } = await setup((r) => ({
      ...r,
      problemMode: "fallback",
    }));

    // When
    delegator.request(code, "req-mode-fallback");

    // Then（即時確定の経路だけが source:"fallback" を足す。ここで経路を固定する）
    expect(finalizedProblem(broadcaster).source).toBe("fallback");
    // clock.now() を渡したときに選ばれるお題と一致する
    const expected = pickFallback(room.config.language, room.config.difficulty, FIXED_NOW).problem;
    expect(finalizedProblem(broadcaster)).toMatchObject(expected);
  });

  it("代表の投入が検証に落ちた縮退で、clock.now() に対応するお題が確定する", async () => {
    // Given（AI 鍵を持つ host が代表になれるルーム。problemMode は未設定＝AI 委譲経路）
    const { room, code, ids, broadcaster, delegator } = await setup((r) => ({
      ...r,
      participants: r.participants.map((p) =>
        p.participantId === r.hostParticipantId ? { ...p, hasAiKey: true } : p,
      ),
    }));
    const hostId = ids[HOST_NAME];
    if (hostId === undefined) {
      throw new Error("前提: aRoom() が host の participantId を返していない");
    }
    delegator.request(code, "req-invalid-submit");

    // When（代表が構造の不正なお題を投入する＝validateProblem が失敗する）
    const accepted = delegator.submit(code, "req-invalid-submit", hostId, { foo: "bar" } as never, false);
    if (!accepted) {
      throw new Error("前提: 代表からの submit が受理されなかった（候補列の組み立てを見直すこと）");
    }

    // Then
    const expected = pickFallback(room.config.language, room.config.difficulty, FIXED_NOW).problem;
    expect(finalizedProblem(broadcaster)).toMatchObject(expected);
  });

  it("候補を使い切った定型確定で、clock.now() に対応するお題が確定する", async () => {
    // Given（AI 鍵の保有者が一人もいない＝候補列が定型センチネルだけになる）
    const { room, code, broadcaster, delegator } = await setup((r) => ({
      ...r,
      participants: r.participants.map((p) => ({ ...p, hasAiKey: false })),
    }));

    // When
    delegator.request(code, "req-no-candidate");

    // Then（候補使い切りの経路は source を足さずに確定する。ここで経路を固定する）
    // `sent` が 0 件であることは経路の証拠にならない（即時確定の経路も need-problem を送らない）。
    expect(finalizedProblem(broadcaster).source).toBeUndefined();
    const expected = pickFallback(room.config.language, room.config.difficulty, FIXED_NOW).problem;
    expect(finalizedProblem(broadcaster)).toMatchObject(expected);
  });
});
