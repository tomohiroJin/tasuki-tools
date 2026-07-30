/**
 * 在席状態のドット表示（Issue #28 C-4）。
 * Lobby.tsx と RosterPanel.tsx の双方が持つ、ほぼ同一の在席ドット JSX を
 * 単一の共有コンポーネントへ一本化する（FR-176）。
 * この時点では空実装（T001）。実装は T004 で行う。
 */

import type { Participant } from "@tdd-mob/core";

interface PresenceDotProps {
  presence: Participant["presence"];
}

export function PresenceDot(_props: PresenceDotProps): null {
  return null;
}
