/**
 * ポイントの選択（#93）。選択肢は空と数字のカード。空の選択肢には、見える文言を必ず付ける
 * （aria-label だけでは、見える人には名前の無い空の箱になる）。
 */
import { NUMBER_CARD_VALUES, type NumberCardValue } from '@tasuki/poker-core';

export interface PointsSelectProps {
  value: NumberCardValue | null;
  onChange: (points: NumberCardValue | null) => void;
  /** 空の選択肢に見せる文言 */
  emptyLabel: string;
  /** 選択全体の名前（支援技術向け） */
  label: string;
  disabled: boolean;
}

export function PointsSelect({ value, onChange, emptyLabel, label, disabled }: PointsSelectProps) {
  return (
    <select
      className="ui-input estimate-points-select"
      aria-label={label}
      value={value === null ? '' : String(value)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === '' ? null : (Number(e.target.value) as NumberCardValue))}
    >
      <option value="">{emptyLabel}</option>
      {NUMBER_CARD_VALUES.map((v) => (
        <option key={v} value={String(v)}>
          {v}
        </option>
      ))}
    </select>
  );
}
