import { useEffect, useId, useState, type FormEvent } from 'react';
import { MAX_DISPLAY_NAME, rendersAsNothing } from '@tasuki/room-core';
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
  REGULARS_FROM_PEOPLE_BUTTON,
  REGULARS_HEADING,
  REGULARS_MEMBERS_LABEL,
  REGULARS_NAME_LABEL,
  REGULARS_NEW_BUTTON,
  REGULARS_PEOPLE_LEGEND,
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
import { candidatesOf, orderedMembers, splitForEdit, type Candidate } from '../regulars-view';
import type { PersonRow } from '../roulette-view';
import { isValidGroupName, parseMemberLines, type RegularGroup } from '../storage/regulars';

interface Props {
  /** 切断中・回転中。札（入れる）だけ止める。作る・直す・消すは端末の中だけなので止めない */
  locked: boolean;
  /** いまの人の行（名簿＋ゲスト）。欄を開くときだけ候補にする（#469 D1）。チェックは「いまルーレットに入っているか」 */
  people: readonly PersonRow[];
  /** 札を押したとき。組の名前を入れ、知らせの文を返す */
  onInsert: (group: RegularGroup) => string;
}

type Mode =
  | { kind: 'list' }
  /** 作る（id なし）・直す（id あり）。opener は閉じたときにフォーカスを返す先 */
  | { kind: 'form'; id: string | null; opener: string; confirming: boolean };

const NEW_ID = 'roulette-regulars-new';
const FROM_PEOPLE_ID = 'roulette-regulars-from-people';
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

/** エラーの印を付ける欄（名前の欄か、複数行の欄か） */
type ErrorField = 'name' | 'members' | 'people';

/** 入力の検証。保存の関数が黙って落とす名前（長すぎる・見えない）も、ここで見つけて止める */
function validate(name: string, saved: readonly string[], checked: readonly string[], text: string, hasList: boolean): { error: string; field: ErrorField } | { members: string[] } {
  if (name.trim() === '' || rendersAsNothing(name)) return { error: REGULARS_ERROR_NAME_EMPTY, field: 'name' };
  if (!isValidGroupName(name.trim())) return { error: REGULARS_ERROR_BAD_NAME, field: 'name' };
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.some((l) => parseMemberLines(l).length === 0)) return { error: REGULARS_ERROR_BAD_NAME, field: 'members' };
  const members = orderedMembers(saved, checked, text);
  // 人数の誤りは、手入力が一人も足していなければチェックだけが原因（一覧の側）。手入力が足しているなら入力欄の側に寄せる（両方が原因のときは入力欄）
  const countField: ErrorField = hasList && parseMemberLines(text).length === 0 ? 'people' : 'members';
  if (members.length === 0) return { error: REGULARS_ERROR_NO_MEMBERS, field: countField };
  if (members.length > MAX_GUESTS) return { error: REGULARS_ERROR_TOO_MANY_MEMBERS, field: countField };
  return { members };
}

/**
 * 脇の「ルーレットに入る人」の面の末尾。端末にだけある名前の組を作る・一手で入れる・直す・消す（画面案 §1・§2）。
 * フォーカスは id で追う（並びが変わっても、消えても、行き先を見失わない）。
 */
export function RegularsSection({ locked, people, onInsert }: Props) {
  const { groups, save, remove, touch } = useRegulars();
  const headingId = useId();
  const formTitleId = useId();
  const countId = useId();
  const errorId = useId();
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  /** 欄を開いた時点の「いまの人」とチェック。開いている間は人が出入りしても動かさない */
  const [checkRows, setCheckRows] = useState<readonly Candidate[]>([]);
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<ErrorField>('members');
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

  /** 別のタブで編集中の組が消えたら、欄を閉じて一覧へ戻す（「作る」の題に化けない） */
  useEffect(() => {
    if (mode.kind !== 'form' || mode.id === null) return;
    if (groups.some((g) => g.id === mode.id)) return;
    setMode({ kind: 'list' });
    setError('');
    setFocusId(NEW_ID);
  }, [groups, mode]);

  const announce = (message: string): void => {
    setNotice('');
    setPendingNotice(message);
  };

  const fail = (message: string, field: ErrorField): void => {
    setError(message);
    setErrorField(field);
  };

  /** 保存・削除の後の行き先。回転中・切断中は札が止まっているので、その組の「直す」へ移す */
  const rowTarget = (id: string): string => (locked ? editId(id) : pickId(id));

  const openForm = (init: { id: string | null; name: string; text: string; rows: readonly Candidate[]; opener: string }): void => {
    setName(init.name);
    setText(init.text);
    setCheckRows(init.rows);
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
    const checkedNames = checkRows.filter((r) => r.checked).map((r) => r.name);
    const savedMembers = mode.id === null ? [] : (groups.find((g) => g.id === mode.id)?.members ?? []);
    const checked = validate(name, savedMembers, checkedNames, text, checkRows.length > 0);
    if ('error' in checked) {
      fail(checked.error, checked.field);
      return;
    }
    const result = save({ ...(mode.id === null ? {} : { id: mode.id }), name, members: checked.members });
    if (!result.ok) {
      fail(REASON_TEXT[result.reason], result.reason === 'name-taken' ? 'name' : 'members');
      return;
    }
    const saved = result.items.find((g) => g.name === name.trim());
    closeForm(saved === undefined ? NEW_ID : rowTarget(saved.id));
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
      fail(REASON_TEXT[result.reason], 'members');
      setFocusId(DELETE_ID);
      return;
    }
    const next = groups[index + 1] ?? groups[index - 1];
    closeForm(next === undefined ? NEW_ID : rowTarget(next.id));
    announce(regularDeletedText(target.name));
  };

  const insert = (group: RegularGroup): void => {
    const message = onInsert(group);
    touch(group.id);
    announce(message);
    setFocusId(pickId(group.id));
  };

  const nameInvalid = error !== '' && errorField === 'name';
  const membersInvalid = error !== '' && errorField === 'members';
  const peopleInvalid = error !== '' && errorField === 'people';
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
                    onClick={() => openForm({ id: g.id, name: g.name, ...splitForEdit(candidatesOf(people), g.members), opener: editId(g.id) })}
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
            onClick={() => openForm({ id: null, name: '', text: '', rows: candidatesOf(people).map((c) => ({ name: c.name, checked: false })), opener: NEW_ID })}
          >
            {REGULARS_NEW_BUTTON}
          </button>
          {people.length > 0 && (
            <button
              type="button"
              id={FROM_PEOPLE_ID}
              className="ui-button ui-button--secondary ui-button--sm"
              onClick={() => openForm({ id: null, name: '', text: '', rows: candidatesOf(people), opener: FROM_PEOPLE_ID })}
            >
              {REGULARS_FROM_PEOPLE_BUTTON}
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
          {checkRows.length > 0 && (
            <fieldset
              className="roulette-regulars-people"
              aria-invalid={peopleInvalid ? true : undefined}
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
                        onChange={(event) =>
                          setCheckRows(checkRows.map((x, j) => (j === i ? { name: x.name, checked: event.target.checked } : x)))
                        }
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
              onChange={(event) => setText(event.target.value)}
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
