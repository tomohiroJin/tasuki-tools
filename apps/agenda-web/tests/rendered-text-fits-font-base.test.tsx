import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { outsideBase } from './support/font-base';
import { IDLE_AGENDA, RESUME, ROSTER_FRAME, ScriptedWebSocket, latestSocket, runningAgenda } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
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

/** 描いた画面の文字を 1 本にする。利用者の入力（会・ステップの名前）は ASCII にして判定から外す。 */
function renderedText(): string {
  return document.body.textContent ?? '';
}

/**
 * @requirements #429 spec §6.6（UI 文言は書体の base 層に収める）
 */
describe('描いた進行タイマーの文字は書体の常用の層に収まる', () => {
  it.each([
    ['参加の途中', null],
    ['組む前', IDLE_AGENDA],
    ['進行中', runningAgenda(1000)],
  ])('Given %s / When 画面を描く / Then 外れる字は無く、描けている', (_label, state) => {
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => {
      latestSocket().open();
      if (state === null) return;
      latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      latestSocket().deliver(ROSTER_FRAME);
      latestSocket().deliver({ type: 'agenda', state });
    });
    expect(outsideBase([renderedText()])).toEqual([]);
    // 空の画面なら何も外れない。見出しが描けていることも固定する
    expect(renderedText().length).toBeGreaterThan(5);
  });

  it('Given 進行中 / When 画面を描く / Then 会の名前とステップの名前が並ぶ', () => {
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => {
      latestSocket().open();
      latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      latestSocket().deliver({ type: 'agenda', state: runningAgenda(0) });
    });
    expect(renderedText()).toContain('Retro');
    expect(renderedText()).toContain('Check');
    expect(renderedText()).toContain('Talk');
  });
});
