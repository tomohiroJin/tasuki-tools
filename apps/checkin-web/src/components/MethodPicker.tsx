/**
 * やり方の選択（#406・設計 §4）。チェックイン／チェックアウトを切り替え、その側の 5 つのやり方か「ランダム」で決める。
 * **手元だけの状態**（側の切り替え）を持つ。送るのは選んだとき（`choose`）か引いたとき（`draw`）だけ。
 */
import { useState } from 'react';
import { SIDES, methodsOf, type MethodId, type Side } from '@tasuki/checkin-core';
import { BACK_LABEL, METHOD_PICKER_HEADING, RANDOM_LABEL, SIDE_LABEL } from '../copy';
import { METHOD_COPY } from '../method-copy';

interface Props {
  onChoose: (method: MethodId) => void;
  onDraw: (side: Side) => void;
  /** 回があるときだけ。選ばずに元の画面へ戻る */
  onCancel?: (() => void) | undefined;
}

export function MethodPicker({ onChoose, onDraw, onCancel }: Props) {
  const [side, setSide] = useState<Side>('checkin');
  return (
    <section className="method-picker" aria-labelledby="method-picker-heading">
      <h2 id="method-picker-heading" className="method-picker-heading">
        {METHOD_PICKER_HEADING}
      </h2>
      <div className="seg" role="group" aria-label={METHOD_PICKER_HEADING}>
        {SIDES.map((s) => (
          <button key={s} type="button" className="seg-button" aria-pressed={s === side} onClick={() => setSide(s)}>
            {SIDE_LABEL[s]}
          </button>
        ))}
      </div>
      <ul className="method-list">
        {methodsOf(side).map((m) => (
          <li key={m}>
            <button type="button" className="method-option" onClick={() => onChoose(m)}>
              {METHOD_COPY[m].title}
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="method-option method-option--random" onClick={() => onDraw(side)}>
            {RANDOM_LABEL}
          </button>
        </li>
      </ul>
      {onCancel && (
        <button type="button" className="ui-button ui-button--quiet ui-button--sm" onClick={onCancel}>
          {BACK_LABEL}
        </button>
      )}
    </section>
  );
}
