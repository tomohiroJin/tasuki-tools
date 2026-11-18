/**
 * 前に作ったルーム名を、作成画面の状態に結ぶ（#633）。
 *
 * 接続とは関わらない責務なので、同期フック（`use-hub-sync.ts`）から離してある
 * （`use-default-display-name.ts` と同じ立て付け）。同期フックは作成の成功を受けて
 * {@link RecentRoomNames.remember} を呼ぶだけである。
 */
import { useCallback, useState } from 'react';
import { loadRecentRoomNames, storeForgottenRoomName, storeRememberedRoomName } from './recent-room-names-store.js';

export interface RecentRoomNames {
  /** 覚えているルーム名（新しい順）。 */
  readonly names: readonly string[];
  /** 作成に成功したルームの名前を覚える。 */
  remember(name: string): void;
  /** 候補から 1 つを消す。 */
  forget(name: string): void;
}

export function useRecentRoomNames(): RecentRoomNames {
  /** **読むのは読み込みの 1 度だけ**（描画のたびに保管庫を読まない）。 */
  const [names, setNames] = useState<readonly string[]>(loadRecentRoomNames);
  const remember = useCallback((name: string) => setNames(storeRememberedRoomName(name)), []);
  const forget = useCallback((name: string) => setNames(storeForgottenRoomName(name)), []);
  return { names, remember, forget };
}
