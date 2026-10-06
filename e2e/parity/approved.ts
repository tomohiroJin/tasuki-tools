/**
 * 利用者が個別に承認した差の名指し（#321・設計正本 §5.1・§5.4）。
 *
 * **利用者が個別に承認した差だけを書く。** 対照実行の揺れは `noise.ts`。
 * 1 件ずつ理由と承認日を書き、台帳（`docs/superpowers/specs/2026-09-29-timer-without-tailwind-parity-ledger.md`
 * の「利用者が個別に承認した差」）と対応させる。
 * 道筋は完全一致の正規表現でその要素だけに絞り、プロパティも名指しする（`.*` で広げない）。
 */
import type { IgnoreRule } from './compare-lib';

/** ルートの `html` 要素（`capture.ts` の `pathOf` は親の無い要素にタグ名だけを返す）。 */
const ROOT_HTML = /^html$/;

export const APPROVED: readonly IgnoreRule[] = [
  {
    path: ROOT_HTML,
    prop: /^--shadow-(panel|dialog|crown)$/,
    reason:
      'トークン層に新しく足したトークン（Card の落ち影・確認ダイアログの落ち影）。基準には無い。' +
      '利用者が 2026-10-04 に個別に承認した（台帳）。使う側の box-shadow は比べ続ける。' +
      '`--shadow-crown`（王冠の落ち影）は利用者が 2026-10-05 に承認した',
  },
];
