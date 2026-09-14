import { useState, type FormEvent } from 'react';
import { HistoryLink } from './HistoryLink.js';

/**
 * ルームを作る画面（#95 S5a・R1）。
 *
 * **画面は表示に徹する**（`docs/adr/0015` MUST 3・`docs/adr/0019`）。同期の状態も
 * 保存先も知らず、入力を受けて呼び出すだけである。
 */
export interface CreateRoomProps {
  /** ツールから退出して戻ってきたことの告知（無ければ null・#95 S5c）。 */
  readonly departure: string | null;
  /** 前に名乗った名前（初期値に使う。D12 の後半）。 */
  readonly defaultDisplayName: string;
  readonly error: string | null;
  /** 同期サーバーへ繋がっているか。繋がっていなければ作成も参加もできない（#76 の回帰防止）。 */
  readonly connection: 'online' | 'reconnecting';
  onCreate(roomName: string, displayName: string): void;
}

export function CreateRoom({
  departure,
  defaultDisplayName,
  error,
  connection,
  onCreate,
}: CreateRoomProps) {
  const [roomName, setRoomName] = useState('');
  const [displayName, setDisplayName] = useState(defaultDisplayName);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    // 未接続なら黙って積まれてしまう（`SyncConnection.send` は捨てずに `pending` へ積む）。
    // ボタンの disabled はクリック以外の送信経路（requestSubmit・支援技術）を防がないので、
    // ここでも同じ判定を持つ（#76 の回帰防止）。
    if (connection !== 'online') return;
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

      {/* 退出したことの告知（#95 S5c・I-1）。ツールから送り返されたときだけ出る。
          `role="alert"` にしない —— 接続の告知（下）と読み上げが重なるうえ、
          これは「いま起きたこと」の報告であって行動を促す警告ではない。 */}
      {departure !== null && (
        <p className="hub-notice" role="status">
          {departure}
        </p>
      )}

      {connection === 'reconnecting' && (
        <p className="hub-error" role="alert">
          同期サーバーに接続できません。復旧するまで、ルームの作成と参加はできません。
        </p>
      )}

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

        {/* 接続の告知が出ている間は error を出さない（二重表示の回避・poker の
            RoomPage.tsx が持っていた扱いを移した）。切れている以上 error は古い情報である。 */}
        {error !== null && connection === 'online' && (
          <p className="hub-error" role="alert">
            {error}
          </p>
        )}

        <button className="hub-submit" type="submit" disabled={connection !== 'online'}>
          ルームを作る
        </button>
      </form>

      {/* ルームに入っていなくても端末の記録は見られる（撤去した旧入口（timer の `Setup`）の性質を保つ）。 */}
      <HistoryLink roomCode={null} />
    </main>
  );
}
