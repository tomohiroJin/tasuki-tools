/**
 * **送信側は `ERROR_CODES` に縛ったまま**であることを型で固定する
 * （#214・`docs/poker/adr/0003` 決定 4）。
 *
 * 受信の契約（`ServerMessage`）は前方互換のため `code` を任意の非空文字列まで広げた。
 * その広さが送信側へ漏れると、**綴りを誤った `code` が型検査を通ってしまう**。
 * `Broadcaster.sendTo` が受け取るのは `OutboundServerMessage` で、そちらは
 * `ErrorCode` のままである。
 *
 * ここは実行時の振る舞いではなく**型**を見ているので、赤くなるのは `tsc` である
 * （`@ts-expect-error` は、その行にエラーが無いときにエラーになる）。
 *
 * @requirements #214
 */
import { describe, expect, it } from 'bun:test';
import type { ErrorCode, OutboundServerMessage, ServerMessage } from '@tasuki/poker-core';

describe('サーバーが送ってよいメッセージの型', () => {
  it('既知の code は送れる', () => {
    const msg: OutboundServerMessage = {
      type: 'error',
      code: 'room-not-found',
      message: 'ルームが見つかりません',
    };
    expect(msg.type).toBe('error');
  });

  it('綴りを誤った code は型検査で落ちる', () => {
    const msg: OutboundServerMessage = {
      type: 'error',
      // @ts-expect-error 'rom-not-found' は ERROR_CODES に無い（決定 4: 送信側は縛ったまま）
      code: 'rom-not-found',
      message: 'x',
    };
    expect(msg.type).toBe('error');
  });

  /**
   * **受信側は広いままであること。** ここが狭まると前方互換が失われ、
   * サーバーが code を増やした瞬間に古いバンドルがフレームを捨てるようになる。
   */
  it('受信側の型は未知の code も受け取れる', () => {
    const received: ServerMessage = { type: 'error', code: 'room-closed', message: 'x' };
    expect(received.type).toBe('error');
  });

  it('ErrorCode は ERROR_CODES の合併のままである', () => {
    const code: ErrorCode = 'rate-limited';
    expect(code).toBe('rate-limited');
  });
});
