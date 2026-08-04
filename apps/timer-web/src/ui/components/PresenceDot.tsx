/**
 * 在席状態のドット表示（Issue #28 C-4）。
 * Lobby.tsx（234行目）と RosterPanel.tsx（229〜232行目）の在席ドット JSX を
 * 単一の共有コンポーネントへ一本化する（FR-176）。
 * `presenceDotClass()`（presence.ts）はそのまま呼び出すだけで、判定ロジックは
 * 再実装しない（FR-178）。クラスの並び順のみが両画面で異なっていたため、
 * 見た目に影響しない1つの並び順に統一した（T004）。
 */

import type { Participant } from "@tasuki/timer-core";
import { presenceDotClass } from "../presence.js";

interface PresenceDotProps {
  presence: Participant["presence"];
}

export function PresenceDot({ presence }: PresenceDotProps) {
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${presenceDotClass(presence)}`}
      aria-hidden="true"
    />
  );
}
