/**
 * 規則の使用状況（E8・#321・設計正本 §5.5・計画 P4）。ブランチの側のページで CDP の規則の使用状況を取り、当たった規則の鍵を返す。
 * 返るのは**当たった規則だけ**なので、分母はソースから数える（`usage-summary.ts`）。「当たった」はセレクタが一致したことで、
 * 宣言が勝ったことではない（効いているかは比較と除去検査が見る）。
 */
import postcss from 'postcss';
import type { CDPSession, Page } from '@playwright/test';
import { ruleKey, timerSheetId } from './usage-summary';

export interface RuleUsageSession {
  readonly cdp: CDPSession;
  /** いまの文書に追加されたシートの id と `sourceURL`（遷移・再読み込みのたびに空にする）。 */
  readonly sheets: { styleSheetId: string; sourceURL: string }[];
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
 * 取りこぼす）。遷移・再読み込みでは `styleSheetRemoved` が来ず、`DOM.documentUpdated` の後に新しい id で追加し直される。
 * 前の文書のシートの当たりは返らない（実測）ので、`documentUpdated` で控えを空にし、いまの文書のシートだけを持つ。
 *
 * 状態を作る途中の画面の当たりも数える（README の E8 の限界）。目印の時点で `CSS.takeCoverageDelta` を呼んで捨てる形は使えない:
 * delta で一度返した規則は、その後に当たり続けても当て直しても stop で二度と返らない（素の Chromium で実測・2026-10-03）。
 */
export async function startRuleUsage(page: Page): Promise<RuleUsageSession> {
  const cdp = await page.context().newCDPSession(page);
  const sheets: { styleSheetId: string; sourceURL: string }[] = [];
  cdp.on('DOM.documentUpdated', () => {
    sheets.length = 0;
  });
  cdp.on('CSS.styleSheetAdded', (e) => sheets.push({ styleSheetId: e.header.styleSheetId, sourceURL: e.header.sourceURL }));
  cdp.on('CSS.styleSheetRemoved', (e) => {
    const i = sheets.findIndex((h) => h.styleSheetId === e.styleSheetId);
    if (i >= 0) sheets.splice(i, 1);
  });
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  await cdp.send('CSS.startRuleUsageTracking');
  return { cdp, sheets };
}

/** timer の CSS の、引き当ての表。`rules` は規則の始まり（セレクタの先頭）、`groups` は at-rule の条件の先頭。 */
interface SheetIndex {
  readonly rules: Map<number, postcss.Rule>;
  readonly groups: Set<number>;
}

async function indexSheet(cdp: CDPSession, styleSheetId: string): Promise<SheetIndex> {
  const { text } = await cdp.send('CSS.getStyleSheetText', { styleSheetId });
  const rules = new Map<number, postcss.Rule>();
  const groups = new Set<number>();
  postcss.parse(text).walk((node) => {
    const start = node.source?.start?.offset;
    if (start === undefined) return;
    if (node.type === 'rule') rules.set(start, node);
    // `@media (…) {` は `(` の位置で返る（`@` + 名前 + 名前の後の空白の後ろ）
    if (node.type === 'atrule') groups.add(start + 1 + node.name.length + (node.raws.afterName?.length ?? 0));
  });
  return { rules, groups };
}

/**
 * 当たった規則の鍵（重複なし・整列）。
 *
 * **数えるのは timer のビルドの CSS（`/timer/assets/*.css`）のシートの当たりだけ**（`usage-summary.ts` の `timerSheetId`。
 * 1 本でなければ止める）。撮影の `style` や `animations: 'disabled'` が差し込む一時の `<style>`・共通の部品層などの
 * 別のシートで同じ鍵が当たっても、ソースの規則に当たったとは数えない。別のシートの当たりは引き当てもせず捨てる
 * （取り除かれた一時のシートの id で `getStyleSheetText` が失敗して全体が落ちないように）。
 *
 * **引き当ては等号**: CDP の `startOffset` は規則のセレクタの先頭で、postcss の `rule.source.start.offset` と一致する
 * （素の Chromium に `<style>` を置いて実測した・2026-10-03。`@media` / `@layer` の中の規則・空白の多いセレクタでも同じ）。
 * 包含で引くと、CSS の入れ子の外側の規則まで拾うので使わない（入れ子では外側も内側もそれぞれ自分の先頭で返る）。
 *
 * CDP は条件つきの at-rule（`@media` / `@layer` など）も「当たった」として返す。その `startOffset` は `@` ではなく条件の
 * 先頭（`@media (width >= 1px){` なら `(`）。**これは規則ではないので数えずに読み飛ばす**（実測）。`@keyframes` と
 * `@font-face` は返らなかった。**どちらにも引き当てられない当たりがあれば止める**（オフセットの食い違いで当たりが黙って
 * 落ちると、当たった規則を「当たらなかった」と読み違える）。
 */
export async function stopRuleUsage(session: RuleUsageSession): Promise<string[]> {
  const { cdp } = session;
  const { ruleUsage } = (await cdp.send('CSS.stopRuleUsageTracking')) as { ruleUsage: RuleUsage[] };
  const target = timerSheetId(session.sheets);
  const sheet = await indexSheet(cdp, target);
  const keys = new Set<string>();
  const unmatched: string[] = [];
  for (const u of ruleUsage) {
    if (!u.used || u.styleSheetId !== target) continue;
    const rule = sheet.rules.get(u.startOffset);
    if (rule !== undefined) keys.add(ruleKey(rule));
    else if (!sheet.groups.has(u.startOffset)) unmatched.push(`${u.styleSheetId}@${u.startOffset}`);
  }
  await cdp.detach();
  if (unmatched.length > 0) throw new Error(`規則の使用状況の当たりを規則へ引き当てられない: ${unmatched.join(', ')}`);
  return [...keys].sort();
}
