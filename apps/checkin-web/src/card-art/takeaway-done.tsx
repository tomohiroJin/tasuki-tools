/** 持ち帰れたかの絵: 金の中身が満ちた壺（持ち帰れた）・半分・空。 */
const JAR = 'M23 10h18v7l5 7v28a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V24l5-7z';

export function TakeawayDoneArt({ card }: { card: string }) {
  switch (card) {
    case 'yes':
      return (
        <>
          <path className="ca-gold" d="M19 30h26v22a3 3 0 0 1-3 3H22a3 3 0 0 1-3-3z" />
          <path className="ca-ink" d={JAR} />
          <path className="ca-ink" d="M26 40l5 5 8-9" />
        </>
      );
    case 'half':
      return (
        <>
          <path className="ca-gold" d="M19 42h26v10a3 3 0 0 1-3 3H22a3 3 0 0 1-3-3z" />
          <path className="ca-ink" d={JAR} />
        </>
      );
    case 'no':
      return (
        <>
          <path className="ca-ink" d={JAR} />
          <path className="ca-gold-line" d="M26 46h12" />
        </>
      );
    default:
      return null;
  }
}
