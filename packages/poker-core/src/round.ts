// 投票ラウンド（data-model「Round 状態機械」）。**#95 S4a で Round が集約ルートになった。**
//
// 名簿（誰が居るか・接続中か）は `@tasuki/room-core` が持ち、ここには持ち込まない。
// voting → revealed の遷移と投票操作。すべて純関数 + Result 型（憲法原則 IV）
import { err, ok, type Result } from 'neverthrow';
import type { Card, NumberCardValue } from './deck.js';
import {
  EMPTY_ESTIMATE_LOG,
  closeOpenGroup,
  recordReveal,
  setGroupItem,
  setGroupPoints,
  type EstimateLog,
} from './estimate-log.js';
import {
  dealGame,
  dropPlayer,
  exchangeCards,
  revealIfReady,
  type CardGame,
  type GameError,
  type RandomInt,
} from './card-game.js';

export interface Round {
  status: 'voting' | 'revealed';
  /** participantId → 選択カード */
  votes: Map<string, Card>;
  /** いま見積もっているアイテム名（空なら未設定）。長さの上限は境界が見る */
  item: string;
  /** 開票ごとの記録（#93） */
  log: EstimateLog;
  /** 開票を記録に足すか（#427）。既定は足さない。切り替えは {@link setRecording} */
  recording: boolean;
  /** 見学中の参加者 ID（#419）。票を持たず、自動公開の分母にも入らない */
  spectators: ReadonlySet<string>;
  /**
   * 隠しモードの入口の構え（#403 E-1〜E-3）。全員 ☕ の開票が 1 回あり、まだゲームが始まっていない。
   * 再投票では残し、次のアイテムへ・全員 ☕ でない開票で解く
   */
  coffeeArmed: boolean;
  /** 隠しモードのゲーム（#403）。無ければ見積もりだけ。ある間は見積もりの投票系の操作を拒む（G-11） */
  game: CardGame | null;
}

export type RoundError =
  | { code: 'not-voting'; op: 'vote' | 'reveal' }
  | { code: 'spectating'; op: 'vote' }
  | { code: 'not-revealed'; op: 'revote' | 'next-item' }
  | { code: 'estimate-not-found' }
  | { code: 'estimate-open' }
  | GameError;

/**
 * 名簿の断片（自動公開の判定に要るぶんだけ）。
 *
 * **`@tasuki/room-core` を import しない。** 依存方向の許可表
 * （`scripts/audit-dependency-direction.mjs`）は `packages/poker-core` に
 * `["@tasuki/protocol"]` しか許していない（設計正本 D2）。構造的部分型で受けるので、
 * 呼び出し側は room-core の `Participant` から必要な 2 つを写して渡せばよい。
 *
 * `connected` は room-core の `presence !== "offline"` に対応する（アプリ層が変換する）。
 *
 * **`snapshot.ts` の `ParticipantFragment` はこれを継承した上位集合である**
 * （＝名簿の断片の定義はこの 1 つで、こちらが最小面）。アプリ層は両方へ
 * `ParticipantFragment[]` を渡してよい。
 */
export interface VoterView {
  id: string;
  connected: boolean;
}

/** 新しいラウンド（voting・票なし）。ルーム作成時にアプリ層が呼ぶ（FR-001）。 */
export function createRound(): Round {
  return {
    status: 'voting',
    votes: new Map(),
    item: '',
    log: EMPTY_ESTIMATE_LOG,
    recording: false,
    spectators: new Set(),
    coffeeArmed: false,
    game: null,
  };
}

/** 投票（公開前は上書き可。FR-005〜007） */
export function castVote(round: Round, voterId: string, card: Card): Result<Round, RoundError> {
  if (round.game !== null) return err({ code: 'table-in-play' });
  if (round.status !== 'voting') {
    return err({ code: 'not-voting', op: 'vote' });
  }
  if (round.spectators.has(voterId)) {
    return err({ code: 'spectating', op: 'vote' });
  }
  const votes = new Map(round.votes);
  votes.set(voterId, card);
  return ok({ ...round, votes });
}

/**
 * 自動公開の判定: 接続中の在室者（途中参加者を含む）が全員投票済み（FR-008, Clarification Q3）。
 *
 * 分母は接続中かつ見学でない人。見学はラウンドが持つので `VoterView` には足さない
 * （名簿の断片へ写すと、写し忘れたテストが恒真になる）。
 *
 * **投票者が 0 人なら立たない。** `every` は空集合で真になるので、この番人が無いと
 * 「名簿を渡し忘れた／空の名簿しか渡さない」テストが常に緑になる（設計正本 §6.4）。
 */
export function shouldAutoReveal(round: Round, voters: readonly VoterView[]): boolean {
  if (round.status !== 'voting') return false;
  const eligible = voters.filter((v) => v.connected && !round.spectators.has(v.id));
  return eligible.length > 0 && eligible.every((v) => round.votes.has(v.id));
}

/** 条件成立時のみ revealed へ遷移させる（不成立ならそのまま返す） */
export function applyAutoReveal(round: Round, voters: readonly VoterView[], now: number): Round {
  if (!shouldAutoReveal(round, voters)) return round;
  return revealed(round, now);
}

/**
 * revealed へ移し、記録する間で票が 1 枚以上あればその時点の item と票の枚数を記録へ 1 行足す
 * （記録は公開の瞬間にだけ増える。手動・自動の開票はどちらもここを通る）
 */
function revealed(round: Round, now: number): Round {
  // 票が 0 枚の開票は行にしない（空の行と、あとで「ポイントなし」で閉じる空の束が残るだけ）。開票自体は行う
  const log =
    !round.recording || round.votes.size === 0
      ? round.log
      : recordReveal(round.log, round.item, [...round.votes.values()], now);
  return { ...round, status: 'revealed', log };
}

/**
 * 手動公開（FR-009）。
 *
 * #95 S3 で役割とホストを廃止したため、在室者なら誰でも実行できる。
 * **在室確認はしない** —— 在室性は接続の束縛が担保する既存設計であり、
 * 在席（設計正本 D14・D21）で見直すのは S4b（#246）である（S4a では振る舞いを変えない）。
 * `actorId` は呼び出し元が `RoomAction`（`(round, participantId) => Result<Round, RoundError>`。
 * 実体は `apps/tasuki-sync/src/application/poker-commit-room-action.ts`）として渡す都合上、
 * 引数の形を保つためだけに残る。
 */
export function revealBy(round: Round, _actorId: string, now: number): Result<Round, RoundError> {
  if (round.game !== null) return err({ code: 'table-in-play' });
  if (round.status !== 'voting') {
    return err({ code: 'not-voting', op: 'reveal' });
  }
  return ok(revealed(round, now));
}

/**
 * 再投票（FR-011）。全票をリセットして voting に戻す。item と記録（open の束）は残す
 * —— 同じアイテムの 2 回目の開票が同じ束に足される。在室確認をしない理由は {@link revealBy} と同じ。
 */
export function revote(round: Round, _actorId: string): Result<Round, RoundError> {
  if (round.game !== null) return err({ code: 'table-in-play' });
  if (round.status !== 'revealed') {
    return err({ code: 'not-revealed', op: 'revote' });
  }
  return ok({ ...round, status: 'voting' as const, votes: new Map() });
}

/**
 * 次のアイテムへ（#93）。open の束を閉じて points を付け、item を空にして voting に戻す。
 * points が null なら「ポイントを付けずに次へ」。
 */
export function nextItem(
  round: Round,
  _actorId: string,
  points: NumberCardValue | null,
): Result<Round, RoundError> {
  if (round.game !== null) return err({ code: 'table-in-play' });
  if (round.status !== 'revealed') {
    return err({ code: 'not-revealed', op: 'next-item' });
  }
  return ok({
    ...round,
    status: 'voting' as const,
    votes: new Map(),
    item: '',
    // 次のアイテムへ進んだら入口の構えを解く（#403 E-3）
    coffeeArmed: false,
    log: closeOpenGroup(round.log, points),
  });
}

// 制御文字・書式文字（双方向制御を含む）・Default_Ignorable。room-core の display-name.ts はこれに
// NFKC とラベル記号の除去を足した、より厳しい兄弟（アイテム名にはそこまで要らない）
const INVISIBLE_CHARS = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;

/** アイテム名の整形（不可視文字の除去と前後の空白の削除）。{@link setItem} と {@link renameGroup} が共有する */
function cleanItem(item: string): string {
  return item.replace(INVISIBLE_CHARS, '').trim();
}

/**
 * アイテム名を設定する。不可視文字を除いて前後の空白を削る。長さの上限は境界（ワイヤの検証）が見る。
 * 開票後（revealed）は、いま見ている開票の行（束の最後の行）の名前にも写す —— 束の見出しが追う。
 * 投票中は log に触れない。閉じた束は変えない。
 */
export function setItem(round: Round, item: string): Round {
  const next = cleanItem(item);
  if (round.status !== 'revealed') return { ...round, item: next };
  const last = round.log.groups[round.log.groups.length - 1];
  const entry = last?.entries[last.entries.length - 1];
  if (!last?.open || !entry) return { ...round, item: next };
  const groups = [
    ...round.log.groups.slice(0, -1),
    { ...last, entries: [...last.entries.slice(0, -1), { ...entry, item: next }] },
  ];
  return { ...round, item: next, log: { ...round.log, groups } };
}

/** 閉じた束のポイントを直す（null で消す）。失敗は {@link setGroupPoints} のエラーをそのまま返す */
export function setPoints(
  round: Round,
  groupId: number,
  points: NumberCardValue | null,
): Result<Round, RoundError> {
  return setGroupPoints(round.log, groupId, points).map((log) => ({ ...round, log }));
}

/**
 * 閉じた束のアイテム名を直す（#427）。{@link setItem} と同じ整形を通す。
 * 失敗は {@link setGroupItem} のエラーをそのまま返す。
 */
export function renameGroup(round: Round, groupId: number, item: string): Result<Round, RoundError> {
  return setGroupItem(round.log, groupId, cleanItem(item)).map((log) => ({ ...round, log }));
}

/**
 * 記録する／しないを切り替える（#427）。同じ値への切り替えは入力と同じ値を返す。
 * 違えば open の束をポイントなしで閉じてから切り替える —— 切り替えをまたいで
 * 1 つの束に行が混ざらない（しない間の再投票が、しない前の束に足されない）。
 */
export function setRecording(round: Round, recording: boolean): Round {
  if (round.recording === recording) return round;
  return { ...round, recording, log: closeOpenGroup(round.log, null) };
}

/**
 * 見学へ移る／投票へ戻る（#419）。投票中に見学へ移ると票も捨てる。開票後は票を変えない
 * （見えている結果を動かさない）。同じ状態への切り替えは入力と同じ値を返す。
 * 投票へ戻った人は未投票から始まる。
 */
export function setSpectator(round: Round, participantId: string, spectator: boolean): Round {
  if (round.spectators.has(participantId) === spectator) return round;
  const spectators = new Set(round.spectators);
  if (!spectator) {
    spectators.delete(participantId);
    return { ...round, spectators };
  }
  spectators.add(participantId);
  if (round.status !== 'voting' || !round.votes.has(participantId)) return { ...round, spectators };
  const votes = new Map(round.votes);
  votes.delete(participantId);
  return { ...round, votes, spectators };
}

/**
 * 退出した人の票と見学を捨てる（R8・#419 S-11）。**#95 S5b で呼び出し元と一緒に戻した。**
 *
 * S4a でも一度実装したが、当時は**到達経路が無かった** —— 入口ごとの門により 1 つの
 * ルームは timer か poker のどちらか一方の状態しか持たず、名簿から人を消す
 * `participant.remove` は timer 専用コマンドだったからである。S5b で門を廃止し、
 * **1 つのルームが両ツールの状態を持てるようになった**ので経路が生まれた
 * （`apps/tasuki-sync/src/application/command-handlers/participant-remove.ts`）。
 *
 * 票を残すと、名簿に居ない人の票が公開時の集計へ混ざる。**status は変えない** ——
 * 捨てた結果で自動公開が立つかは `applyAutoReveal` が別に判定する（呼び出し側で続けて呼ぶ）。
 * 居ない人の ID を渡しても壊れない（何も起きない）。
 */
export function discardVote(round: Round, voterId: string): Round {
  const game = round.game === null ? null : dropPlayer(round.game, voterId);
  if (!round.votes.has(voterId) && !round.spectators.has(voterId) && game === round.game) return round;
  const votes = new Map(round.votes);
  votes.delete(voterId);
  const spectators = new Set(round.spectators);
  spectators.delete(voterId);
  // ゲームのプレイヤーからも外す（#403 G-8）。最後のプレイヤーが外れたら見積もりへ戻す
  if (round.game !== null && game === null) return { ...round, spectators, ...backToEstimate };
  return { ...round, votes, spectators, game };
}

/** 見積もりへ戻すときの差分（ゲームを消し、票の無い投票中へ・#403 G-10） */
const backToEstimate = {
  status: 'voting' as const,
  votes: new Map<string, Card>(),
  game: null,
  coffeeArmed: false,
};

/** 投票者（接続中で見学でない人）。`shouldAutoReveal` の分母と同じ集合 */
function eligibleVoters(round: Round, voters: readonly VoterView[]): VoterView[] {
  return voters.filter((v) => v.connected && !round.spectators.has(v.id));
}

/**
 * 操作のあとに必ず通す後処理（#403）。サーバーは開票・切断・退出のどの経路でもこれを呼ぶ。
 *
 * 1. 自動公開（{@link applyAutoReveal}）
 * 2. 入口の判定（E-1〜E-5）: この操作で開票が起きたとき、投票者の全員が ☕ なら、構えていれば配って始め、
 *    構えていなければ構える。全員 ☕ でなければ構えを解く
 * 3. ゲームの最中なら、接続中のプレイヤーが全員チェンジを済ませたかを見て開く（G-7）
 */
export function settleRound(
  before: Round,
  after: Round,
  voters: readonly VoterView[],
  now: number,
  randomInt: RandomInt,
): Round {
  let round = applyAutoReveal(after, voters, now);
  if (before.status === 'voting' && round.status === 'revealed' && round.game === null) {
    const eligible = eligibleVoters(round, voters);
    const allCoffee = eligible.length > 0 && eligible.every((v) => round.votes.get(v.id)?.kind === 'coffee');
    if (!allCoffee) round = { ...round, coffeeArmed: false };
    else if (!round.coffeeArmed) round = { ...round, coffeeArmed: true };
    else round = { ...round, coffeeArmed: false, game: dealGame(eligible.map((v) => v.id), randomInt) };
  }
  if (round.game !== null) {
    const connected = new Set(voters.filter((v) => v.connected).map((v) => v.id));
    const game = revealIfReady(round.game, (id) => connected.has(id));
    if (game !== round.game) round = { ...round, game };
  }
  return round;
}

/** チェンジ（#403 G-4〜G-6）。開くかどうかは {@link settleRound} が決める */
export function exchangeHand(
  round: Round,
  participantId: string,
  discard: readonly number[],
  randomInt: RandomInt,
): Result<Round, RoundError> {
  if (round.game === null) return err({ code: 'table-no-game' });
  return exchangeCards(round.game, participantId, discard, randomInt).map((game) => ({ ...round, game }));
}

/** 開いたあとのもう一度（#403 G-9）。いまの投票者で配り直す。投票者が居なければ見積もりへ戻す */
export function dealAgain(
  round: Round,
  _actorId: string,
  voters: readonly VoterView[],
  randomInt: RandomInt,
): Result<Round, RoundError> {
  if (round.game === null) return err({ code: 'table-no-game' });
  if (round.game.status !== 'shown') return err({ code: 'table-in-play' });
  const game = dealGame(eligibleVoters(round, voters).map((v) => v.id), randomInt);
  return ok(game === null ? { ...round, ...backToEstimate } : { ...round, game });
}

/** 見積もりに戻る（#403 G-10）。誰でも、ゲームの最中でも押せる */
export function closeGame(round: Round): Result<Round, RoundError> {
  if (round.game === null) return err({ code: 'table-no-game' });
  return ok({ ...round, ...backToEstimate });
}
