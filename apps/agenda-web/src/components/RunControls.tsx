/**
 * 手元の固定帯（#429 spec §7.5）。主の操作「次へ」を大きく、隣に一時停止／再開、上の段に「このステップに +1 / +3 / +5 分」。
 * **「スキップ」はここに置かない**（押し間違いを防ぐ。進行表のまだのステップの行にだけ置く）。
 *
 * 「次へ」と延長は**押した瞬間のいまのステップの ID** を載せる（spec §4.6。古い画面の押下はサーバーが捨てる）。
 */
import { EXTEND_MINUTES, type AgendaView, type ExtendMinutes } from '@tasuki/agenda-core';
import { EXTEND_LABEL, NEXT_BUTTON, PAUSE_BUTTON, RESUME_BUTTON, extendButton } from '../copy';

interface Props {
  view: AgendaView;
  canOperate: boolean;
  onNext: (stepId: string) => void;
  onPause: () => void;
  onResume: () => void;
  onExtend: (stepId: string, minutes: ExtendMinutes) => void;
}

export function RunControls({ view, canOperate, onNext, onPause, onResume, onExtend }: Props) {
  const currentId = view.currentId;
  const disabled = !canOperate || currentId === null;
  const paused = view.phase === 'paused';
  return (
    <div className="run-controls">
      <div className="run-extend" role="group" aria-label={EXTEND_LABEL}>
        <span className="run-extend-label" aria-hidden="true">
          {EXTEND_LABEL}
        </span>
        {EXTEND_MINUTES.map((m) => (
          <button
            key={m}
            type="button"
            className="ui-button ui-button--secondary ui-button--sm run-extend-button"
            disabled={disabled}
            onClick={() => currentId !== null && onExtend(currentId, m)}
          >
            {extendButton(m)}
          </button>
        ))}
      </div>
      <div className="run-main">
        <button type="button" className="ui-button ui-button--secondary run-pause" disabled={disabled} onClick={paused ? onResume : onPause}>
          {paused ? RESUME_BUTTON : PAUSE_BUTTON}
        </button>
        <button type="button" className="ui-button ui-button--lg run-next" disabled={disabled} onClick={() => currentId !== null && onNext(currentId)}>
          {NEXT_BUTTON}
        </button>
      </div>
    </div>
  );
}
