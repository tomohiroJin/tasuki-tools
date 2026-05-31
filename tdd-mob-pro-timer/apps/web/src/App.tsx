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
import { NoAiProvider } from "./ai/no-ai.js";
import { ByokProvider } from "./ai/byok.js";
import type { ProblemProvider } from "./ai/provider.js";
import { screenForPhase } from "./ui/screen.js";
import { buildCompletionRecord } from "@tdd-mob/core";
import type { Room, SessionConfig, CompletionRecord } from "@tdd-mob/core";

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

    // ソロ用の合成ルームを集約から組み立てる（共有時の Room 形と互換）
    const buildSoloRoom = (): Room => ({
      code: "SOLO",
      createdAt: engine.aggregate.clock.anchorServerTime || 0,
      hostParticipantId: "solo",
      config,
      problem: null,
      session: engine.aggregate.session,
      clock: engine.aggregate.clock,
      phase: "session",
      participants: [
        {
          participantId: "solo",
          connId: null,
          displayName: config.members[0] ?? "You",
          role: "host",
          presence: "online",
          hasAiKey: false,
          joinedAt: 0,
        },
      ],
      sessionRecords: [],
      handoffNote: "",
      onBreak: false,
    });

    // エンジンの状態変化を soloRoom へ反映（タイマー駆動・交代を画面に伝播）
    engine.setOnChange(() => setSoloRoom(buildSoloRoom()));

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
