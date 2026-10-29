/**
 * いつものメンツの保存を React の状態に結ぶ（#458）。`localStorage` は最初の 1 度だけ取り、別のタブの変更は `storage` イベントで読み直す。
 * 保存の関数は決して投げないので、ここも投げない。失敗は結果で返し、画面が文にする。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  REGULARS_KEY,
  deleteGroup,
  loadGroups,
  safeLocalStorage,
  saveGroup,
  touchGroup,
  type GroupsResult,
  type RegularGroup,
} from '../storage/regulars';

export interface UseRegulars {
  groups: RegularGroup[];
  save(input: { id?: string; name: string; members: readonly string[] }): GroupsResult;
  remove(id: string): GroupsResult;
  /** 「入れた」ときに並びの先頭へ */
  touch(id: string): void;
}

export function useRegulars(): UseRegulars {
  const storageRef = useRef<Storage | null | undefined>(undefined);
  if (storageRef.current === undefined) storageRef.current = safeLocalStorage();
  const storage = storageRef.current;
  const [groups, setGroups] = useState<RegularGroup[]>(() => loadGroups(storage));

  /** 別のタブでの変更を拾う（key が null は全消し） */
  useEffect(() => {
    if (storage === null) return;
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== null && event.key !== REGULARS_KEY) return;
      setGroups(loadGroups(storage));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storage]);

  const apply = useCallback((result: GroupsResult): GroupsResult => {
    if (result.ok) setGroups(result.items);
    return result;
  }, []);

  const save = useCallback<UseRegulars['save']>((input) => apply(saveGroup(storage, input)), [apply, storage]);
  const remove = useCallback<UseRegulars['remove']>((id) => apply(deleteGroup(storage, id)), [apply, storage]);
  const touch = useCallback<UseRegulars['touch']>((id) => void apply(touchGroup(storage, id)), [apply, storage]);

  return { groups, save, remove, touch };
}
