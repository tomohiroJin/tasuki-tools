/**
 * 行を消す・動かす・足した後にフォーカスを置く先（#595 で ScenarioBuilder から分けた純粋な判断）。
 * 押した部品が消える・押せなくなると、フォーカスが文書の先頭へ落ちる。
 */
import type { Draft } from './scenario-draft';

export type RowFocusTarget = 'name' | 'up' | 'down';

export type FocusRequest = { readonly key: number; readonly target: RowFocusTarget } | 'add' | null;

/** 消した行の次（無ければ前）の名前の欄へ。行が無くなれば「ステップを追加」へ。`draft` は消す前の下書き */
export function focusAfterRemove(draft: Draft, i: number): FocusRequest {
  const neighbor = draft.steps[i + 1] ?? draft.steps[i - 1];
  return neighbor === undefined ? 'add' : { key: neighbor.key, target: 'name' };
}

/** 動かした行のフォーカス先。端に着いて押したボタンが押せなくなったら、同じ行の反対のボタンへ。行が無ければ null */
export function focusAfterMove(draft: Draft, i: number, delta: -1 | 1): FocusRequest {
  const step = draft.steps[i];
  if (step === undefined) return null;
  const to = i + delta;
  const atEdge = delta === -1 ? to === 0 : to === draft.steps.length - 1;
  const pressed: RowFocusTarget = delta === -1 ? 'up' : 'down';
  return { key: step.key, target: atEdge ? (pressed === 'up' ? 'down' : 'up') : pressed };
}

/** 足した行の名前の欄へ。上限で足せず同じ下書きのままなら null */
export function focusAfterAdd(before: Draft, after: Draft): FocusRequest {
  const added = after.steps.at(-1);
  return added !== undefined && after !== before ? { key: added.key, target: 'name' } : null;
}
