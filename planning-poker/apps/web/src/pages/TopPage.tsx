// トップ画面: 名前を入力してルームを作成する（FR-001）
import { NameForm } from '../components/NameForm';

interface Props {
  onCreate: (name: string) => void;
  disabled: boolean;
}

export function TopPage({ onCreate, disabled }: Props) {
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
      <NameForm
        submitLabel="ルームを作成"
        placeholder="例: たろう"
        onSubmit={onCreate}
        disabled={disabled}
      />
    </main>
  );
}
