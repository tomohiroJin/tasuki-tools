/** 今の気分の絵: 顔。すっきり・もやもや・くたくた・わくわく。 */
export function MoodArt({ card }: { card: string }) {
  switch (card) {
    case 'clear':
      return (
        <>
          <circle cx="32" cy="34" r="22" className="ca-ink" />
          <path className="ca-ink" d="M23 30a3 3 0 0 1 6 0M35 30a3 3 0 0 1 6 0M23 41a11 8 0 0 0 18 0" />
          <path className="ca-gold" d="M52 6l1.800 4.200 4.200 1.800-4.200 1.800L52 18l-1.800-4.200L46 12l4.200-1.800z" />
        </>
      );
    case 'foggy':
      return (
        <>
          <circle cx="32" cy="34" r="22" className="ca-ink" />
          <circle cx="25" cy="30" r="2" className="ca-ink-dot" />
          <circle cx="39" cy="30" r="2" className="ca-ink-dot" />
          <path className="ca-ink" d="M23 43c3-3 6 3 9 0s6 3 9 0" />
          <path className="ca-gold-line" d="M6 10h18M12 16h22" />
        </>
      );
    case 'tired':
      return (
        <>
          <circle cx="32" cy="34" r="22" className="ca-ink" />
          <path className="ca-ink" d="M21 31h8M35 31h8M25 44h14" />
          <path className="ca-gold" d="M52 12c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8z" />
        </>
      );
    case 'excited':
      return (
        <>
          <circle cx="32" cy="34" r="22" className="ca-ink" />
          <path className="ca-gold" d="M24 24l1.600 3.400 3.400.5-2.500 2.400.6 3.500-3.100-1.700-3.100 1.700.6-3.500-2.500-2.400 3.400-.5zM40 24l1.600 3.400 3.400.5-2.500 2.400.6 3.500-3.100-1.700-3.100 1.700.6-3.500-2.500-2.400 3.400-.5z" />
          <path className="ca-ink" d="M22 41h20a10 10 0 0 1-20 0z" />
        </>
      );
    default:
      return null;
  }
}
