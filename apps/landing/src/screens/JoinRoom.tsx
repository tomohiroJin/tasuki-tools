import { useState, type FormEvent } from 'react';
import { MAX_DISPLAY_NAME } from '@tasuki/room-core';
import { HistoryLink } from './HistoryLink.js';

/**
 * 参加用 URL から来た人が名乗る画面（#95 S5a・R2）。
 *
 * **合言葉は求められたときだけ出す**（保護されたルームかどうかは、参加を試みるまで
 * クライアントには分からない。存在秘匿のためサーバーも先には教えない）。
 */
export interface JoinRoomProps {
  /** ツールから退出して戻ってきたことの告知（無ければ null・#95 S5c）。 */
  readonly departure: string | null;
  readonly code: string;
  readonly defaultDisplayName: string;
  readonly error: string | null;
  readonly needsPassphrase: boolean;
  /** 同期サーバーへ繋がっているか。繋がっていなければ作成も参加もできない（#76 の回帰防止）。 */
  readonly connection: 'online' | 'reconnecting';
  onJoin(displayName: string, passphrase?: string): void;
}

export function JoinRoom({
  departure,
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

      <form className="hub-form" aria-labelledby="hub-form-heading" onSubmit={submit}>
        <h2 className="hub-section-title" id="hub-form-heading">参加する</h2>
        <label className="hub-field">
          <span className="hub-label">あなたの名前</span>
          {/* 文字数の上限の正本は `@tasuki/room-core` の `MAX_DISPLAY_NAME`（撤去した poker の
              `NameForm.tsx` から移した）。ここを外すと、超えた名前を送れてしまう ——
              サーバーは弾くが、返る文言は探りを防ぐため理由を伏せてあるので
              （`apps/tasuki-sync/src/application/display-name-rule.ts`）、
              利用者は長すぎることを知る手段が無い。 */}
          <input
            className="hub-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="いずみ"
            autoComplete="nickname"
            maxLength={MAX_DISPLAY_NAME}
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

        {/* 接続の告知が出ている間は error を出さない（二重表示の回避・poker の
            RoomPage.tsx が持っていた扱いを移した）。切れている以上 error は古い情報である。 */}
        {error !== null && connection === 'online' && (
          <p className="hub-error" role="alert">
            {error}
          </p>
        )}

        <button className="hub-submit" type="submit" disabled={connection !== 'online'}>
          参加する
        </button>
      </form>

      {/* ルームに入っていなくても端末の記録は見られる（撤去した旧入口（timer の `Setup`）の性質を保つ）。 */}
      <HistoryLink roomCode={null} />
    </main>
  );
}
