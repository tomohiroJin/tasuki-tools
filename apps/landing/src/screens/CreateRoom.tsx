import { useId, useRef, useState, type FormEvent } from 'react';
import { MAX_DISPLAY_NAME } from '@tasuki/room-core';
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
  /**
   * 前に作ったルーム名（新しい順・#633）。先頭を欄の初期値にし、全部を候補の札に並べる。
   * 1 つだけでも札は出す —— 要らなければ消せるようにするため。
   */
  readonly recentRoomNames: readonly string[];
  readonly error: string | null;
  /** 同期サーバーへ繋がっているか。繋がっていなければ作成も参加もできない（#76 の回帰防止）。 */
  readonly connection: 'online' | 'reconnecting';
  /**
   * 作成の応答を待っているか（#642 のレビュー）。待つ間は作るボタンを止める ——
   * 名前を変えて送り直せると、成功した 1 つ目の応答で 2 つ目の名前を覚えてしまう。
   */
  readonly creating: boolean;
  onCreate(roomName: string, displayName: string): void;
  /** 候補から 1 つを消す（端末からも消える・#633）。 */
  onForgetRoomName(roomName: string): void;
}

export function CreateRoom({
  departure,
  defaultDisplayName,
  recentRoomNames,
  error,
  connection,
  creating,
  onCreate,
  onForgetRoomName,
}: CreateRoomProps) {
  // 初期値は開いたときの 1 度だけ。以後は利用者の入力が持つ（候補を消しても欄には触らない）
  const [roomName, setRoomName] = useState(() => recentRoomNames[0] ?? '');
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const roomNameRef = useRef<HTMLInputElement>(null);
  const recentHeadingId = useId();

  const forget = (name: string): void => {
    onForgetRoomName(name);
    // 押した札が消えると、フォーカスが行き場を失って文書の頭へ飛ぶ。入力の手を止めないよう欄へ戻す
    roomNameRef.current?.focus();
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    // 未接続なら黙って積まれてしまう（`SyncConnection.send` は捨てずに `pending` へ積む）。
    // ボタンの disabled はクリック以外の送信経路（requestSubmit・支援技術）を防がないので、
    // ここでも同じ判定を持つ（#76 の回帰防止）。
    if (connection !== 'online') return;
    if (creating) return;
    if (displayName.trim() === '') return;
    onCreate(roomName.trim(), displayName.trim());
  };

  return (
    <main className="ui-page ui-page--prose landing">
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
        <p className="hub-notice ui-note" role="status">
          {departure}
        </p>
      )}

      {connection === 'reconnecting' && (
        <p className="hub-error ui-note ui-note--error" role="alert">
          同期サーバーに接続できません。復旧するまで、ルームの作成と参加はできません。
        </p>
      )}

      <form className="hub-form ui-panel" aria-labelledby="hub-form-heading" onSubmit={submit}>
        <h2 className="hub-section-title" id="hub-form-heading">ルームを作る</h2>
        <div className="hub-room-name">
          <label className="hub-field">
            <span className="hub-label">ルーム名</span>
            <input
              ref={roomNameRef}
              className="ui-input"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="朝会モブ"
              autoComplete="off"
            />
          </label>

          {/* 前に作ったルーム名の候補（#633）。選ぶと欄に入るだけで、作成はしない。
              札は `<label>` の外に置く —— 中に置くと、札を押すたびにラベルの働きで欄へ飛ぶ。 */}
          {recentRoomNames.length > 0 && (
            <div className="hub-recent">
              <span className="hub-label" id={recentHeadingId}>
                前に作ったルーム
              </span>
              <ul className="hub-recent-list" aria-labelledby={recentHeadingId}>
                {recentRoomNames.map((name) => (
                  <li key={name} className="hub-recent-item">
                    <button
                      type="button"
                      className="ui-button ui-button--secondary ui-button--sm hub-recent-pick"
                      onClick={() => setRoomName(name)}
                    >
                      <span className="hub-recent-name">{name}</span>
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button--quiet hub-recent-forget"
                      aria-label={`「${name}」を候補から消す`}
                      onClick={() => forget(name)}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <label className="hub-field">
          <span className="hub-label">あなたの名前</span>
          {/* 文字数の上限の正本は `@tasuki/room-core` の `MAX_DISPLAY_NAME`（撤去した poker の
              `NameForm.tsx` から移した）。ここを外すと、超えた名前を送れてしまう ——
              サーバーは弾くが、返る文言は探りを防ぐため理由を伏せてあるので
              （`apps/tasuki-sync/src/application/display-name-rule.ts`）、
              利用者は長すぎることを知る手段が無い。 */}
          <input
            className="ui-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="あや"
            autoComplete="nickname"
            maxLength={MAX_DISPLAY_NAME}
            required
          />
        </label>

        {/* 接続の告知が出ている間は error を出さない（二重表示の回避・poker の
            RoomPage.tsx が持っていた扱いを移した）。切れている以上 error は古い情報である。 */}
        {error !== null && connection === 'online' && (
          <p className="hub-error ui-note ui-note--error" role="alert">
            {error}
          </p>
        )}

        <button className="ui-button ui-button--lg" type="submit" disabled={connection !== 'online' || creating}>
          ルームを作る
        </button>
      </form>

      {/* ルームに入っていなくても端末の記録は見られる（撤去した旧入口（timer の `Setup`）の性質を保つ）。 */}
      <HistoryLink roomCode={null} />
    </main>
  );
}
