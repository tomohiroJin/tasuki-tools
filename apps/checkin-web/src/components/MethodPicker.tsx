/**
 * やり方の選択（#406・設計 §4）。チェックイン／チェックアウトを切り替え、その側の 5 つのやり方か「ランダム」で決める。
 * **手元だけの状態**（側の切り替え）を持つ。送るのは選んだとき（`choose`）か引いたとき（`draw`）だけ。
 */
import { useState, type CSSProperties } from 'react';
import { METHODS, SIDES, methodsOf, type MethodId, type Side } from '@tasuki/checkin-core';
import { BACK_LABEL, METHOD_PICKER_HEADING, RANDOM_HINT, RANDOM_LABEL, SIDE_LABEL } from '../copy';
import { CardFace } from './CardFace';
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
            <button
              type="button"
              className="method-option"
              aria-labelledby={`method-${m}-title`}
              aria-describedby={`method-${m}-prompt`}
              onClick={() => onChoose(m)}
            >
              {/* 札の見本（そのやり方の札を 3 枚まで少し重ねた扇）。飾りなので読み上げない */}
              <span className="method-fan" aria-hidden="true">
                {METHODS[m].cards.slice(0, 3).map((card, i) => (
                  <span key={card} className="method-fan-card" style={{ '--k': i } as CSSProperties}>
                    <CardFace method={m} card={card} />
                  </span>
                ))}
              </span>
              <span className="method-text">
                <span id={`method-${m}-title`} className="method-title">
                  {METHOD_COPY[m].title}
                </span>
                <span id={`method-${m}-prompt`} className="method-prompt">
                  {METHOD_COPY[m].prompt}
                </span>
              </span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="method-option method-option--random"
            aria-labelledby="method-random-title"
            onClick={() => onDraw(side)}
          >
            {/* 伏せ札の裏模様の見本 */}
            <span className="method-fan" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className="method-fan-card method-fan-card--back" style={{ '--k': i } as CSSProperties} />
              ))}
            </span>
            <span className="method-text">
              <span id="method-random-title" className="method-title">
                {RANDOM_LABEL}
              </span>
              <span className="method-prompt">{RANDOM_HINT}</span>
            </span>
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
