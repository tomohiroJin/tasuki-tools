/**
 * メインアプリコンポーネント
 */

import React, { useState, useEffect, useRef } from "react";
import { Setup } from "./ui/Setup.js";
import { Lobby } from "./ui/Lobby.js";
import { Session } from "./ui/Session.js";
import { Celebration } from "./ui/Celebration.js";
import { SyncClient } from "./sync/client.js";
import { LocalEngine } from "./solo/local-engine.js";
import { computeSoloIneligibleIndices } from "./solo/eligibility.js";
import { NoAiProvider } from "./ai/no-ai.js";
import { ByokProvider } from "./ai/byok.js";
import type { ProblemProvider } from "./ai/provider.js";
import { screenForPhase } from "./ui/screen.js";
import { buildCompletionRecord } from "@tdd-mob/core";
import type { Room, SessionConfig, CompletionRecord, Participant, Problem } from "@tdd-mob/core";

/** ローカルに API 鍵があれば BYOK、無ければ定型のみのプロバイダを返す */
function resolveProvider(): ProblemProvider {
  const key = typeof localStorage !== "undefined"
    ? localStorage.getItem("anthropic_api_key")
    : null;
  return key ? new ByokProvider({ apiKey: key }) : new NoAiProvider();
}

type AppMode = "setup" | "lobby" | "session" | "celebration" | "solo";

export default function App() {
  const [mode, setMode] = useState<AppMode>("setup");
  const [room, setRoom] = useState<Room | null>(null);
  const [participantId, setParticipantId] = useState<string>("");
  const [record, setRecord] = useState<CompletionRecord | null>(null);
  const [client, setClient] = useState<SyncClient | null>(null);
  const [soloEngine, setSoloEngine] = useState<LocalEngine | null>(null);
  const [soloRoom, setSoloRoom] = useState<Room | null>(null);
  const [banner, setBanner] = useState<{ text: string; kind: "warn" | "error" } | null>(null);
  // onNeedProblem など closure から最新ルームの設定を参照するための ref
  const roomRef = useRef<Room | null>(null);
  // ソロのロスター差分（改名/一時離脱/代理追加）。コアは v2 ロスターイベントを no-op 化し
  // rotation 反映は sync 層のみで行うため、ソロでは App がローカルに差分を保持して
  // buildSoloRoom で重ねる（共有では client.send が真実源なので使わない）。
  const soloRosterRef = useRef<{
    renames: Record<string, string>;
    skips: Set<string>;
    proxies: { participantId: string; displayName: string }[];
  }>({ renames: {}, skips: new Set(), proxies: [] });
  // 最新の buildSoloRoom で soloRoom を再構築する関数を保持（ロスター操作後の再描画用）
  const soloRebuildRef = useRef<(() => void) | null>(null);
  // ソロのお題。共有では Room.problem がサーバー権威だが、ソロは App がローカルに保持し
  // buildSoloRoom で重ねる（編集/持ち込み/やり直しを反映する）。
  const soloProblemRef = useRef<Problem | null>(null);

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
        // 完成フェーズに入ったら各端末でローカル記録を生成する（FR-028）。既に記録があれば上書きしない。
        if (r.phase === "celebration" && r.problem) {
          const problem = r.problem;
          setRecord((prev) =>
            prev ??
            buildCompletionRecord(
              { session: r.session, clock: r.clock },
              problem,
              r.config,
              Date.now(),
              r.code,
            ),
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
        setBanner({ text: message || "エラーが発生しました", kind: "error" });
      },
      onConnected: () => setBanner(null),
      onDisconnected: () =>
        setBanner({ text: "接続が切れました。再接続しています...", kind: "warn" }),
    });
    newClient.connect();
    setClient(newClient);
    return newClient;
  };

  const handleCreateRoom = (config: SessionConfig) => {
    const c = makeClient(() => ({
      language: config.language,
      difficulty: config.difficulty,
    }));
    c.send({
      command: "room.create",
      displayName: config.members[0] ?? "Host",
      config,
    });
  };

  // 共有 URL（?room=コード）からの参加。観覧者として加わり snapshot に追従する。
  const handleJoinRoom = (code: string, displayName = "ゲスト") => {
    const c = makeClient(() => ({
      language: roomRef.current?.config.language ?? "TypeScript",
      difficulty: roomRef.current?.config.difficulty ?? "easy",
    }));
    c.send({ command: "room.join", code, displayName, hasAiKey: false });
  };

  const handleSolo = (config: SessionConfig) => {
    const engine = new LocalEngine(config);

    // ソロ用の合成ルームを集約から組み立てる（共有時の Room 形と互換）。
    // ロスター差分（改名/一時離脱/代理追加）をエンジンの session に重ねて
    // participants・rotation を再構成する。
    const buildSoloRoom = (): Room => {
      const ov = soloRosterRef.current;
      const hostId = "solo";
      const hostBaseName = config.members[0] ?? "You";
      const hostName = ov.renames[hostId] ?? hostBaseName;

      const host: Participant = {
        participantId: hostId,
        connId: null,
        displayName: hostName,
        role: "host",
        presence: "online",
        hasAiKey: false,
        joinedAt: 0,
        driverEligible: !ov.skips.has(hostId),
      };
      const proxyParticipants: Participant[] = ov.proxies.map((px) => ({
        participantId: px.participantId,
        connId: null,
        displayName: ov.renames[px.participantId] ?? px.displayName,
        role: "editor",
        presence: "offline",
        hasAiKey: false,
        joinedAt: 0,
        isPlaceholder: true,
        driverEligible: !ov.skips.has(px.participantId),
      }));

      // rotation はホスト改名を反映し、代理名を末尾に追加する。
      // driverCounts も同数だけ伸ばし不変条件 rotation.length === driverCounts.length を保つ。
      const engSession = engine.aggregate.session;
      const baseRotation = engSession.rotation.map((n) =>
        n === hostBaseName ? hostName : n,
      );
      const proxyNames = proxyParticipants.map((p) => p.displayName);
      const rotation = [...baseRotation, ...proxyNames];
      const driverCounts = [
        ...engSession.driverCounts,
        ...proxyNames.map(() => 0),
      ];

      return {
        code: "SOLO",
        createdAt: engine.aggregate.clock.anchorServerTime || 0,
        hostParticipantId: hostId,
        config,
        problem: soloProblemRef.current,
        session: { ...engSession, rotation, driverCounts },
        clock: engine.aggregate.clock,
        phase: "session",
        participants: [host, ...proxyParticipants],
        sessionRecords: [],
        handoffNote: "",
        onBreak: false,
      };
    };

    // 離脱（driver.skip 相当）を交代ロジックへ伝える。共有時の handlers と同様に
    // driverEligible=false のメンバーを飛ばすため、ロスター差分から対象外インデックスを導く。
    engine.setIneligibleProvider(() =>
      computeSoloIneligibleIndices(engine.aggregate.session.rotation, {
        hostId: "solo",
        hostName: soloRosterRef.current.renames["solo"] ?? (config.members[0] ?? "You"),
        skips: soloRosterRef.current.skips,
        proxyNames: Object.fromEntries(
          soloRosterRef.current.proxies.map((px) => [
            px.participantId,
            soloRosterRef.current.renames[px.participantId] ?? px.displayName,
          ]),
        ),
      }),
    );

    // エンジンの状態変化を soloRoom へ反映（タイマー駆動・交代を画面に伝播）
    engine.setOnChange(() => setSoloRoom(buildSoloRoom()));
    // ロスター操作後に soloRoom を再構築できるよう関数を保持する
    soloRebuildRef.current = () => setSoloRoom(buildSoloRoom());

    setParticipantId("solo");
    setSoloEngine(engine);
    setSoloRoom(buildSoloRoom());
    setMode("solo");
    engine.start();
  };

  const handleComplete = () => {
    if (client) {
      // 共有時: サーバーへ完成を通知し、画面遷移と記録生成は snapshot 受信
      // （onRoom の celebration 処理）で全参加者一斉に行う。ホストだけ先行しない。
      client.send({ command: "session.complete" });
      return;
    }
    // ソロ時: ローカルで記録を生成して完成画面へ。
    // お題未選択でも完成へ到達できるよう、お題が無ければプレースホルダで記録する。
    if (soloRoom) {
      const now = Date.now();
      const agg = { session: soloRoom.session, clock: soloRoom.clock };
      const problem = soloRoom.problem ?? {
        title: "（お題なし）",
        description: "",
        requirements: [],
        exampleTest: "",
        hints: [],
      };
      setRecord(
        buildCompletionRecord(agg, problem, soloRoom.config, now, soloRoom.code),
      );
    }
    soloEngine?.pause();
    setMode("celebration");
  };

  const handleNewSession = () => {
    client?.dispose();
    setClient(null);
    soloEngine?.dispose();
    setSoloEngine(null);
    setRoom(null);
    setSoloRoom(null);
    setParticipantId("");
    setRecord(null);
    // ソロのロスター差分・お題をクリア（次セッションへ持ち越さない）
    soloRosterRef.current = { renames: {}, skips: new Set(), proxies: [] };
    soloProblemRef.current = null;
    soloRebuildRef.current = null;
    setMode("setup");
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
      soloEngine?.dispose();
    };
  }, [client, soloEngine]);

  // 共有時は client へコマンド送信、ソロ時は soloEngine を直接駆動する。
  // void を返す send() に対する `??` の誤用を避け、モードで明示分岐する。
  const act = (action: "SWITCH" | "PAUSE" | "RESUME") => {
    if (client) {
      client.send({ command: "session.act", action });
    } else if (soloEngine) {
      if (action === "SWITCH") soloEngine.skip();
      else if (action === "PAUSE") soloEngine.pause();
      else soloEngine.resume();
    }
  };

  // ─── 在席一覧（RosterPanel）操作 ───────────────────────────────────────────
  // 共有時は WS コマンドを送信（サーバーが rotation/participants をミラー）。
  // ソロ時は App ローカルのロスター差分を更新して再描画する。
  const rosterRename = (pid: string, displayName: string) => {
    if (client) {
      client.send({ command: "participant.rename", participantId: pid, displayName });
    } else if (soloEngine) {
      soloRosterRef.current.renames[pid] = displayName;
      soloRebuildRef.current?.();
    }
  };
  const rosterSkip = (pid: string) => {
    if (client) {
      client.send({ command: "driver.skip", participantId: pid });
    } else if (soloEngine) {
      soloRosterRef.current.skips.add(pid);
      // 現ドライバーを離脱させたら即座に次の eligible へ繰り上げる（共有時と整合）。
      soloEngine.reconcileCurrentDriver();
      soloRebuildRef.current?.();
    }
  };
  const rosterResume = (pid: string) => {
    if (client) {
      client.send({ command: "driver.resume", participantId: pid });
    } else if (soloEngine) {
      soloRosterRef.current.skips.delete(pid);
      soloRebuildRef.current?.();
    }
  };
  const rosterAddProxy = (displayName: string) => {
    if (client) {
      client.send({ command: "participant.addProxy", participantId: makeProxyId(), displayName });
    } else if (soloEngine) {
      soloRosterRef.current.proxies.push({ participantId: makeProxyId(), displayName });
      soloRebuildRef.current?.();
    }
  };

  // ─── お題編集（ProblemEditor）操作 ─────────────────────────────────────────
  // 共有時は WS コマンド（サーバーが problem を全員へ反映: FR-041）。
  // ソロ時は soloProblemRef を更新して再描画する。編集は editor+（UI 側で制御）。

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
    if (client) {
      client.send({ command: "problem.edit", patch });
    } else if (soloEngine && soloProblemRef.current) {
      soloProblemRef.current = { ...soloProblemRef.current, ...patch, edited: true };
      soloRebuildRef.current?.();
    }
  };

  const copyProblem = () => {
    const p = (roomRef.current ?? soloRoom)?.problem;
    if (!p || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(formatProblemText(p)).catch(() => {
      /* 権限拒否等は無視 */
    });
  };

  const regenerateProblem = () => {
    if (client) {
      const code = roomRef.current?.code;
      if (code) {
        // 直近のお題と重複しにくい新規生成を代表へ依頼する（FR-012）
        client.send({ command: "problem.request", requestId: `req-${code}-regen` });
      }
    } else if (soloEngine && soloRoom) {
      const { language, difficulty } = soloRoom.config;
      resolveProvider()
        .generate(language, difficulty)
        .then(({ problem, source }) => {
          soloProblemRef.current = { ...problem, source, edited: false };
          soloRebuildRef.current?.();
        })
        .catch((e) => console.error("お題のやり直しに失敗しました:", e));
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

  const renderScreen = () => {
    if (mode === "lobby" && room) {
      return (
        <Lobby
          room={room}
          participantId={participantId}
          onStartSession={() => {
            // お題が未確定なら代表生成を依頼してからセッションへ（FR-025）
            if (!room.problem) {
              client?.send({ command: "problem.request", requestId: `req-${room.code}` });
            }
            client?.send({ command: "phase.set", phase: "session" });
            client?.send({ command: "session.act", action: "START" });
            setMode("session");
          }}
        />
      );
    }

    if ((mode === "session" || mode === "solo") && (room || soloRoom)) {
      const currentRoom = (room ?? soloRoom)!;
      return (
        <Session
          room={currentRoom}
          participantId={participantId}
          clockOffset={client?.clockOffset ?? 0}
          awaitingProblem={!!client && !currentRoom.problem}
          onSkip={() => act("SWITCH")}
          onPause={() => act("PAUSE")}
          onResume={() => act("RESUME")}
          onComplete={handleComplete}
          onReset={() => client?.send({ command: "session.reset" })}
          onBreakStart={() => client?.send({ command: "break.start" })}
          onBreakEnd={() => client?.send({ command: "break.end" })}
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

    if (mode === "celebration" && (room || soloRoom) && record) {
      return (
        <Celebration
          room={(room ?? soloRoom)!}
          record={record}
          onNewSession={handleNewSession}
        />
      );
    }

    return <Setup onCreateRoom={handleCreateRoom} onSolo={handleSolo} />;
  };

  return (
    <>
      {banner && (
        <div
          role={banner.kind === "error" ? "alert" : "status"}
          aria-live={banner.kind === "error" ? "assertive" : "polite"}
          className={`sticky top-0 z-40 px-4 py-2 text-center text-sm ${
            banner.kind === "error"
              ? "bg-danger text-on-danger"
              : "bg-warning text-on-warning"
          }`}
        >
          {banner.text}
        </div>
      )}
      {renderScreen()}
    </>
  );
}
