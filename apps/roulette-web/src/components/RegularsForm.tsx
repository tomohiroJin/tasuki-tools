import { useId, type Dispatch, type FormEvent } from 'react';
import { MAX_DISPLAY_NAME } from '@tasuki/room-core';
import {
  REGULARS_CANCEL_BUTTON,
  REGULARS_CREATE_TITLE,
  REGULARS_DELETE_BUTTON,
  REGULARS_MEMBERS_LABEL,
  REGULARS_NAME_LABEL,
  REGULARS_PEOPLE_LEGEND,
  REGULARS_SAVE_BUTTON,
  regularEditTitle,
  regularsCountText,
} from '../copy';
import type { RegularFormAction, RegularFormState } from '../regulars-form';
import { orderedMembers } from '../regulars-view';
import type { RegularGroup } from '../storage/regulars';

export const DELETE_ID = 'roulette-regulars-delete';

interface Props {
  form: RegularFormState;
  dispatch: Dispatch<RegularFormAction>;
  /** 直している組（作るときは undefined） */
  editing: RegularGroup | undefined;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  onAskDelete: () => void;
}

/** 組を作る・直す欄。入力の状態は親の reducer が持ち、ここは描くだけ */
export function RegularsForm({ form, dispatch, editing, onSubmit, onCancel, onAskDelete }: Props) {
  const formTitleId = useId();
  const countId = useId();
  const errorId = useId();
  const { name, text, checkRows, error, errorField } = form;
  const nameInvalid = error !== '' && errorField === 'name';
  const membersInvalid = error !== '' && errorField === 'members';
  const peopleInvalid = error !== '' && errorField === 'people';

  return (
    <form className="roulette-regulars-form" aria-labelledby={formTitleId} onSubmit={onSubmit} noValidate>
      <p id={formTitleId} className="roulette-regulars-title">
        {editing === undefined ? REGULARS_CREATE_TITLE : regularEditTitle(editing.name)}
      </p>
      <div className="roulette-regulars-field">
        <label htmlFor="roulette-regulars-name">{REGULARS_NAME_LABEL}</label>
        <input
          id="roulette-regulars-name"
          className="ui-input"
          autoComplete="off"
          maxLength={MAX_DISPLAY_NAME}
          aria-invalid={nameInvalid ? true : undefined}
          aria-describedby={nameInvalid ? errorId : undefined}
          value={name}
          onChange={(event) => dispatch({ type: 'name', value: event.target.value })}
        />
      </div>
      {checkRows.length > 0 && (
        <fieldset
          className="roulette-regulars-people"
          aria-describedby={peopleInvalid ? `${countId} ${errorId}` : countId}
        >
          <legend>{REGULARS_PEOPLE_LEGEND}</legend>
          <ul className="roulette-regulars-checks">
            {checkRows.map((r, i) => (
              <li key={r.name}>
                <label className="roulette-regulars-check">
                  <input
                    type="checkbox"
                    className="roulette-check"
                    checked={r.checked}
                    onChange={(event) => dispatch({ type: 'check', index: i, on: event.target.checked })}
                  />
                  <span className="roulette-name">{r.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <div className="roulette-regulars-field">
        <label htmlFor="roulette-regulars-members">{REGULARS_MEMBERS_LABEL}</label>
        <textarea
          id="roulette-regulars-members"
          className="ui-input"
          rows={checkRows.length > 0 ? 3 : 6}
          value={text}
          aria-invalid={membersInvalid ? true : undefined}
          aria-describedby={membersInvalid ? `${countId} ${errorId}` : countId}
          onChange={(event) => dispatch({ type: 'text', value: event.target.value })}
        />
      </div>
      <p id={countId} className="roulette-regulars-count">
        {regularsCountText(orderedMembers([], checkRows.filter((r) => r.checked).map((r) => r.name), text).length)}
      </p>
      {error !== '' && (
        <p id={errorId} className="ui-note ui-note--error" role="alert">
          {error}
        </p>
      )}
      <div className="roulette-regulars-actions">
        <button type="button" className="ui-button ui-button--secondary ui-button--sm" onClick={onCancel}>
          {REGULARS_CANCEL_BUTTON}
        </button>
        <button type="submit" className="ui-button ui-button--secondary ui-button--sm">
          {REGULARS_SAVE_BUTTON}
        </button>
      </div>
      {editing !== undefined && (
        <div className="roulette-regulars-danger">
          <button type="button" id={DELETE_ID} className="ui-button ui-button--danger ui-button--sm" onClick={onAskDelete}>
            {/* 削除の確認の欄へ移る */}
            {REGULARS_DELETE_BUTTON}
          </button>
        </div>
      )}
    </form>
  );
}
