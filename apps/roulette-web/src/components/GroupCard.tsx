import { CARD_SUFFIX, groupCardLabel } from '../copy';

/**
 * 組の札（#401 spec §6.3）。2 人以上を選ぶときに、1 人の札（`ResultCard`）の代わりに置く。
 *
 * - 幅は 1 人の札と同じ。**背は 4 行ぶんに固定**（人数を変えても舞台が伸び縮みしない・CSS が持つ）
 * - 1 人目が止まったらめくる。2 人目からは行が埋まるだけで、伏せ直さない。まだ決まっていない行は空けておく
 * - 名前は各行 1 行で … に切る（全文は直下の一言と脇の一覧が持つ）
 * - 読み上げは結果の一言（`role="status"`）が持つので `aria-hidden`（1 人の札と同じ）
 */
export function GroupCard({
  k,
  names,
  revealed,
  ref,
}: {
  /** 札の行の数（回転の人数・回したことが無ければ選ぶ人数） */
  k: number;
  /** 決まった人の名前（止まった順） */
  names: readonly string[];
  revealed: boolean;
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={ref} className={`roulette-card roulette-card--group${revealed ? ' is-revealed' : ''}`} data-k={k} aria-hidden="true">
      <div className="roulette-card-inner">
        <div className="roulette-card-back" />
        <div className="roulette-card-face">
          <p className="roulette-card-label">{groupCardLabel(k)}</p>
          <ol className="roulette-group-list">
            {Array.from({ length: k }, (_, i) => {
              const name = names[i];
              return (
                <li key={i} className={`roulette-group-row${name === undefined ? '' : ' is-filled'}`}>
                  <span className="roulette-group-num">{i + 1}</span>
                  <span className="roulette-group-name">{name ?? ''}</span>
                  {name !== undefined && <small>{CARD_SUFFIX}</small>}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
