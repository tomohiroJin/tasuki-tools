/**
 * コントラスト検査が「グラデーションの面」を取りこぼさないことを固定する（#279）。
 *
 * **取りこぼしは赤くならない形で起きる。** `background: linear-gradient(…)` は
 * `background-color` を透明に戻すので、色だけを見る走査はその層を「何も塗っていない」と
 * 判断して祖先へ抜ける。比は出るので `null` にもならず、**測れていないのに数字が出る**。
 *
 * ブラウザが要るのは「実際に何が適用されたか」を取る `sampleInPage` だけで、
 * そこから先（候補の組み立てと最悪比の選択）は純関数にしてある。速い側に置ける。
 */
import { describe, it, expect } from 'vitest';
import {
  groundCandidates,
  groundLayers,
  measureSample,
  type Paint,
  type PseudoOrigin,
  type Sample,
} from '../support/contrast';

const FELT = 'rgb(10, 43, 33)';
const FELT_LIGHT = 'rgb(23, 80, 64)';
const IVORY_LIGHTEST = 'rgb(255, 253, 244)';
const IVORY_DARKEST = 'rgb(234, 225, 198)';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const BONE_FAINT = 'rgba(245, 239, 221, 0.66)';

/**
 * 実測の形に合わせた層の作り方。
 *
 * `background-image` は計算値の文字列のまま持つ（停止点の読み取りまで含めて
 * 検査したいので、あらかじめ配列に解いたものを渡さない）。
 */
const layer = (color: string, ...stops: string[]): Paint => ({
  color,
  image: stops.length === 0 ? 'none' : `linear-gradient(165deg, ${stops.join(', ')})`,
});

const sample = (overrides: Partial<Sample> = {}): Sample => ({
  ink: { color: 'rgb(38, 35, 28)', image: 'none' },
  backgrounds: [layer(FELT)],
  fontSize: 16,
  fontWeight: 400,
  text: '見出し',
  ...overrides,
});

/**
 * 擬似要素が敷いた層。既定は timer の計器ステージ（画面全体の裏に敷く形）。
 *
 * 素性はブラウザから持ち帰った計算値のまま渡す —— 地に数えるかの裁定は
 * `groundLayers` の側にあり、`sampleInPage` は判定しない（#279 と同じ向き）。
 */
const pseudoLayer = (
  paint: Paint,
  origin: Partial<PseudoOrigin> = {},
  opacity = 1,
): Paint => ({
  ...paint,
  opacity,
  pseudo: {
    which: '::after',
    content: '""',
    position: 'fixed',
    zIndex: '-1',
    owner: 0,
    ownerIsolation: 'isolate',
    ...origin,
  },
});

describe('地になる層を選ぶ', () => {
  it('字の下に敷かれた擬似要素は、自分の背景の内側の層として入る', () => {
    // Given 計器ステージ（不透明な地）の上に、方眼を敷く `::before` が乗っている
    const grid = pseudoLayer(layer(TRANSPARENT, 'rgba(245, 239, 221, 0.05)', TRANSPARENT), {
      which: '::before',
      zIndex: '-2',
    });

    // When 地になる層を選ぶ
    const layers = groundLayers([grid, layer(FELT)]);

    // Then 方眼が地の側に残り、ステージの色より内側に並ぶ
    expect(layers.map((paint) => paint.color)).toEqual([TRANSPARENT, FELT]);
  });

  it('字と並ぶ擬似要素（in-flow の罫線）は地に数えない', () => {
    // Given 玄関の見出しの `::after`（`position: static` の罫線）。実測で見つけた形で、
    //   これを地に数えると**乗っていない塗りで字を測る**ことになる
    const rule = pseudoLayer(layer(TRANSPARENT, 'rgba(240, 230, 200, 0.14)', TRANSPARENT), {
      position: 'static',
      zIndex: 'auto',
    });

    // When 地になる層を選ぶ
    const layers = groundLayers([rule, layer(FELT)]);

    // Then 罫線は落ちる
    expect(layers).toEqual([layer(FELT)]);
  });

  it('relative / sticky の擬似要素も、字と並ぶので地に数えない', () => {
    // Given `static` だけを弾くと漏れる。`relative` も `sticky` も**流れの中に箱を持つ**
    //   ので、字の下ではなく字の横に並ぶ
    const relative = pseudoLayer(layer('rgba(240, 230, 200, 0.14)'), { position: 'relative' });
    const sticky = pseudoLayer(layer('rgba(240, 230, 200, 0.14)'), { position: 'sticky' });

    // When / Then どちらも落ちる（地に数えると乗っていない塗りで字を測る）
    expect(groundLayers([relative, layer(FELT)])).toEqual([layer(FELT)]);
    expect(groundLayers([sticky, layer(FELT)])).toEqual([layer(FELT)]);
  });

  it('in-flow の擬似要素は、負の z-index が書いてあっても地に数えない', () => {
    // Given `z-index` は位置指定のある要素にしか効かないが、**計算値は書いた値のまま
    //   返る**。`position` を見ずに z だけで判定すると、効いていない z を真に受けて
    //   字と並ぶ箱を地に混ぜる（上の罫線の例は z が `auto` なので、そちらだけでは
    //   この誤りを検出できない —— 両方の実装が同じ答えを返してしまう）
    const rule = pseudoLayer(layer('rgba(240, 230, 200, 0.14)'), {
      position: 'static',
      zIndex: '-1',
    });

    // When 地になる層を選ぶ
    const layers = groundLayers([rule, layer(FELT)]);

    // Then 落ちる
    expect(layers).toEqual([layer(FELT)]);
  });

  it('z-index が負でない擬似要素は、字の上に乗るので地に数えない', () => {
    // Given 覆い被さる位置に置かれた擬似要素（`z-index: 0` と `auto`）
    const overlay = pseudoLayer(layer('rgba(0, 0, 0, 0.4)'), { zIndex: '0' });
    const auto = pseudoLayer(layer('rgba(0, 0, 0, 0.4)'), { zIndex: 'auto' });

    // When / Then どちらも地にはならない
    expect(groundLayers([overlay, layer(FELT)])).toEqual([layer(FELT)]);
    expect(groundLayers([auto, layer(FELT)])).toEqual([layer(FELT)]);
  });

  it('生成されていない擬似要素と、何も塗らない擬似要素は数えない', () => {
    // Given `content` が無いもの（そもそも描かれない）と、塗りを持たないもの
    const absent = pseudoLayer(layer('rgb(255, 0, 0)'), { content: 'none' });
    const blank = pseudoLayer(layer(TRANSPARENT));

    // When / Then どちらも落ちる（落とさないと透明な層で候補が増えるだけになる）
    expect(groundLayers([absent, layer(FELT)])).toEqual([layer(FELT)]);
    expect(groundLayers([blank, layer(FELT)])).toEqual([layer(FELT)]);
  });

  it('同じ要素の擬似要素は、z-index の大きい方が内側に来る', () => {
    // Given 方眼（z=-2）とグレイン（z=-1）。グレインの方が字に近い側に塗られる
    const grain = pseudoLayer(
      { color: TRANSPARENT, image: 'url("data:image/svg+xml,%3Csvg%3E")' },
      { which: '::after', zIndex: '-1' },
    );
    const grid = pseudoLayer(layer(TRANSPARENT, 'rgba(245, 239, 221, 0.05)', TRANSPARENT), {
      which: '::before',
      zIndex: '-2',
    });

    // When 持ち帰った順（`::before` が先）で選ぶ
    const layers = groundLayers([grid, grain, layer(FELT)]);

    // Then 並びは z-index の降順に直る（内 → 外）
    expect(layers.map((paint) => paint.pseudo?.which ?? 'own')).toEqual([
      '::after',
      '::before',
      'own',
    ]);
  });

  it('別の要素の擬似要素どうしは並べ替えない', () => {
    // Given 内側の要素の擬似要素（z=-2）と、外側の要素の擬似要素（z=-1）。
    //   z だけで並べ替えると、内と外が入れ替わって下地の順序が壊れる
    const inner = pseudoLayer(layer('rgba(255, 0, 0, 0.2)'), { owner: 0, zIndex: '-2' });
    const outer = pseudoLayer(layer('rgba(0, 0, 255, 0.2)'), { owner: 1, zIndex: '-1' });

    // When 地になる層を選ぶ
    const layers = groundLayers([inner, outer, layer(FELT)]);

    // Then 持ち帰った並び（内 → 外）のまま
    expect(layers.map((paint) => paint.color)).toEqual([
      'rgba(255, 0, 0, 0.2)',
      'rgba(0, 0, 255, 0.2)',
      FELT,
    ]);
  });
});

describe('下地の候補を組み立てる', () => {
  it('グラデーションだけで塗られた面は、停止点すべてを候補にする', () => {
    // Given 札の面（色は透明で、塗りは象牙のグラデーション）が羅紗に乗っている
    const card = [layer(TRANSPARENT, IVORY_LIGHTEST, IVORY_DARKEST), layer(FELT)];

    // When 下地の候補を組み立てる
    const grounds = groundCandidates(card);

    // Then 停止点がそのまま候補になる
    expect(grounds?.map((g) => [g.lightest.r, g.lightest.g, g.lightest.b])).toEqual([
      [255, 253, 244],
      [234, 225, 198],
    ]);
  });

  it('停止点がすべて不透明なら、そこで止まって祖先の地を混ぜない', () => {
    // Given 同じ札の面。羅紗が候補に混ざると、黒に近い字が羅紗と比べられて
    //   「AA 未達」という嘘の赤が出る
    const card = [layer(TRANSPARENT, IVORY_LIGHTEST, IVORY_DARKEST), layer(FELT)];

    // When 下地の候補を組み立てる
    const grounds = groundCandidates(card);

    // Then 羅紗は候補に現れない
    expect(
      grounds?.some((g) => g.lightest.r === 10 && g.lightest.g === 43 && g.lightest.b === 33),
    ).toBe(false);
  });

  it('透明な停止点を含むなら、その下の色も候補に残す', () => {
    // Given 本体の羅紗（不透明な色の上に、外側が透明になる照明を 1 枚重ねてある）
    const felt = [layer(FELT, FELT_LIGHT, TRANSPARENT)];

    // When 下地の候補を組み立てる
    const grounds = groundCandidates(felt);

    // Then 照明の明るいところも、照明が切れたところの色も候補になる
    expect(grounds?.map((g) => [g.lightest.r, g.lightest.g, g.lightest.b])).toEqual(
      expect.arrayContaining([
        [10, 43, 33],
        [23, 80, 64],
      ]),
    );
  });

  it('半透明の層は、下の候補すべてに重ねて合成する', () => {
    // Given 札の面の上に、淡い金の敷きが乗っている
    const tinted = [
      layer('rgba(236, 200, 121, 0.12)'),
      layer(TRANSPARENT, IVORY_LIGHTEST, IVORY_DARKEST),
      layer(FELT),
    ];

    // When 下地の候補を組み立てる
    const grounds = groundCandidates(tinted);

    // Then 停止点の数だけ、敷きを重ねた色が出る（素の象牙は残らない）
    expect(grounds).toHaveLength(2);
    expect(grounds?.[0]?.lightest.r).toBeCloseTo(255 * 0.88 + 236 * 0.12, 5);
  });

  it('不透明な層に届かなければ「測れない」を返す（黙って遡らない）', () => {
    // Given 半透明の敷きしか集まっていない
    // When / Then 下地を決められないので null
    expect(groundCandidates([layer('rgba(236, 200, 121, 0.12)')])).toBeNull();
  });

  it('塗りを色として解けないなら「測れない」を返す', () => {
    // Given 停止点が色として読めない塗り、および色として読めない背景色
    // When / Then どちらも null
    expect(groundCandidates([layer(TRANSPARENT, 'var(--ivory)'), layer(FELT)])).toBeNull();
    expect(groundCandidates([layer('color-mix(in srgb, red, blue)')])).toBeNull();
  });

  it('グラデーションと画像が混ざる面は、読めた層だけで緑にしない', () => {
    // Given 「照明のグラデーション + 織り目の data-URI」で塗られた面。#279 までは
    //   読める層だけで測っていたので、**不透明な写真を重ねても緑が出た**
    const felt = {
      color: FELT,
      image: `radial-gradient(120% 90% at 50% -10%, ${FELT_LIGHT} 0%, ${TRANSPARENT} 75%), url("data:image/svg+xml,%3Csvg%3E")`,
    };

    // When 下地の候補を組み立てる
    const grounds = groundCandidates([felt]);

    // Then 読めない層の分だけ「取りうる明るさの幅」になる
    expect(grounds?.map((g) => [g.darkest.r, g.lightest.r])).toEqual([[0, 255]]);
  });

  it('グラデーション以外の画像で塗られた面は、黒から白までの幅になる', () => {
    // Given 写真・テクスチャ・SVG の data-URI だけで塗られた面。
    //   どんな色で塗られているかは文字列から分からない
    const texture = { color: TRANSPARENT, image: 'url("data:image/svg+xml,%3Csvg%3E")' };

    // When 下地の候補を組み立てる
    const grounds = groundCandidates([texture, layer(FELT)]);

    // Then 祖先へ抜けて別のものを測らず、取りうる幅として持つ
    expect(grounds).toHaveLength(1);
    expect(grounds?.[0]?.darkest).toMatchObject({ r: 0, g: 0, b: 0 });
    expect(grounds?.[0]?.lightest).toMatchObject({ r: 255, g: 255, b: 255 });
  });

  it('上に不透明な層があるなら、その下の読めない層は幅にしない', () => {
    // Given テクスチャの**上**に不透明なグラデーションを重ねた面（CSS は先に書いた層が上）。
    //   テクスチャは 1 画素も見えないのに、層の順序を見ないと黒〜白の幅になり、
    //   **原因の分からない 1.00:1 の赤**が出る
    const covered = {
      color: TRANSPARENT,
      image: `linear-gradient(165deg, ${IVORY_LIGHTEST}, ${IVORY_DARKEST}), url("data:image/svg+xml,%3Csvg%3E")`,
    };

    // When 下地の候補を組み立てる
    const grounds = groundCandidates([covered, layer(FELT)]);

    // Then 上の層の停止点で測れる
    expect(grounds?.map((g) => [g.lightest.r, g.lightest.g, g.lightest.b])).toEqual([
      [255, 253, 244],
      [234, 225, 198],
    ]);
  });

  it('間引かれた層は、塗られる場合と塗られない場合の幅になる', () => {
    // Given `mask-image` でも `clip-path` でも、塗りは**箱の全面に乗るとは限らない**。
    //   どちらも `sampleInPage` が `masked` として持ち帰る
    const clipped = pseudoLayer({ ...layer('rgba(0, 0, 0, 0.05)'), masked: true });

    // When / Then 幅になる
    const grounds = groundCandidates([clipped, layer(FELT)]);
    expect(grounds).toHaveLength(1);
    expect(grounds?.[0]?.lightest).toMatchObject({ r: 10, g: 43, b: 33 });
  });

  it('読める層だけで塗られた面は、幅を持たない（1 点に決まる）', () => {
    // Given 羅紗の照明（色も停止点も rgb で読める）
    const felt = [layer(FELT, FELT_LIGHT, TRANSPARENT)];

    // When 下地の候補を組み立てる
    const grounds = groundCandidates(felt);

    // Then 暗い端と明るい端が一致する（幅は読めない層からしか生まれない）。
    //   **件数を先に固定する** —— `null` だと両辺が undefined になって恒真化する
    expect(grounds).toHaveLength(3);
    expect(grounds?.map((g) => g.darkest)).toEqual(grounds?.map((g) => g.lightest));
  });

  it('地に数えない擬似要素は、候補を 1 つも増やさない', () => {
    // Given 字と並ぶ罫線（地ではない）を混ぜた素材
    const rule = pseudoLayer(layer(TRANSPARENT, 'rgba(240, 230, 200, 0.14)', TRANSPARENT), {
      position: 'static',
      zIndex: 'auto',
    });

    // When / Then 羅紗だけの候補になる。**期待値は literal で書く** ——
    //   同じ関数どうしを比べると、両方が `null` を返しても通ってしまう
    expect(groundCandidates([rule, layer(FELT)])).toEqual([
      { darkest: { r: 10, g: 43, b: 33, a: 1 }, lightest: { r: 10, g: 43, b: 33, a: 1 } },
    ]);
  });

  it('マスクが掛かった層は、全面に塗られる場合と塗られない場合の幅になる', () => {
    // Given 羅紗の上の織り目。マスクは**画素ごとに塗りを間引く**ので、地は
    //   「全面に 5% の黒が乗る」から「1 画素も乗らない」までを取りうる。
    //   全面の側だけで測ると、**薄い象牙の字では緩い方の端**で緑を出す
    const weave = pseudoLayer({ ...layer('rgba(0, 0, 0, 0.05)'), masked: true });

    // When 下地の候補を組み立てる
    const grounds = groundCandidates([weave, layer(FELT)]);

    // Then 両端を持つ 1 つの幅になる
    expect(grounds).toHaveLength(1);
    expect(grounds?.[0]?.lightest).toMatchObject({ r: 10, g: 43, b: 33 });
    expect(grounds?.[0]?.darkest.r).toBeCloseTo(10 * 0.95, 5);
    expect(grounds?.[0]?.darkest.b).toBeCloseTo(33 * 0.95, 5);
  });

  it('マスクと塗りが重なる層は「測れない」を返す', () => {
    // Given マスクで間引かれたグラデーション。どこがどれだけ塗られるかが二重に読めない
    const patterned = pseudoLayer({
      ...layer(TRANSPARENT, 'rgb(255, 255, 255)', TRANSPARENT),
      masked: true,
    });

    // When / Then 幅にも畳めないので測れないに倒す
    expect(groundCandidates([patterned, layer(FELT)])).toBeNull();
  });

  it('持ち主が重なりの文脈を作らない擬似要素は「測れない」を返す', () => {
    // Given `isolation` を持たない要素の、負の z の擬似要素。**持ち主の背景より
    //   下へ潜る**ので、これを地として測ると画面に出ていない色で測ることになる
    const sunk = pseudoLayer(layer('rgb(0, 0, 0)'), { ownerIsolation: 'auto' });

    // When / Then 黙って地に数えず、測れないと言う
    expect(groundCandidates([sunk, layer(FELT)])).toBeNull();
  });

  it('薄さのある層は覆い隠さないので、外側の地まで測り続ける', () => {
    // Given 不透明な停止点だけのグラデーションを `opacity: 0.5` で敷いた擬似要素。
    //   薄さを無視すると「停止点が全部不透明だから下を隠す」と誤判定する
    const veil = pseudoLayer(layer(TRANSPARENT, 'rgb(255, 255, 255)'), {}, 0.5);

    // When 外側に不透明な層が無い素材を組み立てる
    const grounds = groundCandidates([veil]);

    // Then 覆ったことにして止めず、届いていないと言う
    expect(grounds).toBeNull();
  });

  it('擬似要素の薄さは、停止点の α にも掛かる', () => {
    // Given 白の不透明な停止点を、`opacity: 0.5` で羅紗の上に敷く
    const veil = pseudoLayer(layer(TRANSPARENT, 'rgb(255, 255, 255)'), {}, 0.5);

    // When 下地の候補を組み立てる
    const grounds = groundCandidates([veil, layer(FELT)]);

    // Then 羅紗と白の中間が候補になる
    expect(grounds?.map((g) => g.lightest.r)).toContain(10 * 0.5 + 255 * 0.5);
  });

  it('rgb 以外の色表記が混ざる塗りは「測れない」を返す', () => {
    // Given Chromium は `oklch()` と `color-mix()`（= `color(srgb …)`）を計算値でも
    //   rgb へ畳まない（実測）。rgb だけを拾うと**残りを黙って捨てる**ことになり、
    //   「全部不透明だから下を隠す層」と誤判定して明るい停止点ごと消える
    const modern = {
      color: TRANSPARENT,
      image: 'linear-gradient(oklch(0.9 0.1 90), rgb(0, 0, 0))',
    };
    const mixed = {
      color: TRANSPARENT,
      image: 'linear-gradient(color(srgb 0.5 0 0.5), rgb(0, 0, 0))',
    };

    // When / Then 読めない色が 1 つでもあれば測れないに倒す
    expect(groundCandidates([modern, layer(FELT)])).toBeNull();
    expect(groundCandidates([mixed, layer(FELT)])).toBeNull();
  });

  it('rgb 以外の色表記で塗られた背景色も「測れない」を返す', () => {
    // Given `background-color: oklch(…)` の層（塗りは無い）
    const modern = { color: 'oklch(0.7 0.1 150)', image: 'none' };

    // When / Then 透明と同一視して素通りしない
    expect(groundCandidates([modern, layer(FELT)])).toBeNull();
  });

  it('候補が組み合わせ爆発を起こすなら「測れない」を返す（賢く測らない）', () => {
    // Given 透明な停止点を持つ層は下を隠さないので、候補は層ごとに掛け算で増える
    const many = Array.from({ length: 4 }, () => layer(TRANSPARENT, FELT, FELT_LIGHT, TRANSPARENT));

    // When / Then 上限を超えたら測れないに倒す
    expect(groundCandidates([...many, layer(FELT)])).toBeNull();
  });
});

describe('最悪の組み合わせで比を出す', () => {
  it('下地の候補のうち、最も比が小さくなるものを選ぶ', () => {
    // Given 同じ薄い象牙の文字を、羅紗の単色の上と、照明のグラデーションの上に置く
    const bone = { color: BONE_FAINT, image: 'none' };
    const onFlatFelt = sample({ ink: bone, backgrounds: [layer(FELT)] });
    const onLitFelt = sample({ ink: bone, backgrounds: [layer(FELT, FELT_LIGHT, TRANSPARENT)] });

    // When それぞれ測る
    const flat = measureSample(onFlatFelt);
    const lit = measureSample(onLitFelt);

    // Then 明るい停止点の分だけ厳しい値が出る（パレットの注釈と同じ 4.52:1）
    expect(lit?.ratio).toBeLessThan(flat?.ratio as number);
    expect(lit?.ratio).toBeCloseTo(4.52, 1);
  });

  it('字がグラデーションで塗られていても比が 1.0 に落ちない', () => {
    // Given `background-clip: text` の字は `color` が透明。そのまま測ると下地と
    //   同色になり、**落ちる理由が嘘になる**（偽陽性）
    const wordmark = sample({
      ink: layer(TRANSPARENT, IVORY_LIGHTEST, 'rgb(236, 200, 121)'),
      backgrounds: [layer(FELT)],
      fontSize: 32,
      fontWeight: 700,
    });

    // When 測る
    const measured = measureSample(wordmark);

    // Then 停止点で測るので本当の見え方が出る
    expect(measured?.ratio).toBeGreaterThan(5);
    expect(measured?.required).toBe(3);
  });

  it('字の候補のうち、最も比が小さくなるものを選ぶ', () => {
    // Given 停止点の片方が羅紗に近い字
    const inkNearGround = sample({
      ink: layer(TRANSPARENT, IVORY_LIGHTEST, FELT_LIGHT),
      backgrounds: [layer(FELT)],
    });

    // When 測る
    const measured = measureSample(inkNearGround);

    // Then 読めない方の停止点で比が出る
    expect(measured?.ratio).toBeLessThan(2);
  });

  it('不透明な写真を敷いた面の字は、読めた層だけで緑にしない', () => {
    // Given 羅紗の照明に不透明な写真を重ねた面に、薄い象牙の字が乗っている。
    //   写真は白で塗られているかもしれないので、照明だけで測ると嘘の緑が出る
    const photographed = {
      color: FELT,
      image: `linear-gradient(165deg, ${FELT_LIGHT}, ${TRANSPARENT}), url("data:image/jpeg;base64,AAAA")`,
    };

    // When 測る
    const measured = measureSample(
      sample({ ink: { color: BONE_FAINT, image: 'none' }, backgrounds: [photographed] }),
    );

    // Then AA を満たさない（数字は出るが、足りないことが分かる形で出る）
    expect(measured?.ratio).toBeLessThan(4.5);
  });

  it('幅の中に字の明るさが入るなら、比は 1 まで落ちる', () => {
    // Given 不透明な写真の上の中間の灰色。下地は黒から白まで取りうるので、
    //   **字とまったく同じ明るさになりうる**。両端だけで測ると 3.9:1 と出て、
    //   本当の最悪（読めなくなる組み合わせ）を見落とす
    const photo = { color: TRANSPARENT, image: 'url("data:image/jpeg;base64,AAAA")' };

    // When 測る
    const measured = measureSample(
      sample({ ink: { color: 'rgb(128, 128, 128)', image: 'none' }, backgrounds: [photo] }),
    );

    // Then 比は 1（＝まったく読めない場合がある）
    expect(measured?.ratio).toBeCloseTo(1, 5);
  });

  it('擬似要素の薄さが CSS に出ていれば、その分だけの幅で測る', () => {
    // Given 計器ステージのグレイン（粒は読めないが `opacity: 0.04` が CSS に出ている）
    const grain = pseudoLayer(
      { color: TRANSPARENT, image: 'url("data:image/svg+xml,%3Csvg%3E")' },
      {},
      0.04,
    );
    const ink = { color: BONE_FAINT, image: 'none' };

    // When グレインのある面と、無い面で測る
    const grained = measureSample(sample({ ink, backgrounds: [grain, layer(FELT)] }));
    const plain = measureSample(sample({ ink, backgrounds: [layer(FELT)] }));

    // Then 4% ぶんだけ厳しくなるが、測れなくはならない
    expect(grained?.ratio).toBeLessThan(plain?.ratio as number);
    expect(grained?.ratio).toBeGreaterThan(4.5);
  });

  it('測れないものは null を返す（呼び出し側が黙って飛ばせないようにする）', () => {
    // Given 下地に届かない素材と、字の色を解けない素材
    // When / Then どちらも null
    expect(measureSample(sample({ backgrounds: [layer(TRANSPARENT)] }))).toBeNull();
    expect(measureSample(sample({ ink: { color: 'var(--ink)', image: 'none' } }))).toBeNull();
    expect(
      measureSample(sample({ ink: { color: TRANSPARENT, image: 'linear-gradient(oklch(0.9 0.1 90), rgb(0, 0, 0))' } })),
    ).toBeNull();
  });

  it('大きな文字の下限は 3:1、それ以外は 4.5:1 を返す', () => {
    // Given 大きさと太さだけが違う素材
    // When 測る
    // Then 18.66px は太字のときだけ「大きな文字」になる
    expect(measureSample(sample({ fontSize: 24 }))?.required).toBe(3);
    expect(measureSample(sample({ fontSize: 18.66, fontWeight: 700 }))?.required).toBe(3);
    expect(measureSample(sample({ fontSize: 18.66, fontWeight: 400 }))?.required).toBe(4.5);
  });
});
