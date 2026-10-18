/**
 * ルーレットの画面の判断（`docs/adr/0015` MUST 1）。React にも I/O にも依存しない。
 *
 * 時計は引数で受ける（`nowMs` は `performance.now()`、`receivedAt` は同期フックが回転ごとに
 * 1 度だけ取る基準）。**回転の経過 = サーバーが送った `elapsedMs` + 受け取ってからの時間。**
 */
import { conflictsWithExisting, type RosterRoom } from '@tasuki/room-core';
import { pickStopsMs, poolOf, type Entry, type Member, type RouletteMode, type RouletteState, type RouletteView } from '@tasuki/roulette-core';
import {
  CAPTION_IDLE,
  ORDER_ALL_DONE,
  ORDER_BUTTON,
  ORDER_LAST_BUTTON,
  ORDER_NEW_ROUND_BUTTON,
  ORDER_NOTE,
  ORDER_NOT_STARTED,
  RECONNECTING_TEXT,
  SPIN_AGAIN_BUTTON,
  SPIN_BUTTON,
  SPINNING_BUTTON,
  STALE_TEXT,
  TOO_FEW_TEXT,
  UNREACHABLE_TEXT,
  groupIdleText,
  groupResultText,
  groupTopicNoteText,
  orderLastText,
  orderProgressText,
  resultText,
  spunByText,
  tooFewForPickText,
  topicNoteText,
  turnLabel,
  turnResultText,
} from './copy';
import type { PickSpot } from './wheel-motion';
import type { WheelSeats } from './wheel-view';
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
 * 結果の一言・円盤の真鍮の席は、この局面が「止まった」になって初めて当たりを含める。
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
  return {
    excluded: view.excluded,
    guests: view.guests,
    lastSpin: null,
    nextGuestSeq: 1,
    pickCount: pickCountOf(view),
    mode: modeOf(view),
    order: null,
  };
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
 * いま何人目まで決まったか（0〜k・#401 spec §6.2）。**札・円盤の真鍮の席・一覧の番の印は
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
  // 変わった止まり方（#420）は 1 人目が止まる時刻が延びる（2 人目からはその分だけ後ろへずれる）
  return pickStopsMs(k, spin.stopStyle).filter((stop) => elapsed >= stop).length;
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
export type RowMark = 'away' | 'twin' | 'turn' | null;

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
  /** 順番に回すときの番（印が `turn` のときだけ数・#401 順番に回す） */
  turn: number | null;
}

export interface People {
  rows: PersonRow[];
  /** 入る人の数 */
  poolCount: number;
}

/** 脇の一覧。印は離席中・同名のゲスト・順番に回すときの番だけ（一周の記録は無い・#427）。 */
export function peopleOf(input: {
  members: readonly Member[];
  view: RouletteView;
  selfId: string | null;
  /** いまの入る人（`poolOfView`） */
  pool: readonly Entry[];
  /** 順番に回すときの、見せてよい番（`orderStageOf` の `turns`）。渡すと番の印を付ける */
  turns?: ReadonlyMap<string, number> | undefined;
}): People {
  const { members, view, selfId, pool } = input;
  const excluded = new Set(view.excluded);
  const poolIds = new Set(pool.map((e) => e.id));

  const turns = input.turns;
  const markOf = (id: string, away: boolean, twin = false): RowMark =>
    away
      ? 'away'
      : twin
        ? 'twin'
        : turns !== undefined
          ? turns.has(id)
            ? 'turn'
            : null
          : null;
  const turnOf = (mark: RowMark, id: string): number | null => (mark === 'turn' ? (turns?.get(id) ?? null) : null);
  const memberRows = members.map((m): PersonRow => {
    const mark = markOf(m.id, !m.present);
    return {
      id: m.id,
      name: m.name,
      checked: !excluded.has(m.id) && m.present,
      disabled: !m.present,
      isSelf: m.id === selfId,
      removable: false,
      mark,
      turn: turnOf(mark, m.id),
    };
  });
  const guestRows = view.guests.map((g): PersonRow => {
    // 在室者と同じ名前のゲストは入る人から外れる（サーバーの `poolOf` が決める。写しを作らず同じ関数に聞く）。
    // 外していないのに入る人に居ない = 同じ名前の人がいるため
    const twin = !excluded.has(g.id) && !poolIds.has(g.id);
    const mark = markOf(g.id, false, twin);
    return {
      id: g.id,
      name: g.name,
      checked: poolIds.has(g.id),
      // 同名で外れている間は、チェックを入れても入る人に戻らない（押しても何も起きない）ので押させない。
      // 理由は印の文言が言う（画面は印をチェックの説明に結び付ける）。
      disabled: twin,
      isSelf: false,
      removable: true,
      mark,
      turn: turnOf(mark, g.id),
    };
  });
  const rows = [...memberRows, ...guestRows];
  return { rows, poolCount: poolIds.size };
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

// ---------- 順番に回す（#401 順番に回す spec §5） ----------

/** 決め方（#401 順番に回す T1）。古いサーバーは載せないので「1 回で決める」として読む。 */
export function modeOf(view: RouletteView): RouletteMode {
  return view.mode ?? 'once';
}

/**
 * 舞台が読む形。**決め方に合わない回転を伏せる**（回っていない形にする）: 1 回で決めるときの順番の回転（`turn` がある）・
 * 順番に回すときの、回の無い回転と 1 回の回転。決め方を変えた直後や、やり直した後に前の回転の結果を出さない。
 * 押して止める回転は、押して止めるときだけ読む。合っていれば同じ参照を返す（1 回で決めるときの舞台は #415 のまま）。
 */
export function stageViewOf(view: RouletteView): RouletteView {
  const spin = view.spin;
  if (spin === null) return view;
  const orderSpin = spin.turn !== undefined;
  // 押して止める回転（#401 押して止める）は、押して止めるときだけ読む。ほかの決め方では回していない形にする
  const pressSpin = spin.press !== undefined;
  const mode = modeOf(view);
  const keep =
    mode === 'press' ? pressSpin : mode === 'order' ? orderSpin && (view.order ?? null) !== null : !orderSpin && !pressSpin;
  return keep ? view : { ...view, spin: null };
}

export interface OrderStage {
  /** 円盤の席。回が終わったら席は無い（案 A・T3） */
  seats: WheelSeats;
  /** 円盤の中心の数 = あと何人（回っている間は、いま選ばれる人もまだに数える） */
  hubCount: number;
  card: { label: string; name: string | null; revealed: boolean };
  /** あと何人（`hubCount` と同じ数。回が終わったら 0） */
  left: number;
  /** 見せてよい、番が決まった人の数 */
  doneCount: number;
  /** 回の途中か */
  inRound: boolean;
  finished: boolean;
  /** 見せてよい番（脇の一覧の印）。回っている間は、いま選ばれる人を入れない */
  turns: ReadonlyMap<string, number>;
  /** 回が終わったときの最後の人（終わっていなければ null） */
  last: Entry | null;
}

/**
 * 順番に回すときの舞台（#401 順番に回す T2〜T4・§5.1）。`view` は `stageViewOf` を通したもの。
 * 番が決まった人は、回っている間はいまの回転の人（`turn` 番）を伏せる（見た目でも先に結果が分からないように）。
 */
export function orderStageOf(input: { view: RouletteView; pool: readonly Entry[]; phase: Phase; revealed: number }): OrderStage {
  const { view, pool, phase, revealed } = input;
  const order = view.order ?? null;
  const spin = view.spin;
  const done = order?.done ?? [];
  const finished = order?.finished === true;
  const shown = phase === 'spinning' && spin?.turn !== undefined ? done.slice(0, spin.turn - 1) : done;
  const shownIds = new Set(shown.map((e) => e.id));
  const doneIds = new Set(done.map((e) => e.id));
  const left = finished ? 0 : pool.filter((e) => !shownIds.has(e.id)).length;
  const turns = new Map(shown.map((e, i) => [e.id, i + 1]));
  const last = finished ? (done.at(-1) ?? null) : null;

  if (finished) {
    return {
      seats: { entries: [], winners: [] },
      hubCount: 0,
      card: { label: turnLabel(done.length), name: last?.name ?? null, revealed: last !== null },
      left,
      doneCount: shown.length,
      inRound: false,
      finished,
      turns,
      last,
    };
  }
  const settled = phase === 'settled';
  const picked = spin === null ? null : (revealedPicksOf(view, revealed)[0] ?? null);
  return {
    seats:
      spin === null
        ? { entries: pool.filter((e) => !doneIds.has(e.id)), winners: [] }
        : { entries: spin.wheel, winners: picksOf(spin).slice(0, revealed).map((p) => p.index) },
    hubCount: left,
    card: {
      label: turnLabel(spin?.turn ?? done.length + 1),
      name: settled ? (picked?.name ?? null) : null,
      revealed: settled && picked !== null,
    },
    left,
    doneCount: shown.length,
    inRound: order !== null,
    finished,
    turns,
    last,
  };
}

/** 順番に回すときの一言（`role="status"`）。回っている間は選ばれる人の名前を言わない。 */
export function orderCaptionOf(input: { view: RouletteView; phase: Phase; poolCount: number; order: OrderStage }): string {
  const { view, phase, poolCount, order } = input;
  if (phase === 'spinning' && view.spin !== null) return spunByText(view.spin.spunBy);
  if (order.last !== null) return orderLastText(order.last.name);
  if (phase === 'settled' && view.spin?.turn !== undefined && order.card.name !== null) return turnResultText(view.spin.turn, order.card.name);
  return !order.inRound && poolCount < 2 ? TOO_FEW_TEXT : ORDER_NOTE;
}

/**
 * 順番に回すときの主ボタン。回が終わったら「次の回を始める」、まだの人が 1 人なら「最後の 1 人」（回さずに出す・T3）。
 * 新しい回は 2 人から（サーバーと同じ）。回の途中は、まだの人が何人でも押せる（サーバーが回を進めるか終える）。
 */
export function orderButtonOf(input: {
  order: OrderStage;
  poolCount: number;
  operable: boolean;
  serverSpinning: boolean;
}): { label: string; disabled: boolean } {
  const { order, poolCount, operable, serverSpinning } = input;
  if (serverSpinning) return { label: SPINNING_BUTTON, disabled: true };
  if (order.finished) return { label: ORDER_NEW_ROUND_BUTTON, disabled: !operable || poolCount < 2 };
  if (order.inRound) return { label: order.left === 1 ? ORDER_LAST_BUTTON : ORDER_BUTTON, disabled: !operable };
  return { label: ORDER_BUTTON, disabled: !operable || poolCount < 2 };
}

/** 決め方の面の進み具合（順番に回すとき）。 */
export function orderProgressOf(order: OrderStage): string {
  if (order.finished) return ORDER_ALL_DONE;
  return order.doneCount === 0 ? ORDER_NOT_STARTED : orderProgressText(order.doneCount, order.left);
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
