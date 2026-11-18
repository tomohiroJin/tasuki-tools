/** 今日の気がかりの絵: 地面の上の石。無い は金のきらめきだけ、少しある は小さな金の石、大きいのがある は大きな石に金のひび。 */
const GROUND = 'M6 52h52';

export function WorryArt({ card }: { card: string }) {
  switch (card) {
    case 'none':
      return (
        <>
          <path className="ca-ink" d={GROUND} />
          <path className="ca-gold" d="M32 18l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
        </>
      );
    case 'some':
      return (
        <>
          <path className="ca-ink" d={GROUND} />
          <path className="ca-gold" d="M23 52c0-7 4-11 9-11s9 4 9 11z" />
        </>
      );
    case 'big':
      return (
        <>
          <path className="ca-ink" d={GROUND} />
          <path className="ca-ink" d="M10 52c0-18 10-30 22-30s22 12 22 30z" />
          <path className="ca-gold-line" d="M30 28l5 6-4 6" />
        </>
      );
    default:
      return null;
  }
}
