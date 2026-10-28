/** 次の打ち合わせの絵: 暦（このままで）・砂時計（短く）・人（人を絞る）・斜線の暦（無くてもいい）。 */
export function NextMeetingArt({ card }: { card: string }) {
  switch (card) {
    case 'keep':
      return (
        <>
          <rect x="10" y="14" width="44" height="40" rx="5" className="ca-ink" />
          <path className="ca-ink" d="M10 26h44M22 8v10M42 8v10" />
          <circle cx="32" cy="40" r="5" className="ca-gold" />
        </>
      );
    case 'shorter':
      return (
        <>
          <path className="ca-ink" d="M16 8h32M16 56h32M18 8c0 14 14 16 14 24S18 42 18 56M46 8c0 14-14 16-14 24s14 10 14 24" />
          <path className="ca-gold" d="M24 50c2-5 6-6 8-6s6 1 8 6z" />
        </>
      );
    case 'fewer':
      return (
        <>
          <circle cx="16" cy="24" r="6" className="ca-ink ca-dashed" />
          <path className="ca-ink ca-dashed" d="M6 50c0-8 4-12 10-12s10 4 10 12" />
          <circle cx="44" cy="22" r="8" className="ca-gold" />
          <path className="ca-ink" d="M30 54c0-10 6-15 14-15s14 5 14 15z" />
        </>
      );
    case 'skip':
      return (
        <>
          <rect x="10" y="14" width="44" height="40" rx="5" className="ca-ink" />
          <path className="ca-ink" d="M10 26h44M22 8v10M42 8v10" />
          <path className="ca-gold-line" d="M20 48L44 32" />
        </>
      );
    default:
      return null;
  }
}
