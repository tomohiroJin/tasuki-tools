/**
 * 接続層（{@link WsAdapter}）のテスト用ファクトリ。
 *
 * #95 S2 で WsAdapter は timer と poker の 2 つのメッセージ層を捌くようになり、
 * `maxMessageBytes` / `maxFrameBytes` / `poker` が**必須**オプションになった。
 *
 * ⚠ **必須のままにしてある。** optional にすると、本番の配線
 * （`src/create-sync-server.ts`）から `poker` が落ちても既定値が代わりに動き、
 * 「poker が黙って繋がらないサーバー」が全テスト緑のまま出荷される。
 * `HandlerDeps.destroyRoom` を必須へ戻したときと同じ理由である。
 *
 * 接続層だけを試すテストは poker のメッセージ層に用が無いので、既定はここが
 * 1 箇所で与える。**渡す poker のハンドラは呼ばれたら throw する偽物**である。
 * timer を試すつもりのテストが poker 側へ流れていたら、緑ではなく赤で気づける。
 *
 * （`test/support/room-builder.ts` の `destroyRoom` もかつては同じ形の偽物を既定に
 * していたが、#95 S4a で本物の `createRoomDestroyer` へ差し替えた。**あちらは
 * 「本番と同じ後始末を通ること」自体が見たい対象**なのに対し、ここで見たいのは
 * 「そもそも呼ばれないこと」なので、偽物のままにしてある。）
 *
 * ⚠ **この仕掛けが効かない経路が 1 つある。** `detachFromCurrentRoom` は
 * `WsAdapter.handleClose` の `try/catch` の内側から呼ばれ、throw は
 * `logger.error("on-disconnect-error", ...)` へ吸われる（コールバックの失敗で
 * プロセス全体を落とさないための隔離であり、意図した設計である）。したがって
 * **`?tool=poker` を宣言して繋ぎ、1 通も送らずに閉じるだけのテストは緑のまま通る。**
 * 赤で気づけるのはメッセージを送った場合（`dispatch` / `sendError`）だけである。
 */
import {
  WsAdapter,
  type PokerMessageHandlers,
  type RawMessageHandler,
  type WsAdapterOptions,
} from "../../src/adapters/ws-adapter.js";
import type { TimerCommandReceiver } from "../../src/application/timer-command-receiver.js";
import type { Command } from "@tasuki/timer-core";

/** `config.ts` の既定と同じ値。ここを動かすと接続層のテストが本番とずれる。 */
const DEFAULT_MAX_MESSAGE_BYTES = 64 * 1024;
/** `config.ts` の `FRAME_BYTES_MULTIPLIER`（= 2）と同じ関係を保つ。 */
const DEFAULT_MAX_FRAME_BYTES = DEFAULT_MAX_MESSAGE_BYTES * 2;

/** 呼ばれたら失敗する poker のメッセージ層。「ここへ来るはずがない」を赤で示す。 */
export function unwiredPokerHandlers(): PokerMessageHandlers {
  const fail = (name: string): never => {
    throw new Error(
      `poker のメッセージ層（${name}）が呼ばれました。` +
        "接続層のテストは ?tool=poker で繋がない想定です（test/support/test-ws-adapter.ts）。",
    );
  };
  return {
    dispatch: () => fail("dispatch"),
    detachFromCurrentRoom: () => fail("detachFromCurrentRoom"),
    sendError: () => fail("sendError"),
  };
}

/**
 * 呼ばれたら失敗するハブのメッセージ層（#95 S5a）。「ここへ来るはずがない」を赤で示す。
 *
 * poker と同じ規律にしてある —— 既定を「何もしない」にすると、`/ws` へ繋いだ接続が
 * 黙って無視され、経路の取り違えがテストから見えなくなる。
 */
export function unwiredHubHandler(): RawMessageHandler {
  return {
    handleMessage: () => {
      throw new Error(
        "ハブのメッセージ層が呼ばれました。" +
          "接続層のテストは /ws へ繋がない想定です（test/support/test-ws-adapter.ts）。",
      );
    },
  };
}

/**
 * 呼ばれたら失敗するお題（topic）のメッセージ層（#91）。「ここへ来るはずがない」を赤で示す。
 *
 * ハブ・poker と同じ規律にしてある —— 既定を「何もしない」にすると、`?tool=topic` で
 * 繋いだ接続が黙って無視され、経路の取り違えがテストから見えなくなる。
 */
export function unwiredTopicHandler(): RawMessageHandler {
  return {
    handleMessage: () => {
      throw new Error(
        "お題（topic）のメッセージ層が呼ばれました。" +
          "接続層のテストは ?tool=topic で繋がない想定です（test/support/test-ws-adapter.ts）。",
      );
    },
  };
}

/**
 * 呼ばれたら失敗するルーレットのメッセージ層（#94）。「ここへ来るはずがない」を赤で示す。
 *
 * ハブ・poker・お題と同じ規律にしてある —— 既定を「何もしない」にすると、`?tool=roulette` で
 * 繋いだ接続が黙って無視され、経路の取り違えがテストから見えなくなる。
 */
export function unwiredRouletteHandler(): RawMessageHandler {
  return {
    handleMessage: () => {
      throw new Error(
        "ルーレットのメッセージ層が呼ばれました。" +
          "接続層のテストは ?tool=roulette で繋がない想定です（test/support/test-ws-adapter.ts）。",
      );
    },
  };
}

/**
 * 呼ばれたら失敗する進行タイマーのメッセージ層（#429）。「ここへ来るはずがない」を赤で示す。
 *
 * ルーレット等と同じ規律 —— 既定を「何もしない」にすると経路の取り違えが見えなくなる。
 */
export function unwiredAgendaHandler(): RawMessageHandler {
  return {
    handleMessage: () => {
      throw new Error(
        "進行タイマーのメッセージ層が呼ばれました。" +
          "接続層のテストは ?tool=agenda で繋がない想定です（test/support/test-ws-adapter.ts）。",
      );
    },
  };
}

/**
 * 呼ばれたら失敗するチェックインのメッセージ層（#406）。「ここへ来るはずがない」を赤で示す。
 *
 * 進行タイマー等と同じ規律 —— 既定を「何もしない」にすると経路の取り違えが見えなくなる。
 */
export function unwiredCheckinHandler(): RawMessageHandler {
  return {
    handleMessage: () => {
      throw new Error(
        "チェックインのメッセージ層が呼ばれました。" +
          "接続層のテストは ?tool=checkin で繋がない想定です（test/support/test-ws-adapter.ts）。",
      );
    },
  };
}

/**
 * 接続層のテストが渡す timer のメッセージ層（正規化の受け口のブランドを持たない、ただの関数）。
 *
 * 本番は `createTimerCommandReceiver` が作った受け口しか渡せない（`WsAdapterOptions.timer` の型）。
 * 接続層のテストが見たいのは**接続層が渡した値と、メッセージ層の失敗（同期の throw・reject）の扱い**なので、
 * 本物の受け口（async で包むので同期の throw が reject に変わる）を挟まず、ここでブランドだけを付ける。
 */
export type TestTimerHandler = { handleMessage(connId: string, cmd: Command): Promise<void> };

/** 必須オプションのうち、接続層のテストが関心を持たない 6 つだけを任意にし、timer を素の関数で受けるもの。 */
export type TestWsAdapterOptions = Omit<
  WsAdapterOptions,
  "maxMessageBytes" | "maxFrameBytes" | "poker" | "hub" | "topic" | "roulette" | "agenda" | "checkin" | "timer"
> & { timer: TestTimerHandler } &
  Partial<
    Pick<
      WsAdapterOptions,
      "maxMessageBytes" | "maxFrameBytes" | "poker" | "hub" | "topic" | "roulette" | "agenda" | "checkin"
    >
  >;

export function newTestWsAdapter(options: TestWsAdapterOptions): WsAdapter {
  return new WsAdapter({
    ...options,
    timer: options.timer as TimerCommandReceiver,
    maxMessageBytes: options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES,
    maxFrameBytes: options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES,
    poker: options.poker ?? unwiredPokerHandlers(),
    hub: options.hub ?? unwiredHubHandler(),
    topic: options.topic ?? unwiredTopicHandler(),
    roulette: options.roulette ?? unwiredRouletteHandler(),
    agenda: options.agenda ?? unwiredAgendaHandler(),
    checkin: options.checkin ?? unwiredCheckinHandler(),
  });
}
