/**
 * ページの表示・非表示を見て、離れていた間を端末だけで覚える（#476・FR-27・設計 §4 C1・C2）。
 *
 * - 非表示になった時点の**時刻軸の位置**（`getPosition`）と端末の壁時計を覚える。戻ったとき、非表示だった時間を壁時計で測る
 *   （単調時計はスリープの間を数えないことがあるため）
 * - **覚えた値はこの端末のメモリだけに置く。** サーバーへ送らず、同期の写しにも載せない（誰が離れていたかを持たせない。原則 XI）
 * - `AWAY_PROMPT_MIN_MS` に満たない戻りは覚えない（問いかけが残っている間に、短い切り替えで消さない）
 * - 問いかけを出すかの最終判断（計測中の区切りの長さなど）は `awayPromptOf`（純粋）が持つ。ここは覚えるだけ
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AWAY_PROMPT_MIN_MS } from '../limits';
import type { AwayReturn } from '../track-view';

export interface PageAway {
  /** 表に戻ったときに覚えた、離れていた間（10 分以上のものだけ）。無ければ null */
  readonly returned: AwayReturn | null;
  /** 問いかけに答えた・要らなくなったとき、覚えたものを忘れる */
  clear(): void;
}

export function usePageAway(getPosition: () => number): PageAway {
  const [returned, setReturned] = useState<AwayReturn | null>(null);
  const hiddenRef = useRef<{ position: number; wall: number } | null>(null);
  const getPositionRef = useRef(getPosition);
  getPositionRef.current = getPosition;

  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        // 重ねて非表示が届いても、最初の位置を保つ
        hiddenRef.current ??= { position: getPositionRef.current(), wall: Date.now() };
        return;
      }
      const hidden = hiddenRef.current;
      hiddenRef.current = null;
      if (hidden === null) return;
      const awayMs = Date.now() - hidden.wall;
      if (awayMs >= AWAY_PROMPT_MIN_MS) setReturned({ fromMs: hidden.position, awayMs });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const clear = useCallback(() => setReturned(null), []);
  return { returned, clear };
}
