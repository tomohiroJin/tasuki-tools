/**
 * お題バンク・バリデーション・プロンプト生成
 * T023: FR-021, FR-022, FR-023, FR-024
 */

import { ok, err, type Result } from "neverthrow";
import * as v from "valibot";
import { ProblemSchema } from "./schemas.js";
import type { Problem, ProblemSource } from "./aggregate.js";

/** ソース付きお題 */
export interface ProblemWithSource {
  problem: Problem;
  source: ProblemSource;
}

/** 定型お題エントリ */
export interface FallbackProblemEntry {
  problem: Problem;
  languages: string[];
  difficulty: string;
}

// ─── 定型お題バンク ──────────────────────────────────────────────────────────

/** どの言語でも解ける汎用お題に付ける言語タグ。 */
const ALL_LANGS = [
  "TypeScript", "JavaScript", "Python", "Java", "Go", "Ruby", "Rust", "C#", "Kotlin", "Swift",
];

export const FALLBACK_PROBLEMS: FallbackProblemEntry[] = [
  {
    problem: {
      title: "FizzBuzz",
      description: `## 背景

TDD の入門として定番のお題です。条件分岐とループ、そして「テストを先に書く」感覚を身につけるのに最適です。

整数 \`n\` を受け取り、その数に応じた文字列を返す関数 \`fizzBuzz(n)\` を実装します。1 から N まで順に処理することもできます。

## ルール

- 3 で割り切れる数は \`Fizz\`
- 5 で割り切れる数は \`Buzz\`
- 3 でも 5 でも割り切れる数（15 の倍数）は \`FizzBuzz\`
- それ以外はその数値そのものを文字列で返す

## 例

- \`fizzBuzz(1)\` → \`"1"\`
- \`fizzBuzz(3)\` → \`"Fizz"\`
- \`fizzBuzz(5)\` → \`"Buzz"\`
- \`fizzBuzz(15)\` → \`"FizzBuzz"\`

## 考慮すること

15 の倍数の判定を先に書かないと、Fizz か Buzz だけが返ってしまいます。条件の順序に注意してください。`,
      requirements: [
        "1 から N までループする",
        "3の倍数のとき 'Fizz' を返す",
        "5の倍数のとき 'Buzz' を返す",
        "15の倍数のとき 'FizzBuzz' を返す",
        "それ以外はその数値を文字列で返す",
      ],
      exampleTest: `test('FizzBuzz(15) は FizzBuzz', () => {
  expect(fizzBuzz(15)).toBe('FizzBuzz');
});`,
      hints: ["15の倍数を先にチェックする", "% 演算子を使う"],
    },
    languages: ["TypeScript", "JavaScript", "Python", "Java", "Go", "Ruby", "Rust", "C#", "Kotlin", "Swift"],
    difficulty: "easy",
  },
  {
    problem: {
      title: "回文チェッカー",
      description: `## 背景

文字列の前処理（正規化）と、両端から中央へ向かう走査を練習するお題です。

文字列 \`s\` を受け取り、それが回文（前から読んでも後ろから読んでも同じ）かどうかを判定する \`isPalindrome(s)\` を実装します。

## ルール

- 英数字以外（記号・空白）は無視する
- 大文字小文字は区別しない
- 空文字列・単一文字は回文とみなす

## 例

- \`isPalindrome("A man, a plan, a canal: Panama")\` → \`true\`
- \`isPalindrome("race a car")\` → \`false\`
- \`isPalindrome("")\` → \`true\`

## 考慮すること

まず英数字だけを抽出して小文字化し、その上で逆順と比較するか、左右のポインタで突き合わせます。`,
      requirements: [
        "英数字以外の文字は無視する",
        "大文字小文字を区別しない",
        "空文字列は回文とする",
        "単一文字は回文とする",
      ],
      exampleTest: `test('"A man, a plan, a canal: Panama" は回文', () => {
  expect(isPalindrome('A man, a plan, a canal: Panama')).toBe(true);
});`,
      hints: ["正規表現でフィルタリング", "reverse() と比較"],
    },
    languages: ["TypeScript", "JavaScript", "Python", "Java", "Go", "Ruby", "Rust", "C#", "Kotlin", "Swift"],
    difficulty: "easy",
  },
  {
    problem: {
      title: "ローマ数字変換",
      description: `## 背景

「対応表を大きい順に貪欲に消費する」というアルゴリズムの典型例です。減算則の扱いがポイントになります。

整数 \`n\`（1〜3999）を受け取り、ローマ数字の文字列に変換する \`toRoman(n)\` を実装します。

## 使う記号

- \`I\`=1, \`V\`=5, \`X\`=10, \`L\`=50, \`C\`=100, \`D\`=500, \`M\`=1000

## 減算則

- \`IV\`=4, \`IX\`=9, \`XL\`=40, \`XC\`=90, \`CD\`=400, \`CM\`=900

## 例

- \`toRoman(4)\` → \`"IV"\`
- \`toRoman(9)\` → \`"IX"\`
- \`toRoman(58)\` → \`"LVIII"\`
- \`toRoman(1994)\` → \`"MCMXCIV"\`

## 考慮すること

減算則の値（4, 9, 40, ...）も対応表に含めて値の大きい順に並べておくと、ループ 1 つで素直に書けます。`,
      requirements: [
        "1〜3999 の範囲を処理する",
        "I, V, X, L, C, D, M の 7 種類を使う",
        "減算則（IV = 4, IX = 9, XL = 40, XC = 90, CD = 400, CM = 900）に対応する",
      ],
      exampleTest: `test('4 は IV', () => {
  expect(toRoman(4)).toBe('IV');
});
test('1994 は MCMXCIV', () => {
  expect(toRoman(1994)).toBe('MCMXCIV');
});`,
      hints: ["対応表を配列で持つ", "大きい値から順に引いていく"],
    },
    languages: ["TypeScript", "JavaScript", "Python", "Java", "Go", "Ruby", "Rust", "C#", "Kotlin", "Swift"],
    difficulty: "medium",
  },
  {
    problem: {
      title: "銀行口座",
      description: `## 背景

状態を持つクラスの設計と、不変条件（残高は負にならない）の守り方を練習するお題です。例外処理の TDD にも向いています。

入金・出金・残高照会ができる \`BankAccount\` クラスを実装します。

## 振る舞い

- \`deposit(amount)\`: 入金する。金額は正の数のみ許可
- \`withdraw(amount)\`: 出金する。残高を超える出金は拒否
- \`balance\`: 現在の残高を返す
- 取引履歴を記録できるようにする

## 例

\`\`\`
const account = new BankAccount();
account.deposit(100);   // balance = 100
account.withdraw(30);   // balance = 70
\`\`\`

## 考慮すること

- 不正な入金・出金（負の額、残高超過）は例外で表現する
- 不変条件「残高 >= 0」を常に保つ`,
      requirements: [
        "入金は正の金額のみ許可する",
        "出金は残高を超えてはいけない",
        "取引履歴を管理する",
        "残高照会が正しい値を返す",
      ],
      exampleTest: `test('入金後の残高が正しい', () => {
  const account = new BankAccount();
  account.deposit(100);
  expect(account.balance).toBe(100);
});`,
      hints: ["不変式（残高 >= 0）を守る", "エラーは例外で表現"],
    },
    languages: ["TypeScript", "JavaScript", "Python", "Java", "Go", "Ruby", "Rust", "C#", "Kotlin", "Swift"],
    difficulty: "easy",
  },
  {
    problem: {
      title: "テニスゲームスコア",
      description: `## 背景

ルールが複雑に絡み合うドメインを、場合分けで整理する練習です。状態遷移を小さなテストで詰めていく典型的なお題です。

両プレイヤーの獲得ポイント数を受け取り、テニスの「ゲーム内スコア」表示を返す \`score(p1, p2)\` を実装します。

## ルール

- 0/1/2/3 点はそれぞれ \`Love\`/\`15\`/\`30\`/\`40\`
- 両者 3 点（40-40）は \`Deuce\`
- デュース以降、片方が 1 点リードすると \`Advantage\`
- リード側がさらに得点するとゲーム終了

## 例

- \`score(0, 0)\` → \`"Love-All"\`
- \`score(1, 0)\` → \`"15-Love"\`
- \`score(3, 3)\` → \`"Deuce"\`

## 考慮すること

両者が同点のときと差があるときで表示が変わります。対称性を意識すると分岐が減らせます。`,
      requirements: [
        "0〜3 点を Love/15/30/40 で表示",
        "両者 40 点はデュース",
        "デュース後のリードはアドバンテージ",
        "アドバンテージから得点でゲーム終了",
      ],
      exampleTest: `test('0-0 は Love-All', () => {
  expect(score(0, 0)).toBe('Love-All');
});
test('3-3 はDeuce', () => {
  expect(score(3, 3)).toBe('Deuce');
});`,
      hints: ["状態で場合分け", "対称性を活用"],
    },
    languages: ["TypeScript", "JavaScript", "Python", "Java", "Go", "Ruby", "Rust", "C#", "Kotlin", "Swift"],
    difficulty: "medium",
  },
  {
    problem: {
      title: "行列の回転",
      description: `## 背景

二次元配列のインデックス操作を整理する練習です。座標変換のイメージを掴むのに役立ちます。

\`N×N\` の整数行列を時計回りに 90 度回転させた新しい行列を返す \`rotate(matrix)\` を実装します。

## 例

\`\`\`
rotate([[1, 2],
        [3, 4]])
→ [[3, 1],
   [4, 2]]
\`\`\`

- \`rotate([[1,2,3],[4,5,6],[7,8,9]])\` → \`[[7,4,1],[8,5,2],[9,6,3]]\`

## 考慮すること

- 元の行列を破壊せず、新しい行列を返す
- 「転置してから各行を反転」する方法か、\`new[i][j] = old[N-1-j][i]\` の直接計算で実装できます`,
      requirements: [
        "正方行列（N×N）を処理する",
        "時計回りに 90 度回転する",
        "元の行列を変更しない（新しい行列を返す）",
      ],
      exampleTest: `test('2×2行列の回転', () => {
  const m = [[1, 2], [3, 4]];
  expect(rotate(m)).toEqual([[3, 1], [4, 2]]);
});`,
      hints: ["行列転置 + 行反転", "または直接インデックス計算"],
    },
    languages: ["TypeScript", "JavaScript", "Python", "Java", "Go", "Ruby", "Rust", "C#", "Kotlin", "Swift"],
    difficulty: "hard",
  },

  // ─── easy（初級）──────────────────────────────────────────────────────────
  {
    problem: {
      title: "二数の和",
      description: `## 背景

TDD の最初の一歩に最適な、最小のお題です。「まず失敗するテストを書く → 通す → 整える」というリズムを体で覚えましょう。

2 つの整数を受け取り、その合計を返す関数 \`add(a, b)\` を実装します。

## 例

- \`add(2, 3)\` → \`5\`
- \`add(-1, 1)\` → \`0\`
- \`add(0, 0)\` → \`0\`

## 考慮すること

最初は \`return 5\` のような固定値（仮実装）でテストを通し、別の入力でテストを増やして一般化する（三角測量）と、TDD の流れを体感できます。`,
      requirements: [
        "add(2, 3) は 5 を返す",
        "負の数も扱える（add(-1, 1) は 0）",
        "0 同士の加算は 0",
      ],
      exampleTest: `test('add(2, 3) は 5', () => {\n  expect(add(2, 3)).toBe(5);\n});`,
      hints: ["まず固定値を返してテストを通し、その後一般化する（仮実装→三角測量）"],
    },
    languages: ALL_LANGS,
    difficulty: "easy",
  },
  {
    problem: {
      title: "文字数カウント",
      description: `## 背景

文字列の前処理と長さ取得の基本を練習するお題です。

文字列 \`s\` を受け取り、空白を除いた文字数を返す \`countChars(s)\` を実装します。

## ルール

- 前後・途中のすべての空白を数えない
- 空文字列は \`0\`
- 全角文字も 1 文字として数える

## 例

- \`countChars("a b c")\` → \`3\`
- \`countChars("  hello  ")\` → \`5\`
- \`countChars("")\` → \`0\`

## 考慮すること

空白を除去してから長さを取ります。正規表現 \`/\\s/g\` での置換が使えます。`,
      requirements: [
        "前後・途中の空白を数えない",
        "空文字列は 0",
        "全角文字も 1 文字として数える",
      ],
      exampleTest: `test('"a b c" は 3', () => {\n  expect(countChars('a b c')).toBe(3);\n});`,
      hints: ["空白を除去してから長さを取る", "正規表現 /\\s/g が使える"],
    },
    languages: ALL_LANGS,
    difficulty: "easy",
  },
  {
    problem: {
      title: "最大値を探す",
      description: `## 背景

配列の走査・畳み込み（reduce）と、エッジケース（空配列）の扱いを決める練習です。

数値の配列を受け取り、最大値を返す \`maxOf(nums)\` を実装します。

## ルール

- 要素が複数あれば最大値を返す
- 要素が 1 つならその値
- 空配列は \`null\`（または言語の妥当な表現）を返す

## 例

- \`maxOf([3, 1, 4, 1, 5])\` → \`5\`
- \`maxOf([42])\` → \`42\`
- \`maxOf([])\` → \`null\`

## 考慮すること

空配列を先に弾いてから、reduce で逐次的に大きい方を選んでいくと安全です。`,
      requirements: [
        "[3, 1, 4, 1, 5] は 5",
        "要素が 1 つならその値",
        "空配列は null（または言語の妥当な表現）を返す",
      ],
      exampleTest: `test('最大値は 5', () => {\n  expect(maxOf([3, 1, 4, 1, 5])).toBe(5);\n});`,
      hints: ["畳み込み（reduce）で実装できる", "空配列を先に弾く"],
    },
    languages: ALL_LANGS,
    difficulty: "easy",
  },
  {
    problem: {
      title: "温度変換",
      description: `## 背景

単純な計算式の実装と、浮動小数点の比較に関する注意を学ぶお題です。

摂氏 \`c\` を受け取り華氏に変換する \`celsiusToFahrenheit(c)\` を実装します。変換式は次のとおりです。

\`\`\`
F = C × 9 / 5 + 32
\`\`\`

## 例

- \`celsiusToFahrenheit(0)\` → \`32\`
- \`celsiusToFahrenheit(100)\` → \`212\`
- \`celsiusToFahrenheit(37)\` → \`98.6\`

## 考慮すること

小数を含む結果の比較では浮動小数点の誤差が出ることがあります。必要に応じて近似比較（許容誤差つき）を使ってください。`,
      requirements: [
        "0℃ は 32°F",
        "100℃ は 212°F",
        "小数点以下も正しく扱う（37℃ は 98.6°F）",
      ],
      exampleTest: `test('0℃ は 32°F', () => {\n  expect(celsiusToFahrenheit(0)).toBe(32);\n});`,
      hints: ["浮動小数の比較は誤差に注意（必要なら近似比較）"],
    },
    languages: ALL_LANGS,
    difficulty: "easy",
  },
  {
    problem: {
      title: "母音カウント",
      description: `## 背景

文字列の走査と集合（メンバーシップ判定）を練習する基本のお題です。

文字列 \`s\` に含まれる母音（\`a\`, \`e\`, \`i\`, \`o\`, \`u\`）の数を返す \`countVowels(s)\` を実装します。

## ルール

- 大文字の母音も数える（\`AEIOU\` は 5）
- 母音が無ければ \`0\`

## 例

- \`countVowels("hello")\` → \`2\`
- \`countVowels("xyz")\` → \`0\`
- \`countVowels("AEIOU")\` → \`5\`

## 考慮すること

小文字化してから集合 \`{a, e, i, o, u}\` に含まれるか判定すると、大文字小文字を一度に扱えます。`,
      requirements: [
        "'hello' は 2",
        "母音が無ければ 0",
        "大文字も母音として数える（'AEIOU' は 5）",
      ],
      exampleTest: `test("'hello' の母音は 2", () => {\n  expect(countVowels('hello')).toBe(2);\n});`,
      hints: ["集合 {a,e,i,o,u} に含まれるか判定", "小文字化してから処理する"],
    },
    languages: ALL_LANGS,
    difficulty: "easy",
  },
  {
    problem: {
      title: "配列の合計と平均",
      description: `## 背景

集計処理の基本と、ゼロ除算というエッジケースの扱いを練習するお題です。

数値配列を受け取り、合計を返す \`sum(arr)\` と平均を返す \`average(arr)\` を実装します。平均は合計を要素数で割ります。

## ルール

- 平均は合計 ÷ 要素数
- 空配列の合計は \`0\`
- 空配列の平均は \`0\`（ゼロ除算を避ける）

## 例

- \`sum([1, 2, 3, 4])\` → \`10\`
- \`average([1, 2, 3, 4])\` → \`2.5\`
- \`average([])\` → \`0\`

## 考慮すること

空配列を先に処理してゼロ除算を防ぎます。\`average\` は内部で \`sum\` を再利用すると簡潔です。`,
      requirements: [
        "sum([1,2,3,4]) は 10",
        "average([1,2,3,4]) は 2.5",
        "空配列の平均は 0（ゼロ除算を避ける）",
      ],
      exampleTest: `test('平均は 2.5', () => {\n  expect(average([1, 2, 3, 4])).toBe(2.5);\n});`,
      hints: ["合計を要素数で割る", "空配列を先に処理する"],
    },
    languages: ALL_LANGS,
    difficulty: "easy",
  },
  {
    problem: {
      title: "重複の除去",
      description: `## 背景

集合（Set）を使った重複管理と、順序保持の両立を練習するお題です。

配列から重複を取り除き、初めて出現した順序を保ったまま返す \`unique(arr)\` を実装します。

## ルール

- 各要素は最初に現れた位置の順序を保つ
- 空配列は空配列を返す

## 例

- \`unique([1, 2, 2, 3, 1])\` → \`[1, 2, 3]\`
- \`unique(["a", "a", "b"])\` → \`["a", "b"]\`
- \`unique([])\` → \`[]\`

## 考慮すること

Set で「既に見た要素」を管理しながら走査し、初出のものだけを結果に追加すると順序が保たれます。`,
      requirements: [
        "[1,2,2,3,1] は [1,2,3]",
        "初出の順序を保つ",
        "空配列は空配列",
      ],
      exampleTest: `test('重複を除去', () => {\n  expect(unique([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);\n});`,
      hints: ["集合（Set）で既出を管理", "順序保持に注意"],
    },
    languages: ALL_LANGS,
    difficulty: "easy",
  },
  {
    problem: {
      title: "アナグラム判定",
      description: `## 背景

文字列の正規化と、ソート／頻度カウントによる比較を練習するお題です。

2 つの文字列 \`a\`, \`b\` が互いにアナグラム（同じ文字を並べ替えたもの）かどうかを判定する \`isAnagram(a, b)\` を実装します。

## ルール

- 大文字小文字・空白は無視する
- 長さ（無視対象を除いた文字数）が違えば \`false\`

## 例

- \`isAnagram("listen", "silent")\` → \`true\`
- \`isAnagram("hello", "world")\` → \`false\`

## 考慮すること

両方の文字を並べ替えて比較するか、各文字の出現回数を数えて一致するか確認します。`,
      requirements: [
        "'listen' と 'silent' は true",
        "長さが違えば false",
        "大文字小文字・空白は無視する",
      ],
      exampleTest: `test('listen/silent はアナグラム', () => {\n  expect(isAnagram('listen', 'silent')).toBe(true);\n});`,
      hints: ["ソートして比較", "または文字の出現回数を比較"],
    },
    languages: ALL_LANGS,
    difficulty: "easy",
  },
  {
    problem: {
      title: "うるう年判定",
      description: `## 背景

複合的な条件を正しい順序・優先度で組み立てる練習です。条件の境界値テストが効くお題です。

西暦年 \`y\` を受け取り、うるう年かどうかを判定する \`isLeapYear(y)\` を実装します。

## ルール

うるう年は次の条件を満たす年です。

1. 4 で割り切れる、かつ
2. 100 で割り切れない、ただし
3. 400 で割り切れる年はうるう年

## 例

- \`isLeapYear(2000)\` → \`true\`（400 で割り切れる）
- \`isLeapYear(1900)\` → \`false\`（100 で割り切れるが 400 では割り切れない）
- \`isLeapYear(2024)\` → \`true\`
- \`isLeapYear(2023)\` → \`false\`

## 考慮すること

\`400 → 100 → 4\` の順で判定すると、例外規則が綺麗に表現できます。`,
      requirements: [
        "2000 は true（400 で割り切れる）",
        "1900 は false（100 で割り切れるが 400 では割り切れない）",
        "2024 は true、2023 は false",
      ],
      exampleTest: `test('2000 はうるう年', () => {\n  expect(isLeapYear(2000)).toBe(true);\n});`,
      hints: ["条件の順序に注意（400 → 100 → 4）"],
    },
    languages: ALL_LANGS,
    difficulty: "easy",
  },

  // ─── medium（中級）─────────────────────────────────────────────────────────
  {
    problem: {
      title: "数値のカンマ区切り",
      description: `## 背景

文字列操作と符号・桁の扱いを練習するお題です。後ろから 3 桁ごとに区切るというロジックがポイントです。

整数 \`n\` を受け取り、3 桁ごとにカンマで区切った文字列を返す \`formatNumber(n)\` を実装します。

## ルール

- 3 桁以下はカンマなし
- 負の数にも対応する（符号は先頭に残す）

## 例

- \`formatNumber(1234567)\` → \`"1,234,567"\`
- \`formatNumber(100)\` → \`"100"\`
- \`formatNumber(-1234)\` → \`"-1,234"\`

## 考慮すること

符号をいったん分離し、絶対値部分を後ろから 3 桁ごとに区切ってから符号を戻すと、場合分けが減ります。`,
      requirements: [
        "1234567 は '1,234,567'",
        "3 桁以下はカンマなし（100 は '100'）",
        "負の数も対応（-1234 は '-1,234'）",
      ],
      exampleTest: `test('1234567 を整形', () => {\n  expect(formatNumber(1234567)).toBe('1,234,567');\n});`,
      hints: ["後ろから 3 桁ごとに区切る", "符号を分離して処理すると楽"],
    },
    languages: ALL_LANGS,
    difficulty: "medium",
  },
  {
    problem: {
      title: "括弧の対応チェック",
      description: `## 背景

スタックを使った定番のお題です。コンパイラやエディタの括弧チェック機能の縮図でもあります。

\`()\`, \`{}\`, \`[]\` の 3 種類の括弧が正しく対応・ネストしているかを判定する \`isBalanced(s)\` を実装します。

## ルール

- 開いた括弧は、対応する種類の閉じ括弧で閉じる
- 交差したネストは不正
- 閉じ括弧が先に来た場合や、閉じ忘れがある場合も不正

## 例

- \`isBalanced("([]{})")\` → \`true\`
- \`isBalanced("([)]")\` → \`false\`（交差）
- \`isBalanced("(")\` → \`false\`（未閉じ）

## 考慮すること

開き括弧をスタックに push し、閉じ括弧が来たら pop して種類が一致するか照合します。最後にスタックが空なら対応が取れています。`,
      requirements: [
        "'([]{})' は true",
        "'([)]' は false（交差はNG）",
        "閉じ括弧が先に来たら false、未閉じも false",
      ],
      exampleTest: `test('([]{}) は対応している', () => {\n  expect(isBalanced('([]{})')).toBe(true);\n});`,
      hints: ["スタックを使う", "開き括弧を push、閉じで対応を pop して照合"],
    },
    languages: ALL_LANGS,
    difficulty: "medium",
  },
  {
    problem: {
      title: "ランレングス圧縮",
      description: `## 背景

連続する要素をまとめる「ランレングス符号化」の練習です。直前の状態を保持しながら走査するパターンを身につけます。

文字列 \`s\` を受け取り、連続する同じ文字を「文字＋連続数」に圧縮する \`encode(s)\` を実装します。

## ルール

- 連続数が 1 でも個数を付ける
- 空文字列は空文字列を返す

## 例

- \`encode("aaabbc")\` → \`"a3b2c1"\`
- \`encode("abc")\` → \`"a1b1c1"\`
- \`encode("")\` → \`""\`

## 考慮すること

直前の文字とその連続数を保持しながら走査し、文字が変わったタイミングで結果に書き出します。最後の塊の書き出し忘れに注意してください。`,
      requirements: [
        "'aaabbc' は 'a3b2c1'",
        "1 文字でも個数を付ける（'abc' は 'a1b1c1'）",
        "空文字列は空文字列",
      ],
      exampleTest: `test('aaabbc を圧縮', () => {\n  expect(encode('aaabbc')).toBe('a3b2c1');\n});`,
      hints: ["直前の文字と連続数を保持しながら走査する"],
    },
    languages: ALL_LANGS,
    difficulty: "medium",
  },
  {
    problem: {
      title: "シーザー暗号",
      description: `## 背景

文字コードの操作と、剰余による巡回を練習する古典的なお題です。

文字列 \`s\` の各英字を \`n\` 文字ずらすシーザー暗号 \`caesar(s, n)\` を実装します。

## ルール

- \`z\` を超えたら \`a\` に巡回する
- 大文字は大文字のまま巡回する
- 英字以外（数字・記号・空白）はそのまま残す

## 例

- \`caesar("abc", 1)\` → \`"bcd"\`
- \`caesar("xyz", 3)\` → \`"abc"\`
- \`caesar("Hello, World!", 1)\` → \`"Ifmmp, Xpsme!"\`

## 考慮すること

\`a\`（または \`A\`）を基点にした 0〜25 の値へ変換し、\`(値 + n) % 26\` で巡回させてから文字に戻すと、はみ出しを綺麗に扱えます。`,
      requirements: [
        "caesar('abc', 1) は 'bcd'",
        "'z' は 1 ずらすと 'a' に巡回する",
        "大文字は大文字のまま巡回、英字以外は不変",
      ],
      exampleTest: `test("caesar('abc', 1) は 'bcd'", () => {\n  expect(caesar('abc', 1)).toBe('bcd');\n});`,
      hints: ["文字コードを 26 で剰余して巡回させる"],
    },
    languages: ALL_LANGS,
    difficulty: "medium",
  },
  {
    problem: {
      title: "二分探索",
      description: `## 背景

境界条件のミスが起きやすい定番アルゴリズムです。オフバイワンエラーを TDD で潰す練習に向いています。

昇順ソート済みの配列 \`arr\` から目標値 \`target\` の添字を返す \`binarySearch(arr, target)\` を実装します。見つからなければ \`-1\` を返します。

## ルール

- 計算量は \`O(log n)\`（線形探索ではない）
- 存在しない値は \`-1\`

## 例

- \`binarySearch([1, 3, 5, 7, 9], 7)\` → \`3\`
- \`binarySearch([1, 3, 5, 7, 9], 4)\` → \`-1\`
- \`binarySearch([], 1)\` → \`-1\`

## 考慮すること

\`lo\`, \`hi\` の中点を求めて分岐します。ループ条件（\`lo <= hi\`）や中点計算のオーバーフローに注意してください。`,
      requirements: [
        "[1,3,5,7,9] から 7 は添字 3",
        "存在しない値は -1",
        "O(log n) で探索する（線形探索でない）",
      ],
      exampleTest: `test('7 の添字は 3', () => {\n  expect(binarySearch([1, 3, 5, 7, 9], 7)).toBe(3);\n});`,
      hints: ["lo, hi の中点で分岐", "境界条件（lo <= hi）に注意"],
    },
    languages: ALL_LANGS,
    difficulty: "medium",
  },
  {
    problem: {
      title: "2 数の和（Two Sum）",
      description: `## 背景

「ハッシュマップで計算量を \`O(n²)\` から \`O(n)\` に落とす」という発想を学ぶ有名なお題です。

配列 \`nums\` から、合計が \`target\` になる 2 要素の添字ペアを返す \`twoSum(nums, target)\` を実装します。

## ルール

- 同じ要素を 2 回使わない
- 解は 1 組存在すると仮定してよい
- 計算量 \`O(n)\` を目指す

## 例

- \`twoSum([2, 7, 11, 15], 9)\` → \`[0, 1]\`
- \`twoSum([3, 2, 4], 6)\` → \`[1, 2]\`

## 考慮すること

走査しながら「これまで見た値 → 添字」をマップに記録し、各要素について \`target - 現在値\` がマップにあるか調べると 1 回の走査で解けます。`,
      requirements: [
        "twoSum([2,7,11,15], 9) は [0,1]",
        "同じ要素を 2 回使わない",
        "O(n) で解く（ハッシュマップ利用）",
      ],
      exampleTest: `test('和が 9 になるペア', () => {\n  expect(twoSum([2, 7, 11, 15], 9)).toEqual([0, 1]);\n});`,
      hints: ["『target - 現在値』を map で探す", "走査しながら map に記録"],
    },
    languages: ALL_LANGS,
    difficulty: "medium",
  },
  {
    problem: {
      title: "連結リストの反転",
      description: `## 背景

ポインタ（参照）の付け替えを練習する、データ構造の基本のお題です。

単方向連結リストを反転する \`reverse(head)\` を実装します。先頭ノードを受け取り、反転後の先頭ノードを返します。

## ルール

- 空リスト・単一ノードも正しく扱う
- 可能なら新規ノードを作らず、参照の付け替えだけで反転する

## 例

- \`1 → 2 → 3\` を反転すると \`3 → 2 → 1\`
- 空リストを反転すると空リスト

## 考慮すること

\`prev\`, \`curr\`, \`next\` の 3 つの参照を使い、各ノードの \`next\` を直前のノードへ向け替えながら進めます。\`next\` を保存し忘れるとリストが切れるので注意してください。`,
      requirements: [
        "1→2→3 は 3→2→1 になる",
        "空リスト・単一ノードも正しく扱う",
        "新規ノードを作らず付け替えで反転（できれば）",
      ],
      exampleTest: `test('1→2→3 を反転', () => {\n  expect(toArray(reverse(fromArray([1, 2, 3])))).toEqual([3, 2, 1]);\n});`,
      hints: ["prev, curr, next の 3 ポインタで付け替える"],
    },
    languages: ALL_LANGS,
    difficulty: "medium",
  },
  {
    problem: {
      title: "区間のマージ",
      description: `## 背景

「ソートしてから 1 回走査する」という頻出パターンを学ぶお題です。スケジュール調整などで実際に使われます。

重なり合う区間をマージする \`merge(intervals)\` を実装します。各区間は \`[開始, 終了]\` の配列です。

## ルール

- 重複・隣接する区間は 1 つにまとめる
- 重ならない区間はそのまま残す

## 例

- \`merge([[1, 3], [2, 6], [8, 10]])\` → \`[[1, 6], [8, 10]]\`
- \`merge([[1, 4], [4, 5]])\` → \`[[1, 5]]\`

## 考慮すること

まず開始位置でソートします。次に直前のマージ済み区間の終端と現区間の開始を比較し、重なっていれば終端を延長、そうでなければ新しい区間として追加します。`,
      requirements: [
        "開始でソートしてからマージ",
        "隣接・重複する区間を 1 つにまとめる",
        "重ならない区間はそのまま残す",
      ],
      exampleTest: `test('区間をマージ', () => {\n  expect(merge([[1, 3], [2, 6], [8, 10]])).toEqual([[1, 6], [8, 10]]);\n});`,
      hints: ["開始位置でソート", "直前区間の終端と現区間の開始を比較"],
    },
    languages: ALL_LANGS,
    difficulty: "medium",
  },
  {
    problem: {
      title: "逆ポーランド記法電卓",
      description: `## 背景

スタックの応用として定番のお題です。逆ポーランド記法（RPN）は演算子を後置するため、括弧なしで優先順位を表現できます。

トークン列 \`tokens\` を評価して結果を返す \`evalRPN(tokens)\` を実装します。

## ルール

- \`+\`, \`-\`, \`*\`, \`/\` の四則演算に対応する
- 整数除算の扱い（切り捨て方向など）を決める

## 例

- \`evalRPN(["2", "1", "+", "3", "*"])\` → \`9\`（\`(2 + 1) × 3\`）
- \`evalRPN(["4", "13", "5", "/", "+"])\` → \`6\`

## 考慮すること

数値はスタックに積み、演算子が来たら 2 つ取り出して計算し、結果を積み直します。引く順序・割る順序を間違えないよう注意してください。`,
      requirements: [
        "+ - * / の四則演算に対応",
        "整数除算の扱いを決める",
        "スタックで評価する",
      ],
      exampleTest: `test('(2+1)*3 = 9', () => {\n  expect(evalRPN(['2', '1', '+', '3', '*'])).toBe(9);\n});`,
      hints: ["数はスタックに積み、演算子で 2 つ取り出して計算"],
    },
    languages: ALL_LANGS,
    difficulty: "medium",
  },
  {
    problem: {
      title: "ショッピングカート合計",
      description: `## 背景

実務に近いドメインで、畳み込み（集計）と割引ルールの適用を練習するお題です。

商品のリスト \`items\` から合計金額を計算する \`total(items)\` を実装します。各商品は \`{ price, qty }\`（単価と個数）を持ちます。

## ルール

- 合計は各商品の \`price × qty\` の総和
- 空のカートは \`0\`
- 割引率（例: 0.1 = 10% オフ）があれば最後に適用できるようにする（任意の拡張）

## 例

- \`total([{ price: 100, qty: 2 }])\` → \`200\`
- \`total([{ price: 100, qty: 2 }, { price: 50, qty: 1 }])\` → \`250\`
- \`total([])\` → \`0\`

## 考慮すること

各明細の小計を畳み込みで加算し、割引はすべて合算した後に一括で適用すると、計算の責務が分離できます。`,
      requirements: [
        "[{price:100, qty:2}] の合計は 200",
        "空カートは 0",
        "割引率 0.1（10%オフ）を適用できる（任意の拡張）",
      ],
      exampleTest: `test('合計は 200', () => {\n  expect(total([{ price: 100, qty: 2 }])).toBe(200);\n});`,
      hints: ["畳み込みで price*qty を加算", "割引は最後に一括適用"],
    },
    languages: ALL_LANGS,
    difficulty: "medium",
  },
  {
    problem: {
      title: "パスワード強度チェック",
      description: `## 背景

複数の独立した条件を組み合わせて判定する練習です。各条件を個別のテストで詰めていけます。

パスワード \`pw\` が規則を満たすかを判定する \`isStrong(pw)\` を実装します。

## ルール

次のすべてを満たすとき \`true\`、1 つでも欠ければ \`false\`。

1. 8 文字以上
2. 英大文字を 1 文字以上含む
3. 英小文字を 1 文字以上含む
4. 数字を 1 文字以上含む

## 例

- \`isStrong("Abcd1234")\` → \`true\`
- \`isStrong("abcd1234")\` → \`false\`（大文字なし）
- \`isStrong("Ab1")\` → \`false\`（短い）

## 考慮すること

各条件を個別のフラグ（真偽値）で求め、最後にすべての AND を取ると、要件とテストが 1 対 1 に対応します。`,
      requirements: [
        "8 文字以上",
        "大文字・小文字・数字をそれぞれ 1 文字以上含む",
        "条件を満たさなければ false",
      ],
      exampleTest: `test("'Abcd1234' は強い", () => {\n  expect(isStrong('Abcd1234')).toBe(true);\n});`,
      hints: ["各条件を個別のフラグで判定して AND を取る"],
    },
    languages: ALL_LANGS,
    difficulty: "medium",
  },
  {
    problem: {
      title: "電話番号フォーマット",
      description: `## 背景

入力の正規化（ノイズ除去）と、固定フォーマットへの整形を練習するお題です。

文字列 \`s\` を受け取り、日本の携帯番号を \`090-1234-5678\` 形式に整形する \`formatPhone(s)\` を実装します。

## ルール

- 入力に含まれるハイフン・空白などの非数字は無視する
- 数字を抽出して 3-4-4 の形に区切る
- 数字が 11 桁でなければエラー（または \`null\`）

## 例

- \`formatPhone("09012345678")\` → \`"090-1234-5678"\`
- \`formatPhone("090-1234-5678")\` → \`"090-1234-5678"\`
- \`formatPhone("0901234")\` → \`null\`（桁不足）

## 考慮すること

まず数字だけを抽出し、桁数を検証してから 3-4-4 で区切ります。検証を先に行うと整形ロジックが単純になります。`,
      requirements: [
        "'09012345678' は '090-1234-5678'",
        "ハイフン入り入力も受け付ける",
        "11 桁でなければエラー（または null）",
      ],
      exampleTest: `test('携帯番号を整形', () => {\n  expect(formatPhone('09012345678')).toBe('090-1234-5678');\n});`,
      hints: ["まず数字だけ抽出", "3-4-4 で区切る"],
    },
    languages: ALL_LANGS,
    difficulty: "medium",
  },

  // ─── hard（上級）──────────────────────────────────────────────────────────
  {
    problem: {
      title: "ボウリングのスコア計算",
      description: `## 背景

TDD の練習として世界的に有名な「Bowling Game Kata」です。ボーナス計算のルールが絡み合い、小さなテストで少しずつ詰めていくのに最適です。

10 フレーム分の投球結果（各投で倒したピン数の配列）\`rolls\` を受け取り、合計スコアを返す \`score(rolls)\` を実装します。

## ルール

- 1 フレームは原則 2 投。10 本倒したら次の投球がボーナス対象
- **スペア**（2 投で 10 本）: 次の 1 投をボーナス加算
- **ストライク**（1 投で 10 本）: 次の 2 投をボーナス加算
- 第 10 フレームはボーナス投球が追加される

## 例

- 全ガター（すべて 0）→ \`0\`
- オールストライク（パーフェクトゲーム）→ \`300\`

## 考慮すること

ロールの配列を「フレーム単位」で進めるのがコツです。ストライクは 1 投で 1 フレーム、スペア・通常は 2 投で 1 フレーム進みます。ボーナスは配列の次の要素を覗いて加算します。`,
      requirements: [
        "全ガター（0 投）は 0 点",
        "スペアは次 1 投、ストライクは次 2 投をボーナス加算",
        "オールストライク（パーフェクト）は 300 点",
      ],
      exampleTest: `test('パーフェクトゲームは 300', () => {\n  expect(score(Array(12).fill(10))).toBe(300);\n});`,
      hints: ["フレーム単位でロール位置を進める", "ストライクは 1 投で 1 フレーム"],
    },
    languages: ALL_LANGS,
    difficulty: "hard",
  },
  {
    problem: {
      title: "LRU キャッシュ",
      description: `## 背景

データ構造を組み合わせて計算量の要件を満たす設計力を鍛えるお題です。実際のキャッシュ実装の縮図です。

容量上限つきの LRU（Least Recently Used）キャッシュ \`LRUCache\` を実装します。

## 振る舞い

- \`new LRUCache(capacity)\`: 容量を指定して生成
- \`get(key)\`: 値を返す。存在しなければ未定義／\`null\`
- \`put(key, value)\`: 値を登録。容量を超えたら最も長く使われていない要素を捨てる
- \`get\` / \`put\` でアクセスした要素は「最新」として扱う

## 例

\`\`\`
const c = new LRUCache(2);
c.put("a", 1);
c.put("b", 2);
c.get("a");      // a が最新になる
c.put("c", 3);   // 最も古い b が捨てられる
c.get("b");      // undefined
\`\`\`

## 考慮すること

\`get\` / \`put\` を \`O(1)\` で実現するには、ハッシュマップ＋双方向連結リストの組み合わせが定番です。言語に挿入順を保つマップがあればそれでも実装できます。`,
      requirements: [
        "容量を超えると最も使われていない要素を捨てる",
        "get/put でアクセスした要素は最新扱いになる",
        "存在しないキーの get は未定義/null を返す",
      ],
      exampleTest: `test('容量超過で最古が捨てられる', () => {\n  const c = new LRUCache(2);\n  c.put('a', 1); c.put('b', 2); c.get('a'); c.put('c', 3);\n  expect(c.get('b')).toBeUndefined();\n});`,
      hints: ["ハッシュ + 双方向連結リスト", "言語の順序付きマップでも可"],
    },
    languages: ALL_LANGS,
    difficulty: "hard",
  },
  {
    problem: {
      title: "三目並べの勝敗判定",
      description: `## 背景

二次元の盤面に対する条件判定と、状態の列挙を整理する練習です。

\`3×3\` の盤面 \`board\` を受け取り、勝者または対局状況を判定する \`judge(board)\` を実装します。各マスは \`"X"\`, \`"O"\`, または空（\`""\`）です。

## ルール

- 縦・横・斜めのいずれかで 3 つ揃っていれば、その記号が勝者
- 勝者がいなければ、空きがなければ引き分け、空きがあれば未決
- 不正な盤面（両者同時勝利など）は考慮しなくてよい

## 例

- \`judge([["X","X","X"],["O","O",""],["","",""]])\` → \`"X"\`
- 全マス埋まって勝者なし → 引き分け
- 空きがあり勝者なし → 未決

## 考慮すること

8 本の勝ち筋（3 行・3 列・2 斜め）を列挙して照合します。勝者判定 → 盤面の空き判定、の順で評価すると整理しやすいです。`,
      requirements: [
        "縦・横・斜めの 3 つ揃いを検出する",
        "勝者がいなければ引き分けか未決を返す",
        "不正な盤面（両者勝利など）は考慮しなくてよい",
      ],
      exampleTest: `test('横一列の X が勝ち', () => {\n  expect(judge([['X','X','X'],['O','O',''],['','','']])).toBe('X');\n});`,
      hints: ["8 つの勝ち筋を列挙して照合", "空きが無く勝者なしなら引き分け"],
    },
    languages: ALL_LANGS,
    difficulty: "hard",
  },
  {
    problem: {
      title: "ネストJSONの平坦化",
      description: `## 背景

再帰によるツリー走査と、キーのプレフィックス連結を練習するお題です。設定ファイルやログの整形でよく登場します。

ネストしたオブジェクト \`obj\` を、ドット区切りキーの 1 階層オブジェクトに平坦化する \`flatten(obj)\` を実装します。

## ルール

- ネストした各キーをドットで連結する
- プリミティブ値はそのまま値にする
- 配列はインデックスをキーにする（任意の拡張）

## 例

- \`flatten({ a: { b: 1 }, c: 2 })\` → \`{ "a.b": 1, c: 2 }\`
- \`flatten({ a: { b: { c: 1 } } })\` → \`{ "a.b.c": 1 }\`

## 考慮すること

再帰関数に「現在までのキーのプレフィックス」を引数で渡し、オブジェクトに出会ったらキーを連結して再帰、プリミティブに出会ったら結果へ書き込みます。`,
      requirements: [
        "{a:{b:{c:1}}} は {'a.b.c':1}",
        "配列はインデックスをキーにする（任意）",
        "プリミティブ値はそのまま",
      ],
      exampleTest: `test('ネストを平坦化', () => {\n  expect(flatten({ a: { b: 1 }, c: 2 })).toEqual({ 'a.b': 1, c: 2 });\n});`,
      hints: ["再帰でキーのプレフィックスを連結していく"],
    },
    languages: ALL_LANGS,
    difficulty: "hard",
  },
  {
    problem: {
      title: "レート制限（トークンバケット）",
      description: `## 背景

時間に依存するロジックを「時刻を注入してテスト可能にする」設計を学ぶお題です。API のレート制限で実際に使われる方式です。

トークンバケット方式のレート制限器 \`RateLimiter\` を実装します。バケットには容量があり、一定速度でトークンが補充されます。リクエストごとにトークンを 1 つ消費し、足りなければ拒否します。

## 振る舞い

- \`new RateLimiter({ capacity, refillPerSec })\`: 容量と補充レートを指定
- \`allow()\`: トークンがあれば消費して \`true\`、なければ \`false\`
- 容量 N まで即時に許可し、それ以降は補充を待つ
- 経過時間に応じてトークンが補充される（上限は容量）

## 例

\`\`\`
const r = new RateLimiter({ capacity: 2, refillPerSec: 1 });
r.allow(); // true
r.allow(); // true
r.allow(); // false（補充待ち）
\`\`\`

## 考慮すること

現在時刻を引数や注入で渡せるようにすると、時間経過をテストで再現できます。\`経過秒 × 補充レート\` を加算し、容量で頭打ちにします。`,
      requirements: [
        "容量 N まで即時に許可、それ以降は補充待ち",
        "時間経過でトークンが補充される（時刻は注入可能に）",
        "上限を超えるリクエストは拒否される",
      ],
      exampleTest: `test('容量を超えると拒否', () => {\n  const r = new RateLimiter({ capacity: 2, refillPerSec: 1 });\n  expect(r.allow()).toBe(true);\n  expect(r.allow()).toBe(true);\n  expect(r.allow()).toBe(false);\n});`,
      hints: ["現在時刻を引数/注入にしてテスト可能にする", "経過時間 × 補充レートを加算しつつ容量で頭打ち"],
    },
    languages: ALL_LANGS,
    difficulty: "hard",
  },
  {
    problem: {
      title: "電卓（式の評価）",
      description: `## 背景

字句解析（トークナイズ）と構文解析を組み合わせる、総合力が問われるお題です。小さなステップに分けて TDD する練習に最適です。

\`+\`, \`-\`, \`*\`, \`/\` と括弧を含む算術式の文字列を評価する \`evaluate(expr)\` を実装します。

## ルール

- 演算子の優先順位（\`*\`, \`/\` が \`+\`, \`-\` より先）を尊重する
- 括弧で優先順位を変えられる
- 空白は無視する

## 例

- \`evaluate("2 + 3 * 4")\` → \`14\`（優先順位）
- \`evaluate("(2 + 3) * 4")\` → \`20\`（括弧）
- \`evaluate("10 / 2 - 3")\` → \`2\`

## 考慮すること

「数値の足し算だけ」「掛け算を追加」「括弧を追加」のように段階的に拡張していくと進めやすいです。トークナイズ → 構文解析（操車場アルゴリズムや再帰下降法）の二段構えが定番です。`,
      requirements: [
        "'2 + 3 * 4' は 14（優先順位）",
        "'(2 + 3) * 4' は 20（括弧）",
        "空白は無視する",
      ],
      exampleTest: `test('優先順位を尊重', () => {\n  expect(evaluate('2 + 3 * 4')).toBe(14);\n});`,
      hints: ["トークナイズ → 構文解析（操車場アルゴリズム等）", "小さく刻んで TDD する"],
    },
    languages: ALL_LANGS,
    difficulty: "hard",
  },
];

// ─── 検証 ────────────────────────────────────────────────────────────────────

/**
 * お題オブジェクトを Valibot で検証する
 * AI 由来のテキストを信頼しないデータとして扱う（FR-023）
 */
export function validateProblem(
  raw: unknown,
): Result<Problem, v.ValiError<typeof ProblemSchema>> {
  const result = v.safeParse(ProblemSchema, raw);
  if (result.success) {
    return ok(result.output);
  }
  return err(result.issues as never);
}

// ─── フォールバック ──────────────────────────────────────────────────────────

/**
 * 言語・難易度に合った定型お題を返す
 * AI 生成失敗時のフォールバック（FR-024）
 */
export function pickFallback(
  language: string,
  difficulty: string,
): ProblemWithSource {
  // 言語・難易度でフィルタ
  let candidates = FALLBACK_PROBLEMS.filter(
    (e) => e.languages.includes(language) && e.difficulty === difficulty,
  );

  // 言語フィルタのみ
  if (candidates.length === 0) {
    candidates = FALLBACK_PROBLEMS.filter((e) =>
      e.languages.includes(language),
    );
  }

  // 全フォールバック
  if (candidates.length === 0) {
    candidates = FALLBACK_PROBLEMS;
  }

  // 疑似ランダムに選択（時刻ベース）
  const index = Math.abs(Date.now()) % candidates.length;
  const entry = candidates[index] ?? FALLBACK_PROBLEMS[0]!;

  return { problem: entry.problem, source: "fallback" };
}

// ─── AI プロンプト生成 ───────────────────────────────────────────────────────

/**
 * AI お題生成用のプロンプトを生成する
 * FR-021, FR-022
 */
export function buildProblemPrompt(language: string, difficulty: string): string {
  return `You are a TDD coding kata generator. Generate a programming kata in ${language} at ${difficulty} difficulty.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "title": "short kata name (3-10 words)",
  "description": "clear description of what to implement (1-2 sentences)",
  "requirements": ["requirement 1", "requirement 2", "requirement 3", "requirement 4"],
  "exampleTest": "example test code showing expected behavior in ${language} syntax",
  "hints": ["hint 1", "hint 2"]
}

Rules:
- The kata must be suitable for TDD practice (test-first approach)
- Include 4-6 clear, testable requirements. Each requirement must be verifiable by a test (avoid vague or ambiguous phrasing).
- The exampleTest MUST be valid ${language} syntax and show at least one concrete input/output assertion.
- Difficulty: ${difficulty} (easy=beginner/30min, medium=intermediate/60min, hard=advanced/90min+)
- Make it practical and educational; avoid trivial one-liners`;
}
