/** この会の理解の絵: 金の旗（ねらい）と、そこへ向かう道（進め方）。どちらもわかる は道が実線、ねらいだけ は道が破線、どちらもあいまい は霧の中の問い。 */
const POLE = 'M42 10v42';
const FLAG = 'M42 10l14 6-14 6z';

export function ClarityArt({ card }: { card: string }) {
  switch (card) {
    case 'both':
      return (
        <>
          <path className="ca-ink" d={POLE} />
          <path className="ca-gold" d={FLAG} />
          <path className="ca-ink" d="M8 56c8-2 12-8 18-12s10-2 16 8" />
        </>
      );
    case 'purpose':
      return (
        <>
          <path className="ca-ink" d={POLE} />
          <path className="ca-gold" d={FLAG} />
          <path className="ca-ink ca-dashed" d="M8 56c8-2 12-8 18-12s10-2 16 8" />
        </>
      );
    case 'unclear':
      return (
        <>
          <path className="ca-ink" d="M23 20a9 9 0 1 1 13 8c-3 1.5-4 3.5-4 7" />
          <circle cx="32" cy="44" r="3" className="ca-gold" />
          <path className="ca-ink ca-dashed" d="M6 54h22M36 54h22" />
        </>
      );
    default:
      return null;
  }
}
