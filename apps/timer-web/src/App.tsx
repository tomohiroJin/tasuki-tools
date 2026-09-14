/**
 * メインアプリコンポーネント。
 *
 * **表示に徹する**（`docs/adr/0015` MUST 3）。WS の接続状態とメッセージ配線は
 * `sync/use-timer-sync.ts` が持ち、このファイルは同期クライアント（`SyncClient`）を
 * 直接 import しない（同 MUST 2）。ここに残るのは、画面の関心である描画・スクロール・
 * 自分の表示名の導出・クリップボード I/O だけである。
 */

import React, { useEffect, useState } from "react";
import { decideEntry } from "./ui/entry.js";
import { currentSearch, navigateTo, redirectTo } from "./platform/location.js";
import { Lobby } from "./ui/Lobby.js";
import { Session } from "./ui/Session.js";
import { Summary } from "./ui/Summary.js";
import { SessionLost } from "./ui/SessionLost.js";
import { History } from "./ui/History.js";
import { StatusStrip } from "./ui/components/StatusStrip.js";
import { deriveConnectionStatus } from "./ui/connection-status.js";
import { Stage } from "./ui/primitives.js";
import { useBanner } from "./ui/use-banner.js";
import { useTimerSync } from "./sync/use-timer-sync.js";
import { formatProblemText } from "./ui/problem-text.js";
// 注: `records/indexeddb.js` は import しない。永続化は同期フックの
// `saveRecordManually` を通す（画面は表示に徹する・ADR-0015 MUST 3）。

export default function App() {
  // バナーは同期フックと画面の両方が出す（前者は WS 由来、後者は記録保存の失敗）。
  // コントローラを 1 つ作って共有する（ADR-0015 MUST 2 の対象外・use-banner.ts 参照）。
  const bannerController = useBanner();
  const sync = useTimerSync(bannerController);
  const { banner } = bannerController;

  // 玄関・選択画面からの入口判定（#95 S5c）。mount 時の URL で 1 度だけ決める。
  // sync 側の ?room= 処理が後から mode を書き換えても、明示的に開いた履歴は保つ。
  //
  // **`kind: "redirect"` の適用（行き先の無い URL を玄関へ送る）は同期フックが持つ**
  // （`sync/use-timer-sync.ts` の入口の effect）。判定はこの 1 つの関数、適用は 1 箇所。
  const [entry] = useState(() => decideEntry(currentSearch()));

  const {
    mode,
    room,
    participantId,
    record,
    endType,
    sessionLost,
    connState,
    syncStale,
    generatingProblem,
    commands,
  } = sync;

  // 画面遷移時は先頭へスクロールする（ロビー→セッションでタイマーが最上部に来るように・⑨）。
  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, [mode]);

  // 共有時の操作はすべて WS コマンド送信（サーバーが状態をミラーし全員へ反映）。
  // セッション画面が使ってよいのは 4 値だけ。開始（START）はロビーの開始処理が送る。
  const act = (action: "SWITCH" | "PAUSE" | "RESUME" | "RESTART") => commands.actSession(action);

  // ─── お題のコピー/貼り付け ─────────────────────────────────────────────────
  // クリップボードの I/O であって WS 配線ではないので、同期フックへは入れない
  // （ADR-0015 MUST 2 の対象は接続状態とメッセージ配線）。

  const copyProblem = () => {
    const p = room?.problem;
    if (!p || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(formatProblemText(p)).catch(() => {
      /* 権限拒否等は無視 */
    });
  };

  const pasteProblem = () => {
    // 自前のお題を持ち込む（FR-040）。クリップボードから取り込み、1行目をタイトル・
    // 残りを説明として編集経路へ反映する（共有/ソロ共通の problem.edit を再利用）。
    if (!navigator.clipboard?.readText) return;
    navigator.clipboard
      .readText()
      .then((text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const [first = "", ...rest] = trimmed.split("\n");
        commands.editProblem({
          title: first.trim(),
          description: rest.join("\n").trim(),
        });
      })
      .catch(() => {
        /* 権限拒否等は無視 */
      });
  };

  // StatusStrip 用に「自分」の表示名を導出する。
  const self = room?.participants.find((p) => p.participantId === participantId);
  const selfName = self?.displayName ?? room?.config.members[0] ?? "あなた";
  // 接続状態: 喪失が最優先、それ以外は WS クライアントの通知に従う（R5-1）。
  // 接続が生きていても、契約に合わないフレームを捨てて画面が古いままなら
  // 「同期不整合」を出す（#209）。
  const connectionStatus = deriveConnectionStatus(sessionLost, connState, syncStale);

  /** セッション/ロビーはダークステージ固定。Summary は通常テーマ。 */
  const renderBody = () => {
    // 玄関・選択画面から明示的に開かれた履歴は、ルームの状態と無関係に最優先で出す
    // （#95 S5c・端末ローカルの記録はルームが無くても見られる、という旧入口の性質を保つ）。
    if (entry.kind === "history") {
      return <History onBack={() => navigateTo(entry.backTo)} />;
    }

    // ルームが消えた以上、ロビー・セッション・完了の操作はどれも効かない（#76 F-4）。
    // 履歴は端末ローカルなので喪失しても見られる。ここで先に分岐して、
    // 押しても何も起きない画面を残さない。
    if (sessionLost) {
      return (
        <SessionLost
          code={room?.code}
          // ルームはもう無いので、ロビーへ戻す `phase.set` は誰にも届かない
          // （#95 S5c・C-1）。ここだけは玄関へ送って作り直してもらう。
          // **`replace` で送る** —— 押した時点の URL は消えたルームで、履歴に積むと
          // 戻るボタン 1 回でまた `ROOM_NOT_FOUND` を踏む。
          onNewSession={() => redirectTo("/")}
          // 記録は URL が決める画面になった（#95 S5c）。**いまのツールの中で**開くので
          // 相対の検索文字列で送る（`/timer/` という公開パスをここへ書かない）。
          // 綴りの対は `ui/entry.ts` の `?view=history` と、玄関の `HistoryLink`。
          onShowHistory={() => navigateTo("?view=history")}
        />
      );
    }

    if (mode === "lobby" && room) {
      return (
        <Lobby
          key={room.code}
          room={room}
          inviteUrl={sync.inviteUrl ?? ''}
          participantId={participantId}
          generatingProblem={generatingProblem}
          onStartSession={sync.startSession}
          onEditProblem={commands.editProblem}
          onRegenerateProblem={sync.regenerateProblem}
          onPasteProblem={pasteProblem}
          onCopyProblem={copyProblem}
          onConfigSet={commands.setConfig}
          onJoinRotation={commands.addMember}
          onLeaveRotation={commands.removeMember}
          onRemoveParticipant={commands.removeParticipant}
          onMoveRotation={commands.moveMember}
          onShuffle={commands.shuffleMembers}
          onSetPassphrase={commands.setPassphrase}
          onAiUnlock={commands.aiUnlock}
          onProblemModeSet={commands.setProblemMode}
        />
      );
    }

    if (mode === "session" && room) {
      return (
        <Session
          key={room.code}
          room={room}
          inviteUrl={sync.inviteUrl ?? ''}
          participantId={participantId}
          generatingProblem={generatingProblem}
          aiUnlocked={!!room.aiUnlocked}
          aiMode={room.problemMode === "ai"}
          clockOffset={sync.clockOffset}
          awaitingProblem={!room.problem}
          onSkip={() => act("SWITCH")}
          onPause={() => act("PAUSE")}
          onResume={() => act("RESUME")}
          // 現ドライバーのまま持ち時間だけを満タンからやり直す（Issue #14）。
          onRestartTimer={() => act("RESTART")}
          onComplete={sync.complete}
          onAbort={sync.abort}
          onReset={commands.resetSession}
          onHandoffNoteSet={commands.setHandoffNote}
          onJoinRotation={commands.addMember}
          onLeaveRotation={commands.removeMember}
          onRenameParticipant={commands.renameParticipant}
          onDriverSkip={commands.driverSkip}
          onDriverResume={commands.driverResume}
          onDriverAssign={commands.driverAssign}
          onAddProxy={sync.addProxy}
          onRemoveParticipant={commands.removeParticipant}
          onMoveRotation={commands.moveMember}
          onShuffle={commands.shuffleMembers}
          onEditProblem={commands.editProblem}
          onCopyProblem={copyProblem}
          onRegenerateProblem={sync.regenerateProblem}
          onPasteProblem={pasteProblem}
          onSetPassphrase={commands.setPassphrase}
        />
      );
    }

    if (mode === "celebration") {
      // 完成/中断で出し分け（FR-020/045）。完成のみ記録あり、中断は record=null。
      return (
        <Summary
          endType={endType}
          record={endType === "complete" ? record : null}
          onNewSession={sync.newSession}
          onSaveRecord={(rec) => sync.saveRecordManually(rec)}
        />
      );
    }

    // ここへ落ちるのは「ルームの画面がまだ決まっていない」間だけである（#95 S5c・R9）。
    // 行き先の無い URL は同期フックが玄関へ送っており、**旧入口はもう無い**。
    // 復帰の `room.join` に対する snapshot を待つ数十 ms がここに当たる。
    return null;
  };

  return (
    <Stage>
      {/* 永続ステータスストリップ（全画面共通・FR-036）。ルームの画面が決まるまで（`mode` が
          null の間）は出さない —— 履歴だけを開いたときと、復帰の snapshot を待つ間がここに当たる。
          セッション喪失時も出さない。ルームはもう無いのに「セッション中」と言い続けることになり、
          本文の「セッションが見つかりません」と矛盾する（#76 F-4）。 */}
      {mode !== null && !sessionLost && (
        <div className="mb-4">
          <StatusStrip
            phase={mode}
            displayName={selfName}
            connectionStatus={connectionStatus}
            roomCode={room?.code}
          />
        </div>
      )}

      {banner && (
        <div
          role={banner.kind === "error" ? "alert" : "status"}
          aria-live={banner.kind === "error" ? "assertive" : "polite"}
          className={`mb-4 rounded-md px-4 py-2 text-center text-sm border ${
            banner.kind === "error"
              ? "bg-[var(--urgent-tint)] border-[var(--urgent-edge)] text-[var(--urgent-pale)]"
              : "bg-[var(--caution-tint)] border-[var(--caution-edge)] text-[var(--caution)]"
          }`}
        >
          {banner.text}
        </div>
      )}

      {renderBody()}
    </Stage>
  );
}
