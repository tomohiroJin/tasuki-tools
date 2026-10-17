/**
 * 舞台（操作の面・spec §6.7）。お題の添え書き → 円盤 → 札 → 一言と回す。
 * 並び（縦積み / 横並び）は舞台の幅で決め、指し針の位置も同じ値から決まる。
 * **止まったかは画面の局面（`phase`）で決める**（札・当たりの席・結果の一言・一覧が同じ瞬間に切り替わる）。
 * 2 人以上を選ぶとき（#401）は、**何人目まで決まったか（`revealed`）** で真鍮の席と札の行が 1 人ずつ増える。
 * 札の種類（`data-pick`）は回転の人数（回したことが無ければ選ぶ人数）で決め、回っている間は変わらない。
 */
import { useRef, useState } from 'react';
import type { Entry, RouletteView } from '@tasuki/roulette-core';
import { STAGE_HEADING } from '../copy';
import { useStageLayout } from '../hooks/use-stage-layout';
import { useWheelRotation } from '../hooks/use-wheel-rotation';
import type { OrderStage, People, Phase } from '../roulette-view';
import { cardPickCountOf, revealedPicksOf, topicNoteOf } from '../roulette-view';
import { wheelSeatsOf } from '../wheel-view';
import { pointerDegFor } from '../wheel-motion';
import { pressAngleOf } from '../press-view';
import { GroupCard } from './GroupCard';
import { ResultCard } from './ResultCard';
import { SpinControls } from './SpinControls';
import { Wheel } from './Wheel';

interface Props {
  /** いまの入る人（`poolOfView`。画面が 1 回だけ組む） */
  pool: readonly Entry[];
  view: RouletteView;
  /** 画面の局面（`phaseOf`） */
  phase: Phase;
  /** 何人目まで決まったか（`revealedCountOf`・#401） */
  revealed: number;
  receivedAt: number;
  reducedMotion: boolean;
  people: People;
  topicTitle: string | null;
  caption: string;
  button: { label: string; disabled: boolean };
  onSpin: () => void;
  /** 順番に回すときの舞台（`orderStageOf`・#401 順番に回す）。1 回で決めるときは null */
  order: OrderStage | null;
  /** 押して止めるときの位置（席の単位・`usePressMotion`）。押して止めるとき以外は null */
  pressPosition?: number | null;
  /** 一言の読み上げにだけ足す文（押して止めるときの決まった人） */
  captionHidden?: string;
}

export function Stage({ pool, view, phase, revealed, receivedAt, reducedMotion, people, topicTitle, caption, button, onSpin, order, pressPosition = null, captionHidden = '' }: Props) {
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);

  // 回っている間は並びを変えない（指し針の位置が変わると当たりの席がずれる）
  const settled = phase === 'settled';
  const layout = useStageLayout(stage, phase === 'spinning');
  const pointerDeg = pointerDegFor(layout);
  // 押して止めるときは、位置（全画面で同じ）をこの画面の指し針から見た角度にする。いつもの回転は使わない
  const pressing = pressPosition !== null;
  const rotation = useWheelRotation({ spin: pressing ? null : view.spin, receivedAt, settled, reducedMotion, pointerDeg, card, dock });
  const angle = pressing ? pressAngleOf(pressPosition, view.spin?.wheel.length ?? 0, pointerDeg) : rotation.angle;

  const seats = order?.seats ?? wheelSeatsOf({ pool, spin: view.spin, revealed });
  const drawnIds = new Set(people.rows.filter((r) => r.mark === 'drawn').map((r) => r.id));
  const picked = revealedPicksOf(view, revealed);
  // 順番に回す・押して止めるときは 1 回に 1 人（選ぶ人数を使わない。押して止める回転は止まるまで picks が空）
  const cardK = order === null && !pressing ? cardPickCountOf(view) : 1;
  const group = cardK >= 2;

  return (
    <section
      ref={setStage}
      className="ui-workspace-main roulette-stage"
      data-layout={layout}
      data-pick={group ? 'group' : 'single'}
      aria-labelledby="roulette-stage-heading"
    >
      <h2 id="roulette-stage-heading" className="ui-visually-hidden">
        {STAGE_HEADING}
      </h2>
      {topicTitle !== null && <p className="roulette-topic">{topicNoteOf(topicTitle, cardK)}</p>}
      <Wheel
        entries={seats.entries}
        winners={seats.winners}
        drawnIds={drawnIds}
        angle={angle}
        pointerDeg={pointerDeg}
        spinning={pressing ? phase === 'spinning' : rotation.spinning}
        reducedMotion={reducedMotion}
        hubCount={order?.hubCount}
      />
      {order !== null ? (
        <ResultCard ref={card} label={order.card.label} name={order.card.name} revealed={order.card.revealed} />
      ) : group ? (
        <GroupCard ref={card} k={cardK} names={picked.map((e) => e.name)} revealed={picked.length > 0} />
      ) : (
        <ResultCard ref={card} name={settled ? (picked[0]?.name ?? null) : null} revealed={settled && picked.length > 0} />
      )}
      <div className="roulette-after">
        {/* 読み上げは role="status"。回している間は当たりの名前を入れない（止まってから入れる） */}
        {/* 順番に回すときは 1 行で … に切る（押すたびに文が変わり、折り返すと円盤が上下に動く。全文は読み上げが持つ） */}
        <p className={`roulette-caption${order === null && !pressing ? '' : ' roulette-caption--order'}`} role="status">
          {caption}
          {captionHidden !== '' && <span className="ui-visually-hidden">{captionHidden}</span>}
        </p>
        <SpinControls ref={dock} label={button.label} disabled={button.disabled} onSpin={onSpin} />
      </div>
    </section>
  );
}
