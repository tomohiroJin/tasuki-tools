/**
 * 円盤と結果の札（#94 PR 3・spec §6.3〜§6.5）。偽の WebSocket と偽の時計・偽の rAF で、
 * 受け取ったフレームから円盤の角度・当たりの席・札がどう動くかを見る。サーバーは立てない。
 *
 * 角度の期待値は `wheel-motion`（純粋関数）から取る。その純粋関数が正しい席に止まることは
 * `wheel-motion.test.ts` が別の計算（指し針の先を戻して atan2）で固定している。
 */
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { labelPlacement } from '../src/wheel-geometry';
import { angleAt, finalAngle } from '../src/wheel-motion';
import { redirectTo } from '../src/router';
import { IDLE_ROULETTE, RESUME, ROSTER_FRAME, ScriptedWebSocket, latestSocket, spinState } from './support/scripted-web-socket';

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
  vi.mocked(redirectTo).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

const JOINED = { type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' };

function enterRoom(state: unknown = IDLE_ROULETTE): void {
  saveResumeIdentity(RESUME);
  render(<App />);
  act(() => {
    latestSocket().open();
    latestSocket().deliver(JOINED);
    latestSocket().deliver(ROSTER_FRAME);
    latestSocket().deliver({ type: 'roulette', state });
  });
}

const deliver = (state: unknown): void => {
  act(() => latestSocket().deliver({ type: 'roulette', state }));
};
const advance = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

/** 回転子の角度（`transform="rotate(θ)"`） */
function rotorAngle(): number {
  const raw = document.querySelector('.wheel-rotor')?.getAttribute('transform') ?? '';
  const m = /rotate\((-?[\d.e+-]+)\)/.exec(raw);
  if (m === null) throw new Error(`回転子の transform が読めない: ${raw}`);
  return Number(m[1]);
}
const mod360 = (x: number): number => ((x % 360) + 360) % 360;
const winnerSeat = () => document.querySelector('.wheel-segment--winner');
const card = () => document.querySelector('.roulette-card') as HTMLElement;

// spinState(seq): 席 2 つ（あや・ゆう）・当たりは 1 番（ゆう）・settle 0.5・4000ms。jsdom の舞台の幅は 0 なので縦積み（指し針は下 180°）
const FINAL = (startDeg: number): number => finalAngle(2, 1, 0.5, 180, startDeg);

describe('回転', () => {
  it('Given 回す前 / When 新しい回転を受ける / Then 開始角から増えていき、durationMs の後に finalAngle で止まり、当たりの席と札が出る', () => {
    // Given
    enterRoom();
    expect(winnerSeat()).toBeNull();
    // When
    deliver(spinState(1, 0));
    const first = rotorAngle();
    advance(1000);
    const mid = rotorAngle();
    advance(2000);
    const late = rotorAngle();
    // Then: 始まりは 0°（この画面が見せていた角度）から。単調に増え、止まる前は当たりの席も札も出ていない
    expect(first).toBeCloseTo(0, 6);
    expect(mid).toBeGreaterThan(first);
    expect(late).toBeGreaterThan(mid);
    expect(winnerSeat()).toBeNull();
    expect(card()).not.toHaveClass('is-revealed');
    advance(1100);
    expect(rotorAngle()).toBeCloseTo(FINAL(0), 6);
    expect(winnerSeat()).not.toBeNull();
    expect(card()).toHaveClass('is-revealed');
    expect(card()).toHaveTextContent('ゆう');
  });

  it('Given 止まった / When 名前の向きを見る / Then 止まった角度の向きで描き直されている', () => {
    // Given
    enterRoom();
    deliver(spinState(1, 0));
    advance(4100);
    // When
    const texts = [...document.querySelectorAll('.wheel-label')];
    // Then: 席 i の中心は i·180 + 90
    const final = FINAL(0);
    texts.forEach((el, i) => {
      const expected = labelPlacement(i * 180 + 90, final);
      expect(el.getAttribute('text-anchor'), `席 ${i}`).toBe(expected.anchor);
      expect(el.classList.contains('wheel-label--vertical'), `席 ${i}`).toBe(expected.vertical);
    });
  });

  it('Given 1 回目が止まっている / When 2 回目を受ける / Then 止まっていた角度から回り出し、0° へ跳ばない', () => {
    // Given
    enterRoom();
    deliver(spinState(1, 0));
    advance(4100);
    const stopped = rotorAngle();
    // When
    deliver(spinState(2, 0));
    // Then
    expect(mod360(rotorAngle())).toBeCloseTo(mod360(stopped), 6);
    advance(500);
    expect(rotorAngle()).toBeGreaterThan(mod360(stopped));
    advance(3700);
    expect(rotorAngle()).toBeCloseTo(FINAL(mod360(stopped)), 6);
  });

  it('Given 回っている / When 同じ seq の状態が配り直される（外す操作など） / Then 角度は巻き戻らず、止まる席も変わらない', () => {
    // Given
    enterRoom();
    deliver(spinState(1, 0));
    advance(1500);
    const before = rotorAngle();
    // When: 同じ seq。サーバーは「いまの経過」を付けて配る
    deliver(spinState(1, 1500));
    // Then
    expect(rotorAngle()).toBeGreaterThanOrEqual(before);
    advance(2600);
    expect(rotorAngle()).toBeCloseTo(FINAL(0), 6);
  });

  it('Given 回転の途中（経過 3 秒）で入った / When 最初の描画 / Then 角度は 0 ではなく angleAt(3000) 付近', () => {
    // Given / When
    enterRoom(spinState(1, 3000));
    // Then
    expect(rotorAngle()).toBeCloseTo(angleAt(3000, 4000, 2, 1, 0.5, 180, 0), 0);
    expect(rotorAngle()).toBeGreaterThan(360);
    expect(winnerSeat()).toBeNull();
  });

  it('Given 回転が終わった後に入った / When 最初の描画 / Then 止まった角度・当たりの席・札の表', () => {
    // Given / When
    enterRoom(spinState(1, 4000));
    // Then
    expect(rotorAngle()).toBeCloseTo(FINAL(0), 6);
    expect(winnerSeat()).not.toBeNull();
    expect(card()).toHaveClass('is-revealed');
  });

  it('Given rAF を 1 度も呼ばない環境 / When durationMs が過ぎる / Then timer で止まり、当たりの席と札の表が出る', () => {
    // Given: 裏のタブ・ヘッドレスでは rAF が止まる。終わりは timer が保証する
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    enterRoom();
    deliver(spinState(1, 0));
    expect(winnerSeat()).toBeNull();
    // When
    advance(4100);
    // Then
    expect(rotorAngle()).toBeCloseTo(FINAL(0), 6);
    expect(winnerSeat()).not.toBeNull();
    expect(card()).toHaveClass('is-revealed');
  });

  it('Given 1 回目の回転の途中で 2 回目を受けた / When 1 回目の終わりの時刻が来る / Then 2 回目はまだ回っている', () => {
    // Given
    enterRoom();
    deliver(spinState(1, 0));
    advance(3900);
    deliver(spinState(2, 0));
    // When: 1 回目の timer の時刻を過ぎる
    advance(300);
    // Then
    expect(winnerSeat()).toBeNull();
    expect(card()).not.toHaveClass('is-revealed');
    // 2 回目の終わりで止まる
    advance(3800);
    expect(winnerSeat()).not.toBeNull();
    expect(card()).toHaveClass('is-revealed');
  });

  it('Given 回すたびに / When 次の回転を受ける / Then 札は伏せ直る', () => {
    // Given
    enterRoom();
    deliver(spinState(1, 0));
    advance(4100);
    expect(card()).toHaveClass('is-revealed');
    // When
    deliver(spinState(2, 0));
    // Then
    expect(card()).not.toHaveClass('is-revealed');
  });
});

describe('動きを減らす設定', () => {
  it('Given 動きを減らす / When 回転を受ける / Then 最初の描画で最終の角度・当たりの席・札の表。rAF は 1 度も呼ばない', () => {
    // Given
    stubReducedMotion(true);
    enterRoom();
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    // When
    deliver(spinState(1, 0));
    // Then
    expect(rotorAngle()).toBeCloseTo(FINAL(0), 6);
    expect(winnerSeat()).not.toBeNull();
    expect(card()).toHaveClass('is-revealed');
    advance(1000);
    expect(raf).not.toHaveBeenCalled();
    expect(rotorAngle()).toBeCloseTo(FINAL(0), 6);
  });
});

describe('止まったら札を見える位置へ寄せる', () => {
  /** 札と回すの帯の位置を差し替える（jsdom の `getBoundingClientRect` は全部 0） */
  function stubRects(cardRect: { top: number; bottom: number }): void {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const r = this.classList.contains('roulette-card')
        ? cardRect
        : this.classList.contains('roulette-controls')
          ? { top: 700, bottom: 750 }
          : { top: 0, bottom: 0 };
      return { ...r, left: 0, right: 0, width: 0, height: r.bottom - r.top, x: 0, y: r.top, toJSON: () => ({}) } as DOMRect;
    });
  }
  const scroll = vi.fn();
  beforeEach(() => {
    scroll.mockClear();
    Element.prototype.scrollIntoView = scroll;
  });

  it('Given 札が見えている / When 止まる / Then 動かさない', () => {
    // Given
    stubRects({ top: 100, bottom: 260 });
    enterRoom();
    deliver(spinState(1, 0));
    // When
    advance(4100);
    // Then
    expect(scroll).not.toHaveBeenCalled();
  });

  it('Given 札が下端の帯に隠れている（窓の中だが帯の下） / When 止まる / Then block: nearest で寄せる', () => {
    // Given: 窓の高さは 768・帯の上端は 700。札は窓に収まるが、帯に掛かる
    stubRects({ top: 600, bottom: 740 });
    enterRoom();
    deliver(spinState(1, 0));
    expect(scroll).not.toHaveBeenCalled();
    // When
    advance(4100);
    // Then
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
  });

  it('Given 動きを減らす設定で札が見えていない / When 受け取る / Then 滑らかにせず寄せる', () => {
    // Given
    stubReducedMotion(true);
    stubRects({ top: 640, bottom: 800 });
    enterRoom();
    // When
    deliver(spinState(1, 0));
    // Then
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
  });

  it('Given 終わった後に入った（再読込） / When 最初の描画 / Then 寄せない', () => {
    // Given
    stubRects({ top: 640, bottom: 800 });
    // When
    enterRoom(spinState(1, 4000));
    advance(100);
    // Then
    expect(scroll).not.toHaveBeenCalled();
  });
});
