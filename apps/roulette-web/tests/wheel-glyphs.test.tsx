/**
 * 円盤の席の名前の**字の向き**（#94 PR 3・spec §6.3）。
 *
 * **`labelPlacement` の戻り値を使わない。** 2026-10-13 の実画面で、縦書きの席の欧文（「Mika」）が横倒しに描かれた。
 * `wheel-motion.test.ts` の「全組で ±45°」は関数の戻り値（`rotate + 回転子`）だけを見ていて、ブラウザが
 * 縦書きの欧文を 90° 回して組むこと（`text-orientation: mixed` の既定）が見えなかった。
 *
 * ここでは**描かれた円盤**（`<Wheel>` の DOM）から、ブラウザがするのと同じ順で字の傾きを組み立てる:
 *
 * 1. 回転子の `transform="rotate(θ)"` と名前の `transform="rotate(r x y)"` の文字列を読んで足す（座標系の傾き）
 * 2. 縦書き（`.wheel-label--vertical`）なら、`index.css` のその規則の `text-orientation` を読み、
 *    `mixed`（既定）なら欧文などの字を 90° 回す（Chromium の `getRotationOfChar` で実測した規則。
 *    漢字・かなは回らない）
 *
 * jsdom は CSS を当てず字も組まないので、2 の規則はこの物差しが持つ写しである。**ブラウザの実際の姿は
 * E2E（`e2e/specs/roulette.spec.ts` の `expectWheelGlyphsUpright`）が `getScreenCTM` と `getRotationOfChar`
 * で測る** —— そちらが正で、ここは速く・全角度を回せる側。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Wheel } from '../src/components/Wheel';

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

const NAMES = ['Mika', '山田', 'Ken Lee', '佐藤 花子', 'あおい', 'e2e-roulette-a'];

function entriesOf(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `e${i}`, name: NAMES[i % NAMES.length]! }));
}

/** 描かれた円盤の、空白以外の全部の字の画面上の傾き */
function drawnGlyphTilts(): { label: string; ch: string; tilt: number }[] {
  const orientation = verticalTextOrientation();
  const rotor = rotateOf(document.querySelector('.wheel-rotor'));
  return [...document.querySelectorAll('.wheel-label')].flatMap((text) => {
    const frame = rotor + rotateOf(text);
    const vertical = text.classList.contains('wheel-label--vertical');
    const label = text.textContent ?? '';
    return Array.from(label)
      .filter((ch) => ch.trim() !== '')
      .map((ch) => ({ label, ch, tilt: fold(frame + (vertical && orientation === 'mixed' && sidewaysInMixed(ch) ? 90 : 0)) }));
  });
}

/**
 * @requirements #94 spec §6.3
 */
describe('席の名前の字は倒れない（描かれた transform と CSS から組み立てる）', () => {
  it.each([3, 4, 5, 8, 13, 24])(
    'Given 欧文と漢字の名前で %i 席 / When 回転子の角度を 0〜359° で描く / Then 全部の字の画面上の傾きが ±45° 以内',
    (n) => {
      // Given
      const props = { entries: entriesOf(n), winnerIndex: -1, drawnIds: new Set<string>(), pointerDeg: 90, spinning: false, reducedMotion: true };
      const { rerender } = render(<Wheel {...props} angle={0} />);
      const fallen: string[] = [];
      let verticalLatin = 0;
      for (let angle = 0; angle < 360; angle += 1) {
        // When
        rerender(<Wheel {...props} angle={angle + 0.5} />);
        verticalLatin += document.querySelectorAll('.wheel-label--vertical').length > 0 ? 1 : 0;
        // Then
        for (const g of drawnGlyphTilts()) {
          if (Math.abs(g.tilt) > 45 + 1e-6) fallen.push(`angle=${angle + 0.5} 「${g.label}」の「${g.ch}」 ${g.tilt.toFixed(1)}°`);
        }
      }
      // 物差しが空振りしていない（縦書きの席が描かれる角度がある）
      expect(verticalLatin).toBeGreaterThan(0);
      expect(fallen.slice(0, 5), `倒れた字 ${fallen.length} 件`).toEqual([]);
    },
  );
});

/**
 * 縦書きの名前の行の外の端（中心からの距離）。描かれた `<text>` の x・y・`text-anchor` と字数から組み立てる。
 *
 * 縦書きは字が全部 1em（`font-size: 10px`。欧文も立てる）。**`text-anchor: end` は使ってはいけない** ——
 * Chromium は縦書きの漢字・かなの `end` を効かせず、行が基準点から外へ伸びた（2026-10-13 の実測）。そこで
 * `end` の縦書きは「基準点から行の向きへ伸びる」（ブラウザの実際の振る舞い）として数える。
 */
function verticalFarEnd(text: Element): number {
  const x = Number(text.getAttribute('x'));
  const y = Number(text.getAttribute('y'));
  const len = Array.from(text.textContent ?? '').length * 10;
  const r0 = Math.hypot(x, y);
  // 行は半径に沿う。基準点から外へ伸びるか内へ伸びるかは、名前の rotate 後の行の向き（下）と半径の外向きの内積で決まる
  const rotor = rotateOf(document.querySelector('.wheel-rotor'));
  const frame = ((rotor + rotateOf(text)) * Math.PI) / 180;
  const down = [-Math.sin(frame), Math.cos(frame)]; // 縦書きの行の向き（画面）
  const outAngle = ((rotor * Math.PI) / 180) + Math.atan2(y, x);
  const out = [Math.cos(outAngle), Math.sin(outAngle)];
  const outward = down[0]! * out[0]! + down[1]! * out[1]! > 0;
  return outward ? r0 + len : r0;
}

describe('縦書きの席の名前は縁（r=84）の外へ伸びない', () => {
  it.each([4, 5, 8, 13, 24])('Given %i 席 / When 回転子の角度を 0〜359° で描く / Then 縦書きの行の外の端が r=84 以内', (n) => {
    // Given
    const props = { entries: entriesOf(n), winnerIndex: -1, drawnIds: new Set<string>(), pointerDeg: 90, spinning: false, reducedMotion: true };
    const { rerender } = render(<Wheel {...props} angle={0} />);
    const over: string[] = [];
    let outwardSeen = 0;
    for (let angle = 0; angle < 360; angle += 1) {
      // When
      rerender(<Wheel {...props} angle={angle + 0.5} />);
      // Then
      for (const text of document.querySelectorAll('.wheel-label--vertical')) {
        const far = verticalFarEnd(text);
        if (far > Math.hypot(Number(text.getAttribute('x')), Number(text.getAttribute('y'))) + 1e-6) outwardSeen += 1;
        if (far > 84 + 1e-6) over.push(`angle=${angle + 0.5} 「${text.textContent}」 ${far.toFixed(1)}（anchor=${text.getAttribute('text-anchor')}）`);
      }
    }
    // 物差しが空振りしていない（行が外へ進む縦書きの席が描かれる角度がある）
    expect(outwardSeen).toBeGreaterThan(0);
    expect(over.slice(0, 5), `はみ出し ${over.length} 件`).toEqual([]);
  });
});
