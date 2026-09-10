/**
 * 名簿（room-core）＋ timer の状態（timer-core）→ wire の `snapshot.room` を組む（#95 D16）。
 *
 * **ドメインに互いを知らせないための場所である。** ここでしか 2 つの文脈は出会わない。
 * 出力の形は S4a で変えない（既存の Web とそのテストが「変えていない」ことの証拠になる）。
 * **例外が 2 つある**（`buildTimerSnapshotRoom` の `driverEligible` の注記と、`wire.ts` の `startedAt` の注記）。
 *
 * 代理（`isPlaceholder`）はここで**合成される**。名簿には居らず、輪の上の席
 * （`RotationEntry` の `kind: "proxy"`）としてだけ存在するためである。
 */
import type { Room as MembershipRoom } from "@tasuki/room-core";
import {
  rotationEntryId,
  type Participant,
  type Room,
  type RotationEntry,
  type TimerState,
} from "@tasuki/timer-core";

/** ローテーション上の代理の席だけを取り出す。 */
type ProxyEntry = Extract<RotationEntry, { kind: "proxy" }>;

function proxyEntries(timer: TimerState): ProxyEntry[] {
  return timer.session.rotation.filter((e): e is ProxyEntry => e.kind === "proxy");
}

/** ローテーション順の表示名。member は名簿から、proxy はラベルから解決する。 */
export function rotationDisplayNames(membership: MembershipRoom, timer: TimerState): string[] {
  const names = new Map(membership.participants.map((p) => [p.id, p.displayName]));
  return timer.session.rotation.map((e) =>
    e.kind === "proxy" ? e.label : (names.get(e.participantId) ?? ""),
  );
}

/**
 * このルームで「名乗っている人」の一覧（名簿の参加者＋輪の上の代理）。
 *
 * S4a 以前は `Room.participants` が両方を含んでいたので、表示名の重複判定・在室者の
 * 数え上げ・指名の対象解決はすべてそこを見ていた。名簿から代理を抜いた以上、
 * **その 3 つは名簿だけを見てはならない**（見ると代理が消えて挙動が変わる）。
 *
 * 戻り値のキー名（`participantId`）は `@tasuki/room-core` の `conflictsWithExisting`
 * が要求する形に合わせてある（名簿の `Participant` は `id`）。
 */
export interface Occupant {
  participantId: string;
  displayName: string;
  /** Web 非接続の代理か（wire の `isPlaceholder` と同じ意味） */
  isPlaceholder: boolean;
  /** 在席（代理は常に offline。対面で居るがブラウザは繋いでいない） */
  presence: "online" | "idle" | "offline";
  connId: string | null;
}

export function occupants(membership: MembershipRoom, timer: TimerState): Occupant[] {
  return [
    ...membership.participants.map((p) => ({
      participantId: p.id,
      displayName: p.displayName,
      isPlaceholder: false,
      presence: p.presence,
      connId: p.connId,
    })),
    ...proxyEntries(timer).map((e) => ({
      participantId: e.id,
      displayName: e.label,
      isPlaceholder: true,
      presence: "offline" as const,
      connId: null,
    })),
  ];
}

/** 席の識別子から `eligible` を引く（輪に席が無ければ undefined）。 */
function seatEligibleOf(rotation: readonly RotationEntry[], id: string): boolean | undefined {
  const entry = rotation.find((e) => rotationEntryId(e) === id);
  return entry?.eligible;
}

export function buildTimerSnapshotRoom(membership: MembershipRoom, timer: TimerState): Room {
  const aiKeys = new Set(timer.aiKeyHolders);
  const members: Participant[] = membership.participants.map((p) => {
    // 適格は**席の属性**なので、輪に席がある人だけが値を持つ（輪の外の人は省略）。
    // S4a 以前は「一度でも見送り／復帰を押した人」だけが値を持っていたが、`false` と
    // `true` のどちらも同じ条件で出るこの形のほうが素直で、判定（`=== false` /
    // `!== false`）の結果は一致する。
    const eligible = seatEligibleOf(timer.session.rotation, p.id);
    return {
      participantId: p.id,
      connId: p.connId,
      displayName: p.displayName,
      presence: p.presence,
      hasAiKey: aiKeys.has(p.id),
      joinedAt: p.joinedAt,
      ...(eligible !== undefined ? { driverEligible: eligible } : {}),
    };
  });
  // 代理の `joinedAt` は名簿の作成時刻で埋める。席は追加時刻を持たないが、
  // この値を読む処理は無い（候補列の並べ替えは `hasAiKey` の人だけを見る）。
  const proxies: Participant[] = proxyEntries(timer).map((e) => ({
    participantId: e.id,
    connId: null,
    displayName: e.label,
    presence: "offline" as const,
    hasAiKey: false,
    joinedAt: membership.createdAt,
    isPlaceholder: true,
    driverEligible: e.eligible,
  }));
  return {
    code: timer.code,
    createdAt: timer.createdAt,
    config: { ...timer.config, members: rotationDisplayNames(membership, timer) },
    problem: timer.problem,
    // **明示列挙にする。** スプレッド（`...timer.session`）だと、サーバー側の
    // `SessionState` に足したフィールドが**黙って wire に載る**。ここを 5 項目で
    // 書いておけば、増えた項目は既定で載らず、載せたい人はこの行に書き足すことになる
    // （型が赤くなるわけではない —— 既定を「載せない」側へ倒すための書き方である）。
    session: {
      rotation: timer.session.rotation.map(rotationEntryId),
      currentIndex: timer.session.currentIndex,
      isPaused: timer.session.isPaused,
      driverCounts: timer.session.driverCounts,
      totalSwitches: timer.session.totalSwitches,
    },
    clock: timer.clock,
    phase: timer.phase,
    participants: [...members, ...proxies],
    sessionRecords: timer.sessionRecords,
    handoffNote: timer.handoffNote,
    onBreak: timer.onBreak,
    ...(timer.problemMode !== undefined ? { problemMode: timer.problemMode } : {}),
    ...(timer.passphraseProtected !== undefined
      ? { passphraseProtected: timer.passphraseProtected }
      : {}),
    ...(timer.aiUnlocked !== undefined ? { aiUnlocked: timer.aiUnlocked } : {}),
  };
}
