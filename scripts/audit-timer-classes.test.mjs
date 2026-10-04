/**
 * `audit-timer-classes.mjs` の自己テスト（#321・設計正本 D1・D10）。
 *
 * **逃げ道の族を全部ここへ置く**: テンプレートの置換・連結・関数の呼び出し・`_CLASS` で終わらない表・
 * `.ts` の表・一覧に残ったまま移したファイル・Tailwind と同名のクラス。
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { checkTimerClasses, classUsagesIn, cssClassNames, loadTailwindDetector } from "./audit-timer-classes.mjs";

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
  timerCss: [{ rel: "apps/timer-web/src/styles/base.css", text: ".tabular{} .sr-only{}" }],
  componentCss: [{ rel: "packages/ui/src/components/panel.css", text: ".ui-panel{}" }],
  elementCss: [{ rel: "packages/ui/src/elements/card.css", text: ".card{}" }],
  unmigrated: [],
  collisions: new Map([["sr-only", "理由"]]),
  isTailwindUtility: (n) => ["sr-only", "container", "px-3"].includes(n),
};

describe("checkTimerClasses: 定義・一覧・衝突（設計正本 D10）", () => {
  test("対照: 定義済みのクラスと部品のクラスだけなら 0 件", () => {
    const sources = [{ rel: "apps/timer-web/src/ui/A.tsx", text: '<p className="tabular ui-panel" />' }];
    assert.deepEqual(checkTimerClasses({ ...base, sources }), []);
  });
  test("移したファイルに Tailwind のクラスが残っていたら落とす", () => {
    const sources = [{ rel: "apps/timer-web/src/ui/A.tsx", text: '<p className="tabular px-3" />' }];
    assert.equal(checkTimerClasses({ ...base, sources }).length, 1);
  });
  test("一覧に載ったファイルは書き方も定義も見ない", () => {
    const sources = [{ rel: "apps/timer-web/src/ui/A.tsx", text: "<p className={cls(x)} />" }];
    assert.deepEqual(checkTimerClasses({ ...base, sources, unmigrated: ["apps/timer-web/src/ui/A.tsx"] }), []);
  });
  test("一覧に載っているのにクラス名を 1 つも書いていないファイルは落とす（古い一覧）", () => {
    const sources = [{ rel: "apps/timer-web/src/ui/A.tsx", text: "export const x = 1;" }];
    assert.equal(checkTimerClasses({ ...base, sources, unmigrated: ["apps/timer-web/src/ui/A.tsx"] }).length, 1);
  });
  test("一覧に載った、関数でクラス名を返すファイル（presence.ts の形）は古いと判定しない", () => {
    const rel = "apps/timer-web/src/ui/presence.ts";
    const text = 'export function presenceDotClass(p) { return { online: "bg-presence-online" }[p]; }';
    assert.deepEqual(checkTimerClasses({ ...base, sources: [{ rel, text }], unmigrated: [rel] }), []);
  });
  test("一覧に載った、className も _CLASS も Class の字面も無いファイルは古いと判定する", () => {
    const rel = "apps/timer-web/src/ui/presence.ts";
    const text = 'export function presenceDot(p) { return { online: "bg-presence-online" }[p]; }';
    assert.equal(checkTimerClasses({ ...base, sources: [{ rel, text }], unmigrated: [rel] }).length, 1);
  });
  test("一覧に載っていても、外して通るなら（字面のクラス名が全部定義済み）古いと判定する", () => {
    const rel = "apps/timer-web/src/ui/A.tsx";
    const sources = [{ rel, text: '<p className="tabular ui-panel" />' }];
    const problems = checkTimerClasses({ ...base, sources, unmigrated: [rel] });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /外しても検査を通ります/);
  });
  test("一覧に載っていて、部品の受け渡しだけのファイルも古いと判定する", () => {
    const rel = "apps/timer-web/src/ui/A.tsx";
    const sources = [{ rel, text: "export const A = ({ className }) => <p className={className} />;" }];
    assert.equal(checkTimerClasses({ ...base, sources, unmigrated: [rel] }).length, 1);
  });
  test("一覧に載っていて、Tailwind のクラスが 1 つ残っているファイルは古いと判定しない", () => {
    const rel = "apps/timer-web/src/ui/A.tsx";
    const sources = [{ rel, text: '<p className="tabular px-3" />' }];
    assert.deepEqual(checkTimerClasses({ ...base, sources, unmigrated: [rel] }), []);
  });
  test("一覧に載っていて、書き方の違反が残っているファイルは古いと判定しない", () => {
    const rel = "apps/timer-web/src/ui/A.tsx";
    const sources = [{ rel, text: '<p className={"tabular " + x} />' }];
    assert.deepEqual(checkTimerClasses({ ...base, sources, unmigrated: [rel] }), []);
  });
  test("一覧に実在しないファイルがあれば落とす", () => {
    assert.equal(checkTimerClasses({ ...base, unmigrated: ["apps/timer-web/src/ui/Gone.tsx"] }).length, 1);
  });
  test("timer の CSS が Tailwind と同名のクラスを定義したら落とす（理由つきの例外を除く）", () => {
    const timerCss = [{ rel: "apps/timer-web/src/styles/x.css", text: ".container{} .sr-only{}" }];
    const problems = checkTimerClasses({ ...base, timerCss });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /container/);
  });
  test("timer の CSS が要素層と同名のクラスを定義したら落とす", () => {
    const timerCss = [{ rel: "apps/timer-web/src/styles/x.css", text: ".card{} .sr-only{}" }];
    assert.equal(checkTimerClasses({ ...base, timerCss }).length, 1);
  });
  test("対照: `--timer-never-defined` を参照するだけの CSS（var の代替値）は 0 件", () => {
    const timerCss = [{ rel: "apps/timer-web/src/styles/x.css", text: ".tabular{} .sr-only{} .x{line-height:var(--timer-never-defined, calc(1 / 0.75))}" }];
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
  test("timer の CSS が部品層の接頭辞 ui- のクラスを定義したら落とす（部品の定義し直し）", () => {
    const timerCss = [{ rel: "apps/timer-web/src/styles/x.css", text: ".tabular{} .sr-only{} .ui-panel{}" }];
    const problems = checkTimerClasses({ ...base, timerCss });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /ui-panel/);
  });
  test("timer の CSS が部品層に無い ui- のクラスを定義しても落とす（接頭辞は部品層のもの）", () => {
    const timerCss = [{ rel: "apps/timer-web/src/styles/x.css", text: ".tabular{} .sr-only{} .ui-new{}" }];
    assert.equal(checkTimerClasses({ ...base, timerCss }).length, 1);
  });
  test("対照: ui- を語中に含むだけのクラスは落とさない", () => {
    const timerCss = [{ rel: "apps/timer-web/src/styles/x.css", text: ".tabular{} .sr-only{} .gui-x{}" }];
    assert.deepEqual(checkTimerClasses({ ...base, timerCss }), []);
  });
  test("使われていない衝突の例外は落とす", () => {
    const timerCss = [{ rel: "apps/timer-web/src/styles/x.css", text: ".tabular{}" }];
    assert.equal(checkTimerClasses({ ...base, timerCss }).length, 1);
  });
});

describe("checkTimerClasses: import した _CLASS の表", () => {
  const tone = { rel: "apps/timer-web/src/ui/tone.ts", text: 'export const TONE_CLASS = { a: "tabular" } as const;' };
  const user = (spec = "./tone") => ({ rel: "apps/timer-web/src/ui/A.tsx", text: `import { TONE_CLASS } from "${spec}"; <p className={TONE_CLASS[k]} />` });
  test("対照: 一覧に無い timer のファイルが const で宣言した表は許す", () => {
    assert.deepEqual(checkTimerClasses({ ...base, sources: [tone, user()] }), []);
  });
  test("拡張子つきの指定子でも同じ", () => {
    assert.deepEqual(checkTimerClasses({ ...base, sources: [tone, user("./tone.ts")] }), []);
  });
  test("宣言した側が一覧に載っていたら落とす（値を検査していない）", () => {
    const problems = checkTimerClasses({ ...base, sources: [tone, user()], unmigrated: [tone.rel] });
    assert.equal(problems.filter((p) => p.includes("TONE_CLASS")).length, 1);
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

describe("loadTailwindDetector: timer の Tailwind と同じテーマで判定する（結合・apps/timer-web の tailwindcss を読む）", () => {
  test("timer の tailwind.config.js で足したユーティリティを Tailwind と判定する", async () => {
    const isTailwind = await loadTailwindDetector();
    // Given/When/Then: 設定で足した色・既定のユーティリティは真、timer 独自の名前は偽
    assert.equal(isTailwind("bg-presence-online"), true, "設定の colors で足したユーティリティを見逃した");
    assert.equal(isTailwind("text-presence-idle"), true);
    assert.equal(isTailwind("container"), true);
    assert.equal(isTailwind("tabular"), false);
  });
  test("出力が累積しても、前に判定した名前の字面に引きずられない", async () => {
    const isTailwind = await loadTailwindDetector();
    // Given: 先に hover:underline を判定する（出力に `.hover\:underline` が残る）
    assert.equal(isTailwind("hover:underline"), true);
    // When/Then: hover は単独ではユーティリティではない
    assert.equal(isTailwind("hover"), false);
    assert.equal(isTailwind("px-3"), true);
    assert.equal(isTailwind("px"), false);
  });
});
