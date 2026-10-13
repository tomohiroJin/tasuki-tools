import { useLayoutEffect, useRef, useState } from 'react';
import { stageLayoutFor, type StageLayout } from '../wheel-motion';

/**
 * 舞台の並び（縦積み / 横並び）。**舞台の幅**で決める（画面の幅ではない・spec §6.7）。
 * `ResizeObserver` で読み、**回っている間（`frozen`）は変えない**。止まったら測り直す。
 * 指し針の位置も同じ値から決まるので、CSS のコンテナクエリと JS の判定を二重に持たない。
 *
 * - **舞台が付いたら、凍っていても必ず 1 回測る。** 凍結は「測った値」を保つもので、測る前の既定値
 *   （縦積み）を保つものではない。回転中にマウントした画面（再読み込み・途中入室）が、広い舞台でも回っている
 *   間ずっと縦積み（指し針が下）のまま凍り、止まった瞬間に横並びへ跳んで止まる角度が 90° 変わっていた
 * - **測るのは描く前（`useLayoutEffect`）。** 描いた後（`useEffect`）に測ると、広い舞台で 1 フレームだけ
 *   縦積みが描かれてから横並びへちらつく
 */
export function useStageLayout(stage: HTMLElement | null, frozen: boolean): StageLayout {
  const [layout, setLayout] = useState<StageLayout>('stack');
  const frozenRef = useRef(frozen);

  // 監視の呼び戻しが読む「いま凍っているか」。下の 2 つより先に書き換える（同じ相の効果は宣言の順に走る）
  useLayoutEffect(() => {
    frozenRef.current = frozen;
  }, [frozen]);

  useLayoutEffect(() => {
    if (stage === null) return;
    setLayout(stageLayoutFor(stage.clientWidth));
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!frozenRef.current) setLayout(stageLayoutFor(stage.clientWidth));
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage]);

  // 止まったら、回っている間に変わった幅を拾い直す
  useLayoutEffect(() => {
    if (!frozen && stage !== null) setLayout(stageLayoutFor(stage.clientWidth));
  }, [frozen, stage]);

  return layout;
}
