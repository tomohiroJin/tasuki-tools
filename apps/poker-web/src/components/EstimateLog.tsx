/**
 * 見積もりの記録の欄（#93・spec §4.4）。
 *
 * wire の束・行は古い順で届く。画面は新しい方を上に出すので、ここで逆順にする。
 * 閉じた束の見出しからは、在室者なら誰でもポイントを入れ直せる（spec §4.3）。
 */
import { useId } from 'react';
import type { EstimateGroupView, NumberCardValue } from '@tasuki/poker-core';
import {
  ESTIMATE_CHANGE_POINTS,
  ESTIMATE_LOG_EMPTY,
  ESTIMATE_LOG_HEADING,
  ESTIMATE_NO_POINTS,
  ESTIMATE_OPEN,
  ESTIMATE_UNNAMED,
  attemptLabel,
} from '../estimate-copy';
import { cardLabel } from './CardHand';
import { PointsSelect } from './PointsSelect';

export interface EstimateLogProps {
  /** wire の順（古い束が先） */
  groups: readonly EstimateGroupView[];
  onSetPoints: (groupId: number, points: NumberCardValue | null) => void;
  disabled: boolean;
  /** 新しい束から数えて出す数。省略で全部 */
  limit?: number;
  /** 置き場所ごとの修飾（`room-log--side` など） */
  className?: string;
  /** 領域の名前を付ける要素の id。指定すると自前の見出しを描かない（シートが見出しを持つとき） */
  labelledBy?: string;
  /** 束が溢れてスクロールする置き場所（脇）で、キーボードでもスクロールできるようにする */
  scrollable?: boolean;
}

const TIME_FORMAT = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' });

export function EstimateLog({ groups, onSetPoints, disabled, limit, className, labelledBy, scrollable = false }: EstimateLogProps) {
  const headingId = useId();
  const newestFirst = [...groups].reverse();
  const shown = limit === undefined ? newestFirst : newestFirst.slice(0, limit);

  return (
    <section
      className={className ? `estimate-log ui-reader ${className}` : 'estimate-log ui-reader'}
      // スクロールする置き場所では内側の領域が名前を持つ（領域が二重にならない）
      {...(scrollable ? {} : { 'aria-labelledby': labelledBy ?? headingId })}
    >
      {labelledBy === undefined && <h2 id={headingId}>{ESTIMATE_LOG_HEADING}</h2>}
      {/* スクロールする置き場所では、フォーカスを受ける領域を札（`.ui-reader`）の子にする。
          輪の色を変える部品の規則は子孫にだけ効き、札そのものには効かない */}
      <div
        className="estimate-log-body"
        {...(scrollable ? { role: 'region', tabIndex: 0, 'aria-labelledby': labelledBy ?? headingId } : {})}
      >
        {groups.length === 0 ? (
          <p className="estimate-log-empty">{ESTIMATE_LOG_EMPTY}</p>
        ) : (
          <ol className="estimate-groups">
            {shown.map((group) => (
              <li key={group.id} className="estimate-group" data-group={group.id}>
                <div className="estimate-group-head">
                  <span className="estimate-group-item">{group.item === '' ? ESTIMATE_UNNAMED : group.item}</span>
                  {group.open ? (
                    <span className="estimate-group-open">{ESTIMATE_OPEN}</span>
                  ) : (
                    // ポイントは選択そのものを見出しの強い値として出す（値を別に重ねない）
                    <PointsSelect
                      className="estimate-group-points"
                      value={group.points as NumberCardValue | null}
                      onChange={(p) => onSetPoints(group.id, p)}
                      emptyLabel={ESTIMATE_NO_POINTS}
                      label={ESTIMATE_CHANGE_POINTS}
                      disabled={disabled}
                    />
                  )}
                </div>
                <ul className="estimate-entries">
                  {[...group.entries].reverse().map((entry) => (
                    <li key={entry.attempt} className="estimate-entry" data-testid="estimate-entry">
                      <span className="estimate-entry-attempt">{attemptLabel(entry.attempt)}</span>{' '}
                      <span className="estimate-entry-time">{TIME_FORMAT.format(new Date(entry.at))}</span>{' '}
                      <span className="estimate-entry-counts">
                        {entry.counts.map((c) => `${cardLabel(c.card)}×${c.count}`).join(' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
