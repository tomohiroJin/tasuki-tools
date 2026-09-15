/**
 * timer の共通手順と選択子。
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** 招待パネルの QR の代替テキストからルームコードを読む形。 */
const QR_ALT = /^ルーム (.+) の QR コード$/;

/** 選択画面のツールの札。ここから各ツールへ入る（#95 S5a・R1）。 */
function toolCard(page: Page, name: string): Locator {
  return page.getByRole('list', { name: 'ツール' }).getByRole('link', { name: new RegExp(name) });
}

/**
 * 玄関でルームを作って timer を開き、ルームコードを返す。
 *
 * **入口は玄関ただ 1 つになった**（#95 S5c・R9）。timer の旧入口（`Setup`）は撤去したので、
 * 「`/timer/` を開いて名前を入れる」経路はもう無い。ここが通らなくなったら、
 * それは手順が古いのではなく**入口が壊れている**。
 *
 * コードを **QR の `alt` から読む**のは、画面上でコードを載せている要素のうち
 * アクセシブル名を持つのがそこだけだから（大きな数字は素の `<span>`、
 * 招待 URL も素の `<p>`）。`alt` は製品が元から持っている情報で、
 * テストのために足したものではない。**玄関の URL から読み取らない** ——
 * 自分の居場所を読むだけでは、timer が実際にそのルームを映していることを見ない。
 */
export async function createRoom(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: 'ルームを作る' }).click();
  await toolCard(page, 'TDD Mob Pro Timer').click();

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
 * 渡された参加用 URL を玄関で開いて名乗り、timer を開く（輪には入らない）。
 *
 * **URL を組み立てずに受け取るのが要点。** 招待パネルが出した URL 文字列
 * そのものを開く回帰シナリオ（#76 F-1）は、こちらを直接使う。
 *
 * 撤去前は timer の `Join` が名前と参加方法（ドライバー/見学）を聞いていた。
 * **名乗りはハブに 1 つだけになり、輪への加入はロビーの操作に分かれた**（#95 S5c・R9）。
 */
export async function joinViaHubAt(page: Page, url: string, name: string): Promise<void> {
  await page.goto(url);
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: '参加する' }).click();
  await toolCard(page, 'TDD Mob Pro Timer').click();
}

/**
 * ルームコードから玄関で名乗って timer を開く（輪には入らない）。
 *
 * **招待 URL の生成規則を検証しない場面のための近道。** 参加の成立そのものが
 * 目的で、どんな URL を配るかは問わないシナリオはこちらを使う。
 */
export async function joinViaHub(page: Page, code: string, name: string): Promise<void> {
  await joinViaHubAt(page, `/?room=${encodeURIComponent(code)}`, name);
}

/**
 * 玄関で名乗って timer へ入り、**ロビーで交代の輪に加わる**。
 *
 * 撤去前は参加画面の「ドライバーとして参加」がこれを兼ねていた。その必須選択は
 * #95 S5c で廃止され、輪への加入はロビーの操作になった。**加わったことまで待つ** ——
 * 待たないと、1 人だけの輪でセッションを始めてしまう。
 */
export async function joinAsDriver(page: Page, code: string, name: string): Promise<void> {
  await joinViaHub(page, code, name);
  await page.getByRole('button', { name: 'ドライバーに加わる' }).click();
  await expect(
    page.getByRole('button', { name: 'ドライバーに加わる' }),
    '輪に加わっても「ドライバーに加わる」が残っている',
  ).toHaveCount(0);
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

/** ルームの画面が決まるまで（`mode` が null の間）は出ない、常設のステータス表示。 */
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
 * ロビーの「交代間隔」から、指定した分数のボタン。
 *
 * `exact: true` が必須。**`5分` は `15分` にも部分一致する**（poker の `chooseCard` と
 * 同じ罠）。ここは #95 S3 で「誰でも変更できる」設定になった
 * （`apps/timer-web/src/ui/components/SessionConfigPanel.tsx` 冒頭コメント）。
 */
export function intervalButton(page: Page, label: string): Locator {
  return page
    .getByRole('group', { name: '交代間隔' })
    .getByRole('button', { name: label, exact: true });
}

/**
 * ロビーの「交代間隔」で**いま選ばれている**ラベルを読む。
 *
 * 既定値（`7分`）をテストへ直書きすると、既定を変えた瞬間に落ちる。しかも落ち方が
 * 「既定が変わった」ではなく「設定が同期されていない」に見えるので、原因を取り違える。
 * **画面から導く。**
 *
 * 選択が**ちょうど 1 つ**であることも同時に見る。0 個なら既定が選ばれておらず、
 * 2 個以上なら排他になっていない —— どちらも読み取った値を信用できない状態であり、
 * 黙って先頭を返すと後続のアサーションが意味を失う。
 */
export async function selectedIntervalLabel(page: Page): Promise<string> {
  const selected = page
    .getByRole('group', { name: '交代間隔' })
    .getByRole('button', { pressed: true });
  await expect(selected, '交代間隔で選ばれているボタン').toHaveCount(1);
  return (await selected.innerText()).trim();
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

/**
 * **もう存在しないルームコード**（#142・#76 F-4）。
 *
 * 生成器（`NanoidCodeGen`）は 6 文字の `ABCDEFGHJKMNPQRSTUVWXYZ23456789`、
 * あるいは `<スラグ>-<小文字英数 8 文字>` しか作らない。ハイフンの後ろが 4 文字の
 * 大文字であるこの値は、どちらの形にも当てはまらないため**実在のルームと衝突しない**。
 *
 * 再接続時の `room.join` の行き先をこれに差し替えると、サーバーにとっては
 * 「知らないコード」になる。**再起動でルームを失った状態と同じ**で、返ってくる
 * `ROOM_NOT_FOUND` は実サーバーが出す本物である（こちらでエラーフレームを捏造しない。
 * 捏造すると、サーバーがコードを変えた日にこの検査だけが古い契約のまま緑になる）。
 *
 * `code` は `nonEmptyString` なので、この値は境界検証を通って `store.get(code)` まで
 * 到達する（`room-join.ts`）。**ただし「必ず `ROOM_NOT_FOUND` が返る」わけではない。**
 * 同じ関数は資源を引く**前に**レート判定を通すので、入室失敗の枠が枯れていれば
 * `JOIN_RATE_LIMITED` が先に返る。枠は #103 以降 **IP 単位**で全 worker が共有し、
 * `ROOM_NOT_FOUND` のたびに 1 つ消費される。使う側は、その往復（`join-retry.ts` の
 * 待ち直し）を織り込んで判定すること。
 */
export const MISSING_ROOM_CODE = 'E2E-ROOM-GONE';

/**
 * ロビーの参加者一覧の見出し（`参加者 (N人)`）。
 *
 * **人数そのものを判定に使うためのロケータである**（#95 S4b・R16）。
 * 名簿の増減を名前で見ると、二重参加の幽霊は本人と同名なので
 * 「名前が見えること」は幽霊が居ても真になる。数で見れば空振りしない。
 */
export function participantCount(page: Page, count = 2): Locator {
  return page.getByText(`参加者 (${String(count)}人)`, { exact: true });
}
