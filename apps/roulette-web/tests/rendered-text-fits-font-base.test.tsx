import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { outsideBase } from './support/font-base';
import { IDLE_ROULETTE, RESUME, ROSTER_FRAME, ScriptedWebSocket, latestSocket, spinState } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/roulette/?room=R1');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 描いた画面の文字（見出し・ボタン・ラベル・印・一言）を 1 本にする。利用者の入力（名前・お題）は ASCII にして判定から外す。 */
function renderedText(): string {
  return document.body.textContent ?? '';
}

const GUESTS = [{ id: 'g-1', name: 'Hana' }];
const TOPIC_FRAME = {
  type: 'topic',
  state: { topic: { title: 'FizzBuzz', body: '', source: 'manual' }, generating: false, degraded: false, aiUnlocked: false },
};

/**
 * @requirements #94 spec §6.6（UI 文言は書体の base 層に収める）
 */
describe('描いたルーレットの文字は書体の常用の層に収まる', () => {
  it.each([
    ['回す前', IDLE_ROULETTE, false],
    ['ゲストを足した・お題あり', { ...IDLE_ROULETTE, guests: GUESTS }, true],
    ['回している', spinState(1, 0), true],
    ['止まった', spinState(1, 4000), true],
  ])('Given %s / When 画面を描く / Then 外れる字は無い', (_label, state, withTopic) => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    // When
    act(() => {
      latestSocket().open();
      latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      latestSocket().deliver({
        ...ROSTER_FRAME,
        room: {
          ...ROSTER_FRAME.room,
          // 名前は ASCII にする（利用者の入力は判定の外）。3 人目は離席中の印を出す
          participants: [
            { participantId: 'p1', displayName: 'Aya', presence: 'online', tools: ['roulette'] },
            { participantId: 'p2', displayName: 'Yu', presence: 'online', tools: ['roulette'] },
            { participantId: 'p3', displayName: 'Ren', presence: 'offline', tools: [] },
          ],
        },
      });
      if (withTopic) latestSocket().deliver(TOPIC_FRAME);
      latestSocket().deliver({ type: 'roulette', state });
    });
    // Then（描けていることも固定する。空の画面なら何も外れない）
    expect(outsideBase([renderedText()])).toEqual([]);
    expect(renderedText().length).toBeGreaterThan(60);
  });
});
