/**
 * 止め忘れの知らせ（FR-6）を、ページが非表示のときに通知でも出す（#476・設計 §4 C6・C7）。
 *
 * - 知らせが**出る瞬間**（区切りの id が null から変わる）に、設定が入で、ページが非表示のときだけ 1 回通知する。
 *   前面で出た知らせは通知しない（画面で見えている）。同じ区切りでは 1 回きり
 * - 画面を開いた時点で出ていた知らせは「出る瞬間」ではないので通知しない
 * - **このフックは作業名を受け取らない**（通知の文に作業名を出さない。文は経過の分だけから組む）
 */
import { useEffect, useRef } from 'react';
import { LONG_RUNNING_NOTICE_MS } from '@tasuki/track-core';
import { LONG_RUNNING_NOTIFY_BODY, longRunningNotifyTitle } from '../copy';
import { notifyWhenHidden } from '../platform/notify';

const MS_PER_MIN = 60_000;

/** `longRunningId` は、知らせが出ている区切りの id（出ていなければ null）。 */
export function useLongRunningNotify(longRunningId: string | null, enabled: boolean): void {
  // undefined = まだ 1 度も見ていない（最初に見た値は「出る瞬間」ではない）
  const seenRef = useRef<string | null | undefined>(undefined);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const previous = seenRef.current;
    seenRef.current = longRunningId;
    if (previous === undefined || longRunningId === null || longRunningId === previous) return;
    if (enabledRef.current) notifyWhenHidden(longRunningNotifyTitle(LONG_RUNNING_NOTICE_MS / MS_PER_MIN), LONG_RUNNING_NOTIFY_BODY);
  }, [longRunningId]);
}
