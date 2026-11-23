/**
 * 進行タイマーの共通手順と選択子（#429 Task 4.3）。`support/roulette.ts` と同じ作り。
 *
 * **入口は玄関の札だけである**（`docs/adr/0018`）。ここが通らなくなったら、手順が古いのではなく
 * 入口が壊れている。
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** 選択画面のツールの札（poker・timer・お題の支援・ルーレットと同じ引き方）。 */
function toolCard(page: Page, name: string): Locator {
  return page.getByRole('list', { name: 'ツール' }).getByRole('link', { name: new RegExp(name) });
}

/** 進行タイマーの画面が開いていること（公開パスと見出し）。 */
async function expectAgendaOpen(page: Page): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname, { message: '進行タイマーの公開パス' }).toBe('/agenda/');
  await expect(page.getByRole('heading', { level: 1, name: '進行タイマー', exact: true })).toBeVisible();
}

/** 玄関でルームを作って進行タイマーを開き、**招待パネルが出している参加用 URL** を返す。 */
export async function openAgendaTool(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: 'ルームを作る' }).click();
  const inviteUrl = await page.getByLabel('参加用 URL').inputValue();
  await toolCard(page, 'Agenda Timer').click();
  await expectAgendaOpen(page);
  return inviteUrl;
}

/**
 * 渡された参加用 URL を玄関で開いて名乗り、進行タイマーを開く。
 *
 * **呼び出し側は必ず別の `BrowserContext` の page を渡すこと**（同じ文脈だと 1 人目として復帰する）。
 */
export async function joinAgendaTool(page: Page, url: string, name: string): Promise<void> {
  await page.goto(url);
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: '参加する' }).click();
  await toolCard(page, 'Agenda Timer').click();
  await expectAgendaOpen(page);
}

/** 選択画面（玄関の道具選び）から進行タイマーの札を開く。**同じルームのまま**別のツールから移るときに使う。 */
export async function openAgendaFromHub(page: Page): Promise<void> {
  await toolCard(page, 'Agenda Timer').click();
  await expectAgendaOpen(page);
}

/** 盤の中央の名前（いまのステップの名前。SVG の上に重ねた HTML で、読み上げからは隠れている）。 */
export function dialName(page: Page): Locator {
  return page.locator('.dial-name');
}

/** 盤の中央の押し巻き（「予定より +3 分」「予定どおり」など）。 */
export function dialDrift(page: Page): Locator {
  return page.locator('.dial-drift');
}

/** 組む画面でサンプルを下書きへ読み込み、ルームへ読み込み、開始して進行中の画面にする。 */
export async function loadSampleAndStart(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'サンプルから選ぶ', exact: true }).click();
  await page.getByRole('button', { name: /サンプル：KPT のふりかえり/ }).click();
  await page.getByRole('button', { name: 'ルームに読み込む', exact: true }).click();
  const start = page.getByRole('button', { name: '開始', exact: true });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByRole('button', { name: '次へ', exact: true })).toBeVisible();
}

/**
 * 組む画面でサンプル（くりかえしのあるリファインメント → KPT）を下書きへ読み込み、「下書きを空にする」（確かめつき）で空に戻す（#667）。
 * 空に戻ったこと（会の名前・行・くりかえしのサンプル欄）と、空では押せないことまで確かめる。ルームへは何も読み込まない。
 */
export async function loadSampleThenClearDraft(page: Page): Promise<void> {
  const repeat = page.getByRole('combobox', { name: 'サンプルのくりかえし' });
  const clear = page.getByRole('button', { name: '下書きを空にする', exact: true });
  const confirm = page.getByRole('group', { name: 'いまの下書きを空にしますか' });
  // くりかえしのあるサンプル（リファインメント）で、欄が見えていることを先に確かめてから、空にして消えることを見る
  await page.getByRole('button', { name: 'サンプルから選ぶ', exact: true }).click();
  await page.getByRole('button', { name: /サンプル：リファインメント/ }).click();
  await expect(repeat).toBeVisible();
  await clear.click();
  await confirm.getByRole('button', { name: '空にする', exact: true }).click();
  await expect(repeat).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '会の名前', exact: true })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'ステップ 1 の名前' })).toHaveCount(0);
  await expect(clear).toBeDisabled();
  // 続けて、いまの流れどおり KPT を入れて自分で組み直す（空の下書きなので確かめは出ない）
  await page.getByRole('button', { name: 'サンプルから選ぶ', exact: true }).click();
  await page.getByRole('button', { name: /サンプル：KPT のふりかえり/ }).click();
  await expect(page.getByRole('textbox', { name: 'ステップ 1 の名前' })).toBeVisible();
  await clear.click();
  await confirm.getByRole('button', { name: '空にする', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'ステップ 1 の名前' })).toHaveCount(0);
  await expect(clear).toBeDisabled();
}

/**
 * 組む画面に残っている下書きのくりかえしを `rounds` 回にして、ルームに読み込んで開始する。
 * 「最初から」のあとはルームにシナリオが残っているので、サンプルは選び直さず、いまの下書きを使う。
 */
export async function setRoundsAndStart(page: Page, rounds: number): Promise<void> {
  await page.getByLabel('くりかえし', { exact: true }).fill(String(rounds));
  await page.getByRole('button', { name: 'ルームに読み込む', exact: true }).click();
  const start = page.getByRole('button', { name: '開始', exact: true });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByRole('button', { name: '次へ', exact: true })).toBeVisible();
}

/** 押し巻きの文から符号つきの分を読む（U+2212 と U+002B。「予定どおり」は 0）。読めなければ null。 */
export function parseDriftMinutes(text: string): number | null {
  if (text === '予定どおり') return 0;
  const m = /^予定より ([+−])(\d+) 分$/.exec(text);
  return m === null ? null : (m[1] === '+' ? 1 : -1) * Number(m[2]);
}
