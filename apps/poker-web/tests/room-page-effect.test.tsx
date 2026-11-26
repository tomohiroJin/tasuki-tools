/**
 * 開票の演出（#639）の配線。投票中から開票を見届けたときだけ、結果の節に帯が出る。
 * 演出は見た目だけで、操作（再投票・次のアイテム）は受け付けたまま、フォーカスも動かさない。
 *
 * @requirements #639
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { clearResumeIdentity, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import type { RoomStateMessage } from '@tasuki/poker-core';
import { CUTIN_DURATION_MS } from '@tasuki/web-kit/room';
import { effectAnnounceDelay } from '../src/components/Results';
import { RoomPage } from '../src/pages/RoomPage';
import type { ConnectionStatus, PokerSync } from '../src/hooks/useSync';

const ROOM_ID = 'ABCD1234';

type Card = { kind: 'number'; value: 1 | 5 | 8 | 13 } | { kind: 'question' } | { kind: 'coffee' };
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
const bandTitle = () => band()?.querySelector('.results-effect-title')?.textContent;

beforeEach(() => {
  localStorage.clear();
  saveResumeIdentity({ code: ROOM_ID, participantId: 'p2', resumeToken: 'tok-2', displayName: 'みなと' });
});
afterEach(cleanup);

describe('RoomPage の開票の演出（#639）', () => {
  it.each([
    ['全員が同じ数字', [n(5), n(5), n(5)], 'unanimous', '全員同じ'],
    ['全員が休憩', [{ kind: 'coffee' }, { kind: 'coffee' }, { kind: 'coffee' }], 'break', '全員休憩'],
    ['3 段以上離れて割れた', [n(1), n(5), n(13)], 'split', '大きく割れた'],
    ['2 人がそろい 1 人だけ違う', [n(5), n(5), n(8)], 'near', 'ほぼ同じ'],
    ['? が混ざって出そろった', [n(5), n(5), { kind: 'question' }], 'complete', '全員出そろいました'],
  ] as const)('Given 投票中から開票を見届けた・%s / When 描く / Then 結果の節に「%s」の帯が出る', (_label, cards, effect, text) => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    expect(band()).toBeNull();
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([...cards]))} />);
    const el = band();
    expect(el?.querySelector('.results-effect-title')?.textContent).toBe(text);
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
    expect(bandTitle()).toBe('全員同じ');
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]), 'closed')} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(1), n(5), n(13)]))} />);
    expect(band()).toBeNull();
  });

  it('Given 一致の開票を見届けた / When 接続が切れて同じ公開済みのまま戻る / Then 切れた時点で帯を捨て、投票中を見るまで出さない', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    expect(bandTitle()).toBe('全員同じ');
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]), 'closed')} />);
    expect(band()).toBeNull();
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    expect(band()).toBeNull();
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    expect(bandTitle()).toBe('全員同じ');
  });

  it('Given 投票中を見ていて接続が切れ、再接続の直後は切れる前の古い状態のまま / When 入り直した後の最初の状態が開票済みで届く / Then 開票を見届けていないので帯は出ない', () => {
    const stale = voting();
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(stale)} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(stale, 'closed')} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(stale)} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    expect(screen.getByRole('heading', { name: '結果' })).toBeTruthy();
    expect(band()).toBeNull();
  });

  it('Given 再接続の後 / When 入り直した後の状態で投票中を見てから開票される / Then 帯は出る', () => {
    const stale = voting();
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(stale)} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(stale, 'closed')} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(stale)} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    expect(bandTitle()).toBe('全員同じ');
  });

  it('Given 一致の開票を見届けた / When 投票中を挟まず別の回の開票済みが届く / Then 前の回の帯は残らない', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    expect(bandTitle()).toBe('全員同じ');
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(1), n(5), n(13)]))} />);
    expect(band()).toBeNull();
  });

  it('Given 3 人が出して開票（出そろい） / When 開票後に切れた人が名簿から外され、票が減った開票済みが届く / Then 同じ回なので帯は消えない', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    const snap = revealed([n(5), n(5), { kind: 'question' }]);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(snap)} />);
    expect(bandTitle()).toBe('全員出そろいました');
    if (snap.round.status !== 'revealed') throw new Error('revealed の造作ではない');
    const cut = { ...snap, participants: people.map((p) => (p.id === 'p3' ? { ...p, connected: false } : p)) };
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(cut)} />);
    const removed = {
      ...snap,
      participants: people.filter((p) => p.id !== 'p3'),
      round: { ...snap.round, votes: snap.round.votes.filter((v) => v.participantId !== 'p3') },
    } as RoomStateMessage;
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(removed)} />);
    expect(bandTitle()).toBe('全員出そろいました');
  });

  it('Given 一致の開票を見届けた / When 同じ回の開票済みが名簿だけ変わって届く / Then 帯は残る', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealed([n(5), n(5), n(5)]))} />);
    expect(bandTitle()).toBe('全員同じ');
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
    const snap = revealed([n(5), n(5), { kind: 'question' }]);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(snap)} />);
    expect(bandTitle()).toBe('全員出そろいました');
    const after = {
      ...snap,
      participants: [...people, { id: 'p4', name: 'ひなた', connected: true, hasVoted: false, spectator: false }],
    };
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(after)} />);
    expect(bandTitle()).toBe('全員出そろいました');
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

// ---------- カットイン（#670） ----------

const cutin = () => document.body.querySelector<HTMLElement>(':scope > .ui-cutin');
/** 札がめくれ終わる待ち（3 席・札がめくれる公開）。`effectAnnounceDelay` と同じ */
const FLIP_WAIT_MS = effectAnnounceDelay(3, true);

function stubMedia(reduced: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

describe('RoomPage のカットイン（#670）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubMedia(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const revealOf = (cards: [Card, Card, Card], estimate?: RoomStateMessage['estimate']): RoomStateMessage => ({
    ...revealed(cards),
    ...(estimate ? { estimate } : {}),
  });

  it('Given 投票中から開票を見届けた / When 描く / Then 札がめくれ終わるまで出ず、後に題・見出し・色つきで 1 回出て、決まった長さの後に消える', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealOf([n(5), n(5), n(5)]))} />);
    expect(cutin()).toBeNull();
    act(() => void vi.advanceTimersByTime(FLIP_WAIT_MS - 1));
    expect(cutin()).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(cutin()?.querySelector('.ui-cutin__title')?.textContent).toBe('全員同じ');
    expect(cutin()?.querySelector('.ui-cutin__kicker')?.textContent).toBe('PLANNING POKER');
    expect(cutin()?.getAttribute('data-tone')).toBe('gold');
    act(() => void vi.advanceTimersByTime(CUTIN_DURATION_MS));
    expect(cutin()).toBeNull();
    // 終わった後も静かな帯は残る
    expect(bandTitle()).toBe('全員同じ');
  });

  it.each([
    ['全員休憩', [{ kind: 'coffee' }, { kind: 'coffee' }, { kind: 'coffee' }], 'ivory', 'ひと休みしよう'],
    ['大きく割れた', [n(1), n(5), n(13)], 'rose', '上と下の見方を話そう'],
    ['ほぼ同じ', [n(5), n(5), n(8)], 'gold', undefined],
    ['全員出そろいました', [n(5), n(5), { kind: 'question' }], 'jade', undefined],
  ] as const)('Given 場面「%s」 / When 開票を見届ける / Then 色 %s と添え書きが cue に載る', (title, cards, tone, sub) => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealOf([...cards]))} />);
    act(() => void vi.advanceTimersByTime(FLIP_WAIT_MS));
    expect(cutin()?.querySelector('.ui-cutin__title')?.textContent).toBe(title);
    expect(cutin()?.getAttribute('data-tone')).toBe(tone);
    expect(cutin()?.querySelector('.ui-cutin__sub')?.textContent).toBe(sub);
  });

  it('Given 最初から開票済みで描いた（再読み込み・途中入室） / When 待つ / Then カットインは出ない', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(revealOf([n(5), n(5), n(5)]))} />);
    act(() => void vi.advanceTimersByTime(FLIP_WAIT_MS + CUTIN_DURATION_MS));
    expect(cutin()).toBeNull();
  });

  it('Given 手動で先に開票した回（出していない人が居る） / When 待つ / Then 出ない', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    const snap = revealed([n(5), n(8), n(8)]);
    if (snap.round.status !== 'revealed') throw new Error('revealed の造作ではない');
    snap.round.votes = snap.round.votes.slice(0, 2);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(snap)} />);
    act(() => void vi.advanceTimersByTime(FLIP_WAIT_MS + 10));
    expect(cutin()).toBeNull();
  });

  it('Given 出している最中 / When 同じ回の状態が何度も届く / Then 出し直さず、決まった長さで消える（毎描画で cue を作り直さない）', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealOf([n(5), n(5), n(5)]))} />);
    act(() => void vi.advanceTimersByTime(FLIP_WAIT_MS));
    expect(cutin()).not.toBeNull();
    act(() => void vi.advanceTimersByTime(CUTIN_DURATION_MS / 2));
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealOf([n(5), n(5), n(5)]))} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealOf([n(5), n(5), n(5)]))} />);
    act(() => void vi.advanceTimersByTime(CUTIN_DURATION_MS / 2));
    expect(cutin()).toBeNull();
    // 消えた後に同じ回の状態が届いても出し直さない
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealOf([n(5), n(5), n(5)]))} />);
    act(() => void vi.advanceTimersByTime(FLIP_WAIT_MS + 10));
    expect(cutin()).toBeNull();
  });

  it('Given 最中でも / When 再投票・次のアイテムを押す / Then ボタンは押せ、層はフォーカスを持たない', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealOf([n(5), n(5), n(5)]))} />);
    act(() => void vi.advanceTimersByTime(FLIP_WAIT_MS));
    expect(cutin()).not.toBeNull();
    expect(cutin()?.getAttribute('aria-hidden')).toBe('true');
    expect(cutin()?.querySelector('a, button, input, [tabindex]')).toBeNull();
    for (const name of ['再投票', '次のアイテムへ']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it('Given 同じ票の開票 / When 再投票してもう一度開票する / Then 毎回新しく出る（最中に再投票しても次の開票で出る）', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealOf([n(5), n(5), n(5)]))} />);
    act(() => void vi.advanceTimersByTime(FLIP_WAIT_MS));
    expect(cutin()).not.toBeNull();
    // 最中に再投票: 前の分はすぐ消える
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    expect(cutin()).toBeNull();
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealOf([n(5), n(5), n(5)]))} />);
    expect(cutin()).toBeNull();
    act(() => void vi.advanceTimersByTime(FLIP_WAIT_MS));
    expect(cutin()?.querySelector('.ui-cutin__title')?.textContent).toBe('全員同じ');
    // 終わってからの再投票でも、もう一度出る
    act(() => void vi.advanceTimersByTime(CUTIN_DURATION_MS));
    expect(cutin()).toBeNull();
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealOf([n(5), n(5), n(5)]))} />);
    act(() => void vi.advanceTimersByTime(FLIP_WAIT_MS));
    expect(cutin()).not.toBeNull();
  });

  it('Given 動きを減らす設定 / When 開票を見届ける / Then 層は出ず、静かな帯と読み上げの知らせは出る', () => {
    stubMedia(true);
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealOf([n(5), n(5), n(5)]))} />);
    act(() => void vi.advanceTimersByTime(FLIP_WAIT_MS + CUTIN_DURATION_MS));
    expect(cutin()).toBeNull();
    expect(bandTitle()).toBe('全員同じ');
    expect(document.querySelector('.results-effect-live')?.textContent).toBe('全員同じ');
  });

  const logOf = (n5: number): NonNullable<RoomStateMessage['estimate']>['log'] => [
    {
      id: 1,
      item: '',
      points: null,
      open: true,
      entries: Array.from({ length: n5 }, (_, i) => ({ attempt: i + 1, at: 0, counts: [{ card: { kind: 'number' as const, value: 5 as const }, count: 3 }] })),
    },
  ];

  it('Given 全員同じが 3 回続いた記録（記録する） / When 開票を見届ける / Then 添え書きは「3 回続けて」で、読み上げも続けて読む', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealOf([n(5), n(5), n(5)], { item: '', log: logOf(3), recording: true }))} />);
    act(() => void vi.advanceTimersByTime(FLIP_WAIT_MS));
    expect(cutin()?.querySelector('.ui-cutin__sub')?.textContent).toBe('3 回続けて');
    expect(document.querySelector('.results-effect-live')?.textContent).toBe('全員同じ。3 回続けて');
    // 開票の後の記録の変化（ここでは記録が伸びる）で添え書きは変えない
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealOf([n(5), n(5), n(5)], { item: '', log: logOf(4), recording: true }))} />);
    expect(cutin()?.querySelector('.ui-cutin__sub')?.textContent).toBe('3 回続けて');
  });

  it('Given 記録しない・または今回だけ / When 全員同じを見届ける / Then 添え書きは出ない', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealOf([n(5), n(5), n(5)], { item: '', log: logOf(3), recording: false }))} />);
    act(() => void vi.advanceTimersByTime(FLIP_WAIT_MS));
    expect(cutin()?.querySelector('.ui-cutin__sub')).toBeNull();
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(voting())} />);
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(revealOf([n(5), n(5), n(5)], { item: '', log: logOf(1), recording: true }))} />);
    act(() => void vi.advanceTimersByTime(FLIP_WAIT_MS + CUTIN_DURATION_MS));
    act(() => void vi.advanceTimersByTime(0));
    expect(document.querySelector('.results-effect-sub')).toBeNull();
  });
});
