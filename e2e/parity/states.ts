/**
 * 撮る状態の目録（#321・設計正本 §5.5）。
 *
 * **状態ごとに、その状態にしか無い目印を書き出しの前に断定する。** 状態を作り損ねて両側が玄関へ
 * 飛ぶと、同じ玄関を比べて差 0 件になる。目印は役割と名前で掴む（クラス名で掴まない）。
 *
 * 状態は既存 spec の作り方で作る。`routeWebSocket` は「繋がらない」（接続を閉じるだけ）にしか使わない
 * —— フレームを中継するページは同期を取りこぼす（`e2e/README.md`）。
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
  /** 画素の比較で隠す要素（ルームコード・QR・招待 URL・経過時間）。 */
  readonly mask: (page: Page) => Locator[];
}

export const WIDTHS = [360, 640, 768, 1024, 1280] as const;

const HOST = 'ホスト';
const GUEST = 'ゲスト';

/** ルームコード・QR・招待 URL・残り時間は、部屋ごと・時刻ごとに変わる。 */
function roomMask(page: Page): Locator[] {
  return [
    page.getByRole('img', { name: /QR コード$/ }),
    page.getByRole('timer'),
    page.getByLabel('ステータス情報'),
    page.locator('text=/\\/\\?room=/'),
  ];
}

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

async function completeSession(host: Page): Promise<void> {
  await host.getByRole('button', { name: '完成!', exact: true }).click();
  await host.getByRole('button', { name: '完成として記録する' }).click();
  await expect(host.getByRole('button', { name: /新しいセッション/ })).toBeVisible();
}

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
      // 交代はサーバーが実時間で起こす（残り 0 秒）。時計を止めるのと同時に受け取りも止め、届かせない
      // （止めずに撮ると、5 つの幅を撮り終える前に交代が届いて緊急表示が消えた・実測）。
      await expect(host.getByRole('timer')).toHaveAttribute('aria-label', /残り時間 00:(09|10)$/, {
        timeout: 200_000,
      });
      await host.evaluate(() => {
        (window as unknown as DeafWindow).__parityDeaf.deaf = true;
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
      await host.getByRole('button', { name: `${GUEST} を退出させる` }).click();
      return host;
    },
    marker: (p) => p.getByRole('dialog'),
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
    name: 'session-end-confirm',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await startSession(host);
      await host.getByRole('button', { name: '完成!', exact: true }).click();
      return host;
    },
    marker: (p) => p.getByRole('dialog'),
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
      const { host } = await lobbyWithGuest(open);
      await startSession(host);
      await completeSession(host);
      return host;
    },
    marker: (p) => p.getByLabel('達成'),
    minElements: 30,
    mask: roomMask,
  },
  {
    name: 'summary-abort',
    async setup(open) {
      const { host } = await lobbyWithGuest(open);
      await startSession(host);
      await host.getByRole('button', { name: /途中で終える/ }).click();
      await host.getByRole('button', { name: '終える（記録なし）' }).click();
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
      await createRoom(host, HOST);
      await startSession(host);
      await completeSession(host);
      await host.getByRole('button', { name: /記録を保存/ }).click();
      await host.goto('/timer/?view=history');
      return host;
    },
    marker: (p) => p.getByRole('heading', { name: '完了記録の履歴' }),
    minElements: 20,
    mask: (p) => [p.locator('time')],
  },
  {
    name: 'loading-unreachable',
    async setup(open) {
      // ルームの無い `?room=` は玄関へ送られる（実測）。実在のルームを作ってから、
      // 同期の接続を最初から拒否させて開き直す。復帰の snapshot が来ないので Loading に留まる
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
      // 最初の拒否が届くまでは「つないでいます」。落ち着いてから時計を止める ——
      // 10 秒で「読み込めませんでした」へ移る（`JOIN_RESPONSE_DEADLINE_MS`）ので留める
      await expect(waiting.getByLabel('接続状態')).toContainText('再接続中');
      await freezeClock(page);
      return page;
    },
    marker: (p) => p.getByRole('status').filter({ hasText: '読み込んでいます' }),
    minElements: 10,
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
];
