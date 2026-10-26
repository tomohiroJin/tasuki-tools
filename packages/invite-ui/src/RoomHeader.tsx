import { useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
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

/** QR のカードを画面の端から離す幅（px）。ページの左右の余白（`--space-4`）と同じ。 */
const QR_EDGE_PX = 16;

/**
 * ルーム画面の見出し・戻るリンク・ルームコード・参加用 URL をまとめて組む（#447 段 1）。
 *
 * 5 つのアプリの写しを 1 つにまとめるための部品。QR は普段は閉じておき、開くまで生成ライブラリを読まない。
 * 戻り値の型は書かない（グローバルの `JSX` 名前空間に頼らない）。
 */
export function RoomHeader({ title, backHref, roomCode, inviteUrl, titleExtras }: RoomHeaderProps) {
  const qrId = useId();
  const shareId = useId();
  const [open, setOpen] = useState(false);
  // 狭い幅でたたむ招待の行の開閉。QR の開閉（`open`）とは別の状態。
  const [shareOpen, setShareOpen] = useState(false);
  const qr = useInviteQr(inviteUrl, open);
  // QR は画面の上に浮かべる（開いても下の画面を押し下げない）。浮かぶ物なので、Esc・外側を押す・Tab で外へ出ると閉じる。
  const qrAnchorRef = useRef<HTMLDivElement>(null);
  const qrToggleRef = useRef<HTMLButtonElement>(null);
  const qrCardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!qrAnchorRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [open]);
  // カードはボタンの左端から出す。URL が長くてボタンが行の右端へ押されると画面の外へ切れるので、開いたときに測って内側へ寄せる。
  useLayoutEffect(() => {
    const card = qrCardRef.current;
    if (!open || !card) return;
    card.style.setProperty('--ui-room-header-qr-shift', '0px');
    const { left, right } = card.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const shift = right > viewport - QR_EDGE_PX
      ? viewport - QR_EDGE_PX - right
      : left < QR_EDGE_PX ? QR_EDGE_PX - left : 0;
    card.style.setProperty('--ui-room-header-qr-shift', `${shift}px`);
    // 画像が出る・作れないと分かるとカードの幅が変わるので、そのたびに測り直す。
  }, [open, qr.dataUrl, qr.failed]);
  // Esc は QR の中（ボタン）にフォーカスがあるときだけ拾う。画面の他の欄の Esc と、変換を取り消す Esc は奪わない。
  const closeQrOnEscape = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open || event.key !== 'Escape' || event.nativeEvent.isComposing) return;
    setOpen(false);
    qrToggleRef.current?.focus();
  };
  const closeQrOnFocusLeave = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next && !qrAnchorRef.current?.contains(next)) setOpen(false);
  };
  const copy = useCopyText(inviteUrl);

  const qrStatus = open && !qr.dataUrl ? (qr.failed ? ROOM_HEADER_TEXT.qrFailed : ROOM_HEADER_TEXT.qrPreparing) : '';

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
      <button
        type="button"
        className="ui-button ui-button--secondary ui-button--sm ui-room-header-share-toggle"
        aria-expanded={shareOpen}
        aria-controls={shareId}
        onClick={() => setShareOpen((value) => !value)}
      >
        {ROOM_HEADER_TEXT.inviteToggle}
      </button>
      <div id={shareId} className="ui-room-header-share" data-open={shareOpen ? 'true' : undefined}>
        <div className="ui-room-header-invite">
          <p className="ui-room-header-code">
            <span className="ui-room-header-code-label">{ROOM_HEADER_TEXT.roomLabel}</span>{' '}
            <span className="ui-room-header-code-value">{roomCode}</span>
          </p>
          <div className="ui-invite">
            <span className="ui-invite-url">{inviteUrl}</span>
            {/* ボタンと浮かぶ QR を包む。外側を押したかの判定と、QR を浮かべる位置の基準にする。 */}
            <div ref={qrAnchorRef} className="ui-room-header-qr-anchor" onKeyDown={closeQrOnEscape} onBlur={closeQrOnFocusLeave}>
              <button
                ref={qrToggleRef}
                type="button"
                className="ui-button ui-button--secondary ui-button--sm"
                aria-expanded={open}
                aria-controls={qrId}
                onClick={() => setOpen((value) => !value)}
              >
                {open ? ROOM_HEADER_TEXT.qrHide : ROOM_HEADER_TEXT.qrShow}
              </button>
              <div ref={qrCardRef} id={qrId} hidden={!open} className="ui-room-header-qr">
                {qr.dataUrl && <img src={qr.dataUrl} width="200" height="200" alt={ROOM_HEADER_TEXT.qrAlt} />}
                {/* 見える字。読み上げは下の知らせが読むので、二重に読ませない。 */}
                {!qr.dataUrl && <p className="ui-note ui-room-header-qr-status" aria-hidden="true">{qrStatus}</p>}
              </div>
              {/* 読み上げの知らせ。隠れた欄の中だと読み上げの木に入らないので、欄の外に常に置き、字だけを差し替える。
                  role="status" にしないのは、各画面が自分の知らせを status として持つため（1 画面に status が 2 つ並ぶ）。 */}
              <p className="ui-visually-hidden ui-room-header-qr-live" aria-live="polite">{qrStatus}</p>
            </div>
            <button
              type="button"
              className="ui-button ui-button--secondary ui-button--sm"
              onClick={() => { void copy.copy(); }}
            >
              {copyLabel}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
