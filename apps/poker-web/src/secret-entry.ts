// 隠しの入口の検出（#403・設計 §5.1）。判定は純関数で、配線は `hooks/useSecretEntry.ts`。
//
// **隠しは入口が見えないだけで、アクセス制御ではない**（配布された JS を読めば誰でも見つけられる）。
// 入口が送るのは「席に着く」だけで、サーバーは他のコマンドと同じく境界で検証する。

/** キーボードの入口。`KeyboardEvent.key` の並び（英字は小文字で比べる） */
export const KONAMI_CODE: readonly string[] = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

/**
 * キーを 1 つ打ったあとの進み具合（並びの先頭から何キー一致しているか）を返す。並びの長さに達したら開く。
 *
 * 外れたら 0 へ戻すだけでは、`↑ ↑ ↑ ↓ …` のように余分なキーを 1 つ挟んだ打ち方を取りこぼす。
 * 「打った列の末尾のうち、並びの先頭と一致する最長」まで戻す。
 */
export function advanceSequence(progress: number, key: string, sequence: readonly string[] = KONAMI_CODE): number {
  const typed = [...sequence.slice(0, progress), key.length === 1 ? key.toLowerCase() : key];
  for (let start = 0; start < typed.length; start++) {
    const tail = typed.slice(start);
    if (tail.every((k, i) => k === sequence[i])) return tail.length;
  }
  return 0;
}

/** タッチ・マウスの入口。参加者の見出しを {@link TAP_WINDOW_MS} 以内に何回押すか */
export const TAP_COUNT = 5;
export const TAP_WINDOW_MS = 2000;

/** 押した時刻を足し、窓の外に出た古い押下を捨てた列を返す。長さが {@link TAP_COUNT} に達したら開く */
export function advanceTaps(times: readonly number[], now: number): number[] {
  return [...times, now].filter((t) => now - t < TAP_WINDOW_MS);
}
