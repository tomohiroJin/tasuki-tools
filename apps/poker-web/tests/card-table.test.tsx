/**
 * テーブルの部品（#403・設計 §5.2）。
 *
 * @requirements #403 G-3 G-4 G-7 G-9 G-10 G-12
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ParticipantView, PlayingCard, TableView } from '@tasuki/poker-core';
import { CardTable } from '../src/components/CardTable';

afterEach(cleanup);

const people: ParticipantView[] = [
  { id: 'p1', name: 'あかり', connected: true, hasVoted: true, spectator: false },
  { id: 'p2', name: 'みなと', connected: true, hasVoted: true, spectator: false },
  { id: 'p3', name: 'いずみ', connected: true, hasVoted: false, spectator: true },
];
const royal: PlayingCard[] = ([14, 13, 12, 11, 10] as const).map((rank) => ({ suit: 'H', rank }));
const low: PlayingCard[] = ([2, 4, 6, 8, 10] as const).map((rank, i) => ({ suit: i === 0 ? 'C' : 'S', rank }));

function renderTable(table: TableView, you = 'p1', disabled = false) {
  const handlers = { onExchange: vi.fn(), onDealAgain: vi.fn(), onClose: vi.fn() };
  const view = render(<CardTable table={table} participants={people} you={you} disabled={disabled} {...handlers} />);
  const update = (next: TableView) =>
    view.rerender(<CardTable table={next} participants={people} you={you} disabled={disabled} {...handlers} />);
  return { ...handlers, update };
}

const exchanging = (exchanged: Record<string, boolean> = {}, yourHand: PlayingCard[] | null = royal): TableView => ({
  status: 'exchanging',
  players: [
    { participantId: 'p1', exchanged: exchanged.p1 ?? false },
    { participantId: 'p2', exchanged: exchanged.p2 ?? false },
  ],
  yourHand,
  hands: [],
});

const myCards = () => within(screen.getByRole('group', { name: 'あなたの手' })).getAllByRole('button');

describe('チェンジ（#403 G-4）', () => {
  it('Given 配られた / When 描く / Then 見出し・案内・自分の 5 枚が押せる札で並ぶ', () => {
    renderTable(exchanging());
    expect(screen.getByRole('heading', { name: 'トランプのポーカー' })).toBeTruthy();
    expect(screen.getByText('チェンジするカードを選んでください（1 回だけ）')).toBeTruthy();
    expect(myCards().map((b) => b.getAttribute('aria-label'))).toEqual(['ハートのA', 'ハートのK', 'ハートのQ', 'ハートのJ', 'ハートの10']);
  });

  it('Given 何も選ばない / When 「このまま」 / Then 空のチェンジを送る', () => {
    const { onExchange } = renderTable(exchanging());
    fireEvent.click(screen.getByRole('button', { name: 'このまま' }));
    expect(onExchange).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('Given 0 番と 3 番を選ぶ / When チェンジする / Then 選んだ札が持ち上がり、その位置を送る', () => {
    const { onExchange } = renderTable(exchanging());
    fireEvent.click(myCards()[3]!);
    fireEvent.click(myCards()[0]!);
    expect(myCards().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'true', 'false']);
    fireEvent.click(screen.getByRole('button', { name: 'チェンジする（2）' }));
    // 位置は押した順のまま送る（サーバーは順不同で受ける）
    expect(onExchange).toHaveBeenCalledOnce();
    expect([...onExchange.mock.calls[0]![0]].sort()).toEqual([0, 3]);
  });

  it('Given 選んだ札 / When もう一度押す / Then 選びが外れる', () => {
    renderTable(exchanging());
    fireEvent.click(myCards()[1]!);
    fireEvent.click(myCards()[1]!);
    expect(myCards()[1]!.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'このまま' })).toBeTruthy();
  });

  it('Given 自分が済んだ / When 描く / Then 札は押せず、待っていると伝え、他の人の済んだかが見える', () => {
    renderTable(exchanging({ p1: true }));
    expect(screen.getByText('ほかの人のチェンジを待っています')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'あなたの手' })).toBeNull();
    expect(screen.getByRole('list', { name: 'あなたの手' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'このまま' })).toBeNull();
    const seat = screen.getByRole('listitem', { name: 'みなとの手' });
    expect(within(seat).getByText('チェンジ中')).toBeTruthy();
  });

  it('Given 他の人の手 / When 開く前 / Then 裏向きの 5 枚だけ（G-3）', () => {
    renderTable(exchanging({ p2: true }));
    const seat = screen.getByRole('listitem', { name: 'みなとの手' });
    expect(within(seat).getAllByRole('img', { name: 'ふせたカード' })).toHaveLength(5);
    expect(within(seat).getByText('チェンジ済み')).toBeTruthy();
  });

  it('Given プレイヤーでない（見学） / When 描く / Then 加わっていないと伝え、手は無い（G-12）', () => {
    renderTable(exchanging({}, null), 'p3');
    expect(screen.getByText('この手には加わっていません')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'あなたの手' })).toBeNull();
    expect(screen.getAllByRole('img', { name: 'ふせたカード' })).toHaveLength(10);
  });

  it('Given 最中 / When 「見積もりに戻る」 / Then 戻す（G-10）', () => {
    const { onClose } = renderTable(exchanging());
    fireEvent.click(screen.getByRole('button', { name: '見積もりに戻る' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Given 切断中 / When 描く / Then 操作は押せない', () => {
    renderTable(exchanging(), 'p1', true);
    expect((screen.getByRole('button', { name: 'このまま' }) as HTMLButtonElement).disabled).toBe(true);
    expect((myCards()[0] as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('開いたあと（#403 G-7・G-9）', () => {
  const shown: TableView = {
    status: 'shown',
    players: [
      { participantId: 'p1', exchanged: true },
      { participantId: 'p2', exchanged: true },
    ],
    yourHand: royal,
    hands: [
      { participantId: 'p1', cards: royal, category: 'royal-flush' },
      { participantId: 'p2', cards: low, category: 'high-card' },
    ],
  };

  it('Given 開いた / When 描く / Then 全員の表の札と役。勝ち負けの印は無い', () => {
    renderTable(shown);
    expect(screen.getByText('全員の手が開きました')).toBeTruthy();
    const mine = screen.getByRole('listitem', { name: 'あかりの手' });
    expect(within(mine).getByText('ロイヤルストレートフラッシュ')).toBeTruthy();
    const other = screen.getByRole('listitem', { name: 'みなとの手' });
    expect(within(other).getByText('ハイカード')).toBeTruthy();
    expect(within(other).getAllByRole('img').map((i) => i.getAttribute('aria-label'))).toEqual([
      'クラブの2',
      'スペードの4',
      'スペードの6',
      'スペードの8',
      'スペードの10',
    ]);
    expect(screen.queryByText(/強い|勝ち/)).toBeNull();
  });

  it('Given 開いた / When 「もう一度」 / Then 配り直しを頼む', () => {
    const { onDealAgain } = renderTable(shown);
    fireEvent.click(screen.getByRole('button', { name: 'もう一度' }));
    expect(onDealAgain).toHaveBeenCalledOnce();
  });

  it('Given 開いた / When 「見積もりに戻る」 / Then 戻す', () => {
    const { onClose } = renderTable(shown);
    fireEvent.click(screen.getByRole('button', { name: '見積もりに戻る' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('二重送信を防ぐ（#403）', () => {
  it('Given チェンジを押した / When サーバーの返事より先にもう一度押す / Then 1 回しか送らず、操作は押せない', () => {
    const { onExchange } = renderTable(exchanging());
    const keep = screen.getByRole('button', { name: 'このまま' });
    fireEvent.click(keep);
    fireEvent.click(keep);
    expect(onExchange).toHaveBeenCalledOnce();
    expect((keep as HTMLButtonElement).disabled).toBe(true);
    expect((myCards()[0] as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '見積もりに戻る' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Given 押したあと / When サーバーから新しい状態が届く / Then また押せる', () => {
    const { onClose, update } = renderTable(exchanging());
    fireEvent.click(screen.getByRole('button', { name: 'このまま' }));
    update(exchanging({ p1: true }));
    const back = screen.getByRole('button', { name: '見積もりに戻る' }) as HTMLButtonElement;
    expect(back.disabled).toBe(false);
    fireEvent.click(back);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Given 開いたあと / When 「もう一度」を 2 回押す / Then 1 回しか送らない', () => {
    const shown: TableView = {
      status: 'shown',
      players: [{ participantId: 'p1', exchanged: true }],
      yourHand: royal,
      hands: [{ participantId: 'p1', cards: royal, category: 'royal-flush' }],
    };
    const { onDealAgain } = renderTable(shown);
    const again = screen.getByRole('button', { name: 'もう一度' });
    fireEvent.click(again);
    fireEvent.click(again);
    expect(onDealAgain).toHaveBeenCalledOnce();
  });
});

describe('扇の形（#403）', () => {
  it('Given 他の人の伏せた 5 枚 / When 描く / Then 真ん中からの離れ（0〜2）を値で渡す（CSS の abs() に頼らない）', () => {
    renderTable(exchanging());
    const seat = screen.getByRole('listitem', { name: 'みなとの手' });
    const cards = [...seat.querySelectorAll<HTMLElement>('.ct-card')];
    expect(cards.map((c) => c.style.getPropertyValue('--d'))).toEqual(['2', '1', '0', '1', '2']);
  });
});

