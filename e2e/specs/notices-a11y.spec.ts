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
import { openTopicTool } from '../support/topic';

type Tool = 'poker' | 'topic';

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
    expect(paint.weight, '繋がらない帯と同じ太字になっている').not.toBe('700');

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
    expect(paint.weight, '繋がらない帯と同じ太字になっている').not.toBe('700');

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
