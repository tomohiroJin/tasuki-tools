/**
 * poker の共通手順と選択子。
 *
 * 選択子は「ロール + アクセシブル名」を第一に置く。掴めない箇所（`<section>` は
 * アクセシブル名を持たないので `region` ロールにならない）だけ、**中に何が入って
 * いるか**で絞り込む。位置や CSS クラスでの決め打ちはしない。
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { parseFrames } from './ws-frames';

/** 選択画面のツールの札。ここから各ツールへ入る（#95 S5a・R1）。 */
function toolCard(page: Page, name: string): Locator {
  return page.getByRole('list', { name: 'ツール' }).getByRole('link', { name: new RegExp(name) });
}

/**
 * 玄関でルームを作って poker を開き、**そのルームの参加用 URL を返す**。
 *
 * **入口は玄関ただ 1 つになった**（#95 S5c・R9）。poker の旧入口（`TopPage`）は
 * 撤去したので、「`/poker/` を開いて名前を入れる」経路はもう無い。ここが通らなく
 * なったら、それは手順が古いのではなく**入口が壊れている**。
 *
 * 返すのは**招待パネルが画面に出している URL 文字列**である。`page.url()` で
 * 代用しない —— それでは自分の居場所を読むだけで、poker が配る URL を見ない
 * （#76 F-1）。生成規則そのものを確かめるシナリオは、この戻り値ではなく
 * 画面から読み取った値を使うこと。
 */
export async function createRoom(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: 'ルームを作る' }).click();
  await toolCard(page, 'Planning Poker').click();
  await expect(page.getByRole('heading', { name: 'プランニングポーカー' })).toBeVisible();
  return invitedUrlText(page).innerText();
}

/**
 * 渡された参加用 URL を玄関で開いて名乗り、poker を開く。
 *
 * **呼び出し側は必ず別の `BrowserContext` の page を渡すこと。**
 *
 * 撤去前は poker の `RoomPage` が名前を聞いていた（`JoinForm`）。**名乗りはハブに
 * 1 つだけになった**（#95 S5c・R9）ので、名乗る場所はここ 1 箇所である。
 */
export async function joinRoom(page: Page, roomUrl: string, name: string): Promise<void> {
  await page.goto(roomUrl);
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: '参加する' }).click();
  await toolCard(page, 'Planning Poker').click();
  await expect(page.getByRole('heading', { name: 'プランニングポーカー' })).toBeVisible();
}

/**
 * 招待パネルが画面に出している参加 URL。
 *
 * この要素（`RoomPage.tsx` の `.invite-url`）は素の `<span>` でアクセシブル名を
 * 持たないため、**可視テキストの形で掴む**しかない（timer の `invitedUrlText` と同じ）。
 * 範囲を狭めるために「`http` で始まる文字列」という形そのものを条件にしている。
 */
export function invitedUrlText(page: Page): Locator {
  return page.getByText(/^https?:\/\/\S+$/);
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
 * **もう存在しないルームコード**（timer の `MISSING_ROOM_CODE` と同じ役）。
 *
 * 生成器（`NanoidCodeGen`）は 6 文字の `ABCDEFGHJKMNPQRSTUVWXYZ23456789`、あるいは
 * `<スラグ>-<小文字英数 8 文字>` しか作らない。この値はどちらの形にも当てはまらないため
 * **実在のルームと衝突しない**。
 */
export const MISSING_ROOM_ID = 'e2e-poker-room-gone';

/**
 * クライアントが送る `join-room` の行き先を、**存在しないルームへ差し替える**
 * （#95 S5c・R9）。他の種類のフレームはそのまま返す。
 *
 * **旧入口を撤去したので、「消えたルームの画面」は URL では作れなくなった。**
 * ルームコードを伴わない URL も旧リンクも玄関へ送られ、poker の画面まで届かない。
 * いまここへ来るのは**端末に同一性を持つ人**だけで、そのルームが消えている状況
 * （本番は揮発インメモリで、同期サーバーの再起動でルームが全て消える）を
 * 実プロトコル越しに作るには、送り先そのものを差し替えるのが最短である。
 *
 * `token` は載せない。存在しないルームでは照合まで進まない（サーバーは名簿を引く
 * 前にレート判定だけを行い、無ければ `room-not-found` を返す）ので、残すと
 * 「トークンが効いたのか」を読み違える余地だけが増える。
 *
 * **製品コードにテスト用の穴は開けない。** ブラウザと同期サーバーの間で
 * 差し替えるだけなので、サーバーから見れば「知らないコードへの join」に等しい。
 */
export function sendJoinToMissingRoom(payload: string): string {
  let frame: unknown;
  try {
    frame = JSON.parse(payload);
  } catch {
    return payload;
  }
  if (typeof frame !== 'object' || frame === null) return payload;
  const message = frame as { type?: unknown; name?: unknown };
  if (message.type !== 'join-room') return payload;
  return JSON.stringify({ type: 'join-room', roomId: MISSING_ROOM_ID, name: message.name });
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
 * `room-state` フレームの**すべての層に、契約が宣言していないキーを足す**（#216）。
 * 他の種類のフレームはそのまま返す。
 *
 * サーバーが `room-state` にフィールドを足した状況を、実プロトコル越しに作る。
 * `v.strictObject` だった頃は**どの層に 1 つ足してもフレームごと捨てられ**、
 * 画面は生きて見えたまま古い状態で固まった（`docs/poker/adr/0002` 背景）。
 * `docs/poker/adr/0004` で `card` を除くサーバー→クライアントの層を前方互換にしてある。
 *
 * **`card` には足さない。** あちらは値の集合そのものが契約で、緩めていない（決定 2）。
 */
export function addUnknownKeysToRoomStateFrame(payload: string): string {
  let frame: unknown;
  try {
    frame = JSON.parse(payload);
  } catch {
    return payload;
  }
  if (!isRoomStateFrame(frame)) return payload;
  const round = frame.round as Record<string, unknown>;
  const votes = Array.isArray(round.votes) ? round.votes : undefined;
  const stats = typeof round.stats === 'object' && round.stats !== null ? round.stats : undefined;
  return JSON.stringify({
    ...frame,
    serverTime: 1,
    participants: frame.participants.map((p) => ({ ...p, avatar: 'x' })),
    round: {
      ...round,
      elapsedMs: 1,
      ...(votes !== undefined
        ? { votes: votes.map((vote) => ({ ...(vote as object), at: 1 })) }
        : {}),
      ...(stats !== undefined ? { stats: { ...stats, median: 5 } } : {}),
    },
  });
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
