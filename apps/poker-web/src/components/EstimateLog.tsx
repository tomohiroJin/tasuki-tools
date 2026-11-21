/**
 * 見積もりの記録の欄（#93・spec §4.4）。
 *
 * wire の束・行は古い順で届く。画面は新しい方を上に出すので、ここで逆順にする。
 * 閉じた束の見出しからは、在室者なら誰でもポイントを入れ直せる（spec §4.3）。
 */
import { useId, useMemo } from 'react';
import type { EstimateGroupView, NumberCardValue } from '@tasuki/poker-core';
import { useCopyText } from '@tasuki/invite-ui';
import {
  ESTIMATE_CHANGE_POINTS,
  ESTIMATE_LOG_COPIED,
  ESTIMATE_LOG_COPY,
  ESTIMATE_LOG_COPY_FAILED,
  ESTIMATE_LOG_EMPTY,
  ESTIMATE_LOG_HEADING,
  ESTIMATE_LOG_MANUAL_COPY,
  ESTIMATE_NO_POINTS,
  ESTIMATE_OPEN,
  RENAME_GROUP,
  attemptLabel,
  estimateTitle,
} from '../estimate-copy';
import { estimateEntryCounts, estimateEntryTime, estimateLogMarkdown } from '../estimate-log-text';
import { EstimateItemField } from './EstimateItemField';
import { PointsSelect } from './PointsSelect';

export interface EstimateLogProps {
  /** wire の順（古い束が先） */
  groups: readonly EstimateGroupView[];
  onSetPoints: (groupId: number, points: NumberCardValue | null) => void;
  /** 閉じた束の名前を直す（#427・設計 E）。open の束の名前は「いま見積もっているもの」の欄が持つ */
  onRenameGroup: (groupId: number, item: string) => void;
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

export function EstimateLog({ groups, onSetPoints, onRenameGroup, disabled, limit, className, labelledBy, scrollable = false }: EstimateLogProps) {
  const headingId = useId();
  const markdown = useMemo(() => estimateLogMarkdown(groups), [groups]);
  // 失敗の表示は残す（手で選ぶ前に 2 秒で消えない）。記録が変われば自動で idle に戻り、古い Markdown の欄は消える
  const { copy, state: copyState } = useCopyText(markdown, { keepFailure: true });
  const copyStatus = copyState === 'done' ? ESTIMATE_LOG_COPIED
    : copyState === 'failed' ? ESTIMATE_LOG_COPY_FAILED : '';
  const newestFirst = [...groups].reverse();
  const shown = limit === undefined ? newestFirst : newestFirst.slice(0, limit);

  return (
    <section
      className={className ? `estimate-log ui-reader ${className}` : 'estimate-log ui-reader'}
      // スクロールする置き場所では内側の領域が名前を持つ（領域が二重にならない）
      {...(scrollable ? {} : { 'aria-labelledby': labelledBy ?? headingId })}
    >
      {(labelledBy === undefined || groups.length > 0) && (
        <div className="ui-section-head">
          {labelledBy === undefined && <h2 id={headingId}>{ESTIMATE_LOG_HEADING}</h2>}
          {groups.length > 0 && (
            <div className="estimate-log-copy">
              <button type="button" className="ui-button ui-button--secondary ui-button--sm" onClick={() => void copy()}>
                {ESTIMATE_LOG_COPY}
              </button>
              {/* 失敗の知らせは読み上げ（live region）にだけ残し、見た目は隠す。ボタンと見出しの行を動かさない。
                  目に見える文は、本体の頭の欄の上に置く（live region にしない。読み上げの二重を避ける） */}
              <span role="status" className={copyState === 'done' ? 'estimate-log-copy-status' : 'ui-visually-hidden'}>{copyStatus}</span>
            </div>
          )}
        </div>
      )}
      {/* スクロールする置き場所では、フォーカスを受ける領域を札（`.ui-reader`）の子にする。
          輪の色を変える部品の規則は子孫にだけ効き、札そのものには効かない */}
      <div
        className="estimate-log-body"
        {...(scrollable ? { role: 'region', tabIndex: 0, 'aria-labelledby': labelledBy ?? headingId } : {})}
      >
        {/* コピーに失敗したときの欄は本体の頭に置く。脇では本体がスクロールする領域なので、高さは本体のスクロールが受け持ち、
            欄は rows の高さのまま札からはみ出さない（#653 のレビュー・2 回目） */}
        {copyState === 'failed' && (
          <div className="estimate-log-manual">
            <p className="estimate-log-manual-notice">{ESTIMATE_LOG_COPY_FAILED}</p>
            <textarea
              aria-label={ESTIMATE_LOG_MANUAL_COPY}
              className="ui-input"
              readOnly
              rows={5}
              value={markdown}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        )}
        {groups.length === 0 ? (
          <p className="estimate-log-empty">{ESTIMATE_LOG_EMPTY}</p>
        ) : (
          <ol className="estimate-groups">
            {shown.map((group) => (
              <li key={group.id} className="estimate-group ui-stack ui-stack--tight" data-group={group.id}>
                <div className="estimate-group-head ui-section-head">
                  {group.open ? (
                    <>
                      <span className="estimate-group-item">{estimateTitle(group.item, group.id)}</span>
                      <span className="estimate-group-open">{ESTIMATE_OPEN}</span>
                    </>
                  ) : (
                    <>
                      <div className="estimate-group-item">
                        <EstimateItemField
                          item={group.item}
                          number={group.id}
                          onCommit={(next) => onRenameGroup(group.id, next)}
                          disabled={disabled}
                          label={RENAME_GROUP}
                          size="inline"
                        />
                      </div>
                      {/* ポイントは選択そのものを見出しの強い値として出す（値を別に重ねない） */}
                      <PointsSelect
                        className="estimate-group-points"
                        value={group.points as NumberCardValue | null}
                        onChange={(p) => onSetPoints(group.id, p)}
                        emptyLabel={ESTIMATE_NO_POINTS}
                        label={`${estimateTitle(group.item, group.id)} ${ESTIMATE_CHANGE_POINTS}`}
                        disabled={disabled}
                      />
                    </>
                  )}
                </div>
                <ul className="estimate-entries">
                  {[...group.entries].reverse().map((entry) => (
                    <li key={entry.attempt} className="estimate-entry" data-testid="estimate-entry">
                      <span className="estimate-entry-attempt">{attemptLabel(entry.attempt)}</span>{' '}
                      <span className="estimate-entry-time">{estimateEntryTime(entry.at)}</span>{' '}
                      <span className="estimate-entry-counts">
                        {estimateEntryCounts(entry.counts)}
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
