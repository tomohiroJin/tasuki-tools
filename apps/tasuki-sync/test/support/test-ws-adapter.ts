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
 * **`/poker/ws` へ繋いで 1 通も送らずに閉じるだけのテストは緑のまま通る。**
 * 赤で気づけるのはメッセージを送った場合（`dispatch` / `sendError`）だけである。
 */
import { WsAdapter, type PokerMessageHandlers, type WsAdapterOptions } from "../../src/adapters/ws-adapter.js";

/** `config.ts` の既定と同じ値。ここを動かすと接続層のテストが本番とずれる。 */
const DEFAULT_MAX_MESSAGE_BYTES = 64 * 1024;
/** `config.ts` の `FRAME_BYTES_MULTIPLIER`（= 2）と同じ関係を保つ。 */
const DEFAULT_MAX_FRAME_BYTES = DEFAULT_MAX_MESSAGE_BYTES * 2;

/** 呼ばれたら失敗する poker のメッセージ層。「ここへ来るはずがない」を赤で示す。 */
export function unwiredPokerHandlers(): PokerMessageHandlers {
  const fail = (name: string): never => {
    throw new Error(
      `poker のメッセージ層（${name}）が呼ばれました。` +
        "接続層のテストは /poker/ws へ繋がない想定です（test/support/test-ws-adapter.ts）。",
    );
  };
  return {
    dispatch: () => fail("dispatch"),
    detachFromCurrentRoom: () => fail("detachFromCurrentRoom"),
    sendError: () => fail("sendError"),
  };
}

/** 必須オプションのうち、接続層のテストが関心を持たない 3 つだけを任意にしたもの。 */
export type TestWsAdapterOptions = Omit<
  WsAdapterOptions,
  "maxMessageBytes" | "maxFrameBytes" | "poker"
> &
  Partial<Pick<WsAdapterOptions, "maxMessageBytes" | "maxFrameBytes" | "poker">>;

export function newTestWsAdapter(options: TestWsAdapterOptions): WsAdapter {
  return new WsAdapter({
    ...options,
    maxMessageBytes: options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES,
    maxFrameBytes: options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES,
    poker: options.poker ?? unwiredPokerHandlers(),
  });
}
