/**
 * ルーム画面の入口で何をするかの判断（#595。`hooks/useRoomEntry.ts` の効果から切り出した）。
 *
 * 効果は「いつ走るか」と「走って何をするか」の配線だけを持ち、**何をするかの分岐はここ**に置く。
 * 同期クライアントも React も読まない純粋な関数なので、分岐の網羅は単体テスト
 * （`tests/room-entry-plan.test.ts`）が安く見られ、配線は `tests/room-page-*.test.tsx` が見る。
 *
 * 待ち時間の決め方は `join-retry-plan.ts`（と同期フック側の `hooks/plan-join-retry.ts`）が持つ。
 * ここは待ち時間が出る前後の判断（入る・玄関へ送る・数え直す・入り直すか尋ねるか）だけを持つ。
 */

/** 消滅したルームを受けたときのエラーコード。 */
export const ROOM_NOT_FOUND_CODE = 'room-not-found';
/** 混雑で弾かれたときのエラーコード。 */
export const RATE_LIMITED_CODE = 'rate-limited';

/** 保存済みの名乗りのうち、入り直しに使う部分。 */
export interface StoredEntry {
  readonly displayName: string;
  readonly resumeToken?: string;
}

/**
 * 端末に同一性が無ければ玄関の参加画面へ送り返すかの判断。
 *
 * **1 回だけ決める。** 一度決めたら（`applied`）、あとは何もしない。
 * 守りが 1 つ要る: `room-not-found` の間は決めない。受けると保存を捨てるので、そのまま
 * 決めると**消滅の案内（戻る道つき）を出す前に玄関へ飛ぶ**。
 *
 * @param applied すでに決めたか
 * @param errorCode 同期の最後のエラーのコード（無ければ undefined）
 * @param hasIdentity 端末に名乗りがあるか（決める場合にだけ呼ぶ）
 * @returns 決めた後の `applied` と、玄関へ送るか
 */
export function decideEntryRedirect(
  applied: boolean,
  errorCode: string | null | undefined,
  hasIdentity: () => boolean,
): { readonly applied: boolean; readonly redirect: boolean } {
  if (applied) return { applied, redirect: false };
  if (errorCode === ROOM_NOT_FOUND_CODE) return { applied, redirect: false };
  return { applied: true, redirect: !hasIdentity() };
}

export interface AutoRejoinInput {
  readonly status: string;
  /** この接続で、すでに入り直しを試みたか。 */
  readonly attempted: boolean;
  readonly joinedThisConnection: boolean;
  readonly errorCode: string | null | undefined;
  /** 保存済みの名乗り（試みる場合にだけ呼ぶ）。 */
  readonly stored: () => StoredEntry | null;
}

export interface AutoRejoinDecision {
  /** 判断の後の「試みた」。 */
  readonly attempted: boolean;
  /** 入り直すなら、使う名前と復帰のトークン。 */
  readonly join: StoredEntry | null;
}

/**
 * 保存済みの組での自動復帰（US4 / FR-013）。接続が開くたびに 1 回だけ試みる。
 *
 * - 接続が開いていなければ、次の接続のために「試みた」を戻す
 * - 試みた・この接続で入室済みなら何もしない（**切断前の古い snapshot では判定しない**）
 * - 消滅したルームへは再試行しない
 * - 保存が無ければ何もしない（名乗っていない人は入口の判断が玄関へ送る）
 */
export function decideAutoRejoin(input: AutoRejoinInput): AutoRejoinDecision {
  const { status, attempted, joinedThisConnection, errorCode, stored } = input;
  if (status !== 'open') return { attempted: false, join: null };
  if (attempted || joinedThisConnection) return { attempted, join: null };
  if (errorCode === ROOM_NOT_FOUND_CODE) return { attempted, join: null };
  const identity = stored();
  if (!identity) return { attempted, join: null };
  return { attempted: true, join: identity };
}

export interface RetryResetInput {
  readonly joinedThisConnection: boolean;
  readonly wasJoinedThisConnection: boolean;
  readonly isOpen: boolean;
  readonly wasOpen: boolean;
}

/**
 * 混雑の入り直しの試行を数え直すか。
 *
 * - 入室できたら数え直す
 * - **接続し直したら数え直す。** 前の接続で諦めていても、新しい接続では改めて試みてよい
 *   （timer 側の handleReconnected と揃える）
 */
export function shouldResetRetry(input: RetryResetInput): boolean {
  const joinedNow = input.joinedThisConnection && !input.wasJoinedThisConnection;
  const reopened = input.isOpen && !input.wasOpen;
  return joinedNow || reopened;
}

/** 消滅したルームのトークンを捨てるか（再試行ループ防止）。 */
export function shouldForgetIdentity(errorCode: string | null | undefined): boolean {
  return errorCode === ROOM_NOT_FOUND_CODE;
}

/** 混雑で弾かれたか（弾かれた回だけ入り直しを計画する）。 */
export function isRateLimited(errorCode: string | null | undefined): boolean {
  return errorCode === RATE_LIMITED_CODE;
}

export type RetryAction =
  | { readonly kind: 'join'; readonly displayName: string; readonly resumeToken: string | undefined }
  | { readonly kind: 'check' };

/**
 * 待ったあとに送るもの。名前があれば入り直す。無ければルームの生死だけを尋ね直す（#76 J-1 と同じ扱い）。
 *
 * **名前の有無は、待つ前に決めた値で見る。** 待っている間に保存が変わっても、
 * 案内が言ったこと（「入り直しています」か否か）と送るものを揃える。
 */
export function decideRetryAction(name: string | null, resumeToken: string | undefined): RetryAction {
  if (name !== null) return { kind: 'join', displayName: name, resumeToken };
  return { kind: 'check' };
}
