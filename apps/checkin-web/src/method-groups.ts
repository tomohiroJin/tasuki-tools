/**
 * 小見出しの題（#635）。小見出しの並びと、どのやり方が入るかの正本は checkin-core の `METHOD_GROUPS`
 * （小見出しから引くくじの候補にも使うので core に置く）。ここは題だけを持つ。
 * **全部の小見出しを鍵に持つ**ので、小見出しを足して題を足し忘れるとコンパイルで落ちる。
 * **文言は書体の base 層に収める**（`tests/copy-fits-font-base.test.ts` が見る）。
 */
import type { GroupId } from '@tasuki/checkin-core';

export const GROUP_TITLES: Readonly<Record<GroupId, string>> = {
  'checkin-mood': '気分と元気',
  'checkin-focus': '集中と準備',
  'checkin-stance': '期待と役割',
  'checkout-value': '時間の価値',
  'checkout-mood': '気分と疲れ',
  'checkout-next': '進め方と次へ',
};
