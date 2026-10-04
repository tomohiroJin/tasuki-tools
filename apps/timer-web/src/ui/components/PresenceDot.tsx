/**
 * 在席状態のドット表示（Issue #28 C-4）。
 * Lobby.tsx（234行目）と RosterPanel.tsx（229〜232行目）の在席ドット JSX を
 * 単一の共有コンポーネントへ一本化する（FR-176）。
 * 状態は `data-presence` 属性で渡し、色は `styles/presence-dot.css` が塗る（#321）。
 * 判定ロジックは再実装しない（FR-178）。
 */

import type { Participant } from "@tasuki/timer-core";

interface PresenceDotProps {
  presence: Participant["presence"];
}

export function PresenceDot({ presence }: PresenceDotProps) {
  return (
    <span className="presence-dot" data-presence={presence} aria-hidden="true" />
  );
}
