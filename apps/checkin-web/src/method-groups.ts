/**
 * やり方の選択の小見出し（#635）。側ごとに、やり方を目的で 3 つに分ける。React にも I/O にも依存しない表。
 *
 * やり方が各側 13 に増え、1 つの並びでは探しにくくなったため。並びは選択画面の見た目の正本で、
 * `METHOD_IDS` の並び（くじ・規則の正本）とは別に持つ。各側のやり方を**過不足なく 1 回ずつ**含むことは
 * `tests/method-groups.test.ts` が守る（足し忘れると、そのやり方は選択画面に出ない）。
 * **文言は書体の base 層に収める**（`tests/copy-fits-font-base.test.ts` が見る）。
 */
import type { MethodId, Side } from '@tasuki/checkin-core';

export interface MethodGroup {
  /** 要素の id に使う（側をまたいで一意） */
  readonly id: string;
  /** 小見出し */
  readonly title: string;
  readonly methods: readonly MethodId[];
}

export const METHOD_GROUPS: { readonly [S in Side]: readonly MethodGroup[] } = {
  checkin: [
    { id: 'checkin-mood', title: '気分と元気', methods: ['weather', 'energy', 'mood-start', 'battery', 'busyness', 'worry'] },
    { id: 'checkin-focus', title: '集中と準備', methods: ['focus', 'readiness', 'clarity'] },
    { id: 'checkin-stance', title: '期待と役割', methods: ['takeaway-goal', 'expectation', 'role', 'talk-wish'] },
  ],
  checkout: [
    { id: 'checkout-value', title: '時間の価値', methods: ['roti', 'takeaway-done', 'best-part', 'understanding', 'agreement'] },
    { id: 'checkout-mood', title: '気分と疲れ', methods: ['mood', 'weather-end', 'fatigue'] },
    { id: 'checkout-next', title: '進め方と次へ', methods: ['next-meeting', 'pace', 'voice', 'next-step', 'message'] },
  ],
};
