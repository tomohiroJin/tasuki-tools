/**
 * timer のシナリオ。
 *
 * - `@core #9` — ドライバー交代。**名前で判定してはいけない。** 名簿は役割に関係なく
 *   全員の名前を常時表示するので、「新ドライバーの名前が見えること」は交代がまったく
 *   起きていなくても最初から真になる。見るのは印そのものの位置と、それが両方の画面で
 *   同じに見えること。
 * - タグ無し #11 / #12 — #76 F-1 / F-3 の回帰防止（`local` 専用）。
 * - タグ無し #209 — 契約に合わない同期フレームを捨てたことの表出（`local` 専用。
 *   実サーバーの枠を使ううえ、壊れたフレームは本番では作れない）。
 * - タグ無し #142 — 同期サーバーの再起動でルームが消えたときの見え方（#76 F-4 の回帰。
 *   `local` 専用。本番のルームを消すことになるので本番では走らせない）。
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import {
  corruptSnapshotFrame,
  createRoom,
  currentDriverRow,
  driverRoster,
  invitedUrlText,
  joinAsDriver,
  joinAsDriverAt,
  MISSING_ROOM_CODE,
  lobbyRotationRow,
  statusStrip,
} from '../support/timer';

const HOST = 'e2e-a';
const GUEST = 'e2e-b';

test.describe('@core timer のドライバー交代が両方の画面に届く', () => {
  test('Given 2 人が交代の輪に居る / When スキップする / Then 印が新ドライバーへ移り、旧ドライバーから消える', async ({
    page,
    openPeer,
  }) => {
    // Given: 作成者と、招待リンクから来た 2 人目
    const code = await createRoom(page, HOST);
    const guest = await openPeer('timer-guest');
    await joinAsDriver(guest.page, code, GUEST);

    // Given の確認: **2 人が別人として、交代の輪に順番付きで並んでいること。**
    // 名前だけで待つと、輪に入る前に開始してしまい 1 人だけの輪になる
    await expect(lobbyRotationRow(page, HOST, 1)).toHaveCount(1);
    await expect(lobbyRotationRow(page, GUEST, 2)).toHaveCount(1);

    await page.getByRole('button', { name: 'セッションを開始' }).click();

    // Then その1: 交代前は作成者が現ドライバー。**両方の画面で**同じに見える
    for (const [label, target] of screens(page, guest.page)) {
      await expect(currentDriverRow(target), `${label}の画面`).toHaveCount(1);
      await expect(currentDriverRow(target), `${label}の画面`).toContainText(HOST);
    }

    // When: 交代する
    await page.getByRole('button', { name: 'スキップ', exact: true }).click();

    // Then その2: 印が 2 人目の行へ移り、作成者の行からは消えている
    for (const [label, target] of screens(page, guest.page)) {
      // 印が付いた行はちょうど 1 つ。2 人が同時にドライバー表示になる分裂を排除する
      await expect(currentDriverRow(target), `${label}の画面`).toHaveCount(1);
      await expect(currentDriverRow(target), `${label}の画面`).toContainText(GUEST);
      // 旧ドライバーの行から消えていること。行を名前で特定したうえで、
      // 印が無いことだけを見る（名前が見えるかどうかは判定に使わない）
      const previous = driverRoster(target).getByRole('listitem').filter({ hasText: HOST });
      // **先に行そのものが在ることを固定する。** これが無いと、旧ドライバーの行が
      // 名簿から丸ごと消えたときに子要素も 0 件になり、下の否定が
      // 「印が無い」ではなく「行が無い」で素通りする（実測で確認した）
      await expect(previous, `${label}の画面に旧ドライバーの行が無い`).toHaveCount(1);
      await expect(
        previous.getByRole('img', { name: '現在のドライバー' }),
        `${label}の画面で旧ドライバーの印が残っている`,
      ).toHaveCount(0);
    }
  });
});

/**
 * 招待パネルに出た URL でそのまま参加できること（#11・#76 F-1 の回帰防止）。
 *
 * **「開いて参加できた」だけでは F-1 の再発を検出できない。**
 * `deploy/timer/caddy/40-timer-legacy-room.conf` が旧共有リンクを救済しており、
 * 壊れた形（`/?room=CODE`）でも 301 で `/timer/?room=CODE` へ送られてしまう。
 * つまり参加は成立し、判定は緑になる。**表示された URL の pathname そのものを
 * 固定して初めて、この壊れ方を捕まえられる。**
 *
 * 救済の 301 は古いリンクのための保険であって、いま配る招待 URL が頼るもの
 * ではない（`apps/timer-web/src/ui/room-url.ts` の冒頭コメント）。
 */
test.describe('招待パネルに表示された URL でそのまま参加できる', () => {
  test('Given ルームの作成者 / When 画面に出た URL を 2 人目が開く / Then 玄関ではなく timer に着き、参加できる', async ({
    page,
    openPeer,
  }) => {
    // Given: 作成者がルームを作り、招待パネルが出ている
    await createRoom(page, HOST);

    // When: **画面に表示されている URL 文字列を読む。**
    //       `page.url()` を使うと、生成が壊れていても自分の居場所が返るだけで緑になる
    const shown = invitedUrlText(page);
    await expect(shown, '招待パネルの参加 URL').toHaveCount(1);
    // **見えていることまで見る。** `toHaveCount` も `innerText()` も可視性を問わないので、
    // URL の段落を `display: none` にしても、値は読めて参加も成立し、緑のまま通る
    // （実測）。非セキュアオリジンでは `navigator.clipboard` が無くコピーボタンが
    // 黙って何もしないため、**画面に出ている URL が唯一の招待手段**になる（#76 F-1）
    await expect(shown, '招待パネルの参加 URL が見えていない').toBeVisible();
    const invited = (await shown.innerText()).trim();

    // Then その1: **公開パスの上を指していること。**
    //             ここが `/` だと F-1 の再発だが、旧リンク救済の 301 に隠されて
    //             下の参加は成功してしまう。文字列そのものを見るのはこの 1 行だけで足りる
    expect(new URL(invited).pathname, `招待 URL の公開パス（${invited}）`).toBe('/timer/');

    // Then その2: その URL をそのまま開いて、実際に参加できる
    const guest = await openPeer('timer-invited');
    await joinAsDriverAt(guest.page, invited, GUEST);

    // Then その3: **2 人が別人として輪に並ぶ。** 同じ人が二重に見えているだけ、を排除する
    await expect(lobbyRotationRow(page, HOST, 1), '作成者の画面の 1 番目').toHaveCount(1);
    await expect(lobbyRotationRow(page, GUEST, 2), '作成者の画面の 2 番目').toHaveCount(1);
  });
});

/**
 * 再読込しても参加画面に戻らないこと（#12・#76 F-3 の回帰防止）。
 *
 * **作成者で試してはいけない。** 壊れ方は「復帰時に `participantId` が立たず、
 * `StatusStrip` が作成者へ縮退する」というもので（`App.tsx:687-688` の
 * `self?.displayName ?? room?.config.members[0]` / `self?.role ?? "host"`）、
 * 作成者自身で試すと縮退先と正解が一致してしまい、壊れていても緑になる。
 * **他人の名前と役割を見せられていた**のが F-3 の実害なので、2 人目で検証する。
 */
test.describe('timer を再読込しても参加画面に戻らない', () => {
  test('Given 参加済みの 2 人目 / When 再読込する / Then 参加画面に戻らず、自分の名前と役割が保たれる', async ({
    page,
    openPeer,
  }) => {
    // Given: 作成者のルームに 2 人目が参加している
    const code = await createRoom(page, HOST);
    const guest = await openPeer('timer-reload');
    await joinAsDriver(guest.page, code, GUEST);

    // Given の確認: 2 人目の画面に、2 人目自身として表示が出ている。
    // ここを固定しておくことで、下の判定が「最初からそう見えていただけ」ではなく
    // **再読込を越えて保たれた**ことの確認になる
    const strip = statusStrip(guest.page);
    await expect(strip, '2 人目のステータス表示').toHaveCount(1);
    await expect(strip).toContainText(GUEST);

    // When: 同じ page で再読込する。**新しい文脈を作ってはいけない。**
    //       復帰情報は sessionStorage にあり、文脈を変えると検証の意味が変わる
    await guest.page.reload();

    // Then その1: **参加画面に戻っていない。**
    //             ステータス表示は `mode` が `join` / `setup` のときは描画されないので
    //             （`App.tsx:819`）、見えていること自体が参加画面でない証拠になる。
    //             「参加ボタンが無い」という否定より、こちらのほうが空振りしない
    await expect(strip, '再読込後のステータス表示').toBeVisible();

    // Then その2: 自分の名前と役割が保たれている
    await expect(strip, '再読込後の表示名').toContainText(GUEST);
    await expect(strip, '再読込後の役割').toContainText('編集者');

    // Then その3: **作成者へ縮退していない。**
    //             否定は役割ラベルに当てる。名前で否定するとルームコードに
    //             作成者名が含まれる構成（ルーム名を付けた場合）で誤検出しうる
    await expect(strip, '作成者の役割へ縮退している').not.toContainText('ホスト');
  });
});

/** 判定は必ず両方の文脈で行う。落ちたときにどちらの画面かが分かるよう名前を添える。 */
function screens(host: Page, guest: Page): readonly (readonly [string, Page])[] {
  return [
    ['作成者', host],
    ['参加者', guest],
  ] as const;
}


test.describe('契約に合わない同期フレームを捨てたことが画面から分かる', () => {
  /**
   * その接続に届く `snapshot` を、指定の間だけ壊れた形へ差し替える。
   * **壊すのはブラウザと同期サーバーの間だけ**で、製品コードにテスト用の経路は作らない。
   *
   * **実際に壊せた回数を数えて返す。** 契約やフレームの形が変わって
   * `corruptSnapshotFrame` が素通しへ退化すると、症状は「表示が出ない」という
   * 原因の読めない失敗になる。**壊せていないことを、壊せていないと言えるようにする。**
   */
  async function corruptFrom(page: Page, corrupting: () => boolean): Promise<{ count: () => number }> {
    let corrupted = 0;
    await page.routeWebSocket(/\/timer\/ws$/, (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((message) => server.send(message));
      server.onMessage((message) => {
        const payload = typeof message === 'string' ? message : message.toString();
        const next = corrupting() ? corruptSnapshotFrame(payload) : payload;
        if (next !== payload) corrupted += 1;
        ws.send(next);
      });
    });
    return { count: () => corrupted };
  }

  /**
   * **`snapshot` を捨てる状況はほぼ必ず継続する**（契約に合わない値はサーバー側の
   * ルームに残り続ける）。その間、画面は生きて見えたまま古い状態で固まり、
   * 再接続もエラー表示も起きない。**利用者には「なぜか更新されない」としか分からない**
   * ——それを塞いだのが #209 で、ここはその実経路を通す。
   *
   * **固まっていることを、実際に固まらせて確かめる。** 2 人目の参加は snapshot でしか
   * 届かないので、捨てている側の画面には現れない。2 人目自身の画面で「参加は成立した」
   * ことを確かめておくことで、**参加が失敗しただけ**という別の説明を排除する。
   */
  test('Given ルームに居る / When 契約に合わない snapshot が届く / Then 同期できていないと出て、画面は古いまま固まる', async ({
    page,
    openPeer,
  }) => {
    // Given: 途中から snapshot だけを壊せるようにしてから開く。
    // **最初から壊すとルームが一度も表示されない。** それは別の壊れ方で、次のテストが見る
    let corrupting = false;
    const corrupter = await corruptFrom(page, () => corrupting);

    const code = await createRoom(page, HOST);
    await expect(statusStrip(page)).toContainText('接続中 (Connected)');
    // Given の確認: **作成者自身が輪に並んでいる。** この錨が無いと、後の
    // 「2 人目が居ない」が「名簿がそもそも描かれていない」と区別できない
    await expect(lobbyRotationRow(page, HOST, 1), '作成者の画面の 1 番目').toHaveCount(1);

    // When: 以後の snapshot が契約に合わなくなり、その状態で 2 人目が参加する
    corrupting = true;
    const guest = await openPeer('timer-stale-guest');
    await joinAsDriver(guest.page, code, GUEST);

    // Then その1: 参加そのものは成立している（2 人目の画面には 2 人が並ぶ）
    await expect(lobbyRotationRow(guest.page, HOST, 1), '2 人目の画面の 1 番目').toHaveCount(1);
    await expect(lobbyRotationRow(guest.page, GUEST, 2), '2 人目の画面の 2 番目').toHaveCount(1);

    // Then その2: 捨てている側は、それが接続表示から分かる
    await expect(statusStrip(page)).toContainText('同期できていません (Out of Sync)');

    // Then その3: 接続は生きているので、無関係な対処へ誘導しない
    await expect(statusStrip(page)).not.toContainText('Connected');
    await expect(statusStrip(page)).not.toContainText('Reconnecting');
    await expect(statusStrip(page)).not.toContainText('Session Lost');

    // Then その4: **画面は古いまま固まっている。** 名簿は描かれ、作成者は居るのに、
    // 2 人目だけが現れない。これが起きている異常そのものである
    await expect(lobbyRotationRow(page, HOST, 1), '作成者の画面の 1 番目').toHaveCount(1);
    await expect(lobbyRotationRow(page, GUEST, 2), '作成者の画面の 2 番目').toHaveCount(0);

    // Then その5: **壊し屋が実際に働いた。** 0 件なら、ここまでの「2 人目が居ない」は
    // 「まだ届いていない」と区別がつかない
    expect(corrupter.count(), '壊した snapshot の数').toBeGreaterThan(0);
  });

  /**
   * **こちらが #209 の本命の場面である。** 壊れた値がサーバー側のルームに残っていると、
   * 入ろうとした人は最初の `snapshot` から捨てる。`StatusStrip` はルームに入るまで
   * 描画されないので、**補わないと画面には何も出ない**（実測で「参加ボタンを押しても
   * 名前入力の画面のまま」だった）。
   */
  test('Given 最初から契約に合わない snapshot しか来ない / When ルームへ入ろうとする / Then 進めない理由が画面に出る', async ({
    page,
    openPeer,
  }) => {
    // Given: 壊していない接続でルームを 1 つ作る（招待先を用意するだけ）
    const code = await createRoom(page, HOST);

    // Given: 2 人目の接続は最初から snapshot が壊れている
    const guest = await openPeer('timer-stale-newcomer');
    const corrupter = await corruptFrom(guest.page, () => true);

    // When
    await joinAsDriver(guest.page, code, GUEST);

    // Then: 画面に出す場所が無いので、バナーで伝える
    await expect(guest.page.getByText(/同期できていません/)).toBeVisible();
    expect(corrupter.count(), '壊した snapshot の数').toBeGreaterThan(0);
  });
});


/** 消滅の仕掛けの状態。ページ側に置き、`page.evaluate` で読み書きする。 */
interface RoomLossState {
  /** これが立って以降の `room.join` を、消えたルームへ向ける */
  losing: boolean;
  /** 実際に差し替えた回数 */
  rewritten: number;
}

interface LossWindow {
  __e2eRoomLoss: RoomLossState;
  __e2eSockets: WebSocket[];
}

/**
 * 同期サーバーが再起動してルームが消えたときの見え方（#142・#76 F-4 の回帰防止）。
 *
 * 本番は揮発インメモリなので、**再起動はルームの全消滅と同義**である。直す前は
 * StatusStrip が「セッション喪失」に変わるだけで、タイマー・一時停止・スキップが
 * そのまま押せる状態で残っていた。押しても何も起きず、やり直す導線も無かった。
 *
 * **サーバーは止めない。** 止めると全 worker の共有資源が消え、無関係なシナリオを
 * 巻き込む（`playwright.config.ts` は local で並列実行する）。代わりに、そのページの
 * WS を落とし、**再接続の `room.join` を存在しないルームへ向ける**。再起動した
 * サーバーにとって元のコードが「知らないコード」になるのと同じ状態に置くわけで、
 * **返ってくる `ROOM_NOT_FOUND` は実サーバーが出す本物**である。
 *
 * **このシナリオは入室の枠を余分に 1 つずつ使う。** `room.join` は資源を引く前に
 * レート判定を通り（`room-join.ts`）、**成功しても失敗しても `consume` する**ので、
 * 消えたルームを指す再入室のぶんだけ普通のシナリオより多く食う。#103 以降その枠は
 * **IP 単位**（`join-retry.ts` の冒頭）で、全 worker が 1 つのバケツを共有している。
 *
 * 枯れると返るのは `JOIN_RATE_LIMITED` で、画面は「混み合っています。自動で
 * 入り直しています…」のまま進む。クライアントは 2 秒前後から待ち直して入り直すので
 * （`join-retry.ts`）、**結果の判定にはその往復ぶんの猶予を与えてある**
 * （実測: 猶予が既定の 5 秒だと `--repeat-each=40` で 40 本中 1〜2 本が落ち、
 * 20 秒にすると 40/40 緑）。
 *
 * **繰り返し実行の上限そのものは、このシナリオの都合ではない。** `--repeat-each=60`
 * では**細工の無い `@core` も同じように落ちる**（実測）。バケツが尽きると
 * 正規の入室まで弾かれるためで、これは枠の性質である。
 */
test.describe('timer のルームが消えたら操作を止めて、やり直す導線を出す', () => {
  /**
   * そのページの WebSocket を、**ページの中から**掴めるようにし、合図の後だけ
   * `room.join` の行き先を差し替えられるようにする。**`goto` より前に仕込む。**
   *
   * **`page.routeWebSocket` を使わない。** 使うと WS が Playwright を経由するようになり、
   * **ホストが 2 人目の到着を恒久的に取りこぼす**ことがある（実測: 8 並列で 8 本中 2 本。
   * 細工の無い `@core` は 8/8 緑。中継を手で書かず完全に素通しにしても再現した）。
   * しかも落ちるのは Given の段なので、原因が異常系の実装に見えない。
   * **後から掛けて避けることもできない** —— 傍受は文書の読み込み時に仕込まれるため、
   * 読み込み済みのページに後から掛けても新しい接続を捕まえない（実測で確認した）。
   *
   * ここは構築子と `send` を包むだけで、フレームは 1 通も外へ出ない。
   */
  async function armRoomLoss(page: Page): Promise<void> {
    await page.addInitScript((missingCode: string) => {
      const state: RoomLossState = { losing: false, rewritten: 0 };
      const opened: WebSocket[] = [];
      Object.defineProperty(window, '__e2eRoomLoss', { value: state });
      Object.defineProperty(window, '__e2eSockets', { value: opened });

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

  /**
   * そのページのルームを、**呼んだ時点から**失わせる。差し替えた回数を読む関数を返す。
   *
   * 順番が要点。まず合図を立て、それから**いま繋がっている接続を落とす**。
   * クライアントは自動で再入室しに行き、その `room.join` だけが消えたルームを指す。
   *
   * **落とせたことを確かめる。** 掴み損ねていると、何も起きないまま
   * 「喪失の画面が出ない」で落ち、原因が異常系の実装に見える。
   */
  async function loseRoom(page: Page): Promise<() => Promise<number>> {
    const closed = await page.evaluate(() => {
      const w = window as unknown as LossWindow;
      w.__e2eRoomLoss.losing = true;
      const socket = w.__e2eSockets[w.__e2eSockets.length - 1];
      if (socket === undefined) return false;
      socket.close();
      return true;
    });
    expect(closed, '落とす対象の接続が見つからない').toBe(true);

    return () => page.evaluate(() => (window as unknown as LossWindow).__e2eRoomLoss.rewritten);
  }

  /** セッション中に編集者が押せる操作。**押せることを先に確かめてから**消滅を見る。 */
  function sessionControls(page: Page): readonly (readonly [string, Locator])[] {
    return [
      ['スキップ', page.getByRole('button', { name: 'スキップ', exact: true })],
      ['一時停止', page.getByRole('button', { name: '一時停止', exact: true })],
      ['完成!', page.getByRole('button', { name: '完成!', exact: true })],
    ] as const;
  }

  test('Given 2 人がセッション中 / When 同期サーバーが再起動してルームが消える / Then 効かない操作が残らず、やり直す導線が出る', async ({
    page,
    openPeer,
  }) => {
    // Given: **仕掛けは据えるだけで、まだ何もしない。** 参加も名簿の同期も、
    //        他のシナリオとまったく同じ経路をそのまま通る
    await armRoomLoss(page);
    const code = await createRoom(page, HOST);
    const guest = await openPeer('timer-session-lost');
    await armRoomLoss(guest.page);
    await joinAsDriver(guest.page, code, GUEST);

    // Given の確認: 2 人が別人として輪に並び、セッションが始まっている
    await expect(lobbyRotationRow(page, HOST, 1), '作成者の画面の 1 番目').toHaveCount(1);
    await expect(lobbyRotationRow(page, GUEST, 2), '作成者の画面の 2 番目').toHaveCount(1);
    await page.getByRole('button', { name: 'セッションを開始' }).click();

    // Given の確認（対照）: **失う前は、両方の画面でこれらが実際に押せる。**
    // この錨が無いと、後の「押せる要素が無い」は最初から無かっただけかもしれない。
    // **作成者だけで見てはいけない。** 参加者の画面は名前と役割の取り回しが違い
    // （#76 F-3 が壊れたのはそこ）、非ホストにだけ操作が残る壊れ方を見逃す
    for (const [screen, target] of screens(page, guest.page)) {
      for (const [label, control] of sessionControls(target)) {
        await expect(control, `${screen}の画面で喪失前に押せない操作（${label}）`).toBeEnabled();
      }
    }

    // When: サーバーが再起動し、ルームが消える
    const hostRewritten = await loseRoom(page);
    const guestRewritten = await loseRoom(guest.page);

    // **仕掛けが働いたことを、結果を見る前に確かめる。** 後回しにすると、
    // 差し替えが素通しへ退化した日の症状が「喪失の画面が出ない」になり、
    // 製品の欠陥と見分けがつかない（実測で確認した）。再接続はバックオフを
    // 挟むので、待てる形で数える
    await expect
      .poll(hostRewritten, { message: '作成者の room.join を差し替えられていない' })
      .toBeGreaterThan(0);
    await expect
      .poll(guestRewritten, { message: '2 人目の room.join を差し替えられていない' })
      .toBeGreaterThan(0);

    // Then その1: 何が起きたのかが画面に出る。**両方の画面で**同じに見える。
    // **入室の枠が枯れていると、一度 `JOIN_RATE_LIMITED` を挟む**（上の説明）。
    // その場合クライアントは 2 秒前後から待ち直して入り直すので、
    // 既定の 5 秒では往復 1 回ぶんに足りない
    for (const [screen, target] of screens(page, guest.page)) {
      await expect(
        target.getByRole('heading', { name: 'セッションが見つかりません' }),
        `${screen}の画面`,
      ).toBeVisible({ timeout: 20_000 });
    }

    // Then その2: **効かない操作が残っていない。** 直す前はここが全部残っていた
    for (const [screen, target] of screens(page, guest.page)) {
      for (const [label, control] of sessionControls(target)) {
        await expect(control, `${screen}の画面に喪失後も残っている操作（${label}）`).toHaveCount(0);
      }
    }

    // Then その3: やり直す導線と、端末の記録へ戻る道がある
    await expect(
      page.getByRole('button', { name: '新しいセッションを始める' }),
      'やり直す導線',
    ).toBeEnabled();
    await expect(page.getByRole('button', { name: '記録を見る' }), '記録への導線').toBeEnabled();
  });
});
