/**
 * 組む画面（#429 spec §4.2）。**画面はルームを通して描く**（同期フックの差し込みと、他の人の置き換えの
 * フレームを実際の経路で受けるため）。送った中身は `ScriptedWebSocket` が覚えている。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import {
  ADD_STEP_BUTTON,
  MAX_PLANNED_NOTE,
  MAX_STEPS_NOTE,
  ROUNDS_LABEL,
  roundsMinusLabel,
  roundsPlusLabel,
  perRoundSummary,
  LOAD_FIRST_TEXT,
  LOAD_TO_ROOM_BUTTON,
  SAMPLE_TITLE,
  SCENARIO_CHANGED_NOTE,
  START_BUTTON,
  plannedSummary,
  stepMoveDownLabel,
  stepMoveUpLabel,
  stepRemoveLabel,
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

/** 回数つきの開始前の状態（steps は 1 回目の定義を回数ぶん写した展開済みの形） */
function roundsAgenda(title: string, steps: readonly (readonly [string, number])[], rounds: number) {
  const base = idleAgenda(title, steps).steps;
  return {
    ...IDLE_AGENDA,
    title,
    rounds,
    steps: Array.from({ length: rounds }, (_, r) => base.map((s) => ({ ...s, round: r + 1 }))).flat().map((s, i) => ({ ...s, id: `s-${i + 1}` })),
  };
}

const roundsField = () => screen.getByRole('spinbutton', { name: ROUNDS_LABEL }) as HTMLInputElement;

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
    // 回数 1 では rounds のキーそのものを送らない（第 1 段の定義と同じ形）
    expect('rounds' in scenario).toBe(false);
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

  it('Given 他の人が置き換えた / When 知らせが出る / Then 読み上げの領域は文だけで、戻すボタンは領域の外', () => {
    joinedRoom();
    pickSample();
    typeName(1, 'Mine');
    deliverAgenda(idleAgenda('Other', [['Theirs', 10]]));
    const region = screen.getAllByRole('status').find((el) => el.textContent?.includes(SCENARIO_CHANGED_NOTE));
    expect(region?.textContent).toBe(SCENARIO_CHANGED_NOTE);
    expect(region?.querySelector('button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ルームのシナリオに戻す' }));
    expect(nameField(1).value).toBe('Theirs');
    expect(region?.textContent).toBe('');
  });

  it('Given 読み込んだ後に下書きを触った / When 自分の送ったシナリオが返る / Then 「シナリオが変わりました」は出ない', () => {
    joinedRoom();
    pickSample();
    fireEvent.click(loadButton());
    typeName(1, 'After');
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
    expect(nameField(1).value).toBe('After');
    // 他の人の置き換えなら、同じ下書きでも知らせる（送った鍵だけを見逃す）
    deliverAgenda(idleAgenda('Other', [['Theirs', 10]]));
    expect(document.body.textContent).toContain(SCENARIO_CHANGED_NOTE);
  });

  it('Given 押せない主の操作 / When 描く / Then 理由は常設の status にあり、ボタンの説明に結ばれる', () => {
    joinedRoom();
    pickSample();
    // 下書きがルームと違う: 開始は押せず、理由は「読み込んでから」
    const start = screen.getByRole('button', { name: START_BUTTON });
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription(LOAD_FIRST_TEXT);
    expect(screen.getAllByRole('status').some((el) => el.textContent === LOAD_FIRST_TEXT)).toBe(true);
    // 検証で落ちる: 同じ status の文が理由に替わる
    typeName(2, ' ');
    expect(screen.getAllByRole('status').some((el) => el.textContent === 'ステップ 2 の名前が空です')).toBe(true);
    expect(loadButton()).toHaveAccessibleDescription('ステップ 2 の名前が空です');
  });

  it('Given 5 行 / When 2 行目を消す / Then フォーカスは次の行（新しい 2 行目）の名前へ。最後の 1 行を消すと「ステップを追加」へ', () => {
    joinedRoom();
    pickSample();
    fireEvent.click(screen.getByRole('button', { name: stepRemoveLabel(2) }));
    expect(nameField(2).value).toBe('投票');
    expect(document.activeElement).toBe(nameField(2));
    // 最後の行を消すと前の行へ
    fireEvent.click(screen.getByRole('button', { name: stepRemoveLabel(4) }));
    expect(document.activeElement).toBe(nameField(3));
    for (let n = 3; n >= 1; n--) fireEvent.click(screen.getByRole('button', { name: stepRemoveLabel(n) }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: ADD_STEP_BUTTON }));
  });

  it('Given 2 行目 / When 上へで先頭に着く / Then 押せなくなった上へではなく、同じ行の下へにフォーカス', () => {
    joinedRoom();
    pickSample();
    fireEvent.click(screen.getByRole('button', { name: stepMoveUpLabel(2) }));
    expect(nameField(1).value).toBe('P を出す');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: stepMoveDownLabel(1) }));
    // 端でなければ、押したボタンに留まる
    fireEvent.click(screen.getByRole('button', { name: stepMoveDownLabel(3) }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: stepMoveDownLabel(4) }));
    // 末尾に着いたら上へ
    fireEvent.click(screen.getByRole('button', { name: stepMoveDownLabel(4) }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: stepMoveUpLabel(5) }));
  });

  it('Given ルームも下書きも空 / When 描く / Then サンプルの札にステップの名前と分が並ぶ', () => {
    joinedRoom();
    const card = screen.getByRole('button', { name: new RegExp(SAMPLE_TITLE) });
    expect(within(card).getByText('Try の議論 40 分')).toBeDefined();
    expect(within(card).getByText('K を出す 5 分')).toBeDefined();
  });

  it('Given サンプルを読んだ / When くりかえしを 6 にする / Then 合計が「1 回あたり 2 分 × 6 回 ＝ 全部で 12 分」になる', () => {
    joinedRoom();
    fireEvent.click(screen.getByRole('button', { name: /朝会/ }));
    fireEvent.change(roundsField(), { target: { value: '3' } });
    expect(screen.getByText(perRoundSummary(2, 3, 6))).toBeDefined();
    fireEvent.change(roundsField(), { target: { value: '6' } });
    expect(screen.getByText(perRoundSummary(2, 6, 12))).toBeDefined();
  });

  it('Given 回数 1 / When 合計の行を見る / Then 第 1 段と同じ「予定 n 分」', () => {
    joinedRoom();
    pickSample();
    expect(screen.getByText(plannedSummary(60))).toBeDefined();
    expect(roundsField().value).toBe('1');
    expect(document.body.textContent).not.toContain('1 回あたり');
  });

  it('Given 朝会のサンプル / When 押す / Then 回数の欄が 6 になる。−／＋ で動き、下限と上限で押せなくなる', () => {
    joinedRoom();
    fireEvent.click(screen.getByRole('button', { name: /朝会/ }));
    expect(roundsField().value).toBe('6');
    fireEvent.click(screen.getByRole('button', { name: roundsPlusLabel }));
    expect(roundsField().value).toBe('7');
    fireEvent.click(screen.getByRole('button', { name: roundsMinusLabel }));
    expect(roundsField().value).toBe('6');
    fireEvent.change(roundsField(), { target: { value: '1' } });
    expect(screen.getByRole('button', { name: roundsMinusLabel })).toBeDisabled();
    fireEvent.change(roundsField(), { target: { value: '30' } });
    expect(screen.getByRole('button', { name: roundsPlusLabel })).toBeDisabled();
  });

  it('Given 回数を 8 にした / When 「ルームに読み込む」を押す / Then 送るのはそのときだけで、scenario に rounds が載る', () => {
    joinedRoom();
    fireEvent.click(screen.getByRole('button', { name: /朝会/ }));
    fireEvent.change(roundsField(), { target: { value: '8' } });
    expect(sentCommands('agenda.scenario.set')).toHaveLength(0);
    fireEvent.click(loadButton());
    const scenario = sentCommands('agenda.scenario.set')[0]?.['scenario'] as { rounds?: number };
    expect(scenario.rounds).toBe(8);
  });

  it('Given 保存済みの回数 6 の朝会 / When 一覧を見る / Then 全部の分と回数を出す', () => {
    joinedRoom(roundsAgenda('朝会', [['話す', 2]], 6));
    fireEvent.click(screen.getByRole('button', { name: 'この端末に保存' }));
    const list = screen.getByRole('list', { name: '保存済み' });
    expect(within(list).getByText('1 ステップ × 6 回・全部で 12 分')).toBeDefined();
  });

  it('Given サンプルの札 / When 描く / Then 朝会の札は全部の分と回数を出す', () => {
    joinedRoom();
    const card = screen.getByRole('button', { name: /朝会/ });
    expect(within(card).getByText('1 ステップ × 6 回・全部で 12 分')).toBeDefined();
  });

  it('Given ルームのシナリオが回数 6 / When 組む画面を開く / Then 回数の欄は 6 で、ルームと同じ状態（読み込めず開始できる）', () => {
    joinedRoom(roundsAgenda('朝会', [['話す', 2]], 6));
    expect(roundsField().value).toBe('6');
    expect(loadButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: START_BUTTON })).toBeEnabled();
  });

  it('Given 空の組む画面で回数を 5 にした / When ルームのシナリオが変わる / Then 下書きの回数 5 が残る', () => {
    joinedRoom();
    fireEvent.change(roundsField(), { target: { value: '5' } });
    deliverAgenda(idleAgenda('Other', [['Theirs', 10]]));
    expect(roundsField().value).toBe('5');
  });

  it('Given 回数 6 で 10 ステップ / When 見る / Then 追加ボタンは無効で、60 の上限の注記が出る（20 の注記ではない）', () => {
    joinedRoom(idleAgenda('Retro', Array.from({ length: 10 }, (_, i) => [`s${i}`, 60] as const)));
    fireEvent.change(roundsField(), { target: { value: '6' } });
    expect(screen.getByRole('button', { name: ADD_STEP_BUTTON })).toBeDisabled();
    expect(screen.getByText(MAX_PLANNED_NOTE)).toBeDefined();
    expect(screen.queryByText(MAX_STEPS_NOTE)).toBeNull();
  });

  it('Given 回数が範囲外（31） / When 合計の行を見る / Then 1 回分の「予定 n 分」を出す', () => {
    joinedRoom();
    fireEvent.click(screen.getByRole('button', { name: /朝会/ }));
    fireEvent.change(roundsField(), { target: { value: '31' } });
    expect(document.body.textContent).not.toContain('1 回あたり');
    expect(document.querySelector('.builder-total')?.textContent).toBe(plannedSummary(2));
  });

  it('Given 回数の欄を空にした下書き / When ルームのシナリオが変わる / Then 下書きは残り「シナリオが変わりました」が出る', () => {
    joinedRoom(idleAgenda('Retro', [['Check', 5]]));
    fireEvent.change(roundsField(), { target: { value: '' } });
    deliverAgenda(idleAgenda('Other', [['Theirs', 10]]));
    expect(nameField(1).value).toBe('Check');
    expect(roundsField().value).toBe('');
    expect(screen.getAllByRole('status').some((el) => el.textContent?.includes(SCENARIO_CHANGED_NOTE))).toBe(true);
  });
});
