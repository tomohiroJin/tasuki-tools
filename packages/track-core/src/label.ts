/**
 * 作業名の正規化と検証（#476・設計 §4.5）。
 *
 * **受け取った時点で正規化し、その結果を保管する。** 同じ名前かどうかは保管した文字列の一致で決めるので、
 * 集計・候補・定番のどれも、ここを通した文字列だけを比べる。
 */
import { MAX_LABEL } from "./limits.js";

/** C0 制御文字と DEL */
// eslint-disable-next-line no-control-regex -- 制御文字を拒むのが目的
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/** 制御文字（C0 と DEL）を含むか。境界のスキーマと画面の検証が同じ規則を使うための正本。 */
export function hasControlChars(s: string): boolean {
  return CONTROL_CHARS.test(s);
}

/** NFKC を掛け、前後の空白を除く。空白だけなら空（名前なし）になる。 */
export function normalizeLabel(raw: string): string {
  return raw.normalize("NFKC").trim();
}

/** 正規化済みの作業名が受け取れる形か（空は名前なしとして通す）。 */
export function isValidLabel(label: string): boolean {
  return label.length <= MAX_LABEL && !hasControlChars(label);
}
