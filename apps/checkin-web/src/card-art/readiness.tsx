/** 準備の度合いの絵: 留め具が金のクリップボードと 3 つの欄。済んだ欄に金のチェック（できている 3・だいたい 2・これから 1・まだ 0）。 */
const ROWS = [20, 31, 42] as const;

function Board({ checked }: { checked: number }) {
  return (
    <>
      <rect x="12" y="10" width="40" height="46" rx="4" className="ca-ink" />
      <path className="ca-gold" d="M25 6h14v8H25z" />
      {ROWS.map((y) => (
        <path key={y} className="ca-ink" d={`M19 ${y}h7v7h-7zM32 ${y + 3.5}h13`} />
      ))}
      {ROWS.slice(0, checked).map((y) => (
        <path key={y} className="ca-gold-line" d={`M19.5 ${y + 2.5}l3 3.5 5-6`} />
      ))}
    </>
  );
}

export function ReadinessArt({ card }: { card: string }) {
  switch (card) {
    case 'ready':
      return <Board checked={3} />;
    case 'mostly':
      return <Board checked={2} />;
    case 'later':
      return <Board checked={1} />;
    case 'not-yet':
      return <Board checked={0} />;
    default:
      return null;
  }
}
