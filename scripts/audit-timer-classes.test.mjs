/**
 * `audit-timer-classes.mjs` の自己テスト（#321・設計正本 D1・D10）。
 *
 * **逃げ道の族を全部ここへ置く**: テンプレートの置換・連結・関数の呼び出し・`_CLASS` で終わらない表・
 * `.ts` の表・一覧に残ったまま移したファイル・Tailwind と同名のクラス。
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
    ["<p className={TONE_CLASS[kind]} />", [], "_CLASS の表を引く"],
    ["<p className={TONE_CLASS.online} />", [], "_CLASS の表のプロパティ"],
    ["<p className={className} />", [], "部品の受け渡し"],
    ["<p className={`card ${className}`} />", ["card"], "部品の受け渡しと字面の組み合わせ"],
    ['const TONE_CLASS = { online: "ok", lost: "ng x" } as const;', ["ok", "ng", "x"], "_CLASS の表の値"],
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
  ];
  for (const [src, why] of rejected) {
    test(`${why}: ${src}`, () => {
      assert.equal(messages(src).length, 1, `${why} を見逃した`);
    });
  }
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
  test("使われていない衝突の例外は落とす", () => {
    const timerCss = [{ rel: "apps/timer-web/src/styles/x.css", text: ".tabular{}" }];
    assert.equal(checkTimerClasses({ ...base, timerCss }).length, 1);
  });
});
