/**
 * Check-in Cards の卓の画面（#406・設計 §4・§5）。サーバーは立てず、台本の WebSocket に差し込む。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { CheckinRoom } from '../src/screens/CheckinRoom';
import { IDLE_CHECKIN, RESUME, ROSTER_FRAME, ScriptedWebSocket, latestSocket, openCheckin } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function enter(state: unknown) {
  saveResumeIdentity(RESUME);
  render(<CheckinRoom roomCode="R1" />);
  act(() => {
    latestSocket().open();
    latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
    latestSocket().deliver(ROSTER_FRAME);
    latestSocket().deliver({ type: 'checkin', state });
  });
}

/** 部屋に入った後に送ったコマンドだけ（room.join を除く） */
const commands = () => latestSocket().sentJson().filter((m) => m.command !== 'room.join');

describe('回が無いとき', () => {
  it('Given 回が無い / When やり方を押す / Then choose が 1 通', () => {
    enter(IDLE_CHECKIN);
    fireEvent.click(screen.getByRole('button', { name: /今日の天気/ }));
    expect(commands()).toEqual([{ command: 'checkin.method.choose', method: 'weather' }]);
  });

  it('Given 回が無い / When ランダムを押す / Then draw に側を載せる', () => {
    enter(IDLE_CHECKIN);
    fireEvent.click(screen.getByRole('button', { name: 'ランダム' }));
    expect(commands()).toEqual([{ command: 'checkin.method.draw', side: 'checkin' }]);
  });
});

describe('開いている回', () => {
  it('Given 開いている回 / When 札を押す / Then いまの seq を載せた play が送られる', () => {
    enter(openCheckin(null));
    fireEvent.click(screen.getByRole('button', { name: '雨' }));
    expect(commands()).toEqual([{ command: 'checkin.card.play', seq: 1, card: 'rain' }]);
  });

  it('Given seq が進んだ / When 札を押す / Then 古い seq を送らない', () => {
    enter(openCheckin(null));
    const next = openCheckin(null);
    act(() => latestSocket().deliver({ type: 'checkin', state: { ...next, round: { ...next.round, seq: 4 } } }));
    fireEvent.click(screen.getByRole('button', { name: '晴れ' }));
    expect(commands()).toEqual([{ command: 'checkin.card.play', seq: 4, card: 'sunny' }]);
  });

  it('Given 見学中 / When 描く / Then 手札のボタンは 0 個（E9・m513）', () => {
    enter({ ...openCheckin(null), spectating: true });
    expect(screen.queryAllByRole('button', { name: /晴れ|くもり|雨|雷/ })).toHaveLength(0);
    expect(screen.getByRole('button', { name: '投票に加わる' })).toBeInTheDocument();
  });

  it('Given 見学中 / When 待たずに開くを押す / Then 送れる（参加者は対等）', () => {
    enter({ ...openCheckin(null), spectating: true });
    fireEvent.click(screen.getByRole('button', { name: '待たずに開く' }));
    expect(commands()).toEqual([{ command: 'checkin.reveal', seq: 1 }]);
  });

  it('Given 誰かが出した / When 描く / Then 公開の仕方は disabled（m515）', () => {
    const s = openCheckin(null);
    enter({ ...s, round: { ...s.round, locked: true } });
    expect(screen.getByRole('button', { name: '匿名' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '名前つき' })).toBeDisabled();
  });

  it('Given 開いた回 / When 描く / Then 別のやり方は下の帯の 1 つだけ', () => {
    const s = openCheckin('sunny');
    enter({ ...s, round: { ...s.round, status: 'revealed', seq: 3, piles: [] } });
    expect(screen.getAllByRole('button', { name: '別のやり方' })).toHaveLength(1);
  });

  it('Given 別のやり方を押す / Then 何も送らず、やり方の選択が出る', () => {
    enter(openCheckin(null));
    fireEvent.click(screen.getAllByRole('button', { name: '別のやり方' })[0]!);
    expect(commands()).toEqual([]);
    expect(screen.getByRole('button', { name: 'ランダム' })).toBeInTheDocument();
  });

  it('Given 自分が出した / When 開く前に席を見る / Then 自分以外の席に札の名前も絵も無い', () => {
    const s = openCheckin('sunny');
    enter({ ...s, round: { ...s.round, seats: [{ id: 'p1', name: 'あや', played: true }, { id: 'p2', name: 'ゆう', played: true }], playedCount: 2 } });
    const seats = screen.getByRole('list', { name: '席' });
    expect(within(seats).getByText(/ゆう/)).toBeInTheDocument();
    expect(seats.querySelector('svg')).toBeNull();
    expect(seats.textContent).not.toMatch(/晴れ|くもり|雨|雷/);
    expect(screen.getByText('2 / 2 人が出しました')).toBeInTheDocument();
  });

  it('Given 自分が出した / When 描く / Then 手札の自分の札が選ばれている', () => {
    enter(openCheckin('sunny'));
    expect(screen.getByRole('button', { name: '晴れ' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('開いた後', () => {
  it('Given 開いた / When もう一回を押す / Then seq を載せた again が送られる', () => {
    const s = openCheckin('sunny');
    enter({ ...s, round: { ...s.round, status: 'revealed', seq: 3, piles: [] } });
    fireEvent.click(screen.getByRole('button', { name: 'もう一回' }));
    expect(commands()).toEqual([{ command: 'checkin.again', seq: 3 }]);
  });
});
