/**
 * 全員を同じ道具へ呼ぶ（#677・タグ無し = `local` 専用。実ルームの枠を使う）。
 *
 * 決めたことの正本は `docs/superpowers/plans/2026-11-27-room-call.md`。ここは実ブラウザで、次がつながっていることを見る。
 *
 * - 玄関で道具を選んで「呼んで移る」を押すと、呼んだ人はその道具へ移り、ほかの道具にいる人・玄関にいる人に知らせが出る
 * - 知らせの「移る」で同じルームのその道具へ移る。「閉じる」ならいまの画面のまま
 * - その道具に既にいる人・呼んだ本人には出ない。切断中の人には届かず、戻ってきても出ない（呼びかけは保存しない）
 * - 5 秒たたないうちに同じルームで呼ぶと、押した人に待つよう伝え、移らない
 *
 * 宛先・連打の規則の単体は `apps/tasuki-sync/test/room-call.test.ts`・`hub-room-call.test.ts`、実 WS は `live-ws.room-call.test.ts`。
 */
import { expect, test } from '../fixtures/test';
import type { Locator, Page } from '@playwright/test';

/** 選択画面のツールの札（ほかの spec の支援と同じ引き方）。 */
function toolCard(page: Page, name: string): Locator {
  return page.getByRole('list', { name: 'ツール' }).getByRole('link', { name: new RegExp(name) });
}

/** 呼びかけの知らせ（`RoomCallNotice`）。 */
function callNotice(page: Page): Locator {
  return page.locator('.ui-call');
}

/** 玄関でルームを作り、参加用 URL を返す。 */
async function createHubRoom(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('ルーム名').fill('呼びかけの回帰');
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: 'ルームを作る' }).click();
  await expect(page.getByRole('list', { name: 'ツール' })).toBeVisible();
  return page.getByLabel('参加用 URL').inputValue();
}

/** 参加用 URL を玄関で開いて名乗り、選択画面に着く。 */
async function joinHub(page: Page, url: string, name: string): Promise<void> {
  await page.goto(url);
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: '参加する' }).click();
  await expect(page.getByRole('list', { name: 'ツール' })).toBeVisible();
}

/** 呼んだ人の選択画面の名簿に「{道具名} にいます」が出るまで待つ（サーバーがその接続を数えている）。 */
async function expectWhere(page: Page, name: string, toolName: string): Promise<void> {
  const row = page.getByRole('list', { name: '参加者' }).getByRole('listitem').filter({ hasText: name });
  await expect(row).toContainText(`${toolName} にいます`);
}

/** 玄関の「みんなを呼ぶ」で道具を選んで押す。 */
async function callEveryone(page: Page, toolName: string): Promise<void> {
  await page.getByLabel('呼ぶ道具').selectOption({ label: toolName });
  await page.getByRole('button', { name: '呼んで移る' }).click();
}

test.describe('玄関から全員を同じ道具へ呼ぶ', () => {
  test('Given 玄関・poker・お題・切断中の 4 人 / When 玄関から poker へ呼ぶ / Then 呼んだ人は poker へ移り、お題と玄関の人にだけ知らせが出て、「移る」で poker へ着く', async ({
    page,
    openPeer,
  }) => {
    const url = await createHubRoom(page, 'あや');
    const code = new URL(url).searchParams.get('room')!;

    const inPoker = await openPeer('room-call-in-poker');
    await joinHub(inPoker.page, url, 'いずみ');
    await toolCard(inPoker.page, 'Planning Poker').click();
    await expect(inPoker.page.getByRole('heading', { name: 'プランニングポーカー' })).toBeVisible();

    const inTopic = await openPeer('room-call-in-topic');
    await joinHub(inTopic.page, url, 'うみ');
    await toolCard(inTopic.page, 'Topic Board').click();
    await expect(inTopic.page.getByRole('heading', { level: 1, name: 'お題', exact: true })).toBeVisible();

    const inHub = await openPeer('room-call-in-hub');
    await joinHub(inHub.page, url, 'えま');

    // 切断中の人: 玄関に入ってからページを離れる（端末の組は文脈に残るので、あとで同じ人として戻れる）
    const away = await openPeer('room-call-away');
    await joinHub(away.page, url, 'おと');
    await away.page.goto('about:blank');

    await expectWhere(page, 'いずみ', 'Planning Poker');
    await expectWhere(page, 'うみ', 'Topic Board');
    await expect(
      page.getByRole('list', { name: '参加者' }).getByRole('listitem').filter({ hasText: 'おと' }),
    ).toContainText('切断中');

    await callEveryone(page, 'Planning Poker');

    // 呼んだ人は受け付けを受けて poker へ移る（同じルーム）
    await expect.poll(() => new URL(page.url()).pathname, { message: '呼んだ人の行き先' }).toBe('/poker/');
    expect(new URL(page.url()).searchParams.get('room')).toBe(code);
    await expect(page.getByRole('heading', { name: 'プランニングポーカー' })).toBeVisible();

    // お題・玄関にいる人には知らせが出る
    for (const peer of [inTopic.page, inHub.page]) {
      await expect(callNotice(peer)).toContainText('あや');
      await expect(callNotice(peer)).toContainText('さんが Planning Poker に呼んでいます');
    }
    // 呼びかけは自動では移さない
    expect(new URL(inTopic.page.url()).pathname).toBe('/topic/');

    // poker に既にいる人と、呼んだ本人には出ない（知らせが届いた後で数える）
    await expect(callNotice(inPoker.page)).toHaveCount(0);
    await expect(callNotice(page)).toHaveCount(0);

    // 「移る」で同じルームの poker へ
    await callNotice(inTopic.page).getByRole('link', { name: '移る' }).click();
    await expect.poll(() => new URL(inTopic.page.url()).pathname, { message: '呼ばれた人の行き先' }).toBe('/poker/');
    expect(new URL(inTopic.page.url()).searchParams.get('room')).toBe(code);
    await expect(inTopic.page.getByRole('heading', { name: 'プランニングポーカー' })).toBeVisible();

    // 切断中だった人は、戻ってきても知らせを受け取らない（呼びかけは保存しない）
    await away.page.goto(url);
    await expect(away.page.getByRole('list', { name: 'ツール' })).toBeVisible();
    await expectWhere(away.page, 'いずみ', 'Planning Poker');
    await expect(callNotice(away.page)).toHaveCount(0);
  });

  test('Given timer にいる人と玄関の 2 人 / When 呼ばれて「閉じる」、続けて 5 秒以内にもう 1 人が呼ぶ / Then timer の画面のまま知らせが消え、2 人目は待つよう伝えられて移らない', async ({
    page,
    openPeer,
  }) => {
    const url = await createHubRoom(page, 'あや');

    const inTimer = await openPeer('room-call-in-timer');
    await joinHub(inTimer.page, url, 'いずみ');
    await toolCard(inTimer.page, 'TDD Mob Pro Timer').click();
    await expect.poll(() => new URL(inTimer.page.url()).pathname).toBe('/timer/');

    const second = await openPeer('room-call-second-caller');
    await joinHub(second.page, url, 'うみ');

    await expectWhere(page, 'いずみ', 'TDD Mob Pro Timer');
    await callEveryone(page, 'Agenda Timer');
    await expect.poll(() => new URL(page.url()).pathname, { message: '呼んだ人の行き先' }).toBe('/agenda/');

    // timer の画面に知らせが出る。同期の告知は立たない（知らせを契約より先に見分けている）
    await expect(callNotice(inTimer.page)).toContainText('さんが Agenda Timer に呼んでいます');
    await expect(inTimer.page.getByText('同期できていません', { exact: false })).toHaveCount(0);

    // 「閉じる」ならいまの画面のまま
    await callNotice(inTimer.page).getByRole('button', { name: '閉じる' }).click();
    await expect(callNotice(inTimer.page)).toHaveCount(0);
    expect(new URL(inTimer.page.url()).pathname).toBe('/timer/');

    // 5 秒たたないうちに、同じルームのもう 1 人が呼ぶ → 待つよう伝えられ、玄関のまま
    await expect(callNotice(second.page)).toContainText('さんが Agenda Timer に呼んでいます');
    await callEveryone(second.page, 'Planning Poker');
    await expect(second.page.getByRole('alert').filter({ hasText: '少し待ってから呼んでください。' })).toBeVisible();
    expect(new URL(second.page.url()).pathname).toBe('/');
    // 拒まれた呼びかけは配られない（timer の人に新しい知らせは出ない）
    await expect(callNotice(inTimer.page)).toHaveCount(0);
  });
});
