/**
 * 同梱のサンプル（#429 spec §7.6、#636）。新しいサンプルの文言は書体の base 層に収める。
 */
import type { ScenarioInput, StepInput, TimeoutBehavior } from '@tasuki/agenda-core';

const step = (name: string, minutes: number, onTimeout: TimeoutBehavior = 'wait'): StepInput =>
  ({ name, durationSec: minutes * 60, onTimeout });

export interface SampleRepeat {
  readonly start: number;
  readonly count: number;
  readonly steps: readonly StepInput[];
}

export interface SampleScenario extends ScenarioInput {
  readonly repeat?: SampleRepeat;
}

/** 会の一部を行に展開し、下書きでその部分の回数を変えるための情報を添える。 */
function repeatedSample(
  title: string,
  before: readonly StepInput[],
  repeat: Omit<SampleRepeat, 'start'>,
  after: readonly StepInput[],
): SampleScenario {
  return {
    title,
    steps: [...before, ...Array.from({ length: repeat.count }, () => repeat.steps).flat(), ...after],
    repeat: { ...repeat, start: before.length },
  };
}

export const SAMPLE_GROUPS: readonly { readonly heading: string; readonly scenarios: readonly SampleScenario[] }[] = [
  {
    heading: 'ミーティング',
    scenarios: [
      {
        title: '1 時間の定例',
        steps: [
          step('チェックイン', 5),
          step('前回のしゅくだい', 10),
          step('話題 A', 15),
          step('話題 B', 15),
          step('決めたことをたしかめる', 10),
          step('予備', 5),
        ],
      },
      {
        title: '30 分の定例',
        steps: [step('チェックイン', 3), step('話題', 20), step('決めたことをたしかめる', 5), step('予備', 2)],
      },
      {
        title: '1on1',
        steps: [step('このごろの話', 5), step('相手の話', 15), step('こちらの話', 5), step('次までにやること', 5)],
      },
    ],
  },
  {
    heading: 'スクラム',
    scenarios: [
      repeatedSample(
        'リファインメント（PBR）',
        [],
        { count: 3, steps: [step('説明', 3), step('質問', 5), step('見積もり', 2)] },
        [step('まとめ', 5)],
      ),
      {
        title: 'スプリントプランニング',
        steps: [step('ゴールをたしかめる', 10), step('こうほを見る', 20), step('計画', 40), step('合意', 10)],
      },
      repeatedSample(
        'スプリントレビュー',
        [step('開会', 5)],
        { count: 3, steps: [step('デモ', 10, 'advance'), step('質問', 5)] },
        [step('次の方しん', 10)],
      ),
      {
        title: '朝会',
        steps: [step('話す', 2, 'advance')],
        rounds: 6,
      },
      {
        title: 'KPT のふりかえり',
        steps: [step('K を出す', 5), step('P を出す', 7), step('投票', 1), step('Try の議論', 40), step('予備', 7)],
      },
    ],
  },
  {
    heading: '学ぶ・作る',
    scenarios: [
      repeatedSample(
        'モブの学習会',
        [step('お題の説明', 5)],
        { count: 3, steps: [step('モブ', 25), step('ひとやすみ', 5, 'advance')] },
        [step('ふりかえり', 10)],
      ),
      repeatedSample(
        '読書会',
        [step('ひとりで読む', 15, 'advance')],
        { count: 3, steps: [step('かんそう', 3)] },
        [step('話し合い', 20), step('まとめ', 5)],
      ),
      {
        title: 'LT 会',
        steps: [step('発表', 5, 'advance'), step('入れ替え', 1, 'advance')],
        rounds: 5,
      },
      repeatedSample(
        'ポモドーロ',
        [],
        { count: 4, steps: [step('さぎょう', 25, 'advance'), step('ひとやすみ', 5, 'advance')] },
        [step('まとめのひとやすみ', 15, 'advance')],
      ),
      {
        title: 'ワークショップ（アイデアを出してまとめる）',
        steps: [step('説明', 5), step('ひとりで書く', 10, 'advance'), step('共有', 15), step('まとめる', 15), step('決める', 10)],
      },
    ],
  },
];
