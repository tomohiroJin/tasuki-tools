/**
 * ルーム画面がいまのお題を出すことを固定する（#91 PR 3・spec §5.5・T4）。
 *
 * poker はお題を読むだけで、設定はしない（設定はお題ツールの仕事）。
 * 本文は読む面（`role="region"`）に畳まずに出し、狭い幅では「続きを読む」で
 * 下からのシート（`<dialog>`）に全文を出す（#316）。jsdom は `showModal` / `close` を
 * 持たないので差し替える（`afterEach` で戻す）。
 *
 * @requirements #91
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { clearResumeIdentity, loadResumeIdentity, saveResumeIdentity } from '@tasuki/sync-client';
import type { RoomStateMessage } from '@tasuki/poker-core';
import type { Topic } from '@tasuki/topic-core';
import { RoomPage } from '../src/pages/RoomPage';
import type { PokerSync } from '../src/hooks/useSync';
import { CLOSE, READ_MORE, TOPIC_CARD_ID, TOPIC_HIDE, TOPIC_HEADING, TOPIC_SHOW } from '../src/components/CurrentTopic';

const ROOM_ID = 'ABCD1234';

function votingSnapshot(): RoomStateMessage {
  return {
    type: 'room-state',
    roomId: ROOM_ID,
    you: 'p1',
    participants: [{ id: 'p1', name: 'あかり', connected: true, hasVoted: false }],
    round: { status: 'voting' },
    yourVote: null,
  };
}

function makeSync(topic: Topic | null): PokerSync {
  return {
    status: 'open',
    everConnected: true,
    failedAttempts: 0,
    storedIdentity: loadResumeIdentity,
    forgetIdentity: clearResumeIdentity,
    inviteUrl: (roomId: string) => `https://example.test/?room=${roomId}`,
    snapshot: votingSnapshot(),
    topic,
    joinedThisConnection: true,
    error: null,
    syncStale: false,
    clearError: vi.fn(),
    joinRoom: vi.fn(),
    checkRoom: vi.fn(),
    vote: vi.fn(),
    reveal: vi.fn(),
    nextRound: vi.fn(),
  };
}

beforeEach(() => {
  localStorage.clear();
  // 入室済み画面を描くための前提（#95 S5c・R9）。
  saveResumeIdentity({
    code: ROOM_ID,
    participantId: 'p1',
    resumeToken: 'tok-1',
    displayName: 'あかり',
  });
});

const proto = HTMLDialogElement.prototype;
let showModal = vi.fn();
const original = { showModal: proto.showModal, close: proto.close };

beforeEach(() => {
  showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  proto.showModal = showModal;
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

describe('poker のルーム画面がいまのお題を出す(#91・#316)', () => {
  const topic: Topic = { title: 'FizzBuzz', body: '# 振る舞い\n3 のときは Fizz', source: 'manual' };

  it('Given お題がある / When ルーム画面を開く / Then 見出しとタイトルが出て、本文は読む面に畳まずに出る', () => {
    // Given / When
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(topic)} />);
    // Then
    expect(screen.getByRole('heading', { name: TOPIC_HEADING })).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'FizzBuzz' })).not.toBeNull();
    const region = screen.getByRole('region', { name: 'FizzBuzz' });
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.classList.contains('ui-reader-body')).toBe(true);
    expect(region.textContent).toContain('3 のときは Fizz');
    expect(document.querySelector('details')).toBeNull();
  });

  it('Given お題がある / When 「続きを読む」を押す / Then シートが開いて全文が出る', () => {
    // Given
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(topic)} />);
    const dialog = document.querySelector('dialog.ui-drawer') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(false);
    // When
    fireEvent.click(screen.getByRole('button', { name: READ_MORE }));
    // Then
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.getAttribute('aria-labelledby')).toBe('poker-topic-drawer-title');
    expect(dialog.querySelector('#poker-topic-drawer-title')?.textContent).toBe('FizzBuzz');
    expect(dialog.querySelector('.ui-drawer-body')?.textContent).toContain('3 のときは Fizz');
  });

  it('Given シートが開いている / When 閉じるを押す / Then 閉じて「続きを読む」へフォーカスが戻る', () => {
    // Given
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(topic)} />);
    const more = screen.getByRole('button', { name: READ_MORE });
    const dialog = document.querySelector('dialog.ui-drawer') as HTMLDialogElement;
    fireEvent.click(more);
    // When（dialog が閉じていると中のボタンは role から隠れるので DOM で引く）
    const closeButton = [...dialog.querySelectorAll('button')].find((b) => b.textContent === CLOSE);
    fireEvent.click(closeButton as HTMLButtonElement);
    // Then
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(more);
  });

  it('Given シートが開いている / When close イベントだけが届く（Esc） / Then フォーカスが「続きを読む」へ戻る', () => {
    // Given
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(topic)} />);
    const more = screen.getByRole('button', { name: READ_MORE });
    const dialog = document.querySelector('dialog.ui-drawer') as HTMLDialogElement;
    fireEvent.click(more);
    (document.body as HTMLElement).focus();
    expect(document.activeElement).not.toBe(more);
    // When: ブラウザは Esc で `close()` を呼ばずに close イベントだけを送る
    dialog.dispatchEvent(new Event('close'));
    // Then
    expect(document.activeElement).toBe(more);
  });

  it('Given 本文が空のお題 / When ルーム画面を開く / Then 本文の領域も「続きを読む」も出ない', () => {
    // Given / When
    render(<RoomPage roomId={ROOM_ID} sync={makeSync({ title: 'FizzBuzz', body: '', source: 'manual' })} />);
    // Then
    expect(screen.getByRole('heading', { name: 'FizzBuzz' })).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'FizzBuzz' })).toBeNull();
    expect(screen.queryByRole('button', { name: READ_MORE })).toBeNull();
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('Given お題が無い / When ルーム画面を開く / Then 「お題」の見出しは出ない', () => {
    // Given / When
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(null)} />);
    // Then（#91 E16）
    expect(screen.queryByRole('heading', { name: TOPIC_HEADING })).toBeNull();
  });
});

describe('poker のお題は手元で隠せる（#316 PR 1）', () => {
  const topic: Topic = { title: 'FizzBuzz', body: '3 のときは Fizz', source: 'manual' };

  it('Given お題がある / When ルームを開く / Then 見出しの横に「お題を隠す」があり、札の id を指して開いている', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(topic)} />);
    const toggle = screen.getByRole('button', { name: TOPIC_HIDE });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe(TOPIC_CARD_ID);
    expect(document.getElementById(TOPIC_CARD_ID)).not.toBeNull();
    expect(toggle.closest('.ui-page-header')).not.toBeNull();
  });

  it('Given お題が開いている / When 「お題を隠す」を押す / Then 札が描かれず、「お題を見る」になる。もう一度押すと札が戻る', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(topic)} />);
    fireEvent.click(screen.getByRole('button', { name: TOPIC_HIDE }));
    expect(document.getElementById(TOPIC_CARD_ID)).toBeNull();
    expect(document.querySelector('.ui-workspace-side')).toBeNull();
    const show = screen.getByRole('button', { name: TOPIC_SHOW });
    expect(show.getAttribute('aria-expanded')).toBe('false');
    // 隠している間は、DOM から消えた id を指さない
    expect(show.hasAttribute('aria-controls')).toBe(false);
    fireEvent.click(show);
    expect(document.getElementById(TOPIC_CARD_ID)).not.toBeNull();
    expect(screen.getByRole('button', { name: TOPIC_HIDE }).getAttribute('aria-expanded')).toBe('true');
  });

  it('Given お題が無い / When ルームを開く / Then 切り替えのボタンが無い', () => {
    render(<RoomPage roomId={ROOM_ID} sync={makeSync(null)} />);
    expect(screen.queryByRole('button', { name: TOPIC_HIDE })).toBeNull();
    expect(screen.queryByRole('button', { name: TOPIC_SHOW })).toBeNull();
  });

  it('Given 隠している / When お題が差し替わる / Then 隠したまま', () => {
    const { rerender } = render(<RoomPage roomId={ROOM_ID} sync={makeSync(topic)} />);
    fireEvent.click(screen.getByRole('button', { name: TOPIC_HIDE }));
    rerender(<RoomPage roomId={ROOM_ID} sync={makeSync({ ...topic, title: '次のお題' })} />);
    expect(document.getElementById(TOPIC_CARD_ID)).toBeNull();
    expect(screen.getByRole('button', { name: TOPIC_SHOW })).not.toBeNull();
  });
});
