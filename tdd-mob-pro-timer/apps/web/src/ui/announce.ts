/**
 * 支援技術向け離散アナウンスの導出（FR-035）
 * 連続カウントダウンは読み上げず、状態の「変化」だけを通知する。
 */

export interface AnnounceState {
  running: boolean;
  isPaused: boolean;
  currentIndex: number;
  isUrgent: boolean;
  driverName: string;
}

/**
 * 直前と現在の状態を比較し、読み上げるべき文言を返す。
 * 変化が無ければ null（＝何も読み上げない）。
 * 優先度の高い事象を1つだけ返す（同時発生時の読み上げ過多を防ぐ）。
 */
export function deriveAnnouncement(
  prev: AnnounceState,
  next: AnnounceState,
): string | null {
  // 一時停止/再開
  if (!prev.isPaused && next.isPaused) return "一時停止しました";
  if (prev.isPaused && next.isPaused === false && !prev.running && next.running)
    return "再開しました";

  // ドライバー交代
  if (prev.currentIndex !== next.currentIndex) {
    return `ドライバーが${next.driverName}さんに交代しました`;
  }

  // 残り10秒（境界を跨いだ瞬間のみ）
  if (!prev.isUrgent && next.isUrgent) return "残り10秒です";

  return null;
}
