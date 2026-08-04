// 名前入力フォーム（トップのルーム作成とルームの参加で共用）
// 文字数ルールは core の NAME_MAX_LENGTH / isValidName が単一情報源
import { useState, type FormEvent } from 'react';
import { NAME_MAX_LENGTH, isValidName } from '@tasuki/poker-core';

interface Props {
  submitLabel: string;
  placeholder: string;
  onSubmit: (name: string) => void;
  disabled: boolean;
}

export function NameForm({ submitLabel, placeholder, onSubmit, disabled }: Props) {
  const [name, setName] = useState('');
  const canSubmit = isValidName(name) && !disabled;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmit) onSubmit(name.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="stack">
      <label>
        あなたの名前
        <input
          type="text"
          value={name}
          maxLength={NAME_MAX_LENGTH}
          placeholder={placeholder}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </label>
      <button type="submit" disabled={!canSubmit}>
        {submitLabel}
      </button>
    </form>
  );
}
