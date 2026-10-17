import { MAX_PICK } from '@tasuki/roulette-core';
import { PICK_COUNT_LABEL, pickCountOption } from '../copy';

const OPTIONS = Array.from({ length: MAX_PICK }, (_, i) => i + 1);

/**
 * 脇の「選ぶ人数」（#401 spec §6.4）。部品は topic-web の「書く / プレビュー」と同じ副のボタン（`--sm`）に
 * `aria-pressed`（選んだ状態は地と内側の線で示す・部品が持つ）。1 行目にラベル、2 行目にボタンを常に 2 行で置く
 * （並びを幅で変えない方が崩れにくい）。**入る人が足りない人数も押せる**（入る人は後から足すことがある。
 * 足りなければ一言が「{k+1} 人から回せます」と言い、回すが押せない）。
 */
export function PickCountPicker({ value, disabled, onPick }: { value: number; disabled: boolean; onPick: (count: number) => void }) {
  return (
    <div className="roulette-pick">
      <p id="roulette-pick-label" className="roulette-pick-label">
        {PICK_COUNT_LABEL}
      </p>
      <div className="roulette-pick-options" role="group" aria-labelledby="roulette-pick-label">
        {OPTIONS.map((k) => (
          <button
            key={k}
            type="button"
            className="ui-button ui-button--secondary ui-button--sm"
            aria-pressed={value === k}
            disabled={disabled}
            onClick={() => onPick(k)}
          >
            {pickCountOption(k)}
          </button>
        ))}
      </div>
    </div>
  );
}
