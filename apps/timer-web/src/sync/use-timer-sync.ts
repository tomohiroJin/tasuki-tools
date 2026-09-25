/**
 * timer-web の唯一の同期フック（#167 E4・`docs/adr/0015` MUST 2）。
 *
 * WebSocket の接続状態とメッセージ配線をここに集約する。画面コンポーネント
 * （`App.tsx` を含む）は `sync/client.js` を直接 import しない。
 *
 * ## handlersRef の作法（Issue #41 → #46 で 2 度の試行を経て選ばれた形）
 *
 * `SyncClient` のコールバックは生成時の値で固定される closure である（Issue #28）。
 * かつては「最新の state を読むために、同じ値を state と ref の両方で持つ」ことで
 * 回避していたが、その並行保持そのものが二重管理の温床だった（Issue #41）。
 *
 * 代わりに、ハンドラ本体をこのフックの本体スコープに置き、`handlersRef` へ毎レンダー
 * 同期する。`SyncClient` へ渡すのは `handlersRef.current` の同名関数を呼ぶだけの
 * 転送関数なので、固定されるのは転送だけで、実際に走るのは常に最新レンダーの
 * ハンドラになる。結果、これらのハンドラは `room` / `endType` / `participantId`
 * を **素の state としてそのまま読める**（Issue #46）。
 *
 * **同期は render 本体で行う。** `useEffect` を挟むと差し替えが 1 レンダー遅れ、
 * その隙間に届いた WS メッセージを古いハンドラが処理する（Issue #46 REQ-3）。
 *
 * ## バナーを引数で受け取る理由
 *
 * バナーは WS 配線ではない（`docs/adr/0015` MUST 2 の対象外）。画面側にも
 * 「記録の保存に失敗しました」を出す経路があるため、コントローラを外から渡して共有する。
 */

import { useEffect, useRef, useState } from "react";
import { SyncClient, type Identity } from "./client.js";
import { createCommands, type TimerCommands } from "./commands.js";
import { decideSnapshotIntents } from "./snapshot-intents.js";
import { buildNoticeMessage, type NoticeSignal } from "./notice-message.js";
import { buildSyncUrl } from "./sync-url.js";
import { indicatesStaleRoom } from "./stale-frame.js";
import { shouldResumeOnLoad } from "./resume-identity.js";
import { decideEntry, hubRoomPath } from "../ui/entry.js";
import { errorAction } from "../ui/error-action.js";
import { startActionFor } from "../ui/session-start.js";
import { currentSearch, redirectTo } from "../platform/location.js";
import {
  buildInviteUrl,
  clearResumeIdentity,
  joinRetryDelayMs,
  loadResumeIdentity,
  saveResumeIdentity,
} from "@tasuki/sync-client";
import { useLatestRef } from "../ui/use-latest-ref.js";
import type { BannerController } from "../ui/use-banner.js";
import type { ClientConnState } from "../ui/connection-status.js";
import type { EndType } from "../ui/Summary.js";
import { saveRecord } from "../records/indexeddb.js";
import { persistRecordIfComplete } from "../records/persist.js";
import { displayMessageFor } from "@tasuki/timer-core";
import type { CompletionRecord, Room } from "@tasuki/timer-core";
import type { Topic } from "@tasuki/topic-core";

/** 混雑で入室を拒まれ、自動で入り直している間の案内（#147）。 */
const JOIN_RETRY_WAITING_TEXT = "混み合っています。自動で入り直しています…";
/** 自動で入り直しても入れなかったときの案内（#147）。 */
const JOIN_RETRY_EXHAUSTED_TEXT = "混雑が続いています。時間をおいてから再読込してください";
/**
 * ルームに入る前に同期フレームを捨てたときの案内（#209）。
 *
 * **StatusStrip はルームに入るまで描画されない**ので、その間だけバナーで補う。
 * 再読込を促さないのは、継続する棄却の原因がサーバー側のルームに残った値で、
 * 再読込しても直らないため（`docs/timer/adr/0006` の追記）。
 */
const SYNC_STALE_BEFORE_ROOM_TEXT =
  "同期できていません。ルームの状態が読み込めないため、先へ進めません。";

/**
 * `room.join` を送ってから諦めるまでの待ち時間（#292・利用者が承認した値）。
 *
 * **これが無いと、繋がっているのにサーバーが答えない場合に無言で永久に待つ。**
 * 切断なら `onDisconnected` がバナーを出し、棄却・退出・混雑もそれぞれ表示を持つが、
 * **無応答だけがどこにも現れなかった**（`@tasuki/sync-client` のタイマーは再接続用の
 * 1 つだけで、応答が来ないことを測る場所がどこにも無い）。
 *
 * **混雑の待ち（`joinRetryDelayMs`）より短くてよい。** あちらは最大 30 秒＋ばらつきで
 * この値を必ず超えるが、混雑は「待てば入れる」経路で、届いた拒否ごとにこの期限を
 * 畳んでいる（`retry-later` の分岐）。期限が測るのは**入り直しを送ってからの沈黙**である。
 */
const JOIN_RESPONSE_DEADLINE_MS = 10_000;

/**
 * ルームの中で表示する画面（#95 S5c・R9）。
 *
 * **旧入口（`Setup` / `Join`）を撤去したので、ルームの外の画面はここに無い。**
 * 名乗りも合言葉もハブ（玄関）に 1 つだけあり、timer は「そのルームのどこに居るか」
 * だけを持つ。端末の完了記録（履歴）も URL（`?view=history`）が決めるもので、
 * ルームの状態ではないため、ここには現れない（`ui/entry.ts`）。
 *
 * 値は `ui/screen.ts` の {@link Screen} と同じ —— サーバー権威の `phase` に追従する。
 */
export type AppMode = "lobby" | "session" | "celebration";

/**
 * timer の画面が同期から受け取るもの。
 *
 * **`createRoom` / `joinRoom` はここに無い**（#272）。ルームを作るのも名乗るのも
 * 玄関（`apps/landing`）の仕事で、timer が入るのは URL（`?room=`）とその端末に
 * 保存された同一性からだけである（このファイル末尾の入口の effect）。
 */
export interface TimerSync {
  /**
   * 表示すべき画面。**まだどの画面でもないときは `null`。**
   *
   * `"lobby"` を初期値にしてはいけない。ルームが無い間は `mode === "lobby" && room` が
   * 偽なので描画はされないが、**意味が嘘になる**（ロビーに居ないのにロビーと言う）。
   */
  mode: AppMode | null;
  room: Room | null;
  /**
   * いま居るルームの参加用 URL（ルームに入っていなければ null）。
   *
   * 組み立ては `@tasuki/sync-client` に 1 つだけあり、**それを取り込むのはこのフックの
   * 仕事である** —— 画面（`.tsx`）は同期クライアントを直接 import しない
   * （`docs/guides/architecture.md` の層の対応表・`docs/adr/0015`）。
   */
  inviteUrl: string | null;
  participantId: string;
  record: CompletionRecord | null;
  endType: EndType;
  /** セッション喪失（room-not-found）。再接続では消えない。 */
  sessionLost: boolean;
  connState: ClientConnState;
  /**
   * 契約に合わない同期フレームを捨てて以降、新しい状態を受け取れていない（#209）。
   * 接続は生きているので `connState` では表せない。StatusStrip の「同期不整合」に使う。
   */
  syncStale: boolean;
  /**
   * `room.join` の答えを待つ期限が切れた（#292）。
   *
   * **画面に出るのは `mode === null` の間だけ**である（`Loading` が受け取る）。
   * ルームの画面が決まった後（再接続の再送など）に立っても、この印はどこにも出ない。
   *
   * ⚠ **そこに見えているのは、答えが返らないまま古くなった盤面である。**
   * `StatusStrip` は WS が繋がっている限り「接続中」と言い続けるので、**利用者は
   * 凍った盤面を生きているものとして操作しうる。** #292 の射程は「読み込み中」なので
   * ここでは直していない —— 未解決のまま残る穴である。
   */
  joinTimedOut: boolean;
  /** サーバー時刻との差。Session の残り時間導出に渡す。 */
  clockOffset: number;
  /**
   * ルームのいまのお題（#91）。**timer は読むだけ**。`topic` フレームで届き、
   * snapshot には含まれない（spec T3）。
   */
  topic: Topic | null;

  /** 引数をそのまま載せて送るだけの操作。 */
  commands: TimerCommands;

  /** ロビーの「開始」。お題が無ければ依頼してから phase.set と START を送る。 */
  startSession(): void;
  complete(): void;
  abort(): void;
  /** 代理参加者を加える（participantId はここで生成する）。 */
  addProxy(displayName: string): void;
  /**
   * 完了後に「新しいセッション」を選んだ。**ルームが生きているなら、押した本人も
   * 含めて在室者全員がロビーへ戻る**（`phase.set` は在室者全員へ届く・#290・D5）。
   * 玄関（`/`）へ送るのは、ルームを失っているとき（`SessionLost`）だけである。
   */
  newSession(): void;
  /** Summary の明示保存。失敗時はバナーを出す。 */
  saveRecordManually(record: CompletionRecord): void;
}

/**
 * ドメインエラーコードを利用者向けの日本語文へ変換する（生のコードを画面に出さない）。
 *
 * **判定規則そのものが @tasuki/timer-core の `displayMessageFor()` にある**（T065・FR-105・FR-107）。
 * かつては App.tsx 内の private 関数で表を引いており、**テストから触れなかった**。
 * そのため「どのコードのとき利用者に何が見えるか」を検証する手段が無く、
 * 表にコードを 1 行足すだけで表示が変わる退行を型検査もテストも素通しさせた。
 * ここは core へ委譲するだけにして、規則を単一の検証可能な場所に置く。
 */
const friendlyError = displayMessageFor;

export function useTimerSync(banner: BannerController): TimerSync {
  const { show: showBanner, clear: clearBanner } = banner;

  const [mode, setMode] = useState<AppMode | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [participantId, setParticipantId] = useState<string>("");
  const [record, setRecord] = useState<CompletionRecord | null>(null);
  const [client, setClient] = useState<SyncClient | null>(null);
  // 終了種別（完成/中断）。Summary の見出し・記録の出し分けに使う（FR-020）。
  const [endType, setEndType] = useState<EndType>("complete");
  // セッション喪失（room-not-found）。StatusStrip を lost 表示にし、再接続では消えない。
  const [sessionLost, setSessionLost] = useState(false);
  // 接続状態は WS クライアントから明示通知される（banner には結合しない・R5-1）。
  // **初期値は `connecting`**（#292 のレビュー）。通知が来るのは `onopen` と `onclose`
  // だけで、確立前は何も来ない —— `online` から始めると、繋がっていないのに
  // 「接続中」と断言する（`ui/connection-status.ts` の注記）。
  const [connState, setConnState] = useState<ClientConnState>("connecting");
  // 契約に合わない同期フレームを捨てて以降、新しい状態を受け取れていない（#209）。
  // 立てるのは棄却時、下ろすのは**有効な snapshot を受け取ったとき**だけ（下の注記）。
  const [syncStale, setSyncStale] = useState(false);
  // `room.join` の答えを待つ期限が切れた（#292）。立てるのは下の期限のタイマーだけ。
  const [joinTimedOut, setJoinTimedOut] = useState(false);
  // ルームのいまのお題（#91）。`topic` フレームで届く。setter だけなので handlersRef に
  // 載せる必要は無い（onConnectionChange と同じ理由。makeClient で直接渡す）。
  const [topic, setTopic] = useState<Topic | null>(null);
  // 注: timer 内でのお題の作成・生成・AI 解錠は #91 PR 3 で撤去した。お題は
  // お題ツール（別アプリ）が作り、timer は `topic` フレームで読むだけになった。

  // 参加直後の resumeToken を、次に来る snapshot（room.code を含む）と組み合わせて
  // 復帰の組を保存するための一時保持（Issue #24）。onIdentity では room.code が
  // まだ分からない（room.joined メッセージに code が含まれない）ため、onRoom まで持ち越す。
  // 素の ref に直接書くのは、onIdentity → onRoom の間に React の再レンダーを待たずに
  // 値を受け渡したいため（両者は別々の WS メッセージから来る）。ハンドラの closure から
  // 読む値ではないので、handlersRef 経由の仕組みには乗らない。
  const pendingResumeRef = useRef<{ participantId: string; resumeToken: string } | null>(null);
  // 混雑で入室を拒まれたときの自動再試行（#147）。**即時に送り直してはならない** —
  // 同一 NAT の利用者はレート制限のバケツを共有するため、素朴な再試行は
  // 自分たちで自分たちを締め出す。待ち時間とばらつきは @tasuki/sync-client の join-retry.ts が決める。
  const joinRetryAttemptRef = useRef(0);
  const joinRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ルームに入る前に出した「同期できていません」のバナーを、自分が出したときだけ消すための印（#209）。
  const staleBannerShownRef = useRef(false);
  const cancelJoinRetry = () => {
    if (joinRetryTimerRef.current !== null) {
      clearTimeout(joinRetryTimerRef.current);
      joinRetryTimerRef.current = null;
    }
  };
  // `room.join` の答えを待つ期限（#292）。再試行の待機（joinRetryTimerRef）とは別物で、
  // あちらは「待ってから送り直す」、こちらは「送ってから諦める」を測る。
  const joinDeadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 期限のタイマーだけを片付ける。**印（`joinTimedOut`）には触らない。** */
  const clearJoinDeadlineTimer = () => {
    if (joinDeadlineTimerRef.current !== null) {
      clearTimeout(joinDeadlineTimerRef.current);
      joinDeadlineTimerRef.current = null;
    }
  };
  /** 待つのをやめる（＝先へ進めた・もう待つ相手が居ない）。印も降ろす。 */
  const cancelJoinDeadline = () => {
    clearJoinDeadlineTimer();
    // 畳むときは印も降ろす。残すと、次にこの受け皿へ戻ってきた人（退出後の遷移待ち・
    // 別ルームへの入り直し）が、いきなり行き止まりの画面を見る。
    setJoinTimedOut(false);
  };
  /**
   * **待っても入れないと確定した。期限の発火を待たずに印を立てる**（#292 のレビュー）。
   *
   * 混雑の入り直しを使い切った枝は、**期限を張り直す相手（送信）が無い**。
   * ここで印を立てないと、諦めのバナーは出るのに本文は「読み込んでいます…」のままで、
   * もう入れないのに待っているように見え、次にできることも出ない（EARS 1 の穴）。
   * さらに 10 秒待ってから同じ表示を出す理由は無いので、その場で立てる。
   */
  const giveUpJoinWait = () => {
    clearJoinDeadlineTimer();
    setJoinTimedOut(true);
  };
  /**
   * 期限を張り直す。**`room.join` を送った直後に呼ぶ**（送る前ではない）。
   *
   * ⚠ **コールバックの中で closure の値を読まない**（#283）。`setTimeout` のクロージャは
   * 「送る時点」の値を捕まえるので、ここで `room` や `mode` を見ると、発火時には
   * とうに古くなっている。立てるのは setter だけにして、畳む判断は下の各ハンドラが持つ。
   */
  const armJoinDeadline = () => {
    clearJoinDeadlineTimer();
    setJoinTimedOut(false);
    joinDeadlineTimerRef.current = setTimeout(() => {
      joinDeadlineTimerRef.current = null;
      setJoinTimedOut(true);
    }, JOIN_RESPONSE_DEADLINE_MS);
  };
  // 参加時に名乗った表示名。resumeToken 再送の room.join に必要
  // （サーバー側スキーマで displayName は必須項目のため・Issue #24）。
  // **入れるのは入口の effect 1 箇所だけ**（#272 で作成経路が消えたため）。
  // 値の出どころは端末に保存された復帰の組で、大元は玄関で名乗った名前である。
  const resumeDisplayNameRef = useRef<string>("");
  // **いま話しているルームのコード**（#95 S4b）。復帰の組の鍵がルームコード別に
  // なったので、「どのルームの組を読むか」を知る必要がある。`room` state だけでは
  // 足りない —— 混雑で弾かれた再試行（#147）や再接続の再送は、snapshot が 1 度も
  // 届いていない時点でも走る。参加を試みた時点と snapshot を受け取った時点の
  // 両方で入れる。
  const roomCodeRef = useRef<string | null>(null);
  // 入口の適用（`decideEntry` の結果）を mount 時の一度きりにするためのガード。
  const entryAppliedRef = useRef(false);

  // App unmount 時にタイマーを掃除する（setState-on-unmounted を防ぐ）。
  useEffect(() => {
    return () => {
      // 再試行の待機タイマーも畳む（#147）。アンマウント後に走らせる意味は無い。
      if (joinRetryTimerRef.current !== null) clearTimeout(joinRetryTimerRef.current);
      // 答えを待つ期限も同じ（#292）。残すと setState-on-unmounted になる。
      if (joinDeadlineTimerRef.current !== null) clearTimeout(joinDeadlineTimerRef.current);
    };
  }, []);

  /** 代理参加者の一意な participantId を生成する（衝突回避のため乱数を含める） */
  const makeProxyId = () => `proxy-${Math.random().toString(36).slice(2, 10)}`;

  // ⚠ **65 秒の安全弁はここに戻さない**（#283）。安全弁が要ったのは、降ろす契機が
  //    お題の内容差分しか無く、それが成立しない場合があったからである。生成中が
  //    サーバーの状態になった以上、降りない状態そのものが作れない。

  // ─── SyncClient のコールバック本体 ─────────────────────────────────────────
  //
  // ハンドラ本体はこのフックの render 本体のスコープに置き、`handlersRef` へ毎レンダー
  // 同期する（ファイル冒頭の「handlersRef の作法」を参照）。
  //
  // client インスタンスだけは第1引数で受け取る。`client` state は `makeClient` 直後の
  // メッセージ処理時点ではまだ `null` のため、ここから読んではいけない。

  /**
   * 契約に合わないフレームを捨てたことを受け取る（#181・#209）。
   *
   * **利用者へは StatusStrip の「同期できていません」として出す。** ただし
   * StatusStrip はルームに入るまで描画されないので、`room` がまだ無い間は
   * バナーで補う（この経路が無いと、**壊れた値の残ったルームへ入ろうとした人には
   * 何も表示されない**）。
   *
   * **立てるのは「画面が古くなる棄却」だけ。** 判定は `indicatesStaleRoom` が
   * スキーマの診断（落ちた項目の経路）から行う。サーバーに定期 `snapshot` 配信は
   * 無いため、一度立てると次に誰かが操作するまで下りない。一過性の棄却で立てると
   * 静止したロビーでは警告が延々と残る。
   *
   * devtools へは落ちた項目の経路だけを残す（値は出さない・ADR 0012）。
   *
   * **`room.join` の答えを待つ期限はここでは畳まない**（#292）。捨てた以上その
   * `snapshot` は届かなかったのと同じで、ルームに入る前ならこの人は先へ進めない。
   * バナーは起きていることを述べるだけ（再読込を促さない）なので、**次にできることを
   * 示すのは期限の側の仕事**である。
   */
  const handleInvalidFrame = (paths: string[]) => {
    console.warn("契約に合わない同期フレームを捨てました:", paths); // log-hygiene:allow 項目の経路のみ（値は出さない）
    if (!indicatesStaleRoom(paths)) return;
    setSyncStale(true);
    if (room === null) {
      staleBannerShownRef.current = true;
      showBanner(SYNC_STALE_BEFORE_ROOM_TEXT, "warn", { autoDismiss: false });
    }
  };

  const handleRoom = (r: Room) => {
    // **画面が実際に新しい状態を得た。** ここだけが「古い」の解除点である（#209）。
    setSyncStale(false);
    // ルームに入る前に出したバナーは、入れた時点で役目を終える。
    // **この解除だけを行う**（無条件の clearBanner は他の通知まで消す）。
    if (staleBannerShownRef.current) {
      staleBannerShownRef.current = false;
      clearBanner();
    }
    // 入室できたら再試行の数え直し（#147）。次に混雑へ当たったときは 1 回目から始める。
    cancelJoinRetry();
    joinRetryAttemptRef.current = 0;
    // 画面が決まった以上、答えを待つ期限はもう測らない（#292）。
    cancelJoinDeadline();
    // `room` はこのハンドラを作ったレンダーの const なので、下で `setRoom(r)` しても
    // このスコープ内では変わらない。値は「直前のレンダー時点の snapshot」である。
    const prevRoom = room;
    setRoom(r);
    // 復帰の組の鍵（#95 S4b）を、サーバー権威の値へ揃え直す。
    // **入口の effect が既に URL のコードを入れている**（#272 で作成経路が消え、
    // 「ここで初めてコードを知る」経路は無くなった）。それでも代入を残すのは、
    // 権威はサーバーが返す `r.code` のほうだからである。
    roomCodeRef.current = r.code;

    const intents = decideSnapshotIntents(prevRoom, r, {
      pendingResume: pendingResumeRef.current,
      resumeDisplayName: resumeDisplayNameRef.current,
    });

    for (const intent of intents) {
      switch (intent.kind) {
        case "save-resume":
          saveResumeIdentity(intent.identity);
          pendingResumeRef.current = null;
          break;
        case "clear-completion":
          // 完了から抜けた。前のセッションの記録・終了種別を畳む
          // （#95 S5c・レビュー ②）。**押した人の端末だけでなく全端末で降りる。**
          setRecord(null);
          setEndType("complete");
          break;
        case "set-screen":
          setMode(intent.screen);
          break;
        case "set-end":
          // 終わり方は snapshot が決める（#91 PR 3）。押した本人も、押していない端末も同じ値になる。
          setEndType(intent.endType);
          break;
        case "persist-completion":
          // 完了へ入った遷移（`snapshot-intents.ts` の手順 4）でだけ届く。ただし再描画の前に
          // celebration の snapshot が 2 通続くと、2 通とも「前 = 直前の描画の snapshot（未完了）」で
          // 判定されて 2 回届きうる。**それでも実害が無いのは、保存するのがサーバーの記録そのもので
          // ID が同じだからである** —— IndexedDB の `put` は同じ鍵を上書きするので 1 件のまま残る。
          // 端末が記録を組み立てていた頃は ID が毎回変わったので、印（`recordSavedRef`）で防いでいた。
          setRecord(intent.record);
          // 完成記録を端末ローカルに自動保存（押し忘れ防止・FR-020「達成を記録」）。
          persistRecordIfComplete("complete", intent.record, saveRecord).catch((e) =>
            console.error("完成記録の保存に失敗しました:", e), // log-hygiene:allow ブラウザの devtools 向け
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

  const handleError = (syncClient: SyncClient, code: string) => {
    console.error("WS error:", code); // log-hygiene:allow ブラウザの devtools 向け
    // 画面が次に何をするかは errorAction() の判定に委ねる（Issue #32・FR-125/FR-129・
    // `ui/error-action.ts` の docstring と揃える）。
    // 分岐は kind の判別可能合併を網羅する（未処理の kind があれば型検査で気づける）。
    const action = errorAction(code);
    switch (action.kind) {
      case "session-lost": {
        // ルーム喪失（揮発サーバー再起動等）は明示的に「セッション喪失」を表示し、継続する（FR-007/059）。
        // ローカル記録は保持され、再接続では消えないよう sessionLost を立てる。
        // 再試行の待機中でも、ルームが消えた以上は入り直せない（#147）。
        // 止めないと、待ち時間の経過後に無関係な諦めのバナーが後から出る。
        cancelJoinRetry();
        // 答えを待つ期限も同じ（#292）。説明は `SessionLost` が担うので、
        // 「読み込めていません」を後から重ねない。
        cancelJoinDeadline();
        setSessionLost(true);
        // 説明は SessionLost 画面が担う（#76 F-4）。バナーは再接続のたびに
        // onConnected で消えるため、喪失のような「消えては困る事実」には向かない。
        clearBanner();
        // ルームごと消失した以上、保存済みの resumeToken はもう使えない（Issue #24・FR-005）。
        // **鍵はルームコード別**なので、いま居たルームの分だけを捨てる（#95 S4b・D12）。
        // ここで全部消すと、別のルームの復帰の組まで失う。
        if (room?.code) clearResumeIdentity(room.code);
        return;
      }
      case "leave-room": {
        // 退出が成立した本人を取り残さない（自己退出＝LEFT_ROOM／他者に退出させられた＝
        // REMOVED_FROM_ROOM・REMOVED_BY_HOST）。後始末も行き先も離れ方で分けない
        // （#290・D3）。違うのは玄関へ渡す理由（`?left=`）だけである（Issue #32・FR-128）。
        // **FR-127 は「入口の画面」を求めるが、#290・D3 でコードを運ぶ「玄関のそのルーム」
        // へ意図して再解釈している**（旧入口 `Setup`/`Join` は #249 で撤去済み）。
        // **ここで `friendlyError` は呼ばない** —— 文言は玄関が引く（下の注記）。
        // 退室が成立した以上、待機中の再試行も畳む（#147）。残すと、抜けたはずの
        // ルームへ入り直そうとする送信が、玄関へ去るまでの間に走る。
        cancelJoinRetry();
        // 答えを待つ期限も畳む（#292）。ここは `mode` を `null` に戻すので、
        // 玄関へ遷移し終えるまでの間この受け皿が出る —— 残すと、抜けたはずの人が
        // 「ルームの情報を読み込めませんでした」を最後に見ることになる。
        cancelJoinDeadline();
        const removedFrom = room?.code ?? roomCodeRef.current;
        syncClient.dispose();
        setRoom(null);
        // お題はルームのもの。抜けたら畳む
        setTopic(null);
        // このルームの話は終わった。残すと、次に別ルームへ入る前の再送が
        // 消えたルームを指す（#95 S4b）。
        roomCodeRef.current = null;
        setClient(null);
        setParticipantId("");
        setSessionLost(false);
        setRecord(null);
        // 捨てた同期フレームの警告もルーム由来なので畳む（#209）。
        // ここで残すと、次に入った別ルームで前のルームの警告が出る。
        setSyncStale(false);
        staleBannerShownRef.current = false;
        // 明示的に退出が成立した以上、この参加者としてのリジュームはもう意味を持たない
        // （次に別ルームへ入ったときに誤って古いルームへ復帰しようとしないため・Issue #24・FR-004）。
        // 捨てるのは**退出したルームの分だけ**である（#95 S4b・D12）。
        if (removedFrom) clearResumeIdentity(removedFrom);
        // ルーム由来の画面状態は退出成立時に破棄する（FR-128）。
        // **お題の生成中はここで畳む必要が無い**（#283）——
        // `setRoom(null)` でルームが消えれば、そこから読む生成中も同時に消える。
        // かつては局所のフラグと 65 秒の安全弁を別途畳んでいた（畳み忘れると、
        // 次に入った別ルームで「何も頼んでいないのに生成中」が最大 65 秒残った）。
        // **告知は玄関が出す**（#95 S5c・I-1）。ここでバナーを出しても、直後の遷移で
        // 描画される前に破棄される。とりわけ外された人は説明抜きで名乗りの画面に着き、
        // 外されたと分からずに再参加してまた外される（Issue #32 が塞いだ問題の再発）。
        // 理由だけを URL に載せて運び、文言は玄関側が `@tasuki/room-core` から引く。
        //
        setMode(null);
        // **行き先は離れ方で分けない**（#290・D3）。ルームがまだ在るかを知っているのは
        // 玄関（サーバーへ尋ねる・#274）であって、抜けた本人ではない。コードを運び、
        // 判断は玄関へ委ねる。**コードを失っている場合は `hubRoomPath` が `?room=` を
        // 落とす** —— 存在しないコードを載せると、退出の告知より不在が前に出る。
        redirectTo(hubRoomPath(removedFrom ?? null, action.reason));
        return;
      }
      case "retry-later": {
        // 混雑で弾かれただけで、待てば入れる（#147）。利用者の操作なしに入り直す。
        // バナーは自動消去しない — 4 秒で消えると「待てば入れる」ことが伝わらない。
        cancelJoinRetry();
        // **待ち時間はこの期限より長くなりうる**（`joinRetryDelayMs` は最大 30 秒＋
        // ばらつき）。畳まないと、待てば入れる人を「読み込めていません」と断じる（#292）。
        // 次の期限は入り直しを送った時点（`sendResumeJoin`）で張り直す。
        cancelJoinDeadline();
        const attempt = joinRetryAttemptRef.current + 1;
        const delay = joinRetryDelayMs(attempt);
        if (delay === null) {
          // 試行を使い切った。**際限なく送り続けない**（混雑が解消しない状況で
          // バケツを消費し続けると、自分たちで自分たちを締め出す）。
          // **数え直さない。** 0 に戻すと、次に届いた拒否で最初から数え直してしまい、
          // 「諦めた」はずが送り続ける形になる。数え直すのは入室できたときと、
          // 接続し直したときだけ。
          joinRetryAttemptRef.current = attempt;
          showBanner(JOIN_RETRY_EXHAUSTED_TEXT, "warn", { autoDismiss: false });
          // **ここで待つのをやめる**（#292 のレビュー）。送り直さない以上、期限を
          // 張り直す相手が居ない —— 印を立てないと、諦めのバナーの下で本文が
          // 「読み込んでいます…」と言い続け、次にできることも出ない。
          giveUpJoinWait();
          return;
        }
        joinRetryAttemptRef.current = attempt;
        showBanner(JOIN_RETRY_WAITING_TEXT, "warn", { autoDismiss: false });
        joinRetryTimerRef.current = setTimeout(() => {
          joinRetryTimerRef.current = null;
          // 保存が無いと自動では入り直せないので、手立てを示して終わる。
          //
          // **「招待リンクで来た初回」はもう通らない**（#272）。旧入口（`Join`）を
          // 撤去したので、入るには入口の effect が復帰の組を読めていることが前提になった。
          // 残っている経路は**別タブが同じルームの組を捨てたとき**である ——
          // 鍵は `localStorage`・ルームコード別（#95 S4b・D12）で、選択画面や poker を
          // 別タブで開くのは現実的な使い方なので、向こうで退出されるとここが成立する。
          if (!sendResumeJoin(syncClient)) {
            showBanner(JOIN_RETRY_EXHAUSTED_TEXT, "warn", { autoDismiss: false });
            // 送れなかったので期限も張られていない（`sendResumeJoin` は送れたときだけ
            // 張る）。上の使い切りと同じく、ここで待つのをやめる（#292 のレビュー）。
            giveUpJoinWait();
          }
        }, delay);
        return;
      }
      case "transient": {
        // それ以外は「一時的な操作エラー」。分かりやすい日本語にし、数秒で自動消去する
        // （生のコードを残し続けない・画面遷移後も居座らせない）。
        //
        // **期限はここでは畳まない**（#292）。バナーは 4 秒で消えるので、これが
        // `room.join` に対する返事だった場合、畳むと**元の無言の待ちへ戻る**。
        // 「サーバーが何か言った」ことと「先へ進めるようになった」ことは別である。
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
  const sendResumeJoin = (syncClient: SyncClient): boolean => {
    // **どのルームの復帰の組を読むかは、いま話しているルームで決まる**
    // （#95 S4b・D12 で鍵がルームコード別になった）。S4a まではタブに 1 組しか
    // 無かったので引数が要らなかった。
    const code = room?.code ?? roomCodeRef.current;
    if (code === null) return false;
    const saved = loadResumeIdentity(code);
    if (!saved) return false;
    syncClient.send({
      command: "room.join",
      code: saved.code,
      displayName: saved.displayName,
      hasAiKey: false,
      resumeToken: saved.resumeToken,
    });
    // 送ったところから、また答えを待つ（#292）。**送れたときだけ張る** ——
    // 保存が無くて送れなかった場合（`false` を返す下の経路）は、呼び出し側が
    // 手立てを示して終わるので、期限を測る相手が居ない。
    armJoinDeadline();
    return true;
  };

  const handleReconnected = (syncClient: SyncClient) => {
    // 接続し直したところなので、混雑の数え直しをする（#147）。前の接続で諦めていても、
    // 新しい接続では改めて入り直しを試みてよい。
    cancelJoinRetry();
    joinRetryAttemptRef.current = 0;
    sendResumeJoin(syncClient);
  };

  // 破壊的操作の実行者を全員へ伝える（Issue #22・FR-077）。
  // banner は aria-live 付きのライブリージョンなので、そのまま読み上げにも乗る。
  const handleNotice = (notice: NoticeSignal) => {
    const text = buildNoticeMessage(notice, {
      selfParticipantId: participantId,
      participants: room?.participants ?? [],
      seats: room?.session.seats ?? [],
    });
    showBanner(text, "warn");
  };

  // 上のハンドラ群を1本の ref へ毎レンダー同期する。同期は render 本体で行う
  // （useEffect を挟むと差し替えが1レンダー遅れ、その隙間に届いた WS メッセージを
  // 古いハンドラが処理してしまう・Issue #46 REQ-3）。
  const handlersRef = useLatestRef({
    handleRoom,
    handleIdentity,
    handleError,
    handleReconnected,
    handleNotice,
    handleInvalidFrame,
  });

  // SyncClient の配線。**呼ぶのは入口の effect 1 箇所だけ**である
  // （#272 で `createRoom` / `joinRoom` を畳み、create/join の 2 経路で共有する形は消えた）。
  // 各コールバックは handlersRef.current の同名ハンドラへ転送するだけで、
  // 生成時に固定されても実際に走るのは常に最新レンダーのハンドラになる。
  // onConnected / onDisconnected / onConnectionChange は setter 呼び出し1行で、
  // setter の同一性は React が保証しているため closure 固定の害がなく、転送を挟まない。
  const makeClient = (): SyncClient => {
    const newClient = new SyncClient({
      url: buildSyncUrl(window.location),
      onRoom: (r) => handlersRef.current.handleRoom(r),
      onIdentity: (identity) => handlersRef.current.handleIdentity(identity),
      onError: (code) => handlersRef.current.handleError(newClient, code),
      onConnected: () => clearBanner(),
      onDisconnected: () =>
        showBanner("接続が切れました。再接続しています...", "warn", { autoDismiss: false }),
      onConnectionChange: (s) => setConnState(s),
      onReconnected: () => handlersRef.current.handleReconnected(newClient),
      onNotice: (notice) => handlersRef.current.handleNotice(notice),
      // 契約に合わないフレームを捨てたことを知らせる（#181・#209）。
      // 判断と出力は handleInvalidFrame が持つ（room を読む必要があるため転送する）。
      onInvalidFrame: (paths) => handlersRef.current.handleInvalidFrame(paths),
      // お題はルームの共有資産（#91）。setter 呼び出し1行なので、onConnectionChange と
      // 同じ理由で転送を挟まない。
      onTopic: (state) => setTopic(state.topic),
    });
    newClient.connect();
    setClient(newClient);
    return newClient;
  };

  // mount 時 effect（再読込での復帰）から呼ぶための ref。makeClient は毎レンダー
  // 作り直されるため、依存配列へ入れると effect が毎レンダー走ってしまう。
  const makeClientRef = useLatestRef(makeClient);

  // 入口の effect から期限を張るための ref（#292）。`armJoinDeadline` は毎レンダー
  // 作り直されるので、依存配列へ直接入れると effect が毎レンダー走ってしまう
  // （`makeClientRef` と同じ理由・同じ作法）。
  const armJoinDeadlineRef = useLatestRef(armJoinDeadline);

  // client / room は state なので毎レンダー作り直されるが、送信は都度呼ぶだけなのでメモ化
  // しない（現行の 1 行ラッパーも毎レンダー作り直されており、同じ性質を保つ）。
  // room はこのレンダーのクロージャが持つ値をそのまま渡す（useLatestRef にしない）。
  // 旧 leaveRotation もそのレンダーの room を読んでおり、commands 自体が毎レンダー
  // 作り直されるので「送信時点の room」を引くという性質は変わらない。
  const commands = createCommands(
    (cmd) => client?.send(cmd),
    () => room,
  );

  /**
   * ロビーの「開始」。お題の有無は見ず、phase.set → 開始の順で送るだけ
   * （#91 PR 3・お題の作成・依頼は timer から撤去した）。
   *
   * **開始の送り方は時計の状態で分かれる**（`ui/session-start.ts`・#95 S5c・C-1）。
   * 完了したセッションの時計は走ったままなので、そこからロビーへ戻って再開するときは
   * `session.act START` が `PhaseConflict` で弾かれる。`session.reset` を送ると、
   * 輪の先頭・満タン・走行へ作り直される。
   *
   * **前のセッションの残り（記録・終了種別）はここで畳まない。** 畳むのは
   * `celebration` から抜けた snapshot を受け取った時点である（`clear-completion` の意図）。
   * ここで畳むと、**「開始」を押さなかった端末では一生降りない**（押すのは 1 人だけ）。
   */
  const startSession = () => {
    if (!room) return;
    commands.setPhase("session");
    if (startActionFor(room.session, room.clock) === "reset") {
      commands.resetSession();
    } else {
      commands.actSession("START");
    }
    setMode("session");
  };

  const complete = () => {
    // サーバーへ完成を通知。画面遷移・終わり方・記録の保存は snapshot 受信（onRoom の
    // celebration 処理）で全参加者一斉に行う。押した人だけ先行しない。
    // **終わり方をここで変えない**（#91 PR 3）—— 押した本人だけ先に変えると、押していない端末と食い違う。
    commands.completeSession();
  };

  /** 途中で終える（中断）。完成と異なり記録は残さない（FR-020）。
   *  画面遷移と終わり方は snapshot（celebration）受信で全員一斉（#91 PR 3）。 */
  const abort = () => {
    commands.abortSession();
  };

  /**
   * 完了後の「新しいセッション」。**ルームが生きているならロビーへ戻すだけで、
   * 玄関へは遷移しない**（#290・D5）。理由は下の実装コメントを参照。
   *
   * ルームの `phase` が `celebration` のまま残ると、同じルームに居る人や参加用
   * URL で戻ってきた人は、timer を開くたび完了画面に着く。**poker は使えるのに
   * timer だけ死んだルーム**が TTL の間ずっと残るので、`phase.set` は必ず送る。
   *
   * 玄関（`/`）へ送るのは、ルームを失っているときだけである。行き先は
   * **`?room=` を付けない `/`**。付けるとその人だけ選択画面に着いて、新しい
   * ルームを作れない。`redirectTo` は内部で `replace` を使うため履歴に残らない。
   *
   * 前のセッションの残り（完了記録・終了種別）は畳まない。**畳むのは次の開始**である
   * （{@link startSession} の注記。ここで降ろすと二重保存の窓が開く）。
   *
   * **`SessionLost` 画面（`App.tsx`）の「新しいセッションを始める」はここを
   * 通らず、遷移だけを行う。** 消えたルームへコマンドを送っても、接続の無い
   * `pending` に積まれるだけである。
   */
  const newSession = () => {
    // **ルームが生きているなら遷移しない**（#290・D5）。`phase.set` は在室者全員へ
    // 届くので、押した本人も他の全員と同じく snapshot でロビーへ戻る。
    // かつてここに `redirectTo("/")` があったのは、#249 以前の `newSession` が
    // 「まっさらな新しいルームを作る」操作で、旧 `Setup`（＝作成画面）へ戻していた
    // 名残である。押した本人だけがルームから出されていた。
    if (room && !sessionLost) {
      commands.setPhase("setup");
      return;
    }
    // ルームを失っているときは戻る先が無いので玄関へ（`SessionLost` と同じ）。
    redirectTo("/");
  };

  /** 代理参加者を加える（participantId はここで生成する・乱数は commands に持ち込まない）。 */
  const addProxy = (displayName: string) => commands.addProxy(makeProxyId(), displayName);

  /** Summary の明示保存。完成時に自動保存済みだが put（upsert）なので冪等。
   *  ボタン側で「保存しました」を表示するため、ここでは永続化と失敗時通知のみ行う。 */
  const saveRecordManually = (rec: CompletionRecord) => {
    saveRecord(rec).catch((e) => {
      console.error("記録の保存に失敗しました:", e); // log-hygiene:allow ブラウザの devtools 向け
      showBanner("記録の保存に失敗しました。", "error", { autoDismiss: false });
    });
  };

  /**
   * 開かれた URL から入口を決めて適用する（#95 S5c・R9）。**mount 時の一度きり。**
   *
   * 判定の正本は `decideEntry` 1 つに保つ（#95 S5c のレビュー指摘）。ここで独自に
   * `?room=` だけを見ると、`?view=history&room=CODE` のように「記録を見るだけ」の
   * URL でも `room.join` を送ってしまい、見ているだけの人が他の参加者の名簿に現れる
   * （在席は接続に紐づく・#95 S4b）。
   *
   * | URL | すること |
   * |---|---|
   * | `?view=history`（`?room=` の有無を問わず） | 何もしない（画面側が履歴を出す） |
   * | `?room=CODE` ＋ 端末に同一性あり | 保存済みの `resumeToken` で `room.join`（#76 F-3） |
   * | `?room=CODE` ＋ 同一性なし | **玄関のそのルームへ replace**（名乗りはハブに 1 つ） |
   * | それ以外 | **玄関へ replace**（旧入口を撤去したので行き先が無い） |
   *
   * 送るのは `replace` である。`assign` だと、戻るボタンが行き場の無い URL へ戻り、
   * そこからまた送り返される往復になる。
   */
  useEffect(() => {
    if (entryAppliedRef.current) return;
    entryAppliedRef.current = true;
    const entry = decideEntry(currentSearch());
    if (entry.kind === "redirect") {
      redirectTo(entry.to);
      return;
    }
    if (entry.kind === "history") return;
    const code = entry.code;

    const saved = loadResumeIdentity(code);
    if (!shouldResumeOnLoad(saved, code)) {
      // 名乗りはハブに 1 つだけある。**コードは落とさずに運ぶ** —— 落とすと、
      // リンクで来た人が入りたかったルームを失う。
      redirectTo(hubRoomPath(code));
      return;
    }

    roomCodeRef.current = code;
    resumeDisplayNameRef.current = saved.displayName;
    // makeClient は毎レンダー作り直されるので、この mount 時 effect からは
    // ref 経由で呼ぶ（このファイルの handlersRef と同じ作法・Issue #46）。
    const makeClientNow = makeClientRef.current;
    // 「自分が誰か」を保存値から先に立てる。再接続経路と違い、ページ読み込み直後は
    // participantId が空で、snapshot だけでは自分を特定できない。
    // **空のままだと StatusStrip は名前を出せない**（#294 以前はそこで輪の先頭の席の
    // 名前へ縮退しており、**復帰した本人が他人の名前を見て**いた。いまは「あなた」に
    // なるので誤りはしないが、名乗れるなら名乗ったほうがよい）。
    // サーバーが identity を再発行すれば上書きされる。
    setParticipantId(saved.participantId);
    const c = makeClientNow();
    c.send({
      command: "room.join",
      code: saved.code,
      displayName: saved.displayName,
      hasAiKey: false,
      resumeToken: saved.resumeToken,
    });
    // 送ったところから答えを待つ期限を測る（#292）。**ここが本来の入口である** ——
    // `sendResumeJoin` を通るのは再接続と混雑の入り直しだけで、初回の読み込みは
    // この effect が直接組み立てて送っている。
    armJoinDeadlineRef.current();
    // 依存は ref と setter のみで、いずれも再生成されない。ref オブジェクトの同一性は
    // レンダーを跨いで保たれるため、依存に挙げてもこの effect は mount 時の 1 回きり。
  }, [makeClientRef, armJoinDeadlineRef]);

  useEffect(() => {
    return () => {
      client?.dispose();
    };
  }, [client]);

  return {
    mode,
    room,
    inviteUrl: room === null ? null : buildInviteUrl(window.location.origin, room.code),
    participantId,
    record,
    endType,
    sessionLost,
    connState,
    syncStale,
    joinTimedOut,
    clockOffset: client?.clockOffset ?? 0,
    topic,
    commands,
    startSession,
    complete,
    abort,
    addProxy,
    newSession,
    saveRecordManually,
  };
}
