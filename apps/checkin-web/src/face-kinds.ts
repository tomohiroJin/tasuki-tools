/**
 * やり方ごとの札の顔の種類（#406・#482-4・#592）。React にも I/O にも依存しない純粋判断。
 *
 * **数のやり方（`numeral`）の正本はここ。** `NUMERIC_METHODS`（`reveal-view.ts`）もここから導く。
 * 顔そのもの（数字の出し方・絵の部品）は画面側の `components/card-faces.tsx` が持ち、
 * その型が `FACE_KINDS` の種類と食い違うと落ちる。種類をここへ分けたのは、
 * 純粋判断（`reveal-view.ts`）が絵（`.tsx`）を読む逆向きを避けるため。
 *
 * **全部のやり方を鍵に持つ**ので、やり方を足して種類を足し忘れるとコンパイルで落ちる
 * （`tests/method-exhaustive.test.ts`）。
 */
import type { MethodId } from '@tasuki/checkin-core';

/** 顔の種類。数字（数のやり方）か、絵（線画） */
export type FaceKind = 'numeral' | 'art';

export const FACE_KINDS = {
  weather: 'art',
  energy: 'numeral',
  focus: 'numeral',
  'takeaway-goal': 'art',
  role: 'art',
  expectation: 'numeral',
  'mood-start': 'art',
  roti: 'numeral',
  'takeaway-done': 'art',
  'best-part': 'art',
  mood: 'art',
  'next-meeting': 'art',
  'weather-end': 'art',
  understanding: 'numeral',
} as const satisfies Readonly<Record<MethodId, FaceKind>>;
