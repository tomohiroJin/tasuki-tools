/**
 * 組む画面（#429 spec §4.2）。**画面はルームを通して描く**（同期フックの差し込みと、他の人の置き換えの
 * フレームを実際の経路で受けるため）。送った中身は `ScriptedWebSocket` が覚えている。
 */
import { flushSync } from 'react-dom';
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
  perRoundSummaryParts,
  LOAD_FIRST_TEXT,
  LOAD_TO_ROOM_BUTTON,
  SAMPLE_MENU_BUTTON,
  SAMPLE_REPLACE_CONFIRM,
  SAMPLE_REPLACE_NO,
  SAMPLE_REPLACE_YES,
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

const menuButton = () => screen.getByRole('button', { name: SAMPLE_MENU_BUTTON });

/** 「サンプルから選ぶ」を開く（開いていれば何もしない） */
const openSamples = (): void => {
  if (menuButton().getAttribute('aria-expanded') !== 'true') fireEvent.click(menuButton());
};

/** 一覧を開いて、名前に label を含む行を押す */
const pickRow = (label: RegExp | string): void => {
  openSamples();
  fireEvent.click(screen.getByRole('button', { name: label }));
};

const pickSample = (): void => pickRow(new RegExp(SAMPLE_TITLE));

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
    // 読み込んだら一覧は閉じる（開閉のボタンは残り、また選べる）
    expect(menuButton().getAttribute('aria-expanded')).toBe('false');
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

  it('Given ルームも下書きも空 / When 一覧を開く / Then 3 行が名前と全部の分・回数を 1 行ずつ出す', () => {
    joinedRoom();
    openSamples();
    const rows = screen.getAllByRole('button', { name: /^サンプル：/ });
    expect(rows).toHaveLength(3);
    expect(within(rows[0] as HTMLElement).getByText('5 ステップ・60 分')).toBeDefined();
  });

  it('Given サンプルを読んだ / When くりかえしを 6 にする / Then 合計が「1 回あたり 2 分 × 6 回 ＝ 全部で 12 分」になる', () => {
    joinedRoom();
    pickRow(/朝会/);
    fireEvent.change(roundsField(), { target: { value: '3' } });
    expect(document.querySelector('.builder-total')?.textContent).toBe(perRoundSummaryParts(2, 3, 6).join(' '));
    fireEvent.change(roundsField(), { target: { value: '6' } });
    expect(document.querySelector('.builder-total')?.textContent).toBe(perRoundSummaryParts(2, 6, 12).join(' '));
    // 意味の塊 3 つに分かれ、各塊は折り返さない。文全体の textContent は変わらない
    const total = document.querySelector('.builder-total');
    expect([...(total?.querySelectorAll('.builder-total-chunk') ?? [])].map((c) => c.textContent)).toEqual(['1 回あたり 2 分', '× 6 回', '＝ 全部で 12 分']);
    expect(total?.textContent).toBe('1 回あたり 2 分 × 6 回 ＝ 全部で 12 分');
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
    pickRow(/朝会/);
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
    pickRow(/朝会/);
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

  it('Given 一覧を開いた / When 朝会の行を見る / Then 全部の分と回数を出す', () => {
    joinedRoom();
    openSamples();
    const row = screen.getByRole('button', { name: /朝会/ });
    expect(within(row).getByText('1 ステップ × 6 回・全部で 12 分')).toBeDefined();
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

  it('Given 回数 6 で 10 ステップ / When 見る / Then 追加ボタンは無効で、60 の上限の注記が出る（定義の数の注記ではない）', () => {
    joinedRoom(idleAgenda('Retro', Array.from({ length: 10 }, (_, i) => [`s${i}`, 60] as const)));
    fireEvent.change(roundsField(), { target: { value: '6' } });
    expect(screen.getByRole('button', { name: ADD_STEP_BUTTON })).toBeDisabled();
    expect(screen.getByText(MAX_PLANNED_NOTE)).toBeDefined();
    expect(screen.queryByText(MAX_STEPS_NOTE)).toBeNull();
  });

  it('Given 40 ステップのルームのシナリオ / When 見る / Then 追加ボタンは無効で、「ステップは 40 までです」が出る', () => {
    joinedRoom(idleAgenda('Long', Array.from({ length: 40 }, (_, i) => [`s${i}`, 1] as const)));
    expect(screen.getByRole('button', { name: ADD_STEP_BUTTON })).toBeDisabled();
    expect(screen.getByText('ステップは 40 までです')).toBeDefined();
    expect(screen.queryByText(MAX_PLANNED_NOTE)).toBeNull();
  });

  it('Given 39 ステップ / When 見る / Then 追加ボタンは押せて、上限の注記は出ない', () => {
    joinedRoom(idleAgenda('Long', Array.from({ length: 39 }, (_, i) => [`s${i}`, 1] as const)));
    expect(screen.getByRole('button', { name: ADD_STEP_BUTTON })).toBeEnabled();
    expect(screen.queryByText('ステップは 40 までです')).toBeNull();
    expect(screen.queryByText(MAX_PLANNED_NOTE)).toBeNull();
  });

  it('Given 回数が範囲外（99） / When 見る / Then 追加ボタンは押せて、60 の上限の注記は出ない', () => {
    joinedRoom();
    fireEvent.change(roundsField(), { target: { value: '99' } });
    expect(screen.getByRole('button', { name: ADD_STEP_BUTTON })).toBeEnabled();
    expect(screen.queryByText(MAX_PLANNED_NOTE)).toBeNull();
    expect(screen.queryByText(MAX_STEPS_NOTE)).toBeNull();
  });

  it('Given 回数が範囲外（31） / When 合計の行を見る / Then 1 回分の「予定 n 分」を出す', () => {
    joinedRoom();
    pickRow(/朝会/);
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

/**
 * @requirements #429 利用者フィードバック F1〜F3（サンプルは小さな一覧に畳み、いつでも選べる。中身のある下書きは確かめてから置き換える）
 */
describe('サンプルから選ぶ', () => {
  const rowNames = () => screen.queryAllByRole('button', { name: /^サンプル：/ });

  it('Given 空のルーム / When 組む画面を開く / Then 札は出ず、閉じた「サンプルから選ぶ」が 1 つだけあり、押すと 3 行が開く', () => {
    joinedRoom();
    expect(screen.getAllByRole('button', { name: SAMPLE_MENU_BUTTON })).toHaveLength(1);
    expect(menuButton().getAttribute('aria-expanded')).toBe('false');
    expect(rowNames()).toHaveLength(0);
    fireEvent.click(menuButton());
    expect(rowNames().map((b) => b.textContent)).toEqual([
      expect.stringContaining('KPT のふりかえり'),
      expect.stringContaining('朝会'),
      expect.stringContaining('LT 会'),
    ]);
  });

  it('Given 一覧は閉じている / When 押す・もう一度押す / Then aria-expanded が true、false になり、aria-controls が一覧を指す', () => {
    joinedRoom();
    fireEvent.click(menuButton());
    expect(menuButton().getAttribute('aria-expanded')).toBe('true');
    const target = document.getElementById(menuButton().getAttribute('aria-controls') ?? '');
    expect(target).not.toBeNull();
    expect(rowNames()).toHaveLength(3);
    fireEvent.click(menuButton());
    expect(menuButton().getAttribute('aria-expanded')).toBe('false');
    expect(rowNames()).toHaveLength(0);
  });

  it('Given ルームにシナリオがある / When 組む画面を開く / Then 「サンプルから選ぶ」がある（これまでは空のときだけだった）', () => {
    joinedRoom(idleAgenda('Retro', [['Check', 5]]));
    expect(screen.getAllByRole('button', { name: SAMPLE_MENU_BUTTON })).toHaveLength(1);
    fireEvent.click(menuButton());
    expect(rowNames()).toHaveLength(3);
  });

  it('Given 下書きに中身がある / When 描く / Then 「サンプルから選ぶ」がある', () => {
    joinedRoom();
    pickSample();
    typeName(1, 'Mine');
    expect(screen.getAllByRole('button', { name: SAMPLE_MENU_BUTTON })).toHaveLength(1);
  });

  it('Given 下書きが空 / When 行を選ぶ / Then 確かめずにそのまま読み込み、一覧は閉じる', () => {
    joinedRoom();
    pickRow(/朝会/);
    expect(screen.queryByText(SAMPLE_REPLACE_CONFIRM)).toBeNull();
    expect((screen.getByRole('textbox', { name: '会の名前' }) as HTMLInputElement).value).toBe('朝会');
    expect(roundsField().value).toBe('6');
    expect(menuButton().getAttribute('aria-expanded')).toBe('false');
    expect(rowNames()).toHaveLength(0);
  });

  it('Given 下書きに中身がある / When 行を選ぶ / Then 「いまの下書きを消して読み込みますか」が出て、まだ読み込まれない', () => {
    joinedRoom();
    pickSample();
    typeName(1, 'Mine');
    pickRow(/朝会/);
    const group = screen.getByRole('group', { name: SAMPLE_REPLACE_CONFIRM });
    expect(within(group).getByRole('button', { name: SAMPLE_REPLACE_YES })).toBeDefined();
    expect(nameField(1).value).toBe('Mine');
    // 安全な側（やめる）にフォーカスがある
    expect(document.activeElement).toBe(within(group).getByRole('button', { name: SAMPLE_REPLACE_NO }));
  });

  it('Given 下書きに中身がある / When 確かめで消して読み込むを押す / Then 選んだサンプルが下書きになり、一覧は閉じる', () => {
    joinedRoom();
    pickSample();
    typeName(1, 'Mine');
    pickRow(/朝会/);
    fireEvent.click(screen.getByRole('button', { name: SAMPLE_REPLACE_YES }));
    expect((screen.getByRole('textbox', { name: '会の名前' }) as HTMLInputElement).value).toBe('朝会');
    expect(nameField(1).value).toBe('話す');
    expect(roundsField().value).toBe('6');
    expect(screen.queryByText(SAMPLE_REPLACE_CONFIRM)).toBeNull();
    expect(menuButton().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menuButton());
  });

  it('Given 下書きに中身がある / When 確かめでやめるを押す / Then 下書きはそのままで、フォーカスは開閉のボタンへ戻る', () => {
    joinedRoom();
    pickSample();
    typeName(1, 'Mine');
    fireEvent.change(roundsField(), { target: { value: '3' } });
    pickRow(/朝会/);
    fireEvent.click(screen.getByRole('button', { name: SAMPLE_REPLACE_NO }));
    expect(nameField(1).value).toBe('Mine');
    expect(roundsField().value).toBe('3');
    expect(screen.queryByText(SAMPLE_REPLACE_CONFIRM)).toBeNull();
    expect(document.activeElement).toBe(menuButton());
  });

  it('Given ルームに KPT があり下書きがその写しのまま / When 朝会を選ぶ / Then 確かめずに読み込む', () => {
    joinedRoom(idleAgenda('Retro', [['Check', 5]]));
    expect(nameField(1).value).toBe('Check');
    pickRow(/朝会/);
    expect(screen.queryByText(SAMPLE_REPLACE_CONFIRM)).toBeNull();
    expect((screen.getByRole('textbox', { name: '会の名前' }) as HTMLInputElement).value).toBe('朝会');
  });

  it('Given ルームの写しの下書きを 1 文字変えた / When 朝会を選ぶ / Then 確かめる', () => {
    joinedRoom(idleAgenda('Retro', [['Check', 5]]));
    typeName(1, 'Checkx');
    pickRow(/朝会/);
    expect(screen.getByRole('group', { name: SAMPLE_REPLACE_CONFIRM })).toBeDefined();
    expect(nameField(1).value).toBe('Checkx');
  });

  it('Given 確かめを出している / When Esc を押す / Then 確かめは閉じて下書きはそのままで、「サンプルから選ぶ」にフォーカスが戻る', () => {
    joinedRoom();
    pickSample();
    typeName(1, 'Mine');
    pickRow(/朝会/);
    const group = screen.getByRole('group', { name: SAMPLE_REPLACE_CONFIRM });
    fireEvent.keyDown(within(group).getByRole('button', { name: SAMPLE_REPLACE_NO }), { key: 'Escape' });
    expect(screen.queryByRole('group', { name: SAMPLE_REPLACE_CONFIRM })).toBeNull();
    expect(nameField(1).value).toBe('Mine');
    expect(document.activeElement).toBe(menuButton());
  });

  it('Given 確かめを出している / When 下書きがルームと同じになって確かめが要らなくなる / Then 確かめは閉じる', () => {
    joinedRoom(idleAgenda('Retro', [['Check', 5]]));
    typeName(1, 'Checkx');
    pickRow(/朝会/);
    expect(screen.getByRole('group', { name: SAMPLE_REPLACE_CONFIRM })).toBeDefined();
    // 他の人が置き換えたルームのシナリオが、手元の下書きと同じになる
    deliverAgenda(idleAgenda('Retro', [['Checkx', 5]]));
    expect(nameField(1).value).toBe('Checkx');
    expect(screen.queryByRole('group', { name: SAMPLE_REPLACE_CONFIRM })).toBeNull();
  });

  it('Given 回数 1 のルームの写しの下書きで、くりかえしの欄を空にした / When 朝会を選ぶ / Then 写しではないので確かめる', () => {
    joinedRoom(idleAgenda('Retro', [['Check', 5]]));
    fireEvent.change(roundsField(), { target: { value: '' } });
    pickRow(/朝会/);
    expect(screen.getByRole('group', { name: SAMPLE_REPLACE_CONFIRM })).toBeDefined();
    expect(nameField(1).value).toBe('Check');
  });

  it('Given 確かめを出していてフォーカスは「やめる」 / When 下書きがルームと同じになって確かめが自動で閉じる / Then フォーカスは「サンプルから選ぶ」にある', () => {
    joinedRoom(idleAgenda('Retro', [['Check', 5]]));
    typeName(1, 'Checkx');
    pickRow(/朝会/);
    const group = screen.getByRole('group', { name: SAMPLE_REPLACE_CONFIRM });
    expect(document.activeElement).toBe(within(group).getByRole('button', { name: SAMPLE_REPLACE_NO }));
    deliverAgenda(idleAgenda('Retro', [['Checkx', 5]]));
    expect(screen.queryByRole('group', { name: SAMPLE_REPLACE_CONFIRM })).toBeNull();
    expect(document.activeElement).toBe(menuButton());
  });

  it('Given 確かめを出している / When 下書きがルームと同じになった直後の描画 / Then もう要らない確かめは DOM に無い（自動で閉じる effect より前に押せない）', () => {
    joinedRoom(idleAgenda('Retro', [['Check', 5]]));
    typeName(1, 'Checkx');
    pickRow(/朝会/);
    expect(screen.getByRole('group', { name: SAMPLE_REPLACE_CONFIRM })).toBeDefined();
    let during: HTMLElement | null = null;
    act(() => {
      // 画面に反映するところまでを同期で進め、effect はまだ流さない
      flushSync(() => latestSocket().deliver({ type: 'agenda', state: idleAgenda('Retro', [['Checkx', 5]]) }));
      during = screen.queryByText(SAMPLE_REPLACE_CONFIRM);
    });
    expect(during).toBeNull();
  });

  it('Given 確かめの外にフォーカスがある / When 確かめが自動で閉じる / Then フォーカスを奪わない', () => {
    joinedRoom(idleAgenda('Retro', [['Check', 5]]));
    typeName(1, 'Checkx');
    pickRow(/朝会/);
    nameField(1).focus();
    deliverAgenda(idleAgenda('Retro', [['Checkx', 5]]));
    expect(screen.queryByRole('group', { name: SAMPLE_REPLACE_CONFIRM })).toBeNull();
    expect(document.activeElement).toBe(nameField(1));
  });

  it('Given 会の名前とステップの欄 / When DOM の順を見る / Then 「サンプルから選ぶ」はそれらより後にある', () => {
    joinedRoom();
    pickSample();
    const after = (el: HTMLElement) => Boolean(el.compareDocumentPosition(menuButton()) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(screen.getByRole('textbox', { name: '会の名前' }))).toBe(true);
    expect(after(nameField(1))).toBe(true);
    expect(after(roundsField())).toBe(true);
  });

  it('Given 一覧を開いたまま / When 他の人がルームのシナリオを置き換える / Then 一覧は開いたまま、「シナリオが変わりました」も出る', () => {
    joinedRoom();
    pickSample();
    typeName(1, 'Mine');
    openSamples();
    deliverAgenda(idleAgenda('Other', [['Theirs', 10]]));
    expect(menuButton().getAttribute('aria-expanded')).toBe('true');
    expect(rowNames()).toHaveLength(3);
    expect(screen.getAllByRole('status').some((el) => el.textContent?.includes(SCENARIO_CHANGED_NOTE))).toBe(true);
  });
});
