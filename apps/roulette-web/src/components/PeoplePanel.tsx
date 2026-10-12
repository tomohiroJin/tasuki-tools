import {
  AWAY_MARK,
  CYCLE_RESET_BUTTON,
  DRAWN_MARK,
  TWIN_MARK,
  PEOPLE_HEADING,
  SELF_SUFFIX,
  GUEST_REMOVE_BUTTON,
  guestRemoveLabel,
} from '../copy';
import { cycleLineOf, type People, type PersonRow, type RowMark } from '../roulette-view';
import { GuestForm } from './GuestForm';

const MARK_TEXT: Record<Exclude<RowMark, null>, string> = { away: AWAY_MARK, twin: TWIN_MARK, drawn: DRAWN_MARK };

interface Props {
  people: People;
  /** 操作を受け付けない間（切断中・回転中） */
  locked: boolean;
  onInclude: (id: string, included: boolean) => void;
  onRemoveGuest: (id: string) => void;
  onAddGuest: (name: string) => void;
  onResetCycle: () => void;
}

/** 脇の「ルーレットに入る人」。チェック = 入れる。行は [チェック][名前][印][名前を消す]。 */
export function PeoplePanel({ people, locked, onInclude, onRemoveGuest, onAddGuest, onResetCycle }: Props) {
  return (
    <section className="ui-panel roulette-people" aria-labelledby="roulette-people-heading">
      <h2 id="roulette-people-heading">
        {PEOPLE_HEADING} <span className="roulette-count">{people.poolCount}</span>
      </h2>
      <ul className="roulette-list">
        {people.rows.map((row) => (
          <Row key={row.id} row={row} locked={locked} onInclude={onInclude} onRemoveGuest={onRemoveGuest} />
        ))}
      </ul>
      <GuestForm disabled={locked} onAdd={onAddGuest} />
      <div className="roulette-foot">
        <p>{cycleLineOf(people.drawnCount, people.poolCount)}</p>
        {/* 状態を変える操作なので副のボタン（控え = 下線の字はリンクに見える） */}
        <button type="button" className="ui-button ui-button--secondary ui-button--sm" disabled={locked} onClick={onResetCycle}>
          {CYCLE_RESET_BUTTON}
        </button>
      </div>
    </section>
  );
}

function Row({
  row,
  locked,
  onInclude,
  onRemoveGuest,
}: {
  row: PersonRow;
  locked: boolean;
  onInclude: Props['onInclude'];
  onRemoveGuest: Props['onRemoveGuest'];
}) {
  return (
    <li className={`roulette-row${row.checked ? '' : ' roulette-row--out'}`}>
      {/* 行全体がラベル。チェックボックスは「ルーレットに入れる」の意味（aria-pressed のボタンにしない） */}
      <label className="roulette-row-label">
        <input
          type="checkbox"
          className="roulette-check"
          checked={row.checked}
          disabled={locked || row.disabled}
          onChange={(event) => onInclude(row.id, event.target.checked)}
        />
        <span className="roulette-name">
          {row.name}
          {row.isSelf ? SELF_SUFFIX : ''}
        </span>
      </label>
      {row.mark !== null && <span className={`roulette-chip${row.mark === 'away' ? ' roulette-chip--away' : ''}`}>{MARK_TEXT[row.mark]}</span>}
      {row.removable && (
        <button
          type="button"
          className="ui-button ui-button--danger ui-button--sm"
          aria-label={guestRemoveLabel(row.name)}
          disabled={locked}
          onClick={() => onRemoveGuest(row.id)}
        >
          {GUEST_REMOVE_BUTTON}
        </button>
      )}
    </li>
  );
}
