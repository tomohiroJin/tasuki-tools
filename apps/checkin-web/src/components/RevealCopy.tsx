/**
 * 開いた結果の持ち出し（#676・設計 §16）。［Markdown でコピー］と、失敗したときに同じ文を手で選べる欄。
 *
 * - 札が開いた後にしか置かない（呼ぶ側が `status === 'revealed'` のときだけ描く）。開く前の中身は Markdown に載らない
 * - 回ごとに作り直す（呼ぶ側が `key={seq}` を付ける）。前の回の失敗の欄・書き出した時刻を次の回へ持ち越さない
 * - 書き出す時刻は、この部品が出たとき（札が開いたのを見たとき）に 1 度だけ読む。画面を開き直した人は開き直した時刻になる
 * - 失敗の欄は、失敗した試みで開き、成功した試みで閉じる（poker #653・track #476 と同じ作法。失敗の表示は 2 秒で消さない）
 */
import { useEffect, useMemo, useState } from 'react';
import { useCopyText } from '@tasuki/invite-ui';
import type { MethodId, PileView, Visibility } from '@tasuki/checkin-core';
import { MD_COPY_BUTTON, MD_COPY_DONE, MD_COPY_FAILED, MD_COPY_MANUAL_FIELD } from '../copy';
import { revealMarkdown } from '../reveal-markdown';

interface Props {
  method: MethodId;
  visibility: Visibility;
  piles: readonly PileView[];
}

export function RevealCopy({ method, visibility, piles }: Props) {
  const [at] = useState(() => Date.now());
  const markdown = useMemo(
    () => revealMarkdown({ method, visibility, piles, nowMs: at, tzOffsetMin: -new Date(at).getTimezoneOffset() }),
    [method, visibility, piles, at],
  );
  const { copy, state } = useCopyText(markdown, { keepFailure: true });
  const [manualKept, setManualKept] = useState(false);
  useEffect(() => {
    if (state === 'failed') setManualKept(true);
    else if (state === 'done') setManualKept(false);
  }, [state]);
  const manualOpen = state === 'failed' || (manualKept && state === 'idle');

  return (
    <section className="reveal-copy">
      <div className="reveal-copy-actions">
        <button type="button" className="ui-button ui-button--secondary" onClick={() => void copy()}>
          {MD_COPY_BUTTON}
        </button>
        <p role="status" className="reveal-copy-status">
          {state === 'done' ? MD_COPY_DONE : state === 'failed' ? MD_COPY_FAILED : ''}
        </p>
      </div>
      {manualOpen && (
        <textarea
          aria-label={MD_COPY_MANUAL_FIELD}
          className="ui-input reveal-copy-manual"
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
    </section>
  );
}
