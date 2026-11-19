/**
 * 前に作ったルーム名の端末の読み書き（#633）。`docs/guides/architecture.md` の「web の端末 I/O」。
 *
 * 規則（何を覚え、どう並べるか）は `recent-room-names.ts`。ここは鍵の綴りと保管庫の出入りだけを持つ。
 *
 * **使えない保管庫は「何も覚えていない」と同じに扱う**（`@tasuki/sync-client` の
 * `resume-identity.ts` と同じ判断・#284）。cookie を全面禁止した Chrome では読むだけで投げ、
 * 容量超過では書き込みが投げる。ここが投げると玄関が真っ白になり、作成もできなくなる。
 */
import { forgetRoomName, parseRecentRoomNames, rememberRoomName } from './recent-room-names.js';

/** 鍵。玄関だけが読み書きする（他のツールは使わない）。 */
export const RECENT_ROOM_NAMES_KEY = 'tasuki:recent-room-names';

/** 覚えているルーム名（新しい順）。読めない・壊れているなら空。 */
export function loadRecentRoomNames(): string[] {
  try {
    const text = localStorage.getItem(RECENT_ROOM_NAMES_KEY);
    if (text === null) return [];
    return parseRecentRoomNames(JSON.parse(text));
  } catch {
    return [];
  }
}

function write(names: readonly string[]): void {
  try {
    localStorage.setItem(RECENT_ROOM_NAMES_KEY, JSON.stringify(names));
  } catch {
    // 使えない保管庫（cookie 全面禁止・容量超過）。覚えないまま進む
  }
}

/**
 * 作ったルームの名前を覚え、新しい候補を返す。
 *
 * **書く直前に読み直す。** 別のタブで作った名前や消した名前を、手元の古い控えで書き潰さない。
 */
export function storeRememberedRoomName(name: string): string[] {
  const next = rememberRoomName(loadRecentRoomNames(), name);
  write(next);
  return next;
}

/** 候補から 1 つを消し、新しい候補を返す。書く直前に読み直す（同上）。 */
export function storeForgottenRoomName(name: string): string[] {
  const next = forgetRoomName(loadRecentRoomNames(), name);
  write(next);
  return next;
}
