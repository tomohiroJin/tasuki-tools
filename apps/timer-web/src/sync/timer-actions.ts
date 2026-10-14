/**
 * timer の画面の操作（#369 Task 10 で `use-timer-sync.ts` から分けた）。
 *
 * 送るのは `commands`（引数をそのまま載せて送るだけの窓口）に任せ、ここは
 * 「どの順で何を送るか」と端末の保存だけを持つ。毎レンダー作り直す（送信時点の `room` を読む）。
 */
import type { CompletionRecord, Room } from "@tasuki/timer-core";
import type { TimerCommands } from "./commands.js";
import { saveRecord } from "../records/indexeddb.js";
import { startActionFor } from "../ui/session-start.js";
import { redirectTo } from "../platform/location.js";
import type { BannerController } from "../ui/use-banner.js";
import type { AppMode } from "./app-mode.js";

export interface TimerActions {
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

export interface TimerActionsContext {
  readonly commands: TimerCommands;
  /** このレンダーのルーム（送信時点の値）。 */
  readonly room: Room | null;
  readonly sessionLost: boolean;
  readonly setMode: (mode: AppMode) => void;
  readonly showBanner: BannerController["show"];
}

/** 代理参加者の一意な participantId を生成する（衝突回避のため乱数を含める） */
const makeProxyId = () => `proxy-${Math.random().toString(36).slice(2, 10)}`;

export function createTimerActions({
  commands,
  room,
  sessionLost,
  setMode,
  showBanner,
}: TimerActionsContext): TimerActions {
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

  return { startSession, complete, abort, addProxy, newSession, saveRecordManually };
}
