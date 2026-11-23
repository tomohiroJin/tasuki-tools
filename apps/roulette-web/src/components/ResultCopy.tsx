import { useEffect, useState } from 'react';
import { useCopyText } from '@tasuki/invite-ui';
import { RESULT_COPY_BUTTON, RESULT_COPY_DONE, RESULT_COPY_FAILED, RESULT_COPY_MANUAL_FIELD } from '../copy';

/**
 * 結果の Markdown をコピーする（#676）。**結果の札が出ているときだけ描く**（描くかは画面が `resultOf` で決める）。
 * 呼ぶ側は回転ごとに `key` を替える。次に回して結果が替わったとき、前の失敗の欄・知らせが残らない。
 *
 * コピーに失敗したら、コピーするはずだった同じ文を選べる欄（`<textarea readonly>`）に出す
 * （poker の記録 #653・うちわけ #476 と同じ作法。失敗の表示は 2 秒で消さない）。
 */
export function ResultCopy({ markdown }: { markdown: string }) {
  const { copy, state } = useCopyText(markdown, { keepFailure: true });
  // 手で選ぶ欄は、失敗した試みで開き、成功した試みで閉じる。文が変わって state が idle に戻っても開いたまま残す
  const [manualKept, setManualKept] = useState(false);
  useEffect(() => {
    if (state === 'failed') setManualKept(true);
    else if (state === 'done') setManualKept(false);
  }, [state]);
  const manualOpen = state === 'failed' || (manualKept && state === 'idle');

  return (
    <section className="roulette-result-copy ui-stack ui-stack--tight">
      <button type="button" className="ui-button ui-button--secondary" onClick={() => void copy()}>
        {RESULT_COPY_BUTTON}
      </button>
      <p role="status" className="ui-note roulette-result-copy-status">
        {state === 'done' ? RESULT_COPY_DONE : state === 'failed' ? RESULT_COPY_FAILED : ''}
      </p>
      {manualOpen && (
        <textarea
          aria-label={RESULT_COPY_MANUAL_FIELD}
          className="ui-input roulette-result-copy-manual"
          readOnly
          rows={6}
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
