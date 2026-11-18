/**
 * やり方の選択（#406・設計 §4）。チェックイン／チェックアウトを切り替え、その側の 13 のやり方か「ランダム」で決める。
 * やり方は目的ごとの小見出し（`method-groups.ts`）で 3 つの並びに分け、ランダムは末尾の「おまかせ」に置く（#635）。
 * **手元だけの状態**（側の切り替え）を持つ。送るのは選んだとき（`choose`）か引いたとき（`draw`）だけ。
 * 初めに開く側は呼び出し側が渡す（いまの回の側。回が無ければチェックイン）。
 * 切断中（`canOperate` が偽）はやり方とランダムを押させない（側の切り替えは手元だけなので押せる）。
 */
import { useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { METHODS, SIDES, type MethodId, type Side } from '@tasuki/checkin-core';
import {
  BACK_LABEL,
  METHOD_PICKER_HEADING,
  PICKER_REPLACE_NOTE,
  RANDOM_GROUP_TITLE,
  RANDOM_HINT,
  RANDOM_LABEL,
  SIDE_HINT,
  SIDE_LABEL,
} from '../copy';
import { CardFace } from './CardFace';
import { METHOD_COPY } from '../method-copy';
import { METHOD_GROUPS } from '../method-groups';

interface Props {
  canOperate: boolean;
  /** 初めに開く側 */
  initialSide: Side;
  /** 見出しの要素（開いたときのフォーカスの着地点） */
  headingRef?: Ref<HTMLHeadingElement> | undefined;
  onChoose: (method: MethodId) => void;
  onDraw: (side: Side) => void;
  /** 回があるときだけ。選ばずに元の画面へ戻る */
  onCancel?: (() => void) | undefined;
}

/** 小見出しと、その下の札の並び。並びの読み上げ名は小見出し */
function MethodGroupSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const headingId = `method-group-${id}`;
  return (
    <section className="method-group" aria-labelledby={headingId}>
      <h3 id={headingId} className="method-group-heading">
        {title}
      </h3>
      <ul className="method-list" aria-labelledby={headingId}>
        {children}
      </ul>
    </section>
  );
}

export function MethodPicker({ canOperate, initialSide, headingRef, onChoose, onDraw, onCancel }: Props) {
  const [side, setSide] = useState<Side>(initialSide);
  /** 回があるときは、札が消える注意文を全ての札の説明の後ろに併記する（フォーカスした札で読まれるように・#468 D5） */
  const describedBy = (id: string) => (onCancel ? `${id} method-picker-note` : id);
  return (
    <section className="method-picker" aria-labelledby="method-picker-heading">
      <div className="ui-page-header method-picker-head">
        <h2 ref={headingRef} id="method-picker-heading" className="method-picker-heading" tabIndex={-1}>
          {METHOD_PICKER_HEADING}
        </h2>
        {onCancel && (
          <button type="button" className="ui-button ui-button--secondary ui-button--sm ui-page-header-back" onClick={onCancel}>
            {BACK_LABEL}
          </button>
        )}
      </div>
      {onCancel && (
        <p id="method-picker-note" className="ui-note method-picker-note">
          {PICKER_REPLACE_NOTE}
        </p>
      )}
      <div className="seg" role="group" aria-label={METHOD_PICKER_HEADING} aria-describedby="method-side-hint">
        {SIDES.map((s) => (
          <button key={s} type="button" className="seg-button" aria-pressed={s === side} onClick={() => setSide(s)}>
            {SIDE_LABEL[s]}
          </button>
        ))}
      </div>
      <p id="method-side-hint" className="ui-note method-side-hint">{SIDE_HINT[side]}</p>
      {METHOD_GROUPS[side].map((group) => (
        <MethodGroupSection key={group.id} id={group.id} title={group.title}>
          {group.methods.map((m) => (
            <li key={m}>
              <button
                type="button"
                className="method-option"
                aria-labelledby={`method-${m}-title`}
                aria-describedby={describedBy(`method-${m}-prompt`)}
                disabled={!canOperate}
                onClick={() => onChoose(m)}
              >
                {/* 札の見本（そのやり方の札を 3 枚まで少し重ねた扇）。飾りなので読み上げない */}
                <span className="method-fan" aria-hidden="true">
                  {METHODS[m].cards.slice(0, 3).map((card, i) => (
                    <span key={card} className="method-fan-card" style={{ '--k': i } as CSSProperties}>
                      <CardFace method={m} card={card} />
                    </span>
                  ))}
                </span>
                <span className="method-text">
                  <span id={`method-${m}-title`} className="method-title">
                    {METHOD_COPY[m].title}
                  </span>
                  <span id={`method-${m}-prompt`} className="method-prompt">
                    {METHOD_COPY[m].prompt}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </MethodGroupSection>
      ))}
      <MethodGroupSection id="random" title={RANDOM_GROUP_TITLE}>
        <li>
          <button
            type="button"
            className="method-option method-option--random"
            aria-labelledby="method-random-title"
            aria-describedby={describedBy('method-random-hint')}
            disabled={!canOperate}
            onClick={() => onDraw(side)}
          >
            {/* 伏せ札の裏模様の見本 */}
            <span className="method-fan" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className="method-fan-card method-fan-card--back" style={{ '--k': i } as CSSProperties} />
              ))}
            </span>
            <span className="method-text">
              <span id="method-random-title" className="method-title">
                {RANDOM_LABEL}
              </span>
              <span id="method-random-hint" className="method-prompt">
                {RANDOM_HINT}
              </span>
            </span>
          </button>
        </li>
      </MethodGroupSection>
    </section>
  );
}
