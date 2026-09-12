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
  onJoin(displayName: string, passphrase?: string): void;
}

export function JoinRoom({
  code,
  defaultDisplayName,
  error,
  needsPassphrase,
  onJoin,
}: JoinRoomProps) {
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [passphrase, setPassphrase] = useState('');

  const submit = (event: FormEvent): void => {
    event.preventDefault();
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

        <button className="hub-submit" type="submit">
          参加する
        </button>
      </form>
    </main>
  );
}
