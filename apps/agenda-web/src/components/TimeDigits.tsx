/**
 * 残り・オーバーの数字（#429 spec §7.3 MUST: 桁が揺れない）。
 *
 * 自己ホストの Fraunces のサブセットには `tnum` が無い（2026-10-20 実測: 40px で 1111 = 72.8px・0000 = 106.6px）。
 * そこで 1 字ずつ固定幅の箱に入れて中央に置き、コロンと「+」は狭い別の箱にする（幅は CSS の `.time-digit` 等）。
 */
interface Props {
  text: string;
}

const classOf = (ch: string): string => (ch === ':' ? 'time-colon' : ch === '+' ? 'time-sign' : 'time-digit');

export function TimeDigits({ text }: Props) {
  return (
    <span className="time-digits">
      {[...text].map((ch, i) => (
        // 桁の位置そのものが識別子（同じ桁の箱を描き直す）
        <span key={i} className={classOf(ch)}>
          {ch}
        </span>
      ))}
    </span>
  );
}
