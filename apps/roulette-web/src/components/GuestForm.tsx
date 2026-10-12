import { useState, type FormEvent } from 'react';
import { GUEST_ADD_BUTTON, GUEST_HINT } from '../copy';

/** 24 字は表示名の規約の上限（正規化と検証はサーバーが持つ。ここは入力の目安）。 */
const MAX_NAME_LENGTH = 24;

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
        <input
          id="roulette-guest-name"
          className="ui-input"
          autoComplete="off"
          maxLength={MAX_NAME_LENGTH}
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
