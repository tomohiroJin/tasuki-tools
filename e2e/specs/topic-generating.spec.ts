/**
 * お題ツールの生成中の見せ方と押せなさ（#665・設計正本 §5.4 の E11 の見直し、同 §11）。
 *
 * **タグを付けない（`local` 専用）。** 生成中は AI の構成でしか起きず、`e2e:prod` に載せる前提が無い。
 *
 * AI 無しの構成では生成中を作れない（設計正本 §7.4・§10.1。AI 無効だと同期サーバーは生成中を立てずに定型へ落とす）。
 * そこで `notices-a11y.spec.ts` と同じく `routeWebSocket` で実サーバーへ中継し、**サーバーが全員へ配る形のフレーム**
 * （`{ type: 'topic', state }`）を差し込む。製品コードにテスト用の経路は作らない。
 * 片方が押す操作そのものは、AI 無しでは作れないので、配られる状態の側から 2 人の画面を見る。
 */
import type { Page, WebSocketRoute } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { joinTopicTool, openTopicTool } from '../support/topic';

const TOPIC_SOCKET = /\/ws\?.*\btool=topic\b/;

const GENERATING = '作っています…';
const AI_BUTTON = 'AI で作る';
const FALLBACK_BUTTON = '定型から選ぶ';
const BUSY_MARK = '作成中';

/** そのページのお題ツールの WS を実サーバーへ中継し、ページへフレームを差し込む口を返す（開く前に掛けること）。 */
async function relay(page: Page): Promise<(frame: unknown) => void> {
  let client: WebSocketRoute | null = null;
  await page.routeWebSocket(TOPIC_SOCKET, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => ws.send(message));
    client = ws;
  });
  return (frame) => {
    expect(client, '中継が接続を掴んでいない').not.toBeNull();
    client!.send(JSON.stringify(frame));
  };
}

const state = (patch: object) => ({
  type: 'topic',
  state: { topic: null, generating: false, degraded: false, aiUnlocked: true, ...patch },
});

/** 作るの欄（たたまれている）を開く。 */
async function openMake(page: Page): Promise<void> {
  await page.getByRole('region', { name: '定型や AI で作る' }).locator('summary').click();
}

test.describe('お題ツールの生成中は作るの欄のボタンが押せない（#665）', () => {
  test('Given 2 人が同じルームに居る / When サーバーが生成中を配る / Then 両方の画面で作るのボタンが押せなくなり、終わると戻る', async ({ page, openPeer }) => {
    // Given: 2 人とも中継を掛けてからお題ツールを開く
    const injectHost = await relay(page);
    const inviteUrl = await openTopicTool(page, 'gen-host');
    const guest = await openPeer('gen-guest');
    const injectGuest = await relay(guest.page);
    await joinTopicTool(guest.page, inviteUrl, 'gen-guest');
    const screens = [page, guest.page];
    const injects = [injectHost, injectGuest];
    for (const p of screens) await openMake(p);

    // When: 生成中が全員へ配られる
    for (const inject of injects) inject(state({ generating: true }));

    // Then: どちらの画面でも、作るのボタンは押せず、押した場所が「作っています…」と言う。知らせ（role="status"）は 1 つだけ
    for (const p of screens) {
      const make = p.getByRole('region', { name: '定型や AI で作る' });
      await expect(make.getByRole('button', { name: GENERATING })).toBeDisabled();
      await expect(make.getByRole('button', { name: FALLBACK_BUTTON })).toBeDisabled();
      await expect(make.getByRole('button', { name: AI_BUTTON })).toHaveCount(0);
      await expect(p.getByRole('status').filter({ hasText: GENERATING })).toHaveCount(1);
      // 自分で書いたお題へ切り替える道は残す
      await p.getByLabel('タイトル').fill('FizzBuzz');
      await expect(p.getByRole('button', { name: '場に出す' })).toBeEnabled();
    }

    // When: 生成が終わる（掲げられた）
    const done = state({ topic: { title: 'FizzBuzz', body: '3 のときは Fizz を出す', source: 'ai' } });
    for (const inject of injects) inject(done);

    // Then: 戻る
    for (const p of screens) {
      const make = p.getByRole('region', { name: '定型や AI で作る' });
      await expect(make.getByRole('button', { name: AI_BUTTON })).toBeEnabled();
      await expect(make.getByRole('button', { name: FALLBACK_BUTTON })).toBeEnabled();
      // 「作っています…」は、幅を取っておくためにボタンの中に隠して置いてある。見えているものが無いことを見る
      await expect(p.getByText(GENERATING).filter({ visible: true })).toHaveCount(0);
      await expect(p.getByRole('status').filter({ hasText: GENERATING })).toHaveCount(0);
    }
  });

  test('Given 作るの欄がたたまれている / When 生成中になる / Then 見出しの横に作成中の印が出て、開くと中のボタンが言い、定型への縮退でも戻る', async ({ page }) => {
    // Given
    const inject = await relay(page);
    await openTopicTool(page, 'gen-fold');
    const make = page.getByRole('region', { name: '定型や AI で作る' });
    await expect(make.locator('details')).not.toHaveAttribute('open');

    // When
    inject(state({ generating: true }));

    // Then: たたんだままでも見出しの横で分かる
    await expect(make.getByText(BUSY_MARK)).toBeVisible();
    await openMake(page);
    await expect(make.getByText(BUSY_MARK)).toBeHidden();
    await expect(make.getByRole('button', { name: GENERATING })).toBeDisabled();

    // When: 定型に落ちて終わる
    inject(state({ degraded: true, topic: { title: 'FizzBuzz', body: '3 のときは Fizz を出す', source: 'fallback' } }));

    // Then
    await expect(make.getByRole('button', { name: AI_BUTTON })).toBeEnabled();
    await expect(make.getByRole('button', { name: FALLBACK_BUTTON })).toBeEnabled();
  });

  test('Given キーボードで「定型から選ぶ」にフォーカスがある / When 生成中になる / Then フォーカスは作るの欄の見出しへ移り、body へ落ちない', async ({ page }) => {
    // Given
    const inject = await relay(page);
    await openTopicTool(page, 'gen-focus');
    await openMake(page);
    const make = page.getByRole('region', { name: '定型や AI で作る' });
    const fallback = make.getByRole('button', { name: FALLBACK_BUTTON });
    await fallback.focus();
    await expect(fallback).toBeFocused();

    // When
    inject(state({ generating: true }));
    await expect(fallback).toBeDisabled();

    // Then
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('SECTION');
    // 待ちきれずに Enter を押しても、欄は開いたまま
    await page.keyboard.press('Enter');
    await expect(make.locator('details')).toHaveAttribute('open', '');
    await expect(make.getByRole('button', { name: FALLBACK_BUTTON })).toBeVisible();
  });

  for (const width of [320, 704, 768, 1024, 1280]) {
    test(`Given 幅 ${String(width)} / When 生成中になる / Then 作っています…のボタンが欄からはみ出さず、ページが横にあふれない`, async ({ page }) => {
      // Given
      await page.setViewportSize({ width, height: 800 });
      const inject = await relay(page);
      await openTopicTool(page, 'gen-fit');
      await openMake(page);
      const make = page.getByRole('region', { name: '定型や AI で作る' });
      // E2E の構成には AI が無く、「AI で作る」は出ない。AI が使えるルームの形（`aiUnlocked`）を先に配って、押せる姿を取ってから生成中にする
      inject(state({}));
      const idle = make.getByRole('button', { name: AI_BUTTON });
      await expect(idle).toBeEnabled();
      const idleBox = await idle.boundingBox();

      // When
      inject(state({ generating: true }));
      const busy = make.getByRole('button', { name: GENERATING });
      await expect(busy).toBeDisabled();

      // Then
      const box = await busy.boundingBox();
      const area = await make.boundingBox();
      expect(box, 'ボタンの箱').not.toBeNull();
      expect(area, '作るの欄の箱').not.toBeNull();
      expect(box!.x, 'ボタンの左端').toBeGreaterThanOrEqual(area!.x - 1);
      expect(box!.x + box!.width, 'ボタンの右端').toBeLessThanOrEqual(area!.x + area!.width + 1);
      // 文言が変わっても、押した場所が逃げない（左端と上端が動かず、高さも変わらない）
      expect(idleBox, '押せるときのボタンの箱').not.toBeNull();
      expect(Math.abs(box!.x - idleBox!.x), `ボタンの左端の動き（${String(idleBox!.x)} → ${String(box!.x)}）`).toBeLessThanOrEqual(1);
      expect(Math.abs(box!.y - idleBox!.y), `ボタンの上端の動き（${String(idleBox!.y)} → ${String(box!.y)}）`).toBeLessThanOrEqual(1);
      expect(Math.abs(box!.height - idleBox!.height), 'ボタンの高さの変化').toBeLessThanOrEqual(1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, '横のあふれ').toBeLessThanOrEqual(0);
    });
  }
});
