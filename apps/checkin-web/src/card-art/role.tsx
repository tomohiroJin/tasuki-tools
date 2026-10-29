/** 今日の役割の絵: ヘッドホン（聞き役）・はてな（質問役）・束ねる（まとめ役）・きらめき（盛り上げ役）。 */
export function RoleArt({ card }: { card: string }) {
  switch (card) {
    case 'listener':
      return (
        <>
          <path className="ca-ink" d="M12 38V32a20 20 0 0 1 40 0v6" />
          <rect x="9" y="36" width="10" height="18" rx="4" className="ca-gold" />
          <rect x="45" y="36" width="10" height="18" rx="4" className="ca-ink" />
        </>
      );
    case 'questioner':
      return (
        <>
          <path className="ca-ink" d="M20 22a12 12 0 1 1 18 10c-4 3-6 5-6 10" />
          <circle cx="32" cy="53" r="3.4" className="ca-gold" />
        </>
      );
    case 'summarizer':
      return (
        <>
          <path className="ca-ink" d="M10 16h26M10 28h26M10 40h26" />
          <path className="ca-ink" d="M40 12c6 0 6 6 6 10v6c0 3 2 4 6 4-4 0-6 1-6 4v6c0 4 0 10-6 10" />
          <circle cx="53" cy="32" r="3.4" className="ca-gold" />
        </>
      );
    case 'energizer':
      return (
        <>
          <path className="ca-ink" d="M32 6v12M32 46v12M6 32h12M46 32h12M14 14l8 8M42 42l8 8M14 50l8-8M42 22l8-8" />
          <path className="ca-gold" d="M32 22l3.2 6.8 7.3 1-5.3 5.2 1.3 7.4-6.5-3.6-6.5 3.6 1.3-7.4-5.3-5.2 7.3-1z" />
        </>
      );
    default:
      return null;
  }
}
