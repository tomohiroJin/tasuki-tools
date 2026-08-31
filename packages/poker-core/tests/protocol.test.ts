import { describe, expect, it } from 'vitest';
import {
  parseClientMessage,
  parseServerMessage,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from '../src/protocol';

describe('parseClientMessage', () => {
  it.each<[string, ClientMessage]>([
    ['create-room', { type: 'create-room', name: 'たろう' }],
    ['join-room（token なし）', { type: 'join-room', roomId: 'a1b2c3d4', name: 'はなこ' }],
    [
      'join-room（token あり）',
      { type: 'join-room', roomId: 'a1b2c3d4', name: 'はなこ', token: 'tok-1' },
    ],
    ['vote（数値）', { type: 'vote', card: { kind: 'number', value: 5 } }],
    ['vote（☕）', { type: 'vote', card: { kind: 'coffee' } }],
    ['reveal', { type: 'reveal' }],
    ['next-round', { type: 'next-round' }],
  ])('正常系: %s をパースできる', (_label, msg) => {
    const result = parseClientMessage(JSON.stringify(msg));
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(msg);
  });

  it.each<[string, string]>([
    ['JSON でない', 'not-json{{'],
    ['type が未知', JSON.stringify({ type: 'hack' })],
    ['create-room の name 欠落', JSON.stringify({ type: 'create-room' })],
    ['vote のカード値がデッキ外', JSON.stringify({ type: 'vote', card: { kind: 'number', value: 4 } })],
    ['vote の kind が不正', JSON.stringify({ type: 'vote', card: { kind: 'joker' } })],
    ['オブジェクトでない', JSON.stringify('reveal')],
  ])('異常系: %s は err になる', (_label, raw) => {
    const result = parseClientMessage(raw);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('invalid-message');
  });
});

describe('parseServerMessage', () => {
  it.each<[string, ServerMessage]>([
    [
      'joined',
      { type: 'joined', roomId: 'a1b2c3d4', participantId: 'p1', token: 'tok-1' },
    ],
    [
      'room-state（voting）',
      {
        type: 'room-state',
        roomId: 'a1b2c3d4',
        you: 'p1',
        participants: [
          { id: 'p1', name: 'たろう', isHost: true, connected: true, hasVoted: false },
        ],
        round: { status: 'voting' },
        yourVote: null,
      },
    ],
    [
      'room-state（revealed）',
      {
        type: 'room-state',
        roomId: 'a1b2c3d4',
        you: 'p1',
        participants: [
          { id: 'p1', name: 'たろう', isHost: true, connected: true, hasVoted: true },
        ],
        round: {
          status: 'revealed',
          votes: [{ participantId: 'p1', card: { kind: 'number', value: 5 } }],
          stats: { average: 5, modes: [{ kind: 'number', value: 5 }] },
        },
        yourVote: { kind: 'number', value: 5 },
      },
    ],
    ['error', { type: 'error', code: 'room-not-found', message: 'ルームが見つかりません' }],
  ])('正常系: %s をパースできる', (_label, msg) => {
    const result = parseServerMessage(JSON.stringify(msg));
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(msg);
  });

  it('異常系: 未知の type は err になる', () => {
    const result = parseServerMessage(JSON.stringify({ type: 'nope' }));
    expect(result.isErr()).toBe(true);
  });

  // 接続・フレーム層の防御が返すコード（Issue #63）。
  // 利用者の入力ミス（invalid-message）とサーバー側の事情を区別するために分けている。
  it.each<[string, ErrorCode]>([
    ['メッセージが大きすぎる', 'message-too-large'],
    ['サーバーが混雑している', 'server-busy'],
  ])('正常系: %s を表す error をパースできる', (message, code) => {
    const msg = { type: 'error' as const, code, message };
    const result = parseServerMessage(JSON.stringify(msg));
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(msg);
  });

  it('異常系: ERROR_CODES に無いコードは err になる（画面が知らないコードを受け取らない）', () => {
    // Given: 未知の code を含むメッセージを渡す呼び出し自体が前提の指定を兼ねる
    // When
    const result = parseServerMessage(
      JSON.stringify({ type: 'error', code: 'made-up', message: 'x' }),
    );
    // Then
    expect(result.isErr()).toBe(true);
  });
});


/**
 * 落ちた項目の**経路**を利用側へ運ぶ（#212）。
 *
 * poker-web は、捨てたフレームが画面を古くするもの（`room-state` / `joined`）
 * だったのか、一過性のもの（`error`）だったのかを、この経路で判別する。
 * `code` と `message` だけでは区別できない。
 *
 * **サーバーの応答には載らない。** `apps/poker-sync` の WS アダプタは
 * `code` と `message` だけを取り出して返す。
 *
 * @requirements #212
 */
describe('ProtocolError が運ぶ経路', () => {
  it('Given room-state の項目が壊れたフレーム / When 解析する / Then その項目の経路を返す', () => {
    // Given
    const raw = JSON.stringify({
      type: 'room-state',
      roomId: 'r1',
      you: 'p1',
      participants: [{ id: 'p1', name: 1, isHost: true, connected: true, hasVoted: false }],
      round: { status: 'voting' },
      yourVote: null,
    });
    // When
    const result = parseServerMessage(raw);
    // Then
    expect(result._unsafeUnwrapErr().paths).toContain('participants.0.name');
  });

  it('Given error の項目が壊れたフレーム / When 解析する / Then error 固有の項目だけを返す', () => {
    // Given: code が未知のエラーフレーム
    // When: 解析する
    const result = parseServerMessage(JSON.stringify({ type: 'error', code: 'nope', message: 'm' }));
    // Then
    expect(result._unsafeUnwrapErr().paths).toEqual(['code']);
  });

  it('Given JSON として読めないテキスト / When 解析する / Then 根で落ちたことを返す', () => {
    // Given: JSON として読めないテキスト
    // When: 解析する
    const result = parseServerMessage('{ 壊れている');
    // Then
    expect(result._unsafeUnwrapErr().paths).toEqual(['<root>']);
  });
});
