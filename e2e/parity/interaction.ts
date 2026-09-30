/**
 * 操作の状態の書き出し（#321・設計正本 §5.2）。**状態に入れたことを断定する**（入れなかった要素は `notEntered` に出す）。
 *
 * - ホバー: `locator.hover()` の後に `:hover` を確かめる
 * - 押下: `mouse.down()` → `:active` を確かめて書き出す → **要素の外へ動かしてから** `mouse.up()`（クリックを起こさない）
 * - フォーカス: Tab で順に送り、`:focus-visible` の要素を書き出す（キーボードで送るので `:focus-visible` の条件を満たす）
 *
 * **書き出す前に遷移を終える。** `reduce` の下でも 0.01ms の遷移は残り、ホバーや押下で始まった遷移の途中を読みうる
 * （`timer.parity.ts` の `settleAtWidth` と同じ理由）。
 *
 * 状態を変えずに入れない要素・入る必要の無い要素は、理由つきで `skipped` に出す（差にはしないが、両側で食い違えば
 * 呼ぶ側が差にする）。
 */
import type { Locator, Page } from '@playwright/test';
import { captureElement } from './capture';
import type { StyleEntry } from './compare-lib';

export interface InteractionCapture {
  readonly entries: StyleEntry[];
  /** 状態に入れなかった要素（`hover: <名前>` など）。空でなければ赤。 */
  readonly notEntered: string[];
  /** 理由があって状態に入れなかった要素（`active: <名前>（理由）`）。両側で同じなら差にしない。 */
  readonly skipped: string[];
}

const TARGETS = 'button, a[href], [role="tab"], input, textarea, select, [tabindex]:not([tabindex="-1"])';

/** ホバーの上限。覆いの下の要素は Playwright が待ち続けるので、既定（テストの上限）まで待たない。 */
const HOVER_TIMEOUT_MS = 5_000;

/**
 * 押すと値が変わる・一覧が開く要素（押下の書き出しから外す）。
 *
 * - `input[type="range"]`: 押した位置へつまみが跳び、外へ動かすとつまみを引きずる（値が変わり、`onChange` が走る）
 * - `select`: 押すと一覧が開く（開いた一覧は別の状態で、閉じる操作が要る）
 */
const PRESS_CHANGES_STATE = 'input[type="range"], select';

function tag(entries: readonly StyleEntry[], kind: string): StyleEntry[] {
  return entries.map((e) => ({ ...e, path: `${e.path}#${kind}` }));
}

/** 走っている CSS の遷移を、無くなるまで終わらせる（終えるたびに次が始まりうる）。 */
async function finishTransitions(page: Page): Promise<void> {
  for (let round = 0; round < 20; round += 1) {
    const running = await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll('*'))) void getComputedStyle(el).fontSize;
      const list = document.getAnimations().filter((a) => a instanceof CSSTransition);
      for (const transition of list) transition.finish();
      return list.length;
    });
    if (running === 0) return;
  }
  throw new Error('操作の後の CSS の遷移が終わらない');
}

/** 状態を読み直す回数の上限（読む間に状態が外れたとき）。 */
const CAPTURE_ATTEMPTS = 5;

/**
 * 要素が `pseudo` の状態にあることを**読む直前と直後の両方で**確かめて書き出す。外れていたら読み直す。
 *
 * **確かめてから読むまでの間に状態が外れうる。** 確認のダイアログのフォーカストラップ（`useFocusTrap`）は、残り時間の
 * 刻みの再描画のたびに取消ボタンへフォーカスを戻す（`states.ts` の `openDialogWithoutFocus`）。確かめた後・読む前に
 * 外れると、`:focus-visible` でない姿を読む（実測: session-end-confirm の確定ボタンの `outline-style` が片側だけ `none`）。
 */
async function captureInState(
  el: Locator,
  pseudo: string,
  restore?: () => Promise<void>,
): Promise<StyleEntry[] | null> {
  for (let attempt = 0; attempt < CAPTURE_ATTEMPTS; attempt += 1) {
    if (attempt > 0 && restore !== undefined) await restore();
    if (!(await el.evaluate((e, p) => e.matches(p), pseudo))) continue;
    const entries = await captureElement(el);
    if (await el.evaluate((e, p) => e.matches(p), pseudo)) return entries;
  }
  return null;
}

/** 報告で要素を見分ける名前（`aria-label`・中身の文字・タグの順）。 */
async function labelOf(el: Locator): Promise<string> {
  return el.evaluate((e) => {
    const aria = e.getAttribute('aria-label');
    if (aria !== null && aria !== '') return aria;
    const text = (e.textContent ?? '').trim().replace(/\s+/g, ' ');
    if (text !== '') return text.slice(0, 20);
    return e.outerHTML.slice(0, 60);
  });
}

/**
 * 要素の中心を覆っている別の要素（覆われていなければ null）。Playwright の `hover()` が当たりを確かめる点と同じ中心で見る。
 *
 * **覆いの下の要素は、利用者もホバーできない**（全画面の交代の知らせ `SwitchAlert` は画面全体を覆う・実測: session-switched で
 * 全要素の `hover()` が 5 秒の上限に達した）。覆いの下の要素は差にせず `skipped` に出す。覆われ方が両側で違えば、
 * 呼ぶ側が `skipped` の食い違いとして差にする。
 */
async function coverOf(el: Locator): Promise<string | null> {
  await el.scrollIntoViewIfNeeded({ timeout: HOVER_TIMEOUT_MS });
  return el.evaluate((e) => {
    const rect = e.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (hit === null || hit === e || e.contains(hit)) return null;
    // 覆いの名前は、役割か名前を持つ最も近い祖先で示す（報告で覆いを見分けるため）
    const named = hit.closest('[role], [aria-label]') ?? hit;
    const role = named.getAttribute('role') ?? named.tagName.toLowerCase();
    const name = named.getAttribute('aria-label') ?? '';
    return `${role}${name === '' ? '' : ` "${name}"`}`;
  });
}

/** ホバーして書き出す。ホバーの位置へ動かせたら true（`:hover` に入れたかは問わない）。 */
async function captureHover(page: Page, el: Locator, label: string, out: InteractionCapture): Promise<boolean> {
  const cover = await coverOf(el);
  if (cover !== null) {
    out.skipped.push(`hover: ${label}（覆われている: ${cover}）`);
    return false;
  }
  try {
    await el.hover({ timeout: HOVER_TIMEOUT_MS });
  } catch (error) {
    const first = (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
    out.notEntered.push(`hover: ${label}（${first}）`);
    return false;
  }
  await finishTransitions(page);
  // 外れたらホバーし直す。ホバーの後に配置が動くと、ポインタが要素の外に残る（実測: summary-abort で 4 秒で消える
  // 知らせの帯が消え、「新しいセッション」が上へ動いて片側だけ `:hover` から外れた）
  const entries = await captureInState(el, ':hover', async () => {
    await el.hover({ timeout: HOVER_TIMEOUT_MS });
    await finishTransitions(page);
  });
  if (entries !== null) out.entries.push(...tag(entries, 'hover'));
  else out.notEntered.push(`hover: ${label}`);
  return true;
}

/** 押下の間だけ、ページのポインタの事象の受け手を黙らせる仕掛けの置き場。 */
interface PressGuardWindow {
  __parityPressGuard?: (event: Event) => void;
}

/**
 * 押下の間だけ、ページへ押す・離す・クリックの事象を届かせない（`window` の捕捉の段で止める）。
 *
 * **押下は状態を覗くための操作で、ページに反応させるものではない。** 通知設定のポップオーバー（`NotifySettings.tsx`）は
 * 外側の `mousedown` で閉じるので、外側の要素を押すと状態そのものが消えた（実測: lobby-notify-open で目印が消え、
 * 以後の要素を待ち続けてテストの上限まで止まった）。`:active` はブラウザが入力の処理で立てるので、事象を止めても入る。
 *
 * **外へ動かしてから離しても `click` は起きる。** ブラウザは押した先と離した先の共通の祖先へ `click` を送る。確認の
 * ダイアログ（`ConfirmDialog.tsx`）は覆いの `onClick` で閉じるので、ダイアログの中のボタンを押して覆いの上で離すと、
 * 覆いへ `click` が届いてダイアログが閉じた（実測: session-remove-confirm で「キャンセル」の後に対象が 28 から 26 へ減った）。
 * そのため離す・クリックの事象も止める。
 */
async function guardPress(page: Page, on: boolean): Promise<void> {
  await page.evaluate((enable) => {
    const w = window as unknown as PressGuardWindow;
    const types = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'auxclick'];
    if (enable) {
      const stop = (event: Event): void => event.stopImmediatePropagation();
      w.__parityPressGuard = stop;
      for (const t of types) window.addEventListener(t, stop, { capture: true });
      return;
    }
    const stop = w.__parityPressGuard;
    if (stop === undefined) return;
    for (const t of types) window.removeEventListener(t, stop, { capture: true });
    delete w.__parityPressGuard;
  }, on);
}

/** ホバーした位置のまま押し、`:active` を読んでから、外へ動かして離す。 */
async function capturePress(page: Page, el: Locator, label: string, out: InteractionCapture): Promise<void> {
  if (await el.evaluate((e, s) => e.matches(s), PRESS_CHANGES_STATE)) {
    out.skipped.push(`active: ${label}（押すと値が変わるか一覧が開く）`);
    return;
  }
  if (!(await el.isEnabled())) {
    out.skipped.push(`active: ${label}（無効）`);
    return;
  }
  await guardPress(page, true);
  await page.mouse.down();
  try {
    await finishTransitions(page);
    // 外れたら押し直す。離すのは最初と同じく要素の外で行い、クリックを起こさない。
    // 確認のダイアログでは、フォーカストラップが刻みごとに取消ボタンへフォーカスを移し、押している確定ボタンの
    // `:active` が外れた（実測: session-remove-confirm の「退出させる」が両側で、session-end-confirm の確定が片側で入れなかった）
    const entries = await captureInState(el, ':active', async () => {
      await page.mouse.move(0, 0);
      await page.mouse.up();
      await el.hover({ timeout: HOVER_TIMEOUT_MS });
      await page.mouse.down();
      // 押し直しで始まった遷移（`active:scale-95` と `transition-all`）を終えてから読む（実測: 片側だけ `scale: 1` を読んだ）
      await finishTransitions(page);
    });
    if (entries !== null) out.entries.push(...tag(entries, 'active'));
    else out.notEntered.push(`active: ${label}`);
  } finally {
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await guardPress(page, false);
    // 押下で載ったフォーカス（マウスなので :focus-visible ではない）を外し、次の要素の読みへ持ち越さない
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  }
}

/** Tab で送った先の要素を留める属性（書き出しの前に外す。CSS はこの属性を見ない）。 */
const FOCUS_PIN = 'data-parity-focus';

/** 同じ要素を 2 度書き出さないための鍵（文書の中の位置）。 */
function pathKey(el: Element): string {
  const parts: string[] = [];
  for (let cur: Element | null = el; cur !== null; cur = cur.parentElement) {
    parts.unshift(`${cur.tagName}:${cur.parentElement === null ? 0 : Array.from(cur.parentElement.children).indexOf(cur)}`);
  }
  return parts.join('>');
}

/**
 * Tab で送り、`:focus-visible` の要素を書き出す。同じ要素は 1 度だけ（フォーカストラップの中では巡回する）。
 *
 * 送る回数の上限は対象の数の 2 倍＋5（開始点が文書の途中にあると、末尾で一度フォーカスが外れてから先頭へ戻る）。
 */
async function captureFocus(page: Page, limit: number, out: InteractionCapture): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const seen = new Set<string>();
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press('Tab');
    // `:focus` は引くたびに解き直すので、フォーカストラップが動かすと別の要素を指す。いまの要素を目印で留める
    const pinned = await page.evaluate((attr) => {
      const active = document.activeElement;
      if (active === null || active === document.body) return false;
      active.setAttribute(attr, '');
      return true;
    }, FOCUS_PIN);
    if (!pinned) continue;
    const focused = page.locator(`[${FOCUS_PIN}]`);
    try {
      await finishTransitions(page);
      const key = await focused.evaluate(pathKey);
      if (seen.has(key)) continue;
      seen.add(key);
      // 外れたら同じ要素へ戻す（キーボードで送った後のスクリプトのフォーカスは :focus-visible を保つ）
      const entries = await captureInState(focused, ':focus-visible', async () => {
        await focused.focus();
        await finishTransitions(page);
      });
      if (entries !== null) out.entries.push(...tag(entries, 'focus-visible'));
      else out.notEntered.push(`focus-visible: ${await labelOf(focused)}`);
    } finally {
      await page.evaluate((attr) => document.querySelector(`[${attr}]`)?.removeAttribute(attr), FOCUS_PIN);
    }
  }
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

export async function captureInteractions(page: Page): Promise<InteractionCapture> {
  const out: InteractionCapture = { entries: [], notEntered: [], skipped: [] };
  const targets = page.locator(TARGETS).filter({ visible: true });
  const count = await targets.count();

  for (let i = 0; i < count; i += 1) {
    const el = targets.nth(i);
    const label = await labelOf(el);
    // ホバーの位置へ動かせなかった要素は、押す位置も定まらない（押下は同じ位置で行う）
    if (await captureHover(page, el, label, out)) await capturePress(page, el, label, out);
    // 操作で要素が増減したら、状態が変わっている（以後の `nth` が別の要素を指し、無い要素を待ち続ける）
    const now = await targets.count();
    if (now !== count) throw new Error(`「${label}」の操作の後に対象の数が ${count} から ${now} へ変わった（状態が変わった）`);
  }
  await page.mouse.move(0, 0);
  await finishTransitions(page);
  await captureFocus(page, count * 2 + 5, out);
  await finishTransitions(page);
  return out;
}
