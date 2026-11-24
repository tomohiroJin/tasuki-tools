/**
 * 開いた結果の持ち出し（#676・設計 §16）。［Markdown でコピー］と、失敗したときに同じ文を手で選べる欄。
 *
 * - 札が開いた後にしか置かない（呼ぶ側が `status === 'revealed'` のときだけ描く）。開く前の中身は Markdown に載らない
 * - 回ごとに作り直す（呼ぶ側が `key={seq}` を付ける）。時刻と欄の状態は部品の外（`useRevealExport`）が回ごとに持つので、
 *   ［別のやり方］で卓が外れて戻っても、同じ回のあいだは変わらず、次の回では取り直す・閉じる
 * - 書き出す時刻の意味は「この端末が、その回が開いたのを最初に受け取った時刻」（再読み込みした人・後から入った人は、その人が受け取った時刻。
 *   やり方を選ぶ画面を開いている間に開いた回は、戻る前の時刻になる）
 * - 失敗の欄は、失敗した試みで開き、成功した試みで閉じる（poker #653・track #476 と同じ作法。失敗の表示は 2 秒で消さない）
 */
import { useEffect, useMemo } from 'react';
import { useCopyText } from '@tasuki/invite-ui';
import type { MethodId, PileView, Visibility } from '@tasuki/checkin-core';
import { MD_COPY_BUTTON, MD_COPY_DONE, MD_COPY_FAILED, MD_COPY_MANUAL_FIELD } from '../copy';
import type { RevealExport } from '../hooks/use-reveal-export';
import { revealMarkdown } from '../reveal-markdown';

interface Props {
  method: MethodId;
  visibility: Visibility;
  piles: readonly PileView[];
  /** 回ごとの時刻と欄の状態（卓の出し入れで捨てられない層が持つ。`useRevealExport`） */
  session: RevealExport;
}

export function RevealCopy({ method, visibility, piles, session }: Props) {
  const { at, manualKept, setManualKept } = session;
  const markdown = useMemo(
    () => revealMarkdown({ method, visibility, piles, nowMs: at, tzOffsetMin: -new Date(at).getTimezoneOffset() }),
    [method, visibility, piles, at],
  );
  const { copy, state } = useCopyText(markdown, { keepFailure: true });
  useEffect(() => {
    if (state === 'failed') setManualKept(true);
    else if (state === 'done') setManualKept(false);
  }, [state, setManualKept]);
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
