/**
 * 終了の一覧（#429 spec §4.3）。行は `summaryOf` の行（予定・追加・かかった時間・予定より）、最後に合計の押し巻き。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { summaryOf } from '@tasuki/agenda-core';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { RESET_BUTTON, RESET_CONFIRM_YES, SUMMARY_TOTAL_LABEL, roundHeading } from '../src/copy';
import { Driver, MIN } from './support/agenda-states';
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
  return new Driver([1, 2, 3]).skip('s-3').next(90_000).extend(1).next(250_000).view(250_000);
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

  it('Given 予定より 500ms 早い行と 500ms 遅い行 / When 一覧を見る / Then 印と色の向きがそろう（どちらも絶対値を丸めて 1 秒）', () => {
    // S1（1 分）を 59.5 秒・S2（2 分）を 2:00.5 で終えた
    joinedRoom(new Driver([1, 2]).next(59_500).next(180_000).view(180_000));
    const early = within(rowOf('S1')).getByText('−0:01');
    expect(early).toHaveClass('is-early');
    const late = within(rowOf('S2')).getByText('+0:01');
    expect(late).toHaveClass('is-late');
  });

  it('Given 終了した / When 「最初から」を確かめて押す / Then agenda.reset を送る', () => {
    joinedRoom(finished());
    fireEvent.click(screen.getByRole('button', { name: RESET_BUTTON }));
    fireEvent.click(screen.getByRole('button', { name: RESET_CONFIRM_YES }));
    expect(latestSocket().sentJson().filter((m) => m['command'] === 'agenda.reset')).toHaveLength(1);
  });

  it('Given 回数 2 以上で終了した / When 一覧を見る / Then 回の境目に見出しの行が出て、合計の押し巻きは summaryOf(v).driftMs と同じ', () => {
    // 2 区切り × 3 回。どれも予定の 1 分を 30 秒押して終えた
    const d = new Driver([1, 1], 'LT', 'wait', 3);
    for (let i = 1; i <= 6; i++) d.next(i * 90_000);
    const v = d.view(6 * 90_000);
    expect(v.phase).toBe('finished');
    joinedRoom(v);
    const headings = screen.getAllByRole('rowheader').filter((h) => h.getAttribute('scope') === 'rowgroup');
    expect(headings.map((h) => h.textContent)).toEqual([roundHeading(1), roundHeading(2), roundHeading(3)]);
    expect(headings.every((h) => h.getAttribute('colspan') === '5')).toBe(true);
    // 回ごとに <tbody> が分かれ、それぞれの先頭が見出しの行
    const bodies = [...document.querySelectorAll('.summary-table tbody')];
    expect(bodies).toHaveLength(3);
    expect(bodies.map((b) => b.querySelector('tr')?.textContent)).toEqual([roundHeading(1), roundHeading(2), roundHeading(3)]);
    const total = rowOf(SUMMARY_TOTAL_LABEL);
    expect(summaryOf(v).driftMs).toBe(180_000);
    expect(within(total).getByText('+3:00')).toBeInTheDocument();
  });

  it('Given 予定の合計 180 分で終えた / When 一覧を見る / Then かかった時間と差を h:mm:ss で書き、合計の行も同じ', () => {
    joinedRoom(new Driver([120, 60]).next(125 * MIN).next(175 * MIN).view(175 * MIN));
    const s1 = rowOf('S1');
    expect(within(s1).getByText('2:05:00')).toBeInTheDocument();
    expect(within(s1).getByText('+0:05:00')).toBeInTheDocument();
    const s2 = rowOf('S2');
    expect(within(s2).getByText('0:50:00')).toBeInTheDocument();
    expect(within(s2).getByText('−0:10:00')).toBeInTheDocument();
    const total = rowOf(SUMMARY_TOTAL_LABEL);
    expect(within(total).getByText('2:55:00')).toBeInTheDocument();
    expect(within(total).getByText('−0:05:00')).toBeInTheDocument();
  });

  it('Given 回数 1 で終了した / When 一覧を見る / Then 見出しの行は無い', () => {
    joinedRoom(finished());
    expect(document.querySelectorAll('th[scope="rowgroup"]')).toHaveLength(0);
    expect(document.querySelectorAll('.summary-table tbody')).toHaveLength(1);
  });
});
