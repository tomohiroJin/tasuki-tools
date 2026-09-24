import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { outsideBase } from './support/font-base';
import { IDLE_STATE, RESUME, ScriptedWebSocket, latestSocket } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/topic/?room=R1');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 利用者の内容（ルームコード・表示名・お題）は ASCII にして、判定から外れるようにする。 */
const TOPIC = { title: 'FizzBuzz', body: 'fizz', source: 'manual' as const };

/** 描いた画面の文字（見出し・ボタン・ラベル・選択肢・知らせ）を 1 本にする。 */
function renderedText(): string {
  return document.body.textContent ?? '';
}

/**
 * @requirements #91 spec §5.4（UI 文言は書体の base 層に収める）
 */
describe('描いたお題ツールの文字は書体の常用の層に収まる', () => {
  it.each([
    ['お題なし・未解錠', IDLE_STATE],
    ['お題あり・生成中・解錠済み', { ...IDLE_STATE, topic: TOPIC, generating: true, aiUnlocked: true }],
    ['定型に落ちた', { ...IDLE_STATE, topic: { ...TOPIC, source: 'fallback' as const }, degraded: true }],
  ])('Given %s / When 画面を描く / Then 外れる字は無い', (_label, state) => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    // When
    act(() => {
      latestSocket().open();
      latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      latestSocket().deliver({ type: 'topic', state });
    });
    // Then（描けていることも固定する。空の画面なら何も外れない）
    expect(outsideBase([renderedText()])).toEqual([]);
    expect(renderedText().length).toBeGreaterThan(40);
  });
});
