/**
 * 円盤の席の名前の**字の向き**（#94 PR 3・spec §6.3 の 4 版）。
 *
 * **`labelPlacement` の戻り値を使わない。** 2026-10-13 の実画面で、縦書きの席の欧文（「Mika」）が横倒しに描かれた。
 * `wheel-motion.test.ts` の「全組で上限以内」は関数の戻り値（`rotate + 回転子`）だけを見ていて、ブラウザが
 * 縦書きの欧文を 90° 回して組むこと（`text-orientation: mixed` の既定）が見えなかった。
 *
 * ここでは**描かれた円盤**（`<Wheel>` の DOM）から、ブラウザがするのと同じ順で字の傾きを組み立てる:
 *
 * 1. 回転子の `transform="rotate(θ)"` と名前の `transform="rotate(r x y)"` の文字列を読んで足す（座標系の傾き）
 * 2. 縦書き（`.wheel-label--vertical`）なら、`index.css` のその規則の `text-orientation` を読み、
 *    `mixed`（既定）なら欧文などの字を 90° 回す（Chromium の `getRotationOfChar` で実測した規則。
 *    漢字・かなは回らない）
 *
 * **全角度の網羅は描いた DOM ではなく、`Wheel` が `<text>` にそのまま書く値（`wheel-labels.ts` の `labelViewOf`）の上で回す。**
 * jsdom で 360 回描き直す形は CI で時間切れになった（手元 0.3 秒・CI 5 秒超）。描いた DOM がその値と同じであることと、
 * DOM から組み立てた字の傾きも同じ物差しを通ることは、代表の角度（30° おき）で確かめる。
 *
 * jsdom は CSS を当てず字も組まないので、2 の規則はこの物差しが持つ写しである。**ブラウザの実際の姿は
 * E2E（`e2e/specs/roulette.spec.ts` の `expectWheelGlyphsUpright` ほか）が `getScreenCTM`・`getRotationOfChar`・
 * 描かれた箱・使われた書体で測る** —— そちらが正で、ここは速く・全角度を回せる側。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Wheel } from '../src/components/Wheel';
import { labelViewOf, seatsOf } from '../src/wheel-labels';

const CSS = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/index.css'), 'utf8');

/** `index.css` の `.wheel-label--vertical { ... }` の `text-orientation`（無ければ既定の `mixed`）。 */
function verticalTextOrientation(): string {
  const body = /\.wheel-label--vertical\s*\{([^}]*)\}/.exec(CSS)?.[1];
  if (body === undefined) throw new Error('index.css に .wheel-label--vertical の規則が無い');
  const decl = /(?:^|;|\s)text-orientation\s*:\s*([a-z-]+)/.exec(body.replace(/\/\*[\s\S]*?\*\//g, ''));
  return decl?.[1] ?? 'mixed';
}

/** 縦書き・`mixed` で、ブラウザが 90° 回して組む字（UAX #50 の R 相当。漢字・かな・全角記号は立てる） */
const sidewaysInMixed = (ch: string): boolean => (ch.codePointAt(0) ?? 0) < 0x2e80;

const fold = (x: number): number => ((((x + 180) % 360) + 360) % 360) - 180;

function rotateOf(el: Element | null): number {
  const raw = el?.getAttribute('transform') ?? '';
  const m = /rotate\((-?[\d.e+-]+)/.exec(raw);
  if (m === null) throw new Error(`transform が読めない: ${raw}`);
  return Number(m[1]);
}

// 「山田B」は全角主体の名前に混じった欧文（縦書きの席で立てる字。`text-orientation` を外すとここが倒れる）
const NAMES = ['Mika', '山田', 'Ken Lee', '佐藤 花子', 'あおい', 'e2e-roulette-a', '山田B'];

function entriesOf(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `e${i}`, name: NAMES[i % NAMES.length]! }));
}

/** 描く名前 1 つ（`<text>` の属性の文字列のまま）。DOM から読んでも、`labelViewOf` から組んでも同じ形 */
interface Drawn {
  text: string;
  transform: string;
  vertical: boolean;
  anchor: string;
  x: string;
  y: string;
}

/** 描いた DOM の名前 */
function drawnFromDom(): { rotor: number; labels: Drawn[] } {
  return {
    rotor: rotateOf(document.querySelector('.wheel-rotor')),
    labels: [...document.querySelectorAll('.wheel-label')].map((text) => ({
      text: text.textContent ?? '',
      transform: text.getAttribute('transform') ?? '',
      vertical: text.classList.contains('wheel-label--vertical'),
      anchor: text.getAttribute('text-anchor') ?? '',
      x: text.getAttribute('x') ?? '',
      y: text.getAttribute('y') ?? '',
    })),
  };
}

/** `Wheel` が回転子 `angle` で書く名前（DOM を作らずに、同じ値を文字列にする） */
function drawnFromViews(n: number, angle: number): { rotor: number; labels: Drawn[] } {
  return {
    rotor: angle,
    labels: seatsOf(entriesOf(n)).map((seat) => {
      const v = labelViewOf(seat, angle);
      return { text: v.text, transform: v.transform, vertical: v.vertical, anchor: v.anchor, x: String(v.x), y: String(v.y) };
    }),
  };
}

/** 空白以外の全部の字の画面上の傾き（回転子と名前の transform の文字列と、CSS の text-orientation から組み立てる） */
function glyphTilts(drawn: { rotor: number; labels: Drawn[] }): { label: string; ch: string; tilt: number }[] {
  const orientation = verticalTextOrientation();
  return drawn.labels.flatMap((d) => {
    const frame = drawn.rotor + rotateOf({ getAttribute: () => d.transform } as unknown as Element);
    return Array.from(d.text)
      .filter((ch) => ch.trim() !== '')
      .map((ch) => ({ label: d.text, ch, tilt: fold(frame + (d.vertical && orientation === 'mixed' && sidewaysInMixed(ch) ? 90 : 0)) }));
  });
}

/** 字が ±60° を超えて倒れた・欧文が主の名前を縦に積んだ、を数える */
function uprightViolations(drawn: { rotor: number; labels: Drawn[] }, at: string, fallen: string[], stacked: string[]): void {
  // 字は ±60° を超えて倒れない（半径に沿う横書きの上限。縦書きは 30° まで）
  for (const g of glyphTilts(drawn)) {
    if (Math.abs(g.tilt) > 60 + 1e-6) fallen.push(`${at} 「${g.label}」の「${g.ch}」 ${g.tilt.toFixed(1)}°`);
  }
  // 欧文が主の名前を縦に積まない（「M／i／k／a」は読めない。2026-10-13 利用者の決定・案 2）
  for (const d of drawn.labels.filter((l) => l.vertical)) {
    const chars = Array.from(d.text).filter((ch) => ch.trim() !== '' && ch !== '…');
    if (chars.filter(sidewaysInMixed).length * 2 >= chars.length) stacked.push(`${at} 「${d.text}」`);
  }
}

/** 代表の角度（30° おき。席の境目に載らないよう 0.5° ずらす） */
const SAMPLE_ANGLES = Array.from({ length: 12 }, (_, k) => k * 30 + 0.5);

/**
 * @requirements #94 spec §6.3
 */
describe('席の名前の字は倒れない（描かれた transform と CSS から組み立てる）', () => {
  it.each([3, 4, 5, 8, 13, 24])(
    'Given 欧文と漢字の名前で %i 席 / When 回転子の角度を 0〜359° で組む / Then 全部の字の画面上の傾きが ±60° 以内で、欧文を縦に積まない',
    (n) => {
      const fallen: string[] = [];
      const stacked: string[] = [];
      let verticalSeen = 0;
      for (let angle = 0; angle < 360; angle += 1) {
        // When
        const drawn = drawnFromViews(n, angle + 0.5);
        verticalSeen += drawn.labels.some((l) => l.vertical) ? 1 : 0;
        // Then
        uprightViolations(drawn, `angle=${angle + 0.5}`, fallen, stacked);
      }
      // 物差しが空振りしていない（縦書きの席が描かれる角度がある）
      expect(verticalSeen).toBeGreaterThan(0);
      expect(fallen.slice(0, 5), `倒れた字 ${fallen.length} 件`).toEqual([]);
      expect(stacked.slice(0, 5), `縦に積んだ欧文 ${stacked.length} 件`).toEqual([]);
    },
  );

  it.each([3, 8, 24])('Given %i 席 / When 代表の角度で描く / Then 描いた DOM は組んだ値と同じで、DOM から組み立てても倒れない', (n) => {
    // Given
    const props = { entries: entriesOf(n), winnerIndex: -1, drawnIds: new Set<string>(), pointerDeg: 90, spinning: false, reducedMotion: true };
    const { rerender } = render(<Wheel {...props} angle={0} />);
    const fallen: string[] = [];
    const stacked: string[] = [];
    for (const angle of SAMPLE_ANGLES) {
      // When
      rerender(<Wheel {...props} angle={angle} />);
      const dom = drawnFromDom();
      // Then: 網羅した値と同じものが描かれている（網羅が描いた姿を測っていることの担保）
      expect(dom, `angle=${angle}`).toEqual(drawnFromViews(n, angle));
      uprightViolations(dom, `angle=${angle}`, fallen, stacked);
    }
    expect(fallen.slice(0, 5), `倒れた字 ${fallen.length} 件`).toEqual([]);
    expect(stacked.slice(0, 5), `縦に積んだ欧文 ${stacked.length} 件`).toEqual([]);
  });
});

/** 半角の字数 0.6・全角 1 で数えた幅（字の高さ 1em = 10） */
const widthOf = (text: string): number => Array.from(text).reduce((w, ch) => w + ((ch.codePointAt(0) ?? 0) <= 0xff ? 6 : 10), 0);

describe('半径を横切る名前は席の幅に収まる', () => {
  it.each([3, 5, 8, 13, 24])('Given %i 席 / When 回転子の角度を 0〜359° で組む / Then 横切る名前の幅が、字の内側の端での席の弦以内', (n) => {
    const over: string[] = [];
    let acrossSeen = 0;
    for (let angle = 0; angle < 360; angle += 1) {
      // When
      const drawn = drawnFromViews(n, angle + 0.5);
      // Then: middle で置いた名前（半径を横切る）は、字の内側の端（中心 − 5）での席の弦に収まる
      for (const d of drawn.labels.filter((l) => l.anchor === 'middle')) {
        acrossSeen += 1;
        const inner = Math.hypot(Number(d.x), Number(d.y)) - 5;
        const chord = n <= 2 ? Infinity : 2 * inner * Math.sin(Math.PI / n);
        const w = widthOf(d.text);
        if (w > chord) over.push(`angle=${angle + 0.5} 「${d.text}」 幅 ${w} > 弦 ${chord.toFixed(1)}`);
      }
    }
    expect(acrossSeen).toBeGreaterThan(0);
    expect(over.slice(0, 5), `はみ出し ${over.length} 件`).toEqual([]);
  });
});

/**
 * 席の名前の太さには、名前の漢字を描ける書体（ext 層）がある。**無い太さで描くとシステムの書体に落ちる**。
 * 落ちた先（実測: WenQuanYi Zen Hei）は縦書きの字の送りが 0 で、当たりの席（700）の縦書きの「健太」が
 * 1 字に重なり、行の長さも 0 と数えられて縁の外へはみ出した（2026-10-13 の 320 の撮影）。
 * `index.css` の `.wheel-label` 系の規則の `font-weight` と、`packages/ui` の `fonts.css` の ext 層の太さを突き合わせる。
 */
describe('席の名前の太さは漢字の書体がある太さだけ', () => {
  it('Given index.css と fonts.css / When .wheel-label 系の太さを集める / Then どれも ext 層の太さにある', () => {
    // Given
    const fontsCss = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../packages/ui/src/tokens/fonts.css'), 'utf8');
    const extWeights = new Set(
      [...fontsCss.matchAll(/@font-face\s*\{([^}]*)\}/g)]
        .map((m) => m[1] ?? '')
        .filter((body) => /-ext\.woff2/.test(body))
        .map((body) => /font-weight:\s*(\d+)/.exec(body)?.[1]),
    );
    // When
    const weights = [...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(\.wheel-label[\w-]*)[^{]*\{([^}]*)\}/g)].flatMap((m) => {
      const w = /font-weight:\s*(\d+)/.exec(m[2] ?? '')?.[1];
      return w === undefined ? [] : [`${m[1]} ${w}`];
    });
    // Then
    expect(weights.length, '.wheel-label に太さの指定が無い（物差しの空振り）').toBeGreaterThan(0);
    expect(extWeights.size, 'ext 層が見つからない（物差しの空振り）').toBeGreaterThan(0);
    expect(weights.filter((w) => !extWeights.has(w.split(' ')[1]))).toEqual([]);
  });
});
