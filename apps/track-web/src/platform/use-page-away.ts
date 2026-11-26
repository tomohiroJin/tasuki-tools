/**
 * ページの表示・非表示を見て、離れていた間を端末だけで覚える（#476・FR-27・設計 §4 C1・C1b・C2）。
 *
 * - 非表示になった時点の**時刻軸の位置と、計測中の区切りの id**（`capture`）を覚える。戻ったら、その組と戻った時刻を `returned` に置く
 * - **長さはここでは測らない。** 戻ると同期フックが `track.sync` を送り、届いた写しの位置から非表示になった位置を引いて測る
 *   （`awayPromptOf`。スリープで端末の時計が進まない環境があるため。問いかけを出すかの判断もそちらが持つ）
 * - **非表示の間に一度でもミニ表示（Document PiP）の窓が開いていたら**、離れていたことにしない（覚えない）。
 *   非表示になる時に開いていた・非表示の間に開いた（`enter`）のどちらも数える（窓を閉じてから戻ることがあるため）
 * - 戻ったあとの判定を済ませる前に、また隠れて戻っても、最初の記録を保つ（判定の前に、長い離席の記録を消さない）
 * - **覚えた値はこの端末のメモリだけに置く。** サーバーへ送らず、同期の写しにも載せない（誰が離れていたかを持たせない。原則 XI）
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AwayReturn } from '../track-view';
import { onPipOpened, pipWindowOpen } from './document-pip';

export interface PageAway {
  /** 表に戻ってから、まだ判定していない記録。無ければ null */
  readonly returned: AwayReturn | null;
  /** 判定を済ませた・問いかけに答えたとき、覚えたものを忘れる */
  clear(): void;
}

/** 非表示になった時点の手元の値。 */
export interface HiddenCapture {
  readonly position: number;
  readonly runningId: string | null;
}

export function usePageAway(capture: () => HiddenCapture): PageAway {
  const [returned, setReturned] = useState<AwayReturn | null>(null);
  const hiddenRef = useRef<(HiddenCapture & { pip: boolean }) | null>(null);
  const captureRef = useRef(capture);
  captureRef.current = capture;

  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        // 重ねて非表示が届いても、最初の位置を保つ
        hiddenRef.current ??= { ...captureRef.current(), pip: pipWindowOpen() };
        return;
      }
      const hidden = hiddenRef.current;
      hiddenRef.current = null;
      if (hidden === null || hidden.pip) return;
      const next: AwayReturn = { fromMs: hidden.position, runningId: hidden.runningId, returnedAt: performance.now() };
      setReturned((current) => current ?? next);
    };
    document.addEventListener('visibilitychange', onVisibility);
    // 非表示の間に窓が開いたら、戻ったときには閉じていても数える
    const stopWatchingPip = onPipOpened(() => {
      if (hiddenRef.current !== null) hiddenRef.current = { ...hiddenRef.current, pip: true };
    });
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stopWatchingPip();
    };
  }, []);

  const clear = useCallback(() => setReturned(null), []);
  return { returned, clear };
}
