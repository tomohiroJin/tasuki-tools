/**
 * メインアプリコンポーネント
 */

import React, { useState, useEffect, useRef } from "react";
import { Setup } from "./ui/Setup.js";
import { Join } from "./ui/Join.js";
import { Lobby } from "./ui/Lobby.js";
import { Session } from "./ui/Session.js";
import { Summary, type EndType } from "./ui/Summary.js";
import { SessionLost } from "./ui/SessionLost.js";
import { History } from "./ui/History.js";
import { StatusStrip } from "./ui/components/StatusStrip.js";
import { deriveConnectionStatus, type ClientConnState } from "./ui/connection-status.js";
import { SyncClient, type Identity } from "./sync/client.js";
import {
  saveResumeIdentity,
  loadResumeIdentity,
  clearResumeIdentity,
  shouldResumeOnLoad,
} from "./sync/resume-identity.js";
import { buildNoticeMessage, type NoticeSignal } from "./sync/notice-message.js";
import { buildSyncUrl } from "./sync/sync-url.js";
import { NoAiProvider } from "./ai/no-ai.js";
import type { ProblemProvider } from "./ai/provider.js";
import { errorAction } from "./ui/error-action.js";
import { stripRoomParam } from "./ui/room-param.js";
import { hostChangeMessage } from "./ui/host-change.js";
import { useLatestRef } from "./ui/use-latest-ref.js";
import { Stage } from "./ui/primitives.js";
import { createCommands } from "./sync/commands.js";
import { useBanner } from "./ui/use-banner.js";
import { saveRecord } from "./records/indexeddb.js";
import { persistRecordIfComplete } from "./records/persist.js";
import { decideSnapshotIntents } from "./sync/snapshot-intents.js";
import { displayMessageFor } from "@tasuki/timer-core";
import type { Room, SessionConfig, CompletionRecord, Problem } from "@tasuki/timer-core";

/** 常に定型バンク（NoAiProvider）を返す。client 側で AI を直接呼ぶ経路（BYOK）は
 *  #28 T010 で撤去済み。サーバー常駐の AI 生成（docs/timer/adr/0008）は残っており、
 *  その解錠とモード切替は `handleAiUnlock` / `handleProblemModeSet` が担う。 */
function resolveProvider(): ProblemProvider {
  // AI はいったん撤去。常に定型バンク（NoAiProvider）を使う。
  return new NoAiProvider();
}

type AppMode = "setup" | "join" | "lobby" | "session" | "celebration" | "history";

/**
 * ドメインエラーコードを利用者向けの日本語文へ変換する（生のコードを画面に出さない）。
 *
 * **判定規則そのものが @tasuki/timer-core の `displayMessageFor()` にある**（T065・FR-105・FR-107）。
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
  const { banner, show: showBanner, clear: clearBanner } = useBanner();
  // 終了種別（完成/中断）。Summary の見出し・記録の出し分けに使う（FR-020）。
  const [endType, setEndType] = useState<EndType>("complete");
  // セッション喪失（room-not-found）。StatusStrip を lost 表示にし、再接続では消えない。
  const [sessionLost, setSessionLost] = useState(false);
  // 接続状態は WS クライアントから明示通知される（banner には結合しない・R5-1）。
  const [connState, setConnState] = useState<ClientConnState>("online");
  // 注: AI（BYOK/サブスク）はいったん UI から撤去。お題は定型バンクのみ（NoAiProvider）。
  // このクライアントがルーム作成者（＝当初ホスト）か。ロビーでお題生成を自動依頼する判定に使う。
  // state の写しではない純粋なガード用 ref（Issue #46 でこの種の ref だけが残った）。
  const isCreatorRef = useRef(false);
  // 参加時に "driver" を選択したか。snapshot で自分が参加者に現れたら member.add を一度だけ送る。
  // 名前ではなく「宣言したか」だけを持つ（誰を加えるかは自分の participantId で決まる・D6b）。
  const pendingDriverJoinRef = useRef(false);
  // ロビーでのお題自動生成依頼を一度だけ行うためのガード。
  const problemRequestedRef = useRef(false);
  // 完成記録の二重保存を防ぐガード（celebration の snapshot が複数回来ても1回だけ保存）。
  const recordSavedRef = useRef(false);
  // ホスト交代検知用に直前 snapshot の hostParticipantId を保持する（R2-4）。
  const prevHostRef = useRef<string | undefined>(undefined);
  // AI/定型のお題生成中（「別のお題にする」押下〜新お題確定まで）。スピナー＋減光に使う。
  const [generatingProblem, setGeneratingProblem] = useState(false);
  // 生成が返らない異常で固まらないための安全弁タイマー。
  const generatingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 参加/作成直後の resumeToken を、次に来る snapshot（room.code を含む）と組み合わせて
  // sessionStorage へ保存するための一時保持（Issue #24）。onIdentity では room.code が
  // まだ分からない（room.joined メッセージに code が含まれない）ため、onRoom まで持ち越す。
  // 素の ref に直接書くのは、onIdentity → onRoom の間に React の再レンダーを待たずに
  // 値を受け渡したいため（両者は別々の WS メッセージから来る）。ハンドラの closure から
  // 読む値ではないので、handlersRef 経由の仕組みには乗らない。
  const pendingResumeRef = useRef<{ participantId: string; resumeToken: string } | null>(null);
  // 参加/作成時に指定した表示名。resumeToken 再送の room.join に必要
  // （サーバー側スキーマで displayName は必須項目のため・Issue #24）。
  const resumeDisplayNameRef = useRef<string>("");

  // App unmount 時にタイマーを掃除する（setState-on-unmounted を防ぐ）。
  useEffect(() => {
    return () => {
      if (generatingTimerRef.current) clearTimeout(generatingTimerRef.current);
    };
  }, []);

  /** 代理参加者の一意な participantId を生成する（衝突回避のため乱数を含める） */
  const makeProxyId = () => `proxy-${Math.random().toString(36).slice(2, 10)}`;

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

  // ─── SyncClient のコールバック本体 ─────────────────────────────────────────
  //
  // `SyncClient` のコールバックは生成時の値で固定される closure である（Issue #28）。
  // かつては「最新の state を読むために、同じ値を state と ref の両方で持つ」ことで
  // これを回避していたが、その並行保持そのものが二重管理の温床だった（Issue #41）。
  //
  // 代わりに、ハンドラ本体を render 本体のスコープに置き、`handlersRef` へ毎レンダー
  // 同期する。`SyncClient` へ渡すのは `handlersRef.current` の同名関数を呼ぶだけの
  // 転送関数なので、固定されるのは転送だけで、実際に走るのは常に最新レンダーの
  // ハンドラになる。結果、これらのハンドラは `room` / `endType` / `participantId` /
  // `generatingProblem` を **素の state としてそのまま読める**（Issue #46）。
  //
  // client インスタンスだけは第1引数で受け取る。`client` state は `makeClient` 直後の
  // メッセージ処理時点ではまだ `null` のため、ここから読んではいけない。

  const handleRoom = (syncClient: SyncClient, r: Room) => {
    // `room` はこのハンドラを作ったレンダーの const なので、下で `setRoom(r)` しても
    // このスコープ内では変わらない。値は「直前のレンダー時点の snapshot」である。
    const prevRoom = room;
    setRoom(r);

    const intents = decideSnapshotIntents(prevRoom, r, {
      participantId,
      pendingResume: pendingResumeRef.current,
      resumeDisplayName: resumeDisplayNameRef.current,
      pendingDriverJoin: pendingDriverJoinRef.current,
      isCreator: isCreatorRef.current,
      problemRequested: problemRequestedRef.current,
      recordSaved: recordSavedRef.current,
      generatingProblem,
      endType,
      now: Date.now(),
    });

    for (const intent of intents) {
      switch (intent.kind) {
        case "save-resume":
          saveResumeIdentity(intent.identity);
          pendingResumeRef.current = null;
          break;
        case "consume-driver-join":
          pendingDriverJoinRef.current = false;
          break;
        case "join-rotation":
          syncClient.send({ command: "member.add", participantId: intent.participantId });
          break;
        case "clear-generating":
          endGenerating();
          break;
        case "set-screen":
          setMode(intent.screen);
          break;
        case "request-problem":
          problemRequestedRef.current = true;
          syncClient.send({ command: "problem.request", requestId: intent.requestId });
          break;
        case "regenerate-problem":
          syncClient.send({ command: "problem.request", requestId: intent.requestId });
          beginGenerating();
          break;
        case "persist-completion":
          recordSavedRef.current = true;
          setRecord((prev) => prev ?? intent.record);
          // 完成記録を端末ローカルに自動保存（押し忘れ防止・FR-020「達成を記録」）。
          persistRecordIfComplete("complete", intent.record, saveRecord).catch((e) =>
            console.error("完成記録の保存に失敗しました:", e),
          );
          break;
        default: {
          // 網羅チェック: 新しい意図が増えたらここで型検査が落ちる（DbC）。
          const exhaustive: never = intent;
          return exhaustive;
        }
      }
    }
  };

  const handleIdentity = ({ participantId: pid, resumeToken }: Identity) => {
    setParticipantId(pid);
    // room.code はこの時点でまだ分からないため、次の snapshot（handleRoom）で保存する。
    pendingResumeRef.current = { participantId: pid, resumeToken };
  };

  const handleNeedProblem = async (syncClient: SyncClient, requestId: string) => {
    // 代表に選ばれたらお題を生成して投入する（FR-025）。失敗時もプロバイダが定型へ縮退。
    try {
      // 言語・難易度は最新のルーム設定（ロビーでの編集を反映）から引く。
      // ★await より前に読む: 生成待ちの間に届いた snapshot の値を使わないため（Issue #46 REQ-7）。
      const language = room?.config.language ?? "TypeScript";
      const difficulty = room?.config.difficulty ?? "easy";
      const provider = resolveProvider();
      const { problem, source } = await provider.generate(language, difficulty);
      syncClient.send({
        command: "problem.submit",
        requestId,
        problem,
        usedFallback: source === "fallback",
      });
    } catch (e) {
      console.error("お題生成に失敗しました（deadline で再委譲されます）:", e);
    }
  };

  const handleError = (syncClient: SyncClient, code: string) => {
    console.error("WS error:", code);
    // 画面が次に何をするかは errorAction() の判定に委ねる（Issue #32・FR-127/129）。
    // 分岐は kind の判別可能合併を網羅する（未処理の kind があれば型検査で気づける）。
    const action = errorAction(code);
    switch (action.kind) {
      case "session-lost": {
        // ルーム喪失（揮発サーバー再起動等）は明示的に「セッション喪失」を表示し、継続する（FR-007/059）。
        // ローカル記録は保持され、再接続では消えないよう sessionLost を立てる。
        setSessionLost(true);
        // 説明は SessionLost 画面が担う（#76 F-4）。バナーは再接続のたびに
        // onConnected で消えるため、喪失のような「消えては困る事実」には向かない。
        clearBanner();
        // ルームごと消失した以上、保存済みの resumeToken はもう使えない（Issue #24・FR-005）。
        clearResumeIdentity();
        return;
      }
      case "leave-room": {
        // 退出が成立した本人を取り残さない（自己退出＝LEFT_ROOM／他者に退出させられた＝
        // REMOVED_FROM_ROOM・REMOVED_BY_HOST）。後始末は行き先によらず共通で、
        // 違うのはバナー文言（friendlyError(code) から引く）と行き先だけ（Issue #32・FR-127/128）。
        const removedFrom = room?.code ?? null;
        syncClient.dispose();
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
        // 退出バナーは自動消去しない。入口画面へ遷移した後も「抜けたこと」を
        // 利用者が確認できるまで残し続けるべきで、新しいタイマーは張らない
        // （Issue #32 の狙い＝退出が分からない問題の再発防止）。show 側が
        // 直前の自動消去タイマー（例: ロビーの一時エラーの4秒タイマー）を解除する。
        showBanner(friendlyError(code), "warn", { autoDismiss: false });
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
        showBanner(friendlyError(code), "warn");
        return;
      }
      default: {
        // 網羅チェック: action.kind に新しい種類が増えたらここで型検査が落ちる（T018・DbC）。
        const exhaustive: never = action;
        return exhaustive;
      }
    }
  };

  // WS が切断後に自動再接続したとき、保存済みの resumeToken で room.join を
  // 利用者の操作なしに再送する（Issue #24・FR-002/FR-003）。初回 connect() では
  // 呼ばれないため、ここでの二重送信は起きない。
  const handleReconnected = (syncClient: SyncClient) => {
    const saved = loadResumeIdentity();
    if (!saved) return;
    syncClient.send({
      command: "room.join",
      code: saved.code,
      displayName: saved.displayName,
      hasAiKey: false,
      resumeToken: saved.resumeToken,
    });
  };

  // 破壊的操作の実行者を全員へ伝える（Issue #22・FR-077）。
  // banner は aria-live 付きのライブリージョンなので、そのまま読み上げにも乗る。
  const handleNotice = (notice: NoticeSignal) => {
    const text = buildNoticeMessage(notice, {
      selfParticipantId: participantId,
      participants: room?.participants ?? [],
    });
    showBanner(text, "warn");
  };

  // 上のハンドラ群を1本の ref へ毎レンダー同期する。同期は render 本体で行う
  // （useEffect を挟むと差し替えが1レンダー遅れ、その隙間に届いた WS メッセージを
  // 古いハンドラが処理してしまう・Issue #46 REQ-3）。
  const handlersRef = useLatestRef({
    handleRoom,
    handleIdentity,
    handleNeedProblem,
    handleError,
    handleReconnected,
    handleNotice,
  });

  // SyncClient の配線を create/join で共有する。
  // 各コールバックは handlersRef.current の同名ハンドラへ転送するだけで、
  // 生成時に固定されても実際に走るのは常に最新レンダーのハンドラになる。
  // onConnected / onDisconnected / onConnectionChange は setter 呼び出し1行で、
  // setter の同一性は React が保証しているため closure 固定の害がなく、転送を挟まない。
  const makeClient = (): SyncClient => {
    const newClient = new SyncClient({
      url: buildSyncUrl(window.location),
      onRoom: (r) => handlersRef.current.handleRoom(newClient, r),
      onIdentity: (identity) => handlersRef.current.handleIdentity(identity),
      onNeedProblem: (requestId) => handlersRef.current.handleNeedProblem(newClient, requestId),
      onError: (code) => handlersRef.current.handleError(newClient, code),
      onConnected: () => clearBanner(),
      onDisconnected: () =>
        showBanner("接続が切れました。再接続しています...", "warn", { autoDismiss: false }),
      onConnectionChange: (s) => setConnState(s),
      onReconnected: () => handlersRef.current.handleReconnected(newClient),
      onNotice: (notice) => handlersRef.current.handleNotice(notice),
    });
    newClient.connect();
    setClient(newClient);
    return newClient;
  };

  // mount 時 effect（再読込での復帰）から呼ぶための ref。makeClient は毎レンダー
  // 作り直されるため、依存配列へ入れると effect が毎レンダー走ってしまう。
  const makeClientRef = useLatestRef(makeClient);

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
    const c = makeClient();
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
    const c = makeClient();
    // 空のパスフレーズは送らない（未設定ルームの従来挙動を維持）。
    c.send({ command: "room.join", code, displayName, hasAiKey: false, ...(passphrase ? { passphrase } : {}) });
  };

  // client / room は state なので毎レンダー作り直されるが、送信は都度呼ぶだけなのでメモ化
  // しない（現行の 1 行ラッパーも毎レンダー作り直されており、同じ性質を保つ）。
  // room はこのレンダーのクロージャが持つ値をそのまま渡す（useLatestRef にしない）。
  // 旧 leaveRotation もそのレンダーの room を読んでおり、commands 自体が毎レンダー
  // 作り直されるので「送信時点の room」を引くという性質は変わらない。
  const commands = createCommands(
    (cmd) => client?.send(cmd),
    () => room,
  );

  /** 自分をドライバーに加える（参加者IDで追加・D6b。冪等はサーバー側の重複ガードに委ねる）。 */
  const joinRotation = commands.addMember;
  /** 自分をローテーションから外す。index は描画時ではなく送信時の最新 snapshot から
   *  解決し、同時編集による index ずれで別人を外す事故を防ぐ（レビュー #1）。
   *  この関数は毎レンダー作り直されて子へ渡り（メモ化していない）、`room` は
   *  直前にコミットされた snapshot なので、押した瞬間の最新から解決できる。
   *  照合は参加者ID（D6b）なので、同名の別人の枠を外すことはない。 */
  const leaveRotation = commands.removeMember;
  /** ホストが参加者を退出させる（⑪・host 限定）。 */
  const removeParticipant = commands.removeParticipant;
  /** 自分の役割を自分で切り替える（Issue #22・FR-073b）。開始後のみサーバーが許可する。
   *  見学者だけが残った部屋を、本人の操作で解消できるようにするための経路。 */
  /** 主催者が他の参加者の役割を切り替える（開始前・FR-083）。
   *  開始前は checkPermission がホスト限定にしているので、送れるのは主催者だけである。 */
  const changeParticipantRole = commands.setRole;
  const changeOwnRole = (role: "editor" | "viewer") => {
    if (!participantId) return;
    commands.setRole(participantId, role);
  };
  /** ホストが任意のオンライン参加者へホストを明示移譲する（R2-3・host 限定）。 */
  const handleTransferHost = commands.transferHost;
  /** ホストがルームのパスフレーズを設定/解除する（R4-2・host 限定）。空文字で解除。 */
  const handleSetPassphrase = commands.setPassphrase;
  /** AI お題生成の合言葉で解錠を試みる（host 限定）。 */
  const handleAiUnlock = commands.aiUnlock;
  /** AI ⇔ 定型モードを切り替える（host 限定）。 */
  const handleProblemModeSet = commands.setProblemMode;
  /** ドライバー順を入れ替える（④・member.move）。host/editor が操作。 */
  const moveRotation = commands.moveMember;
  /** ドライバー順をランダムに並べ替える（v2.3 #1・member.shuffle）。host が操作。
   *  順列はサーバーが生成するため wire は command のみ（稼働中は現ドライバーが固定される）。 */
  const handleShuffle = commands.shuffleMembers;

  const handleComplete = () => {
    setEndType("complete");
    // サーバーへ完成を通知。画面遷移と記録生成・保存は snapshot 受信（onRoom の celebration
    // 処理）で全参加者一斉に行う。ホストだけ先行しない。
    commands.completeSession();
  };

  /** 途中で終える（中断）。完成と異なり記録は残さない（FR-020）。
   *  画面遷移は snapshot（celebration）受信で全員一斉。 */
  const handleAbort = () => {
    setEndType("abort");
    setRecord(null);
    commands.abortSession();
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
  //
  // ただし**同じタブで再読込した本人だけは例外**で、保存済みの resumeToken で
  // そのまま戻す（#76 F-3）。従来は復帰が WS の自動再接続経路にしかなく、
  // 再読込・タブ復元のたびに名前と参加方法を入れ直し、ローテーションにも
  // 入り直す必要があった。
  const joinedFromUrlRef = useRef(false);
  useEffect(() => {
    if (joinedFromUrlRef.current) return;
    const code = new URLSearchParams(window.location.search).get("room");
    if (!code) return;
    joinedFromUrlRef.current = true;
    // 参加画面を先に立てておく。復帰が成立すれば snapshot 受信で
    // ロビー/セッションへ上書きされ、成立しなければここが行き先になる
    // （失効トークン・消えたルームの経路を別に用意しなくて済む）。
    setJoinCode(code);
    setMode("join");

    const saved = loadResumeIdentity();
    if (!shouldResumeOnLoad(saved, code)) return;

    isCreatorRef.current = false;
    resumeDisplayNameRef.current = saved.displayName;
    // makeClient は毎レンダー作り直されるので、この mount 時 effect からは
    // ref 経由で呼ぶ（このファイルの handlersRef と同じ作法・Issue #46）。
    const makeClientNow = makeClientRef.current;
    // 「自分が誰か」を保存値から先に立てる。再接続経路と違い、ページ読み込み直後は
    // participantId が空で、snapshot だけでは自分を特定できない。空のままだと
    // StatusStrip が config.members[0]（＝作成者）へ縮退し、**復帰した本人が
    // 他人の名前と役割を見る**ことになる。サーバーが identity を再発行すれば上書きされる。
    setParticipantId(saved.participantId);
    const c = makeClientNow();
    c.send({
      command: "room.join",
      code: saved.code,
      displayName: saved.displayName,
      hasAiKey: false,
      resumeToken: saved.resumeToken,
    });
    // 依存は ref と setter のみで、いずれも再生成されない。ref オブジェクトの同一性は
    // レンダーを跨いで保たれるため、依存に挙げてもこの effect は mount 時の 1 回きり。
  }, [makeClientRef]);

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
      showBanner(msg, "warn");
    }
  }, [room, participantId]);


  // 共有時の操作はすべて WS コマンド送信（サーバーが状態をミラーし全員へ反映）。
  // セッション画面が使ってよいのは 4 値だけ。開始（START）はロビーの開始処理が送る。
  const act = (action: "SWITCH" | "PAUSE" | "RESUME" | "RESTART") => commands.actSession(action);

  // ─── 在席一覧（RosterPanel）操作 ───────────────────────────────────────────
  // WS コマンドを送信し、サーバーが rotation/participants をミラーして全員へ反映する。
  const rosterRename = commands.renameParticipant;
  const rosterSkip = commands.driverSkip;
  const rosterResume = commands.driverResume;
  const rosterAssign = commands.driverAssign;
  const rosterAddProxy = (displayName: string) => commands.addProxy(makeProxyId(), displayName);

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

  const editProblem = commands.editProblem;

  const copyProblem = () => {
    const p = room?.problem;
    if (!p || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(formatProblemText(p)).catch(() => {
      /* 権限拒否等は無視 */
    });
  };

  const regenerateProblem = () => {
    const code = room?.code;
    if (code) {
      beginGenerating();
      // 直近のお題と重複しにくい新規生成を代表へ依頼する（FR-012）。
      commands.requestProblem(`req-${code}-regen-${Date.now()}`);
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
    // ルームが消えた以上、ロビー・セッション・完了の操作はどれも効かない（#76 F-4）。
    // 履歴は端末ローカルなので喪失しても見られる。ここで先に分岐して、
    // 押しても何も起きない画面を残さない。
    if (sessionLost && mode !== "history") {
      return (
        <SessionLost
          code={room?.code}
          onNewSession={handleNewSession}
          onShowHistory={() => setMode("history")}
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
          onStartSession={() => {
            const problemEnabled = room.config.problemEnabled !== false;
            if (problemEnabled && !room.problem) {
              commands.requestProblem(`req-${room.code}`);
            }
            commands.setPhase("session");
            commands.actSession("START");
            setMode("session");
          }}
          onEditProblem={editProblem}
          onRegenerateProblem={regenerateProblem}
          onPasteProblem={pasteProblem}
          onCopyProblem={copyProblem}
          onConfigSet={commands.setConfig}
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
          onReset={commands.resetSession}
          onHandoffNoteSet={commands.setHandoffNote}
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
              showBanner("記録の保存に失敗しました。", "error", { autoDismiss: false });
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
