/**
 * 札の中央に置く意匠。
 *
 * 絵文字ではなく SVG にしているのは、環境によって字形と色が変わらないようにするため
 * （札の上では線の太さが世界観に直結する）。
 */
interface Props {
  readonly kind: "ring" | "spade";
}

export function ToolMark({ kind }: Props) {
  if (kind === "ring") {
    // 交代タイマーの輪。上に切れ目を置き、針が一本立っている。
    return (
      <svg viewBox="0 0 48 48" className="tool-mark" aria-hidden="true" focusable="false">
        <circle
          cx="24"
          cy="24"
          r="18"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray="78 22"
          transform="rotate(-129 24 24)"
        />
        <line x1="24" y1="24" x2="24" y2="11" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  // プランニングポーカーのスペード。
  return (
    <svg viewBox="0 0 48 48" className="tool-mark" aria-hidden="true" focusable="false">
      <path
        d="M24 6c-3.6 6.2-8.2 9.6-11.6 13C9.4 21.7 8 24.4 8 27.4c0 4.4 3.4 7.6 7.7 7.6 2.7 0 5-1.3 6.4-3.3-.5 4.5-2.2 7.4-4.6 9.3h13c-2.4-1.9-4.1-4.8-4.6-9.3 1.4 2 3.7 3.3 6.4 3.3 4.3 0 7.7-3.2 7.7-7.6 0-3-1.4-5.7-4.4-8.4C32.2 15.6 27.6 12.2 24 6z"
        strokeWidth="0"
      />
    </svg>
  );
}
