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
      description:
        "1 から N までの整数を順に出力する。3の倍数は 'Fizz'、5の倍数は 'Buzz'、両方の倍数は 'FizzBuzz' を出力する。",
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
      description:
        "与えられた文字列が回文（前から読んでも後ろから読んでも同じ）かどうかを判定する。大文字小文字は区別しない。英数字のみ考慮する。",
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
      description:
        "整数（1〜3999）をローマ数字表記に変換する。",
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
      description:
        "入金・出金・残高照会ができる銀行口座クラスを実装する。",
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
      description:
        "テニスのゲーム内スコアを計算する。0→Love, 1→15, 2→30, 3→40, デュース、アドバンテージに対応する。",
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
      description:
        "N×N の整数行列を時計回りに 90 度回転させる。",
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
      description:
        "2 つの整数を受け取り、その合計を返す関数 add(a, b) を実装する。TDD の最初の一歩として、まず失敗するテストから始める。",
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
      description:
        "文字列を受け取り、空白を除いた文字数を返す countChars(s) を実装する。",
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
      description:
        "数値の配列を受け取り、最大値を返す maxOf(nums) を実装する。空配列の扱いも決めること。",
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
      description:
        "摂氏を華氏に変換する celsiusToFahrenheit(c) を実装する。式は F = C × 9/5 + 32。",
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
      description:
        "英小文字の文字列に含まれる母音 (a, e, i, o, u) の数を返す countVowels(s) を実装する。",
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
      description:
        "数値配列の合計 sum と平均 average を返す。平均は要素数で割る。",
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
      description:
        "配列から重複を取り除き、初出の順序を保ったまま返す unique(arr) を実装する。",
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
      description:
        "2 つの文字列が互いにアナグラム（同じ文字を並べ替えたもの）か判定する isAnagram(a, b)。",
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
      description:
        "西暦年がうるう年か判定する isLeapYear(y)。4 で割り切れ、かつ 100 で割り切れない、または 400 で割り切れる年。",
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
      description:
        "整数を 3 桁ごとにカンマで区切った文字列にする formatNumber(n)。1234567 → '1,234,567'。",
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
      description:
        "() {} [] が正しく対応・ネストしているか判定する isBalanced(s)。",
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
      description:
        "連続する同じ文字を「文字＋個数」に圧縮する encode(s)。'aaabbc' → 'a3b2c1'。",
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
      description:
        "英字を n 文字ずらすシーザー暗号 caesar(s, n) を実装する。アルファベット以外はそのまま。",
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
      description:
        "昇順ソート済み配列から目標値の添字を返す binarySearch(arr, target)。見つからなければ -1。",
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
      description:
        "配列から合計が target になる 2 要素の添字ペアを返す twoSum(nums, target)。",
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
      description:
        "単方向連結リストを反転する reverse(head)。先頭ノードを受け取り、反転後の先頭を返す。",
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
      description:
        "重なり合う区間をマージする merge(intervals)。[[1,3],[2,6],[8,10]] → [[1,6],[8,10]]。",
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
      description:
        "逆ポーランド記法（RPN）のトークン列を評価する evalRPN(tokens)。['2','1','+','3','*'] → 9。",
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
      description:
        "商品（単価×個数）のリストから合計金額を計算する total(items)。割引率があれば適用する。",
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
      description:
        "パスワードが規則を満たすか判定する isStrong(pw)。8 文字以上・英大文字・小文字・数字を各 1 以上含む。",
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
      description:
        "数字のみの文字列を 090-1234-5678 形式に整形する formatPhone(s)。区切りや非数字は無視。",
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
      description:
        "10 フレームのボウリングのスコアを計算する score(rolls)。ストライク・スペアのボーナスを正しく加算する。",
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
      description:
        "容量上限つきの LRU（Least Recently Used）キャッシュ LRUCache を実装する。get/put は O(1) を目指す。",
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
      description:
        "3×3 の盤面から勝者（'X'/'O'）または引き分け・未決を判定する judge(board)。",
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
      description:
        "ネストしたオブジェクトをドット区切りキーの 1 階層に平坦化する flatten(obj)。{a:{b:1}} → {'a.b':1}。",
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
      description:
        "トークンバケット方式のレート制限器 RateLimiter を実装する。一定速度でトークンが補充され、上限を超えない。",
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
      description:
        "+ - * / と括弧を含む算術式の文字列を評価する evaluate(expr)。演算子の優先順位を尊重する。",
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
