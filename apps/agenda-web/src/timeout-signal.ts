/**
 * 時間切れの合図を出すか（#429 spec §4.4・§4.7・§12 の最終レビュー I-1）。
 *
 * 次のどちらかで true。
 * 1. **同じステップで、残りが正から 0 以下へ移った**（手元の時計か、届いたフレームで 0 をまたいだ）
 *    - 延長で正に戻ってから再び 0 に達したら、もう一度 true（0 に達するたびに 1 回）
 * 2. **「自動で次へ」のステップが、時間切れで次へ（または終了へ）移った**フレームを受けた
 *    - 手元の時計はサーバーより片道の遅れの分だけ遅れるので、手元で 0 をまたぐ描画より先に移ったフレームが届く。
 *      1 だけでは自動で次へ移るステップでほとんど鳴らない（動きを減らす設定の 1 秒ごとの描き直しでは鳴らない）
 *    - 見分け方: 前の盤で残りが正（まだ鳴らしていない）のまま動いていたそのステップの所要が、次の盤で確定しており、
 *      **所要 − 一時停止していた分 = 持ち時間（長さ＋延長）**。サーバーは期限ちょうどで確定する（`advanceIfDue`）。
 *      持ち時間より前に「次へ」を押したときは所要が足りないので鳴らさない
 *    - 一時停止していた分は前の盤の `stepSpentMs − stepTimerMs`（動いている間は変わらない）
 *
 * - `prev` が null（最初の描画・再接続・途中参加）なら false。過去の 0 に対して鳴らさない
 * - 「押すまで待つ」のステップを押して移ったときは false（そのステップの合図は 0 をまたいだ側で出している）
 */
import { budgetMs, remainingMs, type AgendaView } from '@tasuki/agenda-core';

const isActive = (v: AgendaView): boolean => v.phase === 'running' || v.phase === 'paused';

/** 単調時計（`performance.now()`）の小数の誤差を吸う幅（ms） */
const BUDGET_TOLERANCE_MS = 1;

/** 前の盤で動いていたステップが、時間切れで自動で次へ（または終了へ）移ったか */
function autoAdvancedOnTimeout(prev: AgendaView, next: AgendaView): boolean {
  if (prev.phase !== 'running' || prev.currentId === null || prev.currentId === next.currentId) return false;
  if (remainingMs(prev) <= 0) return false;
  const step = next.steps.find((x) => x.id === prev.currentId);
  // 知らない振る舞い（新しいサーバーが足した値）は「押すまで待つ」と同じに扱う
  if (step === undefined || step.onTimeout !== 'advance' || step.spentMs === null) return false;
  const pausedMs = prev.stepSpentMs - prev.stepTimerMs;
  return Math.abs(step.spentMs - pausedMs - budgetMs(step)) < BUDGET_TOLERANCE_MS;
}

export function crossedZero(prev: AgendaView | null, next: AgendaView): boolean {
  if (prev === null) return false;
  if (autoAdvancedOnTimeout(prev, next)) return true;
  if (!isActive(prev) || !isActive(next) || prev.currentId !== next.currentId) return false;
  return remainingMs(prev) > 0 && remainingMs(next) <= 0;
}
