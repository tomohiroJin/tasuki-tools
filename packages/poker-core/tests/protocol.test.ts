import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  isKnownErrorCode,
  parseClientMessage,
  parseServerMessage,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from '../src/protocol.js';

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
  participants: [{ id: 'p1', name: 'たろう', connected: true, hasVoted: true, spectator: false }],
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
          { id: 'p1', name: 'たろう', connected: true, hasVoted: false, spectator: false },
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
          { id: 'p1', name: 'たろう', connected: true, hasVoted: true, spectator: false },
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
        participants: [{ id: 'p1', name: 'たろう', connected: true, hasVoted: false, spectator: false }],
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

describe('parseClientMessage（見積もりの記録 #93）', () => {
  it('set-item は 120 字まで通り、121 字は落ちる', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'set-item', item: 'あ'.repeat(120) })).isOk()).toBe(true);
    const over = parseClientMessage(JSON.stringify({ type: 'set-item', item: 'あ'.repeat(121) }));
    expect(over.isErr()).toBe(true);
    expect(over._unsafeUnwrapErr().code).toBe('invalid-message');
  });

  it('set-item は前後の空白を除いた長さで見る（空白つき 120 字は通る）', () => {
    const padded = `  ${'あ'.repeat(120)}  `;
    const parsed = parseClientMessage(JSON.stringify({ type: 'set-item', item: padded }));
    expect(parsed.isOk()).toBe(true);
    expect(parsed._unsafeUnwrap()).toEqual({ type: 'set-item', item: 'あ'.repeat(120) });
  });

  it('next-item の points は 5 と null を通し、4 と文字列の 5 を落とす', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'next-item', points: 5 })).isOk()).toBe(true);
    expect(parseClientMessage(JSON.stringify({ type: 'next-item', points: null })).isOk()).toBe(true);
    expect(parseClientMessage(JSON.stringify({ type: 'next-item', points: 4 })).isErr()).toBe(true);
    expect(parseClientMessage(JSON.stringify({ type: 'next-item', points: '5' })).isErr()).toBe(true);
  });

  it('set-points は正の整数の groupId だけを通す', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'set-points', groupId: 1, points: 8 })).isOk()).toBe(true);
    expect(parseClientMessage(JSON.stringify({ type: 'set-points', groupId: 2, points: null })).isOk()).toBe(true);
    expect(parseClientMessage(JSON.stringify({ type: 'set-points', groupId: 0, points: 8 })).isErr()).toBe(true);
    expect(parseClientMessage(JSON.stringify({ type: 'set-points', groupId: 1.5, points: 8 })).isErr()).toBe(true);
  });

  it('revote を通し、未知のキーを足すと落ちる（strictObject）', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'revote' })).isOk()).toBe(true);
    expect(parseClientMessage(JSON.stringify({ type: 'revote', extra: 1 })).isErr()).toBe(true);
  });
});

describe('parseServerMessage（estimate #93）', () => {
  const ESTIMATE = {
    item: 'ログイン画面',
    log: [
      {
        id: 1,
        item: 'ログイン画面',
        points: null,
        open: true,
        entries: [{ attempt: 1, at: 1000, counts: [{ card: { kind: 'number', value: 5 }, count: 2 }] }],
      },
    ],
  };

  it('estimate の無い room-state を通す', () => {
    const result = parseServerMessage(JSON.stringify(A_REVEALED_ROOM_STATE));
    expect(result.isOk()).toBe(true);
    expect('estimate' in result._unsafeUnwrap()).toBe(false);
  });

  it('estimate を持つ room-state を通し、未知のキーは無視する', () => {
    const msg = {
      ...A_REVEALED_ROOM_STATE,
      estimate: { ...ESTIMATE, future: 1, log: [{ ...ESTIMATE.log[0], future: 2 }] },
    };
    const result = parseServerMessage(JSON.stringify(msg));
    expect(result.isOk()).toBe(true);
    const parsed = result._unsafeUnwrap();
    expect(parsed.type === 'room-state' && parsed.estimate).toEqual({ ...ESTIMATE, recording: true });
  });

  it('estimate の形が壊れていれば落とす', () => {
    const msg = { ...A_REVEALED_ROOM_STATE, estimate: { item: 1, log: [] } };
    expect(parseServerMessage(JSON.stringify(msg)).isErr()).toBe(true);
  });

  it('estimate-not-found / estimate-open は既知のコード', () => {
    expect(isKnownErrorCode('estimate-not-found')).toBe(true);
    expect(isKnownErrorCode('estimate-open')).toBe(true);
  });
});

describe('parseClientMessage（見学 #419）', () => {
  it('set-spectator は真偽値だけを通し、真偽以外と余分なキーを落とす', () => {
    const parse = (o: unknown) => parseClientMessage(JSON.stringify(o));
    expect(parse({ type: 'set-spectator', spectator: true })._unsafeUnwrap()).toEqual({
      type: 'set-spectator',
      spectator: true,
    });
    expect(parse({ type: 'set-spectator', spectator: false }).isOk()).toBe(true);
    expect(parse({ type: 'set-spectator', spectator: 'true' }).isErr()).toBe(true);
    expect(parse({ type: 'set-spectator' }).isErr()).toBe(true);
    expect(parse({ type: 'set-spectator', spectator: true, extra: 1 }).isErr()).toBe(true);
  });

  it('remove-participant は空でない participantId だけを通す', () => {
    const parse = (o: unknown) => parseClientMessage(JSON.stringify(o));
    expect(parse({ type: 'remove-participant', participantId: 'p1' }).isOk()).toBe(true);
    expect(parse({ type: 'remove-participant', participantId: '' }).isErr()).toBe(true);
    expect(parse({ type: 'remove-participant' }).isErr()).toBe(true);
    expect(parse({ type: 'remove-participant', participantId: 'p1', extra: 1 }).isErr()).toBe(true);
  });

  it.each(['spectating', 'participant-not-found', 'not-removable'])('%s は既知のエラーコード', (code) => {
    expect(isKnownErrorCode(code)).toBe(true);
  });
});

describe('parseServerMessage（spectator #419）', () => {
  const base = {
    type: 'room-state',
    roomId: 'a1b2c3d4',
    you: 'p1',
    round: { status: 'voting' },
    yourVote: null,
  };

  it('Given spectator の無い行（古いサーバー） When パース Then spectator: false になる', () => {
    const msg = parseServerMessage(
      JSON.stringify({ ...base, participants: [{ id: 'p1', name: 'a', connected: true, hasVoted: false }] }),
    )._unsafeUnwrap();
    expect(msg.type === 'room-state' && msg.participants[0]?.spectator).toBe(false);
  });

  it('Given spectator: true の行 When パース Then true を保つ', () => {
    const msg = parseServerMessage(
      JSON.stringify({
        ...base,
        participants: [{ id: 'p1', name: 'a', connected: true, hasVoted: false, spectator: true }],
      }),
    )._unsafeUnwrap();
    expect(msg.type === 'room-state' && msg.participants[0]?.spectator).toBe(true);
  });
});

describe('記録の切り替えと束の名前（#427）', () => {
  const parse = (m: unknown) => parseClientMessage(JSON.stringify(m));

  it('2 操作を受ける', () => {
    expect(parse({ type: 'set-recording', recording: true })._unsafeUnwrap()).toEqual({
      type: 'set-recording',
      recording: true,
    });
    expect(parse({ type: 'set-recording', recording: false }).isOk()).toBe(true);
    expect(parse({ type: 'set-recording', recording: 'yes' }).isErr()).toBe(true);
    expect(parse({ type: 'set-group-item', groupId: 3, item: '  A  ' })._unsafeUnwrap()).toEqual({
      type: 'set-group-item',
      groupId: 3,
      item: 'A',
    });
    expect(parse({ type: 'set-group-item', groupId: 1, item: '' }).isOk()).toBe(true);
  });

  it('groupId 0・小数・MAX_ESTIMATE_ITEM + 1 字を拒む', () => {
    expect(parse({ type: 'set-group-item', groupId: 0, item: 'A' }).isErr()).toBe(true);
    expect(parse({ type: 'set-group-item', groupId: 1.5, item: 'A' }).isErr()).toBe(true);
    expect(parse({ type: 'set-group-item', groupId: 1, item: 'a'.repeat(120) }).isOk()).toBe(true);
    expect(parse({ type: 'set-group-item', groupId: 1, item: 'a'.repeat(121) }).isErr()).toBe(true);
  });

  it('余計なキーを拒む', () => {
    expect(parse({ type: 'set-recording', recording: true, extra: 1 }).isErr()).toBe(true);
    expect(parse({ type: 'set-group-item', groupId: 1, item: 'A', extra: 1 }).isErr()).toBe(true);
  });

  it('estimate に recording が無い room-state は recording: true と読む', () => {
    const msg = { ...A_REVEALED_ROOM_STATE, estimate: { item: '', log: [] } };
    const parsed = parseServerMessage(JSON.stringify(msg))._unsafeUnwrap();
    expect(parsed.type === 'room-state' && parsed.estimate?.recording).toBe(true);
    const off = { ...A_REVEALED_ROOM_STATE, estimate: { item: '', log: [], recording: false } };
    const parsedOff = parseServerMessage(JSON.stringify(off))._unsafeUnwrap();
    expect(parsedOff.type === 'room-state' && parsedOff.estimate?.recording).toBe(false);
  });
});

describe('隠しモードのゲーム（#403）', () => {
  const parse = (m: unknown) => parseClientMessage(JSON.stringify(m));

  it('table-exchange は手の位置（0〜4・重複なし・5 個まで）だけを通す', () => {
    expect(parse({ type: 'table-exchange', discard: [0, 3] })._unsafeUnwrap()).toEqual({ type: 'table-exchange', discard: [0, 3] });
    expect(parse({ type: 'table-exchange', discard: [] }).isOk()).toBe(true);
    expect(parse({ type: 'table-exchange', discard: [0, 1, 2, 3, 4] }).isOk()).toBe(true);
    expect(parse({ type: 'table-exchange', discard: [5] }).isErr()).toBe(true);
    expect(parse({ type: 'table-exchange', discard: [-1] }).isErr()).toBe(true);
    expect(parse({ type: 'table-exchange', discard: [1.5] }).isErr()).toBe(true);
    expect(parse({ type: 'table-exchange', discard: [1, 1] }).isErr()).toBe(true);
    expect(parse({ type: 'table-exchange', discard: [0, 1, 2, 3, 4, 0] }).isErr()).toBe(true);
    expect(parse({ type: 'table-exchange' }).isErr()).toBe(true);
    // 札を送り込めない（引くのはサーバー・設計 §6.2）
    expect(parse({ type: 'table-exchange', discard: [0], cards: [] }).isErr()).toBe(true);
  });

  it.each(['table-deal', 'table-close'])('%s は中身を持たない（余分なキーを落とす）', (type) => {
    expect(parse({ type })._unsafeUnwrap()).toEqual({ type });
    expect(parse({ type, players: [] }).isErr()).toBe(true);
  });

  it('入口を開くコマンドは無い（入口は見積もりの操作だけ・設計 §5.1）', () => {
    expect(parse({ type: 'table-seat', seated: true }).isErr()).toBe(true);
    expect(parse({ type: 'table-start' }).isErr()).toBe(true);
  });

  it.each(['table-not-player', 'table-exchanged', 'table-no-game', 'table-in-play'])('%s は既知のエラーコード', (code) => {
    expect(isKnownErrorCode(code)).toBe(true);
  });

  const base = {
    type: 'room-state',
    roomId: 'a1b2c3d4',
    you: 'p1',
    participants: [{ id: 'p1', name: 'a', connected: true, hasVoted: false }],
    round: { status: 'revealed', votes: [], stats: { average: null, modes: [] } },
    yourVote: null,
  };
  const card = (suit: string, rank: number) => ({ suit, rank });
  const royal = [card('S', 14), card('S', 13), card('S', 12), card('S', 11), card('S', 10)];

  it('Given table の無い room-state（古いサーバー・ゲームが無い） When パース Then 通り、table は無い', () => {
    const msg = parseServerMessage(JSON.stringify(base))._unsafeUnwrap();
    expect(msg.type === 'room-state' && msg.table).toBeUndefined();
  });

  it('Given 開いたあとの table When パース Then プレイヤー・手・役を保つ', () => {
    const table = {
      status: 'shown',
      players: [{ participantId: 'p1', exchanged: true }],
      yourHand: royal,
      hands: [{ participantId: 'p1', cards: royal, category: 'royal-flush' }],
    };
    const msg = parseServerMessage(JSON.stringify({ ...base, table }))._unsafeUnwrap();
    expect(msg.type === 'room-state' && msg.table).toEqual(table);
  });

  it.each([
    ['範囲外の数字', card('S', 15)],
    ['1（A は 14）', card('S', 1)],
    ['未知のスート', card('X', 2)],
    ['ジョーカー', { joker: true }],
  ])('Given %s の札 When パース Then 落とす', (_label, bad) => {
    const table = { status: 'exchanging', players: [], yourHand: [bad], hands: [] };
    expect(parseServerMessage(JSON.stringify({ ...base, table })).isErr()).toBe(true);
  });
});
