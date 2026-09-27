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
  checkScreenCss,
  classifyStyleFiles,
  touchesFieldElement,
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

describe("classifyStyleFiles: 走査対象の仕分け", () => {
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
