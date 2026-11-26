import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion.js';

/** 色の場面。gold＝一致・そろった、rose＝割れた・バラバラ、jade＝そろい・チェックイン、ivory＝休憩。 */
export type CutInTone = 'gold' | 'rose' | 'jade' | 'ivory';

/** 1 回のカットイン。`id` が変わるたびに 1 回出す（同じ `id` の間は出し直さない）。 */
export interface CutInCue {
  id: string | number;
  /** 大きな字（9 字以下。320px 幅でも 1 行に収まる大きさで描く） */
  title: string;
  /** 上の小さな英字の見出し（例 `PLANNING POKER`） */
  kicker?: string;
  /** 下の小さな添え書き */
  sub?: string;
  tone: CutInTone;
  /** 出すまでの待ち（札がめくれ終わるのを待つ）。既定 0 */
  delayMs?: number;
}

/**
 * 出している長さ。**時間の正本はここ 1 か所**。CSS へは `--cutin-duration` で渡し、CSS に数を写さない
 * （動きの区切りは CSS の割合で決まるので、数を変えても動きの形は崩れない）。
 */
export const CUTIN_DURATION_MS = 1800;

/**
 * 火花の振り分け。角度（deg）と距離（vmin）を CSS 変数で渡し、散らし方は CSS の rotate＋translateX が持つ。
 * 絵の飾りなので、数を増やしても読み上げ・操作には何も起きない（層ごと aria-hidden）。
 */
const SPARKS: readonly { angle: number; dist: number; size: number }[] = [
  { angle: -168, dist: 38, size: 1 },
  { angle: -142, dist: 26, size: 0.7 },
  { angle: -118, dist: 34, size: 0.85 },
  { angle: -62, dist: 30, size: 0.8 },
  { angle: -34, dist: 40, size: 1 },
  { angle: -10, dist: 28, size: 0.7 },
  { angle: 14, dist: 36, size: 0.9 },
  { angle: 150, dist: 32, size: 0.75 },
];

/**
 * 画面の全体に重なるカットイン（格闘ゲーム・RPG の必殺技の見せ方。#670）。
 *
 * - `cue` の `id` が新しくなったら、`delayMs` 後に層を出し、`CUTIN_DURATION_MS` 後に DOM から外す。
 *   途中で `cue` が null になる・`id` が替わると前の分はすぐ外し、新しい `id` は待ちからやり直す
 * - **操作を奪わない**: 層は `document.body` への portal・`pointer-events: none`・`aria-hidden`。
 *   中にフォーカスできる物を置かない。読み上げと静かな 1 行は使う側が持つ
 * - **動きを減らす設定では何も描かない**（CSS の `@media` でも念のため隠す）
 */
export function CutIn({ cue }: { cue: CutInCue | null }): ReactNode {
  const reduced = usePrefersReducedMotion();
  /** いま出している cue の id。描画は「いまの cue の id と一致するときだけ」なので、id が替わった描画から即座に消える */
  const [shownId, setShownId] = useState<string | number | null>(null);
  // 待ちは id が替わったときだけ読む（待ちの数値の描き直しでタイマーを張り直さない）
  const delayRef = useRef(0);
  delayRef.current = cue?.delayMs ?? 0;
  const id = cue?.id ?? null;

  useEffect(() => {
    if (id === null || reduced) {
      setShownId(null);
      return;
    }
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const showTimer = setTimeout(() => {
      setShownId(id);
      hideTimer = setTimeout(() => setShownId(null), CUTIN_DURATION_MS);
    }, delayRef.current);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [id, reduced]);

  if (cue === null || reduced || shownId !== cue.id) return null;

  const style = { '--cutin-duration': `${CUTIN_DURATION_MS}ms` } as CSSProperties;
  return createPortal(
    <div className="ui-cutin" data-tone={cue.tone} aria-hidden="true" style={style}>
      <div className="ui-cutin__veil" />
      <div className="ui-cutin__flash" />
      <div className="ui-cutin__stage">
        <div className="ui-cutin__band">
          <div className="ui-cutin__streaks" />
          <div className="ui-cutin__streaks ui-cutin__streaks--far" />
        </div>
        {cue.kicker !== undefined && <p className="ui-cutin__kicker">{cue.kicker}</p>}
        <p className="ui-cutin__title">{cue.title}</p>
        {cue.sub !== undefined && <p className="ui-cutin__sub">{cue.sub}</p>}
        <div className="ui-cutin__sparks">
          {SPARKS.map((s) => (
            <span
              key={s.angle}
              className="ui-cutin__spark"
              style={
                {
                  '--spark-angle': `${s.angle}deg`,
                  '--spark-dist': `${s.dist}vmin`,
                  '--spark-size': s.size,
                } as CSSProperties
              }
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
