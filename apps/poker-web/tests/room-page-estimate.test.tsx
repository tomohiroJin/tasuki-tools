/**
 * 開票後の 2 操作とアイテム名の欄・記録の欄（#93・spec §4.3）。
 *
 * @requirements #93
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { clearResumeIdentity, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import type { RoomStateMessage } from '@tasuki/poker-core';
import { RoomPage } from '../src/pages/RoomPage';
import type { PokerSync } from '../src/hooks/useSync';
import {
  ESTIMATE_ITEM_LABEL,
  ESTIMATE_LOG_EMPTY,
  ESTIMATE_LOG_HEADING,
  ESTIMATE_POINTS_LABEL,
  NEXT_ITEM,
  RECORDING_TOGGLE,
  REVOTE,
} from '../src/estimate-copy';

const ROOM_ID = 'ABCD1234';
const participants = [
  { id: 'p1', name: 'あかり', connected: true, hasVoted: true, spectator: false },
  { id: 'p2', name: 'みなと', connected: true, hasVoted: true, spectator: false },
];

// 開票後にポイントの欄を出すには、記録に open の束が要る（J8）
const OPEN_GROUP = { id: 1, item: 'PROJ-1', points: null, open: true, entries: [] };

function snapshot(status: 'voting' | 'revealed', withEstimate = true, recording = true): RoomStateMessage {
  const base = { type: 'room-state', roomId: ROOM_ID, you: 'p2', participants, yourVote: null } as const;
  const round =
    status === 'voting'
      ? { status: 'voting' as const }
      : {
          status: 'revealed' as const,
          votes: [{ participantId: 'p1', card: { kind: 'number' as const, value: 5 as const } }],
          stats: { average: 5, modes: [{ kind: 'number' as const, value: 5 as const }] },
        };
  return {
    ...base,
    round,
    ...(withEstimate ? { estimate: { item: 'PROJ-1', recording, log: [OPEN_GROUP] } } : {}),
  } as RoomStateMessage;
}

function makeSync(snap: RoomStateMessage, over: Partial<PokerSync> = {}): PokerSync {
  return {
    status: 'open',
    everConnected: true,
    failedAttempts: 0,
    storedIdentity: loadResumeIdentity,
    forgetIdentity: clearResumeIdentity,
    inviteUrl: (id: string) => `https://example.test/?room=${id}`,
    snapshot: snap,
    topic: null,
    joinedThisConnection: true,
    error: null,
    syncStale: false,
    clearError: () => {},
    joinRoom: () => {},
    checkRoom: () => {},
    vote: () => {},
    reveal: () => {},
    setItem: vi.fn(),
    revote: vi.fn(),
    nextItem: vi.fn(),
    setPoints: vi.fn(),
    setSpectator: vi.fn(),
    removeParticipant: vi.fn(),
    setRecording: vi.fn(),
    renameGroup: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  saveResumeIdentity({ code: ROOM_ID, participantId: 'p2', resumeToken: 'tok-2', displayName: 'みなと' });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('開票後の操作', () => {
  it('再投票が主で最後、その前に ポイント（任意） と 次のアイテムへ', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(snapshot('revealed'))} />);
    const dock = document.querySelector('.ui-actions--dock')!;
    const controls = Array.from(dock.querySelectorAll('select, button'));
    expect(controls.map((el) => el.getAttribute('aria-label') ?? el.textContent)).toEqual([
      ESTIMATE_POINTS_LABEL,
      NEXT_ITEM,
      REVOTE,
    ]);
    const revote = screen.getByRole('button', { name: REVOTE });
    expect(revote.className).not.toContain('secondary');
    expect(screen.getByRole('button', { name: NEXT_ITEM }).className).toContain('secondary');
  });

  it('再投票 → revote が 1 回', () => {
    const sync = makeSync(snapshot('revealed'));
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);
    fireEvent.click(screen.getByRole('button', { name: REVOTE }));
    expect(sync.revote).toHaveBeenCalledTimes(1);
    expect(sync.nextItem).not.toHaveBeenCalled();
  });

  it('ポイント 5 を選んで次のアイテムへ → nextItem(5)、選択は空へ戻る', () => {
    const sync = makeSync(snapshot('revealed'));
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);
    const select = screen.getByRole('combobox', { name: ESTIMATE_POINTS_LABEL }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: NEXT_ITEM }));
    expect(sync.nextItem).toHaveBeenCalledTimes(1);
    expect(sync.nextItem).toHaveBeenCalledWith(5);
    expect(select.value).toBe('');
  });

  it('選ばずに次のアイテムへ → nextItem(null)', () => {
    const sync = makeSync(snapshot('revealed'));
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);
    fireEvent.click(screen.getByRole('button', { name: NEXT_ITEM }));
    expect(sync.nextItem).toHaveBeenCalledWith(null);
    expect(sync.revote).not.toHaveBeenCalled();
  });
});

describe('アイテム名の欄と記録', () => {
  it('投票中は手札の上にアイテム名の欄が出る', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(snapshot('voting'))} />);
    const label = screen.getByText(ESTIMATE_ITEM_LABEL);
    const hand = screen.getByRole('heading', { name: 'あなたのカード' });
    expect(label.compareDocumentPosition(hand) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('開票後も欄は出て、確定すると setItem', () => {
    const sync = makeSync(snapshot('revealed'));
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);
    expect(screen.getByText(ESTIMATE_ITEM_LABEL)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /PROJ-1/ }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'PROJ-2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(sync.setItem).toHaveBeenCalledWith('PROJ-2');
  });

  it('ドックの空の選択肢は見える文言（ポイント（任意））を持つ', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(snapshot('revealed'))} />);
    const select = screen.getByRole('combobox', { name: ESTIMATE_POINTS_LABEL });
    expect((select.querySelector('option[value=""]') as HTMLOptionElement).textContent).toBe(ESTIMATE_POINTS_LABEL);
  });

  it('estimate の無い snapshot（古いサーバー）の開票後も描け、記録は空の表示', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(snapshot('revealed', false))} />);
    expect(screen.getByRole('button', { name: REVOTE })).toBeTruthy();
    // 脇と足の 2 か所に描かれる（#93 Task 6）。脇で確かめる
    expect(within(document.querySelector('.room-log--side') as HTMLElement).getByText(ESTIMATE_LOG_EMPTY)).toBeTruthy();
  });

  it('estimate の無い snapshot（古いサーバー）でも描け、記録は空の表示', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(snapshot('voting', false))} />);
    const side = within(document.querySelector('.room-log--side') as HTMLElement);
    expect(side.getByRole('heading', { name: ESTIMATE_LOG_HEADING })).toBeTruthy();
    expect(side.getByText(ESTIMATE_LOG_EMPTY)).toBeTruthy();
  });
});

describe('開票と再投票をまたいでも欄と足の記録は保たれる（#93 最終レビュー）', () => {
  // 投票中と開票後で別の部品を描き分けていたため、状態が替わるたびに欄と足の記録が作り直され、
  // 打ちかけの名前が消え、フォーカスが body へ落ち、開いていたシートも閉じていた
  it.each([
    ['voting', 'revealed'],
    ['revealed', 'voting'],
  ] as const)('Given %s で名前を打ちかけ / When %s へ替わる / Then 入力と値が残り、フォーカスも入力のまま', (from, to) => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(snapshot(from))} />);
    const footBefore = document.querySelector('.room-log--foot');
    fireEvent.click(screen.getByRole('button', { name: /PROJ-1/ }));
    const input = screen.getByRole<HTMLInputElement>('textbox');
    fireEvent.change(input, { target: { value: 'PROJ-2 打ちかけ' } });
    input.focus();
    expect(document.activeElement).toBe(input);

    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(snapshot(to))} />);

    const after = screen.getByRole<HTMLInputElement>('textbox');
    expect(after).toBe(input);
    expect(after.value).toBe('PROJ-2 打ちかけ');
    expect(document.activeElement).toBe(input);
    // 足の記録も作り直さない（開いたシートが閉じない）
    expect(document.querySelector('.room-log--foot')).toBe(footBefore);
  });
});

describe('アイテムの境目をまたぐと打ちかけの名前は捨てる（#93 PR レビュー）', () => {
  const closedGroup = {
    id: 1,
    item: 'PROJ-1',
    points: 5,
    open: false,
    entries: [{ attempt: 1, at: 1000, counts: [{ card: { kind: 'number', value: 5 }, count: 1 }] }],
  };
  function withLog(item: string, groups: unknown[]): RoomStateMessage {
    return { ...snapshot('revealed'), estimate: { item, log: groups } } as unknown as RoomStateMessage;
  }

  it('Given 名前を打ちかけ / When 他の人が次のアイテムへ進める / Then 入力は閉じ、ぼかしても setItem は呼ばれない', () => {
    // Given
    const setItem = vi.fn();
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(withLog('PROJ-1', []), { setItem })} />);
    fireEvent.click(screen.getByRole('button', { name: /PROJ-1/ }));
    const input = screen.getByRole<HTMLInputElement>('textbox');
    fireEvent.change(input, { target: { value: '古いアイテムの打ちかけ' } });
    // When
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(withLog('', [closedGroup]), { setItem })} />);
    fireEvent.blur(input);
    // Then
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('Given 閉じた束が 1 つ / When 上限で古い束が落ちると同時に新しい束が閉じる（閉じた数は同じ）/ Then 入力は閉じる', () => {
    const setItem = vi.fn();
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(withLog('PROJ-2', [closedGroup]), { setItem })} />);
    fireEvent.click(screen.getByRole('button', { name: /PROJ-2/ }));
    const input = screen.getByRole<HTMLInputElement>('textbox');
    fireEvent.change(input, { target: { value: '古いアイテムの打ちかけ' } });
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(withLog('', [{ ...closedGroup, id: 2 }]), { setItem })} />);
    fireEvent.blur(input);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('Given 名前を打ちかけ / When 他の人が名前だけ変える（境目は同じ）/ Then 打ちかけは残る', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(withLog('PROJ-1', []))} />);
    fireEvent.click(screen.getByRole('button', { name: /PROJ-1/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '打ちかけ' } });
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync(withLog('PROJ-7', []))} />);
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('打ちかけ');
  });
});

describe('記録の切り替え（#427・設計 D）', () => {
  const closedGroup = {
    id: 1,
    item: 'PROJ-1',
    points: null,
    open: false,
    entries: [{ attempt: 1, at: 1000, counts: [{ card: { kind: 'number', value: 5 }, count: 1 }] }],
  };
  function snap(opts: { recording?: boolean; log?: unknown[]; status?: 'voting' | 'revealed'; noRecordingKey?: boolean }): RoomStateMessage {
    const base = snapshot(opts.status ?? 'revealed') as unknown as { estimate: Record<string, unknown> };
    const estimate: Record<string, unknown> = { item: 'PROJ-1', log: opts.log ?? [] };
    if (!opts.noRecordingKey) estimate.recording = opts.recording ?? true;
    return { ...base, estimate } as unknown as RoomStateMessage;
  }

  it('recording false の room-state では記録の欄・いま見積もっているもの・ポイントの欄が無い', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(snap({ recording: false, log: [OPEN_GROUP] }))} />);
    expect(document.querySelector('.room-log--side')).toBeNull();
    expect(document.querySelector('.room-log--foot')).toBeNull();
    expect(screen.queryByText(ESTIMATE_ITEM_LABEL)).toBeNull();
    expect(screen.queryByRole('combobox', { name: ESTIMATE_POINTS_LABEL })).toBeNull();
    // 再投票・次のアイテムへは残る
    expect(screen.getByRole('button', { name: REVOTE })).toBeTruthy();
  });

  it('recording true では今までどおり出る', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(snap({ recording: true, log: [OPEN_GROUP] }))} />);
    expect(document.querySelector('.room-log--side')).not.toBeNull();
    expect(document.querySelector('.room-log--foot')).not.toBeNull();
    expect(screen.getByText(ESTIMATE_ITEM_LABEL)).toBeTruthy();
    expect(screen.getByRole('combobox', { name: ESTIMATE_POINTS_LABEL })).toBeTruthy();
  });

  it('切り替えのボタンは aria-pressed で状態を示し、押すと setRecording を送る', () => {
    const sync = makeSync(snap({ recording: false }));
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);
    const btn = screen.getByRole('button', { name: RECORDING_TOGGLE });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn);
    expect(sync.setRecording).toHaveBeenCalledWith(true);
    cleanup();
    const on = makeSync(snap({ recording: true }));
    render(<RoomPage roomId={ROOM_ID} sync={on} />);
    const btn2 = screen.getByRole('button', { name: RECORDING_TOGGLE });
    expect(btn2.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn2);
    expect(on.setRecording).toHaveBeenCalledWith(false);
  });

  it('開票後でも open の束が無ければポイントの欄を出さない', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(snap({ recording: true, log: [closedGroup] }))} />);
    expect(screen.queryByRole('combobox', { name: ESTIMATE_POINTS_LABEL })).toBeNull();
    expect(screen.getByRole('button', { name: NEXT_ITEM })).toBeTruthy();
  });

  it('recording false でお題も無ければ .room-side が無い', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(snap({ recording: false }))} />);
    expect(document.querySelector('.room-side')).toBeNull();
  });

  it('recording false でもお題があれば .room-side は札だけを持つ', () => {
    const sync = makeSync(snap({ recording: false }), { topic: { title: 'FizzBuzz', body: '本文', source: 'manual' } });
    render(<RoomPage roomId={ROOM_ID} sync={sync} />);
    const side = document.querySelector('.room-side');
    expect(side?.querySelector('.room-topic-side')).not.toBeNull();
    expect(side?.querySelector('.room-log--side')).toBeNull();
  });

  it('recording が無い（古いサーバー）room-state は記録の欄を出す', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(snap({ noRecordingKey: true, log: [OPEN_GROUP] }))} />);
    expect(document.querySelector('.room-log--side')).not.toBeNull();
    expect(screen.getByText(ESTIMATE_ITEM_LABEL)).toBeTruthy();
    expect(screen.getByRole('button', { name: RECORDING_TOGGLE }).getAttribute('aria-pressed')).toBe('true');
  });
});
