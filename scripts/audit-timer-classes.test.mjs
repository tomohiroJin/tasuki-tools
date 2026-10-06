/**
 * `audit-timer-classes.mjs` の自己テスト（#321・設計正本 D1・D10）。
 *
 * **逃げ道の族を全部ここへ置く**: テンプレートの置換・連結・関数の呼び出し・`_CLASS` で終わらない表・
 * `.ts` の表・要素層や `ui-` と同名のクラス・借り物のキーフレーム。
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { checkTimerClasses, classUsagesIn, cssClassNames } from "./audit-timer-classes.mjs";

const messages = (text, file = "apps/timer-web/src/ui/X.tsx") => classUsagesIn(file, text).problems.map((p) => p.message);
const names = (text, file = "apps/timer-web/src/ui/X.tsx") => classUsagesIn(file, text).classes.map((c) => c.name);

describe("classUsagesIn: 許した書き方（設計正本 D1）", () => {
  const allowed = [
    ['<p className="a b" />', ["a", "b"], "文字列リテラル"],
    ["<p className={\"a\"} />", ["a"], "式の中の文字列リテラル"],
    ["<p className={`a b`} />", ["a", "b"], "置換の無いテンプレート"],
    ['<p className={on ? "a" : "b c"} />', ["a", "b", "c"], "字面の分岐"],
    ['<p className={on ? (x ? "a" : "b") : "c"} />', ["a", "b", "c"], "入れ子の分岐"],
    ['const TONE_CLASS = { online: "ok" } as const; <p className={TONE_CLASS[kind]} />', ["ok"], "_CLASS の表を引く"],
    ['const TONE_CLASS = { online: "ok" }; <p className={TONE_CLASS.online} />', ["ok"], "_CLASS の表のプロパティ"],
    ['export const TONE_CLASS: Record<string, string> = { online: "ok" }; <p className={TONE_CLASS[k]} />', ["ok"], "型注釈つきで export した _CLASS の表"],
    ["<p className={className} />", [], "部品の受け渡し"],
    ["<p className={`card ${className}`} />", ["card"], "部品の受け渡しと字面の組み合わせ"],
    ['const TONE_CLASS = { online: "ok", lost: "ng x" } as const;', ["ok", "ng", "x"], "_CLASS の表の値"],
    ['const p = { className: "a b" };', ["a", "b"], "オブジェクトの className キーに字面"],
    ['<p {...{ className: on ? "a" : "b" }} />', ["a", "b"], "スプレッドの className キーに字面の分岐"],
    ['createElement("p", { "className": "a" });', ["a"], "createElement の props の className（文字列のキー）"],
    ["function Card({ className }) { return <div className={className} />; }", [], "引数の分割代入の className"],
    ['function Card({ className = "a" }) { return <div className={className} />; }', ["a"], "引数の分割代入の既定値は字面"],
    ['function Card({ className, ...rest }) { return <div className={`a ${className}`} {...rest} />; }', ["a"], "引数の分割代入の className と残余"],
    ['function Card({ "className": className }) { return <div className={className} />; }', [], "プロパティ名も className の別名なしの分割代入"],
    ['export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <div className={`a ${className}`} />; }', ["a"], "primitives.tsx の Card の形"],
    ['export function GhostButton({ children, className = "", ...rest }: BtnProps) { return <button className={`b ${className}`} {...rest} />; }', ["b"], "primitives.tsx のボタンの形"],
    ['export function Markdown({ source, className = "", headingBase = 3 }: MarkdownProps) { return <div className={`c ${className}`} />; }', ["c"], "Markdown.tsx の形"],
    ["const Card = function ({ className }) { return <div className={className} />; };", [], "関数式の最初の引数の分割代入"],
    ["const Card = ({ className }) => <div {...{ className }} />;", [], "省略記法の className キー"],
    ['import { TONE_CLASS } from "./tone"; <p className={TONE_CLASS[k]} />', [], "import した _CLASS の表（宣言した側は checkTimerClasses が見る）"],
  ];
  for (const [src, expected, why] of allowed) {
    test(`${why}: ${src}`, () => {
      assert.deepEqual(messages(src), []);
      assert.deepEqual(names(src).sort(), [...expected].sort());
    });
  }
});

describe("classUsagesIn: 許さない書き方", () => {
  const rejected = [
    ["<p className={`a ${tone}`} />", "className 以外の置換"],
    ['<p className={"a " + tone} />', "連結"],
    ["<p className={cls(tone)} />", "関数の呼び出し"],
    ["<p className={tone} />", "className 以外の変数"],
    ["<p className={TONE[kind]} />", "_CLASS で終わらない表"],
    ['<p className={on && "a"} />', "論理式"],
    ['const TONE_CLASS = { online: `a ${x}` } as const;', "_CLASS の表の値に置換"],
    ["const TONE_CLASS = { online: pick() } as const;", "_CLASS の表の値に呼び出し"],
    ["const p = { className: tone };", "オブジェクトの className キーに変数"],
    ["<p {...{ className: `a ${tone}` }} />", "スプレッドの className キーに置換"],
    ['createElement("p", { className: cls(x) });', "createElement の props の className に呼び出し"],
    ["const className = tone; <p className={className} />", "className という名前のローカル変数"],
    ["let className = tone;", "let の className"],
    ["function Card(className) { return <div className={className} />; }", "素の引数の className"],
    ['["px-3", tone].map((className) => <p className={className} />);', "map のコールバックの className"],
    ["const Card = ({ cls: className }) => <p className={className} />;", "別名の分割代入の className"],
    ["const Card = (props, { className }) => <p className={className} />;", "2 番目の引数の分割代入の className"],
    ["const Card = ({ a: { className } }) => <p className={className} />;", "入れ子の分割代入の className"],
    ["const Card = ([className]) => <p className={className} />;", "配列の分割代入の className"],
    ["function Card({ className }) { className = tone; return <p className={className} />; }", "引数の className への再代入"],
    ["function Card({ className }) { className += tone; return <p className={className} />; }", "className への複合代入 +="],
    ["function Card({ className }) { className ||= tone; return <p className={className} />; }", "className への ||="],
    ["function Card({ className }) { className ??= tone; return <p className={className} />; }", "className への ??="],
    ["function Card({ className }) { ({ className } = props); return <p className={className} />; }", "オブジェクトの分割代入で className へ再代入"],
    ["function Card({ className }) { ({ a: className } = props); return <p className={className} />; }", "別名のオブジェクトの分割代入で className へ再代入"],
    ["function Card({ className }) { [className] = [tone]; return <p className={className} />; }", "配列の分割代入で className へ再代入"],
    ["function Card({ className }) { [className = tone] = []; return <p className={className} />; }", "既定値つきの配列の分割代入で className へ再代入"],
    ["function Card({ className }) { for (className of xs) {} return <p className={className} />; }", "for…of の左辺の className"],
    ["function Card({ className }) { className++; return <p className={className} />; }", "className の後置 ++"],
    ["function Card({ className }) { --className; return <p className={className} />; }", "className の前置 --"],
    ['const TONE_CLASS = { online: "ok" }; TONE_CLASS.online = tone;', "_CLASS の表のプロパティへの書き込み"],
    ['const TONE_CLASS = { online: "ok" }; TONE_CLASS["online"] = tone;', "_CLASS の表の要素への書き込み"],
    ['const TONE_CLASS = { online: "ok" }; TONE_CLASS.online += tone;', "_CLASS の表のプロパティへの複合代入"],
    ['const TONE_CLASS = { online: "ok" }; ({ x: TONE_CLASS.online } = props);', "分割代入で _CLASS の表のプロパティへ書き込む"],
    ['const TONE_CLASS = { n: "ok" }; TONE_CLASS.n++;', "_CLASS の表のプロパティの ++"],
    ["const { className } = props; <p className={className} />", "本文での className の分割代入"],
    ["function Card({ className = tone }) { return <div className={className} />; }", "引数の既定値に変数"],
    ["<p className={TONE_CLASS[kind]} />", "宣言の無い _CLASS の表"],
    ['let TONE_CLASS = { online: "ok" }; <p className={TONE_CLASS[k]} />', "let で作る _CLASS の表"],
    ['const { TONE_CLASS } = tables; <p className={TONE_CLASS[k]} />', "分割代入で作る _CLASS の表"],
    ["function f(TONE_CLASS) { return <p className={TONE_CLASS[k]} />; }", "引数の _CLASS の表"],
    ["import TONE_CLASS from \"./tone\"; <p className={TONE_CLASS[k]} />", "既定の import の _CLASS の表"],
    ["import * as TONE_CLASS from \"./tone\"; <p className={TONE_CLASS.a} />", "名前空間の import の _CLASS の表"],
    ['import { className } from "./x"; <p className={className} />', "import した className"],
    ['import { cls as className } from "./x"; <p className={className} />', "別名で import した className"],
    ['import className from "./x"; <p className={className} />', "既定の import の className"],
    ['import * as className from "./x"; <p className={className} />', "名前空間の import の className"],
    ["function className() { return tone; } <p className={className} />", "className という名前の関数の宣言"],
    ["const f = function className() { return tone; };", "className という名前の関数式"],
    ["class className {}", "className という名前のクラスの宣言"],
  ];
  for (const [src, why] of rejected) {
    test(`${why}: ${src}`, () => {
      assert.equal(messages(src).length, 1, `${why} を見逃した`);
    });
  }
  test("_CLASS の表への再代入は落とす（宣言の値とは別に 1 件）", () => {
    assert.deepEqual(
      messages('const TONE_CLASS = { a: "x" }; TONE_CLASS = other;').filter((m) => m.includes("への書き込み")).length,
      1,
    );
  });
  test(".ts の _CLASS の表も見る", () => {
    assert.equal(messages('const A_CLASS = { x: `a ${y}` } as const;', "apps/timer-web/src/ui/presence.ts").length, 1);
  });
});

describe("cssClassNames: timer の CSS が定義するクラス名", () => {
  test("子孫・擬似クラス・@media の中・エスケープを拾う", () => {
    const css = ".a .b:hover{} @media (width>=40rem){.c{}} .px-1\\.5{} @keyframes k{50%{opacity:.5}}";
    assert.deepEqual([...cssClassNames(css)].sort(), ["a", "b", "c", "px-1.5"]);
  });
});

const base = {
  sources: [],
  timerCss: [{ rel: "apps/timer-web/src/styles/base.css", text: ".tabular{}" }],
  componentCss: [{ rel: "packages/ui/src/components/panel.css", text: ".ui-panel{}" }],
  elementCss: [{ rel: "packages/ui/src/elements/card.css", text: ".card{}" }],
};

describe("checkTimerClasses: 定義・衝突（設計正本 D10）", () => {
  test("対照: 定義済みのクラスと部品のクラスだけなら 0 件", () => {
    const sources = [{ rel: "apps/timer-web/src/ui/A.tsx", text: '<p className="tabular ui-panel" />' }];
    assert.deepEqual(checkTimerClasses({ ...base, sources }), []);
  });
  test("timer の CSS にも部品層にも定義の無いクラス（Tailwind のユーティリティの字面など）が残っていたら落とす", () => {
    const sources = [{ rel: "apps/timer-web/src/ui/A.tsx", text: '<p className="tabular px-3" />' }];
    assert.equal(checkTimerClasses({ ...base, sources }).length, 1);
  });
  test("timer の CSS が要素層と同名のクラスを定義したら落とす", () => {
    const timerCss = [{ rel: "apps/timer-web/src/styles/x.css", text: ".card{}" }];
    assert.equal(checkTimerClasses({ ...base, timerCss }).length, 1);
  });
  test("対照: `--timer-never-defined` を参照するだけの CSS（var の代替値）は 0 件", () => {
    const timerCss = [{ rel: "apps/timer-web/src/styles/x.css", text: ".tabular{} .x{line-height:var(--timer-never-defined, calc(1 / 0.75))}" }];
    assert.deepEqual(checkTimerClasses({ ...base, timerCss }), []);
  });
  test("`--timer-never-defined` を宣言したら落とす（timer の CSS・部品層・要素層のどこでも）", () => {
    const decl = ":root{--timer-never-defined:1.5}";
    for (const key of ["timerCss", "componentCss", "elementCss"]) {
      const files = [...base[key], { rel: "x/y.css", text: decl }];
      const problems = checkTimerClasses({ ...base, [key]: files });
      assert.equal(problems.length, 1, key);
      assert.match(problems[0], /timer-never-defined/);
    }
  });
  test("`--timer-never-defined` を @property で登録したら落とす（initial-value が代替値より勝つ）", () => {
    const reg = "@property --timer-never-defined { syntax: '<number>'; inherits: false; initial-value: 1.5; }";
    for (const key of ["timerCss", "componentCss", "elementCss"]) {
      const files = [...base[key], { rel: "x/y.css", text: reg }];
      const problems = checkTimerClasses({ ...base, [key]: files });
      assert.equal(problems.length, 1, key);
      assert.match(problems[0], /timer-never-defined/);
    }
  });
  test("`@PROPERTY`（大文字）で登録しても落とす（at-rule の名前は大文字小文字を区別しない）", () => {
    const reg = "@PROPERTY --timer-never-defined { syntax: '<number>'; inherits: false; initial-value: 1.5; }";
    const problems = checkTimerClasses({ ...base, timerCss: [...base.timerCss, { rel: "x/y.css", text: reg }] });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /timer-never-defined/);
  });
  test("対照: timer の CSS が @keyframes を持つなら 0 件（animation-name・短縮形とも）", () => {
    const timerCss = [...base.timerCss, { rel: "apps/timer-web/src/styles/l.css", text: "@keyframes spin{to{opacity:1}} .a{animation-name: spin, none} .b{animation: 1s ease-in spin both; animation: inherit}" }];
    assert.deepEqual(checkTimerClasses({ ...base, timerCss }), []);
  });
  test("借りたキーフレームの出どころがどこにも無ければ落とす（短縮形の名前を取り出す）", () => {
    const timerCss = [...base.timerCss, { rel: "apps/timer-web/src/styles/l.css", text: ".l{animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite}" }];
    const problems = checkTimerClasses({ ...base, timerCss });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /借り物のキーフレームの出どころが消えた: pulse/);
  });
  test("借り物のキーフレームの出どころ: .tsx に animate-pulse の字面があっても、timer の CSS が @keyframes pulse を定義していなければ落とす", () => {
    const timerCss = [...base.timerCss, { rel: "apps/timer-web/src/styles/l.css", text: ".l{animation-name: pulse}" }];
    const sources = [{ rel: "apps/timer-web/src/ui/S.tsx", text: '<p className="tabular animate-pulse" />' }];
    const problems = checkTimerClasses({ ...base, timerCss, sources });
    const kf = problems.filter((p) => /\[キーフレーム\]/.test(p));
    assert.equal(kf.length, 1, problems.join("\n"));
    assert.match(kf[0], /借り物のキーフレームの出どころが消えた: pulse/);
  });
  test("timer の CSS が部品層の接頭辞 ui- のクラスを定義したら落とす（部品の定義し直し）", () => {
    const timerCss = [{ rel: "apps/timer-web/src/styles/x.css", text: ".tabular{} .ui-panel{}" }];
    const problems = checkTimerClasses({ ...base, timerCss });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /ui-panel/);
  });
  test("timer の CSS が部品層に無い ui- のクラスを定義しても落とす（接頭辞は部品層のもの）", () => {
    const timerCss = [{ rel: "apps/timer-web/src/styles/x.css", text: ".tabular{} .ui-new{}" }];
    assert.equal(checkTimerClasses({ ...base, timerCss }).length, 1);
  });
  test("対照: ui- を語中に含むだけのクラスは落とさない", () => {
    const timerCss = [{ rel: "apps/timer-web/src/styles/x.css", text: ".tabular{} .gui-x{}" }];
    assert.deepEqual(checkTimerClasses({ ...base, timerCss }), []);
  });
});

describe("checkTimerClasses: import した _CLASS の表", () => {
  const tone = { rel: "apps/timer-web/src/ui/tone.ts", text: 'export const TONE_CLASS = { a: "tabular" } as const;' };
  const user = (spec = "./tone") => ({ rel: "apps/timer-web/src/ui/A.tsx", text: `import { TONE_CLASS } from "${spec}"; <p className={TONE_CLASS[k]} />` });
  test("対照: timer のファイルが const で宣言した表は許す", () => {
    assert.deepEqual(checkTimerClasses({ ...base, sources: [tone, user()] }), []);
  });
  test("拡張子つきの指定子でも同じ", () => {
    assert.deepEqual(checkTimerClasses({ ...base, sources: [tone, user("./tone.ts")] }), []);
  });
  test("timer の外（パッケージ）から import した表は落とす", () => {
    const sources = [tone, { rel: "apps/timer-web/src/ui/A.tsx", text: 'import { TONE_CLASS } from "@tasuki/ui"; <p className={TONE_CLASS[k]} />' }];
    assert.equal(checkTimerClasses({ ...base, sources }).length, 1);
  });
  test("宣言した側にその名前の const の表が無ければ落とす（別名の import を含む）", () => {
    const other = { rel: "apps/timer-web/src/ui/tone.ts", text: 'export const TONE = { a: "tabular" };' };
    const aliased = { rel: "apps/timer-web/src/ui/A.tsx", text: 'import { TONE as TONE_CLASS } from "./tone"; <p className={TONE_CLASS[k]} />' };
    assert.equal(checkTimerClasses({ ...base, sources: [other, aliased] }).length, 1);
  });
});
