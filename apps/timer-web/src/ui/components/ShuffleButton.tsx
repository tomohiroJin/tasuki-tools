/**
 * 「ランダム」ボタン（ドライバー順をランダムに並べ替える・v2.3 #1）。
 * ロビーの参加者の見出しの行と、セッション・ルームの名簿の見出しの行が同じボタンを使う（#553 のレビューで 3 つ目の写しになるのを止めた）。
 * 見た目の部品は `.ui-button`、中の並び（アイコンと字）は、セッションの操作ボタンと同じクラス（`session-action-label`・`session-action-icon`・`session.css`）を使う。
 * 同じ並びの写し（`shuffle-button-*`）は持たない（間が 6px と 8px に分かれていた）。
 */
import { Shuffle } from "lucide-react";

export function ShuffleButton({ onClick, rotationLength }: { onClick: (() => void) | undefined; rotationLength: number }) {
  // 2 人以上で意味を持つ。出す条件はここ 1 か所に置く（ロビーと名簿が同じ規則を写さない）
  if (onClick === undefined || rotationLength < 2) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="ドライバー順をランダムに並べ替える"
      className="ui-button ui-button--secondary ui-button--sm"
    >
      <span className="session-action-label">
        <Shuffle className="session-action-icon" aria-hidden="true" /> ランダム
      </span>
    </button>
  );
}
