import { useState, type FormEvent } from 'react';

/**
 * ルームを作る画面（#95 S5a・R1）。
 *
 * **画面は表示に徹する**（`docs/adr/0015` MUST 3・`docs/adr/0019`）。同期の状態も
 * 保存先も知らず、入力を受けて呼び出すだけである。
 */
export interface CreateRoomProps {
  /** 前に名乗った名前（初期値に使う。D12 の後半）。 */
  readonly defaultDisplayName: string;
  readonly error: string | null;
  onCreate(roomName: string, displayName: string): void;
}

export function CreateRoom({ defaultDisplayName, error, onCreate }: CreateRoomProps) {
  const [roomName, setRoomName] = useState('');
  const [displayName, setDisplayName] = useState(defaultDisplayName);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (displayName.trim() === '') return;
    onCreate(roomName.trim(), displayName.trim());
  };

  return (
    <main className="page landing">
      <header className="landing-hero">
        <h1 className="wordmark">Tasuki</h1>
        <p className="tagline">
          チームで開発を回すための道具。
          <br />
          ルームを作って、仲間を招いてください。
        </p>
      </header>

      <form className="hub-form" onSubmit={submit}>
        <label className="hub-field">
          <span className="hub-label">ルーム名</span>
          <input
            className="hub-input"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="朝会モブ"
            autoComplete="off"
          />
        </label>

        <label className="hub-field">
          <span className="hub-label">あなたの名前</span>
          <input
            className="hub-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="あや"
            autoComplete="nickname"
            required
          />
        </label>

        {error !== null && (
          <p className="hub-error" role="alert">
            {error}
          </p>
        )}

        <button className="hub-submit" type="submit">
          ルームを作る
        </button>
      </form>
    </main>
  );
}
