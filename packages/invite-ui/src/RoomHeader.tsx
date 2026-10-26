import { useId, useState, type ReactNode } from 'react';
import { ROOM_HEADER_TEXT } from './room-header-copy.js';
import { useCopyText } from './use-copy-text.js';
import { useInviteQr } from './use-invite-qr.js';

export interface RoomHeaderProps {
  /** 画面の見出し（h1）。 */
  readonly title: string;
  /** 戻るリンクの行き先（選択画面）。 */
  readonly backHref: string;
  readonly roomCode: string;
  /** 参加用 URL。QR とコピーの元になる。 */
  readonly inviteUrl: string;
  /** 道具に固有のボタンなど。見出しの隣に置く（戻るリンクの位置は変わらない）。 */
  readonly titleExtras?: ReactNode;
}

/**
 * ルーム画面の見出し・戻るリンク・ルームコード・参加用 URL をまとめて組む（#447 段 1）。
 *
 * 5 つのアプリの写しを 1 つにまとめるための部品。QR は普段は閉じておき、開くまで生成ライブラリを読まない。
 * 戻り値の型は書かない（グローバルの `JSX` 名前空間に頼らない）。
 */
export function RoomHeader({ title, backHref, roomCode, inviteUrl, titleExtras }: RoomHeaderProps) {
  const qrId = useId();
  const [open, setOpen] = useState(false);
  const qr = useInviteQr(inviteUrl, open);
  const copy = useCopyText(inviteUrl);

  const copyLabel = copy.state === 'done'
    ? ROOM_HEADER_TEXT.copied
    : copy.state === 'failed'
      ? ROOM_HEADER_TEXT.copyFailed
      : ROOM_HEADER_TEXT.copy;

  return (
    <header className="ui-room-header">
      <div className="ui-page-header">
        <div className="ui-room-header-title">
          <h1>{title}</h1>
          {titleExtras}
        </div>
        <a className="ui-page-header-back ui-button ui-button--quiet" href={backHref}>{ROOM_HEADER_TEXT.back}</a>
      </div>
      <div className="ui-room-header-invite">
        <p className="ui-room-header-code">
          <span className="ui-room-header-code-label">{ROOM_HEADER_TEXT.roomLabel}</span>{' '}
          <span className="ui-room-header-code-value">{roomCode}</span>
        </p>
        <div className="ui-invite">
          <span className="ui-invite-url">{inviteUrl}</span>
          <button
            type="button"
            className="ui-button ui-button--secondary ui-button--sm"
            aria-expanded={open}
            aria-controls={qrId}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? ROOM_HEADER_TEXT.qrHide : ROOM_HEADER_TEXT.qrShow}
          </button>
          <button
            type="button"
            className="ui-button ui-button--secondary ui-button--sm"
            onClick={() => { void copy.copy(); }}
          >
            {copyLabel}
          </button>
        </div>
      </div>
      <div id={qrId} hidden={!open} className="ui-room-header-qr">
        {qr.dataUrl && <img src={qr.dataUrl} width="200" height="200" alt={ROOM_HEADER_TEXT.qrAlt} />}
        {open && !qr.dataUrl && (
          <p className="ui-note" role="status">{qr.failed ? ROOM_HEADER_TEXT.qrFailed : ROOM_HEADER_TEXT.qrPreparing}</p>
        )}
      </div>
    </header>
  );
}
