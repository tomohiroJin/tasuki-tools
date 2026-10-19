/**
 * 段組み（#93 Task 6）: 脇は常にあり、お題の札だけが畳まれる。記録は脇と操作の面の足の 2 か所に描かれる。
 * jsdom は media query を解さない。幅での出し分けは E2E（Task 7）が確かめるので、ここは構造と属性だけを見る。
 *
 * @requirements #93
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { clearResumeIdentity, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import type { EstimateGroupView, RoomStateMessage } from '@tasuki/poker-core';
import type { Topic } from '@tasuki/topic-core';
import { RoomPage } from '../src/pages/RoomPage';
import type { PokerSync } from '../src/hooks/useSync';
import { TOPIC_HIDE } from '../src/components/CurrentTopic';
import { ESTIMATE_LOG_HEADING, ESTIMATE_LOG_SHOW_ALL } from '../src/estimate-copy';

const ROOM_ID = 'ABCD1234';
const AT = Date.UTC(2026, 9, 17, 5, 20);

function group(id: number): EstimateGroupView {
  return {
    id,
    item: `ITEM-${id}`,
    points: 5,
    open: false,
    entries: [{ attempt: 1, at: AT, counts: [{ card: { kind: 'number', value: 5 }, count: 1 }] }],
  };
}

function makeSync(topic: Topic | null, groups: number): PokerSync {
  const log = Array.from({ length: groups }, (_, i) => group(i + 1));
  const snapshot = {
    type: 'room-state',
    roomId: ROOM_ID,
    you: 'p1',
    participants: [{ id: 'p1', name: 'あかり', connected: true, hasVoted: false, spectator: false }],
    round: { status: 'voting' },
    yourVote: null,
    estimate: { item: '', log },
  } as RoomStateMessage;
  return {
    status: 'open',
    everConnected: true,
    failedAttempts: 0,
    storedIdentity: loadResumeIdentity,
    forgetIdentity: clearResumeIdentity,
    inviteUrl: (id: string) => `https://example.test/?room=${id}`,
    snapshot,
    topic,
    joinedThisConnection: true,
    error: null,
    syncStale: false,
    clearError: vi.fn(),
    joinRoom: vi.fn(),
    checkRoom: vi.fn(),
    vote: vi.fn(),
    reveal: vi.fn(),
    setItem: vi.fn(),
    revote: vi.fn(),
    nextItem: vi.fn(),
    setPoints: vi.fn(),
    setSpectator: vi.fn(),
    removeParticipant: vi.fn(),
    departed: null,
    setRecording: () => {},
    renameGroup: () => {},
  };
}

const proto = HTMLDialogElement.prototype;
const original = { showModal: proto.showModal, close: proto.close };

beforeEach(() => {
  localStorage.clear();
  saveResumeIdentity({ code: ROOM_ID, participantId: 'p1', resumeToken: 'tok-1', displayName: 'あかり' });
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

afterEach(() => {
  proto.showModal = original.showModal;
  proto.close = original.close;
  cleanup();
  localStorage.clear();
});

const topic: Topic = { title: 'FizzBuzz', body: '本文', source: 'manual' };

describe('脇は常に出る', () => {
  it('Given お題が無い / When 開く / Then .room-side と脇の記録が描かれ、お題の札の包みは無い', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(null, 1)} />);
    const side = document.querySelector('.room-side');
    expect(side).not.toBeNull();
    expect(side?.classList.contains('ui-workspace-side')).toBe(true);
    expect(side?.querySelector('.room-log--side')).not.toBeNull();
    expect(document.querySelector('.room-topic-side')).toBeNull();
  });

  it('Given お題がある / When 開く / Then 札の包みは脇の中にあり開いている', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(topic, 0)} />);
    const wrap = document.querySelector('.room-side > .room-topic-side');
    expect(wrap?.getAttribute('data-state')).toBe('open');
  });

  it('Given お題がある / When お題を隠す / Then 札の包みだけが closed・inert で、記録は inert でない', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(topic, 1)} />);
    fireEvent.click(screen.getByRole('button', { name: TOPIC_HIDE }));
    const wrap = document.querySelector('.room-topic-side');
    expect(wrap?.getAttribute('data-state')).toBe('closed');
    expect(wrap?.hasAttribute('inert')).toBe(true);
    const side = document.querySelector('.room-side');
    expect(side?.hasAttribute('inert')).toBe(false);
    expect(document.querySelector('.room-log--side')?.closest('[inert]')).toBeNull();
  });
});

describe('脇の記録のスクロール領域', () => {
  it('Given 脇の記録 / When 開く / Then フォーカスできる領域は .ui-reader の子孫で、札そのものではない', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(null, 1)} />);
    const card = document.querySelector('.room-log--side') as HTMLElement;
    expect(card.classList.contains('ui-reader')).toBe(true);
    expect(card.hasAttribute('tabindex')).toBe(false);
    expect(card.getAttribute('role')).toBeNull();
    const region = within(card).getByRole('region', { name: ESTIMATE_LOG_HEADING });
    expect(region).not.toBe(card);
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.closest('.ui-reader')).toBe(card);
  });
});

describe('操作の面の足の記録', () => {
  it('Given 束 5 つ / When 開く / Then 足の記録は新しい 3 束で、脇は全部', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(null, 5)} />);
    const foot = document.querySelector('.room-main > .room-log--foot') as HTMLElement;
    expect(foot).not.toBeNull();
    const ids = (el: Element) => [...el.querySelectorAll('[data-group]')].map((li) => li.getAttribute('data-group'));
    expect(ids(foot).slice(0, 3)).toEqual(['5', '4', '3']);
    expect(document.querySelector('.room-log--side [data-group]')).not.toBeNull();
    expect(ids(document.querySelector('.room-log--side')!)).toEqual(['5', '4', '3', '2', '1']);
  });

  it('Given 束 5 つ / When 記録をすべて見る / Then シートが開いて全部の束が出て、閉じるとボタンへフォーカスが戻る', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(null, 5)} />);
    const foot = document.querySelector('.room-log--foot') as HTMLElement;
    const more = within(foot).getByRole('button', { name: ESTIMATE_LOG_SHOW_ALL });
    fireEvent.click(more);
    const dialog = foot.querySelector('dialog.ui-drawer') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.querySelectorAll('[data-group]')).toHaveLength(5);
    fireEvent.click(within(dialog).getByRole('button', { name: '閉じる' }));
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(more);
  });

  it('Given 束 2 つ / When 開く / Then すべて見るは出ない（隠れた束が無い）', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(null, 2)} />);
    expect(screen.queryByRole('button', { name: ESTIMATE_LOG_SHOW_ALL })).toBeNull();
  });

  it('Given 束 0 / When 開く / Then 記録の見出しが脇と足の 2 つで、足にシートは無い', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(null, 0)} />);
    expect(screen.getAllByRole('heading', { name: ESTIMATE_LOG_HEADING })).toHaveLength(2);
    expect(document.querySelector('dialog')).toBeNull();
  });
});
