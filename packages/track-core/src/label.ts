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

/**
 * 画面に字面を持たない書式の字（ゼロ幅の空白・向きを変える字・BOM ほか）。
 *
 * **写しである。** 正本は `packages/room-core/src/display-name.ts` の `INVISIBLE_FORMAT`（表示名の第 1 層。`docs/adr/0011` の 2026-09-21 の追記）。
 * track-core はどの `@tasuki/*` にも依存しないので写す。正本を変えたらここも合わせる。
 * ZWJ（U+200D）と字形選択子（U+FE0F ほか）は含めない（落とすと絵文字が崩れる。正本と同じ理由）。
 */
const INVISIBLE_FORMAT = /[\u200b\u200c\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\u180e]/g;

/** NFKC を掛け、見えない書式の字を落とし、前後の空白を除く。空白と見えない字だけなら空（名前なし）になる。 */
export function normalizeLabel(raw: string): string {
  return raw.normalize("NFKC").replace(INVISIBLE_FORMAT, "").trim();
}

/** 正規化済みの作業名が受け取れる形か（空は名前なしとして通す）。 */
export function isValidLabel(label: string): boolean {
  return label.length <= MAX_LABEL && !hasControlChars(label);
}
