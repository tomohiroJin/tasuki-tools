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
  measureSample,
  worstContrast,
  type Paint,
  type Sample,
} from '../support/contrast';

const FELT = 'rgb(10, 43, 33)';
const FELT_LIGHT = 'rgb(23, 80, 64)';
const IVORY_LIGHTEST = 'rgb(255, 253, 244)';
const IVORY_DARKEST = 'rgb(234, 225, 198)';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

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
  color: 'rgb(38, 35, 28)',
  ink: ['rgb(38, 35, 28)'],
  backgrounds: [layer(FELT)],
  fontSize: 16,
  fontWeight: 400,
  text: '見出し',
  ...overrides,
});

describe('下地の候補を組み立てる', () => {
  it('グラデーションだけで塗られた面は、停止点すべてを候補にする', () => {
    const grounds = groundCandidates([
      layer(TRANSPARENT, IVORY_LIGHTEST, IVORY_DARKEST),
      layer(FELT),
    ]);

    expect(grounds).not.toBeNull();
    expect(grounds?.map((g) => [g.r, g.g, g.b])).toEqual([
      [255, 253, 244],
      [234, 225, 198],
    ]);
  });

  it('停止点がすべて不透明なら、そこで止まって祖先の地を混ぜない', () => {
    // 札の面（羅紗の上に置かれた象牙のグラデーション）。羅紗が候補に混ざると、
    // 黒に近い字が羅紗と比べられて「AA 未達」という嘘の赤が出る。
    const grounds = groundCandidates([
      layer(TRANSPARENT, IVORY_LIGHTEST, IVORY_DARKEST),
      layer(FELT),
    ]);

    expect(grounds?.some((g) => g.r === 10 && g.g === 43 && g.b === 33)).toBe(false);
  });

  it('透明な停止点を含むなら、その下の色も候補に残す', () => {
    // 本体の羅紗（不透明な色の上に、外側が透明になるグラデーションを 1 枚重ねてある）。
    const grounds = groundCandidates([layer(FELT, FELT_LIGHT, TRANSPARENT)]);

    expect(grounds?.map((g) => [g.r, g.g, g.b])).toEqual(
      expect.arrayContaining([
        [10, 43, 33],
        [23, 80, 64],
      ]),
    );
  });

  it('半透明の層は、下の候補すべてに重ねて合成する', () => {
    const grounds = groundCandidates([
      layer('rgba(236, 200, 121, 0.12)'),
      layer(TRANSPARENT, IVORY_LIGHTEST, IVORY_DARKEST),
      layer(FELT),
    ]);

    expect(grounds).toHaveLength(2);
    // 0.12 の金を象牙に重ねた色。元の象牙そのものは候補に残らない
    expect(grounds?.[0]?.r).toBeCloseTo(255 * 0.88 + 236 * 0.12, 5);
  });

  it('不透明な層に届かなければ「測れない」を返す（黙って遡らない）', () => {
    expect(groundCandidates([layer('rgba(236, 200, 121, 0.12)')])).toBeNull();
  });

  it('塗りを色として解けないなら「測れない」を返す', () => {
    expect(groundCandidates([layer(TRANSPARENT, 'var(--ivory)'), layer(FELT)])).toBeNull();
    expect(groundCandidates([layer('color-mix(in srgb, red, blue)')])).toBeNull();
  });

  it('グラデーション以外の画像で塗られた面も「測れない」を返す', () => {
    // 写真・テクスチャ・SVG の data-URI は、どんな色で塗られているか文字列からは
    // 分からない。**祖先へ抜けて別のものを測るくらいなら測れないと言う**（#279）。
    const texture = { color: TRANSPARENT, image: 'url("data:image/svg+xml,%3Csvg%3E")' };
    expect(groundCandidates([texture, layer(FELT)])).toBeNull();
  });

  it('候補が組み合わせ爆発を起こすなら「測れない」を返す（賢く測らない）', () => {
    // 透明な停止点を持つ層は下を隠さないので、候補は層ごとに掛け算で増える。
    const many = Array.from({ length: 4 }, () =>
      layer(TRANSPARENT, FELT, FELT_LIGHT, TRANSPARENT),
    );
    expect(groundCandidates([...many, layer(FELT)])).toBeNull();
  });
});

describe('最悪の組み合わせで比を出す', () => {
  it('下地の候補のうち、最も比が小さくなるものを選ぶ', () => {
    const grounds = groundCandidates([layer(FELT, FELT_LIGHT, TRANSPARENT)]);
    expect(grounds).not.toBeNull();
    if (grounds === null) return;

    const bone = { r: 245, g: 239, b: 221, a: 0.66 };
    const darkest = grounds.filter((g) => g.g === 43);
    expect(darkest).not.toHaveLength(0);
    const onDark = worstContrast([bone], darkest);
    const worst = worstContrast([bone], grounds);

    expect(worst).toBeLessThan(onDark);
    expect(worst).toBeCloseTo(4.52, 1);
  });

  it('字がグラデーションで塗られていても比が 1.0 に落ちない', () => {
    // `background-clip: text` の字は `color` が透明。そのまま測ると下地と同色になり、
    // **落ちる理由が嘘になる**（偽陽性）。停止点で測れば本当の見え方が出る。
    const measured = measureSample(
      sample({
        color: TRANSPARENT,
        ink: [IVORY_LIGHTEST, 'rgb(236, 200, 121)'],
        backgrounds: [layer(FELT)],
        fontSize: 32,
        fontWeight: 700,
      }),
    );

    expect(measured).not.toBeNull();
    expect(measured?.ratio).toBeGreaterThan(5);
    expect(measured?.required).toBe(3);
  });

  it('字の候補のうち、最も比が小さくなるものを選ぶ', () => {
    const measured = measureSample(
      sample({ color: TRANSPARENT, ink: [IVORY_LIGHTEST, FELT_LIGHT], backgrounds: [layer(FELT)] }),
    );

    expect(measured?.ratio).toBeLessThan(2);
  });

  it('測れないものは null を返す（呼び出し側が黙って飛ばせないようにする）', () => {
    expect(measureSample(sample({ backgrounds: [layer(TRANSPARENT)] }))).toBeNull();
    expect(measureSample(sample({ color: 'var(--ink)', ink: ['var(--ink)'] }))).toBeNull();
  });

  it('大きな文字の下限は 3:1、それ以外は 4.5:1 を返す', () => {
    expect(measureSample(sample({ fontSize: 24 }))?.required).toBe(3);
    expect(measureSample(sample({ fontSize: 18.66, fontWeight: 700 }))?.required).toBe(3);
    expect(measureSample(sample({ fontSize: 18.66, fontWeight: 400 }))?.required).toBe(4.5);
  });
});
