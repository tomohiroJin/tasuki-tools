/**
 * WebSocket の受信フレームを集めて中身を調べる。
 *
 * **なぜ DOM だけでは足りないか。** サーバーが投票中に他人の票を余剰フィールドで
 * 配信しても、**UI がそれを参照しないので DOM には絶対に現れない**。
 * 秘匿を DOM だけで判定すると、設計自身が「落ちるべき」と挙げた壊し方を
 * 検出できない。ここはブラウザ標準の経路を覗くだけなので、製品コードは触らない。
 */
import type { Page } from '@playwright/test';

/** 受信フレームの記録。配列は監視中ずっと同じ実体を差し続ける。 */
export interface FrameLog {
  readonly payloads: readonly string[];
}

/**
 * ページが開く WebSocket の受信フレームを集め始める。
 *
 * **`goto()` より前に呼ぶこと。** 後から呼ぶと最初のハンドシェイクと
 * 初回の `room-state` を取り逃す。
 */
export function watchWebSocketFrames(page: Page): FrameLog {
  const payloads: string[] = [];
  page.on('websocket', (socket) => {
    socket.on('framereceived', (frame) => {
      payloads.push(typeof frame.payload === 'string' ? frame.payload : frame.payload.toString());
    });
  });
  return { payloads };
}

/**
 * JSON として解釈できたフレームだけを受信順に返す。
 *
 * **WS の制御フレーム（ping / pong）はここに来ない。** Playwright の
 * `framereceived` が報告するのはテキスト／バイナリのデータフレームだけである
 * （実測: poker-sync のハートビートを 0.3 秒間隔にして ping を 6 回送らせても、
 * 受信フレーム数は増えなかった）。したがって呼び出し側は
 * 「受け取ったフレームは全部 JSON である」ことを前提にしてよい。
 */
export function parseFrames(payloads: readonly string[]): unknown[] {
  const parsed: unknown[] = [];
  for (const payload of payloads) {
    try {
      parsed.push(JSON.parse(payload));
    } catch {
      // 制御用の非 JSON フレームは検査の対象外。落とさず読み飛ばす。
    }
  }
  return parsed;
}

/**
 * カードの種別。**単一情報源は `packages/poker-core/src/deck.ts` の `Card`**。
 * ここが実体とずれると検査が素通りするので、`e2e/tests/ws-frames.test.ts` が
 * deck.ts を読んで一致を機械的に固定している。
 */
export const CARD_KINDS = ['number', 'question', 'coffee'] as const;

export type CardKind = (typeof CARD_KINDS)[number];

/** フレームから拾ったカードらしきもの。protocol の `Card` と同じ形。 */
export interface CardLike {
  readonly kind: CardKind;
  readonly value?: unknown;
}

function isCardLike(value: unknown): value is CardLike {
  if (typeof value !== 'object' || value === null) return false;
  const kind: unknown = (value as { kind?: unknown }).kind;
  return typeof kind === 'string' && (CARD_KINDS as readonly string[]).includes(kind);
}

/**
 * 値の中に含まれるカードを、**位置を問わず**すべて集める。
 *
 * 場所を決め打ちしない（`round.votes` だけを見る等にしない）のが肝。
 * 漏洩は「本来無いはずの場所に生える」形で起きるので、
 * 決め打ちの検査では設計が挙げた壊し方をそのまま見逃す。
 */
export function collectCards(value: unknown): CardLike[] {
  const found: CardLike[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    if (isCardLike(node)) found.push(node);
    // カードの内側に更にカードが入ることは無いが、入れ子の可能性を残して走査は続ける。
    for (const item of Object.values(node)) visit(item);
  };
  visit(value);
  return found;
}

/** 落ちたときに「何が漏れたか」を読めるようにする。 */
export function describeCards(cards: readonly CardLike[]): string {
  return cards
    .map((card) => (card.kind === 'number' ? `number:${String(card.value)}` : card.kind))
    .join(', ');
}
