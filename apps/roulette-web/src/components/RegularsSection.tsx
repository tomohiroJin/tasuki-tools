import { useEffect, useId, useMemo, useReducer, useState, type FormEvent } from 'react';
import {
  REGULARS_CANCEL_BUTTON,
  REGULARS_DELETE_CONFIRM_BUTTON,
  REGULARS_EDIT_BUTTON,
  REGULARS_EMPTY,
  REGULARS_FROM_PEOPLE_BUTTON,
  REGULARS_HEADING,
  REGULARS_NEW_BUTTON,
  REGULARS_SAVED_TEXT,
  REGULARS_WHERE,
  regularDeleteConfirmText,
  regularDeletedText,
  regularEditLabel,
  regularPickText,
} from '../copy';
import { useRegulars } from '../hooks/use-regulars';
import { INITIAL_FORM, REASON_TEXT, countFieldOf, formReducer, validate, type ErrorField } from '../regulars-form';
import { candidatesOf, splitForEdit, type Candidate } from '../regulars-view';
import type { PersonRow } from '../roulette-view';
import type { RegularGroup } from '../storage/regulars';
import { DELETE_ID, RegularsForm } from './RegularsForm';

interface Props {
  /** 切断中・回転中。札（入れる）だけ止める。作る・直す・消すは端末の中だけなので止めない */
  locked: boolean;
  /** いまの人の行（名簿＋ゲスト）。候補にして欄を開く（#469 D1）。欄のチェックは「組に入れるか」で、開いたときの初期値がいまルーレットに入っているか */
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
const pickId = (id: string): string => `roulette-regulars-pick-${id}`;
const editId = (id: string): string => `roulette-regulars-edit-${id}`;

/**
 * 脇の「ルーレットに入る人」の面の末尾。端末にだけある名前の組を作る・一手で入れる・直す・消す（画面案 §1・§2）。
 * フォーカスは id で追う（並びが変わっても、消えても、行き先を見失わない）。
 * 欄の入力と検証は `regulars-form.ts`、欄の描画は `RegularsForm.tsx`。
 */
export function RegularsSection({ locked, people, onInsert }: Props) {
  const { groups, save, remove, touch } = useRegulars();
  const headingId = useId();
  const candidates = useMemo(() => candidatesOf(people), [people]);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [form, dispatch] = useReducer(formReducer, INITIAL_FORM);
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
    dispatch({ type: 'clear-error' });
    setFocusId(NEW_ID);
  }, [groups, mode]);

  const announce = (message: string): void => {
    setNotice('');
    setPendingNotice(message);
  };

  const fail = (message: string, field: ErrorField): void => {
    dispatch({ type: 'fail', message, field });
  };

  /** 保存・削除の後の行き先。回転中・切断中は札が止まっているので、その組の「直す」へ移す */
  const rowTarget = (id: string): string => (locked ? editId(id) : pickId(id));

  const openForm = (init: { id: string | null; name: string; text: string; rows: readonly Candidate[]; opener: string }): void => {
    dispatch({ type: 'open', name: init.name, text: init.text, rows: init.rows });
    setNotice('');
    setMode({ kind: 'form', id: init.id, opener: init.opener, confirming: false });
    setFocusId('roulette-regulars-name');
  };
  const closeForm = (to: string | null): void => {
    setMode({ kind: 'list' });
    dispatch({ type: 'clear-error' });
    setFocusId(to);
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (mode.kind !== 'form') return;
    const { name, text, checkRows } = form;
    const checkedNames = checkRows.filter((r) => r.checked).map((r) => r.name);
    const savedMembers = mode.id === null ? [] : (groups.find((g) => g.id === mode.id)?.members ?? []);
    const checked = validate(name, savedMembers, checkedNames, text, checkRows.length > 0);
    if ('error' in checked) {
      fail(checked.error, checked.field);
      return;
    }
    const result = save({ ...(mode.id === null ? {} : { id: mode.id }), name, members: checked.members });
    if (!result.ok) {
      fail(REASON_TEXT[result.reason], result.reason === 'name-taken' ? 'name' : countFieldOf(checkRows.length > 0, checkedNames, text));
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

  const editing = mode.kind === 'form' && mode.id !== null ? groups.find((g) => g.id === mode.id) : undefined;

  return (
    <section className="roulette-regulars ui-stack" aria-labelledby={headingId}>
      <div className="roulette-regulars-head ui-section-head">
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
                    onClick={() => openForm({ id: g.id, name: g.name, ...splitForEdit(candidates, g.members), opener: editId(g.id) })}
                  >
                    {REGULARS_EDIT_BUTTON}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
      {/* 知らせは常に置く（ライブリージョンを木に残す）。空のあいだだけ部品 `ui-visually-hidden` を足し、流れから外して親（`.ui-stack`）の gap を取らせない。
          `display: none`・`visibility: hidden`・`hidden`・`aria-hidden` にしない（読み上げの木から外れ、あとから入る知らせが届かない） */}
      <p className={`roulette-regulars-notice ui-note${notice === '' ? ' ui-visually-hidden' : ''}`} role="status">
        {notice}
      </p>
      {mode.kind === 'list' ? (
        <div className="roulette-regulars-tools">
          <button
            type="button"
            id={NEW_ID}
            className="ui-button ui-button--secondary ui-button--sm"
            onClick={() => openForm({ id: null, name: '', text: '', rows: candidates.map((c) => ({ name: c.name, checked: false })), opener: NEW_ID })}
          >
            {REGULARS_NEW_BUTTON}
          </button>
          {candidates.length > 1 && (
            <button
              type="button"
              id={FROM_PEOPLE_ID}
              className="ui-button ui-button--secondary ui-button--sm"
              onClick={() => openForm({ id: null, name: '', text: '', rows: candidates, opener: FROM_PEOPLE_ID })}
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
        <RegularsForm
          form={form}
          dispatch={dispatch}
          editing={editing}
          onSubmit={submit}
          onCancel={() => closeForm(mode.opener)}
          onAskDelete={() => {
            setMode({ ...mode, confirming: true });
            setFocusId(CONFIRM_CANCEL_ID);
          }}
        />
      )}
    </section>
  );
}
