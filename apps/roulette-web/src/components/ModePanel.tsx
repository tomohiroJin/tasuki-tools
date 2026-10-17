import type { RouletteMode } from '@tasuki/roulette-core';
import { CYCLE_RESET_BUTTON, MODE_HEADING, MODE_ONCE, MODE_ORDER, ONCE_NOTE, ORDER_NOTE, ORDER_RESET_BUTTON } from '../copy';
import { PickCountPicker } from './PickCountPicker';

const MODES: readonly { mode: RouletteMode; label: string }[] = [
  { mode: 'once', label: MODE_ONCE },
  { mode: 'order', label: MODE_ORDER },
];

interface Props {
  mode: RouletteMode;
  /** 操作を受け付けない間（切断中・回転中） */
  locked: boolean;
  /** 順番に回す回の途中（決め方を変えられない・#401 順番に回す T8） */
  inRound: boolean;
  onMode: (mode: RouletteMode) => void;
  /** 1 回で決めるとき: 選ぶ人数と一周の行 */
  pickCount: number;
  onPickCount: (count: number) => void;
  cycleLine: string;
  onResetCycle: () => void;
  /** 順番に回すとき: 進み具合と、最初からやり直せるか */
  orderProgress: string;
  canResetOrder: boolean;
  onResetOrder: () => void;
}

/**
 * 脇の「決め方」（#401 順番に回す T9・spec §5.4）。見出し → 決め方の 2 つのボタン → 選んだ決め方の説明・設定・進み具合。
 * **選んだ決め方のものだけを出す**（設定と進み具合が入る人の一覧の上下に散らばっていた）。
 * ボタンは選ぶ人数と同じ副のボタン（`--sm`）に `aria-pressed`。
 */
export function ModePanel({
  mode,
  locked,
  inRound,
  onMode,
  pickCount,
  onPickCount,
  cycleLine,
  onResetCycle,
  orderProgress,
  canResetOrder,
  onResetOrder,
}: Props) {
  return (
    <section className="ui-panel roulette-mode" aria-labelledby="roulette-mode-heading">
      <h2 id="roulette-mode-heading">{MODE_HEADING}</h2>
      <div className="roulette-pick-options roulette-mode-options" role="group" aria-labelledby="roulette-mode-heading">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            className="ui-button ui-button--secondary ui-button--sm"
            aria-pressed={mode === m.mode}
            // 回の途中は変えられない（サーバーも拒む）。選んでいる方は押しても何も起きない
            disabled={locked || (inRound && mode !== m.mode)}
            onClick={() => onMode(m.mode)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="roulette-mode-body">
        <p className="roulette-mode-note">{mode === 'order' ? ORDER_NOTE : ONCE_NOTE}</p>
        {mode === 'order' ? (
          <div className="roulette-foot">
            <p>{orderProgress}</p>
            <button type="button" className="ui-button ui-button--secondary ui-button--sm" disabled={locked || !canResetOrder} onClick={onResetOrder}>
              {ORDER_RESET_BUTTON}
            </button>
          </div>
        ) : (
          <>
            <PickCountPicker value={pickCount} disabled={locked} onPick={onPickCount} />
            <div className="roulette-foot">
              <p>{cycleLine}</p>
              {/* 状態を変える操作なので副のボタン（控え = 下線の字はリンクに見える） */}
              <button type="button" className="ui-button ui-button--secondary ui-button--sm" disabled={locked} onClick={onResetCycle}>
                {CYCLE_RESET_BUTTON}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
