/**
 * 画面の CSS の契約（ADR 0035・`packages/ui/README.md`「画面を組む」）。部品の CSS の契約は `packages/ui` の試験、
 * 配置の結果は E2E が見る。アプリ自身の試験が自分の CSS を読む（部品の試験がアプリを読むと依存の向きが逆になる）。
 */
import { describe, expect, it } from 'vitest';
import { collectRules, foundBody, readFromCwd as read, rulesOf } from '@tasuki/test-css/css-rules';

const css = read('src/index.css');
/** コメントを除いた CSS（説明の字を規則と取り違えない） */
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('余白の持ち主の約束（画面の CSS）', () => {
  it('Given うちわけの CSS / When 規則を読む / Then 縦の間は親の gap が持ち、子に縦の外側の余白（margin-block・margin-top・margin-bottom）を持たせない', () => {
    const rules = collectRules(css);
    // 例外は共通の見出しと中身の間の 1 つだけ（agenda-web と同じ理由で、部品層には置けない）
    const withBlockMargin = rules.filter((rule) => /margin-(block|top|bottom)/.test(rule.body)).map((rule) => rule.selectors.join(', '));
    expect(withBlockMargin).toEqual(['.ui-room-header']);
    // `margin` の一括は 0 へ戻す形だけ（要素層の既定を消す）
    const shorthand = rules.flatMap((rule) => [...rule.body.matchAll(/(?:^|[;\s])margin:\s*([^;]+);/g)].map((m) => m[1]));
    expect(new Set(shorthand)).toEqual(new Set(['0']));
    // 走査が空振りしていない
    expect(rules.length).toBeGreaterThan(40);
  });

  it('Given 区画の並び / When 規則を読む / Then 画面の骨組みと段の中は、区画どうしの間（--space-5）を gap で持つ', () => {
    expect(foundBody(rulesOf(css, '.track-room'), '.track-room')).toMatch(/gap:\s*var\(--space-5\);/);
    expect(foundBody(rulesOf(css, '.track-column'), '.track-column')).toMatch(/gap:\s*var\(--space-5\);/);
  });
});

describe('幅の段とトークンの約束', () => {
  it('Given うちわけの CSS / When @media を探す / Then 幅の境目を自前で持たない（段組みは部品が持つ。書くなら範囲構文だけ）', () => {
    const queries = [...code.matchAll(/@media\s*([^{]+)\{/g)].map((m) => m[1]!.trim());
    expect(queries.filter((q) => !/^\(width (>=|<) (40|64|90)rem\)$/.test(q))).toEqual([]);
  });

  it('Given うちわけの CSS / When 色と字の大きさを探す / Then 生の色（#・rgb・hsl）と px・rem の字の大きさを書かない', () => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch)\(/);
    const fontSizes = [...code.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1]);
    expect(fontSizes.length).toBeGreaterThan(10);
    expect(fontSizes.filter((value) => !/^var\(--font-size-(xs|sm|base|lg|xl)\)$/.test(value ?? ''))).toEqual([]);
  });

  it('Given 押せる部品（候補・星） / When 規則を読む / Then 押せる大きさ（--tap-target）を下回らない', () => {
    expect(foundBody(rulesOf(css, '.track-candidate-pick'), '.track-candidate-pick')).toMatch(/min-height:\s*var\(--tap-target\);/);
    const pin = foundBody(rulesOf(css, '.track-pin'), '.track-pin');
    expect(pin).toMatch(/width:\s*var\(--tap-target\);/);
    expect(pin).toMatch(/min-height:\s*var\(--tap-target\);/);
  });

  it('Given 定番の星 / When 規則を読む / Then 押した状態は地と内側の線・塗りで示す（色だけに頼らない）', () => {
    expect(foundBody(rulesOf(css, ".track-pin[aria-pressed='true']"), '押した星')).toMatch(/box-shadow:\s*inset/);
    expect(foundBody(rulesOf(css, ".track-pin[aria-pressed='true'] .track-pin-star"), '押した星の形')).toMatch(/fill:\s*currentColor;/);
  });
});
