// ルーム画面: 入室が成立するまでは待機、成立後は招待リンク + 参加者一覧 + 投票（US1/US2/US4）
//
// **ここで名前は聞かない**（#95 S5c・R9）。名乗る場所は玄関に 1 つだけあり、
// 端末に同一性が無いままここへ来た人は玄関の参加画面へ送り返す。
import { useState } from 'react';
import { useCopyText } from '@tasuki/invite-ui';
import type { RoomStateMessage } from '@tasuki/poker-core';
import { CardHand } from '../components/CardHand';
import { CurrentTopic, TOPIC_CARD_ID, TOPIC_HIDE, TOPIC_SHOW } from '../components/CurrentTopic';
import { ErrorNote } from '../components/ErrorNote';
import { ParticipantList } from '../components/ParticipantList';
import { Results } from '../components/Results';
import type { PokerSync } from '../hooks/useSync';
import { useRoomEntry } from '../hooks/useRoomEntry';

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
  // 公開を投票中から見届けたか（#348 のレビュー）。席の札が CSS の transition でめくれるのは、投票中の札が
  // 描かれていて、それが公開に変わったときだけ。再読み込み・途中入室・再接続で最初から公開済みで描くと、札は
  // めくれずに表で出る。集計を最後の札のめくりの後まで待たせるのも、この同じ条件のときだけにする。
  // 前の描画の状態と比べて決める（描画中に状態を調整する React の型。状態が変わったときだけ書き換える）。
  const roundStatus = sync.snapshot?.round.status;
  const [seenStatus, setSeenStatus] = useState(roundStatus);
  const [revealedLive, setRevealedLive] = useState(false);
  if (roundStatus !== seenStatus) {
    setSeenStatus(roundStatus);
    setRevealedLive(seenStatus === 'voting' && roundStatus === 'revealed');
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
  // 公開後の票を席の札へ渡す（席の数は小さいので useMemo は要らない）
  const revealedVotes =
    snapshot.round.status === 'revealed'
      ? new Map(snapshot.round.votes.map((v) => [v.participantId, v.card]))
      : null;
  const inviteUrl = sync.inviteUrl(roomId);

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
                // 閉じても札は DOM に残る（幅 0・`inert`）ので、指し先はいつも在る
                aria-controls={TOPIC_CARD_ID}
                onClick={() => setTopicOpen((open) => !open)}
              >
                {topicOpen ? TOPIC_HIDE : TOPIC_SHOW}
              </button>
            )}
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
          DOM は狭い幅で見せたい順（お題 → 場 → 手札）。隠した脇は DOM に残し（`data-state="closed"`・`inert`）、
          64rem 以上では段組みが列を 2 本のまま持って脇の列を幅 0 へ移り変わらせる。お題が無いときは脇が無い。
          どちらも操作の面は約 46rem で中央に寄る（幅・中央寄せ・移り変わりは index.css の `.room-main` が持つ・#348）。 */}
      <div className="ui-workspace ui-workspace--reader">
        {sync.topic && (
          <div
            className="ui-workspace-side room-topic-side"
            data-state={topicOpen ? 'open' : 'closed'}
            inert={!topicOpen}
          >
            <CurrentTopic topic={sync.topic} />
          </div>
        )}
        <div className="ui-workspace-main room-main">
          <section>
            <h2>参加者（{snapshot.participants.length}人）</h2>
            <ParticipantList participants={snapshot.participants} you={snapshot.you} votes={revealedVotes} />
          </section>
          {isVoting ? (
            <VotingSection snapshot={snapshot} sync={sync} />
          ) : (
            <RevealedSection snapshot={snapshot} sync={sync} revealedLive={revealedLive} />
          )}
        </div>
      </div>
    </main>
  );
}

function VotingSection({
  snapshot,
  sync,
}: {
  snapshot: RoomStateMessage;
  sync: PokerSync;
}) {
  // 切断・再接続中は操作を受け付けない（送信しても届かないため）
  const offline = sync.status !== 'open';
  return (
    <>
      <section>
        <h2>あなたのカード</h2>
        <CardHand selected={snapshot.yourVote} onSelect={sync.vote} disabled={offline} />
      </section>
      {/* かつてはホストだけに出ていたが、#95 S3 でホストを廃止し全参加者へ開放した。
          下端の帯（sticky）は親の範囲の中でしか留まらないので、節の中ではなく操作の面（`.room-main`）の最後の子に置く。 */}
      <div className="ui-actions ui-actions--dock">
        <button type="button" className="ui-button ui-button--lg" onClick={sync.reveal} disabled={offline}>
          票を公開する
        </button>
      </div>
    </>
  );
}

function RevealedSection({
  snapshot,
  sync,
  revealedLive,
}: {
  snapshot: RoomStateMessage;
  sync: PokerSync;
  /** 公開を投票中から見届けた（席の札がめくれる）。集計の待ちはこのときだけ */
  revealedLive: boolean;
}) {
  if (snapshot.round.status !== 'revealed') return null;
  const { stats } = snapshot.round;
  const offline = sync.status !== 'open';

  return (
    <>
      <Results stats={stats} seatCount={snapshot.participants.length} afterFlip={revealedLive} />
      {/* かつてはホストだけに出ていたが、#95 S3 でホストを廃止し全参加者へ開放した */}
      <div className="ui-actions ui-actions--dock">
        {/* 再投票と次ラウンドはドメイン上同一操作（next-round）。ラベルのみ区別（FR-011）。主は最後 */}
        <button type="button" className="ui-button ui-button--secondary ui-button--lg" onClick={sync.nextRound} disabled={offline}>
          次のラウンドへ
        </button>
        <button type="button" className="ui-button ui-button--lg" onClick={sync.nextRound} disabled={offline}>
          再投票
        </button>
      </div>
    </>
  );
}
