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
}

const TIME_FORMAT = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' });

export function EstimateLog({ groups, onSetPoints, disabled, limit }: EstimateLogProps) {
  const headingId = useId();
  const newestFirst = [...groups].reverse();
  const shown = limit === undefined ? newestFirst : newestFirst.slice(0, limit);

  return (
    <section className="estimate-log" aria-labelledby={headingId}>
      <h2 id={headingId}>{ESTIMATE_LOG_HEADING}</h2>
      {shown.length === 0 ? (
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
                  <span className="estimate-group-result">
                    {group.points === null ? (
                      <span className="estimate-group-nopoints" data-testid="estimate-nopoints">{ESTIMATE_NO_POINTS}</span>
                    ) : (
                      <strong className="estimate-group-points" data-testid="estimate-points">
                        {group.points}
                      </strong>
                    )}
                    <PointsSelect
                      value={group.points as NumberCardValue | null}
                      onChange={(p) => onSetPoints(group.id, p)}
                      emptyLabel={ESTIMATE_NO_POINTS}
                      label={ESTIMATE_CHANGE_POINTS}
                      disabled={disabled}
                    />
                  </span>
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
    </section>
  );
}
