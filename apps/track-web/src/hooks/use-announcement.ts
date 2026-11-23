/**
 * 読み上げの文（#476・設計 §5）。経過は毎秒読ませず、**切り替え・停止・自動の停止・止め忘れの知らせのときだけ**文を差し替える。
 * 何を読むかは `announcementFor`（純粋）が決める。ここは前の写しを覚えて比べるだけ。
 */
import { useEffect, useRef, useState } from 'react';
import type { TrackView } from '@tasuki/track-core';
import { announcementFor } from '../track-view';

/** `longRunningText` は、止め忘れの知らせが出ているときの文（出ていなければ null）。出た瞬間に 1 回だけ読む。 */
export function useAnnouncement(view: TrackView, longRunningText: string | null): string {
  const [text, setText] = useState('');
  const prevViewRef = useRef<TrackView | null>(null);
  const prevLongRef = useRef<string | null>(null);

  useEffect(() => {
    const next = announcementFor(prevViewRef.current, view);
    prevViewRef.current = view;
    if (next !== null) setText(next);
  }, [view]);

  useEffect(() => {
    if (longRunningText !== null && prevLongRef.current === null) setText(longRunningText);
    prevLongRef.current = longRunningText;
  }, [longRunningText]);

  return text;
}
