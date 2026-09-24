/**
 * お題ツール（#91 PR 2）。
 *
 * **タグを付けない（`local` 専用）。** 本番にはまだ `/topic/` が無い（配布は #91 の PR 3 の後に 1 回）。
 * `@core` を付けると `pnpm e2e:prod` が現行の本番に対して落ちる。付けるかどうかは配布の段で決める。
 *
 * お題の文面は**書体の常用の層に収まるもの**を使う（`3 のときは Fizz を出す`。`倍`・`返` は外れる）。
 * 利用者の内容で拡張の層を引くのは正しい振る舞いだが、書体の検査が UI の劣化と区別できなくなる。
 */
import { expect, test } from '../fixtures/test';
import { expectFocusVisibleOnTab, expectReadable, scanContrast } from '../support/a11y';
import { currentTopic, openTopicTool, setTopic } from '../support/topic';

const TITLE = 'FizzBuzz';
const BODY = '3 のときは Fizz を出す';

test.describe('お題を玄関へ配る', () => {
  test('Given 2 人が同じルームに居る / When 片方がお題ツールでお題にする / Then もう片方の玄関にタイトルが出て、下ろすと消える', async ({ page, openPeer, consoleWatcher }) => {
    // Given: 2 人目は玄関の選択画面に居る（別の文脈で開く。同じ文脈だと 1 人目として復帰する）
    const inviteUrl = await openTopicTool(page, 'e2e-topic-a');
    const guest = await openPeer('topic-guest');
    await guest.page.goto(inviteUrl);
    await guest.page.getByLabel('あなたの名前').fill('e2e-topic-b');
    await guest.page.getByRole('button', { name: '参加する' }).click();
    const tools = guest.page.getByRole('region', { name: '道具を選ぶ' });
    await expect(tools.getByRole('list', { name: 'ツール' })).toBeVisible();

    // When
    await setTopic(page, TITLE, BODY);

    // Then その1: タイトルだけが出る（説明は出さない）
    await expect(tools.getByText(TITLE, { exact: true })).toBeVisible();
    await expect(guest.page.getByText(BODY)).toHaveCount(0);
    //   新しい 1 行も読めること（玄関の走査は札の文字を含む）
    expectReadable(await scanContrast(guest.page, 5), 5, []);

    // Then その2: 下ろすと消える（**出ていたことを上で確かめてから**消えたことを見る。
    //   領域ごと消えても否定は通るので、領域と札が見えていることも合わせて見る）
    await page.getByRole('button', { name: 'お題を下ろす' }).click();
    await expect(tools.getByText(TITLE, { exact: true })).toHaveCount(0);
    await expect(tools.getByRole('list', { name: 'ツール' })).toBeVisible();

    // Then その3: 後から開いた玄関にも、いまのお題が届く（参加・復帰の直後に 1 通）
    await setTopic(page, TITLE, BODY);
    await guest.page.reload();
    await expect(guest.page.getByRole('region', { name: '道具を選ぶ' }).getByText(TITLE, { exact: true })).toBeVisible();

    // どちらの画面も例外を出していない
    expect(consoleWatcher.errors).toEqual([]);
    expect(guest.console.errors).toEqual([]);
  });

  test('Given お題ツールに居る人 / When 玄関の参加者を見る / Then 札の名前で居場所が出る', async ({ page, openPeer }) => {
    // Given: お題ツールに 1 人目が居る
    const inviteUrl = await openTopicTool(page, 'e2e-topic-a');
    const guest = await openPeer('topic-guest');

    // When: 2 人目が招待リンクから玄関で名乗って参加する
    await guest.page.goto(inviteUrl);
    await guest.page.getByLabel('あなたの名前').fill('e2e-topic-b');
    await guest.page.getByRole('button', { name: '参加する' }).click();

    // Then: 生の ID（「topic にいます」）で出ない
    await expect(guest.page.getByRole('list', { name: '参加者' })).toContainText('Topic Board にいます');
  });
});

test.describe('お題ツールの入口', () => {
  test('Given 名乗っていない人 / When お題ツールの URL を直接開く / Then 玄関のそのルームで名乗りを求められる', async ({ page, openPeer }) => {
    // Given: ルームは在る（1 人目が作る）
    const inviteUrl = await openTopicTool(page, 'e2e-topic-a');
    const code = new URL(inviteUrl).searchParams.get('room')!;
    const stranger = await openPeer('topic-stranger');
    // When: 復帰の組を持たない別の文脈で、お題ツールを直接開く
    await stranger.page.goto(`/topic/?room=${encodeURIComponent(code)}`);
    // Then: 玄関のそのルームへ送り返され、コードを失っていない
    await expect(stranger.page.getByRole('button', { name: '参加する' })).toBeVisible();
    expect(new URL(stranger.page.url()).pathname).toBe('/');
    expect(new URL(stranger.page.url()).searchParams.get('room')).toBe(code);
  });
});

test.describe('お題ツールの文字と書体', () => {
  test('Given お題を出した画面 / When 文字を測る / Then すべて AA を満たし、常用の層の書体だけを読める', async ({ page }) => {
    // Given（何を取得したかを記録する）
    const fonts: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('.woff2')) fonts.push(request.url().split('/').pop() ?? request.url());
    });
    await openTopicTool(page, 'a11y-topic');
    await setTopic(page, TITLE, BODY);
    await expect(currentTopic(page)).toContainText(BODY);

    // When / Then その1: 文字が読める（象牙の札の上の字も含む）
    expectReadable(await scanContrast(page, 10), 8, []);

    // Then その2: 何かは取っていて、拡張の層を引いていない
    expect(fonts.length, `書体を 1 つも取っていない（${fonts.join(', ')}）`).toBeGreaterThan(0);
    const ext = fonts.filter((f) => f.includes('-ext-') || f.includes('-ext.'));
    expect(ext, `常用の層に無い字が画面に出ている（${ext.join(', ')}）`).toEqual([]);

    // Then その3: 取りにいった書体が、書体として読めている（#297：URL を数えるだけでは全滅を緑と判定した）
    const faces = await page.evaluate(async () => {
      await document.fonts.ready;
      return Array.from(document.fonts)
        .filter((face) => face.status !== 'unloaded')
        .map((face) => `${face.family} ${face.weight} ${face.status}`);
    });
    expect(faces.filter((f) => f.endsWith(' error')), `読めなかった書体（${faces.join(', ')}）`).toEqual([]);
    expect(faces.filter((f) => f.endsWith(' loaded')).length, `読めた書体が無い（${faces.join(', ')}）`).toBeGreaterThan(0);
  });

  test('Given お題ツール / When Tab で送る / Then 当たった操作要素に輪郭が出る', async ({ page }) => {
    await openTopicTool(page, 'focus-topic');
    await expectFocusVisibleOnTab(page);
  });
});
