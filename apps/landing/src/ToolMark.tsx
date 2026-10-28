/**
 * 札の中央に置く意匠。
 *
 * 絵文字ではなく SVG にしているのは、環境によって字形と色が変わらないようにするため
 * （札の上では線の太さが世界観に直結する）。
 */
interface Props {
  readonly kind: "ring" | "spade" | "flag" | "wheel" | "watch" | "cards";
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

  if (kind === "flag") {
    // お題の旗。竿が 1 本立ち、上に三角の旗がはためく（「掲げる」の姿）。
    return (
      <svg viewBox="0 0 48 48" className="tool-mark" aria-hidden="true" focusable="false">
        <line x1="14" y1="6" x2="14" y2="42" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M15 8c6-3 11 3 19 0v14c-8 3-13-3-19 0z" strokeWidth="0" />
      </svg>
    );
  }

  if (kind === "wheel") {
    // 進行役ルーレットの円盤。円と 6 本の仕切りに、上から小さな三角の指し針が差す。
    // 線の太さは ring・flag と同じ 2.5。
    return (
      <svg viewBox="0 0 48 48" className="tool-mark" aria-hidden="true" focusable="false">
        <circle cx="24" cy="26" r="16" fill="none" strokeWidth="2.5" />
        <g strokeWidth="2.5" strokeLinecap="round">
          <line x1="24" y1="26" x2="24" y2="10" />
          <line x1="24" y1="26" x2="37.9" y2="18" />
          <line x1="24" y1="26" x2="37.9" y2="34" />
          <line x1="24" y1="26" x2="24" y2="42" />
          <line x1="24" y1="26" x2="10.1" y2="34" />
          <line x1="24" y1="26" x2="10.1" y2="18" />
        </g>
        <path d="M24 12 L19.5 3.5 H28.5 Z" strokeWidth="0" />
      </svg>
    );
  }

  if (kind === "watch") {
    // 進行タイマーの時計。円に 12 時の小さな竜頭、中心から 2 本の針。線の太さは他の意匠と同じ 2.5。
    return (
      <svg viewBox="0 0 48 48" className="tool-mark" aria-hidden="true" focusable="false">
        <circle cx="24" cy="27" r="16" fill="none" strokeWidth="2.5" />
        <line x1="20" y1="6" x2="28" y2="6" strokeWidth="2.5" strokeLinecap="round" />
        <g strokeWidth="2.5" strokeLinecap="round">
          <line x1="24" y1="27" x2="24" y2="16" />
          <line x1="24" y1="27" x2="31" y2="31" />
        </g>
      </svg>
    );
  }

  if (kind === "cards") {
    // チェックインの札。少しずらして重ねた 2 枚の札（奥の札は手前に隠れる側を開けた線で描く）。線の太さは他の意匠と同じ 2.5。
    return (
      <svg viewBox="0 0 48 48" className="tool-mark" aria-hidden="true" focusable="false">
        <path
          d="M21 9H12a3 3 0 0 0-3 3v22a3 3 0 0 0 3 3h9"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="rotate(-8 19 23)"
        />
        <rect
          x="19"
          y="11"
          width="20"
          height="28"
          rx="3"
          fill="none"
          strokeWidth="2.5"
          transform="rotate(8 29 25)"
        />
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
