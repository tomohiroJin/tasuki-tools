import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import { PROJECT_BUTTON, RESET_BUTTON, SAMPLE_MENU_BUTTON, SAMPLE_REPLACE_CONFIRM } from '../src/copy';
import { SAMPLE_GROUPS } from '../src/sample-scenarios';
import { Driver } from './support/agenda-states';
import { outsideBase } from '@tasuki/test-css/font-base';
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
 * KPT に元からある「Try の議論」は利用者の入力と同じく判定の外（spec §7.6）。
 */
function checkedText(): string {
  return renderedText().replaceAll('Try の議論', '');
}

/**
 * @requirements #429 spec §6.6（UI 文言は書体の base 層に収める）
 */
describe('描いた進行タイマーの文字は書体の常用の層に収まる', () => {
  it('対照: 検査は base 層に無い字を拾う（拾えない検査は常に緑になる）', () => {
    expect(outsideBase(['議論'])).not.toEqual([]);
  });

  it('同梱のサンプルの区切りも書体の base 層に収まる', () => {
    const names = SAMPLE_GROUPS.flatMap((group) => group.scenarios.flatMap((scenario) =>
      scenario.steps.map((step) => step.name),
    ));
    expect(outsideBase(names.filter((name) => name !== 'Try の議論'))).toEqual([]);
  });

  it.each([
    ['参加の途中', null],
    ['組む前', IDLE_AGENDA],
    ['進行中', runningAgenda(1000)],
    ['オーバー中', runningAgenda(65_000)],
    ['一時停止中・延長・スキップあり', new Driver([1, 2, 3]).extend(3).skip('s-3').pause(1000).view(2000)],
    ['終了', new Driver([1, 2, 3]).skip('s-3').next(90_000).extend(1).next(250_000).view(250_000)],
    ['回数 2 以上の進行中（回の札・見出し）', new Driver([1, 2], 'LT', 'wait', 3).next(60_000).next(180_000).pause(190_000).view(200_000)],
    ['回数 2 以上の終了（一覧の回の見出し）', new Driver([1], 'LT', 'wait', 2).next(60_000).next(120_000).view(120_000)],
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

  it('Given 組む前 / When サンプルの一覧を開く / Then 見出しや名前に base 層から外れる字は無い', () => {
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => {
      latestSocket().open();
      latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      latestSocket().deliver({ type: 'agenda', state: IDLE_AGENDA });
    });
    fireEvent.click(screen.getByRole('button', { name: SAMPLE_MENU_BUTTON }));
    // 一覧が実際に開いて描かれている（開かずに緑にならない）
    expect(renderedText()).toContain('KPT のふりかえり');
    expect(outsideBase([checkedText()])).toEqual([]);
  });

  it('Given ルームにシナリオがある / When サンプルを選んで置き換えの確かめを開く / Then 確かめの字も外れない', () => {
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => {
      latestSocket().open();
      latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      latestSocket().deliver({ type: 'agenda', state: { ...IDLE_AGENDA, title: 'Retro', steps: [{ id: 's-1', name: 'Check', durationSec: 60, onTimeout: 'wait', skipped: false, extensionSec: 0, spentMs: null }] } });
    });
    // ルームの写しのままなら確かめない。1 文字変えて、消える下書きにしてから選ぶ
    fireEvent.change(screen.getByRole('textbox', { name: 'ステップ 1 の名前' }), { target: { value: 'Checkx' } });
    fireEvent.click(screen.getByRole('button', { name: SAMPLE_MENU_BUTTON }));
    fireEvent.click(screen.getByRole('button', { name: /朝会/ }));
    expect(renderedText()).toContain(SAMPLE_REPLACE_CONFIRM);
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

  it.each([
    ['映す表示', PROJECT_BUTTON],
    ['「最初から」の確認', RESET_BUTTON],
  ])('Given 進行中 / When %s を開く / Then 外れる字は無い', (_label, button) => {
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => {
      latestSocket().open();
      latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
      latestSocket().deliver({ type: 'agenda', state: runningAgenda(1000) });
    });
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(outsideBase([checkedText()])).toEqual([]);
    expect(renderedText().length).toBeGreaterThan(5);
  });
});
