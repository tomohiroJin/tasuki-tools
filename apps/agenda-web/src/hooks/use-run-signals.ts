/**
 * 進行の合図（#429 spec §4.7・§7.4・§7.7）: 時打ち（音と縁の光）と読み上げの一言。
 *
 * 前に描いた盤（手元の時計で進めた写し）といまの盤を比べて、**変わり目でだけ**出す。
 * - 時打ち: `crossedZero` が true のときだけ。音ありなら `playStrike()`、動きを減らす設定でなければ縁を 600ms 光らせる
 * - 読み上げ: ステップの切り替わり・時間切れ・一時停止／再開・押し巻きが 0 をまたいだとき（と終了）。毎秒の残りは流さない
 *
 * **参加していない間（切断中・入り直し中）は前の盤を捨てる。** 入り直して受けた最初のフレームは「最初の盤」として扱い、
 * 過去に過ぎた 0 に対して鳴らさない（spec §4.7）。`room.joined` は新しい `agenda` フレームより先に届くので、
 * 入り直した直後に残っている**切断前のフレーム**（`frame` の同一性で見分ける）からは前の盤を取らない。
 * 取ると、切断前の「残り +1 秒」と入り直しの「残り −5 秒」の間で 0 をまたいだことになって鳴る。
 */
import { useEffect, useRef, useState } from 'react';
import type { AgendaView } from '@tasuki/agenda-core';
import { centerLines, driftTone, type DriftTone } from '../agenda-view';
import {
  FINISHED_ANNOUNCE,
  PAUSED_ANNOUNCE,
  RESUMED_ANNOUNCE,
  SUMMARY_SEPARATOR,
  TIMEOUT_ANNOUNCE,
  announceStep,
} from '../copy';
import { playStrike } from '../platform/sound';
import { crossedZero } from '../timeout-signal';

/** 時打ちの光の長さ（spec §7.4） */
export const STRIKE_MS = 600;

const isActive = (v: AgendaView): boolean => v.phase === 'running' || v.phase === 'paused';

/** 押し巻きの向き（0 をまたいだかは、押しかそれ以外かで見る。分へ丸めた値なので毎秒は揺れない） */
const lateness = (tone: DriftTone): 'late' | 'not-late' => (tone === 'late' ? 'late' : 'not-late');

/** 前の盤といまの盤から、読み上げる一言を組む（無ければ null）。並びは重さの順 */
export function announcementFor(prev: AgendaView, next: AgendaView, struck: boolean): string | null {
  const parts: string[] = [];
  if (prev.phase !== 'finished' && next.phase === 'finished') {
    parts.push(FINISHED_ANNOUNCE);
  } else if (isActive(next)) {
    const stepChanged = prev.currentId !== next.currentId || !isActive(prev);
    if (stepChanged) parts.push(announceStep(centerLines(next).name));
    if (struck) parts.push(TIMEOUT_ANNOUNCE);
    if (prev.phase === 'running' && next.phase === 'paused') parts.push(PAUSED_ANNOUNCE);
    if (prev.phase === 'paused' && next.phase === 'running' && !stepChanged) parts.push(RESUMED_ANNOUNCE);
    if (isActive(prev) && lateness(driftTone(prev)) !== lateness(driftTone(next))) parts.push(centerLines(next).drift);
  }
  return parts.length === 0 ? null : parts.join(SUMMARY_SEPARATOR);
}

interface Options {
  /** 受け取ったフレームそのもの（手元の時計で進める前。フレームを受けるたびに別の値になる） */
  readonly frame: AgendaView | null;
  /** 参加済みか（切断・入り直しの間は前の盤を捨てる） */
  readonly joined: boolean;
  readonly soundOn: boolean;
  readonly reducedMotion: boolean;
}

export function useRunSignals(
  view: AgendaView | null,
  { frame, joined, soundOn, reducedMotion }: Options,
): { striking: boolean; announcement: string } {
  const prevRef = useRef<AgendaView | null>(null);
  /** 切断した時点で持っていたフレーム。入り直してから次のフレームが届くまでは比べない */
  const staleFrameRef = useRef<AgendaView | null>(null);
  const [striking, setStriking] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // 効果の中で最新の設定を読む（設定の変化で前の盤を比べ直さない）
  const settings = useRef({ soundOn, reducedMotion });
  settings.current = { soundOn, reducedMotion };

  useEffect(() => {
    if (!joined || view === null) {
      prevRef.current = null;
      staleFrameRef.current = frame;
      return;
    }
    if (frame !== null && frame === staleFrameRef.current) return;
    staleFrameRef.current = null;
    const prev = prevRef.current;
    prevRef.current = view;
    if (prev === null) return;
    const struck = crossedZero(prev, view);
    if (struck) {
      if (settings.current.soundOn) playStrike();
      if (!settings.current.reducedMotion) setStriking(true);
    }
    const said = announcementFor(prev, view, struck);
    if (said !== null) setAnnouncement(said);
  }, [view, frame, joined]);

  // 光は 600ms で下ろす（点滅させない。1 度だけ）
  useEffect(() => {
    if (!striking) return;
    const timer = setTimeout(() => setStriking(false), STRIKE_MS);
    return () => clearTimeout(timer);
  }, [striking]);

  return { striking, announcement };
}
