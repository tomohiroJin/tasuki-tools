/**
 * 休憩の覆い（#402 設計 §5.3・§5.4）。`session.break.since !== null` の間、全員の画面に出す全画面。
 *
 * - 初期フォーカスは見出し。共有メモに入力していた Enter が「休憩を終える」を押さないように。
 * - Esc では閉じない。覆いはサーバーの状態から出ているので、手元では閉じられない。
 * - 完成は確認つき（FR-074b）。`EndSessionZone` と同じ確認の文言を、覆いの中に描く。
 *   確認ダイアログは覆いの子として描くので、覆いのフォーカストラップに引き戻されず、前面で操作できる。
 */

import React, { useRef, useState } from "react";
import { BREAK_TEXT } from "../break-view.js";
import { formatElapsed } from "../format-time.js";
import { useFocusTrap } from "../useFocusTrap.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { COMPLETE_BUTTON_LABEL, completeConfirmText } from "./EndSessionZone.js";
import { SELF_SKIP_LABEL } from "./SelfDriverToggle.js";
import { ROOM_HEADER_TEXT } from "@tasuki/invite-ui";

interface BreakOverlayProps {
  elapsedMs: number;
  nextDriverName: string;
  /** 自分以外が全員 offline か（回収の警告を切り替える） */
  isLastOne: boolean;
  isShared: boolean;
  onEnd: () => void;
  onComplete: () => void;
  /** 自分の一時離脱（輪に居て、まだ離脱していないときだけ渡す） */
  onStandDown?: (() => void) | undefined;
  /**
   * 選択画面へ戻るリンクの行き先（#447 段 2）。休憩のあいだ見出しは覆いの裏で inert になるので、
   * 休憩中に別の道具へ移れる道を覆いの中に置く（以前は覆いより前に出る上の帯が持っていた）。
   */
  backHref: string;
}

export function BreakOverlay({
  elapsedMs,
  nextDriverName,
  isLastOne,
  isShared,
  onEnd,
  onComplete,
  onStandDown,
  backHref,
}: BreakOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [confirming, setConfirming] = useState(false);
  useFocusTrap({ open: true, containerRef, onClose: () => {}, initialFocusRef: headingRef, modal: true });
  const confirm = completeConfirmText(isShared);
  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="break-overlay-heading"
      className="break-overlay"
    >
      <h2 id="break-overlay-heading" ref={headingRef} tabIndex={-1} className="break-overlay-heading">
        {BREAK_TEXT.overlayHeading}
      </h2>
      <p className="break-overlay-elapsed tabular" aria-live="off">{formatElapsed(elapsedMs)}</p>
      <p className="break-overlay-next">{BREAK_TEXT.nextDriver(nextDriverName)}</p>
      <button type="button" className="ui-button" onClick={onEnd}>{BREAK_TEXT.endButton}</button>
      <p className="break-overlay-warning">
        {isLastOne ? BREAK_TEXT.reclaimWarningLast : BREAK_TEXT.reclaimWarning}
      </p>
      <div className="break-overlay-secondary">
        {onStandDown && (
          <button type="button" className="ui-button ui-button--quiet ui-button--sm" onClick={onStandDown}>
            {SELF_SKIP_LABEL}
          </button>
        )}
        <button type="button" className="ui-button ui-button--quiet ui-button--sm" onClick={() => setConfirming(true)}>
          {COMPLETE_BUTTON_LABEL}
        </button>
        <a className="ui-button ui-button--quiet ui-button--sm" href={backHref}>{ROOM_HEADER_TEXT.back}</a>
      </div>
      {confirming && (
        <ConfirmDialog
          open={true}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          confirmIntent="primary"
          onConfirm={() => {
            setConfirming(false);
            onComplete();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
