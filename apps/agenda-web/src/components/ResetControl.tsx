/**
 * 「最初から」（#429 spec §4.3 判断 J6・§7.7）。部品層の危険の役割にし、確認を挟む。
 * 確認を開いたら安全な側（やめる）にフォーカスを置き、閉じたら「最初から」へ返す。
 */
import { useEffect, useId, useRef, useState } from 'react';
import { RESET_BUTTON, RESET_CONFIRM_NO, RESET_CONFIRM_TEXT, RESET_CONFIRM_YES } from '../copy';

interface Props {
  canOperate: boolean;
  onReset: () => void;
}

export function ResetControl({ canOperate, onReset }: Props) {
  const [asking, setAsking] = useState(false);
  const [returnFocus, setReturnFocus] = useState(false);
  const noRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const textId = useId();

  useEffect(() => {
    if (asking) noRef.current?.focus();
  }, [asking]);
  useEffect(() => {
    if (!asking && returnFocus) {
      openRef.current?.focus();
      setReturnFocus(false);
    }
  }, [asking, returnFocus]);

  if (!asking) {
    return (
      <button ref={openRef} type="button" className="ui-button ui-button--danger ui-button--sm" disabled={!canOperate} onClick={() => setAsking(true)}>
        {RESET_BUTTON}
      </button>
    );
  }
  return (
    <div className="reset-confirm" role="group" aria-labelledby={textId}>
      <p id={textId} className="reset-confirm-text">
        {RESET_CONFIRM_TEXT}
      </p>
      <div className="reset-confirm-actions">
        <button
          ref={noRef}
          type="button"
          className="ui-button ui-button--secondary ui-button--sm"
          onClick={() => {
            setAsking(false);
            setReturnFocus(true);
          }}
        >
          {RESET_CONFIRM_NO}
        </button>
        <button
          type="button"
          className="ui-button ui-button--danger ui-button--sm"
          disabled={!canOperate}
          onClick={() => {
            setAsking(false);
            onReset();
          }}
        >
          {RESET_CONFIRM_YES}
        </button>
      </div>
    </div>
  );
}
