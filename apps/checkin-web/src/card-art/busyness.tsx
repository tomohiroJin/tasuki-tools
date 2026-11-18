/** いそがしさの絵: 書類の箱に積んだ紙。いちばん上の紙が金（余裕 1 枚・ふつう 2 枚・つまっている 4 枚・あふれている 6 枚で 1 枚こぼれる）。 */
function Stack({ sheets, spill = false }: { sheets: number; spill?: boolean }) {
  const ys = Array.from({ length: sheets }, (_, i) => 41 - i * 6);
  return (
    <>
      <path className="ca-ink" d="M8 46h48v10H8z" />
      {ys.map((y, i) => (
        <rect key={y} x="14" y={y} width="36" height="5" rx="1" className={i === sheets - 1 ? 'ca-gold' : 'ca-ink ca-paper'} />
      ))}
      {spill && <path className="ca-ink ca-paper" d="M42 6l14 5-2 5-14-5z" />}
    </>
  );
}

export function BusynessArt({ card }: { card: string }) {
  switch (card) {
    case 'roomy':
      return <Stack sheets={1} />;
    case 'normal':
      return <Stack sheets={2} />;
    case 'packed':
      return <Stack sheets={4} />;
    case 'overflow':
      return <Stack sheets={6} spill />;
    default:
      return null;
  }
}
