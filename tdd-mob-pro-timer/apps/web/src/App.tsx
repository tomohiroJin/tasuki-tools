/**
 * メインアプリコンポーネント
 */

import React, { useState, useEffect, useRef } from "react";
import { Setup } from "./ui/Setup.js";
import { Join } from "./ui/Join.js";
import { Lobby } from "./ui/Lobby.js";
import { Session } from "./ui/Session.js";
import { Summary, type EndType } from "./ui/Summary.js";
import { History } from "./ui/History.js";
import { StatusStrip } from "./ui/components/StatusStrip.js";
import { deriveConnectionStatus, type ClientConnState } from "./ui/connection-status.js";
import { SyncClient } from "./sync/client.js";
import { saveResumeIdentity, loadResumeIdentity, clearResumeIdentity } from "./sync/resume-identity.js";
import { buildNoticeMessage } from "./sync/notice-message.js";
import { NoAiProvider } from "./ai/no-ai.js";
import type { ProblemProvider } from "./ai/provider.js";
import { screenForPhase } from "./ui/screen.js";
import { errorAction } from "./ui/error-action.js";
import { stripRoomParam } from "./ui/room-param.js";
import { hostChangeMessage } from "./ui/host-change.js";
import { shouldClearGenerating, shouldAutoRequestProblem } from "./ui/problem-generation.js";
import { shouldAutoJoinRotation } from "./ui/join-driver-intent.js";
import { useLatestRef } from "./ui/use-latest-ref.js";
import { Stage } from "./ui/primitives.js";
import { saveRecord } from "./records/indexeddb.js";
import { persistRecordIfComplete } from "./records/persist.js";
import { buildCompletionRecord, displayMessageFor } from "@tdd-mob/core";
import type { Room, SessionConfig, CompletionRecord, Problem } from "@tdd-mob/core";

/** ローカルに API 鍵があれば BYOK、無ければ定型のみのプロバイダを返す。
 *  鍵の保存先（session/local）は key-storage が一元管理する（AI 設定モーダルと同じ経路）。 */
function resolveProvider(): ProblemProvider {
  // AI はいったん撤去。常に定型バンク（NoAiProvider）を使う。
  return new NoAiProvider();
}

type AppMode = "setup" | "join" | "lobby" | "session" | "celebration" | "history";

/**
 * ドメインエラーコードを利用者向けの日本語文へ変換する（生のコードを画面に出さない）。
 *
 * **判定規則そのものが @tdd-mob/core の `displayMessageFor()` にある**（T065・FR-105・FR-107）。
 * かつてはこのファイル内の private 関数で表を引いており、**テストから触れなかった**。
 * そのため「どのコードのとき利用者に何が見えるか」を検証する手段が無く、
 * 表にコードを 1 行足すだけで表示が変わる退行を型検査もテストも素通しさせた。
 * ここは core へ委譲するだけにして、規則を単一の検証可能な場所に置く。
 */
const friendlyError = displayMessageFor;

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
  // 接続状態は WS クライアントから明示通知される（banner には結合しない・R5-1）。
  const [connState, setConnState] = useState<ClientConnState>("online");
  // 注: AI（BYOK/サブスク）はいったん UI から撤去。お題は定型バンクのみ（NoAiProvider）。
  // このクライアントがルーム作成者（＝当初ホスト）か。ロビーでお題生成を自動依頼する判定に使う。
  // state を持たない純粋なガード用 ref（集約 ref の対象外）。
  const isCreatorRef = useRef(false);
  // 参加時に "driver" を選択したか。snapshot で自分が参加者に現れたら member.add を一度だけ送る。
  // 名前ではなく「宣言したか」だけを持つ（誰を加えるかは自分の participantId で決まる・D6b）。
  const pendingDriverJoinRef = useRef(false);
  // ロビーでのお題自動生成依頼を一度だけ行うためのガード。
  const problemRequestedRef = useRef(false);
  // 完成記録の二重保存を防ぐガード（celebration の snapshot が複数回来ても1回だけ保存）。
  const recordSavedRef = useRef(false);
  // 一時的な操作エラーバナーの自動消去タイマー。
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ホスト交代検知用に直前 snapshot の hostParticipantId を保持する（R2-4）。
  const prevHostRef = useRef<string | undefined>(undefined);
  // AI/定型のお題生成中（「別のお題にする」押下〜新お題確定まで）。スピナー＋減光に使う。
  const [generatingProblem, setGeneratingProblem] = useState(false);
  // makeClient のコールバック（onRoom/onIdentity/onNotice 等）は生成時の値で固定される
  // closure である。そのためコールバック内から「最新の state」を読みたい room/endType/
  // participantId/generatingProblem の4つは、同じ値を state（描画用）と ref（closure 用）
  // の両方で持つ並行保持そのものは避けられない（Issue #28・T069/T070・FR-120）。
  // 避けられるのは「render のたびに ref.current を最新値へ同期する」処理が state ごとに
  // 手書きで散っていること。useLatestRef はこの同期を1箇所に集約し、Issue #41 では
  // その集約先そのものを4本の ref から1本のオブジェクト ref へさらにまとめる
  // （render 本体内で毎回新しいオブジェクトを渡すだけなので、4本のときと同期タイミングは
  // 変わらない＝挙動は変えない）。
  const latestRef = useLatestRef({ room, endType, participantId, generatingProblem });
  // 生成が返らない異常で固まらないための安全弁タイマー。
  const generatingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 参加/作成直後の resumeToken を、次に来る snapshot（room.code を含む）と組み合わせて
  // sessionStorage へ保存するための一時保持（Issue #24）。onIdentity では room.code が
  // まだ分からない（room.joined メッセージに code が含まれない）ため、onRoom まで持ち越す。
  // useLatestRef ではなく素の ref に直接書くのは、onIdentity → onRoom の間に React の
  // 再レンダーを待たずに値を受け渡したいため（両者は別々の WS メッセージから来る）。
  const pendingResumeRef = useRef<{ participantId: string; resumeToken: string } | null>(null);
  // 参加/作成時に指定した表示名。resumeToken 再送の room.join に必要
  // （サーバー側スキーマで displayName は必須項目のため・Issue #24）。
  const resumeDisplayNameRef = useRef<string>("");

  // App unmount 時にタイマーを掃除する（setState-on-unmounted を防ぐ）。
  useEffect(() => {
    return () => {
      if (generatingTimerRef.current) clearTimeout(generatingTimerRef.current);
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, []);

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
        // useLatestRef は render のたびに同期するため、ここではまだ前回値のまま
        // （このコールバック内では setRoom(r) 後も再レンダーが起きるまで前回値を保つ）。
        const prevRoom = latestRef.current.room;
        setRoom(r);
        // 直前の room.created/room.joined で受け取った resumeToken を、今来た snapshot の
        // room.code と組み合わせて保存する（Issue #24・FR-001）。一度保存すれば
        // このクライアントの生存期間中 code/participantId/resumeToken は変わらないため、
        // 以降の snapshot では再保存しない（sessionStorage への書き込みを1回に抑える）。
        if (pendingResumeRef.current) {
          saveResumeIdentity({
            code: r.code,
            participantId: pendingResumeRef.current.participantId,
            resumeToken: pendingResumeRef.current.resumeToken,
            displayName: resumeDisplayNameRef.current,
          });
          pendingResumeRef.current = null;
        }
        // 参加時ドライバー宣言: 自分が参加者に現れたら一度だけ rotation に加入する。
        const myId = latestRef.current.participantId;
        if (pendingDriverJoinRef.current && myId && r.participants.some((p) => p.participantId === myId)) {
          // 宣言は「参加時の一度きり」。輪に入れたかに関わらずここで降ろす。
          // 降ろさないと、後で自分が輪を抜けた瞬間に再追加が走り、意図しない再加入になる
          // （サーバー側の枠の消え方の誤りを覆い隠してもいた）。
          pendingDriverJoinRef.current = false;
          if (shouldAutoJoinRotation({ participantId: myId, rotation: r.session.rotation })) {
            newClient.send({ command: "member.add", participantId: myId });
          }
        }
        // 生成中で、お題の内容が前回から変化したら生成中を解除（AI 成功・定型縮退・タイムアウト確定の全経路）。
        if (shouldClearGenerating(latestRef.current.generatingProblem, prevRoom?.problem ?? null, r.problem ?? null)) {
          endGenerating();
        }
        // サーバー権威の phase に全参加者が追従する（ホストの開始/完成が全員に反映）
        setMode(screenForPhase(r.phase));
        // ロビー（開始前）でお題が未確定かつ problemEnabled=true なら、作成者が一度だけ代表生成を依頼する（US3）。
        // これがないと誰も problem.request を送らず「お題を準備中」のまま開始できない。
        if (
          shouldAutoRequestProblem({
            phase: r.phase,
            hasProblem: !!r.problem,
            isCreator: isCreatorRef.current,
            alreadyRequested: problemRequestedRef.current,
            problemEnabled: r.config.problemEnabled !== false,
          })
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
          !!r.problem &&
          r.config.problemEnabled !== false
        ) {
          newClient.send({ command: "problem.request", requestId: `req-${r.code}-cfg-${Date.now()}` });
          beginGenerating();
        }
        // 完成フェーズかつ「完成（中断でない）」のとき、各端末でローカル記録を生成し
        // IndexedDB へ永続化する（FR-020/028/059）。中断（abort）では記録を作らない。
        // 二重保存は recordSavedRef でガードする（celebration の snapshot が複数回来ても1回）。
        if (
          r.phase === "celebration" &&
          r.problem &&
          latestRef.current.endType !== "abort" &&
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
      onIdentity: ({ participantId: pid, resumeToken }) => {
        setParticipantId(pid);
        // room.code はこの時点でまだ分からないため、次の snapshot（onRoom）で保存する。
        pendingResumeRef.current = { participantId: pid, resumeToken };
      },
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
        // 画面が次に何をするかは errorAction() の判定に委ねる（Issue #32・FR-127/129）。
        // 分岐は kind の判別可能合併を網羅する（未処理の kind があれば型検査で気づける）。
        const action = errorAction(code);
        switch (action.kind) {
          case "session-lost": {
            // ルーム喪失（揮発サーバー再起動等）は明示的に「セッション喪失」を表示し、継続する（FR-007/059）。
            // ローカル記録は保持され、再接続では消えないよう sessionLost を立てる。
            setSessionLost(true);
            setBanner({ text: "セッションが見つかりません。ローカルの記録は保持されています。", kind: "error" });
            // ルームごと消失した以上、保存済みの resumeToken はもう使えない（Issue #24・FR-005）。
            clearResumeIdentity();
            return;
          }
          case "leave-room": {
            // 退出が成立した本人を取り残さない（自己退出＝LEFT_ROOM／他者に退出させられた＝
            // REMOVED_FROM_ROOM・REMOVED_BY_HOST）。後始末は行き先によらず共通で、
            // 違うのはバナー文言（friendlyError(code) から引く）と行き先だけ（Issue #32・FR-127/128）。
            const removedFrom = latestRef.current.room?.code ?? null;
            newClient.dispose();
            setRoom(null);
            setClient(null);
            setParticipantId("");
            isCreatorRef.current = false;
            problemRequestedRef.current = false;
            recordSavedRef.current = false;
            setSessionLost(false);
            setRecord(null);
            // 明示的に退出が成立した以上、この参加者としてのリジュームはもう意味を持たない
            // （次に別ルームへ入ったときに誤って古いルームへ復帰しようとしないため・Issue #24・FR-004）。
            clearResumeIdentity();
            // ルーム由来の画面状態は退出成立時に破棄する（FR-128）。
            // お題生成中フラグ・安全弁タイマーもルーム固有の途中状態なので、
            // 持ち越すと次に入った別ルームで「何も頼んでいないのに生成中」の
            // 表示が最大65秒残ってしまう。beginGenerating と対になる endGenerating を
            // ここでも再利用し、後始末を二重に書かない（DRY）。
            endGenerating();
            // バナー自動消去タイマーが生きていると、退出バナー表示後にそのタイマーが
            // 発火して退出バナーを消してしまう（例: ロビーの一時エラーで4秒タイマーが
            // 仕掛かった直後に自己退出した場合）。ここで確実に解除する。
            if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
            // 退出バナーは自動消去しない。入口画面へ遷移した後も「抜けたこと」を
            // 利用者が確認できるまで残し続けるべきで、新しいタイマーは張らない
            // （Issue #32 の狙い＝退出が分からない問題の再発防止）。
            bannerTimerRef.current = null;
            setBanner({ text: friendlyError(code), kind: "warn" });
            if (action.destination === "join") {
              // 直前のルームコードがあれば参加画面へ引き継ぐ（無ければ入口へ・現状の挙動を維持）。
              if (removedFrom) {
                setJoinCode(removedFrom);
                setMode("join");
              } else {
                setMode("setup");
              }
            } else {
              // destination === "setup": 入口画面へ戻すときは直前ルームへの手がかりを
              // 保持しない（FR-127 / US2-2）。joinCode に値が残っている可能性があるので
              // 明示的にクリアする。
              setJoinCode(null);
              // 画面上の state をクリアしただけでは不十分。アドレスバーの URL に
              // ?room=... が残っていると、それ自体が「直前のルームへ復帰するための
              // 手がかり」になり、リロード一発で抜けたはずのルームの参加画面へ
              // 戻ってしまう。pushState ではなく replaceState を使い、戻るボタンの
              // 履歴に退出前の URL を積まないようにする。
              window.history.replaceState(null, "", stripRoomParam(window.location.href));
              setMode("setup");
            }
            return;
          }
          case "transient": {
            // それ以外は「一時的な操作エラー」。分かりやすい日本語にし、数秒で自動消去する
            // （生のコードを残し続けない・画面遷移後も居座らせない）。
            setBanner({ text: friendlyError(code), kind: "warn" });
            if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
            bannerTimerRef.current = setTimeout(() => setBanner(null), 4000);
            return;
          }
          default: {
            // 網羅チェック: action.kind に新しい種類が増えたらここで型検査が落ちる（T018・DbC）。
            const exhaustive: never = action;
            return exhaustive;
          }
        }
      },
      onConnected: () => setBanner(null),
      onDisconnected: () =>
        setBanner({ text: "接続が切れました。再接続しています...", kind: "warn" }),
      onConnectionChange: (s) => setConnState(s),
      // WS が切断後に自動再接続したとき、保存済みの resumeToken で room.join を
      // 利用者の操作なしに再送する（Issue #24・FR-002/FR-003）。初回 connect() では
      // 呼ばれないため、ここでの二重送信は起きない。
      onReconnected: () => {
        const saved = loadResumeIdentity();
        if (!saved) return;
        newClient.send({
          command: "room.join",
          code: saved.code,
          displayName: saved.displayName,
          hasAiKey: false,
          resumeToken: saved.resumeToken,
        });
      },
      // 破壊的操作の実行者を全員へ伝える（Issue #22・FR-077）。
      // banner は aria-live 付きのライブリージョンなので、そのまま読み上げにも乗る。
      // participantId は state 更新の遅れを避けるため ref から取る（closure の固定を回避）。
      onNotice: (notice) => {
        const text = buildNoticeMessage(notice, {
          selfParticipantId: latestRef.current.participantId,
          participants: latestRef.current.room?.participants ?? [],
        });
        setBanner({ text, kind: "warn" });
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = setTimeout(() => setBanner(null), 4000);
      },
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
    resumeDisplayNameRef.current = displayName;
    const config: SessionConfig = {
      language: "TypeScript",
      difficulty: "easy",
      members: [displayName],
      // モブプロの一般的な既定は7分（v2.3 #4）。ロビーで host が config.set で調整できる。
      intervalMinutes: 7,
    };
    // お題生成は最新のルーム設定（ロビーでの編集を反映）を参照する。
    const c = makeClient(() => ({
      language: latestRef.current.room?.config.language ?? config.language,
      difficulty: latestRef.current.room?.config.difficulty ?? config.difficulty,
    }));
    c.send({ command: "room.create", displayName, config, ...(roomName && { roomName }) });
  };

  // 共有 URL（?room=コード）からの参加。mode="driver" なら snapshot 後に rotation 加入する。
  const handleJoinRoom = (
    code: string,
    displayName = "ゲスト",
    passphrase = "",
    mode: "driver" | "spectator" = "spectator",
  ) => {
    isCreatorRef.current = false;
    resumeDisplayNameRef.current = displayName;
    // driver 宣言を ref に記録しておき、snapshot で自分が現れたら member.add を送る。
    if (mode === "driver") pendingDriverJoinRef.current = true;
    const c = makeClient(() => ({
      language: latestRef.current.room?.config.language ?? "TypeScript",
      difficulty: latestRef.current.room?.config.difficulty ?? "easy",
    }));
    // 空のパスフレーズは送らない（未設定ルームの従来挙動を維持）。
    c.send({ command: "room.join", code, displayName, hasAiKey: false, ...(passphrase ? { passphrase } : {}) });
  };

  /** 自分をドライバーに加える（参加者IDで追加・D6b。冪等はサーバー側の重複ガードに委ねる）。 */
  const joinRotation = (participantId: string) => {
    client?.send({ command: "member.add", participantId });
  };
  /** 自分をローテーションから外す。index は描画時ではなく送信時の最新 snapshot
   *  （latestRef.current.room）から解決し、同時編集による index ずれで別人を外す事故を防ぐ（レビュー #1）。
   *  照合は参加者ID（D6b）なので、同名の別人の枠を外すことはない。 */
  const leaveRotation = (participantId: string) => {
    const idx = latestRef.current.room?.session.rotation.indexOf(participantId) ?? -1;
    if (idx >= 0) client?.send({ command: "member.remove", index: idx });
  };
  /** ホストが参加者を退出させる（⑪・host 限定）。 */
  const removeParticipant = (participantId: string) => {
    client?.send({ command: "participant.remove", participantId });
  };
  /** 自分の役割を自分で切り替える（Issue #22・FR-073b）。開始後のみサーバーが許可する。
   *  見学者だけが残った部屋を、本人の操作で解消できるようにするための経路。 */
  /** 主催者が他の参加者の役割を切り替える（開始前・FR-083）。
   *  開始前は checkPermission がホスト限定にしているので、送れるのは主催者だけである。 */
  const changeParticipantRole = (participantId: string, role: "editor" | "viewer") => {
    client?.send({ command: "role.set", participantId, role });
  };
  const changeOwnRole = (role: "editor" | "viewer") => {
    if (!latestRef.current.participantId) return;
    client?.send({ command: "role.set", participantId: latestRef.current.participantId, role });
  };
  /** ホストが任意のオンライン参加者へホストを明示移譲する（R2-3・host 限定）。 */
  const handleTransferHost = (participantId: string) => {
    client?.send({ command: "host.transfer", participantId });
  };
  /** ホストがルームのパスフレーズを設定/解除する（R4-2・host 限定）。空文字で解除。 */
  const handleSetPassphrase = (passphrase: string) => {
    client?.send({ command: "room.passphrase.set", passphrase });
  };
  /** AI お題生成の合言葉で解錠を試みる（host 限定）。 */
  const handleAiUnlock = (key: string) => {
    client?.send({ command: "ai.unlock", key });
  };
  /** AI ⇔ 定型モードを切り替える（host 限定）。 */
  const handleProblemModeSet = (mode: "ai" | "fallback") => {
    client?.send({ command: "problem.mode.set", mode });
  };
  /** ドライバー順を入れ替える（④・member.move）。host/editor が操作。 */
  const moveRotation = (fromIndex: number, toIndex: number) => {
    client?.send({ command: "member.move", fromIndex, toIndex });
  };
  /** ドライバー順をランダムに並べ替える（v2.3 #1・member.shuffle）。host が操作。
   *  順列はサーバーが生成するため wire は command のみ（稼働中は現ドライバーが固定される）。 */
  const handleShuffle = () => {
    client?.send({ command: "member.shuffle" });
  };

  const handleComplete = () => {
    setEndType("complete");
    // サーバーへ完成を通知。画面遷移と記録生成・保存は snapshot 受信（onRoom の celebration
    // 処理）で全参加者一斉に行う。ホストだけ先行しない。
    client?.send({ command: "session.complete" });
  };

  /** 途中で終える（中断）。完成と異なり記録は残さない（FR-020）。
   *  画面遷移は snapshot（celebration）受信で全員一斉。 */
  const handleAbort = () => {
    setEndType("abort");
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
    // 依存は ref と setter のみで、いずれも再生成されない（exhaustive-deps も指摘しない）。
  }, []);

  useEffect(() => {
    return () => {
      client?.dispose();
    };
  }, [client]);

  // ホスト交代（明示移譲/自動委譲の双方）を snapshot 差分で検知し、既存 banner で告知する（R2-4）。
  useEffect(() => {
    if (!room) {
      prevHostRef.current = undefined;
      return;
    }
    const msg = hostChangeMessage(prevHostRef.current, room, participantId);
    prevHostRef.current = room.hostParticipantId;
    if (msg) {
      setBanner({ text: msg, kind: "warn" });
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = setTimeout(() => setBanner(null), 4000);
    }
  }, [room, participantId]);


  // 共有時の操作はすべて WS コマンド送信（サーバーが状態をミラーし全員へ反映）。
  const act = (action: "SWITCH" | "PAUSE" | "RESUME" | "RESTART") => {
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
  const rosterAssign = (pid: string) => {
    client?.send({ command: "driver.assign", participantId: pid });
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
    const p = latestRef.current.room?.problem;
    if (!p || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(formatProblemText(p)).catch(() => {
      /* 権限拒否等は無視 */
    });
  };

  // 生成中フラグを立て、65 秒の安全弁を張る（サーバ 60 秒タイムアウト＋余裕）。
  const beginGenerating = () => {
    setGeneratingProblem(true);
    if (generatingTimerRef.current) clearTimeout(generatingTimerRef.current);
    generatingTimerRef.current = setTimeout(() => {
      setGeneratingProblem(false);
      generatingTimerRef.current = null;
    }, 65_000);
  };
  const endGenerating = () => {
    setGeneratingProblem(false);
    if (generatingTimerRef.current) {
      clearTimeout(generatingTimerRef.current);
      generatingTimerRef.current = null;
    }
  };

  const regenerateProblem = () => {
    const code = latestRef.current.room?.code;
    if (code) {
      beginGenerating();
      // 直近のお題と重複しにくい新規生成を代表へ依頼する（FR-012）。
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
  // 接続状態: 喪失が最優先、それ以外は WS クライアントの通知に従う（R5-1）。
  const connectionStatus = deriveConnectionStatus(sessionLost, connState);

  /** セッション/ロビーはダークステージ固定。Setup/Summary は通常テーマ。 */
  const renderBody = () => {
    if (mode === "lobby" && room) {
      return (
        <Lobby
          key={room.code}
          room={room}
          participantId={participantId}
          generatingProblem={generatingProblem}
          onStartSession={() => {
            const problemEnabled = room.config.problemEnabled !== false;
            if (problemEnabled && !room.problem) {
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
          onRoleSet={changeParticipantRole}
          onTransferHost={handleTransferHost}
          onMoveRotation={moveRotation}
          onShuffle={handleShuffle}
          onSetPassphrase={handleSetPassphrase}
          onAiUnlock={handleAiUnlock}
          onProblemModeSet={handleProblemModeSet}
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
          clockOffset={client?.clockOffset ?? 0}
          awaitingProblem={!room.problem}
          onSkip={() => act("SWITCH")}
          onPause={() => act("PAUSE")}
          onResume={() => act("RESUME")}
          // 現ドライバーのまま持ち時間だけを満タンからやり直す（Issue #14）。
          onRestartTimer={() => act("RESTART")}
          onComplete={handleComplete}
          onAbort={handleAbort}
          onReset={() => client?.send({ command: "session.reset" })}
          onHandoffNoteSet={(text) => client?.send({ command: "handoff.note.set", text })}
          onJoinRotation={joinRotation}
          onLeaveRotation={leaveRotation}
          onRenameParticipant={rosterRename}
          onDriverSkip={rosterSkip}
          onDriverResume={rosterResume}
          onDriverAssign={rosterAssign}
          onAddProxy={rosterAddProxy}
          onRemoveParticipant={removeParticipant}
          onSelfRoleChange={changeOwnRole}
          onTransferHost={handleTransferHost}
          onMoveRotation={moveRotation}
          onShuffle={handleShuffle}
          onEditProblem={editProblem}
          onCopyProblem={copyProblem}
          onRegenerateProblem={regenerateProblem}
          onPasteProblem={pasteProblem}
          onSetPassphrase={handleSetPassphrase}
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
      return <Join code={joinCode} onJoin={(name, passphrase, joinMode) => handleJoinRoom(joinCode, name, passphrase, joinMode)} />;
    }

    // 端末ローカルの完了記録を可視化する履歴ビュー（v2.3 #5）。Setup から開き、戻ると Setup へ。
    if (mode === "history") {
      return <History onBack={() => setMode("setup")} />;
    }

    return <Setup onCreateRoom={handleCreateRoom} onShowHistory={() => setMode("history")} />;
  };

  return (
    <Stage>
      {/* 永続ステータスストリップ（全画面共通・FR-036）。参加前（Setup/Join）と履歴（history）は出さない。 */}
      {mode !== "setup" && mode !== "join" && mode !== "history" && (
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
