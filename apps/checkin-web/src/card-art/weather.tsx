/** 今日の天気の絵。細い墨の線に金を一点（晴れの日・雷の稲妻・くもりの陽）。 */
export function WeatherArt({ card }: { card: string }) {
  switch (card) {
    case 'sunny':
      return (
        <>
          <circle cx="32" cy="32" r="12" className="ca-gold" />
          <path className="ca-ink" d="M32 6v8M32 50v8M6 32h8M50 32h8M13.6 13.6l5.7 5.7M44.7 44.7l5.7 5.7M13.6 50.4l5.7-5.7M44.7 19.3l5.7-5.7" />
        </>
      );
    case 'cloudy':
      return (
        <>
          <circle cx="24" cy="24" r="9" className="ca-gold" />
          <path className="ca-ink ca-paper" d="M18 48h28a9 9 0 0 0 0-18 13 13 0 0 0-25-2 10 10 0 0 0-3 20z" />
        </>
      );
    case 'rain':
      return (
        <>
          <path className="ca-ink" d="M16 36h30a9 9 0 0 0 0-18 13 13 0 0 0-25-2 10 10 0 0 0-5 20z" />
          <path className="ca-ink" d="M22 44l-3 8M42 44l-3 8" />
          <path className="ca-gold-line" d="M32 44l-3 8" />
        </>
      );
    case 'thunder':
      return (
        <>
          <path className="ca-ink" d="M16 32h30a9 9 0 0 0 0-18 13 13 0 0 0-25-2 10 10 0 0 0-5 20z" />
          <path className="ca-gold" d="M34 34l-10 14h8l-4 12 14-18h-8l4-8z" />
        </>
      );
    default:
      return null;
  }
}
