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
});
