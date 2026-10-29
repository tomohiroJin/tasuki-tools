/** 一番よかったことの絵: 旗（決まった）・ふきだし（話せた）・電球（知れた）・空の輪（特になし）。 */
export function BestPartArt({ card }: { card: string }) {
  switch (card) {
    case 'decided':
      return (
        <>
          <path className="ca-ink" d="M18 58V8" />
          <path className="ca-gold" d="M18 10h30l-7 10 7 10H18z" />
        </>
      );
    case 'talked':
      return (
        <>
          <path className="ca-ink" d="M10 12h44a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H30l-12 10V42h-8a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" />
          <circle cx="22" cy="27" r="3" className="ca-gold" />
          <circle cx="32" cy="27" r="3" className="ca-ink" />
          <circle cx="42" cy="27" r="3" className="ca-ink" />
        </>
      );
    case 'learned':
      return (
        <>
          <path className="ca-ink" d="M22 40c-6-4-9-9-9-15a19 19 0 0 1 38 0c0 6-3 11-9 15v6H22z" />
          <path className="ca-ink" d="M24 53h16M27 59h10" />
          <path className="ca-gold" d="M32 14l2.6 6 6.4.6-4.8 4.2 1.5 6.3-5.7-3.4-5.7 3.4 1.5-6.3L23 20.6 29.4 20z" />
        </>
      );
    case 'nothing':
      return (
        <>
          <circle cx="32" cy="32" r="20" className="ca-ink ca-dashed" />
          <path className="ca-gold-line" d="M24 32h16" />
        </>
      );
    default:
      return null;
  }
}
