/**
 * 円盤と結果の札（#94 PR 3・spec §6.3〜§6.5）。偽の WebSocket と偽の時計・偽の rAF で、
 * 受け取ったフレームから円盤の角度・当たりの席・札がどう動くかを見る。サーバーは立てない。
 *
 * 角度の期待値は `wheel-motion`（純粋関数）から取る。その純粋関数が正しい席に止まることは
 * `wheel-motion.test.ts` が別の計算（指し針の先を戻して atan2）で固定している。
 */
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { DRAWN_MARK, resultText } from '../src/copy';
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
      const expected = labelPlacement(i * 180 + 90, final, 'short');
      expect(el.getAttribute('text-anchor'), `席 ${i}`).toBe(expected.anchor);
      expect(el.classList.contains('wheel-label--vertical'), `席 ${i}`).toBe(expected.mode === 'vertical');
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

/** 指し針の位置（`<g transform="rotate(p − 180)">` から戻す） */
function pointerAngle(): number {
  const raw = document.querySelector('.wheel-pointer')?.parentElement?.getAttribute('transform') ?? '';
  const m = /rotate\((-?[\d.e+-]+)\)/.exec(raw);
  if (m === null) throw new Error(`指し針の transform が読めない: ${raw}`);
  return Number(m[1]) + 180;
}

/**
 * 指し針の下にある席の名前。**実装の関数を使わずに**、描かれた DOM（回転子の角度・指し針の角度・席の数・
 * 席の順の名前）から引く。席 i は回転子の座標で `[i·s, (i+1)·s)`（spec §6.3）。
 */
function nameUnderPointer(): string {
  const labels = [...document.querySelectorAll('.wheel-label')].map((el) => el.textContent ?? '');
  const n = document.querySelectorAll('.wheel-segment').length;
  const rel = mod360(pointerAngle() - rotorAngle());
  return labels[Math.floor(rel / (360 / n))] ?? '';
}

/**
 * 回転中にマウントした画面（再読み込み・途中入室）でも、舞台の並びは**最初に測った幅**で決まる。
 * 回っている間に縦積みのまま凍り、止まった瞬間に横並びへ跳ぶと、止まる角度が 90° 変わって円盤が一瞬で回る。
 */
describe('回転中にマウントした広い舞台', () => {
  it('Given 舞台の幅が 1000px / When 回転の途中（経過 1 秒）で入り、止まるまで待つ / Then 回っている間も止まった後も横並び・指し針は右で、止まった瞬間に角度が跳ばない', () => {
    // Given: jsdom の幅は 0。舞台（.roulette-stage）だけ 1000px にする
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('roulette-stage') ? 1000 : 0;
    });
    // When
    enterRoom(spinState(1, 1000));
    const stage = document.querySelector('.roulette-stage');
    // Then: 最初の描画から横並び
    expect(stage?.getAttribute('data-layout')).toBe('row');
    expect(pointerAngle()).toBe(90);
    advance(2990);
    expect(stage?.getAttribute('data-layout')).toBe('row');
    expect(pointerAngle()).toBe(90);
    const nearEnd = rotorAngle();
    advance(100);
    // 止まった: 角度は横並びの指し針（右 90°）で計算した値で、終わり際から跳んでいない
    expect(stage?.getAttribute('data-layout')).toBe('row');
    expect(pointerAngle()).toBe(90);
    expect(rotorAngle()).toBeCloseTo(finalAngle(2, 1, 0.5, 90, 0), 6);
    expect(rotorAngle() - nearEnd).toBeLessThan(1);
    expect(nameUnderPointer()).toBe('ゆう');
  });
});

/**
 * 止まったかの判定は 1 か所（spec §6.4）。終わりの時刻の前後で、札・当たりの席・結果の一言・一覧の
 * 「選ばれた」が**同じ瞬間に**切り替わる。円盤が自前の時計で先に止まると、札は当たりを見せているのに
 * 一言と一覧はまだ回している、という食い違いが出る。
 */
describe('止まった瞬間は円盤と一言と一覧で揃う', () => {
  const rowOf = (name: string) => within(screen.getByRole('list')).getByText(new RegExp(`^${name}`)).closest('li') as HTMLElement;
  const snapshot = () => ({
    card: card().classList.contains('is-revealed'),
    seat: winnerSeat() !== null,
    caption: screen.getByRole('status').textContent === resultText('ゆう'),
    drawn: within(rowOf('ゆう')).queryByText(DRAWN_MARK) !== null,
  });

  it('Given 回し始めた / When 終わりの時刻の前後を 5ms ずつ進める / Then どの瞬間も 4 つが同じ局面', () => {
    // Given
    enterRoom();
    deliver(spinState(1, 0));
    advance(3900);
    // When / Then
    const seen: string[] = [];
    for (let t = 3900; t <= 4100; t += 5) {
      const s = snapshot();
      const all = [s.card, s.seat, s.caption, s.drawn];
      expect(new Set(all).size, `${t}ms: ${JSON.stringify(s)}`).toBe(1);
      seen.push(String(s.card));
      advance(5);
    }
    // 終わり際に回っている瞬間と、止まった瞬間の両方を見ている
    expect(seen).toContain('false');
    expect(seen).toContain('true');
  });
});

/**
 * 止まった後の円盤（spec §6.3）。**次に回すまで、回したときの並び（`spin.wheel`）を描き続ける**。
 * 止まった後に入る人が変わっても、針と札は同じ人を指す。
 */
describe('止まった後に入る人が変わる', () => {
  it('Given 止まった（当たりはゆう） / When ゲストが 1 人増える / Then 針の下の席はゆうのまま、当たりの席もゆう', () => {
    // Given
    enterRoom();
    deliver(spinState(1, 0));
    advance(4100);
    expect(nameUnderPointer()).toBe('ゆう');
    // When: 同じ seq に、ゲストのケンを足した状態
    deliver({ ...spinState(1, 4000), guests: [{ id: 'g1', name: 'ケン' }] });
    // Then
    expect(nameUnderPointer()).toBe('ゆう');
    expect(winnerSeat()?.parentElement?.querySelector('.wheel-label')?.textContent).toBe('ゆう');
    expect(card()).toHaveTextContent('ゆう');
  });

  it('Given 止まった（当たりはゆう） / When 再接続で名簿の順だけが変わる / Then 当たりの席の強調は消えない', () => {
    // Given
    enterRoom();
    deliver(spinState(1, 0));
    advance(4100);
    expect(winnerSeat()).not.toBeNull();
    // When
    act(() =>
      latestSocket().deliver({
        ...ROSTER_FRAME,
        room: { ...ROSTER_FRAME.room, participants: [...ROSTER_FRAME.room.participants].reverse() },
      }),
    );
    // Then
    expect(winnerSeat()?.parentElement?.querySelector('.wheel-label')?.textContent).toBe('ゆう');
    expect(nameUnderPointer()).toBe('ゆう');
  });
});

describe('結果の札', () => {
  it('Given 1 回目が止まった（ゆう） / When 2 回目を受けて伏せ直る / Then 表の名前は前の名前のまま（空にならない）', () => {
    // Given
    enterRoom();
    deliver(spinState(1, 0));
    advance(4100);
    // When
    deliver(spinState(2, 0));
    // Then
    expect(card()).not.toHaveClass('is-revealed');
    expect(card().querySelector('.roulette-card-name')?.firstChild?.textContent).toBe('ゆう');
  });
});
