/**
 * wire の投影（クライアントへ送る形）。**ドメインの集約ではない。**
 *
 * #95 S4a で名簿は `@tasuki/room-core` が正本になった。ここにある `Participant` と
 * `Room` は、名簿と timer の状態をアプリケーション層で合成した結果の**形だけ**を表す
 * （`apps/tasuki-sync/src/application/timer-snapshot-dto.ts` が組む）。
 * サーバー側の timer の集約は `TimerState`（aggregate.ts）である。
 *
 * `poker-core` の `ParticipantView`（protocol.ts）と同じ整理で、名前を変えていないのは
 * **`apps/timer-web` の広い範囲がこの型名で受けている**ためである（改名は振る舞いと
 * 無関係な差分を撒く。広がりを見たいなら数えるより
 * `grep -rl 'Participant' apps/timer-web/src` を走らせること —— **件数はここに書かない。
 * 足すたびに腐る**）。
 *
 * **形を変えるのは wire 契約の変更として別途扱う。** S4a はここを変えないことを
 * 「振る舞いを変えていない」ことの証拠にしていた（`apps/timer-web` のテストを 1 行も
 * 書き換えずに通せた）。**S4b は利用者から見える変更の段なので、多接続模型が要求する
 * 分だけ変えた。**
 * **ここで言うのは型の話だけである。型から落としたのは `startedAt`（S4a）・
 * `connId`（S4b）・`config.members`（#294）の 3 つ**（このファイル末尾の注記を読むこと）。**合成の例外**
 * （`participants` の並び・`driverEligible` の出し方・`presence` の導出）は
 * `apps/tasuki-sync/src/application/timer-snapshot-dto.ts` の台帳にある。
 */
import type {
  CompletionRecord,
  Problem,
  ProblemGeneration,
  ProblemMode,
  RoomPhase,
  ServerClock,
  TimerConfig,
} from "./aggregate.js";

/**
 * wire の設定。**サーバー側の {@link TimerConfig} と同じ形である**（#294）。
 *
 * かつてここには `members`（ローテーション順の表示名）が足されていた。読み手は
 * #276 で席（{@link Seat}）へ移り、残っていた 2 つの流用も #294 で畳んだので、
 * **wire だけにある項目は 1 つも無くなった**。
 *
 * 別名を残してあるのは、**`apps/timer-web` と `apps/tasuki-sync` の広い範囲が
 * この型名で「wire の設定」を受けている**ためである（改名は振る舞いと無関係な
 * 差分を撒く。このファイル冒頭の `Participant` と同じ判断）。
 */
export type SessionConfig = TimerConfig;

/** 参加者（wire）。名簿の 1 人か、ローテーション上の代理のいずれか。 */
export interface Participant {
  participantId: string;
  displayName: string;
  presence: "online" | "idle" | "offline";
  hasAiKey: boolean;
  joinedAt: number;
  /** Web 非接続の代理参加者か（v2追加。既定 false 相当） */
  isPlaceholder?: boolean;
  /** ドライバーローテーション対象か（v2追加。既定 true 相当） */
  driverEligible?: boolean;
}

/** 席が飛ばされる理由。null は「番が回る」。優先順位は stood-down が先（#276 D3）。 */
export type SeatSkipReason = "stood-down" | "away" | "disconnected";

/**
 * 交代の輪の席 1 つ（#276 D2）。
 *
 * `rotation` と**同じ順・同じ長さ**で、同じ場所（`buildTimerSnapshotRoom`）が両方を組む。
 * `id` を自分で持つので、画面は添字ではなく識別子で照合できる ——
 * `config.members` の「長さが一致するときだけ添字で引く」という応急処置（S5c）は
 * 輪の表示から外れる。
 *
 * `displayName` は**絞っていない名簿**から引く。`participants` は timer の在席者に
 * 絞られているため（R5 / R6）、離席した人の名前はそこからは引けない。
 */
export interface Seat {
  id: string;
  displayName: string;
  /** Web 非接続の代理か（`Participant.isPlaceholder` と同じ意味） */
  isProxy: boolean;
  skipReason: SeatSkipReason | null;
}

/** ルーム全体（wire） */
export interface Room {
  code: string;
  createdAt: number;
  config: SessionConfig;
  problem: Problem | null;
  session: {
    /** ローテーション順の識別子（代理は自分の ID） */
    rotation: string[];
    currentIndex: number;
    isPaused: boolean;
    driverCounts: number[];
    totalSwitches: number;
    /** 席ごとの表示名と「番が回らない理由」（#276 D2）。rotation と同じ順・同じ長さ。 */
    seats: Seat[];
    /**
     * 次の交代で**実際に**ドライバーになる席の添字（#276 D6）。
     *
     * 輪が空、または全席が不適格なら `null`（サーバーは現状維持へ縮退する・R15）。
     * 画面はこれを使うこと。`(currentIndex + 1) % len` は飛ばされる席を数に入れるので
     * サーバーの決定と食い違う。
     */
    nextIndex: number | null;
  };
  clock: ServerClock;
  phase: RoomPhase;
  participants: Participant[];
  sessionRecords: CompletionRecord[];
  handoffNote: string;
  onBreak: boolean;
  /** 出題モード（v2追加。既定 "fallback"） */
  problemMode?: ProblemMode;
  /** パスフレーズ保護中か（平文は載せない・サーバ側 Map で保持・R4-2）。 */
  passphraseProtected?: boolean;
  /** AI お題生成の解錠状態（合言葉照合済み・平文はサーバ専用 = snapshot 非混入）。 */
  aiUnlocked?: boolean;
  /**
   * お題の生成の状態（#283）。**任意項目である。**
   *
   * `deploy.sh timer` は画面を先に配ってからサーバーを再起動するので、
   * 「新しい画面 × 旧サーバー」の窓は**順序では避けられない**（#276 の実測）。
   * #276 の `session.seats` は必須にしたため、その窓では snapshot 全体が契約検査に
   * 落ちる（画面は「最新ではありません」へ倒れる）。ここは**欠けていたら
   * 「生成していない」と読めばよいだけ**なので、同じ代償を払う理由が無い。
   *
   * ⚠ **画面はこの項目に「無ければ推測する」経路を作ってはならない。** 推測の正体は
   * お題の内容差分で、それを落とすことが #283 の目的である。無いなら出さない。
   */
  problemGeneration?: ProblemGeneration;
}

// ⚠ かつてここには `connId`（在席中の接続 1 本）があった。**#95 S4b で落とした。**
// 名簿の参加者が接続を複数持てるようになり（D14）、「接続 1 本」という形そのものが
// 嘘になったためである。**製品コードの読み手は S4a 時点で 0 件**で、
// `apps/timer-web` のテストの造作にだけ現れていた（サーバー側で配信の宛先を引く
// 唯一の読み手は `create-sync-server.ts` の `broadcastSnapshot` だったが、
// これは名簿を引く形へ揃えた）。`RoomSchema` は非 strict の `v.object` なので、
// この項目を載せた古い snapshot のパースは今までどおり通る。
//
// ⚠ かつてここには `startedAt`（初めてセッションが開始された時刻）があった。
// 役割の廃止（#95 S3）で読み手が 0 件になり、S4a で `TimerState` から値ごと消えた。
// 書き手も読み手も無い任意項目を型と `RoomSchema` に残しても、**宣言の側にだけ生き残る
// 記号**になるだけなので落とした。`RoomSchema` は非 strict の `v.object` なので、
// この項目を載せた古い snapshot のパースは今までどおり通る。
//
// ⚠ かつて `SessionConfig` には `members`（ローテーション順の表示名）があった。
// **#294 で落とした。** 本来の読み手だった輪の表示は #276 で `session.seats` へ移り、
// 残っていた 2 つ（自分の名前が引けないときの縮退・完成記録の表示名）は、どちらも
// 「輪の順の表示名」を別の用途へ流用していただけだった。**席は識別子を持つ**ので、
// 添字でしか対応が付かないこの配列を置いておく理由が無くなった。
// `RoomSchema` は非 strict の `v.object` なので、この項目を載せた古い snapshot の
// パースは今までどおり通る（`deploy.sh timer` は画面を先に配るため、
// 「新しい画面 × 旧サーバー」の窓でこれが効く）。
