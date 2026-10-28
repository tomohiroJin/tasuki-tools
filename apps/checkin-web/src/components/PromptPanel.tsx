/**
 * お題の板（#406・設計 §5）。小見出し（側とやり方の名前）・問い・凡例の 1 行。
 * 右上に公開の仕方の切り替えと「別のやり方」。公開の仕方は誰かが出したあと（`locked`）は変えられない（E7）。
 */
import { METHODS, SIDES, type MethodId, type Visibility } from '@tasuki/checkin-core';
import { CHANGE_METHOD, SIDE_KICKER, VISIBILITY_GROUP_LABEL, VISIBILITY_LABEL } from '../copy';
import { METHOD_COPY } from '../method-copy';

const VISIBILITY_ORDER: readonly Visibility[] = ['named', 'anonymous'];

interface Props {
  method: MethodId;
  visibility: Visibility;
  locked: boolean;
  onSetVisibility: (visibility: Visibility) => void;
  onChangeMethod: () => void;
}

export function PromptPanel({ method, visibility, locked, onSetVisibility, onChangeMethod }: Props) {
  const copy = METHOD_COPY[method];
  const side = SIDES.find((s) => s === METHODS[method].side) ?? 'checkin';
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
              disabled={locked}
              onClick={() => onSetVisibility(v)}
            >
              {VISIBILITY_LABEL[v]}
            </button>
          ))}
        </div>
        <button type="button" className="ui-button ui-button--quiet ui-button--sm" onClick={onChangeMethod}>
          {CHANGE_METHOD}
        </button>
      </div>
      <h2 className="prompt-question">{copy.prompt}</h2>
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
