import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function read(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

/**
 * 動きを減らす設定か。**rAF の回転は CSS の一括の手当ての外**なので、JS が自分で止める。
 * 設定は実行中にも変わりうるので、変化を購読する。
 * timer-web の `use-reduced-motion` は書き方が違う（既存の変異が当たる）ので寄せていない。
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(QUERY);
    const onChange = (): void => setReduced(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
