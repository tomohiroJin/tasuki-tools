// 名前入力フォーム（トップのルーム作成とルームの参加で共用）
//
// **文字数の正本は `@tasuki/room-core` の `MAX_DISPLAY_NAME`**（#95 S5b）。
// poker が持っていた自前の上限（24）は規約ごと向こうへ寄せた —— ハブで名乗った
// 名前が poker へ届くようになり、食い違いが実害に変わったためである。
// timer の入力欄も同じ値を取っていた（`Join.tsx` は #95 S5c で撤去し、名乗りは玄関に 1 つ）。
import { useState, type FormEvent } from 'react';
import { MAX_DISPLAY_NAME } from '@tasuki/room-core';

interface Props {
  submitLabel: string;
  placeholder: string;
  onSubmit: (name: string) => void;
  disabled: boolean;
}

export function NameForm({ submitLabel, placeholder, onSubmit, disabled }: Props) {
  const [name, setName] = useState('');
  // 送れるかどうかは「空でないこと」だけを見る。**正規化した結果が空になる名前**
  // （空白だけ・見えない文字だけ）はサーバーが規約で弾く —— 画面が規約を写し取ると、
  // 上限や正規則が変わったときに片方だけが取り残される。
  const canSubmit = name.trim().length > 0 && !disabled;

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
          maxLength={MAX_DISPLAY_NAME}
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
