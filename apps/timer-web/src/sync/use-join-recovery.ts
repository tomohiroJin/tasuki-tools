/**
 * `room.join` の入り直し（再接続の再送・混雑の自動再試行）と、その答えを待つ期限
 * （#147・#292・#369。#595 で `use-timer-sync.ts` から分けた）。
 *
 * 混雑の入り直しは `@tasuki/web-kit/sync` の `useJoinRetry`、答えを待つ期限は
 * `use-join-deadline.ts` が持つ。ここはその 2 つを **「保存した復帰の組で送り直す」** 動きへ
 * 束ねる。**即時に送り直してはならない** —— 同一 NAT の利用者はレート制限のバケツを
 * 共有するため、素朴な再試行は自分たちで自分たちを締め出す。待ち時間とばらつきは
 * `@tasuki/sync-client` の join-retry.ts が決める。案内はバナーで出すので、
 * `useJoinRetry` へ知らせの文言は渡さない。
 *
 * ⚠ 期限のコールバックの中で closure の値を読まない（`use-join-deadline.ts` の注記・#283）。
 */
import { loadResumeIdentity, type ResumeIdentity } from "@tasuki/sync-client";
import { useJoinRetry } from "@tasuki/web-kit/sync";
import { useJoinDeadline } from "./use-join-deadline.js";
import type { BannerController } from "../ui/use-banner.js";

/** 混雑で入室を拒まれ、自動で入り直している間の案内（#147）。 */
const JOIN_RETRY_WAITING_TEXT = "混み合っています。自動で入り直しています…";
/** 自動で入り直しても入れなかったときの案内（#147）。 */
const JOIN_RETRY_EXHAUSTED_TEXT = "混雑が続いています。時間をおいてから再読込してください";

/**
 * 入り直しが送るのに使う接続（`send` だけ）。同期クライアントそのものは
 * このフックでは import しない（`use-timer-sync.ts` だけが持つ・`docs/adr/0015`）。
 */
interface JoinSender {
  send(command: {
    command: "room.join";
    code: string;
    displayName: string;
    resumeToken: string;
  }): unknown;
}

export interface JoinRecoveryOptions {
  readonly banner: BannerController;
  /**
   * **いま話しているルームのコード**（#95 S4b）。復帰の組の鍵がルームコード別なので、
   * どのルームの組を読むかを送る時点で知る必要がある。呼び出し側はハンドラを作ったレンダーの値（`room?.code`）を優先し、無ければ ref の値を返す（退出では両方が同時に null へ戻る）。
   */
  readonly currentRoomCode: () => string | null;
}

export interface JoinRecovery {
  /** 答えを待つ期限が切れた（または、待っても入れないと確定した）。 */
  readonly joinTimedOut: boolean;
  /**
   * `room.join` を送り、送ったところから答えを待つ期限を張る（#292）。
   * 初回の読み込み（`resumeOnLoad`）と入り直し（再接続・混雑）の共通の送り口。
   */
  readonly sendJoin: (client: JoinSender, identity: ResumeIdentity) => void;
  /**
   * 入室できた（snapshot が届いた）。入り直しの待機を畳み、回数を数え直し、
   * 答えを待つ期限も畳む（#147・#292）。次に混雑へ当たったときは 1 回目から始める。
   */
  readonly onJoined: () => void;
  /**
   * 入り直せない・入り直さない（ルーム喪失・退出の成立）。待機中の入り直しと
   * 答えを待つ期限を畳む。数え直しはしない。
   */
  readonly abandon: () => void;
  /** 混雑で弾かれたとき（`retry-later`）。自動で入り直す段取りを組む。 */
  readonly handleRetryLater: (client: JoinSender) => void;
  /** 切断後に自動再接続したとき。数え直して復帰の組で入り直す。 */
  readonly handleReconnected: (client: JoinSender) => void;
}

export function useJoinRecovery({ banner, currentRoomCode }: JoinRecoveryOptions): JoinRecovery {
  const { show: showBanner } = banner;
  // `room.join` の答えを待つ期限（#292。`use-join-deadline.ts`）。
  const {
    timedOut: joinTimedOut,
    arm: armJoinDeadline,
    cancel: cancelJoinDeadline,
    giveUp: giveUpJoinWait,
  } = useJoinDeadline();
  const { rateLimited, cancel: cancelJoinRetry, reset: resetJoinRetry } = useJoinRetry(null);

  // WS が切断後に自動再接続したとき、保存済みの resumeToken で room.join を
  // 利用者の操作なしに再送する（Issue #24・FR-002/FR-003）。初回 connect() では
  // 呼ばれないため、ここでの二重送信は起きない。
  const sendJoin = (client: JoinSender, identity: ResumeIdentity) => {
    client.send({
      command: "room.join",
      code: identity.code,
      displayName: identity.displayName,
      resumeToken: identity.resumeToken,
    });
    // 送ったところから、また答えを待つ（#292）。**送れたときだけ張る** ——
    // 保存が無くて送れなかった場合（`sendResumeJoin` が `false` を返す経路）は、
    // 呼び出し側が手立てを示して終わるので、期限を測る相手が居ない。
    armJoinDeadline();
  };

  const onJoined = () => {
    cancelJoinRetry();
    resetJoinRetry();
    cancelJoinDeadline();
  };

  const abandon = () => {
    cancelJoinRetry();
    cancelJoinDeadline();
  };

  const sendResumeJoin = (client: JoinSender): boolean => {
    const code = currentRoomCode();
    if (code === null) return false;
    const saved = loadResumeIdentity(code);
    if (!saved) return false;
    sendJoin(client, saved);
    return true;
  };

  const handleRetryLater = (client: JoinSender) => {
    // 混雑で弾かれただけで、待てば入れる（#147）。利用者の操作なしに入り直す。
    // バナーは自動消去しない — 4 秒で消えると「待てば入れる」ことが伝わらない。
    cancelJoinRetry();
    // **待ち時間はこの期限より長くなりうる**（`joinRetryDelayMs` は最大 30 秒＋
    // ばらつき）。畳まないと、待てば入れる人を「読み込めていません」と断じる（#292）。
    // 次の期限は入り直しを送った時点（`sendResumeJoin`）で張り直す。
    cancelJoinDeadline();
    const scheduled = rateLimited(() => {
      // 保存が無いと自動では入り直せないので、手立てを示して終わる。
      //
      // **「招待リンクで来た初回」はもう通らない**（#272）。旧入口（`Join`）を
      // 撤去したので、入るには入口の effect が復帰の組を読めていることが前提になった。
      // 残っている経路は**別タブが同じルームの組を捨てたとき**である ——
      // 鍵は `localStorage`・ルームコード別（#95 S4b・D12）で、選択画面や poker を
      // 別タブで開くのは現実的な使い方なので、向こうで退出されるとここが成立する。
      if (!sendResumeJoin(client)) {
        showBanner(JOIN_RETRY_EXHAUSTED_TEXT, "warn", { autoDismiss: false });
        // 送れなかったので期限も張られていない（`sendResumeJoin` は送れたときだけ
        // 張る）。下の使い切りと同じく、ここで待つのをやめる（#292 のレビュー）。
        giveUpJoinWait();
      }
    });
    if (!scheduled) {
      // 試行を使い切った。**際限なく送り続けない**（混雑が解消しない状況で
      // バケツを消費し続けると、自分たちで自分たちを締め出す）。
      // **数え直さない。** 数え直すのは入室できたときと、接続し直したときだけ
      // （`resetJoinRetry`）。ここで戻すと「諦めた」はずが送り続ける形になる。
      showBanner(JOIN_RETRY_EXHAUSTED_TEXT, "warn", { autoDismiss: false });
      // **ここで待つのをやめる**（#292 のレビュー）。送り直さない以上、期限を
      // 張り直す相手が居ない —— 印を立てないと、諦めのバナーの下で本文が
      // 「読み込んでいます…」と言い続け、次にできることも出ない。
      giveUpJoinWait();
      return;
    }
    showBanner(JOIN_RETRY_WAITING_TEXT, "warn", { autoDismiss: false });
  };

  const handleReconnected = (client: JoinSender) => {
    // 接続し直したところなので、混雑の数え直しをする（#147）。前の接続で諦めていても、
    // 新しい接続では改めて入り直しを試みてよい。
    cancelJoinRetry();
    resetJoinRetry();
    sendResumeJoin(client);
  };

  return {
    joinTimedOut,
    sendJoin,
    onJoined,
    abandon,
    handleRetryLater,
    handleReconnected,
  };
}
