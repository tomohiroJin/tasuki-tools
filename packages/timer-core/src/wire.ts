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
 * **ここで言うのは型の話だけである。型から落としたのは `startedAt`（S4a）と
 * `connId`（S4b）の 2 つ**（このファイル末尾の注記を読むこと）。**合成の例外**
 * （`participants` の並び・`driverEligible` の出し方・`presence` の導出）は
 * `apps/tasuki-sync/src/application/timer-snapshot-dto.ts` の台帳にある。
 */
import type {
  CompletionRecord,
  Problem,
  ProblemMode,
  RoomPhase,
  ServerClock,
  TimerConfig,
} from "./aggregate.js";

/**
 * wire の設定。サーバー側の {@link TimerConfig} に、表示名へ解決した `members` を足したもの。
 *
 * `members` は**ローテーション順の表示名**であり、名簿の写しではない（輪の外に居る人は
 * 載らない）。サーバーは保持せず、snapshot を組むたびに名簿と rotation から解決する（D15）。
 */
export interface SessionConfig extends TimerConfig {
  /** ローテーション順の表示名（DTO 組み立てで解決する） */
  members: string[];
}

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
