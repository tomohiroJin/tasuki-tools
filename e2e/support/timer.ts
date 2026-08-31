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
 * 渡された URL を開き、ドライバーとして参加する。
 *
 * **URL を組み立てずに受け取るのが要点。** 招待パネルが出した URL 文字列
 * そのものを開く回帰シナリオ（#76 F-1）は、こちらを直接使う。
 *
 * ラジオは `sr-only` で `check()` できない（クリック可能な位置に無い）。
 * **利用者と同じく、包んでいるラベルの可視テキストを押す。**
 */
export async function joinAsDriverAt(page: Page, url: string, name: string): Promise<void> {
  await page.goto(url);
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByText('ドライバーとして参加', { exact: true }).click();
  await page.getByRole('button', { name: 'モブに参加' }).click();
}

/**
 * ルームコードからドライバーとして参加する。
 *
 * **招待 URL の生成規則を検証しない場面のための近道。** 参加の成立そのものが
 * 目的で、どんな URL を配るかは問わないシナリオはこちらを使う。
 */
export async function joinAsDriver(page: Page, code: string, name: string): Promise<void> {
  await joinAsDriverAt(page, `/timer/?room=${code}`, name);
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

/**
 * 招待パネルが画面に出している参加 URL。
 *
 * この段落（`InvitePanel.tsx`）は素の `<p>` でアクセシブル名を持たないため、
 * **可視テキストの形で掴む**しかない。範囲を狭めるために「`http` で始まる文字列」
 * という形そのものを条件にしている。
 *
 * **`page.url()` で代用してはいけない。** 検証対象は招待パネルが *生成する*
 * 文字列であって、いま自分が居る場所ではない（#76 F-1）。
 */
export function invitedUrlText(page: Page): Locator {
  return page.getByText(/^https?:\/\/\S+$/);
}

/** 参加前（Setup / Join）では出ない、常設のステータス表示。 */
export function statusStrip(page: Page): Locator {
  return page.getByRole('status', { name: 'ステータス情報' });
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

/**
 * `snapshot` フレームを、**サーバー→クライアントの契約（`ServerMsgSchema`）に
 * 合わない形**へ書き換える（#209）。他の種類のフレームはそのまま返す。
 *
 * 壊し方は ADR 0005 の追記が挙げた実際の経路に合わせる。`config.members` の
 * 要素の `displayNameStr` が最小長 1 なので、空文字が載ると `SessionConfigSchema` に落ちる。
 * **製品コードにテスト用の穴は開けない。** ブラウザと同期サーバーの間で
 * 差し替えるだけなので、画面から見れば「サーバーが壊れた値を送ってきた」に等しい。
 */
export function corruptSnapshotFrame(payload: string): string {
  let frame: unknown;
  try {
    frame = JSON.parse(payload);
  } catch {
    return payload;
  }
  if (typeof frame !== 'object' || frame === null) return payload;
  const message = frame as { type?: unknown; room?: { config?: Record<string, unknown> } };
  if (message.type !== 'snapshot' || message.room?.config === undefined) return payload;
  return JSON.stringify({
    ...message,
    room: { ...message.room, config: { ...message.room.config, members: [''] } },
  });
}
