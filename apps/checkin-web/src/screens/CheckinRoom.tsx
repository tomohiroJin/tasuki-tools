/**
 * Check-in Cards のルームの画面（#406）。
 *
 * 参加中・ルームなし・玄関への送り返し・共通の見出し・失敗の一言（3.1）に、やり方の選択・お題の板・席・
 * 手札・下の操作の帯（3.3）、開いた後の画面（RevealBoard・3.5）を組む。
 * ここで名前は聞かない（名乗りは玄関に 1 つだけ・`docs/adr/0018`）。端末に同一性が無い・合言葉を求められたら
 * 玄関のそのルームへ送り返す（コードは落とさない）。
 *
 * - 切断中（`sync.joined` が偽）は卓の操作を押させない（`canOperate`。agenda と同じ）。接続の告知を帯で出す
 * - 開いたことは常に置いた `aria-live` の領域で読み上げる（文だけを差し替える。agenda と同じ）
 * - 画面が替わったら、フォーカスを問いの見出し（選択画面なら選択の見出し）へ移す（`useLandingFocus`）
 */
import { useEffect, useRef, useState } from 'react';
import { METHODS } from '@tasuki/checkin-core';
import { ROOM_HEADER_TEXT, RoomHeader } from '@tasuki/invite-ui';
import { Hand, SpectatorToggle } from '../components/Hand';
import { LoadingView } from '../components/LoadingView';
import { MethodPicker } from '../components/MethodPicker';
import { PromptPanel } from '../components/PromptPanel';
import { RevealBoard } from '../components/RevealBoard';
import { RoundDock } from '../components/RoundDock';
import { SeatRow } from '../components/SeatRow';
import { connectionNotice } from '../connection-notice';
import { CLOSE_BUTTON, GONE_HEADING, GONE_LINK, GONE_TEXT, JOINING_HEADING, PAGE_HEADING } from '../copy';
import { useCheckinSync } from '../hooks/use-checkin-sync';
import { orderedPiles, summaryLine } from '../reveal-view';
import { hubPathFor, redirectTo } from '../router';

/**
 * 画面が替わったとき（`key` が変わったとき）にフォーカスを着地点へ移す。
 * 移すのは**自分の操作で替わったとき**（`markOwnAction` の後）と、**フォーカスが落ちたとき**
 * （押していた札やボタンが消えて body に落ちた。他の人の操作で開いた等）だけ。他の所にあるフォーカスは奪わない。
 */
/** 札の見え方をまだ受けていない（最初のフレームの前） */
const NO_VIEW_KEY = 'none';

function useLandingFocus(key: string) {
  const targetRef = useRef<HTMLHeadingElement>(null);
  const ownActionRef = useRef(false);
  const prevKeyRef = useRef(key);
  useEffect(() => {
    const own = ownActionRef.current;
    const isFirstView = prevKeyRef.current === NO_VIEW_KEY;
    ownActionRef.current = false;
    prevKeyRef.current = key;
    const active = document.activeElement;
    // 最初の画面が出たときは動かさない（読み込んだだけの人のフォーカスを奪わない）
    const isFocusLost = !isFirstView && (active === null || active === document.body);
    // 他の人の操作では画面を動かさない（自分の操作なら着地点まで寄せてよい）
    if (own || isFocusLost) targetRef.current?.focus({ preventScroll: !own });
  }, [key]);
  return {
    targetRef,
    markOwnAction: (): void => {
      ownActionRef.current = true;
    },
  };
}

export function CheckinRoom({ roomCode }: { roomCode: string }) {
  const sync = useCheckinSync(roomCode);
  // 「別のやり方」を押したあとの手元だけの状態。押しても他の人の回は変わらない
  const [picking, setPicking] = useState(false);
  const view = sync.checkin;
  const round = view?.round ?? null;
  const showPicker = view !== null && (round === null || picking);
  // 選択は「見ている回」を置き換える。サーバーはいまの回と違えば何もしない（札の入った新しい回を黙って捨てない）
  const roundSeq = round?.seq ?? null;
  // 選択画面を開いている間に、他の人の操作で回が替わったら閉じる（古い回の上で選び直させない）
  useEffect(() => {
    setPicking(false);
  }, [roundSeq]);
  const focusKey = showPicker ? 'picker' : round === null ? NO_VIEW_KEY : `${round.seq}:${round.status}`;
  const { targetRef, markOwnAction } = useLandingFocus(focusKey);

  // 玄関へ送る。**判定は同期フック、適用はここ 1 箇所**。
  useEffect(() => {
    if (sync.departed !== null) redirectTo(hubPathFor(roomCode, sync.departed));
    else if (sync.needsHub) redirectTo(hubPathFor(roomCode));
  }, [sync.departed, sync.needsHub, roomCode]);

  if (sync.gone) {
    return (
      <main className="ui-page ui-page--prose">
        <h1>{GONE_HEADING}</h1>
        <p>{GONE_TEXT}</p>
        {/* 消えたルームの選択画面へは送らない（そこで名乗っても必ず失敗する） */}
        <a className="ui-button ui-button--quiet" href="/">
          {GONE_LINK}
        </a>
      </main>
    );
  }
  if (sync.needsHub || sync.departed !== null) return <LoadingView />;

  const notice = connectionNotice(sync.notice);
  const banner = notice.kind !== 'none' && (
    <p className={`ui-banner${notice.kind === 'unreachable' ? ' ui-banner--unreachable' : ''}`} role={notice.kind === 'unreachable' ? 'alert' : 'status'}>
      {notice.text}
    </p>
  );

  if (!sync.joined && sync.checkin === null) {
    return (
      <main className="ui-page ui-page--prose">
        <header className="ui-page-header">
          <h1>{JOINING_HEADING}</h1>
          <a className="ui-page-header-back ui-button ui-button--quiet" href={hubPathFor(roomCode)}>
            {ROOM_HEADER_TEXT.back}
          </a>
        </header>
        {banner}
        {sync.retryNotice && (
          <p className="ui-note" role="status">
            {sync.retryNotice}
          </p>
        )}
        {sync.error && (
          <p className="ui-note ui-note--error" role="alert">
            {sync.error}
          </p>
        )}
      </main>
    );
  }

  // 再接続の間は画面を保ち、操作だけを止める（押した操作は入り直しより先に届いて黙って消える）
  const canOperate = sync.joined;
  /** 自分の操作（フォーカスを着地点へ移す印を付けてから行う） */
  const own =
    <A extends unknown[]>(action: (...args: A) => void) =>
    (...args: A): void => {
      markOwnAction();
      action(...args);
    };
  const announcement = round?.status === 'revealed' ? summaryLine(round.method, orderedPiles(round.method, round.piles)) : '';

  return (
    <main className="ui-page ui-page--wide checkin-room">
      <RoomHeader title={PAGE_HEADING} backHref={hubPathFor(roomCode)} roomCode={roomCode} inviteUrl={sync.inviteUrl} />
      {banner}

      {sync.error && (
        <p className="ui-note ui-note--error" role="alert">
          {sync.error}
          <button type="button" className="ui-button ui-button--quiet ui-button--sm" onClick={sync.clearError}>
            {CLOSE_BUTTON}
          </button>
        </p>
      )}

      {view !== null && showPicker && (
        <>
          <MethodPicker
            canOperate={canOperate}
            initialSide={round === null ? 'checkin' : METHODS[round.method].side}
            headingRef={targetRef}
            onChoose={own((method) => {
              setPicking(false);
              sync.chooseMethod(roundSeq ?? 0, method);
            })}
            onDraw={own((side) => {
              setPicking(false);
              sync.drawMethod(roundSeq ?? 0, side);
            })}
            onCancel={round === null ? undefined : own(() => setPicking(false))}
          />
          {round === null && (
            <div className="table-foot">
              <SpectatorToggle spectating={view.spectating} canOperate={canOperate} onSetSpectator={sync.setSpectator} />
            </div>
          )}
        </>
      )}

      {view !== null && round !== null && !showPicker && (
        <div className="table">
          <PromptPanel
            method={round.method}
            visibility={round.visibility}
            locked={round.locked}
            canOperate={canOperate}
            headingRef={targetRef}
            onSetVisibility={(v) => sync.setVisibility(round.seq, v)}
            onChangeMethod={round.status === 'open' ? own(() => setPicking(true)) : undefined}
          />
          {round.status === 'open' && (
            <>
              <SeatRow
                seats={round.seats}
                selfId={view.you}
                progress={{ played: round.playedCount, total: round.playerCount }}
                spectatorCount={view.spectatorCount}
              />
              <Hand
                method={round.method}
                selected={round.yourCard}
                spectating={view.spectating}
                canOperate={canOperate}
                onPlay={(card) => sync.playCard(round.seq, card)}
                onSetSpectator={sync.setSpectator}
              />
            </>
          )}
          {round.status === 'revealed' && (
            <>
              <RevealBoard method={round.method} piles={round.piles} />
              {/* 席の伏せ札は裏返さない（開く動きは山の側だけ）。札の絵も名前もここには載せない。
                  出した人数は出さない（席は名簿どおりに変わり、凍った山の合計と退出で食い違う） */}
              <SeatRow seats={round.seats} selfId={view.you} spectatorCount={view.spectatorCount} />
            </>
          )}
          <RoundDock
            status={round.status}
            canOperate={canOperate}
            onReveal={own(() => sync.reveal(round.seq))}
            onAgain={own(() => sync.playAgain(round.seq))}
            onChangeMethod={own(() => setPicking(true))}
          />
        </div>
      )}

      {/* 開いたことの読み上げ。領域は常に置き、文だけを差し替える（入れた瞬間の領域は読み上げられないことがある） */}
      <p className="ui-visually-hidden checkin-live" aria-live="polite">
        {announcement}
      </p>
    </main>
  );
}
