/**
 * メインアプリコンポーネント
 */

import React, { useState, useEffect, useRef } from "react";
import { Setup } from "./ui/Setup.js";
import { Join } from "./ui/Join.js";
import { Lobby } from "./ui/Lobby.js";
import { Session } from "./ui/Session.js";
import { Summary, type EndType } from "./ui/Summary.js";
import { StatusStrip, type ConnectionStatus } from "./ui/components/StatusStrip.js";
import { SyncClient } from "./sync/client.js";
import { NoAiProvider } from "./ai/no-ai.js";
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
  // AI はいったん撤去。常に定型バンク（NoAiProvider）を使う。
  return new NoAiProvider();
}

type AppMode = "setup" | "join" | "lobby" | "session" | "celebration";

/** ドメインエラーコードを利用者向けの日本語文へ変換する（生のコードを画面に出さない）。 */
const ERROR_MESSAGES: Record<string, string> = {
  BelowMinMembers: "最後のドライバーは外れられません。",
  DuplicateName: "その名前はすでに使われています。",
  EmptyName: "名前を入力してください。",
  MemberLimitExceeded: "メンバーが上限に達しています。",
  InvalidInterval: "その交代間隔は選べません。",
  UNAUTHORIZED: "この操作の権限がありません。",
  RATE_LIMITED: "試行が多すぎます。しばらく待ってから再試行してください。",
};
function friendlyError(code: string): string {
  return ERROR_MESSAGES[code] ?? "操作を完了できませんでした。";
}

export default function App() {
  const [mode, setMode] = useState<AppMode>("setup");
  // ?room= で来たときに参加画面に渡すルームコード（未参加の間だけ保持）。
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [participantId, setParticipantId] = useState<string>("");
  const [record, setRecord] = useState<CompletionRecord | null>(null);
  const [client, setClient] = useState<SyncClient | null>(null);
  const [banner, setBanner] = useState<{ text: string; kind: "warn" | "error" } | null>(null);
  // 終了種別（完成/中断）。Summary の見出し・記録の出し分けに使う（FR-020）。
  const [endType, setEndType] = useState<EndType>("complete");
  // セッション喪失（room-not-found）。StatusStrip を lost 表示にし、再接続では消えない。
  const [sessionLost, setSessionLost] = useState(false);
  // 注: AI（BYOK/サブスク）はいったん UI から撤去。お題は定型バンクのみ（NoAiProvider）。
  // ByokProvider / AiSettingsModal / key-storage は将来の再有効化に備えて残置（休眠）。
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
  // 一時的な操作エラーバナーの自動消去タイマー。
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const prevRoom = roomRef.current;
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
        // 難易度・言語をロビーで変えたら、お題を作り直して選択と中身を一致させる（①）。
        // 代表（作成者）のみが依頼し、変化時だけ発火するのでループしない。
        const cfgChanged =
          prevRoom?.code === r.code &&
          (prevRoom.config.difficulty !== r.config.difficulty ||
            prevRoom.config.language !== r.config.language);
        if (
          cfgChanged &&
          isCreatorRef.current &&
          (r.phase === "setup" || r.phase === "ready") &&
          !!r.problem
        ) {
          newClient.send({ command: "problem.request", requestId: `req-${r.code}-cfg-${Date.now()}` });
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
      onError: (code) => {
        console.error("WS error:", code);
        // ルーム喪失（揮発サーバー再起動等）は明示的に「セッション喪失」を表示し、継続する（FR-007/059）。
        // ローカル記録は保持され、再接続では消えないよう sessionLost を立てる。
        if (code === "ROOM_NOT_FOUND") {
          setSessionLost(true);
          setBanner({ text: "セッションが見つかりません。ローカルの記録は保持されています。", kind: "error" });
          return;
        }
        // ホストに外された: 取り残さず、退出を明示して参加画面へ戻す（ルームコード保持で再参加可・#3/#4）。
        if (code === "REMOVED_BY_HOST") {
          const removedFrom = roomRef.current?.code ?? null;
          newClient.dispose();
          roomRef.current = null;
          setRoom(null);
          setClient(null);
          setParticipantId("");
          isCreatorRef.current = false;
          problemRequestedRef.current = false;
          recordSavedRef.current = false;
          setSessionLost(false);
          setRecord(null);
          setBanner({
            text: "ホストにより退出しました。再参加するには名前を入力してください。",
            kind: "warn",
          });
          if (removedFrom) {
            setJoinCode(removedFrom);
            setMode("join");
          } else {
            setMode("setup");
          }
          return;
        }
        // それ以外は「一時的な操作エラー」。分かりやすい日本語にし、数秒で自動消去する
        // （生のコードを残し続けない・画面遷移後も居座らせない）。
        setBanner({ text: friendlyError(code), kind: "warn" });
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = setTimeout(() => setBanner(null), 4000);
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

  const handleCreateRoom = (displayName: string, roomName?: string) => {
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
    c.send({ command: "room.create", displayName, config, ...(roomName && { roomName }) });
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

  /** 自分をドライバーに加える（名前で追加・冪等は重複名ガードに委ねる）。 */
  const joinRotation = (displayName: string) => {
    client?.send({ command: "member.add", name: displayName });
  };
  /** 自分をローテーションから外す。index は描画時ではなく送信時の最新 snapshot
   *  （roomRef）から解決し、同時編集による index ずれで別人を外す事故を防ぐ（レビュー #1）。 */
  const leaveRotation = (displayName: string) => {
    const idx = roomRef.current?.session.rotation.indexOf(displayName) ?? -1;
    if (idx >= 0) client?.send({ command: "member.remove", index: idx });
  };
  /** ホストが参加者を退出させる（⑪・host 限定）。 */
  const removeParticipant = (participantId: string) => {
    client?.send({ command: "participant.remove", participantId });
  };
  /** ドライバー順を入れ替える（④・member.move）。host/editor が操作。 */
  const moveRotation = (fromIndex: number, toIndex: number) => {
    client?.send({ command: "member.move", fromIndex, toIndex });
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
    isCreatorRef.current = false;
    problemRequestedRef.current = false;
    endTypeRef.current = "complete";
    recordSavedRef.current = false;
    // ?room= 由来の参加状態もリセットし、次回は通常の Setup から始める（レビュー #6）。
    joinedFromUrlRef.current = false;
    setJoinCode(null);
    setMode("setup");
  };

  // 画面遷移時は先頭へスクロールする（ロビー→セッションでタイマーが最上部に来るように・⑨）。
  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, [mode]);

  // 共有 URL（?room=コード）で開かれたら参加画面を表示する（ゲスト自動参加は廃止）。
  // 名前を入れて「モブに参加」したときに初めて room.join する。
  const joinedFromUrlRef = useRef(false);
  useEffect(() => {
    if (joinedFromUrlRef.current) return;
    const code = new URLSearchParams(window.location.search).get("room");
    if (code) {
      joinedFromUrlRef.current = true;
      setJoinCode(code);
      setMode("join");
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
      // 直近のお題と重複しにくい新規生成を代表へ依頼する（FR-012）。
      // requestId を一意にして「別のお題にする」を毎回有効にする。
      client?.send({ command: "problem.request", requestId: `req-${code}-regen-${Date.now()}` });
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
          onConfigSet={(patch) => client?.send({ command: "config.set", config: patch })}
          onJoinRotation={joinRotation}
          onLeaveRotation={leaveRotation}
          onRemoveParticipant={removeParticipant}
          onMoveRotation={moveRotation}
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
          onJoinRotation={joinRotation}
          onLeaveRotation={leaveRotation}
          onRenameParticipant={rosterRename}
          onDriverSkip={rosterSkip}
          onDriverResume={rosterResume}
          onAddProxy={rosterAddProxy}
          onRemoveParticipant={removeParticipant}
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
          onSaveRecord={(rec) => {
            // 明示保存。完成時に自動保存済みだが put（upsert）なので冪等。
            // ボタン側で「保存しました」を表示するため、ここでは永続化と失敗時通知のみ行う。
            saveRecord(rec).catch((e) => {
              console.error("記録の保存に失敗しました:", e);
              setBanner({ text: "記録の保存に失敗しました。", kind: "error" });
            });
          }}
        />
      );
    }

    if (mode === "join" && joinCode && !room) {
      return <Join code={joinCode} onJoin={(name) => handleJoinRoom(joinCode, name)} />;
    }

    return <Setup onCreateRoom={handleCreateRoom} />;
  };

  return (
    <Stage>
      {/* 永続ステータスストリップ（全画面共通・FR-036）。参加前（Setup/Join）は出さない。 */}
      {mode !== "setup" && mode !== "join" && (
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
              ? "bg-[rgba(255,53,42,0.15)] border-[rgba(255,53,42,0.45)] text-[#ffd5d1]"
              : "bg-amber-500/15 border-amber-400/40 text-amber-100"
          }`}
        >
          {banner.text}
        </div>
      )}

      {renderBody()}
    </Stage>
  );
}
