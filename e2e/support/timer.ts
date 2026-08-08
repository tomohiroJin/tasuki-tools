/**
 * timer の共通手順と選択子。
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** 招待パネルの QR の代替テキストからルームコードを読む形。 */
const QR_ALT = /^ルーム (.+) の QR コード$/;

/**
 * ルームを作り、ルームコードを返す。
 *
 * コードを **QR の `alt` から読む**のは、画面上でコードを載せている要素のうち
 * アクセシブル名を持つのがそこだけだから（大きな数字は素の `<span>`、
 * 招待 URL も素の `<p>`）。`alt` は製品が元から持っている情報で、
 * テストのために足したものではない。
 */
export async function createRoom(page: Page, name: string): Promise<string> {
  await page.goto('/timer/');
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: 'ルームを作る' }).click();

  const qr = page.getByRole('img', { name: QR_ALT });
  await expect(qr).toBeVisible();
  const alt = await qr.getAttribute('alt');
  const code = QR_ALT.exec(alt ?? '')?.[1];
  if (code === undefined || code === '') {
    throw new Error(`ルームコードを読み取れませんでした（alt: ${String(alt)}）。`);
  }
  return code;
}

/**
 * 招待リンクからドライバーとして参加する。
 *
 * ラジオは `sr-only` で `check()` できない（クリック可能な位置に無い）。
 * **利用者と同じく、包んでいるラベルの可視テキストを押す。**
 */
export async function joinAsDriver(page: Page, code: string, name: string): Promise<void> {
  await page.goto(`/timer/?room=${code}`);
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByText('ドライバーとして参加', { exact: true }).click();
  await page.getByRole('button', { name: 'モブに参加' }).click();
}

/**
 * ロビーで、指定した人が交代の輪の指定した順番に並んでいる行。
 *
 * 名前だけで待つと、輪に入る前（`member.add` の到着前）に先へ進んでしまい、
 * **1 人だけの輪でセッションを始めてしまう**。順番のバッジまで見て待つ。
 */
export function lobbyRotationRow(page: Page, name: string, order: number): Locator {
  return page
    .getByRole('listitem')
    .filter({ hasText: name })
    .filter({ hasText: `ドライバー${String(order)}` });
}

/** セッション画面の名簿（ドライバーの一覧）。 */
export function driverRoster(page: Page): Locator {
  return page.getByRole('list', { name: 'ドライバー一覧' });
}

/**
 * 名簿のうち、現ドライバーとして印が付いている行。
 *
 * **名前では判定しない。** 名簿は役割に関係なく全員の名前を常時表示するので、
 * 「新ドライバーの名前が見えること」は交代が起きていなくても最初から真になる。
 * 見るのは印そのものの位置。
 */
export function currentDriverRow(page: Page): Locator {
  return driverRoster(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('img', { name: '現在のドライバー' }) });
}
