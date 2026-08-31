import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  isKnownErrorCode,
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

/** 入れ子のすべての層を持つ room-state（前方互換の検査で層ごとに壊すための土台）。 */
const A_REVEALED_ROOM_STATE = {
  type: 'room-state',
  roomId: 'a1b2c3d4',
  you: 'p1',
  participants: [{ id: 'p1', name: 'たろう', isHost: true, connected: true, hasVoted: true }],
  round: {
    status: 'revealed',
    votes: [{ participantId: 'p1', card: { kind: 'number', value: 5 } }],
    stats: { average: 5, modes: [{ kind: 'number', value: 5 }] },
  },
  yourVote: { kind: 'number', value: 5 },
} as const;

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

  // --- error フレームの前方互換（#214 / docs/poker/adr/0003 決定 1）---
  //
  // サーバーが新しい code を返したり、error に任意フィールドを足したりしても、
  // 古いバンドルはフレームを捨ててはならない。捨てると `error` を唯一の引き金にしている
  // 消えたルームの案内（#76 J-1）と入室の自動再試行（#147）が死ぬ。

  it('正常系: ERROR_CODES に無いコードを持つ error も通す（前方互換）', () => {
    // Given: サーバーが ERROR_CODES を増やし、ブラウザは古いバンドルを掴んでいる
    const raw = JSON.stringify({ type: 'error', code: 'room-closed', message: 'ルームは終了しました' });
    // When
    const result = parseServerMessage(raw);
    // Then
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      type: 'error',
      code: 'room-closed',
      message: 'ルームは終了しました',
    });
  });

  it('正常系: error に余剰キーがあっても通し、余剰キーは画面へ運ばない', () => {
    // Given: サーバーが error に任意フィールドを足した
    const raw = JSON.stringify({
      type: 'error',
      code: 'room-not-found',
      message: 'ルームが見つかりません',
      retryAfterMs: 1000,
    });
    // When
    const result = parseServerMessage(raw);
    // Then: 通る（これが無いと room-not-found の専用画面が出なくなる）
    expect(result.isOk()).toBe(true);
    // 検証していない値を画面へ渡さない（憲法 原則 IV）
    expect(result._unsafeUnwrap()).toEqual({
      type: 'error',
      code: 'room-not-found',
      message: 'ルームが見つかりません',
    });
  });

  it('異常系: 空の code を持つ error は err になる（意味を持たない値は通さない）', () => {
    // When
    const result = parseServerMessage(JSON.stringify({ type: 'error', code: '', message: 'x' }));
    // Then
    expect(result.isErr()).toBe(true);
  });

  // --- 厳格さが error の外へ漏れていないことの対照（docs/poker/adr/0003 決定 1）---
  //
  // 緩めるのは error だけである。joined / room-state は画面の描画に使う値を運ぶため
  // strictObject のまま保つ（前方互換にするかは #216 で別に決める）。

  // --- サーバー→クライアントの前方互換（#216 / docs/poker/adr/0004）---
  //
  // **7 層すべてが strictObject だったので、トップだけ緩めても前方互換にならなかった。**
  // room-state を捨てると画面は生きて見えたまま古い状態で固まる（adr/0002 背景）。

  it.each<[string, Record<string, unknown>]>([
    ['① room-state 直下', { ...A_REVEALED_ROOM_STATE, serverTime: 1 }],
    [
      '② participants[] の要素',
      {
        ...A_REVEALED_ROOM_STATE,
        participants: [{ ...A_REVEALED_ROOM_STATE.participants[0], avatar: 'x' }],
      },
    ],
    [
      '③ round',
      { ...A_REVEALED_ROOM_STATE, round: { ...A_REVEALED_ROOM_STATE.round, elapsedMs: 1 } },
    ],
    [
      '④ round.stats',
      {
        ...A_REVEALED_ROOM_STATE,
        round: {
          ...A_REVEALED_ROOM_STATE.round,
          stats: { ...A_REVEALED_ROOM_STATE.round.stats, median: 5 },
        },
      },
    ],
    [
      '⑤ round.votes[] の要素',
      {
        ...A_REVEALED_ROOM_STATE,
        round: {
          ...A_REVEALED_ROOM_STATE.round,
          votes: [{ ...A_REVEALED_ROOM_STATE.round.votes[0], at: 1 }],
        },
      },
    ],
    [
      '⑦ joined 直下',
      { type: 'joined', roomId: 'a1b2c3d4', participantId: 'p1', token: 'tok-1', serverTime: 1 },
    ],
    // **`round` は枝が 2 つある。** 上の ③ は revealed 枝しか通らないので、
    // voting 枝を strict に戻しても全件緑のままだった（2026-08-31 に実測）。
    // **ルームは公開前のほとんどの時間を voting で過ごす**ので、そちらが落ちると
    // 本番では常時「画面が固まる」側になる。
    [
      '⑧ round（voting 枝）',
      {
        type: 'room-state',
        roomId: 'a1b2c3d4',
        you: 'p1',
        participants: [{ id: 'p1', name: 'たろう', isHost: true, connected: true, hasVoted: false }],
        round: { status: 'voting', elapsedMs: 1 },
        yourVote: null,
      },
    ],
  ])('正常系: %s に余剰キーがあっても通す（前方互換）', (_label, msg) => {
    const result = parseServerMessage(JSON.stringify(msg));
    expect(result.isOk()).toBe(true);
  });

  /**
   * **「通る」だけでなく「何が通ったか」を見る。**
   * `v.looseObject`（未知キーを出力に残す）へ書き換えられても、通るかどうかだけでは
   * 気づけない。検証していない値を画面へ渡さないのは憲法 原則 IV の要求である。
   */
  it('正常系: 通した余剰キーは画面へ運ばない（どの層に足しても落ちる）', () => {
    // Given: room-state が持つ 5 つの層すべてに余剰キーを足す
    //        （card には足さない —— あちらは緩めていない。joined は別のフレーム）
    const raw = JSON.stringify({
      ...A_REVEALED_ROOM_STATE,
      serverTime: 1,
      participants: [{ ...A_REVEALED_ROOM_STATE.participants[0], avatar: 'x' }],
      round: {
        ...A_REVEALED_ROOM_STATE.round,
        elapsedMs: 1,
        stats: { ...A_REVEALED_ROOM_STATE.round.stats, median: 5 },
        votes: [{ ...A_REVEALED_ROOM_STATE.round.votes[0], at: 1 }],
      },
    });
    // When
    const result = parseServerMessage(raw);
    // Then: 宣言したフィールドだけが残る
    //       （前提のガードは置かない。落ちていれば _unsafeUnwrap が throw する。ADR-0006 決定 6）
    expect(result._unsafeUnwrap()).toEqual(A_REVEALED_ROOM_STATE);
  });

  // --- 緩めていないものの対照（docs/poker/adr/0004 決定 2・3）---

  /**
   * **カードは値の集合そのものが契約である。** 新しい `kind` は緩めても `v.variant` が
   * 落とすので前方互換にならず、`vote`（クライアント→サーバー）と共有している以上、
   * 緩めれば外部入力の検証まで緩む。
   */
  it('対照: card は余剰キーがあると err のまま（緩めていない）', () => {
    // Given: カードに、契約が宣言していないキーを足す
    const raw = JSON.stringify({
      ...A_REVEALED_ROOM_STATE,
      yourVote: { kind: 'number', value: 5, label: '5' },
    });
    // When
    const result = parseServerMessage(raw);
    // Then
    expect(result.isErr()).toBe(true);
  });

  /**
   * **判別子の枝は前方互換にできない。** これは `card` に限らない ——
   * `ServerMessageSchema` の `type` も `RoundViewSchema` の `status` も同じ
   * `v.variant` で、知らない値が来れば捨てる（`docs/poker/adr/0004` 決定 2）。
   */
  it.each<[string, Record<string, unknown>]>([
    ['card の kind', { yourVote: { kind: 'tshirt', size: 'M' } }],
    ['round の status', { round: { status: 'countdown' } }],
    ['フレームの type', { type: 'presence' }],
  ])('対照: 未知の %s は通らない（値を知らなければ描けない）', (_label, override) => {
    // Given: 判別子に、こちらが知らない値を載せる
    const raw = JSON.stringify({ ...A_REVEALED_ROOM_STATE, ...override });
    // When
    const result = parseServerMessage(raw);
    // Then
    expect(result.isErr()).toBe(true);
  });
});

describe('isKnownErrorCode', () => {
  it.each<ErrorCode>([...ERROR_CODES])('既知のコード %s を既知と判定する', (code) => {
    expect(isKnownErrorCode(code)).toBe(true);
  });

  it.each<string>(['room-closed', '', 'ROOM_NOT_FOUND', 'room-not-found '])(
    '未知のコード %s を既知と判定しない',
    (code) => {
      expect(isKnownErrorCode(code)).toBe(false);
    },
  );
});
