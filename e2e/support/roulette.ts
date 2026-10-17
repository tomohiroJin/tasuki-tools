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

/**
 * 組の札（#401）の最後の行の中心を**突く**と札の要素が返る（下端に留まる「回す」の帯に隠れていない）。
 * 1 人の札の {@link expectCardNameNotCovered} と同じ測り方。組の札は 1 人の札より背が高いので、
 * 320×640 では縦積みの円盤の式から差を引いている（`--card-extra`）。それを外すと最後の行が帯に隠れる。
 * あわせて、札の中身が札からはみ出さない（行が 4 つでも背に収まる）ことを見る。
 */
export async function expectGroupCardNotCovered(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const rows = document.querySelectorAll('.roulette-group-row');
          const last = rows[rows.length - 1];
          if (last === undefined) return 'no-group-card';
          const face = document.querySelector('.roulette-card--group .roulette-card-face');
          if (face !== null && face.scrollHeight > face.clientHeight + 1) return 'overflows-card';
          const r = last.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (hit === null) return 'outside-viewport';
          if (hit.closest('.roulette-controls') !== null) return 'covered-by-dock';
          return hit.closest('.roulette-card') !== null ? 'card' : `other:${hit.className}`;
        }),
      { message: '組の札の最後の行の中心を突いても札に当たらない', timeout: 4000 },
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

/** 欧文が主の名前（半角の字 —— ラテン 1 と半角カナ U+FF61〜FF9F —— が空白と `…` を除いて半分以上）。 */
const latinMostly = (text: string): boolean => {
  const chars = Array.from(text).filter((ch) => ch.trim() !== '' && ch !== '…');
  const half = (ch: string): boolean => {
    const cp = ch.codePointAt(0) ?? 0;
    return cp <= 0xff || (cp >= 0xff61 && cp <= 0xff9f);
  };
  return chars.length > 0 && chars.filter(half).length * 2 >= chars.length;
};

/**
 * 円盤の席の名前の**字が倒れていない**（画面上の傾きが ±60° 以内）・**欧文が主の名前を縦に積まない**。止まった後に呼ぶ。
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
 * 字の傾き = 座標系の傾き + 字の回転。空白は向きが無いので数えない。上限 60° は利用者の決定（案 2）で、
 * 半径に沿う横書きに許す傾き（spec §6.3）。縦書きかどうかは計算値の `writing-mode` で見る。
 * `minUprightAcross` は「半径を横切る横書きの欧文の名前」の下限（物差しが空振りしていないことを先に見る）。
 * 縦の半径の席（縦から 30° 以内）の欧文の名前は、縦に積まずに半径を横切る横書きで描く（spec §6.3）。
 * 横切るかは、行の向きと「円盤の中心 → 名前の箱の中心」の成す角（60° 以上）で描かれた姿から測る。
 */
export async function expectWheelGlyphsUpright(page: Page, minUprightAcross = 0): Promise<void> {
  const drawn = await page.evaluate(() => {
    const glyphs: { label: string; ch: string; vertical: boolean; tilt: number }[] = [];
    const labels: { label: string; vertical: boolean; across: boolean }[] = [];
    const wheel = document.querySelector<SVGSVGElement>('svg.wheel')?.getScreenCTM();
    for (const text of Array.from(document.querySelectorAll<SVGTextElement>('.wheel-label'))) {
      const m = text.getScreenCTM();
      if (m === null || wheel === null || wheel === undefined) continue;
      const frame = (Math.atan2(m.b, m.a) * 180) / Math.PI;
      const label = text.textContent ?? '';
      const vertical = getComputedStyle(text).writingMode.startsWith('vertical');
      // 横書きの行が半径を横切るか: 行の向き（座標系の x 軸）と、円盤の中心から名前の箱の中心への向きの成す角が 60° 以上
      const box = text.getBoundingClientRect();
      const rx = box.left + box.width / 2 - wheel.e;
      const ry = box.top + box.height / 2 - wheel.f;
      const cos = Math.abs((m.a * rx + m.b * ry) / (Math.hypot(m.a, m.b) * Math.hypot(rx, ry)));
      labels.push({ label, vertical, across: !vertical && cos < 0.5 });
      const chars = Array.from(label);
      for (let i = 0; i < text.getNumberOfChars() && i < chars.length; i += 1) {
        const ch = chars[i] ?? '';
        if (ch.trim() === '') continue;
        const raw = frame + text.getRotationOfChar(i);
        glyphs.push({ label, ch, vertical, tilt: ((((raw + 180) % 360) + 360) % 360) - 180 });
      }
    }
    return { glyphs, labels };
  });
  const glyphs: DrawnGlyph[] = drawn.glyphs;
  expect(glyphs.length, '円盤の席の名前の字が 1 つも読めない').toBeGreaterThan(0);
  const across = drawn.labels.filter((l) => l.across && latinMostly(l.label));
  expect(across.length, `半径を横切る欧文の名前（${across.map((l) => l.label).join(', ')}）`).toBeGreaterThanOrEqual(minUprightAcross);
  const stacked = drawn.labels.filter((l) => l.vertical && latinMostly(l.label)).map((l) => `「${l.label}」`);
  expect(stacked, '欧文が主の名前を縦に積んでいる（「M／i／k／a」は読めない）').toEqual([]);
  const fallen = glyphs
    .filter((g) => Math.abs(g.tilt) > 60 + 0.5)
    .map((g) => `「${g.label}」の「${g.ch}」 ${g.tilt.toFixed(1)}°（${g.vertical ? '縦書き' : '横書き'}）`);
  expect(fallen, '円盤の席の名前の字が ±60° を超えて倒れている').toEqual([]);
}

/**
 * 円盤の席の名前が**席の環（縁 r=93）の内に描かれている**。止まった後に呼ぶ。
 *
 * 字の位置は `getStartPositionOfChar` / `getEndPositionOfChar` では測らない。**描かれた箱**
 * （`getBoundingClientRect`）の四隅の、円盤の中心からの距離を円盤の座標（viewBox）の単位で測る。箱は画面の
 * 軸に沿うので、斜めの名前では実際の字より外へ膨らむ（45° の名前でも縁から約 5 以内）。上限は窪み（r=97）の
 * 手前の 95 に置く。2026-10-13 の 320 の撮影では、当たりの席の縦書きの「山田」が r=106.5 まで伸びた
 * （書体がシステムのものに落ち、縦書きの送りが 0 と数えられた。`expectWheelLabelsUseWebFonts`）。
 *
 * `minVerticalOutward` は「縦書きで行が外へ進む席（円盤の下半分の縦書きの席）」の下限。
 */
export async function expectWheelLabelsInsideSeats(page: Page, minVerticalOutward = 0): Promise<void> {
  const labels = await page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('svg.wheel');
    const m = svg?.getScreenCTM();
    if (svg === null || svg === undefined || m === null || m === undefined) return null;
    const scale = Math.hypot(m.a, m.b);
    return Array.from(document.querySelectorAll<SVGTextElement>('.wheel-label')).map((text) => {
      const r = text.getBoundingClientRect();
      const corners = [
        [r.left, r.top],
        [r.right, r.top],
        [r.left, r.bottom],
        [r.right, r.bottom],
      ] as const;
      const far = Math.max(...corners.map(([x, y]) => Math.hypot(x - m.e, y - m.f) / scale));
      // 縦書きの行は下へ進むので、席（直前の <path>）が円盤の下半分にあれば行は外へ進む。名前の描かれ方
      // （直したいもの）ではなく席の位置で決める
      const seat = (text.previousElementSibling as Element).getBoundingClientRect();
      return {
        text: text.textContent ?? '',
        vertical: getComputedStyle(text).writingMode.startsWith('vertical'),
        lower: seat.top + seat.height / 2 > m.f,
        far,
      };
    });
  });
  expect(labels, '円盤が描かれていない').not.toBeNull();
  expect(labels!.length, '円盤の席の名前が描かれていない').toBeGreaterThan(0);
  expect(labels!.filter((l) => l.vertical && l.lower).length, '縦書きで行が外へ進む席').toBeGreaterThanOrEqual(minVerticalOutward);
  const outside = labels!.filter((l) => l.far > 95).map((l) => `「${l.text}」 r=${l.far.toFixed(1)}（${l.vertical ? '縦書き' : '横書き'}）`);
  expect(outside, '席の名前が縁の外へはみ出している').toEqual([]);
}

/**
 * 円盤の席の名前が**この画面の書体（web フォント）だけで描かれている**。システムの書体に落ちると、縦書きの字の
 * 送りが 0 になり字が重なった（2026-10-13 の 320 の撮影の当たりの席の「健太」。700 の太さに漢字の書体が無い）。
 * 描くのに使われた書体を Chromium の DevTools Protocol（`CSS.getPlatformFontsForNode`）で名前ごとに読む。
 */
export async function expectWheelLabelsUseWebFonts(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '.wheel-label' });
    expect(nodeIds.length, '円盤の席の名前が描かれていない').toBeGreaterThan(0);
    const fallen: string[] = [];
    for (const nodeId of nodeIds) {
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      const system = fonts.filter((f) => !f.isCustomFont).map((f) => `${f.familyName}（${f.glyphCount} 字）`);
      if (system.length > 0) {
        const { outerHTML } = await cdp.send('DOM.getOuterHTML', { nodeId });
        fallen.push(`${/>([^<]*)</.exec(outerHTML)?.[1] ?? outerHTML}: ${system.join(', ')}`);
      }
    }
    expect(fallen, '席の名前がシステムの書体に落ちている').toEqual([]);
  } finally {
    await cdp.detach();
  }
}

/**
 * 脇の一覧（ルーレットに入る人）の名前が**切れていない**（`…` で省かれていない）。描かれた名前の箱の
 * `scrollWidth` と `clientWidth` を比べる（2026-10-13 の 320 の撮影で、「選ばれた」と「名前を消す」に幅を
 * 取られ「山田」が「山…」に切れた）。`minWithTail` は「印か名前を消すを持つ行」の下限（空振りを防ぐ）。
 */
export async function expectRouletteNamesNotCut(page: Page, minWithTail = 0): Promise<void> {
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.roulette-name')).map((name) => ({
      text: name.textContent ?? '',
      cut: name.scrollWidth > name.clientWidth + 0.5,
      tail: (name.closest('li')?.querySelectorAll('.roulette-chip, button').length ?? 0) > 0,
    })),
  );
  expect(rows.length, '一覧の名前が描かれていない').toBeGreaterThan(0);
  expect(rows.filter((r) => r.tail).length, '印か名前を消すを持つ行').toBeGreaterThanOrEqual(minWithTail);
  expect(rows.filter((r) => r.cut).map((r) => r.text), '一覧の名前が切れている').toEqual([]);
}
