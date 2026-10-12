/**
 * 回すの並び。**主のボタンは 1 つ**。40rem 未満は部品の `--dock` で下端に留まる
 * （舞台の直下の最後の子に置くこと。`--dock` は親の中でだけ留まる）。
 */
export function SpinControls({
  label,
  disabled,
  onSpin,
  ref,
}: {
  label: string;
  disabled: boolean;
  onSpin: () => void;
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={ref} className="ui-actions ui-actions--dock roulette-controls">
      <button type="button" className="ui-button ui-button--lg" disabled={disabled} onClick={onSpin}>
        {label}
      </button>
    </div>
  );
}
