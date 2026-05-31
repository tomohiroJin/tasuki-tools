/**
 * 節目演出ロジック
 * T042: FR-025,031 (US7)
 *
 * 平時は静か。交代・残りわずかの節目のみに限って強い演出を適用する。
 * prefers-reduced-motion に従い、強演出を控えめ版へ切り替える（FR-025）。
 */

/** 緊急表示に切り替える残り秒数のしきい値 */
const URGENT_THRESHOLD_SECONDS = 10;

/**
 * 残り時間と稼働状態に応じて緊急クラスを返す。
 * 停止中・十分な残り時間のときは空文字を返す（平時は静か: FR-031）。
 */
export function getUrgentClass(
  remainingSeconds: number,
  isRunning: boolean,
): string {
  if (!isRunning) return "";
  if (remainingSeconds > URGENT_THRESHOLD_SECONDS) return "";
  return "text-danger urgent-pulse";
}

/**
 * 交代アニメーション用のクラスを返す。
 * ≤300ms の短い強調に留める（FR-031）。
 */
export function getSwitchTransitionClass(): string {
  return "switch-flash";
}

/**
 * reduced-motion 設定の有無でモーションクラスを切り替える（FR-025）。
 * true（減速設定あり）のときは控えめクラス、false は通常クラスを返す。
 */
export function getReducedMotionClass(prefersReducedMotion: boolean): string {
  return prefersReducedMotion
    ? "motion-safe-reduced"
    : "motion-enabled";
}
