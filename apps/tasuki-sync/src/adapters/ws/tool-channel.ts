/**
 * ツールごとの受け口（#368 Task 7。`ws-adapter.ts` の 4 つの `handleXMessage` と poker の受け口を分けた）。
 *
 * 受け口は「大きさの上限 → 解析 → 渡す先 → 失敗の隔離とエラーフレーム」の 1 本の流れである。
 * hub・topic・roulette・timer の 4 つは同じ形で、違いは spec（{@link TextChannelSpec}）で渡す。
 * **新しいツールを足すときに書くのは spec 1 つと、WS アダプタの表の 1 行である**（開放閉鎖）。
 *
 * poker だけは形が違うので {@link createPokerChannel} に分けてある（接続そのものを渡す・エラーは
 * メッセージ層の `sendError` で返す・同期の失敗では 1011 で閉じる・受理と切断を自分で持つ）。
 *
 * ## 例外の隔離（全ての受け口で同じ理由）
 *
 * メッセージ層は型上 `Promise<void>` を返す契約だが、実装が async でなければ同期的に throw しうる
 * （型は実行時の保証にはならない。`.catch` は reject しか拾わない）。呼び出し自体を `try/catch` で
 * 囲んで別途隔離しないと、同期 throw が Bun の websocket ハンドラを抜けて `uncaughtException` に達し、
 * `server.ts` が `process.exit(1)` して**同じプロセスに載る他のツールのルームも道連れで消える**
 * （揮発インメモリ）。
 */
import type { Result } from "neverthrow";
import { parseClientMessage } from "@tasuki/poker-core";
import type { Logger } from "../../application/log/logger.js";
import type { PokerHandlers } from "../../application/poker-handlers.js";
import { CONNECTION_ERROR_TEXT } from "../../application/connection-errors.js";
import { isPokerSocket, type Socket } from "./connection-data.js";
import { classifyError } from "./error-log.js";
import { sendIfOpen } from "./ws-send.js";

/**
 * WS アダプタが poker のメッセージ層に求めるものだけ
 * （残りのハンドラはここを通らない）。統合前の
 * `apps/poker-sync/src/adapters/ws-adapter.ts` の `WsAdapterHandlers` と同じ絞り込み。
 */
export type PokerMessageHandlers = Pick<PokerHandlers, "dispatch" | "detachFromCurrentRoom" | "sendError">;

/** 受け口。WS アダプタは「プロトコル → 受け口」の表から引いて呼ぶ。 */
export interface ToolChannel {
  /** 1 通を受ける。`bytes` はバイト数で測った大きさ（Bun はテキストを string で渡すので、文字数ではない）。 */
  receive(ws: Socket, raw: string | Buffer, bytes: number): void;
  /**
   * 受理を接続層の `onConnect` へ知らせるか。**知らせない受け口は poker だけ**
   * （poker のレート制限の鍵は `ws.data.rateKey` から直接読む）。
   *
   * ⚠ **お題（topic）・ルーレット（roulette）を false にしてはならない**（#91 spec §5.3 の MUST・#94 spec §5.2）。
   * `onConnect` が呼ばれないと `rateLimitGate.open` が接続とクライアント鍵を結ばず、鍵は接続 ID へ落ちる。
   * すると `ai.unlock` や `room.join` の総当たりが**張り直すだけで**枠を回避できる（2026-09-23 のレビュー）。
   */
  readonly notifiesConnect: boolean;
  /**
   * 切断の後始末を受け口が自分で持つときだけ置く（poker）。無ければ接続層の `onDisconnect` を呼ぶ。
   * 呼び出し元（WS アダプタ）が例外を隔離する。
   */
  readonly closed?: (ws: Socket) => void;
}

/** {@link createTextChannel} の違いの部分。`Payload` は渡す先が受ける型、`Frame` はこの受け口のエラーフレームの型。 */
export interface TextChannelSpec<Payload, Frame> {
  readonly maxMessageBytes: number;
  readonly logger: Logger;
  /** 本文の解析。失敗なら、その場で返すエラーフレーム。 */
  readonly parse: (text: string) => Result<Payload, Frame>;
  /** 渡す先（メッセージ層）。 */
  readonly deliver: (connId: string, payload: Payload) => Promise<void>;
  /** 大きさの上限を超えたときに返すフレーム。 */
  readonly tooLargeFrame: Frame;
  /** 渡す先が失敗したときに返すフレーム。 */
  readonly internalErrorFrame: Frame;
}

/**
 * hub・topic・roulette・timer の受け口を作る。
 *
 * 大きすぎるフレームはパーサへ渡さない。超過は接続を保ったままエラーフレームで返す
 * （再送で回復できる種類の失敗のため）。
 */
export function createTextChannel<Payload, Frame>(spec: TextChannelSpec<Payload, Frame>): ToolChannel {
  const reply = (ws: Socket, frame: Frame): void => sendIfOpen(ws, JSON.stringify(frame));
  return {
    notifiesConnect: true,
    receive(ws, raw, bytes) {
      if (bytes > spec.maxMessageBytes) {
        reply(ws, spec.tooLargeFrame);
        return;
      }
      const parsed = spec.parse(raw.toString());
      if (parsed.isErr()) {
        reply(ws, parsed.error);
        return;
      }
      try {
        spec.deliver(ws.data.connId, parsed.value).catch((err: unknown) => {
          spec.logger.error("on-message-error", { name: classifyError(err) });
          reply(ws, spec.internalErrorFrame);
        });
      } catch (err) {
        spec.logger.error("on-message-error", { name: classifyError(err) });
        reply(ws, spec.internalErrorFrame);
      }
    },
  };
}

/**
 * poker の受け口（サイズ判定・パース・ディスパッチ）。
 *
 * **本体を `try/catch` で隔離する。** poker のハンドラは同期に throw しうる。
 * 統合前はそれで死ぬのは poker のプロセスだけだったが、**統合後は同じ 1 プロセスに
 * 載っている timer のルームも道連れになる**。
 *
 * **エラーフレームは返さず、接続を 1011 で閉じる。** poker の `ERROR_CODES`
 * （`packages/poker-core/src/protocol.ts`）に「内部エラー」に当たるコードが無く、
 * 足すのは wire の契約の変更になる（`docs/poker/adr/0003` 決定 4「送信側は縛ったまま」）。
 * 一方、**黙って開いたままにするのは統合前より悪い**。統合前はプロセスが落ちて
 * クライアントが切断を観測し再接続していたが、`apps/poker-web/src/hooks/useSync.ts`
 * にコマンド単位のタイムアウトは無いため（再接続のバックオフだけ）、応答も切断も
 * 無ければ画面は永久に待つ。1011（Internal Error）は WebSocket の標準の close コードで、
 * **新しい wire のコードを足さずに「何かが起きた」ことだけを伝えられる**。
 * この接続だけが閉じ、同じプロセスに載る timer のルームには波及しない。
 *
 * ⚠ **超過の返し方は timer たちと違う**（`message-too-large`。`@tasuki/poker-core` の ErrorCode で、
 * wire に載る値）。片方へ寄せると相手の web が知らないコードを受け取る。文は同じ正本から取る。
 */
export function createPokerChannel(handlers: PokerMessageHandlers, maxMessageBytes: number, logger: Logger): ToolChannel {
  return {
    notifiesConnect: false,
    receive(ws, raw, bytes) {
      // 表は protocol で引くので poker の接続しか来ない。型を絞るための確かめである。
      if (!isPokerSocket(ws)) return;
      try {
        if (bytes > maxMessageBytes) {
          // 接続は保つ（切断ではなくエラー応答）。再送で回復できる種類の失敗のため。
          handlers.sendError(ws, "message-too-large", CONNECTION_ERROR_TEXT.MESSAGE_TOO_LARGE);
          return;
        }
        const result = parseClientMessage(String(raw));
        if (result.isErr()) {
          handlers.sendError(ws, result.error.code, result.error.message);
          return;
        }
        handlers.dispatch(ws, result.value);
      } catch (err) {
        logger.error("on-message-error", { name: classifyError(err) });
        // 閉じるのは**この接続だけ**。close 自体が throw しても巻き込まない。
        try {
          ws.close(1011, "Internal error");
        } catch (closeErr) {
          logger.error("on-message-error", { name: classifyError(closeErr) });
        }
      }
    },
    // poker はルーム離脱の後始末をメッセージ層が持つ（timer は presence 管理が持つ）。
    closed(ws) {
      if (isPokerSocket(ws)) handlers.detachFromCurrentRoom(ws);
    },
  };
}
