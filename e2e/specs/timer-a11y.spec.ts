/**
 * 見た目を作り替えても落としてはいけないもの（#78 やること 5）。
 *
 * **タグを付けない（`local` 専用）。** `e2e/tests/spec-tags.test.ts` の
 * `PRODUCTION_TAGS` は `@smoke` / `@core` だけで、未知のタグを足すとそちらが落ちる。
 * ここで見るのはスタイルの健全性で、本番のルーム枠を消費して確かめる種類のものでもない。
 *
 * 実ブラウザでしか見られないものだけを置く。
 * - `prefers-reduced-motion` の追従 … jsdom はメディアクエリも CSS カスケードも評価しない
 * - フォーカス可視化 … `:focus-visible` の実描画
 * - コントラスト比 … 実際に適用された色は `getComputedStyle` でしか取れない
 * - 書体のドリフト … 実際に何が取得されたかはネットワークを見るしかない
 *
 * 色だけで状態を伝えていないことは、DOM とテキストで足りるので
 * `apps/timer-web/test/ui/color-only-invariants.test.tsx` が担当する。
 */
import { expect, test } from '../fixtures/test';
import { createRoom, joinAsDriver, lobbyRotationRow } from '../support/timer';
import { describePaint, groundLayers, measureSample, sampleInPage } from '../support/contrast';

const HOST = 'a11y-a';
/** 輪の 2 人目以降。周回アバターと交代の列が**最も薄い字を felt-700 の面に置くのは 3 人目から**（#297）。 */
const GUESTS = ['a11y-b', 'a11y-c'] as const;

test.describe('動きを抑える設定に追従する', () => {
  test('Given reduced-motion を有効にした利用者 / When セッションを開く / Then 演出が止まる', async ({
    page,
  }) => {
    // Given
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // When
    await createRoom(page, HOST);
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();

    // Then その1: 秒針は「止める」のではなく消す（凍った針が残ると誤読される）。
    //   **`toHaveCount(0)` では落ちない。** CSS は `display: none` にするだけで
    //   要素は DOM に残るため、件数は 1 のまま（実測）。可視性そのものを見る
    const hand = page.locator('.chrono-hand');
    await expect(hand, '秒針の要素が見当たらない（判定が空振りする）').toHaveCount(1);
    await expect(hand).toBeHidden();

    // Then その2: **animation を持つ要素が 1 つ以上あり**、そのすべてが実質 0 秒。
    //   件数を先に固定しないと、演出が丸ごと消えた画面でも「全部 0 秒」で通ってしまう
    const durations = await page.evaluate(() =>
      Array.from(document.querySelectorAll('*'))
        .map((el) => getComputedStyle(el).animationDuration)
        .filter((d) => d !== '' && d !== 'auto'),
    );
    expect(durations.length).toBeGreaterThan(0);
    for (const d of durations) {
      expect(Number.parseFloat(d), `animation-duration=${d}`).toBeLessThan(0.05);
    }
  });
});

test.describe('キーボードのフォーカスが必ず見える', () => {
  test('Given 玄関の入力画面 / When Tab で送る / Then 当たった操作要素に輪郭が出る', async ({
    page,
  }) => {
    // Given: **玄関を直接開く**（#95 S5c・R9）。
    //   `/timer/` のままにしてはいけない —— 旧入口を撤去した後は玄関へ送り返される
    //   ので、**送り返しが壊れても玄関にも「ルームを作る」があり、緑のまま通る**。
    //   送り返しそのものは `timer.spec.ts` の専用シナリオが見る
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'ルームを作る' })).toBeVisible();

    // **「輪郭や影が出ているか」を単体で見てはいけない。** 主操作ボタンは装飾として
    // 常時 `box-shadow` を持つので、`boxShadow !== 'none'` は当てても当てなくても真になり、
    // グローバルの `:focus-visible` を丸ごと消しても緑のまま通った（実測）。
    // **当てた時と当てていない時で見た目が変わること**を判定する。
    //
    // この判定が見るのは「フォーカスが見えるか」であって「うちのリングが出ているか」
    // ではない。**著者のリングを消してもブラウザ既定の輪郭が出れば通る**（実測）。
    // a11y の要件としてはそれで足り、危険な壊れ方（`outline: none` にして代替を
    // 置かない）では実際に落ちることを変異で確認してある。
    // 「うちのリングであること」まで縛りたくなったら、色まで比べる形へ広げる。
    const seen: string[] = [];
    for (let i = 0; i < 6; i += 1) {
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
  });
});

test.describe('文字が背景に対して読める（WCAG AA）', () => {
  test('Given 3 人のセッション中の画面 / When 主要な文字を測る / Then すべて AA を満たす', async ({
    page,
    openPeer,
  }) => {
    // Given: **3 人で始める**（#297）。最も薄い字（`--bone-subtle` ＝ `--ivory-faint`）が
    //   最も明るい面（`--panel-2` ＝ `--felt-700`）に乗る箇所のうち、周回アバターと
    //   交代の列の「現でも次でもない人」は 3 人いないと画面に出ない。
    //   1 人で出るのは共有メモの空表示だけだった
    const code = await createRoom(page, HOST);
    for (const [i, name] of GUESTS.entries()) {
      const guest = await openPeer(name);
      await joinAsDriver(guest.page, code, name);
      await expect(lobbyRotationRow(page, name, i + 2)).toBeVisible();
    }
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    // 余裕がいちばん薄い組の色を、トークンから画面上で解いておく（数値を直書きしない）
    const thinnest = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--panel-2)';
      probe.style.color = 'var(--bone-subtle)';
      document.body.append(probe);
      const { backgroundColor, color } = getComputedStyle(probe);
      probe.remove();
      return { ground: backgroundColor, ink: color };
    });

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

    // When（文字を持つ要素のうち、実際に見えているものを測る）
    const targets = page.locator(
      'button:visible, a:visible, h1:visible, h2:visible, h3:visible, label:visible, p:visible, span:visible',
    );
    // **走査の対象は最初に 1 度だけ掴む。** `targets.nth(i)` は呼ぶたびに引き直すので、
    //   走査の途中で見えている集合が変わると添字がずれ、末尾の要素がこぼれる。
    //   実測（#297）: 1 人のセッションで共有メモの空表示（4.52:1 の組）を 3 回中 2 回
    //   読み飛ばし、`--ivory-faint` の α を 0.64 に下げても緑になっていた
    const elements = await targets.elementHandles();
    const count = elements.length;
    expect(count, '測る対象が見つからない').toBeGreaterThan(20);

    const failures: string[] = [];
    const unmeasurable: string[] = [];
    let measured = 0;
    let measuredThinnest = 0;
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
      if (sample.ink.color === thinnest.ink && ground === thinnest.ground) measuredThinnest += 1;
      const { ratio, required } = measurement;
      if (ratio < required) {
        failures.push(
          `「${sample.text}」 ${ratio.toFixed(2)}:1（要 ${required}:1・${sample.fontSize}px/${sample.fontWeight}）` +
            ` 文字=${describePaint(sample.ink)} 地=${ground}`,
        );
      }
    }

    // Then（**測った件数も固定する。** 走査が空振りして 0 件でも緑になるのを防ぐ）
    //   件数の判定は最後に置く。先に置くと、下地が読めなくなったときに
    //   「1 つも測れていない」だけが出て、**理由を説明する一覧が出ない**
    expect(unmeasurable, `下地か字の色を決められない文字が ${unmeasurable.length} 件`).toEqual([]);
    expect(failures, `AA を満たさない文字が ${failures.length} 件`).toEqual([]);
    expect(measured, '1 つも測れていない').toBeGreaterThan(15);
    // **余裕がいちばん薄い組を測ったことも固定する**（#297）。画面の作りが変わって
    //   この組が消えると、上の判定は緑のまま 4.52:1 を見なくなる
    expect(
      measuredThinnest,
      `--bone-subtle（${thinnest.ink}）が --panel-2（${thinnest.ground}）に直接乗った字を測っていない`,
    ).toBeGreaterThan(0);
  });
});

test.describe('書体は常用の層だけを取る', () => {
  test('Given 初回訪問 / When 玄関からセッションまで進む / Then 拡張の字形を取りにいかない', async ({
    page,
  }) => {
    // Given（何を取得したかを記録する）
    const fonts: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.endsWith('.woff2')) fonts.push(url.split('/').pop() ?? url);
    });

    // When
    await createRoom(page, HOST);
    await page.getByRole('button', { name: 'セッションを開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();

    // Then その1: **何かは取っている。** 0 件だと下の否定が空振りで通る
    expect(fonts.length, `書体を 1 つも取っていない（${fonts.join(', ')}）`).toBeGreaterThan(0);

    // Then その2: 拡張の層（利用者名の漢字用・約 210 KB）を引いていない。
    //   UI 文言に base 層へ入っていない字を足すと、ここが赤くなる
    const ext = fonts.filter((f) => f.includes('-ext-') || f.includes('-ext.'));
    expect(ext, `常用の層に無い字が画面に出ている（${ext.join(', ')}）`).toEqual([]);

    // Then その3: **取りにいった書体が、書体として読めている**（#297）。
    //   URL を数えるだけでは、`url()` が解決されずに SPA の HTML が返っていても緑になる
    //   （実際に timer は書体を 1 本も読めておらず、上の 2 つは緑のままだった）。
    //   読めなかった面は `status` が `error` になる。読めた面が 1 つ以上あることも固定する
    const faces = await page.evaluate(async () => {
      await document.fonts.ready;
      return Array.from(document.fonts)
        .filter((face) => face.status !== 'unloaded')
        .map((face) => `${face.family} ${face.weight} ${face.status}`);
    });
    expect(faces.filter((f) => f.endsWith(' error')), `読めなかった書体（${faces.join(', ')}）`).toEqual([]);
    expect(faces.filter((f) => f.endsWith(' loaded')).length, `読めた書体が無い（${faces.join(', ')}）`).toBeGreaterThan(0);
  });
});
