/**
 * 手札（#406・設計 §5・#480）。札のボタン。選んだ札は浮き上がり金の縁と淡い光。
 * **見学中は札を出さない**（E9）。代わりに「見学中」と「見学をやめる」を出す。
 * 切断中（`canOperate` が偽）は札も見学の切り替えも押させない（押した操作が黙って消える）。
 * 札の殻（象牙の地・枠）は `.hand-card-body`、顔は `CardFace`（絵だけ）。
 *
 * **札の下に名前と意味を添える**（#480・設計 §14）。添え書きは札のボタンの中に置き、押せる範囲に含める。
 * 読み上げ名は名前の要素へ `aria-labelledby` で、意味は `aria-describedby` で結ぶ（名前を 1 回だけ読む）。
 * 手札の見出しには問いを添え、どの問いへの答えかを手札だけで分かるようにする。
 */
import { useId } from 'react';
import { METHODS, type CardId, type MethodId } from '@tasuki/checkin-core';
import { CARD_MARK, HAND_GROUP_LABEL, SPECTATE, SPECTATING_TEXT, STOP_SPECTATING } from '../copy';
import { METHOD_COPY } from '../method-copy';
import { CardFace } from './CardFace';

interface Props {
  method: MethodId;
  selected: CardId | null;
  spectating: boolean;
  canOperate: boolean;
  onPlay: (card: CardId) => void;
  onSetSpectator: (spectator: boolean) => void;
}

/** 見学の切り替え。回が無いときの画面からも使うので単体で出す */
export function SpectatorToggle({
  spectating,
  canOperate,
  onSetSpectator,
}: {
  spectating: boolean;
  canOperate: boolean;
  onSetSpectator: (s: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="ui-button ui-button--quiet ui-button--sm"
      disabled={!canOperate}
      onClick={() => onSetSpectator(!spectating)}
    >
      {spectating ? STOP_SPECTATING : SPECTATE}
    </button>
  );
}

export function Hand({ method, selected, spectating, canOperate, onPlay, onSetSpectator }: Props) {
  // フックは早期の return より前で呼ぶ（見学の切り替えで呼ぶ数が変わらないように）
  const idBase = useId();
  if (spectating) {
    return (
      <div className="hand-spectating">
        <p className="ui-note">{SPECTATING_TEXT}</p>
        <SpectatorToggle spectating canOperate={canOperate} onSetSpectator={onSetSpectator} />
      </div>
    );
  }
  const copy = METHOD_COPY[method];
  return (
    <div className="hand-area">
      <p className="hand-label">
        <span className="hand-label-title">{HAND_GROUP_LABEL}</span>
        <span className="hand-label-prompt">{copy.prompt}</span>
      </p>
      <div className="hand" role="group" aria-label={HAND_GROUP_LABEL}>
        {METHODS[method].cards.map((card, i) => {
          const nameId = `${idBase}-name-${i}`;
          const meaningId = `${idBase}-meaning-${i}`;
          const cardCopy = copy.cards[card];
          return (
            <button
              key={card}
              type="button"
              className="hand-card"
              aria-labelledby={nameId}
              aria-describedby={meaningId}
              aria-pressed={card === selected}
              disabled={!canOperate}
              onClick={() => onPlay(card)}
            >
              <span className="hand-card-body">
                <span className="hand-card-mark" aria-hidden="true">
                  {CARD_MARK}
                </span>
                <CardFace method={method} card={card} />
              </span>
              <span className="hand-card-caption">
                <span id={nameId} className="hand-card-name">
                  {cardCopy?.name ?? card}
                </span>
                <span id={meaningId} className="hand-card-meaning">
                  {cardCopy?.meaning ?? ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <SpectatorToggle spectating={false} canOperate={canOperate} onSetSpectator={onSetSpectator} />
    </div>
  );
}
