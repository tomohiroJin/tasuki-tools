/**
 * 結果の札の名前の大きさの段（#373）。
 *
 * 札は縦横比が固定（8:5・幅 13〜16rem）で、名前は表示名の上限（`MAX_DISPLAY_NAME` = 40）まで
 * ある。短い名前と同じ大きさのままだと、長い名前が札の上下にはみ出し、直下の一言と
 * 「もう一度回す」に重なる。そこで**長さに応じて段を下げ、段ごとの最大行数で切る**
 * （全文は直下の一言と読み上げ `role="status"` が持つので、札は省略してよい）。
 *
 * 数えるのは**コードポイント**（UTF-16 の長さではない）。絵文字などの 1 字を 2 と数えない。
 * 段の境目は CSS（`.roulette-card-name[data-size]`）と対で持つ。**最大の段（`lg`）の上限は
 * 短い名前の見た目を変えない側に置く**。
 */
export type CardNameSize = 'lg' | 'md' | 'sm' | 'xs';

/** 段の上限（その字数まで）。これより長ければ次の段。 */
export const CARD_NAME_TIER_LIMITS = { lg: 8, md: 16, sm: 28 } as const;

export function cardNameSize(name: string): CardNameSize {
  const length = [...name].length;
  if (length <= CARD_NAME_TIER_LIMITS.lg) return 'lg';
  if (length <= CARD_NAME_TIER_LIMITS.md) return 'md';
  if (length <= CARD_NAME_TIER_LIMITS.sm) return 'sm';
  return 'xs';
}
