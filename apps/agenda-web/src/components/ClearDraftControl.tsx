/**
 * 「下書きを空にする」（#667）。手元の下書きだけを空に戻す（ルームのシナリオは変えない）。
 * 開くボタンは隣の「サンプルから選ぶ」と同じ控えめの役割にする（空では押せない状態になり、危険の役割の小さい字は AA を割った）。
 * 危険の役割は確かめの中の「空にする」に置く（確かめは押せるときだけ出る）。取り戻せない中身があるときだけ確かめる
 * （「サンプルから選ぶ」の置き換えの確かめと同じ作り: 確かめを開いたら安全な側＝やめる にフォーカス、やめる・Esc で閉じたら「下書きを空にする」へ返す）。
 */
import { useEffect, useId, useRef } from 'react';
import { CLEAR_DRAFT_BUTTON, CLEAR_DRAFT_CONFIRM, CLEAR_DRAFT_NO, CLEAR_DRAFT_YES } from '../copy';

interface Props {
  /** 確かめを開いているか（開いた下書きのままのときだけ真。持ち主は組む画面で、サンプルの確かめと同時に開かない） */
  asking: boolean;
  /** 空にできるか（すでに空なら押せない） */
  canClear: boolean;
  /** 空にする前に確かめるか（捨ててよい下書きなら確かめない） */
  needsConfirm: boolean;
  onOpen: () => void;
  onClose: () => void;
  onClear: () => void;
  /** 返す先の「下書きを空にする」が押せないときに、フォーカスを移す先（「ステップを追加」） */
  onFocusFallback: () => void;
}

export function ClearDraftControl({ asking, canClear, needsConfirm, onOpen, onClose, onClear, onFocusFallback }: Props) {
  const noRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  // 確かめの中にフォーカスがあるか（消えた要素には blur が来ないので、onFocus / onBlur で持つ）
  const focusInConfirmRef = useRef(false);
  const wasShownRef = useRef(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const textId = useId();

  const showConfirm = asking && canClear && needsConfirm;

  useEffect(() => {
    if (showConfirm) noRef.current?.focus();
  }, [showConfirm]);
  // 確かめを出している間に要らなくなったら（他の編集で空になった・ルームの写しになった）持ち主へ閉じたと伝える
  useEffect(() => {
    if (asking && !showConfirm) onClose();
  }, [asking, showConfirm, onClose]);
  // 確かめが消えたとき、フォーカスが確かめの中にあったときだけ返す（外にあるフォーカスは奪わない）。
  // 返す先のボタンが押せない（空になった）ときは、フォーカスが落ちないよう「ステップを追加」へ
  useEffect(() => {
    if (wasShownRef.current && !showConfirm && focusInConfirmRef.current) {
      const open = openRef.current;
      if (open !== null && !open.disabled) open.focus();
      else onFocusFallback();
    }
    if (!showConfirm) focusInConfirmRef.current = false;
    wasShownRef.current = showConfirm;
  }, [showConfirm, onFocusFallback]);

  if (!showConfirm) {
    return (
      <button
        ref={openRef}
        type="button"
        className="ui-button ui-button--quiet ui-button--sm builder-clear-toggle"
        disabled={!canClear}
        onClick={() => {
          if (needsConfirm) {
            onOpen();
            return;
          }
          onClear();
          onFocusFallback();
        }}
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
        onClose();
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
          onClick={onClose}
        >
          {CLEAR_DRAFT_NO}
        </button>
        <button
          type="button"
          className="ui-button ui-button--danger ui-button--sm"
          onClick={() => {
            onClear();
            onClose();
          }}
        >
          {CLEAR_DRAFT_YES}
        </button>
      </div>
    </div>
  );
}
