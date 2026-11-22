/**
 * 端末の時間帯（端末 I/O）。UTC からの進み（分。日本時間は 540）を返す。
 * 純粋関数（`track-view.ts`・`time-input.ts`・track-core の `toMarkdown`）は時間帯を引数で受けるので、読むのはここだけ。
 */
export function localTzOffsetMin(): number {
  return -new Date().getTimezoneOffset();
}
