/** この端末の時間帯（UTC からの進み・分。日本時間は 540）。純関数に渡す値をここで読む（track-web と同じ）。 */
export function localTzOffsetMin(): number {
  return -new Date().getTimezoneOffset();
}
