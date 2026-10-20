/**
 * 時間切れの合図を出すか（#429 spec §4.4・§4.7）。
 *
 * **同じステップで、残りが正から 0 以下へ移ったときだけ** true。
 * - `prev` が null（最初の描画・再接続・途中参加）なら false。過去の 0 に対して鳴らさない
 * - ステップが変わった直後も false。自動で次へ移ったときの合図は、前のステップで 0 をまたいだ側で出す
 * - 延長で正に戻ってから再び 0 に達したら、もう一度 true（0 に達するたびに 1 回）
 */
import { remainingMs, type AgendaView } from '@tasuki/agenda-core';

const isActive = (v: AgendaView): boolean => v.phase === 'running' || v.phase === 'paused';

export function crossedZero(prev: AgendaView | null, next: AgendaView): boolean {
  if (prev === null) return false;
  if (!isActive(prev) || !isActive(next) || prev.currentId !== next.currentId) return false;
  return remainingMs(prev) > 0 && remainingMs(next) <= 0;
}
