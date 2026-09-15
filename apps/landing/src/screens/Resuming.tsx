/**
 * 復帰の返事を待っている間の画面（#95 S5c 追補・利用者の実画面フィードバック）。
 *
 * ツールの「選択画面へ戻る」は `/?room=CODE` で玄関を開く。玄関は接続して復帰が
 * 済むまで `joined` が false なので、そこを「未参加」と読むと**既に参加している人に
 * 「◯◯ に参加します／あなたの名前」を一瞬見せる**。名乗らせずにここで待たせる。
 *
 * **画面は表示に徹する**（`docs/adr/0015` MUST 3・`docs/adr/0019`）。どちらへ落ちるかを
 * 決めるのは `hub/hub-state.ts` の `screenFor` で、ここは結果を描くだけである。
 */
export interface ResumingProps {
  readonly code: string;
  /**
   * 同期サーバーへ繋がっているか。
   *
   * **繋がっていないことを黙らない。** 復帰の返事は接続が戻るまで来ないので、
   * ここを出さないと「読み込んでいます…」だけが理由不明のまま残る。
   */
  readonly connection: 'online' | 'reconnecting';
}

export function Resuming({ code, connection }: ResumingProps) {
  return (
    <main className="page landing">
      <header className="landing-hero">
        <h1 className="wordmark">Tasuki</h1>
        <p className="tagline">
          <span className="hub-room-code">{code}</span>
        </p>
      </header>

      {connection === 'reconnecting' ? (
        <p className="hub-error" role="alert">
          同期サーバーに接続できません。復旧するまで、ルームの作成と参加はできません。
        </p>
      ) : (
        <p className="hub-notice" role="status">
          読み込んでいます…
        </p>
      )}
    </main>
  );
}
