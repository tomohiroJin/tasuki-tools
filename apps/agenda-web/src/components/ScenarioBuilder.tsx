import { useEffect, useId, useState } from 'react';
import { MAX_SCENARIO_TITLE, type AgendaView, type ScenarioInput } from '@tasuki/agenda-core';
import {
  ADD_STEP_BUTTON,
  BACK_TO_ROOM_SCENARIO_BUTTON,
  DEFAULT_ERROR_TEXT,
  LOAD_TO_ROOM_BUTTON,
  MAX_STEPS_NOTE,
  SAMPLE_TITLE,
  SCENARIO_CHANGED_NOTE,
  SCENARIO_TITLE_LABEL,
  START_BUTTON,
  plannedSummary,
  scenarioDetail,
} from '../copy';
import { usePrefersReducedMotion } from '../hooks/use-reduced-motion';
import { SAMPLE_SCENARIOS } from '../sample-scenarios';
import {
  addStep,
  canAddStep,
  checkDraft,
  clipTitle,
  draftFromInput,
  inputFromDraft,
  inputFromView,
  isEmptyDraft,
  moveStep,
  previewView,
  removeStep,
  scenarioKey,
  totalMinutes,
  updateStep,
  type Draft,
} from '../scenario-draft';
import { Dial } from './Dial';
import { SavedScenarioList } from './SavedScenarioList';
import { StepEditorRow } from './StepEditorRow';

/** 終了見込みの時刻は分までしか出さないので、手元の時計は粗く進めれば足りる */
const WALL_TICK_MS = 10_000;

function useWallClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), WALL_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

interface DraftState {
  readonly draft: Draft;
  /** 最後に見たルームのシナリオの鍵（他の人の置き換えを見分ける） */
  readonly roomKey: string;
  readonly changed: boolean;
}

/**
 * 下書きとルームのシナリオの付き合わせ。**ルームが変わっても、手元で変えた下書きは上書きしない**（spec §4.2 の 4）。
 * - 下書きが空か、前のルームのシナリオと同じ（手を付けていない）なら、新しいルームのシナリオを下書きにする
 * - 手元で変えた下書きがあり、新しいルームのシナリオと違うなら、下書きを残して「シナリオが変わりました」
 * - 新しいルームのシナリオが下書きと同じ（自分の読み込みが返った）なら、知らせを下ろす
 */
function useScenarioDraft(room: ScenarioInput) {
  const key = scenarioKey(room);
  const [state, setState] = useState<DraftState>(() => ({ draft: draftFromInput(room), roomKey: key, changed: false }));
  // 描画の途中で前の値と比べて直す（React の「props の変化で state を調整する」型。effect を挟むと 1 枚古い画面が出る）
  let current = state;
  if (state.roomKey !== key) {
    const draftKey = scenarioKey(inputFromDraft(state.draft));
    const untouched = isEmptyDraft(state.draft) || draftKey === state.roomKey;
    current = untouched
      ? { draft: draftFromInput(room), roomKey: key, changed: false }
      : { draft: state.draft, roomKey: key, changed: draftKey !== key };
    setState(current);
  }
  const setDraft = (draft: Draft): void => setState((s) => ({ ...s, draft, changed: s.changed && scenarioKey(inputFromDraft(draft)) !== s.roomKey }));
  const adoptRoom = (): void => setState((s) => ({ ...s, draft: draftFromInput(room), changed: false }));
  return { draft: current.draft, changed: current.changed, setDraft, adoptRoom };
}

interface Props {
  /** ルームの開始前の状態 */
  view: AgendaView;
  /** 参加済みで操作を送れるか（切断中に押した操作は入り直しより先に届いて弾かれる） */
  canOperate: boolean;
  onLoad: (scenario: ScenarioInput) => void;
  onStart: () => void;
}

/**
 * 組む画面（#429 spec §4.2・§7.5）。左に行の一覧、右にプレビューの盤と主の操作。狭い幅では
 * サンプル → 行 → 盤と操作 → 保存 の順に積む（DOM の順）。
 */
export function ScenarioBuilder({ view, canOperate, onLoad, onStart }: Props) {
  const room = inputFromView(view);
  const { draft, changed, setDraft, adoptRoom } = useScenarioDraft(room);
  const wallNow = useWallClock();
  const reducedMotion = usePrefersReducedMotion();
  const reasonId = useId();
  const titleId = useId();

  const check = checkDraft(draft, DEFAULT_ERROR_TEXT);
  const sameAsRoom = check.ok && scenarioKey(check.input) === scenarioKey(room);
  const roomReady = view.steps.length > 0;
  const canLoad = canOperate && check.ok && !sameAsRoom;
  const canStart = canOperate && roomReady && sameAsRoom;
  const showSample = !roomReady && isEmptyDraft(draft);
  const preview = previewView(draft);

  return (
    <div className="ui-workspace ui-workspace--side-end builder">
      <div className="ui-workspace-main builder-main">
        {showSample && <SampleCards onPick={(s) => setDraft(draftFromInput(s))} />}
        {/* ライブリージョンは先に置いておき、中身だけを差し替える（入れた瞬間の領域は読み上げられないことがある） */}
        <div role="status" className="builder-changed-region">
          {changed && (
            <p className="builder-changed ui-note">
              {SCENARIO_CHANGED_NOTE}
              <button type="button" className="ui-button ui-button--quiet ui-button--sm" onClick={adoptRoom}>
                {BACK_TO_ROOM_SCENARIO_BUTTON}
              </button>
            </p>
          )}
        </div>
        <section className="ui-panel builder-panel">
          <div className="builder-title">
            <label htmlFor={titleId}>
              {SCENARIO_TITLE_LABEL}
            </label>
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
                  onChange={(patch) => setDraft(updateStep(draft, i, patch))}
                  onMove={(delta) => setDraft(moveStep(draft, i, delta))}
                  onRemove={() => setDraft(removeStep(draft, i))}
                />
              ))}
            </ol>
          )}
          <div className="builder-add">
            <button type="button" className="ui-button ui-button--secondary" disabled={!canAddStep(draft)} onClick={() => setDraft(addStep(draft))}>
              {ADD_STEP_BUTTON}
            </button>
            {!canAddStep(draft) && <span className="builder-add-note">{MAX_STEPS_NOTE}</span>}
          </div>
        </section>
      </div>
      <div className="ui-workspace-side builder-side">
        <section className="ui-panel builder-preview">
          <p className="builder-total">{plannedSummary(totalMinutes(draft))}</p>
          {preview !== null && <Dial view={preview} wallNow={wallNow} reducedMotion={reducedMotion} />}
          {!check.ok && draft.steps.length > 0 && (
            <p id={reasonId} className="builder-reason ui-note ui-note--error">
              {check.reason}
            </p>
          )}
          <div className="builder-actions">
            {/* 主は次にやること 1 つ。下書きがルームと違えば読み込む、同じなら開始 */}
            <button
              type="button"
              className={canStart ? 'ui-button ui-button--secondary' : 'ui-button ui-button--lg'}
              disabled={!canLoad}
              aria-describedby={!check.ok && draft.steps.length > 0 ? reasonId : undefined}
              onClick={() => {
                if (check.ok) onLoad(check.input);
              }}
            >
              {LOAD_TO_ROOM_BUTTON}
            </button>
            <button type="button" className={canStart ? 'ui-button ui-button--lg' : 'ui-button ui-button--secondary'} disabled={!canStart} onClick={onStart}>
              {START_BUTTON}
            </button>
          </div>
        </section>
        <SavedScenarioList scenario={check.ok ? check.input : null} suggestedName={draft.title} onPick={(s) => setDraft(draftFromInput(s))} />
      </div>
    </div>
  );
}

/** ルームも下書きも空のときの、一番上の大きな札（1 回で下書きに読み込む） */
function SampleCards({ onPick }: { onPick: (scenario: ScenarioInput) => void }) {
  return (
    <div className="builder-samples">
      {SAMPLE_SCENARIOS.map((sample) => {
        const minutes = sample.scenario.steps.reduce((sum, s) => sum + s.durationSec, 0) / 60;
        return (
          <button key={sample.label} type="button" className="builder-sample" onClick={() => onPick(sample.scenario)}>
            <span className="builder-sample-title">{SAMPLE_TITLE}</span>
            <span className="builder-sample-detail">{scenarioDetail(sample.scenario.steps.length, minutes)}</span>
            {/* ステップの名前は出さない（同梱の名前は書体の base 層の外で、最初の画面から拡張の層を引く）。
                長さの割合だけを帯で見せる */}
            <span className="builder-sample-bar" aria-hidden="true">
              {sample.scenario.steps.map((s) => (
                <span key={s.name} className="builder-sample-segment" style={{ flexGrow: s.durationSec }} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
