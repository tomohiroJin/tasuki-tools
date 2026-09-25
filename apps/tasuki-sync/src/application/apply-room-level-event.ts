/**
 * ルームレベルのイベント適用（FR-103）。
 *
 * `handlers.ts` が抱えていた `applyEvents`/`applyRoomLevelEvent`（集約反映後に
 * Room レベルのイベントを適用する処理）を、ロジックを変えずに1モジュールへ
 * 切り出したもの（フェーズ4・純粋な移動）。
 *
 * **#95 S4a で扱う状態が 2 つになった。** 名簿（`@tasuki/room-core` の `Room`）と
 * timer の状態（`TimerState`）である。イベントごとにどちらを触るかは決まっている ——
 * 改名は名簿（代理ならローテーションのラベル）、見送り／復帰と代理の追加は
 * ローテーション、それ以外は timer の状態だけである。
 *
 * ★**適用順の依存関係（呼び出し側が守るべき契約）**:
 * `applyEvents` は「1. evolve/advanceDriver が返した集約を timer の状態に反映する →
 * 2. その結果を基底にして Room レベルのイベントを適用する」の順序を型
 * （`StateWithAggregate`）で強制する。この順序を逆にすると、`applyRoomLevelEvent`
 * が更新しうる `session.rotation`（`ProxyMemberAdded`/`DriverSkipped` 等）が
 * 集約の反映で丸ごと上書きされ捨てられる。詳細は各関数の docstring を参照。
 */

import { buildCompletionRecord, type Aggregate, type DomainEvent, type RotationEntry, type TimerState } from "@tasuki/timer-core";
import type { Room as MembershipRoom } from "@tasuki/room-core";
import { rotationDisplayNames } from "./timer-snapshot-dto.js";
// 「ロビーでお題を扱う範囲」は用意する側が持つ（`lobby-problem.ts` の `usesLobbyProblem`）。
// ここが落とす範囲と向こうが埋める範囲は一致していなければならない（#273）。
import { usesLobbyProblem } from "./lobby-problem.js";

/** 1 ルームの状態一式（名簿と timer の状態。`code` で対になっている）。 */
export interface RoomState {
  membership: MembershipRoom;
  timer: TimerState;
}

/**
 * **集約（session + clock）を反映済みであることを表す型**（FR-103）。
 *
 * 実体はただの `RoomState` であり、この目印は**型の上にしか存在しない**（実行時のコストは無い）。
 * `applyRoomLevelEvent` はこの型しか受け付けず、この型を作れるのは `applyEvents` だけである。
 * したがって「Room レベルイベントを先に適用してしまう」順序違反はコンパイルが通らない。
 */
declare const aggregateApplied: unique symbol;
type StateWithAggregate = RoomState & { readonly [aggregateApplied]: true };

/**
 * **状態遷移の適用順序の契約**（FR-103）。
 *
 * 1. `evolve` / `advanceDriver` が返した集約を timer の状態に反映する
 * 2. その結果を基底にして Room レベルのイベントを順に適用する
 *
 * **この順序を逆にしてはならない。** `applyRoomLevelEvent` は `session.rotation` 等を
 * さらに更新しうるため（`ProxyMemberAdded` の席追加・`DriverSkipped` の適格変更）、
 * 集約の反映を後に回すと、そこで加えた session の変更が丸ごと捨てられる。
 *
 * かつてこの順序はコメントによる注意喚起でしか表現されておらず、呼び出し側が自分で
 * `{ ...room, session, clock }` を組み立ててからループを回していた。順序を守る責務を
 * この関数 1 つに閉じ込め、`applyRoomLevelEvent` を型で守ることで、順序違反を起こせなくする。
 *
 * **統合（`applyRoomLevelEvent` と `evolve` を 1 つにすること）は行わない**（Issue #26 の担当）。
 * ここで行うのは境界を型と契約として表現することまでである。
 */
export function applyEvents(
  state: RoomState,
  agg: Aggregate,
  events: readonly DomainEvent[],
  now: number,
): RoomState {
  const base = {
    membership: state.membership,
    timer: { ...state.timer, session: agg.session, clock: agg.clock },
  } as StateWithAggregate;
  return events.reduce<StateWithAggregate>(
    (acc, event) => applyRoomLevelEvent(acc, event, now),
    base,
  );
}

/** timer の状態だけを差し替えた新しい `RoomState` を返す（名簿は据え置き）。 */
function withTimer(state: StateWithAggregate, timer: TimerState): StateWithAggregate {
  return { membership: state.membership, timer } as StateWithAggregate;
}

/** 該当する席だけを写像して差し替える（`kind` は変えない）。 */
function mapRotation(
  state: StateWithAggregate,
  update: (entry: RotationEntry) => RotationEntry,
): StateWithAggregate {
  return withTimer(state, {
    ...state.timer,
    session: { ...state.timer.session, rotation: state.timer.session.rotation.map(update) },
  });
}

/** 席の適格（ドライバーの順番が回ってくるか）を書き換える。 */
function setEligible(
  state: StateWithAggregate,
  participantId: string,
  eligible: boolean,
): StateWithAggregate {
  return mapRotation(state, (e) =>
    e.kind === "member"
      ? (e.participantId === participantId ? { ...e, eligible } : e)
      : (e.id === participantId ? { ...e, eligible } : e),
  );
}

function applyRoomLevelEvent(
  state: StateWithAggregate,
  event: DomainEvent,
  _now: number,
): StateWithAggregate {
  const room = state.timer;
  switch (event.type) {
    case "PhaseSet": {
      // かつてここには `startedAt`（一度でも開始したかを表す単調フラグ）の記録があった。
      // 役割の廃止（#95 S3）で読み手が 0 件になり、S4a で `TimerState` から落とした。
      // **wire の型（`wire.ts`）と `RoomSchema` からも落としてある** —— 書き手も読み手も
      // 無い任意項目を宣言だけ残さないため（`wire.ts` の `startedAt` の注記）。
      // `RoomSchema` は非 strict の `v.object` なので、この項目を載せた古い snapshot の
      // パースは今までどおり通る。
      //
      // **ロビーへ入ってきたルームは、前のセッションのお題を持ち越さない**（#273）。
      // #249（#95 S5c）で「新しいセッション」がルームをロビーへ戻す形になり、
      // 同じルームで 2 本目を始める経路が初めてできた。お題を残すと 2 本目が
      // 1 本目と同じお題で始まる。
      //
      // **埋め直しはここでは起こさない。** `lobby-problem.ts` が commit のたびに
      // 「ロビーで `problem` が無いなら用意する」という**不変条件**を見ており（#271）、
      // ここが null にすればその場で埋まる。引き金を並べる側には回らない。
      //
      // **落とすのは完了画面から出るときだけである。**
      //
      // `decide.ts` の `phase.set` は**現在の phase を一切見ずに** `PhaseSet` を返す
      // （ガードが無い）。一方 `packages/sync-client/src/connection.ts` は未確立時の
      // コマンドを溜め、**再接続の `onopen` でそのまま流す**。つまり「切断中に押された
      // 『新しいセッション』が、再接続後に**走行中の**ルームへ届く」経路が実在する。
      // 「ロビー以外 → ロビー」で落とすと、この 1 通で走っているセッションのお題が
      // 消えて別のお題に差し替わる（レビュー②）。
      //
      // **`celebration` はセッションの終わりを表す唯一の phase である** ——
      // 完成（`SessionCompleted`）も中断（`SessionAborted`）もここを通る（下の 2 case）。
      // 「新しいセッション」は完了画面からしか押せないので、意図する遷移は
      // すべて `celebration` 発である。
      //
      // **行き先は `usesLobbyProblem` で見る。** ここが落とす範囲と
      // `lobby-problem.ts` が埋める範囲は一致していなければならない（ずれると
      // 落としたきり誰も埋めないロビーができる）。**判断は phase だけではない** ——
      // お題を使わない設定（`problemEnabled: false`）のルームは埋め直されないので、
      // 落とすと完成記録まで消える（レビュー 2 巡目①）。
      //
      // **落とすのはお題だけである。引き継ぎメモは意図して残す（#287）。**
      // 線は「セッションに属するか、ルームに属するか」で引く —— お題は 1 本の
      // セッションの題材なので落とし、引き継ぎメモ（次のドライバーへの申し送り・
      // FR-030）・完成記録・設定はルームに属するので残す。`SessionReset` の注記が
      // 「お題・メンバー・設定・引き継ぎは維持」と書いているのと同じ線である。
      // 判断を固定しているのは `test/handlers.lifecycle.test.ts` の
      // 「引き継ぎメモを書いて完了した / ロビーへ戻す」で、落とす実装へ変えると赤くなる。
      //
      // `celebration → session` も落とさない —— 溜まっていた `phase.set session` が
      // 後から届いても、用意済みのお題を捨てる理由は無い。
      const next: TimerState = { ...room, phase: event.phase };
      if (room.phase === "celebration" && usesLobbyProblem(room.config, event.phase)) {
        next.problem = null;
      }
      return withTimer(state, next);
    }
    case "SessionReset":
      // リセット＝最初から再スタート（v2.3 #3）。集約(session/clock)は evolve が
      // 先頭・満タン・走行に初期化済み。お題・メンバー・設定・引き継ぎは維持し、
      // phase は session のまま（その場で走り直す）。休憩フラグのみ解除する。
      return withTimer(state, { ...room, onBreak: false });
    case "ProblemSet":
      return withTimer(state, { ...room, problem: event.problem });
    case "ConfigSet":
      // 検証済み部分設定を config にマージ（言語/難易度/間隔を反映）。
      // 名簿はここを通らない（#95 S4a・D15。`members` は wire の境界で落ちる）。
      return withTimer(state, { ...room, config: { ...room.config, ...event.config } });
    case "HandoffNoteSet":
      return withTimer(state, { ...room, handoffNote: event.text });
    case "BreakStarted":
      return withTimer(state, { ...room, onBreak: true });
    case "BreakEnded":
      return withTimer(state, { ...room, onBreak: false });
    case "SessionCompleted": {
      // 既に完成済みなら二重計上しない（complete の冪等性）
      if (room.phase === "celebration") return state;
      // **お題の有無にかかわらず記録を作る**（#91・spec T9・E17）。お題なしが既定になったので、
      // 「お題があるときだけ」を残すと大半のセッションで記録が消える（#273 の欠陥の拡大版）。
      // 名簿は timer-core の外にあるので、表示名はここで解決して渡す（#95 D15）。
      const record = buildCompletionRecord(
        { session: room.session, clock: room.clock },
        event.topicTitle,
        rotationDisplayNames(state.membership, room),
        event.now,
        room.code,
      );
      return withTimer(state, { ...room, phase: "celebration", sessionRecords: [...room.sessionRecords, record] });
    }
    // ─── v2 イベント ──────────────────────────────────────────────────────
    case "SessionAborted":
      // 中断: 記録を生成せず締めくくりフェーズへ（FR-020）
      return withTimer(state, { ...room, phase: "celebration" });
    case "ProxyMemberAdded": {
      // 代理は**名簿へ足さない**（#95 S4a・D6）。輪の上のラベルとして席を足し、
      // driverCounts も伸ばしてドライバーローテーションに含める（FR-047）。
      const entry: RotationEntry = {
        kind: "proxy",
        id: event.participantId,
        label: event.displayName,
        eligible: true,
      };
      return withTimer(state, {
        ...room,
        session: {
          ...room.session,
          rotation: [...room.session.rotation, entry],
          driverCounts: [...room.session.driverCounts, 0],
        },
      });
    }
    case "ParticipantRenamed": {
      // 名簿に居る人なら名簿を、代理なら席のラベルを更新する。
      // どちらか一方にしか存在しないので、両方を試して当たった側だけが変わる。
      const renamed: StateWithAggregate = {
        membership: {
          ...state.membership,
          participants: state.membership.participants.map((p) =>
            p.id === event.participantId ? { ...p, displayName: event.displayName } : p,
          ),
        },
        timer: room,
      } as StateWithAggregate;
      return mapRotation(renamed, (e) =>
        e.kind === "proxy" && e.id === event.participantId
          ? { ...e, label: event.displayName }
          : e,
      );
    }
    case "DriverSkipped":
      return setEligible(state, event.participantId, false);
    case "DriverResumed":
      return setEligible(state, event.participantId, true);
    case "ProblemEdited": {
      if (!room.problem) return state;
      return withTimer(state, {
        ...room,
        problem: { ...room.problem, ...event.patch, edited: true },
      });
    }
    case "ProblemModeSet":
      return withTimer(state, { ...room, problemMode: event.mode });
    default:
      return state;
  }
}
