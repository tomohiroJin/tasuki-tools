/**
 * 懐中時計の盤（#429 spec §7.2〜§7.4・§7.7。モックの案 A「フェルトの盤」）。
 *
 * - **SVG は `aria-hidden`**。中央の文字（HTML を SVG の上に重ねる）も `aria-hidden` にし、同じ情報は
 *   見えない一文（`summaryText`）が持つ。盤の下の一行は見える文として読ませる
 * - 角度・長さは `dial-geometry` からだけ取る。ここでは半径と形だけを決める
 * - 色は CSS のクラスで当てる（生の色を書かない）。グラデーションの `<stop>` も CSS の `stop-color`
 *   （roulette の `Wheel.tsx` と同じ。`scripts/audit-ui-components.mjs` は CSS の生の色を拾う）
 * - **動きを減らす設定でも針は消さない**（timer の `chrono-hand` と違い、針が押し巻きを読む要）。
 *   1 秒ごとの描き替えは手元の時計（`useLocalClock`）が受け持つ
 */
import { useId } from 'react';
import type { AgendaView } from '@tasuki/agenda-core';
import { centerLines, definedStepCount, driftTone, footerParts, roundBadge, summaryText } from '../agenda-view';
import {
  DIAL_CENTER as C,
  arcPath,
  innerSegments,
  lateRimDeg,
  needleDeg,
  outerSegments,
  overrunTrackDeg,
  planLabels,
  polar,
  projectedMarkerDeg,
  smallSecondsDeg,
  type PlanLabel,
} from '../dial-geometry';
import { FOOTER_SEPARATOR, OVERRUN_LABEL, PAUSED_LABEL, TODAY_PLAN_LABEL, roundsShort, stepCountShort } from '../copy';
import { TimeDigits } from './TimeDigits';

interface Props {
  view: AgendaView;
  wallNow: Date;
  reducedMotion: boolean;
  /** 時打ちの瞬間（縁を 1 度光らせる。光らせ方は Task 3.6） */
  striking?: boolean;
  /** 手元（300px 前後）か、映す表示（短い辺の 70vmin 前後）か */
  size?: 'hand' | 'stage';
}

/* 半径（viewBox 400）。外から: 終了見込みの印・オーバーの軌道・縁・目盛り・外の環（予定）・内の環（実際）・中央の台座。
   印（三角は中心から ±7）は軌道（太さ 4.5）の外に置き、オーバー中に軌道の先端と重ならない */
const R_MARKER = 184;
const R_TRACK = 172;
const R_BEZEL = 160;
const R_OUT = 146;
const R_IN = 130;
const R_EXT = R_IN + 8;
/** 外の環の区画の両端を少し空けて、仕切りを見せる */
const GAP = 0.6;
/** 6 時のスモールセコンドの中心 */
const SUB_Y = C + 90;
const SUB_R = 17;
/** 中央の台座。針の軸の内側を覆い、中央の数字と名前の上を針が横切らないようにする（矢じりと月の輪は外に残る） */
const R_PLATE = 72;

const fixed = (n: number): number => Math.round(n * 100) / 100;

function Defs({ id }: { id: string }) {
  return (
    <defs>
      {/* 真鍮: 円錐のグラデーションは SVG に無いので、斜めの線形で照り返しにする（ルーレットと同じ並び） */}
      <linearGradient id={`${id}-brass`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" className="dial-stop--brass-lift" />
        <stop offset="0.35" className="dial-stop--brass" />
        <stop offset="0.7" className="dial-stop--brass-deep" />
        <stop offset="1" className="dial-stop--brass-bright" />
      </linearGradient>
      {/* 文字盤: フェルトの地に周辺減光 */}
      <radialGradient id={`${id}-face`} cx="0.5" cy="0.42" r="0.6">
        <stop offset="0" className="dial-stop--face-in" />
        <stop offset="0.75" className="dial-stop--face-mid" />
        <stop offset="1" className="dial-stop--face-out" />
      </radialGradient>
      {/* 中央の台座: 文字盤の中心と同じフェルトから、縁でわずかに沈む */}
      <radialGradient id={`${id}-plate`} cx="0.5" cy="0.45" r="0.55">
        <stop offset="0" className="dial-stop--plate-in" />
        <stop offset="1" className="dial-stop--plate-out" />
      </radialGradient>
      {/* 飛ばした区画の斜線 */}
      <pattern id={`${id}-hatch`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line className="dial-hatch-line" x1="0" y1="0" x2="0" y2="5" />
      </pattern>
    </defs>
  );
}

/** 12 時の竜頭と弓（予定の終わり。動かない） */
function Crown({ brass }: { brass: string }) {
  return (
    <g className="dial-crown">
      <path className="dial-bow" d="M185 20 Q200 6 215 20" stroke={brass} />
      <rect x="191" y="20" width="18" height="16" rx="3" fill={brass} />
      {[0, 1, 2, 3].map((i) => (
        <line key={i} className="dial-crown-knurl" x1={194 + i * 4} y1="22" x2={194 + i * 4} y2="34" />
      ))}
    </g>
  );
}

/** 分の目盛り（60 本・5 本ごとに長く） */
function MinuteTicks() {
  return (
    <g>
      {Array.from({ length: 60 }, (_, i) => {
        const long = i % 5 === 0;
        const [x0, y0] = polar(R_BEZEL - 3, i * 6);
        const [x1, y1] = polar(R_BEZEL - (long ? 10 : 6), i * 6);
        return (
          <line key={i} className={long ? 'dial-tick dial-tick--long' : 'dial-tick'} x1={fixed(x0)} y1={fixed(y0)} x2={fixed(x1)} y2={fixed(y1)} />
        );
      })}
    </g>
  );
}

function PlanNumber({ label }: { label: PlanLabel }) {
  const [nx, ny] = polar(R_OUT - 17, label.deg);
  const skipped = label.skipped ? '--skipped' : '';
  return (
    <text className={`dial-plan-number dial-plan-number${skipped}`} x={fixed(nx)} y={fixed(ny)}>
      {label.text}
    </text>
  );
}

/**
 * 外の環（予定）。仕切り・札・飛ばした区画の斜線。
 * 回数 1 は区画ごとの番号を区画の中に置き（第 1 段と同じ DOM）、回数 2 以上は回の札を環の後ろにまとめて置く
 */
function PlanRing({ view, hatch }: { view: AgendaView; hatch: string }) {
  const labels = planLabels(view);
  const labelByKey = new Map(labels.map((l) => [l.key, l]));
  const perSegment = view.rounds < 2;
  return (
    <g>
      {outerSegments(view).map((seg) => {
        const [sx0, sy0] = polar(R_OUT - 7, seg.startDeg);
        const [sx1, sy1] = polar(R_OUT + 7, seg.startDeg);
        const label = perSegment ? labelByKey.get(seg.id) : undefined;
        return (
          <g key={seg.id}>
            <path
              className={seg.skipped ? 'dial-plan dial-plan--skipped' : 'dial-plan'}
              d={arcPath(R_OUT, seg.startDeg + GAP, seg.endDeg - GAP)}
              // 斜線は style で当てる（属性は詳細度 0 で、CSS の `.dial-plan` の stroke に負ける）
              style={seg.skipped ? { stroke: hatch } : undefined}
            />
            <line className="dial-plan-divider" x1={fixed(sx0)} y1={fixed(sy0)} x2={fixed(sx1)} y2={fixed(sy1)} />
            {label !== undefined && <PlanNumber label={label} />}
          </g>
        );
      })}
      {!perSegment && labels.map((label) => <PlanNumber key={label.key} label={label} />)}
    </g>
  );
}

/** 内の環（実際）と延長の足し */
function ActualRing({ view }: { view: AgendaView }) {
  return (
    <g>
      {innerSegments(view).map((seg) => (
        <g key={seg.id}>
          {seg.endDeg > seg.startDeg && (
            <path
              className={seg.current ? 'dial-actual dial-actual--current' : 'dial-actual'}
              d={arcPath(R_IN, seg.startDeg + (seg.current ? 0 : GAP / 2), seg.endDeg - (seg.current ? 0 : GAP / 2))}
            />
          )}
          {seg.extensionStartDeg !== null && seg.extensionEndDeg !== null && seg.extensionEndDeg > seg.extensionStartDeg && (
            <path className="dial-extension" d={arcPath(R_EXT, seg.extensionStartDeg, seg.extensionEndDeg)} />
          )}
        </g>
      ))}
    </g>
  );
}

/** 終了見込みの印の形（盤の縁の三角。盤の下の一行・映す表示の見出しの小さな印も同じ形） */
const MARKER_PATH = 'M0 7 L-6 -5 L6 -5 Z';

/** 終了見込みの小さな印（盤の縁の三角と同じ形・同じ色の段）。字に添える飾りなので読み上げから外す */
export function ProjectedEndMark({ view }: { view: AgendaView }) {
  return (
    <svg className="dial-end-mark" viewBox="-8 -7 16 16" aria-hidden="true" focusable="false">
      <path className={`dial-marker dial-marker--${driftTone(view)} dial-marker--small`} d={MARKER_PATH} />
    </svg>
  );
}

/** 終了見込みの印（縁の三角）と、押しているときの 12 時から印までの縁 */
function Projection({ view }: { view: AgendaView }) {
  const deg = projectedMarkerDeg(view);
  const rim = lateRimDeg(view);
  const tone = driftTone(view);
  const [tx, ty] = polar(R_MARKER, deg);
  return (
    <g>
      {tone === 'late' && rim > 0 && <path className="dial-late-rim" d={arcPath(R_BEZEL + 3, 0, rim)} />}
      <g transform={`translate(${fixed(tx)} ${fixed(ty)}) rotate(${fixed(deg)})`}>
        <path className={`dial-marker dial-marker--${tone}`} d={MARKER_PATH} />
      </g>
    </g>
  );
}

/** 6 時のスモールセコンド（計時が動いているか。一時停止中は止まる） */
function SmallSeconds({ view, brass }: { view: AgendaView; brass: string }) {
  return (
    <g>
      <circle className="dial-sub" cx={C} cy={SUB_Y} r={SUB_R} />
      <g transform={`rotate(${fixed(smallSecondsDeg(view))} ${C} ${SUB_Y})`}>
        <line className="dial-sub-hand" x1={C} y1={SUB_Y + 3} x2={C} y2={SUB_Y - 13} />
      </g>
      <circle cx={C} cy={SUB_Y} r="2" fill={brass} />
    </g>
  );
}

/**
 * 針（ブレゲ針: 細い軸・月の輪・矢じり）。実時間の経過 ＝ 内の環の先端。
 * 軸は中心から描くが、内側は中央の台座が覆う（台座は針の後に描く）。見えるのは台座の縁から外の半分
 */
function Needle({ view }: { view: AgendaView }) {
  const tip = C - R_IN;
  return (
    <g className="dial-needle" transform={`rotate(${needleDeg(view)} ${C} ${C})`}>
      <line className="dial-needle-shaft" x1={C} y1={C} x2={C} y2={tip + 22} />
      <circle className="dial-needle-moon" cx={C} cy={tip + 34} r="6" />
      <path className="dial-needle-tip" d={`M${C - 3} ${tip + 22} L${C} ${tip + 8} L${C + 3} ${tip + 22} Z`} />
    </g>
  );
}

/** 中央の台座。真鍮の細い縁で、針の軸受けの代わりに中心を示す */
function Plate({ id, overrun }: { id: string; overrun: boolean }) {
  return (
    <g>
      <circle className="dial-plate" cx={C} cy={C} r={R_PLATE} fill={`url(#${id}-plate)`} />
      {overrun && <circle className="dial-overrun-tint dial-plate-tint" cx={C} cy={C} r={R_PLATE} />}
    </g>
  );
}

function Readout({ view }: { view: AgendaView }) {
  const lines = centerLines(view);
  const paused = view.phase === 'paused';
  const round = roundBadge(view);
  return (
    <div className="dial-face" aria-hidden="true">
      <div className="dial-readout">
        {(lines.isOverrun || paused || round !== '') && (
          <div className="dial-tags">
            {round !== '' && <span className="dial-tag dial-tag--round">{round}</span>}
            {lines.isOverrun && <span className="dial-tag dial-tag--overrun">{OVERRUN_LABEL}</span>}
            {paused && <span className="dial-tag dial-tag--paused">{PAUSED_LABEL}</span>}
          </div>
        )}
        <div className="dial-name">
          {/* 開始前は「今日の進行」と「n ステップ」を折り返さない塊にし、間の空白でだけ折る（小さな盤で「ステッ／プ」と割れない） */}
          {view.phase === 'idle' ? (
            <>
              <span className="dial-name-chunk">{TODAY_PLAN_LABEL}</span>{' '}
              <span className="dial-name-chunk">{stepCountShort(definedStepCount(view))}</span>
              {view.rounds >= 2 && (
                <>
                  {' '}
                  <span className="dial-name-chunk">{roundsShort(view.rounds)}</span>
                </>
              )}
            </>
          ) : (
            lines.name
          )}
        </div>
        <div className="dial-time">
          <TimeDigits text={lines.primary} />
        </div>
        <div className={`dial-drift is-${driftTone(view)}`}>{lines.drift}</div>
      </div>
    </div>
  );
}

export function Dial({ view, wallNow, reducedMotion, striking = false, size = 'hand' }: Props) {
  // 同じ画面に盤が 2 つ（組む画面のプレビューと進行）並んでも id が重ならないように。useId の記号は url() で使わない
  const id = `dial${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const brass = `url(#${id}-brass)`;
  const lines = centerLines(view);
  const started = view.phase !== 'idle';
  const classes = [
    'dial',
    `dial--${size}`,
    lines.isOverrun ? 'is-overrun' : '',
    view.phase === 'paused' ? 'is-paused' : '',
    reducedMotion ? 'dial--reduced' : '',
    striking ? 'dial--striking' : '',
  ].filter(Boolean);
  const footer = footerParts(view, wallNow);
  return (
    <figure className={classes.join(' ')}>
      <div className="dial-watch">
        <svg className="dial-svg" viewBox="0 0 400 400" aria-hidden="true" focusable="false">
          <Defs id={id} />
          <Crown brass={brass} />
          <circle className="dial-bezel" cx={C} cy={C} r={R_BEZEL + 6} fill={brass} />
          <circle className="dial-dial" cx={C} cy={C} r={R_BEZEL - 1} fill={`url(#${id}-face)`} />
          {lines.isOverrun && <circle className="dial-overrun-tint" cx={C} cy={C} r={R_BEZEL - 1} />}
          <MinuteTicks />
          <PlanRing view={view} hatch={`url(#${id}-hatch)`} />
          <ActualRing view={view} />
          {overrunTrackDeg(view) > 0 && <path className="dial-overrun-track" d={arcPath(R_TRACK, 0, overrunTrackDeg(view))} />}
          {started && <Projection view={view} />}
          <SmallSeconds view={view} brass={brass} />
          <Needle view={view} />
          <Plate id={id} overrun={lines.isOverrun} />
        </svg>
        <Readout view={view} />
      </div>
      {footer.end !== '' && (
        <figcaption className="dial-footer">
          {footer.next !== '' && `${footer.next}${FOOTER_SEPARATOR}`}
          <span className="dial-footer-end">
            {started && <ProjectedEndMark view={view} />}
            {footer.end}
          </span>
        </figcaption>
      )}
      <p className="ui-visually-hidden">{summaryText(view)}</p>
    </figure>
  );
}
