/**
 * 組む画面の下書き（#429 第 2 段・回数）。純粋関数だけを確かめる。
 */
import { INITIAL_AGENDA_STATE, MAX_ROUNDS, MIN_ROUNDS, replaceScenario, roundsOf, toView, type ScenarioInput } from '@tasuki/agenda-core';
import { describe, expect, it } from 'vitest';
import { plannedStepsTooManyText, roundsRangeText, totalTooLongText } from '../src/copy';
import {
  bumpRounds,
  checkDraft,
  draftFromInput,
  inputFromDraft,
  inputFromView,
  perRoundMinutes,
  previewView,
  roundsOfDraft,
  scenarioKey,
  totalMinutes,
  type Draft,
} from '../src/scenario-draft';

const step = (name: string, durationSec: number) => ({ name, durationSec, onTimeout: 'advance' as const });
const input = (steps: ScenarioInput['steps'], rounds?: number): ScenarioInput =>
  rounds === undefined ? { title: '会', steps } : { title: '会', steps, rounds };
const draftOf = (steps: ScenarioInput['steps'], rounds: string): Draft => ({ ...draftFromInput(input(steps)), rounds });

/**
 * @requirements #429 第 2 段（シナリオの回数）
 */
describe('下書きの回数', () => {
  it('回数 6 のルームのシナリオを下書きへ写すと 1 区切りと回数 6 になる（m455）', () => {
    const state = replaceScenario(INITIAL_AGENDA_STATE, input([step('朝会', 120)], 6));
    const view = toView(state._unsafeUnwrap(), 0);
    expect(view.steps).toHaveLength(6);
    const got = inputFromView(view);
    expect(got.steps).toHaveLength(1);
    expect(got.rounds).toBe(6);
    expect(draftFromInput(got).rounds).toBe('6');
  });

  it('回数だけ違う下書きはルームと同じと見なさない（m456）', () => {
    const steps = [step('a', 60)];
    expect(scenarioKey(input(steps, 2))).not.toBe(scenarioKey(input(steps, 3)));
    expect(scenarioKey(input(steps))).toBe(scenarioKey(input(steps, 1)));
  });

  it('回数 1 の下書きは回数のキーを送らない（m457）', () => {
    const steps = [step('a', 60)];
    expect('rounds' in inputFromDraft(draftOf(steps, '1'))).toBe(false);
    expect(inputFromDraft(draftOf(steps, '3')).rounds).toBe(3);
  });

  it('draftFromInput は省略を 1 として文字で持つ', () => {
    expect(draftFromInput(input([step('a', 60)])).rounds).toBe('1');
    expect(draftFromInput(input([step('a', 60)], 4)).rounds).toBe('4');
  });

  it('1 回あたり 40 分 × 5 回は合計の理由で止まる', () => {
    const d = draftOf([step('a', 2400)], '5');
    expect(perRoundMinutes(d)).toBe(40);
    expect(totalMinutes(d)).toBe(200);
    const r = checkDraft(d, '汎用');
    expect(r).toEqual({ ok: false, reason: totalTooLongText(200) });
  });

  it('回数 0・31・空欄は回数の理由で止まる', () => {
    for (const rounds of ['0', '31', '', 'x']) {
      expect(checkDraft(draftOf([step('a', 60)], rounds), '汎用')).toEqual({ ok: false, reason: roundsRangeText() });
    }
    expect(checkDraft(draftOf([step('a', 60)], '30'), '汎用').ok).toBe(true);
  });

  it('4 区切り × 16 回は区切りの数の理由で止まる', () => {
    const steps = [step('a', 60), step('b', 60), step('c', 60), step('d', 60)];
    expect(checkDraft(draftOf(steps, '16'), '汎用')).toEqual({ ok: false, reason: plannedStepsTooManyText(64) });
    expect(checkDraft(draftOf(steps, '15'), '汎用').ok).toBe(true);
  });

  it('回数 6 の下書きは検証を通り、回数つきで送る', () => {
    const r = checkDraft(draftOf([step('話す', 120)], '6'), '汎用');
    expect(r.ok && roundsOf(r.input)).toBe(6);
  });

  it('bumpRounds は 1 と 30 で止まる', () => {
    const at = (rounds: string) => draftOf([step('a', 60)], rounds);
    expect(bumpRounds(at('1'), -1)).toBe(String(MIN_ROUNDS));
    expect(bumpRounds(at('30'), 1)).toBe(String(MAX_ROUNDS));
    expect(bumpRounds(at('3'), 1)).toBe('4');
    expect(bumpRounds(at('3'), -1)).toBe('2');
    expect(bumpRounds(at(''), 1)).toBe('1');
  });

  it('roundsOfDraft は整数でなければ null', () => {
    expect(roundsOfDraft(draftOf([], ' 7 '))).toBe(7);
    expect(roundsOfDraft(draftOf([], ''))).toBeNull();
    expect(roundsOfDraft(draftOf([], '1.5'))).toBeNull();
  });

  it('previewView は回数ぶん展開し、読めない・範囲外の回数は 1 として展開する', () => {
    const steps = [step('a', 60), step('b', 60)];
    const six = previewView(draftOf(steps, '3'));
    expect(six?.rounds).toBe(3);
    expect(six?.steps).toHaveLength(6);
    expect(six?.steps.map((s) => s.round)).toEqual([1, 1, 2, 2, 3, 3]);
    for (const bad of ['', '0', '31']) {
      const v = previewView(draftOf(steps, bad));
      expect(v?.rounds).toBe(1);
      expect(v?.steps).toHaveLength(2);
    }
  });
});
