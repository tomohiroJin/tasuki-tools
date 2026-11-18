/**
 * 同梱のサンプル（#429 spec §7.6、#636）。新しいサンプルの文言は書体の base 層に収める。
 */
import type { ScenarioInput, StepInput, TimeoutBehavior } from '@tasuki/agenda-core';

const step = (name: string, minutes: number, onTimeout: TimeoutBehavior = 'wait'): StepInput =>
  ({ name, durationSec: minutes * 60, onTimeout });

/** 一部だけをくりかえす会では、始めや終わりの区切りを一度にするため、選んだ時点で編集できる行に展開する。 */
const repeatSteps = (count: number, ...steps: StepInput[]): StepInput[] =>
  Array.from({ length: count }, () => steps).flat();

export const SAMPLE_GROUPS: readonly { readonly heading: string; readonly scenarios: readonly ScenarioInput[] }[] = [
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
      {
        title: 'リファインメント（PBR）',
        steps: [...repeatSteps(3, step('説明', 3), step('質問', 5), step('見積もり', 2)), step('まとめ', 5)],
      },
      {
        title: 'スプリントプランニング',
        steps: [step('ゴールをたしかめる', 10), step('こうほを見る', 20), step('計画', 40), step('合意', 10)],
      },
      {
        title: 'スプリントレビュー',
        steps: [step('開会', 5), ...repeatSteps(3, step('デモ', 10, 'advance'), step('質問', 5)), step('次の方しん', 10)],
      },
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
      {
        title: 'モブの学習会',
        steps: [
          step('お題の説明', 5),
          ...repeatSteps(3, step('モブ', 25), step('ひとやすみ', 5, 'advance')),
          step('ふりかえり', 10),
        ],
      },
      {
        title: '読書会',
        steps: [step('ひとりで読む', 15, 'advance'), ...repeatSteps(3, step('かんそう', 3)), step('話し合い', 20), step('まとめ', 5)],
      },
      {
        title: 'LT 会',
        steps: [step('発表', 5, 'advance'), step('入れ替え', 1, 'advance')],
        rounds: 5,
      },
      {
        title: 'ポモドーロ',
        steps: [
          ...repeatSteps(4, step('さぎょう', 25, 'advance'), step('ひとやすみ', 5, 'advance')),
          step('まとめのひとやすみ', 15, 'advance'),
        ],
      },
      {
        title: 'ワークショップ（アイデアを出してまとめる）',
        steps: [step('説明', 5), step('ひとりで書く', 10, 'advance'), step('共有', 15), step('まとめる', 15), step('決める', 10)],
      },
    ],
  },
];
