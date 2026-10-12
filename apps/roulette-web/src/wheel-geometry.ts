/**
 * 円盤の形（#94 PR 3・spec §6.3）。座標は SVG（viewBox 中心が原点）。角度は「真上 0°・時計回り」。
 */

/** 極座標 → SVG の座標。 */
export function polar(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(rad), r * Math.sin(rad)];
}

/** 内径 r0・外径 r1・角 a0〜a1 の扇形（環の一部）の path。 */
export function arcPath(r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = polar(r1, a0);
  const [x1, y1] = polar(r1, a1);
  const [x2, y2] = polar(r0, a1);
  const [x3, y3] = polar(r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0} A${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
}

export type Tone = 'a' | 'b' | 'c';

/** 席の濃淡: a/b を交互。奇数のときだけ最後の席を c（最後と最初が同じ色で隣り合わない）。 */
export function toneOf(i: number, n: number): Tone {
  if (n % 2 === 1 && i === n - 1 && n > 1) return 'c';
  return i % 2 === 0 ? 'a' : 'b';
}

const mod = (x: number, m: number): number => ((x % m) + m) % m;

export interface LabelPlacement {
  /** 名前の `rotate(...)`（回転子の座標の回転。画面上の傾きから回転子の角度を引いたもの） */
  rotate: number;
  anchor: 'start' | 'end';
  vertical: boolean;
  /** 画面上の字の傾き（±45° 以内） */
  tilt: number;
}

/**
 * 名前の向き（3 版）。名前の行は半径に沿わせ、字の傾きが ±45° を超えない書き方（横書き / 縦書き）を選ぶ。
 * `mid` は席の中心の角度（回転子の座標）・`rotorDeg` は回転子の角度。回っている間も毎フレーム決め直す。
 */
export function labelPlacement(mid: number, rotorDeg: number): LabelPlacement {
  const out = mod(mid + rotorDeg, 360) - 90; // 画面上の外向きの半径の向き（SVG の角度）
  const psi = mod(out, 180); // 行の向き（180° の剰余）
  const tiltH = psi <= 90 ? psi : psi - 180; // 横書きの字の傾き
  const tiltV = psi - 90; // 縦書きの字の傾き（行は 90° + tiltV へ進む）
  const vertical = Math.abs(tiltV) < Math.abs(tiltH);
  const tilt = vertical ? tiltV : tiltH;
  const lineDir = vertical ? 90 + tilt : tilt;
  // 行が外へ進むなら行の終わりを縁に、内へ進むなら行の始まりを縁に置く
  const outward = Math.abs(mod(out - lineDir + 180, 360) - 180) < 1;
  return { rotate: tilt - rotorDeg, anchor: outward ? 'end' : 'start', vertical, tilt };
}

/** 名前を席に収める（全角 1・半角 0.6 で数え、溢れたら `…`）。 */
export function fitLabel(name: string, maxEm: number): string {
  let w = 0;
  let out = '';
  for (const ch of name) {
    const cw = (ch.codePointAt(0) ?? 0) <= 0xff ? 0.6 : 1;
    if (w + cw > maxEm) return `${out}…`;
    w += cw;
    out += ch;
  }
  return out;
}
