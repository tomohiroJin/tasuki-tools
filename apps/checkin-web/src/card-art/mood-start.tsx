/** 始まりの気分の絵: 顔。楽しみ・落ち着いている・眠い・そわそわ。終わりの気分（mood）とは別の顔にする。 */
export function MoodStartArt({ card }: { card: string }) {
  switch (card) {
    case 'eager':
      return (
        <>
          <circle cx="32" cy="34" r="22" className="ca-ink" />
          <path className="ca-ink" d="M22 31a4 4 0 0 1 8 0M34 31a4 4 0 0 1 8 0M24 40a9 7 0 0 0 16 0" />
          <path className="ca-gold" d="M52 6v11a3 3 0 1 1-2-2.8V6h8v4h-6z" />
        </>
      );
    case 'calm':
      return (
        <>
          <circle cx="32" cy="34" r="22" className="ca-ink" />
          <path className="ca-ink" d="M22 30a4 3 0 0 0 8 0M34 30a4 3 0 0 0 8 0M26 42h12" />
          <path className="ca-gold" d="M46 18c0-7 5-12 12-12 0 7-5 12-12 12z" />
        </>
      );
    case 'sleepy':
      return (
        <>
          <circle cx="32" cy="34" r="22" className="ca-ink" />
          <path className="ca-ink" d="M22 32h8M34 32h8" />
          <circle cx="32" cy="43" r="3" className="ca-ink" />
          <path className="ca-gold-line" d="M48 6h8l-8 8h8" />
        </>
      );
    case 'restless':
      return (
        <>
          <circle cx="32" cy="34" r="22" className="ca-ink" />
          <circle cx="23" cy="30" r="2" className="ca-ink-dot" />
          <circle cx="35" cy="30" r="2" className="ca-ink-dot" />
          <path className="ca-ink" d="M25 43l6-2 6 2" />
          <path className="ca-gold-line" d="M2 28h5M2 36h5M57 28h5M57 36h5" />
        </>
      );
    default:
      return null;
  }
}
