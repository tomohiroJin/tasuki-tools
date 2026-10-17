/**
 * 順番に回す（#401 順番に回す spec §5）。偽の WebSocket と偽の時計で、受け取ったフレームから
 * 決め方の面・円盤・札・一言・脇の印がどう動くかを見る。サーバーは立てない。
 */
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import {
  CARD_LABEL,
  MODE_HEADING,
  MODE_ONCE,
  MODE_ORDER,
  ORDER_ALL_DONE,
  ORDER_LAST_BUTTON,
  ORDER_NEW_ROUND_BUTTON,
  ORDER_NOTE,
  ORDER_NOT_STARTED,
  ORDER_RESET_BUTTON,
  PICK_COUNT_LABEL,
  orderLastText,
  orderProgressText,
  spunByText,
  turnLabel,
  turnResultText,
} from '../src/copy';
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

const NAMES = ['あや', 'ゆう', 'れん'];
const ROSTER = {
  type: 'roster',
  room: {
    code: 'R1',
    participants: NAMES.map((n, i) => ({ participantId: `p${i + 1}`, displayName: n, presence: 'online', tools: ['roulette'] })),
  },
};
const E = (i: number) => ({ id: `p${i + 1}`, name: NAMES[i]! });
const ORDER_IDLE = { ...IDLE_ROULETTE, pickCount: 1, mode: 'order', order: null };

/** 1 番が れん（3 人の円盤） */
function firstTurn(elapsedMs: number) {
  return {
    ...ORDER_IDLE,
    order: { done: [E(2)], finished: false },
    spin: { seq: 1, wheel: [E(0), E(1), E(2)], winnerIndex: 2, settle: 0.5, picks: [{ index: 2, settle: 0.5 }], turn: 1, spunBy: 'ゆう', durationMs: 4000, elapsedMs },
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

const modeGroup = () => screen.getByRole('group', { name: MODE_HEADING });
const modeButton = (name: string) => within(modeGroup()).getByRole('button', { name });
const caption = () => document.querySelector('.roulette-caption')?.textContent;
const cardLabel = () => document.querySelector('.roulette-card-label')?.textContent;
const cardName = () => document.querySelector('.roulette-card-name-text')?.textContent;
const seats = () => document.querySelectorAll('.wheel-segment').length;
const hub = () => document.querySelector('.wheel-hub-count')?.textContent;
const chips = () => [...document.querySelectorAll('.roulette-chip')].map((e) => e.textContent);

/**
 * @requirements #401 順番に回す T1・T9・T10（決め方の面）
 */
describe('決め方の面', () => {
  it('Given 1 回で決めるルーム / When 脇を見る / Then 1 回で決めるが押された状態で、選ぶ人数が決め方の面にある', () => {
    // Given / When
    enterRoom(IDLE_ROULETTE);
    // Then
    expect(modeButton(MODE_ONCE)).toHaveAttribute('aria-pressed', 'true');
    expect(modeButton(MODE_ORDER)).toHaveAttribute('aria-pressed', 'false');
    const panel = screen.getByRole('region', { name: MODE_HEADING });
    expect(within(panel).getByRole('group', { name: PICK_COUNT_LABEL })).toBeInTheDocument();
    expect(cardLabel()).toBe(CARD_LABEL);
  });

  it('Given 1 回で決める / When 順番に回すを押す / Then 決め方を変えるコマンドを送る', () => {
    // Given
    enterRoom(IDLE_ROULETTE);
    latestSocket().sent.length = 0;
    // When
    act(() => modeButton(MODE_ORDER).click());
    // Then
    expect(latestSocket().sentJson()).toEqual([{ command: 'roulette.mode.set', mode: 'order' }]);
  });

  it('Given 順番に回す / When 脇を見る / Then 選ぶ人数は無く、説明と進み具合が出る。やり直すは回が無いので押せない', () => {
    // Given / When
    enterRoom(ORDER_IDLE);
    // Then
    const panel = screen.getByRole('region', { name: MODE_HEADING });
    expect(within(panel).queryByRole('group', { name: PICK_COUNT_LABEL })).toBeNull();
    expect(within(panel).getByText(ORDER_NOT_STARTED)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: ORDER_RESET_BUTTON })).toBeDisabled();
    expect(caption()).toBe(ORDER_NOTE);
    expect(hub()).toBe('3');
  });

  it('Given 回の途中 / When 決め方の面を見る / Then 1 回で決めるは押せず、やり直すを押すとやり直すコマンドを送る', () => {
    // Given
    enterRoom(firstTurn(4000));
    latestSocket().sent.length = 0;
    // When / Then
    expect(modeButton(MODE_ONCE)).toBeDisabled();
    act(() => screen.getByRole('button', { name: ORDER_RESET_BUTTON }).click());
    expect(latestSocket().sentJson()).toEqual([{ command: 'roulette.order.reset' }]);
  });
});

/**
 * @requirements #401 順番に回す T2〜T4・§5.1・§5.3（舞台と脇の印）
 */
describe('順番に回す舞台', () => {
  it('Given 1 番の回転を受けた / When 止まる / Then 札は「1 番」とその人、一言は「1 番は」、脇に「1 番」の印', () => {
    // Given
    enterRoom(firstTurn(0));
    // Then: 回っている間は名前も印も出さない
    expect(caption()).toBe(spunByText('ゆう'));
    expect(chips()).toEqual([]);
    expect(hub()).toBe('3');
    // When
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    // Then
    expect(cardLabel()).toBe(turnLabel(1));
    expect(cardName()).toBe('れん');
    expect(caption()).toBe(turnResultText(1, 'れん'));
    expect(chips()).toEqual([turnLabel(1)]);
    expect(hub()).toBe('2');
    expect(screen.getByText(orderProgressText(1, 2))).toBeInTheDocument();
    expect(document.querySelector('.roulette-caption')).toHaveClass('roulette-caption--order');
  });

  it('Given 残りが 1 人 / When 主ボタンを見る / Then 「最後の 1 人」', () => {
    // Given / When
    const s = firstTurn(4000);
    enterRoom({ ...s, order: { done: [E(2), E(0)], finished: false }, spin: { ...s.spin, seq: 2, wheel: [E(0), E(1)], winnerIndex: 0, picks: [{ index: 0, settle: 0.5 }], turn: 2 } });
    // Then
    expect(screen.getByRole('button', { name: ORDER_LAST_BUTTON })).toBeEnabled();
  });

  it('Given 回が終わった / When 画面を見る / Then 円盤は空で中心は 0、札は最後の人、主ボタンは「次の回を始める」', () => {
    // Given
    enterRoom(firstTurn(4000));
    // When: 最後の 1 人を出した（回転は変わらない）
    deliver({ ...firstTurn(4000), order: { done: [E(2), E(0), E(1)], finished: true } });
    // Then
    expect(seats()).toBe(0);
    expect(hub()).toBe('0');
    expect(cardLabel()).toBe(turnLabel(3));
    expect(cardName()).toBe('ゆう');
    expect(caption()).toBe(orderLastText('ゆう'));
    expect(screen.getByRole('button', { name: ORDER_NEW_ROUND_BUTTON })).toBeEnabled();
    expect(screen.getByText(ORDER_ALL_DONE)).toBeInTheDocument();
    // 脇の一覧は名簿の順（あや・ゆう・れん）
    expect(chips()).toEqual([turnLabel(2), turnLabel(3), turnLabel(1)]);
  });

  it('Given 順番の回転のあとで 1 回で決めるに戻った / When 舞台を見る / Then 前の回転の結果を出さない', () => {
    // Given / When
    enterRoom({ ...firstTurn(4000), mode: 'once', order: null });
    // Then
    expect(seats()).toBe(3);
    expect(document.querySelector('.roulette-card')).not.toHaveClass('is-revealed');
    expect(cardLabel()).toBe(CARD_LABEL);
  });
});
