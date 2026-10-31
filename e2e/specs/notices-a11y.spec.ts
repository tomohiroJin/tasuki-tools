/**
 * 接続の告知の帯と一言（エラー）が読めること（#320 PR 2・設計正本 §8 E8）。
 *
 * **タグを付けない（`local` 専用）。** 理由は `timer-a11y.spec.ts` と同じ（見るのはスタイルの健全性）。
 *
 * 帯とエラーは、ほかの走査のどのシナリオでも表示されない（設計正本 §3）。ここで表示させて測る。
 * 表示させる手段は `routeWebSocket` だけで、**製品コードにテスト用の経路は作らない**（`poker.spec.ts` と同じ）:
 *
 * - **繋がらない**: そのページのツールの WS を成立させない。`everConnected` が false のまま失敗が増え、
 *   最初から「繋がらない」帯が出る
 * - **同期できていない**: 実サーバーへ中継しつつ、契約に合わないフレームを 1 通差し込む。
 *   「再接続しています」と同じ見た目（修飾の無い帯）で、こちらは状態が留まるので測れる
 *   （再接続中は失敗が 3 回で「繋がらない」へ移り、測っている間に変わる）
 * - **エラー**: 同じ中継で、未知のコードの `error` を 1 通差し込む。文は空白だけにして、
 *   画面の既定の文（書体の常用の層に収まる）を出させる
 *
 * **色は計算後の値で比べる。** AA を満たすかだけを見ると、部品を当て忘れて `--ivory-dim` になっても
 * 緑になる（どちらも読める）。当てたかどうかで値が分かれる局面に判定を置く。
 */
import type { Locator, Page, WebSocketRoute } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { expectReadable, pairKey, resolveColors, scanContrast } from '../support/a11y';
import { createRoom } from '../support/poker';
import { loadSampleAndStart, openAgendaTool } from '../support/agenda';
import { openTopicTool } from '../support/topic';

type Tool = 'poker' | 'topic' | 'agenda';

/** 画面の既定のエラーの文（poker の `DEFAULT_ERROR_MESSAGE`・お題ツールの `DEFAULT_ERROR_TEXT`）。 */
const ERROR_TEXT = '操作を完了できませんでした';
const STALE = /同期できていません/;
const UNREACHABLE = /同期サーバーに接続できません/;

/** 未知のコードの `error`。文を空白だけにして、画面の既定の文を出させる。 */
const UNKNOWN_ERROR = { type: 'error', code: 'E2E_UNKNOWN', message: ' ' };

function toolSocket(tool: Tool): RegExp {
  return new RegExp(`/ws\\?.*\\btool=${tool}\\b`);
}

/** そのページのツールの WS を成立させない（`poker.spec.ts` の `syncServerIsDown` と同じ形）。 */
async function toolSyncIsDown(page: Page, tool: Tool): Promise<void> {
  await page.routeWebSocket(toolSocket(tool), (ws) => {
    void ws.close();
  });
}

/**
 * そのページのツールの WS を実サーバーへ中継し、**ページへフレームを差し込む口**を返す。
 *
 * 口は接続が張られてから埋まる。**中継はツールを開く前に掛けること**（掛ける前に張られた接続は掴めない）。
 */
async function relayToolSync(page: Page, tool: Tool): Promise<(frame: unknown) => void> {
  let client: WebSocketRoute | null = null;
  await page.routeWebSocket(toolSocket(tool), (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => ws.send(message));
    client = ws;
  });
  return (frame) => {
    // 掴めていないまま進むと、下の判定は差し込んでいない画面を見る
    expect(client, '中継が接続を掴んでいない').not.toBeNull();
    client!.send(JSON.stringify(frame));
  };
}

/**
 * `relayToolSync` に加え、**以後の接続を成立させない切断**を起こせる口を返す（繋がらない状態まで測る）。
 * `cut()` は掴んでいる接続を閉じ、新しい接続は開く前に閉じる。
 */
async function relayToolSyncWithOutage(
  page: Page,
  tool: Tool,
): Promise<{ inject: (frame: unknown) => void; cut: () => Promise<void> }> {
  let client: WebSocketRoute | null = null;
  let down = false;
  await page.routeWebSocket(toolSocket(tool), (ws) => {
    if (down) {
      void ws.close();
      return;
    }
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => ws.send(message));
    client = ws;
  });
  return {
    inject: (frame) => {
      expect(client, '中継が接続を掴んでいない').not.toBeNull();
      client!.send(JSON.stringify(frame));
    },
    cut: async () => {
      down = true;
      expect(client, '中継が接続を掴んでいない').not.toBeNull();
      await client!.close();
    },
  };
}

/** 帯と一言の見た目のうち、判定が分岐を見る値。 */
async function paintOf(locator: Locator) {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      color: s.color,
      background: s.backgroundColor,
      weight: s.fontWeight,
      underline: s.borderBottomWidth,
      position: s.position,
      marginTop: s.marginTop,
    };
  });
}

test.describe('接続の帯と一言が読める（WCAG AA・#320 E8）', () => {
  test('Given poker のルーム / When エラーと「同期できていません」を出す / Then 帯は貼りついた不透明な地で、エラーは淡い赤で、すべて AA を満たす', async ({
    page,
  }) => {
    // Given: 中継を掛けてからルームを作る（作る途中で poker の接続が張られる）
    const inject = await relayToolSync(page, 'poker');
    await createRoom(page, 'notice-poker');
    const [rosePale, felt950] = await resolveColors(page, ['--rose-pale', '--felt-950']);

    // When その1: 未知のコードのエラーを届ける
    inject(UNKNOWN_ERROR);
    const error = page.getByRole('alert').filter({ hasText: ERROR_TEXT });
    await expect(error, 'エラーの一言').toBeVisible();
    // Then その1: エラーの字は --rose-pale（部品を当て忘れると --ivory-dim、写しが残ると生の色）
    expect((await paintOf(error)).color, 'エラーの字の色').toBe(rosePale);

    // When その2: 契約に合わないフレームを届ける
    inject({ type: 'room-state' });
    const banner = page.getByRole('status').filter({ hasText: STALE });
    await expect(banner, '同期できていない帯').toBeVisible();
    // Then その2: 帯は上端に貼りつき、不透明な地で、細い下線（繋がらない帯と区別がつく側）
    const paint = await paintOf(banner);
    expect(paint).toMatchObject({ color: rosePale, background: felt950, underline: '1px', position: 'sticky', marginTop: '0px' });
    expect(paint.weight, '太字ではない（繋がらない帯と区別がつく）').not.toBe('700');

    // Then その3: 画面の文字がすべて読め、帯の字（--rose-pale on --felt-950）を測ったことを固定する
    expectReadable(await scanContrast(page, 10), 8, [pairKey(rosePale!, felt950!)]);
  });

  test('Given poker の同期サーバーへ繋がらない / When 開く / Then 繋がらない帯は太い下線と太字で区別され、AA を満たす', async ({
    page,
  }) => {
    // Given: 玄関で名乗ってルームに入る（同一性が無いと poker は玄関へ送り返す）
    await createRoom(page, 'notice-poker-down');
    // When: poker の接続だけを成立させないようにして、開き直す
    await toolSyncIsDown(page, 'poker');
    await page.reload();
    const [rosePale, felt950] = await resolveColors(page, ['--rose-pale', '--felt-950']);

    const banner = page.getByRole('alert').filter({ hasText: UNREACHABLE });
    await expect(banner, '繋がらない帯').toBeVisible();
    // Then その1: 色だけでなく、下線と字の太さでも区別されている
    expect(await paintOf(banner)).toMatchObject({
      color: rosePale,
      background: felt950,
      weight: '700',
      underline: '2px',
      position: 'sticky',
      marginTop: '0px',
    });
    // Then その2: 読める（入室を待つ画面は要素が少ないので下限を下げる）
    expectReadable(await scanContrast(page, 1), 1, [pairKey(rosePale!, felt950!)]);
  });

  test('Given お題ツール / When エラーと「同期できていません」を出す / Then 帯は貼りついた不透明な地で、エラーは淡い赤で、すべて AA を満たす', async ({
    page,
  }) => {
    // Given: 中継を掛けてからお題ツールを開く（玄関の接続は掴まない。`tool=topic` だけ）
    const inject = await relayToolSync(page, 'topic');
    await openTopicTool(page, 'notice-topic');
    const [rosePale, felt950] = await resolveColors(page, ['--rose-pale', '--felt-950']);

    // When その1: 未知のコードのエラーを届ける
    inject(UNKNOWN_ERROR);
    const error = page.getByRole('alert').filter({ hasText: ERROR_TEXT });
    await expect(error, 'エラーの一言').toBeVisible();
    expect((await paintOf(error)).color, 'エラーの字の色').toBe(rosePale);

    // When その2: 契約に合わないフレームを届ける（`topic` の形にも、ハブの応答の形にも合わない）
    inject({ type: 'topic' });
    const banner = page.getByRole('status').filter({ hasText: STALE });
    await expect(banner, '同期できていない帯').toBeVisible();
    const paint = await paintOf(banner);
    expect(paint).toMatchObject({ color: rosePale, background: felt950, underline: '1px', position: 'sticky', marginTop: '0px' });
    expect(paint.weight, '太字ではない（繋がらない帯と区別がつく）').not.toBe('700');

    // Then: 画面の文字がすべて読め、帯の字を測ったことを固定する
    expectReadable(await scanContrast(page, 5), 5, [pairKey(rosePale!, felt950!)]);
  });

  test('Given お題ツールの同期サーバーへ繋がらない / When 開く / Then 繋がらない帯は太い下線と太字で区別され、AA を満たす', async ({
    page,
  }) => {
    // Given: お題ツールを一度開いて、端末に同一性を残す
    await openTopicTool(page, 'notice-topic-down');
    // When: お題ツールの接続だけを成立させないようにして、開き直す
    await toolSyncIsDown(page, 'topic');
    await page.reload();
    const [rosePale, felt950] = await resolveColors(page, ['--rose-pale', '--felt-950']);

    const banner = page.getByRole('alert').filter({ hasText: UNREACHABLE });
    await expect(banner, '繋がらない帯').toBeVisible();
    expect(await paintOf(banner)).toMatchObject({
      color: rosePale,
      background: felt950,
      weight: '700',
      underline: '2px',
      position: 'sticky',
      marginTop: '0px',
    });
    expectReadable(await scanContrast(page, 1), 1, [pairKey(rosePale!, felt950!)]);
  });

  test('Given 進行タイマー / When 「同期できていません」を出す / Then 他のアプリと同じ貼りついた不透明な帯が出て、AA を満たす（#471）', async ({
    page,
  }) => {
    // Given: 中継を掛けてから進行タイマーを開く（agenda はこの帯を #471 で足した。他のアプリと同じ見た目・位置であること）
    const inject = await relayToolSync(page, 'agenda');
    await openAgendaTool(page, 'notice-agenda');
    const [rosePale, felt950] = await resolveColors(page, ['--rose-pale', '--felt-950']);

    // When: 契約に合わないフレームを届ける（`agenda` の形にも、ハブの応答の形にも合わない）
    inject({ type: 'agenda' });
    const banner = page.getByRole('status').filter({ hasText: STALE });
    await expect(banner, '同期できていない帯').toBeVisible();
    // Then
    const paint = await paintOf(banner);
    expect(paint).toMatchObject({ color: rosePale, background: felt950, underline: '1px', position: 'sticky', marginTop: '0px' });
    expect(paint.weight, '太字ではない（繋がらない帯と区別がつく）').not.toBe('700');
    expectReadable(await scanContrast(page, 5), 5, [pairKey(rosePale!, felt950!)]);
  });

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    test(`Given 進行タイマーの映す表示（${viewport.width}×${viewport.height}） / When 帯が出る / Then 帯は上端で最前面にあり、帯・音の切り替え・盤・横の情報は重ならず、スクロールしても帯は画面の上に留まる（#471）`, async ({
      page,
    }) => {
      // Given: 中継（切断も起こせる）を掛けて進行中にし、映す表示を開く
      const link = await relayToolSyncWithOutage(page, 'agenda');
      await openAgendaTool(page, `notice-agenda-projection-${viewport.width}`);
      await loadSampleAndStart(page);
      await page.setViewportSize(viewport);
      await page.getByRole('button', { name: '映す表示', exact: true }).click();
      await expect(page.locator('.projection')).toBeVisible();
      const toggle = page.locator('.projection .sound-toggle');
      const dial = page.locator('.projection .projection-dial');
      const side = page.locator('.projection .projection-side');
      await expect(toggle, '音の切り替え').toBeVisible();

      /** 要素の中心で最前面にあるのが、その要素（の中）であること */
      const onTop = (loc: Locator) =>
        loc.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return top !== null && el.contains(top);
        });
      const boxesOf = async (...locs: Locator[]) => {
        const boxes = [];
        for (const l of locs) {
          if ((await l.count()) === 0) continue;
          const b = await l.boundingBox();
          expect(b, '箱が測れない').not.toBeNull();
          boxes.push(b!);
        }
        return boxes;
      };
      const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean =>
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      const expectNoOverlap = async (state: string, ...locs: Locator[]) => {
        const boxes = await boxesOf(...locs);
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            expect(overlaps(boxes[i]!, boxes[j]!), `${state}: ${i} 番と ${j} 番の箱が重なっている`).toBe(false);
          }
        }
      };

      // 状態 1: 帯なし。音の切り替えは盤と重ならない。中身（盤と横の情報をまとめた箱）は残りの領域の縦の中央
      // （収まるとき、上端の枠の下の領域の中心と 1px 以内。狭い幅では盤と横の情報が縦に積まれるので、盤だけでは見ない）
      await expect(page.locator('.projection .ui-banner')).toHaveCount(0);
      await expectNoOverlap('帯なし', toggle, dial, side);
      const fits = await page.locator('.projection').evaluate((el) => el.scrollHeight <= el.clientHeight);
      if (fits) {
        const topBox = (await boxesOf(page.locator('.projection .projection-top')))[0]!;
        const [dialBox, sideBox] = await boxesOf(dial, side);
        const contentTop = Math.min(dialBox!.y, sideBox!.y);
        const contentBottom = Math.max(dialBox!.y + dialBox!.height, sideBox!.y + sideBox!.height);
        const areaTop = topBox.y + topBox.height;
        const areaCenter = areaTop + (viewport.height - areaTop) / 2;
        expect(Math.abs((contentTop + contentBottom) / 2 - areaCenter), '中身が残りの領域の縦の中央にない').toBeLessThanOrEqual(1);
      }

      // 状態 2: 同期できていない（1 行）
      link.inject({ type: 'agenda' });
      const banner = page.locator('.projection .ui-banner');
      await expect(banner.filter({ hasText: STALE })).toBeVisible();
      expect(await onTop(banner), '映す表示が帯を覆っている').toBe(true);
      expect(await onTop(toggle), '帯が音の切り替えを覆っている').toBe(true);
      await expectNoOverlap('同期できていない', banner, toggle, dial, side);

      // 状態 3: 繋がらない（狭い画面では 3 行）。切って、以後の接続も成立させない
      await link.cut();
      await expect(banner.filter({ hasText: UNREACHABLE }), '繋がらない帯').toBeVisible({ timeout: 45_000 });
      expect(await onTop(banner), '映す表示が帯を覆っている').toBe(true);
      expect(await onTop(toggle), '帯が音の切り替えを覆っている').toBe(true);
      await expectNoOverlap('繋がらない', banner, toggle, dial, side);
      const bannerBox = (await boxesOf(banner))[0]!;
      expect(bannerBox.width, '帯が全幅でない').toBeGreaterThanOrEqual(viewport.width - 1);
      expect(bannerBox.y, '帯が上端にない').toBeLessThanOrEqual(1);

      // 縦にスクロールしても帯は画面の上に留まる（sticky）
      await page.locator('.projection').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      const scrolled = (await boxesOf(banner))[0]!;
      expect(scrolled.y, 'スクロールで帯が画面の上から外れた').toBeLessThanOrEqual(1);
      expect(scrolled.y + scrolled.height, 'スクロールで帯が画面の外へ出た').toBeGreaterThan(0);
      expect(await onTop(banner), 'スクロール後に帯が覆われている').toBe(true);
    });
  }

  test('Given 進行タイマーの同期サーバーへ繋がらない / When 開く / Then 繋がらない帯は太い下線と太字で区別され、AA を満たす（#471）', async ({
    page,
  }) => {
    // Given: 進行タイマーを一度開いて、端末に同一性を残す
    await openAgendaTool(page, 'notice-agenda-down');
    // When: 進行タイマーの接続だけを成立させないようにして、開き直す
    await toolSyncIsDown(page, 'agenda');
    await page.reload();
    const [rosePale, felt950] = await resolveColors(page, ['--rose-pale', '--felt-950']);

    const banner = page.getByRole('alert').filter({ hasText: UNREACHABLE });
    await expect(banner, '繋がらない帯').toBeVisible();
    expect(await paintOf(banner)).toMatchObject({
      color: rosePale,
      background: felt950,
      weight: '700',
      underline: '2px',
      position: 'sticky',
      marginTop: '0px',
    });
    expectReadable(await scanContrast(page, 1), 1, [pairKey(rosePale!, felt950!)]);
  });

  test('Given 玄関のハブへ繋がらない / When 玄関を開く / Then 告知（エラーの一言）は淡い赤で、AA を満たす', async ({
    page,
  }) => {
    // Given: ハブの接続だけを成立させない（`landing.spec.ts` の `hubSyncIsDown` と同じ形）
    await page.routeWebSocket(
      (url) => url.pathname === '/ws' && !url.searchParams.has('tool'),
      (ws) => {
        void ws.close();
      },
    );
    // When
    await page.goto('/');
    const [rosePale] = await resolveColors(page, ['--rose-pale']);

    const notice = page.getByRole('alert').filter({ hasText: UNREACHABLE });
    await expect(notice, '繋がらないことの告知').toBeVisible();
    // Then その1: 字は --rose-pale（写しの --rose-bright は、羅紗の最も明るい停止点 felt-700 の上で AA を割る）
    expect((await paintOf(notice)).color, '玄関のエラーの字の色').toBe(rosePale);
    // Then その2: 画面の文字がすべて読める
    expectReadable(await scanContrast(page, 5), 5, []);
  });
});
