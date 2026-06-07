/**
 * @deprecated 未使用。ステージ構図は index.css の `.stage-canvas`（data-theme=dark）と
 * App の isStage 判定で実現済みで、このヘルパ群は本番経路から参照されていない（CSS に一本化）。
 * ユニットテスト維持のため残置。将来 CSS に完全統一する際に削除可。
 *
 * ステージ型ビジュアルのトークン定数とクラスユーティリティ
 * T036: FR-028,029, SC-006 (US7)
 *
 * セッション/ロビー画面のキャンバスは data-theme に関わらず
 * ダークステージ背景を固定する（テーマ非依存で焦点構図を実現）。
 */

/** v2 ステージトークン名の一覧（CSS Custom Properties として index.css に定義済み） */
export const STAGE_TOKENS = [
  "--stage-bg",
  "--stage-focus-bg",
  "--focus-glow",
  "--font-size-driver",
  "--stage-focus-py",
  "--stage-peripheral-opacity",
  "--transition-switch",
  "--transition-urgent",
] as const;

/** ステージを適用するフェーズ */
const STAGE_PHASES = new Set(["session", "lobby"]);

/**
 * フェーズに応じてステージクラスを返す。
 * セッション/ロビーにはダークステージ背景を固定する。
 * それ以外のフェーズは通常テーマ（空文字 or 非ステージクラス）。
 */
export function getStageClass(phase: string): string {
  return STAGE_PHASES.has(phase) ? "stage-canvas" : "";
}
