/**
 * 値を ref に同期し続け、クロージャから常に最新値を読めるようにする。
 *
 * **用途は「SyncClient のコールバックへ渡すハンドラ束の同期」である**（Issue #46）。
 * `App.tsx` の `makeClient` が生成する各種コールバック（onRoom/onIdentity/onError 等）は
 * 生成時点の値で固定される（closure）。そこで、コールバック本体を render 本体の
 * スコープに置き、それらをまとめたオブジェクトをこのフックで ref へ同期する。
 * `SyncClient` へ渡すのは `ref.current` の同名関数を呼ぶだけの転送関数なので、
 * 固定されるのは転送だけで、実際に走るのは常に最新レンダーのハンドラになる。
 *
 * かつては同じ仕組みで「state の写し」（room/participantId/endType/generatingProblem）を
 * 保持していたが、それは state と ref の並行保持そのものだった。Issue #46 で
 * 保持する中身をハンドラ束へ入れ替え、state の写しは無くなっている。
 *
 * 同期は render 本体の中で行う（`useEffect` を挟まない）。挟むと、passive effect が
 * commit と非同期に flush される都合で、差し替え前に届いた WS メッセージを
 * 1レンダー古いハンドラが処理してしまう。
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
