/**
 * 手札（#406・設計 §5）。札のボタン（読み上げ名は札の名前）。選んだ札は浮き上がり金の縁と淡い光。
 * **見学中は札を出さない**（E9）。代わりに「見学中」と「見学をやめる」を出す。
 * 切断中（`canOperate` が偽）は札も見学の切り替えも押させない（押した操作が黙って消える）。
 * 札の殻（象牙の地・枠）はここ、顔は `CardFace`。
 */
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
  if (spectating) {
    return (
      <div className="hand-spectating">
        <p className="ui-note">{SPECTATING_TEXT}</p>
        <SpectatorToggle spectating canOperate={canOperate} onSetSpectator={onSetSpectator} />
      </div>
    );
  }
  return (
    <div className="hand-area">
      <p className="hand-label">{HAND_GROUP_LABEL}</p>
      <div className="hand" role="group" aria-label={HAND_GROUP_LABEL}>
        {METHODS[method].cards.map((card) => (
          <button
            key={card}
            type="button"
            className="hand-card"
            aria-label={METHOD_COPY[method].cards[card]?.name ?? card}
            aria-pressed={card === selected}
            disabled={!canOperate}
            onClick={() => onPlay(card)}
          >
            <span className="hand-card-mark" aria-hidden="true">
              {CARD_MARK}
            </span>
            <CardFace method={method} card={card} />
          </button>
        ))}
      </div>
      <SpectatorToggle spectating={false} canOperate={canOperate} onSetSpectator={onSetSpectator} />
    </div>
  );
}
