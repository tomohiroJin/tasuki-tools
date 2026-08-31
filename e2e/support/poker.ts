/**
 * poker の共通手順と選択子。
 *
 * 選択子は「ロール + アクセシブル名」を第一に置く。掴めない箇所（`<section>` は
 * アクセシブル名を持たないので `region` ロールにならない）だけ、**中に何が入って
 * いるか**で絞り込む。位置や CSS クラスでの決め打ちはしない。
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { parseFrames } from './ws-frames';

/**
 * ルームを作り、そのルームの URL を返す。
 *
 * ここで `page.url()` を使ってよいのは、**招待 URL の生成規則が検証対象ではない**から。
 * 招待パネルが出す URL 文字列そのものを確かめるのは第 3 段のシナリオ #11 の仕事で、
 * あちらは画面に表示された URL を読み取って開かなければ意味がない（#76 F-1）。
 */
export async function createRoom(page: Page, name: string): Promise<string> {
  await page.goto('/poker/');
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: 'ルームを作成' }).click();
  await expect(page.getByRole('heading', { name: 'プランニングポーカー' })).toBeVisible();
  return page.url();
}

/** 既存のルームへ参加する。**呼び出し側は必ず別の `BrowserContext` の page を渡すこと。** */
export async function joinRoom(page: Page, roomUrl: string, name: string): Promise<void> {
  await page.goto(roomUrl);
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: '参加する' }).click();
  await expect(page.getByRole('heading', { name: 'プランニングポーカー' })).toBeVisible();
}

/**
 * 参加者一覧（名簿）。
 *
 * 公開後は「結果」側にもリストが出るので、**席札（`role="img"` の投票済み／未投票）を
 * 持つリスト**という中身で見分ける。位置（`first()` 等）で選ぶと、
 * 公開の前後でどちらを指しているか変わる。
 */
function participantList(page: Page): Locator {
  return page
    .getByRole('list')
    .filter({ has: page.getByRole('img', { name: /^(投票済み|未投票)$/ }) });
}

/** 名簿のうち、指定した名前の行。**否定の判定はこの範囲に限定して行う。** */
export function participantRow(page: Page, name: string): Locator {
  return participantList(page).getByRole('listitem').filter({ hasText: name });
}

/** 公開後にだけ現れる結果セクション。投票中は要素そのものが存在しない。 */
export function resultsSection(page: Page): Locator {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: '結果' }) });
}

/** 結果セクションのうち、指定した名前の行。 */
export function resultRow(page: Page, name: string): Locator {
  return resultsSection(page).getByRole('listitem').filter({ hasText: name });
}

/**
 * カードを選ぶ。
 *
 * `exact: true` が必須。**`1` は `13` にも `21` にも部分一致する。**
 */
export async function chooseCard(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click();
}

/** `room-state` フレームのうち、秘匿の判定に使う部分だけを型として置いたもの。 */
export interface RoomStateFrame {
  readonly participants: readonly { readonly name?: unknown; readonly hasVoted?: unknown }[];
  readonly round: { readonly status?: unknown };
}

function isRoomStateFrame(value: unknown): value is RoomStateFrame {
  if (typeof value !== 'object' || value === null) return false;
  const frame = value as { type?: unknown; participants?: unknown; round?: unknown };
  if (frame.type !== 'room-state') return false;
  if (!Array.isArray(frame.participants)) return false;
  return typeof frame.round === 'object' && frame.round !== null;
}

/** 受信フレームのうち `room-state` だけを受信順に取り出す。 */
export function roomStateFrames(payloads: readonly string[]): RoomStateFrame[] {
  return parseFrames(payloads).filter(isRoomStateFrame);
}

/** そのフレームで、指定した名前の人が投票済みとして配信されているか。 */
export function showsVoted(frame: RoomStateFrame, name: string): boolean {
  return frame.participants.some((p) => p.name === name && p.hasVoted === true);
}

/**
 * `error` フレームに、**契約が宣言していないキーを 1 つ足す**（#214）。
 * 他の種類のフレームはそのまま返す。
 *
 * サーバーが `error` に任意フィールドを足した状況を、実プロトコル越しに作る。
 * `v.strictObject` だった頃はこれだけでフレーム全体が捨てられ、
 * **消えたルームの案内（#76 J-1）も入室の自動再試行（#147）も起きなくなった。**
 * `docs/poker/adr/0003` で `error` だけを前方互換にしてある。
 *
 * `corruptRoomStateFrame` と同じく、**製品コードにテスト用の穴は開けない。**
 */
export function addUnknownKeyToErrorFrame(payload: string): string {
  let frame: unknown;
  try {
    frame = JSON.parse(payload);
  } catch {
    return payload;
  }
  if (typeof frame !== 'object' || frame === null) return payload;
  if ((frame as { type?: unknown }).type !== 'error') return payload;
  return JSON.stringify({ ...frame, retryAfterMs: 1_000 });
}

/**
 * `room-state` フレームを、**サーバー→クライアントの契約（`ServerMessageSchema`）に
 * 合わない形**へ書き換える（#212）。他の種類のフレームはそのまま返す。
 *
 * 壊し方は「参加者名を数値にする」。`ParticipantViewSchema.name` は文字列なので、
 * これだけでフレーム全体が落ちる。**製品コードにテスト用の穴は開けない。**
 * ブラウザと同期サーバーの間で差し替えるだけなので、画面から見れば
 * 「サーバーが壊れた値を送ってきた」に等しい。
 */
export function corruptRoomStateFrame(payload: string): string {
  let frame: unknown;
  try {
    frame = JSON.parse(payload);
  } catch {
    return payload;
  }
  if (!isRoomStateFrame(frame)) return payload;
  const participants = frame.participants;
  if (participants.length === 0) return payload;
  return JSON.stringify({
    ...frame,
    participants: [{ ...participants[0], name: 1 }, ...participants.slice(1)],
  });
}
