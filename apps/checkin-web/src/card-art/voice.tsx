/** 話せたかの絵: 吹き出し。たっぷり話せた は 3 行（最後が金）、少し話せた は 1 行と金の短い線、話せなかった は破線の吹き出しに点だけ。 */
const BUBBLE = 'M10 12h44a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H26l-10 10V44h-6a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z';

export function VoiceArt({ card }: { card: string }) {
  switch (card) {
    case 'plenty':
      return (
        <>
          <path className="ca-ink" d={BUBBLE} />
          <path className="ca-ink" d="M16 22h32M16 29h32" />
          <path className="ca-gold-line" d="M16 36h20" />
        </>
      );
    case 'some':
      return (
        <>
          <path className="ca-ink" d={BUBBLE} />
          <path className="ca-ink" d="M16 24h20" />
          <path className="ca-gold-line" d="M16 32h8" />
        </>
      );
    case 'none':
      return (
        <>
          <path className="ca-ink ca-dashed" d={BUBBLE} />
          <circle cx="22" cy="28" r="2" className="ca-ink-dot" />
          <circle cx="32" cy="28" r="2" className="ca-ink-dot" />
          <circle cx="42" cy="28" r="2" className="ca-ink-dot" />
        </>
      );
    default:
      return null;
  }
}
