/**
 * ポイントの選択（#93）。選択肢は空と数字のカード。空の選択肢には、見える文言を必ず付ける
 * （aria-label だけでは、見える人には名前の無い空の箱になる）。
 *
 * 見た目は部品の `.ui-select`（#317 の白い一瞬の回避を含む）。空のときは `data-empty` を付け、
 * 置き場所が弱く見せる（記録では添えたポイントが一番強く、「ポイントなし」は弱い・spec §4.4）。
 */
import { NUMBER_CARD_VALUES, type NumberCardValue } from '@tasuki/poker-core';

export interface PointsSelectProps {
  value: NumberCardValue | null;
  onChange: (points: NumberCardValue | null) => void;
  /** 空の選択肢に見せる文言 */
  emptyLabel: string;
  /** 選択全体の名前（支援技術向け）。`labelledBy` を渡したときは使わない */
  label: string;
  /** 名前を付ける要素の id（空白区切り）。並んだ選択を見分けられるよう、置き場所の文字から名前を組むとき */
  labelledBy?: string;
  disabled: boolean;
  /** 置き場所ごとの修飾 */
  className?: string;
}

export function PointsSelect({ value, onChange, emptyLabel, label, labelledBy, disabled, className }: PointsSelectProps) {
  return (
    <select
      className={className ? `ui-select estimate-points-select ${className}` : 'ui-select estimate-points-select'}
      data-empty={value === null ? '' : undefined}
      {...(labelledBy === undefined ? { 'aria-label': label } : { 'aria-labelledby': labelledBy })}
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
