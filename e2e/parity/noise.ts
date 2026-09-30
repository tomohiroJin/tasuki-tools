/**
 * 対照実行（基準同士の比較）で揺れると分かった値の名指し（#321・設計正本 §5.2・§5.6）。
 *
 * **1 件ずつ理由を書く。** 理由の無い除外を足さない。ここに無い差は、すべて台帳で仕分ける。
 */
import type { IgnoreRule } from './compare-lib';

export const NOISE: readonly IgnoreRule[] = [];
