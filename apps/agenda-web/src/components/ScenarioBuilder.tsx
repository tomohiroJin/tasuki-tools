import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { MAX_ROUNDS, MAX_SCENARIO_TITLE, MIN_ROUNDS, type AgendaView, type ScenarioInput } from '@tasuki/agenda-core';
import {
  ADD_STEP_BUTTON,
  BACK_TO_ROOM_SCENARIO_BUTTON,
  DEFAULT_ERROR_TEXT,
  LOAD_FIRST_TEXT,
  LOAD_TO_ROOM_BUTTON,
  MAX_PLANNED_NOTE,
  MAX_STEPS_NOTE,
  perRoundSummaryParts,
  ROUNDS_LABEL,
  ROUNDS_UNIT,
  roundsMinusLabel,
  roundsPlusLabel,
  SAMPLE_REPEAT_LABEL,
  SCENARIO_CHANGED_NOTE,
  SCENARIO_TITLE_LABEL,
  START_BUTTON,
  plannedSummary,
} from '../copy';
import { usePrefersReducedMotion } from '@tasuki/web-kit/room';
import { useScenarioDraft } from '../hooks/use-scenario-draft';
import { isUntouchedCopy } from '../scenario-draft-sync';
import { useWallClock } from '../hooks/use-wall-clock';
import { focusAfterAdd, focusAfterMove, focusAfterRemove, type FocusRequest } from '../step-focus';
import {
  addStep,
  bumpRounds,
  addBlockedByItems,
  canAddStep,
  changeSampleRepeats,
  checkDraft,
  clipTitle,
  draftFromInput,
  inputFromView,
  isEmptyDraft,
  maxSampleRepeats,
  roundsInRange,
  moveStep,
  perRoundMinutes,
  previewView,
  removeStep,
  roundsOfDraft,
  scenarioKey,
  totalMinutes,
  updateStep,
  type DraftCheck,
} from '../scenario-draft';
import { Dial } from './Dial';
import { SavedScenarioList } from './SavedScenarioList';
import { SampleMenu } from './SampleMenu';
import { StepEditorRow } from './StepEditorRow';

interface Props {
  /** ルームの開始前の状態 */
  view: AgendaView;
  /** 参加済みで操作を送れるか（切断中に押した操作は入り直しより先に届いて弾かれる） */
  canOperate: boolean;
  onLoad: (scenario: ScenarioInput) => void;
  onStart: () => void;
}

/** 主の操作を押せない理由（押せるなら空）。読み上げに届くよう、常設の status に入れる */
function actionReason(check: DraftCheck, hasSteps: boolean, sameAsRoom: boolean): { text: string; isError: boolean } {
  if (!check.ok) return { text: hasSteps ? check.reason : '', isError: true };
  if (!sameAsRoom) return { text: LOAD_FIRST_TEXT, isError: false };
  return { text: '', isError: false };
}

/**
 * 組む画面（#429 spec §4.2・§7.5）。左に行の一覧、右にプレビューの盤と主の操作。狭い幅では
 * 行 → サンプルの開閉 → 盤と操作 → 保存 の順に積む（DOM の順）。
 */
export function ScenarioBuilder({ view, canOperate, onLoad, onStart }: Props) {
  const room = inputFromView(view);
  const { draft, changed, roomKey, setDraft, adoptRoom, markSent } = useScenarioDraft(room);
  const wallNow = useWallClock();
  const reducedMotion = usePrefersReducedMotion();
  const reasonId = useId();
  const titleId = useId();
  const sampleRepeatId = useId();
  const roundsId = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null);

  useEffect(() => {
    if (focusRequest !== 'add') return;
    addRef.current?.focus();
    setFocusRequest(null);
  }, [focusRequest]);

  const check = checkDraft(draft, DEFAULT_ERROR_TEXT);
  const sameAsRoom = check.ok && scenarioKey(check.input) === roomKey;
  const roomReady = view.steps.length > 0;
  const canLoad = canOperate && check.ok && !sameAsRoom;
  const canStart = canOperate && roomReady && sameAsRoom;
  const draftIsEmpty = isEmptyDraft(draft);
  // ルームのシナリオの写しのままの下書き（ルームが空なら写しではない）。消えても取り戻せるので確かめない
  const draftIsRoom = roomReady && isUntouchedCopy(draft, roomKey);
  const preview = previewView(draft);
  const reason = actionReason(check, draft.steps.length > 0, sameAsRoom);
  const roundsNow = roundsOfDraft(draft);
  const describedBy = reason.text === '' ? undefined : reasonId;

  const remove = (i: number): void => {
    setDraft(removeStep(draft, i));
    setFocusRequest(focusAfterRemove(draft, i));
  };
  const move = (i: number, delta: -1 | 1): void => {
    const request = focusAfterMove(draft, i, delta);
    if (request === null) return;
    setDraft(moveStep(draft, i, delta));
    setFocusRequest(request);
  };
  const add = (): void => {
    const next = addStep(draft);
    setDraft(next);
    const request = focusAfterAdd(draft, next);
    if (request !== null) setFocusRequest(request);
  };

  return (
    <div className="ui-workspace ui-workspace--side-end builder">
      <div className="ui-workspace-main builder-main">
        <div className={changed ? 'builder-changed' : 'builder-changed builder-changed--idle'}>
          {/* ライブリージョンは常に置き、文だけを差し替える（入れた瞬間の領域は読み上げられないことがある）。
              ボタンは領域の外（読み上げに操作の名前を混ぜない） */}
          <p role="status" className="builder-changed-text ui-note">
            {changed ? SCENARIO_CHANGED_NOTE : ''}
          </p>
          {changed && (
            <button type="button" className="ui-button ui-button--quiet ui-button--sm" onClick={adoptRoom}>
              {BACK_TO_ROOM_SCENARIO_BUTTON}
            </button>
          )}
        </div>
        <section className="ui-panel builder-panel">
          <div className="builder-title">
            <label htmlFor={titleId}>{SCENARIO_TITLE_LABEL}</label>
            <input
              id={titleId}
              className="ui-input builder-title-input"
              autoComplete="off"
              maxLength={MAX_SCENARIO_TITLE}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: clipTitle(event.target.value) })}
            />
          </div>
          {draft.sampleRepeat !== undefined && (
            <div className="builder-rounds">
              <label htmlFor={sampleRepeatId}>{SAMPLE_REPEAT_LABEL}</label>
              <div className="builder-minutes">
                <select
                  id={sampleRepeatId}
                  className="ui-select builder-minutes-input"
                  value={draft.sampleRepeat.count}
                  onChange={(event) => setDraft(changeSampleRepeats(draft, Number(event.target.value)))}
                >
                  {Array.from({ length: maxSampleRepeats(draft, draft.sampleRepeat) }, (_, index) => (
                    <option key={index + 1} value={index + 1}>{index + 1}</option>
                  ))}
                </select>
                <span className="builder-minutes-unit" aria-hidden="true">{ROUNDS_UNIT}</span>
              </div>
            </div>
          )}
          {draft.steps.length > 0 && (
            <ol className="builder-rows">
              {draft.steps.map((step, i) => (
                <StepEditorRow
                  key={step.key}
                  step={step}
                  number={i + 1}
                  isFirst={i === 0}
                  isLast={i === draft.steps.length - 1}
                  focus={focusRequest !== null && focusRequest !== 'add' && focusRequest.key === step.key ? focusRequest.target : null}
                  onFocused={() => setFocusRequest(null)}
                  onChange={(patch) => setDraft(updateStep(draft, i, patch))}
                  onMove={(delta) => move(i, delta)}
                  onRemove={() => remove(i)}
                />
              ))}
            </ol>
          )}
          <div className="builder-add">
            <button ref={addRef} type="button" className="ui-button ui-button--secondary" disabled={!canAddStep(draft)} onClick={add}>
              {ADD_STEP_BUTTON}
            </button>
            {!canAddStep(draft) && (
              <span className="builder-add-note">{addBlockedByItems(draft) ? MAX_STEPS_NOTE : MAX_PLANNED_NOTE}</span>
            )}
          </div>
          <div className="builder-rounds">
            <label htmlFor={roundsId}>{ROUNDS_LABEL}</label>
            <div className="builder-minutes">
              <button
                type="button"
                className="ui-button ui-button--secondary builder-bump"
                aria-label={roundsMinusLabel}
                disabled={roundsNow !== null && roundsNow <= MIN_ROUNDS}
                onClick={() => setDraft({ ...draft, rounds: bumpRounds(draft, -1) })}
              >
                −
              </button>
              <input
                id={roundsId}
                type="number"
                inputMode="numeric"
                className="ui-input builder-minutes-input"
                min={MIN_ROUNDS}
                max={MAX_ROUNDS}
                step={1}
                value={draft.rounds}
                onChange={(event) => setDraft({ ...draft, rounds: event.target.value })}
              />
              <button
                type="button"
                className="ui-button ui-button--secondary builder-bump"
                aria-label={roundsPlusLabel}
                disabled={roundsNow !== null && roundsNow >= MAX_ROUNDS}
                onClick={() => setDraft({ ...draft, rounds: bumpRounds(draft, 1) })}
              >
                +
              </button>
              <span className="builder-minutes-unit" aria-hidden="true">
                {ROUNDS_UNIT}
              </span>
            </div>
          </div>
        </section>
        {/* 主の欄（会の名前・ステップ・くりかえし）の下に控えめに置く（主役を押しのけない） */}
        <SampleMenu
          draftIsDisposable={draftIsEmpty || draftIsRoom}
          onPick={(sample) => setDraft({ ...draftFromInput(sample), sampleRepeat: sample.repeat })}
        />
      </div>
      <div className="ui-workspace-side builder-side">
        <section className="ui-panel builder-preview">
          <p className="builder-total">
            {roundsNow !== null && roundsInRange(roundsNow) && roundsNow >= 2
              ? perRoundSummaryParts(perRoundMinutes(draft), roundsNow, totalMinutes(draft)).map((part, i) => (
                  <Fragment key={part}>
                    {i > 0 && ' '}
                    <span className="builder-total-chunk">{part}</span>
                  </Fragment>
                ))
              : plannedSummary(perRoundMinutes(draft))}
          </p>
          {preview !== null && <Dial view={preview} wallNow={wallNow} reducedMotion={reducedMotion} />}
          <p id={reasonId} role="status" className={reason.isError ? 'builder-reason ui-note ui-note--error' : 'builder-reason ui-note'}>
            {reason.text}
          </p>
          <div className="builder-actions">
            {/* 主は次にやること 1 つ。下書きがルームと違えば読み込む、同じなら開始 */}
            <button
              type="button"
              className={canStart ? 'ui-button ui-button--secondary' : 'ui-button ui-button--lg'}
              disabled={!canLoad}
              aria-describedby={describedBy}
              onClick={() => {
                if (!check.ok) return;
                markSent(check.input);
                onLoad(check.input);
              }}
            >
              {LOAD_TO_ROOM_BUTTON}
            </button>
            <button
              type="button"
              className={canStart ? 'ui-button ui-button--lg' : 'ui-button ui-button--secondary'}
              disabled={!canStart}
              aria-describedby={describedBy}
              onClick={onStart}
            >
              {START_BUTTON}
            </button>
          </div>
        </section>
        <SavedScenarioList scenario={check.ok ? check.input : null} suggestedName={draft.title} onPick={(s) => setDraft(draftFromInput(s))} />
      </div>
    </div>
  );
}
