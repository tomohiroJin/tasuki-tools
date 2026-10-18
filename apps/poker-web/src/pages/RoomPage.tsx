// ルーム画面: 入室が成立するまでは待機、成立後は招待リンク + 参加者一覧 + 投票（US1/US2/US4）
//
// **ここで名前は聞かない**（#95 S5c・R9）。名乗る場所は玄関に 1 つだけあり、
// 端末に同一性が無いままここへ来た人は玄関の参加画面へ送り返す。
import { useState } from 'react';
import { useCopyText } from '@tasuki/invite-ui';
import { CardHand } from '../components/CardHand';
import { CurrentTopic, TOPIC_CARD_ID, TOPIC_HIDE, TOPIC_SHOW } from '../components/CurrentTopic';
import { ErrorNote } from '../components/ErrorNote';
import { EstimateItemField } from '../components/EstimateItemField';
import { EstimateLog } from '../components/EstimateLog';
import { EstimateLogFoot } from '../components/EstimateLogFoot';
import { PointsSelect } from '../components/PointsSelect';
import { ParticipantList, PARTICIPANTS_HEADING_ID } from '../components/ParticipantList';
import { Results } from '../components/Results';
import type { PokerSync } from '../hooks/useSync';
import { useRoomEntry } from '../hooks/useRoomEntry';
import { ESTIMATE_POINTS_LABEL, NEXT_ITEM, RECORDING_TOGGLE, REVOTE } from '../estimate-copy';
import { JOIN_VOTING, SPECTATE, SPECTATING_NOTE, participantsHeading } from '../spectator-copy';
import type { NumberCardValue } from '@tasuki/poker-core';
import { isOffline, revealedLiveAfter, seatCardCount, revealedVoteMap, spreadPromptOf } from '../room-view';

interface Props {
  roomId: string;
  sync: PokerSync;
}

/**
 * 入室が成立するまでの待機画面。
 *
 * **撤去前はここが参加フォームだった**（#95 S5c・R9）。名乗りは玄関に 1 つだけになり、
 * ここへ来る人は端末に同一性を持っている —— 画面が待つのは `joined` と最初の
 * `room-state` だけである。
 *
 * それでも**告知の口は残す**。混雑で弾かれている間（#147）とサーバーのエラー（#217）を
 * ここで落とすと、待っている人には何も起きていないようにしか見えない。
 */
function JoiningView({ sync, notice }: { sync: PokerSync; notice: string | null }) {
  return (
    <main className="ui-page ui-page--prose">
      <h1>ルームに参加しています</h1>
      {/* 混雑で弾かれている間、この画面には何の手がかりも出ていなかった（#147）。 */}
      {notice && (
        <p className="error-note ui-note ui-note--error" role="status">
          {notice}
        </p>
      )}
      {/* 入室前にもサーバーのエラーを伝える（#217）。ここが無いと、未知の code も
          server-busy も画面から消える。rate-limited は上の notice が受け持つので
          ErrorNote 側で出さない（二重表示の回避） */}
      <ErrorNote error={sync.error} onClose={sync.clearError} />
    </main>
  );
}

/**
 * 招待リンク。**配るのは選択画面（ハブ）の URL である**（#95 S5b・D11）。
 *
 * S5a で参加用 URL は `/?room=CODE` に決まった（`docs/adr/0018` 決定 2）。poker だけが
 * 旧い `/poker/room/<id>` を配っていると、受け取った人は選択画面を通らずに poker へ
 * 着地し、**ツールを選び直せない**。組み立ては `@tasuki/sync-client` に 1 つあり、
 * **画面は同期フックから受け取る**（画面は同期クライアントを直接 import しない）。
 */
function InviteLink({ url }: { url: string }) {
  const { state: copyState, copy } = useCopyText(url);

  return (
    <div className="ui-invite">
      <span className="ui-invite-url">{url}</span>
      <button type="button" className="ui-button ui-button--secondary ui-button--sm" onClick={copy}>
        {copyState === 'done' && 'コピーしました'}
        {copyState === 'failed' && 'コピーできません（URL を選択してください）'}
        {copyState === 'idle' && '招待リンクをコピー'}
      </button>
    </div>
  );
}

export function RoomPage({ roomId, sync }: Props) {
  // お題の札を見せるか。**手元だけの状態**で、他の人の画面には影響しない。お題が差し替わっても保つ
  // （お題は無いことが多く、あれば見られる程度でよい・#316 PR 1 の利用者の指摘）。
  const [topicOpen, setTopicOpen] = useState(true);
  // 公開を投票中から見届けたか（#348 のレビュー。判断と理由は `room-view.ts` の `revealedLiveAfter`）。
  // 前の描画の状態と比べて決める（描画中に状態を調整する React の型。状態が変わったときだけ書き換える）。
  const roundStatus = sync.snapshot?.round.status;
  const [seenStatus, setSeenStatus] = useState(roundStatus);
  const [revealedLive, setRevealedLive] = useState(false);
  if (roundStatus !== seenStatus) {
    setSeenStatus(roundStatus);
    setRevealedLive(revealedLiveAfter(seenStatus, roundStatus));
  }
  // 入口の振り分け・自動の復帰・混雑の入り直し・消えたルームの組の破棄は同期フックの仕事（#369）。
  const { retryNotice } = useRoomEntry(sync, roomId);

  // room-not-found はページ全体をエラー表示に（FR-015 / US1-AS3）
  if (sync.error?.code === 'room-not-found') {
    return (
      <main className="ui-page ui-page--prose">
        <h1>ルームが見つかりません</h1>
        <p>ルームは終了したか、リンクが正しくない可能性があります。</p>
        {/* **消えたルームの選択画面へは送らない。** ハブはそこで存在しないルームの
            参加画面を出し、名乗っても必ず失敗する（timer の `SessionLost` と同じ扱い）。 */}
        <a className="ui-button ui-button--quiet" href="/">トップへ戻る</a>
      </main>
    );
  }

  const { snapshot } = sync;
  if (!snapshot || snapshot.roomId !== roomId) {
    return <JoiningView sync={sync} notice={retryNotice} />;
  }

  const isVoting = snapshot.round.status === 'voting';
  // 公開後の票を席の札へ渡す（`room-view.ts` の `revealedVoteMap`）
  const revealedVotes = revealedVoteMap(snapshot.round);
  const inviteUrl = sync.inviteUrl(roomId);
  const estimateLog = snapshot.estimate?.log ?? [];
  // 記録するか。estimate が無い（古いサーバー）・recording が無いときは「する」と読む（#427・J9）
  const recording = snapshot.estimate?.recording ?? true;
  // ポイントを添えられるのは、記録していて、点を付ける open の束があるときだけ（J8）
  const canAttachPoints = recording && estimateLog.some((g) => g.open);
  const offline = isOffline(sync.status);
  const you = snapshot.participants.find((p) => p.id === snapshot.you);
  const youSpectating = you?.spectator === true;
  const spectatorCount = snapshot.participants.filter((p) => p.spectator).length;
  // 結果の待ち（`--seat-count`）は札を出す席だけで数える（席の一覧と同じ述語・`room-view.ts`）
  const seatCount = seatCardCount(snapshot.participants, revealedVotes);

  return (
    <main className="ui-page ui-page--wide room">
      <header>
        {/* 見出しと戻る導線を 1 行に組む（#95 S5c 追補・利用者の実画面フィードバック）。
            素のリンクを招待リンクの塊の上へ置くと、どこへ属する操作か分からず浮いていた。
            timer は `StatusStrip` の中に収めてあるので、こちらも見出しの相方にする。 */}
        <div className="ui-page-header">
          {/* 見出しと切り替えを 1 つの塊にする。`.ui-page-header` は子を両端に振り分けるので、
              子が 3 つだと戻る導線が真ん中に浮く（#316 PR 1）。 */}
          <div className="room-title">
            <h1>プランニングポーカー</h1>
            {/* お題があるときだけ。隠すのは札を閉じて `inert` にする（DOM には残す。残すから滑って閉じられる・#348）。シートは札の中の `<dialog>` で、
                開いている間はモーダルなので、この切り替えは押せない（フォーカスが失われる経路が無い）。
                ただし切り替えのボタンにフォーカスがあるまま他の人がお題を下ろすと、ボタンごと消えて
                フォーカスが body に落ちる（受け入れた限界・札の場合と同じ）。 */}
            {sync.topic && (
              <button
                type="button"
                className="ui-button ui-button--secondary ui-button--sm"
                aria-expanded={topicOpen}
                // 閉じても札は DOM に残る（高さ 0・`inert`）ので、指し先はいつも在る
                aria-controls={TOPIC_CARD_ID}
                onClick={() => setTopicOpen((open) => !open)}
              >
                {topicOpen ? TOPIC_HIDE : TOPIC_SHOW}
              </button>
            )}
            {/* 記録のしくみ全体を出し入れする（#427・設計 D）。押した状態が「記録する」。ルーム全員に効く */}
            <button
              type="button"
              className="ui-button ui-button--secondary ui-button--sm"
              aria-pressed={recording}
              onClick={() => sync.setRecording(!recording)}
              disabled={offline}
            >
              {RECORDING_TOGGLE}
            </button>
          </div>
          {/* 選択画面へ戻る導線。旧入口（poker のトップ画面等）が撤去され、他に戻る
              手段が無い（利用者の申し送り・2026-09-14）。行き先は招待リンクと同じ
              **同じルームの選択画面**（玄関まで戻すとルームから出たことになる）ので、
              組み立ては増やさず sync.inviteUrl を再利用する。 */}
          <a className="ui-page-header-back ui-button ui-button--quiet" href={inviteUrl}>
            選択画面へ戻る
          </a>
        </div>
        <InviteLink url={inviteUrl} />
      </header>
      <ErrorNote error={sync.error} onClose={sync.clearError} />
      {/* 段組み（#316・ADR 0025）。64rem 以上は左に読む面（お題）・右に操作の面（場 → 手札 → 結果）。
          DOM は狭い幅で見せたい順（お題 → 場 → 手札 → 記録の足）。脇（`.room-side`）は常に出し、中にお題の札（隠すのは札の包みだけ。
          DOM に残し `data-state="closed"`・`inert`）と記録を持つ。64rem 以上は列が動かず、64rem 未満は記録を足の側が出す
          （幅の出し分けは index.css・#93）。 */}
      <div className="ui-workspace ui-workspace--reader">
        {/* 記録しない間は記録を描かない。お題の札も無ければ脇ごと描かない（空の列を残さない・#427） */}
        {(sync.topic || recording) && (
        <div className="ui-workspace-side room-side">
          {sync.topic && (
            <div className="room-topic-side" data-state={topicOpen ? 'open' : 'closed'} inert={!topicOpen}>
              <CurrentTopic topic={sync.topic} />
            </div>
          )}
          {recording && (
            <EstimateLog
              className="room-log--side"
              scrollable
              groups={estimateLog}
              onSetPoints={sync.setPoints}
              onRenameGroup={sync.renameGroup}
              disabled={offline}
            />
          )}
        </div>
        )}
        <div className="ui-workspace-main room-main">
          <section>
            <div className="room-participants-head">
              <h2 id={PARTICIPANTS_HEADING_ID} tabIndex={-1}>{participantsHeading(snapshot.participants.length, spectatorCount)}</h2>
              {/* 自分の切り替え。投票中も開票後も出す（#419・設計 §5.2） */}
              <button
                type="button"
                className="ui-button ui-button--secondary ui-button--sm"
                onClick={() => sync.setSpectator(!youSpectating)}
                disabled={offline}
              >
                {youSpectating ? JOIN_VOTING : SPECTATE}
              </button>
            </div>
            <ParticipantList
              participants={snapshot.participants}
              you={snapshot.you}
              votes={revealedVotes}
              onRemove={sync.removeParticipant}
              offline={offline}
            />
          </section>
          {/* 欄と足の記録は投票中と開票後で同じ位置に置き、描き分けるのは本体（手札か結果）と帯だけにする。
              状態ごとに別の部品で包むと、替わるたびに欄と足が作り直され、打ちかけの名前・フォーカス・
              開いていたシートが消える（#93 最終レビュー）。 */}
          {/* key は閉じた束の最大 ID（束の ID は振り直されず増えるだけなので、上限で古い束が落ちても束が閉じるたびに変わる）。編集中に境目を越えたら欄を作り直し、
              前のアイテムの打ちかけを新しいアイテムへ送らない。名前だけの変更では変わらない */}
          {recording && (
            <EstimateItemField
              key={(snapshot.estimate?.log ?? []).reduce((max, g) => (g.open ? max : Math.max(max, g.id)), 0)}
              item={snapshot.estimate?.item ?? ''}
              onCommit={sync.setItem}
              disabled={offline}
            />
          )}
          {snapshot.round.status === 'voting' ? (
            <section>
              <h2>あなたのカード</h2>
              {youSpectating ? (
                <p>{SPECTATING_NOTE}</p>
              ) : (
                <CardHand selected={snapshot.yourVote} onSelect={sync.vote} disabled={offline} />
              )}
            </section>
          ) : (
            <Results
              stats={snapshot.round.stats}
              seatCount={seatCount}
              afterFlip={revealedLive}
              spread={spreadPromptOf(snapshot.round, snapshot.participants)}
            />
          )}
          {/* 下端の帯（sticky）は親の範囲の中でしか留まらないので、帯は操作の面（`.room-main`）の最後の子に置き、
              足の記録はその手前に置く（帯が記録の末尾を覆わないように） */}
          {recording && (
            <EstimateLogFoot groups={estimateLog} onSetPoints={sync.setPoints} onRenameGroup={sync.renameGroup} disabled={offline} />
          )}
          {isVoting ? (
            <VotingDock sync={sync} disabled={offline} />
          ) : (
            <RevealedDock sync={sync} disabled={offline} canAttachPoints={canAttachPoints} />
          )}
        </div>
      </div>
    </main>
  );
}

/** 投票中の帯。かつてはホストだけに出ていたが、#95 S3 でホストを廃止し全参加者へ開放した */
function VotingDock({ sync, disabled }: { sync: PokerSync; disabled: boolean }) {
  return (
    <div className="ui-actions ui-actions--dock">
      <button type="button" className="ui-button ui-button--lg" onClick={sync.reveal} disabled={disabled}>
        票を公開する
      </button>
    </div>
  );
}

/** 開票後の帯。再投票（主・最後）と次のアイテムへ（副）は意味の違う 2 操作（#93・spec §4.3） */
function RevealedDock({ sync, disabled, canAttachPoints }: { sync: PokerSync; disabled: boolean; canAttachPoints: boolean }) {
  // 「次のアイテムへ」に添える点数。押したら空へ戻す（再投票で投票中へ戻ると帯ごと外れて空に戻る）
  const [points, setPoints] = useState<NumberCardValue | null>(null);
  return (
    <div className="ui-actions ui-actions--dock">
      {canAttachPoints && (
        <PointsSelect
          value={points}
          onChange={setPoints}
          emptyLabel={ESTIMATE_POINTS_LABEL}
          label={ESTIMATE_POINTS_LABEL}
          disabled={disabled}
        />
      )}
      <button
        type="button"
        className="ui-button ui-button--secondary ui-button--lg"
        onClick={() => {
          sync.nextItem(points);
          setPoints(null);
        }}
        disabled={disabled}
      >
        {NEXT_ITEM}
      </button>
      <button type="button" className="ui-button ui-button--lg" onClick={sync.revote} disabled={disabled}>
        {REVOTE}
      </button>
    </div>
  );
}
