// スートのマーク（#403・設計 §5.3）。書体の字形ではなく SVG で描く（端末で形が揺れない・書体の層に頼らない）。
// どれも 100 × 100 の箱に収め、中心は (50, 50)。
import type { Suit } from '@tasuki/poker-core';

const HEART =
  'M50 92 C46 86 6 62 6 34 C6 18 18 6 32 6 C41 6 47 12 50 21 C53 12 59 6 68 6 C82 6 94 18 94 34 C94 62 54 86 50 92 Z';
const DIAMOND = 'M50 3 C59 20 73 37 88 50 C73 63 59 80 50 97 C41 80 27 63 12 50 C27 37 41 20 50 3 Z';
const SPADE =
  'M50 3 C57 19 94 39 94 62 C94 76 84 84 72 84 C64 84 57 80 54 73 C55 84 60 92 71 97 L29 97 C40 92 45 84 46 73 ' +
  'C43 80 36 84 28 84 C16 84 6 76 6 62 C6 39 43 19 50 3 Z';
const CLUB_STEM = 'M46 52 L54 52 C55 76 60 89 71 97 L29 97 C40 89 45 76 46 52 Z';

/** スートの形（箱 100 × 100）。塗りは親の `fill`（`currentColor`）を継ぐ */
export function SuitShape({ suit }: { suit: Suit }) {
  switch (suit) {
    case 'H':
      return <path d={HEART} />;
    case 'D':
      return <path d={DIAMOND} />;
    case 'S':
      return <path d={SPADE} />;
    case 'C':
      return (
        <>
          <circle cx="50" cy="28" r="21" />
          <circle cx="27" cy="58" r="21" />
          <circle cx="73" cy="58" r="21" />
          <path d={CLUB_STEM} />
        </>
      );
  }
}

/** スートを中心 (x, y)・大きさ size に置く。flipped なら逆さ */
export function SuitMark({
  suit,
  x,
  y,
  size,
  flipped = false,
  className,
}: {
  suit: Suit;
  x: number;
  y: number;
  size: number;
  flipped?: boolean;
  className?: string;
}) {
  const scale = size / 100;
  const turn = flipped ? ` rotate(180 50 50)` : '';
  return (
    <g className={className} transform={`translate(${x - size / 2} ${y - size / 2}) scale(${scale})${turn}`}>
      <SuitShape suit={suit} />
    </g>
  );
}
