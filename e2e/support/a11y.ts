/**
 * a11y の測り方（コントラスト比・フォーカス可視化）の共通支援（#91 PR 2）。
 *
 * 元は `timer-a11y.spec.ts` に直書きしていたものを、お題ツールの E2E からも
 * 使えるように移した（振る舞いは変えていない）。
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { describePaint, groundLayers, measureSample, sampleInPage } from './contrast';

/** 走査の結果。`pairs` は測った字の「文字色 on 地」の集合で、特定の組を測ったかの固定に使う。 */
export interface ContrastScan {
  readonly failures: string[];
  readonly unmeasurable: string[];
  readonly measured: number;
  readonly pairs: ReadonlySet<string>;
}

/** 字と地の組を 1 本の文字列にする。**走査と固定の両方がこの形で比べる。** */
export function pairKey(ink: string, ground: string): string {
  return `${ink} on ${ground}`;
}

/**
 * トークン（`var(--*)`）を画面上で解いて、計算値の色にする。
 * **テストへ色の数値を直書きしない** —— パレットを動かしたら一緒に動く。
 */
export async function resolveColors(page: Page, tokens: readonly string[]): Promise<string[]> {
  return page.evaluate((list) => {
    const probe = document.createElement('div');
    document.body.append(probe);
    const resolved = list.map((token) => {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    });
    probe.remove();
    return resolved;
  }, tokens);
}

/**
 * 文字を持つ要素のうち、実際に見えているものを測る。
 *
 * `minTargets` は測る要素の数の下限（既定 20）。お題ツールの画面のように timer より
 * 要素が少ない画面では下げて渡す。
 */
export async function scanContrast(page: Page, minTargets = 20): Promise<ContrastScan> {
  // **登場の演出が終わるのを待つ。** 周回アバターは `scale(0)` から現れるので、
  //   途中で掴むと箱が 0 で `:visible` から外れる（実測: 3 回中 1 回読み飛ばした）。
  //   回り続ける演出は終わらないので、回数に限りがあるものだけを待つ
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );

  const targets = page.locator(
    'button:visible, a:visible, h1:visible, h2:visible, h3:visible, label:visible, p:visible, span:visible',
  );
  // **走査の対象は最初に 1 度だけ掴む。** `targets.nth(i)` は呼ぶたびに引き直すので、
  //   走査の途中で見えている集合が変わると添字がずれ、末尾の要素がこぼれる。
  //   実測（#297）: 1 人のセッションで共有メモの空表示（4.52:1 の組）を 3 回中 2 回
  //   読み飛ばし、`--ivory-faint` の α を 0.64 に下げても緑になっていた
  const elements = await targets.elementHandles();
  expect(elements.length, '測る対象が見つからない').toBeGreaterThan(minTargets);

  const failures: string[] = [];
  const unmeasurable: string[] = [];
  const pairs = new Set<string>();
  let measured = 0;
  for (const element of elements) {
    // 直接の子テキストを持たない入れ物は飛ばす（親子で二重に測らない）
    const own = await element.evaluate((el) =>
      Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim(),
    );
    if (own === '') continue;

    const sample = await element.evaluate(sampleInPage);
    // **文字色の α を捨ててはいけない。** `--bone-muted` のように半透明で定義された
    // 文字は、下地に合成して初めて本当の見え方になる。α を無視して不透明扱いすると、
    // 透明度を上げて文字を薄くしても比が変わらず、**どれだけ薄くしても緑になる**（実測）。
    // 下地がグラデーションなら停止点のうち一番不利なところで測る（#279）
    const measurement = measureSample(sample);
    const ground = groundLayers(sample.backgrounds).map(describePaint).join(' ← ');
    if (measurement === null) {
      // **黙って飛ばさない。** 飛ばすと「測れていないのに緑」に戻る
      unmeasurable.push(`「${sample.text}」 文字=${describePaint(sample.ink)} 地=${ground}`);
      continue;
    }

    measured += 1;
    pairs.add(pairKey(sample.ink.color, ground));
    const { ratio, required } = measurement;
    if (ratio < required) {
      failures.push(
        `「${sample.text}」 ${ratio.toFixed(2)}:1（要 ${required}:1・${sample.fontSize}px/${sample.fontWeight}）` +
          ` 文字=${describePaint(sample.ink)} 地=${ground}`,
      );
    }
  }
  return { failures, unmeasurable, measured, pairs };
}

/**
 * 走査の結果を判定する。`thinnest` は**余裕がいちばん薄い組**で、それを 1 件以上
 * 測ったことも固定する（#297）。画面の作りが変わってその組が消えると、
 * AA の判定は緑のまま、パレットが主張する最小値を見なくなる。
 */
export function expectReadable(scan: ContrastScan, minMeasured: number, thinnest: readonly string[]): void {
  // Then（**測った件数も固定する。** 走査が空振りして 0 件でも緑になるのを防ぐ）
  //   件数の判定は最後に置く。先に置くと、下地が読めなくなったときに
  //   「1 つも測れていない」だけが出て、**理由を説明する一覧が出ない**
  expect(scan.unmeasurable, `下地か字の色を決められない文字が ${scan.unmeasurable.length} 件`).toEqual([]);
  expect(scan.failures, `AA を満たさない文字が ${scan.failures.length} 件`).toEqual([]);
  // 薄い組の欠けも「理由を説明する一覧」なので、件数より前に置く
  const missing = thinnest.filter((pair) => !scan.pairs.has(pair));
  expect(missing, `余裕の薄い組を測っていない（測った組: ${[...scan.pairs].join(' / ')}）`).toEqual([]);
  expect(scan.measured, '1 つも測れていない').toBeGreaterThan(minMeasured);
}

/**
 * キーボードのフォーカスが必ず見えることを確かめる。
 *
 * **「輪郭や影が出ているか」を単体で見てはいけない。** 主操作ボタンは装飾として
 * 常時 `box-shadow` を持つので、`boxShadow !== 'none'` は当てても当てなくても真になり、
 * グローバルの `:focus-visible` を丸ごと消しても緑のまま通った（実測）。
 * **当てた時と当てていない時で見た目が変わること**を判定する。
 *
 * この判定が見るのは「フォーカスが見えるか」であって「うちのリングが出ているか」
 * ではない。**著者のリングを消してもブラウザ既定の輪郭が出れば通る**（実測）。
 * a11y の要件としてはそれで足り、危険な壊れ方（`outline: none` にして代替を
 * 置かない）では実際に落ちることを変異で確認してある。
 * 「うちのリングであること」まで縛りたくなったら、色まで比べる形へ広げる。
 */
export async function expectFocusVisibleOnTab(page: Page, presses = 6): Promise<void> {
  const seen: string[] = [];
  for (let i = 0; i < presses; i += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null || el === document.body) return null;
      const style = (target: Element) => {
        const s = getComputedStyle(target);
        return `${s.outlineStyle}|${s.outlineWidth}|${s.outlineColor}|${s.boxShadow}`;
      };
      const withFocus = style(el);
      // 一時的にフォーカスを外し、同じ要素の見た目を測ってから戻す
      (el as HTMLElement).blur();
      const withoutFocus = style(el);
      (el as HTMLElement).focus();
      return {
        tag: el.tagName.toLowerCase(),
        name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24),
        withFocus,
        withoutFocus,
      };
    });
    if (focused === null) continue;
    seen.push(`${focused.tag}(${focused.name})`);

    expect(
      focused.withFocus,
      `${focused.tag}(${focused.name}) はフォーカスの有無で見た目が変わらない`,
    ).not.toBe(focused.withoutFocus);
  }

  // **実際に操作要素を通ったことを固定する。** 何にも当たらないまま
  // ループが空回りすると、上の判定は 1 度も走らずに緑になる
  expect(seen.length, `Tab で操作要素に当たらなかった（${seen.join(', ')}）`).toBeGreaterThan(1);
}

/**
 * プルダウンを開き、**一覧がページの中に、画面の地の色で描かれる**ことを確かめる（#317）。
 *
 * 素の `<select>` の一覧を Chrome は別の窓で描き、開いた最初の一瞬を白で塗る。
 * `appearance: base-select` を外すと、一覧の地は白（`rgb(255, 255, 255)`）・選択肢の高さは 0
 * （ページに並ばない）と測れる（実測）。白い一瞬そのものは撮れないので、原因の側を見る。
 */
export async function expectPickerInPage(select: Locator, groundToken: string): Promise<void> {
  const [ground] = await resolveColors(select.page(), [groundToken]);
  await select.click();
  const picker = await select.evaluate((el) => {
    const s = el as HTMLSelectElement;
    const style = getComputedStyle(s, '::picker(select)');
    return {
      open: s.matches(':open'),
      appearance: style.appearance,
      background: style.backgroundColor,
      optionHeights: Array.from(s.options).map((o) => o.getBoundingClientRect().height),
    };
  });
  // 開いていないと、下の値は閉じた一覧のものになって判定が空振りする
  expect(picker.open, 'プルダウンが開いていない').toBe(true);
  expect(picker.appearance, '一覧がページの外（別の窓）で描かれる').toBe('base-select');
  expect(picker.background, '一覧の地が画面の地と違う').toBe(ground);
  expect(picker.optionHeights.length, '選択肢が無い（判定が空振りする）').toBeGreaterThan(0);
  expect(picker.optionHeights.every((h) => h > 0), `選択肢がページに並んでいない（${picker.optionHeights.join(', ')}）`).toBe(true);

  // **ホバーした選択肢が一覧の地から浮くこと**（#320・E7）。欄の地を変える画面がホバーの地を
  // 変え忘れると、両方が同じ色になって選択の目印が消える（timer は --panel-2 = felt-700 で実際にそうなる）。
  const option = select.locator('option:not(:disabled)').first();
  await option.hover();
  const hovered = await option.evaluate((o) => getComputedStyle(o).backgroundColor);
  expect(hovered, '選択肢のホバーの地が一覧の地と同じ（選択の目印が見えない）').not.toBe(picker.background);

  await select.page().keyboard.press('Escape');
}

/** 文字を入れる欄（iOS Safari が 16px 未満でフォーカス時に画面を拡大する対象）。部品のクラスで絞らない —— 当て忘れた欄こそ測る */
const TEXT_FIELD = 'textarea, select, input:not([type="checkbox"], [type="radio"], [type="range"], [type="hidden"], [type="button"], [type="submit"], [type="color"], [type="file"])';

/**
 * 画面にある文字を入れる欄の字が 16px を下回らないこと（#320・E6・#316 PR 4）。
 *
 * 16px 未満の入力欄は iOS Safari がフォーカス時に画面を拡大する。部品は 1rem で持つが、画面の CSS が
 * 後から字の大きさを当てると同じ詳細度の後勝ちで潰れる。**計算後の値で見る**（CSS の検査より広いオラクル）。
 */
export async function expectFieldsAtLeast16px(page: Page): Promise<void> {
  const sizes = await page.locator(TEXT_FIELD).evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({
        name: el.getAttribute('aria-label') ?? el.id,
        px: Number.parseFloat(getComputedStyle(el).fontSize),
      })),
  );
  // 当たる欄が無いまま空回りすると、下の判定は 1 度も走らずに緑になる
  expect(sizes.length, '文字を入れる欄が画面に無い（判定が空振りする）').toBeGreaterThan(0);
  for (const s of sizes) expect(s.px, `${s.name} の字が 16px を下回る`).toBeGreaterThanOrEqual(16);
}

/*
 * 押せる大きさとはみ出し（#316 PR 4・設計正本 D7・D9・E4・E5）。
 *
 * 測る操作は D9 の 4 種（`button`・`a[href]`・`summary`・`[role="tab"]`）だけ。ラジオ・チェックボックス・スライダーなどの入力は D9 の射程の外で、測らない。
 *
 * 当たりは見た目の箱に、絶対配置の擬似要素（`::before` / `::after`）の広がりを足したもの（以下「申告の当たり」）。
 * 行の中の小さな操作は見た目を保ち、当たりだけを `::before` で 44×44 に広げる（`.lobby-row-icon-button` と同じ形）ので、
 * 箱だけで測るとそれらを全部「小さい」と誤る。擬似要素は `transform` で寄せない前提（計算値の `left` が変換前を返す）。
 *
 * **申告の当たりが本当に押せるかは、`document.elementFromPoint` で突いて確かめる。** 申告の当たりの計算は
 * 「擬似要素の包含ブロックは操作自身」と仮定していて、それは実装の `position: relative` が与えるものと同じ仮定だった。
 * 計算だけでは `position: relative` を消しても緑のまま（擬似要素は遠い祖先に付き、当たりは広がらない）。突けば、
 * 包含ブロックの取り違え・祖先の `overflow` による切り取り・他の要素の覆いかぶさりがどれも外れとして出る。
 */

/** 押せる操作（D9 の 4 種）。行内のリンク（文の中のリンク・Markdown の本文の中）は除く（設計正本 D9） */
const TARGET = 'button, a[href], summary, [role="tab"]';
const WIDTHS = [320, 768, 1280, 1920] as const;

interface Hit { name: string; left: number; top: number; right: number; bottom: number }

interface Scan {
  hits: Hit[];
  wrapped: string[];
  /** 申告の当たりのうち、突いても操作自身（かその子孫）に当たらなかった点 */
  misses: string[];
  /** 申告の当たり（と、`scope` を渡したときは測る範囲そのもの）が画面の横の範囲 [0, 幅] から出たもの（左へ押し出された中身も拾う） */
  outside: string[];
}

async function scanTargets(page: Page, scope: string): Promise<Scan> {
  return page.evaluate(([scope, sel]) => {
    const shown = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      // `checkVisibility()` は閉じた `<details>` の中身（`content-visibility: hidden`）を見えないと読む。箱の大きさだけでは
      // 閉じた中身も幅と高さを持って見え、画面の外の位置で測られていた（#316 PR 4・突きで「画面の外」と出て見つかった）
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && el.checkVisibility() && el.closest('[inert]') === null;
    };
    // 文の中のリンク: Markdown の本文の中、または最も近い段落・項目（`p` / `li`）に自分以外の文字がある。
    // 親が並べるための入れ物（ステータスの帯など）なだけのリンクは操作として測る。「親の字が自分と違えば行内」とすると、
    // 帯の「選択画面へ戻る」が隣のフェーズや名前の字で行内と読まれ、測られなかった（#316 PR 4・実測）
    const inline = (el: Element): boolean => {
      if (el.tagName !== 'A') return false;
      if (el.closest('.ui-md') !== null) return true;
      const block = el.parentElement?.closest('p, li');
      return block != null && (block.textContent ?? '').trim() !== (el.textContent ?? '').trim();
    };
    const name = (el: Element): string => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24);
    // 角の丸みの半径（箱の短い辺の半分で頭打ち。`calc(infinity * 1px)` の札も扱える）
    const radius = (cs: CSSStyleDeclaration, w: number, h: number): number => Math.min(
      Math.max(...[cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => parseFloat(v) || 0)),
      Math.min(w, h) / 2,
    );
    // 申告の当たりを作る箱: 見た目の箱と、絶対配置の擬似要素の箱（包含ブロックを操作自身と仮定する。仮定の正しさは下で突いて確かめる）。
    // `round` は箱の角の丸みの半径
    const boxes = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const list = [{ left: r.left, top: r.top, right: r.right, bottom: r.bottom, round: radius(cs, r.width, r.height) }];
      for (const which of ['::before', '::after'] as const) {
        const p = getComputedStyle(el, which);
        if (p.content === 'none' || p.position !== 'absolute') continue;
        const left = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(p.left);
        const top = r.top + parseFloat(cs.borderTopWidth) + parseFloat(p.top);
        const w = parseFloat(p.width), h = parseFloat(p.height);
        list.push({ left, top, right: left + w, bottom: top + h, round: radius(p, w, h) });
      }
      return list;
    };
    // 申告の当たり = 箱たちを囲む矩形（大きさと重なりはこれで測る）
    const claim = (list: ReturnType<typeof boxes>) => ({
      left: Math.min(...list.map((b) => b.left)), top: Math.min(...list.map((b) => b.top)),
      right: Math.max(...list.map((b) => b.right)), bottom: Math.max(...list.map((b) => b.bottom)),
    });
    const els = Array.from(document.querySelectorAll(`${scope} :is(${sel})`)).filter((el) => shown(el) && !inline(el));
    const hits = els.map((el) => ({ name: name(el), ...claim(boxes(el)) }));

    // 突く: 操作を画面の中ほどへ寄せ、申告の当たりの中央と、箱ごとの 4 つの角（1px 内側）を elementFromPoint で突く。
    // 角を囲む矩形でなく箱ごとに取るのは、横に長い箱と 44px 四方の擬似要素の和が十字形で、囲む矩形の角はどちらの箱にも無いため。
    // 角は丸みの分だけさらに内へ寄せる（半径 r の角で、角から 0.3r より内側の対角線上の点は丸みの内にある。
    // 寄せないと、丸い箱の角は親に当たって外れと読まれる）。画面の外の点は null を返し、外れに数える
    const identity = (cs: CSSStyleDeclaration): boolean =>
      (cs.transform === 'none' || new DOMMatrix(cs.transform).isIdentity)
      && ['none', '0deg'].includes(cs.rotate) && ['none', '1'].includes(cs.scale) && ['none', '0px'].includes(cs.translate);
    const transformed = (el: Element): boolean => {
      for (let e: Element | null = el; e !== null; e = e.parentElement) if (!identity(getComputedStyle(e))) return true;
      return false;
    };
    const misses: string[] = [];
    const outside: string[] = [];
    const sx = scrollX, sy = scrollY;
    const width = document.documentElement.clientWidth;
    for (const el of els) {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      const list = boxes(el);
      const c = claim(list);
      if (c.left < -0.5 || c.right > width + 0.5) outside.push(`${name(el)} ${Math.round(c.left)}〜${Math.round(c.right)}（幅 ${width}）`);
      const points: [string, number, number][] = [['中央', (c.left + c.right) / 2, (c.top + c.bottom) / 2]];
      // 傾けた（変形を持つ）操作は中央だけ突く。外接矩形の角は傾いた箱の外にあり、計算値の `left` は変形の前を返す（玄関の傾けて配った札）
      if (!transformed(el)) list.forEach((b, i) => {
        const k = 1 + 0.3 * b.round;
        const box = i === 0 ? '箱' : '擬似要素';
        points.push(
          [`${box}の左上`, b.left + k, b.top + k], [`${box}の右上`, b.right - k, b.top + k],
          [`${box}の左下`, b.left + k, b.bottom - k], [`${box}の右下`, b.right - k, b.bottom - k],
        );
      });
      for (const [where, x, y] of points) {
        const got = document.elementFromPoint(x, y);
        if (got === el || (got !== null && el.contains(got))) continue;
        const by = got === null ? '画面の外' : `${got.tagName.toLowerCase()}${got.classList.length > 0 ? `.${got.classList[0]}` : ''}`;
        misses.push(`${name(el)} の${where}（${Math.round(x)}, ${Math.round(y)}）→ ${by}`);
      }
    }
    scrollTo(sx, sy);
    // 測る範囲（ポップオーバー・ダイアログ）そのものも横の範囲に収まる。中の操作が右に寄っていると、範囲の左が切れても操作は画面に残る
    // （320 の通知設定のポップオーバーは左の 33px が切れ、見出しと項目の名前が欠けたが、中の操作は全部画面の中にあった・#316 PR 4 で実測）
    if (scope !== 'body') {
      for (const el of Array.from(document.querySelectorAll(scope)).filter(shown)) {
        const r = el.getBoundingClientRect();
        if (r.left < -0.5 || r.right > width + 0.5) outside.push(`測る範囲 ${scope} ${Math.round(r.left)}〜${Math.round(r.right)}（幅 ${width}）`);
      }
    }

    // 部品のボタンの字が 1 行に収まっているか。アイコン（svg）を数えないよう、文字のノードの行だけを数える。
    // 行は上端の近さで束ねる: 上端の差が行の高さの半分未満なら同じ行（和文と欧文の数 px の差を吸い、2 行目は 1 行の高さぶん下にある）。
    // 上端を一定の幅で丸めて数えると、同じ行の矩形が丸めの境目をまたいで別の行に数えられる（偽の「折れた」）
    const wrapped = Array.from(document.querySelectorAll(`${scope} .ui-button`)).filter(shown).filter((el) => {
      const rects: { top: number; half: number }[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
        if ((n.textContent ?? '').trim() === '') continue;
        const lh = parseFloat(getComputedStyle(n.parentElement ?? el).lineHeight);
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width === 0) continue;
          rects.push({ top: rect.top, half: (Number.isNaN(lh) ? rect.height : lh) / 2 });
        }
      }
      rects.sort((a, b) => a.top - b.top);
      let lines = 0;
      let lineTop = -Infinity;
      for (const r of rects) {
        if (Math.abs(r.top - lineTop) < r.half) continue;
        lines += 1;
        lineTop = r.top;
      }
      return lines > 1;
    }).map(name);
    return { hits, wrapped, misses, outside };
  }, [scope, TARGET] as const);
}

/**
 * 当たりが 44×44 以上で、どの 2 つも重ならず、突けば操作自身に当たり、画面の横の範囲に収まり、部品のボタンの字が折れない。
 * `minTargets` は測った操作の数の下限（空振りの防止）。
 * モーダル（dialog / ドロワー）が開いているときは `scope` を渡す（後ろの操作を重なりとして測らないため）。
 */
export async function expectTouchTargets(page: Page, label: string, minTargets: number, scope = 'body'): Promise<void> {
  const { hits, wrapped, misses, outside } = await scanTargets(page, scope);
  expect(hits.length, `${label}: 測った操作が少ない（描かれる前に測っていないか）`).toBeGreaterThanOrEqual(minTargets);
  // 申告の当たりが本物でなければ、下の大きさと重なりは架空の矩形を測ることになる。先に本物かを見る
  expect(misses, `${label}: 申告の当たりを突いても操作に当たらない（包含ブロックの取り違え・祖先の切り取り・覆いかぶさり）`).toEqual([]);
  expect(outside, `${label}: 当たりが画面の横の範囲から出る（左右に押し出された中身）`).toEqual([]);
  // 0.05px の余裕は Chromium のレイアウトの丸め（1/64px 単位。名簿の行の操作で実測 43.984）
  const small = hits.filter((h) => h.right - h.left < 44 - 0.05 || h.bottom - h.top < 44 - 0.05)
    .map((h) => `${h.name} ${Math.round(h.right - h.left)}x${Math.round(h.bottom - h.top)}`);
  expect(small, `${label}: 当たりが 44px 未満`).toEqual([]);
  const overlaps: string[] = [];
  for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) {
    const a = hits[i]!, b = hits[j]!;
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (x > 0.5 && y > 0.5) overlaps.push(`${a.name} / ${b.name}`);
  }
  expect(overlaps, `${label}: 当たりが重なる`).toEqual([]);
  expect(wrapped, `${label}: 字が 2 行に折れた部品のボタン`).toEqual([]);
}

/**
 * 終わりのある演出（ホバーの遷移・行の登場の拡大）が終わるのを待つ。演出の途中の箱は縮んでいたり動いていたりして、
 * 当たりの大きさと重なりを誤る（タブを切り替えた直後の名簿の行で、実測 32×34 と読んだ）。終わりの無い演出（脈打ちなど）と止まっている演出は待たない
 */
async function settleFiniteAnimations(page: Page): Promise<void> {
  await page.evaluate(() => Promise.all(document.getAnimations()
    // 止まっている演出の `finished` は解けないので、走っているものだけを待つ
    .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity)
    .map((a) => a.finished.catch(() => undefined))));
}

/**
 * 4 つの幅で、横に溢れず、押せる大きさを満たす。測り終えたら元の幅に戻す。
 * `scrollWidth` が見るのは右への溢れだけ。左（x < 0）へ押し出された中身はスクロールで届かないので
 * `scrollWidth` に出ない。それは `expectTouchTargets` の「当たりが画面の横の範囲から出る」と突きの外れが拾う
 */
export async function expectScreenAcrossWidths(page: Page, label: string, minTargets: number, scope = 'body'): Promise<void> {
  const original = page.viewportSize();
  // ホバーの浮き上がりは押せる範囲の重なりではない。ポインタを左上の角へ退けてから測る（玄関の道具選びで、「ルームを作る」を押した
  // ポインタの下に来た札が `translateY(-8px)` で浮き、上の札と重なって読めた。退けると札の間は 15.6px 空く・実測）
  await page.mouse.move(0, 0);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await settleFiniteAnimations(page);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `${label}（${width}）: 横に溢れる` }).toBe(true);
    await expectTouchTargets(page, `${label}（${width}）`, minTargets, scope);
  }
  if (original !== null) await page.setViewportSize(original);
}
