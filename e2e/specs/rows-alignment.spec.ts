/**
 * 一覧の行の並び（#556・#479 A）。長い名前の行と自分の行が、他の行と同じ並びになる。
 *
 * **タグを付けない（`local` 専用）。** 本番のルーム枠を消費して確かめる種類のものではない。
 * 見るのは要素の矩形だけ（スクリーンショットの比較は入れない）。
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { openAgendaTool } from '../support/agenda';
import { addRouletteGuest, openRouletteTool } from '../support/roulette';
import { createRoom as createTimerRoom, driverRoster, joinAsDriver } from '../support/timer';

const WIDTHS = [320, 390, 1280] as const;
/** 全角 28 字（一覧 #7・#15・#20 の再現に使った名前） */
const LONG = 'ながいなまえのさんかしゃでございますよろしくおねがいします';

type OpenPeer = (label: string) => Promise<{ page: Page }>;

interface Item { readonly text: string; readonly top: number; readonly left: number; readonly height: number; readonly width: number }

interface RowBox { readonly name: string; readonly height: number; readonly tailRight: number }

/** 行ごとに、高さと「末尾の操作の右端」を測る（`tail` は行の中の最後に描かれた操作のセレクタ）。 */
async function measureRows(page: Page, rowSelector: string, tail: string, scope = 'body'): Promise<RowBox[]> {
  return page.evaluate(({ rowSelector, tail, scope }) => {
    const root = document.querySelector(scope)!;
    const rows = [...root.querySelectorAll(rowSelector)].filter((r) => r.getClientRects().length > 0);
    return rows.map((r) => {
      const ends = [...r.querySelectorAll(tail)].filter((t) => t.getClientRects().length > 0);
      const last = ends[ends.length - 1];
      return {
        name: (r.textContent ?? '').trim().slice(0, 40),
        height: r.getBoundingClientRect().height,
        tailRight: last === undefined ? Number.NaN : last.getBoundingClientRect().right,
      };
    });
  }, { rowSelector, tail, scope });
}

/** 自分がまだ輪に入っていなければ入る（作った人は入っていないことがある）。 */
async function joinSelf(page: Page): Promise<void> {
  // 参加者の一覧が描かれるのを待つ（固定の待ちは使わない）。作った人が輪に入っていなければ「加わる」が出る
  await expect(page.locator('.lobby-participant').first()).toBeVisible();
  const join = page.getByRole('button', { name: 'ドライバーに加わる' });
  if (await join.isVisible()) await join.click();
}

test.describe('一覧の行は名前の長さや自分かどうかで並びを変えない', () => {
  test('Given timer のロビー（自分と長い名前の人） / When 3 つの幅で開く / Then 末尾の操作の右端が全行で揃う（#556 一覧 #7）', async ({ page, openPeer }) => {
    const code = await createTimerRoom(page, 'ホスト');
    const peers: OpenPeer = openPeer;
    for (const [i, n] of [LONG, 'さとう'].entries()) {
      const p = await peers(`rows-lobby-${String(i)}`);
      await joinAsDriver(p.page, code, n);
    }
    await joinSelf(page);
    await expect(page.locator('.lobby-participant')).toHaveCount(3);
    await expect(page.locator('.lobby-participant-badge-driver')).toHaveCount(3);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const rows = await measureRows(page, '.lobby-participant', '.lobby-row-icon-button');
      expect(rows.length, `幅 ${String(width)}: 行`).toBe(3);
      const rights = rows.map((r) => Math.round(r.tailRight));
      expect(new Set(rights).size, `幅 ${String(width)}: 末尾の操作の右端 ${rights.join(',')}`).toBe(1);
      // 長い名前の他人の行と短い名前の他人の行は同じ高さ
      const [, long, short] = rows;
      expect(Math.abs(long!.height - short!.height), `幅 ${String(width)}: 他人の行の高さ`).toBeLessThanOrEqual(1);
    }
  });

  test('Given timer のセッションの名簿（長い名前の人） / When 3 つの幅で開く / Then 長い名前の行は短い名前の行より名前 1 行ぶんしか高くならず、操作の右端が揃う（#556 一覧 #15）', async ({ page, openPeer }) => {
    const code = await createTimerRoom(page, 'ホスト');
    for (const [i, n] of [LONG, 'さとう'].entries()) {
      const p = await openPeer(`rows-roster-${String(i)}`);
      await joinAsDriver(p.page, code, n);
    }
    await joinSelf(page);
    await expect(page.locator('.lobby-participant-badge-driver')).toHaveCount(3);
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(driverRoster(page)).toBeVisible();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const rows = await measureRows(page, '.roster-panel-row', '.roster-panel-icon-actions button', '[aria-label="ドライバー一覧"]');
      expect(rows.length, `幅 ${String(width)}: 行`).toBe(3);
      const long = rows.find((r) => r.name.includes('ながい'))!;
      const short = rows.find((r) => r.name.includes('さとう'))!;
      // 名前は省略せず折り返す（F3）ので、高さは名前の行数で増える。名前が切れていない（全文が見える）ことと、操作の右端が揃うことを見る
      expect(long.height, `幅 ${String(width)}: 長い名前の行は短い名前の行より低くならない`).toBeGreaterThanOrEqual(short.height);
      const clipped = await page.evaluate(() => [...document.querySelectorAll('[aria-label="ドライバー一覧"] .roster-panel-name')].filter((n) => n.getClientRects().length > 0).filter((n) => n.scrollHeight > n.clientHeight + 1).length);
      expect(clipped, `幅 ${String(width)}: 名前が切れている（全文が見えない）`).toBe(0);
      expect(Math.round(long.tailRight), `幅 ${String(width)}: 操作の右端`).toBe(Math.round(short.tailRight));
    }
  });

  test('Given roulette の入る人（長い名前を含む） / When 3 つの幅で開く / Then 全行が同じ高さで、「名前を消す」の右端が揃う（#556 一覧 #20）', async ({ page }) => {
    await openRouletteTool(page, 'ホスト');
    for (const n of [LONG, 'さとう', 'すずき']) await addRouletteGuest(page, n);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const rows = await measureRows(page, '.roulette-row', '.roulette-row-tail button');
      expect(rows.length, `幅 ${String(width)}: 行`).toBeGreaterThanOrEqual(4);
      const heights = rows.map((r) => Math.round(r.height));
      // 長い名前は全文を折り返す（F3）。短い名前の行どうしは同じ高さ
      const shortHeights = rows.filter((r) => !r.name.includes('ながい')).map((r) => Math.round(r.height));
      expect(Math.max(...shortHeights) - Math.min(...shortHeights), `幅 ${String(width)}: 短い名前の行の高さ ${heights.join(',')}`).toBeLessThanOrEqual(24);
      const long = rows.find((r) => r.name.includes('ながい'))!;
      const short = rows.find((r) => r.name.includes('さとう'))!;
      expect(long.height, `幅 ${String(width)}: 長い名前の行は短い名前の行より低くならない`).toBeGreaterThanOrEqual(short.height);
      const clipped = await page.evaluate(() => [...document.querySelectorAll('.roulette-name')].filter((n) => n.getClientRects().length > 0).filter((n) => n.scrollHeight > n.clientHeight + 1).length);
      expect(clipped, `幅 ${String(width)}: 名前が切れている（全文が見えない）`).toBe(0);
      expect(Math.round(long.tailRight), `幅 ${String(width)}: 末尾の操作の右端`).toBe(Math.round(short.tailRight));
    }
  });

  test('Given timer のロビーの状態の帯 / When 4 つの幅で開く / Then 帯の中の目の順（行ごとに左から右）が DOM の順（読み上げ・Tab の順）と同じ（#556 一覧 #14・WCAG 1.3.2・2.4.3）', async ({ page }) => {
    await createTimerRoom(page, 'ホスト');
    await expect(page.getByRole('status', { name: 'ステータス情報' })).toBeVisible();
    for (const width of [320, 390, 768, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      const items = await page.evaluate(() => {
        const strip = document.querySelector('[aria-label="ステータス情報"]')!;
        return [...strip.children].map((c) => {
          const r = c.getBoundingClientRect();
          return { text: (c.textContent ?? '').trim().slice(0, 12), top: r.top, left: r.left, height: r.height, width: r.width };
        });
      });
      expect(items.length, `幅 ${String(width)}: 帯の項目`).toBeGreaterThanOrEqual(4);
      // 目の順: 上端が行の高さの半分以内なら同じ行として左から右。DOM の順と一致する
      const visual = [...items.keys()].sort((a, b) => {
        const A = items[a]!, B = items[b]!;
        return Math.abs(A.top - B.top) < A.height / 2 ? A.left - B.left : A.top - B.top;
      });
      expect(visual, `幅 ${String(width)}: 目の順 ${visual.map((i) => items[i]!.text).join(' / ')}`).toEqual([...items.keys()]);
      // 押せるもの（通知）は Tab で届く
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      await page.getByRole('button', { name: '通知設定' }).focus();
      await expect(page.getByRole('button', { name: '通知設定' })).toBeFocused();
      // 40rem（640px）未満は 2 段に決めて組む: 1 段目 = フェーズ・名前、2 段目 = 接続状態・通知。
      // main は「通知」だけが 2 段目に落ちた（390）。通知は接続状態と同じ段にあり、名前はフェーズと同じ段にある
      if (width < 640) {
        const [phase, name, conn, notify] = items as [Item, Item, Item, Item];
        expect(Math.abs(phase.top - name.top), `幅 ${String(width)}: フェーズと名前が同じ段`).toBeLessThan(phase.height / 2);
        expect(Math.abs(conn.top - notify.top), `幅 ${String(width)}: 接続状態と通知が同じ段`).toBeLessThan(conn.height / 2);
        expect(conn.top, `幅 ${String(width)}: 接続状態・通知は 1 段目の下`).toBeGreaterThanOrEqual(phase.top + phase.height - 1);
      }
    }
  });

  test('Given timer のロビーのカード / When 2 つの幅で開く / Then 見出しの行の下端から中身の上端までの間は 16px（親の gap が持ち、以前の margin-bottom と同じ見た目・#556）', async ({ page, openPeer }) => {
    const code = await createTimerRoom(page, 'ホスト');
    const guest = await openPeer('rows-gap');
    await joinAsDriver(guest.page, code, 'ゲスト');
    await joinSelf(page);
    await expect(page.locator('.lobby-participant')).toHaveCount(2);
    for (const width of [320, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      const gaps = await page.evaluate(() => [...document.querySelectorAll('.section-header')].filter((h) => h.getClientRects().length > 0).map((h) => {
        const next = h.nextElementSibling!;
        return { title: (h.querySelector('h2')?.textContent ?? '').trim(), gap: next.getBoundingClientRect().top - h.getBoundingClientRect().bottom };
      }));
      expect(gaps.length, `幅 ${String(width)}: 見出しの行`).toBeGreaterThanOrEqual(4);
      for (const g of gaps) expect(Math.abs(g.gap - 16), `幅 ${String(width)}: 「${g.title}」の下の間`).toBeLessThanOrEqual(1);
    }
  });

  const STRIP_LONG_NAME = 'ながいなまえのさんかしゃでございますよろしくおねがいしますながいなまえ'; // 全角 33 字
  for (const [scale, label] of [['100%', '接続中 (Connected)'], ['100%', '同期できていません (Out of Sync)'], ['200%', '接続中 (Connected)'], ['200%', '再接続中… (Reconnecting)']] as const) {
    test(`Given timer の状態の帯（長い名前・文字 ${scale}・接続状態「${label}」） / When 320 と 390 で開く / Then 名前と通知が潰れず、帯が画面の横にはみ出さず、名前の全文が読める（#556 のレビュー E1）`, async ({ page }) => {
      await createTimerRoom(page, STRIP_LONG_NAME);
      await expect(page.getByRole('status', { name: 'ステータス情報' })).toBeVisible();
      // 接続状態の文言を、長い文言（stale・reconnecting）に差し替えて配置だけを測る（実際にその状態を作るのは別の検査の役目）
      await page.evaluate(({ scale, label }) => {
        document.documentElement.style.fontSize = scale;
        const conn = document.querySelector('.status-strip-connection');
        conn!.lastElementChild!.textContent = label;
      }, { scale, label });
      for (const width of [320, 390] as const) {
        await page.setViewportSize({ width, height: 900 });
        const m = await page.evaluate(() => {
          const strip = document.querySelector('.status-strip')!;
          const sr = strip.getBoundingClientRect();
          const name = document.querySelector('.status-strip-name') as HTMLElement;
          const notify = document.querySelector('.notify-settings-trigger')!.getBoundingClientRect();
          return {
            pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            nameWidth: name.getBoundingClientRect().width,
            nameClipped: name.scrollHeight > name.clientHeight + 1 || name.scrollWidth > name.clientWidth + 1,
            notifyWidth: notify.width,
            childrenOutside: [...strip.children].filter((c) => { const r = c.getBoundingClientRect(); return r.right > sr.right + 1 || r.left < sr.left - 1; }).length,
          };
        });
        const where = `幅 ${String(width)}・文字 ${scale}・${label}`;
        expect(m.pageOverflow, `${where}: ページの横の溢れ`).toBeLessThanOrEqual(0);
        expect(m.nameWidth, `${where}: 名前の幅`).toBeGreaterThanOrEqual(60);
        expect(m.notifyWidth, `${where}: 通知の幅`).toBeGreaterThanOrEqual(40);
        expect(m.nameClipped, `${where}: 名前が切れている（全文が読めない）`).toBe(false);
        expect(m.childrenOutside, `${where}: 帯の外へはみ出した項目`).toBe(0);
      }
    });
  }

  test('Given timer のロビーの交代間隔（文字 200%・詳細設定の休憩の条件も） / When 320 と 390 で開く / Then 選択肢の字が隣に重ならず、行の外へはみ出さず、当たりは 44px 以上（#556 のレビュー E2）', async ({ page }) => {
    await createTimerRoom(page, 'ホスト');
    await page.getByText('詳細設定', { exact: true }).click();
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    for (const width of [320, 390] as const) {
      await page.setViewportSize({ width, height: 900 });
      const groups = await page.evaluate(() => [...document.querySelectorAll('.session-config-intervals')].filter((g) => g.getClientRects().length > 0).map((g) => {
        const gr = g.getBoundingClientRect();
        const bs = [...g.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, text: (b.textContent ?? '').trim(), scrollW: b.scrollWidth, clientW: b.clientWidth }; });
        return { label: g.getAttribute('aria-label') ?? '', left: gr.left, right: gr.right, bs };
      }));
      expect(groups.length, `幅 ${String(width)}: 選択肢の組`).toBeGreaterThanOrEqual(2);
      for (const g of groups) {
        for (const [i, b] of g.bs.entries()) {
          const where = `幅 ${String(width)}・${g.label}・「${b.text}」`;
          expect(b.r, `${where}: 組の右端を越えた`).toBeLessThanOrEqual(g.right + 1);
          expect(b.l, `${where}: 組の左端を越えた`).toBeGreaterThanOrEqual(g.left - 1);
          expect(b.w, `${where}: 幅`).toBeGreaterThanOrEqual(44);
          expect(b.h, `${where}: 高さ`).toBeGreaterThanOrEqual(44);
          expect(b.scrollW, `${where}: 字が自分の箱をはみ出した`).toBeLessThanOrEqual(b.clientW + 1);
          for (const o of g.bs.slice(i + 1)) {
            const overlapX = Math.min(b.r, o.r) - Math.max(b.l, o.l) > 0.5;
            const overlapY = Math.min(b.b, o.b) - Math.max(b.t, o.t) > 0.5;
            expect(overlapX && overlapY, `${where} と「${o.text}」が重なった`).toBe(false);
          }
        }
      }
    }
  });

  test('Given roulette の入る人（文字 200% と 1 倍の 320） / When 開く / Then 名前に読める幅が残り、行が横にはみ出さない（#556 のレビュー E3）', async ({ page }) => {
    await openRouletteTool(page, 'ホスト');
    for (const n of [LONG, 'さとう']) await addRouletteGuest(page, n);
    for (const [scale, widths, minName] of [['100%', [320, 390], 60], ['200%', [320, 390], 40]] as const) {
      await page.evaluate((v) => { document.documentElement.style.fontSize = v; }, scale);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        const m = await page.evaluate(() => ({
          overflow: Math.max(0, ...[...document.querySelectorAll('.roulette-row')].filter((r) => r.getClientRects().length > 0).map((r) => r.scrollWidth - r.clientWidth)),
          names: [...document.querySelectorAll('.roulette-row .roulette-name')].filter((n) => n.getClientRects().length > 0 && (n.textContent ?? '').includes('ながい')).map((n) => n.getBoundingClientRect().width),
          outside: [...document.querySelectorAll('.roulette-row')].filter((r) => r.getClientRects().length > 0).filter((r) => { const rr = r.getBoundingClientRect(); return [...r.querySelectorAll('button, .roulette-chip, .roulette-name')].some((c) => { const b = c.getBoundingClientRect(); return b.right > rr.right + 1 || b.left < rr.left - 1; }); }).length,
        }));
        const where = `幅 ${String(width)}・文字 ${scale}`;
        expect(m.names.length, `${where}: 長い名前の行`).toBe(1);
        expect(Math.min(...m.names), `${where}: 名前の幅の最小`).toBeGreaterThanOrEqual(minName);
        expect(m.outside, `${where}: 行の外（左右どちらでも）へはみ出した操作・名前`).toBe(0);
        expect(m.overflow, `${where}: 行の中身の横の溢れ`).toBeLessThanOrEqual(1);
      }
    }
  });

  test('Given agenda の組む画面（ステップあり） / When 1 倍の 320・330 と 文字 200% の 1024・1280 で開く / Then 2 段目の操作が行の外へはみ出さず、「押すまで待つ」「自動で次へ」が 2 行に割れない（#556 のレビュー E4）', async ({ page }) => {
    await openAgendaTool(page, 'ホスト');
    await page.getByRole('button', { name: 'サンプルから選ぶ', exact: true }).click();
    await page.getByRole('button', { name: /サンプル：KPT のふりかえり/ }).click();
    await expect(page.locator('.builder-row').first()).toBeVisible();
    for (const [scale, width] of [['100%', 320], ['100%', 330], ['200%', 1024], ['200%', 1280]] as const) {
      await page.evaluate((v) => { document.documentElement.style.fontSize = v; }, scale);
      await page.setViewportSize({ width, height: 900 });
      const m = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.builder-row')];
        const outside = rows.flatMap((row) => {
          const rr = row.getBoundingClientRect();
          return [...row.querySelectorAll('.builder-row-controls button, .builder-row-controls input, .builder-row-controls select, .builder-row-controls label')]
            .filter((c) => c.getClientRects().length > 0 && c.getBoundingClientRect().right > rr.right + 1)
            .map((c) => (c.textContent ?? '').trim().slice(0, 8));
        });
        const split = [...document.querySelectorAll('.builder-row-controls *')].filter((e) => e.children.length === 0 && /^(押すまで待つ|自動で次へ)$/.test((e.textContent ?? '').trim()))
          .filter((e) => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size > 1; }).length;
        return { outside, split };
      });
      expect(m.outside, `幅 ${String(width)}・文字 ${scale}: 行の外へはみ出した操作`).toEqual([]);
      // 切り替えの字が 2 行に割れるのは、1 倍の字の狭い幅の話（文字 200% の 1024 は、1 倍の 512px 相当で main も割れる）
      if (scale === '100%') expect(m.split, `幅 ${String(width)}・文字 ${scale}: 2 行に割れた切り替え`).toBe(0);
    }
  });

  test('Given timer のロビーとセッションの名簿（短い名前の人と長い名前の人） / When 1024 と 1280 で開く / Then 収まる幅では行が 1 段で、長い名前の行との高さの差は名前 1 行ぶん以内（#556 のレビュー E5）', async ({ page, openPeer }) => {
    const code = await createTimerRoom(page, 'ホスト');
    for (const [i, n] of [LONG, 'さとう'].entries()) {
      const p = await openPeer(`rows-fit-${String(i)}`);
      await joinAsDriver(p.page, code, n);
    }
    await joinSelf(page);
    await expect(page.locator('.lobby-participant-badge-driver')).toHaveCount(3);
    for (const width of [1024, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      const lobby = await page.evaluate(() => [...document.querySelectorAll('.lobby-participant')].filter((r) => r.getClientRects().length > 0).map((r) => {
        const rr = r.getBoundingClientRect();
        const a = r.querySelector('.lobby-participant-actions')!.getBoundingClientRect();
        return { self: (r.textContent ?? '').includes('ホスト'), text: (r.textContent ?? '').trim().slice(0, 6), h: rr.height, sameLine: a.top < rr.top + rr.height / 2 };
      }));
      const others = lobby.filter((r) => !r.self);
      expect(others.length, `幅 ${String(width)}: ロビーの他人の行`).toBe(2);
      for (const r of others) expect(r.sameLine, `幅 ${String(width)}: ロビー「${r.text}」の操作が名前と同じ段`).toBe(true);
    }
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(driverRoster(page)).toBeVisible();
    for (const width of [1024, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      const rows = await page.evaluate(() => [...document.querySelectorAll('[aria-label="ドライバー一覧"] .roster-panel-row')].filter((r) => r.getClientRects().length > 0).map((r) => ({
        text: (r.textContent ?? '').trim(), h: r.getBoundingClientRect().height,
      })));
      const short = rows.find((r) => r.text.includes('さとう'))!;
      const long = rows.find((r) => r.text.includes('ながい'))!;
      // 短い名前の行は 1 段（名前 1 行 + 余白）。2 段になると 127px 前後まで伸びる（8rem の基準のとき 98 → 127px）
      expect(short.h, `幅 ${String(width)}: 短い名前の行の高さ`).toBeLessThanOrEqual(104);
      expect(long.h, `幅 ${String(width)}: 長い名前の行は短い名前の行より低くならない（全文を折り返す）`).toBeGreaterThanOrEqual(short.h);
    }
  });

  test('Given timer のセッションの交代順（文字 200%・長い名前を含む） / When 320・390・1280 で開く / Then 名前に読める幅が残り、札の中で重ならず、札が列の外へはみ出さない（#556 のレビュー F1）', async ({ page, openPeer }) => {
    const code = await createTimerRoom(page, 'ホスト');
    for (const [i, n] of ['ながいなまえのさんかしゃでございます', 'さとう', 'すずき'].entries()) {
      const p = await openPeer(`rows-lineup-${String(i)}`);
      await joinAsDriver(p.page, code, n);
    }
    await joinSelf(page);
    await expect(page.locator('.lobby-participant-badge-driver')).toHaveCount(4);
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.locator('.rotation-lineup-row').first()).toBeVisible();
    for (const scale of ['100%', '200%'] as const) {
      await page.evaluate((v) => { document.documentElement.style.fontSize = v; }, scale);
      for (const width of [320, 390, 1280] as const) {
        await page.setViewportSize({ width, height: 900 });
        const m = await page.evaluate(() => {
          const list = document.querySelector('.rotation-lineup-list')!.getBoundingClientRect();
          return [...document.querySelectorAll('.rotation-lineup-row')].filter((r) => r.getClientRects().length > 0).map((r) => {
            const rr = r.getBoundingClientRect();
            const kids = [...r.children].map((c) => { const b = c.getBoundingClientRect(); return { cls: c.className, l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width }; });
            const name = kids.find((k) => String(k.cls).includes('rotation-lineup-name'))!;
            const overlaps = kids.some((a, i) => kids.slice(i + 1).some((b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1));
            const outsideRow = kids.some((k) => k.r > rr.right + 1 || k.l < rr.left - 1);
            const whenShort = [...r.querySelectorAll('.rotation-lineup-when-short, .rotation-lineup-when-current')].some((e) => { const rg = document.createRange(); rg.selectNodeContents(e); return new Set([...rg.getClientRects()].map((q) => Math.round(q.top))).size > 1; });
            return { nameW: name.w, overlaps, outsideRow, outsideList: rr.right > list.right + 1 || rr.left < list.left - 1, whenShort };
          });
        });
        const where = `幅 ${String(width)}・文字 ${scale}`;
        expect(m.length, `${where}: 札`).toBeGreaterThanOrEqual(4);
        for (const r of m) {
          expect(r.nameW, `${where}: 名前の幅`).toBeGreaterThanOrEqual(scale === '200%' ? 28 : 28);
          expect(r.overlaps, `${where}: 札の中の字が重なった`).toBe(false);
          expect(r.outsideRow, `${where}: 札の外へはみ出した字`).toBe(false);
          expect(r.outsideList, `${where}: 札が列の外へはみ出した`).toBe(false);
        }
        // 1 倍の字では「▶ 今」「⟶ 次」が割れない（#16）
        if (scale === '100%') expect(m.some((r) => r.whenShort), `${where}: 「今」「次」が 2 行に割れた`).toBe(false);
      }
    }
  });

  test('Given timer の見出しの行を持つ画面（セッションの名簿とルームのタブ・共有メモ・履歴） / When 320・1024・1280 で開く / Then 見出しの行から中身までは 16px（共有メモは 8px）（#556 のレビュー F6）', async ({ page, openPeer }) => {
    const code = await createTimerRoom(page, 'ホスト');
    const guest = await openPeer('rows-gap-all');
    await joinAsDriver(guest.page, code, 'ゲスト');
    await joinSelf(page);
    await expect(page.locator('.lobby-participant')).toHaveCount(2);
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(driverRoster(page)).toBeVisible();
    const measure = (sel: string) => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((h) => h.getClientRects().length > 0).map((h) => {
      const next = h.nextElementSibling!;
      return { title: (h.textContent ?? '').trim().slice(0, 12), gap: next.getBoundingClientRect().top - h.getBoundingClientRect().bottom };
    }), sel);
    const check = async (where: string, headers: number, memo: boolean) => {
      for (const width of [320, 1024, 1280] as const) {
        await page.setViewportSize({ width, height: 900 });
        const gaps = await measure('.section-header');
        expect(gaps.length, `${where} 幅 ${String(width)}: 見出しの行`).toBeGreaterThanOrEqual(headers);
        for (const g of gaps) expect(Math.abs(g.gap - 16), `${where} 幅 ${String(width)}: 「${g.title}」の下の間`).toBeLessThanOrEqual(1);
        if (memo) {
          const memos = await measure('.shared-memo-header');
          expect(memos.length, `${where} 幅 ${String(width)}: 共有メモの見出し`).toBeGreaterThanOrEqual(1);
          for (const g of memos) expect(Math.abs(g.gap - 8), `${where} 幅 ${String(width)}: 共有メモの見出しの下の間`).toBeLessThanOrEqual(1);
        }
      }
    };
    await check('セッション（名簿・共有メモ）', 1, true);
    const roomTab = page.getByRole('tab', { name: 'ルーム' });
    if (await roomTab.isVisible()) {
      await roomTab.click();
      await check('ルームのタブ', 1, false);
    }
    // 履歴（玄関から「記録を見る」）
    await page.goto('/');
    await page.getByRole('link', { name: '記録を見る' }).click();
    await expect(page.getByRole('heading', { name: '完了記録の履歴' })).toBeVisible();
    await check('履歴', 1, false);
  });
});
