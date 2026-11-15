/**
 * 行を消す・動かす・足した後のフォーカス先（#595 で ScenarioBuilder から分けた純粋な判断）。
 * 押した部品が消える・押せなくなると、フォーカスが文書の先頭へ落ちるので、次の置き先を決める。
 */
import { describe, expect, it } from 'vitest';
import type { Draft } from '../src/scenario-draft';
import { focusAfterAdd, focusAfterMove, focusAfterRemove } from '../src/step-focus';

const draftOf = (n: number): Draft => ({
  title: 't',
  rounds: '1',
  steps: Array.from({ length: n }, (_, i) => ({ key: 100 + i, name: `s${i}`, minutes: '5', onTimeout: 'advance' as const })),
});

describe('消した後のフォーカス', () => {
  it('消した行の次の行の名前の欄へ', () => {
    expect(focusAfterRemove(draftOf(3), 0)).toEqual({ key: 101, target: 'name' });
  });
  it('途中の行を消したら、前でなく次の行の名前の欄へ', () => {
    expect(focusAfterRemove(draftOf(3), 1)).toEqual({ key: 102, target: 'name' });
  });
  it('最後の行を消したら、前の行の名前の欄へ', () => {
    expect(focusAfterRemove(draftOf(3), 2)).toEqual({ key: 101, target: 'name' });
  });
  it('行が無くなれば「ステップを追加」へ', () => {
    expect(focusAfterRemove(draftOf(1), 0)).toBe('add');
  });
});

describe('動かした後のフォーカス', () => {
  it('途中で上へ動かしたら、同じ行の「上へ」に残る', () => {
    expect(focusAfterMove(draftOf(3), 2, -1)).toEqual({ key: 102, target: 'up' });
  });
  it('途中で下へ動かしたら、同じ行の「下へ」に残る', () => {
    expect(focusAfterMove(draftOf(3), 0, 1)).toEqual({ key: 100, target: 'down' });
  });
  it('先頭に着いた上への操作は、押せなくなるので反対の「下へ」へ', () => {
    expect(focusAfterMove(draftOf(3), 1, -1)).toEqual({ key: 101, target: 'down' });
  });
  it('末尾に着いた下への操作は、反対の「上へ」へ', () => {
    expect(focusAfterMove(draftOf(3), 1, 1)).toEqual({ key: 101, target: 'up' });
  });
  it('行が無い番号なら置き先なし', () => {
    expect(focusAfterMove(draftOf(2), 5, 1)).toBeNull();
  });
});

describe('足した後のフォーカス', () => {
  it('行が増えたら、足した行の名前の欄へ', () => {
    expect(focusAfterAdd(draftOf(1), draftOf(2))).toEqual({ key: 101, target: 'name' });
  });
  it('上限で足せず同じ下書きのままなら置き先なし', () => {
    const d = draftOf(2);
    expect(focusAfterAdd(d, d)).toBeNull();
  });
});
