/**
 * 手札の札の名前・意味と、手札の見出しの問い（#480）を CSS の宣言で守る。
 *
 * 読み上げの参照先（aria-labelledby・aria-describedby）は見た目で隠しても名前・説明に使えるので、
 * 読み上げの試験（hand.test.tsx）は「見た目で隠れた」ことに気づけない（PR #502 のレビュー）。
 * jsdom は table.css を読まず配置も計算しないので、ここは「添え書きを隠す宣言が無いか」だけを見る。
 * 実際の見え方（全やり方・320〜1920px での可視・はみ出し・重なり）は E2E（checkin.spec.ts）が見る。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/table.css'), 'utf8');

/** 宣言のブロック（入れ子の @media の中の規則も 1 つずつ）を、セレクタと中身の組で返す。コメントは除く */
function rules(): Array<{ selector: string; body: string }> {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
}

/** 添え書きと、それを包む要素（祖先）のクラス */
const CAPTION_PARTS = ['.hand-card-caption', '.hand-card-name', '.hand-card-meaning', '.hand-label-prompt', '.hand-label', '.hand-card', '.hand-area', '.hand'];

/** 見た目から消す宣言。値の 0 は `0` `0px` `0rem` などを含む */
const HIDING: ReadonlyArray<[string, RegExp]> = [
  ['display: none', /(^|;|\s)display:\s*none/],
  ['visibility: hidden', /(^|;|\s)visibility:\s*(hidden|collapse)/],
  ['opacity: 0', /(^|;|\s)opacity:\s*0(\.0*)?(px|%)?\s*(;|$)/],
  ['font-size: 0', /(^|;|\s)font-size:\s*0(px|rem|em)?\s*(;|$)/],
  ['clip / clip-path', /(^|;|\s)clip(-path)?:/],
  ['position: absolute（札の外へ追い出す・重ねる）', /(^|;|\s)position:\s*(absolute|fixed)/],
  ['color: transparent', /(^|;|\s)color:\s*transparent/],
];

/** セレクタが添え書き（かその祖先）を、子孫の別の要素ではなく自身として指しているか */
function targetsCaption(selector: string): string | null {
  for (const part of selector.split(',').map((s) => s.trim())) {
    const last = part.split(/\s+/).at(-1) ?? '';
    // `.hand-card-body` などの別の要素や、`::before` の擬似要素は対象外
    if (last.includes('::')) continue;
    const hit = CAPTION_PARTS.find((c) => new RegExp(`${c.replace('.', '\\.')}(?![\\w-])`).test(last));
    if (hit !== undefined) return part;
  }
  return null;
}

/**
 * @requirements #480（手札の札が何を示すかを、絵だけに頼らず読める）
 */
describe('手札の札の名前・意味と見出しの問いを CSS で隠さない', () => {
  it('Given table.css / When 添え書きとその祖先を指す規則を集める / Then 見た目から消す宣言が 1 つも無い', () => {
    const offending = rules().flatMap(({ selector, body }) => {
      const target = targetsCaption(selector);
      if (target === null) return [];
      return HIDING.filter(([, re]) => re.test(body)).map(([name]) => `${target}: ${name}`);
    });
    expect(offending).toEqual([]);
  });

  it('Given table.css / Then 名前・意味・問いの規則が実在する（集める対象が空振りしていない）', () => {
    const selectors = rules().map((r) => r.selector);
    for (const c of ['.hand-card-caption', '.hand-card-name', '.hand-card-meaning', '.hand-label-prompt']) {
      expect(selectors.some((s) => targetsCaption(s) !== null && s.includes(c)), `${c} の規則`).toBe(true);
    }
  });

  it('Given 札のボタン / Then 幅は名前の字（--font-size-sm）× 8 字から決め、段の切り替えで決めない（PR #502 の敵対的レビュー 1）', () => {
    const own = rules().filter(({ selector }) => selector.split(',').some((part) => /^\.hand-card$/.test(part.trim())));
    const widths = own.flatMap(({ body }) => [...body.matchAll(/(^|;|\s)inline-size:\s*([^;]+);/g)].map((m) => m[2]!.trim()));
    // 字は画面の幅で流れるので、固定の幅を段で切り替えると段の手前で字が幅を追い越す（628〜639px で「持ち帰れなかっ / た」）
    expect(widths).toEqual(['max(7rem, calc(var(--font-size-sm) * 8 + 0.25rem))']);
  });

  it('対照: 検査は添え書きを隠す宣言を拾う（拾えない検査は常に緑になる）', () => {
    const hidden = '.hand-card-caption { display: none; }';
    const m = /([^{}]+)\{([^{}]*)\}/.exec(hidden)!;
    expect(targetsCaption(m[1]!.trim())).not.toBeNull();
    expect(HIDING.some(([, re]) => re.test(m[2]!))).toBe(true);
    // 子孫の殻（.hand-card-body）の規則は対象外（浮き上がりの transform などは隠すことではない）
    expect(targetsCaption(".hand-card[aria-pressed='true'] .hand-card-body")).toBeNull();
  });
});
