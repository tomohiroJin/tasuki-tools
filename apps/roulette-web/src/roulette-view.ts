/**
 * ルーレットの画面の判断（`docs/adr/0015` MUST 1）。React にも I/O にも依存しない。
 *
 * 時計は引数で受ける（`nowMs` は `performance.now()`、`receivedAt` は同期フックが回転ごとに
 * 1 度だけ取る基準）。**回転の経過 = サーバーが送った `elapsedMs` + 受け取ってからの時間。**
 */
import type { RosterRoom } from '@tasuki/room-core';
import { poolOf, type Entry, type Member, type RouletteState, type RouletteView } from '@tasuki/roulette-core';
import {
  CAPTION_IDLE,
  CYCLE_NOTE,
  RECONNECTING_TEXT,
  SPIN_AGAIN_BUTTON,
  SPIN_BUTTON,
  SPINNING_BUTTON,
  STALE_TEXT,
  TOO_FEW_TEXT,
  UNREACHABLE_TEXT,
  cycleProgressText,
  resultText,
  spunByText,
} from './copy';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

/**
 * 操作できるか。**切断中と参加前は押させない。**
 *
 * `SyncConnection` は確立前の送信をキューに溜め、再接続時に**入り直しの `room.join` より先に**
 * 流す。押せたままにすると、切断中に押した操作はサーバーで `NOT_IN_ROOM` になる。
 */
export function canOperate(status: ConnectionStatus, joined: boolean): boolean {
  return status === 'open' && joined;
}

type Spin = NonNullable<RouletteView['spin']>;

/** 回転の経過（ms）。サーバーが送った経過に、受け取ってからの時間を足す（0〜`durationMs`）。 */
function elapsedOf(spin: Spin, receivedAt: number, nowMs: number): number {
  return Math.min(spin.durationMs, Math.max(0, spin.elapsedMs + (nowMs - receivedAt)));
}

/** サーバー上でまだ回転中か（動きを減らす設定でも変わらない。次の回転は拒まれる）。 */
export function isServerSpinning(view: RouletteView, receivedAt: number, nowMs: number): boolean {
  return view.spin !== null && elapsedOf(view.spin, receivedAt, nowMs) < view.spin.durationMs;
}

export type Phase = 'idle' | 'spinning' | 'settled';

/**
 * 画面が見せる局面。**動きを減らす設定では回さず、受け取った直後から止まった局面にする**（spec §6.5）。
 * 結果の一言・「選ばれた」の印・一周の数は、この局面が「止まった」になって初めて当たりを含める。
 */
export function phaseOf(input: {
  view: RouletteView;
  receivedAt: number;
  nowMs: number;
  reducedMotion: boolean;
}): Phase {
  if (input.view.spin === null) return 'idle';
  if (input.reducedMotion) return 'settled';
  return isServerSpinning(input.view, input.receivedAt, input.nowMs) ? 'spinning' : 'settled';
}

/** 名簿のフレームを抽選の名簿の断片に直す。在室の判定はサーバーと同じ（接続が 1 本でもあれば在室）。 */
export function membersOf(roster: RosterRoom | null): Member[] {
  return (roster?.participants ?? []).map((p) => ({
    id: p.participantId,
    name: p.displayName,
    present: p.presence === 'online',
  }));
}

/** `poolOf` が読む形（`excluded` と `guests` だけが効く）。 */
function stateOf(view: RouletteView): RouletteState {
  return { excluded: view.excluded, guests: view.guests, drawn: view.drawn, lastSpin: null, nextGuestSeq: 1 };
}

/** 回転の当たり（無ければ null）。 */
export function winnerOf(view: RouletteView): Entry | null {
  const spin = view.spin;
  return spin === null ? null : (spin.wheel[spin.winnerIndex] ?? null);
}

/**
 * 行の印。1 行に出す印はこの 1 つ（離席中が選ばれたより先）。
 * 同名のゲストが入る人から外れる印など、印が増えるときはここに足す。
 */
export type RowMark = 'away' | 'drawn' | null;

export interface PersonRow {
  id: string;
  name: string;
  /** チェックの有無 = 入る人か */
  checked: boolean;
  /** 離席中の人は外す・戻すができない（サーバーが在室で自動に外している） */
  disabled: boolean;
  isSelf: boolean;
  /** 名前を消せるのは足したゲストだけ */
  removable: boolean;
  mark: RowMark;
}

export interface People {
  rows: PersonRow[];
  /** 入る人の数 */
  poolCount: number;
  /** この一周で選ばれた人の数（回っている間は今回の当たりを数えない） */
  drawnCount: number;
}

/**
 * 脇の一覧。**回っている間は今回の当たりを選ばれた人に含めない**（見た目でも先に結果が分からないように・
 * spec §6.8）。
 */
export function peopleOf(input: {
  members: readonly Member[];
  view: RouletteView;
  selfId: string | null;
  phase: Phase;
}): People {
  const { members, view, selfId, phase } = input;
  const winnerId = phase === 'spinning' ? (winnerOf(view)?.id ?? null) : null;
  const drawn = new Set(view.drawn.filter((id) => id !== winnerId));
  const excluded = new Set(view.excluded);
  const poolIds = new Set(poolOf(members, stateOf(view)).map((e) => e.id));

  const markOf = (id: string, away: boolean): RowMark => (away ? 'away' : poolIds.has(id) && drawn.has(id) ? 'drawn' : null);
  const memberRows = members.map(
    (m): PersonRow => ({
      id: m.id,
      name: m.name,
      checked: !excluded.has(m.id) && m.present,
      disabled: !m.present,
      isSelf: m.id === selfId,
      removable: false,
      mark: markOf(m.id, !m.present),
    }),
  );
  const guestRows = view.guests.map(
    (g): PersonRow => ({
      id: g.id,
      name: g.name,
      checked: !excluded.has(g.id),
      disabled: false,
      isSelf: false,
      removable: true,
      mark: markOf(g.id, false),
    }),
  );
  const rows = [...memberRows, ...guestRows];
  const drawnCount = rows.filter((r) => r.mark === 'drawn').length;
  return { rows, poolCount: poolIds.size, drawnCount };
}

/** 一周の行の文。始まる前は規則の説明、始まったら進み具合。 */
export function cycleLineOf(drawnCount: number, poolCount: number): string {
  return drawnCount === 0 ? CYCLE_NOTE : cycleProgressText(drawnCount, poolCount);
}

/**
 * 結果の一言（`role="status"`）。**回っている間は当たりの名前を言わない**（読み上げが演出より先に
 * 結果を言ってしまう・spec §6.8）。
 */
export function captionOf(input: { view: RouletteView; phase: Phase; poolCount: number }): string {
  const { view, phase, poolCount } = input;
  if (phase === 'spinning' && view.spin !== null) return spunByText(view.spin.spunBy);
  if (poolCount < 2) return TOO_FEW_TEXT;
  const winner = phase === 'settled' ? winnerOf(view) : null;
  return winner === null ? CAPTION_IDLE : resultText(winner.name);
}

/** 主ボタンの文言と押せるか。回転の間は（動きを減らしても）押せない。 */
export function spinButtonOf(input: {
  view: RouletteView;
  poolCount: number;
  operable: boolean;
  serverSpinning: boolean;
}): { label: string; disabled: boolean } {
  const { view, poolCount, operable, serverSpinning } = input;
  if (serverSpinning) return { label: SPINNING_BUTTON, disabled: true };
  return { label: view.spin === null ? SPIN_BUTTON : SPIN_AGAIN_BUTTON, disabled: !operable || poolCount < 2 };
}

export type ConnectionNotice =
  | { kind: 'none' }
  | { kind: 'reconnecting' | 'unreachable' | 'stale'; text: string };

/** 一度繋がった後、ここまで連続で失敗したら「戻る見込み」を諦めて伝え方を変える（poker-web と同じ値）。 */
const GIVE_UP_AFTER_ATTEMPTS = 3;

/** 接続状態を利用者向けの告知に翻訳する（poker-web の `connection-notice.ts` と同じ規則）。 */
export function connectionNotice(input: {
  readonly status: ConnectionStatus;
  readonly everConnected: boolean;
  readonly failedAttempts: number;
  readonly syncStale: boolean;
}): ConnectionNotice {
  if (input.status === 'open') {
    return input.syncStale ? { kind: 'stale', text: STALE_TEXT } : { kind: 'none' };
  }
  if (input.failedAttempts === 0) return { kind: 'none' };
  if (!input.everConnected || input.failedAttempts >= GIVE_UP_AFTER_ATTEMPTS) {
    return { kind: 'unreachable', text: UNREACHABLE_TEXT };
  }
  return { kind: 'reconnecting', text: RECONNECTING_TEXT };
}
