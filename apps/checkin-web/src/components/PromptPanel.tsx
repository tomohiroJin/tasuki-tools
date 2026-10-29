/**
 * お題の板（#406・設計 §5）。小見出し（側とやり方の名前）・問い・凡例の 1 行。
 * 右上に公開の仕方の切り替えと「別のやり方」。公開の仕方は誰かが出したあと（`locked`）は変えられない（E7）。
 * 押せない理由は小さな注にして、切り替えの説明（aria-describedby）にも結ぶ。
 * 問いの見出しは画面が替わったときのフォーカスの着地点（`headingRef`・tabIndex=-1）。
 */
import { METHODS, type MethodId, type Visibility } from '@tasuki/checkin-core';
import type { Ref } from 'react';
import { CHANGE_METHOD, SIDE_KICKER, VISIBILITY_GROUP_LABEL, VISIBILITY_LABEL, VISIBILITY_LOCKED_NOTE } from '../copy';
import { METHOD_COPY } from '../method-copy';

const VISIBILITY_ORDER: readonly Visibility[] = ['named', 'anonymous'];
const LOCKED_NOTE_ID = 'prompt-locked-note';

interface Props {
  method: MethodId;
  visibility: Visibility;
  locked: boolean;
  /** 切断中は偽（押した操作が黙って消えるので押させない） */
  canOperate: boolean;
  headingRef?: Ref<HTMLHeadingElement> | undefined;
  onSetVisibility: (visibility: Visibility) => void;
  /** 開いた後は下の帯に同じ操作があるので渡さない（2 つ出さない） */
  onChangeMethod?: (() => void) | undefined;
}

export function PromptPanel({ method, visibility, locked, canOperate, headingRef, onSetVisibility, onChangeMethod }: Props) {
  const copy = METHOD_COPY[method];
  const side = METHODS[method].side;
  return (
    <section className="prompt-panel">
      <p className="prompt-kicker">
        <span className="prompt-side">{SIDE_KICKER[side]}</span>
        <span className="prompt-title">{copy.title}</span>
      </p>
      <div className="prompt-tools">
        <div className="seg" role="group" aria-label={VISIBILITY_GROUP_LABEL}>
          {VISIBILITY_ORDER.map((v) => (
            <button
              key={v}
              type="button"
              className="seg-button"
              aria-pressed={v === visibility}
              disabled={locked || !canOperate}
              aria-describedby={locked ? LOCKED_NOTE_ID : undefined}
              onClick={() => onSetVisibility(v)}
            >
              {VISIBILITY_LABEL[v]}
            </button>
          ))}
        </div>
        {onChangeMethod !== undefined && (
          <button type="button" className="ui-button ui-button--quiet ui-button--sm" disabled={!canOperate} onClick={onChangeMethod}>
            {CHANGE_METHOD}
          </button>
        )}
      </div>
      {locked && (
        <p id={LOCKED_NOTE_ID} className="prompt-locked-note">
          {VISIBILITY_LOCKED_NOTE}
        </p>
      )}
      <h2 ref={headingRef} className="prompt-question" tabIndex={-1}>
        {copy.prompt}
      </h2>
      <ul className="prompt-legend">
        {METHODS[method].cards.map((card) => (
          <li key={card}>
            <b>{copy.cards[card]?.name}</b>
            <span>{copy.cards[card]?.meaning}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
