/**
 * 玄関のルームの合言葉（#638・タグ無し = `local` 専用。実ルームの枠を使う）。
 *
 * 合言葉が守るのはルーム全体で、設定の口は timer の画面から玄関のルームの画面（選択画面）へ移った。
 *
 * - 玄関で設定・変更・解除できる（設定中かは名簿の印から映る）
 * - 合言葉の付いたルームへ、どの道具の URL から入ろうとしても、玄関の参加画面で合言葉を求められ、
 *   通ったら元の道具へ戻る
 * - 既に入っている人は、合言葉が変わっても入り直しを求められない
 * - timer の画面には合言葉の設定の口が無い
 *
 * 単体・実 WS の検査は `apps/landing/tests`・`apps/tasuki-sync/test/live-ws.hub-passphrase.test.ts` にある。
 * ここは実ブラウザで、道具の入口の往復が本当につながっていることだけを見る。
 */
import { expect, test } from '../fixtures/test';
import type { Page } from '@playwright/test';

const SECRET = 'ひらけごま2026';

/** 玄関でルームを作り、選択画面のコードを返す。 */
async function createHubRoom(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('ルーム名').fill('合言葉の回帰');
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: 'ルームを作る' }).click();
  await expect(page.getByRole('list', { name: 'ツール' })).toBeVisible();
  const code = new URL(page.url()).searchParams.get('room');
  expect(code, '作成後の URL の room').not.toBeNull();
  return code!;
}

/**
 * 合言葉の口を開く。ふだんは 1 行にたたんである（#673）ので、利用者と同じく開いてから操作する。
 * 開いていれば何もしない（設定のあとは開いたまま）。
 */
async function openPassphrase(page: Page): Promise<void> {
  const toggle = page.getByRole('region', { name: '合言葉' }).getByRole('button', { expanded: false });
  if ((await toggle.count()) > 0) await toggle.click();
  await expect(page.getByRole('textbox', { name: '新しい合言葉' })).toBeVisible();
}

/** 選択画面の合言葉の欄に書いて、押すボタンを押す。 */
async function submitPassphrase(page: Page, value: string, button: '設定' | '変更'): Promise<void> {
  await openPassphrase(page);
  await page.getByRole('textbox', { name: '新しい合言葉' }).fill(value);
  await page.getByRole('button', { name: button, exact: true }).click();
}

test.describe('玄関で合言葉を設定・変更・解除できる', () => {
  test('Given 作成直後のルーム / When 設定・変更・解除する / Then 状態の表示が追随し、入力欄に平文は残らず、変更は新しい合言葉だけを通す', async ({
    page,
    openPeer,
  }) => {
    await createHubRoom(page, 'あや');
    await expect(page.getByText('合言葉は付いていません。', { exact: false })).toBeVisible();

    // 設定
    await submitPassphrase(page, SECRET, '設定');
    await expect(page.getByText('合言葉を設定中です。', { exact: false })).toBeVisible();
    await expect(page.getByRole('textbox', { name: '新しい合言葉' }), '平文を画面に残さない').toHaveValue('');

    // 変更
    await submitPassphrase(page, 'べつの合言葉', '変更');
    await expect(page.getByText('合言葉を設定中です。', { exact: false })).toBeVisible();
    // 変更が効いている: 別の人が古い合言葉では入れず、新しい合言葉なら入れる（文言だけを見ない）
    const code = new URL(page.url()).searchParams.get('room')!;
    const stranger = await openPeer('passphrase-change');
    await stranger.page.goto(`/?room=${encodeURIComponent(code)}`);
    await stranger.page.getByLabel('あなたの名前').fill('いずみ');
    await stranger.page.getByRole('button', { name: '参加する' }).click();
    const field = stranger.page.getByLabel('合言葉', { exact: true });
    await field.fill(SECRET);
    await stranger.page.getByRole('button', { name: '参加する' }).click();
    await expect(stranger.page.getByRole('alert'), '古い合言葉は拒まれる').toBeVisible();
    await expect(stranger.page.getByRole('list', { name: 'ツール' })).toHaveCount(0);
    await field.fill('べつの合言葉');
    await stranger.page.getByRole('button', { name: '参加する' }).click();
    await expect(stranger.page.getByRole('list', { name: 'ツール' }), '新しい合言葉で入れる').toBeVisible();

    // 解除
    await page.getByRole('button', { name: '解除', exact: true }).click();
    await expect(page.getByText('合言葉は付いていません。', { exact: false })).toBeVisible();
  });

  test('Given 設定中のルーム / When 別の人が選択画面を開く / Then 設定中の状態が見え、その人も解除できる（役割は無い）', async ({
    page,
    openPeer,
  }) => {
    const code = await createHubRoom(page, 'あや');
    await submitPassphrase(page, SECRET, '設定');
    await expect(page.getByText('合言葉を設定中です。', { exact: false })).toBeVisible();

    const guest = await openPeer('passphrase-guest');
    await guest.page.goto(`/?room=${encodeURIComponent(code)}`);
    await guest.page.getByLabel('あなたの名前').fill('いずみ');
    await guest.page.getByRole('button', { name: '参加する' }).click();
    await guest.page.getByLabel('合言葉', { exact: true }).fill(SECRET);
    await guest.page.getByRole('button', { name: '参加する' }).click();
    await expect(guest.page.getByRole('list', { name: 'ツール' })).toBeVisible();
    await expect(guest.page.getByText('合言葉を設定中です。', { exact: false })).toBeVisible();

    await openPassphrase(guest.page);
    await guest.page.getByRole('button', { name: '解除', exact: true }).click();
    // 作成者の画面にも解除が届く
    await expect(page.getByText('合言葉は付いていません。', { exact: false })).toBeVisible();
  });
});

/** 札の公開パスと、その道具にしか無い目印（`landing.spec.ts` の表と同じ）。 */
const TOOL_ENTRIES = [
  { name: 'timer', path: '/timer/', landmark: 'セッションを開始' },
  { name: 'poker', path: '/poker/', landmark: '票を公開する' },
  { name: 'topic', path: '/topic/', landmark: '場に出す' },
  { name: 'roulette', path: '/roulette/', landmark: /^ルーレットを回す$/ },
  { name: 'agenda', path: '/agenda/', landmark: /サンプルから選ぶ/ },
  { name: 'checkin', path: '/checkin/', landmark: 'ランダム' },
  { name: 'track', path: '/track/', landmark: /^Markdown でコピー$/ },
] as const;

test.describe('合言葉の付いたルームへ各道具の URL から入ると、玄関で求められ、通ると元の道具へ戻る', () => {
  for (const tool of TOOL_ENTRIES) {
    test(`Given 合言葉つきのルーム / When ${tool.name} の URL を開き、合言葉を通る / Then 玄関で求められ、${tool.path} へ戻る`, async ({
      page,
      openPeer,
    }) => {
      // Given
      const code = await createHubRoom(page, 'あや');
      await submitPassphrase(page, SECRET, '設定');
      await expect(page.getByText('合言葉を設定中です。', { exact: false })).toBeVisible();

      // When 1: 別の人が道具の URL から入る → 玄関の参加画面へ送られる
      const guest = await openPeer(`passphrase-${tool.name}`);
      await guest.page.goto(`${tool.path}?room=${encodeURIComponent(code)}`);
      await expect
        .poll(() => new URL(guest.page.url()).pathname, { message: '玄関へ送られる' })
        .toBe('/');
      await guest.page.getByLabel('あなたの名前').fill('いずみ');
      await guest.page.getByRole('button', { name: '参加する' }).click();

      // Then 1: 合言葉を求められる。誤った合言葉では戻らない
      const field = guest.page.getByLabel('合言葉', { exact: true });
      await expect(field).toBeVisible();
      await field.fill('ちがう');
      await guest.page.getByRole('button', { name: '参加する' }).click();
      await expect(guest.page.getByRole('alert')).toBeVisible();
      expect(new URL(guest.page.url()).pathname, '誤った合言葉では玄関に留まる').toBe('/');

      // When 2: 正しい合言葉
      await field.fill(SECRET);
      await guest.page.getByRole('button', { name: '参加する' }).click();

      // Then 2: 元の道具の同じルームへ戻り、その道具の画面が描かれる
      await expect
        .poll(() => new URL(guest.page.url()).pathname, { message: `${tool.name} へ戻る` })
        .toBe(tool.path);
      expect(new URL(guest.page.url()).searchParams.get('room')).toBe(code);
      await expect(guest.page.getByRole('button', { name: tool.landmark }).first()).toBeVisible();
    });
  }
});

test.describe('既に入っている人・timer の画面', () => {
  test('Given 入っている人 / When 合言葉が変わったあとに玄関を開き直す / Then 入り直しを求められない', async ({
    page,
  }) => {
    const code = await createHubRoom(page, 'あや');
    await submitPassphrase(page, SECRET, '設定');
    await expect(page.getByText('合言葉を設定中です。', { exact: false })).toBeVisible();
    await submitPassphrase(page, 'べつの合言葉', '変更');
    await expect(page.getByText('合言葉を設定中です。', { exact: false })).toBeVisible();

    await page.goto(`/?room=${encodeURIComponent(code)}`);

    await expect(page.getByRole('list', { name: 'ツール' })).toBeVisible();
    await expect(page.getByLabel('あなたの名前')).toHaveCount(0);
  });

  test('@webkit Given timer のロビー / When 画面を見る / Then 合言葉（パスフレーズ）の設定の口は無い', async ({ page }) => {
    const code = await createHubRoom(page, 'あや');
    await page.goto(`/timer/?room=${encodeURIComponent(code)}`);
    await expect(page.getByRole('button', { name: 'セッションを開始' })).toBeVisible();

    await expect(page.getByLabel('パスフレーズ')).toHaveCount(0);
    await expect(page.getByText('パスフレーズ')).toHaveCount(0);
  });
});
