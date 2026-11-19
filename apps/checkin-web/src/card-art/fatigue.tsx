/** 残った疲れの絵: ろうそく。金の炎の下のろうそくが、元気 は長く、少し疲れた は半ば、かなり疲れた は短い。 */
function Candle({ top }: { top: number }) {
  const body = top + 16;
  return (
    <>
      <path className="ca-gold" d={`M32 ${top}c4 5 5 8 5 10a5 5 0 0 1-10 0c0-2 1-5 5-10z`} />
      <rect x="26" y={body} width="12" height={56 - body} rx="1" className="ca-ink" />
      <path className="ca-ink" d="M14 56h36" />
    </>
  );
}

export function FatigueArt({ card }: { card: string }) {
  switch (card) {
    case 'fine':
      return <Candle top={6} />;
    case 'bit':
      return <Candle top={18} />;
    case 'very':
      return <Candle top={30} />;
    default:
      return null;
  }
}
