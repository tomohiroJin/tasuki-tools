import { useState } from 'react';
import { cardNameSize } from '../card-name-size';
import { CARD_LABEL, CARD_SUFFIX } from '../copy';

/**
 * 結果の札（spec §6.4）。指し針が差し出す 1 枚。伏せて置き、止まったらめくる。
 * 読み上げは結果の一言（`role="status"`）が持つので、札は `aria-hidden`（二重に読まない）。
 *
 * 表は「次の進行役」と名前だけ（隅のピップは置かない）。回し直すと伏せ直る間に表が空に
 * 見えないよう、最後に出した名前を保つ。保つのは state で、描画の中で ref を書かない（描画は純粋に保つ）。
 * 前の描画からの値の引き継ぎは React の「描画中に state を合わせる」形（同じ描画のうちに描き直される）。
 */
export function ResultCard({
  name,
  revealed,
  label = CARD_LABEL,
  ref,
}: {
  /** 止まった当たりの名前（回っている間は null） */
  name: string | null;
  revealed: boolean;
  /** 札の見出し（順番に回すときは「{n} 番」・#401 順番に回す）。既定は「次の進行役」 */
  label?: string;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const [last, setLast] = useState(name ?? '');
  if (name !== null && name !== last) setLast(name);
  const shown = name ?? last;
  return (
    <div ref={ref} className={`roulette-card${revealed ? ' is-revealed' : ''}`} aria-hidden="true">
      <div className="roulette-card-inner">
        <div className="roulette-card-back" />
        <div className="roulette-card-face">
          <p className="roulette-card-label">{label}</p>
          <p className="roulette-card-name" data-size={cardNameSize(shown)}>
            <span className="roulette-card-name-text">{shown}</span>
            <small>{CARD_SUFFIX}</small>
          </p>
        </div>
      </div>
    </div>
  );
}
