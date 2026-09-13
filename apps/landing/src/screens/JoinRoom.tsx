import { useState, type FormEvent } from 'react';

/**
 * 参加用 URL から来た人が名乗る画面（#95 S5a・R2）。
 *
 * **合言葉は求められたときだけ出す**（保護されたルームかどうかは、参加を試みるまで
 * クライアントには分からない。存在秘匿のためサーバーも先には教えない）。
 */
export interface JoinRoomProps {
  readonly code: string;
  readonly defaultDisplayName: string;
  readonly error: string | null;
  readonly needsPassphrase: boolean;
  /** 同期サーバーへ繋がっているか。繋がっていなければ作成も参加もできない（#76 の回帰防止）。 */
  readonly connection: 'online' | 'reconnecting';
  onJoin(displayName: string, passphrase?: string): void;
}

export function JoinRoom({
  code,
  defaultDisplayName,
  error,
  needsPassphrase,
  connection,
  onJoin,
}: JoinRoomProps) {
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [passphrase, setPassphrase] = useState('');

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    // 未接続なら黙って積まれてしまう（`SyncConnection.send` は捨てずに `pending` へ積む）。
    // ボタンの disabled はクリック以外の送信経路（requestSubmit・支援技術）を防がないので、
    // ここでも同じ判定を持つ（#76 の回帰防止）。
    if (connection !== 'online') return;
    if (displayName.trim() === '') return;
    onJoin(displayName.trim(), needsPassphrase ? passphrase : undefined);
  };

  return (
    <main className="page landing">
      <header className="landing-hero">
        <h1 className="wordmark">Tasuki</h1>
        <p className="tagline">
          <span className="hub-room-code">{code}</span> に参加します。
        </p>
      </header>

      {connection === 'reconnecting' && (
        <p className="hub-error" role="alert">
          同期サーバーに接続できません。復旧するまで、ルームの作成と参加はできません。
        </p>
      )}

      <form className="hub-form" onSubmit={submit}>
        <label className="hub-field">
          <span className="hub-label">あなたの名前</span>
          <input
            className="hub-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="いずみ"
            autoComplete="nickname"
            required
          />
        </label>

        {needsPassphrase && (
          <label className="hub-field">
            <span className="hub-label">合言葉</span>
            <input
              className="hub-input"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="off"
            />
          </label>
        )}

        {error !== null && (
          <p className="hub-error" role="alert">
            {error}
          </p>
        )}

        <button className="hub-submit" type="submit" disabled={connection !== 'online'}>
          参加する
        </button>
      </form>
    </main>
  );
}
