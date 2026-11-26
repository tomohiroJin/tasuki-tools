/**
 * 「この端末に残す」の状態（#476 第 2 段 B1・B3）。残した件数（上限の手前の知らせに使う）と、残す操作。
 * 残すのは利用者が押したときだけ。時刻は手元の時計の時刻軸（`getNow`）から、ID はここで 1 度だけ作る。
 * 保存・読み出しの失敗は例外にせず、状態（`failed`）で返す（画面を落とさない）。
 */
import { useCallback, useEffect, useState } from 'react';
import type { TrackView } from '@tasuki/track-core';
import { recordFromView } from '../storage/saved-record';
import { loadSaved, saveRecord } from '../storage/saved-store';

export type SaveStatus = 'idle' | 'done' | 'failed';

export interface SaveToDevice {
  /** 端末に残っている件数。読めるまでは null（読めなければ null のまま） */
  count: number | null;
  status: SaveStatus;
  save: () => Promise<void>;
}

export function useSaveToDevice(view: TrackView, getNow: () => number): SaveToDevice {
  const [count, setCount] = useState<number | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');

  useEffect(() => {
    let alive = true;
    loadSaved().then(
      (records) => alive && setCount(records.length),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async () => {
    try {
      await saveRecord(recordFromView(view, getNow(), crypto.randomUUID()));
    } catch {
      setStatus('failed');
      return;
    }
    setStatus('done');
    // 件数の読み直しに失敗しても、残したことは変わらない
    await loadSaved().then(
      (records) => setCount(records.length),
      () => undefined,
    );
  }, [view, getNow]);

  return { count, status, save };
}
