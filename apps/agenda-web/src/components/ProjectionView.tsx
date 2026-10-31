/**
 * 映す表示（#429 spec §7.5 判断 J13）。会議のスクリーンに盤を大きく映す。
 *
 * - 残すもの: 盤（短い辺の 70vmin 前後）・ステップの名前・残り／オーバー・予定より ±n 分・次のステップ・終了見込み
 * - 落とすもの: 進行表・保存・延長のボタン・在席
 * - キーボード: Space ＝ 一時停止／再開・→ ＝ 次へ・Esc ＝ 抜ける。マウスを動かしたときだけ薄い操作帯を 3 秒出す
 * - 第 1 段は CSS の段組みの切り替えだけ（全画面表示 API と Wake Lock は第 2 段）
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AgendaView } from '@tasuki/agenda-core';
import { driftShort, driftTone, nextStepName, projectedEndClock } from '../agenda-view';
import {
  DRIFT_LABEL,
  NEXT_BUTTON,
  NEXT_STEP_LABEL,
  PAUSE_BUTTON,
  PROJECTED_END_LABEL,
  PROJECT_EXIT_BUTTON,
  PROJECT_KEYS_HINT,
  RESUME_BUTTON,
} from '../copy';
import { Dial, ProjectedEndMark } from './Dial';

/** マウスを動かしてから操作帯を出しておく長さ */
export const STRIP_SHOWN_MS = 3000;

interface Props {
  view: AgendaView;
  wallNow: Date;
  reducedMotion: boolean;
  striking: boolean;
  canOperate: boolean;
  onNext: (stepId: string) => void;
  onPause: () => void;
  onResume: () => void;
  onExit: () => void;
  /** 盤の隅の音の切り替え（映しているだけの画面でも鳴らせるように常に置く） */
  soundToggle: ReactNode;
  /** 接続の告知の帯（映している間は全面を覆うこの表示の中の上端に置く。外に出すと覆われて見えない） */
  banner?: ReactNode;
}

/** 修飾キーつきはブラウザと OS の操作（Ctrl+→ など）に残す */
const hasModifier = (e: KeyboardEvent): boolean => e.altKey || e.ctrlKey || e.metaKey;

function useStrip(): { shown: boolean; reveal: () => void } {
  const [shownAt, setShownAt] = useState<number | null>(null);
  useEffect(() => {
    if (shownAt === null) return;
    const timer = setTimeout(() => setShownAt(null), STRIP_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [shownAt]);
  // 動かすたびに 3 秒を張り直す（同じ値だと effect が走らないので、数を進める）
  return { shown: shownAt !== null, reveal: () => setShownAt((n) => (n ?? 0) + 1) };
}

export function ProjectionView({ view, wallNow, reducedMotion, striking, canOperate, onNext, onPause, onResume, onExit, soundToggle, banner }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { shown, reveal } = useStrip();
  const paused = view.phase === 'paused';
  const active = view.phase === 'running' || paused;

  // キーは最新の盤で読む（押した瞬間のいまのステップ）
  const latest = useRef({ view, canOperate, onNext, onPause, onResume, onExit });
  latest.current = { view, canOperate, onNext, onPause, onResume, onExit };

  useEffect(() => {
    rootRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      const cur = latest.current;
      if (hasModifier(e)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        cur.onExit();
        return;
      }
      // Space は映す表示の中ではいつも一時停止／再開。押せる部品にフォーカスがあっても、その部品を押させない
      if (e.key === ' ') e.preventDefault();
      if (!cur.canOperate || e.repeat) return;
      const id = cur.view.currentId;
      if (e.key === 'ArrowRight' && id !== null) {
        e.preventDefault();
        cur.onNext(id);
      } else if (e.key === ' ') {
        if (cur.view.phase === 'paused') cur.onResume();
        else if (cur.view.phase === 'running') cur.onPause();
      }
    };
    // ボタンの Space による押下は keyup で起きるブラウザがあるので、そちらも止める
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === ' ' && !hasModifier(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  /** 操作帯のボタンを押したら、フォーカスを表示の根に戻す（帯が出たまま残らず、Space が同じボタンを押し直さない） */
  const thenRefocus =
    (action: () => void) =>
    (): void => {
      action();
      rootRef.current?.focus();
    };

  const following = nextStepName(view);
  return (
    <div ref={rootRef} className="projection" tabIndex={-1} onMouseMove={reveal}>
      <div className="projection-top">{banner}</div>
      <div className="projection-corner">{soundToggle}</div>
      <div className="projection-body">
        <div className="projection-dial">
          <Dial view={view} wallNow={wallNow} reducedMotion={reducedMotion} striking={striking} size="stage" />
        </div>
        {active && (
          <dl className="projection-side">
            <div className="projection-item">
              <dt>{DRIFT_LABEL}</dt>
              <dd className={`projection-drift is-${driftTone(view)}`}>{driftShort(view)}</dd>
            </div>
            {following !== '' && (
              <div className="projection-item">
                <dt>{NEXT_STEP_LABEL}</dt>
                <dd className="projection-next">{following}</dd>
              </div>
            )}
            <div className="projection-item">
              <dt>
                {/* この見出しは進行中・一時停止中だけ（active）。開始前は出ないので、盤の縁の印と常に対になる */}
                <ProjectedEndMark view={view} />
                {PROJECTED_END_LABEL}
              </dt>
              <dd className="projection-end">{projectedEndClock(view, wallNow)}</dd>
            </div>
          </dl>
        )}
      </div>
      <div className={shown ? 'projection-strip is-shown' : 'projection-strip'}>
        {active && (
          <>
            <button type="button" className="ui-button ui-button--secondary ui-button--sm" disabled={!canOperate} onClick={thenRefocus(paused ? onResume : onPause)}>
              {paused ? RESUME_BUTTON : PAUSE_BUTTON}
            </button>
            <button
              type="button"
              className="ui-button ui-button--sm"
              disabled={!canOperate || view.currentId === null}
              onClick={thenRefocus(() => view.currentId !== null && onNext(view.currentId))}
            >
              {NEXT_BUTTON}
            </button>
          </>
        )}
        <button type="button" className="ui-button ui-button--quiet ui-button--sm" onClick={onExit}>
          {PROJECT_EXIT_BUTTON}
        </button>
        <span className="projection-hint">{PROJECT_KEYS_HINT}</span>
      </div>
    </div>
  );
}
