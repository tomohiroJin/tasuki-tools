/**
 * ルーレットの画面の判断（`docs/adr/0015` MUST 1）。React にも I/O にも依存しない。
 *
 * 時計は引数で受ける（`nowMs` は `performance.now()`、`receivedAt` は同期フックが回転ごとに
 * 1 度だけ取る基準）。**回転の経過 = サーバーが送った `elapsedMs` + 受け取ってからの時間。**
 */
import { conflictsWithExisting, type RosterRoom } from '@tasuki/room-core';
import { pickStopsMs, poolOf, type Entry, type Member, type RouletteState, type RouletteView } from '@tasuki/roulette-core';
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
  groupIdleText,
  groupResultText,
  groupTopicNoteText,
  resultText,
  spunByText,
  tooFewForPickText,
  topicNoteText,
} from './copy';
import type { PickSpot } from './wheel-motion';
// 接続状態の型の正本は `@tasuki/sync-client`（#369）。型だけを取る（実行時には同期クライアントを読まない）。
import type { ConnectionStatus } from '@tasuki/sync-client';


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

/**
 * 回転の経過（ms）。サーバーが送った経過に、受け取ってからの時間を足す（0〜`durationMs`）。
 * 局面（`phaseOf`）と円盤の角度（`useWheelRotation`）が同じこの関数で経過を出す。
 */
export function elapsedOf(spin: Spin, receivedAt: number, nowMs: number): number {
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
  return { excluded: view.excluded, guests: view.guests, drawn: view.drawn, lastSpin: null, nextGuestSeq: 1, pickCount: pickCountOf(view) };
}

/**
 * いまの入る人（円盤の席の並び）。サーバーの `poolOf` と同じ関数に聞く。画面はこれを 1 回だけ組み、
 * 一覧（`peopleOf`）と円盤（`wheelSeatsOf`）へ渡す。
 */
export function poolOfView(members: readonly Member[], view: RouletteView): Entry[] {
  return poolOf(members, stateOf(view), conflictsWithExisting);
}

/** 選ぶ人数（#401）。古いサーバーは載せないので 1 として読む。 */
export function pickCountOf(view: RouletteView): number {
  return view.pickCount ?? 1;
}

/** 止まる順の当たり（#401）。古いサーバーのフレームは `picks` を持たないので、1 人目だけの回転として読む。 */
export function picksOf(spin: Spin): PickSpot[] {
  return spin.picks ?? [{ index: spin.winnerIndex, settle: spin.settle }];
}

/**
 * 札の種類を決める人数（#401 spec §6.3）。回したことがあれば**回転の人数**（次に回すまで結果の札を保つ。
 * 回っている間は凍結した人数なので、段組みが動かない）、無ければいまの選ぶ人数。
 */
export function cardPickCountOf(view: RouletteView): number {
  return view.spin === null ? pickCountOf(view) : picksOf(view.spin).length;
}

/**
 * いま何人目まで決まったか（0〜k・#401 spec §6.2）。**札・円盤の真鍮の席・一覧の「選ばれた」・一周の数は
 * この 1 つの値で同じ瞬間に切り替わる。** 止まる時刻は core の `pickStopsMs`（サーバーの回転の長さと同じ表）。
 * 動きを減らす設定では、受け取った直後から全員が決まっている（`phaseOf` と同じ扱い）。
 */
export function revealedCountOf(input: { view: RouletteView; receivedAt: number; nowMs: number; reducedMotion: boolean }): number {
  const spin = input.view.spin;
  if (spin === null) return 0;
  const k = picksOf(spin).length;
  if (input.reducedMotion) return k;
  const elapsed = elapsedOf(spin, input.receivedAt, input.nowMs);
  // 古いサーバー（1 人・picks 無し）は wire の長さで止まる。表と食い違っても終わったら全員にする
  if (elapsed >= spin.durationMs) return k;
  return pickStopsMs(k).filter((stop) => elapsed >= stop).length;
}

/** 決まった人（止まった順・`revealed` 人まで）。 */
export function revealedPicksOf(view: RouletteView, revealed: number): Entry[] {
  const spin = view.spin;
  if (spin === null) return [];
  return picksOf(spin)
    .slice(0, revealed)
    .flatMap((p) => {
      const e = spin.wheel[p.index];
      return e === undefined ? [] : [e];
    });
}

/** お題の添え書き（#401。1 人は #94 の文のまま）。 */
export function topicNoteOf(title: string, k: number): string {
  return k === 1 ? topicNoteText(title) : groupTopicNoteText(title, k);
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
export type RowMark = 'away' | 'twin' | 'drawn' | null;

export interface PersonRow {
  id: string;
  name: string;
  /** チェックの有無 = 入る人か */
  checked: boolean;
  /** 外す・戻すができない（離席中はサーバーが在室で自動に外している・同名のゲストは戻しても入らない） */
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
  /** いまの入る人（`poolOfView`） */
  pool: readonly Entry[];
  /** 何人目まで決まったか（`revealedCountOf`）。省くと、回っている間は 0 人・それ以外は全員（#94 と同じ） */
  revealed?: number;
}): People {
  const { members, view, selfId, phase, pool } = input;
  const all = view.spin === null ? 0 : picksOf(view.spin).length;
  const revealed = input.revealed ?? (phase === 'spinning' ? 0 : all);
  // まだ止まっていない今回の当たりは「選ばれた」に数えない（見た目でも先に結果が分からないように）
  const hidden = new Set(view.spin === null ? [] : picksOf(view.spin).slice(revealed).map((p) => view.spin?.wheel[p.index]?.id));
  const drawn = new Set(view.drawn.filter((id) => !hidden.has(id)));
  const excluded = new Set(view.excluded);
  const poolIds = new Set(pool.map((e) => e.id));

  const markOf = (id: string, away: boolean, twin = false): RowMark =>
    away ? 'away' : twin ? 'twin' : poolIds.has(id) && drawn.has(id) ? 'drawn' : null;
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
  const guestRows = view.guests.map((g): PersonRow => {
    // 在室者と同じ名前のゲストは入る人から外れる（サーバーの `poolOf` が決める。写しを作らず同じ関数に聞く）。
    // 外していないのに入る人に居ない = 同じ名前の人がいるため
    const twin = !excluded.has(g.id) && !poolIds.has(g.id);
    return {
      id: g.id,
      name: g.name,
      checked: poolIds.has(g.id),
      // 同名で外れている間は、チェックを入れても入る人に戻らない（押しても何も起きない）ので押させない。
      // 理由は印の文言が言う（画面は印をチェックの説明に結び付ける）。
      disabled: twin,
      isSelf: false,
      removable: true,
      mark: markOf(g.id, false, twin),
    };
  });
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
  // 止まった結果を先に言う。**発表した結果は、後から入る人が減っても消さない**（次の回転までは結果が主役）。
  // 2 人以上は最後の人が止まってから、止まった順に全員を言う（途中で言うと読み上げが 1 人ずつ割り込む）
  if (phase === 'settled' && view.spin !== null) {
    const picked = revealedPicksOf(view, picksOf(view.spin).length);
    if (picked.length === 1) return resultText(picked[0]!.name);
    if (picked.length > 1) return groupResultText(...picked.map((e) => e.name));
  }
  const k = pickCountOf(view);
  if (poolCount < k + 1) return k === 1 ? TOO_FEW_TEXT : tooFewForPickText(k);
  return k === 1 ? CAPTION_IDLE : groupIdleText(k);
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
  // 入る人がちょうど選ぶ人数なら全員が選ばれ、回す意味が無い（#401 spec M5。1 人なら #94 の「2 人から」と同じ）
  return { label: view.spin === null ? SPIN_BUTTON : SPIN_AGAIN_BUTTON, disabled: !operable || poolCount < pickCountOf(view) + 1 };
}

export type ConnectionNotice =
  | { kind: 'none' }
  | { kind: 'reconnecting' | 'unreachable' | 'stale'; text: string };

/**
 * 告知の種類を利用者向けの文にする。**種類を決める規則（諦めるまでの回数を含む）は
 * `@tasuki/sync-client` の `connectionNoticeKind` にあり、同期フックが引く**（poker・お題と同じ規則。
 * 写しを持たない）。ここは文言を当てるだけである。
 */
export function connectionNotice(kind: ConnectionNotice['kind']): ConnectionNotice {
  switch (kind) {
    case 'none':
      return { kind };
    case 'stale':
      return { kind, text: STALE_TEXT };
    case 'unreachable':
      return { kind, text: UNREACHABLE_TEXT };
    case 'reconnecting':
      return { kind, text: RECONNECTING_TEXT };
  }
}
