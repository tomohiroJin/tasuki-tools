/**
 * 変わった止まり方（#420）。偽の WebSocket と偽の時計で、止まり方の載った回転を受けた画面が、
 * **最後に止まるまで**結果（一言・札・真鍮の席・脇の印）を出さないことを見る。サーバーは立てない。
 *
 * 角度そのもの（止まり方ごとの動き・同じ席で止まる）は `stop-style-motion.test.ts` が別の計算で固定している。
 */
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STOP_STYLES, pickStopsMs } from '@tasuki/roulette-core';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { DRAWN_MARK, groupResultText, resultText, spunByText } from '../src/copy';
import { RESUME, ScriptedWebSocket, latestSocket } from './support/scripted-web-socket';

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
/** 普通の止まり方で 1 人目が止まる時刻 */
const PLAIN_STOP = pickStopsMs(1)[0]!;

/** れんに決まる 1 人の回転。止まり方を載せる */
function styledSpin(stopStyle: string, durationMs = pickStopsMs(1, stopStyle)[0]!) {
  return {
    excluded: [],
    guests: [],
    drawn: ['p3'],
    spin: { seq: 1, wheel: WHEEL, winnerIndex: 2, settle: 0.5, picks: [{ index: 2, settle: 0.5 }], stopStyle, spunBy: 'ゆう', durationMs, elapsedMs: 0 },
  };
}

function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
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

let clock = 0;
const advanceTo = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms - clock);
  });
  clock = ms;
};

const goldSeats = (): number => document.querySelectorAll('.wheel-segment--winner').length;
const card = () => document.querySelector('.roulette-card') as HTMLElement;
const caption = () => document.querySelector('.roulette-caption')?.textContent;
const drawnMarks = (): number => [...document.querySelectorAll('.roulette-chip')].filter((e) => e.textContent === DRAWN_MARK).length;
const rotorAngle = (): number => Number(/rotate\(([-\d.e]+)\)/.exec(document.querySelector('.wheel-rotor')?.getAttribute('transform') ?? '')?.[1]);

/**
 * @requirements #420 振る舞い 4（最後に止まるまで結果を出さない）
 */
describe('変わった止まり方の間は結果を出さない', () => {
  beforeEach(() => {
    clock = 0;
  });

  it.each(STOP_STYLES)('Given 止まり方 %s の回転 / When 普通なら止まる時刻を過ぎる / Then まだ結果を出さず、最後に止まってから出す', (style) => {
    // Given
    enterRoom(styledSpin(style));
    const end = pickStopsMs(1, style)[0]!;
    // When: 普通の止まり方なら止まっている時刻
    advanceTo(PLAIN_STOP + 50);
    // Then: 一言・札・真鍮の席・脇の印は、まだ回している形
    expect(caption()).toBe(spunByText('ゆう'));
    expect(card()).not.toHaveClass('is-revealed');
    expect(goldSeats()).toBe(0);
    expect(drawnMarks()).toBe(0);
    // When: 最後に止まる直前
    advanceTo(end - 30);
    expect(caption()).toBe(spunByText('ゆう'));
    // When: 最後に止まった
    advanceTo(end + 50);
    // Then
    expect(caption()).toBe(resultText('れん'));
    expect(card()).toHaveClass('is-revealed');
    expect(goldSeats()).toBe(1);
    expect(drawnMarks()).toBe(1);
  });

  it('Given じりじりの回転 / When 1 席手前で止まって見えている間 / Then 円盤は動かず、まだ結果を出さない。最後は当たりの位置で止まる', () => {
    // Given
    enterRoom(styledSpin('creep'));
    // When: 1 席手前で間を置いている
    advanceTo(PLAIN_STOP + 100);
    const waiting = rotorAngle();
    advanceTo(PLAIN_STOP + 600);
    // Then
    expect(rotorAngle()).toBe(waiting);
    expect(caption()).toBe(spunByText('ゆう'));
    // When: 最後に止まった
    advanceTo(pickStopsMs(1, 'creep')[0]! + 50);
    // Then: 1 席（4 人なら 90°）進んで止まる
    expect(rotorAngle() - waiting).toBeCloseTo(90, 6);
  });

  it('Given 2 人を選ぶ回転に止まり方が載る / When 時刻を進める / Then 1 人目は延びた時刻に決まり、2 人目はその分だけ後ろで決まる', () => {
    // Given
    const stops = pickStopsMs(2, 'double');
    enterRoom({
      pickCount: 2,
      excluded: [],
      guests: [],
      drawn: ['p3', 'p1'],
      spin: {
        seq: 1,
        wheel: WHEEL,
        winnerIndex: 2,
        settle: 0.5,
        picks: [
          { index: 2, settle: 0.5 },
          { index: 0, settle: 0.3 },
        ],
        stopStyle: 'double',
        spunBy: 'ゆう',
        durationMs: stops.at(-1)!,
        elapsedMs: 0,
      },
    });
    // When / Then
    advanceTo(pickStopsMs(2)[1]! + 50);
    expect(goldSeats()).toBe(0);
    advanceTo(stops[0]! + 50);
    expect(goldSeats()).toBe(1);
    advanceTo(stops[1]! + 50);
    expect(goldSeats()).toBe(2);
    expect(caption()).toBe(groupResultText('れん', 'あや'));
  });

  it('Given 知らない止まり方の回転（新しいサーバー） / When 普通の時刻に円盤が止まる / Then 結果は wire の長さが過ぎてから出す', () => {
    // Given
    enterRoom(styledSpin('spiral', PLAIN_STOP + 2000));
    // When / Then
    advanceTo(PLAIN_STOP + 50);
    expect(caption()).toBe(spunByText('ゆう'));
    advanceTo(PLAIN_STOP + 2050);
    expect(caption()).toBe(resultText('れん'));
  });
});

/**
 * @requirements #420 振る舞い 5（動きを減らす設定）
 */
describe('動きを減らす設定では変わった止まり方をしない', () => {
  it('Given 動きを減らす設定 / When 止まり方の載った回転を受ける / Then 回さず、受け取った直後から止まった状態を見せる', () => {
    // Given
    stubReducedMotion(true);
    // When
    enterRoom(styledSpin('double'));
    // Then
    expect(caption()).toBe(resultText('れん'));
    expect(card()).toHaveClass('is-revealed');
    expect(goldSeats()).toBe(1);
  });
});
