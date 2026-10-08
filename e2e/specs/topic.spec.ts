/**
 * お題ツール（#91 PR 2・PR 3）。
 *
 * - `@core` — お題が玄関へ届くことと、timer・poker へ届くこと（#91 PR 3 で付けた）。
 *   **本番にお題ツールが入った後の `pnpm e2e:prod` が見る前提**で、配布の前の本番に当てると落ちる。
 *   タグは describe のタイトルの先頭に置く（`e2e/tests/spec-tags.test.ts` が describe の先頭だけを
 *   「タグ付き」と数えるので、テスト名の末尾に置くと「本番へ漏れる local 専用シナリオ」として赤になる）
 * - タグ無し — それ以外（`local` 専用）
 *
 * お題の文面は**書体の常用の層に収まるもの**を使う（`3 のときは Fizz を出す`。`倍`・`返` は外れる）。
 * 利用者の内容で拡張の層を引くのは正しい振る舞いだが、書体の検査が UI の劣化と区別できなくなる。
 */
import { expect, test } from '../fixtures/test';
import { expectFieldsAtLeast16px, expectFocusVisibleOnTab, expectPickerInPage, expectReadable, pairKey, resolveColors, scanContrast } from '../support/a11y';
import { joinRoom as joinPoker } from '../support/poker';
import { joinViaHubAt as joinTimer } from '../support/timer';
import { currentTopic, openTopicTool, setTopic } from '../support/topic';

const TITLE = 'FizzBuzz';
const BODY = '3 のときは Fizz を出す';

/**
 * @requirements #91 E2 E3 E4
 */
test.describe('@core お題を玄関へ配る', () => {
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

    // Then その4: 新規参加でも、いまのお題が届く（その3 は reload による復帰の経路。
    //   こちらは別の文脈から招待 URL で初めて参加する経路で、届く仕組みが違う）
    const newcomer = await openPeer('topic-newcomer');
    await newcomer.page.goto(inviteUrl);
    await newcomer.page.getByLabel('あなたの名前').fill('e2e-topic-c');
    await newcomer.page.getByRole('button', { name: '参加する' }).click();
    await expect(
      newcomer.page.getByRole('region', { name: '道具を選ぶ' }).getByText(TITLE, { exact: true }),
    ).toBeVisible();

    // どの画面も例外を出していない
    expect(consoleWatcher.errors).toEqual([]);
    expect(guest.console.errors).toEqual([]);
    expect(newcomer.console.errors).toEqual([]);
  });
});

/**
 * @requirements #91 E2 E3 E4
 *
 * timer・poker は**読むだけ**（spec T4）。お題ツールで掲げたものが、別の文脈の別のページに出る。
 */
test.describe('@core お題をツールへ配る', () => {
  test('Given 3 人が同じルームの timer・poker・お題ツールに居る / When お題ツールでお題にする・下ろす / Then timer と poker に出て、消える', async ({ page, openPeer, consoleWatcher }) => {
    // Given: 1 人目がお題ツール、2 人目が timer、3 人目が poker（別の文脈。同じ文脈だと 1 人目として復帰する）
    const inviteUrl = await openTopicTool(page, 'e2e-topic-a');
    const timer = await openPeer('topic-timer');
    await joinTimer(timer.page, inviteUrl, 'e2e-topic-b');
    await expect(timer.page.getByRole('button', { name: 'セッションを開始' })).toBeVisible();
    const poker = await openPeer('topic-poker');
    await joinPoker(poker.page, inviteUrl, 'e2e-topic-c');
    //   **掲げる前は出ていない**（下の「出た」が最初から真ではないこと。画面が描けたことは上で見た）
    const timerTopic = timer.page.getByRole('region', { name: 'お題', exact: true });
    const pokerTopic = poker.page.getByRole('region', { name: 'お題', exact: true });
    await expect(timerTopic).toHaveCount(0);
    await expect(pokerTopic).toHaveCount(0);

    // When その1: お題にする
    await setTopic(page, TITLE, BODY);

    // Then その1: timer の札にタイトルと本文が出る
    await expect(timerTopic.getByRole('heading', { level: 3, name: TITLE, exact: true })).toBeVisible();
    await expect(timerTopic.getByText(BODY, { exact: true })).toBeVisible();
    //   poker は見出しとタイトルが出て、本文は読む面（名前はタイトルの region）にそのまま出る
    await expect(pokerTopic.getByRole('heading', { level: 2, name: 'お題', exact: true })).toBeVisible();
    await expect(pokerTopic.getByRole('heading', { level: 3, name: TITLE, exact: true })).toBeVisible();
    await expect(pokerTopic.getByRole('region', { name: TITLE, exact: true }).getByText(BODY, { exact: true })).toBeVisible();

    // When その2: お題を下ろす
    await page.getByRole('button', { name: 'お題を下ろす' }).click();

    // Then その2: どちらの画面からもお題の領域が消える（**出ていたことを上で確かめてから**消えたことを見る。
    //   画面ごと消えても否定は通るので、それぞれの画面が残っていることも合わせて見る）
    await expect(timerTopic).toHaveCount(0);
    await expect(pokerTopic).toHaveCount(0);
    await expect(timer.page.getByRole('button', { name: 'セッションを開始' })).toBeVisible();
    await expect(poker.page.getByRole('heading', { name: 'プランニングポーカー' })).toBeVisible();

    // Then その3: どちらの画面も `topic` フレームを捨てていない（捨てると「同期できていません」を出す・#209・#212）
    await expect(timer.page.getByText(/同期できていません/)).toHaveCount(0);
    await expect(poker.page.getByText(/同期できていません/)).toHaveCount(0);
    //   どの画面も例外を出していない
    expect(consoleWatcher.errors).toEqual([]);
    expect(timer.console.errors).toEqual([]);
    expect(poker.console.errors).toEqual([]);
  });
});

test.describe('お題ツールに居る人の居場所', () => {
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
    // 送り返し自体は例外を出していない
    expect(stranger.console.errors).toEqual([]);
  });
});

test.describe('お題ツールの文字と書体', () => {
  test('Given お題を出した画面 / When 文字を測る / Then すべて AA を満たし、常用の層の書体だけを読める', async ({ page, consoleWatcher }) => {
    // Given（何を取得したかを記録する）
    const fonts: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('.woff2')) fonts.push(request.url().split('/').pop() ?? request.url());
    });
    await openTopicTool(page, 'a11y-topic');
    await setTopic(page, TITLE, BODY);
    await expect(currentTopic(page)).toContainText(BODY);
    // 測ったことを固定する 2 組: 卓の上の見出し（`--gold` on `--felt-900`）と、
    //   読む面（グラデーションの札）の上の字（`--coal`）を測ったことを固定する（レビュー指摘・修正ラウンド 1）。
    //   札の上の見出し（h2「いまのお題」の `--coal-soft`）・タブ・「お題を下ろす」もこの走査に入る（#316）
    const [gold, felt900, coal, sheen, shade] = await resolveColors(page, ['--gold', '--felt-900', '--coal', '--card-sheen', '--card-shade']);
    const cardGround = `rgba(0, 0, 0, 0) + linear-gradient(160deg, ${sheen}, ${shade})`;

    // When / Then その1: 文字が読める（読む面の上の字も含む）
    expectReadable(await scanContrast(page, 10), 8, [pairKey(gold!, felt900!), pairKey(coal!, cardGround)]);

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

    // 画面は例外を出していない
    expect(consoleWatcher.errors).toEqual([]);
  });

  test('Given お題ツール / When Tab で送る / Then 当たった操作要素に輪郭が出る', async ({ page, consoleWatcher }) => {
    await openTopicTool(page, 'focus-topic');
    await expectFocusVisibleOnTab(page);
    // 画面は例外を出していない
    expect(consoleWatcher.errors).toEqual([]);
  });

  test('Given お題ツール / When 言語と難易度のプルダウンを開く / Then 一覧がページの中に卓の地で開く', async ({ page, consoleWatcher }) => {
    // Given
    await openTopicTool(page, 'picker-topic');
    // When / Then（#317：別の窓で開くと、開いた一瞬が白く光る）
    for (const label of ['言語', '難易度']) {
      await expectPickerInPage(page.getByLabel(label, { exact: true }), '--felt-950');
    }
    await expectFieldsAtLeast16px(page);
    // 画面は例外を出していない
    expect(consoleWatcher.errors).toEqual([]);
  });

  for (const width of [320, 1280]) {
    const title = `Given 区切りの無い長いタイトルと長い URL を含む説明 / When 幅 ${width} で表示 / Then 掲げられて横にはみ出さない`;
    test(title, async ({ page, consoleWatcher }) => {
      // Given: 空白の無い 200 字のタイトルと、長い URL を含む説明
      const longTitle = 'FizzBuzz'.repeat(25);
      const longBody = `参照 https://example.com/${'a'.repeat(200)} を見る`;
      await page.setViewportSize({ width, height: 900 });
      // When
      await openTopicTool(page, `overflow-topic-${width}`);
      await setTopic(page, longTitle, longBody);
      // Then その1: 先に正しく掲げられたことを確かめる（「いまのお題」に出た）
      await expect(currentTopic(page).getByRole('heading', { name: longTitle })).toBeVisible();
      // Then その2: 画面が横にはみ出さない
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // 画面は例外を出していない
      expect(consoleWatcher.errors).toEqual([]);
    });
  }
});

/** ユーザーストーリーの形のタイトル（#313 正本 §3 の例。67）。入力欄の値は画面の文言ではないので、書体の層の検査に掛からない。 */
const STORY_TITLE =
  'チームの一員として、スプリントの終わりにふりかえりの結果を一目で見たい。なぜなら、次のスプリントで何を変えるかをその場で決めたいからだ';

test.describe('長いタイトルと広いページ（#313 PR 1）', () => {
  for (const width of [390, 1280]) {
    test(`Given ユーザーストーリーの形のタイトル / When 幅 ${width} で書く / Then 欄の中に隠れず全体が見える`, async ({ page, consoleWatcher }) => {
      // Given
      await page.setViewportSize({ width, height: 900 });
      await openTopicTool(page, `story-topic-${width}`);
      const field = page.getByLabel('タイトル', { exact: true });
      // When
      await field.fill(STORY_TITLE);
      // Then その1: 欄の中にスクロールで隠れた部分が無い（1 行の欄は横に、伸びない欄は縦に隠れる）
      const hidden = await field.evaluate((el) => ({
        x: el.scrollWidth - el.clientWidth,
        y: el.scrollHeight - el.clientHeight,
      }));
      expect(hidden, '欄の中に隠れた部分がある').toEqual({ x: 0, y: 0 });
      // Then その2: 書いた量が数字で出る
      await expect(page.getByText(`${STORY_TITLE.length} / 200`, { exact: true })).toBeVisible();
      // Then その3: 入力欄の字は 16px 以上で、画面は横にはみ出さない
      await expectFieldsAtLeast16px(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // 画面は例外を出していない
      expect(consoleWatcher.errors).toEqual([]);
    });
  }

  test('Given 空のタイトルの欄 / When 見る / Then 2 行ぶんの高さがある', async ({ page }) => {
    // Given
    await openTopicTool(page, 'empty-title-topic');
    const field = page.getByLabel('タイトル', { exact: true });
    // When
    const size = await field.evaluate((el) => ({
      height: el.clientHeight,
      line: parseFloat(getComputedStyle(el).lineHeight),
    }));
    // Then: 内容に合わせて伸ばしても、空の欄が 1 行に潰れない（複数行の欄だと分かる）
    expect(size.height).toBeGreaterThanOrEqual(size.line * 2);
  });

  test('Given 幅 1920 / When お題ツールを開く / Then ページは 1536px で、書くは主の区画の幅いっぱい', async ({ page, consoleWatcher }) => {
    // Given
    await page.setViewportSize({ width: 1920, height: 900 });
    // When
    await openTopicTool(page, 'wide-topic');
    // Then
    const main = await page.getByRole('main').evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        width: el.getBoundingClientRect().width,
        inner: el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight),
      };
    });
    expect(main.width).toBe(1536);
    const write = await page.getByRole('region', { name: '書く' }).boundingBox();
    const column = await page.locator('.ui-workspace-main').boundingBox();
    expect(write?.width).toBeCloseTo(column?.width ?? -1, 0);
    // 画面は例外を出していない
    expect(consoleWatcher.errors).toEqual([]);
  });

  test('Given タイトルの途中にカーソル / When 改行を含む文を差し込んで続けて打つ / Then 打った字は差し込んだ位置に入る', async ({ page, consoleWatcher }) => {
    // Given
    await openTopicTool(page, 'caret-topic');
    const field = page.getByLabel('タイトル', { exact: true });
    await field.fill('AAA BBB');
    await field.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(3, 3));
    // When: 貼り付けと同じく、改行を含む文を 1 度に差し込む
    await page.keyboard.insertText('x\ny');
    await page.keyboard.type('Z');
    // Then: 改行は空白になり、カーソルは末尾へ飛んでいない
    await expect(field).toHaveValue('AAAx yZ BBB');
    // 画面は例外を出していない
    expect(consoleWatcher.errors).toEqual([]);
  });

  test('Given タイトルを書いた / When タイトルの欄で Enter / Then このお題になる', async ({ page, consoleWatcher }) => {
    // Given
    await openTopicTool(page, 'enter-topic');
    const field = page.getByLabel('タイトル', { exact: true });
    await field.fill(TITLE);
    // When
    await field.press('Enter');
    // Then
    await expect(currentTopic(page).getByRole('heading', { name: TITLE })).toBeVisible();
    await expect(field).toHaveValue('');
    // 画面は例外を出していない
    expect(consoleWatcher.errors).toEqual([]);
  });
});

/** 見出しと箇条書きを持つ説明。書体の層の検査に掛かるので英数字で書く。 */
const MD_BODY = ['# Rules', '', '- fizz', '- buzz'].join('\n');

test.describe('説明のプレビュー（#313 PR 2）', () => {
  test('Given 幅 1280 / When 説明を書く / Then 下書きの見え方が右の読む面に出て、欄の中のプレビューと切り替えは出ない', async ({ page, consoleWatcher }) => {
    // Given
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTopicTool(page, 'side-topic');
    const field = page.getByLabel('説明（なくてもよい）');
    const reader = currentTopic(page);
    // When: 書き始めると、読む面が下書きの見え方へ切り替わる
    await page.getByLabel('タイトル', { exact: true }).fill(TITLE);
    await field.fill(MD_BODY);
    // Then その1: 両方が見える
    const draft = reader.getByRole('region', { name: '下書きの見え方' });
    await expect(reader.getByRole('tab', { name: '下書きの見え方' })).toHaveAttribute('aria-selected', 'true');
    await expect(draft.getByRole('heading', { level: 4, name: 'Rules' })).toBeVisible();
    await expect(field).toBeVisible();
    // Then その2: 読む面は説明の欄の右にある
    const f = await field.boundingBox();
    const r = await reader.boundingBox();
    expect(r!.x, '読む面が説明の欄の右に無い').toBeGreaterThanOrEqual(f!.x + f!.width);
    // Then その3: 欄の中のプレビューと切り替えは出ない（読む面が受け持つ）
    await expect(page.getByRole('region', { name: 'プレビュー' })).toBeHidden();
    await expect(page.getByRole('group', { name: '説明の出し方' })).toBeHidden();
    // 画面は例外を出していない
    expect(consoleWatcher.errors).toEqual([]);
  });

  for (const width of [390, 768]) {
    test(`Given 幅 ${width} / When プレビューを押す / Then 札が出て説明の欄が隠れ、送ると書くへ戻る`, async ({ page, consoleWatcher }) => {
      // Given
      await page.setViewportSize({ width, height: 900 });
      await openTopicTool(page, `toggle-topic-${width}`);
      const field = page.getByLabel('説明（なくてもよい）');
      const preview = page.getByRole('region', { name: 'プレビュー' });
      await page.getByLabel('タイトル', { exact: true }).fill(TITLE);
      await field.fill(MD_BODY);
      await expect(preview).toBeHidden();
      // When
      await page.getByRole('button', { name: 'プレビュー', exact: true }).click();
      // Then その1: 札が出て、説明の欄は隠れる
      await expect(preview.getByRole('heading', { level: 4, name: 'Rules' })).toBeVisible();
      await expect(field).toBeHidden();
      // Then その2: 送ると、次に書く欄が出る
      await page.getByRole('button', { name: 'このお題にする' }).click();
      await expect(currentTopic(page).getByRole('heading', { name: TITLE })).toBeVisible();
      await expect(field).toBeVisible();
      // Then その3: 画面は横にはみ出さない
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // 画面は例外を出していない
      expect(consoleWatcher.errors).toEqual([]);
    });
  }

  for (const width of [390, 1280]) {
    test(`Given 幅 ${width} でプレビューを出す / When 文字を測る / Then 切り替えと札の字はすべて AA を満たす`, async ({ page, consoleWatcher }) => {
      // Given: 1280 は右の読む面（下書きの見え方）、390 は欄の中のプレビュー（象牙の札）を測る
      await page.setViewportSize({ width, height: 900 });
      await openTopicTool(page, `preview-a11y-${width}`);
      await page.getByLabel('タイトル', { exact: true }).fill(TITLE);
      await page.getByLabel('説明（なくてもよい）').fill(MD_BODY);
      const shown =
        width === 390
          ? page.getByRole('region', { name: 'プレビュー' })
          : currentTopic(page).getByRole('region', { name: '下書きの見え方' });
      if (width === 390) await page.getByRole('button', { name: 'プレビュー', exact: true }).click();
      await expect(shown.getByRole('heading', { level: 4, name: 'Rules' })).toBeVisible();
      // When / Then: 札の字を測ったことを固定する（390 は象牙の札と読む面の両方・1280 は読む面）
      const [coal, ivory, sheen, shade] = await resolveColors(page, ['--coal', '--ivory', '--card-sheen', '--card-shade']);
      const cardGround = `rgba(0, 0, 0, 0) + linear-gradient(160deg, ${sheen}, ${shade})`;
      const measured = width === 390 ? [pairKey(coal!, ivory!), pairKey(coal!, cardGround)] : [pairKey(coal!, cardGround)];
      expectReadable(await scanContrast(page, 10), 8, measured);
      // 画面は例外を出していない
      expect(consoleWatcher.errors).toEqual([]);
    });
  }
});

test.describe('作るを横帯に（#313 構成案 1）', () => {
  test('Given 幅 1920 / When お題ツールを開く / Then 作るは書くの上で行いっぱいに広がり、言語・難易度・ボタンが 1 行に並ぶ', async ({ page, consoleWatcher }) => {
    // Given
    // 読む面を右に置いたので、1280px の主の区画は約 573px で 44rem の境目に届かない（縦に積む）。
    // 帯になるのは主の区画が 44rem 以上の 1920px から（#316 PR 1。境目は変えない）
    await page.setViewportSize({ width: 1920, height: 900 });
    // When
    await openTopicTool(page, 'band-topic');
    // Then その1: 作るは書くの上にあり、どちらも中身の幅いっぱい
    const make = await page.getByRole('region', { name: '作る' }).boundingBox();
    const write = await page.getByRole('region', { name: '書く' }).boundingBox();
    expect(make!.y + make!.height, '作るが書くの上に無い').toBeLessThanOrEqual(write!.y);
    expect(make!.width).toBeCloseTo(write!.width, 0);
    // Then その2: 言語・難易度・定型から選ぶが同じ行にある（下端がそろう）
    const bottoms = await Promise.all(
      [page.getByLabel('言語', { exact: true }), page.getByLabel('難易度', { exact: true }), page.getByRole('button', { name: '定型から選ぶ' })].map(
        async (l) => {
          const b = await l.boundingBox();
          return b!.y + b!.height;
        },
      ),
    );
    expect(Math.max(...bottoms) - Math.min(...bottoms), '作るの操作が 1 行に並んでいない').toBeLessThan(8);
    // Then その3: 帯に詰めても、ボタンは潰れて折り返さない（「解錠する」が 2 行になった・実画面で発見）
    const fallback = await page.getByRole('button', { name: '定型から選ぶ' }).boundingBox();
    const unlock = await page.getByRole('button', { name: '解錠する' }).boundingBox();
    expect(unlock!.height, '解錠するが折り返している').toBeCloseTo(fallback!.height, 0);
    // 画面は例外を出していない
    expect(consoleWatcher.errors).toEqual([]);
  });

  test('Given 幅 390 / When お題ツールを開く / Then 作るの言語と難易度は縦に積む', async ({ page, consoleWatcher }) => {
    // Given
    await page.setViewportSize({ width: 390, height: 900 });
    // When
    await openTopicTool(page, 'band-narrow-topic');
    // Then
    const language = await page.getByLabel('言語', { exact: true }).boundingBox();
    const difficulty = await page.getByLabel('難易度', { exact: true }).boundingBox();
    expect(difficulty!.y).toBeGreaterThanOrEqual(language!.y + language!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // 画面は例外を出していない
    expect(consoleWatcher.errors).toEqual([]);
  });
});
