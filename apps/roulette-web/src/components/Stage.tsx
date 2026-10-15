/**
 * 舞台（操作の面・spec §6.7）。お題の添え書き → 円盤 → 札 → 一言と回す。
 * 並び（縦積み / 横並び）は舞台の幅で決め、指し針の位置も同じ値から決まる。
 * **止まったかは画面の局面（`phase`）で決める**（札・当たりの席・結果の一言・一覧が同じ瞬間に切り替わる）。
 */
import { useRef, useState } from 'react';
import type { Entry, RouletteView } from '@tasuki/roulette-core';
import { STAGE_HEADING, topicNoteText } from '../copy';
import { useStageLayout } from '../hooks/use-stage-layout';
import { useWheelRotation } from '../hooks/use-wheel-rotation';
import type { People, Phase } from '../roulette-view';
import { winnerOf } from '../roulette-view';
import { wheelSeatsOf } from '../wheel-view';
import { pointerDegFor } from '../wheel-motion';
import { ResultCard } from './ResultCard';
import { SpinControls } from './SpinControls';
import { Wheel } from './Wheel';

interface Props {
  /** いまの入る人（`poolOfView`。画面が 1 回だけ組む） */
  pool: readonly Entry[];
  view: RouletteView;
  /** 画面の局面（`phaseOf`） */
  phase: Phase;
  receivedAt: number;
  reducedMotion: boolean;
  people: People;
  topicTitle: string | null;
  caption: string;
  button: { label: string; disabled: boolean };
  onSpin: () => void;
}

export function Stage({ pool, view, phase, receivedAt, reducedMotion, people, topicTitle, caption, button, onSpin }: Props) {
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);

  // 回っている間は並びを変えない（指し針の位置が変わると当たりの席がずれる）
  const settled = phase === 'settled';
  const layout = useStageLayout(stage, phase === 'spinning');
  const pointerDeg = pointerDegFor(layout);
  const rotation = useWheelRotation({ spin: view.spin, receivedAt, settled, reducedMotion, pointerDeg, card, dock });

  const seats = wheelSeatsOf({ pool, spin: view.spin, settled });
  const drawnIds = new Set(people.rows.filter((r) => r.mark === 'drawn').map((r) => r.id));
  const winner = settled ? winnerOf(view) : null;

  return (
    <section ref={setStage} className="ui-workspace-main roulette-stage" data-layout={layout} aria-labelledby="roulette-stage-heading">
      <h2 id="roulette-stage-heading" className="ui-visually-hidden">
        {STAGE_HEADING}
      </h2>
      {topicTitle !== null && <p className="roulette-topic">{topicNoteText(topicTitle)}</p>}
      <Wheel
        entries={seats.entries}
        winnerIndex={seats.winnerIndex}
        drawnIds={drawnIds}
        angle={rotation.angle}
        pointerDeg={pointerDeg}
        spinning={rotation.spinning}
        reducedMotion={reducedMotion}
      />
      <ResultCard ref={card} name={winner?.name ?? null} revealed={winner !== null} />
      <div className="roulette-after">
        {/* 読み上げは role="status"。回している間は当たりの名前を入れない（止まってから入れる） */}
        <p className="roulette-caption" role="status">
          {caption}
        </p>
        <SpinControls ref={dock} label={button.label} disabled={button.disabled} onSpin={onSpin} />
      </div>
    </section>
  );
}
