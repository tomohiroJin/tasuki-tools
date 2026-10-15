import { emWidthOf, splitGraphemes } from './wheel-geometry';

/**
 * 結果の札の名前の大きさの段（#373）。
 *
 * 札は縦横比が固定（8:5・幅 13〜16rem）で、名前は表示名の上限（`MAX_DISPLAY_NAME` = 40）まで
 * ある。短い名前と同じ大きさのままだと、長い名前が札の上下にはみ出し、直下の一言と
 * 「もう一度回す」に重なる。そこで**長さに応じて段を下げ、段ごとの最大行数で切る**
 * （全文は直下の一言と読み上げ `role="status"` が持つので、札は省略してよい）。
 *
 * 長さは**表示幅**（em）で数える。全角 1・半角 0.6 は円盤の席の名前（`fitLabel`）と同じ物差し
 * （{@link emWidthOf} を共有する）。字数で数えると 9 字の英字名が全角と同じ段に落ちる。
 * 数える単位は**書記素**（{@link splitGraphemes}。`Intl.Segmenter` が無ければコードポイント）で、ZWJ の絵文字・国旗・結合文字を 1 字と数える。
 *
 * 段は 3 つ。**最小の段でも見出し「次の進行役」と「さん」（`--font-size-sm`）より小さくしない。**
 * 最大の段（`lg`）は字の大きさが従来のまま（2 行の安全網だけ掛ける）。段の境目は CSS
 * （`.roulette-card-name[data-size]`）と対で持つ。
 */
export type CardNameSize = 'lg' | 'md' | 'sm';

/**
 * 段の上限（表示幅 em・その値まで）。これより広ければ次の段。`lg` は広い札（16rem・字 2.4rem）の 1 行に
 * 収まる幅（全角 5 字・英字 9 字）。6 字以上は 2 行になり、「さん」が次の行へ回ると札の枠に張り付く。
 */
export const CARD_NAME_TIER_LIMITS = { lg: 5.5, md: 20 } as const;

/** 名前の表示幅（全角 1・半角 0.6）。 */
export function displayWidthOf(name: string, segmenter?: Intl.Segmenter | null): number {
  let w = 0;
  for (const g of splitGraphemes(name, segmenter)) w += emWidthOf(g);
  return w;
}

export function cardNameSize(name: string): CardNameSize {
  const width = displayWidthOf(name);
  if (width <= CARD_NAME_TIER_LIMITS.lg) return 'lg';
  if (width <= CARD_NAME_TIER_LIMITS.md) return 'md';
  return 'sm';
}
