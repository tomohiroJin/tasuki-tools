/** 持ち帰りたいものの絵: 的（決めたい）・虫めがね（知りたい）・ふきだし（相談したい）・耳（聞くだけ）。 */
export function TakeawayGoalArt({ card }: { card: string }) {
  switch (card) {
    case 'decide':
      return (
        <>
          <circle cx="30" cy="34" r="22" className="ca-ink" />
          <circle cx="30" cy="34" r="12" className="ca-ink" />
          <circle cx="30" cy="34" r="4.5" className="ca-gold" />
          <path className="ca-ink" d="M30 34L52 10M46 8l6 2-2 6" />
        </>
      );
    case 'learn':
      return (
        <>
          <circle cx="27" cy="27" r="16" className="ca-ink" />
          <path className="ca-gold" d="M19 25a9 9 0 0 1 9-9 11 11 0 0 0-9 9z" />
          <path className="ca-ink" d="M39 39l16 16" />
        </>
      );
    case 'discuss':
      return (
        <>
          <path className="ca-ink" d="M8 14h30a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H22l-8 7v-7H8a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4z" />
          <path className="ca-gold" d="M26 30h26a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4h-4v7l-8-7H26a4 4 0 0 1-4-4V34a4 4 0 0 1 4-4z" />
        </>
      );
    case 'listen':
      return (
        <>
          <path className="ca-ink" d="M20 32a12 12 0 1 1 24 0c0 9-8 10-8 18a7 7 0 0 1-14 0" />
          <path className="ca-ink" d="M28 32a4 4 0 0 1 8 0c0 4-4 5-4 9" />
          <circle cx="32" cy="48" r="2.4" className="ca-gold" />
          <path className="ca-gold-line" d="M52 22a14 14 0 0 1 0 18M57 17a21 21 0 0 1 0 28" />
        </>
      );
    default:
      return null;
  }
}
