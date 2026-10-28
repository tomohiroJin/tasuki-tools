/**
 * 下の操作の帯（#406・設計 §4）。open なら「待たずに開く」、開いた後は「もう一回」と「別のやり方」。
 * 操作は参加者の誰でも（見学者も）できる。`seq` は呼び出し側がいまの回の番号を載せる。
 */
import { CHANGE_METHOD, PLAY_AGAIN, REVEAL_NOW } from '../copy';

interface Props {
  status: 'open' | 'revealed';
  onReveal: () => void;
  onAgain: () => void;
  onChangeMethod: () => void;
}

export function RoundDock({ status, onReveal, onAgain, onChangeMethod }: Props) {
  return (
    <div className="round-dock">
      {status === 'open' ? (
        <button type="button" className="ui-button" onClick={onReveal}>
          {REVEAL_NOW}
        </button>
      ) : (
        <>
          <button type="button" className="ui-button ui-button--secondary" onClick={onChangeMethod}>
            {CHANGE_METHOD}
          </button>
          <button type="button" className="ui-button" onClick={onAgain}>
            {PLAY_AGAIN}
          </button>
        </>
      )}
    </div>
  );
}
