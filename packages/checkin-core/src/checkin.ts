/**
 * 会の始まりと終わりの札の状態の遷移（#406）。
 *
 * **表現は直接遷移関数＋`Result`**（agenda-core の `agenda.ts` と同じ）。乱数は引数で受ける（ドメインは環境を読まない）。
 * **状態が変わらないときは同じ参照を返す**。同期サーバーは参照の比較で「配るか」を決める。
 * **`seq` がいまの回と違う操作は、何もせず同じ参照を `ok` で返す**（回にまたがる取り違えの防止）。
 */
import { err, ok, type Result } from "neverthrow";
import type { CheckinError } from "./errors.js";
import { METHODS, methodsOf, type CardId, type MethodId, type Side, type Visibility } from "./methods.js";
import type { SeatInput } from "./projection.js";
import type { CheckinState, Round } from "./types.js";

const fail = <C extends CheckinError["code"]>(code: C): Result<never, CheckinError<C>> => err({ code });

/** 新しい回を始める。公開の仕方は既定に戻り、札は空 */
function startRound(s: CheckinState, method: MethodId): CheckinState {
  const seq = s.lastSeq + 1;
  const round: Round = {
    seq,
    method,
    visibility: METHODS[method].defaultVisibility,
    status: "open",
    cards: new Map(),
  };
  return { ...s, round, lastSeq: seq };
}

/**
 * 置き換える回が、いまの回か（回が無いときは 0）。
 * やり方を選ぶ・引く操作は前の回を捨てるので、**見ていた回と違えば何もしない**
 * （ほぼ同時の 2 回の選択や、開いたままの選択画面からの押下が、札の入った新しい回を黙って捨てないように）
 */
function replacesCurrent(s: CheckinState, seq: number): boolean {
  return (s.round?.seq ?? 0) === seq;
}

/** やり方を選ぶ。見ていた回（`seq`）を置き換える（前の回は捨てる）。違う回を見ていたら同じ参照 */
export function chooseMethod(s: CheckinState, input: { seq: number; method: MethodId }): CheckinState {
  if (!replacesCurrent(s, input.seq)) return s;
  return startRound(s, input.method);
}

/** 片側からくじで選ぶ。いまのやり方は候補から除く（反対側のやり方なら 5 つ全部）。違う回を見ていたら引かずに同じ参照 */
export function drawMethod(
  s: CheckinState,
  input: { seq: number; side: Side },
  randomInt: (n: number) => number,
): Result<CheckinState, CheckinError<"CHECKIN_INVALID_RANDOM">> {
  if (!replacesCurrent(s, input.seq)) return ok(s);
  const candidates = methodsOf(input.side).filter((m) => m !== s.round?.method);
  const i = randomInt(candidates.length);
  const picked = Number.isInteger(i) ? candidates[i] : undefined;
  if (picked === undefined) return fail("CHECKIN_INVALID_RANDOM");
  return ok(startRound(s, picked));
}

type NoRound = CheckinError<"CHECKIN_NO_ROUND">;

export function playCard(
  s: CheckinState,
  input: { participantId: string; seq: number; card: CardId },
): Result<
  CheckinState,
  CheckinError<"CHECKIN_NO_ROUND" | "CHECKIN_REVEALED" | "CHECKIN_SPECTATING" | "CHECKIN_CARD_UNKNOWN">
> {
  const r = s.round;
  if (r === null) return fail("CHECKIN_NO_ROUND");
  if (r.seq !== input.seq) return ok(s);
  if (r.status === "revealed") return fail("CHECKIN_REVEALED");
  if (s.spectators.has(input.participantId)) return fail("CHECKIN_SPECTATING");
  if (!METHODS[r.method].cards.includes(input.card)) return fail("CHECKIN_CARD_UNKNOWN");
  if (r.cards.get(input.participantId) === input.card) return ok(s);
  const cards = new Map(r.cards);
  cards.set(input.participantId, input.card);
  return ok({ ...s, round: { ...r, cards } });
}

/**
 * 公開の仕方を変える。その回に札が 1 枚でもある・開いた後なら変えられない（札が 0 枚で開いた後も）。
 * **変えたら回の seq を進める**（札は 0 枚なので失うものは無い）。前の公開の仕方を見て押した札
 * （古い seq）は `playCard` が無視するので、匿名のつもりで出した札が名前つきの回に入らない
 */
export function setVisibility(
  s: CheckinState,
  input: { seq: number; visibility: Visibility },
): Result<CheckinState, CheckinError<"CHECKIN_NO_ROUND" | "CHECKIN_VISIBILITY_LOCKED">> {
  const r = s.round;
  if (r === null) return fail("CHECKIN_NO_ROUND");
  if (r.seq !== input.seq) return ok(s);
  if (isVisibilityLocked(r)) return fail("CHECKIN_VISIBILITY_LOCKED");
  if (r.visibility === input.visibility) return ok(s);
  const seq = s.lastSeq + 1;
  return ok({ ...s, round: { ...r, seq, visibility: input.visibility }, lastSeq: seq });
}

/** 公開の仕方を変えられないか（札が 1 枚以上、または開いた後）。投影の `locked` も同じ条件 */
export function isVisibilityLocked(r: Round): boolean {
  return r.cards.size > 0 || r.status === "revealed";
}

export function reveal(s: CheckinState, input: { seq: number }): Result<CheckinState, NoRound> {
  const r = s.round;
  if (r === null) return fail("CHECKIN_NO_ROUND");
  if (r.seq !== input.seq || r.status === "revealed") return ok(s);
  return ok({ ...s, round: { ...r, status: "revealed" } });
}

/** 同じやり方の新しい回（公開の仕方は既定に戻り、札は空） */
export function playAgain(s: CheckinState, input: { seq: number }): Result<CheckinState, NoRound> {
  const r = s.round;
  if (r === null) return fail("CHECKIN_NO_ROUND");
  if (r.seq !== input.seq) return ok(s);
  return ok(startRound(s, r.method));
}

/**
 * 見学へ移る／戻る。poker の `setSpectator` と同じ規則 ——
 * 開く前に見学へ移ると出した札を捨てる。開いた後は見えている結果を動かさない。
 */
export function setSpectator(s: CheckinState, participantId: string, spectator: boolean): CheckinState {
  if (s.spectators.has(participantId) === spectator) return s;
  const spectators = new Set(s.spectators);
  if (!spectator) {
    spectators.delete(participantId);
    return { ...s, spectators };
  }
  spectators.add(participantId);
  const r = s.round;
  if (r === null || r.status !== "open" || !r.cards.has(participantId)) return { ...s, spectators };
  const cards = new Map(r.cards);
  cards.delete(participantId);
  return { ...s, spectators, round: { ...r, cards } };
}

/**
 * 名簿に居ない人の札と見学を落とす。何も落ちなければ同じ参照。status は変えない（自動公開は別に判定する）。
 * **開いた回の札は落とさない（結果を凍らせる）。** 落とすと、前後 2 枚のフレームの山の差で、抜けた人の札が分かる（匿名の漏れ）
 */
export function prune(s: CheckinState, knownIds: ReadonlySet<string>): CheckinState {
  const r = s.round;
  const isFrozen = r === null || r.status === "revealed";
  const staleCards = isFrozen ? [] : [...r.cards.keys()].filter((id) => !knownIds.has(id));
  const staleSpectators = [...s.spectators].filter((id) => !knownIds.has(id));
  if (staleCards.length === 0 && staleSpectators.length === 0) return s;
  const spectators = new Set([...s.spectators].filter((id) => knownIds.has(id)));
  if (r === null || staleCards.length === 0) return { ...s, spectators };
  const cards = new Map([...r.cards].filter(([id]) => knownIds.has(id)));
  return { ...s, spectators, round: { ...r, cards } };
}

/**
 * open で、札を出す人が 1 人以上かつ全員が札を持つときだけ開く（0 人では開かない）。
 * `players` に見学者が混じっていても、ここで除いてから数える（呼び手の取りこぼしで開かなくならないように）。
 */
export function applyAutoReveal(s: CheckinState, players: readonly string[]): CheckinState {
  const r = s.round;
  if (r === null || r.status !== "open") return s;
  const counted = players.filter((id) => !s.spectators.has(id));
  if (counted.length === 0 || !counted.every((id) => r.cards.has(id))) return s;
  return { ...s, round: { ...r, status: "revealed" } };
}

/**
 * 名前つきで開いた回に、札を持つ人の表示名を写す（後で名簿から外れても、山の names から消えないように）。
 * 匿名の回には写さない（サーバーの中でも名前と札を結びつけない）。足すものが無ければ同じ参照。
 * 開く遷移（`reveal`・`applyAutoReveal`）の後に呼ぶ。
 */
export function recordRevealedNames(s: CheckinState, seats: readonly Pick<SeatInput, "id" | "name">[]): CheckinState {
  const r = s.round;
  if (r === null || r.status !== "revealed" || r.visibility !== "named") return s;
  const missing = seats.filter((x) => r.cards.has(x.id) && r.names?.has(x.id) !== true);
  if (missing.length === 0) return s;
  const names = new Map(r.names ?? []);
  for (const x of missing) names.set(x.id, x.name);
  return { ...s, round: { ...r, names } };
}
