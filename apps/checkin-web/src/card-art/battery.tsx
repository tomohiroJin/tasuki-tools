/** 今日のバッテリーの絵: 電池の目盛り。金の目盛りの数で残りを示す（満タン 4・半分 2・少ない 1・切れそう は細い金の線だけ）。 */
const BARS = [9, 20, 31, 42] as const;

function Battery({ bars }: { bars: number }) {
  return (
    <>
      <rect x="4" y="16" width="51" height="32" rx="4" className="ca-ink" />
      <path className="ca-ink" d="M55 25h5v14h-5" />
      {bars > 0 && <path className="ca-gold" d={BARS.slice(0, bars).map((x) => `M${x} 21h8v22h-8z`).join('')} />}
      {bars === 0 && <path className="ca-gold-line" d="M10 23v18" />}
    </>
  );
}

export function BatteryArt({ card }: { card: string }) {
  switch (card) {
    case 'full':
      return <Battery bars={4} />;
    case 'half':
      return <Battery bars={2} />;
    case 'low':
      return <Battery bars={1} />;
    case 'empty':
      return <Battery bars={0} />;
    default:
      return null;
  }
}
