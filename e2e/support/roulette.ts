/**
 * 進行役ルーレットの共通手順と選択子（#94 PR 2）。
 *
 * **入口は玄関の札だけである**（`docs/adr/0018`）。ここが通らなくなったら、手順が古いのではなく
 * 入口が壊れている。
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** 選択画面のツールの札（poker・timer・お題の支援と同じ引き方）。 */
function toolCard(page: Page, name: string): Locator {
  return page.getByRole('list', { name: 'ツール' }).getByRole('link', { name: new RegExp(name) });
}

/** ルーレットの画面が開いていること（公開パスと見出し）。 */
async function expectRouletteOpen(page: Page): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname, { message: 'ルーレットの公開パス' }).toBe('/roulette/');
  await expect(page.getByRole('heading', { level: 1, name: '進行役ルーレット', exact: true })).toBeVisible();
}

/** 玄関でルームを作ってルーレットを開き、**招待パネルが出している参加用 URL** を返す。 */
export async function openRouletteTool(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: 'ルームを作る' }).click();
  const inviteUrl = await page.getByLabel('参加用 URL').inputValue();
  await toolCard(page, 'Facilitator Roulette').click();
  await expectRouletteOpen(page);
  return inviteUrl;
}

/**
 * 渡された参加用 URL を玄関で開いて名乗り、ルーレットを開く。
 *
 * **呼び出し側は必ず別の `BrowserContext` の page を渡すこと**（同じ文脈だと 1 人目として復帰する）。
 */
export async function joinRouletteTool(page: Page, url: string, name: string): Promise<void> {
  await page.goto(url);
  await page.getByLabel('あなたの名前').fill(name);
  await page.getByRole('button', { name: '参加する' }).click();
  await toolCard(page, 'Facilitator Roulette').click();
  await expectRouletteOpen(page);
}

/** 結果の一言（`role="status"`）。この画面に 1 つだけ。 */
export function roulettePhrase(page: Page): Locator {
  return page.getByRole('status');
}

/** 主ボタン（回す前・回しているとき・回し終えたあとで文言が変わる）。 */
export function spinButton(page: Page): Locator {
  return page.getByRole('button', { name: /^(ルーレットを回す|回しています…|もう一度回す)$/ });
}

/** 選択画面（玄関の道具選び）からルーレットの札を開く。**同じルームのまま**別のツールから移るときに使う。 */
export async function openRouletteFromHub(page: Page): Promise<void> {
  await toolCard(page, 'Facilitator Roulette').click();
  await expectRouletteOpen(page);
}

/** ルームにいない人を名前で足し、入る人の一覧に載るのを待つ。 */
export async function addRouletteGuest(page: Page, name: string): Promise<void> {
  await page.getByLabel('ルームにいない人も、名前を追加すれば入れられます').fill(name);
  await page.getByRole('button', { name: '名前を追加' }).click();
  await expect(page.getByRole('list').getByText(name, { exact: true })).toBeVisible();
}

/** `rgb(r, g, b)` / `rgba(r, g, b, a)` の計算値を 0〜255 の三つ組にする（読めなければ null）。 */
function parseRgb(value: string): [number, number, number] | null {
  const m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(value);
  return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * 円盤の席の名前が読める。**`scanContrast` は SVG の `<text>` を数えない**（対象が button / a / h1〜h3 / label / p / span
 * だけ。2026-10-13 の探索で、円盤の名前が 0 件と分かった）ので、ここで測る。席の名前（`.wheel-label`）の塗りと、
 * 同じ席の地（直前の `<path>`）の塗りの比が AA（4.5:1）以上。止まった席（真鍮の地）は 1 つだけ。
 *
 * 地の上に重なる光沢（`--ivory-inset` → `--felt-grain` の放射状）は測っていない（席の地そのものとの比）。
 * 光沢は席の明度を数 % しか動かさない。
 */
export async function expectWheelLabelsReadable(page: Page, minLabels: number): Promise<void> {
  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.wheel-label')).map((text) => ({
      text: text.textContent ?? '',
      ink: getComputedStyle(text).fill,
      ground: getComputedStyle(text.previousElementSibling as Element).fill,
      winner: text.classList.contains('wheel-label--winner'),
    })),
  );
  expect(labels.length, '円盤の席の名前が描かれていない').toBeGreaterThanOrEqual(minLabels);
  const low: string[] = [];
  for (const label of labels) {
    const ink = parseRgb(label.ink);
    const ground = parseRgb(label.ground);
    expect(ink, `席の名前の色が読めない: ${label.ink}`).not.toBeNull();
    expect(ground, `席の地の色が読めない: ${label.ground}`).not.toBeNull();
    const [a, b] = [luminance(ink!), luminance(ground!)];
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (ratio < 4.5) low.push(`「${label.text}」 ${ratio.toFixed(2)}:1（${label.ink} on ${label.ground}）`);
  }
  expect(low, '席の名前が AA を満たさない').toEqual([]);
  expect(labels.filter((l) => l.winner).length, '止まった席が 1 つではない').toBe(1);
}

/**
 * 止まった後、札の名前の中心を**突く**と札の要素が返る（下端に留まる「回す」の帯に隠れていない・spec E22）。
 * 札の位置を計算で出して比べるのではなく、`elementFromPoint` で実際に突く（#316 PR 4）。寄せるスクロールが
 * 滑らかに動く間は札が動くので、収まるまで待つ。
 */
export async function expectCardNameNotCovered(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const name = document.querySelector('.roulette-card-name');
          if (name === null) return 'no-card';
          const r = name.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (hit === null) return 'outside-viewport';
          if (hit.closest('.roulette-controls') !== null) return 'covered-by-dock';
          return hit.closest('.roulette-card') !== null ? 'card' : `other:${hit.className}`;
        }),
      { message: '札の名前の中心を突いても札に当たらない', timeout: 4000 },
    )
    .toBe('card');
}

/** 画面に描かれた 1 字の向き（`expectWheelGlyphsUpright` の材料）。 */
interface DrawnGlyph {
  label: string;
  ch: string;
  vertical: boolean;
  /** 画面上の字の傾き（度・−180〜180。0 が正立・時計回りが正） */
  tilt: number;
}

/**
 * 円盤の席の名前の**字が倒れていない**（画面上の傾きが ±45° 以内）。止まった後に呼ぶ。
 *
 * 物差しは `labelPlacement` の戻り値を使わない（2026-10-13 の撮影で、関数の戻り値だけを見る単体テストは
 * 縦書きの欧文が横倒しで描かれるのを見逃した）。1 字ずつ、ブラウザが実際に組んだ姿から傾きを出す:
 *
 * - `getScreenCTM()` の回転成分 `atan2(b, a)` —— 回転子の `rotate` と名前の `rotate` をブラウザが合成した、
 *   その `<text>` の座標系の画面上の傾き
 * - `getRotationOfChar(i)` —— その座標系の中で、ブラウザがその字を回して組んだ角度。縦書き
 *   （`writing-mode: vertical-rl`）で `text-orientation: mixed` のとき、欧文は 90° 回して横倒しに組まれる
 *   （Chromium の実測）。座標系の傾きだけを見るとここが見えない
 *
 * 字の傾き = 座標系の傾き + 字の回転。空白は向きが無いので数えない。
 * `minVerticalLatin` は「縦書きの席に欧文の名前が 1 つ以上ある」ことの下限（物差しが空振りしていないことを先に見る）。
 */
export async function expectWheelGlyphsUpright(page: Page, minVerticalLatin = 0): Promise<void> {
  const glyphs: DrawnGlyph[] = await page.evaluate(() => {
    const out: { label: string; ch: string; vertical: boolean; tilt: number }[] = [];
    for (const text of Array.from(document.querySelectorAll<SVGTextElement>('.wheel-label'))) {
      const m = text.getScreenCTM();
      if (m === null) continue;
      const frame = (Math.atan2(m.b, m.a) * 180) / Math.PI;
      const label = text.textContent ?? '';
      const vertical = getComputedStyle(text).writingMode.startsWith('vertical');
      const chars = Array.from(label);
      for (let i = 0; i < text.getNumberOfChars() && i < chars.length; i += 1) {
        const ch = chars[i] ?? '';
        if (ch.trim() === '') continue;
        const raw = frame + text.getRotationOfChar(i);
        out.push({ label, ch, vertical, tilt: ((((raw + 180) % 360) + 360) % 360) - 180 });
      }
    }
    return out;
  });
  expect(glyphs.length, '円盤の席の名前の字が 1 つも読めない').toBeGreaterThan(0);
  const verticalLatin = new Set(glyphs.filter((g) => g.vertical && /[A-Za-z]/.test(g.ch)).map((g) => g.label));
  expect(verticalLatin.size, `縦書きの席の欧文の名前（${[...verticalLatin].join(', ')}）`).toBeGreaterThanOrEqual(minVerticalLatin);
  const fallen = glyphs
    .filter((g) => Math.abs(g.tilt) > 45 + 0.5)
    .map((g) => `「${g.label}」の「${g.ch}」 ${g.tilt.toFixed(1)}°（${g.vertical ? '縦書き' : '横書き'}）`);
  expect(fallen, '円盤の席の名前の字が ±45° を超えて倒れている').toEqual([]);
}
