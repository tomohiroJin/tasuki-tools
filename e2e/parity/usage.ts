/**
 * 規則の使用状況（E8・#321・設計正本 §5.5・計画 P4）。ブランチの側のページで CDP の規則の使用状況を取り、当たった規則の鍵を返す。
 * 返るのは**当たった規則だけ**なので、分母はソースから数える（`usage-summary.ts`）。「当たった」はセレクタが一致したことで、
 * 宣言が勝ったことではない（効いているかは比較と除去検査が見る）。
 */
import type { CDPSession, Page } from '@playwright/test';
import { liveTimerSheet, resolveUsedKeys, type SheetHeader } from './usage-summary';

export interface RuleUsageSession {
  readonly cdp: CDPSession;
  /** 追加されたシートの id と `sourceURL`（前の文書の分も残る。止めるときに生きているものへ絞る・`liveTimerSheet`）。 */
  readonly sheets: SheetHeader[];
}

interface RuleUsage {
  readonly styleSheetId: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly used: boolean;
}

/**
 * 追跡を始める。**ページを開いた直後（最初の遷移より前）に呼ぶ**: 追跡を始める前に読み込まれた `<link>` のシートは、
 * その後に再計算が起きても当たりが返らない（素の Chromium で実測・2026-10-03。`<style>` の中の規則は返る）。
 *
 * **`CSS.enable` より前に `CSS.styleSheetAdded` を購読する**（enable が既存のシートの分を通知するので、後から購読すると
 * 取りこぼす）。遷移・再読み込みでは `styleSheetRemoved` が来ず、新しい id で追加し直される。前の文書のシートの当たりは
 * 返らない（実測）。控えは空にせず全部持ち、止めるときに「いま読めるシート」へ絞る（`usage-summary.ts` の `liveTimerSheet`）。
 * `DOM.documentUpdated` で空にする形は、2 度目の `documentUpdated` が新しいシートの追加より後に届くと、いまのシートまで
 * 消して間欠的に止まった（2026-10-04 実測）。
 *
 * 状態を作る途中の画面の当たりも数える（README の E8 の限界）。目印の時点で `CSS.takeCoverageDelta` を呼んで捨てる形は使えない:
 * delta で一度返した規則は、その後に当たり続けても当て直しても stop で二度と返らない（素の Chromium で実測・2026-10-03）。
 */
export async function startRuleUsage(page: Page): Promise<RuleUsageSession> {
  const cdp = await page.context().newCDPSession(page);
  const sheets: SheetHeader[] = [];
  cdp.on('CSS.styleSheetAdded', (e) => sheets.push({ styleSheetId: e.header.styleSheetId, sourceURL: e.header.sourceURL }));
  cdp.on('CSS.styleSheetRemoved', (e) => {
    const i = sheets.findIndex((h) => h.styleSheetId === e.styleSheetId);
    if (i >= 0) sheets.splice(i, 1);
  });
  // CSS のドメインは DOM のドメインを有効にしてからでないと有効にできない
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  await cdp.send('CSS.startRuleUsageTracking');
  return { cdp, sheets };
}

/**
 * 当たった規則の鍵（重複なし・整列）。
 *
 * **数えるのは timer のビルドの CSS（`/timer/assets/*.css`）のシートの当たりだけ**（`usage-summary.ts` の `liveTimerSheet`。
 * 止めた時点で生きているものがちょうど 1 本でなければ止める）。撮影の `style` や `animations: 'disabled'` が差し込む
 * 一時の `<style>`・共通の部品層などの別のシートで同じ鍵が当たっても、ソースの規則に当たったとは数えない。別のシートの当たりは引き当てもせず捨てる
 * （取り除かれた一時のシートの id で `getStyleSheetText` が失敗して全体が落ちないように）。
 *
 * **引き当ては等号**: CDP の `startOffset` は規則のセレクタの先頭で、postcss の `rule.source.start.offset` と一致する
 * （素の Chromium に `<style>` を置いて実測した・2026-10-03。`@media` / `@layer` の中の規則・空白の多いセレクタでも同じ）。
 * 包含で引くと、CSS の入れ子の外側の規則まで拾うので使わない（入れ子では外側も内側もそれぞれ自分の先頭で返る）。
 *
 * CDP は条件つきの at-rule（`@media` / `@layer` など）も「当たった」として返す。その `startOffset` は `@` ではなく条件の
 * 先頭（`@media (width >= 1px){` なら `(`）。**これは規則ではないので数えずに読み飛ばす**（実測）。`@keyframes` と
 * `@font-face` は返らなかった。規則の中の入れ子の at-rule の中の宣言と、その後ろに続く宣言は、暗黙の規則
 * （CSSNestedDeclarations）として塊の最初の宣言の先頭で返る。**これは最も近い祖先の規則の鍵として数える**（2026-10-04 実測）。
 * 引き当ての本体は `usage-summary.ts` の `resolveUsedKeys`。**どれにも引き当てられない当たりがあれば止める**（オフセットの
 * 食い違いで当たりが黙って落ちると、当たった規則を「当たらなかった」と読み違える）。
 */
export async function stopRuleUsage(session: RuleUsageSession): Promise<string[]> {
  const { cdp } = session;
  const { ruleUsage } = (await cdp.send('CSS.stopRuleUsageTracking')) as { ruleUsage: RuleUsage[] };
  const target = await liveTimerSheet(session.sheets, async (styleSheetId) => {
    const { text } = await cdp.send('CSS.getStyleSheetText', { styleSheetId });
    return text;
  });
  const offsets = ruleUsage.filter((u) => u.used && u.styleSheetId === target.styleSheetId).map((u) => u.startOffset);
  const { keys, unmatched } = resolveUsedKeys(target.text, offsets);
  await cdp.detach();
  if (unmatched.length > 0) {
    throw new Error(`規則の使用状況の当たりを規則へ引き当てられない: ${unmatched.map((o) => `${target.styleSheetId}@${o}`).join(', ')}`);
  }
  return keys;
}
