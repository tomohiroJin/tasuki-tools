/**
 * 組む画面（#429 spec §4.2）。**画面はルームを通して描く**（同期フックの差し込みと、他の人の置き換えの
 * フレームを実際の経路で受けるため）。送った中身は `ScriptedWebSocket` が覚えている。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import {
  LOAD_TO_ROOM_BUTTON,
  SAMPLE_TITLE,
  SCENARIO_CHANGED_NOTE,
  START_BUTTON,
  plannedSummary,
  stepMinutesLabel,
  stepNameLabel,
} from '../src/copy';
import { SAVED_SCENARIOS_KEY } from '../src/storage/saved-scenarios';
import { IDLE_AGENDA, RESUME, ScriptedWebSocket, latestSocket } from './support/scripted-web-socket';

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

/** 開始前の状態（ステップは名前と分の組） */
function idleAgenda(title: string, steps: readonly (readonly [string, number])[]) {
  return {
    ...IDLE_AGENDA,
    title,
    steps: steps.map(([name, minutes], i) => ({
      id: `s-${i + 1}`,
      name,
      durationSec: minutes * 60,
      onTimeout: 'wait',
      skipped: false,
      extensionSec: 0,
      spentMs: null,
    })),
  };
}

/** 入室して、最初の `agenda` フレームを受けた画面 */
function joinedRoom(state: unknown = IDLE_AGENDA): void {
  saveResumeIdentity(RESUME);
  render(<App />);
  act(() => {
    latestSocket().open();
    latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
    latestSocket().deliver({ type: 'agenda', state });
  });
}

const deliverAgenda = (state: unknown): void => act(() => latestSocket().deliver({ type: 'agenda', state }));

const sentCommands = (name: string) => latestSocket().sentJson().filter((m) => m['command'] === name);

const loadButton = () => screen.getByRole('button', { name: LOAD_TO_ROOM_BUTTON });

const nameField = (n: number) => screen.getByRole('textbox', { name: stepNameLabel(n) }) as HTMLInputElement;

const typeName = (n: number, value: string): void => {
  fireEvent.change(nameField(n), { target: { value } });
};

const pickSample = (): void => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(SAMPLE_TITLE) }));
};

/**
 * @requirements #429 spec §4.2（準備）
 */
describe('組む画面', () => {
  it('Given 下書きを編集中 / When 他の人がルームのシナリオを置き換える / Then 下書きは残り「シナリオが変わりました」が出る', () => {
    // Given
    joinedRoom();
    pickSample();
    typeName(1, 'Mine');
    // When
    deliverAgenda(idleAgenda('Other', [['Theirs', 10]]));
    // Then
    expect(nameField(1).value).toBe('Mine');
    expect(screen.getAllByRole('status').some((el) => el.textContent?.includes(SCENARIO_CHANGED_NOTE))).toBe(true);
    // 下書きはルームと違うので、まだ読み込める
    expect(loadButton()).toBeEnabled();
  });

  it('Given 下書きが空 / When ルームのシナリオが届く / Then 下書きはルームのものになり、知らせは出ない', () => {
    joinedRoom();
    deliverAgenda(idleAgenda('Retro', [['Check', 5], ['Talk', 10]]));
    expect(nameField(1).value).toBe('Check');
    expect(nameField(2).value).toBe('Talk');
    expect(document.body.textContent).not.toContain(SCENARIO_CHANGED_NOTE);
    // 下書きはルームと同じなので、読み込めず、開始できる
    expect(loadButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: START_BUTTON })).toBeEnabled();
  });

  it('Given 下書きがルームと同じ / When 他の人が置き換える / Then 下書きも追いつき、知らせは出ない', () => {
    joinedRoom(idleAgenda('Retro', [['Check', 5]]));
    deliverAgenda(idleAgenda('Retro', [['Check', 5], ['Talk', 10]]));
    expect(nameField(2).value).toBe('Talk');
    expect(document.body.textContent).not.toContain(SCENARIO_CHANGED_NOTE);
  });

  it('Given サンプルを読んだ / When 名前に改行・タブを貼る / Then 改行は欄が捨て、タブが残れば「ルームに読み込む」は押せず、理由が出る', () => {
    joinedRoom();
    pickSample();
    expect(loadButton()).toBeEnabled();
    // 1 行の欄は改行を捨てる（HTML の値の整え。ブラウザも jsdom も同じ）。改行はルームへ届かない
    typeName(1, 'K\nP');
    expect(nameField(1).value).toBe('KP');
    // タブは 1 行の欄でも残る制御文字。残ったら押せないことを固定する
    typeName(1, 'K\tP');
    expect(nameField(1).value).toBe('K\tP');
    expect(loadButton()).toBeDisabled();
    expect(loadButton()).toHaveAccessibleDescription(/ステップ 1/);
  });

  it('Given サンプルを読んだ / When 名前を空白だけにする / Then 「ルームに読み込む」は押せない', () => {
    joinedRoom();
    pickSample();
    typeName(2, '   ');
    expect(loadButton()).toBeDisabled();
    expect(loadButton()).toHaveAccessibleDescription(/ステップ 2/);
  });

  it('Given サンプルを読んだ / When 41 字を入れる / Then 41 字目は入らない', () => {
    joinedRoom();
    pickSample();
    typeName(1, 'a'.repeat(41));
    expect(nameField(1).value).toBe('a'.repeat(40));
    expect(loadButton()).toBeEnabled();
  });

  it('Given ルームも下書きも空 / When サンプルを押す / Then 5 行・合計 60 分になる', () => {
    joinedRoom();
    pickSample();
    const minutes = [1, 2, 3, 4, 5].map((n) => Number((screen.getByRole('spinbutton', { name: stepMinutesLabel(n) }) as HTMLInputElement).value));
    expect(screen.getAllByRole('textbox', { name: /^ステップ \d+ の名前$/ })).toHaveLength(5);
    expect(minutes.reduce((a, b) => a + b, 0)).toBe(60);
    expect(screen.getByText(plannedSummary(60))).toBeDefined();
    // サンプルの札は下書きが空でなくなったら下がる
    expect(screen.queryByRole('button', { name: new RegExp(SAMPLE_TITLE) })).toBeNull();
  });

  it('Given サンプルの 2 行目を 8 分にした / When 「ルームに読み込む」を押す / Then agenda.scenario.set が 1 通、秒で送られる', () => {
    joinedRoom();
    pickSample();
    fireEvent.change(screen.getByRole('spinbutton', { name: stepMinutesLabel(2) }), { target: { value: '8' } });
    fireEvent.click(loadButton());
    const sent = sentCommands('agenda.scenario.set');
    expect(sent).toHaveLength(1);
    const scenario = sent[0]?.['scenario'] as { title: string; steps: { name: string; durationSec: number; onTimeout: string }[] };
    expect(scenario.steps.map((s) => s.durationSec)).toEqual([300, 480, 60, 2400, 420]);
    expect(scenario.steps.map((s) => s.onTimeout)).toEqual(['wait', 'wait', 'wait', 'wait', 'wait']);
    expect(scenario.title).toBe('KPT のふりかえり');
  });

  it('Given ルームに読み込んだ / When 自分の置き換えが返る / Then 知らせは出ず、開始で agenda.start を送る', () => {
    joinedRoom();
    pickSample();
    fireEvent.click(loadButton());
    deliverAgenda(
      idleAgenda('KPT のふりかえり', [
        ['K を出す', 5],
        ['P を出す', 7],
        ['投票', 1],
        ['Try の議論', 40],
        ['予備', 7],
      ]),
    );
    expect(document.body.textContent).not.toContain(SCENARIO_CHANGED_NOTE);
    expect(loadButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: START_BUTTON }));
    expect(sentCommands('agenda.start')).toHaveLength(1);
  });

  it('Given 「+」を押す / When 分が変わる / Then 下書きの分が 1 つ増え、送る秒にも乗る', () => {
    joinedRoom();
    pickSample();
    fireEvent.click(screen.getByRole('button', { name: /ステップ 3 を 1 分ふやす/ }));
    expect((screen.getByRole('spinbutton', { name: stepMinutesLabel(3) }) as HTMLInputElement).value).toBe('2');
    fireEvent.click(loadButton());
    const scenario = sentCommands('agenda.scenario.set')[0]?.['scenario'] as { steps: { durationSec: number }[] };
    expect(scenario.steps[2]?.durationSec).toBe(120);
  });

  it('Given 下書き / When この端末に保存して一覧から選ぶ / Then 名前・合計・ステップ数が 1 行に出て、選ぶと下書きに入る', () => {
    joinedRoom(idleAgenda('Retro', [['Check', 5], ['Talk', 10]]));
    fireEvent.click(screen.getByRole('button', { name: 'この端末に保存' }));
    const list = screen.getByRole('list', { name: '保存済み' });
    expect(within(list).getByText('Retro')).toBeDefined();
    expect(within(list).getByText('2 ステップ・15 分')).toBeDefined();
    expect(localStorage.getItem(SAVED_SCENARIOS_KEY)).toContain('Retro');
    // 下書きを変えてから、保存から戻す
    typeName(1, 'Changed');
    fireEvent.click(within(list).getByRole('button', { name: /^Retro.*ステップ/ }));
    expect(nameField(1).value).toBe('Check');
  });
});
