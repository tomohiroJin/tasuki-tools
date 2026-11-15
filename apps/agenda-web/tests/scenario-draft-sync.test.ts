/**
 * 下書きとルームのシナリオの付き合わせ（#595 で ScenarioBuilder から分けた純粋な判断）。
 * @requirements #429 spec §4.2 の 4（ルームが変わっても、手元で変えた下書きは上書きしない）
 */
import type { ScenarioInput } from '@tasuki/agenda-core';
import { describe, expect, it } from 'vitest';
import { draftFromInput, scenarioKey, type Draft } from '../src/scenario-draft';
import { adoptRoom, afterDraftEdit, initDraftState, markSent, reconcileRoom } from '../src/scenario-draft-sync';

const step = (name: string, durationSec: number) => ({ name, durationSec, onTimeout: 'advance' as const });
const scenario = (title: string, rounds?: number): ScenarioInput =>
  rounds === undefined ? { title, steps: [step('a', 300)] } : { title, steps: [step('a', 300)], rounds };
const EMPTY: ScenarioInput = { title: '', steps: [] };

describe('下書きとルームの付き合わせ', () => {
  it('同じ鍵なら状態をそのまま返す（何も変えない）', () => {
    const state = initDraftState(scenario('A'));
    expect(reconcileRoom(state, scenario('A'))).toBe(state);
  });

  it('Given 空の下書き / When ルームのシナリオが変わる / Then 下書きはルームのものになり、知らせは出ない', () => {
    const state = initDraftState(EMPTY);
    const next = reconcileRoom(state, scenario('B'));
    expect(next.draft.title).toBe('B');
    expect(next.changed).toBe(false);
    expect(next.roomKey).toBe(scenarioKey(scenario('B')));
  });

  it('Given 手を付けていない下書き（前のルームの写し） / When ルームが変わる / Then 下書きは追いつき、知らせは出ない', () => {
    const state = initDraftState(scenario('A'));
    const next = reconcileRoom(state, scenario('B'));
    expect(next.draft.title).toBe('B');
    expect(next.changed).toBe(false);
  });

  it('Given 手元で変えた下書き / When 他の人がルームを置き換える / Then 下書きは残り、知らせが出る', () => {
    const state = afterDraftEdit(initDraftState(scenario('A')), { ...initDraftState(scenario('A')).draft, title: '手元' });
    const next = reconcileRoom(state, scenario('B'));
    expect(next.draft.title).toBe('手元');
    expect(next.changed).toBe(true);
    expect(next.roomKey).toBe(scenarioKey(scenario('B')));
  });

  it('Given 自分が送ったシナリオ / When それがルームに返ってくる / Then 知らせは出ない', () => {
    const base = initDraftState(scenario('A'));
    const edited = afterDraftEdit(base, { ...base.draft, title: '手元' });
    const sent = markSent(edited, scenario('手元'));
    const next = reconcileRoom(sent, scenario('手元'));
    expect(next.changed).toBe(false);
    expect(next.draft.title).toBe('手元');
  });

  it('Given 手元で変えた下書き / When ルームが下書きと同じになる / Then 知らせは出ない', () => {
    const base = initDraftState(scenario('A'));
    const edited = afterDraftEdit(base, { ...base.draft, title: 'C' });
    const next = reconcileRoom(edited, scenario('C'));
    expect(next.changed).toBe(false);
    expect(next.draft.title).toBe('C');
  });

  it('Given 回数の欄を空にした下書き / When ルームが変わる / Then 触った下書きとして残す（回数 1 のルームと同じ鍵になっても上書きしない）', () => {
    const base = initDraftState(scenario('A'));
    const blank: Draft = { ...base.draft, rounds: '' };
    const state = afterDraftEdit(base, blank);
    const next = reconcileRoom(state, scenario('B'));
    expect(next.draft.rounds).toBe('');
    expect(next.draft.title).toBe('A');
  });

  it('Given 知らせが出ている / When 下書きをルームと同じに直す / Then 知らせが下りる。違うままなら下りない', () => {
    const base = initDraftState(scenario('A'));
    const edited = afterDraftEdit(base, { ...base.draft, title: '手元' });
    const changed = reconcileRoom(edited, scenario('B'));
    expect(changed.changed).toBe(true);
    expect(afterDraftEdit(changed, { ...changed.draft, title: '手元2' }).changed).toBe(true);
    expect(afterDraftEdit(changed, draftFromInput(scenario('B'))).changed).toBe(false);
  });

  it('「ルームのに戻す」は下書きをルームのものにして知らせを下ろす', () => {
    const base = initDraftState(scenario('A'));
    const edited = afterDraftEdit(base, { ...base.draft, title: '手元' });
    const changed = reconcileRoom(edited, scenario('B'));
    const back = adoptRoom(changed, scenario('B'));
    expect(back.draft.title).toBe('B');
    expect(back.changed).toBe(false);
  });
});
