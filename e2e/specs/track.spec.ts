/**
 * うちわけ（#476）。
 *
 * - `@core` — 全員の画面で同じ内訳を積み上げること。**本番にうちわけが入った後の `pnpm e2e:prod` が見る前提**で、
 *   配布の前の本番に当てると落ちる（`/track/` がまだ無い。`deploy/track/NOTES.md`）。配布の前に落ちるのはこの `@core` と、
 *   `/track/` を並べた `@smoke`（`routing.spec.ts`・`site-exterior.spec.ts`）である。
 *   タグは describe のタイトルの先頭に置く（`e2e/tests/spec-tags.test.ts`）。
 *
 * **ルームを作るのはこの 1 本だけ**（ルームの増分は +1）。
 * 「誰が操作したかを配らない」は DOM では確かめられない（画面が参照しない余剰のフィールドは描かれない）ので、
 * 受けた WS のフレームを JSON として読み、構造で判定する（文字列の含みでは見ない）。
 * 実時間の待ち（90 分の知らせ・全員切断の猶予）は待たない。`apps/tasuki-sync` と `packages/track-core` の偽の時計の検査が持つ。
 */
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { expectScreenAcrossWidths } from '../support/a11y';
import { parseFrames, watchWebSocketFrames, type FrameLog } from '../support/ws-frames';
import { candidate, joinTrackTool, nowPanel, openTrackTool, segments, startWork, switchPanel, totalsRow } from '../support/track';

const NAME_A = 'e2e-track-a';
const NAME_B = 'e2e-track-b';

/** 受けた `track` フレームの状態（受けた順）。 */
function trackStates(log: FrameLog): Record<string, unknown>[] {
  return parseFrames(log.payloads).flatMap((f) => {
    const o = f as { type?: unknown; state?: unknown };
    return o.type === 'track' && typeof o.state === 'object' && o.state !== null ? [o.state as Record<string, unknown>] : [];
  });
}

/** いまの区切りの名前（「いまやっていること」の区画の中の名前）。 */
const nowName = (page: Page) => nowPanel(page).locator('.track-now-name');

/**
 * @requirements #476
 */
test.describe('@core うちわけは全員の画面で同じ内訳を積み上げる', () => {
  test('Given 2 人が同じルームでうちわけを開く / When 開始・切り替え・取り消し・休憩・停止・手直し・コピーをする / Then 両方の画面が同じ内訳になり、誰が操作したかは配られない', async ({
    page,
    openPeer,
    context,
    browserName,
  }) => {
    // Given: A がルームを作ってうちわけを開き、B は別の文脈で招待 URL から入る
    // WebKit では書き込み許可を付けられない。コピー操作のクリック自体で書き込む。
    await context.grantPermissions(browserName === 'webkit' ? ['clipboard-read'] : ['clipboard-read', 'clipboard-write']);
    const inviteUrl = await openTrackTool(page, NAME_A);
    const peer = await openPeer('track-b');
    const receivedB = watchWebSocketFrames(peer.page);
    await joinTrackTool(peer.page, inviteUrl, NAME_B);
    const b = peer.page;
    await expect(nowPanel(page)).toContainText('計測していません');
    await expect(nowPanel(b)).toContainText('計測していません');

    // When / Then その1: A が「設計」で開始 → 両方の画面で「設計」を計測中になる
    await startWork(page, '設計');
    await expect(nowName(page)).toHaveText('設計');
    await expect(nowName(b)).toHaveText('設計');
    await expect(segments(b)).toHaveCount(1);

    // When / Then その2: 1 秒より長く置いてから、B が「実装」へ切り替える → A の画面も「実装」になり、区切りは 2 つ
    await expect.poll(async () => (await nowPanel(b).locator('.track-digits').textContent()) ?? '', { message: '経過が 2 秒を超える' }).toMatch(/0:00:0[2-9]/);
    await startWork(b, '実装');
    await expect(nowName(page)).toHaveText('実装');
    await expect(segments(page)).toHaveCount(2);
    await expect(totalsRow(page, '設計')).toBeVisible();

    // When / Then その3: A が取り消す → 両方の画面で「設計」が計測中へ戻り、区切りは 1 つ
    await nowPanel(page).getByRole('button', { name: '取り消す', exact: true }).click();
    await expect(nowName(page)).toHaveText('設計');
    await expect(nowName(b)).toHaveText('設計');
    await expect(segments(b)).toHaveCount(1);

    // When / Then その4: もう一度「実装」へ切り替え、候補に「設計」が出る。数字キーの 1 で「設計」へ戻れる
    await expect.poll(async () => (await nowPanel(b).locator('.track-digits').textContent()) ?? '').toMatch(/0:00:0[3-9]|0:00:[1-5]\d/);
    await startWork(b, '実装');
    await expect(nowName(page)).toHaveText('実装');
    await expect(candidate(page, '設計')).toBeVisible();
    await expect.poll(async () => (await nowPanel(page).locator('.track-digits').textContent()) ?? '').toMatch(/0:00:0[2-9]/);
    // 入力欄からフォーカスを外してから押す（入力中の数字は拾わない）。
    // 数字キーは押せる候補だけに振る（いま計測中の「実装」は一覧に残るが番号を持たない）ので、「設計」の番号は一覧の表示から読む
    await page.getByRole('heading', { level: 1, name: 'うちわけ', exact: true }).click();
    const designNumber = await candidate(page, '設計').locator('.track-candidate-number').textContent();
    expect(designNumber, '「設計」の候補に番号がある').toMatch(/^[1-9]$/);
    await expect(nowName(b)).toHaveText('実装');
    await page.keyboard.press(designNumber!);
    await expect(nowName(b)).toHaveText('設計');

    // When / Then その5: A が「休憩にする」→ 両方の画面で休憩になり、うちわけの表の「休憩」の行が進む
    await expect.poll(async () => (await nowPanel(page).locator('.track-digits').textContent()) ?? '').toMatch(/0:00:0[2-9]/);
    await nowPanel(page).getByRole('button', { name: '休憩にする', exact: true }).click();
    await expect(nowName(b)).toHaveText('休憩');
    await expect(totalsRow(b, '休憩')).toBeVisible();

    // When / Then その6: B が「止める」→ 両方の画面で計測していない状態になる
    await expect.poll(async () => (await nowPanel(b).locator('.track-digits').textContent()) ?? '').toMatch(/0:00:0[2-9]/);
    await nowPanel(b).getByRole('button', { name: '止める', exact: true }).click();
    await expect(nowPanel(page)).toContainText('計測していません');
    await expect(nowPanel(b)).toContainText('計測していません');
    const closedCount = await segments(page).count();
    expect(closedCount, '閉じた区切りが残っている').toBeGreaterThanOrEqual(3);
    await expect(segments(b)).toHaveCount(closedCount);

    // When / Then その7: A が最初の区切りの名前を直す → B の時系列と表にも出る
    await segments(page).first().getByRole('button', { name: /を直す$/ }).click();
    const editor = segments(page).first();
    await editor.getByLabel('作業名', { exact: true }).fill('要件の整理');
    await editor.getByRole('button', { name: '名前と種類を変える', exact: true }).click();
    await expect(segments(b).first()).toContainText('要件の整理');
    await expect(totalsRow(b, '要件の整理')).toBeVisible();

    // When / Then その8: Markdown をコピーする → 表と時系列が入り、直した名前が載っている
    await page.getByRole('button', { name: 'Markdown でコピー', exact: true }).click();
    await expect(page.getByText('コピーしました')).toBeVisible();
    const markdown = await page.evaluate(() => navigator.clipboard.readText());
    expect(markdown.startsWith('## うちわけ（'), '見出しから始まる').toBe(true);
    expect(markdown).toContain('| 作業 | 時間 | 割合 |');
    expect(markdown).toContain('### 時系列');
    expect(markdown).toContain('要件の整理');
    expect(markdown, 'コピーに参加者の名前を含めない').not.toContain(NAME_A);
    expect(markdown, 'コピーに参加者の名前を含めない').not.toContain(NAME_B);

    // Then その9: B が受けた track のフレームのどれにも、操作した人を表す値が無い（決まった項目だけを持つ）
    const states = trackStates(receivedB);
    expect(states.length, 'track のフレームを受けている').toBeGreaterThan(5);
    const STATE_KEYS = ['epochWallMs', 'nowMs', 'pinned', 'resumeOffer', 'rev', 'segments', 'undo'];
    const SEGMENT_KEYS = ['autoClosed', 'endMs', 'id', 'kind', 'label', 'startMs'];
    for (const state of states) {
      expect(Object.keys(state).sort(), '写しの項目').toEqual(STATE_KEYS);
      for (const segment of state['segments'] as Record<string, unknown>[]) {
        expect(Object.keys(segment).sort(), '区切りの項目').toEqual(SEGMENT_KEYS);
      }
      const dump = JSON.stringify(state);
      expect(dump, '写しに参加者の名前を含めない').not.toContain(NAME_A);
      expect(dump, '写しに参加者の名前を含めない').not.toContain(NAME_B);
    }

    // Then その10: 止まっている画面が、4 つの幅で溢れず、押せる大きさを保つ
    await expectScreenAcrossWidths(page, 'うちわけ（記録あり・止まっている）', 6);

    // When / Then その11: A が記録を消す → 両方の画面から記録が消え、取り消すと戻る
    await page.getByRole('button', { name: '記録を消す', exact: true }).click();
    await page.getByRole('group', { name: '全員の画面から記録を消しますか' }).getByRole('button', { name: '消す', exact: true }).click();
    await expect(segments(b)).toHaveCount(0);
    await nowPanel(b).getByRole('button', { name: '取り消す', exact: true }).click();
    await expect(segments(page)).toHaveCount(closedCount);
  });

  test('Given 記録のあるルーム / When 端末に残す・CSV で保存・ルームなしで記録の画面を開く / Then 一覧に出て読め、CSV が落ち、接続しない', async ({ page }) => {
    // Given: 1 区切り（作業 → 停止）
    await openTrackTool(page, 'e2e-track-saved');
    await startWork(page, '残す作業');
    await expect(nowName(page)).toHaveText('残す作業');
    // 1 秒（MIN_SEGMENT_MS）に満たない区切りは残さない（track-core の stop）。経過が 2 秒を超えてから止める
    await expect.poll(async () => (await nowPanel(page).locator('.track-digits').textContent()) ?? '', { message: '経過が 2 秒を超える' }).toMatch(/0:00:0[2-9]/);
    await nowPanel(page).getByRole('button', { name: '止める', exact: true }).click();
    await expect(segments(page)).toHaveCount(1);

    // (3) CSV で保存: ダウンロードが起き、名前は track-…csv、先頭は BOM（EF BB BF）と見出しの行
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV で保存', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^track-\d{8}-\d{4}\.csv$/);
    const path = await download.path();
    const bytes = await readFile(path);
    expect([...bytes.subarray(0, 3)], 'UTF-8 の BOM').toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.subarray(3).toString('utf8').split('\r\n')[0]).toBe('start_date,start,end_date,end,minutes,kind,label,auto_closed');

    // (1) この端末に残す
    await page.getByRole('button', { name: 'この端末に残す', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'この端末に残しました' })).toBeVisible();

    // ルームの画面からのリンクは新しいタブで開く（元のタブのルームの接続を切らない）
    const popupPromise = page.context().waitForEvent('page');
    await page.getByRole('link', { name: 'この端末の記録', exact: true }).click();
    const popup = await popupPromise;
    await expect(popup.getByRole('heading', { level: 1, name: 'この端末の記録', exact: true })).toBeVisible();
    expect(new URL(popup.url()).searchParams.get('view')).toBe('saved');
    await expect(page.getByRole('heading', { level: 1, name: 'うちわけ', exact: true })).toBeVisible();
    await expect(nowPanel(page)).toBeVisible();
    await popup.close();

    // (2) ルームのコードなしで開く（同じ文脈＝名乗りは端末にある。それでも玄関へ送らず、接続しない）
    const saved = await page.context().newPage();
    let sockets = 0;
    saved.on('websocket', () => (sockets += 1));
    await saved.goto('/track/?view=saved');
    await expect(saved.getByRole('heading', { level: 1, name: 'この端末の記録', exact: true })).toBeVisible();
    expect(new URL(saved.url()).pathname + new URL(saved.url()).search).toBe('/track/?view=saved');

    // (1) 一覧に 1 件。開くと表と時系列が読める
    await expect(saved.locator('[data-saved]')).toHaveCount(1);
    await saved.getByRole('button', { name: /の記録を開く/ }).click();
    await expect(saved.getByRole('region', { name: 'ここまでのうちわけ' }).getByRole('row').filter({ hasText: '残す作業' })).toBeVisible();
    await expect(saved.getByRole('region', { name: '時系列' }).locator('.track-segment')).toHaveCount(1);
    // 記録の画面も、4 つの幅で溢れず、押せる大きさを保つ（一覧・開いた記録・全部消す）
    await expectScreenAcrossWidths(saved, 'この端末の記録（開いた記録）', 6);
    expect(sockets, 'ルームに接続しない（名簿に載らない）').toBe(0);
    await saved.close();
  });

  test('Given うちわけの画面 / When 再読み込みする / Then 計測中の区切りと経過がサーバーの時計から戻る', async ({ page }) => {
    // Given: 計測中
    await openTrackTool(page, 'e2e-track-reload');
    await startWork(page, '調べもの');
    await expect(nowName(page)).toHaveText('調べもの');
    // 再読み込みの前に 4 秒以上計っておく（0 から数え直す実装と、続きから数える実装で、直後の値が分かれるように）
    await expect.poll(async () => (await nowPanel(page).locator('.track-digits').textContent()) ?? '').toMatch(/0:00:0[4-9]/);

    // When
    await page.reload();

    // Then: 0 に戻らず、続きから数えている。**再読み込みの後に最初に描かれた経過**が 4 秒以上（待って追いつくのを許さない）
    await expect(nowName(page)).toHaveText('調べもの');
    const firstShown = (await nowPanel(page).locator('.track-digits').textContent()) ?? '';
    const match = /^0:00:(\d{2})$/.exec(firstShown);
    expect(match, `経過の表示が読める（${firstShown}）`).not.toBeNull();
    expect(Number(match![1]), '再読み込みの直後の経過（秒）').toBeGreaterThanOrEqual(4);
    await expect(segments(page)).toHaveCount(1);
    await expect(switchPanel(page).getByRole('button', { name: '切り替える', exact: true })).toBeVisible();
  });
});
