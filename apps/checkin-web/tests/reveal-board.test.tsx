/**
 * 開いた後の画面（#406 3.5・設計 §5 の B と C）。開く動きは山の側だけ（席の伏せ札は裏返さない・m517）。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { PileView } from '@tasuki/checkin-core';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RevealBoard } from '../src/components/RevealBoard';
import { CheckinRoom } from '../src/screens/CheckinRoom';
import { RESUME, ROSTER_FRAME, ScriptedWebSocket, latestSocket, openCheckin } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  stubReducedMotion(false);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const named: PileView[] = [
  { card: 'sunny', count: 2, names: ['あや', 'ゆう'] },
  { card: 'cloudy', count: 2, names: ['はな', 'たろ'] },
  { card: 'rain', count: 0, names: [] },
  { card: 'thunder', count: 1, names: ['じろ'] },
];
const anonymous: PileView[] = named.map(({ card, count }) => ({ card, count }));

describe('RevealBoard の山', () => {
  it('Given 名前つき / When 描く / Then 山の下に出した人の名前（E8）と札の名前と数', () => {
    render(<RevealBoard method="weather" piles={named} />);
    const piles = screen.getAllByRole('listitem').filter((li) => li.classList.contains('pile'));
    expect(piles).toHaveLength(4);
    const sunny = piles[0]!;
    expect(within(sunny).getByText('晴れ')).toBeInTheDocument();
    expect(within(sunny).getByText('あや')).toBeInTheDocument();
    expect(within(sunny).getByText('ゆう')).toBeInTheDocument();
    expect(sunny.querySelectorAll('.pile-card')).toHaveLength(2);
  });

  it('Given 0 枚の山 / Then 点線の枠と 0 が出る', () => {
    render(<RevealBoard method="weather" piles={named} />);
    const rain = document.querySelectorAll('.pile')[2]!;
    expect(rain.classList.contains('pile--empty')).toBe(true);
    expect(rain.querySelector('.pile-ghost')).not.toBeNull();
    expect(rain.querySelector('.pile-count')?.textContent).toContain('0');
  });

  it('Given 匿名 / When 描く / Then 参加者の名前が山の中にも外にも無い', () => {
    const { container } = render(<RevealBoard method="weather" piles={anonymous} />);
    expect(container.textContent).not.toMatch(/あや|ゆう|はな|たろ|じろ/);
    expect(container.querySelector('.pile-names')).toBeNull();
  });

  it('Given 最多が同数で 2 つ / Then 2 つとも強調のクラス（m516）', () => {
    render(<RevealBoard method="weather" piles={named} />);
    const tops = [...document.querySelectorAll('.pile')].map((p) => p.classList.contains('pile--top'));
    expect(tops).toEqual([true, true, false, false]);
  });

  it('Given 全部 0 / Then 強調は無く、要約は「出した人はいません」', () => {
    render(<RevealBoard method="weather" piles={anonymous.map((p) => ({ ...p, count: 0 }))} />);
    expect(document.querySelector('.pile--top')).toBeNull();
    expect(screen.getByText('出した人はいません')).toBeInTheDocument();
  });

  it('Given 開いた / Then 1 行の要約が出る', () => {
    render(<RevealBoard method="weather" piles={named} />);
    expect(screen.getByText('晴れ・くもりが 2 人ずつ')).toBeInTheDocument();
  });
});

describe('開く動き（E12・m514）', () => {
  it('Given 通常 / Then 山の札に遅れが入り、動きのクラスが付く', () => {
    const { container } = render(<RevealBoard method="weather" piles={named} />);
    expect(container.querySelector('.reveal-board--run')).not.toBeNull();
    const delays = [...container.querySelectorAll<HTMLElement>('.pile-card')].map((c) => c.style.getPropertyValue('--d'));
    expect(delays).toEqual(['0ms', '90ms', '180ms', '270ms', '360ms']);
    // 札の名前は最初から出す（遅れて出るのは数・小札・要約だけ）
    expect(container.querySelector('.reveal-board')?.getAttribute('style')).toContain('--reveal-fade-at: 1210ms');
  });

  it('Given 動きを減らす設定 / Then 山の札に遅れも動きのクラスも無い', () => {
    stubReducedMotion(true);
    const { container } = render(<RevealBoard method="weather" piles={named} />);
    expect(container.querySelector('.reveal-board--run')).toBeNull();
    for (const card of container.querySelectorAll<HTMLElement>('.pile-card')) {
      expect(card.style.getPropertyValue('--d')).toBe(''); // 積み位置（--i）は動きではない
    }
    expect(container.textContent).toContain('晴れ');
  });
});

describe('卓に組んだ開いた後', () => {
  function enterRevealed(piles: PileView[], visibility: 'named' | 'anonymous' = 'named', method = 'weather') {
    saveResumeIdentity(RESUME);
    render(<CheckinRoom roomCode="R1" />);
    const s = openCheckin('sunny');
    const seats = [
      { id: 'p1', name: 'あや', played: true },
      { id: 'p2', name: 'ゆう', played: true },
    ];
    act(() => {
      latestSocket().open();
      latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      latestSocket().deliver(ROSTER_FRAME);
      latestSocket().deliver({ type: 'checkin', state: { ...s, round: { ...s.round, method, visibility, status: 'revealed', seq: 3, seats, piles } } });
    });
  }

  it('Given 開いた / Then 席の行に札の絵も札の名前も無い（m517）', () => {
    enterRevealed(named.slice(0, 2).map((p, i) => ({ ...p, count: 1, names: [i === 0 ? 'あや' : 'ゆう'] })));
    const seats = screen.getByRole('list', { name: '席' });
    expect(within(seats).getByText(/ゆう/)).toBeInTheDocument();
    expect(seats.querySelector('svg')).toBeNull();
    expect(seats.querySelector('.pile-card, .reveal-board')).toBeNull();
    // 席に開く動きは付かない（m517）: 動きのクラスも遅れも、席の側には無い
    expect(seats.querySelector('[class*="reveal"], [class*="pile"], [style*="--d"]')).toBeNull();
    expect(seats.closest('.reveal-board')).toBeNull();
    expect(seats.textContent).not.toMatch(/晴れ|くもり|雨|雷/);
  });

  it('Given 匿名で開いた / Then 席の行の外に席の名前が無く、席の行には残る', () => {
    enterRevealed(anonymous.map((p) => (p.card === 'sunny' ? { ...p, count: 2 } : { ...p, count: 0 })), 'anonymous');
    const seats = screen.getByRole('list', { name: '席' });
    expect(within(seats).getByText(/ゆう/)).toBeInTheDocument();
    const board = document.querySelector('.reveal-board')!;
    expect(board.textContent).not.toMatch(/あや|ゆう/);
    expect(board.querySelector('.pile-names')).toBeNull();
    const rest = (document.body.textContent ?? '').replace(seats.textContent ?? '', '');
    expect(rest).not.toMatch(/ゆう/);
  });

  it('Given 数のやり方 / Then 山の下に札の数字と凡例の意味が出る', () => {
    const piles = ['1', '2', '3', '4', '5'].map((card) => ({ card, count: card === '4' ? 2 : 0 }));
    enterRevealed(piles, 'anonymous', 'roti');
    const four = document.querySelectorAll('.pile')[3]!;
    expect(four.querySelector('.pile-name')?.textContent).toBe('4');
    expect(four.querySelector('.pile-meaning')?.textContent).toBe('得るものが多かった');
    expect(screen.getByText('いちばん多いのは 4')).toBeInTheDocument();
  });

  it('Given 通常のやり方 / Then 意味の行は出さない', () => {
    render(<RevealBoard method="weather" piles={named} />);
    expect(document.querySelector('.pile-meaning')).toBeNull();
  });

  it('Given 開いた / When もう一回を押す / Then seq を載せた again が送られる（E11）', () => {
    enterRevealed(named);
    fireEvent.click(screen.getByRole('button', { name: 'もう一回' }));
    expect(latestSocket().sentJson().filter((m) => m.command !== 'room.join')).toEqual([
      { command: 'checkin.again', seq: 3 },
    ]);
  });
});
