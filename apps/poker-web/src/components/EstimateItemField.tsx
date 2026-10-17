/**
 * いま見積もっているアイテムの名前の欄（#93・spec §4.1）。
 *
 * 見た目は「題」のボタンで、押すと `<input>` に替わる。Enter かフォーカス外れで確定し、
 * Escape で元に戻す。名前は任意なので、空でも入力を促す表示（`required`・`aria-invalid`）は出さず
 * 「（名前なし）」と出すだけにする。
 *
 * **編集中に `item` の props が変わっても打ちかけの値は消さない。** 下書きは編集を始めた
 * 瞬間の `item` から取り、以後は props を読み直さない（他の参加者の入力で上書きされるのを防ぐ）。
 */
import { useId, useRef, useState } from 'react';
import { MAX_ESTIMATE_ITEM } from '@tasuki/poker-core';
import { ESTIMATE_ITEM_LABEL, ESTIMATE_ITEM_PLACEHOLDER, ESTIMATE_UNNAMED } from '../estimate-copy';

export interface EstimateItemFieldProps {
  item: string;
  onCommit: (item: string) => void;
  disabled: boolean;
}

export function EstimateItemField({ item, onCommit, disabled }: EstimateItemFieldProps) {
  const labelId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  // Escape で畳んだあとにアンマウントの blur が確定として働かないための印
  const cancelledRef = useRef(false);

  function commit(): void {
    if (cancelledRef.current) return;
    if (draft !== null && draft !== item) onCommit(draft);
    setDraft(null);
  }

  return (
    <div className="estimate-item">
      <span id={labelId} className="estimate-item-label">{ESTIMATE_ITEM_LABEL}</span>
      {draft === null ? (
        <button
          type="button"
          className="ui-button ui-button--secondary estimate-item-title"
          aria-describedby={labelId}
          disabled={disabled}
          onClick={() => {
            cancelledRef.current = false;
            setDraft(item);
          }}
        >
          {item === '' ? ESTIMATE_UNNAMED : item}
        </button>
      ) : (
        <input
          type="text"
          className="ui-input estimate-item-input"
          aria-labelledby={labelId}
          value={draft}
          maxLength={MAX_ESTIMATE_ITEM}
          placeholder={ESTIMATE_ITEM_PLACEHOLDER}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- 押して替わった直後なので、続けて打てるようにする
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
              // 続く blur（アンマウント）で二重に確定しない
              cancelledRef.current = true;
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelledRef.current = true;
              setDraft(null);
            }
          }}
        />
      )}
    </div>
  );
}
