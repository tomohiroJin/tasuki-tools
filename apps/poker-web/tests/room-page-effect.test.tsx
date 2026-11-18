/**
 * 開票の演出（#639）の配線。投票中から開票を見届けたときだけ、結果の節に帯が出る。
 * 演出は見た目だけで、操作（再投票・次のアイテム）は受け付けたまま、フォーカスも動かさない。
 *
 * @requirements #639
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { clearResumeIdentity, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import type { RoomStateMessage } from '@tasuki/poker-core';
import { RoomPage } from '../src/pages/RoomPage';
import type { ConnectionStatus, PokerSync } from '../src/hooks/useSync';

const ROOM_ID = 'ABCD1234';

type Card = { kind: 'number'; value: 1 | 5 | 8 | 13 } | { kind: 'question' };
const n = (value: 1 | 5 | 8 | 13): Card => ({ kind: 'number', value });

const people = [
  { id: 'p1', name: 'あかり', connected: true, hasVoted: true, spectator: false },
  { id: 'p2', name: 'みなと', connected: true, hasVoted: true, spectator: false },
  { id: 'p3', name: 'いずみ', connected: true, hasVoted: true, spectator: false },
];

function voting(): RoomStateMessage {
  return { type: 'room-state', roomId: ROOM_ID, you: 'p2', participants: people, round: { status: 'voting' }, yourVote: null } as RoomStateMessage;
}

function revealed(cards: [Card, Card, Card]): RoomStateMessage {
  return {
    type: 'room-state',
    roomId: ROOM_ID,
    you: 'p2',
    participants: people,
    round: {
      status: 'revealed',
      votes: cards.map((card, i) => ({ participantId: `p${i + 1}`, card })),
      stats: { average: 0, modes: [] },
    },
    yourVote: null,
  } as RoomStateMessage;
}

function makeSync(snapshot: RoomStateMessage, status: ConnectionStatus = 'open'): PokerSync {
  return {
    status,
    everConnected: true,
    failedAttempts: 0,
    storedIdentity: loadResumeIdentity,
    forgetIdentity: clearResumeIdentity,
    inviteUrl: (roomId: string) => `https://example.test/?room=${roomId}`,
    snapshot,
    topic: null,
    joinedThisConnection: true,
    error: null,
    syncStale: false,
    notice: 'none',
    clearError: () => {},
    joinRoom: () => {},
    checkRoom: () => {},
    vote: () => {},
    reveal: () => {},
    setItem: () => {},
    revote: () => {},
    nextItem: () => {},
    setPoints: () => {},
    setSpectator: () => {},
    removeParticipant: () => {},
    exchangeCards: () => {},
    dealAgain: () => {},
    closeGame: () => {},
    departed: null,
    setRecording: () => {},
    renameGroup: () => {},
  };
}

const band = () => document.querySelector<HTMLElement>('.results-effect');

beforeEach(() => {
  localStorage.clear();
  saveResumeIdentity({ code: ROOM_ID, participantId: 'p2', resumeToken: 'tok-2', displayName: 'みなと' });
});
afterEach(cleanup);

describe('RoomPage の開票の演出（#639）', () => {
  it.each([
    ['全員が同じ数字', [n(5), n(5), n(5)], 'unanimous', '全員同じ'],
    ['全員が違う数字', [n(1), n(5), n(13)], 'scattered', '全員バラバラ'],
    ['全員が出して 2 組に割れた', [n(5), n(5), n(13)], 'complete', '全員出そろいました'],
  ] as const)('Given 投票中から開票を見届けた・%s / When 描く / Then 結果の節に「%s」の帯が出る', (_label, cards, effect, text) => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    expect(band()).toBeNull();
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([...cards]))} />);
    const el = band();
    expect(el?.textContent).toBe(text);
    expect(el?.getAttribute('data-effect')).toBe(effect);
    expect(el?.closest('.results')).not.toBeNull();
  });

  it('Given 最初から開票済みで描いた（再読み込み・途中入室） / When 描く / Then 帯は出ない', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    expect(screen.getByRole('heading', { name: '結果' })).toBeTruthy();
    expect(band()).toBeNull();
  });

  it('Given 接続前（状態がまだ無い）から開票済みの状態が届いた（再読み込み・途中入室） / When 描く / Then 帯は出ない', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={{ ...makeSync(voting()), snapshot: null }} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    expect(screen.getByRole('heading', { name: '結果' })).toBeTruthy();
    expect(band()).toBeNull();
  });

  it('Given 一致の開票を見届けた / When 接続が切れ、戻ったら別の回の開票済みが届く / Then 前の回の帯は残らず、見届けていない開票なので帯は出ない', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    expect(band()?.textContent).toBe('全員同じ');
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]), 'closed')} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(1), n(5), n(13)]))} />);
    expect(band()).toBeNull();
  });

  it('Given 一致の開票を見届けた / When 接続が切れて同じ公開済みのまま戻る / Then 切れた時点で帯を捨て、投票中を見るまで出さない', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    expect(band()?.textContent).toBe('全員同じ');
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]), 'closed')} />);
    expect(band()).toBeNull();
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    expect(band()).toBeNull();
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    expect(band()?.textContent).toBe('全員同じ');
  });

  it('Given 一致の開票を見届けた / When 投票中を挟まず別の回の開票済みが届く / Then 前の回の帯は残らない', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    expect(band()?.textContent).toBe('全員同じ');
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(1), n(5), n(13)]))} />);
    expect(band()).toBeNull();
  });

  it('Given 3 人が出して開票（出そろい） / When 開票後に切れた人が名簿から外され、票が減った開票済みが届く / Then 同じ回なので帯は消えない', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    const snap = revealed([n(5), n(5), n(13)]);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(snap)} />);
    expect(band()?.textContent).toBe('全員出そろいました');
    if (snap.round.status !== 'revealed') throw new Error('revealed の造作ではない');
    const cut = { ...snap, participants: people.map((p) => (p.id === 'p3' ? { ...p, connected: false } : p)) };
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(cut)} />);
    const removed = {
      ...snap,
      participants: people.filter((p) => p.id !== 'p3'),
      round: { ...snap.round, votes: snap.round.votes.filter((v) => v.participantId !== 'p3') },
    } as RoomStateMessage;
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(removed)} />);
    expect(band()?.textContent).toBe('全員出そろいました');
  });

  it('Given 一致の開票を見届けた / When 同じ回の開票済みが名簿だけ変わって届く / Then 帯は残る', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    expect(band()?.textContent).toBe('全員同じ');
  });

  it('Given 一致の開票 / When 再投票して同じ票でもう一度開票する / Then 帯は毎回、新しく出る', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    const first = band();
    expect(first).not.toBeNull();
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    expect(band()).toBeNull();
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    const second = band();
    expect(second?.textContent).toBe('全員同じ');
    // 作り直されるので、CSS の動きも毎回始まる
    expect(second).not.toBe(first);
  });

  it('Given 一致の演出の最中 / When 描く / Then 再投票・次のアイテムのボタンは押せて、フォーカスは奪われない', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    const focusTarget = screen.getByRole('button', { name: '票を公開する' });
    focusTarget.focus();
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    expect(band()).not.toBeNull();
    for (const name of ['再投票', '次のアイテムへ']) {
      const button = screen.getByRole('button', { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      expect(button.closest('[inert]')).toBeNull();
    }
    // 帯はボタンの外にあり、フォーカスを受ける要素ではない
    expect(band()?.hasAttribute('tabindex')).toBe(false);
    expect(band()?.querySelector('a, button, input, [tabindex]')).toBeNull();
    expect(document.activeElement).not.toBe(band());
  });

  it('Given 3 人のうち 1 人が出さないまま手動で開票 / When その人が切断する / Then 帯は後から出ない（開票の瞬間の事実で決める）', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    const snap = revealed([n(5), n(8), n(8)]);
    if (snap.round.status !== 'revealed') throw new Error('revealed の造作ではない');
    snap.round.votes = snap.round.votes.slice(0, 2);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(snap)} />);
    expect(band()).toBeNull();
    const after = { ...snap, participants: people.map((p) => (p.id === 'p3' ? { ...p, connected: false } : p)) };
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(after)} />);
    expect(band()).toBeNull();
  });

  it('Given 3 人が出して自動開票（出そろい） / When 4 人目が入室する / Then 帯は消えない', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    const snap = revealed([n(5), n(5), n(13)]);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(snap)} />);
    expect(band()?.textContent).toBe('全員出そろいました');
    const after = {
      ...snap,
      participants: [...people, { id: 'p4', name: 'ひなた', connected: true, hasVoted: false, spectator: false }],
    };
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(after)} />);
    expect(band()?.textContent).toBe('全員出そろいました');
  });

  it('Given 演出が出る開票 / When 描く / Then 統計と最頻値は演出の有無で変わらない', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    const snap = revealed([n(5), n(5), n(5)]);
    if (snap.round.status !== 'revealed') throw new Error('revealed の造作ではない');
    snap.round.stats = { average: 5, modes: [n(5)] };
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(snap)} />);
    expect(band()).not.toBeNull();
    expect(screen.getByText('平均').nextElementSibling?.textContent).toBe('5');
    expect(screen.getByText('最頻値').nextElementSibling?.textContent).toBe('5');
  });
});
