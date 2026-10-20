import { useEffect, useState } from 'react';

/** 終了見込みの時刻は分までしか出さないので、手元の時計は粗く進めれば足りる */
const WALL_TICK_MS = 10_000;

/** 手元の時計（終了見込みの「15:02」を出すためだけに使う。計時には使わない） */
export function useWallClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), WALL_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}
