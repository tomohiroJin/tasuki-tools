/**
 * 別の場所で外された・抜けたとき、ハブのタブも玄関の参加画面（退出の告知つき）へ戻る（#427）。
 *
 * サーバーは同じ人の全接続へ `REMOVED_FROM_ROOM` / `LEFT_ROOM` を送る。ハブはこれを
 * 知らないエラーとして文言を出すだけで、名簿が古いまま操作できる画面に取り残されていた。
 * 遷移は `departure.ts` に閉じてあるので、そこを差し替えて行き先を見る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { App } from '../../src/App.js';
import { ScriptedWebSocket } from '@tasuki/test-css/scripted-web-socket';
import { redirectTo } from '../../src/hub/departure.js';

vi.mock('../../src/hub/departure.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/hub/departure.js')>();
  return { ...actual, redirectTo: vi.fn() };
});

const socket = (): ScriptedWebSocket => ScriptedWebSocket.instances[0]!;

function joinedRoom(): void {
  window.history.replaceState(null, '', '/?room=R1');
  localStorage.setItem(
    'tasuki:resume:R1',
    JSON.stringify({ code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' }),
  );
  render(<App />);
  act(() => socket().open());
  act(() =>
    socket().deliver({
      type: 'room.joined',
      code: 'R1',
      participantId: 'p1',
      resumeToken: 't2',
      roster: [],
    }),
  );
}

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  vi.mocked(redirectTo).mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ハブのタブが外された・抜けた', () => {
  it('Given 参加中 / When REMOVED_FROM_ROOM を受ける / Then 復帰の組を捨て、接続を畳み、?left=removed へ置き換えて移る', () => {
    joinedRoom();
    act(() => socket().deliver({ type: 'error', code: 'REMOVED_FROM_ROOM', message: 'ルームから外されました' }));
    expect(vi.mocked(redirectTo)).toHaveBeenCalledWith('/?room=R1&left=removed');
    expect(localStorage.getItem('tasuki:resume:R1')).toBeNull();
    expect(socket().readyState).toBe(3);
  });

  it('Given 参加中 / When LEFT_ROOM を受ける / Then ?left=self へ移る', () => {
    joinedRoom();
    act(() => socket().deliver({ type: 'error', code: 'LEFT_ROOM', message: 'ルームを抜けました' }));
    expect(vi.mocked(redirectTo)).toHaveBeenCalledWith('/?room=R1&left=self');
  });

  it('Given 参加中 / When REMOVED_BY_HOST（旧名）を受ける / Then ?left=removed へ移る', () => {
    joinedRoom();
    act(() => socket().deliver({ type: 'error', code: 'REMOVED_BY_HOST', message: '外されました' }));
    expect(vi.mocked(redirectTo)).toHaveBeenCalledWith('/?room=R1&left=removed');
  });

  it('Given 参加中 / When 別のエラーを受ける / Then 移らず組も残る', () => {
    joinedRoom();
    act(() => socket().deliver({ type: 'error', code: 'SOMETHING_NEW', message: '何か' }));
    expect(vi.mocked(redirectTo)).not.toHaveBeenCalled();
    expect(localStorage.getItem('tasuki:resume:R1')).not.toBeNull();
  });
});
