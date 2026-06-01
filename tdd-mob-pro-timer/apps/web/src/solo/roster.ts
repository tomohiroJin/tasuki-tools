/**
 * ソロモードのロスター（参加者・ルーム）構築
 * 項目4: 共有時はサーバーが participants/rotation をミラーするが、ソロは App が
 * config.members ＋ ロスター差分（改名/離脱/代理）から合成ルームを組み立てる。
 *
 * ここを純関数として切り出すことで「全メンバー分の Participant 生成」「現ドライバーの
 * 表示名一致」「members[1..n] の改名/skip」をユニットテスト可能にする。
 */

import type {
  Participant,
  Problem,
  Room,
  ServerClock,
  SessionConfig,
  SessionState,
} from "@tdd-mob/core";

/** App ローカルに保持するソロのロスター差分（soloRosterRef と同形） */
export interface SoloRosterOverrides {
  /** participantId → 改名後の表示名 */
  renames: Record<string, string>;
  /** 一時離脱中の participantId 集合 */
  skips: Set<string>;
  /** 代理参加者（Web 非接続のメンバー） */
  proxies: { participantId: string; displayName: string }[];
}

/** ソロの参加者1人分の正規化ビュー（改名反映済み） */
export interface SoloMember {
  participantId: string;
  /** rotation 上の元の名前（config.members 由来。改名前） */
  baseName: string;
  /** 改名を反映した表示名 */
  displayName: string;
  role: "host" | "editor";
  /** Web 非接続の代理参加者か */
  isProxy: boolean;
}

/**
 * config.members[index] に対応する安定した participantId を返す。
 * index 0 はホスト（既定 participantId "solo"）、以降は index ベースの一意 ID。
 * index ベースなので改名しても ID は変わらず、改名/skip 差分を安定して当てられる。
 */
export function soloMemberId(index: number): string {
  return index === 0 ? "solo" : `solo-member-${index}`;
}

/**
 * config.members ＋ 代理を、一意 ID 付きの参加者リストへ展開する（改名反映済み）。
 * members は rotation と同じ順序で先頭に並び、代理は末尾に続く。
 */
export function soloRosterMembers(
  members: string[],
  overrides: SoloRosterOverrides,
): SoloMember[] {
  const base: SoloMember[] = members.map((name, i) => {
    const id = soloMemberId(i);
    return {
      participantId: id,
      baseName: name,
      displayName: overrides.renames[id] ?? name,
      role: i === 0 ? "host" : "editor",
      isProxy: false,
    };
  });
  const proxies: SoloMember[] = overrides.proxies.map((px) => ({
    participantId: px.participantId,
    baseName: px.displayName,
    displayName: overrides.renames[px.participantId] ?? px.displayName,
    role: "editor",
    isProxy: true,
  }));
  return [...base, ...proxies];
}

/**
 * ソロ用の合成ルームを組み立てる（共有時の Room 形と互換）。
 * - participants は config.members 全員＋代理（members[0]=host、残りは editor）。
 * - rotation は各メンバーの「表示名」（改名反映）＋代理名。engine の rotation 順と一致させる。
 * - driverCounts は engine 由来（members 分）＋代理分 0。不変条件
 *   rotation.length === driverCounts.length を保つ。
 */
export function buildSoloRoom(params: {
  config: SessionConfig;
  /** engine.aggregate.session（currentIndex/driverCounts などの真実源） */
  engineSession: SessionState;
  /** engine.aggregate.clock */
  clock: ServerClock;
  createdAt: number;
  overrides: SoloRosterOverrides;
  problem: Problem | null;
}): Room {
  const { config, engineSession, clock, createdAt, overrides, problem } = params;
  const members = soloRosterMembers(config.members, overrides);

  const participants: Participant[] = members.map((m) => ({
    participantId: m.participantId,
    connId: null,
    displayName: m.displayName,
    role: m.role,
    presence: m.isProxy ? "offline" : "online",
    hasAiKey: false,
    joinedAt: 0,
    ...(m.isProxy ? { isPlaceholder: true } : {}),
    driverEligible: !overrides.skips.has(m.participantId),
  }));

  // rotation はメンバー（改名反映）→代理名の順。engine rotation（config.members 順）と
  // index が一致するので currentIndex はそのまま使える。
  const memberNames = members
    .filter((m) => !m.isProxy)
    .map((m) => m.displayName);
  const proxyNames = members.filter((m) => m.isProxy).map((m) => m.displayName);
  const rotation = [...memberNames, ...proxyNames];
  const driverCounts = [
    ...engineSession.driverCounts,
    ...proxyNames.map(() => 0),
  ];

  return {
    code: "SOLO",
    createdAt,
    hostParticipantId: "solo",
    config,
    problem,
    session: { ...engineSession, rotation, driverCounts },
    clock,
    phase: "session",
    participants,
    sessionRecords: [],
    handoffNote: "",
    onBreak: false,
  };
}
