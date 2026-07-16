// トップ画面: 名前を入力してルームを作成する（FR-001）
import { useState, type FormEvent } from 'react';

interface Props {
  onCreate: (name: string) => void;
  disabled: boolean;
}

export function TopPage({ onCreate, disabled }: Props) {
  const [name, setName] = useState('');
  const canSubmit = name.trim().length >= 1 && name.trim().length <= 24 && !disabled;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmit) onCreate(name.trim());
  };

  return (
    <main className="page top-hero">
      <p className="suits" aria-hidden="true">
        ♠ ♥ ♣ ♦
      </p>
      <h1>
        Tasuki
        <br />
        Planning Poker
      </h1>
      <p className="tagline">スクラムのストーリーポイント見積もりを、ルーム同期でリアルタイムに。</p>
      <form onSubmit={handleSubmit} className="stack">
        <label>
          あなたの名前
          <input
            type="text"
            value={name}
            maxLength={24}
            placeholder="例: たろう"
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <button type="submit" disabled={!canSubmit}>
          ルームを作成
        </button>
      </form>
    </main>
  );
}
