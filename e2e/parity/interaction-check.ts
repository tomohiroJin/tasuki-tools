/**
 * チェックの状態の書き出し（#321・設計正本 §5.2 の「チェック」）。
 *
 * `role="switch"`・`input[type="checkbox"]`・`input[type="radio"]`・`[aria-pressed]` の要素を、**いまと逆の状態に切り替えて**
 * 部分木を書き出し、元に戻す。
 *
 * - 入のものを切にするには、スイッチ・チェックボックスはそれ自身を押す。ラジオと `aria-pressed` の組（交代間隔）は
 *   自身を押しても切にならないので、同じ組の別の要素を押す
 * - 戻すのは「切り替えで入から切になった要素」を押す（組なら元の選択、スイッチなら自身）。無ければ自身を押す
 * - **戻した後、文書のチェックの状態すべてと要素の数が切り替える前と同じであることを断定する。** ルームの設定
 *   （交代間隔・詳細設定）は同期サーバーへ送られてから画面に戻るので、落ち着くまで待つ
 * - 戻せない・送ると他の状態を壊す要素は {@link CHECK_EXCLUDED} に理由つきで置き、`skipped` に出す
 * - 押しても上限まで切り替わらない要素（同期を落とした状態のルームの設定）は、理由つきで `skipped` に出す
 *
 * 書き出した後のポインタとフォーカスは外す（押した要素の `:hover` / `:focus` を読みに持ち込まない）。
 */
import { expect, type Locator, type Page } from '@playwright/test';
import {
  captureSubtree,
  coverOf,
  finishTransitions,
  HOVER_TIMEOUT_MS,
  labelOf,
  moveAway,
  record,
  type InteractionCapture,
} from './interaction';

const CHECKS = '[role="switch"], input[type="checkbox"], input[type="radio"], [aria-pressed]';

/** 切り替わる・戻るまで待つ上限（同期サーバーの往復を含む）。 */
const SETTLE_TIMEOUT_MS = 10_000;

/**
 * 切り替えない要素（名前で指す）と理由。**いまは無い。**
 *
 * 「交代を音で知らせる」は、入にすると OS 通知の許可を求め、拒否されると戻せなかった。文脈に `notifications` の許可を
 * 与えて（`context.ts`）外した。足すときは、除外を外して流したときに戻らないことを実測してから、理由と一緒に書く。
 */
const CHECK_EXCLUDED: ReadonlyMap<string, string> = new Map();

/** 文書のチェックの状態すべてと要素の数（戻したことの断定に使う）。 */
function snapshotOf(page: Page): Promise<string> {
  return page.evaluate((selector) => {
    const states = Array.from(document.querySelectorAll(selector)).map((e) =>
      e instanceof HTMLInputElement ? String(e.checked) : `${e.getAttribute('aria-checked')}/${e.getAttribute('aria-pressed')}`,
    );
    return `${document.querySelectorAll('*').length}|${states.join(',')}`;
  }, CHECKS);
}

/** 要素がいま入か。 */
function isOn(el: Locator): Promise<boolean> {
  return el.evaluate((e) =>
    e instanceof HTMLInputElement
      ? e.checked
      : e.getAttribute('aria-checked') === 'true' || e.getAttribute('aria-pressed') === 'true',
  );
}

/** 上限まで待って、要素が `want` になったか。 */
async function becomes(el: Locator, want: boolean): Promise<boolean> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await isOn(el)) === want) return true;
    await el.page().waitForTimeout(POLL_INTERVAL_MS);
  }
  return (await isOn(el)) === want;
}

/** {@link becomes} の読み直しの間隔。 */
const POLL_INTERVAL_MS = 100;

/** 組（同じ名前のラジオ・同じ親の `aria-pressed`）の中で、`el` 以外の切の要素を 1 つ留める。無ければ false。 */
async function pinPartner(el: Locator, attr: string): Promise<boolean> {
  return el.evaluate((e, a) => {
    const partners =
      e instanceof HTMLInputElement && e.type === 'radio'
        ? Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${e.name}"]`))
        : Array.from(e.parentElement?.querySelectorAll('[aria-pressed]') ?? []);
    const partner = partners.find(
      (p) => p !== e && !(p instanceof HTMLInputElement ? p.checked : p.getAttribute('aria-pressed') === 'true'),
    );
    if (partner === undefined) return false;
    partner.setAttribute(a, '');
    return true;
  }, attr);
}

/** 切り替える前に入だった要素に付ける印（切り替えで要素が増減しても、位置ではなく印で見分ける）。 */
const WAS_ON = 'data-parity-was-on';

/**
 * 切り替える前に入だった要素へ印を付ける。
 *
 * **位置の番号で突き合わせない。** 「交代前にカウントダウン音を鳴らす」を入にすると方式のラジオが増え、以後の番号が
 * ずれて別の要素を戻そうとした（実測: 元の状態に戻らなかった）。
 */
async function markOn(page: Page): Promise<void> {
  await page.evaluate(
    ([selector, a]) => {
      for (const e of Array.from(document.querySelectorAll(selector))) {
        const on =
          e instanceof HTMLInputElement
            ? e.checked
            : e.getAttribute('aria-checked') === 'true' || e.getAttribute('aria-pressed') === 'true';
        if (on) e.setAttribute(a, '');
      }
    },
    [CHECKS, WAS_ON] as const,
  );
}

/** 印の付いた（入だった）要素のうち、いま切のものを留めて、印を外す。無ければ false。 */
async function pinTurnedOff(page: Page, attr: string): Promise<boolean> {
  return page.evaluate(
    ([a, was]) => {
      const marked = Array.from(document.querySelectorAll(`[${was}]`));
      for (const e of marked) e.removeAttribute(was);
      const off = marked.find((e) =>
        e instanceof HTMLInputElement
          ? !e.checked
          : e.getAttribute('aria-checked') !== 'true' && e.getAttribute('aria-pressed') !== 'true',
      );
      if (off === undefined) return false;
      off.setAttribute(a, '');
      return true;
    },
    [attr, WAS_ON] as const,
  );
}


const PIN = 'data-parity-check';
/** 切り替える対象の印。 */
const TARGET = 'data-parity-check-target';

/** 押す間だけ `mousedown` / `pointerdown` を止める仕掛けの置き場。 */
interface DownGuardWindow {
  __parityDownGuard?: (event: Event) => void;
}

/**
 * 押す間だけ、ページへ `mousedown` / `pointerdown` を届かせない（`click` と既定の動作は通す）。
 *
 * 通知設定のポップオーバー（`NotifySettings.tsx`）は外側の `mousedown` で閉じる。ポップオーバーの外のチェックの要素
 * （ロビーの交代間隔など）を押すと、切り替えと一緒に状態そのものが消える。切り替えは `click` で起きるので、押す事象だけを止める。
 */
async function clickWithoutDown(page: Page, target: Locator): Promise<void> {
  await page.evaluate(() => {
    const stop = (event: Event): void => event.stopImmediatePropagation();
    (window as unknown as DownGuardWindow).__parityDownGuard = stop;
    for (const t of ['pointerdown', 'mousedown']) window.addEventListener(t, stop, { capture: true });
  });
  try {
    await target.click({ timeout: HOVER_TIMEOUT_MS });
  } finally {
    await page.evaluate(() => {
      const w = window as unknown as DownGuardWindow;
      const stop = w.__parityDownGuard;
      if (stop === undefined) return;
      for (const t of ['pointerdown', 'mousedown']) window.removeEventListener(t, stop, { capture: true });
      delete w.__parityDownGuard;
    });
  }
}

/** 留めた要素を押して、留めを外す。 */
async function clickPinned(page: Page): Promise<void> {
  const pinned = page.locator(`[${PIN}]`);
  try {
    await clickWithoutDown(page, pinned);
  } finally {
    await page.evaluate((a) => document.querySelector(`[${a}]`)?.removeAttribute(a), PIN);
  }
}

/** 1 つの要素を切り替えて書き出し、戻す。 */
async function captureCheck(page: Page, el: Locator, label: string, out: InteractionCapture): Promise<void> {
  // 対象を印で留める。`nth` は切り替えで増えたチェックの要素（方式のラジオ）の分だけずれうる
  await el.evaluate((e, a) => e.setAttribute(a, ''), TARGET);
  try {
    await toggleAndRestore(page, page.locator(`[${TARGET}]`), label, out);
  } finally {
    await page.evaluate((a) => document.querySelector(`[${a}]`)?.removeAttribute(a), TARGET);
  }
}

async function toggleAndRestore(page: Page, el: Locator, label: string, out: InteractionCapture): Promise<void> {
  const before = await snapshotOf(page);
  const wasOn = await isOn(el);
  const isGroup = await el.evaluate((e) => (e instanceof HTMLInputElement && e.type === 'radio') || e.hasAttribute('aria-pressed'));

  // 切り替える
  await markOn(page);
  if (wasOn && isGroup) {
    if (!(await pinPartner(el, PIN))) {
      await page.evaluate((a) => {
        for (const e of Array.from(document.querySelectorAll(`[${a}]`))) e.removeAttribute(a);
      }, WAS_ON);
      out.skipped.push(`check: ${label}（組に切の相手が無く、切にできない）`);
      return;
    }
    await clickPinned(page);
  } else {
    await clickWithoutDown(page, el);
  }
  await moveAway(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  // 読む（切り替わったことを読む前と後で確かめる）
  if (!(await becomes(el, !wasOn))) {
    // **切り替わらない状態がある。** ルームの設定（交代間隔・詳細設定）は同期サーバーの往復で画面に戻るので、
    // 同期を落とした状態（banner-warn-reconnecting）では押しても変わらない（対照実行で実測）。利用者の画面でも同じ。
    // 例外にせず理由つきで外す。`skipped` は両側で突き合わせるので、片側だけ切り替わらなければ差として赤になる
    await page.evaluate((a) => {
      for (const e of Array.from(document.querySelectorAll(`[${a}]`))) e.removeAttribute(a);
    }, WAS_ON);
    out.skipped.push(`check: ${label}（押しても切り替わらない）`);
    await expect
      .poll(() => snapshotOf(page), { message: `${label} を押した後、元の状態に戻らない`, timeout: SETTLE_TIMEOUT_MS })
      .toBe(before);
    return;
  }
  await finishTransitions(page);
  const entries = await captureSubtree(el);
  if ((await isOn(el)) === !wasOn) record(out, wasOn ? 'unchecked' : 'checked', entries);
  else out.notEntered.push(`check: ${label}（読む間に元へ戻った）`);

  // 戻す
  if (!(await pinTurnedOff(page, PIN))) {
    await el.evaluate((e, a) => e.setAttribute(a, ''), PIN);
  }
  await clickPinned(page);
  await moveAway(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect
    .poll(() => snapshotOf(page), { message: `${label} を切り替えた後、元の状態に戻らない`, timeout: SETTLE_TIMEOUT_MS })
    .toBe(before);
  await finishTransitions(page);
}

/** チェックの要素をすべて切り替えて書き出す。**戻せなかったら、以後の読みが別の状態になるので例外にする。** */
export async function captureChecks(page: Page, out: InteractionCapture): Promise<void> {
  const checks = page.locator(CHECKS).filter({ visible: true });
  const count = await checks.count();
  for (let i = 0; i < count; i += 1) {
    const el = checks.nth(i);
    const label = await labelOf(el);
    const excluded = CHECK_EXCLUDED.get(label);
    if (excluded !== undefined) {
      out.skipped.push(`check: ${label}（${excluded}）`);
      continue;
    }
    const cover = await coverOf(el);
    if (cover !== null) {
      out.skipped.push(`check: ${label}（覆われている: ${cover}）`);
      continue;
    }
    if (!(await el.isEnabled())) {
      out.skipped.push(`check: ${label}（無効）`);
      continue;
    }
    await captureCheck(page, el, label, out);
    const now = await checks.count();
    if (now !== count) throw new Error(`「${label}」を戻した後にチェックの要素の数が ${count} から ${now} へ変わった`);
  }
}
