/**
 * 接続の告知が帯として出る配線（#471）。`usePokerSync` が `status`・`everConnected`・`failedAttempts`・`syncStale` から
 * 告知の種類（`notice`）を引き、App が帯を描く。種類を決める規則そのものは `@tasuki/sync-client` が持つが、
 * **その入力を正しく渡しているか**はここでしか見えない（旧 `connection-notice.test.ts` を消した穴）。
 *
 * オラクルは文字列と役割を手で書く（実装の定数を引かない）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { FakeListenerSocket } from './support/fakes';

const ROOM_ID = 'ABCD1234';

const open = (): void =>
  act(() => {
    FakeListenerSocket.latest().readyState = FakeListenerSocket.OPEN;
    FakeListenerSocket.latest().fire('open');
  });
const close = (): void =>
  act(() => {
    FakeListenerSocket.latest().fire('close');
  });

beforeEach(() => {
  FakeListenerSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeListenerSocket);
  localStorage.clear();
  saveResumeIdentity({ code: ROOM_ID, participantId: 'p-stored', resumeToken: 'tok-1', displayName: 'はなこ' });
  window.history.replaceState(null, '', `/poker/?room=${ROOM_ID}`);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('接続の告知の帯（poker の配線）', () => {
  it('Given 一度も繋がらないまま / When 失敗する / Then 「繋がらない」を role=alert で出す', () => {
    render(<App />);
    close();
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toBe('同期サーバーに接続できません。復旧するまでルームに参加できません。再試行を続けています。');
    expect(banner.className).toBe('ui-banner ui-banner--unreachable');
    expect(screen.queryByText('接続中です…（切断された場合は自動で再接続します）')).toBeNull();
  });

  it('Given 繋がった後 / When 切れる / Then 「再接続中」を role=status で出す', () => {
    render(<App />);
    open();
    close();
    const banner = screen.getByRole('status');
    expect(banner.textContent).toBe('接続中です…（切断された場合は自動で再接続します）');
    expect(banner.className).toBe('ui-banner');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Given 繋がっている / When 画面を見る / Then 帯は出ない', () => {
    render(<App />);
    open();
    expect(document.querySelector('.ui-banner')).toBeNull();
  });
});
