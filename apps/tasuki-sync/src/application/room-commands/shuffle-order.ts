/**
 * `member.shuffle` の順列を作る（サーバー権威）。wire のコマンドは順列を持たない。
 *
 * #366 で `handlers.ts` から移した。**乱数は `RandomSource` から受ける**（#367。以前は大域の乱数を
 * 直接呼んでいた。本番はルーレットと同じ `node:crypto` の一様な整数になる。利用者の了承済み）。
 */

/** `[0, n)` の整数を返す乱数（`RandomSource#randomInt`）。 */
type RandomInt = (n: number) => number;

/**
 * Fisher–Yates で配列をその場でシャッフルする。返り値は引数と同じ配列（破壊的）。
 */
function fisherYatesShuffle<T>(arr: T[], randomInt: RandomInt): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * member.shuffle の順列 order を生成する。
 * - 非稼働中: [0..len-1] を完全シャッフルする。
 * - 稼働中: currentIndex の位置を固定し、それ以外のインデックスのみをシャッフルして
 *   現ドライバーが「その位置で」現役のままになるようにする。
 *
 * @param len rotation の長さ
 * @param running clock が稼働中か
 * @param currentIndex 現ドライバーの位置（稼働中のみ固定対象）
 * @param randomInt `[0, n)` の整数を返す乱数
 */
export function buildShuffleOrder(len: number, running: boolean, currentIndex: number, randomInt: RandomInt): number[] {
  if (len <= 1) return Array.from({ length: len }, (_, i) => i);

  if (!running) {
    return fisherYatesShuffle(Array.from({ length: len }, (_, i) => i), randomInt);
  }

  // 稼働中: currentIndex 以外のインデックスだけシャッフルし、currentIndex はその位置に固定する。
  const others = Array.from({ length: len }, (_, i) => i).filter((i) => i !== currentIndex);
  fisherYatesShuffle(others, randomInt);
  const order: number[] = [];
  let cursor = 0;
  for (let pos = 0; pos < len; pos++) {
    order.push(pos === currentIndex ? currentIndex : others[cursor++]!);
  }
  return order;
}
