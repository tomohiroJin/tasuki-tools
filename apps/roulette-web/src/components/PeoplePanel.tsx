import { useId } from 'react';
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
import { PickCountPicker } from './PickCountPicker';

const MARK_TEXT: Record<Exclude<RowMark, null>, string> = { away: AWAY_MARK, twin: TWIN_MARK, drawn: DRAWN_MARK };

interface Props {
  people: People;
  /** 操作を受け付けない間（切断中・回転中） */
  locked: boolean;
  onInclude: (id: string, included: boolean) => void;
  onRemoveGuest: (id: string) => void;
  onAddGuest: (name: string) => void;
  onResetCycle: () => void;
  /** 選ぶ人数（#401） */
  pickCount: number;
  onPickCount: (count: number) => void;
}

/** 脇の「ルーレットに入る人」。チェック = 入れる。行は [チェック][名前][印][名前を消す]（狭いと印と消すが次の行へ）。 */
export function PeoplePanel({ people, locked, onInclude, onRemoveGuest, onAddGuest, onResetCycle, pickCount, onPickCount }: Props) {
  return (
    <section className="ui-panel roulette-people" aria-labelledby="roulette-people-heading">
      <h2 id="roulette-people-heading">
        {PEOPLE_HEADING} <span className="roulette-count">{people.poolCount}</span>
      </h2>
      {/* 選ぶ人数は入る人と一緒に整える準備なので、見出しの直下に置く（舞台の縦の予算に触れない・#401 spec M10） */}
      <PickCountPicker value={pickCount} disabled={locked} onPick={onPickCount} />
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
  // 印はチェックの説明に結び付ける（押せない行で、読み上げが押せない理由を印の文言で言う）。
  const markId = useId();
  const hasMark = row.mark !== null;
  return (
    <li className={`roulette-row${row.checked ? '' : ' roulette-row--out'}`}>
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
      {(row.mark !== null || row.removable) && (
        // 印と「名前を消す」は名前の後ろの一塊。名前が収まらない幅では塊ごと次の行へ回る（名前を先に読ませる）
        <span className="roulette-row-tail">
          {row.mark !== null && (
            <span id={markId} className={`roulette-chip${row.mark === 'away' ? ' roulette-chip--away' : ''}`}>
              {MARK_TEXT[row.mark]}
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
