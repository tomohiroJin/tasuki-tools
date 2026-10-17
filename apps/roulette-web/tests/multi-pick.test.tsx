/**
 * 2 人以上を選ぶ（#401 PR 2・spec §6）。偽の WebSocket と偽の時計で、受け取ったフレームから
 * 人数の切り替え・円盤の真鍮の席・組の札・一言がどう動くかを見る。サーバーは立てない。
 *
 * 止まる時刻は core の `pickStopsMs`（4000・5600・7200 ms の見込み）から取る。角度が正しい席に止まることは
 * `wheel-motion.test.ts` が別の計算（指し針の先を戻して atan2）で固定している。
 */
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickStopsMs } from '@tasuki/roulette-core';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { CARD_LABEL, PICK_COUNT_LABEL, groupCardLabel, groupIdleText, groupResultText, spunByText, tooFewForPickText } from '../src/copy';
import { IDLE_ROULETTE, RESUME, ScriptedWebSocket, latestSocket } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/roulette/?room=R1');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const NAMES = ['あや', 'ゆう', 'れん', 'みお'];
const ROSTER = {
  type: 'roster',
  room: {
    code: 'R1',
    participants: NAMES.map((n, i) => ({ participantId: `p${i + 1}`, displayName: n, presence: 'online', tools: ['roulette'] })),
  },
};
const WHEEL = NAMES.map((n, i) => ({ id: `p${i + 1}`, name: n }));
const STOPS = pickStopsMs(3);

/** れん → あや → みお の順に止まる 3 人の回転 */
function spin3(seq = 1, elapsedMs = 0) {
  return {
    pickCount: 3,
    excluded: [],
    guests: [],
    drawn: ['p3', 'p1', 'p4'],
    spin: {
      seq,
      wheel: WHEEL,
      winnerIndex: 2,
      settle: 0.5,
      picks: [
        { index: 2, settle: 0.5 },
        { index: 0, settle: 0.3 },
        { index: 3, settle: 0.7 },
      ],
      spunBy: 'ゆう',
      durationMs: STOPS.at(-1)!,
      elapsedMs,
    },
  };
}

function enterRoom(state: unknown): void {
  saveResumeIdentity(RESUME);
  render(<App />);
  act(() => {
    latestSocket().open();
    latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
    latestSocket().deliver(ROSTER);
    latestSocket().deliver({ type: 'roulette', state });
  });
}
const deliver = (state: unknown): void => {
  act(() => latestSocket().deliver({ type: 'roulette', state }));
};
const advanceTo = (() => {
  let at = 0;
  return {
    reset: () => {
      at = 0;
    },
    to: (ms: number) => {
      act(() => {
        vi.advanceTimersByTime(ms - at);
      });
      at = ms;
    },
  };
})();

const goldSeats = (): number => document.querySelectorAll('.wheel-segment--winner').length;
const card = () => document.querySelector('.roulette-card') as HTMLElement;
const stage = () => document.querySelector('.roulette-stage') as HTMLElement;
const caption = () => document.querySelector('.roulette-caption')?.textContent;
const filledRows = (): string[] =>
  [...document.querySelectorAll('.roulette-group-row.is-filled .roulette-group-name')].map((e) => e.textContent ?? '');
const pickGroup = () => screen.getByRole('group', { name: PICK_COUNT_LABEL });

/**
 * @requirements #401 E1 E12（選ぶ人数の切り替え）
 */
describe('選ぶ人数の切り替え', () => {
  it('Given 選ぶ人数 2 のルーム / When 脇を見る / Then 4 つのボタンのうち 2 人だけが押された状態', () => {
    // Given / When
    enterRoom({ ...IDLE_ROULETTE, pickCount: 2 });
    // Then
    const buttons = within(pickGroup()).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['1 人', '2 人', '3 人', '4 人']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false']);
  });

  it('Given 回す前 / When 3 人を押す / Then 人数を変えるコマンドを送る', () => {
    // Given
    enterRoom(IDLE_ROULETTE);
    latestSocket().sent.length = 0;
    // When
    act(() => within(pickGroup()).getByRole('button', { name: '3 人' }).click());
    // Then
    expect(latestSocket().sentJson()).toEqual([{ command: 'roulette.pick.set', count: 3 }]);
  });

  it('Given 回っている / When 切り替えを見る / Then 押せない。止まったら押せる', () => {
    // Given
    advanceTo.reset();
    enterRoom(spin3());
    // When / Then
    for (const b of within(pickGroup()).getAllByRole('button')) expect(b).toBeDisabled();
    advanceTo.to(STOPS.at(-1)! + 50);
    for (const b of within(pickGroup()).getAllByRole('button')) expect(b).toBeEnabled();
  });

  it('Given 選ぶ人数 3 で入る人が 3 人 / When 画面を見る / Then 4 人から回せますと言い、回すは押せない', () => {
    // Given / When
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => {
      latestSocket().open();
      latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      latestSocket().deliver({ ...ROSTER, room: { ...ROSTER.room, participants: ROSTER.room.participants.slice(0, 3) } });
      latestSocket().deliver({ type: 'roulette', state: { ...IDLE_ROULETTE, pickCount: 3 } });
    });
    // Then
    expect(caption()).toBe(tooFewForPickText(3));
    expect(screen.getByRole('button', { name: /ルーレットを回す/ })).toBeDisabled();
  });
});

/**
 * @requirements #401 E8 E9（1 人ずつ止まる）
 */
describe('1 人ずつ続けて止まる', () => {
  it('Given 3 人の回転を受けた / When 止まる時刻を 1 つずつ過ぎる / Then 真鍮の席と札の行が 1 人ずつ増え、一言は最後に全員を言う', () => {
    // Given
    advanceTo.reset();
    enterRoom(spin3());
    // Then: 回し始めは誰も決まっていない
    expect(goldSeats()).toBe(0);
    expect(filledRows()).toEqual([]);
    expect(card()).not.toHaveClass('is-revealed');
    expect(caption()).toBe(spunByText('ゆう'));
    // When / Then: 1 人目が止まると札がめくれ、1 行目が埋まる
    advanceTo.to(STOPS[0]! + 50);
    expect(goldSeats()).toBe(1);
    expect(filledRows()).toEqual(['れん']);
    expect(card()).toHaveClass('is-revealed');
    expect(caption()).toBe(spunByText('ゆう'));
    advanceTo.to(STOPS[1]! + 50);
    expect(goldSeats()).toBe(2);
    expect(filledRows()).toEqual(['れん', 'あや']);
    advanceTo.to(STOPS[2]! + 50);
    expect(goldSeats()).toBe(3);
    expect(filledRows()).toEqual(['れん', 'あや', 'みお']);
    expect(caption()).toBe(groupResultText('れん', 'あや', 'みお'));
  });

  it('Given rAF を 1 度も呼ばない環境 / When 止まる時刻を過ぎる / Then timer で 1 人ずつ決まる（裏のタブでも止まる）', () => {
    // Given
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    advanceTo.reset();
    enterRoom(spin3());
    // When / Then
    advanceTo.to(STOPS[0]! + 50);
    expect(goldSeats()).toBe(1);
    advanceTo.to(STOPS[1]! + 50);
    expect(goldSeats()).toBe(2);
  });

  it('Given 2 人目へ送っている途中で入った / When 最初の描画 / Then 1 人目は決まっていて、札はめくれている', () => {
    // Given / When
    advanceTo.reset();
    enterRoom(spin3(1, STOPS[0]! + 600));
    // Then
    expect(goldSeats()).toBe(1);
    expect(filledRows()).toEqual(['れん']);
    expect(card()).toHaveClass('is-revealed');
  });
});

/**
 * @requirements #401 E7・spec §6.3（札の種類と段組み）
 */
describe('札の種類', () => {
  it('Given 選ぶ人数 1 / When 画面を見る / Then #94 の札（次の進行役）で、舞台は 1 人の段組み', () => {
    // Given / When
    enterRoom(IDLE_ROULETTE);
    // Then
    expect(card()).not.toHaveClass('roulette-card--group');
    expect(card()).toHaveTextContent(CARD_LABEL);
    expect(stage().dataset.pick).toBe('single');
  });

  it('Given 選ぶ人数 3 / When 回す前 / Then 組の札（行は 3 つ・まだ空）と、人数を言う一言', () => {
    // Given / When
    enterRoom({ ...IDLE_ROULETTE, pickCount: 3 });
    // Then
    expect(card()).toHaveClass('roulette-card--group');
    expect(card()).toHaveTextContent(groupCardLabel(3));
    expect(document.querySelectorAll('.roulette-group-row')).toHaveLength(3);
    expect(stage().dataset.pick).toBe('group');
    expect(caption()).toBe(groupIdleText(3));
  });

  it('Given 3 人の回転が止まった / When 選ぶ人数が 1 に変わる / Then 次に回すまで組の札（結果）のまま', () => {
    // Given
    advanceTo.reset();
    enterRoom(spin3());
    advanceTo.to(STOPS.at(-1)! + 50);
    // When
    deliver({ ...spin3(), pickCount: 1 });
    // Then
    expect(card()).toHaveClass('roulette-card--group');
    expect(filledRows()).toEqual(['れん', 'あや', 'みお']);
    expect(stage().dataset.pick).toBe('group');
  });

  it('Given 回っている / When 選ぶ人数が 1 に変わる / Then 札も段組みも変わらない（回転の人数で決まる）', () => {
    // Given
    advanceTo.reset();
    enterRoom(spin3());
    advanceTo.to(1000);
    // When
    deliver({ ...spin3(), pickCount: 1 });
    // Then
    expect(stage().dataset.pick).toBe('group');
    expect(document.querySelectorAll('.roulette-group-row')).toHaveLength(3);
  });
});
