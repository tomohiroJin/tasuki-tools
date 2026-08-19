/**
 * メインアプリコンポーネント。
 *
 * **表示に徹する**（`docs/adr/0015` MUST 3）。WS の接続状態とメッセージ配線は
 * `sync/use-timer-sync.ts` が持ち、このファイルは同期クライアント（`SyncClient`）を
 * 直接 import しない（同 MUST 2）。ここに残るのは、画面の関心である描画・スクロール・
 * 自分の表示名/役割の導出・クリップボード I/O だけである。
 */

import React, { useEffect } from "react";
import { Setup } from "./ui/Setup.js";
import { Join } from "./ui/Join.js";
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

  const {
    mode,
    joinCode,
    room,
    participantId,
    record,
    endType,
    sessionLost,
    connState,
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

  // StatusStrip 用に「自分」の表示名・役割を導出する。
  const self = room?.participants.find((p) => p.participantId === participantId);
  const selfName = self?.displayName ?? room?.config.members[0] ?? "あなた";
  const selfRole = self?.role ?? "host";
  // 接続状態: 喪失が最優先、それ以外は WS クライアントの通知に従う（R5-1）。
  const connectionStatus = deriveConnectionStatus(sessionLost, connState);

  /** セッション/ロビーはダークステージ固定。Setup/Summary は通常テーマ。 */
  const renderBody = () => {
    // ルームが消えた以上、ロビー・セッション・完了の操作はどれも効かない（#76 F-4）。
    // 履歴は端末ローカルなので喪失しても見られる。ここで先に分岐して、
    // 押しても何も起きない画面を残さない。
    if (sessionLost && mode !== "history") {
      return (
        <SessionLost
          code={room?.code}
          onNewSession={sync.newSession}
          onShowHistory={sync.showHistory}
        />
      );
    }

    if (mode === "lobby" && room) {
      return (
        <Lobby
          key={room.code}
          room={room}
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
          onRoleSet={commands.setRole}
          onTransferHost={commands.transferHost}
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
          onSelfRoleChange={sync.changeOwnRole}
          onTransferHost={commands.transferHost}
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

    if (mode === "join" && joinCode && !room) {
      return <Join code={joinCode} onJoin={(name, passphrase, joinMode) => sync.joinRoom(joinCode, name, passphrase, joinMode)} />;
    }

    // 端末ローカルの完了記録を可視化する履歴ビュー（v2.3 #5）。Setup から開き、戻ると Setup へ。
    if (mode === "history") {
      return <History onBack={sync.backToSetup} />;
    }

    return <Setup onCreateRoom={sync.createRoom} onShowHistory={sync.showHistory} />;
  };

  return (
    <Stage>
      {/* 永続ステータスストリップ（全画面共通・FR-036）。参加前（Setup/Join）と履歴（history）は出さない。
          セッション喪失時も出さない。ルームはもう無いのに「セッション中」と言い続けることになり、
          本文の「セッションが見つかりません」と矛盾する（#76 F-4）。 */}
      {mode !== "setup" && mode !== "join" && mode !== "history" && !sessionLost && (
        <div className="mb-4">
          <StatusStrip
            phase={mode}
            displayName={selfName}
            role={selfRole}
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
