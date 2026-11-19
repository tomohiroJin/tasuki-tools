/**
 * いま見積もっているアイテムの名前の欄（#93・spec §4.1）。
 *
 * 見た目は「題」のボタンで、押すと `<input>` に替わる。Enter かフォーカス外れで確定し、
 * Escape で元に戻す。名前が空なら通し番号から作った題を表示する。
 *
 * **編集中に `item` の props が変わっても打ちかけの値は消さない。**（アイテムの境目を越えたときだけ、呼び出し側が `key` で作り直して捨てる） 下書きは編集を始めた
 * 瞬間の `item` から取り、以後は props を読み直さない（他の参加者の入力で上書きされるのを防ぐ）。
 */
import { useEffect, useId, useRef, useState } from 'react';
import { MAX_ESTIMATE_ITEM } from '@tasuki/poker-core';
import { ESTIMATE_ITEM_LABEL, estimateTitle } from '../estimate-copy';

export interface EstimateItemFieldProps {
  item: string;
  number: number;
  onCommit: (item: string) => void;
  disabled: boolean;
  /** 欄のラベル。省略で「いま見積もっているもの」（#427・束の見出しは「アイテム名を変える」を渡す） */
  label?: string;
  /** `title` は記録の上の題（既定）。`inline` は束の見出しの中の名前で、ラベルは見せず読み上げにだけ使う */
  size?: 'title' | 'inline';
}

export function EstimateItemField({ item, number, onCommit, disabled, label = ESTIMATE_ITEM_LABEL, size = 'title' }: EstimateItemFieldProps) {
  const labelId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  // Escape で畳んだあとにアンマウントの blur が確定として働かないための印
  const cancelledRef = useRef(false);
  // 編集を始めた瞬間の値。他の人が名前を変えても、打たずに閉じたとき古い値で上書きしないための基準。
  // 見えない複製の文字列として描画中にも読むので、ref ではなく state に持つ（描画中に ref を読まない）
  const [start, setStart] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Enter / Escape で閉じたあとだけ題のボタンへフォーカスを戻す（blur で閉じたときは奪わない）
  const returnFocusRef = useRef(false);

  useEffect(() => {
    if (draft === null && returnFocusRef.current) {
      returnFocusRef.current = false;
      buttonRef.current?.focus();
    }
  }, [draft]);

  function commit(): void {
    if (cancelledRef.current) return;
    if (draft !== null) {
      const next = draft.trim();
      if (next !== start.trim()) onCommit(next);
    }
    setDraft(null);
  }

  return (
    <div className={size === 'inline' ? 'estimate-item estimate-item--inline' : 'estimate-item'}>
      {/* `hidden` でも aria-labelledby / aria-describedby からは読める */}
      <span id={labelId} className="estimate-item-label" hidden={size === 'inline'}>{label}</span>
      {draft === null ? (
        <button
          type="button"
          className="ui-button ui-button--secondary estimate-item-title"
          ref={buttonRef}
          aria-describedby={labelId}
          data-auto-title={size === 'title' && item === '' ? '' : undefined}
          disabled={disabled}
          onClick={() => {
            cancelledRef.current = false;
            setStart(item);
            setDraft(item);
          }}
        >
          {estimateTitle(item, number)}
        </button>
      ) : (
        <>
        {/* 束の見出しの中（inline）では、名前のボタンと同じ大きさの場所を、編集中も取り続ける（見えない複製。`.estimate-item-title` のクラスは持たない。読み上げと Tab から外す）。
            入力はその上に重ねる。入力の固有の幅に引かれて名前の列の基準幅が変わり、選択欄の行が跳ぶのを防ぐ（短い名前も長い名前も） */}
        {size === 'inline' && (
          <button type="button" className="ui-button ui-button--secondary estimate-item-sizer" aria-hidden="true" tabIndex={-1} disabled>
            {estimateTitle(start, number)}
          </button>
        )}
        <input
          type="text"
          className="ui-input estimate-item-input"
          aria-labelledby={labelId}
          value={draft}
          maxLength={MAX_ESTIMATE_ITEM}
          placeholder={estimateTitle('', number)}
          // 押して替わった直後なので、続けて打てるようにする
          autoFocus
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
              returnFocusRef.current = true;
              // 続く blur（アンマウント）で二重に確定しない
              cancelledRef.current = true;
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelledRef.current = true;
              returnFocusRef.current = true;
              setDraft(null);
            }
          }}
        />
        </>
      )}
    </div>
  );
}
