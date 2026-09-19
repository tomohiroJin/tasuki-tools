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
import { groundCandidates, measureSample, type Paint, type Sample } from '../support/contrast';

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

describe('下地の候補を組み立てる', () => {
  it('グラデーションだけで塗られた面は、停止点すべてを候補にする', () => {
    // Given 札の面（色は透明で、塗りは象牙のグラデーション）が羅紗に乗っている
    const card = [layer(TRANSPARENT, IVORY_LIGHTEST, IVORY_DARKEST), layer(FELT)];

    // When 下地の候補を組み立てる
    const grounds = groundCandidates(card);

    // Then 停止点がそのまま候補になる
    expect(grounds?.map((g) => [g.r, g.g, g.b])).toEqual([
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
    expect(grounds?.some((g) => g.r === 10 && g.g === 43 && g.b === 33)).toBe(false);
  });

  it('透明な停止点を含むなら、その下の色も候補に残す', () => {
    // Given 本体の羅紗（不透明な色の上に、外側が透明になる照明を 1 枚重ねてある）
    const felt = [layer(FELT, FELT_LIGHT, TRANSPARENT)];

    // When 下地の候補を組み立てる
    const grounds = groundCandidates(felt);

    // Then 照明の明るいところも、照明が切れたところの色も候補になる
    expect(grounds?.map((g) => [g.r, g.g, g.b])).toEqual(
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
    expect(grounds?.[0]?.r).toBeCloseTo(255 * 0.88 + 236 * 0.12, 5);
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

  it('グラデーションと画像が混ざる面は、読める層だけで測る（羅紗の織り目）', () => {
    // Given 本体の羅紗は「照明のグラデーション + 織り目の data-URI」で塗ってある。
    //   織り目まで測れないことを理由に全部を赤くすると検査が使えなくなるので、
    //   読める層で測る。楽観側に倒れる限界は `imageStops` の注釈に書いてある
    const felt = {
      color: FELT,
      image: `radial-gradient(120% 90% at 50% -10%, ${FELT_LIGHT} 0%, ${TRANSPARENT} 75%), url("data:image/svg+xml,%3Csvg%3E")`,
    };

    // When 下地の候補を組み立てる
    const grounds = groundCandidates([felt]);

    // Then 読めた層の色が候補になる
    expect(grounds?.map((g) => [g.r, g.g, g.b])).toEqual(
      expect.arrayContaining([
        [10, 43, 33],
        [23, 80, 64],
      ]),
    );
  });

  it('グラデーション以外の画像で塗られた面も「測れない」を返す', () => {
    // Given 写真・テクスチャ・SVG の data-URI だけで塗られた面。
    //   どんな色で塗られているかは文字列から分からない
    const texture = { color: TRANSPARENT, image: 'url("data:image/svg+xml,%3Csvg%3E")' };

    // When / Then 祖先へ抜けて別のものを測るくらいなら測れないと言う
    expect(groundCandidates([texture, layer(FELT)])).toBeNull();
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
