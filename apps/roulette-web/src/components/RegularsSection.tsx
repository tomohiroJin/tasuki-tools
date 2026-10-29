import { useEffect, useId, useState, type FormEvent } from 'react';
import { MAX_DISPLAY_NAME } from '@tasuki/room-core';
import { MAX_GUESTS } from '@tasuki/roulette-core';
import {
  REGULARS_CANCEL_BUTTON,
  REGULARS_CREATE_TITLE,
  REGULARS_DELETE_BUTTON,
  REGULARS_DELETE_CONFIRM_BUTTON,
  REGULARS_EDIT_BUTTON,
  REGULARS_EMPTY,
  REGULARS_ERROR_BAD_NAME,
  REGULARS_ERROR_FULL,
  REGULARS_ERROR_NAME_EMPTY,
  REGULARS_ERROR_NAME_TAKEN,
  REGULARS_ERROR_NO_MEMBERS,
  REGULARS_ERROR_TOO_MANY_MEMBERS,
  REGULARS_ERROR_UNREADABLE,
  REGULARS_ERROR_WRITE_FAILED,
  REGULARS_FROM_GUESTS_BUTTON,
  REGULARS_HEADING,
  REGULARS_MEMBERS_LABEL,
  REGULARS_NAME_LABEL,
  REGULARS_NEW_BUTTON,
  REGULARS_SAVED_TEXT,
  REGULARS_SAVE_BUTTON,
  REGULARS_WHERE,
  regularDeleteConfirmText,
  regularDeletedText,
  regularEditLabel,
  regularEditTitle,
  regularPickText,
  regularsCountText,
} from '../copy';
import { useRegulars } from '../hooks/use-regulars';
import { parseMemberLines, type RegularGroup } from '../storage/regulars';

interface Props {
  /** 切断中・回転中。札（入れる）だけ止める。作る・直す・消すは端末の中だけなので止めない */
  locked: boolean;
  /** いま「追加した名前」（ゲスト）の名前。追加した名前から作る、の元 */
  guestNames: readonly string[];
  /** 札を押したとき。組の名前を入れ、知らせの文を返す */
  onInsert: (group: RegularGroup) => string;
}

type Mode =
  | { kind: 'list' }
  /** 作る（id なし）・直す（id あり）。opener は閉じたときにフォーカスを返す先 */
  | { kind: 'form'; id: string | null; opener: string; confirming: boolean };

const NEW_ID = 'roulette-regulars-new';
const FROM_GUESTS_ID = 'roulette-regulars-from-guests';
const CONFIRM_CANCEL_ID = 'roulette-regulars-confirm-cancel';
const DELETE_ID = 'roulette-regulars-delete';
const pickId = (id: string): string => `roulette-regulars-pick-${id}`;
const editId = (id: string): string => `roulette-regulars-edit-${id}`;

const REASON_TEXT = {
  invalid: REGULARS_ERROR_BAD_NAME,
  unreadable: REGULARS_ERROR_UNREADABLE,
  'write-failed': REGULARS_ERROR_WRITE_FAILED,
  full: REGULARS_ERROR_FULL,
  'name-taken': REGULARS_ERROR_NAME_TAKEN,
} as const;

/** 入力の検証。保存の関数が黙って落とす名前（長すぎる・見えない）も、ここで見つけて止める */
function validate(name: string, text: string): { error: string } | { members: string[] } {
  if (name.trim() === '') return { error: REGULARS_ERROR_NAME_EMPTY };
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.some((l) => parseMemberLines(l).length === 0)) return { error: REGULARS_ERROR_BAD_NAME };
  const members = parseMemberLines(text);
  if (members.length === 0) return { error: REGULARS_ERROR_NO_MEMBERS };
  if (members.length > MAX_GUESTS) return { error: REGULARS_ERROR_TOO_MANY_MEMBERS };
  return { members };
}

/**
 * 脇の「ルーレットに入る人」の面の末尾。端末にだけある名前の組を作る・一手で入れる・直す・消す（画面案 §1・§2）。
 * フォーカスは id で追う（並びが変わっても、消えても、行き先を見失わない）。
 */
export function RegularsSection({ locked, guestNames, onInsert }: Props) {
  const { groups, save, remove, touch } = useRegulars();
  const headingId = useId();
  const formTitleId = useId();
  const countId = useId();
  const errorId = useId();
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  /** 同じ文が続くときのため、いったん空にしてから入れる */
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (pendingNotice === null) return;
    setNotice(pendingNotice);
    setPendingNotice(null);
  }, [pendingNotice]);

  useEffect(() => {
    if (focusId === null) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId, mode, groups]);

  const announce = (message: string): void => {
    setNotice('');
    setPendingNotice(message);
  };

  const openForm = (init: { id: string | null; name: string; text: string; opener: string }): void => {
    setName(init.name);
    setText(init.text);
    setError('');
    setNotice('');
    setMode({ kind: 'form', id: init.id, opener: init.opener, confirming: false });
    setFocusId('roulette-regulars-name');
  };
  const closeForm = (to: string | null): void => {
    setMode({ kind: 'list' });
    setError('');
    setFocusId(to);
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (mode.kind !== 'form') return;
    const checked = validate(name, text);
    if ('error' in checked) {
      setError(checked.error);
      return;
    }
    const result = save({ ...(mode.id === null ? {} : { id: mode.id }), name, members: checked.members });
    if (!result.ok) {
      setError(REASON_TEXT[result.reason]);
      return;
    }
    const saved = result.items.find((g) => g.name === name.trim());
    closeForm(saved === undefined ? NEW_ID : pickId(saved.id));
    announce(REGULARS_SAVED_TEXT);
  };

  const doDelete = (): void => {
    if (mode.kind !== 'form' || mode.id === null) return;
    const index = groups.findIndex((g) => g.id === mode.id);
    const target = groups[index];
    if (target === undefined) return;
    const result = remove(target.id);
    if (!result.ok) {
      setMode({ ...mode, confirming: false });
      setError(REASON_TEXT[result.reason]);
      return;
    }
    const next = groups[index + 1] ?? groups[index - 1];
    closeForm(next === undefined ? NEW_ID : pickId(next.id));
    announce(regularDeletedText(target.name));
  };

  const insert = (group: RegularGroup): void => {
    const message = onInsert(group);
    touch(group.id);
    announce(message);
    setFocusId(pickId(group.id));
  };

  const nameInvalid = error === REGULARS_ERROR_NAME_EMPTY || error === REGULARS_ERROR_NAME_TAKEN;
  const editing = mode.kind === 'form' && mode.id !== null ? groups.find((g) => g.id === mode.id) : undefined;

  return (
    <section className="roulette-regulars" aria-labelledby={headingId}>
      <div className="roulette-regulars-head">
        <h3 id={headingId}>{REGULARS_HEADING}</h3>
        <span className="roulette-regulars-where">{REGULARS_WHERE}</span>
      </div>
      {mode.kind === 'list' ? (
        <>
          {groups.length === 0 ? (
            <p className="roulette-regulars-empty">{REGULARS_EMPTY}</p>
          ) : (
            <ul className="roulette-regulars-list" aria-labelledby={headingId}>
              {groups.map((g) => (
                <li key={g.id} className="roulette-regulars-row">
                  <button
                    type="button"
                    id={pickId(g.id)}
                    className="roulette-regulars-pick"
                    disabled={locked}
                    onClick={() => insert(g)}
                  >
                    <span className="roulette-regulars-name">{g.name}</span>{' '}
                    <span className="roulette-regulars-count">{regularPickText(g.members.length)}</span>
                  </button>
                  <button
                    type="button"
                    id={editId(g.id)}
                    className="ui-button ui-button--secondary ui-button--sm"
                    aria-label={regularEditLabel(g.name)}
                    onClick={() => openForm({ id: g.id, name: g.name, text: g.members.join('\n'), opener: editId(g.id) })}
                  >
                    {REGULARS_EDIT_BUTTON}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
      <p className="roulette-regulars-notice ui-note" role="status">
        {notice}
      </p>
      {mode.kind === 'list' ? (
        <div className="roulette-regulars-tools">
          <button
            type="button"
            id={NEW_ID}
            className="ui-button ui-button--secondary ui-button--sm"
            onClick={() => openForm({ id: null, name: '', text: '', opener: NEW_ID })}
          >
            {REGULARS_NEW_BUTTON}
          </button>
          {guestNames.length > 0 && (
            <button
              type="button"
              id={FROM_GUESTS_ID}
              className="ui-button ui-button--secondary ui-button--sm"
              onClick={() => openForm({ id: null, name: '', text: guestNames.join('\n'), opener: FROM_GUESTS_ID })}
            >
              {REGULARS_FROM_GUESTS_BUTTON}
            </button>
          )}
        </div>
      ) : mode.confirming && editing !== undefined ? (
        <div className="roulette-regulars-confirm">
          <p>{regularDeleteConfirmText(editing.name)}</p>
          <div className="roulette-regulars-actions">
            <button
              type="button"
              id={CONFIRM_CANCEL_ID}
              className="ui-button ui-button--secondary ui-button--sm"
              onClick={() => {
                setMode({ ...mode, confirming: false });
                setFocusId(DELETE_ID);
              }}
            >
              {REGULARS_CANCEL_BUTTON}
            </button>
            <button type="button" className="ui-button ui-button--danger ui-button--sm" onClick={doDelete}>
              {REGULARS_DELETE_CONFIRM_BUTTON}
            </button>
          </div>
        </div>
      ) : (
        <form className="roulette-regulars-form" aria-labelledby={formTitleId} onSubmit={submit} noValidate>
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
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="roulette-regulars-field">
            <div className="roulette-regulars-label-row">
              <label htmlFor="roulette-regulars-members">{REGULARS_MEMBERS_LABEL}</label>
              <span id={countId} className="roulette-regulars-count">
                {regularsCountText(parseMemberLines(text).length)}
              </span>
            </div>
            <textarea
              id="roulette-regulars-members"
              className="ui-input"
              rows={6}
              value={text}
              aria-invalid={error !== '' ? true : undefined}
              aria-describedby={error !== '' ? `${countId} ${errorId}` : countId}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          {error !== '' && (
            <p id={errorId} className="ui-note ui-note--error" role="alert">
              {error}
            </p>
          )}
          <div className="roulette-regulars-actions">
            <button
              type="button"
              className="ui-button ui-button--secondary ui-button--sm"
              onClick={() => closeForm(mode.opener)}
            >
              {REGULARS_CANCEL_BUTTON}
            </button>
            <button type="submit" className="ui-button ui-button--secondary ui-button--sm">
              {REGULARS_SAVE_BUTTON}
            </button>
          </div>
          {editing !== undefined && (
            <div className="roulette-regulars-danger">
              <button
                type="button"
                id={DELETE_ID}
                className="ui-button ui-button--danger ui-button--sm"
                onClick={() => {
                  setMode({ ...mode, confirming: true });
                  setFocusId(CONFIRM_CANCEL_ID);
                }}
              >
                {REGULARS_DELETE_BUTTON}
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}
