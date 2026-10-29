import { useId, type ReactNode } from 'react';
import {
  AWAY_MARK,
  TWIN_MARK,
  PEOPLE_HEADING,
  SELF_SUFFIX,
  GUEST_REMOVE_BUTTON,
  guestRemoveLabel,
  turnLabel,
} from '../copy';
import type { People, PersonRow, RowMark } from '../roulette-view';
import { GuestForm } from './GuestForm';

const MARK_TEXT: Record<Exclude<RowMark, 'turn' | null>, string> = { away: AWAY_MARK, twin: TWIN_MARK };

/** 行の印の文言。番の印は数を持つ（#401 順番に回す §5.3） */
function markTextOf(row: PersonRow): string | null {
  if (row.mark === null) return null;
  return row.mark === 'turn' ? turnLabel(row.turn ?? 0) : MARK_TEXT[row.mark];
}

interface Props {
  people: People;
  /** 操作を受け付けない間（切断中・回転中） */
  locked: boolean;
  onInclude: (id: string, included: boolean) => void;
  onRemoveGuest: (id: string) => void;
  onAddGuest: (name: string) => void;
  /** 「いつものメンツ」の区画（名前を追加の下）。端末だけの物なので、人の一覧とは罫で分かれる */
  regulars: ReactNode;
}

/**
 * 脇の「ルーレットに入る人」。チェック = 入れる。行は [チェック][名前][印][名前を消す]（狭いと印と消すが次の行へ）。
 * **人だけを置く**（#401 順番に回す T9）。選ぶ人数・順番の進み具合は「決め方」の面（`ModePanel`）が持つ。
 */
export function PeoplePanel({ people, locked, onInclude, onRemoveGuest, onAddGuest, regulars }: Props) {
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
      {regulars}
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
  // 印はチェックの説明に結び付ける（押せない行で、読み上げが押せない理由を印の文言で言う）。
  const markId = useId();
  const markText = markTextOf(row);
  const hasMark = markText !== null;
  // 番が決まった人は名前を薄くする（入る人のままだが、この回ではもう選ばれない）
  const faded = !row.checked || row.mark === 'turn';
  return (
    <li className={`roulette-row${faded ? ' roulette-row--out' : ''}`}>
      {/* 行全体がラベル。チェックボックスは「ルーレットに入れる」の意味（aria-pressed のボタンにしない） */}
      <label className="roulette-row-label">
        <input
          type="checkbox"
          className="roulette-check"
          checked={row.checked}
          disabled={locked || row.disabled}
          aria-describedby={hasMark ? markId : undefined}
          onChange={(event) => onInclude(row.id, event.target.checked)}
        />
        <span className="roulette-name">
          {row.name}
          {row.isSelf ? SELF_SUFFIX : ''}
        </span>
      </label>
      {(hasMark || row.removable) && (
        // 印と「名前を消す」は名前の後ろの一塊。名前が収まらない幅では塊ごと次の行へ回る（名前を先に読ませる）
        <span className="roulette-row-tail">
          {hasMark && (
            <span id={markId} className={`roulette-chip${row.mark === 'away' ? ' roulette-chip--away' : ''}`}>
              {markText}
            </span>
          )}
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
        </span>
      )}
    </li>
  );
}
