/**
 * 同梱のサンプル（#429 spec §7.6）。ステップの名前は利用者の文字に近いので copy.ts ではなくここに置く。
 */
import type { ScenarioInput } from '@tasuki/agenda-core';

export const SAMPLE_SCENARIOS: readonly { readonly label: string; readonly scenario: ScenarioInput }[] = [
  {
    label: 'KPT のふりかえり',
    scenario: {
      title: 'KPT のふりかえり',
      steps: [
        { name: 'K を出す', durationSec: 300, onTimeout: 'wait' },
        { name: 'P を出す', durationSec: 420, onTimeout: 'wait' },
        { name: '投票', durationSec: 60, onTimeout: 'wait' },
        { name: 'Try の議論', durationSec: 2400, onTimeout: 'wait' },
        { name: '予備', durationSec: 420, onTimeout: 'wait' },
      ],
    },
  },
];
