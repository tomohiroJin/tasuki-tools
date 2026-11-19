/** 次の一手の絵: 先へ向かう矢印。はっきりした は実線、だいたい は半ばから破線、ぼんやり は破線と霧、わからない は分かれ道の道しるべ。 */
const HEAD = 'M34 16l18-6-6 18z';

export function NextStepArt({ card }: { card: string }) {
  switch (card) {
    case 'clear':
      return (
        <>
          <path className="ca-ink" d="M12 52L44 20" />
          <path className="ca-gold" d={HEAD} />
        </>
      );
    case 'mostly':
      return (
        <>
          <path className="ca-ink" d="M12 52L28 36" />
          <path className="ca-ink ca-dashed" d="M28 36L44 20" />
          <path className="ca-gold" d={HEAD} />
        </>
      );
    case 'vague':
      return (
        <>
          <path className="ca-ink ca-dashed" d="M12 52L44 20" />
          <path className="ca-ink" d="M4 30h18M42 46h18" />
          <path className="ca-gold-line" d="M38 14h12v12" />
        </>
      );
    case 'unknown':
      return (
        <>
          <path className="ca-ink" d="M32 14v42M32 18h18l5 5-5 5H32zM32 32H14l-5 5 5 5h18z" />
          <circle cx="32" cy="10" r="3" className="ca-gold" />
        </>
      );
    default:
      return null;
  }
}
