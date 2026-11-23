/**
 * 結果のコピー（#676）の画面。偽の WebSocket と偽の時計で、受け取ったフレームから
 * 「結果の札が出ているときだけ操作が出る」「札と同じ人が書き出される」を見る。サーバーは立てない。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickStopsMs } from '@tasuki/roulette-core';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { RESULT_COPY_BUTTON, RESULT_COPY_DONE, RESULT_COPY_MANUAL_FIELD } from '../src/copy';
import { IDLE_ROULETTE, RESUME, ScriptedWebSocket, latestSocket } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/roulette/?room=R1');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const NAMES = ['あや', 'ゆう', 'れん', 'みお'];
const ROSTER = {
  type: 'roster',
  room: {
    code: 'R1',
    participants: NAMES.map((n, i) => ({ participantId: `p${i + 1}`, displayName: n, presence: 'online', tools: ['roulette'] })),
  },
};
const E = (i: number) => ({ id: `p${i + 1}`, name: NAMES[i]! });
const WHEEL = NAMES.map((_, i) => E(i));
const STOPS = pickStopsMs(3);

/** れん → あや → みお の順に止まる 3 人の回転 */
function spin3(seq = 1, elapsedMs = 0) {
  return {
    pickCount: 3,
    excluded: [],
    guests: [],
    drawn: [],
    spin: {
      seq,
      wheel: WHEEL,
      winnerIndex: 2,
      settle: 0.5,
      picks: [
        { index: 2, settle: 0.5 },
        { index: 0, settle: 0.3 },
        { index: 3, settle: 0.7 },
      ],
      spunBy: 'ゆう',
      durationMs: STOPS.at(-1)!,
      elapsedMs,
    },
  };
}

function enterRoom(state: unknown): void {
  saveResumeIdentity(RESUME);
  render(<App />);
  act(() => {
    latestSocket().open();
    latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
    latestSocket().deliver(ROSTER);
    latestSocket().deliver({ type: 'roulette', state });
  });
}
const deliver = (state: unknown): void => {
  act(() => latestSocket().deliver({ type: 'roulette', state }));
};
const advance = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};
const copyButton = () => screen.queryByRole('button', { name: RESULT_COPY_BUTTON });

describe('結果のコピー（1 回で決める・3 人）', () => {
  it('Given 回っている間 / Then 操作は出ない。1 人目が止まっても、全員が止まるまで出ない', () => {
    enterRoom(spin3(1, 0));
    expect(copyButton()).toBeNull();
    advance(STOPS[0]! + 100);
    expect(document.querySelectorAll('.roulette-group-row.is-filled')).toHaveLength(1);
    expect(copyButton()).toBeNull();
  });

  it('Given 全員が止まった / When 押す / Then 札と同じ 3 人を止まった順に書き、成功を知らせる', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    enterRoom(spin3(1, 0));
    advance(STOPS.at(-1)! + 100);
    expect(copyButton()).not.toBeNull();
    await act(async () => {
      fireEvent.click(copyButton()!);
    });
    expect(writeText).toHaveBeenCalledWith(
      ['## 進行役ルーレットの結果', '', '- 決め方：1 回で決める', '- 選ばれた人：', '  1. れん', '  2. あや', '  3. みお'].join('\n'),
    );
    expect(screen.getByText(RESULT_COPY_DONE)).toBeInTheDocument();
  });

  it('Given 失敗して手で選ぶ欄が出ている / When 次の回転が届く / Then 操作も欄も消え、止まると新しい結果で出し直す', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
    document.execCommand = vi.fn(() => false);
    enterRoom(spin3(1, STOPS.at(-1)!));
    await act(async () => {
      fireEvent.click(copyButton()!);
    });
    expect(screen.getByRole('textbox', { name: RESULT_COPY_MANUAL_FIELD })).toBeInTheDocument();
    deliver(spin3(2, 0));
    expect(copyButton()).toBeNull();
    expect(screen.queryByRole('textbox', { name: RESULT_COPY_MANUAL_FIELD })).toBeNull();
    advance(STOPS.at(-1)! + 100);
    expect(copyButton()).not.toBeNull();
    expect(screen.queryByRole('textbox', { name: RESULT_COPY_MANUAL_FIELD })).toBeNull();
  });
});

describe('結果のコピー（順番に回す）', () => {
  const orderTurn = (turn: number, doneIdx: number[], elapsedMs: number) => ({
    ...IDLE_ROULETTE,
    pickCount: 1,
    mode: 'order',
    order: { done: doneIdx.map(E), finished: false },
    spin: {
      seq: turn,
      wheel: WHEEL,
      winnerIndex: doneIdx.at(-1)!,
      settle: 0.5,
      picks: [{ index: doneIdx.at(-1)!, settle: 0.5 }],
      turn,
      spunBy: 'ゆう',
      durationMs: 4000,
      elapsedMs,
    },
  });

  it('Given 2 番を回している間 / Then 出ない。止まったら 1 番から順に書く', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    enterRoom(orderTurn(2, [2, 0], 0));
    expect(copyButton()).toBeNull();
    advance(4100);
    expect(copyButton()).not.toBeNull();
    await act(async () => {
      fireEvent.click(copyButton()!);
    });
    expect(writeText).toHaveBeenCalledWith(
      ['## 進行役ルーレットの結果', '', '- 決め方：順番に回す', '- 順番：', '  1. れん', '  2. あや'].join('\n'),
    );
  });
});
