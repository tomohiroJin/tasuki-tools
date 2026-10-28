import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { outsideBase } from './support/font-base';
import { IDLE_CHECKIN, RESUME, ROSTER_FRAME, ScriptedWebSocket, latestSocket, openCheckin } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/checkin/?room=R1');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 描いた画面の文字を 1 本にする。利用者の入力（表示名）は ASCII ではないが判定の外にするため差し引く。 */
function renderedText(): string {
  return (document.body.textContent ?? '').split('あや').join('').split('ゆう').join('');
}

/**
 * 描いた画面の文字を当てる。札の盤が組み上がる 3.2 以降は、ここへ状態を足していく。
 *
 * @requirements #406 E13（UI 文言は書体の base 層に収める）
 */
describe('描いた Check-in Cards の文字は書体の常用の層に収まる', () => {
  it('対照: 検査は base 層に無い字を拾う（拾えない検査は常に緑になる）', () => {
    expect(outsideBase(['議論'])).not.toEqual([]);
  });

  it.each([
    ['参加の途中', null],
    ['回の無い状態', IDLE_CHECKIN],
    ['開いている回', openCheckin('sunny')],
  ])('Given %s / When 画面を描く / Then 外れる字は無く、描けている', (_label, state) => {
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => {
      latestSocket().open();
      if (state === null) return;
      latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      latestSocket().deliver(ROSTER_FRAME);
      latestSocket().deliver({ type: 'checkin', state });
    });
    expect(outsideBase([renderedText()])).toEqual([]);
    // 空の画面なら何も外れない。見出しが描けていることも固定する
    expect(renderedText().length).toBeGreaterThan(5);
  });

  it('Given ルームが消えていた / When 画面を描く / Then 外れる字は無い', () => {
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => {
      latestSocket().open();
      latestSocket().deliver({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'x' });
    });
    expect(renderedText()).toContain('見つかりません');
    expect(outsideBase([renderedText()])).toEqual([]);
  });
});
