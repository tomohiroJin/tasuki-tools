/**
 * `audit-ui-components.mjs` の自己テスト（#320・設計正本 §5・§9）。
 *
 * **逃げ道の族を全部ここへ置く。** 検査の述語を実装と同じ形で書くと、実装が見落とす書き方を
 * テストも見落とす（オラクルは実装より広く書く）。大文字・エスケープ・擬似クラスの引数・入れ子・
 * 一覧の後ろ側・`@media` の中を、それぞれ 1 件ずつ固定する。
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  checkComponentCss,
  checkScreenCss,
  classifyStyleFiles,
  definedPartClasses,
  findDeadParts,
  findRawColors,
  legacyPageClassUses,
  mediaWidthViolations,
  touchesFieldElement,
  uiTokensIn,
  unescapeIdent,
} from "./audit-ui-components.mjs";

const messagesOf = (css) => checkScreenCss("apps/x/src/index.css", css).map((p) => p.message);

describe("touchesFieldElement: 入力欄の型か ::picker( を含むセレクタを見つける", () => {
  const hits = [
    [".topic-panel select", "子孫の位置"],
    ["SELECT", "大文字"],
    ["s\\65lect", "エスケープ"],
    [":is(select)", ":is の引数"],
    [":where(.a textarea)", ":where の引数"],
    [":global(input)", ":global の引数（.module.css）"],
    [":-webkit-any(option)", ":-webkit-any の引数"],
    ["select::picker(select)", "型と擬似要素"],
    [".x::picker(select)", "擬似要素だけ"],
    [".ui-select option", "部品の内側を画面が飾る"],
    [":not(select)", ":not の引数"],
    [":has(> textarea)", ":has の引数"],
  ];
  for (const [selector, why] of hits) {
    test(`${why}: ${selector} は当たる`, () => {
      assert.equal(touchesFieldElement(selector), true);
    });
  }
  const misses = [
    [".hub-input", "クラス名だけ（射程外・README が担う）"],
    ["label", "label は対象にしない"],
    [".selector", "select を含む名前のクラス"],
    ["[type='text']", "属性だけ"],
  ];
  for (const [selector, why] of misses) {
    test(`${why}: ${selector} は当たらない`, () => {
      assert.equal(touchesFieldElement(selector), false);
    });
  }
});

describe("unescapeIdent", () => {
  test("16 進のエスケープと 1 文字のエスケープを解く", () => {
    assert.equal(unescapeIdent("s\\65lect"), "select");
    assert.equal(unescapeIdent("s\\65 lect"), "select");
    assert.equal(unescapeIdent("\\73 elect"), "select");
    assert.equal(unescapeIdent("a\\.b"), "a.b");
  });
});

describe("checkScreenCss: 写しの検出", () => {
  test("一覧の後ろ側だけが入力欄でも落とす", () => {
    assert.equal(messagesOf(".a, select { color: var(--x); }").length, 1);
  });
  test("@media の中の規則も落とす", () => {
    assert.equal(messagesOf("@media (width >= 40rem) { select { color: var(--x); } }").length, 1);
  });
  test("入れ子の子の規則も落とす", () => {
    assert.equal(messagesOf(".a { & select { color: var(--x); } }").length, 1);
  });
  test("入れ子の親が入力欄なら親を落とす（解決済みの子も別に落ちるのでちょうど 2 件）", () => {
    assert.equal(messagesOf("select { &:hover { color: var(--x); } }").length, 2);
  });
  test("クラス名だけの規則は落とさない", () => {
    assert.deepEqual(messagesOf(".hub-input { color: var(--x); }"), []);
  });
  test("@keyframes の from / 50% を解析して落ちない", () => {
    assert.deepEqual(messagesOf("@keyframes k { from { opacity: 0; } 50% { opacity: 1; } }"), []);
  });
  test("行番号を返す", () => {
    const [p] = checkScreenCss("f.css", "\n\nselect { color: var(--x); }");
    assert.equal(p.line, 3);
  });
});

describe("checkScreenCss: 申告（ui-exempt:）", () => {
  test("直前の申告があれば通す", () => {
    assert.deepEqual(messagesOf("/* ui-exempt: 計器の文字盤に合わせる */\nselect { color: var(--x); }"), []);
  });
  test("理由が空の申告は落とす", () => {
    assert.ok(messagesOf("/* ui-exempt: */\nselect { color: var(--x); }").some((m) => /理由が空/.test(m)));
  });
  test("何も免除していない申告は落とす", () => {
    assert.ok(messagesOf("/* ui-exempt: 昔の理由 */\n.a { color: var(--x); }").some((m) => /何も免除していない/.test(m)));
  });
  test("申告と規則の間に別の規則があれば、どちらも落とす", () => {
    const ms = messagesOf("/* ui-exempt: 理由 */\n.a { color: var(--x); }\nselect { color: var(--x); }");
    assert.ok(ms.some((m) => /何も免除していない/.test(m)));
    assert.ok(ms.some((m) => /入力欄の型/.test(m)));
  });
  test("申告は直後の規則 1 つだけを免除する", () => {
    const ms = messagesOf("/* ui-exempt: 理由 */\nselect { color: var(--x); }\ntextarea { color: var(--x); }");
    assert.equal(ms.length, 1);
  });
});

describe("checkScreenCss: 部品の入力欄の字の大きさ（16px の下限）", () => {
  test("部品のクラスに font-size を書いたら落とす", () => {
    assert.ok(messagesOf(".hub-form .ui-input { font-size: 0.8rem; }").some((m) => /16px/.test(m)));
  });
  test("一括指定の font も落とす", () => {
    assert.ok(messagesOf(".ui-select { font: inherit; }").some((m) => /16px/.test(m)));
  });
  test("字の大きさ以外は落とさない", () => {
    assert.deepEqual(messagesOf(".hub-invite.ui-input { font-family: var(--font-mono); }"), []);
  });
});

describe("checkScreenCss: 入れ子は & を解いてから判定する（設計正本 D10 の 1・レビュー指摘）", () => {
  test("親のクラスを継いだ子（&）に font-size を書いたら落とす", () => {
    const ms = messagesOf(".ui-input { &:focus { font-size: 1px } }");
    assert.equal(ms.filter((m) => /16px/.test(m)).length, 1);
  });
  test("申告は直後の規則だけを免除する。子（解決すると入力欄）には別に申告が要る", () => {
    assert.equal(messagesOf("/* ui-exempt: r */\nselect { &:hover { color: var(--x) } }").length, 1);
  });
  test("親が入力欄なら、親自身と解決済みの子の両方が落ちる（ちょうど 2 件）", () => {
    assert.equal(messagesOf("select { &:hover { color: var(--x) } }").length, 2);
  });
  test("@scope の開始引数が入力欄の型に当たれば、中の規則を落とす", () => {
    assert.equal(messagesOf("@scope (select) { :scope { color: var(--x) } }").length, 1);
  });
  test("@scope の終了引数（to）が入力欄の型に当たれば、中の規則を落とす", () => {
    assert.equal(messagesOf("@scope (.x) to (input) { .y { color: var(--x) } }").length, 1);
  });
  test("親の位置に & を書いた子（.ui-input &）に font-size を書いたら落とす", () => {
    const ms = messagesOf(".x { .ui-input & { font-size: 1px } }");
    assert.equal(ms.filter((m) => /16px/.test(m)).length, 1);
  });
});

describe("checkScreenCss: 入れ子のアットルールの中の宣言も自分の規則の宣言として数える（fix round 2・重要 1）", () => {
  test("規則の直下の @media の中の font-size を落とす（規則を挟まない）", () => {
    const ms = messagesOf(".ui-input { @media (x) { font-size: 1px } }");
    assert.equal(ms.filter((m) => /16px/.test(m)).length, 1);
  });
  test("入れ子の子（&）の中の @media の font-size は子の規則が落とす", () => {
    const ms = messagesOf(".ui-input { &:focus { @media (x) { font-size: 1px } } }");
    assert.equal(ms.filter((m) => /16px/.test(m)).length, 1);
  });
  test("@supports の中の @media の font-size も、規則を挟まなければ落とす（2 段のアットルール）", () => {
    const ms = messagesOf(".ui-input { @supports (x) { @media (y) { font-size: 1px } } }");
    assert.equal(ms.filter((m) => /16px/.test(m)).length, 1);
  });
});

describe("checkScreenCss: 解決処理の振る舞い（fix round 2・重要 3・変異を殺す）", () => {
  test("親の一覧は組み合わせを全部見る（直積を先頭 1 つに縮めると見逃す）", () => {
    const ms = messagesOf(".a, .ui-input { &:focus { font-size: 1px } }");
    assert.equal(ms.filter((m) => /16px/.test(m)).length, 1);
  });
  test("祖先を辿るとき @media を飛ばして規則まで届く（1 段で null にすると見逃す）", () => {
    const ms = messagesOf(".ui-input { @media (x) { &:focus { font-size: 1px } } }");
    assert.equal(ms.filter((m) => /16px/.test(m)).length, 1);
  });
  test("祖先は 1 段では終わらず、根まで再帰的に解決する（3 段）", () => {
    const ms = messagesOf(".ui-input { .b { &:hover { &:focus { font-size: 1px } } } }");
    assert.equal(ms.filter((m) => /16px/.test(m)).length, 1);
  });
  test("& は置換して初めて部品のクラスが現れる形（子孫結合のままでは現れない）", () => {
    // ".ui-inp" + "ut" を & で継ぐと ".ui-input" という 1 つのクラスになる。
    // 子孫結合（".ui-inp &ut"）のままでは、そのクラス名はどこにも現れない。
    const ms = messagesOf(".ui-inp { &ut { font-size: 1px } }");
    assert.equal(ms.filter((m) => /16px/.test(m)).length, 1);
  });
});

describe("classifyStyleFiles: 走査対象の仕分け", () => {
  test("大文字の拡張子（.CSS）も画面の CSS として数える（fix round 2・軽微 2）", () => {
    assert.deepEqual(classifyStyleFiles(["apps/x/a.CSS"]).screen, ["apps/x/a.CSS"]);
  });
  test("トークン層と部品層を画面の CSS から外し、部品層は別に数える", () => {
    const r = classifyStyleFiles([
      "apps/landing/src/index.css",
      "packages/ui/src/elements/reset.css",
      "packages/ui/src/tokens/palette.css",
      "packages/ui/src/components/field.css",
    ]);
    assert.deepEqual(r.screen, ["apps/landing/src/index.css", "packages/ui/src/elements/reset.css"]);
    assert.deepEqual(r.components, ["packages/ui/src/components/field.css"]);
    assert.deepEqual(r.foreign, []);
  });
  test(".css 以外のスタイルの拡張子を名指しする", () => {
    const r = classifyStyleFiles(["apps/x/src/a.pcss", "apps/x/src/b.postcss", "apps/x/src/c.SCSS"]);
    assert.deepEqual(r.foreign, ["apps/x/src/a.pcss", "apps/x/src/b.postcss", "apps/x/src/c.SCSS"]);
  });
  test(".module.css は画面の CSS として数える", () => {
    assert.deepEqual(classifyStyleFiles(["apps/x/src/a.module.css"]).screen, ["apps/x/src/a.module.css"]);
  });
});

const partMessagesOf = (css) => checkComponentCss("packages/ui/src/components/x.css", css).map((p) => p.message);

describe("checkComponentCss: セレクタは .ui- のクラスから始める", () => {
  const ok = [".ui-select", ".ui-select option", "textarea.ui-input", ".ui-select::picker(select)", ".ui-select option:hover"];
  for (const selector of ok) {
    test(`${selector} は通す`, () => {
      assert.deepEqual(partMessagesOf(`${selector} { color: var(--ivory); }`), []);
    });
  }
  const bad = ["select", ":focus-visible", "*", "[type='text']", ":root", ".a .ui-b", "body .ui-select"];
  for (const selector of bad) {
    test(`${selector} は落とす（全アプリへ漏れる）`, () => {
      assert.ok(partMessagesOf(`${selector} { color: var(--ivory); }`).some((m) => /\.ui- のクラス/.test(m)));
    });
  }
  test("一覧の片側だけが外れていても落とす", () => {
    assert.ok(partMessagesOf(".ui-select, select { color: var(--ivory); }").some((m) => /\.ui- のクラス/.test(m)));
  });
  test("入れ子を落とす", () => {
    assert.ok(partMessagesOf(".ui-a { & .ui-b { color: var(--ivory); } }").some((m) => /入れ子/.test(m)));
  });
  test("@scope と @layer を落とす", () => {
    assert.ok(partMessagesOf("@scope (.ui-a) { .ui-b { color: var(--ivory); } }").some((m) => /@scope/.test(m)));
    assert.ok(partMessagesOf("@layer x { .ui-b { color: var(--ivory); } }").some((m) => /@layer/.test(m)));
  });
});

describe("checkComponentCss: @import は同じディレクトリの部品ファイルだけ許す（fix round 3・重要 8）", () => {
  test("同じディレクトリの相対パスは通す", () => {
    assert.deepEqual(partMessagesOf("@import './field.css';"), []);
  });
  test("上の階層（要素層など）への @import は落とす", () => {
    assert.ok(partMessagesOf("@import '../elements/index.css';").some((m) => /@import/.test(m)));
  });
  test("さらに上の階層への @import も落とす", () => {
    assert.ok(partMessagesOf("@import '../../tokens/index.css';").some((m) => /@import/.test(m)));
  });
  test("サブディレクトリへの @import も落とす（同じディレクトリではない）", () => {
    assert.ok(partMessagesOf("@import './sub/x.css';").some((m) => /@import/.test(m)));
  });
  test("裸の指定子（パッケージ名）も落とす", () => {
    assert.ok(partMessagesOf("@import '@tasuki/ui/tokens.css';").some((m) => /@import/.test(m)));
  });
  test("url() で包んだ形も同じ規則で見る", () => {
    assert.deepEqual(partMessagesOf("@import url('./field.css');"), []);
    assert.ok(partMessagesOf("@import url('../elements/index.css');").some((m) => /@import/.test(m)));
  });
});

describe("checkComponentCss: ::picker を一覧に同居させない", () => {
  test("同居は落とす（::picker を知らないブラウザが一覧ごと捨てる）", () => {
    assert.ok(partMessagesOf(".ui-select, .ui-select::picker(select) { appearance: base-select; }").some((m) => /同居/.test(m)));
  });
  test("単独なら通す", () => {
    assert.deepEqual(partMessagesOf(".ui-select::picker(select) { appearance: base-select; }"), []);
  });
});

describe("checkComponentCss: outline は選択肢だけ", () => {
  test("部品に outline を書いたら落とす（要素層のリングを打ち消す）", () => {
    assert.ok(partMessagesOf(".ui-input { outline: 0; }").some((m) => /outline/.test(m)));
    assert.ok(partMessagesOf(".ui-input:focus-visible { outline-offset: 2px; }").some((m) => /outline/.test(m)));
  });
  test("選択肢の outline: none は通す", () => {
    assert.deepEqual(partMessagesOf(".ui-select option:hover, .ui-select option:focus-visible { outline: none; }"), []);
  });
  test("一覧に選択肢以外が混ざれば落とす", () => {
    assert.ok(partMessagesOf(".ui-select option, .ui-select { outline: none; }").some((m) => /outline/.test(m)));
  });
});

describe("checkComponentCss: つまみを宣言しない", () => {
  test("カスタムプロパティの宣言を落とす（画面の上書きが継承に負ける）", () => {
    assert.ok(partMessagesOf(".ui-select { --ui-field-bg: var(--felt-950); }").some((m) => /つまみ/.test(m)));
  });
  test("var() の第 2 引数で既定値を持つのは通す", () => {
    assert.deepEqual(partMessagesOf(".ui-select { background: var(--ui-field-bg, var(--felt-950)); }"), []);
  });
});

describe("findRawColors: 生の色", () => {
  const raw = [
    ["#fff", "3 桁"], ["#FFFF", "4 桁"], ["#071f18", "6 桁"], ["#071f18cc", "8 桁"],
    ["rgba(0, 0, 0, 0.45)", "rgba"], ["RGBA(0,0,0,.1)", "大文字"], ["hsl(10 20% 30%)", "hsl"],
    ["oklch(0.7 0.1 80)", "oklch"], ["color(srgb 1 0 0)", "color()"], ["white", "名前の色"],
    ["var(--a, #fff)", "var の第 2 引数の中"], ["0 10px 15px rgba(0,0,0,.45)", "影の中"],
  ];
  for (const [value, why] of raw) {
    test(`${why}: ${value} を見つける`, () => {
      assert.ok(findRawColors(value).length > 0);
    });
  }
  const clean = [
    "var(--gold)", "var(--ui-field-bg, var(--felt-950))", "transparent", "currentColor", "inherit",
    "color-mix(in srgb, var(--gold) 50%, transparent)", "1px solid var(--line-strong)", "thin", "base-select",
  ];
  for (const value of clean) {
    test(`${value} は生の色ではない`, () => {
      assert.deepEqual(findRawColors(value), []);
    });
  }
  test("部品の CSS の生の色を落とす", () => {
    assert.ok(partMessagesOf(".ui-a { color: #fff; }").some((m) => /生の色/.test(m)));
  });
});

describe("死んだ部品", () => {
  test("uiTokensIn は ui- で始まる語だけを拾う", () => {
    assert.deepEqual([...uiTokensIn('className="ui-select x-ui-input ui-banner--unreachable"')].sort(), ["ui-banner--unreachable", "ui-select"]);
  });
  test("definedPartClasses は部品の CSS に定義したクラスを拾う", () => {
    assert.deepEqual([...definedPartClasses(".ui-select option:hover {} textarea.ui-input {}")].sort(), ["ui-input", "ui-select"]);
  });
  test("2 つ以上のアプリが使っていないクラスを返す", () => {
    const usage = new Map([
      ["apps/a", new Set(["ui-input", "ui-select"])],
      ["apps/b", new Set(["ui-input"])],
    ]);
    assert.deepEqual(findDeadParts(new Set(["ui-input", "ui-select"]), usage), ["ui-select"]);
  });
});

describe("checkComponentCss: @keyframes の中の宣言も見る（fix round 1 Important 1）", () => {
  test("生の色・つまみの宣言を落とす（セレクタの判定は飛ばす）", () => {
    const ms = partMessagesOf("@keyframes k { from { color: #fff; background: red; --ui-a: 1; } }");
    assert.ok(ms.some((m) => /生の色/.test(m) && /color/.test(m)));
    assert.ok(ms.some((m) => /生の色/.test(m) && /background/.test(m)));
    assert.ok(ms.some((m) => /つまみ/.test(m)));
  });
});

describe("checkComponentCss: ::picker は .ui-select と同じ複合セレクタでだけ許す（fix round 1 Important 2）", () => {
  test(".ui-input::picker(select) は落とす（.ui-select ではない）", () => {
    assert.ok(partMessagesOf(".ui-input::picker(select) { appearance: base-select; }").some((m) => /続く/.test(m)));
  });
  test(".ui-a ::picker(select) は落とす（結合子を挟む）", () => {
    assert.ok(partMessagesOf(".ui-a ::picker(select) { appearance: base-select; }").some((m) => /続く/.test(m)));
  });
  test(".ui-select::picker(select) は通す", () => {
    assert.deepEqual(partMessagesOf(".ui-select::picker(select) { appearance: base-select; }"), []);
  });
});

describe("checkComponentCss: outline* と all を対象にし、例外は選択肢の outline: none だけ（fix round 1 Important 3）", () => {
  test("all: unset は落とす（outline のリセットを迂回できる）", () => {
    assert.ok(partMessagesOf(".ui-input { all: unset; }").some((m) => /outline/.test(m)));
  });
  test("option の outline でも値が none 以外なら落とす", () => {
    assert.ok(partMessagesOf(".ui-input option { outline: 3px solid var(--gold) }").some((m) => /outline/.test(m)));
  });
  test("option の outline-offset は例外に入らない（性質が outline 完全一致ではない）", () => {
    assert.ok(partMessagesOf(".ui-select option { outline-offset: 4px }").some((m) => /outline/.test(m)));
  });
});

describe("checkComponentCss: ownDeclarationsOf を使う（fix round 1 Important 4・変異検査で確かめる）", () => {
  test("規則を挟まない @media の中の outline と生の色を拾う", () => {
    const ms = partMessagesOf(".ui-a { @media (x) { outline: 0; color: #fff; } }");
    assert.ok(ms.some((m) => /outline/.test(m)));
    assert.ok(ms.some((m) => /生の色/.test(m)));
  });
  test("@media の中の規則（規則を挟む）はセレクタの先頭でちょうど 1 件落ちる", () => {
    const ms = partMessagesOf("@media (x) { select { color: var(--a); } }");
    assert.equal(ms.filter((m) => /\.ui- のクラス/.test(m)).length, 1);
  });
});

describe("findRawColors: エスケープを解いてから照合し、直後が ( の語は除く（fix round 1 Minor 5）", () => {
  test("wh\\69te はエスケープを解いて white と分かる", () => {
    assert.ok(findRawColors("wh\\69te").length > 0);
  });
  test("r\\67 b(0 0 0) はエスケープを解いて rgb( と分かる", () => {
    assert.ok(findRawColors("r\\67 b(0 0 0)").length > 0);
  });
  test("tan(45deg) は名前の色 tan と誤認しない", () => {
    assert.deepEqual(findRawColors("tan(45deg)"), []);
  });
});

describe("uiTokensIn: 語の終わりの境界（fix round 1 Minor 6）", () => {
  test("ui-inputX・ui-banner__title・ui-a_b は部品の使用として数えない", () => {
    assert.deepEqual([...uiTokensIn("ui-inputX ui-banner__title ui-a_b")], []);
  });
});

describe("checkScreenCss: 生の色（設計正本 D10 の 3・#320 PR 5）", () => {
  const rawOf = (css) => messagesOf(css).filter((m) => /生の色/.test(m));
  test("画面の CSS の生の色を落とす", () => {
    assert.equal(rawOf(".a { color: #fff; }").length, 1);
  });
  test("宣言ごとに数える（1 つの規則に 2 つなら 2 件）", () => {
    assert.equal(rawOf(".a { color: #fff; background: rgba(0, 0, 0, 0.2); }").length, 2);
  });
  test(":root のカスタムプロパティの値も落とす", () => {
    assert.equal(rawOf(":root { --presence: #16a34a; }").length, 1);
  });
  test("@media / @supports の中も落とす", () => {
    assert.equal(rawOf("@media (min-width: 1px) { .a { color: red; } }").length, 1);
    assert.equal(rawOf("@supports (color: color(display-p3 1 1 1)) { :root { --x: color(display-p3 0 1 0); } }").length, 1);
  });
  test("@keyframes の中の宣言も落とす（セレクタの判定は飛ばしたまま）", () => {
    assert.equal(rawOf("@keyframes k { from { color: #000; } 50% { opacity: 1; } }").length, 1);
  });
  test("一覧のセレクタでも宣言ごとに 1 件", () => {
    assert.equal(rawOf(".a, .b { color: #fff; }").length, 1);
  });
  test("大文字の関数・名前の色・var() の第 2 引数も落とす", () => {
    assert.equal(rawOf(".a { color: RGBA(0, 0, 0, 0.5); }").length, 1);
    assert.equal(rawOf(".a { color: White; }").length, 1);
    assert.equal(rawOf(".a { color: var(--x, #fff); }").length, 1);
  });
  test("トークン・transparent・currentColor・トークンの color-mix() は通す", () => {
    assert.deepEqual(
      rawOf(".a { color: var(--x); background: transparent; border-color: currentColor; box-shadow: 0 0 0 1px color-mix(in srgb, var(--x) 50%, transparent); }"),
      [],
    );
  });
  test("直前の ui-exempt: で外せる", () => {
    assert.deepEqual(messagesOf("/* ui-exempt: 計器の文字盤の色 */\n.a { color: #fff; }"), []);
  });
  test("@keyframes の段も直前の ui-exempt: で外せる", () => {
    assert.deepEqual(messagesOf("@keyframes k { /* ui-exempt: 光の明滅 */\n from { color: #fff; } }"), []);
  });
});

describe("mediaWidthViolations: 幅の境目は 40rem / 64rem / 90rem だけ（#316 D1）", () => {
  const ok = [
    ["(width >= 40rem)", "範囲構文"],
    ["(width < 64rem)", "未満"],
    ["(40rem <= width < 64rem)", "両側の範囲"],
    ["(width>=90rem)", "空白なし"],
    ["(WIDTH >= 40REM)", "大文字"],
    ["screen and (width >= 64rem)", "媒体の種類つき"],
    ["(hover: hover)", "幅ではない条件"],
    ["(prefers-reduced-motion: reduce)", "幅ではない条件"],
    ["(height >= 48rem)", "高さは対象外"],
    ["(min-height: 420px)", "高さの旧構文も対象外"],
    ["(orientation: landscape)", "向き"],
    ["((width >= 40rem) and (hover: hover))", "and の入れ子"],
  ];
  for (const [params, why] of ok) {
    test(`${why}: ${params} は通す`, () => assert.deepEqual(mediaWidthViolations(params), []));
  }
  const ng = [
    ["(max-width: 420px)", "旧構文と px"],
    ["(min-width: 40rem)", "旧構文は値が段でも落とす"],
    ["(max-width: 64rem)", "旧構文の max も"],
    ["(min-device-width: 40rem)", "device-width"],
    ["(width >= 48rem)", "段ではない rem"],
    ["(width >= 40em)", "em"],
    ["(width >= 640px)", "px"],
    ["(width >= calc(40rem))", "計算"],
    ["(width >= var(--x))", "変数"],
    ["(width >= 0)", "単位なし"],
    ["(width >= 40rem) and (width < 48rem)", "and の後ろ側"],
    ["not all and (max-width: 720px)", "not の中"],
    ["(40rem <= width < 48rem)", "範囲の片側だけが外れる"],
    ["(width >= calc((40rem)))", "二重括弧の計算"],
    ["(width >= calc(1px + (40rem)))", "計算の中の括弧"],
    ["not ((width < 48rem))", "条件の入れ子"],
    ["((width >= 48rem) or (hover: hover))", "or の入れ子"],
  ];
  for (const [params, why] of ng) {
    test(`${why}: ${params} は落とす`, () => assert.ok(mediaWidthViolations(params).length > 0));
  }
});

describe("legacyPageClassUses: 要素層の .page を TSX が使っていないか（#316 D2）", () => {
  const hits = [
    ['<main className="page">', "単独"],
    ['<main className="page landing">', "先頭"],
    ['<main className="x page">', "末尾"],
    ["<main className='page'>", "単引用符"],
    ['<main className={"page"}>', "波括弧の文字列"],
    ["<main className={`page ${x}`}>", "テンプレート文字列"],
    ['<main className = "page">', "= の前後の空白"],
  ];
  for (const [text, why] of hits) {
    test(`${why}: ${text} を拾う`, () => assert.equal(legacyPageClassUses(text).length, 1));
  }
  const misses = [
    ['<main className="ui-page">', "部品の器"],
    ['<div className="ui-page-header">', "部品の見出し"],
    ['<main className="topic-page">', "画面のクラス"],
    ['<main className="page-x">', "接頭辞"],
    ["<p>このページ page です</p>", "本文の語"],
  ];
  for (const [text, why] of misses) {
    test(`${why}: ${text} は拾わない`, () => assert.deepEqual(legacyPageClassUses(text), []));
  }
  test("2 行目の className=\"page\" は line: 2 を返す", () => {
    const r = legacyPageClassUses('<div>\n<main className="page">');
    assert.deepEqual(r, [{ value: "page", line: 2 }]);
  });
  test("同じ本文の 2 か所は 2 件で、行が別々", () => {
    const r = legacyPageClassUses('<main className="page">\n<p>x</p>\n<main className="page">');
    assert.deepEqual(r.map((x) => x.line), [1, 3]);
  });
});

describe("checkScreenCss: @media の幅の段（#316 D1）", () => {
  test("段ではない境目の @media を落とす", () => {
    assert.equal(messagesOf("@media (width >= 48rem) { .a { color: inherit; } }").length, 1);
  });
  test("直前の申告があれば通す", () => {
    assert.deepEqual(messagesOf("/* ui-exempt: #316 PR 3 で段へ寄せる */\n@media (width >= 48rem) { .a { color: inherit; } }"), []);
  });
  test("説明のコメントと @media の間に申告を書けば通す", () => {
    assert.deepEqual(messagesOf("/* 説明 */\n/* ui-exempt: 理由 */\n@media (max-width: 420px) { .a { color: inherit; } }"), []);
  });
  test("申告と @media の間に説明があれば、どちらも落とす", () => {
    const m = messagesOf("/* ui-exempt: 理由 */\n/* 説明 */\n@media (max-width: 420px) { .a { color: inherit; } }");
    assert.ok(m.some((x) => x.includes("幅")));
    assert.ok(m.some((x) => x.includes("何も免除していない")));
  });
  test("段の境目の @media は落とさない（申告も要らない）", () => {
    assert.deepEqual(messagesOf("@media (width >= 64rem) { .a { color: inherit; } }"), []);
  });
  test("規則の中に入れ子にした @media も見る", () => {
    assert.equal(messagesOf(".a { @media (width >= 48rem) { color: inherit; } }").length, 1);
  });
});

describe("checkScreenCss: 要素層の .page（#316 D2）", () => {
  test(".page のセレクタを落とす", () => {
    assert.equal(messagesOf(".page { margin: 0; }").length, 1);
  });
  test("子孫の位置の .page も落とす", () => {
    assert.equal(messagesOf("main .page > h1 { margin: 0; }").length, 1);
  });
  test(".ui-page と .topic-page は落とさない", () => {
    assert.deepEqual(messagesOf(".ui-page, .topic-page { margin: 0; }"), []);
  });
});

describe("checkComponentCss: @media の幅の段（#316 D1）", () => {
  const compMessages = (css) => checkComponentCss("packages/ui/src/components/x.css", css).map((p) => p.message);
  test("段ではない境目は申告があっても落とす", () => {
    assert.ok(compMessages("/* ui-exempt: x */\n@media (width >= 48rem) { .ui-x { color: inherit; } }").some((m) => m.includes("境目")));
  });
  test("段の境目は通す", () => {
    assert.deepEqual(compMessages("@media (width >= 90rem) { .ui-x { color: inherit; } }"), []);
  });
});
