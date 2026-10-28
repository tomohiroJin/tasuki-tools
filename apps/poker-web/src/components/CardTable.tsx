// 隠しモードのテーブル（#403・設計 §5.2）。**席に着いたときにだけ `React.lazy` で読み込む**（設計 D6）。
// 普段の利用者の初回の読み込みに、この部品・文言・見た目は入らない。
import type { ParticipantView, PlayingCard, TableView } from '@tasuki/poker-core';
import {
  CATEGORY_LABELS,
  DEAL,
  EVERYONE_HANDS,
  IDLE_NOTE,
  LATE_NOTE,
  LEAVE,
  SHOW,
  TABLE_HEADING,
  WINNER,
  YOUR_HAND,
  cardSpeech,
  cardText,
  handOf,
} from '../card-table-copy';
import './CardTable.css';

interface Props {
  table: TableView;
  participants: readonly ParticipantView[];
  you: string;
  disabled: boolean;
  onDeal: () => void;
  onShow: () => void;
  onLeave: () => void;
}

function Hand({ cards, label }: { cards: readonly PlayingCard[]; label: string }) {
  return (
    <ul className="playing-hand" aria-label={label}>
      {cards.map((card) => (
        <li key={cardText(card)} className="playing-card" data-suit={card.suit} aria-label={cardSpeech(card)}>
          {cardText(card)}
        </li>
      ))}
    </ul>
  );
}

export function CardTable({ table, participants, you, disabled, onDeal, onShow, onLeave }: Props) {
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? '?';
  const dealt = table.status === 'dealt';

  return (
    <section className="card-table" aria-labelledby="card-table-heading">
      <h2 id="card-table-heading">{TABLE_HEADING}</h2>
      {table.status === 'shown' ? (
        <ul className="card-table-results" aria-label={EVERYONE_HANDS}>
          {table.hands.map((h) => (
            <li key={h.participantId} aria-label={handOf(nameOf(h.participantId))} data-you={h.participantId === you}>
              <span className="card-table-name">{nameOf(h.participantId)}</span>
              <Hand cards={h.cards} label={handOf(nameOf(h.participantId))} />
              <span className="card-table-category">{CATEGORY_LABELS[h.category]}</span>
              {table.winners.includes(h.participantId) && <span className="badge card-table-winner">{WINNER}</span>}
            </li>
          ))}
        </ul>
      ) : table.yourHand ? (
        <Hand cards={table.yourHand} label={YOUR_HAND} />
      ) : (
        <p className="ui-note">{dealt ? LATE_NOTE : IDLE_NOTE}</p>
      )}
      <div className="ui-actions">
        {dealt ? (
          <button type="button" className="ui-button" onClick={onShow} disabled={disabled}>
            {SHOW}
          </button>
        ) : (
          <button type="button" className="ui-button" onClick={onDeal} disabled={disabled}>
            {DEAL}
          </button>
        )}
        <button type="button" className="ui-button ui-button--quiet" onClick={onLeave} disabled={disabled}>
          {LEAVE}
        </button>
      </div>
    </section>
  );
}

export default CardTable;
