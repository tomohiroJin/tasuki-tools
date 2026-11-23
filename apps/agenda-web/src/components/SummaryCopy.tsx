/**
 * 終了の一覧を Markdown でコピーする操作（#676）。終了の一覧と一緒に、会が終わった後だけ描かれる。
 *
 * 文は `summaryMarkdown`（純関数）。書き出す日時は、この部品が描かれた時（会が終わって一覧が出た時）の壁時計を 1 度だけ取って固定する
 * （描き直しのたびに文が変わらない）。コピーに失敗したら、同じ文を選べる欄（`<textarea readonly>`）に出す
 * （poker の記録 #653・うちわけの持ち帰りと同じ作法。失敗の表示は 2 秒で消さない）。
 */
import { useEffect, useMemo, useState } from 'react';
import { useCopyText } from '@tasuki/invite-ui';
import type { AgendaView } from '@tasuki/agenda-core';
import { SUMMARY_COPY_BUTTON, SUMMARY_COPY_DONE, SUMMARY_COPY_FAILED, SUMMARY_COPY_MANUAL_FIELD } from '../copy';
import { summaryMarkdown } from '../summary-markdown';

interface Props {
  view: AgendaView;
  /** 書き出す日時の元（部品が描かれた時の値だけを使う） */
  wallNow: Date;
}

export function SummaryCopy({ view, wallNow }: Props) {
  const [moment] = useState(() => ({ wallMs: wallNow.getTime(), tzOffsetMin: -wallNow.getTimezoneOffset() }));
  const markdown = useMemo(() => summaryMarkdown(view, moment), [view, moment]);
  const { copy, state } = useCopyText(markdown, { keepFailure: true });
  // 手で選ぶ欄は、失敗した試みで開き、成功した試みで閉じる。文が変わって state が idle に戻っても開いたまま残す（選んでいる途中で欄が消えない）
  const [manualKept, setManualKept] = useState(false);
  useEffect(() => {
    if (state === 'failed') setManualKept(true);
    else if (state === 'done') setManualKept(false);
  }, [state]);
  const manualOpen = state === 'failed' || (manualKept && state === 'idle');

  return (
    <div className="summary-copy">
      <div className="summary-copy-actions">
        <button type="button" className="ui-button ui-button--secondary ui-button--sm" onClick={() => void copy()}>
          {SUMMARY_COPY_BUTTON}
        </button>
        <p role="status" className="summary-copy-status">
          {state === 'done' ? SUMMARY_COPY_DONE : state === 'failed' ? SUMMARY_COPY_FAILED : ''}
        </p>
      </div>
      {manualOpen && (
        <textarea
          aria-label={SUMMARY_COPY_MANUAL_FIELD}
          className="ui-input summary-copy-manual"
          readOnly
          rows={8}
          value={markdown}
          onFocus={(event) => {
            // iOS Safari は readOnly の欄で select() だけでは全文が選ばれないことがあるので、範囲も指す
            event.currentTarget.select();
            event.currentTarget.setSelectionRange(0, event.currentTarget.value.length);
          }}
        />
      )}
    </div>
  );
}
