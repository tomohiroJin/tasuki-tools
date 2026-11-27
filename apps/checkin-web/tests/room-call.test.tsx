/**
 * 呼びかけの知らせ（#677）。ルームの 1 人が全員を同じ道具へ呼んだとき、この画面に知らせが出る。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { CheckinRoom } from '../src/screens/CheckinRoom';
import { IDLE_CHECKIN, RESUME, ScriptedWebSocket, latestSocket } from './support/scripted-web-socket';

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/checkin/?room=R1');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const CALL = { type: 'room.call', call: { tool: 'poker', fromParticipantId: 'p2', fromName: 'いお' } };

function enter(): void {
  saveResumeIdentity(RESUME);
  render(<CheckinRoom roomCode="R1" />);
  act(() => {
    latestSocket().open();
    latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
    latestSocket().deliver({ type: 'checkin', state: IDLE_CHECKIN });
  });
}

describe('呼びかけの知らせ', () => {
  it('Given 入室済み / When 呼びかけが届く / Then 名前と行き先の道具と、同じルームへ移るリンクが出る', () => {
    enter();
    act(() => latestSocket().deliver(CALL));
    expect(screen.getByRole('link', { name: '移る' }).closest('.ui-call')).toHaveTextContent('いおさんが Planning Poker に呼んでいます');
    expect(screen.getByRole('link', { name: '移る' })).toHaveAttribute('href', '/poker/?room=R1');
  });

  it('Given 知らせが出ている / When 閉じるを押す / Then 知らせが消える', () => {
    enter();
    act(() => latestSocket().deliver(CALL));
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('link', { name: '移る' })).toBeNull();
  });

  it('Given 入室の途中 / When 呼びかけが届く / Then 知らせは出ない', () => {
    saveResumeIdentity(RESUME);
    render(<CheckinRoom roomCode="R1" />);
    act(() => {
      latestSocket().open();
      latestSocket().deliver(CALL);
    });
    expect(screen.queryByRole('link', { name: '移る' })).toBeNull();
  });
});
