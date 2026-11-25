/**
 * 進行役ルーレットの結果を Markdown でコピーして持ち出す（#676）。
 *
 * **タグを付けない（`local` 専用）。** 見るのはコピーの成功と失敗の経路・中身で、本番の煙には要らない
 * （クリップボードの権限・`navigator.clipboard` の差し替えを本番に当てない。`roulette.spec.ts` の `@core` の本は本番にも当たる）。
 * ルームは 1 つだけ作る（2 人 → 順番に回す → 押して止める → 失敗の欄 → 決め方を変えて消える）。
 * B は動きを減らす設定にして、回さずに結果を出す経路も通す。
 */
import { expect, test } from '../fixtures/test';
import { addRouletteGuest, joinRouletteTool, openRouletteTool, roulettePhrase, spinButton, SPIN_WAIT_MS, spinWaitMs } from '../support/roulette';

const NAME_A = 'md-roulette-a';
const NAME_B = 'md-roulette-b';
/** 2 人以上の結果（#401）。止まった順に「{名前} さん」を「、」でつなぐ */
const GROUP_RESULT = /^選ばれたのは (.+) さんです$/;
/** 結果のコピー（#676）の名前と文言 */
const COPY_NAME = '結果をコピー';
const MANUAL_FIELD = '手動コピー用の Markdown';
/** 見出しの行は日時（この端末で結果を最初に出した時刻）が入るので正規表現で、残りは行ごとに比べる */
const MD_HEADING = /^## 進行役ルーレットの結果（\d{4}-\d{2}-\d{2} \d{2}:\d{2}）$/;
function expectMarkdown(text: string, rest: string[], message: string): void {
  const [head, ...lines] = text.split('\n');
  expect(head, `${message}: 見出し`).toMatch(MD_HEADING);
  expect(lines, message).toEqual(['', ...rest]);
}

/**
 * @requirements #676
 */
test.describe('ルーレットの結果は Markdown でコピーできる', () => {
  test('Given 3 人が同じルームにいる / When 結果が出てコピーする / Then 決め方ごとの Markdown がクリップボードに入り、失敗なら手で選べる欄に同じ文が出る', async ({
    page,
    openPeer,
    consoleWatcher,
  }) => {
    // 2 人・順番に回す 2 回・押して止めるの回転を足すので、既定の上限（60 秒）を延ばす
    test.setTimeout(test.info().timeout + 40_000);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const copyButton = (p: typeof page) => p.getByRole('button', { name: COPY_NAME });
    const clipboardText = () => page.evaluate(() => navigator.clipboard.readText());

    // Given: A がルームを作り、B（動きを減らす設定）が入る。席を 3 つにする
    const inviteUrl = await openRouletteTool(page, NAME_A);
    const peer = await openPeer('roulette-markdown-b');
    await peer.page.emulateMedia({ reducedMotion: 'reduce' });
    await joinRouletteTool(peer.page, inviteUrl, NAME_B);
    await addRouletteGuest(page, 'Mika');
    await expect(page.getByRole('checkbox')).toHaveCount(3);
    await expect(peer.page.getByRole('checkbox')).toHaveCount(3);

    // 2 人を選ぶ（1 回で決める）。回している間は出ず、止まったら A にも B にも出る
    const pickButton = (p: typeof page, k: number) => p.getByRole('group', { name: '選ぶ人数' }).getByRole('button', { name: `${k} 人` });
    await pickButton(page, 2).click();
    await expect(pickButton(peer.page, 2), 'B にも人数が届く').toHaveAttribute('aria-pressed', 'true');
    await spinButton(page).click();
    await expect(roulettePhrase(page), '2 人: A は回している最中').toHaveText(`${NAME_A} さんが回しました`);
    await expect(copyButton(page), '2 人: 回している間はコピーが出ない').toHaveCount(0);
    await expect(roulettePhrase(page), '2 人: A の結果').toHaveText(GROUP_RESULT, { timeout: spinWaitMs(2) });
    const pair = (GROUP_RESULT.exec((await roulettePhrase(page).textContent()) ?? '')?.[1] ?? '').split(' さん、');
    expect(pair, '2 人: 選ばれたのは 2 人').toHaveLength(2);
    await expect(copyButton(page), '2 人: 止まったらコピーが出る').toBeVisible();
    await expect(copyButton(peer.page), '2 人: B にも出る').toBeVisible();
    await copyButton(page).click();
    await expect(page.getByRole('status').filter({ hasText: 'コピーしました' })).toBeVisible();
    expectMarkdown(await clipboardText(), ['- 決め方：1 回で決める', '- 選ばれた人：', `  1. ${pair[0]}`, `  2. ${pair[1]}`], '2 人: コピーした Markdown');

    // 順番に回す: 2 回回して 1 番・2 番を決め、最後の 1 人は回さずに出る。1 番から 3 番までの順に入る
    const modeButton = (p: typeof page, name: string) => p.getByRole('group', { name: '決め方' }).getByRole('button', { name });
    await modeButton(page, '順番に回す').click();
    await expect(modeButton(peer.page, '順番に回す'), 'B にも決め方が届く').toHaveAttribute('aria-pressed', 'true');
    const orderButton = (p: typeof page, name: string) => p.getByRole('button', { name, exact: true });
    const turns: string[] = [];
    for (const turn of [1, 2]) {
      await orderButton(page, '次の人を決める').click();
      const result = new RegExp(`^${turn} 番は (.+) さんです$`);
      await expect(roulettePhrase(page), `${turn} 番: A の結果`).toHaveText(result, { timeout: SPIN_WAIT_MS });
      const text = (await roulettePhrase(page).textContent()) ?? '';
      await expect(roulettePhrase(peer.page), `${turn} 番: B も同じ人`).toHaveText(text);
      turns.push(result.exec(text)?.[1] ?? '');
    }
    await orderButton(page, '最後の 1 人').click();
    await expect(roulettePhrase(page), '最後の人').toHaveText(/^最後は (.+) さんです$/);
    turns.push(/^最後は (.+) さんです$/.exec((await roulettePhrase(page).textContent()) ?? '')?.[1] ?? '');
    expect(new Set(turns).size, '3 人がそれぞれ 1 度ずつ').toBe(3);
    await copyButton(page).click();
    expectMarkdown(await clipboardText(), ['- 決め方：順番に回す', '- 順番：', ...turns.map((name, i) => `  ${i + 1}. ${name}`)], '順番: コピーした Markdown');

    // 押して止める: B が止めた人が入る。コピーに失敗したら、同じ Markdown を手で選べる欄に出す
    await modeButton(page, '止めて決める').click();
    await expect(modeButton(peer.page, '止めて決める'), 'B にも決め方が届く').toHaveAttribute('aria-pressed', 'true');
    await orderButton(page, 'ルーレットを回す').click();
    await expect(roulettePhrase(page), '押して止める: 回っている').toHaveText('止めると、指している人に決まります');
    await orderButton(peer.page, '止める').click();
    const stopped = new RegExp(`^${NAME_B} さんが止めました。(.+) さんに決まりました$`);
    await expect(roulettePhrase(page), '押して止める: A は寄せてから同じ人').toHaveText(stopped, { timeout: 5000 });
    const stoppedName = stopped.exec((await roulettePhrase(page).textContent()) ?? '')?.[1] ?? '';
    await copyButton(page).click();
    expectMarkdown(await clipboardText(), ['- 決め方：止めて決める', `- 選ばれた人：${stoppedName}`], '押して止める: コピーした Markdown');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
      document.execCommand = () => false;
    });
    await copyButton(page).click();
    await expect(page.getByRole('status').filter({ hasText: 'コピーできませんでした' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: MANUAL_FIELD }), '失敗: 手で選べる欄が出る').toBeVisible();
    expectMarkdown(await page.getByRole('textbox', { name: MANUAL_FIELD }).inputValue(), ['- 決め方：止めて決める', `- 選ばれた人：${stoppedName}`], '失敗: 手で選べる欄に同じ Markdown');

    // 結果が出なくなる（決め方を変える）と、操作も欄も消える
    await modeButton(page, '1 回で決める').click();
    await expect(page.getByRole('textbox', { name: MANUAL_FIELD })).toHaveCount(0);
    await expect(copyButton(page)).toHaveCount(0);

    expect(consoleWatcher.errors).toEqual([]);
    expect(peer.console.errors).toEqual([]);
  });
});
