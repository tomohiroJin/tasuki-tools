import { useId, useState, type FormEvent } from 'react';
import { MAX_PASSPHRASE } from '@tasuki/room-core';

/**
 * ルームの合言葉の設定・変更・解除（#638）。選択画面（`RoomChoice`）の一角に置く。
 *
 * 合言葉が守るのは**ルーム全体**（どの道具から入る新しい参加にも求める）で、かつて設定の口だけが
 * timer の画面に在った。ルームの入口である玄関へ移した。**ルームに居る誰でも**設定・変更・解除できる
 * （役割は持たない・#95）。すでに入っている人は、合言葉が変わっても入り直しを求められない。
 *
 * - 「付いているか」は名簿の印（`passphraseProtected`）から映す。**合言葉そのものは画面にも状態にも残さない**
 *   —— 送ったら入力欄を空に戻す。
 * - 上限（`MAX_PASSPHRASE`）の正本は `@tasuki/room-core`（参加画面の合言葉の欄と同じ・#377）。
 * - 同期サーバーに繋がっていない間は押せない。繋がっていないと送信が黙って積まれる（参加画面と同じ扱い・#76）。
 */
export interface RoomPassphraseProps {
  /** そのルームに合言葉が付いているか（名簿の印）。null は「まだ分からない」（名簿が届くまで・古いサーバー）。 */
  readonly protectedNow: boolean | null;
  /** 設定の失敗の文言（無ければ null）。 */
  readonly error: string | null;
  readonly connection: 'online' | 'reconnecting';
  /** 設定・変更。空文字で解除。 */
  onSet(passphrase: string): void;
}

export function RoomPassphrase({ protectedNow, error, connection, onSet }: RoomPassphraseProps) {
  const [value, setValue] = useState('');
  // 設定する人は少なく、説明が長い。ふだんは状態の一言だけの 1 行にたたみ、押したときだけ設定の口を開く（#673）
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const bodyId = useId();
  // 状態が分かるまでは押せない。付いている合言葉を、付いていないと思って黙って上書きしないため。
  const online = connection === 'online' && protectedNow !== null;
  // 空白だけの値は解除と同じ意味になる（サーバーが前後の空白を落とす）。設定の口からは送らせない —— 解除は専用の
  // ボタンから。取り違えて外してしまわないため。
  const canSubmit = online && value.trim() !== '';

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!canSubmit) return;
    onSet(value);
    setValue('');
  };

  return (
    <section className="hub-panel ui-panel hub-passphrase" aria-labelledby={headingId}>
      <div className="hub-passphrase-head">
        <h2 className="hub-heading" id={headingId}>合言葉</h2>
        {/* 状態の変化（設定した・外れた）を読み上げる。`role="status"` にしない —— 招待のコピーの結果（`role="status"`）と
              並ぶと、画面に status が 2 つ在って取り違える（既存の検査も 1 つを前提にする）。 */}
        <p className="hub-passphrase-status ui-note" aria-live="polite">
          {protectedNow === null
            ? '合言葉の状態を調べています…'
            : protectedNow
              ? '合言葉を設定中です。新しく入る人には合言葉が要ります。'
              : '合言葉は付いていません。ルームコードを知っている人は、だれでも入れます。'}
        </p>
        <button type="button" className="ui-button ui-button--quiet" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
          {open ? '閉じる' : protectedNow === true ? '変更・解除' : '設定する'}
        </button>
      </div>
      {/* 失敗はたたんだままでも見せる（口を閉じたあとに届くことがある） */}
      {error !== null && (
        <p className="hub-error ui-note ui-note--error" role="alert">
          {error}
        </p>
      )}
      <div id={bodyId} hidden={!open} className="hub-passphrase-body">
      <form className="hub-passphrase-form" onSubmit={submit}>
        <label className="hub-field">
          <span className="hub-label">新しい合言葉</span>
          <input
            className="ui-input"
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            maxLength={MAX_PASSPHRASE}
          />
        </label>
        <div className="ui-actions">
          {protectedNow === true && (
            <div className="ui-actions-start">
              <button type="button" className="ui-button ui-button--secondary" disabled={!online} onClick={() => onSet('')}>
                解除
              </button>
            </div>
          )}
          <button type="submit" className="ui-button ui-button--secondary" disabled={!canSubmit}>
            {protectedNow === true ? '変更' : '設定'}
          </button>
        </div>
      </form>
      <p className="hub-passphrase-note ui-note">
        ルームに参加している人なら、だれでも設定・変更・解除できます。すでに入っている人は、変えても入り直す必要はありません。
      </p>
      </div>
    </section>
  );
}
