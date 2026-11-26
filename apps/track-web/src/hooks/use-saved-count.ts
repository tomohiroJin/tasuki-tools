/**
 * 「この端末に残す」の状態（#476 第 2 段 B1・B3）。残した件数（上限の手前の知らせに使う）と、残す操作。
 * 残すのは利用者が押したときだけ。時刻は手元の時計の時刻軸（`getNow`）から、ID はここで 1 度だけ作る。
 * 保存・読み出しの失敗は例外にせず、状態（`failed`）で返す（画面を落とさない）。
 *
 * - 保存中は重ねて残さない（`saving`）。直前に残した記録と同じ `rev` なら、新しく残さず「残しました」を出し直すだけ
 * - 記録（`view.rev`）が変わったら、結果の表示は `idle` へ戻す（古い「残しました」を新しい記録の上に残さない）
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TrackView } from '@tasuki/track-core';
import { recordFromView } from '../storage/saved-record';
import { loadSaved, saveRecord } from '../storage/saved-store';

export type SaveStatus = 'idle' | 'done' | 'failed';

export interface SaveToDevice {
  /** 端末に残っている件数。読めるまでは null（読めなければ null のまま） */
  count: number | null;
  status: SaveStatus;
  /** 保存中（ボタンを押せなくする） */
  saving: boolean;
  save: () => Promise<void>;
}

export function useSaveToDevice(view: TrackView, getNow: () => number): SaveToDevice {
  const [count, setCount] = useState<number | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  /** 直前に残せた記録の `rev`（残せていなければ null） */
  const lastSavedRev = useRef<number | null>(null);

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

  useEffect(() => {
    setStatus('idle');
  }, [view.rev]);

  const save = useCallback(async () => {
    if (savingRef.current) return;
    if (lastSavedRev.current === view.rev) {
      setStatus('done');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await saveRecord(recordFromView(view, getNow(), crypto.randomUUID()));
      lastSavedRev.current = view.rev;
      setStatus('done');
    } catch {
      setStatus('failed');
      return;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    // 件数の読み直しに失敗しても、残したことは変わらない
    await loadSaved().then(
      (records) => setCount(records.length),
      () => undefined,
    );
  }, [view, getNow]);

  return { count, status, saving, save };
}
