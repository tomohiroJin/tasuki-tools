/**
 * 持ち帰り（#476・FR-8・FR-11・FR-25）。
 *
 * - ［Markdown でコピー］: 文は track-core の `toMarkdown`。コピーに失敗したら、同じ文を選べる欄（`<textarea readonly>`）に出す
 *   （poker の記録 #653・timer のまとめ #408 と同じ作法。失敗の表示は 2 秒で消さない）
 * - ［記録を消す］: 押す前にその場で確かめる（agenda の「最初から」と同じ作り。開いたら安全な側にフォーカスを置き、
 *   閉じたら元のボタンへ返す）。消した後も 10 秒は取り消せる（取り消しは「いまやっていること」の欄に出る）
 *
 * 確かめが開いている間、キーボードの操作（1〜9・S・C）は拾わない（`data-track-confirm` を `use-track-keys` が見る）。
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useCopyText } from '@tasuki/invite-ui';
import { CLEAR_BUTTON, CLEAR_CONFIRM_NO, CLEAR_CONFIRM_TEXT, CLEAR_CONFIRM_YES, COPY_BUTTON, COPY_DONE, COPY_FAILED, COPY_MANUAL_FIELD } from '../copy';

interface Props {
  markdown: string;
  /** 消せる記録があるか */
  hasRecord: boolean;
  canOperate: boolean;
  onClear: () => void;
  /** 消した結果の写し（記録が空）が届いたとき。「記録を消す」は押せなくなるので、フォーカスを次に押すもの（開始）へ移す */
  onCleared: () => void;
  /** 画面の上に出ているサーバーの拒否の文（消す操作が拒まれたら、元のボタンへフォーカスを戻す） */
  error: string | null;
}

export function TakeHome({ markdown, hasRecord, canOperate, onClear, onCleared, error }: Props) {
  const { copy, state } = useCopyText(markdown, { keepFailure: true });
  // 手で選ぶ欄は、失敗した試みで開き、成功した試みで閉じる。記録が変わって state が idle に戻っても開いたまま残す
  // （選んでいる途中で欄が消えない。中身はそのときの文に差し替わる）
  const [manualKept, setManualKept] = useState(false);
  useEffect(() => {
    if (state === 'failed') setManualKept(true);
    else if (state === 'done') setManualKept(false);
  }, [state]);
  const manualOpen = state === 'failed' || (manualKept && state === 'idle');

  return (
    <section className="track-takehome ui-stack">
      <div className="track-takehome-actions">
        <ClearControl enabled={hasRecord} canOperate={canOperate} onClear={onClear} onCleared={onCleared} error={error} />
        <button type="button" className="ui-button ui-button--secondary" onClick={() => void copy()}>
          {COPY_BUTTON}
        </button>
      </div>
      <p role="status" className="track-copy-status">
        {state === 'done' ? COPY_DONE : state === 'failed' ? COPY_FAILED : ''}
      </p>
      {manualOpen && (
        <textarea
          aria-label={COPY_MANUAL_FIELD}
          className="ui-input track-copy-manual"
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

function ClearControl({
  enabled,
  canOperate,
  onClear,
  onCleared,
  error,
}: {
  enabled: boolean;
  canOperate: boolean;
  onClear: () => void;
  onCleared: () => void;
  error: string | null;
}) {
  const [asking, setAsking] = useState(false);
  // 消すを送ってから、結果の写しを待っている間
  const [pending, setPending] = useState(false);
  const [returnFocus, setReturnFocus] = useState(false);
  const noRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const textId = useId();

  useEffect(() => {
    if (asking) noRef.current?.focus();
  }, [asking]);
  useEffect(() => {
    // 押せないボタンにはフォーカスが乗らない。すぐに受けられないときは戻すのをやめる
    // （待ち続けると、つながり直した後に、使っていない人の「記録を消す」へフォーカスが飛ぶ）
    if (!asking && returnFocus) {
      if (openRef.current !== null && !openRef.current.disabled) openRef.current.focus();
      setReturnFocus(false);
    }
  }, [asking, returnFocus]);
  useEffect(() => {
    if (!pending) return;
    if (!enabled) {
      // 空の写しが届いた。元のボタンは押せなくなったので、次に押すもの（開始）へ
      setPending(false);
      onCleared();
    } else if (error !== null || !canOperate) {
      // 拒まれた・切れた。元のボタンへ戻す
      setPending(false);
      setReturnFocus(true);
    }
  }, [pending, enabled, canOperate, error, onCleared]);

  if (!asking) {
    return (
      <button ref={openRef} type="button" className="ui-button ui-button--danger ui-button--sm" disabled={!canOperate || !enabled} onClick={() => setAsking(true)}>
        {CLEAR_BUTTON}
      </button>
    );
  }
  return (
    <div className="track-confirm" role="group" aria-labelledby={textId} data-track-confirm="">
      <p id={textId} className="track-confirm-text">
        {CLEAR_CONFIRM_TEXT}
      </p>
      <div className="track-confirm-actions">
        <button
          ref={noRef}
          type="button"
          className="ui-button ui-button--secondary ui-button--sm"
          onClick={() => {
            setAsking(false);
            setReturnFocus(true);
          }}
        >
          {CLEAR_CONFIRM_NO}
        </button>
        <button
          type="button"
          className="ui-button ui-button--danger ui-button--sm"
          disabled={!canOperate}
          onClick={() => {
            setAsking(false);
            // フォーカスは、空の写しが届いてから開始のボタンへ移す（届かなければ元のボタンへ戻す）
            setPending(true);
            onClear();
          }}
        >
          {CLEAR_CONFIRM_YES}
        </button>
      </div>
    </div>
  );
}
