/**
 * 「ランダム」ボタン（ドライバー順をランダムに並べ替える・v2.3 #1）。
 * ロビーの参加者の見出しの行と、セッション・ルームの名簿の見出しの行が同じボタンを使う（#553 のレビューで 3 つ目の写しになるのを止めた）。
 * 見た目の部品は `.ui-button`、中の並び（アイコンと字）のクラスはこのボタンが持つ（`shuffle-button.css`）。
 */
import { Shuffle } from "lucide-react";

export function ShuffleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="ドライバー順をランダムに並べ替える"
      className="ui-button ui-button--secondary ui-button--sm"
    >
      <span className="shuffle-button-label">
        <Shuffle className="shuffle-button-icon" aria-hidden="true" /> ランダム
      </span>
    </button>
  );
}
