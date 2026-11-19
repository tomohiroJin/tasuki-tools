/** 進むペースの絵: 速度の計器。金の針が右（はやすぎ）・まっすぐ上（ちょうど）・左（ゆっくりすぎ）。 */
function Gauge({ needle }: { needle: string }) {
  return (
    <>
      <path className="ca-ink" d="M8 46a24 24 0 0 1 48 0M32 18v5M13 32l4 3M51 32l-4 3" />
      <path className="ca-gold-line" d={needle} />
      <circle cx="32" cy="46" r="3" className="ca-ink-dot" />
    </>
  );
}

export function PaceArt({ card }: { card: string }) {
  switch (card) {
    case 'fast':
      return <Gauge needle="M32 46L47 31" />;
    case 'right':
      return <Gauge needle="M32 46V26" />;
    case 'slow':
      return <Gauge needle="M32 46L17 31" />;
    default:
      return null;
  }
}
