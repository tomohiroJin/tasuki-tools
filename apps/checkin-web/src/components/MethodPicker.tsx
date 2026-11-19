/**
 * やり方の選択（#406・設計 §4）。チェックイン／チェックアウトを切り替え、その側の 13 のやり方か「ランダム」で決める。
 * やり方は目的ごとの小見出し（checkin-core の `METHOD_GROUPS`・題は `method-groups.ts`）で 3 つの並びに分ける。
 * 小見出しの行には、その小見出しの中から引く「ランダム」を置き、側の全部から引くランダムは末尾の「おまかせ」に置く（#635）。
 * **札の高さは小見出しをまたいで揃える**: 小見出しごとの並びを、外側の 1 つの格子の行へ subgrid で載せ、札の行を全て 1fr にする（#635 の B）。
 * 外側の行の並びは小見出しの札の数から導き、列の数（2・4）ごとに CSS 変数で渡す。
 * **手元だけの状態**（側の切り替え）を持つ。送るのは選んだとき（`choose`）か引いたとき（`draw`・`drawGroup`）だけ。
 * 初めに開く側は呼び出し側が渡す（いまの回の側。回が無ければチェックイン）。
 * 切断中（`canOperate` が偽）はやり方とランダムを押させない（側の切り替えは手元だけなので押せる）。
 */
import { useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { METHOD_GROUPS, METHODS, SIDES, groupsOf, type GroupId, type MethodId, type Side } from '@tasuki/checkin-core';
import {
  BACK_LABEL,
  GROUP_RANDOM_TEXT,
  METHOD_PICKER_HEADING,
  PICKER_REPLACE_NOTE,
  RANDOM_GROUP_TITLE,
  RANDOM_HINT,
  RANDOM_LABEL,
  SIDE_HINT,
  SIDE_LABEL,
  groupRandomLabel,
} from '../copy';
import { CardFace } from './CardFace';
import { METHOD_COPY } from '../method-copy';
import { GROUP_TITLES } from '../method-groups';

interface Props {
  canOperate: boolean;
  /** 初めに開く側 */
  initialSide: Side;
  /** 見出しの要素（開いたときのフォーカスの着地点） */
  headingRef?: Ref<HTMLHeadingElement> | undefined;
  onChoose: (method: MethodId) => void;
  onDraw: (side: Side) => void;
  /** 小見出しの中から引く（#635） */
  onDrawGroup?: ((group: GroupId) => void) | undefined;
  /** 回があるときだけ。選ばずに元の画面へ戻る */
  onCancel?: (() => void) | undefined;
}

/** 札の段の列の数（`table.css` の `.method-groups` の段と合わせる: 40rem 未満 2・以上 4） */
const COLUMNS = { narrow: 2, wide: 4 } as const;

/** 小見出し 1 つが外側の格子で使う行: 小見出しの行（auto）と札の段（1fr）の数 */
const tileRows = (count: number, columns: number) => Math.ceil(count / columns);

/** 外側の格子の行の並び（例: `auto repeat(3, 1fr) auto repeat(2, 1fr)`）。札の段を全て 1fr にして高さを揃える */
function rowTemplate(counts: readonly number[], columns: number): string {
  return counts.map((n) => `auto repeat(${tileRows(n, columns)}, 1fr)`).join(' ');
}

/** 小見出しの行と、その下の札の並び。並びの読み上げ名は小見出し */
function MethodGroupSection({
  id,
  title,
  count,
  action,
  children,
}: {
  id: string;
  title: string;
  /** 並びの札の数（外側の格子で使う行の数を決める） */
  count: number;
  /** 小見出しの行の右に置くもの */
  action?: ReactNode;
  children: ReactNode;
}) {
  const headingId = `method-group-${id}`;
  const span = {
    '--span-narrow': 1 + tileRows(count, COLUMNS.narrow),
    '--span-wide': 1 + tileRows(count, COLUMNS.wide),
  } as CSSProperties;
  return (
    <section className="method-group" aria-labelledby={headingId} style={span}>
      <div className="method-group-head">
        <h3 id={headingId} className="method-group-heading">
          {title}
        </h3>
        {action}
      </div>
      <ul className="method-list" aria-labelledby={headingId}>
        {children}
      </ul>
    </section>
  );
}

export function MethodPicker({ canOperate, initialSide, headingRef, onChoose, onDraw, onDrawGroup, onCancel }: Props) {
  const [side, setSide] = useState<Side>(initialSide);
  /** 回があるときは、札が消える注意文を全ての札の説明の後ろに併記する（フォーカスした札で読まれるように・#468 D5） */
  const describedBy = (id: string) => (onCancel ? `${id} method-picker-note` : id);
  const groups = groupsOf(side);
  const counts = [...groups.map((g) => METHOD_GROUPS[g].methods.length), 1];
  const rows = {
    '--rows-narrow': rowTemplate(counts, COLUMNS.narrow),
    '--rows-wide': rowTemplate(counts, COLUMNS.wide),
  } as CSSProperties;
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
      <div className="method-groups" style={rows}>
        {groups.map((group) => (
          <MethodGroupSection
            key={group}
            id={group}
            title={GROUP_TITLES[group]}
            count={METHOD_GROUPS[group].methods.length}
            action={
              <button
                type="button"
                className="ui-button ui-button--secondary ui-button--sm method-group-random"
                aria-label={groupRandomLabel(GROUP_TITLES[group])}
                aria-describedby={onCancel ? 'method-picker-note' : undefined}
                disabled={!canOperate}
                onClick={() => onDrawGroup?.(group)}
              >
                {GROUP_RANDOM_TEXT}
              </button>
            }
          >
            {METHOD_GROUPS[group].methods.map((m) => (
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
        <MethodGroupSection id="random" title={RANDOM_GROUP_TITLE} count={1}>
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
      </div>
    </section>
  );
}
