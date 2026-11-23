import { useEffect, useId, useRef, useState } from 'react';
import { roundsOf, scenarioTotalSec } from '@tasuki/agenda-core';
import {
  sampleTitle,
  SAMPLE_MENU_BUTTON,
  SAMPLE_REPLACE_CONFIRM,
  SAMPLE_REPLACE_NO,
  SAMPLE_REPLACE_YES,
  scenarioDetail,
} from '../copy';
import { SAMPLE_GROUPS, type SampleScenario } from '../sample-scenarios';

/**
 * 「サンプルから選ぶ」（#429 フィードバック F1〜F3）。押したときだけ、会の種類ごとの一覧を開く。
 * 下書きに中身があり、ルームのシナリオとも違うときに選んだら、その場で「いまの下書きを消して読み込みますか」と確かめる（「最初から」と同じ作り:
 * 確かめを開いたら安全な側＝やめる にフォーカス、閉じたら開閉のボタンへ返す）。
 */
export function SampleMenu({
  draftIsDisposable,
  suppressed,
  onAsk,
  onPick,
}: {
  draftIsDisposable: boolean;
  /** 別の確かめ（下書きを空にする）を開いている間は、こちらの確かめを出さない（同時に 2 つ並べない） */
  suppressed: boolean;
  /** 確かめを開いた・閉じたを持ち主へ伝える */
  onAsk: (asking: boolean) => void;
  onPick: (scenario: SampleScenario) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<SampleScenario | null>(null);
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
  useEffect(() => {
    onAsk(pending !== null);
  }, [pending, onAsk]);
  // 別の確かめが開いたら、こちらは閉じる（フォーカスは開いた側が持つので返さない）
  useEffect(() => {
    if (suppressed && pending !== null) setPending(null);
  }, [suppressed, pending]);
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

  const load = (scenario: SampleScenario): void => {
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
          <div className="builder-sample-groups">
            {SAMPLE_GROUPS.map(({ heading, scenarios }, index) => (
              <div key={heading} className="builder-sample-group">
                <h2 id={`${listId}-${index}`} className="builder-sample-heading">{heading}</h2>
                <ul className="builder-sample-list" aria-labelledby={`${listId}-${index}`}>
                  {scenarios.map((scenario) => (
                    <li key={scenario.title}>
                      <button
                        type="button"
                        className="builder-sample-row"
                        onClick={() => {
                          if (!needsConfirm) {
                            load(scenario);
                            return;
                          }
                          // 開く操作と同じ処理で伝える（effect を待つと、開いている別の確かめの側がこちらを閉じてしまう）
                          onAsk(true);
                          setPending(scenario);
                        }}
                      >
                        <span className="builder-sample-title">{sampleTitle(scenario.title)}</span>
                        <span className="builder-sample-detail">
                          {scenarioDetail(scenario.steps.length, scenarioTotalSec(scenario) / 60, roundsOf(scenario))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {open && pending !== null && needsConfirm && !suppressed && (
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
