import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { SAMPLE_SCENARIOS } from '../src/sample-scenarios';
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
 * 判定に掛ける文字。**同梱のサンプルの名前（会・ステップ）は利用者の入力と同じく判定の外**（spec §7.6）。
 * 描いた文字から取り除いてから当てる（サンプルの札は「組む前」の画面に名前を並べる）。
 */
function checkedText(): string {
  const bundled = SAMPLE_SCENARIOS.flatMap((s) => [s.scenario.title, ...s.scenario.steps.map((x) => x.name)]);
  return bundled.reduce((text, name) => text.split(name).join(''), renderedText());
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
    expect(outsideBase([checkedText()])).toEqual([]);
    // 空の画面なら何も外れない。見出しが描けていることも固定する
    expect(renderedText().length).toBeGreaterThan(5);
  });

  it('Given 組む前 / When 画面を描く / Then サンプルの札にステップの名前が並び、それを除けば外れる字は無い', () => {
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => {
      latestSocket().open();
      latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      latestSocket().deliver({ type: 'agenda', state: IDLE_AGENDA });
    });
    // 除く対象が実際に描かれている（除外が空振りして緑にならない）
    expect(renderedText()).toContain('Try の議論');
    expect(outsideBase([renderedText()])).not.toEqual([]);
    expect(outsideBase([checkedText()])).toEqual([]);
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
