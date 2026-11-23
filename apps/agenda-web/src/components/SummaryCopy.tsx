/**
 * 終了の一覧を Markdown でコピーする操作（#676）。終了の一覧と一緒に、会が終わった後だけ描かれる。
 *
 * 文は `summaryMarkdown`（純関数）。見出しの日時 `at` は「この端末で終了の一覧を最初に出した時刻」で、呼ぶ側（`RunScreen`）が持つ
 * （映す表示の出入りで、この部品が作り直されても変わらない。agenda の状態は壁時計の終了時刻を持たないので、本当の終了時刻は作れない）。
 * コピーに失敗したら、同じ文を選べる欄（`<textarea readonly>`）に出す（poker の記録 #653・うちわけの持ち帰りと同じ作法。
 * 失敗の表示は 2 秒で消さない）。映す表示の出入りで、開いていた欄は閉じる（受容）。
 */
import { useEffect, useMemo, useState } from 'react';
import { useCopyText } from '@tasuki/invite-ui';
import type { AgendaView } from '@tasuki/agenda-core';
import { SUMMARY_COPY_BUTTON, SUMMARY_COPY_DONE, SUMMARY_COPY_FAILED, SUMMARY_COPY_MANUAL_FIELD } from '../copy';
import { summaryMarkdown, type SummaryMoment } from '../summary-markdown';

interface Props {
  view: AgendaView;
  /** 見出しに書く日時（この端末で終了の一覧を最初に出した時刻） */
  at: SummaryMoment;
}

export function SummaryCopy({ view, at }: Props) {
  const markdown = useMemo(() => summaryMarkdown(view, at), [view, at]);
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
