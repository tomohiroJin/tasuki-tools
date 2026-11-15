import { useState } from 'react';
import type { ScenarioInput } from '@tasuki/agenda-core';
import type { Draft } from '../scenario-draft';
import {
  adoptRoom as syncAdoptRoom,
  afterDraftEdit,
  initDraftState,
  markSent as syncMarkSent,
  reconcileRoom,
  type DraftState,
} from '../scenario-draft-sync';

/**
 * 組む画面の下書き（state と、ルームのシナリオとの付き合わせ）。判断は `scenario-draft-sync.ts` の純粋関数に置き、
 * ここは React の state へ載せるだけ。**ルームが変わっても、手元で変えた下書きは上書きしない**（spec §4.2 の 4）。
 */
export function useScenarioDraft(room: ScenarioInput) {
  const [state, setState] = useState<DraftState>(() => initDraftState(room));
  // 描画の途中で前の値と比べて直す（React の「props の変化で state を調整する」型。effect を挟むと 1 枚古い画面が出る）
  const current = reconcileRoom(state, room);
  if (current !== state) setState(current);
  return {
    draft: current.draft,
    changed: current.changed,
    /** 付き合わせ済みのルームのシナリオの鍵（描画ごとに 1 回だけ計算した値を使い回す） */
    roomKey: current.roomKey,
    setDraft: (draft: Draft): void => setState((s) => afterDraftEdit(s, draft)),
    adoptRoom: (): void => setState((s) => syncAdoptRoom(s, room)),
    markSent: (input: ScenarioInput): void => setState((s) => syncMarkSent(s, input)),
  };
}
