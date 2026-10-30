import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { MAX_ROUNDS, MAX_SCENARIO_TITLE, MIN_ROUNDS, roundsOf, scenarioTotalSec, type AgendaView, type ScenarioInput } from '@tasuki/agenda-core';
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
  sampleTitle,
  SAMPLE_MENU_BUTTON,
  SAMPLE_REPLACE_CONFIRM,
  SAMPLE_REPLACE_NO,
  SAMPLE_REPLACE_YES,
  SCENARIO_CHANGED_NOTE,
  SCENARIO_TITLE_LABEL,
  START_BUTTON,
  plannedSummary,
  scenarioDetail,
} from '../copy';
import { usePrefersReducedMotion } from '@tasuki/web-kit/room';
import { useWallClock } from '../hooks/use-wall-clock';
import { SAMPLE_SCENARIOS } from '../sample-scenarios';
import {
  addStep,
  bumpRounds,
  addBlockedByItems,
  canAddStep,
  checkDraft,
  clipTitle,
  draftFromInput,
  inputFromDraft,
  inputFromView,
  isEmptyDraft,
  roundsInRange,
  moveStep,
  perRoundMinutes,
  previewView,
  removeStep,
  roundsOfDraft,
  scenarioKey,
  totalMinutes,
  updateStep,
  type Draft,
  type DraftCheck,
} from '../scenario-draft';
import { Dial } from './Dial';
import { SavedScenarioList } from './SavedScenarioList';
import { StepEditorRow, type RowFocusTarget } from './StepEditorRow';

interface DraftState {
  readonly draft: Draft;
  /** 最後に見たルームのシナリオの鍵（他の人の置き換えを見分ける） */
  readonly roomKey: string;
  readonly changed: boolean;
  /** この端末が最後に送ったシナリオの鍵。返ってきた自分の置き換えを「変わりました」と言わない */
  readonly sentKey: string | null;
}

/**
 * 下書きとルームのシナリオの付き合わせ。**ルームが変わっても、手元で変えた下書きは上書きしない**（spec §4.2 の 4）。
 * - 下書きが空か、前のルームのシナリオと同じ（手を付けていない）なら、新しいルームのシナリオを下書きにする
 * - 手元で変えた下書きがあり、新しいルームのシナリオと違うなら、下書きを残して「シナリオが変わりました」
 * - ただし新しいルームのシナリオが自分の送ったもの（読み込んだ後に下書きを触った）なら知らせない
 * - 新しいルームのシナリオが下書きと同じなら、知らせを下ろす
 */
function useScenarioDraft(room: ScenarioInput) {
  const key = scenarioKey(room);
  const [state, setState] = useState<DraftState>(() => ({ draft: draftFromInput(room), roomKey: key, changed: false, sentKey: null }));
  // 描画の途中で前の値と比べて直す（React の「props の変化で state を調整する」型。effect を挟むと 1 枚古い画面が出る）
  let current = state;
  if (state.roomKey !== key) {
    const draftKey = scenarioKey(inputFromDraft(state.draft));
    // 回数の欄を空にした下書きは `rounds` キーを落とし、回数 1 のルームと同じ鍵になる。触った下書きとして扱う
    const untouched = isEmptyDraft(state.draft) || (roundsOfDraft(state.draft) !== null && draftKey === state.roomKey);
    current = untouched
      ? { ...state, draft: draftFromInput(room), roomKey: key, changed: false }
      : { ...state, roomKey: key, changed: key !== state.sentKey && draftKey !== key };
    setState(current);
  }
  const setDraft = (draft: Draft): void =>
    setState((s) => ({ ...s, draft, changed: s.changed && scenarioKey(inputFromDraft(draft)) !== s.roomKey }));
  const adoptRoom = (): void => setState((s) => ({ ...s, draft: draftFromInput(room), changed: false }));
  const markSent = (input: ScenarioInput): void => setState((s) => ({ ...s, sentKey: scenarioKey(input) }));
  return { draft: current.draft, changed: current.changed, setDraft, adoptRoom, markSent };
}

/** 行を消す・動かした後にフォーカスを置く先（押した部品が消える・押せなくなると、フォーカスが文書の先頭へ落ちる） */
type FocusRequest = { readonly key: number; readonly target: RowFocusTarget } | 'add' | null;

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
  const { draft, changed, setDraft, adoptRoom, markSent } = useScenarioDraft(room);
  const wallNow = useWallClock();
  const reducedMotion = usePrefersReducedMotion();
  const reasonId = useId();
  const titleId = useId();
  const roundsId = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null);

  useEffect(() => {
    if (focusRequest !== 'add') return;
    addRef.current?.focus();
    setFocusRequest(null);
  }, [focusRequest]);

  const check = checkDraft(draft, DEFAULT_ERROR_TEXT);
  const sameAsRoom = check.ok && scenarioKey(check.input) === scenarioKey(room);
  const roomReady = view.steps.length > 0;
  const canLoad = canOperate && check.ok && !sameAsRoom;
  const canStart = canOperate && roomReady && sameAsRoom;
  const draftIsEmpty = isEmptyDraft(draft);
  // ルームのシナリオの写しのままの下書き（ルームが空なら写しではない）。消えても取り戻せるので確かめない
  const draftIsRoom = roomReady && roundsOfDraft(draft) !== null && scenarioKey(inputFromDraft(draft)) === scenarioKey(room);
  const preview = previewView(draft);
  const reason = actionReason(check, draft.steps.length > 0, sameAsRoom);
  const roundsNow = roundsOfDraft(draft);
  const describedBy = reason.text === '' ? undefined : reasonId;

  const remove = (i: number): void => {
    // 消した行の次（無ければ前）の名前の欄へ。行が無くなれば「ステップを追加」へ
    const neighbor = draft.steps[i + 1] ?? draft.steps[i - 1];
    setDraft(removeStep(draft, i));
    setFocusRequest(neighbor === undefined ? 'add' : { key: neighbor.key, target: 'name' });
  };
  const move = (i: number, delta: -1 | 1): void => {
    const step = draft.steps[i];
    if (step === undefined) return;
    const to = i + delta;
    // 端に着いて押したボタンが押せなくなったら、同じ行の反対のボタンへ
    const atEdge = delta === -1 ? to === 0 : to === draft.steps.length - 1;
    const pressed: RowFocusTarget = delta === -1 ? 'up' : 'down';
    setDraft(moveStep(draft, i, delta));
    setFocusRequest({ key: step.key, target: atEdge ? (pressed === 'up' ? 'down' : 'up') : pressed });
  };
  const add = (): void => {
    const next = addStep(draft);
    setDraft(next);
    const added = next.steps.at(-1);
    if (added !== undefined && next !== draft) setFocusRequest({ key: added.key, target: 'name' });
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
        <SampleMenu draftIsDisposable={draftIsEmpty || draftIsRoom} onPick={(s) => setDraft(draftFromInput(s))} />
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

/**
 * 「サンプルから選ぶ」（#429 フィードバック F1〜F3）。小さな開閉のボタンで、押したときだけ 3 行の一覧を開く。
 * 下書きに中身があり、ルームのシナリオとも違うときに選んだら、その場で「いまの下書きを消して読み込みますか」と確かめる（「最初から」と同じ作り:
 * 確かめを開いたら安全な側＝やめる にフォーカス、閉じたら開閉のボタンへ返す）。
 */
function SampleMenu({ draftIsDisposable, onPick }: { draftIsDisposable: boolean; onPick: (scenario: ScenarioInput) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ScenarioInput | null>(null);
  const [returnFocus, setReturnFocus] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const focusInConfirmRef = useRef(false);
  const listId = useId();
  const confirmId = useId();

  // 中身のある下書きは黙って消さない（ルームの写しのままなら消えても取り戻せるので確かめない）
  const needsConfirm = !draftIsDisposable;

  useEffect(() => {
    if (pending !== null) noRef.current?.focus();
  }, [pending]);
  // 確かめを出している間に要らなくなったら（下書きがルームと同じになった）閉じる。確かめの要素は同じ描画で消えるので、
  // フォーカスが中にあったかは onFocus / onBlur で持った ref を見る（消えた要素には blur が来ない）。外にあるフォーカスは奪わない
  useEffect(() => {
    if (needsConfirm || pending === null) return;
    if (focusInConfirmRef.current) setReturnFocus(true);
    focusInConfirmRef.current = false;
    setPending(null);
  }, [needsConfirm, pending]);
  useEffect(() => {
    if (pending === null && returnFocus) {
      toggleRef.current?.focus();
      setReturnFocus(false);
    }
  }, [pending, returnFocus]);

  const load = (scenario: ScenarioInput): void => {
    onPick(scenario);
    setPending(null);
    setOpen(false);
    setReturnFocus(true);
  };
  return (
    <div className="builder-sample-menu">
      <button
        ref={toggleRef}
        type="button"
        className="ui-button ui-button--quiet ui-button--sm builder-sample-toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen(!open);
          setPending(null);
        }}
      >
        {SAMPLE_MENU_BUTTON}
      </button>
      <div id={listId}>
        {open && pending === null && (
          <ul className="builder-sample-list">
            {SAMPLE_SCENARIOS.map((sample) => (
              <li key={sample.label}>
                <button
                  type="button"
                  className="builder-sample-row"
                  onClick={() => (needsConfirm ? setPending(sample.scenario) : load(sample.scenario))}
                >
                  <span className="builder-sample-title">{sampleTitle(sample.label)}</span>
                  <span className="builder-sample-detail">
                    {scenarioDetail(sample.scenario.steps.length, scenarioTotalSec(sample.scenario) / 60, roundsOf(sample.scenario))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && pending !== null && needsConfirm && (
          <div
            ref={confirmRef}
            onFocus={() => {
              focusInConfirmRef.current = true;
            }}
            onBlur={(event) => {
              focusInConfirmRef.current = event.relatedTarget instanceof Node && (confirmRef.current?.contains(event.relatedTarget) ?? false);
            }}
            className="builder-sample-confirm"
            role="group"
            aria-labelledby={confirmId}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.stopPropagation();
              setPending(null);
              setReturnFocus(true);
            }}
          >
            <p id={confirmId} className="builder-sample-confirm-text">
              {SAMPLE_REPLACE_CONFIRM}
            </p>
            <div className="builder-sample-confirm-actions">
              <button
                ref={noRef}
                type="button"
                className="ui-button ui-button--secondary ui-button--sm"
                onClick={() => {
                  setPending(null);
                  setReturnFocus(true);
                }}
              >
                {SAMPLE_REPLACE_NO}
              </button>
              <button type="button" className="ui-button ui-button--danger ui-button--sm" onClick={() => load(pending)}>
                {SAMPLE_REPLACE_YES}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
