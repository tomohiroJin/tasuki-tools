/**
 * 接続ごとに持ち回る値（#368 Task 7。`ws-adapter.ts` から分けた）。
 *
 * 受け口（`tool-channel.ts`）と WS アダプタの両方が使うので、どちらにも依存しない置き場に出した。
 */
import type { Protocol } from "./connection-gate.js";

/**
 * すべての接続が持つ値。
 * `connId` は入場の判定（`connection-gate.ts`）を通ってから採番するため、それまでは空文字。
 * 空のまま閉じた接続は「受け入れていない接続」なので onDisconnect を呼ばない。
 */
interface ConnectionBase {
  connId: string;
  origin: string;
  /** `X-Forwarded-For` から導いた鍵。特定できなければ null。 */
  clientKey: string | null;
  /** レート制限の鍵（クライアント鍵。特定できなければ接続 ID）。受理まで空文字。 */
  rateKey: string;
}

/**
 * どのメッセージ層へ渡すかと、その層だけが持つ値（#95 S5c）。
 *
 * **S4b までは 3 つの項目（`rateKey` / `participantId` / `roomId`）を全接続が持ち回っていた。**
 * 統合前の poker が同じ 3 つを持っており、`HandlerConnection`
 * （`application/poker-handlers.ts`）が構造的にこれを要求するためである。timer 側は
 * `participantId` / `roomId` を読み書きしない。**この段で入口が `/ws` 1 本になり、
 * `protocol` の決まり方そのものが変わったので、割り方もここで決めた。**
 *
 * `"hub"` は選択画面（#95 S5a）。**在席の宣言もここで決まる** —— ハブの接続はどのツールも
 * 宣言しない（`tool: null`）ので、ツールの参加者一覧には出ない。
 * `"unknown"` は許可リストに無い `?tool=` の値。入場の判定が 1008 で閉じる。
 */
type ToolContext =
  | { readonly protocol: Exclude<Protocol, "poker"> }
  | { readonly protocol: "poker"; participantId: string | null; roomId: string | null };

export type ConnectionData = ConnectionBase & ToolContext;

export type Socket = Bun.ServerWebSocket<ConnectionData>;

/** poker の枝だけに絞った {@link Socket}。{@link isPokerSocket} が絞り込みに使う。 */
export type PokerSocket = Bun.ServerWebSocket<Extract<ConnectionData, { protocol: "poker" }>>;

/**
 * `ws.data.protocol === "poker"` を型ガードとして使うための関数（#95 S5c）。
 *
 * **`ws.data.protocol === "poker"` という条件式そのものは `ws`（`Socket` =
 * `Bun.ServerWebSocket<ConnectionData>`）を絞り込まない。** TypeScript はプロパティ
 * アクセス式 `ws.data` の型は絞り込むが、ジェネリックで実体化した `ws` 自体の型までは
 * 絞り込まないため、`poker.dispatch` 等が要求する `HandlerConnection`
 * （`data.participantId` / `data.roomId` を無条件に持つ）へそのまま渡せない
 * （実測: `tsc` はここで `Socket` を `PokerSocket` に代入できないと報告する）。
 * 型ガード関数として明示すれば、`ws` そのものを `PokerSocket` へ絞り込める。
 */
export function isPokerSocket(ws: Socket): ws is PokerSocket {
  return ws.data.protocol === "poker";
}

/** 入口で作る、受理前の値（poker の枝だけが participantId / roomId を持つ）。 */
export function initialConnectionData(protocol: Protocol, origin: string, clientKey: string | null): ConnectionData {
  const base = { connId: "", origin, clientKey, rateKey: "" };
  return protocol === "poker" ? { ...base, protocol, participantId: null, roomId: null } : { ...base, protocol };
}
