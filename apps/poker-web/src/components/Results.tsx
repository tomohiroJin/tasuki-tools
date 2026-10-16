// 公開後の結果表示（平均・最頻値。FR-010）と、見積もりが割れたときの促し（#405・FR-010a）
// 各自の票は場の席の札がめくれて見せる（#348）。ここは集計だけを持つ
import type { CSSProperties } from 'react';
import type { RoundStats } from '@tasuki/poker-core';
import { cardLabel } from './CardHand';
import type { SpreadPrompt } from '../room-view';

interface Props {
  stats: RoundStats;
  /** 席の数。集計を最後の札のめくりの後に出すための待ち時間に使う */
  seatCount: number;
  /**
   * 席の札がめくれる公開か（投票中から公開を見届けた）。`false`（再読み込み・途中入室などで最初から公開済み）では
   * 札はめくれないので、集計を待たせない
   */
  afterFlip: boolean;
  /** 見積もりが割れたときの最大と最小を出した人（割れていなければ null） */
  spread: SpreadPrompt | null;
}

/** 平均は小数 1 桁に丸めて表示（core は生値を返す。data-model 集計ルール） */
function formatAverage(average: number | null): string {
  if (average === null) return '—（算出不能）';
  return String(Math.round(average * 10) / 10);
}

/**
 * 割れたときの促しの決まった文言（#405）。名指しが責めに聞こえないよう、「理由を説明してください」ではなく
 * 「どう見たかを話してもらう」誘いの形にする。「札」「小」「考」「聞」は書体の常用の層に無いので使わない。
 * 名前は利用者の入力なので、常用の層の判定はこの決まった文言だけに当てる（テスト U9）。
 */
export const SPREAD_COPY = {
  lead: '見積もりが割れました。いちばん上の ',
  played: ' を出した ',
  between: ' と、いちばん下の ',
  tail: ' に、どう見たかを話してもらいませんか。',
} as const;

/** 名前は途中で折り返さない（「き／い」と割れると誰の名前か読めない）。1 人ずつ塊にする */
function Names({ names }: { names: readonly string[] }) {
  return names.map((name, i) => (
    <span key={i}>
      {i > 0 && '・'}
      <span className="results-spread-name">{name}</span>
    </span>
  ));
}

function SpreadNote({ spread: { high, low } }: { spread: SpreadPrompt }) {
  return (
    <p className="results-spread">
      {SPREAD_COPY.lead}
      {cardLabel(high.card)}
      {SPREAD_COPY.played}
      <Names names={high.names} />
      {SPREAD_COPY.between}
      {cardLabel(low.card)}
      {SPREAD_COPY.played}
      <Names names={low.names} />
      {SPREAD_COPY.tail}
    </p>
  );
}

export function Results({ stats, seatCount, afterFlip, spread }: Props) {
  return (
    <section
      className={`results${afterFlip ? ' results--after-flip' : ''}`}
      style={{ '--seat-count': seatCount } as CSSProperties}
    >
      <h2>結果</h2>
      <dl className="stats">
        <div>
          <dt>平均</dt>
          <dd>{formatAverage(stats.average)}</dd>
        </div>
        <div>
          <dt>最頻値</dt>
          <dd>{stats.modes.length === 0 ? '—' : stats.modes.map(cardLabel).join(' / ')}</dd>
        </div>
      </dl>
      {spread && <SpreadNote spread={spread} />}
    </section>
  );
}
