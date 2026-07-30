/**
 * 値を ref に同期し続け、クロージャから常に最新値を読めるようにする（Issue #28・T069/T070・FR-120）。
 *
 * `App.tsx` の `makeClient` が生成する各種コールバック（onRoom/onIdentity/onError 等）は
 * 生成時点の値で固定される（closure）。そのため `room`/`participantId`/`endType`/
 * `generatingProblem` は state だけでは最新値を読めず、同じ値を ref にも保持している。
 *
 * **並行保持そのものは避けられない**（closure の固定を避ける手段が無い）。
 * 避けられるのは、「render のたびに ref.current を最新値へ同期する」処理が
 * 状態ごとに手書きで散っていることである。ここに集約する。
 *
 * 同期は render 本体の中で行う（`useEffect` を挟まない）。挟むと、setState 直後・
 * 同一同期区間内で ref を読む呼び出し元（例: `setRoom(r)` の直後に別の処理が
 * `roomRef.current` を読むケース）で1レンダー分の遅れが生じ、旧い値を読んでしまう。
 */
import { useRef } from "react";

export function useLatestRef<T>(value: T): React.MutableRefObject<T> {
  // 戻り値は React.MutableRefObject<T>（current: T）にする。
  // React.RefObject<T> は `current: T | null` 固定（React 18 の型定義）のため、
  // これを返り値の型にすると T が null を含まない場合でも呼び出し側で
  // `.current` が `T | null` に広がってしまい、既存の非 null 前提のコードが壊れる。
  const ref = useRef<T>(value);
  ref.current = value;
  return ref;
}
