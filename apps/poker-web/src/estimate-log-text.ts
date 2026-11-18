import type { EstimateGroupView } from '@tasuki/poker-core';
import { cardLabel } from './card-label';
import {
  ESTIMATE_EXPORT_POINTS,
  ESTIMATE_LOG_HEADING,
  ESTIMATE_NO_POINTS,
  ESTIMATE_OPEN,
  attemptLabel,
  estimateTitle,
} from './estimate-copy';

type Entry = EstimateGroupView['entries'][number];
const TIME_FORMAT = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' });

export function estimateEntryTime(at: number): string {
  return TIME_FORMAT.format(new Date(at));
}

export function estimateEntryCounts(counts: Entry['counts']): string {
  return counts.map((c) => cardLabel(c.card) + '×' + c.count).join(' ');
}

/** 画面と同じ順と題で、今ある記録をすべて書き出す。 */
export function estimateLogMarkdown(groups: readonly EstimateGroupView[]): string {
  const sections = [...groups].reverse().map((group) => {
    // GFM の自動リンクがエスケープ済みの文字を URL として飲み込まないようにする。
    const title = estimateTitle(group.item, group.id).replace(/[\\\x60*_[\]<>#~&!.:@]/g, '\\$&');
    const points = group.open ? ESTIMATE_OPEN
      : group.points === null ? ESTIMATE_NO_POINTS
      : ESTIMATE_EXPORT_POINTS + ': ' + group.points;
    const entries = [...group.entries].reverse().map((entry) =>
      '- ' + [attemptLabel(entry.attempt), estimateEntryTime(entry.at), estimateEntryCounts(entry.counts)].join(' '));
    return ['### ' + title, points, ...entries].join('\n');
  });
  return ['## ' + ESTIMATE_LOG_HEADING, ...sections].join('\n\n');
}
