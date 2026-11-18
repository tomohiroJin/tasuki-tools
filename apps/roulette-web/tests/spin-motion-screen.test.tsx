/**
 * 変わった動き（#640）。偽の WebSocket と偽の時計で、動きの載った回転を受けた画面が、
 * **最後に止まるまで**結果（一言・札・真鍮の席）を出さず、新旧の混在（項目が無い・知らない名前）では
 * いつもの時刻・いつもの動きで見せ、「動きを減らす」設定では動きを見せないことを見る。サーバーは立てない。
 *
 * 角度そのもの（動きごとの見え方・同じ席で止まる）は `spin-motion.test.ts` が別の計算で固定している。
 */
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAUNCH_MOTIONS, SPIN_MOTIONS, pickStopsMs } from '@tasuki/roulette-core';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { resultText, spunByText } from '../src/copy';
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
  clock = 0;
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
/** いつもの止まり方で 1 人目が止まる時刻 */
const PLAIN_STOP = pickStopsMs(1)[0]!;

/** れんに決まる 1 人の回転。動きを載せる（`durationMs` は core の表から出す＝サーバーと同じ） */
function movedSpin(motions: { launchMotion?: string; spinMotion?: string }, durationMs?: number) {
  const ms = durationMs ?? pickStopsMs(1, null, { launch: motions.launchMotion, spin: motions.spinMotion })[0]!;
  return {
    excluded: [],
    guests: [],
    drawn: [],
    spin: { seq: 1, wheel: WHEEL, winnerIndex: 2, settle: 0.5, picks: [{ index: 2, settle: 0.5 }], ...motions, spunBy: 'ゆう', durationMs: ms, elapsedMs: 0 },
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
const rotorAngle = (): number => Number(/rotate\(([-\d.e]+)\)/.exec(document.querySelector('.wheel-rotor')?.getAttribute('transform') ?? '')?.[1]);

/** 動きの組（動き出し・回転）。どちらか一方だけ・両方 */
const CASES: { name: string; motions: { launchMotion?: string; spinMotion?: string } }[] = [
  ...LAUNCH_MOTIONS.map((m) => ({ name: m, motions: { launchMotion: m } })),
  ...SPIN_MOTIONS.map((m) => ({ name: m, motions: { spinMotion: m } })),
  { name: 'stumble + turnback', motions: { launchMotion: 'stumble', spinMotion: 'turnback' } },
];

/**
 * @requirements #640 振る舞い 2・4（全員の画面で同じ時刻に止まる・最後に止まるまで結果を出さない）
 */
describe('変わった動きの間は、止まる時刻（core の表）まで結果を出さない', () => {
  it.each(CASES)('Given 動き $name の回転 / When 止まる時刻の前後 / Then 表の時刻にだけ結果を出す', ({ motions }) => {
    // Given
    enterRoom(movedSpin(motions));
    const end = pickStopsMs(1, null, { launch: motions.launchMotion, spin: motions.spinMotion })[0]!;
    // When / Then: 止まる直前までは回している形
    advanceTo(end - 30);
    expect(caption()).toBe(spunByText('ゆう'));
    expect(card()).not.toHaveClass('is-revealed');
    expect(goldSeats()).toBe(0);
    // When: 止まった
    advanceTo(end + 50);
    // Then
    expect(caption()).toBe(resultText('れん'));
    expect(card()).toHaveClass('is-revealed');
    expect(goldSeats()).toBe(1);
  });

  it('Given 速い回転 / When いつもの時刻になる前に止まる / Then いつもより早く結果を出す', () => {
    // Given
    enterRoom(movedSpin({ spinMotion: 'fast' }));
    // When: いつもの止まる時刻より前（速い回転の止まる時刻の後）
    advanceTo(PLAIN_STOP - 500);
    // Then
    expect(caption()).toBe(resultText('れん'));
  });

  it('Given 逆回転 / When 回っている間 / Then 円盤は逆向きに回る（時刻が進むほど角度が小さくなる）', () => {
    // Given
    enterRoom(movedSpin({ spinMotion: 'backward' }));
    // When
    advanceTo(500);
    const a = rotorAngle();
    advanceTo(1000);
    // Then
    expect(rotorAngle()).toBeLessThan(a);
  });
});

/**
 * @requirements #640 決めること 5（新旧の wire の混在）
 */
describe('新旧の混在: 動きの項目が無い・知らない名前は、いつもの時刻・いつもの動きで描く', () => {
  it('Given 動きの項目が無い回転（古いサーバー） / When いつもの時刻になる / Then いつもの時刻に結果を出す', () => {
    // Given
    enterRoom(movedSpin({}));
    // When / Then
    advanceTo(PLAIN_STOP - 30);
    expect(caption()).toBe(spunByText('ゆう'));
    advanceTo(PLAIN_STOP + 50);
    expect(caption()).toBe(resultText('れん'));
  });

  it('Given 知らない名前の動き（新しいサーバー） / When いつもの時刻になる / Then 画面はいつもの長さで描き、結果は wire の長さが過ぎてから出す', () => {
    // Given: 新しいサーバーが知らない動き（長さは wire の durationMs で届く）
    enterRoom(movedSpin({ launchMotion: 'spiral', spinMotion: 'teleport' }, PLAIN_STOP + 1000));
    // When / Then: 円盤はいつもの動きで止まっている。結果は wire の長さまで出さない
    advanceTo(PLAIN_STOP + 50);
    expect(caption()).toBe(spunByText('ゆう'));
    advanceTo(PLAIN_STOP + 1050);
    expect(caption()).toBe(resultText('れん'));
  });
});

/**
 * @requirements #640 振る舞い 5（動きを減らす設定）
 */
describe('動きを減らす設定では変わった動きをしない', () => {
  it.each(CASES)('Given 動きを減らす設定 / When 動き $name の回転を受ける / Then 回さず、受け取った直後から止まった状態を見せる', ({ motions }) => {
    // Given
    stubReducedMotion(true);
    // When
    enterRoom(movedSpin(motions));
    // Then
    expect(caption()).toBe(resultText('れん'));
    expect(card()).toHaveClass('is-revealed');
    expect(goldSeats()).toBe(1);
  });

  it('Given 動きを減らす設定 / When 動きの載った回転の時刻が進む / Then 円盤の角度は動かない', () => {
    // Given
    stubReducedMotion(true);
    enterRoom(movedSpin({ launchMotion: 'windup', spinMotion: 'turnback' }));
    const settled = rotorAngle();
    // When
    advanceTo(1500);
    // Then
    expect(rotorAngle()).toBe(settled);
  });
});
