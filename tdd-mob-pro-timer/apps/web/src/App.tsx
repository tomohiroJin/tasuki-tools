/**
 * メインアプリコンポーネント
 */

import React, { useState, useEffect, useRef } from "react";
import { Setup } from "./ui/Setup.js";
import { Lobby } from "./ui/Lobby.js";
import { Session } from "./ui/Session.js";
import { Summary, type EndType } from "./ui/Summary.js";
import { StatusStrip, type ConnectionStatus } from "./ui/components/StatusStrip.js";
import { AiSettingsModal } from "./ui/components/AiSettingsModal.js";
import { saveApiKey, clearApiKey, loadApiKey } from "./ai/key-storage.js";
import { SyncClient } from "./sync/client.js";
import { NoAiProvider } from "./ai/no-ai.js";
import { ByokProvider } from "./ai/byok.js";
import type { ProblemProvider } from "./ai/provider.js";
import { screenForPhase } from "./ui/screen.js";
import { Stage } from "./ui/primitives.js";
import { saveRecord } from "./records/indexeddb.js";
import { persistRecordIfComplete } from "./records/persist.js";
import { buildCompletionRecord } from "@tdd-mob/core";
import type { Room, SessionConfig, CompletionRecord, Problem } from "@tdd-mob/core";

/** ローカルに API 鍵があれば BYOK、無ければ定型のみのプロバイダを返す。
 *  鍵の保存先（session/local）は key-storage が一元管理する（AI 設定モーダルと同じ経路）。 */
function resolveProvider(): ProblemProvider {
  const key = loadApiKey();
  return key ? new ByokProvider({ apiKey: key }) : new NoAiProvider();
}

type AppMode = "setup" | "lobby" | "session" | "celebration";

export default function App() {
  const [mode, setMode] = useState<AppMode>("setup");
  const [room, setRoom] = useState<Room | null>(null);
  const [participantId, setParticipantId] = useState<string>("");
  const [record, setRecord] = useState<CompletionRecord | null>(null);
  const [client, setClient] = useState<SyncClient | null>(null);
  const [banner, setBanner] = useState<{ text: string; kind: "warn" | "error" } | null>(null);
  // 終了種別（完成/中断）。Summary の見出し・記録の出し分けに使う（FR-020）。
  const [endType, setEndType] = useState<EndType>("complete");
  // セッション喪失（room-not-found）。StatusStrip を lost 表示にし、再接続では消えない。
  const [sessionLost, setSessionLost] = useState(false);
  // AI 設定モーダルの開閉と出題モード（AI/定型）。
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [problemMode, setProblemMode] = useState<"ai" | "fallback">("ai");
  // 鍵の保存/削除後に hasKey 表示（loadApiKey() の評価）を再描画で更新するための
  // バージョン setter。値自体は参照せず、setter 呼び出しによる再描画だけが目的。
  const [, setKeyVersion] = useState(0);
  // onNeedProblem など closure から最新ルームの設定を参照するための ref
  const roomRef = useRef<Room | null>(null);
  // このクライアントがルーム作成者（＝当初ホスト）か。ロビーでお題生成を自動依頼する判定に使う。
  const isCreatorRef = useRef(false);
  // ロビーでのお題自動生成依頼を一度だけ行うためのガード。
  const problemRequestedRef = useRef(false);
  // 終了種別を onRoom（snapshot 受信）クロージャから参照するための ref。
  // 中断時に完成記録を作らない判定に使う（FR-020）。
  const endTypeRef = useRef<EndType>("complete");
  // 完成記録の二重保存を防ぐガード（celebration の snapshot が複数回来ても1回だけ保存）。
  const recordSavedRef = useRef(false);

  /** 代理参加者の一意な participantId を生成する（衝突回避のため乱数を含める） */
  const makeProxyId = () => `proxy-${Math.random().toString(36).slice(2, 10)}`;

  // SyncClient の配線を create/join で共有する。
  // getConfig は onNeedProblem 用に「お題生成に使う言語・難易度」を返す。
  const makeClient = (
    getConfig: () => { language: string; difficulty: string },
  ): SyncClient => {
    const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
    const newClient = new SyncClient({
      url: wsUrl,
      onRoom: (r) => {
        roomRef.current = r;
        setRoom(r);
        // サーバー権威の phase に全参加者が追従する（ホストの開始/完成が全員に反映）
        setMode(screenForPhase(r.phase));
        // ロビー（開始前）でお題が未確定なら、作成者が一度だけ代表生成を依頼する（US3）。
        // これがないと誰も problem.request を送らず「お題を準備中」のまま開始できない。
        if (
          (r.phase === "setup" || r.phase === "ready") &&
          !r.problem &&
          isCreatorRef.current &&
          !problemRequestedRef.current
        ) {
          problemRequestedRef.current = true;
          newClient.send({ command: "problem.request", requestId: `req-${r.code}-lobby` });
        }
        // 完成フェーズかつ「完成（中断でない）」のとき、各端末でローカル記録を生成し
        // IndexedDB へ永続化する（FR-020/028/059）。中断（abort）では記録を作らない。
        // 二重保存は recordSavedRef でガードする（celebration の snapshot が複数回来ても1回）。
        if (
          r.phase === "celebration" &&
          r.problem &&
          endTypeRef.current !== "abort" &&
          !recordSavedRef.current
        ) {
          recordSavedRef.current = true;
          const built = buildCompletionRecord(
            { session: r.session, clock: r.clock },
            r.problem,
            r.config,
            Date.now(),
            r.code,
          );
          setRecord((prev) => prev ?? built);
          // 完成記録を端末ローカルに自動保存（押し忘れ防止・FR-020「達成を記録」）。
          persistRecordIfComplete("complete", built, saveRecord).catch((e) =>
            console.error("完成記録の保存に失敗しました:", e),
          );
        }
      },
      onIdentity: ({ participantId: pid }) => setParticipantId(pid),
      onNeedProblem: async (requestId) => {
        // 代表に選ばれたらお題を生成して投入する（FR-025）。失敗時もプロバイダが定型へ縮退。
        try {
          const cfg = getConfig();
          const provider = resolveProvider();
          const { problem, source } = await provider.generate(cfg.language, cfg.difficulty);
          newClient.send({
            command: "problem.submit",
            requestId,
            problem,
            usedFallback: source === "fallback",
          });
        } catch (e) {
          console.error("お題生成に失敗しました（deadline で再委譲されます）:", e);
        }
      },
      onError: (code, message) => {
        console.error("WS error:", code, message);
        // ルーム喪失（揮発サーバー再起動等）は明示的に「セッション喪失」を表示する（FR-007/059）。
        // ローカル記録は保持され、再接続では消えないよう sessionLost を立てる。
        if (code === "ROOM_NOT_FOUND") {
          setSessionLost(true);
          setBanner({ text: "セッションが見つかりません。ローカルの記録は保持されています。", kind: "error" });
          return;
        }
        setBanner({ text: message || "エラーが発生しました", kind: "error" });
      },
      onSuggestBreak: (rounds) =>
        setBanner({
          text: `${rounds}巡しました。そろそろ休憩しませんか？（ホストは「休憩」で全員のタイマーを止められます）`,
          kind: "warn",
        }),
      onConnected: () => setBanner(null),
      onDisconnected: () =>
        setBanner({ text: "接続が切れました。再接続しています...", kind: "warn" }),
    });
    newClient.connect();
    setClient(newClient);
    return newClient;
  };

  const handleCreateRoom = (displayName: string) => {
    // 作成者＝当初ホスト。言語/難易度/間隔/オプションは既定で作成し、Lobby で host が
    // config.set で調整する（最初の画面で選びすぎない・UX 再設計）。お題はロビーで自動生成。
    isCreatorRef.current = true;
    problemRequestedRef.current = false;
    const config: SessionConfig = {
      language: "TypeScript",
      difficulty: "easy",
      members: [displayName],
      intervalMinutes: 5,
    };
    // お題生成は最新のルーム設定（ロビーでの編集を反映）を参照する。
    const c = makeClient(() => ({
      language: roomRef.current?.config.language ?? config.language,
      difficulty: roomRef.current?.config.difficulty ?? config.difficulty,
    }));
    c.send({ command: "room.create", displayName, config });
  };

  // 共有 URL（?room=コード）からの参加。観覧者として加わり snapshot に追従する。
  const handleJoinRoom = (code: string, displayName = "ゲスト") => {
    isCreatorRef.current = false;
    const c = makeClient(() => ({
      language: roomRef.current?.config.language ?? "TypeScript",
      difficulty: roomRef.current?.config.difficulty ?? "easy",
    }));
    c.send({ command: "room.join", code, displayName, hasAiKey: false });
  };

  const handleComplete = () => {
    setEndType("complete");
    endTypeRef.current = "complete";
    // サーバーへ完成を通知。画面遷移と記録生成・保存は snapshot 受信（onRoom の celebration
    // 処理）で全参加者一斉に行う。ホストだけ先行しない。
    client?.send({ command: "session.complete" });
  };

  /** 途中で終える（中断）。完成と異なり記録は残さない（FR-020）。
   *  画面遷移は snapshot（celebration）受信で全員一斉。 */
  const handleAbort = () => {
    setEndType("abort");
    endTypeRef.current = "abort";
    setRecord(null);
    client?.send({ command: "session.abort" });
  };

  const handleNewSession = () => {
    client?.dispose();
    setClient(null);
    setRoom(null);
    setParticipantId("");
    setRecord(null);
    setEndType("complete");
    setSessionLost(false);
    setAiModalOpen(false);
    isCreatorRef.current = false;
    problemRequestedRef.current = false;
    endTypeRef.current = "complete";
    recordSavedRef.current = false;
    setMode("setup");
  };

  // ─── AI 設定（鍵・出題モード）操作 ─────────────────────────────────────────
  // 鍵は key-storage が session/local を管理し、サーバーへは送らない（FR-017）。
  const handleKeySave = (key: string, persistent: boolean) => {
    saveApiKey(key, persistent);
    setKeyVersion((v) => v + 1);
  };
  const handleKeyClear = () => {
    clearApiKey();
    setKeyVersion((v) => v + 1);
  };

  // 共有 URL（?room=コード）で開かれたら自動的に参加する（初回マウント時のみ）。
  const joinedFromUrlRef = useRef(false);
  useEffect(() => {
    if (joinedFromUrlRef.current) return;
    const code = new URLSearchParams(window.location.search).get("room");
    if (code) {
      joinedFromUrlRef.current = true;
      handleJoinRoom(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      client?.dispose();
    };
  }, [client]);


  // 共有時の操作はすべて WS コマンド送信（サーバーが状態をミラーし全員へ反映）。
  const act = (action: "SWITCH" | "PAUSE" | "RESUME") => {
    client?.send({ command: "session.act", action });
  };

  // ─── 在席一覧（RosterPanel）操作 ───────────────────────────────────────────
  // WS コマンドを送信し、サーバーが rotation/participants をミラーして全員へ反映する。
  const rosterRename = (pid: string, displayName: string) => {
    client?.send({ command: "participant.rename", participantId: pid, displayName });
  };
  const rosterSkip = (pid: string) => {
    client?.send({ command: "driver.skip", participantId: pid });
  };
  const rosterResume = (pid: string) => {
    client?.send({ command: "driver.resume", participantId: pid });
  };
  const rosterAddProxy = (displayName: string) => {
    client?.send({ command: "participant.addProxy", participantId: makeProxyId(), displayName });
  };

  // ─── お題編集（ProblemEditor）操作 ─────────────────────────────────────────
  // WS コマンドでサーバーが problem を全員へ反映する（FR-041）。編集は editor+（UI 側で制御）。

  /** お題を可搬なプレーンテキストへ整形する（FR-013 コピー用） */
  const formatProblemText = (p: Problem): string => {
    const lines: string[] = [p.title, "", p.description, ""];
    if (p.requirements.length > 0) {
      lines.push("要件:", ...p.requirements.map((r) => `- ${r}`), "");
    }
    if (p.exampleTest) lines.push("例示テスト:", p.exampleTest, "");
    if (p.hints.length > 0) lines.push("ヒント:", ...p.hints.map((h) => `- ${h}`));
    return lines.join("\n").trim();
  };

  const editProblem = (patch: Partial<Omit<Problem, "source" | "edited">>) => {
    client?.send({ command: "problem.edit", patch });
  };

  const copyProblem = () => {
    const p = roomRef.current?.problem;
    if (!p || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(formatProblemText(p)).catch(() => {
      /* 権限拒否等は無視 */
    });
  };

  const regenerateProblem = () => {
    const code = roomRef.current?.code;
    if (code) {
      // 直近のお題と重複しにくい新規生成を代表へ依頼する（FR-012）
      client?.send({ command: "problem.request", requestId: `req-${code}-regen` });
    }
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
        editProblem({
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
  // 接続状態: 喪失 > 再接続中(warn バナー) > オンライン。
  const connectionStatus: ConnectionStatus = sessionLost
    ? "lost"
    : banner?.kind === "warn"
      ? "reconnecting"
      : "online";

  /** セッション/ロビーはダークステージ固定。Setup/Summary は通常テーマ。 */
  const renderBody = () => {
    if (mode === "lobby" && room) {
      return (
        <Lobby
          room={room}
          participantId={participantId}
          onStartSession={() => {
            if (!room.problem) {
              client?.send({ command: "problem.request", requestId: `req-${room.code}` });
            }
            client?.send({ command: "phase.set", phase: "session" });
            client?.send({ command: "session.act", action: "START" });
            setMode("session");
          }}
          onEditProblem={editProblem}
          onRegenerateProblem={regenerateProblem}
          onPasteProblem={pasteProblem}
          onCopyProblem={copyProblem}
          onOpenAiSettings={() => setAiModalOpen(true)}
        />
      );
    }

    if (mode === "session" && room) {
      return (
        <Session
          room={room}
          participantId={participantId}
          clockOffset={client?.clockOffset ?? 0}
          awaitingProblem={!room.problem}
          onSkip={() => act("SWITCH")}
          onPause={() => act("PAUSE")}
          onResume={() => act("RESUME")}
          onComplete={handleComplete}
          onAbort={handleAbort}
          onReset={() => client?.send({ command: "session.reset" })}
          onBreakStart={() => client?.send({ command: "break.start" })}
          onBreakEnd={() => client?.send({ command: "break.end" })}
          onHandoffNoteSet={(text) => client?.send({ command: "handoff.note.set", text })}
          onRenameParticipant={rosterRename}
          onDriverSkip={rosterSkip}
          onDriverResume={rosterResume}
          onAddProxy={rosterAddProxy}
          onEditProblem={editProblem}
          onCopyProblem={copyProblem}
          onRegenerateProblem={regenerateProblem}
          onPasteProblem={pasteProblem}
        />
      );
    }

    if (mode === "celebration") {
      // 完成/中断で出し分け（FR-020/045）。完成のみ記録あり、中断は record=null。
      return (
        <Summary
          endType={endType}
          record={endType === "complete" ? record : null}
          onNewSession={handleNewSession}
          onSaveRecord={() => {
            /* 記録の永続化は別経路（IndexedDB）。ここでは UI 上のダウンロード等に使う想定 */
          }}
        />
      );
    }

    return <Setup onCreateRoom={handleCreateRoom} />;
  };

  return (
    <Stage>
      {/* 永続ステータスストリップ（全画面共通・FR-036）。Setup では参加前なので出さない。 */}
      {mode !== "setup" && (
        <div className="mb-4">
          <StatusStrip
            phase={mode}
            displayName={selfName}
            role={selfRole}
            connectionStatus={connectionStatus}
            problemMode={problemMode}
            roomCode={room?.code}
          />
        </div>
      )}

      {banner && (
        <div
          role={banner.kind === "error" ? "alert" : "status"}
          aria-live={banner.kind === "error" ? "assertive" : "polite"}
          className={`mb-4 rounded-xl px-4 py-2 text-center text-sm backdrop-blur-sm border ${
            banner.kind === "error"
              ? "bg-red-500/20 border-red-400/40 text-red-100"
              : "bg-amber-500/20 border-amber-400/40 text-amber-100"
          }`}
        >
          {banner.text}
        </div>
      )}

      {renderBody()}

      {/* AI 設定モーダル（鍵・出題モード）。鍵はサーバー送信しない（FR-017）。 */}
      <AiSettingsModal
        open={aiModalOpen}
        mode={problemMode}
        hasKey={loadApiKey() !== null}
        onClose={() => setAiModalOpen(false)}
        onModeChange={setProblemMode}
        onKeySave={handleKeySave}
        onKeyClear={handleKeyClear}
      />
    </Stage>
  );
}
