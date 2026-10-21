import { useId, useState, type FormEvent } from 'react';
import { MAX_SCENARIO_TITLE, roundsOf, scenarioTotalSec, type ScenarioInput } from '@tasuki/agenda-core';
import {
  REMOVE_BUTTON,
  SAVED_DONE,
  SAVED_HEADING,
  SAVE_FAILED_INVALID,
  SAVE_FAILED_UNREADABLE,
  SAVE_FAILED_WRITE,
  SAVE_LOCAL_BUTTON,
  SAVE_NAME_LABEL,
  savedRemoveLabel,
  scenarioDetail,
} from '../copy';
import { deleteSaved, loadSaved, saveScenario, type SaveResult, type SavedScenario } from '../storage/saved-scenarios';

/** 端末の保存先。プライベートモードなどで localStorage に触るだけで投げる環境がある */
function deviceStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const FAILURE_TEXT: Record<Extract<SaveResult, { ok: false }>['reason'], string> = {
  invalid: SAVE_FAILED_INVALID,
  unreadable: SAVE_FAILED_UNREADABLE,
  'write-failed': SAVE_FAILED_WRITE,
};

type Note = { readonly kind: 'done' | 'error'; readonly text: string } | null;

const minutesOf = (s: ScenarioInput): number => scenarioTotalSec(s) / 60;

interface Props {
  /** 保存する中身（検証を通った下書き。通らなければ null で、保存を押させない） */
  scenario: ScenarioInput | null;
  /** 保存の名前の初めの値（会の名前） */
  suggestedName: string;
  onPick: (scenario: ScenarioInput) => void;
}

/**
 * 「この端末に保存」と保存済みの一覧（#429 spec §4.2 の 6）。行は 名前・ステップ数・合計の分 を 1 行。
 * 選ぶと下書きに読み込む（ルームへは送らない）。
 */
export function SavedScenarioList({ scenario, suggestedName, onPick }: Props) {
  const headingId = useId();
  const nameId = useId();
  const [items, setItems] = useState<SavedScenario[]>(() => {
    const storage = deviceStorage();
    return storage === null ? [] : loadSaved(storage);
  });
  // 名前は打ち直すまで会の名前に付いていく
  const [typedName, setTypedName] = useState<string | null>(null);
  const name = typedName ?? suggestedName;
  const [note, setNote] = useState<Note>(null);

  const apply = (result: SaveResult, doneText: string | null): void => {
    if (result.ok) {
      setItems(result.items);
      setNote(doneText === null ? null : { kind: 'done', text: doneText });
    } else {
      setNote({ kind: 'error', text: FAILURE_TEXT[result.reason] });
    }
  };

  const save = (event: FormEvent): void => {
    event.preventDefault();
    const storage = deviceStorage();
    if (scenario === null) return;
    apply(storage === null ? { ok: false, reason: 'write-failed' } : saveScenario(storage, name, scenario), SAVED_DONE);
  };

  const remove = (target: string): void => {
    const storage = deviceStorage();
    apply(storage === null ? { ok: false, reason: 'write-failed' } : deleteSaved(storage, target), null);
  };

  const sorted = [...items].sort((a, b) => b.savedAt - a.savedAt);
  return (
    <section className="ui-panel builder-saved" aria-labelledby={headingId}>
      <h2 id={headingId}>{SAVED_HEADING}</h2>
      {sorted.length > 0 && (
        <ul className="builder-saved-list" aria-labelledby={headingId}>
          {sorted.map((item) => (
            <li key={item.name} className="builder-saved-row">
              <button type="button" className="builder-saved-pick" onClick={() => onPick(item.scenario)}>
                <span className="builder-saved-name">{item.name}</span>
                <span className="builder-saved-detail">{scenarioDetail(item.scenario.steps.length, minutesOf(item.scenario), roundsOf(item.scenario))}</span>
              </button>
              <button
                type="button"
                className="ui-button ui-button--danger ui-button--sm"
                aria-label={savedRemoveLabel(item.name)}
                onClick={() => remove(item.name)}
              >
                {REMOVE_BUTTON}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="builder-save" onSubmit={save}>
        <label htmlFor={nameId}>{SAVE_NAME_LABEL}</label>
        <div className="builder-save-row">
          <input
            id={nameId}
            className="ui-input"
            autoComplete="off"
            maxLength={MAX_SCENARIO_TITLE}
            value={name}
            onChange={(event) => setTypedName(event.target.value.slice(0, MAX_SCENARIO_TITLE))}
          />
          <button type="submit" className="ui-button ui-button--secondary" disabled={scenario === null || name.trim() === ''}>
            {SAVE_LOCAL_BUTTON}
          </button>
        </div>
      </form>
      {note !== null && (
        <p className={note.kind === 'error' ? 'builder-note ui-note ui-note--error' : 'builder-note ui-note'} role={note.kind === 'error' ? 'alert' : 'status'}>
          {note.text}
        </p>
      )}
    </section>
  );
}
