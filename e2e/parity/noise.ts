/**
 * 対照実行（基準同士の比較）で揺れると分かった値の名指し（#321・設計正本 §5.2・§5.6）。
 *
 * **1 件ずつ理由を書く。** 理由の無い除外を足さない。ここに無い差は、すべて台帳で仕分ける。
 * 道筋は完全一致の正規表現でその要素だけに絞り、プロパティも名指しする（`.*` で広げない）。
 */
import type { IgnoreRule } from './compare-lib';

/** セッション画面の計測弧（`CircularProgress.tsx` の 2 つ目の `<svg>` の 2 つ目の `<circle>`・進んだ分を描く弧）。 */
const METER_ARC =
  /^html>body:nth-of-type\(1\)>div:nth-of-type\(1\)>div:nth-of-type\(1\)>div:nth-of-type\(1\)>div:nth-of-type\(2\)>div:nth-of-type\(1\)>div:nth-of-type\(2\)>div:nth-of-type\(1\)>div:nth-of-type\(2\)>div:nth-of-type\(1\)>div:nth-of-type\(1\)>div:nth-of-type\(2\)>div:nth-of-type\(3\)>div:nth-of-type\(1\)>div:nth-of-type\(1\)>div:nth-of-type\(1\)>svg:nth-of-type\(2\)>circle:nth-of-type\(2\)$/;

export const NOISE: readonly IgnoreRule[] = [
  {
    path: METER_ARC,
    prop: /^stroke-dashoffset$/,
    reason:
      '計測弧の長さは経過率（サーバーが決めた開始時刻と端末の時計の補正から求める）で決まり、両側は別のセッションを別の時刻に撮るので揃わない。' +
      '画素は撮るときだけ長さを固定して比べる（states.ts の SCREENSHOT_STYLE）',
  },
];
