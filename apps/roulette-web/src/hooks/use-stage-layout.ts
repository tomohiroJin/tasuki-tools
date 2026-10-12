import { useEffect, useRef, useState } from 'react';
import { stageLayoutFor, type StageLayout } from '../wheel-motion';

/**
 * 舞台の並び（縦積み / 横並び）。**舞台の幅**で決める（画面の幅ではない・spec §6.7）。
 * `ResizeObserver` で読み、**回っている間（`frozen`）は変えない**。止まったら測り直す。
 * 指し針の位置も同じ値から決まるので、CSS のコンテナクエリと JS の判定を二重に持たない。
 */
export function useStageLayout(stage: HTMLElement | null, frozen: boolean): StageLayout {
  const [layout, setLayout] = useState<StageLayout>('stack');
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;

  useEffect(() => {
    if (stage === null) return;
    const measure = (): void => {
      if (!frozenRef.current) setLayout(stageLayoutFor(stage.clientWidth));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage]);

  // 止まったら、回っている間に変わった幅を拾い直す
  useEffect(() => {
    if (!frozen && stage !== null) setLayout(stageLayoutFor(stage.clientWidth));
  }, [frozen, stage]);

  return layout;
}
