/**
 * ハブの受信フレームの見分けと、エラーの扱いの決め方（#595・`use-hub-sync.ts` から分けた）。
 *
 * どちらも副作用の無い純粋な判断である（`docs/adr/0015` MUST 1）。保管庫・URL・接続を触る
 * 実行は `use-hub-sync.ts` が受け持つ。
 */
import { parseBoundaryMessage } from '@tasuki/protocol';
import { HubServerMsgSchema, type HubServerMsg } from '@tasuki/room-core';
import type { JoinErrorPlan } from '@tasuki/sync-client';
import { TopicFrameSchema } from '@tasuki/topic-core';

/** 受信した 1 通の分類。 */
export type HubFrame =
  | { readonly kind: 'topic'; readonly title: string | null }
  | { readonly kind: 'hub'; readonly msg: HubServerMsg }
  | { readonly kind: 'drop' };

/**
 * 受信した生のテキストを分類する（**境界の検証**・原則 IV）。
 *
 * お題の状態（spec T3）はハブの言葉ではないので、ハブのスキーマより先に topic-core の
 * スキーマで見分ける（見分けるのはアプリ層・spec §5.5）。契約に合わないフレームは**捨てる** ——
 * 画面の状態を壊すより、更新されないほうが害が小さい。
 */
export function classifyHubFrame(raw: string): HubFrame {
  const topic = parseBoundaryMessage(TopicFrameSchema, raw);
  if (topic.isOk()) return { kind: 'topic', title: topic.value.state.topic?.title ?? null };
  const parsed = parseBoundaryMessage(HubServerMsgSchema, raw);
  if (parsed.isErr()) return { kind: 'drop' };
  return { kind: 'hub', msg: parsed.value };
}

/** エラーを受けたときの次の一手。 */
export type HubErrorIntent =
  /** 抜けた・外された。組を捨てて接続を畳み、理由を持って玄関へ戻る（#427）。 */
  | { readonly kind: 'leave'; readonly target: string; readonly reason: 'self' | 'removed' }
  /** 合言葉の入力を求める。 */
  | { readonly kind: 'passphrase'; readonly message: string }
  /** 混雑で弾かれた。操作なしで試み直す（#147）。 */
  | { readonly kind: 'rate-limited'; readonly message: string }
  /** ルームが見つからない。保存済みの組を捨てて不在の画面へ（#274）。 */
  | { readonly kind: 'gone'; readonly target: string }
  /** 何もしない。 */
  | { readonly kind: 'ignore' }
  /** 文言をそのまま見せる。 */
  | { readonly kind: 'show'; readonly message: string };

export interface HubErrorContext {
  /** いま映しているルーム（作成で進む）。 */
  readonly currentCode: string | null;
  /** ページ読み込みの時点で URL にあったルーム（以後変わらない）。 */
  readonly initialCode: string | null;
}

/**
 * サーバーのエラーから、次の一手を決める。
 *
 * 判断の元は他のツールと同じ `planForJoinError`（`REMOVED_BY_HOST` も同じ扱い）。
 * **同期クライアントの値は読まない**（`docs/adr/0015`・原則 VI）ので、その結果（{@link JoinErrorPlan}）は
 * 同期フックが呼んで渡す。
 * 「どのエラーでも復帰の待ちを終わらせる」は呼ぶ側の仕事で、この関数の結果に依らない。
 */
export function planHubError(
  err: { readonly code: string; readonly message: string },
  plan: JoinErrorPlan,
  { currentCode, initialCode }: HubErrorContext,
): HubErrorIntent {
  if (plan.kind === 'left') {
    return currentCode === null ? { kind: 'ignore' } : { kind: 'leave', target: currentCode, reason: plan.reason };
  }
  if (err.code === 'PASSPHRASE_REQUIRED' || err.code === 'PASSPHRASE_MISMATCH') {
    return { kind: 'passphrase', message: err.message };
  }
  if (err.code === 'JOIN_RATE_LIMITED') return { kind: 'rate-limited', message: err.message };
  if (err.code === 'ROOM_NOT_FOUND' && currentCode !== null) {
    // **作成でルームが進んだ後は、URL 由来の古いコードの不在で新しいルームを巻き添えに
    // しない**（#290）。作成後は currentCode が新しいコードを指す一方、尋ねた相手は古い
    // initialCode のままなので、食い違うときは新しいルームの復帰の組を消してはいけない。
    if (currentCode !== initialCode) return { kind: 'ignore' };
    return { kind: 'gone', target: currentCode };
  }
  return { kind: 'show', message: err.message };
}
