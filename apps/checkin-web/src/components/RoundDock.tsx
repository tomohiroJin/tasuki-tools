/**
 * 下の操作の帯（#406・設計 §4）。open なら「待たずに開く」、開いた後は「もう一回」と「別のやり方」。
 * 操作は参加者の誰でも（見学者も）できる。`seq` は呼び出し側がいまの回の番号を載せる。
 * 切断中（`canOperate` が偽）は押させない（押した操作は入り直しより先に届いて黙って消える）。
 */
import { CHANGE_METHOD, PLAY_AGAIN, REVEAL_NOW } from '../copy';

interface Props {
  status: 'open' | 'revealed';
  canOperate: boolean;
  onReveal: () => void;
  onAgain: () => void;
  onChangeMethod: () => void;
}

export function RoundDock({ status, canOperate, onReveal, onAgain, onChangeMethod }: Props) {
  return (
    <div className="round-dock">
      {status === 'open' ? (
        <button type="button" className="ui-button" disabled={!canOperate} onClick={onReveal}>
          {REVEAL_NOW}
        </button>
      ) : (
        <>
          <button type="button" className="ui-button ui-button--secondary" disabled={!canOperate} onClick={onChangeMethod}>
            {CHANGE_METHOD}
          </button>
          <button type="button" className="ui-button" disabled={!canOperate} onClick={onAgain}>
            {PLAY_AGAIN}
          </button>
        </>
      )}
    </div>
  );
}
