import { useState, type FormEvent } from 'react';
import { MAX_DISPLAY_NAME } from '@tasuki/room-core';
import { GUEST_ADD_BUTTON, GUEST_HINT } from '../copy';

/** ルームにいない人の名前を足す欄。 */
export function GuestForm({ disabled, onAdd }: { disabled: boolean; onAdd: (name: string) => void }) {
  const [name, setName] = useState('');
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === '') return;
    onAdd(name);
    setName('');
  };
  return (
    <form className="roulette-add" onSubmit={submit}>
      <label htmlFor="roulette-guest-name">{GUEST_HINT}</label>
      <div className="roulette-add-row">
        {/* 上限の正本は `@tasuki/room-core` の `MAX_DISPLAY_NAME`（landing・timer の名前欄と同じ）。
            正規化と検証はサーバーが持つので、ここは打ち込みの目安。輪に載せられる数の上限（24）とは別物 */}
        <input
          id="roulette-guest-name"
          className="ui-input"
          autoComplete="off"
          maxLength={MAX_DISPLAY_NAME}
          value={name}
          disabled={disabled}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="ui-button ui-button--secondary" disabled={disabled || name.trim() === ''}>
          {GUEST_ADD_BUTTON}
        </button>
      </div>
    </form>
  );
}
