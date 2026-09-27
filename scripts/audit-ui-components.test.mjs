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
    assert.equal(messagesOf("@media (min-width: 1px) { select { color: var(--x); } }").length, 1);
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
    assert.equal(messagesOf("/* ui-exempt: r */\nselect { &:hover { color: red } }").length, 1);
  });
  test("親が入力欄なら、親自身と解決済みの子の両方が落ちる（ちょうど 2 件）", () => {
    assert.equal(messagesOf("select { &:hover { color: red } }").length, 2);
  });
  test("@scope の開始引数が入力欄の型に当たれば、中の規則を落とす", () => {
    assert.equal(messagesOf("@scope (select) { :scope { color: red } }").length, 1);
  });
  test("@scope の終了引数（to）が入力欄の型に当たれば、中の規則を落とす", () => {
    assert.equal(messagesOf("@scope (.x) to (input) { .y { color: red } }").length, 1);
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
