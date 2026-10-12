import { describe, expect, it } from 'vitest';
import type { RosterRoom } from '@tasuki/room-core';
import type { RouletteView } from '@tasuki/roulette-core';
import {
  CAPTION_IDLE,
  CYCLE_NOTE,
  RECONNECTING_TEXT,
  SPIN_AGAIN_BUTTON,
  SPIN_BUTTON,
  SPINNING_BUTTON,
  STALE_TEXT,
  TOO_FEW_TEXT,
  UNREACHABLE_TEXT,
  cycleProgressText,
  resultText,
  spunByText,
} from '../src/copy';
import {
  canOperate,
  captionOf,
  connectionNotice,
  cycleLineOf,
  membersOf,
  peopleOf,
  phaseOf,
  spinButtonOf,
} from '../src/roulette-view';

const ROSTER: RosterRoom = {
  code: 'R1',
  participants: [
    { participantId: 'p1', displayName: 'Aya', presence: 'online', tools: ['roulette'] },
    { participantId: 'p2', displayName: 'Yu', presence: 'online', tools: ['roulette'] },
    { participantId: 'p3', displayName: 'Ren', presence: 'offline', tools: [] },
  ],
};
const IDLE: RouletteView = { excluded: [], guests: [], drawn: [], spin: null };

/** p2 が当たりの回転（elapsedMs は受け取った時点の経過） */
function viewSpinning(over: Partial<RouletteView> = {}, elapsedMs = 0): RouletteView {
  return {
    ...IDLE,
    drawn: ['p2'],
    ...over,
    spin: {
      seq: 1,
      wheel: [
        { id: 'p1', name: 'Aya' },
        { id: 'p2', name: 'Yu' },
      ],
      winnerIndex: 1,
      settle: 0.5,
      spunBy: 'Aya',
      durationMs: 4000,
      elapsedMs,
    },
  };
}

/**
 * 回転の途中（回し始めから止まるまで）は、当たりの名前を先に見せない（spec §6.8）。
 * 時計は「受け取った時刻」（`receivedAt`）を基準にし、サーバーが送った経過に足す。
 *
 * @requirements #94 E17 E19
 */
describe('回転の局面', () => {
  it('Given 回したことがない / When 局面を見る / Then 回す前', () => {
    expect(phaseOf({ view: IDLE, receivedAt: 0, nowMs: 10, reducedMotion: false })).toBe('idle');
  });

  it('Given 受け取った直後の回転 / When 局面を見る / Then 回っている', () => {
    expect(phaseOf({ view: viewSpinning(), receivedAt: 100, nowMs: 100, reducedMotion: false })).toBe('spinning');
  });

  it('Given 回転の途中で参加した（経過 3 秒） / When 受け取って 999ms 後 / Then まだ回っている。1000ms 後に止まる', () => {
    // Given: 経過 3000ms で受け取った
    const view = viewSpinning({}, 3000);
    // When / Then: 残り 1000ms の境
    expect(phaseOf({ view, receivedAt: 0, nowMs: 999, reducedMotion: false })).toBe('spinning');
    expect(phaseOf({ view, receivedAt: 0, nowMs: 1000, reducedMotion: false })).toBe('settled');
  });

  it('Given 動きを減らす設定 / When 受け取った直後 / Then 止まった局面（回さず結果を出す）', () => {
    expect(phaseOf({ view: viewSpinning(), receivedAt: 0, nowMs: 0, reducedMotion: true })).toBe('settled');
  });
});

describe('入る人の一覧', () => {
  const members = membersOf(ROSTER);

  it('Given 名簿 / When 名簿の断片に直す / Then 参加者 ID・表示名・在室になる', () => {
    // Given: あや・ゆうは在室、れんは離席
    // When
    const result = membersOf(ROSTER);
    // Then
    expect(result).toEqual([
      { id: 'p1', name: 'Aya', present: true },
      { id: 'p2', name: 'Yu', present: true },
      { id: 'p3', name: 'Ren', present: false },
    ]);
  });

  it('Given 離席中の人と外した人とゲスト / When 一覧を作る / Then 入る人の数は在室・未除外・ゲストだけ', () => {
    // Given
    const view: RouletteView = { ...IDLE, excluded: ['p2'], guests: [{ id: 'g-1', name: 'Hana' }] };
    // When
    const list = peopleOf({ members, view, selfId: 'p1', phase: 'idle' });
    // Then: Aya と Hana の 2 人
    expect(list.poolCount).toBe(2);
    expect(list.rows.map((r) => [r.id, r.checked, r.mark, r.disabled])).toEqual([
      ['p1', true, null, false],
      ['p2', false, null, false],
      ['p3', false, 'away', true],
      ['g-1', true, null, false],
    ]);
  });

  it('Given 自分とゲスト / When 一覧を作る / Then 自分には印が付き、消せるのはゲストだけ', () => {
    // Given
    const view: RouletteView = { ...IDLE, guests: [{ id: 'g-1', name: 'Hana' }] };
    // When
    const rows = peopleOf({ members, view, selfId: 'p1', phase: 'idle' }).rows;
    // Then
    expect(rows.map((r) => [r.id, r.isSelf, r.removable])).toEqual([
      ['p1', true, false],
      ['p2', false, false],
      ['p3', false, false],
      ['g-1', false, true],
    ]);
  });

  /** m166 の対象: 回っている間は今回の当たりを「選ばれた」に数えない */
  it('Given 一周の途中に回している / When 回っている間 / Then 今回の当たりは選ばれた印にも一周の数にも入らない', () => {
    // Given: 前に p1 が選ばれ、今回 p2 が当たりの回転
    const view = viewSpinning({ drawn: ['p1', 'p2'] });
    // When
    const spinning = peopleOf({ members, view, selfId: null, phase: 'spinning' });
    const settled = peopleOf({ members, view, selfId: null, phase: 'settled' });
    // Then: 回っている間は p1 だけ。止まったら p2 も出る
    expect(spinning.rows.filter((r) => r.mark === 'drawn').map((r) => r.id)).toEqual(['p1']);
    expect(spinning.drawnCount).toBe(1);
    expect(settled.rows.filter((r) => r.mark === 'drawn').map((r) => r.id)).toEqual(['p1', 'p2']);
    expect(settled.drawnCount).toBe(2);
  });

  it('Given 一周の途中 / When 一周の行を作る / Then 始まる前は説明、始まったら進み具合', () => {
    expect(cycleLineOf(0, 3)).toBe(CYCLE_NOTE);
    expect(cycleLineOf(2, 3)).toBe(cycleProgressText(2, 3));
  });
});

describe('在室者と同じ名前のゲスト', () => {
  const members = membersOf(ROSTER);

  it('Given 在室者と大文字小文字だけ違うゲストと外したゲスト / When 一覧を作る / Then 前者だけ印が付き入る人に数えない', () => {
    // Given: Aya（在室）と同名の Aya をゲストに足し、別のゲスト Hana は外している
    const view: RouletteView = {
      ...IDLE,
      excluded: ['g-2'],
      guests: [
        { id: 'g-1', name: 'aya' },
        { id: 'g-2', name: 'Hana' },
        { id: 'g-3', name: 'Sou' },
      ],
    };
    // When
    const list = peopleOf({ members, view, selfId: null, phase: 'idle' });
    // Then: 入る人は Aya・Yu・Sou の 3 人。印は g-1 だけ（外した人は印なし）
    expect(list.poolCount).toBe(3);
    expect(list.rows.filter((r) => r.id.startsWith('g-')).map((r) => [r.id, r.checked, r.mark])).toEqual([
      ['g-1', false, 'twin'],
      ['g-2', false, null],
      ['g-3', true, null],
    ]);
  });

  /** m181 の対象: 同名で外れたゲストのチェックは押しても何も起きないので、押せなくする */
  it('Given 在室者と同名のゲストと別名のゲスト / When 一覧を作る / Then 同名の方だけチェックを押せない', () => {
    // Given
    const view: RouletteView = { ...IDLE, guests: [{ id: 'g-1', name: 'Aya' }, { id: 'g-2', name: 'Hana' }] };
    // When
    const rows = peopleOf({ members, view, selfId: null, phase: 'idle' }).rows;
    // Then
    expect(rows.filter((r) => r.id.startsWith('g-')).map((r) => [r.id, r.mark, r.disabled])).toEqual([
      ['g-1', 'twin', true],
      ['g-2', null, false],
    ]);
  });

  it('Given 同名の相手が離席中 / When 一覧を作る / Then ゲストは入る人に戻り印は消える', () => {
    // Given: Ren は離席中で、ゲストにも Ren
    const view: RouletteView = { ...IDLE, guests: [{ id: 'g-1', name: 'Ren' }] };
    // When
    const list = peopleOf({ members, view, selfId: null, phase: 'idle' });
    // Then
    expect(list.rows.find((r) => r.id === 'g-1')).toMatchObject({ checked: true, mark: null });
  });
});

describe('結果の一言と主ボタン', () => {
  it('Given 回す前 / When 一言を決める / Then 回すとの案内', () => {
    expect(captionOf({ view: IDLE, phase: 'idle', poolCount: 3 })).toBe(CAPTION_IDLE);
  });

  /** m165 の対象: 回している間は当たりの名前を言わない */
  it('Given 回っている / When 一言を決める / Then 回した人だけを言い、当たりの名前を含まない', () => {
    // Given: 当たりは Yu、回したのは Aya
    const view = viewSpinning();
    // When
    const text = captionOf({ view, phase: 'spinning', poolCount: 2 });
    // Then
    expect(text).toBe(spunByText('Aya'));
    expect(text).not.toContain('Yu');
  });

  it('Given 止まった / When 一言を決める / Then 当たりの名前を言う', () => {
    expect(captionOf({ view: viewSpinning(), phase: 'settled', poolCount: 2 })).toBe(resultText('Yu'));
  });

  it('Given 入る人が 1 人 / When 一言を決める / Then 2 人から回せますと言う', () => {
    expect(captionOf({ view: IDLE, phase: 'idle', poolCount: 1 })).toBe(TOO_FEW_TEXT);
  });

  /** m182 の対象: 発表した結果は、後から入る人が減っても消さない */
  it('Given 止まって当たりを発表した / When その後で入る人が 1 人に減る / Then 発表した結果を言い続ける', () => {
    expect(captionOf({ view: viewSpinning({ excluded: ['p1'] }), phase: 'settled', poolCount: 1 })).toBe(resultText('Yu'));
  });

  it('Given 入る人が 1 人でも回っている途中 / When 一言を決める / Then 回した人を言う（回転を邪魔しない）', () => {
    expect(captionOf({ view: viewSpinning(), phase: 'spinning', poolCount: 1 })).toBe(spunByText('Aya'));
  });

  it.each([
    ['回す前', IDLE, 3, true, SPIN_BUTTON, false],
    ['入る人が 1 人', IDLE, 1, true, SPIN_BUTTON, true],
    ['繋がっていない', IDLE, 3, false, SPIN_BUTTON, true],
    ['回っている', viewSpinning(), 2, true, SPINNING_BUTTON, true],
    ['回し終えた', viewSpinning(), 2, true, SPIN_AGAIN_BUTTON, false],
  ] as const)('Given %s / When 主ボタンを決める / Then 文言と押せるかが決まる', (_name, view, poolCount, operable, label, disabled) => {
    // Given: 局面は「サーバー上で回転中か」で分ける（動きを減らしても主ボタンは回転の間押せない）
    const serverSpinning = label === SPINNING_BUTTON;
    // When
    const button = spinButtonOf({ view, poolCount, operable, serverSpinning });
    // Then
    expect(button).toEqual({ label, disabled });
  });
});

describe('接続の告知', () => {
  it('Given 参加済みで繋がっている / When 操作可否を見る / Then 操作できる。参加前や切断中は操作できない', () => {
    // Given: 状態の組 3 つ
    // When
    const operable = canOperate('open', true);
    const beforeJoin = canOperate('open', false);
    const disconnected = canOperate('closed', true);
    // Then
    expect(operable).toBe(true);
    expect(beforeJoin).toBe(false);
    expect(disconnected).toBe(false);
  });

  it('Given 告知の種類 / When 文にする / Then 種類ごとの文言になり、何も無いときは文を持たない', () => {
    // 種類を決める規則は `@tasuki/sync-client` のテストが見る（ここは文言の当て方だけ）
    expect(connectionNotice('unreachable')).toEqual({ kind: 'unreachable', text: UNREACHABLE_TEXT });
    expect(connectionNotice('reconnecting')).toEqual({ kind: 'reconnecting', text: RECONNECTING_TEXT });
    expect(connectionNotice('stale')).toEqual({ kind: 'stale', text: STALE_TEXT });
    expect(connectionNotice('none')).toEqual({ kind: 'none' });
  });
});
