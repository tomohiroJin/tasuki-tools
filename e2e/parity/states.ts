/**
 * 撮る状態の目録（#321・設計正本 §5.5）。
 *
 * **状態ごとに、その状態にしか無い目印を書き出しの前に断定する。** 状態を作り損ねて両側が玄関へ
 * 飛ぶと、同じ玄関を比べて差 0 件になる。目印は役割と名前で掴む（クラス名で掴まない）。
 *
 * 状態は既存 spec の作り方で作る。**`routeWebSocket` は使わない** —— フレームを中継するページは同期を
 * 取りこぼす（`e2e/README.md`）うえ、閉じるだけの形でもページから見ると接続がいったん開く（実測・`trackSockets`）。
 * 接続を落とす・受け取らない・行き先を変える状態は、`addInitScript` で `WebSocket` を包んで作る
 * （`timer.spec.ts` の `armRoomLoss` と同じ差し込み方）。
 *
 * **網羅は規則の使用状況（E8・PR 2 から）で確かめる。** ここに足りない状態は、PR 2 以降で
 * 「一度も当たらない規則」として見つかる。
 */
import { expect, type Locator, type Page } from '@playwright/test';
import {
  createRoom,
  currentDriverRow,
  intervalButton,
  joinAsDriver,
  joinViaHub,
  lobbyRotationRow,
  MISSING_ROOM_CODE,
  statusStrip,
} from '../support/timer';

export type OpenPage = (label: string) => Promise<Page>;

export interface ParityState {
  readonly name: string;
  /** 状態を作り、撮る対象のページを返す。`open` は側（基準・ブランチ）ごとの新しい文脈でページを開く。 */
  readonly setup: (open: OpenPage) => Promise<Page>;
  /** その状態にしか無い目印。 */
  readonly marker: (page: Page) => Locator;
  /** 比べる要素数の下限。これを下回ったら状態を作り損ねている。 */
  readonly minElements: number;
  /** 画素の比較で隠す要素（ルームコード・QR・招待 URL・経過時間・残り時間。理由と代償は台帳の「画素のマスク」）。 */
  readonly mask: (page: Page) => Locator[];
}

export const WIDTHS = [360, 640, 768, 1024, 1280] as const;

const HOST = 'ホスト';
const GUEST = 'ゲスト';

/**
 * ルームコードの形（`apps/tasuki-sync` の `NanoidCodeGen`: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` から 6 文字）。
 *
 * 招待パネルの大きいコード（`InvitePanel.tsx`）と喪失画面の「ルーム XXXXXX」（`SessionLost.tsx`）は、どちらも
 * 素の `<span>` で役割も名前も持たない。**テキストがコードの形そのものである要素**を掴むのが最小の手段。
 * 画面の他の文字にこの形（大文字と数字だけの 6 文字）は無い。
 */
const ROOM_CODE_TEXT = /^[A-HJKMNP-Z2-9]{6}$/;

/** ステータスの帯のルームコード（`StatusStrip.tsx` の `(XXXXXX)`）。 */
const STRIP_ROOM_CODE_TEXT = /^\([A-HJKMNP-Z2-9]{6}\)$/;

/**
 * ルームコード・QR・招待 URL・残り時間・経過時間は、部屋ごと・時刻ごとに変わる（設計正本 §5.3）。
 * 計測弧は隠さず、撮るときに長さを固定する（{@link SCREENSHOT_STYLE}）。
 *
 * - ルームコードは、コードの要素ではなく**その親**（コードとコピーのボタンの行・喪失画面の「ルーム XXXXXX」）を
 *   隠す。コードの字は等幅ではないので、コードの箱の幅が部屋ごとに変わり、中央に寄せた行の中でコピーのボタンの
 *   位置も端数だけ動く。コードの要素だけを隠すと、その縁で 1px の差が出た（実測・lobby-notify-open）。
 *   隠れたコピーのボタンは、スタイルの比較では比べている
 * - 経過時間（`Session.tsx` の「経過 00:00」・`Summary.tsx` の「所要時間」の値）も役割と名前を持たないので、
 *   札の文字から辿る（残り時間は `timer` の役割で掴める）
 * - ステータスの帯は、ルームコードの `(XXXXXX)` だけを隠す（帯の残り —— 画面の名前・戻る導線・名前・接続状態・
 *   通知設定 —— は画素で比べる。狭めた後の通しの比較で画素の差 0 を確かめた・台帳）
 */
function roomMask(page: Page): Locator[] {
  return [
    page.getByRole('img', { name: /QR コード$/ }),
    page.getByText(ROOM_CODE_TEXT).locator('xpath=..'),
    page.locator('span', { hasText: /^経過 / }).getByText(/^\d+:\d{2}$/),
    page.locator('p', { hasText: /^所要時間$/ }).locator('xpath=following-sibling::p[1]'),
    page.getByRole('timer'),
    page.getByLabel('ステータス情報').getByText(STRIP_ROOM_CODE_TEXT),
    page.locator('text=/\\/\\?room=/'),
  ];
}

/**
 * 計測弧の円（`CircularProgress.tsx` の根の 2 つ目の `<svg>` の 2 つ目の `<circle>`・進んだ分を描く弧）の CSS セレクタ。
 * 根は `relative inline-flex` の `<div>` で、子は目盛りの `<svg>`・弧の `<svg>`・運針の `<svg>`・残り時間を包む `<div>` の順。
 * 役割も名前も無いので、残り時間（`role="timer"`）を包む `<div>` を持つ根から構造で辿る（クラス名は PR 2 以降で変わるので使わない）。
 */
export const METER_ARC_SELECTOR = 'div:has(> div > [role="timer"]) > svg:nth-of-type(2) > circle:nth-of-type(2)';

/**
 * 撮るときだけ計測弧の長さを固定値にする CSS（`page.screenshot` の `style`）。
 *
 * 弧の長さは経過率で決まり、経過率はサーバーが決めた開始時刻と端末の時計の補正から求める。両側は別のセッションを
 * 別の時刻に撮るので、**状態の作り方では揃えられない**（時計を止めても、止めた時点の経過率が両側で違う）。
 * そこで撮るときだけ `stroke-dashoffset` を両側同じ値に上書きする。**マスクにはしない** —— 弧の `<svg>` はダイヤル全体を
 * 覆う正方形で、隠すと目盛り（`<line>` の座標は CSS ではないのでスタイルの比較でも守れない）・下地の円・「Paused」まで
 * 画素で比べなくなる。上書きなら弧の色・線幅・発光・先端の形・目盛りは画素で比べたまま残る。
 * スタイルの比較の `stroke-dashoffset` は `noise.ts` で名指しする。値は先端が見える長さなら何でもよい。
 */
export const SCREENSHOT_STYLE = `${METER_ARC_SELECTOR} { stroke-dashoffset: 120px !important; }`;

/**
 * ページの時計を差し替える（時間は普段どおり流れる）。**読み込みの前に呼ぶ。**
 *
 * 自動で消える表示（交代の知らせ 2.5 秒・メモの更新 1.5 秒）と、刻々と変わる表示（残りわずか）を、
 * 5 つの幅を撮り終えるまで留めるために使う。留めるのは {@link freezeClock}。
 */
async function installClock(page: Page): Promise<void> {
  await page.clock.install();
}

/**
 * ページの時計をいまの時刻で止める。以後 `setTimeout` も `Date.now()` も進まない。
 * CSS のアニメーションは止まらない（それは `reducedMotion` と `animations: 'disabled'` が受け持つ）。
 */
async function freezeClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  // 読んでから止めるまでの往復の間にも時計は進む。少し先を指さないと「過去へは進めない」で落ちる（実測）。
  await page.clock.pauseAt(now + FREEZE_LEAD_MS);
}

/** 時計を止める時刻を、いまからどれだけ先に置くか。自動で消える表示の寿命（最短 1.5 秒）より十分短い。 */
const FREEZE_LEAD_MS = 200;

/** 受け取りを止める仕掛けの合図。 */
interface DeafWindow {
  __parityDeaf: { deaf: boolean };
}

/**
 * 合図の後、そのページが同期のフレームを受け取らないようにする（読み込みの前に呼ぶ）。
 * 接続は保ったまま `onmessage` だけを黙らせる。フレームは中継しない（`routeWebSocket` は使わない）。
 *
 * 残りわずかを撮る間に、サーバーが実時間で起こす交代（残り 0 秒）を画面へ届かせないために使う。
 */
async function armDeafness(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const flag = { deaf: false };
    Object.defineProperty(window, '__parityDeaf', { value: flag });
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      override set onmessage(handler: ((this: WebSocket, ev: MessageEvent) => unknown) | null) {
        super.onmessage =
          handler === null
            ? null
            : function (this: WebSocket, ev: MessageEvent): unknown {
                return flag.deaf ? undefined : handler.call(this, ev);
              };
      }

      override get onmessage(): ((this: WebSocket, ev: MessageEvent) => unknown) | null {
        return super.onmessage;
      }
    };
  });
}

async function lobbyWithGuest(
  open: OpenPage,
  options: { readonly clock?: boolean } = {},
): Promise<{ host: Page; guest: Page }> {
  const host = await open('host');
  if (options.clock === true) await installClock(host);
  const code = await createRoom(host, HOST);
  const guest = await open('guest');
  if (options.clock === true) await installClock(guest);
  await joinAsDriver(guest, code, GUEST);
  await expect(lobbyRotationRow(host, GUEST, 2)).toHaveCount(1);
  return { host, guest };
}

/**
 * 確認のダイアログを、開くボタンに**フォーカスを載せずに**開く（`click()` ではなく click の事象だけを送る）。
 *
 * **フォーカスを載せて開くと、撮る間にページがそのボタンまでスクロールして戻る。** 確認のダイアログ
 * （`ConfirmDialog`）のフォーカストラップ（`useFocusTrap`）は `onClose` を依存に持ち、呼ぶ側は毎回新しい関数を
 * 渡す（`EndSessionZone.tsx`・`RosterPanel.tsx` の `onCancel={() => …}`）。再描画のたびに後始末が走り、開く前に
 * フォーカスしていた要素へ `focus()` を戻す。それが押したボタンだと、そのたびにページがボタンまでスクロールする
 * （実測: 先頭へ戻して 300ms 後に 1280 で 388px・640 で 574px へ戻った）。再描画は残り時間の刻みのほか、幅の変更・
 * 書き出しの `relayout`・全画面の撮影でも起きるので、時計を止めても撮影の時点で片側だけ戻っていた（実測）。
 * `fixed` のダイアログは全画面の撮影でもスクロールの位置に描かれるので、ダイアログの高さが両側でずれて写る。
 * 戻し先が `body` なら `focus()` はスクロールしない。ダイアログの姿（取消ボタンに初期フォーカス）は変わらない。
 */
async function openDialogWithoutFocus(button: Locator): Promise<void> {
  await expect(button).toBeEnabled();
  await button.dispatchEvent('click');
}

async function startSession(host: Page): Promise<void> {
  await host.getByRole('button', { name: 'セッションを開始' }).click();
  await expect(host.getByRole('timer')).toBeVisible();
}

/** 同期サーバーへ繋がらなくする仕掛けの合図。 */
interface SocketsWindow {
  __paritySockets: WebSocket[];
  __paritySyncDown: { down: boolean };
}

/**
 * 接続を記録し、合図の後は timer の同期の接続を**張りかけたところで自分から閉じる**
 * （`timer.spec.ts` の `armRoomLoss` と同じ差し込み方）。
 *
 * **`routeWebSocket` で閉じる形は使わない。** サーバーへ繋がない経路でも、ページから見ると接続は
 * いったん開く（`onopen` が走ってバナーが消え「接続中」に戻る・実測）。
 * **聞いていないポートへ向ける形も使わない。** `http` のページからだと `error` だけが届き、
 * `close` が来ないまま「つないでいます」に留まる（実測。`data:` のページでは即座に来る）。
 * 確立前に閉じれば `onopen` を経ずに `onclose` だけが届き、再接続中のまま留まる。
 */
async function trackSockets(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const opened: WebSocket[] = [];
    const flag = { down: false };
    Object.defineProperty(window, '__paritySockets', { value: opened });
    Object.defineProperty(window, '__paritySyncDown', { value: flag });
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        opened.push(this);
        if (flag.down && /[?&]tool=timer\b/.test(String(url))) this.close();
      }
    };
  });
}

/** 合図を立て、いまの timer の接続を落とす。以後の再接続はすべて拒否される。 */
async function dropSync(page: Page): Promise<void> {
  const closed = await page.evaluate(() => {
    const w = window as unknown as SocketsWindow;
    w.__paritySyncDown.down = true;
    const timer = w.__paritySockets.filter((s) => /[?&]tool=timer\b/.test(s.url));
    const last = timer[timer.length - 1];
    last?.close();
    return last !== undefined;
  });
  expect(closed, '落とす接続が見つからない').toBe(true);
}

/**
 * 記録の保存に失敗させる（`IDBObjectStore.put` を合図の後だけ投げさせる）。
 *
 * 完了記録の保存先は IndexedDB（`records/indexeddb.ts` の `saveRecord`）。完成の瞬間の自動保存は
 * 通し、「記録を保存」の手動保存だけを失敗させる。
 */
async function armStorageFailure(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const flag = { failing: false };
    Object.defineProperty(window, '__parityStorage', { value: flag });
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ): IDBRequest<IDBValidKey> {
      if (flag.failing) throw new DOMException('parity: 保存に失敗させた', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
}

/**
 * 完了記録を保存するときに、完了日時と所要時間を決まった値へ差し替える（読み込みの前に呼ぶ）。
 *
 * **ページの時計（`page.clock`）では固定できない。** 記録はサーバーが完了の時点で作り、snapshot の
 * `sessionRecords` で配る（`snapshot-intents.ts`・`timer-core` の `records.ts` の `completedAt: now`）。
 * 端末はそれを IndexedDB へ `put` するだけなので、`put` に渡る値を差し替える。
 *
 * 履歴の「日時」（`History.tsx` の `toLocaleString`）は数字が等幅でなく、記録した時刻の字面で幅が変わって
 * 片側だけ 2 行に折れた（Task 5 の実測）。所要時間も撮るたびに変わる。どちらも両側で同じ値にする。
 */
async function armFixedRecordTime(page: Page): Promise<void> {
  await page.addInitScript(
    ({ completedAt, elapsedSeconds }: { completedAt: number; elapsedSeconds: number }) => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ): IDBRequest<IDBValidKey> {
        const isRecord = typeof value === 'object' && value !== null && 'completedAt' in value;
        const next = isRecord ? { ...value, completedAt, elapsedSeconds } : value;
        return key === undefined ? original.call(this, next) : original.call(this, next, key);
      };
    },
    { completedAt: FIXED_COMPLETED_AT, elapsedSeconds: FIXED_ELAPSED_SECONDS },
  );
}

/** 両側で同じにする完了日時（epoch ms）と所要時間（秒）。値そのものに意味は無い。 */
const FIXED_COMPLETED_AT = Date.UTC(2026, 8, 30, 3, 4, 5);
const FIXED_ELAPSED_SECONDS = 83;

/** ルーム喪失の仕掛けの状態（`timer.spec.ts` の `RoomLossState` と同じ形）。 */
interface RoomLossState {
  /** これが立って以降の `room.join` を、消えたルームへ向ける */
  losing: boolean;
  /** 実際に差し替えた回数 */
  rewritten: number;
}

interface LossWindow {
  __parityRoomLoss: RoomLossState;
  __parityLossSockets: WebSocket[];
}

/**
 * ルームを失わせる仕掛けを据える（`timer.spec.ts` の `armRoomLoss` を写した。
 * 合図の後の `room.join` だけを、もう存在しないルームへ向ける。フレームは中継しない）。
 */
async function armRoomLoss(page: Page): Promise<void> {
  await page.addInitScript((missingCode: string) => {
    const state: RoomLossState = { losing: false, rewritten: 0 };
    const opened: WebSocket[] = [];
    Object.defineProperty(window, '__parityRoomLoss', { value: state });
    Object.defineProperty(window, '__parityLossSockets', { value: opened });

    /** `room.join` の行き先だけを差し替える。他のフレームはそのまま通す。 */
    const redirectJoin = (payload: string): string => {
      let frame: unknown;
      try {
        frame = JSON.parse(payload);
      } catch {
        return payload;
      }
      if (typeof frame !== 'object' || frame === null) return payload;
      const message = frame as { command?: unknown; code?: unknown };
      if (message.command !== 'room.join' || typeof message.code !== 'string') return payload;
      return JSON.stringify({ ...message, code: missingCode });
    };

    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        opened.push(this);
      }

      override send(data: Parameters<WebSocket['send']>[0]): void {
        if (!state.losing || typeof data !== 'string') return super.send(data);
        const next = redirectJoin(data);
        if (next !== data) state.rewritten += 1;
        return super.send(next);
      }
    };
  }, MISSING_ROOM_CODE);
}

/** 合図を立て、いまの接続を落とす。再入室の `room.join` が消えたルームを指す。 */
async function loseRoom(page: Page): Promise<void> {
  const closed = await page.evaluate(() => {
    const w = window as unknown as LossWindow;
    w.__parityRoomLoss.losing = true;
    const socket = w.__parityLossSockets[w.__parityLossSockets.length - 1];
    if (socket === undefined) return false;
    socket.close();
    return true;
  });
  expect(closed, '落とす対象の接続が見つからない').toBe(true);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as LossWindow).__parityRoomLoss.rewritten), {
      message: 'room.join を差し替えられていない',
    })
    .toBeGreaterThan(0);
}

/** timer の `JOIN_RESPONSE_DEADLINE_MS`（`use-timer-sync.ts`）と同じ値。 */
const JOIN_RESPONSE_DEADLINE_MS = 10_000;

/**
 * 読み込み中（Loading）で待っている画面を作る。時計は差し替え済みで、まだ止めていない。
 *
 * ルームの無い `?room=` は玄関へ送られる（実測）。実在のルームを作ってから、同期の接続を最初から
 * 閉じさせて開き直す。復帰の snapshot が来ないので Loading に留まる。
 */
async function loadingWithSyncDown(open: OpenPage): Promise<Page> {
  const page = await open('host');
  await installClock(page);
  await trackSockets(page);
  await createRoom(page, HOST);
  await page.addInitScript(() => {
    (window as unknown as SocketsWindow).__paritySyncDown.down = true;
  });
  await page.reload();
  const waiting = page.getByRole('status').filter({ hasText: '読み込んでいます' });
  await expect(waiting).toBeVisible();
  // 最初の拒否が届くまでは「つないでいます」。「再接続中」に落ち着くまで待つ
  await expect(waiting.getByLabel('接続状態')).toContainText('再接続中');
  return page;
}

async function completeSession(host: Page): Promise<void> {
  await host.getByRole('button', { name: '完成!', exact: true }).click();
  await host.getByRole('button', { name: '完成として記録する' }).click();
  await expect(host.getByRole('button', { name: /新しいセッション/ })).toBeVisible();
}

/**
 * 終わった直後に出る知らせの帯（「あなたがセッションを…しました。」）が見えたところで時計を止める。
 *
 * 帯は 4 秒で消える（`use-banner.ts` の `AUTO_DISMISS_MS`）。止めないと、撮り終えるまでの時間次第で片側だけ
 * 帯が消え、下の要素が上へ詰まって差になった（Task 5 の実測: summary-complete の 1280 で 192 件）。
 * 時計は {@link installClock} で読み込みの前に差し替えておく。
 */
async function holdEndNotice(host: Page, text: RegExp): Promise<void> {
  const notice = host.getByRole('status').filter({ hasText: text });
  await expect(notice).toBeVisible();
  await freezeClock(host);
  await expect(notice).toBeVisible();
}

/**
 * `session-memo-markdown` の共有メモの本文。`markdown.css` の全規則が当たるよう、`@tasuki/markdown` が描く
 * ブロック（見出し 1〜3 段・段落・`- `・`1. `・`> `・コードの囲み）と行内（`` `code` ``・`**太字**`・`*斜体*`・
 * `[文字](URL)`）を 1 つずつ以上入れる。段落の 2 行目は行内の改行（`<br>`）を当てる。
 */
const RICH_MEMO = [
  '# Parity heading one',
  'Intro with `inline code`, **strong text** and *emphasis*.',
  'Second line of the same paragraph.',
  '',
  '## Parity heading two',
  'Read [the example link](https://example.com) before rotating.',
  '',
  '### Parity heading three',
  '- first bullet',
  '- second bullet',
  '',
  '1. first step',
  '2. second step',
  '',
  '> quoted line one',
  '> quoted line two',
  '',
  '```',
  'const parity = 1;',
  'console.log(parity);',
  '```',
].join('\n');

export const STATES: readonly ParityState[] = [
  {
    name: 'lobby-alone',
    async setup(open) {
      const host = await open('host');
      await createRoom(host, HOST);
      return host;
    },
    marker: (p) => p.getByRole('button', { name: 'セッションを開始' }),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'lobby-two',
    async setup(open) {
      return (await lobbyWithGuest(open)).host;
    },
    marker: (p) => lobbyRotationRow(p, GUEST, 2),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'lobby-notify-open',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await host.getByRole('button', { name: '通知設定' }).click();
      return host;
    },
    marker: (p) => p.getByLabel('交代通知の設定'),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'lobby-passphrase',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      // 合言葉のパネル（`PassphrasePanel`）はロビーに常に出ている（開閉は無い）。入力欄だけの姿は
      // lobby-alone が撮るので、ここは設定した後の「パスフレーズ設定中」と「解除」の姿を撮る
      await host.getByRole('textbox', { name: 'パスフレーズ' }).fill('parity-passphrase');
      await host.getByRole('button', { name: '設定', exact: true }).click();
      await expect(host.getByText('パスフレーズ設定中')).toBeVisible();
      return host;
    },
    marker: (p) => p.getByText('パスフレーズ設定中'),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'lobby-advanced-open',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      // 詳細設定（`SessionConfigPanel.tsx` の `<details>`）は既定で閉じていて、中のチェックボックス 2 つ
      // （「ナビゲーター役を明示する」「強い交代通知」）は他のどの状態でも見えない（Task 5 の報告）。開いて撮る
      await host.getByText('詳細設定', { exact: true }).click();
      await expect(host.getByRole('checkbox', { name: /ナビゲーター役を明示する/ })).toBeVisible();
      return host;
    },
    // 閉じた `<details>` の中身は見えない（`toBeVisible` が偽）ので、開いた状態にしか無い目印になる
    marker: (p) => p.getByRole('checkbox', { name: /強い交代通知/ }),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-driver',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await startSession(host);
      return host;
    },
    marker: (p) => p.getByRole('timer'),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-navigator',
    async setup(open) {
      const { host, guest } = await lobbyWithGuest(open);
      await startSession(host);
      await expect(currentDriverRow(guest)).toContainText(HOST);
      return guest;
    },
    marker: (p) => p.getByRole('timer'),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-paused',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await startSession(host);
      await host.getByRole('button', { name: '一時停止', exact: true }).click();
      return host;
    },
    marker: (p) => p.getByRole('button', { name: '再開', exact: true }),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-switched',
    async setup(open) {
      const { host, guest } = await lobbyWithGuest(open, { clock: true });
      // 全画面の知らせはルーム設定「強い交代通知」が ON のときだけ出る（`use-switch-alert.ts`）
      await host.getByText('詳細設定').click();
      // 制御部品（サーバーの往復で状態が変わる）なので `check()` は「変わらない」で落ちる。押して待つ
      await host.getByRole('checkbox', { name: /強い交代通知/ }).click();
      await expect(host.getByRole('checkbox', { name: /強い交代通知/ })).toBeChecked();
      // 相手の側にも届いてから始める（詳細設定は畳まれているので開いて見る）
      await guest.getByText('詳細設定').click();
      await expect(guest.getByRole('checkbox', { name: /強い交代通知/ })).toBeChecked();
      await startSession(host);
      await host.getByRole('button', { name: 'スキップ', exact: true }).click();
      await expect(currentDriverRow(guest)).toContainText(GUEST);
      // 知らせは 2.5 秒で消える。見えたところで時計を止め、撮り終えるまで留める
      await expect(guest.getByRole('alertdialog', { name: 'ドライバー交代通知' })).toBeVisible();
      await freezeClock(guest);
      return guest;
    },
    marker: (p) => p.getByRole('alertdialog', { name: 'ドライバー交代通知' }),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-urgent',
    async setup(open) {
      const host = await open('host');
      await installClock(host);
      await armDeafness(host);
      const code = await createRoom(host, HOST);
      const guest = await open('guest');
      await joinAsDriver(guest, code, GUEST);
      await expect(lobbyRotationRow(host, GUEST, 2)).toHaveCount(1);
      await intervalButton(host, '3分').click();
      await startSession(host);
      // 残り 10 秒以下で、**計測中のときだけ**緊急表示になる（Session.tsx の `isUrgent`）。
      // 一時停止すると消えるので、止めるのは時計（表示の刻み）だけにする。最短の間隔でも約 3 分待つ。
      // 交代はサーバーが実時間で起こす（残り 0 秒）。受け取りを止めて届かせない
      // （止めずに撮ると、5 つの幅を撮り終える前に交代が届いて緊急表示が消えた・実測）。
      // **受け取りは残り 40 秒の手前で止める。** 表示が 00:13 のときにサーバーの交代が届いて 03:00 へ戻ったことが
      // 2 回続いた（実測・修正ラウンド 1）。ページの時計（`page.clock`）が負荷で実時間より遅れたと見ている（推測）。
      // timer の画面は受け取りが途絶えても時間切れを持たないので、表示は手元の時計で 00:10 まで進む。
      await expect(host.getByRole('timer')).toHaveAttribute('aria-label', /残り時間 00:[0-3]\d$/, {
        timeout: 200_000,
      });
      await host.evaluate(() => {
        (window as unknown as DeafWindow).__parityDeaf.deaf = true;
      });
      await expect(host.getByRole('timer')).toHaveAttribute('aria-label', /残り時間 00:(09|10)$/, {
        timeout: 60_000,
      });
      await freezeClock(host);
      return host;
    },
    marker: (p) => p.getByRole('timer', { name: /残り時間 00:(0\d|10)$/ }),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-remove-confirm',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await startSession(host);
      const remove = host.getByRole('button', { name: `${GUEST} を退出させる` });
      await openDialogWithoutFocus(remove);
      await expect(host.getByRole('dialog')).toBeVisible();
      // 行の操作ボタンは押した後 450ms だけ送信中（半透明・待ちカーソル）になる（`RosterPanel.tsx` の
      // `MiniButton`）。明けるのを待たないと、撮った時刻で片側だけ送信中の姿になる（実測）
      await expect(remove).not.toHaveAttribute('aria-busy', 'true');
      return host;
    },
    marker: (p) => p.getByRole('dialog', { name: `${GUEST} さんを退出させますか？` }),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-proxy-form',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await startSession(host);
      await host.getByRole('button', { name: '代理参加者を追加' }).click();
      return host;
    },
    marker: (p) => p.getByLabel('代理参加者の名前'),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-memo',
    async setup(open) {
      const { host, guest } = await lobbyWithGuest(open, { clock: true });
      await startSession(host);
      // 共有メモはセッションのタブの中にある（「メモ」のタブは無い）。編集して確定すると送る
      await guest.getByRole('button', { name: '編集', exact: true }).click();
      await guest.getByLabel('共有メモ').fill('parity の更新');
      await guest.getByRole('button', { name: 'プレビューに戻る' }).click();
      // 受け取った側は 1.5 秒だけ強調する（`SharedMemo.tsx`）。見えたところで時計を止める
      await expect(host.getByText('共有メモが更新されました')).toBeAttached();
      await freezeClock(host);
      await expect(host.getByText('parity の更新')).toBeVisible();
      return host;
    },
    marker: (p) => p.getByText('共有メモが更新されました'),
    minElements: 60,
    mask: roomMask,
  },
  {
    // `session-memo` の本文は 1 段落だけで、`markdown.css` の規則の大半（見出し 3 段・箇条書き・番号つき・
    // 引用・コードの囲み・行内コード・太字・斜体・リンク・ブロックの間隔）が比較にも E8 にも掛からない（#321 PR 2）。
    // 本文は `@tasuki/markdown` が描く記法だけで組む。見出しを先頭に置くのは `.markdown-heading:first-child` を当てるため、
    // 箇条書き・番号つきを 2 項目にするのは項目の間隔（`:not(:last-child)`）を当てるため。
    // 文字は ASCII に寄せる（書体の層を追加で引かせず、撮る時刻で字形が揃わない揺れを作らない）
    name: 'session-memo-markdown',
    async setup(open) {
      const { host, guest } = await lobbyWithGuest(open, { clock: true });
      await startSession(host);
      await guest.getByRole('button', { name: '編集', exact: true }).click();
      await guest.getByLabel('共有メモ').fill(RICH_MEMO);
      await guest.getByRole('button', { name: 'プレビューに戻る' }).click();
      // 受け取った側は 1.5 秒だけ強調する（`SharedMemo.tsx`）。見えたところで時計を止める
      await expect(host.getByText('共有メモが更新されました')).toBeAttached();
      await freezeClock(host);
      await expect(host.getByRole('heading', { name: 'Parity heading three' })).toBeVisible();
      return host;
    },
    marker: (p) => p.getByRole('heading', { name: 'Parity heading three' }),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-end-confirm',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await startSession(host);
      await openDialogWithoutFocus(host.getByRole('button', { name: '完成!', exact: true }));
      await expect(host.getByRole('dialog')).toBeVisible();
      return host;
    },
    marker: (p) => p.getByRole('dialog', { name: 'このセッションを完成として記録しますか？' }),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'banner-warn-reconnecting',
    async setup(open) {
      const host = await open('host');
      await trackSockets(host);
      await createRoom(host, HOST);
      await expect(statusStrip(host)).toContainText('接続中 (Connected)');
      // いまの接続を落とし、以後の再接続を拒否させる。バナーは繋がり直すまで消えない
      await dropSync(host);
      return host;
    },
    marker: (p) => p.getByRole('status').filter({ hasText: '再接続しています' }),
    minElements: 30,
    mask: roomMask,
  },
  {
    name: 'banner-error-save-failed',
    async setup(open) {
      const host = await open('host');
      await armStorageFailure(host);
      await createRoom(host, HOST);
      await startSession(host);
      await completeSession(host);
      await host.evaluate(() => {
        (window as unknown as { __parityStorage: { failing: boolean } }).__parityStorage.failing = true;
      });
      await host.getByRole('button', { name: /記録を保存/ }).click();
      return host;
    },
    marker: (p) => p.getByRole('alert').filter({ hasText: '記録の保存に失敗しました' }),
    minElements: 30,
    mask: roomMask,
  },
  {
    name: 'summary-complete',
    async setup(open) {
      const { host } = await lobbyWithGuest(open, { clock: true });
      await startSession(host);
      await completeSession(host);
      await holdEndNotice(host, /^あなたがセッションを完成として記録しました。$/);
      return host;
    },
    marker: (p) => p.getByLabel('達成'),
    minElements: 30,
    mask: roomMask,
  },
  {
    name: 'summary-abort',
    async setup(open) {
      const { host } = await lobbyWithGuest(open, { clock: true });
      await startSession(host);
      await host.getByRole('button', { name: /途中で終える/ }).click();
      await host.getByRole('button', { name: '終える（記録なし）' }).click();
      await holdEndNotice(host, /^あなたがセッションを中断しました。$/);
      return host;
    },
    marker: (p) => p.getByRole('heading', { name: 'セッション終了（中断）' }),
    minElements: 20,
    mask: roomMask,
  },
  {
    name: 'history-empty',
    async setup(open) {
      const page = await open('host');
      await page.goto('/timer/?view=history');
      return page;
    },
    marker: (p) => p.getByRole('heading', { name: '完了記録の履歴' }),
    minElements: 15,
    mask: () => [],
  },
  {
    name: 'history-with-record',
    async setup(open) {
      const host = await open('host');
      await armFixedRecordTime(host);
      await createRoom(host, HOST);
      await startSession(host);
      await completeSession(host);
      await host.getByRole('button', { name: /記録を保存/ }).click();
      await host.goto('/timer/?view=history');
      // 差し替えが効いたことを確かめる（効かなければ日時が撮るたびに変わり、片側だけ折り返す）
      const expected = await host.evaluate((t) => new Date(t).toLocaleString('ja-JP'), FIXED_COMPLETED_AT);
      await expect(host.locator('dt', { hasText: '日時' }).locator('xpath=following-sibling::dd[1]')).toHaveText(expected);
      await expect(host.locator('dt', { hasText: '所要時間' }).locator('xpath=following-sibling::dd[1]')).toHaveText(
        `${Math.floor(FIXED_ELAPSED_SECONDS / 60)}分${String(FIXED_ELAPSED_SECONDS % 60).padStart(2, '0')}秒`,
      );
      return host;
    },
    // 見出しは空の履歴にもある（恒真になる）。**記録の行そのもの**を目印にする
    marker: (p) => p.getByRole('list', { name: '完了記録の一覧' }).getByRole('listitem'),
    // 空の履歴は 38 要素（実測）。記録 1 行で 64 要素（実測）になる。その間に置き、空の履歴では落ちるようにする
    minElements: 50,
    // 所要時間と日時は `armFixedRecordTime` で両側同じ値にしたので隠さない（画素でも比べる）
    mask: () => [],
  },
  {
    name: 'loading-unreachable',
    async setup(open) {
      const page = await loadingWithSyncDown(open);
      // 10 秒で「読み込めませんでした」へ移る（`JOIN_RESPONSE_DEADLINE_MS`）ので、時計を止めて留める
      await freezeClock(page);
      return page;
    },
    marker: (p) => p.getByRole('status').filter({ hasText: '読み込んでいます' }),
    minElements: 10,
    mask: () => [],
  },
  {
    name: 'loading-timed-out',
    async setup(open) {
      const page = await loadingWithSyncDown(open);
      // 入室の要求を送ってから 10 秒（`JOIN_RESPONSE_DEADLINE_MS`・`use-timer-sync.ts` の `armJoinDeadline`）
      // 答えが無いと時間切れの表示へ移る。時計を進めて起こし、表示が出たら止める
      await page.clock.fastForward(JOIN_RESPONSE_DEADLINE_MS);
      await expect(page.getByRole('heading', { name: 'ルームの情報を読み込めませんでした' })).toBeVisible();
      await freezeClock(page);
      return page;
    },
    marker: (p) => p.getByRole('alert').filter({ hasText: 'ルームの情報を読み込めませんでした' }),
    minElements: 15,
    mask: () => [],
  },
  {
    name: 'status-strip-lobby',
    async setup(open) {
      const host = await open('host');
      await createRoom(host, HOST);
      await expect(statusStrip(host)).toContainText('ロビー');
      return host;
    },
    marker: (p) => statusStrip(p),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-lost',
    async setup(open) {
      const host = await open('host');
      await armRoomLoss(host);
      const code = await createRoom(host, HOST);
      const guest = await open('guest');
      await joinAsDriver(guest, code, GUEST);
      await expect(lobbyRotationRow(host, GUEST, 2)).toHaveCount(1);
      await startSession(host);
      await loseRoom(host);
      // 入室の枠が枯れていると JOIN_RATE_LIMITED を一度挟む（timer.spec.ts の説明）。長めに待つ。
      await expect(host.getByRole('heading', { name: 'セッションが見つかりません' })).toBeVisible({ timeout: 20_000 });
      return host;
    },
    marker: (p) => p.getByRole('heading', { name: 'セッションが見つかりません' }),
    minElements: 10,
    mask: roomMask,
  },
  {
    name: 'lobby-guest-outside',
    // ゲストが名乗って入り、**まだ交代の輪に加わっていない**ロビー（ゲストの画面）。自分の行の「ドライバーに加わる」は
    // `PrimaryButton` に `text-xs px-3 py-1.5` を渡す（`Lobby.tsx`）。他の状態はどれもゲストを輪に加えてから撮るので、
    // このボタンと輪の外の行の姿は 1 度も出なかった（Task 8 の除去検査で発見）
    async setup(open) {
      const host = await open('host');
      const code = await createRoom(host, HOST);
      const guest = await open('guest');
      await joinViaHub(guest, code, GUEST);
      return guest;
    },
    marker: (p) => p.getByRole('button', { name: 'ドライバーに加わる' }),
    minElements: 60,
    mask: roomMask,
  },
  {
    name: 'session-guest-skipping',
    // セッション中にホストがゲストを一時離脱させた、ゲストの画面。自分の札（`SelfDriverToggle.tsx`）に「離脱中」と
    // 「復帰」（`PrimaryButton` に `text-xs px-3 py-1.5`）が出る。他の状態には離脱中の姿が無かった（Task 8 の除去検査で発見）
    async setup(open) {
      const { host, guest } = await lobbyWithGuest(open);
      await startSession(host);
      await host.getByRole('button', { name: `${GUEST} を一時離脱させる` }).click();
      await expect(guest.getByRole('button', { name: '復帰', exact: true })).toBeVisible();
      // 押した側の行の操作ボタンは 450ms だけ送信中になる（session-remove-confirm の注記）。撮るのはゲストの画面だが、
      // ホストの往復が終わったことも待つ
      await expect(host.getByRole('button', { name: `${GUEST} を復帰させる` })).not.toHaveAttribute('aria-busy', 'true');
      return guest;
    },
    marker: (p) => p.getByRole('button', { name: '復帰', exact: true }),
    minElements: 60,
    mask: roomMask,
  },
];
