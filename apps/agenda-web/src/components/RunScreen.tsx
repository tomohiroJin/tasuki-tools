/**
 * 進める画面と終了の画面（#429 spec §4.3〜§4.7・§7.5）。進行中・一時停止中・終了を受け持つ。
 *
 * - 手元（375px）: 盤 → 添え書き → 進行表 → 「最初から」。主の操作の帯は画面の下に固定する
 * - 広い幅（64rem〜）: 左に盤と操作の帯、右に進行表
 * - 映す表示に入ると、盤と右の列だけの大きな表示に切り替える（`ProjectionView`）
 * - 終了: 盤（かかった時間と予定より）と一覧（`SummaryTable`）・「最初から」
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { AgendaView, ExtendMinutes } from '@tasuki/agenda-core';
import { extensionLine } from '../agenda-view';
import { FINISHED_LABEL, PROJECT_BUTTON, SPEAK_SUMMARY_BUTTON } from '../copy';
import { Dial } from './Dial';
import { ProjectionView } from './ProjectionView';
import { ResetControl } from './ResetControl';
import { RunControls } from './RunControls';
import { StepList } from './StepList';
import { SummaryTable } from './SummaryTable';

export interface RunActions {
  next(stepId: string): void;
  pause(): void;
  resume(): void;
  extend(stepId: string, minutes: ExtendMinutes): void;
  setSkipped(stepId: string, skipped: boolean): void;
  reset(): void;
}

interface Props {
  /** 手元の時計で進めた盤 */
  view: AgendaView;
  wallNow: Date;
  reducedMotion: boolean;
  striking: boolean;
  canOperate: boolean;
  actions: RunActions;
  soundToggle: ReactNode;
  /** 盤の要約を読み上げの領域へ流す（spec §7.7「要約をいつでも聞ける」） */
  onSpeakSummary: () => void;
  /** 映す表示か（ルームの画面が持つ。映している間は見出しなど裏の部品も描かないため） */
  projecting: boolean;
  onProjectingChange: (projecting: boolean) => void;
  /**
   * 「開始」を押した本人がここへ来たのか（来たなら印を消して true）。最初の描画で 1 度だけ聞く。
   * 位相が変わっただけの他の参加者の画面は動かさない（#455）
   */
  consumeStartArrival: () => boolean;
}

export function RunScreen({ view, wallNow, reducedMotion, striking, canOperate, actions, soundToggle, onSpeakSummary, projecting, onProjectingChange: setProjecting, consumeStartArrival }: Props) {
  const [returnFocus, setReturnFocus] = useState(false);
  const projectRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLParagraphElement>(null);

  // 組む画面は長い会で縦に長く、押した位置のまま来ると盤が画面の外に残る。押した本人だけ、この画面の上端（会の名前の行）へ寄せる。
  // 見出しの要素は進行表の `h2` しか無く、そこへ寄せると盤が上に外れるため、盤の直前の行を使う
  useEffect(() => {
    if (!consumeStartArrival()) return;
    titleRef.current?.focus({ preventScroll: true });
    // 一度で寄せる（`smooth` は動いている間に「次へ」・延長を押すと的が逃げる。E2E の当たりの測りでも重なりと読まれた）
    titleRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
    // 最初の描画の 1 度だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const summaryHeadingId = useId();

  useEffect(() => {
    if (projecting || !returnFocus) return;
    projectRef.current?.focus();
    setReturnFocus(false);
  }, [projecting, returnFocus]);

  if (projecting) {
    return (
      <ProjectionView
        view={view}
        wallNow={wallNow}
        reducedMotion={reducedMotion}
        striking={striking}
        canOperate={canOperate}
        onNext={actions.next}
        onPause={actions.pause}
        onResume={actions.resume}
        onExit={() => {
          setProjecting(false);
          setReturnFocus(true);
        }}
        soundToggle={soundToggle}
      />
    );
  }

  const finished = view.phase === 'finished';
  const note = extensionLine(view);
  return (
    <div className={finished ? 'run run--finished' : 'run'}>
      <div className="run-bar">
        <p ref={titleRef} tabIndex={-1} className="run-title">{view.title}</p>
        <div className="run-bar-actions">
          <button type="button" className="ui-button ui-button--quiet ui-button--sm ui-visually-hidden run-speak" onClick={onSpeakSummary}>
            {SPEAK_SUMMARY_BUTTON}
          </button>
          {soundToggle}
          <button ref={projectRef} type="button" className="ui-button ui-button--secondary ui-button--sm run-project" onClick={() => setProjecting(true)}>
            <span className="run-project-mark" aria-hidden="true" />
            {PROJECT_BUTTON}
          </button>
        </div>
      </div>
      <div className="run-dial">
        <Dial view={view} wallNow={wallNow} reducedMotion={reducedMotion} striking={striking} />
        {note !== '' && <p className="run-extension-note">{note}</p>}
      </div>
      {!finished && (
        <RunControls
          view={view}
          canOperate={canOperate}
          onNext={actions.next}
          onPause={actions.pause}
          onResume={actions.resume}
          onExtend={actions.extend}
        />
      )}
      <div className="run-aside">
        {finished ? (
          <section className="ui-panel run-summary" aria-labelledby={summaryHeadingId}>
            <h2 id={summaryHeadingId} className="run-summary-heading">
              {FINISHED_LABEL}
            </h2>
            <SummaryTable view={view} />
          </section>
        ) : (
          <StepList view={view} canOperate={canOperate} onSetSkipped={actions.setSkipped} />
        )}
        <div className="run-reset">
          <ResetControl canOperate={canOperate} onReset={actions.reset} />
        </div>
      </div>
    </div>
  );
}
