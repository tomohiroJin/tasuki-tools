/**
 * 「下書きを空にする」（#667）。手元の下書きだけを空に戻す（ルームのシナリオは変えない）。
 * 開くボタンは隣の「サンプルから選ぶ」と同じ控えめの役割にする（空では押せない状態になり、危険の役割の小さい字は AA を割った）。
 * 危険の役割は確かめの中の「空にする」に置く（確かめは押せるときだけ出る）。取り戻せない中身があるときだけ確かめる
 * （「サンプルから選ぶ」の置き換えの確かめと同じ作り: 確かめを開いたら安全な側＝やめる にフォーカス、やめる・Esc で閉じたら「下書きを空にする」へ返す）。
 */
import { useEffect, useId, useRef, useState } from 'react';
import { CLEAR_DRAFT_BUTTON, CLEAR_DRAFT_CONFIRM, CLEAR_DRAFT_NO, CLEAR_DRAFT_YES } from '../copy';

interface Props {
  /** 空にできるか（すでに空なら押せない） */
  canClear: boolean;
  /** 空にする前に確かめるか（ルームの写しのままなら取り戻せるので確かめない） */
  needsConfirm: boolean;
  onClear: () => void;
}

export function ClearDraftControl({ canClear, needsConfirm, onClear }: Props) {
  const [asking, setAsking] = useState(false);
  const [returnFocus, setReturnFocus] = useState(false);
  const noRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  // 確かめの中にフォーカスがあるか（消えた要素には blur が来ないので、onFocus / onBlur で持つ）
  const focusInConfirmRef = useRef(false);
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
  const showConfirm = asking && canClear && needsConfirm;
  // 確かめを出している間に要らなくなったら（他の編集で空になった・ルームの写しになった）閉じる。
  // フォーカスが確かめの中にあったときだけボタンへ返す（外にあるフォーカスは奪わない）
  useEffect(() => {
    if (!asking || showConfirm) return;
    if (focusInConfirmRef.current) setReturnFocus(true);
    focusInConfirmRef.current = false;
    setAsking(false);
  }, [asking, showConfirm]);

  if (!showConfirm) {
    return (
      <button
        ref={openRef}
        type="button"
        className="ui-button ui-button--quiet ui-button--sm builder-clear-toggle"
        disabled={!canClear}
        onClick={() => (needsConfirm ? setAsking(true) : onClear())}
      >
        {CLEAR_DRAFT_BUTTON}
      </button>
    );
  }
  return (
    <div
      ref={confirmRef}
      onFocus={() => {
        focusInConfirmRef.current = true;
      }}
      onBlur={(event) => {
        focusInConfirmRef.current = event.relatedTarget instanceof Node && (confirmRef.current?.contains(event.relatedTarget) ?? false);
      }}
      className="builder-sample-confirm"
      role="group"
      aria-labelledby={textId}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        setAsking(false);
        setReturnFocus(true);
      }}
    >
      <p id={textId} className="builder-sample-confirm-text">
        {CLEAR_DRAFT_CONFIRM}
      </p>
      <div className="builder-sample-confirm-actions">
        <button
          ref={noRef}
          type="button"
          className="ui-button ui-button--secondary ui-button--sm"
          onClick={() => {
            setAsking(false);
            setReturnFocus(true);
          }}
        >
          {CLEAR_DRAFT_NO}
        </button>
        <button
          type="button"
          className="ui-button ui-button--danger ui-button--sm"
          onClick={() => {
            setAsking(false);
            onClear();
          }}
        >
          {CLEAR_DRAFT_YES}
        </button>
      </div>
    </div>
  );
}
