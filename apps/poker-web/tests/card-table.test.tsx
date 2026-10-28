/**
 * テーブルの部品（#403・設計 §5.2）。
 *
 * @requirements #403 T-3 T-5 T-10
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ParticipantView, PlayingCard, TableView } from '@tasuki/poker-core';
import { CardTable } from '../src/components/CardTable';

afterEach(cleanup);

const people: ParticipantView[] = [
  { id: 'p1', name: 'あかり', connected: true, hasVoted: false, spectator: false },
  { id: 'p2', name: 'みなと', connected: true, hasVoted: false, spectator: false },
];
const royal: PlayingCard[] = [14, 13, 12, 11, 10].map((rank) => ({ suit: 'H', rank }) as PlayingCard);
const low: PlayingCard[] = [2, 4, 6, 8, 10].map((rank, i) => ({ suit: i === 0 ? 'C' : 'S', rank }) as PlayingCard);

function renderTable(table: TableView, disabled = false) {
  const handlers = { onDeal: vi.fn(), onShow: vi.fn(), onLeave: vi.fn() };
  render(<CardTable table={table} participants={people} you="p1" disabled={disabled} {...handlers} />);
  return handlers;
}

describe('CardTable（#403）', () => {
  it('Given 配る前 / When 描く / Then 見出し・案内・「カードを引く」と「閉じる」がある', () => {
    const { onDeal, onLeave } = renderTable({ status: 'idle', seats: ['p1', 'p2'], yourHand: null, hands: [], winners: [] });
    expect(screen.getByRole('heading', { name: 'トランプのポーカー' })).toBeTruthy();
    expect(screen.getByText('カードを引くと、テーブルの全員に 5 つずつ回ります。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '見せる' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'カードを引く' }));
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onDeal).toHaveBeenCalledOnce();
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('Given 配られている / When 描く / Then 自分の 5 枚が読み上げ名つきで並び、「見せる」がある', () => {
    const { onShow } = renderTable({ status: 'dealt', seats: ['p1', 'p2'], yourHand: royal, hands: [], winners: [] });
    const hand = screen.getByRole('list', { name: 'あなたの手' });
    const cards = within(hand).getAllByRole('listitem');
    expect(cards.map((c) => c.textContent)).toEqual(['A♥', 'K♥', 'Q♥', 'J♥', '10♥']);
    expect(cards[0]?.getAttribute('aria-label')).toBe('ハートのA');
    expect(cards[0]?.getAttribute('data-suit')).toBe('H');
    expect(screen.queryByRole('button', { name: 'カードを引く' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '見せる' }));
    expect(onShow).toHaveBeenCalledOnce();
  });

  it('Given 配ったあとに着いた（手が無い） / When 描く / Then 次の手から加わると伝える', () => {
    renderTable({ status: 'dealt', seats: ['p2', 'p1'], yourHand: null, hands: [], winners: [] });
    expect(screen.getByText('次の手から加わります。')).toBeTruthy();
  });

  it('Given 見せたあと / When 描く / Then 席ごとの名前・手・役と、いちばん強い手の印。「カードを引く」に戻る', () => {
    renderTable({
      status: 'shown',
      seats: ['p1', 'p2'],
      yourHand: royal,
      hands: [
        { participantId: 'p1', cards: royal, category: 'royal-flush' },
        { participantId: 'p2', cards: low, category: 'high-card' },
      ],
      winners: ['p1'],
    });
    const results = screen.getByRole('list', { name: 'みんなの手' });
    const rows = within(results).getAllByRole('listitem', { name: /の手$/ });
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('あかり')).toBeTruthy();
    expect(within(rows[0]!).getByText('ロイヤルストレートフラッシュ')).toBeTruthy();
    expect(within(rows[0]!).getByText('いちばん強い手')).toBeTruthy();
    expect(within(rows[1]!).getByText('ハイカード')).toBeTruthy();
    expect(within(rows[1]!).queryByText('いちばん強い手')).toBeNull();
    expect(screen.getByRole('button', { name: 'カードを引く' })).toBeTruthy();
  });

  it('Given 切断中 / When 描く / Then 操作は押せない', () => {
    renderTable({ status: 'idle', seats: ['p1'], yourHand: null, hands: [], winners: [] }, true);
    expect((screen.getByRole('button', { name: 'カードを引く' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '閉じる' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
