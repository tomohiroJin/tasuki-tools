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
  {
    label: '朝会',
    scenario: {
      title: '朝会',
      steps: [{ name: '話す', durationSec: 120, onTimeout: 'advance' }],
      rounds: 6,
    },
  },
  {
    label: 'LT 会',
    scenario: {
      title: 'LT 会',
      steps: [
        { name: '発表', durationSec: 300, onTimeout: 'advance' },
        { name: '入れ替え', durationSec: 60, onTimeout: 'advance' },
      ],
      rounds: 5,
    },
  },
];
