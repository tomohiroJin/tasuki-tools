/**
 * 終了の一覧（#429 spec §4.3）。行は `summaryOf` の行（予定・追加・かかった時間・予定より）、最後に合計の押し巻き。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { summaryOf } from '@tasuki/agenda-core';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { signedDuration } from '../src/agenda-view';
import { RESET_BUTTON, RESET_CONFIRM_YES, SUMMARY_TOTAL_LABEL } from '../src/copy';
import { Driver } from './support/agenda-states';
import { RESUME, ScriptedWebSocket, latestSocket } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

vi.mock('../src/platform/sound', () => ({
  installAudioUnlock: vi.fn(),
  unlockAudio: vi.fn(),
  playStrike: vi.fn(),
  isAudioUnlocked: () => false,
  subscribeAudioState: () => () => undefined,
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/agenda/?room=R1');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function joinedRoom(state: unknown): void {
  saveResumeIdentity(RESUME);
  render(<App />);
  act(() => {
    latestSocket().open();
    latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
    latestSocket().deliver({ type: 'agenda', state });
  });
}

/** S1（1 分）を 1:30 かけ、S2（2 分）に +1 分して 2:40 かけ、S3（3 分）を飛ばして終えた */
function finished() {
  return new Driver([1, 2, 3]).skip('s-3').next(90_000).extend(1, 100_000).next(250_000).view(250_000);
}

const rowOf = (name: string): HTMLElement => {
  const cell = screen.getByRole('rowheader', { name });
  return cell.closest('tr')!;
};

/**
 * @requirements #429 spec §4.3
 */
describe('終了の一覧', () => {
  it('Given 終了した / When 一覧を見る / Then 合計の行の押し巻きは summaryOf(v).driftMs と同じ表記', () => {
    const v = finished();
    joinedRoom(v);
    const total = rowOf(SUMMARY_TOTAL_LABEL);
    // 予定 6 分・かかった 4:10 → 1:50 巻き
    expect(summaryOf(v).driftMs).toBe(-110_000);
    expect(within(total).getByText(signedDuration(summaryOf(v).driftMs))).toBeInTheDocument();
    expect(within(total).getByText('−1:50')).toBeInTheDocument();
  });

  it('Given 終了した / When 行を見る / Then 予定・追加・かかった時間・予定よりが並ぶ', () => {
    joinedRoom(finished());
    const s1 = rowOf('S1');
    expect(within(s1).getByText('1 分')).toBeInTheDocument();
    expect(within(s1).getByText('1:30')).toBeInTheDocument();
    expect(within(s1).getByText('+0:30')).toBeInTheDocument();
    const s2 = rowOf('S2');
    expect(within(s2).getByText('+1 分')).toBeInTheDocument();
    expect(within(s2).getByText('2:40')).toBeInTheDocument();
    const s3 = rowOf('S3');
    expect(within(s3).getByText('スキップ')).toBeInTheDocument();
    expect(within(s3).getByText('−3:00')).toBeInTheDocument();
  });

  it('Given 終了した / When 「最初から」を確かめて押す / Then agenda.reset を送る', () => {
    joinedRoom(finished());
    fireEvent.click(screen.getByRole('button', { name: RESET_BUTTON }));
    fireEvent.click(screen.getByRole('button', { name: RESET_CONFIRM_YES }));
    expect(latestSocket().sentJson().filter((m) => m['command'] === 'agenda.reset')).toHaveLength(1);
  });
});
