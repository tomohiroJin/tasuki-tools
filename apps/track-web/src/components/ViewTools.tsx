/**
 * 見せ方の入口（#476 第 2 段・設計 §5 D1・D3）。映す画面を新しいタブで開く・ミニ表示の窓を出し入れする。
 *
 * ミニ表示のボタンは、対応ブラウザ（`supported`）でだけ出す。非対応なら出さず、代わりの道は作らない。
 */
import { useId } from 'react';
import { DISPLAY_LINK, DISPLAY_NOTE, MINI_CLOSE_BUTTON, MINI_OPEN_BUTTON, VIEW_TOOLS_HEADING } from '../copy';
import { displayPathFor } from '../router';

interface Props {
  roomCode: string;
  /** ミニ表示の窓を出せるブラウザか */
  miniSupported: boolean;
  miniOpen: boolean;
  onMiniToggle: () => void;
}

export function ViewTools({ roomCode, miniSupported, miniOpen, onMiniToggle }: Props) {
  const headingId = useId();
  return (
    <section className="track-view-tools ui-stack" aria-labelledby={headingId}>
      <h2 id={headingId}>{VIEW_TOOLS_HEADING}</h2>
      <p className="ui-note">{DISPLAY_NOTE}</p>
      <div className="track-view-tools-actions">
        <a className="ui-button ui-button--secondary ui-button--sm" href={displayPathFor(roomCode)} target="_blank" rel="noopener">
          {DISPLAY_LINK}
        </a>
        {miniSupported && (
          <button type="button" className="ui-button ui-button--secondary ui-button--sm" onClick={onMiniToggle}>
            {miniOpen ? MINI_CLOSE_BUTTON : MINI_OPEN_BUTTON}
          </button>
        )}
      </div>
    </section>
  );
}
