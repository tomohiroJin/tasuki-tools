/**
 * パネルの面と、見出し・戻る導線（#320 PR 3）。
 *
 * **タグを付けない（`local` 専用）。** 理由は `timer-a11y.spec.ts` と同じ（見るのはスタイルの健全性）。
 *
 * **面の判定は main でも緑になる**（写しと部品が同じ値を持つ）。守るのは「部品を当て忘れる」後退で、
 * 画面の CSS から面の宣言を消した後にだけ値が分かれる。赤は破壊検証で見る（計画 Task 6）。
 * 文字の走査（`scanContrast`）に任せないのは、玄関のパネルの見出しが象牙色で、地が消えても AA を割らないから。
 *
 * **お題の面（お題ツールと poker の「お題」）は #316 で読む面（部品 `.ui-reader`）になった**
 * （設計正本 §9）。`.ui-panel` の面ではないので、`expectReaderFace` で読む面の値を測る。
 *
 * **見出しの判定は main で赤になる**: poker の戻る導線は 5 段の外の `0.8rem`、お題ツールの入室を待つ画面の
 * 戻る導線は見出しの下の行にある。
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { resolveColors } from '../support/a11y';
import { joinRoom } from '../support/poker';
import { openTopicTool, setTopic } from '../support/topic';

const BACK_LINK = '選択画面へ戻る';

/** トークンを画面上で解いて、その性質の計算値にする（`resolveColors` の性質を選べる版）。 */
async function resolveStyle(page: Page, property: string, token: string): Promise<string> {
  return page.evaluate(
    ([prop, tok]) => {
      const probe = document.createElement('div');
      document.body.append(probe);
      probe.style.setProperty(prop, `var(${tok})`);
      const value = getComputedStyle(probe).getPropertyValue(prop);
      probe.remove();
      return value;
    },
    [property, token] as const,
  );
}

/** 選択画面のツールの札（`support/topic.ts` の引き方と同じ）。 */
function toolCard(page: Page, name: string): Locator {
  return page.getByRole('list', { name: 'ツール' }).getByRole('link', { name: new RegExp(name) });
}

/** パネルの面（部品 `.ui-panel` が持つ値）が当たっていること。 */
async function expectPanelFace(page: Page, panel: Locator, label: string): Promise<void> {
  await expect(panel, label).toBeVisible();
  const [felt900, lineStrong] = await resolveColors(page, ['--felt-900', '--line-strong']);
  const radius = await resolveStyle(page, 'border-top-left-radius', '--radius-lg');
  const face = await panel.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      background: s.backgroundColor,
      border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
      radius: s.borderTopLeftRadius,
    };
  });
  expect(face, `${label} の面`).toEqual({ background: felt900, border: `1px solid ${lineStrong}`, radius });
}

/**
 * お題の面（読む面 `.ui-reader`・#316）の値が当たっていること。`.ui-panel` ではなく、象牙の札の地
 * （`--card-sheen` から `--card-shade` への `linear-gradient`）・枠 `--card-edge`・角丸 `--radius-lg`・字の色 `--coal`。
 */
async function expectReaderFace(page: Page, reader: Locator, label: string): Promise<void> {
  await expect(reader, label).toBeVisible();
  const [sheen, shade, edge, coal] = await resolveColors(page, ['--card-sheen', '--card-shade', '--card-edge', '--coal']);
  const radius = await resolveStyle(page, 'border-top-left-radius', '--radius-lg');
  const face = await reader.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      image: s.backgroundImage,
      border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
      radius: s.borderTopLeftRadius,
      color: s.color,
    };
  });
  expect(face.image, `${label} の地は linear-gradient`).toContain('linear-gradient');
  expect(face.image, `${label} の地に --card-sheen`).toContain(sheen);
  expect(face.image, `${label} の地に --card-shade`).toContain(shade);
  expect({ border: face.border, radius: face.radius, color: face.color }, `${label} の面`).toEqual({
    border: `1px solid ${edge}`,
    radius,
    color: coal,
  });
}

/** 戻る導線が見出しと同じ行の右にあり、字の大きさが `--font-size-sm` であること。 */
async function expectBackBesideHeading(page: Page, heading: Locator, label: string): Promise<void> {
  const back = page.getByRole('link', { name: BACK_LINK, exact: true });
  await expect(heading, label).toBeVisible();
  await expect(back, label).toBeVisible();
  const sm = await resolveStyle(page, 'font-size', '--font-size-sm');
  expect(await back.evaluate((el) => getComputedStyle(el).fontSize), `${label} の戻る導線の字の大きさ`).toBe(sm);
  const h = (await heading.boundingBox())!;
  const b = (await back.boundingBox())!;
  // 同じ行: 縦の範囲が重なる。見出しの右: 見出しの右端より右から始まる（1280px の幅では折り返さない）
  expect(b.y < h.y + h.height && b.y + b.height > h.y, `${label} の戻る導線が見出しと同じ行にない`).toBe(true);
  expect(b.x, `${label} の戻る導線が見出しの右にない`).toBeGreaterThan(h.x + h.width);
}

test.describe('パネルの面と、見出し・戻る導線（#320 PR 3）', () => {
  test('Given 玄関でルームを作りお題ツールを開く / When 各画面のパネルと見出しを測る / Then 面は部品の値で、戻る導線は見出しの右に並ぶ', async ({
    page,
  }) => {
    // Given / When その1: 玄関の作成フォーム
    await page.goto('/');
    await expectPanelFace(page, page.getByRole('form', { name: 'ルームを作る' }), '玄関の作成フォーム');

    // When その2: 選択画面の参加者と招待
    await page.getByLabel('あなたの名前').fill('panel-topic');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    await expectPanelFace(page, page.getByRole('region', { name: '参加者', exact: true }), '選択画面の参加者');
    await expectPanelFace(page, page.getByRole('region', { name: '仲間を招く', exact: true }), '選択画面の招待');

    // When その3: お題ツールのルーム画面
    await toolCard(page, 'Topic Board').click();
    await expectBackBesideHeading(page, page.getByRole('heading', { level: 1, name: 'お題', exact: true }), 'お題ツール');
    await expectReaderFace(page, page.getByRole('region', { name: 'お題', exact: true }), 'お題ツールの読む面（「お題」）');
    for (const name of ['お題を書く', '定型や AI で作る']) {
      await expectPanelFace(page, page.getByRole('region', { name, exact: true }), `お題ツールの「${name}」`);
    }
  });

  test('Given お題を出したルーム / When 別の人が玄関の参加フォームから poker に入る / Then 参加フォームとお題の面は部品の値で、戻る導線は見出しの右に並ぶ', async ({
    page,
    openPeer,
  }) => {
    // Given: poker にお題の面（`.topic`）を出すため、先にお題を掲げる。文面は書体の常用の層に収まるもの
    const inviteUrl = await openTopicTool(page, 'panel-host');
    await setTopic(page, 'FizzBuzz', '3 のときは Fizz を出す');
    const poker = await openPeer('panel-poker');

    // When その1: 玄関の参加フォーム
    await poker.page.goto(inviteUrl);
    await expectPanelFace(poker.page, poker.page.getByRole('form', { name: '参加する' }), '玄関の参加フォーム');

    // When その2: poker のルーム画面
    await joinRoom(poker.page, inviteUrl, 'panel-poker');
    await expectReaderFace(poker.page, poker.page.getByRole('region', { name: 'お題', exact: true }), 'poker のお題');
    await expectBackBesideHeading(
      poker.page,
      poker.page.getByRole('heading', { level: 1, name: 'プランニングポーカー' }),
      'poker',
    );
  });

  test('Given お題ツールの同期サーバーへ繋がらない / When 入室を待つ画面を出す / Then 戻る導線は見出しの右に並ぶ', async ({
    page,
  }) => {
    // Given: 玄関でルームを作り、お題ツールの WS だけを成立させない（`notices-a11y.spec.ts` の `toolSyncIsDown` と同じ形）
    await page.goto('/');
    await page.getByLabel('あなたの名前').fill('panel-joining');
    await page.getByRole('button', { name: 'ルームを作る' }).click();
    await expect(page.getByLabel('参加用 URL')).toBeVisible();
    await page.routeWebSocket(/\/ws\?.*\btool=topic\b/, (ws) => {
      void ws.close();
    });

    // When: お題ツールを開く（入室が成立しないので、入室を待つ画面に留まる）
    await toolCard(page, 'Topic Board').click();

    // Then
    await expectBackBesideHeading(
      page,
      page.getByRole('heading', { level: 1, name: 'ルームに参加しています' }),
      'お題ツールの入室を待つ画面',
    );
  });

  test('Given お題ツールのルーム画面 / When 1280×800 と 320×640 で招待の行を測る / Then 広い幅では「仲間を招く」は隠れ、狭い幅では閉じていて押すと開く', async ({
    page,
  }) => {
    // Given: 広い幅（40rem 以上）の画面
    await page.setViewportSize({ width: 1280, height: 800 });
    await openTopicTool(page, 'panel-share');
    const toggle = page.getByRole('button', { name: '仲間を招く', exact: true });
    const copy = page.getByRole('button', { name: '招待リンクをコピー', exact: true });

    // When / Then: 広い幅では「仲間を招く」は隠れ、招待の行（コピー）は常に見える
    await expect(toggle, '1280px の「仲間を招く」').toBeHidden();
    await expect(copy, '1280px の招待リンクをコピー').toBeVisible();

    // When: 狭い幅（40rem 未満）に縮める / Then: 招待の行は閉じ、「仲間を招く」が出る
    await page.setViewportSize({ width: 320, height: 640 });
    await expect(toggle, '320px の「仲間を招く」').toBeVisible();
    await expect(copy, '320px の招待リンクをコピー（閉じている間）').toBeHidden();

    // When: 「仲間を招く」を押す / Then: 招待の行が開く
    await toggle.click();
    await expect(copy, '320px で開いた後の招待リンクをコピー').toBeVisible();
  });
});

/**
 * 招待の行の組み方（#447 段 2・利用者の指摘）。
 *
 * 折り返す flex のままだと、狭い幅で「URL ＋ QR コードを表示」が 1 行に並び、「招待リンクをコピー」だけが次の行へ落ちた。
 * 欄の幅（コンテナクエリ）で 3 通りに組むので、どの幅でも 2 つのボタンは同じ行に並び、欄の外へはみ出さない。
 * 狭い幅（30rem 未満の欄）では 2 つを同じ幅にし、広い幅（44rem 以上の欄）では URL も同じ行に並べる。
 */
test.describe('招待の行は幅に合わせて組み替わり、ボタンが 1 つだけ取り残されない', () => {
  for (const width of [320, 414, 700, 1280]) {
    test(`Given 幅 ${String(width)} のお題ツール / When 招待の行を見る / Then 2 つのボタンが同じ行に並び、欄に収まる`, async ({ page }) => {
      // Given: 狭い幅では「仲間を招く」で開いてから測る
      await page.setViewportSize({ width, height: 800 });
      await openTopicTool(page, 'あや');
      const toggle = page.getByRole('button', { name: '仲間を招く' });
      if (width < 640) await toggle.click();
      const qr = page.getByRole('button', { name: 'QR コードを表示' });
      const copy = page.getByRole('button', { name: '招待リンクをコピー' });
      await expect(copy).toBeVisible();

      // When
      const m = await page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const buttons = Array.from(document.querySelectorAll('.ui-room-header-invite .ui-invite .ui-button')).map((b) => b.getBoundingClientRect());
        return { share: box('.ui-room-header-share'), url: box('.ui-room-header-invite .ui-invite-url'), buttons };
      });
      const [qrBox, copyBox] = m.buttons;
      if (qrBox === undefined || copyBox === undefined) throw new Error('招待の行のボタンが 2 つ無い（判定が空振りする）');

      // Then: 同じ行（上端が揃う）・欄の右端の内側
      expect(Math.abs(qrBox.top - copyBox.top), `${String(width)}: QR とコピーが別の行にある`).toBeLessThanOrEqual(1);
      expect(copyBox.right, `${String(width)}: コピーが欄の外へはみ出す`).toBeLessThanOrEqual(m.share.right + 0.5);
      if (width < 480) {
        // 狭い: URL は上の行、2 つのボタンは同じ幅
        expect(m.url.bottom, `${String(width)}: URL がボタンの上の行に無い`).toBeLessThanOrEqual(qrBox.top);
        expect(Math.abs(qrBox.width - copyBox.width), `${String(width)}: 2 つのボタンの幅が揃っていない`).toBeLessThanOrEqual(1);
      } else if (width >= 1024) {
        // 広い: URL もボタンと同じ行
        expect(Math.abs((m.url.top + m.url.bottom) / 2 - (qrBox.top + qrBox.bottom) / 2), `${String(width)}: URL がボタンと同じ行に無い`).toBeLessThanOrEqual(2);
      }
      await expect(qr).toBeVisible();
    });
  }
});
