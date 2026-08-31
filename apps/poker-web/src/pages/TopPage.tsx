// トップ画面: 名前を入力してルームを作成する（FR-001）
import { ErrorNote } from '../components/ErrorNote';
import { NameForm } from '../components/NameForm';
import type { SyncError } from '../hooks/useSync';

interface Props {
  onCreate: (name: string) => void;
  disabled: boolean;
  /** サーバーから届いたエラー（#217）。server-busy でルーム作成が拒まれても無音だった */
  error: SyncError | null;
  onClearError: () => void;
}

export function TopPage({ onCreate, disabled, error, onClearError }: Props) {
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
      <ErrorNote error={error} onClose={onClearError} />
      <NameForm
        submitLabel="ルームを作成"
        placeholder="例: たろう"
        onSubmit={onCreate}
        disabled={disabled}
      />
    </main>
  );
}
