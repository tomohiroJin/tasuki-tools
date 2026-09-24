/**
 * 定型バンク（#91）。**生成物である。手で直さない。**
 *
 * timer-core の `problem-bank.ts`（生成時点で 33 件）の要件・テスト例・ヒントを本文 1 本へ畳んだもの
 * （spec §5.1 T2）。topic-core は timer-core に依存できない（spec T1）ので、データとして置く。
 * 旧バンクは PR 3 で timer-core から消える。以後の正本はこのファイルである。
 */
import type { Difficulty, Language } from "./limits.js";

export interface TopicBankEntry {
  title: string;
  body: string;
  languages: readonly Language[];
  difficulty: Difficulty;
}

export const TOPIC_BANK: readonly TopicBankEntry[] = [
  {
    "title": "FizzBuzz",
    "body": "## 背景\n\nTDD の入門として定番のお題です。条件分岐とループ、そして「テストを先に書く」感覚を身につけるのに最適です。\n\n整数 `n` を受け取り、その数に応じた文字列を返す関数 `fizzBuzz(n)` を実装します。1 から N まで順に処理することもできます。\n\n## ルール\n\n- 3 で割り切れる数は `Fizz`\n- 5 で割り切れる数は `Buzz`\n- 3 でも 5 でも割り切れる数（15 の倍数）は `FizzBuzz`\n- それ以外はその数値そのものを文字列で返す\n\n## 例\n\n- `fizzBuzz(1)` → `\"1\"`\n- `fizzBuzz(3)` → `\"Fizz\"`\n- `fizzBuzz(5)` → `\"Buzz\"`\n- `fizzBuzz(15)` → `\"FizzBuzz\"`\n\n## 考慮すること\n\n15 の倍数の判定を先に書かないと、Fizz か Buzz だけが返ってしまいます。条件の順序に注意してください。\n\n満たすこと:\n- 1 から N までループする\n- 3の倍数のとき 'Fizz' を返す\n- 5の倍数のとき 'Buzz' を返す\n- 15の倍数のとき 'FizzBuzz' を返す\n- それ以外はその数値を文字列で返す\n\n最初のテストの例:\ntest('FizzBuzz(15) は FizzBuzz', () => {\n  expect(fizzBuzz(15)).toBe('FizzBuzz');\n});\n\nヒント:\n- 15の倍数を先にチェックする\n- % 演算子を使う",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "easy"
  },
  {
    "title": "回文チェッカー",
    "body": "## 背景\n\n文字列の前処理（正規化）と、両端から中央へ向かう走査を練習するお題です。\n\n文字列 `s` を受け取り、それが回文（前から読んでも後ろから読んでも同じ）かどうかを判定する `isPalindrome(s)` を実装します。\n\n## ルール\n\n- 英数字以外（記号・空白）は無視する\n- 大文字小文字は区別しない\n- 空文字列・単一文字は回文とみなす\n\n## 例\n\n- `isPalindrome(\"A man, a plan, a canal: Panama\")` → `true`\n- `isPalindrome(\"race a car\")` → `false`\n- `isPalindrome(\"\")` → `true`\n\n## 考慮すること\n\nまず英数字だけを抽出して小文字化し、その上で逆順と比較するか、左右のポインタで突き合わせます。\n\n満たすこと:\n- 英数字以外の文字は無視する\n- 大文字小文字を区別しない\n- 空文字列は回文とする\n- 単一文字は回文とする\n\n最初のテストの例:\ntest('\"A man, a plan, a canal: Panama\" は回文', () => {\n  expect(isPalindrome('A man, a plan, a canal: Panama')).toBe(true);\n});\n\nヒント:\n- 正規表現でフィルタリング\n- reverse() と比較",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "easy"
  },
  {
    "title": "ローマ数字変換",
    "body": "## 背景\n\n「対応表を大きい順に貪欲に消費する」というアルゴリズムの典型例です。減算則の扱いがポイントになります。\n\n整数 `n`（1〜3999）を受け取り、ローマ数字の文字列に変換する `toRoman(n)` を実装します。\n\n## 使う記号\n\n- `I`=1, `V`=5, `X`=10, `L`=50, `C`=100, `D`=500, `M`=1000\n\n## 減算則\n\n- `IV`=4, `IX`=9, `XL`=40, `XC`=90, `CD`=400, `CM`=900\n\n## 例\n\n- `toRoman(4)` → `\"IV\"`\n- `toRoman(9)` → `\"IX\"`\n- `toRoman(58)` → `\"LVIII\"`\n- `toRoman(1994)` → `\"MCMXCIV\"`\n\n## 考慮すること\n\n減算則の値（4, 9, 40, ...）も対応表に含めて値の大きい順に並べておくと、ループ 1 つで素直に書けます。\n\n満たすこと:\n- 1〜3999 の範囲を処理する\n- I, V, X, L, C, D, M の 7 種類を使う\n- 減算則（IV = 4, IX = 9, XL = 40, XC = 90, CD = 400, CM = 900）に対応する\n\n最初のテストの例:\ntest('4 は IV', () => {\n  expect(toRoman(4)).toBe('IV');\n});\ntest('1994 は MCMXCIV', () => {\n  expect(toRoman(1994)).toBe('MCMXCIV');\n});\n\nヒント:\n- 対応表を配列で持つ\n- 大きい値から順に引いていく",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "medium"
  },
  {
    "title": "銀行口座",
    "body": "## 背景\n\n状態を持つクラスの設計と、不変条件（残高は負にならない）の守り方を練習するお題です。例外処理の TDD にも向いています。\n\n入金・出金・残高照会ができる `BankAccount` クラスを実装します。\n\n## 振る舞い\n\n- `deposit(amount)`: 入金する。金額は正の数のみ許可\n- `withdraw(amount)`: 出金する。残高を超える出金は拒否\n- `balance`: 現在の残高を返す\n- 取引履歴を記録できるようにする\n\n## 例\n\n```\nconst account = new BankAccount();\naccount.deposit(100);   // balance = 100\naccount.withdraw(30);   // balance = 70\n```\n\n## 考慮すること\n\n- 不正な入金・出金（負の額、残高超過）は例外で表現する\n- 不変条件「残高 >= 0」を常に保つ\n\n満たすこと:\n- 入金は正の金額のみ許可する\n- 出金は残高を超えてはいけない\n- 取引履歴を管理する\n- 残高照会が正しい値を返す\n\n最初のテストの例:\ntest('入金後の残高が正しい', () => {\n  const account = new BankAccount();\n  account.deposit(100);\n  expect(account.balance).toBe(100);\n});\n\nヒント:\n- 不変式（残高 >= 0）を守る\n- エラーは例外で表現",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "easy"
  },
  {
    "title": "テニスゲームスコア",
    "body": "## 背景\n\nルールが複雑に絡み合うドメインを、場合分けで整理する練習です。状態遷移を小さなテストで詰めていく典型的なお題です。\n\n両プレイヤーの獲得ポイント数を受け取り、テニスの「ゲーム内スコア」表示を返す `score(p1, p2)` を実装します。\n\n## ルール\n\n- 0/1/2/3 点はそれぞれ `Love`/`15`/`30`/`40`\n- 両者 3 点（40-40）は `Deuce`\n- デュース以降、片方が 1 点リードすると `Advantage`\n- リード側がさらに得点するとゲーム終了\n\n## 例\n\n- `score(0, 0)` → `\"Love-All\"`\n- `score(1, 0)` → `\"15-Love\"`\n- `score(3, 3)` → `\"Deuce\"`\n\n## 考慮すること\n\n両者が同点のときと差があるときで表示が変わります。対称性を意識すると分岐が減らせます。\n\n満たすこと:\n- 0〜3 点を Love/15/30/40 で表示\n- 両者 40 点はデュース\n- デュース後のリードはアドバンテージ\n- アドバンテージから得点でゲーム終了\n\n最初のテストの例:\ntest('0-0 は Love-All', () => {\n  expect(score(0, 0)).toBe('Love-All');\n});\ntest('3-3 はDeuce', () => {\n  expect(score(3, 3)).toBe('Deuce');\n});\n\nヒント:\n- 状態で場合分け\n- 対称性を活用",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "medium"
  },
  {
    "title": "行列の回転",
    "body": "## 背景\n\n二次元配列のインデックス操作を整理する練習です。座標変換のイメージを掴むのに役立ちます。\n\n`N×N` の整数行列を時計回りに 90 度回転させた新しい行列を返す `rotate(matrix)` を実装します。\n\n## 例\n\n```\nrotate([[1, 2],\n        [3, 4]])\n→ [[3, 1],\n   [4, 2]]\n```\n\n- `rotate([[1,2,3],[4,5,6],[7,8,9]])` → `[[7,4,1],[8,5,2],[9,6,3]]`\n\n## 考慮すること\n\n- 元の行列を破壊せず、新しい行列を返す\n- 「転置してから各行を反転」する方法か、`new[i][j] = old[N-1-j][i]` の直接計算で実装できます\n\n満たすこと:\n- 正方行列（N×N）を処理する\n- 時計回りに 90 度回転する\n- 元の行列を変更しない（新しい行列を返す）\n\n最初のテストの例:\ntest('2×2行列の回転', () => {\n  const m = [[1, 2], [3, 4]];\n  expect(rotate(m)).toEqual([[3, 1], [4, 2]]);\n});\n\nヒント:\n- 行列転置 + 行反転\n- または直接インデックス計算",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "hard"
  },
  {
    "title": "二数の和",
    "body": "## 背景\n\nTDD の最初の一歩に最適な、最小のお題です。「まず失敗するテストを書く → 通す → 整える」というリズムを体で覚えましょう。\n\n2 つの整数を受け取り、その合計を返す関数 `add(a, b)` を実装します。\n\n## 例\n\n- `add(2, 3)` → `5`\n- `add(-1, 1)` → `0`\n- `add(0, 0)` → `0`\n\n## 考慮すること\n\n最初は `return 5` のような固定値（仮実装）でテストを通し、別の入力でテストを増やして一般化する（三角測量）と、TDD の流れを体感できます。\n\n満たすこと:\n- add(2, 3) は 5 を返す\n- 負の数も扱える（add(-1, 1) は 0）\n- 0 同士の加算は 0\n\n最初のテストの例:\ntest('add(2, 3) は 5', () => {\n  expect(add(2, 3)).toBe(5);\n});\n\nヒント:\n- まず固定値を返してテストを通し、その後一般化する（仮実装→三角測量）",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "easy"
  },
  {
    "title": "文字数カウント",
    "body": "## 背景\n\n文字列の前処理と長さ取得の基本を練習するお題です。\n\n文字列 `s` を受け取り、空白を除いた文字数を返す `countChars(s)` を実装します。\n\n## ルール\n\n- 前後・途中のすべての空白を数えない\n- 空文字列は `0`\n- 全角文字も 1 文字として数える\n\n## 例\n\n- `countChars(\"a b c\")` → `3`\n- `countChars(\"  hello  \")` → `5`\n- `countChars(\"\")` → `0`\n\n## 考慮すること\n\n空白を除去してから長さを取ります。正規表現 `/\\s/g` での置換が使えます。\n\n満たすこと:\n- 前後・途中の空白を数えない\n- 空文字列は 0\n- 全角文字も 1 文字として数える\n\n最初のテストの例:\ntest('\"a b c\" は 3', () => {\n  expect(countChars('a b c')).toBe(3);\n});\n\nヒント:\n- 空白を除去してから長さを取る\n- 正規表現 /\\s/g が使える",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "easy"
  },
  {
    "title": "最大値を探す",
    "body": "## 背景\n\n配列の走査・畳み込み（reduce）と、エッジケース（空配列）の扱いを決める練習です。\n\n数値の配列を受け取り、最大値を返す `maxOf(nums)` を実装します。\n\n## ルール\n\n- 要素が複数あれば最大値を返す\n- 要素が 1 つならその値\n- 空配列は `null`（または言語の妥当な表現）を返す\n\n## 例\n\n- `maxOf([3, 1, 4, 1, 5])` → `5`\n- `maxOf([42])` → `42`\n- `maxOf([])` → `null`\n\n## 考慮すること\n\n空配列を先に弾いてから、reduce で逐次的に大きい方を選んでいくと安全です。\n\n満たすこと:\n- [3, 1, 4, 1, 5] は 5\n- 要素が 1 つならその値\n- 空配列は null（または言語の妥当な表現）を返す\n\n最初のテストの例:\ntest('最大値は 5', () => {\n  expect(maxOf([3, 1, 4, 1, 5])).toBe(5);\n});\n\nヒント:\n- 畳み込み（reduce）で実装できる\n- 空配列を先に弾く",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "easy"
  },
  {
    "title": "温度変換",
    "body": "## 背景\n\n単純な計算式の実装と、浮動小数点の比較に関する注意を学ぶお題です。\n\n摂氏 `c` を受け取り華氏に変換する `celsiusToFahrenheit(c)` を実装します。変換式は次のとおりです。\n\n```\nF = C × 9 / 5 + 32\n```\n\n## 例\n\n- `celsiusToFahrenheit(0)` → `32`\n- `celsiusToFahrenheit(100)` → `212`\n- `celsiusToFahrenheit(37)` → `98.6`\n\n## 考慮すること\n\n小数を含む結果の比較では浮動小数点の誤差が出ることがあります。必要に応じて近似比較（許容誤差つき）を使ってください。\n\n満たすこと:\n- 0℃ は 32°F\n- 100℃ は 212°F\n- 小数点以下も正しく扱う（37℃ は 98.6°F）\n\n最初のテストの例:\ntest('0℃ は 32°F', () => {\n  expect(celsiusToFahrenheit(0)).toBe(32);\n});\n\nヒント:\n- 浮動小数の比較は誤差に注意（必要なら近似比較）",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "easy"
  },
  {
    "title": "母音カウント",
    "body": "## 背景\n\n文字列の走査と集合（メンバーシップ判定）を練習する基本のお題です。\n\n文字列 `s` に含まれる母音（`a`, `e`, `i`, `o`, `u`）の数を返す `countVowels(s)` を実装します。\n\n## ルール\n\n- 大文字の母音も数える（`AEIOU` は 5）\n- 母音が無ければ `0`\n\n## 例\n\n- `countVowels(\"hello\")` → `2`\n- `countVowels(\"xyz\")` → `0`\n- `countVowels(\"AEIOU\")` → `5`\n\n## 考慮すること\n\n小文字化してから集合 `{a, e, i, o, u}` に含まれるか判定すると、大文字小文字を一度に扱えます。\n\n満たすこと:\n- 'hello' は 2\n- 母音が無ければ 0\n- 大文字も母音として数える（'AEIOU' は 5）\n\n最初のテストの例:\ntest(\"'hello' の母音は 2\", () => {\n  expect(countVowels('hello')).toBe(2);\n});\n\nヒント:\n- 集合 {a,e,i,o,u} に含まれるか判定\n- 小文字化してから処理する",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "easy"
  },
  {
    "title": "配列の合計と平均",
    "body": "## 背景\n\n集計処理の基本と、ゼロ除算というエッジケースの扱いを練習するお題です。\n\n数値配列を受け取り、合計を返す `sum(arr)` と平均を返す `average(arr)` を実装します。平均は合計を要素数で割ります。\n\n## ルール\n\n- 平均は合計 ÷ 要素数\n- 空配列の合計は `0`\n- 空配列の平均は `0`（ゼロ除算を避ける）\n\n## 例\n\n- `sum([1, 2, 3, 4])` → `10`\n- `average([1, 2, 3, 4])` → `2.5`\n- `average([])` → `0`\n\n## 考慮すること\n\n空配列を先に処理してゼロ除算を防ぎます。`average` は内部で `sum` を再利用すると簡潔です。\n\n満たすこと:\n- sum([1,2,3,4]) は 10\n- average([1,2,3,4]) は 2.5\n- 空配列の平均は 0（ゼロ除算を避ける）\n\n最初のテストの例:\ntest('平均は 2.5', () => {\n  expect(average([1, 2, 3, 4])).toBe(2.5);\n});\n\nヒント:\n- 合計を要素数で割る\n- 空配列を先に処理する",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "easy"
  },
  {
    "title": "重複の除去",
    "body": "## 背景\n\n集合（Set）を使った重複管理と、順序保持の両立を練習するお題です。\n\n配列から重複を取り除き、初めて出現した順序を保ったまま返す `unique(arr)` を実装します。\n\n## ルール\n\n- 各要素は最初に現れた位置の順序を保つ\n- 空配列は空配列を返す\n\n## 例\n\n- `unique([1, 2, 2, 3, 1])` → `[1, 2, 3]`\n- `unique([\"a\", \"a\", \"b\"])` → `[\"a\", \"b\"]`\n- `unique([])` → `[]`\n\n## 考慮すること\n\nSet で「既に見た要素」を管理しながら走査し、初出のものだけを結果に追加すると順序が保たれます。\n\n満たすこと:\n- [1,2,2,3,1] は [1,2,3]\n- 初出の順序を保つ\n- 空配列は空配列\n\n最初のテストの例:\ntest('重複を除去', () => {\n  expect(unique([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);\n});\n\nヒント:\n- 集合（Set）で既出を管理\n- 順序保持に注意",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "easy"
  },
  {
    "title": "アナグラム判定",
    "body": "## 背景\n\n文字列の正規化と、ソート／頻度カウントによる比較を練習するお題です。\n\n2 つの文字列 `a`, `b` が互いにアナグラム（同じ文字を並べ替えたもの）かどうかを判定する `isAnagram(a, b)` を実装します。\n\n## ルール\n\n- 大文字小文字・空白は無視する\n- 長さ（無視対象を除いた文字数）が違えば `false`\n\n## 例\n\n- `isAnagram(\"listen\", \"silent\")` → `true`\n- `isAnagram(\"hello\", \"world\")` → `false`\n\n## 考慮すること\n\n両方の文字を並べ替えて比較するか、各文字の出現回数を数えて一致するか確認します。\n\n満たすこと:\n- 'listen' と 'silent' は true\n- 長さが違えば false\n- 大文字小文字・空白は無視する\n\n最初のテストの例:\ntest('listen/silent はアナグラム', () => {\n  expect(isAnagram('listen', 'silent')).toBe(true);\n});\n\nヒント:\n- ソートして比較\n- または文字の出現回数を比較",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "easy"
  },
  {
    "title": "うるう年判定",
    "body": "## 背景\n\n複合的な条件を正しい順序・優先度で組み立てる練習です。条件の境界値テストが効くお題です。\n\n西暦年 `y` を受け取り、うるう年かどうかを判定する `isLeapYear(y)` を実装します。\n\n## ルール\n\nうるう年は次の条件を満たす年です。\n\n1. 4 で割り切れる、かつ\n2. 100 で割り切れない、ただし\n3. 400 で割り切れる年はうるう年\n\n## 例\n\n- `isLeapYear(2000)` → `true`（400 で割り切れる）\n- `isLeapYear(1900)` → `false`（100 で割り切れるが 400 では割り切れない）\n- `isLeapYear(2024)` → `true`\n- `isLeapYear(2023)` → `false`\n\n## 考慮すること\n\n`400 → 100 → 4` の順で判定すると、例外規則が綺麗に表現できます。\n\n満たすこと:\n- 2000 は true（400 で割り切れる）\n- 1900 は false（100 で割り切れるが 400 では割り切れない）\n- 2024 は true、2023 は false\n\n最初のテストの例:\ntest('2000 はうるう年', () => {\n  expect(isLeapYear(2000)).toBe(true);\n});\n\nヒント:\n- 条件の順序に注意（400 → 100 → 4）",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "easy"
  },
  {
    "title": "数値のカンマ区切り",
    "body": "## 背景\n\n文字列操作と符号・桁の扱いを練習するお題です。後ろから 3 桁ごとに区切るというロジックがポイントです。\n\n整数 `n` を受け取り、3 桁ごとにカンマで区切った文字列を返す `formatNumber(n)` を実装します。\n\n## ルール\n\n- 3 桁以下はカンマなし\n- 負の数にも対応する（符号は先頭に残す）\n\n## 例\n\n- `formatNumber(1234567)` → `\"1,234,567\"`\n- `formatNumber(100)` → `\"100\"`\n- `formatNumber(-1234)` → `\"-1,234\"`\n\n## 考慮すること\n\n符号をいったん分離し、絶対値部分を後ろから 3 桁ごとに区切ってから符号を戻すと、場合分けが減ります。\n\n満たすこと:\n- 1234567 は '1,234,567'\n- 3 桁以下はカンマなし（100 は '100'）\n- 負の数も対応（-1234 は '-1,234'）\n\n最初のテストの例:\ntest('1234567 を整形', () => {\n  expect(formatNumber(1234567)).toBe('1,234,567');\n});\n\nヒント:\n- 後ろから 3 桁ごとに区切る\n- 符号を分離して処理すると楽",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "medium"
  },
  {
    "title": "括弧の対応チェック",
    "body": "## 背景\n\nスタックを使った定番のお題です。コンパイラやエディタの括弧チェック機能の縮図でもあります。\n\n`()`, `{}`, `[]` の 3 種類の括弧が正しく対応・ネストしているかを判定する `isBalanced(s)` を実装します。\n\n## ルール\n\n- 開いた括弧は、対応する種類の閉じ括弧で閉じる\n- 交差したネストは不正\n- 閉じ括弧が先に来た場合や、閉じ忘れがある場合も不正\n\n## 例\n\n- `isBalanced(\"([]{})\")` → `true`\n- `isBalanced(\"([)]\")` → `false`（交差）\n- `isBalanced(\"(\")` → `false`（未閉じ）\n\n## 考慮すること\n\n開き括弧をスタックに push し、閉じ括弧が来たら pop して種類が一致するか照合します。最後にスタックが空なら対応が取れています。\n\n満たすこと:\n- '([]{})' は true\n- '([)]' は false（交差はNG）\n- 閉じ括弧が先に来たら false、未閉じも false\n\n最初のテストの例:\ntest('([]{}) は対応している', () => {\n  expect(isBalanced('([]{})')).toBe(true);\n});\n\nヒント:\n- スタックを使う\n- 開き括弧を push、閉じで対応を pop して照合",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "medium"
  },
  {
    "title": "ランレングス圧縮",
    "body": "## 背景\n\n連続する要素をまとめる「ランレングス符号化」の練習です。直前の状態を保持しながら走査するパターンを身につけます。\n\n文字列 `s` を受け取り、連続する同じ文字を「文字＋連続数」に圧縮する `encode(s)` を実装します。\n\n## ルール\n\n- 連続数が 1 でも個数を付ける\n- 空文字列は空文字列を返す\n\n## 例\n\n- `encode(\"aaabbc\")` → `\"a3b2c1\"`\n- `encode(\"abc\")` → `\"a1b1c1\"`\n- `encode(\"\")` → `\"\"`\n\n## 考慮すること\n\n直前の文字とその連続数を保持しながら走査し、文字が変わったタイミングで結果に書き出します。最後の塊の書き出し忘れに注意してください。\n\n満たすこと:\n- 'aaabbc' は 'a3b2c1'\n- 1 文字でも個数を付ける（'abc' は 'a1b1c1'）\n- 空文字列は空文字列\n\n最初のテストの例:\ntest('aaabbc を圧縮', () => {\n  expect(encode('aaabbc')).toBe('a3b2c1');\n});\n\nヒント:\n- 直前の文字と連続数を保持しながら走査する",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "medium"
  },
  {
    "title": "シーザー暗号",
    "body": "## 背景\n\n文字コードの操作と、剰余による巡回を練習する古典的なお題です。\n\n文字列 `s` の各英字を `n` 文字ずらすシーザー暗号 `caesar(s, n)` を実装します。\n\n## ルール\n\n- `z` を超えたら `a` に巡回する\n- 大文字は大文字のまま巡回する\n- 英字以外（数字・記号・空白）はそのまま残す\n\n## 例\n\n- `caesar(\"abc\", 1)` → `\"bcd\"`\n- `caesar(\"xyz\", 3)` → `\"abc\"`\n- `caesar(\"Hello, World!\", 1)` → `\"Ifmmp, Xpsme!\"`\n\n## 考慮すること\n\n`a`（または `A`）を基点にした 0〜25 の値へ変換し、`(値 + n) % 26` で巡回させてから文字に戻すと、はみ出しを綺麗に扱えます。\n\n満たすこと:\n- caesar('abc', 1) は 'bcd'\n- 'z' は 1 ずらすと 'a' に巡回する\n- 大文字は大文字のまま巡回、英字以外は不変\n\n最初のテストの例:\ntest(\"caesar('abc', 1) は 'bcd'\", () => {\n  expect(caesar('abc', 1)).toBe('bcd');\n});\n\nヒント:\n- 文字コードを 26 で剰余して巡回させる",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "medium"
  },
  {
    "title": "二分探索",
    "body": "## 背景\n\n境界条件のミスが起きやすい定番アルゴリズムです。オフバイワンエラーを TDD で潰す練習に向いています。\n\n昇順ソート済みの配列 `arr` から目標値 `target` の添字を返す `binarySearch(arr, target)` を実装します。見つからなければ `-1` を返します。\n\n## ルール\n\n- 計算量は `O(log n)`（線形探索ではない）\n- 存在しない値は `-1`\n\n## 例\n\n- `binarySearch([1, 3, 5, 7, 9], 7)` → `3`\n- `binarySearch([1, 3, 5, 7, 9], 4)` → `-1`\n- `binarySearch([], 1)` → `-1`\n\n## 考慮すること\n\n`lo`, `hi` の中点を求めて分岐します。ループ条件（`lo <= hi`）や中点計算のオーバーフローに注意してください。\n\n満たすこと:\n- [1,3,5,7,9] から 7 は添字 3\n- 存在しない値は -1\n- O(log n) で探索する（線形探索でない）\n\n最初のテストの例:\ntest('7 の添字は 3', () => {\n  expect(binarySearch([1, 3, 5, 7, 9], 7)).toBe(3);\n});\n\nヒント:\n- lo, hi の中点で分岐\n- 境界条件（lo <= hi）に注意",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "medium"
  },
  {
    "title": "2 数の和（Two Sum）",
    "body": "## 背景\n\n「ハッシュマップで計算量を `O(n²)` から `O(n)` に落とす」という発想を学ぶ有名なお題です。\n\n配列 `nums` から、合計が `target` になる 2 要素の添字ペアを返す `twoSum(nums, target)` を実装します。\n\n## ルール\n\n- 同じ要素を 2 回使わない\n- 解は 1 組存在すると仮定してよい\n- 計算量 `O(n)` を目指す\n\n## 例\n\n- `twoSum([2, 7, 11, 15], 9)` → `[0, 1]`\n- `twoSum([3, 2, 4], 6)` → `[1, 2]`\n\n## 考慮すること\n\n走査しながら「これまで見た値 → 添字」をマップに記録し、各要素について `target - 現在値` がマップにあるか調べると 1 回の走査で解けます。\n\n満たすこと:\n- twoSum([2,7,11,15], 9) は [0,1]\n- 同じ要素を 2 回使わない\n- O(n) で解く（ハッシュマップ利用）\n\n最初のテストの例:\ntest('和が 9 になるペア', () => {\n  expect(twoSum([2, 7, 11, 15], 9)).toEqual([0, 1]);\n});\n\nヒント:\n- 『target - 現在値』を map で探す\n- 走査しながら map に記録",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "medium"
  },
  {
    "title": "連結リストの反転",
    "body": "## 背景\n\nポインタ（参照）の付け替えを練習する、データ構造の基本のお題です。\n\n単方向連結リストを反転する `reverse(head)` を実装します。先頭ノードを受け取り、反転後の先頭ノードを返します。\n\n## ルール\n\n- 空リスト・単一ノードも正しく扱う\n- 可能なら新規ノードを作らず、参照の付け替えだけで反転する\n\n## 例\n\n- `1 → 2 → 3` を反転すると `3 → 2 → 1`\n- 空リストを反転すると空リスト\n\n## 考慮すること\n\n`prev`, `curr`, `next` の 3 つの参照を使い、各ノードの `next` を直前のノードへ向け替えながら進めます。`next` を保存し忘れるとリストが切れるので注意してください。\n\n満たすこと:\n- 1→2→3 は 3→2→1 になる\n- 空リスト・単一ノードも正しく扱う\n- 新規ノードを作らず付け替えで反転（できれば）\n\n最初のテストの例:\ntest('1→2→3 を反転', () => {\n  expect(toArray(reverse(fromArray([1, 2, 3])))).toEqual([3, 2, 1]);\n});\n\nヒント:\n- prev, curr, next の 3 ポインタで付け替える",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "medium"
  },
  {
    "title": "区間のマージ",
    "body": "## 背景\n\n「ソートしてから 1 回走査する」という頻出パターンを学ぶお題です。スケジュール調整などで実際に使われます。\n\n重なり合う区間をマージする `merge(intervals)` を実装します。各区間は `[開始, 終了]` の配列です。\n\n## ルール\n\n- 重複・隣接する区間は 1 つにまとめる\n- 重ならない区間はそのまま残す\n\n## 例\n\n- `merge([[1, 3], [2, 6], [8, 10]])` → `[[1, 6], [8, 10]]`\n- `merge([[1, 4], [4, 5]])` → `[[1, 5]]`\n\n## 考慮すること\n\nまず開始位置でソートします。次に直前のマージ済み区間の終端と現区間の開始を比較し、重なっていれば終端を延長、そうでなければ新しい区間として追加します。\n\n満たすこと:\n- 開始でソートしてからマージ\n- 隣接・重複する区間を 1 つにまとめる\n- 重ならない区間はそのまま残す\n\n最初のテストの例:\ntest('区間をマージ', () => {\n  expect(merge([[1, 3], [2, 6], [8, 10]])).toEqual([[1, 6], [8, 10]]);\n});\n\nヒント:\n- 開始位置でソート\n- 直前区間の終端と現区間の開始を比較",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "medium"
  },
  {
    "title": "逆ポーランド記法電卓",
    "body": "## 背景\n\nスタックの応用として定番のお題です。逆ポーランド記法（RPN）は演算子を後置するため、括弧なしで優先順位を表現できます。\n\nトークン列 `tokens` を評価して結果を返す `evalRPN(tokens)` を実装します。\n\n## ルール\n\n- `+`, `-`, `*`, `/` の四則演算に対応する\n- 整数除算の扱い（切り捨て方向など）を決める\n\n## 例\n\n- `evalRPN([\"2\", \"1\", \"+\", \"3\", \"*\"])` → `9`（`(2 + 1) × 3`）\n- `evalRPN([\"4\", \"13\", \"5\", \"/\", \"+\"])` → `6`\n\n## 考慮すること\n\n数値はスタックに積み、演算子が来たら 2 つ取り出して計算し、結果を積み直します。引く順序・割る順序を間違えないよう注意してください。\n\n満たすこと:\n- + - * / の四則演算に対応\n- 整数除算の扱いを決める\n- スタックで評価する\n\n最初のテストの例:\ntest('(2+1)*3 = 9', () => {\n  expect(evalRPN(['2', '1', '+', '3', '*'])).toBe(9);\n});\n\nヒント:\n- 数はスタックに積み、演算子で 2 つ取り出して計算",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "medium"
  },
  {
    "title": "ショッピングカート合計",
    "body": "## 背景\n\n実務に近いドメインで、畳み込み（集計）と割引ルールの適用を練習するお題です。\n\n商品のリスト `items` から合計金額を計算する `total(items)` を実装します。各商品は `{ price, qty }`（単価と個数）を持ちます。\n\n## ルール\n\n- 合計は各商品の `price × qty` の総和\n- 空のカートは `0`\n- 割引率（例: 0.1 = 10% オフ）があれば最後に適用できるようにする（任意の拡張）\n\n## 例\n\n- `total([{ price: 100, qty: 2 }])` → `200`\n- `total([{ price: 100, qty: 2 }, { price: 50, qty: 1 }])` → `250`\n- `total([])` → `0`\n\n## 考慮すること\n\n各明細の小計を畳み込みで加算し、割引はすべて合算した後に一括で適用すると、計算の責務が分離できます。\n\n満たすこと:\n- [{price:100, qty:2}] の合計は 200\n- 空カートは 0\n- 割引率 0.1（10%オフ）を適用できる（任意の拡張）\n\n最初のテストの例:\ntest('合計は 200', () => {\n  expect(total([{ price: 100, qty: 2 }])).toBe(200);\n});\n\nヒント:\n- 畳み込みで price*qty を加算\n- 割引は最後に一括適用",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "medium"
  },
  {
    "title": "パスワード強度チェック",
    "body": "## 背景\n\n複数の独立した条件を組み合わせて判定する練習です。各条件を個別のテストで詰めていけます。\n\nパスワード `pw` が規則を満たすかを判定する `isStrong(pw)` を実装します。\n\n## ルール\n\n次のすべてを満たすとき `true`、1 つでも欠ければ `false`。\n\n1. 8 文字以上\n2. 英大文字を 1 文字以上含む\n3. 英小文字を 1 文字以上含む\n4. 数字を 1 文字以上含む\n\n## 例\n\n- `isStrong(\"Abcd1234\")` → `true`\n- `isStrong(\"abcd1234\")` → `false`（大文字なし）\n- `isStrong(\"Ab1\")` → `false`（短い）\n\n## 考慮すること\n\n各条件を個別のフラグ（真偽値）で求め、最後にすべての AND を取ると、要件とテストが 1 対 1 に対応します。\n\n満たすこと:\n- 8 文字以上\n- 大文字・小文字・数字をそれぞれ 1 文字以上含む\n- 条件を満たさなければ false\n\n最初のテストの例:\ntest(\"'Abcd1234' は強い\", () => {\n  expect(isStrong('Abcd1234')).toBe(true);\n});\n\nヒント:\n- 各条件を個別のフラグで判定して AND を取る",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "medium"
  },
  {
    "title": "電話番号フォーマット",
    "body": "## 背景\n\n入力の正規化（ノイズ除去）と、固定フォーマットへの整形を練習するお題です。\n\n文字列 `s` を受け取り、日本の携帯番号を `090-1234-5678` 形式に整形する `formatPhone(s)` を実装します。\n\n## ルール\n\n- 入力に含まれるハイフン・空白などの非数字は無視する\n- 数字を抽出して 3-4-4 の形に区切る\n- 数字が 11 桁でなければエラー（または `null`）\n\n## 例\n\n- `formatPhone(\"09012345678\")` → `\"090-1234-5678\"`\n- `formatPhone(\"090-1234-5678\")` → `\"090-1234-5678\"`\n- `formatPhone(\"0901234\")` → `null`（桁不足）\n\n## 考慮すること\n\nまず数字だけを抽出し、桁数を検証してから 3-4-4 で区切ります。検証を先に行うと整形ロジックが単純になります。\n\n満たすこと:\n- '09012345678' は '090-1234-5678'\n- ハイフン入り入力も受け付ける\n- 11 桁でなければエラー（または null）\n\n最初のテストの例:\ntest('携帯番号を整形', () => {\n  expect(formatPhone('09012345678')).toBe('090-1234-5678');\n});\n\nヒント:\n- まず数字だけ抽出\n- 3-4-4 で区切る",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "medium"
  },
  {
    "title": "ボウリングのスコア計算",
    "body": "## 背景\n\nTDD の練習として世界的に有名な「Bowling Game Kata」です。ボーナス計算のルールが絡み合い、小さなテストで少しずつ詰めていくのに最適です。\n\n10 フレーム分の投球結果（各投で倒したピン数の配列）`rolls` を受け取り、合計スコアを返す `score(rolls)` を実装します。\n\n## ルール\n\n- 1 フレームは原則 2 投。10 本倒したら次の投球がボーナス対象\n- **スペア**（2 投で 10 本）: 次の 1 投をボーナス加算\n- **ストライク**（1 投で 10 本）: 次の 2 投をボーナス加算\n- 第 10 フレームはボーナス投球が追加される\n\n## 例\n\n- 全ガター（すべて 0）→ `0`\n- オールストライク（パーフェクトゲーム）→ `300`\n\n## 考慮すること\n\nロールの配列を「フレーム単位」で進めるのがコツです。ストライクは 1 投で 1 フレーム、スペア・通常は 2 投で 1 フレーム進みます。ボーナスは配列の次の要素を覗いて加算します。\n\n満たすこと:\n- 全ガター（0 投）は 0 点\n- スペアは次 1 投、ストライクは次 2 投をボーナス加算\n- オールストライク（パーフェクト）は 300 点\n\n最初のテストの例:\ntest('パーフェクトゲームは 300', () => {\n  expect(score(Array(12).fill(10))).toBe(300);\n});\n\nヒント:\n- フレーム単位でロール位置を進める\n- ストライクは 1 投で 1 フレーム",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "hard"
  },
  {
    "title": "LRU キャッシュ",
    "body": "## 背景\n\nデータ構造を組み合わせて計算量の要件を満たす設計力を鍛えるお題です。実際のキャッシュ実装の縮図です。\n\n容量上限つきの LRU（Least Recently Used）キャッシュ `LRUCache` を実装します。\n\n## 振る舞い\n\n- `new LRUCache(capacity)`: 容量を指定して生成\n- `get(key)`: 値を返す。存在しなければ未定義／`null`\n- `put(key, value)`: 値を登録。容量を超えたら最も長く使われていない要素を捨てる\n- `get` / `put` でアクセスした要素は「最新」として扱う\n\n## 例\n\n```\nconst c = new LRUCache(2);\nc.put(\"a\", 1);\nc.put(\"b\", 2);\nc.get(\"a\");      // a が最新になる\nc.put(\"c\", 3);   // 最も古い b が捨てられる\nc.get(\"b\");      // undefined\n```\n\n## 考慮すること\n\n`get` / `put` を `O(1)` で実現するには、ハッシュマップ＋双方向連結リストの組み合わせが定番です。言語に挿入順を保つマップがあればそれでも実装できます。\n\n満たすこと:\n- 容量を超えると最も使われていない要素を捨てる\n- get/put でアクセスした要素は最新扱いになる\n- 存在しないキーの get は未定義/null を返す\n\n最初のテストの例:\ntest('容量超過で最古が捨てられる', () => {\n  const c = new LRUCache(2);\n  c.put('a', 1); c.put('b', 2); c.get('a'); c.put('c', 3);\n  expect(c.get('b')).toBeUndefined();\n});\n\nヒント:\n- ハッシュ + 双方向連結リスト\n- 言語の順序付きマップでも可",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "hard"
  },
  {
    "title": "三目並べの勝敗判定",
    "body": "## 背景\n\n二次元の盤面に対する条件判定と、状態の列挙を整理する練習です。\n\n`3×3` の盤面 `board` を受け取り、勝者または対局状況を判定する `judge(board)` を実装します。各マスは `\"X\"`, `\"O\"`, または空（`\"\"`）です。\n\n## ルール\n\n- 縦・横・斜めのいずれかで 3 つ揃っていれば、その記号が勝者\n- 勝者がいなければ、空きがなければ引き分け、空きがあれば未決\n- 不正な盤面（両者同時勝利など）は考慮しなくてよい\n\n## 例\n\n- `judge([[\"X\",\"X\",\"X\"],[\"O\",\"O\",\"\"],[\"\",\"\",\"\"]])` → `\"X\"`\n- 全マス埋まって勝者なし → 引き分け\n- 空きがあり勝者なし → 未決\n\n## 考慮すること\n\n8 本の勝ち筋（3 行・3 列・2 斜め）を列挙して照合します。勝者判定 → 盤面の空き判定、の順で評価すると整理しやすいです。\n\n満たすこと:\n- 縦・横・斜めの 3 つ揃いを検出する\n- 勝者がいなければ引き分けか未決を返す\n- 不正な盤面（両者勝利など）は考慮しなくてよい\n\n最初のテストの例:\ntest('横一列の X が勝ち', () => {\n  expect(judge([['X','X','X'],['O','O',''],['','','']])).toBe('X');\n});\n\nヒント:\n- 8 つの勝ち筋を列挙して照合\n- 空きが無く勝者なしなら引き分け",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "hard"
  },
  {
    "title": "ネストJSONの平坦化",
    "body": "## 背景\n\n再帰によるツリー走査と、キーのプレフィックス連結を練習するお題です。設定ファイルやログの整形でよく登場します。\n\nネストしたオブジェクト `obj` を、ドット区切りキーの 1 階層オブジェクトに平坦化する `flatten(obj)` を実装します。\n\n## ルール\n\n- ネストした各キーをドットで連結する\n- プリミティブ値はそのまま値にする\n- 配列はインデックスをキーにする（任意の拡張）\n\n## 例\n\n- `flatten({ a: { b: 1 }, c: 2 })` → `{ \"a.b\": 1, c: 2 }`\n- `flatten({ a: { b: { c: 1 } } })` → `{ \"a.b.c\": 1 }`\n\n## 考慮すること\n\n再帰関数に「現在までのキーのプレフィックス」を引数で渡し、オブジェクトに出会ったらキーを連結して再帰、プリミティブに出会ったら結果へ書き込みます。\n\n満たすこと:\n- {a:{b:{c:1}}} は {'a.b.c':1}\n- 配列はインデックスをキーにする（任意）\n- プリミティブ値はそのまま\n\n最初のテストの例:\ntest('ネストを平坦化', () => {\n  expect(flatten({ a: { b: 1 }, c: 2 })).toEqual({ 'a.b': 1, c: 2 });\n});\n\nヒント:\n- 再帰でキーのプレフィックスを連結していく",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "hard"
  },
  {
    "title": "レート制限（トークンバケット）",
    "body": "## 背景\n\n時間に依存するロジックを「時刻を注入してテスト可能にする」設計を学ぶお題です。API のレート制限で実際に使われる方式です。\n\nトークンバケット方式のレート制限器 `RateLimiter` を実装します。バケットには容量があり、一定速度でトークンが補充されます。リクエストごとにトークンを 1 つ消費し、足りなければ拒否します。\n\n## 振る舞い\n\n- `new RateLimiter({ capacity, refillPerSec })`: 容量と補充レートを指定\n- `allow()`: トークンがあれば消費して `true`、なければ `false`\n- 容量 N まで即時に許可し、それ以降は補充を待つ\n- 経過時間に応じてトークンが補充される（上限は容量）\n\n## 例\n\n```\nconst r = new RateLimiter({ capacity: 2, refillPerSec: 1 });\nr.allow(); // true\nr.allow(); // true\nr.allow(); // false（補充待ち）\n```\n\n## 考慮すること\n\n現在時刻を引数や注入で渡せるようにすると、時間経過をテストで再現できます。`経過秒 × 補充レート` を加算し、容量で頭打ちにします。\n\n満たすこと:\n- 容量 N まで即時に許可、それ以降は補充待ち\n- 時間経過でトークンが補充される（時刻は注入可能に）\n- 上限を超えるリクエストは拒否される\n\n最初のテストの例:\ntest('容量を超えると拒否', () => {\n  const r = new RateLimiter({ capacity: 2, refillPerSec: 1 });\n  expect(r.allow()).toBe(true);\n  expect(r.allow()).toBe(true);\n  expect(r.allow()).toBe(false);\n});\n\nヒント:\n- 現在時刻を引数/注入にしてテスト可能にする\n- 経過時間 × 補充レートを加算しつつ容量で頭打ち",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "hard"
  },
  {
    "title": "電卓（式の評価）",
    "body": "## 背景\n\n字句解析（トークナイズ）と構文解析を組み合わせる、総合力が問われるお題です。小さなステップに分けて TDD する練習に最適です。\n\n`+`, `-`, `*`, `/` と括弧を含む算術式の文字列を評価する `evaluate(expr)` を実装します。\n\n## ルール\n\n- 演算子の優先順位（`*`, `/` が `+`, `-` より先）を尊重する\n- 括弧で優先順位を変えられる\n- 空白は無視する\n\n## 例\n\n- `evaluate(\"2 + 3 * 4\")` → `14`（優先順位）\n- `evaluate(\"(2 + 3) * 4\")` → `20`（括弧）\n- `evaluate(\"10 / 2 - 3\")` → `2`\n\n## 考慮すること\n\n「数値の足し算だけ」「掛け算を追加」「括弧を追加」のように段階的に拡張していくと進めやすいです。トークナイズ → 構文解析（操車場アルゴリズムや再帰下降法）の二段構えが定番です。\n\n満たすこと:\n- '2 + 3 * 4' は 14（優先順位）\n- '(2 + 3) * 4' は 20（括弧）\n- 空白は無視する\n\n最初のテストの例:\ntest('優先順位を尊重', () => {\n  expect(evaluate('2 + 3 * 4')).toBe(14);\n});\n\nヒント:\n- トークナイズ → 構文解析（操車場アルゴリズム等）\n- 小さく刻んで TDD する",
    "languages": [
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Ruby",
      "Rust",
      "C#",
      "Kotlin",
      "Swift"
    ],
    "difficulty": "hard"
  }
];
