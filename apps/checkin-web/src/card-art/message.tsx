/** だれかに言いたいことの絵: 封筒。このあと話す は金の封と上向きの矢印、あとで言う は金の針の時計、無い は破線の封筒だけ。 */
const ENVELOPE = 'M8 22h48v32H8zM8 24l24 16 24-16';

export function MessageArt({ card }: { card: string }) {
  switch (card) {
    case 'now':
      return (
        <>
          <path className="ca-ink" d={ENVELOPE} />
          <circle cx="32" cy="40" r="5" className="ca-gold" />
          <path className="ca-ink" d="M50 6v10M46 10l4-4 4 4" />
        </>
      );
    case 'later':
      return (
        <>
          <path className="ca-ink" d={ENVELOPE} />
          <circle cx="50" cy="12" r="8" className="ca-ink ca-paper" />
          <path className="ca-gold-line" d="M50 8v4h3" />
        </>
      );
    case 'none':
      return (
        <>
          <rect x="8" y="22" width="48" height="32" className="ca-ink ca-dashed" />
          <path className="ca-ink ca-dashed" d="M8 24l24 16 24-16" />
        </>
      );
    default:
      return null;
  }
}
