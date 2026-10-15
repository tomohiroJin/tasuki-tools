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

/** 名前の書き方。`radial` = 半径に沿う横書き・`vertical` = 半径に沿う縦書き・`across` = 半径を横切る横書き */
export type LabelMode = 'radial' | 'vertical' | 'across';

export interface LabelPlacement {
  /** 名前の `rotate(...)`（回転子の座標の回転。画面上の傾きから回転子の角度を引いたもの） */
  rotate: number;
  /** `across` は席の中心線に中央を合わせる */
  anchor: 'start' | 'end' | 'middle';
  mode: LabelMode;
  /** 画面上の字の傾き（±60° 以内。縦書きと `across` は ±30° 以内） */
  tilt: number;
}

/** 名前の性質（書き方の選び分けに使う）。 */
export type LabelKind = 'latin' | 'short' | 'long';

/**
 * 半角の字（幅が全角の約半分）。ASCII とラテン 1 に、半角カナ・半角の句読点（U+FF61〜FF9F）を含める。
 * 半角カナを全角と数えると「ﾔﾏﾀﾞ」が長い名前になり、縦の席で縦に積まれる・5 字で切られる。
 */
export function isHalfWidth(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return cp <= 0xff || (cp >= 0xff61 && cp <= 0xff9f);
}

/**
 * 名前の 1 単位（字・書記素）の表示幅（em）。全角 1・半角（{@link isHalfWidth}）0.6。
 * 書記素（ZWJ の絵文字・結合文字）は先頭の符号位置で決める（結合文字は幅を足さない）。
 * 円盤の席（`fitLabel`）と結果の札（`card-name-size.ts`）が同じ物差しを使う唯一の場所。
 */
export function emWidthOf(unit: string): number {
  return isHalfWidth(unit) ? 0.6 : 1;
}

/**
 * 欧文（半角の字が空白を除いて半分以上）・短い名前（全角主体で 3 字まで）・長い名前（全角主体で 4 字以上）。
 * 欧文は縦に積むと読めない（「M／i／k／a」）ので縦書きにしない。短い名前は縦書きの列が斜めに傾くと
 * 2 字が画面の左右に並び逆順に読める（「山田」が「田山」）ので、斜めの席では横書きを優先する。
 */
export function labelKindOf(name: string): LabelKind {
  const chars = Array.from(name).filter((ch) => ch.trim() !== '');
  const half = chars.filter(isHalfWidth).length;
  if (chars.length > 0 && half * 2 >= chars.length) return 'latin';
  return chars.length <= 3 ? 'short' : 'long';
}

/**
 * 半径に沿う横書きで許す字の傾きの上限。長い名前は 45°（縦書きの列が長ければ斜めでも列として読める）、
 * 欧文と短い名前は 60°（縦書きの列が 30° 以内に立つ席でだけ縦にする）。利用者の決定（案 2・2026-10-13）。
 */
export function radialTiltLimit(kind: LabelKind): number {
  return kind === 'long' ? 45 : 60;
}

/**
 * 名前の向き（4 版・spec §6.3）。半径に沿う横書きの字の傾きが上限（`radialTiltLimit`）に収まればそれを、
 * 収まらない席（半径が画面の縦に近い席）では、全角主体の名前は半径に沿う縦書き、欧文は半径を横切る横書き
 * （字の傾きは縦書きと同じ）を選ぶ。`mid` は席の中心の角度（回転子の座標）・`rotorDeg` は回転子の角度。
 * 回っている間も毎フレーム決め直す。
 */
export function labelPlacement(mid: number, rotorDeg: number, kind: LabelKind = 'long'): LabelPlacement {
  const out = mod(mid + rotorDeg, 360) - 90; // 画面上の外向きの半径の向き（SVG の角度）
  const psi = mod(out, 180); // 行の向き（180° の剰余）
  const tiltH = psi <= 90 ? psi : psi - 180; // 半径に沿う横書きの字の傾き
  const tiltV = psi - 90; // 縦書き（と半径を横切る横書き）の字の傾き
  const mode: LabelMode = Math.abs(tiltH) <= radialTiltLimit(kind) ? 'radial' : kind === 'latin' ? 'across' : 'vertical';
  const tilt = mode === 'radial' ? tiltH : tiltV;
  if (mode === 'across') return { rotate: tilt - rotorDeg, anchor: 'middle', mode, tilt };
  const lineDir = mode === 'vertical' ? 90 + tilt : tilt;
  // 行が外へ進むなら行の終わりを縁に、内へ進むなら行の始まりを縁に置く
  const outward = Math.abs(mod(out - lineDir + 180, 360) - 180) < 1;
  return { rotate: tilt - rotorDeg, anchor: outward ? 'end' : 'start', mode, tilt };
}

/** 半径を横切る横書きの名前の中心の半径と、席の幅から入る字数（em）。字の高さは 1em = 10。 */
export const ACROSS_R = 78;
export function acrossMaxEm(seatDeg: number): number {
  if (seatDeg >= 180) return Infinity;
  const inner = ACROSS_R - 5; // 字の内側の端
  const chord = 2 * inner * Math.sin(((seatDeg / 2) * Math.PI) / 180);
  return Math.max(1, (chord - 4) / 10); // 席の仕切りから 2 ずつ空ける
}

/**
 * 名前を席に収める（全角 1・半角（`isHalfWidth`）0.6 で数え、溢れたら `…`）。縦書き（`upright`）では欧文も立てて積み、
 * 1 字が 1em を取るので全部 1 で数える。
 */
export function fitLabel(name: string, maxEm: number, upright = false): string {
  let w = 0;
  let out = '';
  for (const ch of name) {
    const cw = upright ? 1 : emWidthOf(ch);
    if (w + cw > maxEm) return `${out}…`;
    w += cw;
    out += ch;
  }
  return out;
}
