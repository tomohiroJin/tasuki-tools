// 公開後の結果表示（平均・最頻値。FR-010）
// 各自の票は場の席の札がめくれて見せる（#348）。ここは集計だけを持つ
import type { CSSProperties } from 'react';
import type { RoundStats } from '@tasuki/poker-core';
import { cardLabel } from './CardHand';

interface Props {
  stats: RoundStats;
  /** 席の数。集計を最後の札のめくりの後に出すための待ち時間に使う */
  seatCount: number;
  /**
   * 席の札がめくれる公開か（投票中から公開を見届けた）。`false`（再読み込み・途中入室などで最初から公開済み）では
   * 札はめくれないので、集計を待たせない
   */
  afterFlip: boolean;
}

/** 平均は小数 1 桁に丸めて表示（core は生値を返す。data-model 集計ルール） */
function formatAverage(average: number | null): string {
  if (average === null) return '—（算出不能）';
  return String(Math.round(average * 10) / 10);
}

export function Results({ stats, seatCount, afterFlip }: Props) {
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
    </section>
  );
}
