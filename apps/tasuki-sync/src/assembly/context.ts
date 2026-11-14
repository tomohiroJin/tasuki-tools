/**
 * 組み立ての部品が共有する型（#591。`create-sync-server.ts` から道具ごとの組み立てを分けたときに置いた）。
 *
 * `createSyncServer`（`../create-sync-server.ts`）が全部の道具を 1 つの表へ並べて畳む。ここには、
 * 道具ごとの組み立て（`./topic.ts` ほか）が受け取るもの（{@link AssemblyBase}・{@link TimerSide}）と、
 * 返すもの（{@link ToolPartBase}）の形を置く。
 *
 * ## 順序と前方参照を明示する
 *
 * 組み立てには相互参照がある。WS アダプタはハンドラを受け、ハンドラは配信を受け、配信は WS アダプタを引く。
 * 破棄は各道具の保管を解放し、ハンドラは在室者 0 人の退出で破棄を呼ぶ。以前はこれを `let` と
 * クロージャで暗黙に解いていた（早すぎる呼び出しは TDZ か `undefined` 呼び出しで、原因が読めなかった）。
 * いまは **{@link late} で名前つきの前方参照にする**。値を入れる前に引くと、名前を含む例外で落ちる。
 *
 * 順序は次の 4 段で、`create-sync-server.ts` はこの順に並べる:
 *
 *   1. 共有の部品（名簿・時計・トークン保管・ゲートのバケツ・ログ）と timer・ハブの配信
 *   2. **お題の保管と配信**（{@link ../assembly/topic.ts}。timer のハンドラが先に要る）
 *   3. timer のハンドラ（`makeHandlers`）。ここで {@link TimerSide} が決まる
 *   4. ハブ・お題・ルーレット・進行タイマー・チェックイン・poker のメッセージ層（{@link TimerSide} を受ける）
 */
import type { InMemoryRoomStore } from "../adapters/in-memory-room-store.js";
import type { InMemoryTimerStore } from "../adapters/in-memory-timer-store.js";
import type { NanoidCodeGen } from "../adapters/nanoid-code-gen.js";
import type { SystemWallClock } from "../adapters/system-clock.js";
import type { WsAdapter } from "../adapters/ws-adapter.js";
import type { SyncConfig } from "../config.js";
import type { Logger } from "../application/log/logger.js";
import type { RefEncoder } from "../application/log/ref-encoder.js";
import type { PokerHandlerDeps } from "../application/poker-handlers.js";
import type { RateLimitGate } from "../application/rate-limit-gate.js";
import type { TokenStore } from "../application/token-store.js";
import type { Broadcaster } from "../ports/broadcaster.js";
import type { HubBroadcaster } from "../ports/hub-broadcaster.js";
import type { MonotonicClock } from "../ports/monotonic-clock.js";
import type { RandomSource } from "../ports/random-source.js";
import type { RateLimiter } from "@tasuki/rate-limit";

/** まだ値が入っていない前方参照を引いたときの失敗。名前から組み立ての順序のどこが違うか分かる。 */
export class LateReferenceError extends Error {
  override readonly name = "LateReferenceError";
}

/**
 * 後から値を入れる前方参照。組み立ての循環（WS アダプタ・破棄・ハンドラ同士）を解く。
 *
 * `get` は呼ぶたびに引く（組み立ての中で値を捕まえない）。`set` は 1 度だけ（2 度目は組み立ての誤り）。
 */
export interface Late<T> {
  get(): T;
  set(value: T): void;
}

export function late<T>(name: string): Late<T> {
  let slot: { readonly value: T } | undefined;
  return {
    get: () => {
      if (slot === undefined) throw new LateReferenceError(`前方参照「${name}」は、値が入る前に引かれました`);
      return slot.value;
    },
    set: (value) => {
      if (slot !== undefined) throw new LateReferenceError(`前方参照「${name}」へ 2 度、値を入れようとしました`);
      slot = { value };
    },
  };
}

/** 道具ごとの組み立てが共有して受け取るもの。**どの道具にも属さない部品だけ**を置く。 */
export interface AssemblyBase {
  readonly config: SyncConfig;
  /** 名簿の保管。 */
  readonly store: InMemoryRoomStore;
  /** timer の状態の保管。ほかの道具の入口も、ルームの在席判定でこれを読む。 */
  readonly timers: InMemoryTimerStore;
  /** 復帰トークンとパスフレーズの保管（全道具で 1 個を共有する・#95 S4a）。 */
  readonly tokens: TokenStore;
  readonly clock: SystemWallClock;
  /** 単調時計（進行タイマーの予約とハンドラが同じもので測る）。 */
  readonly monotonicClock: MonotonicClock;
  readonly random: RandomSource;
  readonly codeGen: NanoidCodeGen;
  readonly logger: Logger;
  /** ログへ出すルームコードを相関 ID へ置き換える（ADR 0012 D2）。 */
  readonly refEncoder: RefEncoder;
  /**
   * 入室失敗のレート制限のバケツ（#103）。**全道具で 1 本**（ルームコードの空間が 1 つだから）。
   * ゲート（{@link TimerSide.rateLimitGate}）はこれを 1 度だけ包んだもの。
   */
  readonly rateLimiter: RateLimiter;
  /** timer の配信。 */
  readonly timerBroadcaster: Broadcaster;
  /** ハブ（選択画面）の配信。 */
  readonly hubBroadcaster: HubBroadcaster;
  /** WS アダプタ（送る口）。最後に組み立てるので前方参照。 */
  readonly ws: Late<WsAdapter>;
}

/**
 * timer のハンドラ（`makeHandlers`）が組み立て終わってから決まるもの。ほかの道具のメッセージ層が受け取る。
 *
 * **ゲートは新しく作らない**（別に作ると `connId → クライアント鍵` の対応が空になり、鍵が connId へ落ちて、
 * 総当たりが張り直すだけで枠を回避できる）。
 */
export interface TimerSide {
  readonly rateLimitGate: RateLimitGate;
  /** 人をルームから外す（#419）。 */
  readonly removeFromRoom: PokerHandlerDeps["removeFromRoom"];
}

/** 道具ごとの組み立てが返すものの共通部分。畳む側（`createSyncServer`）が表を回して使う。 */
export interface ToolPartBase {
  /** 名簿が配られたあとに呼ぶ（チェックインが席を測り直す・#406）。要らない道具は置かない。 */
  readonly onRosterBroadcast?: (roomCode: string) => void;
  /** サーバーを止めるときの後始末（猶予・予約・子プロセスの解放）。無ければ置かない。 */
  readonly close?: () => void;
}

type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (arg: infer I) => void ? I : never;

/** 破棄の束で、2 つの部品が同じ鍵を返したときの失敗（後勝ちで黙って上書きしない）。 */
export class DuplicateKeyError extends Error {
  override readonly name = "DuplicateKeyError";
}

/**
 * 各部品が返す `destroy` を 1 つの束に合わせる。**同じ鍵を 2 つの部品が返したら落ちる**
 * （展開 `...a, ...b` は後勝ちで、片方の保管が破棄から黙って外れる）。型は全部品の積。
 * 余計な鍵（受け側の型に無い鍵）は、呼ぶ側が `AssertNever<Exclude<keyof 束, keyof 受け側>>` で型検査に落とす。
 */
export function mergeDisjoint<T extends readonly object[]>(...parts: T): UnionToIntersection<T[number]> {
  const merged: Record<string, unknown> = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (key in merged) throw new DuplicateKeyError(`破棄の束で鍵「${key}」が重複しています`);
      merged[key] = value;
    }
  }
  return merged as UnionToIntersection<T[number]>;
}
