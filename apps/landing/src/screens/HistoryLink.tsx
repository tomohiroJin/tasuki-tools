/**
 * 端末に残った完了記録への入口（#95 S5c・利用者の申し送り 2026-09-14）。
 *
 * **入口だけを置き、描画は timer 側に残す。** LP と timer は同一オリジンなので
 * 技術的には LP からも IndexedDB を読めるが、**読まない** —— 完了記録の形は timer の
 * ドメインであり、LP がそれを知ると文脈の境界が消える（`docs/adr/0017`）。
 *
 * 撤去前の入口は timer の `Setup.tsx` にあり、**ルームに入っていなくても見られた**
 * （#95 S5c でそのファイルごと撤去した）。その性質を保つため、玄関（作成・参加画面）にも置く。
 */
export interface HistoryLinkProps {
  /** いま居るルーム。入っていなければ null（戻り先が玄関になる）。 */
  readonly roomCode: string | null;
}

export function HistoryLink({ roomCode }: HistoryLinkProps) {
  const href =
    roomCode === null
      ? '/timer/?view=history'
      : `/timer/?view=history&room=${encodeURIComponent(roomCode)}`;

  return (
    <a className="hub-secondary" href={href}>
      記録を見る
    </a>
  );
}
