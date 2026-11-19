/**
 * 定型バンクのうち、TDD のお題（#634 で `topic-bank.ts` から分けた）。
 *
 * 先頭の 33 件は、かつて timer-core にあった定型のお題のバンクを畳んだもの（#91）。並びは変えない
 * （`tests/fallback.test.ts` の特性テストが種と並びの対応を固定している）。足すときは末尾へ足す。
 *
 * 本文は Markdown で、「最初のテストの例:」の後ろのテストのコードはコードの囲み（```）で包む
 * （包まないと段落として解析され、コードとして読めない）。
 */
import type { TopicBankEntry } from "./topic-bank.js";

export const TDD_TOPICS: readonly TopicBankEntry[] = [
  {
    "title": "FizzBuzz",
    "body": "## 背景\n\nTDD の入門として定番のお題です。条件分岐とループ、そして「テストを先に書く」感覚を身につけるのに最適です。\n\n整数 `n` を受け取り、その数に応じた文字列を返す関数 `{{slot:fn}}(n)` を実装します。1 から N まで順に処理することもできます。\n\n## ルール\n\n- 3 で割り切れる数は `Fizz`\n- 5 で割り切れる数は `Buzz`\n- 3 でも 5 でも割り切れる数（15 の倍数）は `FizzBuzz`\n- それ以外はその数値そのものを文字列で返す\n\n## 例\n\n- `{{slot:fn}}(1)` → `\"1\"`\n- `{{slot:fn}}(3)` → `\"Fizz\"`\n- `{{slot:fn}}(5)` → `\"Buzz\"`\n- `{{slot:fn}}(15)` → `\"FizzBuzz\"`\n\n## 考慮すること\n\n15 の倍数の判定を先に書かないと、Fizz か Buzz だけが返ってしまいます。条件の順序に注意してください。\n\n満たすこと:\n- 1 から N までループする\n- 3の倍数のとき 'Fizz' を返す\n- 5の倍数のとき 'Buzz' を返す\n- 15の倍数のとき 'FizzBuzz' を返す\n- それ以外はその数値を文字列で返す\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 15の倍数を先にチェックする\n- % 演算子を使う",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('FizzBuzz(15) は FizzBuzz', () => {\n  expect(fizzBuzz(15)).toBe('FizzBuzz');\n});",
        "JavaScript": "test('FizzBuzz(15) は FizzBuzz', () => {\n  expect(fizzBuzz(15)).toBe('FizzBuzz');\n});",
        "Python": "def test_15_is_fizzbuzz():\n    assert fizz_buzz(15) == \"FizzBuzz\"",
        "Java": "@Test\nvoid fifteenIsFizzBuzz() {\n    assertEquals(\"FizzBuzz\", fizzBuzz(15));\n}",
        "Go": "func TestFizzBuzz15(t *testing.T) {\n\tgot := fizzBuzz(15)\n\twant := \"FizzBuzz\"\n\tif got != want {\n\t\tt.Errorf(\"fizzBuzz(15) = %q, want %q\", got, want)\n\t}\n}",
        "Ruby": "class FizzBuzzTest < Minitest::Test\n  def test_15_is_fizzbuzz\n    assert_equal \"FizzBuzz\", fizz_buzz(15)\n  end\nend",
        "Rust": "#[test]\nfn fifteen_is_fizzbuzz() {\n    assert_eq!(fizz_buzz(15), \"FizzBuzz\");\n}",
        "C#": "[Fact]\npublic void FifteenIsFizzBuzz()\n{\n    Assert.Equal(\"FizzBuzz\", FizzBuzz(15));\n}",
        "Kotlin": "@Test\nfun `15 は FizzBuzz`() {\n    assertEquals(\"FizzBuzz\", fizzBuzz(15))\n}",
        "Swift": "func testFifteenIsFizzBuzz() {\n    XCTAssertEqual(fizzBuzz(15), \"FizzBuzz\")\n}"
      },
      "fn": {
        "TypeScript": "fizzBuzz",
        "JavaScript": "fizzBuzz",
        "Python": "fizz_buzz",
        "Java": "fizzBuzz",
        "Go": "fizzBuzz",
        "Ruby": "fizz_buzz",
        "Rust": "fizz_buzz",
        "C#": "FizzBuzz",
        "Kotlin": "fizzBuzz",
        "Swift": "fizzBuzz"
      }
    }
  },
  {
    "title": "回文チェッカー",
    "body": "## 背景\n\n文字列の前処理（正規化）と、両端から中央へ向かう走査を練習するお題です。\n\n文字列 `s` を受け取り、それが回文（前から読んでも後ろから読んでも同じ）かどうかを判定する `{{slot:fn}}(s)` を実装します。\n\n## ルール\n\n- 英数字以外（記号・空白）は無視する\n- 大文字小文字は区別しない\n- 空文字列・単一文字は回文とみなす\n\n## 例\n\n- `{{slot:fn}}(\"A man, a plan, a canal: Panama\")` → `{{slot:yes}}`\n- `{{slot:fn}}(\"race a car\")` → `{{slot:no}}`\n- `{{slot:fn}}(\"\")` → `{{slot:yes}}`\n\n## 考慮すること\n\nまず英数字だけを抽出して小文字化し、その上で逆順と比較するか、左右のポインタで突き合わせます。\n\n満たすこと:\n- 英数字以外の文字は無視する\n- 大文字小文字を区別しない\n- 空文字列は回文とする\n- 単一文字は回文とする\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 正規表現でフィルタリング\n- {{slot:reverse}} と比較",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('\"A man, a plan, a canal: Panama\" は回文', () => {\n  expect(isPalindrome('A man, a plan, a canal: Panama')).toBe(true);\n});",
        "JavaScript": "test('\"A man, a plan, a canal: Panama\" は回文', () => {\n  expect(isPalindrome('A man, a plan, a canal: Panama')).toBe(true);\n});",
        "Python": "def test_panama_is_palindrome():\n    assert is_palindrome(\"A man, a plan, a canal: Panama\")",
        "Java": "@Test\nvoid panamaIsPalindrome() {\n    assertTrue(isPalindrome(\"A man, a plan, a canal: Panama\"));\n}",
        "Go": "func TestPanamaIsPalindrome(t *testing.T) {\n\ts := \"A man, a plan, a canal: Panama\"\n\tif !isPalindrome(s) {\n\t\tt.Errorf(\"isPalindrome(%q) = false, want true\", s)\n\t}\n}",
        "Ruby": "class PalindromeTest < Minitest::Test\n  def test_panama_is_palindrome\n    assert palindrome?(\"A man, a plan, a canal: Panama\")\n  end\nend",
        "Rust": "#[test]\nfn panama_is_palindrome() {\n    assert!(is_palindrome(\"A man, a plan, a canal: Panama\"));\n}",
        "C#": "[Fact]\npublic void PanamaIsPalindrome()\n{\n    Assert.True(IsPalindrome(\"A man, a plan, a canal: Panama\"));\n}",
        "Kotlin": "@Test\nfun `A man a plan a canal Panama は回文`() {\n    assertTrue(isPalindrome(\"A man, a plan, a canal: Panama\"))\n}",
        "Swift": "func testPanamaIsPalindrome() {\n    XCTAssertTrue(isPalindrome(\"A man, a plan, a canal: Panama\"))\n}"
      },
      "fn": {
        "TypeScript": "isPalindrome",
        "JavaScript": "isPalindrome",
        "Python": "is_palindrome",
        "Java": "isPalindrome",
        "Go": "isPalindrome",
        "Ruby": "palindrome?",
        "Rust": "is_palindrome",
        "C#": "IsPalindrome",
        "Kotlin": "isPalindrome",
        "Swift": "isPalindrome"
      },
      "yes": {
        "TypeScript": "true",
        "JavaScript": "true",
        "Python": "True",
        "Java": "true",
        "Go": "true",
        "Ruby": "true",
        "Rust": "true",
        "C#": "true",
        "Kotlin": "true",
        "Swift": "true"
      },
      "no": {
        "TypeScript": "false",
        "JavaScript": "false",
        "Python": "False",
        "Java": "false",
        "Go": "false",
        "Ruby": "false",
        "Rust": "false",
        "C#": "false",
        "Kotlin": "false",
        "Swift": "false"
      },
      "reverse": {
        "TypeScript": "reverse()",
        "JavaScript": "reverse()",
        "Python": "`s[::-1]`",
        "Java": "`new StringBuilder(s).reverse()`",
        "Go": "`slices.Reverse`",
        "Ruby": "`reverse`",
        "Rust": "`chars().rev()`",
        "C#": "`Reverse()`",
        "Kotlin": "`reversed()`",
        "Swift": "`reversed()`"
      }
    }
  },
  {
    "title": "ローマ数字変換",
    "body": "## 背景\n\n「対応表を大きい順に貪欲に消費する」というアルゴリズムの典型例です。減算則の扱いがポイントになります。\n\n整数 `n`（1〜3999）を受け取り、ローマ数字の文字列に変換する `{{slot:fn}}(n)` を実装します。\n\n## 使う記号\n\n- `I`=1, `V`=5, `X`=10, `L`=50, `C`=100, `D`=500, `M`=1000\n\n## 減算則\n\n- `IV`=4, `IX`=9, `XL`=40, `XC`=90, `CD`=400, `CM`=900\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n減算則の値（4, 9, 40, ...）も対応表に含めて値の大きい順に並べておくと、ループ 1 つで素直に書けます。\n\n満たすこと:\n- 1〜3999 の範囲を処理する\n- I, V, X, L, C, D, M の 7 種類を使う\n- 減算則（IV = 4, IX = 9, XL = 40, XC = 90, CD = 400, CM = 900）に対応する\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 対応表を配列で持つ\n- 大きい値から順に引いていく",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "toRoman",
        "JavaScript": "toRoman",
        "Python": "to_roman",
        "Java": "toRoman",
        "Go": "toRoman",
        "Ruby": "to_roman",
        "Rust": "to_roman",
        "C#": "ToRoman",
        "Kotlin": "toRoman",
        "Swift": "toRoman"
      },
      "examples": {
        "TypeScript": "- `toRoman(4)` → `\"IV\"`\n- `toRoman(9)` → `\"IX\"`\n- `toRoman(58)` → `\"LVIII\"`\n- `toRoman(1994)` → `\"MCMXCIV\"`",
        "JavaScript": "- `toRoman(4)` → `\"IV\"`\n- `toRoman(9)` → `\"IX\"`\n- `toRoman(58)` → `\"LVIII\"`\n- `toRoman(1994)` → `\"MCMXCIV\"`",
        "Python": "- `to_roman(4)` → `\"IV\"`\n- `to_roman(9)` → `\"IX\"`\n- `to_roman(58)` → `\"LVIII\"`\n- `to_roman(1994)` → `\"MCMXCIV\"`",
        "Java": "- `toRoman(4)` → `\"IV\"`\n- `toRoman(9)` → `\"IX\"`\n- `toRoman(58)` → `\"LVIII\"`\n- `toRoman(1994)` → `\"MCMXCIV\"`",
        "Go": "- `toRoman(4)` → `\"IV\"`\n- `toRoman(9)` → `\"IX\"`\n- `toRoman(58)` → `\"LVIII\"`\n- `toRoman(1994)` → `\"MCMXCIV\"`",
        "Ruby": "- `to_roman(4)` → `'IV'`\n- `to_roman(9)` → `'IX'`\n- `to_roman(58)` → `'LVIII'`\n- `to_roman(1994)` → `'MCMXCIV'`",
        "Rust": "- `to_roman(4)` → `\"IV\"`\n- `to_roman(9)` → `\"IX\"`\n- `to_roman(58)` → `\"LVIII\"`\n- `to_roman(1994)` → `\"MCMXCIV\"`",
        "C#": "- `ToRoman(4)` → `\"IV\"`\n- `ToRoman(9)` → `\"IX\"`\n- `ToRoman(58)` → `\"LVIII\"`\n- `ToRoman(1994)` → `\"MCMXCIV\"`",
        "Kotlin": "- `toRoman(4)` → `\"IV\"`\n- `toRoman(9)` → `\"IX\"`\n- `toRoman(58)` → `\"LVIII\"`\n- `toRoman(1994)` → `\"MCMXCIV\"`",
        "Swift": "- `toRoman(4)` → `\"IV\"`\n- `toRoman(9)` → `\"IX\"`\n- `toRoman(58)` → `\"LVIII\"`\n- `toRoman(1994)` → `\"MCMXCIV\"`"
      },
      "firstTest": {
        "TypeScript": "test('4 は IV', () => {\n  expect(toRoman(4)).toBe('IV');\n});\ntest('1994 は MCMXCIV', () => {\n  expect(toRoman(1994)).toBe('MCMXCIV');\n});",
        "JavaScript": "test('4 は IV', () => {\n  expect(toRoman(4)).toBe('IV');\n});\ntest('1994 は MCMXCIV', () => {\n  expect(toRoman(1994)).toBe('MCMXCIV');\n});",
        "Python": "def test_four_is_iv():\n    assert to_roman(4) == \"IV\"\n\ndef test_year_1994_is_mcmxciv():\n    assert to_roman(1994) == \"MCMXCIV\"",
        "Java": "@Test\nvoid fourIsIv() {\n    assertEquals(\"IV\", toRoman(4));\n}\n\n@Test\nvoid year1994IsMcmxciv() {\n    assertEquals(\"MCMXCIV\", toRoman(1994));\n}",
        "Go": "func TestFourIsIv(t *testing.T) {\n\tgot := toRoman(4)\n\twant := \"IV\"\n\tif got != want {\n\t\tt.Errorf(\"got %q, want %q\", got, want)\n\t}\n}\n\nfunc TestYear1994IsMcmxciv(t *testing.T) {\n\tgot := toRoman(1994)\n\twant := \"MCMXCIV\"\n\tif got != want {\n\t\tt.Errorf(\"got %q, want %q\", got, want)\n\t}\n}",
        "Ruby": "class RomanTest < Minitest::Test\n  def test_four_is_iv\n    assert_equal 'IV', to_roman(4)\n  end\n\n  def test_year_1994_is_mcmxciv\n    assert_equal 'MCMXCIV', to_roman(1994)\n  end\nend",
        "Rust": "#[test]\nfn four_is_iv() {\n    assert_eq!(to_roman(4), \"IV\");\n}\n\n#[test]\nfn year_1994_is_mcmxciv() {\n    assert_eq!(to_roman(1994), \"MCMXCIV\");\n}",
        "C#": "[Fact]\npublic void FourIsIv()\n{\n    Assert.Equal(\"IV\", ToRoman(4));\n}\n\n[Fact]\npublic void Year1994IsMcmxciv()\n{\n    Assert.Equal(\"MCMXCIV\", ToRoman(1994));\n}",
        "Kotlin": "@Test\nfun fourIsIv() {\n    assertEquals(\"IV\", toRoman(4))\n}\n\n@Test\nfun year1994IsMcmxciv() {\n    assertEquals(\"MCMXCIV\", toRoman(1994))\n}",
        "Swift": "func testFourIsIv() {\n    XCTAssertEqual(toRoman(4), \"IV\")\n}\n\nfunc testYear1994IsMcmxciv() {\n    XCTAssertEqual(toRoman(1994), \"MCMXCIV\")\n}"
      }
    }
  },
  {
    "title": "銀行口座",
    "body": "## 背景\n\n状態を持つクラスの設計と、不変条件（残高は負にならない）の守り方を練習するお題です。例外処理の TDD にも向いています。\n\n入金・出金・残高照会ができる `BankAccount` クラスを実装します。\n\n## 振る舞い\n\n- `{{slot:deposit}}`: 入金する。金額は正の数のみ許可\n- `{{slot:withdraw}}`: 出金する。残高を超える出金は拒否\n- `{{slot:balance}}`: 現在の残高を返す\n- 取引履歴を記録できるようにする\n\n## 例\n\n```\n{{slot:code1}}\n```\n\n## 考慮すること\n\n- 不正な入金・出金（負の額、残高超過）は{{slot:err}}で表現する\n- 不変条件「残高 >= 0」を常に保つ\n\n満たすこと:\n- 入金は正の金額のみ許可する\n- 出金は残高を超えてはいけない\n- 取引履歴を管理する\n- 残高照会が正しい値を返す\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 不変式（残高 >= 0）を守る\n- エラーは{{slot:err}}で表現",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "code1": {
        "TypeScript": "const account = new BankAccount();\naccount.deposit(100);   // balance = 100\naccount.withdraw(30);   // balance = 70",
        "JavaScript": "const account = new BankAccount();\naccount.deposit(100);   // balance = 100\naccount.withdraw(30);   // balance = 70",
        "Python": "account = BankAccount()\naccount.deposit(100)  # balance = 100\naccount.withdraw(30)  # balance = 70",
        "Java": "var account = new BankAccount();\naccount.deposit(100);   // getBalance() = 100\naccount.withdraw(30);   // getBalance() = 70",
        "Go": "account := &BankAccount{}\naccount.Deposit(100) // Balance() = 100\naccount.Withdraw(30) // Balance() = 70",
        "Ruby": "account = BankAccount.new\naccount.deposit(100)   # balance = 100\naccount.withdraw(30)   # balance = 70",
        "Rust": "let mut account = BankAccount::new();\naccount.deposit(100)?;  // balance() = 100\naccount.withdraw(30)?;  // balance() = 70",
        "C#": "var account = new BankAccount();\naccount.Deposit(100);   // Balance = 100\naccount.Withdraw(30);   // Balance = 70",
        "Kotlin": "val account = BankAccount()\naccount.deposit(100)   // balance = 100\naccount.withdraw(30)   // balance = 70",
        "Swift": "let account = BankAccount()\ntry account.deposit(100)   // balance = 100\ntry account.withdraw(30)   // balance = 70"
      },
      "firstTest": {
        "TypeScript": "test('入金後の残高が正しい', () => {\n  const account: BankAccount = new BankAccount();\n  account.deposit(100);\n  expect(account.balance).toBe(100);\n});",
        "JavaScript": "test('入金後の残高が正しい', () => {\n  const account = new BankAccount();\n  account.deposit(100);\n  expect(account.balance).toBe(100);\n});",
        "Python": "def test_balance_after_deposit():\n    account = BankAccount()\n    account.deposit(100)\n    assert account.balance == 100",
        "Java": "@Test\nvoid balanceAfterDeposit() {\n    var account = new BankAccount();\n    account.deposit(100);\n    assertEquals(100, account.getBalance());\n}",
        "Go": "func TestBalanceAfterDeposit(t *testing.T) {\n\taccount := &BankAccount{}\n\tif err := account.Deposit(100); err != nil {\n\t\tt.Fatal(err)\n\t}\n\tif got, want := account.Balance(), 100; got != want {\n\t\tt.Errorf(\"Balance() = %d, want %d\", got, want)\n\t}\n}",
        "Ruby": "class BankAccountTest < Minitest::Test\n  def test_balance_after_deposit\n    account = BankAccount.new\n    account.deposit(100)\n    assert_equal 100, account.balance\n  end\nend",
        "Rust": "#[test]\nfn balance_after_deposit() {\n    let mut account = BankAccount::new();\n    account.deposit(100).unwrap();\n    assert_eq!(account.balance(), 100);\n}",
        "C#": "[Fact]\npublic void BalanceAfterDeposit()\n{\n    var account = new BankAccount();\n    account.Deposit(100);\n    Assert.Equal(100, account.Balance);\n}",
        "Kotlin": "@Test\nfun `入金後の残高が正しい`() {\n    val account = BankAccount()\n    account.deposit(100)\n    assertEquals(100, account.balance)\n}",
        "Swift": "func testBalanceAfterDeposit() throws {\n    let account = BankAccount()\n    try account.deposit(100)\n    XCTAssertEqual(account.balance, 100)\n}"
      },
      "deposit": {
        "TypeScript": "deposit(amount: number)",
        "JavaScript": "deposit(amount)",
        "Python": "deposit(amount)",
        "Java": "deposit(amount)",
        "Go": "Deposit(amount)",
        "Ruby": "deposit(amount)",
        "Rust": "deposit(amount)",
        "C#": "Deposit(amount)",
        "Kotlin": "deposit(amount)",
        "Swift": "deposit(amount)"
      },
      "withdraw": {
        "TypeScript": "withdraw(amount: number)",
        "JavaScript": "withdraw(amount)",
        "Python": "withdraw(amount)",
        "Java": "withdraw(amount)",
        "Go": "Withdraw(amount)",
        "Ruby": "withdraw(amount)",
        "Rust": "withdraw(amount)",
        "C#": "Withdraw(amount)",
        "Kotlin": "withdraw(amount)",
        "Swift": "withdraw(amount)"
      },
      "balance": {
        "TypeScript": "balance",
        "JavaScript": "balance",
        "Python": "balance",
        "Java": "getBalance()",
        "Go": "Balance()",
        "Ruby": "balance",
        "Rust": "balance()",
        "C#": "Balance",
        "Kotlin": "balance",
        "Swift": "balance"
      },
      "err": {
        "TypeScript": "例外",
        "JavaScript": "例外",
        "Python": "例外",
        "Java": "例外",
        "Go": "戻り値の `error`",
        "Ruby": "例外",
        "Rust": "戻り値の `Err`（`Result`）",
        "C#": "例外",
        "Kotlin": "例外",
        "Swift": "例外"
      }
    }
  },
  {
    "title": "テニスゲームスコア",
    "body": "## 背景\n\nルールが複雑に絡み合うドメインを、場合分けで整理する練習です。状態遷移を小さなテストで詰めていく典型的なお題です。\n\n両プレイヤーの獲得ポイント数を受け取り、テニスの「ゲーム内スコア」表示を返す `{{slot:fn}}(p1, p2)` を実装します。\n\n## ルール\n\n- 0/1/2/3 点はそれぞれ `Love`/`15`/`30`/`40`\n- 両者 3 点（40-40）は `Deuce`\n- デュース以降、片方が 1 点リードすると `Advantage`\n- リード側がさらに得点するとゲーム終了\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n両者が同点のときと差があるときで表示が変わります。対称性を意識すると分岐が減らせます。\n\n満たすこと:\n- 0〜3 点を Love/15/30/40 で表示\n- 両者 40 点はデュース\n- デュース後のリードはアドバンテージ\n- アドバンテージから得点でゲーム終了\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 状態で場合分け\n- 対称性を活用",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "score",
        "JavaScript": "score",
        "Python": "score",
        "Java": "score",
        "Go": "score",
        "Ruby": "score",
        "Rust": "score",
        "C#": "Score",
        "Kotlin": "score",
        "Swift": "score"
      },
      "examples": {
        "TypeScript": "- `score(0, 0)` → `\"Love-All\"`\n- `score(1, 0)` → `\"15-Love\"`\n- `score(3, 3)` → `\"Deuce\"`",
        "JavaScript": "- `score(0, 0)` → `\"Love-All\"`\n- `score(1, 0)` → `\"15-Love\"`\n- `score(3, 3)` → `\"Deuce\"`",
        "Python": "- `score(0, 0)` → `\"Love-All\"`\n- `score(1, 0)` → `\"15-Love\"`\n- `score(3, 3)` → `\"Deuce\"`",
        "Java": "- `score(0, 0)` → `\"Love-All\"`\n- `score(1, 0)` → `\"15-Love\"`\n- `score(3, 3)` → `\"Deuce\"`",
        "Go": "- `score(0, 0)` → `\"Love-All\"`\n- `score(1, 0)` → `\"15-Love\"`\n- `score(3, 3)` → `\"Deuce\"`",
        "Ruby": "- `score(0, 0)` → `'Love-All'`\n- `score(1, 0)` → `'15-Love'`\n- `score(3, 3)` → `'Deuce'`",
        "Rust": "- `score(0, 0)` → `\"Love-All\"`\n- `score(1, 0)` → `\"15-Love\"`\n- `score(3, 3)` → `\"Deuce\"`",
        "C#": "- `Score(0, 0)` → `\"Love-All\"`\n- `Score(1, 0)` → `\"15-Love\"`\n- `Score(3, 3)` → `\"Deuce\"`",
        "Kotlin": "- `score(0, 0)` → `\"Love-All\"`\n- `score(1, 0)` → `\"15-Love\"`\n- `score(3, 3)` → `\"Deuce\"`",
        "Swift": "- `score(0, 0)` → `\"Love-All\"`\n- `score(1, 0)` → `\"15-Love\"`\n- `score(3, 3)` → `\"Deuce\"`"
      },
      "firstTest": {
        "TypeScript": "test('0-0 は Love-All', () => {\n  expect(score(0, 0)).toBe('Love-All');\n});\ntest('3-3 はDeuce', () => {\n  expect(score(3, 3)).toBe('Deuce');\n});",
        "JavaScript": "test('0-0 は Love-All', () => {\n  expect(score(0, 0)).toBe('Love-All');\n});\ntest('3-3 はDeuce', () => {\n  expect(score(3, 3)).toBe('Deuce');\n});",
        "Python": "def test_love_all_at_zero():\n    assert score(0, 0) == \"Love-All\"\n\ndef test_deuce_at_three_all():\n    assert score(3, 3) == \"Deuce\"",
        "Java": "@Test\nvoid loveAllAtZero() {\n    assertEquals(\"Love-All\", score(0, 0));\n}\n\n@Test\nvoid deuceAtThreeAll() {\n    assertEquals(\"Deuce\", score(3, 3));\n}",
        "Go": "func TestLoveAllAtZero(t *testing.T) {\n\tgot := score(0, 0)\n\twant := \"Love-All\"\n\tif got != want {\n\t\tt.Errorf(\"got %q, want %q\", got, want)\n\t}\n}\n\nfunc TestDeuceAtThreeAll(t *testing.T) {\n\tgot := score(3, 3)\n\twant := \"Deuce\"\n\tif got != want {\n\t\tt.Errorf(\"got %q, want %q\", got, want)\n\t}\n}",
        "Ruby": "class TennisScoreTest < Minitest::Test\n  def test_love_all_at_zero\n    assert_equal 'Love-All', score(0, 0)\n  end\n\n  def test_deuce_at_three_all\n    assert_equal 'Deuce', score(3, 3)\n  end\nend",
        "Rust": "#[test]\nfn love_all_at_zero() {\n    assert_eq!(score(0, 0), \"Love-All\");\n}\n\n#[test]\nfn deuce_at_three_all() {\n    assert_eq!(score(3, 3), \"Deuce\");\n}",
        "C#": "[Fact]\npublic void LoveAllAtZero()\n{\n    Assert.Equal(\"Love-All\", Score(0, 0));\n}\n\n[Fact]\npublic void DeuceAtThreeAll()\n{\n    Assert.Equal(\"Deuce\", Score(3, 3));\n}",
        "Kotlin": "@Test\nfun loveAllAtZero() {\n    assertEquals(\"Love-All\", score(0, 0))\n}\n\n@Test\nfun deuceAtThreeAll() {\n    assertEquals(\"Deuce\", score(3, 3))\n}",
        "Swift": "func testLoveAllAtZero() {\n    XCTAssertEqual(score(0, 0), \"Love-All\")\n}\n\nfunc testDeuceAtThreeAll() {\n    XCTAssertEqual(score(3, 3), \"Deuce\")\n}"
      }
    }
  },
  {
    "title": "行列の回転",
    "body": "## 背景\n\n二次元配列のインデックス操作を整理する練習です。座標変換のイメージを掴むのに役立ちます。\n\n`N×N` の整数行列を時計回りに 90 度回転させた新しい行列を返す `{{slot:name}}(matrix)` を実装します。\n\n## 例\n\n```\n{{slot:code1}}\n```\n\n- `{{slot:name}}([[1,2,3],[4,5,6],[7,8,9]])` → `[[7,4,1],[8,5,2],[9,6,3]]`\n\n## 考慮すること\n\n- 元の行列を破壊せず、新しい行列を返す\n- 「転置してから各行を反転」する方法か、`new[i][j] = old[N-1-j][i]` の直接計算で実装できます\n\n満たすこと:\n- 正方行列（N×N）を処理する\n- 時計回りに 90 度回転する\n- 元の行列を変更しない（新しい行列を返す）\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 行列転置 + 行反転\n- または直接インデックス計算",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "name": {
        "TypeScript": "rotate",
        "JavaScript": "rotate",
        "Python": "rotate",
        "Java": "rotate",
        "Go": "rotate",
        "Ruby": "rotate",
        "Rust": "rotate",
        "C#": "Rotate",
        "Kotlin": "rotate",
        "Swift": "rotate"
      },
      "code1": {
        "TypeScript": "rotate([[1, 2],\n        [3, 4]])\n→ [[3, 1],\n   [4, 2]]",
        "JavaScript": "rotate([[1, 2],\n        [3, 4]])\n→ [[3, 1],\n   [4, 2]]",
        "Python": "rotate([[1, 2],\n        [3, 4]])\n# → [[3, 1],\n#    [4, 2]]",
        "Java": "rotate(new int[][] {{1, 2},\n                    {3, 4}})\n// → {{3, 1},\n//    {4, 2}}",
        "Go": "rotate([][]int{{1, 2}, {3, 4}})\n// → [][]int{{3, 1}, {4, 2}}",
        "Ruby": "rotate([[1, 2],\n        [3, 4]])\n# => [[3, 1],\n#     [4, 2]]",
        "Rust": "rotate(&[vec![1, 2],\n         vec![3, 4]])\n// → vec![vec![3, 1],\n//        vec![4, 2]]",
        "C#": "Rotate([[1, 2],\n        [3, 4]])\n// → [[3, 1],\n//    [4, 2]]",
        "Kotlin": "rotate(listOf(listOf(1, 2),\n              listOf(3, 4)))\n// → [[3, 1],\n//    [4, 2]]",
        "Swift": "rotate([[1, 2],\n        [3, 4]])\n// → [[3, 1],\n//    [4, 2]]"
      },
      "firstTest": {
        "TypeScript": "test('2×2行列の回転', () => {\n  const m: number[][] = [[1, 2], [3, 4]];\n  expect(rotate(m)).toEqual([[3, 1], [4, 2]]);\n});",
        "JavaScript": "test('2×2行列の回転', () => {\n  const m = [[1, 2], [3, 4]];\n  expect(rotate(m)).toEqual([[3, 1], [4, 2]]);\n});",
        "Python": "def test_rotate_2x2():\n    m = [[1, 2], [3, 4]]\n    assert rotate(m) == [[3, 1], [4, 2]]",
        "Java": "@Test\nvoid rotates2x2() {\n    int[][] m = {{1, 2}, {3, 4}};\n    assertArrayEquals(new int[][] {{3, 1}, {4, 2}}, rotate(m));\n}",
        "Go": "func TestRotate2x2(t *testing.T) {\n\tm := [][]int{{1, 2}, {3, 4}}\n\twant := [][]int{{3, 1}, {4, 2}}\n\tif got := rotate(m); !reflect.DeepEqual(got, want) {\n\t\tt.Errorf(\"rotate(%v) = %v, want %v\", m, got, want)\n\t}\n}",
        "Ruby": "class RotateTest < Minitest::Test\n  def test_rotate_2x2\n    m = [[1, 2], [3, 4]]\n    assert_equal [[3, 1], [4, 2]], rotate(m)\n  end\nend",
        "Rust": "#[test]\nfn rotates_2x2() {\n    let m = vec![vec![1, 2], vec![3, 4]];\n    assert_eq!(rotate(&m), vec![vec![3, 1], vec![4, 2]]);\n}",
        "C#": "[Fact]\npublic void Rotates2x2()\n{\n    int[][] m = [[1, 2], [3, 4]];\n    int[][] expected = [[3, 1], [4, 2]];\n    Assert.Equal(expected, Rotate(m));\n}",
        "Kotlin": "@Test\nfun rotates2x2() {\n    val m = listOf(listOf(1, 2), listOf(3, 4))\n    assertEquals(listOf(listOf(3, 1), listOf(4, 2)), rotate(m))\n}",
        "Swift": "func testRotates2x2() {\n    let m = [[1, 2], [3, 4]]\n    XCTAssertEqual(rotate(m), [[3, 1], [4, 2]])\n}"
      }
    }
  },
  {
    "title": "二数の和",
    "body": "## 背景\n\nTDD の最初の一歩に最適な、最小のお題です。「まず失敗するテストを書く → 通す → 整える」というリズムを体で覚えましょう。\n\n2 つの整数を受け取り、その合計を返す関数 `{{slot:fn}}(a, b)` を実装します。\n\n## 例\n\n- `{{slot:fn}}(2, 3)` → `5`\n- `{{slot:fn}}(-1, 1)` → `0`\n- `{{slot:fn}}(0, 0)` → `0`\n\n## 考慮すること\n\n最初は `return 5` のような固定値（仮実装）でテストを通し、別の入力でテストを増やして一般化する（三角測量）と、TDD の流れを体感できます。\n\n満たすこと:\n- {{slot:fn}}(2, 3) は 5 を返す\n- 負の数も扱える（{{slot:fn}}(-1, 1) は 0）\n- 0 同士の加算は 0\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- まず固定値を返してテストを通し、その後一般化する（仮実装→三角測量）",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('add(2, 3) は 5', () => {\n  expect(add(2, 3)).toBe(5);\n});",
        "JavaScript": "test('add(2, 3) は 5', () => {\n  expect(add(2, 3)).toBe(5);\n});",
        "Python": "def test_add_2_and_3():\n    assert add(2, 3) == 5",
        "Java": "@Test\nvoid twoPlusThreeIsFive() {\n    assertEquals(5, add(2, 3));\n}",
        "Go": "func TestAdd2And3(t *testing.T) {\n\tgot := add(2, 3)\n\twant := 5\n\tif got != want {\n\t\tt.Errorf(\"add(2, 3) = %d, want %d\", got, want)\n\t}\n}",
        "Ruby": "class AddTest < Minitest::Test\n  def test_2_plus_3_is_5\n    assert_equal 5, add(2, 3)\n  end\nend",
        "Rust": "#[test]\nfn two_plus_three_is_five() {\n    assert_eq!(add(2, 3), 5);\n}",
        "C#": "[Fact]\npublic void TwoPlusThreeIsFive()\n{\n    Assert.Equal(5, Add(2, 3));\n}",
        "Kotlin": "@Test\nfun `add(2, 3) は 5`() {\n    assertEquals(5, add(2, 3))\n}",
        "Swift": "func testTwoPlusThreeIsFive() {\n    XCTAssertEqual(add(2, 3), 5)\n}"
      },
      "fn": {
        "TypeScript": "add",
        "JavaScript": "add",
        "Python": "add",
        "Java": "add",
        "Go": "add",
        "Ruby": "add",
        "Rust": "add",
        "C#": "Add",
        "Kotlin": "add",
        "Swift": "add"
      }
    }
  },
  {
    "title": "文字数カウント",
    "body": "## 背景\n\n文字列の前処理と長さ取得の基本を練習するお題です。\n\n文字列 `s` を受け取り、空白を除いた文字数を返す `{{slot:fn}}(s)` を実装します。\n\n## ルール\n\n- 前後・途中のすべての空白を数えない\n- 空文字列は `0`\n- 全角文字も 1 文字として数える\n\n## 例\n\n- `{{slot:fn}}(\"a b c\")` → `3`\n- `{{slot:fn}}(\"  hello  \")` → `5`\n- `{{slot:fn}}(\"\")` → `0`\n\n## 考慮すること\n\n空白を除去してから長さを取ります。{{slot:wsHow}}が使えます。\n\n満たすこと:\n- 前後・途中の空白を数えない\n- 空文字列は 0\n- 全角文字も 1 文字として数える\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 空白を除去してから長さを取る\n- {{slot:wsHint}} が使える",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('\"a b c\" は 3', () => {\n  expect(countChars('a b c')).toBe(3);\n});",
        "JavaScript": "test('\"a b c\" は 3', () => {\n  expect(countChars('a b c')).toBe(3);\n});",
        "Python": "def test_a_b_c_is_3():\n    assert count_chars(\"a b c\") == 3",
        "Java": "@Test\nvoid aBCIsThree() {\n    assertEquals(3, countChars(\"a b c\"));\n}",
        "Go": "func TestCountCharsABC(t *testing.T) {\n\tgot := countChars(\"a b c\")\n\twant := 3\n\tif got != want {\n\t\tt.Errorf(\"countChars(\\\"a b c\\\") = %d, want %d\", got, want)\n\t}\n}",
        "Ruby": "class CountCharsTest < Minitest::Test\n  def test_a_b_c_is_3\n    assert_equal 3, count_chars(\"a b c\")\n  end\nend",
        "Rust": "#[test]\nfn a_b_c_is_3() {\n    assert_eq!(count_chars(\"a b c\"), 3);\n}",
        "C#": "[Fact]\npublic void ABCIsThree()\n{\n    Assert.Equal(3, CountChars(\"a b c\"));\n}",
        "Kotlin": "@Test\nfun `a b c は 3`() {\n    assertEquals(3, countChars(\"a b c\"))\n}",
        "Swift": "func testABCIsThree() {\n    XCTAssertEqual(countChars(\"a b c\"), 3)\n}"
      },
      "fn": {
        "TypeScript": "countChars",
        "JavaScript": "countChars",
        "Python": "count_chars",
        "Java": "countChars",
        "Go": "countChars",
        "Ruby": "count_chars",
        "Rust": "count_chars",
        "C#": "CountChars",
        "Kotlin": "countChars",
        "Swift": "countChars"
      },
      "wsHow": {
        "TypeScript": "正規表現 `/\\s/g` での置換",
        "JavaScript": "正規表現 `/\\s/g` での置換",
        "Python": "正規表現 `\\s`（`re.sub`）での置換",
        "Java": "正規表現 `\\s`（`replaceAll`）での置換",
        "Go": "正規表現 `\\s`（`regexp`）での置換",
        "Ruby": "正規表現 `/\\s/`（`gsub`）での置換",
        "Rust": "`char::is_whitespace` での絞り込み",
        "C#": "正規表現 `\\s`（`Regex.Replace`）での置換",
        "Kotlin": "正規表現 `\\s`（`Regex`）での置換",
        "Swift": "`Character.isWhitespace` での絞り込み"
      },
      "wsHint": {
        "TypeScript": "正規表現 /\\s/g",
        "JavaScript": "正規表現 /\\s/g",
        "Python": "`re.sub` と正規表現 `\\s`",
        "Java": "`replaceAll` と正規表現 `\\s`",
        "Go": "`regexp` と正規表現 `\\s`",
        "Ruby": "`gsub` と正規表現 `/\\s/`",
        "Rust": "`char::is_whitespace`",
        "C#": "`Regex.Replace` と正規表現 `\\s`",
        "Kotlin": "`Regex` と正規表現 `\\s`",
        "Swift": "`Character.isWhitespace`"
      }
    }
  },
  {
    "title": "最大値を探す",
    "body": "## 背景\n\n配列の走査・畳み込み（{{slot:reduce}}）と、エッジケース（空配列）の扱いを決める練習です。\n\n数値の配列を受け取り、最大値を返す `{{slot:fn}}(nums)` を実装します。\n\n## ルール\n\n- 要素が複数あれば最大値を返す\n- 要素が 1 つならその値\n- 空配列は `{{slot:none}}`（または言語の妥当な表現）を返す\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n空配列を先に弾いてから、{{slot:reduce}} で逐次的に大きい方を選んでいくと安全です。\n\n満たすこと:\n- [3, 1, 4, 1, 5] は 5\n- 要素が 1 つならその値\n- 空配列は {{slot:none}}（または言語の妥当な表現）を返す\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 畳み込み（{{slot:reduce}}）で実装できる\n- 空配列を先に弾く",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('最大値は 5', () => {\n  expect(maxOf([3, 1, 4, 1, 5])).toBe(5);\n});",
        "JavaScript": "test('最大値は 5', () => {\n  expect(maxOf([3, 1, 4, 1, 5])).toBe(5);\n});",
        "Python": "def test_max_is_5():\n    assert max_of([3, 1, 4, 1, 5]) == 5",
        "Java": "@Test\nvoid maxIsFive() {\n    assertEquals(Optional.of(5), maxOf(List.of(3, 1, 4, 1, 5)));\n}",
        "Go": "func TestMaxOf(t *testing.T) {\n\tgot, ok := maxOf([]int{3, 1, 4, 1, 5})\n\tif !ok || got != 5 {\n\t\tt.Errorf(\"maxOf() = %d, %v, want 5, true\", got, ok)\n\t}\n}",
        "Ruby": "class MaxOfTest < Minitest::Test\n  def test_max_is_5\n    assert_equal 5, max_of([3, 1, 4, 1, 5])\n  end\nend",
        "Rust": "#[test]\nfn max_is_5() {\n    assert_eq!(max_of(&[3, 1, 4, 1, 5]), Some(5));\n}",
        "C#": "[Fact]\npublic void MaxIsFive()\n{\n    Assert.Equal(5, MaxOf([3, 1, 4, 1, 5]));\n}",
        "Kotlin": "@Test\nfun `最大値は 5`() {\n    assertEquals(5, maxOf(listOf(3, 1, 4, 1, 5)))\n}",
        "Swift": "func testMaxIsFive() {\n    XCTAssertEqual(maxOf([3, 1, 4, 1, 5]), 5)\n}"
      },
      "examples": {
        "TypeScript": "- `maxOf([3, 1, 4, 1, 5])` → `5`\n- `maxOf([42])` → `42`\n- `maxOf([])` → `null`",
        "JavaScript": "- `maxOf([3, 1, 4, 1, 5])` → `5`\n- `maxOf([42])` → `42`\n- `maxOf([])` → `null`",
        "Python": "- `max_of([3, 1, 4, 1, 5])` → `5`\n- `max_of([42])` → `42`\n- `max_of([])` → `None`",
        "Java": "- `maxOf(List.of(3, 1, 4, 1, 5))` → `Optional.of(5)`\n- `maxOf(List.of(42))` → `Optional.of(42)`\n- `maxOf(List.of())` → `Optional.empty()`",
        "Go": "- `maxOf([]int{3, 1, 4, 1, 5})` → `5, true`\n- `maxOf([]int{42})` → `42, true`\n- `maxOf([]int{})` → `0, false`",
        "Ruby": "- `max_of([3, 1, 4, 1, 5])` → `5`\n- `max_of([42])` → `42`\n- `max_of([])` → `nil`",
        "Rust": "- `max_of(&[3, 1, 4, 1, 5])` → `Some(5)`\n- `max_of(&[42])` → `Some(42)`\n- `max_of(&[])` → `None`",
        "C#": "- `MaxOf([3, 1, 4, 1, 5])` → `5`\n- `MaxOf([42])` → `42`\n- `MaxOf([])` → `null`",
        "Kotlin": "- `maxOf(listOf(3, 1, 4, 1, 5))` → `5`\n- `maxOf(listOf(42))` → `42`\n- `maxOf(emptyList())` → `null`",
        "Swift": "- `maxOf([3, 1, 4, 1, 5])` → `5`\n- `maxOf([42])` → `42`\n- `maxOf([])` → `nil`"
      },
      "fn": {
        "TypeScript": "maxOf",
        "JavaScript": "maxOf",
        "Python": "max_of",
        "Java": "maxOf",
        "Go": "maxOf",
        "Ruby": "max_of",
        "Rust": "max_of",
        "C#": "MaxOf",
        "Kotlin": "maxOf",
        "Swift": "maxOf"
      },
      "none": {
        "TypeScript": "null",
        "JavaScript": "null",
        "Python": "None",
        "Java": "Optional.empty()",
        "Go": "0, false",
        "Ruby": "nil",
        "Rust": "None",
        "C#": "null",
        "Kotlin": "null",
        "Swift": "nil"
      },
      "reduce": {
        "TypeScript": "reduce",
        "JavaScript": "reduce",
        "Python": "`functools.reduce`",
        "Java": "`Stream.reduce`",
        "Go": "`for range`",
        "Ruby": "`reduce`",
        "Rust": "`Iterator::reduce`",
        "C#": "`Aggregate`",
        "Kotlin": "`reduceOrNull`",
        "Swift": "`reduce`"
      }
    }
  },
  {
    "title": "温度変換",
    "body": "## 背景\n\n単純な計算式の実装と、浮動小数点の比較に関する注意を学ぶお題です。\n\n摂氏 `c` を受け取り華氏に変換する `{{slot:fn}}(c)` を実装します。変換式は次のとおりです。\n\n```\nF = C × 9 / 5 + 32\n```\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n小数を含む結果の比較では浮動小数点の誤差が出ることがあります。必要に応じて近似比較（許容誤差つき）を使ってください。\n\n満たすこと:\n- 0℃ は 32°F\n- 100℃ は 212°F\n- 小数点以下も正しく扱う（37℃ は 98.6°F）\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 浮動小数の比較は誤差に注意（必要なら近似比較）",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('0℃ は 32°F', () => {\n  expect(celsiusToFahrenheit(0)).toBe(32);\n});",
        "JavaScript": "test('0℃ は 32°F', () => {\n  expect(celsiusToFahrenheit(0)).toBe(32);\n});",
        "Python": "def test_0c_is_32f():\n    assert celsius_to_fahrenheit(0) == 32",
        "Java": "@Test\nvoid zeroCelsiusIs32Fahrenheit() {\n    assertEquals(32.0, celsiusToFahrenheit(0), 1e-9);\n}",
        "Go": "func TestZeroCelsius(t *testing.T) {\n\tgot := celsiusToFahrenheit(0)\n\twant := 32.0\n\tif got != want {\n\t\tt.Errorf(\"celsiusToFahrenheit(0) = %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class CelsiusToFahrenheitTest < Minitest::Test\n  def test_0c_is_32f\n    assert_equal 32, celsius_to_fahrenheit(0)\n  end\nend",
        "Rust": "#[test]\nfn zero_celsius_is_32_fahrenheit() {\n    assert_eq!(celsius_to_fahrenheit(0.0), 32.0);\n}",
        "C#": "[Fact]\npublic void ZeroCelsiusIs32Fahrenheit()\n{\n    Assert.Equal(32.0, CelsiusToFahrenheit(0), 9);\n}",
        "Kotlin": "@Test\nfun `0℃ は 32°F`() {\n    assertEquals(32.0, celsiusToFahrenheit(0.0), 1e-9)\n}",
        "Swift": "func testZeroCelsiusIs32Fahrenheit() {\n    XCTAssertEqual(celsiusToFahrenheit(0), 32, accuracy: 1e-9)\n}"
      },
      "examples": {
        "TypeScript": "- `celsiusToFahrenheit(0)` → `32`\n- `celsiusToFahrenheit(100)` → `212`\n- `celsiusToFahrenheit(37)` → `98.6`",
        "JavaScript": "- `celsiusToFahrenheit(0)` → `32`\n- `celsiusToFahrenheit(100)` → `212`\n- `celsiusToFahrenheit(37)` → `98.6`",
        "Python": "- `celsius_to_fahrenheit(0)` → `32`\n- `celsius_to_fahrenheit(100)` → `212`\n- `celsius_to_fahrenheit(37)` → `98.6`",
        "Java": "- `celsiusToFahrenheit(0)` → `32`\n- `celsiusToFahrenheit(100)` → `212`\n- `celsiusToFahrenheit(37)` → `98.6`",
        "Go": "- `celsiusToFahrenheit(0)` → `32`\n- `celsiusToFahrenheit(100)` → `212`\n- `celsiusToFahrenheit(37)` → `98.6`",
        "Ruby": "- `celsius_to_fahrenheit(0)` → `32`\n- `celsius_to_fahrenheit(100)` → `212`\n- `celsius_to_fahrenheit(37)` → `98.6`",
        "Rust": "- `celsius_to_fahrenheit(0.0)` → `32.0`\n- `celsius_to_fahrenheit(100.0)` → `212.0`\n- `celsius_to_fahrenheit(37.0)` → `98.6`",
        "C#": "- `CelsiusToFahrenheit(0)` → `32`\n- `CelsiusToFahrenheit(100)` → `212`\n- `CelsiusToFahrenheit(37)` → `98.6`",
        "Kotlin": "- `celsiusToFahrenheit(0.0)` → `32.0`\n- `celsiusToFahrenheit(100.0)` → `212.0`\n- `celsiusToFahrenheit(37.0)` → `98.6`",
        "Swift": "- `celsiusToFahrenheit(0)` → `32`\n- `celsiusToFahrenheit(100)` → `212`\n- `celsiusToFahrenheit(37)` → `98.6`"
      },
      "fn": {
        "TypeScript": "celsiusToFahrenheit",
        "JavaScript": "celsiusToFahrenheit",
        "Python": "celsius_to_fahrenheit",
        "Java": "celsiusToFahrenheit",
        "Go": "celsiusToFahrenheit",
        "Ruby": "celsius_to_fahrenheit",
        "Rust": "celsius_to_fahrenheit",
        "C#": "CelsiusToFahrenheit",
        "Kotlin": "celsiusToFahrenheit",
        "Swift": "celsiusToFahrenheit"
      }
    }
  },
  {
    "title": "母音カウント",
    "body": "## 背景\n\n文字列の走査と集合（メンバーシップ判定）を練習する基本のお題です。\n\n文字列 `s` に含まれる母音（`a`, `e`, `i`, `o`, `u`）の数を返す `{{slot:fn}}(s)` を実装します。\n\n## ルール\n\n- 大文字の母音も数える（`AEIOU` は 5）\n- 母音が無ければ `0`\n\n## 例\n\n- `{{slot:fn}}(\"hello\")` → `2`\n- `{{slot:fn}}(\"xyz\")` → `0`\n- `{{slot:fn}}(\"AEIOU\")` → `5`\n\n## 考慮すること\n\n小文字化してから集合 `{a, e, i, o, u}` に含まれるか判定すると、大文字小文字を一度に扱えます。\n\n満たすこと:\n- 'hello' は 2\n- 母音が無ければ 0\n- 大文字も母音として数える（'AEIOU' は 5）\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 集合 {a,e,i,o,u} に含まれるか判定\n- 小文字化してから処理する",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test(\"'hello' の母音は 2\", () => {\n  expect(countVowels('hello')).toBe(2);\n});",
        "JavaScript": "test(\"'hello' の母音は 2\", () => {\n  expect(countVowels('hello')).toBe(2);\n});",
        "Python": "def test_hello_has_2_vowels():\n    assert count_vowels(\"hello\") == 2",
        "Java": "@Test\nvoid helloHasTwoVowels() {\n    assertEquals(2, countVowels(\"hello\"));\n}",
        "Go": "func TestCountVowelsHello(t *testing.T) {\n\tgot := countVowels(\"hello\")\n\twant := 2\n\tif got != want {\n\t\tt.Errorf(\"countVowels(\\\"hello\\\") = %d, want %d\", got, want)\n\t}\n}",
        "Ruby": "class CountVowelsTest < Minitest::Test\n  def test_hello_has_2_vowels\n    assert_equal 2, count_vowels(\"hello\")\n  end\nend",
        "Rust": "#[test]\nfn hello_has_2_vowels() {\n    assert_eq!(count_vowels(\"hello\"), 2);\n}",
        "C#": "[Fact]\npublic void HelloHasTwoVowels()\n{\n    Assert.Equal(2, CountVowels(\"hello\"));\n}",
        "Kotlin": "@Test\nfun `hello の母音は 2`() {\n    assertEquals(2, countVowels(\"hello\"))\n}",
        "Swift": "func testHelloHasTwoVowels() {\n    XCTAssertEqual(countVowels(\"hello\"), 2)\n}"
      },
      "fn": {
        "TypeScript": "countVowels",
        "JavaScript": "countVowels",
        "Python": "count_vowels",
        "Java": "countVowels",
        "Go": "countVowels",
        "Ruby": "count_vowels",
        "Rust": "count_vowels",
        "C#": "CountVowels",
        "Kotlin": "countVowels",
        "Swift": "countVowels"
      }
    }
  },
  {
    "title": "配列の合計と平均",
    "body": "## 背景\n\n集計処理の基本と、ゼロ除算というエッジケースの扱いを練習するお題です。\n\n数値配列を受け取り、合計を返す `{{slot:sum}}(arr)` と平均を返す `{{slot:avg}}(arr)` を実装します。平均は合計を要素数で割ります。\n\n## ルール\n\n- 平均は合計 ÷ 要素数\n- 空配列の合計は `0`\n- 空配列の平均は `0`（ゼロ除算を避ける）\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n空配列を先に処理してゼロ除算を防ぎます。`{{slot:avg}}` は内部で `{{slot:sum}}` を再利用すると簡潔です。\n\n満たすこと:\n- {{slot:sum}}([1,2,3,4]) は 10\n- {{slot:avg}}([1,2,3,4]) は 2.5\n- 空配列の平均は 0（ゼロ除算を避ける）\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 合計を要素数で割る\n- 空配列を先に処理する",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('平均は 2.5', () => {\n  expect(average([1, 2, 3, 4])).toBe(2.5);\n});",
        "JavaScript": "test('平均は 2.5', () => {\n  expect(average([1, 2, 3, 4])).toBe(2.5);\n});",
        "Python": "def test_average_is_2_5():\n    assert average([1, 2, 3, 4]) == 2.5",
        "Java": "@Test\nvoid averageIsTwoPointFive() {\n    assertEquals(2.5, average(List.of(1, 2, 3, 4)), 1e-9);\n}",
        "Go": "func TestAverage(t *testing.T) {\n\tgot := average([]int{1, 2, 3, 4})\n\twant := 2.5\n\tif got != want {\n\t\tt.Errorf(\"average() = %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class AverageTest < Minitest::Test\n  def test_average_is_2_5\n    assert_equal 2.5, average([1, 2, 3, 4])\n  end\nend",
        "Rust": "#[test]\nfn average_is_2_5() {\n    assert_eq!(average(&[1, 2, 3, 4]), 2.5);\n}",
        "C#": "[Fact]\npublic void AverageIsTwoPointFive()\n{\n    Assert.Equal(2.5, Average([1, 2, 3, 4]));\n}",
        "Kotlin": "@Test\nfun `平均は 2 点 5`() {\n    assertEquals(2.5, average(listOf(1, 2, 3, 4)))\n}",
        "Swift": "func testAverageIsTwoPointFive() {\n    XCTAssertEqual(average([1, 2, 3, 4]), 2.5)\n}"
      },
      "examples": {
        "TypeScript": "- `sum([1, 2, 3, 4])` → `10`\n- `average([1, 2, 3, 4])` → `2.5`\n- `average([])` → `0`",
        "JavaScript": "- `sum([1, 2, 3, 4])` → `10`\n- `average([1, 2, 3, 4])` → `2.5`\n- `average([])` → `0`",
        "Python": "- `sum_of([1, 2, 3, 4])` → `10`\n- `average([1, 2, 3, 4])` → `2.5`\n- `average([])` → `0.0`",
        "Java": "- `sum(List.of(1, 2, 3, 4))` → `10`\n- `average(List.of(1, 2, 3, 4))` → `2.5`\n- `average(List.of())` → `0.0`",
        "Go": "- `sum([]int{1, 2, 3, 4})` → `10`\n- `average([]int{1, 2, 3, 4})` → `2.5`\n- `average([]int{})` → `0`",
        "Ruby": "- `sum([1, 2, 3, 4])` → `10`\n- `average([1, 2, 3, 4])` → `2.5`\n- `average([])` → `0.0`",
        "Rust": "- `sum(&[1, 2, 3, 4])` → `10`\n- `average(&[1, 2, 3, 4])` → `2.5`\n- `average(&[])` → `0.0`",
        "C#": "- `Sum([1, 2, 3, 4])` → `10`\n- `Average([1, 2, 3, 4])` → `2.5`\n- `Average([])` → `0`",
        "Kotlin": "- `sum(listOf(1, 2, 3, 4))` → `10`\n- `average(listOf(1, 2, 3, 4))` → `2.5`\n- `average(emptyList())` → `0.0`",
        "Swift": "- `sum([1, 2, 3, 4])` → `10`\n- `average([1, 2, 3, 4])` → `2.5`\n- `average([])` → `0`"
      },
      "sum": {
        "TypeScript": "sum",
        "JavaScript": "sum",
        "Python": "sum_of",
        "Java": "sum",
        "Go": "sum",
        "Ruby": "sum",
        "Rust": "sum",
        "C#": "Sum",
        "Kotlin": "sum",
        "Swift": "sum"
      },
      "avg": {
        "TypeScript": "average",
        "JavaScript": "average",
        "Python": "average",
        "Java": "average",
        "Go": "average",
        "Ruby": "average",
        "Rust": "average",
        "C#": "Average",
        "Kotlin": "average",
        "Swift": "average"
      }
    }
  },
  {
    "title": "重複の除去",
    "body": "## 背景\n\n集合（{{slot:set}}）を使った重複管理と、順序保持の両立を練習するお題です。\n\n配列から重複を取り除き、初めて出現した順序を保ったまま返す `{{slot:fn}}(arr)` を実装します。\n\n## ルール\n\n- 各要素は最初に現れた位置の順序を保つ\n- 空配列は空配列を返す\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n{{slot:set}} で「既に見た要素」を管理しながら走査し、初出のものだけを結果に追加すると順序が保たれます。\n\n満たすこと:\n- [1,2,2,3,1] は [1,2,3]\n- 初出の順序を保つ\n- 空配列は空配列\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 集合（{{slot:set}}）で既出を管理\n- 順序保持に注意",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('重複を除去', () => {\n  expect(unique([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);\n});",
        "JavaScript": "test('重複を除去', () => {\n  expect(unique([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);\n});",
        "Python": "def test_removes_duplicates():\n    assert unique([1, 2, 2, 3, 1]) == [1, 2, 3]",
        "Java": "@Test\nvoid removesDuplicates() {\n    assertEquals(List.of(1, 2, 3), unique(List.of(1, 2, 2, 3, 1)));\n}",
        "Go": "func TestUniqueRemovesDuplicates(t *testing.T) {\n\tgot := unique([]int{1, 2, 2, 3, 1})\n\twant := []int{1, 2, 3}\n\tif !slices.Equal(got, want) {\n\t\tt.Errorf(\"unique() = %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class UniqueTest < Minitest::Test\n  def test_removes_duplicates\n    assert_equal [1, 2, 3], unique([1, 2, 2, 3, 1])\n  end\nend",
        "Rust": "#[test]\nfn removes_duplicates() {\n    assert_eq!(unique(&[1, 2, 2, 3, 1]), vec![1, 2, 3]);\n}",
        "C#": "[Fact]\npublic void RemovesDuplicates()\n{\n    Assert.Equal(new[] { 1, 2, 3 }, Unique(new[] { 1, 2, 2, 3, 1 }));\n}",
        "Kotlin": "@Test\nfun `重複を除去`() {\n    assertEquals(listOf(1, 2, 3), unique(listOf(1, 2, 2, 3, 1)))\n}",
        "Swift": "func testRemovesDuplicates() {\n    XCTAssertEqual(unique([1, 2, 2, 3, 1]), [1, 2, 3])\n}"
      },
      "examples": {
        "TypeScript": "- `unique([1, 2, 2, 3, 1])` → `[1, 2, 3]`\n- `unique([\"a\", \"a\", \"b\"])` → `[\"a\", \"b\"]`\n- `unique([])` → `[]`",
        "JavaScript": "- `unique([1, 2, 2, 3, 1])` → `[1, 2, 3]`\n- `unique([\"a\", \"a\", \"b\"])` → `[\"a\", \"b\"]`\n- `unique([])` → `[]`",
        "Python": "- `unique([1, 2, 2, 3, 1])` → `[1, 2, 3]`\n- `unique([\"a\", \"a\", \"b\"])` → `[\"a\", \"b\"]`\n- `unique([])` → `[]`",
        "Java": "- `unique(List.of(1, 2, 2, 3, 1))` → `List.of(1, 2, 3)`\n- `unique(List.of(\"a\", \"a\", \"b\"))` → `List.of(\"a\", \"b\")`\n- `unique(List.of())` → `List.of()`",
        "Go": "- `unique([]int{1, 2, 2, 3, 1})` → `[]int{1, 2, 3}`\n- `unique([]string{\"a\", \"a\", \"b\"})` → `[]string{\"a\", \"b\"}`\n- `unique([]int{})` → `[]int{}`",
        "Ruby": "- `unique([1, 2, 2, 3, 1])` → `[1, 2, 3]`\n- `unique([\"a\", \"a\", \"b\"])` → `[\"a\", \"b\"]`\n- `unique([])` → `[]`",
        "Rust": "- `unique(&[1, 2, 2, 3, 1])` → `vec![1, 2, 3]`\n- `unique(&[\"a\", \"a\", \"b\"])` → `vec![\"a\", \"b\"]`\n- `unique(&[] as &[i32])` → `vec![]`",
        "C#": "- `Unique(new[] { 1, 2, 2, 3, 1 })` → `[1, 2, 3]`\n- `Unique(new[] { \"a\", \"a\", \"b\" })` → `[\"a\", \"b\"]`\n- `Unique(Array.Empty<int>())` → `[]`",
        "Kotlin": "- `unique(listOf(1, 2, 2, 3, 1))` → `listOf(1, 2, 3)`\n- `unique(listOf(\"a\", \"a\", \"b\"))` → `listOf(\"a\", \"b\")`\n- `unique(emptyList<Int>())` → `emptyList()`",
        "Swift": "- `unique([1, 2, 2, 3, 1])` → `[1, 2, 3]`\n- `unique([\"a\", \"a\", \"b\"])` → `[\"a\", \"b\"]`\n- `unique([Int]())` → `[]`"
      },
      "fn": {
        "TypeScript": "unique",
        "JavaScript": "unique",
        "Python": "unique",
        "Java": "unique",
        "Go": "unique",
        "Ruby": "unique",
        "Rust": "unique",
        "C#": "Unique",
        "Kotlin": "unique",
        "Swift": "unique"
      },
      "set": {
        "TypeScript": "Set",
        "JavaScript": "Set",
        "Python": "`set`",
        "Java": "`HashSet`",
        "Go": "`map[T]struct{}`",
        "Ruby": "`Set`",
        "Rust": "`HashSet`",
        "C#": "`HashSet`",
        "Kotlin": "`mutableSetOf`",
        "Swift": "`Set`"
      }
    }
  },
  {
    "title": "アナグラム判定",
    "body": "## 背景\n\n文字列の正規化と、ソート／頻度カウントによる比較を練習するお題です。\n\n2 つの文字列 `a`, `b` が互いにアナグラム（同じ文字を並べ替えたもの）かどうかを判定する `{{slot:fn}}(a, b)` を実装します。\n\n## ルール\n\n- 大文字小文字・空白は無視する\n- 長さ（無視対象を除いた文字数）が違えば {{slot:falseValue}}\n\n## 例\n\n- `{{slot:fn}}(\"listen\", \"silent\")` → `{{slot:yes}}`\n- `{{slot:fn}}(\"hello\", \"world\")` → `{{slot:no}}`\n\n## 考慮すること\n\n両方の文字を並べ替えて比較するか、各文字の出現回数を数えて一致するか確認します。\n\n満たすこと:\n- 'listen' と 'silent' は {{slot:trueWord}}\n- 長さが違えば {{slot:falseWord}}\n- 大文字小文字・空白は無視する\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- ソートして比較\n- または文字の出現回数を比較",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('listen/silent はアナグラム', () => {\n  expect(isAnagram('listen', 'silent')).toBe(true);\n});",
        "JavaScript": "test('listen/silent はアナグラム', () => {\n  expect(isAnagram('listen', 'silent')).toBe(true);\n});",
        "Python": "def test_listen_silent_is_anagram():\n    assert is_anagram(\"listen\", \"silent\")",
        "Java": "@Test\nvoid listenSilentIsAnagram() {\n    assertTrue(isAnagram(\"listen\", \"silent\"));\n}",
        "Go": "func TestListenSilentIsAnagram(t *testing.T) {\n\tif !isAnagram(\"listen\", \"silent\") {\n\t\tt.Errorf(\"isAnagram(listen, silent) = false, want true\")\n\t}\n}",
        "Ruby": "class AnagramTest < Minitest::Test\n  def test_listen_silent_is_anagram\n    assert anagram?(\"listen\", \"silent\")\n  end\nend",
        "Rust": "#[test]\nfn listen_silent_is_anagram() {\n    assert!(is_anagram(\"listen\", \"silent\"));\n}",
        "C#": "[Fact]\npublic void ListenSilentIsAnagram()\n{\n    Assert.True(IsAnagram(\"listen\", \"silent\"));\n}",
        "Kotlin": "@Test\nfun `listen と silent はアナグラム`() {\n    assertTrue(isAnagram(\"listen\", \"silent\"))\n}",
        "Swift": "func testListenSilentIsAnagram() {\n    XCTAssertTrue(isAnagram(\"listen\", \"silent\"))\n}"
      },
      "fn": {
        "TypeScript": "isAnagram",
        "JavaScript": "isAnagram",
        "Python": "is_anagram",
        "Java": "isAnagram",
        "Go": "isAnagram",
        "Ruby": "anagram?",
        "Rust": "is_anagram",
        "C#": "IsAnagram",
        "Kotlin": "isAnagram",
        "Swift": "isAnagram"
      },
      "yes": {
        "TypeScript": "true",
        "JavaScript": "true",
        "Python": "True",
        "Java": "true",
        "Go": "true",
        "Ruby": "true",
        "Rust": "true",
        "C#": "true",
        "Kotlin": "true",
        "Swift": "true"
      },
      "no": {
        "TypeScript": "false",
        "JavaScript": "false",
        "Python": "False",
        "Java": "false",
        "Go": "false",
        "Ruby": "false",
        "Rust": "false",
        "C#": "false",
        "Kotlin": "false",
        "Swift": "false"
      },
      "falseValue": {
        "TypeScript": "`false`",
        "JavaScript": "`false`",
        "Python": "`False`",
        "Java": "`false`",
        "Go": "`false`",
        "Ruby": "`false`",
        "Rust": "`false`",
        "C#": "`false`",
        "Kotlin": "`false`",
        "Swift": "`false`"
      },
      "trueWord": {
        "TypeScript": "true",
        "JavaScript": "true",
        "Python": "True",
        "Java": "true",
        "Go": "true",
        "Ruby": "true",
        "Rust": "true",
        "C#": "true",
        "Kotlin": "true",
        "Swift": "true"
      },
      "falseWord": {
        "TypeScript": "false",
        "JavaScript": "false",
        "Python": "False",
        "Java": "false",
        "Go": "false",
        "Ruby": "false",
        "Rust": "false",
        "C#": "false",
        "Kotlin": "false",
        "Swift": "false"
      }
    }
  },
  {
    "title": "うるう年判定",
    "body": "## 背景\n\n複合的な条件を正しい順序・優先度で組み立てる練習です。条件の境界値テストが効くお題です。\n\n西暦年 `y` を受け取り、うるう年かどうかを判定する `{{slot:fn}}(y)` を実装します。\n\n## ルール\n\nうるう年は次の条件を満たす年です。\n\n1. 4 で割り切れる、かつ\n2. 100 で割り切れない、ただし\n3. 400 で割り切れる年はうるう年\n\n## 例\n\n- `{{slot:fn}}(2000)` → `{{slot:yes}}`（400 で割り切れる）\n- `{{slot:fn}}(1900)` → `{{slot:no}}`（100 で割り切れるが 400 では割り切れない）\n- `{{slot:fn}}(2024)` → `{{slot:yes}}`\n- `{{slot:fn}}(2023)` → `{{slot:no}}`\n\n## 考慮すること\n\n`400 → 100 → 4` の順で判定すると、例外規則が綺麗に表現できます。\n\n満たすこと:\n- 2000 は {{slot:trueWord}}（400 で割り切れる）\n- 1900 は {{slot:falseWord}}（100 で割り切れるが 400 では割り切れない）\n- 2024 は {{slot:trueWord}}、2023 は {{slot:falseWord}}\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 条件の順序に注意（400 → 100 → 4）",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('2000 はうるう年', () => {\n  expect(isLeapYear(2000)).toBe(true);\n});",
        "JavaScript": "test('2000 はうるう年', () => {\n  expect(isLeapYear(2000)).toBe(true);\n});",
        "Python": "def test_2000_is_leap_year():\n    assert is_leap_year(2000)",
        "Java": "@Test\nvoid year2000IsLeapYear() {\n    assertTrue(isLeapYear(2000));\n}",
        "Go": "func TestYear2000IsLeapYear(t *testing.T) {\n\tif !isLeapYear(2000) {\n\t\tt.Errorf(\"isLeapYear(2000) = false, want true\")\n\t}\n}",
        "Ruby": "class LeapYearTest < Minitest::Test\n  def test_2000_is_leap_year\n    assert leap_year?(2000)\n  end\nend",
        "Rust": "#[test]\nfn year_2000_is_leap_year() {\n    assert!(is_leap_year(2000));\n}",
        "C#": "[Fact]\npublic void Year2000IsLeapYear()\n{\n    Assert.True(IsLeapYear(2000));\n}",
        "Kotlin": "@Test\nfun `2000 はうるう年`() {\n    assertTrue(isLeapYear(2000))\n}",
        "Swift": "func testYear2000IsLeapYear() {\n    XCTAssertTrue(isLeapYear(2000))\n}"
      },
      "fn": {
        "TypeScript": "isLeapYear",
        "JavaScript": "isLeapYear",
        "Python": "is_leap_year",
        "Java": "isLeapYear",
        "Go": "isLeapYear",
        "Ruby": "leap_year?",
        "Rust": "is_leap_year",
        "C#": "IsLeapYear",
        "Kotlin": "isLeapYear",
        "Swift": "isLeapYear"
      },
      "yes": {
        "TypeScript": "true",
        "JavaScript": "true",
        "Python": "True",
        "Java": "true",
        "Go": "true",
        "Ruby": "true",
        "Rust": "true",
        "C#": "true",
        "Kotlin": "true",
        "Swift": "true"
      },
      "no": {
        "TypeScript": "false",
        "JavaScript": "false",
        "Python": "False",
        "Java": "false",
        "Go": "false",
        "Ruby": "false",
        "Rust": "false",
        "C#": "false",
        "Kotlin": "false",
        "Swift": "false"
      },
      "trueWord": {
        "TypeScript": "true",
        "JavaScript": "true",
        "Python": "True",
        "Java": "true",
        "Go": "true",
        "Ruby": "true",
        "Rust": "true",
        "C#": "true",
        "Kotlin": "true",
        "Swift": "true"
      },
      "falseWord": {
        "TypeScript": "false",
        "JavaScript": "false",
        "Python": "False",
        "Java": "false",
        "Go": "false",
        "Ruby": "false",
        "Rust": "false",
        "C#": "false",
        "Kotlin": "false",
        "Swift": "false"
      }
    }
  },
  {
    "title": "数値のカンマ区切り",
    "body": "## 背景\n\n文字列操作と符号・桁の扱いを練習するお題です。後ろから 3 桁ごとに区切るというロジックがポイントです。\n\n整数 `n` を受け取り、3 桁ごとにカンマで区切った文字列を返す `{{slot:fn}}(n)` を実装します。\n\n## ルール\n\n- 3 桁以下はカンマなし\n- 負の数にも対応する（符号は先頭に残す）\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n符号をいったん分離し、絶対値部分を後ろから 3 桁ごとに区切ってから符号を戻すと、場合分けが減ります。\n\n満たすこと:\n- 1234567 は '1,234,567'\n- 3 桁以下はカンマなし（100 は '100'）\n- 負の数も対応（-1234 は '-1,234'）\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 後ろから 3 桁ごとに区切る\n- 符号を分離して処理すると楽",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "formatNumber",
        "JavaScript": "formatNumber",
        "Python": "format_number",
        "Java": "formatNumber",
        "Go": "formatNumber",
        "Ruby": "format_number",
        "Rust": "format_number",
        "C#": "FormatNumber",
        "Kotlin": "formatNumber",
        "Swift": "formatNumber"
      },
      "examples": {
        "TypeScript": "- `formatNumber(1234567)` → `\"1,234,567\"`\n- `formatNumber(100)` → `\"100\"`\n- `formatNumber(-1234)` → `\"-1,234\"`",
        "JavaScript": "- `formatNumber(1234567)` → `\"1,234,567\"`\n- `formatNumber(100)` → `\"100\"`\n- `formatNumber(-1234)` → `\"-1,234\"`",
        "Python": "- `format_number(1234567)` → `\"1,234,567\"`\n- `format_number(100)` → `\"100\"`\n- `format_number(-1234)` → `\"-1,234\"`",
        "Java": "- `formatNumber(1234567)` → `\"1,234,567\"`\n- `formatNumber(100)` → `\"100\"`\n- `formatNumber(-1234)` → `\"-1,234\"`",
        "Go": "- `formatNumber(1234567)` → `\"1,234,567\"`\n- `formatNumber(100)` → `\"100\"`\n- `formatNumber(-1234)` → `\"-1,234\"`",
        "Ruby": "- `format_number(1234567)` → `'1,234,567'`\n- `format_number(100)` → `'100'`\n- `format_number(-1234)` → `'-1,234'`",
        "Rust": "- `format_number(1234567)` → `\"1,234,567\"`\n- `format_number(100)` → `\"100\"`\n- `format_number(-1234)` → `\"-1,234\"`",
        "C#": "- `FormatNumber(1234567)` → `\"1,234,567\"`\n- `FormatNumber(100)` → `\"100\"`\n- `FormatNumber(-1234)` → `\"-1,234\"`",
        "Kotlin": "- `formatNumber(1234567)` → `\"1,234,567\"`\n- `formatNumber(100)` → `\"100\"`\n- `formatNumber(-1234)` → `\"-1,234\"`",
        "Swift": "- `formatNumber(1234567)` → `\"1,234,567\"`\n- `formatNumber(100)` → `\"100\"`\n- `formatNumber(-1234)` → `\"-1,234\"`"
      },
      "firstTest": {
        "TypeScript": "test('1234567 を整形', () => {\n  expect(formatNumber(1234567)).toBe('1,234,567');\n});",
        "JavaScript": "test('1234567 を整形', () => {\n  expect(formatNumber(1234567)).toBe('1,234,567');\n});",
        "Python": "def test_formats_1234567():\n    assert format_number(1234567) == \"1,234,567\"",
        "Java": "@Test\nvoid formats1234567() {\n    assertEquals(\"1,234,567\", formatNumber(1234567));\n}",
        "Go": "func TestFormats1234567(t *testing.T) {\n\tgot := formatNumber(1234567)\n\twant := \"1,234,567\"\n\tif got != want {\n\t\tt.Errorf(\"got %q, want %q\", got, want)\n\t}\n}",
        "Ruby": "class FormatNumberTest < Minitest::Test\n  def test_formats_1234567\n    assert_equal '1,234,567', format_number(1234567)\n  end\nend",
        "Rust": "#[test]\nfn formats_1234567() {\n    assert_eq!(format_number(1234567), \"1,234,567\");\n}",
        "C#": "[Fact]\npublic void Formats1234567()\n{\n    Assert.Equal(\"1,234,567\", FormatNumber(1234567));\n}",
        "Kotlin": "@Test\nfun formats1234567() {\n    assertEquals(\"1,234,567\", formatNumber(1234567))\n}",
        "Swift": "func testFormats1234567() {\n    XCTAssertEqual(formatNumber(1234567), \"1,234,567\")\n}"
      }
    }
  },
  {
    "title": "括弧の対応チェック",
    "body": "## 背景\n\nスタックを使った定番のお題です。コンパイラやエディタの括弧チェック機能の縮図でもあります。\n\n`()`, `{}`, `[]` の 3 種類の括弧が正しく対応・ネストしているかを判定する `{{slot:fn}}(s)` を実装します。\n\n## ルール\n\n- 開いた括弧は、対応する種類の閉じ括弧で閉じる\n- 交差したネストは不正\n- 閉じ括弧が先に来た場合や、閉じ忘れがある場合も不正\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n開き括弧をスタックに push し、閉じ括弧が来たら pop して種類が一致するか照合します。最後にスタックが空なら対応が取れています。\n\n満たすこと:\n- '([]{})' は {{slot:trueWord}}\n- '([)]' は {{slot:falseWord}}（交差はNG）\n- 閉じ括弧が先に来たら {{slot:falseWord}}、未閉じも {{slot:falseWord}}\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- スタックを使う\n- 開き括弧を push、閉じで対応を pop して照合",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "isBalanced",
        "JavaScript": "isBalanced",
        "Python": "is_balanced",
        "Java": "isBalanced",
        "Go": "isBalanced",
        "Ruby": "balanced?",
        "Rust": "is_balanced",
        "C#": "IsBalanced",
        "Kotlin": "isBalanced",
        "Swift": "isBalanced"
      },
      "examples": {
        "TypeScript": "- `isBalanced(\"([]{})\")` → `true`\n- `isBalanced(\"([)]\")` → `false`（交差）\n- `isBalanced(\"(\")` → `false`（未閉じ）",
        "JavaScript": "- `isBalanced(\"([]{})\")` → `true`\n- `isBalanced(\"([)]\")` → `false`（交差）\n- `isBalanced(\"(\")` → `false`（未閉じ）",
        "Python": "- `is_balanced(\"([]{})\")` → `True`\n- `is_balanced(\"([)]\")` → `False`（交差）\n- `is_balanced(\"(\")` → `False`（未閉じ）",
        "Java": "- `isBalanced(\"([]{})\")` → `true`\n- `isBalanced(\"([)]\")` → `false`（交差）\n- `isBalanced(\"(\")` → `false`（未閉じ）",
        "Go": "- `isBalanced(\"([]{})\")` → `true`\n- `isBalanced(\"([)]\")` → `false`（交差）\n- `isBalanced(\"(\")` → `false`（未閉じ）",
        "Ruby": "- `balanced?('([]{})')` → `true`\n- `balanced?('([)]')` → `false`（交差）\n- `balanced?('(')` → `false`（未閉じ）",
        "Rust": "- `is_balanced(\"([]{})\")` → `true`\n- `is_balanced(\"([)]\")` → `false`（交差）\n- `is_balanced(\"(\")` → `false`（未閉じ）",
        "C#": "- `IsBalanced(\"([]{})\")` → `true`\n- `IsBalanced(\"([)]\")` → `false`（交差）\n- `IsBalanced(\"(\")` → `false`（未閉じ）",
        "Kotlin": "- `isBalanced(\"([]{})\")` → `true`\n- `isBalanced(\"([)]\")` → `false`（交差）\n- `isBalanced(\"(\")` → `false`（未閉じ）",
        "Swift": "- `isBalanced(\"([]{})\")` → `true`\n- `isBalanced(\"([)]\")` → `false`（交差）\n- `isBalanced(\"(\")` → `false`（未閉じ）"
      },
      "firstTest": {
        "TypeScript": "test('([]{}) は対応している', () => {\n  expect(isBalanced('([]{})')).toBe(true);\n});",
        "JavaScript": "test('([]{}) は対応している', () => {\n  expect(isBalanced('([]{})')).toBe(true);\n});",
        "Python": "def test_mixed_brackets_are_balanced():\n    assert is_balanced(\"([]{})\")",
        "Java": "@Test\nvoid mixedBracketsAreBalanced() {\n    assertTrue(isBalanced(\"([]{})\"));\n}",
        "Go": "func TestMixedBracketsAreBalanced(t *testing.T) {\n\tgot := isBalanced(\"([]{})\")\n\twant := true\n\tif got != want {\n\t\tt.Errorf(\"got %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class BalancedTest < Minitest::Test\n  def test_mixed_brackets_are_balanced\n    assert balanced?('([]{})')\n  end\nend",
        "Rust": "#[test]\nfn mixed_brackets_are_balanced() {\n    assert!(is_balanced(\"([]{})\"));\n}",
        "C#": "[Fact]\npublic void MixedBracketsAreBalanced()\n{\n    Assert.True(IsBalanced(\"([]{})\"));\n}",
        "Kotlin": "@Test\nfun mixedBracketsAreBalanced() {\n    assertTrue(isBalanced(\"([]{})\"))\n}",
        "Swift": "func testMixedBracketsAreBalanced() {\n    XCTAssertTrue(isBalanced(\"([]{})\"))\n}"
      },
      "trueWord": {
        "TypeScript": "true",
        "JavaScript": "true",
        "Python": "True",
        "Java": "true",
        "Go": "true",
        "Ruby": "true",
        "Rust": "true",
        "C#": "true",
        "Kotlin": "true",
        "Swift": "true"
      },
      "falseWord": {
        "TypeScript": "false",
        "JavaScript": "false",
        "Python": "False",
        "Java": "false",
        "Go": "false",
        "Ruby": "false",
        "Rust": "false",
        "C#": "false",
        "Kotlin": "false",
        "Swift": "false"
      }
    }
  },
  {
    "title": "ランレングス圧縮",
    "body": "## 背景\n\n連続する要素をまとめる「ランレングス符号化」の練習です。直前の状態を保持しながら走査するパターンを身につけます。\n\n文字列 `s` を受け取り、連続する同じ文字を「文字＋連続数」に圧縮する `{{slot:fn}}(s)` を実装します。\n\n## ルール\n\n- 連続数が 1 でも個数を付ける\n- 空文字列は空文字列を返す\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n直前の文字とその連続数を保持しながら走査し、文字が変わったタイミングで結果に書き出します。最後の塊の書き出し忘れに注意してください。\n\n満たすこと:\n- 'aaabbc' は 'a3b2c1'\n- 1 文字でも個数を付ける（'abc' は 'a1b1c1'）\n- 空文字列は空文字列\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 直前の文字と連続数を保持しながら走査する",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "encode",
        "JavaScript": "encode",
        "Python": "encode",
        "Java": "encode",
        "Go": "encode",
        "Ruby": "encode",
        "Rust": "encode",
        "C#": "Encode",
        "Kotlin": "encode",
        "Swift": "encode"
      },
      "examples": {
        "TypeScript": "- `encode(\"aaabbc\")` → `\"a3b2c1\"`\n- `encode(\"abc\")` → `\"a1b1c1\"`\n- `encode(\"\")` → `\"\"`",
        "JavaScript": "- `encode(\"aaabbc\")` → `\"a3b2c1\"`\n- `encode(\"abc\")` → `\"a1b1c1\"`\n- `encode(\"\")` → `\"\"`",
        "Python": "- `encode(\"aaabbc\")` → `\"a3b2c1\"`\n- `encode(\"abc\")` → `\"a1b1c1\"`\n- `encode(\"\")` → `\"\"`",
        "Java": "- `encode(\"aaabbc\")` → `\"a3b2c1\"`\n- `encode(\"abc\")` → `\"a1b1c1\"`\n- `encode(\"\")` → `\"\"`",
        "Go": "- `encode(\"aaabbc\")` → `\"a3b2c1\"`\n- `encode(\"abc\")` → `\"a1b1c1\"`\n- `encode(\"\")` → `\"\"`",
        "Ruby": "- `encode('aaabbc')` → `'a3b2c1'`\n- `encode('abc')` → `'a1b1c1'`\n- `encode('')` → `''`",
        "Rust": "- `encode(\"aaabbc\")` → `\"a3b2c1\"`\n- `encode(\"abc\")` → `\"a1b1c1\"`\n- `encode(\"\")` → `\"\"`",
        "C#": "- `Encode(\"aaabbc\")` → `\"a3b2c1\"`\n- `Encode(\"abc\")` → `\"a1b1c1\"`\n- `Encode(\"\")` → `\"\"`",
        "Kotlin": "- `encode(\"aaabbc\")` → `\"a3b2c1\"`\n- `encode(\"abc\")` → `\"a1b1c1\"`\n- `encode(\"\")` → `\"\"`",
        "Swift": "- `encode(\"aaabbc\")` → `\"a3b2c1\"`\n- `encode(\"abc\")` → `\"a1b1c1\"`\n- `encode(\"\")` → `\"\"`"
      },
      "firstTest": {
        "TypeScript": "test('aaabbc を圧縮', () => {\n  expect(encode('aaabbc')).toBe('a3b2c1');\n});",
        "JavaScript": "test('aaabbc を圧縮', () => {\n  expect(encode('aaabbc')).toBe('a3b2c1');\n});",
        "Python": "def test_encodes_aaabbc():\n    assert encode(\"aaabbc\") == \"a3b2c1\"",
        "Java": "@Test\nvoid encodesAaabbc() {\n    assertEquals(\"a3b2c1\", encode(\"aaabbc\"));\n}",
        "Go": "func TestEncodesAaabbc(t *testing.T) {\n\tgot := encode(\"aaabbc\")\n\twant := \"a3b2c1\"\n\tif got != want {\n\t\tt.Errorf(\"got %q, want %q\", got, want)\n\t}\n}",
        "Ruby": "class EncodeTest < Minitest::Test\n  def test_encodes_aaabbc\n    assert_equal 'a3b2c1', encode('aaabbc')\n  end\nend",
        "Rust": "#[test]\nfn encodes_aaabbc() {\n    assert_eq!(encode(\"aaabbc\"), \"a3b2c1\");\n}",
        "C#": "[Fact]\npublic void EncodesAaabbc()\n{\n    Assert.Equal(\"a3b2c1\", Encode(\"aaabbc\"));\n}",
        "Kotlin": "@Test\nfun encodesAaabbc() {\n    assertEquals(\"a3b2c1\", encode(\"aaabbc\"))\n}",
        "Swift": "func testEncodesAaabbc() {\n    XCTAssertEqual(encode(\"aaabbc\"), \"a3b2c1\")\n}"
      }
    }
  },
  {
    "title": "シーザー暗号",
    "body": "## 背景\n\n文字コードの操作と、剰余による巡回を練習する古典的なお題です。\n\n文字列 `s` の各英字を `n` 文字ずらすシーザー暗号 `{{slot:fn}}(s, n)` を実装します。\n\n## ルール\n\n- `z` を超えたら `a` に巡回する\n- 大文字は大文字のまま巡回する\n- 英字以外（数字・記号・空白）はそのまま残す\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n`a`（または `A`）を基点にした 0〜25 の値へ変換し、`(値 + n) % 26` で巡回させてから文字に戻すと、はみ出しを綺麗に扱えます。\n\n満たすこと:\n- {{slot:fn}}('abc', 1) は 'bcd'\n- 'z' は 1 ずらすと 'a' に巡回する\n- 大文字は大文字のまま巡回、英字以外は不変\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 文字コードを 26 で剰余して巡回させる",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "caesar",
        "JavaScript": "caesar",
        "Python": "caesar",
        "Java": "caesar",
        "Go": "caesar",
        "Ruby": "caesar",
        "Rust": "caesar",
        "C#": "Caesar",
        "Kotlin": "caesar",
        "Swift": "caesar"
      },
      "examples": {
        "TypeScript": "- `caesar(\"abc\", 1)` → `\"bcd\"`\n- `caesar(\"xyz\", 3)` → `\"abc\"`\n- `caesar(\"Hello, World!\", 1)` → `\"Ifmmp, Xpsme!\"`",
        "JavaScript": "- `caesar(\"abc\", 1)` → `\"bcd\"`\n- `caesar(\"xyz\", 3)` → `\"abc\"`\n- `caesar(\"Hello, World!\", 1)` → `\"Ifmmp, Xpsme!\"`",
        "Python": "- `caesar(\"abc\", 1)` → `\"bcd\"`\n- `caesar(\"xyz\", 3)` → `\"abc\"`\n- `caesar(\"Hello, World!\", 1)` → `\"Ifmmp, Xpsme!\"`",
        "Java": "- `caesar(\"abc\", 1)` → `\"bcd\"`\n- `caesar(\"xyz\", 3)` → `\"abc\"`\n- `caesar(\"Hello, World!\", 1)` → `\"Ifmmp, Xpsme!\"`",
        "Go": "- `caesar(\"abc\", 1)` → `\"bcd\"`\n- `caesar(\"xyz\", 3)` → `\"abc\"`\n- `caesar(\"Hello, World!\", 1)` → `\"Ifmmp, Xpsme!\"`",
        "Ruby": "- `caesar('abc', 1)` → `'bcd'`\n- `caesar('xyz', 3)` → `'abc'`\n- `caesar('Hello, World!', 1)` → `'Ifmmp, Xpsme!'`",
        "Rust": "- `caesar(\"abc\", 1)` → `\"bcd\"`\n- `caesar(\"xyz\", 3)` → `\"abc\"`\n- `caesar(\"Hello, World!\", 1)` → `\"Ifmmp, Xpsme!\"`",
        "C#": "- `Caesar(\"abc\", 1)` → `\"bcd\"`\n- `Caesar(\"xyz\", 3)` → `\"abc\"`\n- `Caesar(\"Hello, World!\", 1)` → `\"Ifmmp, Xpsme!\"`",
        "Kotlin": "- `caesar(\"abc\", 1)` → `\"bcd\"`\n- `caesar(\"xyz\", 3)` → `\"abc\"`\n- `caesar(\"Hello, World!\", 1)` → `\"Ifmmp, Xpsme!\"`",
        "Swift": "- `caesar(\"abc\", 1)` → `\"bcd\"`\n- `caesar(\"xyz\", 3)` → `\"abc\"`\n- `caesar(\"Hello, World!\", 1)` → `\"Ifmmp, Xpsme!\"`"
      },
      "firstTest": {
        "TypeScript": "test(\"caesar('abc', 1) は 'bcd'\", () => {\n  expect(caesar('abc', 1)).toBe('bcd');\n});",
        "JavaScript": "test(\"caesar('abc', 1) は 'bcd'\", () => {\n  expect(caesar('abc', 1)).toBe('bcd');\n});",
        "Python": "def test_shifts_abc_by_one():\n    assert caesar(\"abc\", 1) == \"bcd\"",
        "Java": "@Test\nvoid shiftsAbcByOne() {\n    assertEquals(\"bcd\", caesar(\"abc\", 1));\n}",
        "Go": "func TestShiftsAbcByOne(t *testing.T) {\n\tgot := caesar(\"abc\", 1)\n\twant := \"bcd\"\n\tif got != want {\n\t\tt.Errorf(\"got %q, want %q\", got, want)\n\t}\n}",
        "Ruby": "class CaesarTest < Minitest::Test\n  def test_shifts_abc_by_one\n    assert_equal 'bcd', caesar('abc', 1)\n  end\nend",
        "Rust": "#[test]\nfn shifts_abc_by_one() {\n    assert_eq!(caesar(\"abc\", 1), \"bcd\");\n}",
        "C#": "[Fact]\npublic void ShiftsAbcByOne()\n{\n    Assert.Equal(\"bcd\", Caesar(\"abc\", 1));\n}",
        "Kotlin": "@Test\nfun shiftsAbcByOne() {\n    assertEquals(\"bcd\", caesar(\"abc\", 1))\n}",
        "Swift": "func testShiftsAbcByOne() {\n    XCTAssertEqual(caesar(\"abc\", 1), \"bcd\")\n}"
      }
    }
  },
  {
    "title": "二分探索",
    "body": "## 背景\n\n境界条件のミスが起きやすい定番アルゴリズムです。オフバイワンエラーを TDD で潰す練習に向いています。\n\n昇順ソート済みの配列 `arr` から目標値 `target` の添字を返す `{{slot:fn}}(arr, target)` を実装します。見つからなければ {{slot:notFound}} を返します。\n\n## ルール\n\n- 計算量は `O(log n)`（線形探索ではない）\n- 存在しない値は {{slot:notFound}}\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n`lo`, `hi` の中点を求めて分岐します。ループ条件（`lo <= hi`）や中点計算のオーバーフローに注意してください。\n\n満たすこと:\n- [1,3,5,7,9] から 7 は添字 3\n- 存在しない値は {{slot:notFound}}\n- O(log n) で探索する（線形探索でない）\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- lo, hi の中点で分岐\n- 境界条件（lo <= hi）に注意",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "binarySearch",
        "JavaScript": "binarySearch",
        "Python": "binary_search",
        "Java": "binarySearch",
        "Go": "binarySearch",
        "Ruby": "binary_search",
        "Rust": "binary_search",
        "C#": "BinarySearch",
        "Kotlin": "binarySearch",
        "Swift": "binarySearch"
      },
      "notFound": {
        "TypeScript": "`-1`",
        "JavaScript": "`-1`",
        "Python": "`-1`",
        "Java": "`-1`",
        "Go": "`-1`",
        "Ruby": "`-1`",
        "Rust": "`None`",
        "C#": "`-1`",
        "Kotlin": "`-1`",
        "Swift": "`-1`"
      },
      "examples": {
        "TypeScript": "- `binarySearch([1, 3, 5, 7, 9], 7)` → `3`\n- `binarySearch([1, 3, 5, 7, 9], 4)` → `-1`\n- `binarySearch([], 1)` → `-1`",
        "JavaScript": "- `binarySearch([1, 3, 5, 7, 9], 7)` → `3`\n- `binarySearch([1, 3, 5, 7, 9], 4)` → `-1`\n- `binarySearch([], 1)` → `-1`",
        "Python": "- `binary_search([1, 3, 5, 7, 9], 7)` → `3`\n- `binary_search([1, 3, 5, 7, 9], 4)` → `-1`\n- `binary_search([], 1)` → `-1`",
        "Java": "- `binarySearch(new int[]{1, 3, 5, 7, 9}, 7)` → `3`\n- `binarySearch(new int[]{1, 3, 5, 7, 9}, 4)` → `-1`\n- `binarySearch(new int[]{}, 1)` → `-1`",
        "Go": "- `binarySearch([]int{1, 3, 5, 7, 9}, 7)` → `3`\n- `binarySearch([]int{1, 3, 5, 7, 9}, 4)` → `-1`\n- `binarySearch([]int{}, 1)` → `-1`",
        "Ruby": "- `binary_search([1, 3, 5, 7, 9], 7)` → `3`\n- `binary_search([1, 3, 5, 7, 9], 4)` → `-1`\n- `binary_search([], 1)` → `-1`",
        "Rust": "- `binary_search(&[1, 3, 5, 7, 9], 7)` → `Some(3)`\n- `binary_search(&[1, 3, 5, 7, 9], 4)` → `None`\n- `binary_search(&[], 1)` → `None`",
        "C#": "- `BinarySearch(new[] { 1, 3, 5, 7, 9 }, 7)` → `3`\n- `BinarySearch(new[] { 1, 3, 5, 7, 9 }, 4)` → `-1`\n- `BinarySearch(Array.Empty<int>(), 1)` → `-1`",
        "Kotlin": "- `binarySearch(listOf(1, 3, 5, 7, 9), 7)` → `3`\n- `binarySearch(listOf(1, 3, 5, 7, 9), 4)` → `-1`\n- `binarySearch(emptyList(), 1)` → `-1`",
        "Swift": "- `binarySearch([1, 3, 5, 7, 9], 7)` → `3`\n- `binarySearch([1, 3, 5, 7, 9], 4)` → `-1`\n- `binarySearch([], 1)` → `-1`"
      },
      "firstTest": {
        "TypeScript": "test('7 の添字は 3', () => {\n  expect(binarySearch([1, 3, 5, 7, 9], 7)).toBe(3);\n});",
        "JavaScript": "test('7 の添字は 3', () => {\n  expect(binarySearch([1, 3, 5, 7, 9], 7)).toBe(3);\n});",
        "Python": "def test_finds_index_of_seven():\n    assert binary_search([1, 3, 5, 7, 9], 7) == 3",
        "Java": "@Test\nvoid findsIndexOfSeven() {\n    assertEquals(3, binarySearch(new int[]{1, 3, 5, 7, 9}, 7));\n}",
        "Go": "func TestFindsIndexOfSeven(t *testing.T) {\n\tgot := binarySearch([]int{1, 3, 5, 7, 9}, 7)\n\twant := 3\n\tif got != want {\n\t\tt.Errorf(\"got %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class BinarySearchTest < Minitest::Test\n  def test_finds_index_of_seven\n    assert_equal 3, binary_search([1, 3, 5, 7, 9], 7)\n  end\nend",
        "Rust": "#[test]\nfn finds_index_of_seven() {\n    assert_eq!(binary_search(&[1, 3, 5, 7, 9], 7), Some(3));\n}",
        "C#": "[Fact]\npublic void FindsIndexOfSeven()\n{\n    Assert.Equal(3, BinarySearch(new[] { 1, 3, 5, 7, 9 }, 7));\n}",
        "Kotlin": "@Test\nfun findsIndexOfSeven() {\n    assertEquals(3, binarySearch(listOf(1, 3, 5, 7, 9), 7))\n}",
        "Swift": "func testFindsIndexOfSeven() {\n    XCTAssertEqual(binarySearch([1, 3, 5, 7, 9], 7), 3)\n}"
      }
    }
  },
  {
    "title": "2 数の和（Two Sum）",
    "body": "## 背景\n\n「ハッシュマップで計算量を `O(n²)` から `O(n)` に落とす」という発想を学ぶ有名なお題です。\n\n配列 `nums` から、合計が `target` になる 2 要素の添字ペアを返す `{{slot:fn}}(nums, target)` を実装します。\n\n## ルール\n\n- 同じ要素を 2 回使わない\n- 解は 1 組存在すると仮定してよい\n- 計算量 `O(n)` を目指す\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n走査しながら「これまで見た値 → 添字」をマップに記録し、各要素について `target - 現在値` がマップにあるか調べると 1 回の走査で解けます。\n\n満たすこと:\n- {{slot:fn}}([2,7,11,15], 9) は [0,1]\n- 同じ要素を 2 回使わない\n- O(n) で解く（ハッシュマップ利用）\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 『target - 現在値』を map で探す\n- 走査しながら map に記録",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "twoSum",
        "JavaScript": "twoSum",
        "Python": "two_sum",
        "Java": "twoSum",
        "Go": "twoSum",
        "Ruby": "two_sum",
        "Rust": "two_sum",
        "C#": "TwoSum",
        "Kotlin": "twoSum",
        "Swift": "twoSum"
      },
      "examples": {
        "TypeScript": "- `twoSum([2, 7, 11, 15], 9)` → `[0, 1]`\n- `twoSum([3, 2, 4], 6)` → `[1, 2]`",
        "JavaScript": "- `twoSum([2, 7, 11, 15], 9)` → `[0, 1]`\n- `twoSum([3, 2, 4], 6)` → `[1, 2]`",
        "Python": "- `two_sum([2, 7, 11, 15], 9)` → `(0, 1)`\n- `two_sum([3, 2, 4], 6)` → `(1, 2)`",
        "Java": "- `twoSum(new int[]{2, 7, 11, 15}, 9)` → `new int[]{0, 1}`\n- `twoSum(new int[]{3, 2, 4}, 6)` → `new int[]{1, 2}`",
        "Go": "- `twoSum([]int{2, 7, 11, 15}, 9)` → `[]int{0, 1}`\n- `twoSum([]int{3, 2, 4}, 6)` → `[]int{1, 2}`",
        "Ruby": "- `two_sum([2, 7, 11, 15], 9)` → `[0, 1]`\n- `two_sum([3, 2, 4], 6)` → `[1, 2]`",
        "Rust": "- `two_sum(&[2, 7, 11, 15], 9)` → `(0, 1)`\n- `two_sum(&[3, 2, 4], 6)` → `(1, 2)`",
        "C#": "- `TwoSum(new[] { 2, 7, 11, 15 }, 9)` → `(0, 1)`\n- `TwoSum(new[] { 3, 2, 4 }, 6)` → `(1, 2)`",
        "Kotlin": "- `twoSum(listOf(2, 7, 11, 15), 9)` → `Pair(0, 1)`\n- `twoSum(listOf(3, 2, 4), 6)` → `Pair(1, 2)`",
        "Swift": "- `twoSum([2, 7, 11, 15], 9)` → `[0, 1]`\n- `twoSum([3, 2, 4], 6)` → `[1, 2]`"
      },
      "firstTest": {
        "TypeScript": "test('和が 9 になるペア', () => {\n  expect(twoSum([2, 7, 11, 15], 9)).toEqual([0, 1]);\n});",
        "JavaScript": "test('和が 9 になるペア', () => {\n  expect(twoSum([2, 7, 11, 15], 9)).toEqual([0, 1]);\n});",
        "Python": "def test_finds_pair_summing_to_nine():\n    assert two_sum([2, 7, 11, 15], 9) == (0, 1)",
        "Java": "@Test\nvoid findsPairSummingToNine() {\n    assertArrayEquals(new int[]{0, 1}, twoSum(new int[]{2, 7, 11, 15}, 9));\n}",
        "Go": "import \"slices\"\n\nfunc TestFindsPairSummingToNine(t *testing.T) {\n\tgot := twoSum([]int{2, 7, 11, 15}, 9)\n\twant := []int{0, 1}\n\tif !slices.Equal(got, want) {\n\t\tt.Errorf(\"got %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class TwoSumTest < Minitest::Test\n  def test_finds_pair_summing_to_nine\n    assert_equal [0, 1], two_sum([2, 7, 11, 15], 9)\n  end\nend",
        "Rust": "#[test]\nfn finds_pair_summing_to_nine() {\n    assert_eq!(two_sum(&[2, 7, 11, 15], 9), (0, 1));\n}",
        "C#": "[Fact]\npublic void FindsPairSummingToNine()\n{\n    Assert.Equal((0, 1), TwoSum(new[] { 2, 7, 11, 15 }, 9));\n}",
        "Kotlin": "@Test\nfun findsPairSummingToNine() {\n    assertEquals(Pair(0, 1), twoSum(listOf(2, 7, 11, 15), 9))\n}",
        "Swift": "func testFindsPairSummingToNine() {\n    XCTAssertEqual(twoSum([2, 7, 11, 15], 9), [0, 1])\n}"
      }
    }
  },
  {
    "title": "連結リストの反転",
    "body": "## 背景\n\nポインタ（参照）の付け替えを練習する、データ構造の基本のお題です。\n\n単方向連結リストを反転する `{{slot:fn}}(head)` を実装します。先頭ノードを受け取り、反転後の先頭ノードを返します。\n\n## ルール\n\n- 空リスト・単一ノードも正しく扱う\n- 可能なら新規ノードを作らず、参照の付け替えだけで反転する\n\n## 例\n\n- `1 → 2 → 3` を反転すると `3 → 2 → 1`\n- 空リストを反転すると空リスト\n\n## 考慮すること\n\n`prev`, `curr`, `next` の 3 つの参照を使い、各ノードの `next` を直前のノードへ向け替えながら進めます。`next` を保存し忘れるとリストが切れるので注意してください。\n\n満たすこと:\n- 1→2→3 は 3→2→1 になる\n- 空リスト・単一ノードも正しく扱う\n- 新規ノードを作らず付け替えで反転（できれば）\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- prev, curr, next の 3 ポインタで付け替える",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "reverse",
        "JavaScript": "reverse",
        "Python": "reverse",
        "Java": "reverse",
        "Go": "reverse",
        "Ruby": "reverse",
        "Rust": "reverse",
        "C#": "Reverse",
        "Kotlin": "reverse",
        "Swift": "reverse"
      },
      "firstTest": {
        "TypeScript": "test('1→2→3 を反転', () => {\n  expect(toArray(reverse(fromArray([1, 2, 3])))).toEqual([3, 2, 1]);\n});",
        "JavaScript": "test('1→2→3 を反転', () => {\n  expect(toArray(reverse(fromArray([1, 2, 3])))).toEqual([3, 2, 1]);\n});",
        "Python": "def test_reverses_three_nodes():\n    assert to_list(reverse(from_list([1, 2, 3]))) == [3, 2, 1]",
        "Java": "@Test\nvoid reversesThreeNodes() {\n    assertEquals(List.of(3, 2, 1), toList(reverse(fromList(List.of(1, 2, 3)))));\n}",
        "Go": "import \"slices\"\n\nfunc TestReversesThreeNodes(t *testing.T) {\n\tgot := toSlice(reverse(fromSlice([]int{1, 2, 3})))\n\twant := []int{3, 2, 1}\n\tif !slices.Equal(got, want) {\n\t\tt.Errorf(\"got %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class ReverseTest < Minitest::Test\n  def test_reverses_three_nodes\n    assert_equal [3, 2, 1], to_array(reverse(from_array([1, 2, 3])))\n  end\nend",
        "Rust": "#[test]\nfn reverses_three_nodes() {\n    assert_eq!(to_vec(reverse(from_slice(&[1, 2, 3]))), vec![3, 2, 1]);\n}",
        "C#": "[Fact]\npublic void ReversesThreeNodes()\n{\n    Assert.Equal(new[] { 3, 2, 1 }, ToArray(Reverse(FromArray(new[] { 1, 2, 3 }))));\n}",
        "Kotlin": "@Test\nfun reversesThreeNodes() {\n    assertEquals(listOf(3, 2, 1), toList(reverse(fromList(listOf(1, 2, 3)))))\n}",
        "Swift": "func testReversesThreeNodes() {\n    XCTAssertEqual(toArray(reverse(fromArray([1, 2, 3]))), [3, 2, 1])\n}"
      }
    }
  },
  {
    "title": "区間のマージ",
    "body": "## 背景\n\n「ソートしてから 1 回走査する」という頻出パターンを学ぶお題です。スケジュール調整などで実際に使われます。\n\n重なり合う区間をマージする `{{slot:fn}}(intervals)` を実装します。各区間は `[開始, 終了]` の配列です。\n\n## ルール\n\n- 重複・隣接する区間は 1 つにまとめる\n- 重ならない区間はそのまま残す\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\nまず開始位置でソートします。次に直前のマージ済み区間の終端と現区間の開始を比較し、重なっていれば終端を延長、そうでなければ新しい区間として追加します。\n\n満たすこと:\n- 開始でソートしてからマージ\n- 隣接・重複する区間を 1 つにまとめる\n- 重ならない区間はそのまま残す\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 開始位置でソート\n- 直前区間の終端と現区間の開始を比較",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "merge",
        "JavaScript": "merge",
        "Python": "merge",
        "Java": "merge",
        "Go": "merge",
        "Ruby": "merge",
        "Rust": "merge",
        "C#": "Merge",
        "Kotlin": "merge",
        "Swift": "merge"
      },
      "examples": {
        "TypeScript": "- `merge([[1, 3], [2, 6], [8, 10]])` → `[[1, 6], [8, 10]]`\n- `merge([[1, 4], [4, 5]])` → `[[1, 5]]`",
        "JavaScript": "- `merge([[1, 3], [2, 6], [8, 10]])` → `[[1, 6], [8, 10]]`\n- `merge([[1, 4], [4, 5]])` → `[[1, 5]]`",
        "Python": "- `merge([[1, 3], [2, 6], [8, 10]])` → `[[1, 6], [8, 10]]`\n- `merge([[1, 4], [4, 5]])` → `[[1, 5]]`",
        "Java": "- `merge(new int[][]{{1, 3}, {2, 6}, {8, 10}})` → `new int[][]{{1, 6}, {8, 10}}`\n- `merge(new int[][]{{1, 4}, {4, 5}})` → `new int[][]{{1, 5}}`",
        "Go": "- `merge([][2]int{{1, 3}, {2, 6}, {8, 10}})` → `[][2]int{{1, 6}, {8, 10}}`\n- `merge([][2]int{{1, 4}, {4, 5}})` → `[][2]int{{1, 5}}`",
        "Ruby": "- `merge([[1, 3], [2, 6], [8, 10]])` → `[[1, 6], [8, 10]]`\n- `merge([[1, 4], [4, 5]])` → `[[1, 5]]`",
        "Rust": "- `merge(vec![[1, 3], [2, 6], [8, 10]])` → `vec![[1, 6], [8, 10]]`\n- `merge(vec![[1, 4], [4, 5]])` → `vec![[1, 5]]`",
        "C#": "- `Merge(new[] { (1, 3), (2, 6), (8, 10) })` → `new[] { (1, 6), (8, 10) }`\n- `Merge(new[] { (1, 4), (4, 5) })` → `new[] { (1, 5) }`",
        "Kotlin": "- `merge(listOf(1 to 3, 2 to 6, 8 to 10))` → `listOf(1 to 6, 8 to 10)`\n- `merge(listOf(1 to 4, 4 to 5))` → `listOf(1 to 5)`",
        "Swift": "- `merge([[1, 3], [2, 6], [8, 10]])` → `[[1, 6], [8, 10]]`\n- `merge([[1, 4], [4, 5]])` → `[[1, 5]]`"
      },
      "firstTest": {
        "TypeScript": "test('区間をマージ', () => {\n  expect(merge([[1, 3], [2, 6], [8, 10]])).toEqual([[1, 6], [8, 10]]);\n});",
        "JavaScript": "test('区間をマージ', () => {\n  expect(merge([[1, 3], [2, 6], [8, 10]])).toEqual([[1, 6], [8, 10]]);\n});",
        "Python": "def test_merges_overlapping_intervals():\n    assert merge([[1, 3], [2, 6], [8, 10]]) == [[1, 6], [8, 10]]",
        "Java": "@Test\nvoid mergesOverlappingIntervals() {\n    assertArrayEquals(new int[][]{{1, 6}, {8, 10}}, merge(new int[][]{{1, 3}, {2, 6}, {8, 10}}));\n}",
        "Go": "import \"slices\"\n\nfunc TestMergesOverlappingIntervals(t *testing.T) {\n\tgot := merge([][2]int{{1, 3}, {2, 6}, {8, 10}})\n\twant := [][2]int{{1, 6}, {8, 10}}\n\tif !slices.Equal(got, want) {\n\t\tt.Errorf(\"got %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class MergeTest < Minitest::Test\n  def test_merges_overlapping_intervals\n    assert_equal [[1, 6], [8, 10]], merge([[1, 3], [2, 6], [8, 10]])\n  end\nend",
        "Rust": "#[test]\nfn merges_overlapping_intervals() {\n    assert_eq!(merge(vec![[1, 3], [2, 6], [8, 10]]), vec![[1, 6], [8, 10]]);\n}",
        "C#": "[Fact]\npublic void MergesOverlappingIntervals()\n{\n    Assert.Equal(new[] { (1, 6), (8, 10) }, Merge(new[] { (1, 3), (2, 6), (8, 10) }));\n}",
        "Kotlin": "@Test\nfun mergesOverlappingIntervals() {\n    assertEquals(listOf(1 to 6, 8 to 10), merge(listOf(1 to 3, 2 to 6, 8 to 10)))\n}",
        "Swift": "func testMergesOverlappingIntervals() {\n    XCTAssertEqual(merge([[1, 3], [2, 6], [8, 10]]), [[1, 6], [8, 10]])\n}"
      }
    }
  },
  {
    "title": "逆ポーランド記法電卓",
    "body": "## 背景\n\nスタックの応用として定番のお題です。逆ポーランド記法（RPN）は演算子を後置するため、括弧なしで優先順位を表現できます。\n\nトークン列 `tokens` を評価して結果を返す `{{slot:fn}}(tokens)` を実装します。\n\n## ルール\n\n- `+`, `-`, `*`, `/` の四則演算に対応する\n- 整数除算の扱い（切り捨て方向など）を決める\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n数値はスタックに積み、演算子が来たら 2 つ取り出して計算し、結果を積み直します。引く順序・割る順序を間違えないよう注意してください。\n\n満たすこと:\n- + - * / の四則演算に対応\n- 整数除算の扱いを決める\n- スタックで評価する\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 数はスタックに積み、演算子で 2 つ取り出して計算",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "evalRPN",
        "JavaScript": "evalRPN",
        "Python": "eval_rpn",
        "Java": "evalRPN",
        "Go": "evalRPN",
        "Ruby": "eval_rpn",
        "Rust": "eval_rpn",
        "C#": "EvalRpn",
        "Kotlin": "evalRPN",
        "Swift": "evalRPN"
      },
      "examples": {
        "TypeScript": "- `evalRPN([\"2\", \"1\", \"+\", \"3\", \"*\"])` → `9`（`(2 + 1) × 3`）\n- `evalRPN([\"4\", \"13\", \"5\", \"/\", \"+\"])` → `6`",
        "JavaScript": "- `evalRPN([\"2\", \"1\", \"+\", \"3\", \"*\"])` → `9`（`(2 + 1) × 3`）\n- `evalRPN([\"4\", \"13\", \"5\", \"/\", \"+\"])` → `6`",
        "Python": "- `eval_rpn([\"2\", \"1\", \"+\", \"3\", \"*\"])` → `9`（`(2 + 1) × 3`）\n- `eval_rpn([\"4\", \"13\", \"5\", \"/\", \"+\"])` → `6`",
        "Java": "- `evalRPN(List.of(\"2\", \"1\", \"+\", \"3\", \"*\"))` → `9`（`(2 + 1) × 3`）\n- `evalRPN(List.of(\"4\", \"13\", \"5\", \"/\", \"+\"))` → `6`",
        "Go": "- `evalRPN([]string{\"2\", \"1\", \"+\", \"3\", \"*\"})` → `9`（`(2 + 1) × 3`）\n- `evalRPN([]string{\"4\", \"13\", \"5\", \"/\", \"+\"})` → `6`",
        "Ruby": "- `eval_rpn(['2', '1', '+', '3', '*'])` → `9`（`(2 + 1) × 3`）\n- `eval_rpn(['4', '13', '5', '/', '+'])` → `6`",
        "Rust": "- `eval_rpn(&[\"2\", \"1\", \"+\", \"3\", \"*\"])` → `9`（`(2 + 1) × 3`）\n- `eval_rpn(&[\"4\", \"13\", \"5\", \"/\", \"+\"])` → `6`",
        "C#": "- `EvalRpn(new[] { \"2\", \"1\", \"+\", \"3\", \"*\" })` → `9`（`(2 + 1) × 3`）\n- `EvalRpn(new[] { \"4\", \"13\", \"5\", \"/\", \"+\" })` → `6`",
        "Kotlin": "- `evalRPN(listOf(\"2\", \"1\", \"+\", \"3\", \"*\"))` → `9`（`(2 + 1) × 3`）\n- `evalRPN(listOf(\"4\", \"13\", \"5\", \"/\", \"+\"))` → `6`",
        "Swift": "- `evalRPN([\"2\", \"1\", \"+\", \"3\", \"*\"])` → `9`（`(2 + 1) × 3`）\n- `evalRPN([\"4\", \"13\", \"5\", \"/\", \"+\"])` → `6`"
      },
      "firstTest": {
        "TypeScript": "test('(2+1)*3 = 9', () => {\n  expect(evalRPN(['2', '1', '+', '3', '*'])).toBe(9);\n});",
        "JavaScript": "test('(2+1)*3 = 9', () => {\n  expect(evalRPN(['2', '1', '+', '3', '*'])).toBe(9);\n});",
        "Python": "def test_adds_then_multiplies():\n    assert eval_rpn([\"2\", \"1\", \"+\", \"3\", \"*\"]) == 9",
        "Java": "@Test\nvoid addsThenMultiplies() {\n    assertEquals(9, evalRPN(List.of(\"2\", \"1\", \"+\", \"3\", \"*\")));\n}",
        "Go": "func TestAddsThenMultiplies(t *testing.T) {\n\tgot := evalRPN([]string{\"2\", \"1\", \"+\", \"3\", \"*\"})\n\twant := 9\n\tif got != want {\n\t\tt.Errorf(\"got %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class EvalRpnTest < Minitest::Test\n  def test_adds_then_multiplies\n    assert_equal 9, eval_rpn(['2', '1', '+', '3', '*'])\n  end\nend",
        "Rust": "#[test]\nfn adds_then_multiplies() {\n    assert_eq!(eval_rpn(&[\"2\", \"1\", \"+\", \"3\", \"*\"]), 9);\n}",
        "C#": "[Fact]\npublic void AddsThenMultiplies()\n{\n    Assert.Equal(9, EvalRpn(new[] { \"2\", \"1\", \"+\", \"3\", \"*\" }));\n}",
        "Kotlin": "@Test\nfun addsThenMultiplies() {\n    assertEquals(9, evalRPN(listOf(\"2\", \"1\", \"+\", \"3\", \"*\")))\n}",
        "Swift": "func testAddsThenMultiplies() {\n    XCTAssertEqual(evalRPN([\"2\", \"1\", \"+\", \"3\", \"*\"]), 9)\n}"
      }
    }
  },
  {
    "title": "ショッピングカート合計",
    "body": "## 背景\n\n実務に近いドメインで、畳み込み（集計）と割引ルールの適用を練習するお題です。\n\n商品のリスト `items` から合計金額を計算する `{{slot:fn}}(items)` を実装します。各商品は {{slot:itemShape}}（単価と個数）を持ちます。\n\n## ルール\n\n- 合計は各商品の `price × qty` の総和\n- 空のカートは `0`\n- 割引率（例: 0.1 = 10% オフ）があれば最後に適用できるようにする（任意の拡張）\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n各明細の小計を畳み込みで加算し、割引はすべて合算した後に一括で適用すると、計算の責務が分離できます。\n\n満たすこと:\n- [{price:100, qty:2}] の合計は 200\n- 空カートは 0\n- 割引率 0.1（10%オフ）を適用できる（任意の拡張）\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 畳み込みで price*qty を加算\n- 割引は最後に一括適用",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "total",
        "JavaScript": "total",
        "Python": "total",
        "Java": "total",
        "Go": "total",
        "Ruby": "total",
        "Rust": "total",
        "C#": "Total",
        "Kotlin": "total",
        "Swift": "total"
      },
      "itemShape": {
        "TypeScript": "`{ price: number; qty: number }`",
        "JavaScript": "`{ price, qty }`",
        "Python": "`Item(price, qty)`",
        "Java": "`Item(price, qty)`",
        "Go": "`item{price, qty}`",
        "Ruby": "`{ price:, qty: }`",
        "Rust": "`Item { price, qty }`",
        "C#": "`Item(Price, Qty)`",
        "Kotlin": "`Item(price, qty)`",
        "Swift": "`Item(price:qty:)`"
      },
      "examples": {
        "TypeScript": "- `total([{ price: 100, qty: 2 }])` → `200`\n- `total([{ price: 100, qty: 2 }, { price: 50, qty: 1 }])` → `250`\n- `total([])` → `0`",
        "JavaScript": "- `total([{ price: 100, qty: 2 }])` → `200`\n- `total([{ price: 100, qty: 2 }, { price: 50, qty: 1 }])` → `250`\n- `total([])` → `0`",
        "Python": "- `total([Item(price=100, qty=2)])` → `200`\n- `total([Item(price=100, qty=2), Item(price=50, qty=1)])` → `250`\n- `total([])` → `0`",
        "Java": "- `total(List.of(new Item(100, 2)))` → `200`\n- `total(List.of(new Item(100, 2), new Item(50, 1)))` → `250`\n- `total(List.of())` → `0`",
        "Go": "- `total([]item{{price: 100, qty: 2}})` → `200`\n- `total([]item{{price: 100, qty: 2}, {price: 50, qty: 1}})` → `250`\n- `total([]item{})` → `0`",
        "Ruby": "- `total([{ price: 100, qty: 2 }])` → `200`\n- `total([{ price: 100, qty: 2 }, { price: 50, qty: 1 }])` → `250`\n- `total([])` → `0`",
        "Rust": "- `total(&[Item { price: 100, qty: 2 }])` → `200`\n- `total(&[Item { price: 100, qty: 2 }, Item { price: 50, qty: 1 }])` → `250`\n- `total(&[])` → `0`",
        "C#": "- `Total(new[] { new Item(100, 2) })` → `200`\n- `Total(new[] { new Item(100, 2), new Item(50, 1) })` → `250`\n- `Total(Array.Empty<Item>())` → `0`",
        "Kotlin": "- `total(listOf(Item(price = 100, qty = 2)))` → `200`\n- `total(listOf(Item(price = 100, qty = 2), Item(price = 50, qty = 1)))` → `250`\n- `total(emptyList())` → `0`",
        "Swift": "- `total([Item(price: 100, qty: 2)])` → `200`\n- `total([Item(price: 100, qty: 2), Item(price: 50, qty: 1)])` → `250`\n- `total([])` → `0`"
      },
      "firstTest": {
        "TypeScript": "test('合計は 200', () => {\n  expect(total([{ price: 100, qty: 2 }])).toBe(200);\n});",
        "JavaScript": "test('合計は 200', () => {\n  expect(total([{ price: 100, qty: 2 }])).toBe(200);\n});",
        "Python": "def test_total_is_200():\n    assert total([Item(price=100, qty=2)]) == 200",
        "Java": "@Test\nvoid totalIs200() {\n    assertEquals(200, total(List.of(new Item(100, 2))));\n}",
        "Go": "func TestTotalIs200(t *testing.T) {\n\tgot := total([]item{{price: 100, qty: 2}})\n\twant := 200\n\tif got != want {\n\t\tt.Errorf(\"got %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class TotalTest < Minitest::Test\n  def test_total_is_200\n    assert_equal 200, total([{ price: 100, qty: 2 }])\n  end\nend",
        "Rust": "#[test]\nfn total_is_200() {\n    assert_eq!(total(&[Item { price: 100, qty: 2 }]), 200);\n}",
        "C#": "[Fact]\npublic void TotalIs200()\n{\n    Assert.Equal(200, Total(new[] { new Item(100, 2) }));\n}",
        "Kotlin": "@Test\nfun totalIs200() {\n    assertEquals(200, total(listOf(Item(price = 100, qty = 2))))\n}",
        "Swift": "func testTotalIs200() {\n    XCTAssertEqual(total([Item(price: 100, qty: 2)]), 200)\n}"
      }
    }
  },
  {
    "title": "パスワード強度チェック",
    "body": "## 背景\n\n複数の独立した条件を組み合わせて判定する練習です。各条件を個別のテストで詰めていけます。\n\nパスワード `pw` が規則を満たすかを判定する `{{slot:fn}}(pw)` を実装します。\n\n## ルール\n\n次のすべてを満たすとき {{slot:trueValue}}、1 つでも欠ければ {{slot:falseValue}}。\n\n1. 8 文字以上\n2. 英大文字を 1 文字以上含む\n3. 英小文字を 1 文字以上含む\n4. 数字を 1 文字以上含む\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n各条件を個別のフラグ（真偽値）で求め、最後にすべての AND を取ると、要件とテストが 1 対 1 に対応します。\n\n満たすこと:\n- 8 文字以上\n- 大文字・小文字・数字をそれぞれ 1 文字以上含む\n- 条件を満たさなければ {{slot:falseWord}}\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 各条件を個別のフラグで判定して AND を取る",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "isStrong",
        "JavaScript": "isStrong",
        "Python": "is_strong",
        "Java": "isStrong",
        "Go": "isStrong",
        "Ruby": "strong?",
        "Rust": "is_strong",
        "C#": "IsStrong",
        "Kotlin": "isStrong",
        "Swift": "isStrong"
      },
      "examples": {
        "TypeScript": "- `isStrong(\"Abcd1234\")` → `true`\n- `isStrong(\"abcd1234\")` → `false`（大文字なし）\n- `isStrong(\"Ab1\")` → `false`（短い）",
        "JavaScript": "- `isStrong(\"Abcd1234\")` → `true`\n- `isStrong(\"abcd1234\")` → `false`（大文字なし）\n- `isStrong(\"Ab1\")` → `false`（短い）",
        "Python": "- `is_strong(\"Abcd1234\")` → `True`\n- `is_strong(\"abcd1234\")` → `False`（大文字なし）\n- `is_strong(\"Ab1\")` → `False`（短い）",
        "Java": "- `isStrong(\"Abcd1234\")` → `true`\n- `isStrong(\"abcd1234\")` → `false`（大文字なし）\n- `isStrong(\"Ab1\")` → `false`（短い）",
        "Go": "- `isStrong(\"Abcd1234\")` → `true`\n- `isStrong(\"abcd1234\")` → `false`（大文字なし）\n- `isStrong(\"Ab1\")` → `false`（短い）",
        "Ruby": "- `strong?('Abcd1234')` → `true`\n- `strong?('abcd1234')` → `false`（大文字なし）\n- `strong?('Ab1')` → `false`（短い）",
        "Rust": "- `is_strong(\"Abcd1234\")` → `true`\n- `is_strong(\"abcd1234\")` → `false`（大文字なし）\n- `is_strong(\"Ab1\")` → `false`（短い）",
        "C#": "- `IsStrong(\"Abcd1234\")` → `true`\n- `IsStrong(\"abcd1234\")` → `false`（大文字なし）\n- `IsStrong(\"Ab1\")` → `false`（短い）",
        "Kotlin": "- `isStrong(\"Abcd1234\")` → `true`\n- `isStrong(\"abcd1234\")` → `false`（大文字なし）\n- `isStrong(\"Ab1\")` → `false`（短い）",
        "Swift": "- `isStrong(\"Abcd1234\")` → `true`\n- `isStrong(\"abcd1234\")` → `false`（大文字なし）\n- `isStrong(\"Ab1\")` → `false`（短い）"
      },
      "firstTest": {
        "TypeScript": "test(\"'Abcd1234' は強い\", () => {\n  expect(isStrong('Abcd1234')).toBe(true);\n});",
        "JavaScript": "test(\"'Abcd1234' は強い\", () => {\n  expect(isStrong('Abcd1234')).toBe(true);\n});",
        "Python": "def test_strong_password():\n    assert is_strong(\"Abcd1234\")",
        "Java": "@Test\nvoid strongPassword() {\n    assertTrue(isStrong(\"Abcd1234\"));\n}",
        "Go": "func TestStrongPassword(t *testing.T) {\n\tgot := isStrong(\"Abcd1234\")\n\twant := true\n\tif got != want {\n\t\tt.Errorf(\"got %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class StrongTest < Minitest::Test\n  def test_strong_password\n    assert strong?('Abcd1234')\n  end\nend",
        "Rust": "#[test]\nfn strong_password() {\n    assert!(is_strong(\"Abcd1234\"));\n}",
        "C#": "[Fact]\npublic void StrongPassword()\n{\n    Assert.True(IsStrong(\"Abcd1234\"));\n}",
        "Kotlin": "@Test\nfun strongPassword() {\n    assertTrue(isStrong(\"Abcd1234\"))\n}",
        "Swift": "func testStrongPassword() {\n    XCTAssertTrue(isStrong(\"Abcd1234\"))\n}"
      },
      "trueValue": {
        "TypeScript": "`true`",
        "JavaScript": "`true`",
        "Python": "`True`",
        "Java": "`true`",
        "Go": "`true`",
        "Ruby": "`true`",
        "Rust": "`true`",
        "C#": "`true`",
        "Kotlin": "`true`",
        "Swift": "`true`"
      },
      "falseValue": {
        "TypeScript": "`false`",
        "JavaScript": "`false`",
        "Python": "`False`",
        "Java": "`false`",
        "Go": "`false`",
        "Ruby": "`false`",
        "Rust": "`false`",
        "C#": "`false`",
        "Kotlin": "`false`",
        "Swift": "`false`"
      },
      "falseWord": {
        "TypeScript": "false",
        "JavaScript": "false",
        "Python": "False",
        "Java": "false",
        "Go": "false",
        "Ruby": "false",
        "Rust": "false",
        "C#": "false",
        "Kotlin": "false",
        "Swift": "false"
      }
    }
  },
  {
    "title": "電話番号フォーマット",
    "body": "## 背景\n\n入力の正規化（ノイズ除去）と、固定フォーマットへの整形を練習するお題です。\n\n文字列 `s` を受け取り、日本の携帯番号を `090-1234-5678` 形式に整形する `{{slot:fn}}(s)` を実装します。\n\n## ルール\n\n- 入力に含まれるハイフン・空白などの非数字は無視する\n- 数字を抽出して 3-4-4 の形に区切る\n- 数字が 11 桁でなければエラー（または {{slot:none}}）\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\nまず数字だけを抽出し、桁数を検証してから 3-4-4 で区切ります。検証を先に行うと整形ロジックが単純になります。\n\n満たすこと:\n- '09012345678' は '090-1234-5678'\n- ハイフン入り入力も受け付ける\n- 11 桁でなければエラー（または {{slot:none}}）\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- まず数字だけ抽出\n- 3-4-4 で区切る",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "formatPhone",
        "JavaScript": "formatPhone",
        "Python": "format_phone",
        "Java": "formatPhone",
        "Go": "formatPhone",
        "Ruby": "format_phone",
        "Rust": "format_phone",
        "C#": "FormatPhone",
        "Kotlin": "formatPhone",
        "Swift": "formatPhone"
      },
      "none": {
        "TypeScript": "`null`",
        "JavaScript": "`null`",
        "Python": "`None`",
        "Java": "`Optional.empty()`",
        "Go": "2 つ目の戻り値 `ok` が `false`",
        "Ruby": "`nil`",
        "Rust": "`None`",
        "C#": "`null`",
        "Kotlin": "`null`",
        "Swift": "`nil`"
      },
      "examples": {
        "TypeScript": "- `formatPhone(\"09012345678\")` → `\"090-1234-5678\"`\n- `formatPhone(\"090-1234-5678\")` → `\"090-1234-5678\"`\n- `formatPhone(\"0901234\")` → `null`（桁不足）",
        "JavaScript": "- `formatPhone(\"09012345678\")` → `\"090-1234-5678\"`\n- `formatPhone(\"090-1234-5678\")` → `\"090-1234-5678\"`\n- `formatPhone(\"0901234\")` → `null`（桁不足）",
        "Python": "- `format_phone(\"09012345678\")` → `\"090-1234-5678\"`\n- `format_phone(\"090-1234-5678\")` → `\"090-1234-5678\"`\n- `format_phone(\"0901234\")` → `None`（桁不足）",
        "Java": "- `formatPhone(\"09012345678\")` → `Optional.of(\"090-1234-5678\")`\n- `formatPhone(\"090-1234-5678\")` → `Optional.of(\"090-1234-5678\")`\n- `formatPhone(\"0901234\")` → `Optional.empty()`（桁不足）",
        "Go": "- `formatPhone(\"09012345678\")` → `\"090-1234-5678\", true`\n- `formatPhone(\"090-1234-5678\")` → `\"090-1234-5678\", true`\n- `formatPhone(\"0901234\")` → `\"\", false`（桁不足）",
        "Ruby": "- `format_phone('09012345678')` → `'090-1234-5678'`\n- `format_phone('090-1234-5678')` → `'090-1234-5678'`\n- `format_phone('0901234')` → `nil`（桁不足）",
        "Rust": "- `format_phone(\"09012345678\")` → `Some(\"090-1234-5678\")`\n- `format_phone(\"090-1234-5678\")` → `Some(\"090-1234-5678\")`\n- `format_phone(\"0901234\")` → `None`（桁不足）",
        "C#": "- `FormatPhone(\"09012345678\")` → `\"090-1234-5678\"`\n- `FormatPhone(\"090-1234-5678\")` → `\"090-1234-5678\"`\n- `FormatPhone(\"0901234\")` → `null`（桁不足）",
        "Kotlin": "- `formatPhone(\"09012345678\")` → `\"090-1234-5678\"`\n- `formatPhone(\"090-1234-5678\")` → `\"090-1234-5678\"`\n- `formatPhone(\"0901234\")` → `null`（桁不足）",
        "Swift": "- `formatPhone(\"09012345678\")` → `\"090-1234-5678\"`\n- `formatPhone(\"090-1234-5678\")` → `\"090-1234-5678\"`\n- `formatPhone(\"0901234\")` → `nil`（桁不足）"
      },
      "firstTest": {
        "TypeScript": "test('携帯番号を整形', () => {\n  expect(formatPhone('09012345678')).toBe('090-1234-5678');\n});",
        "JavaScript": "test('携帯番号を整形', () => {\n  expect(formatPhone('09012345678')).toBe('090-1234-5678');\n});",
        "Python": "def test_formats_mobile_number():\n    assert format_phone(\"09012345678\") == \"090-1234-5678\"",
        "Java": "@Test\nvoid formatsMobileNumber() {\n    assertEquals(Optional.of(\"090-1234-5678\"), formatPhone(\"09012345678\"));\n}",
        "Go": "func TestFormatsMobileNumber(t *testing.T) {\n\tgot, ok := formatPhone(\"09012345678\")\n\twant := \"090-1234-5678\"\n\tif !ok || got != want {\n\t\tt.Errorf(\"got %q, %v; want %q\", got, ok, want)\n\t}\n}",
        "Ruby": "class FormatPhoneTest < Minitest::Test\n  def test_formats_mobile_number\n    assert_equal '090-1234-5678', format_phone('09012345678')\n  end\nend",
        "Rust": "#[test]\nfn formats_mobile_number() {\n    assert_eq!(format_phone(\"09012345678\").as_deref(), Some(\"090-1234-5678\"));\n}",
        "C#": "[Fact]\npublic void FormatsMobileNumber()\n{\n    Assert.Equal(\"090-1234-5678\", FormatPhone(\"09012345678\"));\n}",
        "Kotlin": "@Test\nfun formatsMobileNumber() {\n    assertEquals(\"090-1234-5678\", formatPhone(\"09012345678\"))\n}",
        "Swift": "func testFormatsMobileNumber() {\n    XCTAssertEqual(formatPhone(\"09012345678\"), \"090-1234-5678\")\n}"
      }
    }
  },
  {
    "title": "ボウリングのスコア計算",
    "body": "## 背景\n\nTDD の練習として世界的に有名な「Bowling Game Kata」です。ボーナス計算のルールが絡み合い、小さなテストで少しずつ詰めていくのに最適です。\n\n10 フレーム分の投球結果（各投で倒したピン数の配列）`rolls` を受け取り、合計スコアを返す `{{slot:name}}(rolls)` を実装します。\n\n## ルール\n\n- 1 フレームは原則 2 投。10 本倒したら次の投球がボーナス対象\n- **スペア**（2 投で 10 本）: 次の 1 投をボーナス加算\n- **ストライク**（1 投で 10 本）: 次の 2 投をボーナス加算\n- 第 10 フレームはボーナス投球が追加される\n\n## 例\n\n- 全ガター（すべて 0）→ `0`\n- オールストライク（パーフェクトゲーム）→ `300`\n\n## 考慮すること\n\nロールの配列を「フレーム単位」で進めるのがコツです。ストライクは 1 投で 1 フレーム、スペア・通常は 2 投で 1 フレーム進みます。ボーナスは配列の次の要素を覗いて加算します。\n\n満たすこと:\n- 全ガター（0 投）は 0 点\n- スペアは次 1 投、ストライクは次 2 投をボーナス加算\n- オールストライク（パーフェクト）は 300 点\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- フレーム単位でロール位置を進める\n- ストライクは 1 投で 1 フレーム",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "name": {
        "TypeScript": "score",
        "JavaScript": "score",
        "Python": "score",
        "Java": "score",
        "Go": "score",
        "Ruby": "score",
        "Rust": "score",
        "C#": "Score",
        "Kotlin": "score",
        "Swift": "score"
      },
      "firstTest": {
        "TypeScript": "test('パーフェクトゲームは 300', () => {\n  const rolls: number[] = Array(12).fill(10);\n  expect(score(rolls)).toBe(300);\n});",
        "JavaScript": "test('パーフェクトゲームは 300', () => {\n  expect(score(Array(12).fill(10))).toBe(300);\n});",
        "Python": "def test_perfect_game_scores_300():\n    assert score([10] * 12) == 300",
        "Java": "@Test\nvoid perfectGameScores300() {\n    int[] rolls = new int[12];\n    Arrays.fill(rolls, 10);\n    assertEquals(300, score(rolls));\n}",
        "Go": "func TestPerfectGame(t *testing.T) {\n\trolls := make([]int, 12)\n\tfor i := range rolls {\n\t\trolls[i] = 10\n\t}\n\tif got := score(rolls); got != 300 {\n\t\tt.Errorf(\"score = %d, want 300\", got)\n\t}\n}",
        "Ruby": "class BowlingTest < Minitest::Test\n  def test_perfect_game_scores_300\n    assert_equal 300, score([10] * 12)\n  end\nend",
        "Rust": "#[test]\nfn perfect_game_scores_300() {\n    assert_eq!(score(&[10; 12]), 300);\n}",
        "C#": "[Fact]\npublic void PerfectGameScores300()\n{\n    Assert.Equal(300, Score(Enumerable.Repeat(10, 12).ToArray()));\n}",
        "Kotlin": "@Test\nfun perfectGameScores300() {\n    assertEquals(300, score(List(12) { 10 }))\n}",
        "Swift": "func testPerfectGameScores300() {\n    XCTAssertEqual(score(Array(repeating: 10, count: 12)), 300)\n}"
      }
    }
  },
  {
    "title": "LRU キャッシュ",
    "body": "## 背景\n\nデータ構造を組み合わせて計算量の要件を満たす設計力を鍛えるお題です。実際のキャッシュ実装の縮図です。\n\n容量上限つきの LRU（Least Recently Used）キャッシュ `LRUCache` を実装します。\n\n## 振る舞い\n\n- {{slot:ctor}}: 容量を指定して生成\n- `{{slot:get}}(key)`: 値を返す。存在しなければ {{slot:none}}\n- `{{slot:put}}(key, value)`: 値を登録。容量を超えたら最も長く使われていない要素を捨てる\n- `{{slot:get}}` / `{{slot:put}}` でアクセスした要素は「最新」として扱う\n\n## 例\n\n```\n{{slot:code1}}\n```\n\n## 考慮すること\n\n`{{slot:get}}` / `{{slot:put}}` を `O(1)` で実現するには、ハッシュマップ＋双方向連結リストの組み合わせが定番です。言語に挿入順を保つマップがあればそれでも実装できます。\n\n満たすこと:\n- 容量を超えると最も使われていない要素を捨てる\n- {{slot:get}}/{{slot:put}} でアクセスした要素は最新扱いになる\n- 存在しないキーの {{slot:get}} は {{slot:none}} を返す\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- ハッシュ + 双方向連結リスト\n- 言語の順序付きマップでも可",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "ctor": {
        "TypeScript": "`new LRUCache(capacity)`",
        "JavaScript": "`new LRUCache(capacity)`",
        "Python": "`LRUCache(capacity)`",
        "Java": "`new LRUCache(capacity)`",
        "Go": "`newLRUCache(capacity)`",
        "Ruby": "`LRUCache.new(capacity)`",
        "Rust": "`LRUCache::new(capacity)`",
        "C#": "`new LRUCache(capacity)`",
        "Kotlin": "`LRUCache(capacity)`",
        "Swift": "`LRUCache(capacity:)`"
      },
      "get": {
        "TypeScript": "get",
        "JavaScript": "get",
        "Python": "get",
        "Java": "get",
        "Go": "get",
        "Ruby": "get",
        "Rust": "get",
        "C#": "Get",
        "Kotlin": "get",
        "Swift": "get"
      },
      "put": {
        "TypeScript": "put",
        "JavaScript": "put",
        "Python": "put",
        "Java": "put",
        "Go": "put",
        "Ruby": "put",
        "Rust": "put",
        "C#": "Put",
        "Kotlin": "put",
        "Swift": "put"
      },
      "none": {
        "TypeScript": "`undefined`",
        "JavaScript": "`undefined`",
        "Python": "`None`",
        "Java": "`null`",
        "Go": "`false`（2 つ目の戻り値）",
        "Ruby": "`nil`",
        "Rust": "`None`",
        "C#": "`null`",
        "Kotlin": "`null`",
        "Swift": "`nil`"
      },
      "code1": {
        "TypeScript": "const c = new LRUCache(2);\nc.put(\"a\", 1);\nc.put(\"b\", 2);\nc.get(\"a\");      // a が最新になる\nc.put(\"c\", 3);   // 最も古い b が捨てられる\nc.get(\"b\");      // undefined",
        "JavaScript": "const c = new LRUCache(2);\nc.put(\"a\", 1);\nc.put(\"b\", 2);\nc.get(\"a\");      // a が最新になる\nc.put(\"c\", 3);   // 最も古い b が捨てられる\nc.get(\"b\");      // undefined",
        "Python": "c = LRUCache(2)\nc.put(\"a\", 1)\nc.put(\"b\", 2)\nc.get(\"a\")      # a が最新になる\nc.put(\"c\", 3)   # 最も古い b が捨てられる\nc.get(\"b\")      # None",
        "Java": "var c = new LRUCache(2);\nc.put(\"a\", 1);\nc.put(\"b\", 2);\nc.get(\"a\");      // a が最新になる\nc.put(\"c\", 3);   // 最も古い b が捨てられる\nc.get(\"b\");      // null",
        "Go": "c := newLRUCache(2)\nc.put(\"a\", 1)\nc.put(\"b\", 2)\nc.get(\"a\")      // a が最新になる\nc.put(\"c\", 3)   // 最も古い b が捨てられる\nc.get(\"b\")      // 0, false",
        "Ruby": "c = LRUCache.new(2)\nc.put(\"a\", 1)\nc.put(\"b\", 2)\nc.get(\"a\")      # a が最新になる\nc.put(\"c\", 3)   # 最も古い b が捨てられる\nc.get(\"b\")      # => nil",
        "Rust": "let mut c = LRUCache::new(2);\nc.put(\"a\", 1);\nc.put(\"b\", 2);\nc.get(\"a\");      // a が最新になる\nc.put(\"c\", 3);   // 最も古い b が捨てられる\nc.get(\"b\");      // None",
        "C#": "var c = new LRUCache(2);\nc.Put(\"a\", 1);\nc.Put(\"b\", 2);\nc.Get(\"a\");      // a が最新になる\nc.Put(\"c\", 3);   // 最も古い b が捨てられる\nc.Get(\"b\");      // null",
        "Kotlin": "val c = LRUCache(2)\nc.put(\"a\", 1)\nc.put(\"b\", 2)\nc.get(\"a\")      // a が最新になる\nc.put(\"c\", 3)   // 最も古い b が捨てられる\nc.get(\"b\")      // null",
        "Swift": "let c = LRUCache(capacity: 2)\nc.put(\"a\", 1)\nc.put(\"b\", 2)\nc.get(\"a\")      // a が最新になる\nc.put(\"c\", 3)   // 最も古い b が捨てられる\nc.get(\"b\")      // nil"
      },
      "firstTest": {
        "TypeScript": "test('容量超過で最古が捨てられる', () => {\n  const c: LRUCache = new LRUCache(2);\n  c.put('a', 1); c.put('b', 2); c.get('a'); c.put('c', 3);\n  expect(c.get('b')).toBeUndefined();\n});",
        "JavaScript": "test('容量超過で最古が捨てられる', () => {\n  const c = new LRUCache(2);\n  c.put('a', 1); c.put('b', 2); c.get('a'); c.put('c', 3);\n  expect(c.get('b')).toBeUndefined();\n});",
        "Python": "def test_evicts_least_recently_used():\n    c = LRUCache(2)\n    c.put(\"a\", 1)\n    c.put(\"b\", 2)\n    c.get(\"a\")\n    c.put(\"c\", 3)\n    assert c.get(\"b\") is None",
        "Java": "@Test\nvoid evictsLeastRecentlyUsed() {\n    var c = new LRUCache(2);\n    c.put(\"a\", 1); c.put(\"b\", 2); c.get(\"a\"); c.put(\"c\", 3);\n    assertNull(c.get(\"b\"));\n}",
        "Go": "func TestEvictsLeastRecentlyUsed(t *testing.T) {\n\tc := newLRUCache(2)\n\tc.put(\"a\", 1)\n\tc.put(\"b\", 2)\n\tc.get(\"a\")\n\tc.put(\"c\", 3)\n\tif v, ok := c.get(\"b\"); ok {\n\t\tt.Errorf(\"get(b) = %d, want missing\", v)\n\t}\n}",
        "Ruby": "class LRUCacheTest < Minitest::Test\n  def test_evicts_least_recently_used\n    c = LRUCache.new(2)\n    c.put(\"a\", 1)\n    c.put(\"b\", 2)\n    c.get(\"a\")\n    c.put(\"c\", 3)\n    assert_nil c.get(\"b\")\n  end\nend",
        "Rust": "#[test]\nfn evicts_least_recently_used() {\n    let mut c = LRUCache::new(2);\n    c.put(\"a\", 1);\n    c.put(\"b\", 2);\n    c.get(\"a\");\n    c.put(\"c\", 3);\n    assert_eq!(c.get(\"b\"), None);\n}",
        "C#": "[Fact]\npublic void EvictsLeastRecentlyUsed()\n{\n    var c = new LRUCache(2);\n    c.Put(\"a\", 1); c.Put(\"b\", 2); c.Get(\"a\"); c.Put(\"c\", 3);\n    Assert.Null(c.Get(\"b\"));\n}",
        "Kotlin": "@Test\nfun evictsLeastRecentlyUsed() {\n    val c = LRUCache(2)\n    c.put(\"a\", 1); c.put(\"b\", 2); c.get(\"a\"); c.put(\"c\", 3)\n    assertNull(c.get(\"b\"))\n}",
        "Swift": "func testEvictsLeastRecentlyUsed() {\n    let c = LRUCache(capacity: 2)\n    c.put(\"a\", 1); c.put(\"b\", 2); _ = c.get(\"a\"); c.put(\"c\", 3)\n    XCTAssertNil(c.get(\"b\"))\n}"
      }
    }
  },
  {
    "title": "三目並べの勝敗判定",
    "body": "## 背景\n\n二次元の盤面に対する条件判定と、状態の列挙を整理する練習です。\n\n`3×3` の盤面 `board` を受け取り、勝者または対局状況を判定する `{{slot:name}}(board)` を実装します。各マスは `\"X\"`, `\"O\"`, または空（`\"\"`）です。\n\n## ルール\n\n- 縦・横・斜めのいずれかで 3 つ揃っていれば、その記号が勝者\n- 勝者がいなければ、空きがなければ引き分け、空きがあれば未決\n- 不正な盤面（両者同時勝利など）は考慮しなくてよい\n\n## 例\n\n- `{{slot:name}}([[\"X\",\"X\",\"X\"],[\"O\",\"O\",\"\"],[\"\",\"\",\"\"]])` → `\"X\"`\n- 全マス埋まって勝者なし → 引き分け\n- 空きがあり勝者なし → 未決\n\n## 考慮すること\n\n8 本の勝ち筋（3 行・3 列・2 斜め）を列挙して照合します。勝者判定 → 盤面の空き判定、の順で評価すると整理しやすいです。\n\n満たすこと:\n- 縦・横・斜めの 3 つ揃いを検出する\n- 勝者がいなければ引き分けか未決を返す\n- 不正な盤面（両者勝利など）は考慮しなくてよい\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 8 つの勝ち筋を列挙して照合\n- 空きが無く勝者なしなら引き分け",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "name": {
        "TypeScript": "judge",
        "JavaScript": "judge",
        "Python": "judge",
        "Java": "judge",
        "Go": "judge",
        "Ruby": "judge",
        "Rust": "judge",
        "C#": "Judge",
        "Kotlin": "judge",
        "Swift": "judge"
      },
      "firstTest": {
        "TypeScript": "test('横一列の X が勝ち', () => {\n  const board: string[][] = [['X','X','X'],['O','O',''],['','','']];\n  expect(judge(board)).toBe('X');\n});",
        "JavaScript": "test('横一列の X が勝ち', () => {\n  expect(judge([['X','X','X'],['O','O',''],['','','']])).toBe('X');\n});",
        "Python": "def test_row_of_x_wins():\n    board = [[\"X\", \"X\", \"X\"], [\"O\", \"O\", \"\"], [\"\", \"\", \"\"]]\n    assert judge(board) == \"X\"",
        "Java": "@Test\nvoid rowOfXWins() {\n    String[][] board = {{\"X\", \"X\", \"X\"}, {\"O\", \"O\", \"\"}, {\"\", \"\", \"\"}};\n    assertEquals(\"X\", judge(board));\n}",
        "Go": "func TestRowOfXWins(t *testing.T) {\n\tboard := [3][3]string{{\"X\", \"X\", \"X\"}, {\"O\", \"O\", \"\"}, {\"\", \"\", \"\"}}\n\tif got := judge(board); got != \"X\" {\n\t\tt.Errorf(\"judge = %q, want %q\", got, \"X\")\n\t}\n}",
        "Ruby": "class JudgeTest < Minitest::Test\n  def test_row_of_x_wins\n    board = [[\"X\", \"X\", \"X\"], [\"O\", \"O\", \"\"], [\"\", \"\", \"\"]]\n    assert_equal \"X\", judge(board)\n  end\nend",
        "Rust": "#[test]\nfn row_of_x_wins() {\n    let board = [[\"X\", \"X\", \"X\"], [\"O\", \"O\", \"\"], [\"\", \"\", \"\"]];\n    assert_eq!(judge(&board), \"X\");\n}",
        "C#": "[Fact]\npublic void RowOfXWins()\n{\n    string[][] board = [[\"X\", \"X\", \"X\"], [\"O\", \"O\", \"\"], [\"\", \"\", \"\"]];\n    Assert.Equal(\"X\", Judge(board));\n}",
        "Kotlin": "@Test\nfun rowOfXWins() {\n    val board = listOf(listOf(\"X\", \"X\", \"X\"), listOf(\"O\", \"O\", \"\"), listOf(\"\", \"\", \"\"))\n    assertEquals(\"X\", judge(board))\n}",
        "Swift": "func testRowOfXWins() {\n    let board = [[\"X\", \"X\", \"X\"], [\"O\", \"O\", \"\"], [\"\", \"\", \"\"]]\n    XCTAssertEqual(judge(board), \"X\")\n}"
      }
    }
  },
  {
    "title": "ネストJSONの平坦化",
    "body": "## 背景\n\n再帰によるツリー走査と、キーのプレフィックス連結を練習するお題です。設定ファイルやログの整形でよく登場します。\n\nネストしたオブジェクト `obj` を、ドット区切りキーの 1 階層オブジェクトに平坦化する `{{slot:name}}(obj)` を実装します。\n\n## ルール\n\n- ネストした各キーをドットで連結する\n- プリミティブ値はそのまま値にする\n- 配列はインデックスをキーにする（任意の拡張）\n\n## 例\n\n- `{{slot:name}}({ a: { b: 1 }, c: 2 })` → `{ \"a.b\": 1, c: 2 }`\n- `{{slot:name}}({ a: { b: { c: 1 } } })` → `{ \"a.b.c\": 1 }`\n\n## 考慮すること\n\n再帰関数に「現在までのキーのプレフィックス」を引数で渡し、オブジェクトに出会ったらキーを連結して再帰、プリミティブに出会ったら結果へ書き込みます。\n\n満たすこと:\n- {a:{b:{c:1}}} は {\"a.b.c\":1}\n- 配列はインデックスをキーにする（任意）\n- プリミティブ値はそのまま\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 再帰でキーのプレフィックスを連結していく",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "name": {
        "TypeScript": "flatten",
        "JavaScript": "flatten",
        "Python": "flatten",
        "Java": "flatten",
        "Go": "flatten",
        "Ruby": "flatten",
        "Rust": "flatten",
        "C#": "Flatten",
        "Kotlin": "flatten",
        "Swift": "flatten"
      },
      "firstTest": {
        "TypeScript": "test('ネストを平坦化', () => {\n  const input: Record<string, unknown> = { a: { b: 1 }, c: 2 };\n  expect(flatten(input)).toEqual({ 'a.b': 1, c: 2 });\n});",
        "JavaScript": "test('ネストを平坦化', () => {\n  expect(flatten({ a: { b: 1 }, c: 2 })).toEqual({ 'a.b': 1, c: 2 });\n});",
        "Python": "def test_flattens_nested_keys():\n    assert flatten({\"a\": {\"b\": 1}, \"c\": 2}) == {\"a.b\": 1, \"c\": 2}",
        "Java": "@Test\nvoid flattensNestedKeys() {\n    Map<String, Object> input = Map.of(\"a\", Map.of(\"b\", 1), \"c\", 2);\n    assertEquals(Map.of(\"a.b\", 1, \"c\", 2), flatten(input));\n}",
        "Go": "func TestFlattensNestedKeys(t *testing.T) {\n\tinput := map[string]any{\"a\": map[string]any{\"b\": 1}, \"c\": 2}\n\twant := map[string]any{\"a.b\": 1, \"c\": 2}\n\tif got := flatten(input); !reflect.DeepEqual(got, want) {\n\t\tt.Errorf(\"flatten = %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class FlattenTest < Minitest::Test\n  def test_flattens_nested_keys\n    assert_equal({ \"a.b\" => 1, \"c\" => 2 }, flatten({ \"a\" => { \"b\" => 1 }, \"c\" => 2 }))\n  end\nend",
        "Rust": "#[test]\nfn flattens_nested_keys() {\n    let input = json!({ \"a\": { \"b\": 1 }, \"c\": 2 });\n    assert_eq!(flatten(&input), json!({ \"a.b\": 1, \"c\": 2 }));\n}",
        "C#": "[Fact]\npublic void FlattensNestedKeys()\n{\n    var input = new Dictionary<string, object>\n    {\n        [\"a\"] = new Dictionary<string, object> { [\"b\"] = 1 },\n        [\"c\"] = 2,\n    };\n    var expected = new Dictionary<string, object> { [\"a.b\"] = 1, [\"c\"] = 2 };\n    Assert.Equal(expected, Flatten(input));\n}",
        "Kotlin": "@Test\nfun flattensNestedKeys() {\n    val input = mapOf(\"a\" to mapOf(\"b\" to 1), \"c\" to 2)\n    assertEquals(mapOf(\"a.b\" to 1, \"c\" to 2), flatten(input))\n}",
        "Swift": "func testFlattensNestedKeys() {\n    let input: [String: Any] = [\"a\": [\"b\": 1], \"c\": 2]\n    XCTAssertEqual(flatten(input) as NSDictionary, [\"a.b\": 1, \"c\": 2] as NSDictionary)\n}"
      }
    }
  },
  {
    "title": "レート制限（トークンバケット）",
    "body": "## 背景\n\n時間に依存するロジックを「時刻を注入してテスト可能にする」設計を学ぶお題です。API のレート制限で実際に使われる方式です。\n\nトークンバケット方式のレート制限器 `RateLimiter` を実装します。バケットには容量があり、一定速度でトークンが補充されます。リクエストごとにトークンを 1 つ消費し、足りなければ拒否します。\n\n## 振る舞い\n\n- {{slot:ctor}}: 容量と補充レートを指定\n- `{{slot:allow}}()`: トークンがあれば消費して {{slot:trueValue}}、なければ {{slot:falseValue}}\n- 容量 N まで即時に許可し、それ以降は補充を待つ\n- 経過時間に応じてトークンが補充される（上限は容量）\n\n## 例\n\n```\n{{slot:code1}}\n```\n\n## 考慮すること\n\n現在時刻を引数や注入で渡せるようにすると、時間経過をテストで再現できます。`経過秒 × 補充レート` を加算し、容量で頭打ちにします。\n\n満たすこと:\n- 容量 N まで即時に許可、それ以降は補充待ち\n- 時間経過でトークンが補充される（時刻は注入可能に）\n- 上限を超えるリクエストは拒否される\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 現在時刻を引数/注入にしてテスト可能にする\n- 経過時間 × 補充レートを加算しつつ容量で頭打ち",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "ctor": {
        "TypeScript": "`new RateLimiter({ capacity, refillPerSec })`",
        "JavaScript": "`new RateLimiter({ capacity, refillPerSec })`",
        "Python": "`RateLimiter(capacity, refill_per_sec, clock)`",
        "Java": "`new RateLimiter(capacity, refillPerSec, clock)`",
        "Go": "`newRateLimiter(capacity, refillPerSec, clock)`",
        "Ruby": "`RateLimiter.new(capacity:, refill_per_sec:, clock:)`",
        "Rust": "`RateLimiter::new(capacity, refill_per_sec, clock)`",
        "C#": "`new RateLimiter(capacity, refillPerSec, clock)`",
        "Kotlin": "`RateLimiter(capacity, refillPerSec, clock)`",
        "Swift": "`RateLimiter(capacity:refillPerSec:clock:)`"
      },
      "allow": {
        "TypeScript": "allow",
        "JavaScript": "allow",
        "Python": "allow",
        "Java": "allow",
        "Go": "allow",
        "Ruby": "allow",
        "Rust": "allow",
        "C#": "Allow",
        "Kotlin": "allow",
        "Swift": "allow"
      },
      "code1": {
        "TypeScript": "const r = new RateLimiter({ capacity: 2, refillPerSec: 1 });\nr.allow(); // true\nr.allow(); // true\nr.allow(); // false（補充待ち）",
        "JavaScript": "const r = new RateLimiter({ capacity: 2, refillPerSec: 1 });\nr.allow(); // true\nr.allow(); // true\nr.allow(); // false（補充待ち）",
        "Python": "r = RateLimiter(capacity=2, refill_per_sec=1, clock=lambda: 0.0)\nr.allow()  # True\nr.allow()  # True\nr.allow()  # False（補充待ち）",
        "Java": "var r = new RateLimiter(2, 1.0, () -> 0.0);\nr.allow(); // true\nr.allow(); // true\nr.allow(); // false（補充待ち）",
        "Go": "r := newRateLimiter(2, 1, func() float64 { return 0 })\nr.allow() // true\nr.allow() // true\nr.allow() // false（補充待ち）",
        "Ruby": "r = RateLimiter.new(capacity: 2, refill_per_sec: 1, clock: -> { 0.0 })\nr.allow # => true\nr.allow # => true\nr.allow # => false（補充待ち）",
        "Rust": "let mut r = RateLimiter::new(2, 1.0, || 0.0);\nr.allow(); // true\nr.allow(); // true\nr.allow(); // false（補充待ち）",
        "C#": "var r = new RateLimiter(capacity: 2, refillPerSec: 1, clock: () => 0.0);\nr.Allow(); // true\nr.Allow(); // true\nr.Allow(); // false（補充待ち）",
        "Kotlin": "val r = RateLimiter(capacity = 2, refillPerSec = 1.0, clock = { 0.0 })\nr.allow() // true\nr.allow() // true\nr.allow() // false（補充待ち）",
        "Swift": "let r = RateLimiter(capacity: 2, refillPerSec: 1, clock: { 0 })\nr.allow() // true\nr.allow() // true\nr.allow() // false（補充待ち）"
      },
      "firstTest": {
        "TypeScript": "test('容量を超えると拒否', () => {\n  const r: RateLimiter = new RateLimiter({ capacity: 2, refillPerSec: 1 });\n  expect(r.allow()).toBe(true);\n  expect(r.allow()).toBe(true);\n  expect(r.allow()).toBe(false);\n});",
        "JavaScript": "test('容量を超えると拒否', () => {\n  const r = new RateLimiter({ capacity: 2, refillPerSec: 1 });\n  expect(r.allow()).toBe(true);\n  expect(r.allow()).toBe(true);\n  expect(r.allow()).toBe(false);\n});",
        "Python": "def test_rejects_when_capacity_exceeded():\n    r = RateLimiter(capacity=2, refill_per_sec=1, clock=lambda: 0.0)\n    assert r.allow() is True\n    assert r.allow() is True\n    assert r.allow() is False",
        "Java": "@Test\nvoid rejectsWhenCapacityExceeded() {\n    var r = new RateLimiter(2, 1.0, () -> 0.0);\n    assertTrue(r.allow());\n    assertTrue(r.allow());\n    assertFalse(r.allow());\n}",
        "Go": "func TestRejectsWhenCapacityExceeded(t *testing.T) {\n\tr := newRateLimiter(2, 1, func() float64 { return 0 })\n\tfor i, want := range []bool{true, true, false} {\n\t\tif got := r.allow(); got != want {\n\t\t\tt.Errorf(\"allow() #%d = %v, want %v\", i+1, got, want)\n\t\t}\n\t}\n}",
        "Ruby": "class RateLimiterTest < Minitest::Test\n  def test_rejects_when_capacity_exceeded\n    r = RateLimiter.new(capacity: 2, refill_per_sec: 1, clock: -> { 0.0 })\n    assert_equal [true, true, false], Array.new(3) { r.allow }\n  end\nend",
        "Rust": "#[test]\nfn rejects_when_capacity_exceeded() {\n    let mut r = RateLimiter::new(2, 1.0, || 0.0);\n    assert!(r.allow());\n    assert!(r.allow());\n    assert!(!r.allow());\n}",
        "C#": "[Fact]\npublic void RejectsWhenCapacityExceeded()\n{\n    var r = new RateLimiter(capacity: 2, refillPerSec: 1, clock: () => 0.0);\n    Assert.True(r.Allow());\n    Assert.True(r.Allow());\n    Assert.False(r.Allow());\n}",
        "Kotlin": "@Test\nfun rejectsWhenCapacityExceeded() {\n    val r = RateLimiter(capacity = 2, refillPerSec = 1.0, clock = { 0.0 })\n    assertTrue(r.allow())\n    assertTrue(r.allow())\n    assertFalse(r.allow())\n}",
        "Swift": "func testRejectsWhenCapacityExceeded() {\n    let r = RateLimiter(capacity: 2, refillPerSec: 1, clock: { 0 })\n    XCTAssertTrue(r.allow())\n    XCTAssertTrue(r.allow())\n    XCTAssertFalse(r.allow())\n}"
      },
      "trueValue": {
        "TypeScript": "`true`",
        "JavaScript": "`true`",
        "Python": "`True`",
        "Java": "`true`",
        "Go": "`true`",
        "Ruby": "`true`",
        "Rust": "`true`",
        "C#": "`true`",
        "Kotlin": "`true`",
        "Swift": "`true`"
      },
      "falseValue": {
        "TypeScript": "`false`",
        "JavaScript": "`false`",
        "Python": "`False`",
        "Java": "`false`",
        "Go": "`false`",
        "Ruby": "`false`",
        "Rust": "`false`",
        "C#": "`false`",
        "Kotlin": "`false`",
        "Swift": "`false`"
      }
    }
  },
  {
    "title": "電卓（式の評価）",
    "body": "## 背景\n\n字句解析（トークナイズ）と構文解析を組み合わせる、総合力が問われるお題です。小さなステップに分けて TDD する練習に最適です。\n\n`+`, `-`, `*`, `/` と括弧を含む算術式の文字列を評価する `{{slot:name}}(expr)` を実装します。\n\n## ルール\n\n- 演算子の優先順位（`*`, `/` が `+`, `-` より先）を尊重する\n- 括弧で優先順位を変えられる\n- 空白は無視する\n\n## 例\n\n- `{{slot:name}}(\"2 + 3 * 4\")` → `14`（優先順位）\n- `{{slot:name}}(\"(2 + 3) * 4\")` → `20`（括弧）\n- `{{slot:name}}(\"10 / 2 - 3\")` → `2`\n\n## 考慮すること\n\n「数値の足し算だけ」「掛け算を追加」「括弧を追加」のように段階的に拡張していくと進めやすいです。トークナイズ → 構文解析（操車場アルゴリズムや再帰下降法）の二段構えが定番です。\n\n満たすこと:\n- \"2 + 3 * 4\" は 14（優先順位）\n- \"(2 + 3) * 4\" は 20（括弧）\n- 空白は無視する\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- トークナイズ → 構文解析（操車場アルゴリズム等）\n- 小さく刻んで TDD する",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "name": {
        "TypeScript": "evaluate",
        "JavaScript": "evaluate",
        "Python": "evaluate",
        "Java": "evaluate",
        "Go": "evaluate",
        "Ruby": "evaluate",
        "Rust": "evaluate",
        "C#": "Evaluate",
        "Kotlin": "evaluate",
        "Swift": "evaluate"
      },
      "firstTest": {
        "TypeScript": "test('優先順位を尊重', () => {\n  const result: number = evaluate('2 + 3 * 4');\n  expect(result).toBe(14);\n});",
        "JavaScript": "test('優先順位を尊重', () => {\n  expect(evaluate('2 + 3 * 4')).toBe(14);\n});",
        "Python": "def test_respects_precedence():\n    assert evaluate(\"2 + 3 * 4\") == 14",
        "Java": "@Test\nvoid respectsPrecedence() {\n    assertEquals(14.0, evaluate(\"2 + 3 * 4\"));\n}",
        "Go": "func TestRespectsPrecedence(t *testing.T) {\n\tgot, err := evaluate(\"2 + 3 * 4\")\n\tif err != nil || got != 14 {\n\t\tt.Errorf(\"evaluate = %v, %v; want 14\", got, err)\n\t}\n}",
        "Ruby": "class EvaluateTest < Minitest::Test\n  def test_respects_precedence\n    assert_equal 14, evaluate(\"2 + 3 * 4\")\n  end\nend",
        "Rust": "#[test]\nfn respects_precedence() {\n    assert_eq!(evaluate(\"2 + 3 * 4\"), Ok(14.0));\n}",
        "C#": "[Fact]\npublic void RespectsPrecedence()\n{\n    Assert.Equal(14.0, Evaluate(\"2 + 3 * 4\"));\n}",
        "Kotlin": "@Test\nfun respectsPrecedence() {\n    assertEquals(14.0, evaluate(\"2 + 3 * 4\"))\n}",
        "Swift": "func testRespectsPrecedence() {\n    XCTAssertEqual(evaluate(\"2 + 3 * 4\"), 14)\n}"
      }
    }
  },
  {
    "title": "タイトルケース変換",
    "body": "## 背景\n\n見出しや書名を整えるときによく使う「タイトルケース」への変換を作るお題です。文字列の分割と結合、例外の単語の扱いを小さなテストで積み上げます。\n\n英文の文字列 `s` を受け取り、各単語の先頭を大文字、残りを小文字にした文字列を返す `{{slot:fn}}(s)` を実装します。\n\n## ルール\n\n- 単語は半角空白で区切られている\n- 各単語の 1 文字目を大文字、2 文字目以降を小文字にする\n- `a`・`an`・`the`・`of`・`in`・`and` は小文字のまま（ただし文の先頭の単語は大文字にする）\n- 連続する空白は 1 つにまとめ、前後の空白は取り除く\n\n## 例\n\n- `{{slot:fn}}(\"hello world\")` → `\"Hello World\"`\n- `{{slot:fn}}(\"the lord OF the rings\")` → `\"The Lord of the Rings\"`\n- `{{slot:fn}}(\"  a  tale \")` → `\"A Tale\"`\n- `{{slot:fn}}(\"\")` → `\"\"`\n\n## 考慮すること\n\nまずは例外の単語なしで「各単語の先頭を大文字に」を通し、次に例外の単語、最後に空白の扱い、と 1 つずつテストを足すと進めやすいです。\n\n満たすこと:\n- 各単語の先頭が大文字、残りが小文字になる\n- 例外の単語は小文字のまま（先頭の単語を除く）\n- 余分な空白を取り除く\n- 空文字列は空文字列を返す\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 単語の配列に分けてから 1 語ずつ変換し、最後に結合する\n- 例外の単語は集合で持つ",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('hello world は Hello World', () => {\n  expect(toTitleCase('hello world')).toBe('Hello World');\n});",
        "JavaScript": "test('hello world は Hello World', () => {\n  expect(toTitleCase('hello world')).toBe('Hello World');\n});",
        "Python": "def test_hello_world():\n    assert to_title_case(\"hello world\") == \"Hello World\"",
        "Java": "@Test\nvoid helloWorld() {\n    assertEquals(\"Hello World\", toTitleCase(\"hello world\"));\n}",
        "Go": "func TestToTitleCaseHelloWorld(t *testing.T) {\n\tgot := toTitleCase(\"hello world\")\n\twant := \"Hello World\"\n\tif got != want {\n\t\tt.Errorf(\"toTitleCase(\\\"hello world\\\") = %q, want %q\", got, want)\n\t}\n}",
        "Ruby": "class TitleCaseTest < Minitest::Test\n  def test_hello_world\n    assert_equal \"Hello World\", to_title_case(\"hello world\")\n  end\nend",
        "Rust": "#[test]\nfn hello_world_becomes_title_case() {\n    assert_eq!(to_title_case(\"hello world\"), \"Hello World\");\n}",
        "C#": "[Fact]\npublic void HelloWorld()\n{\n    Assert.Equal(\"Hello World\", ToTitleCase(\"hello world\"));\n}",
        "Kotlin": "@Test\nfun `hello world は Hello World`() {\n    assertEquals(\"Hello World\", toTitleCase(\"hello world\"))\n}",
        "Swift": "func testHelloWorld() {\n    XCTAssertEqual(toTitleCase(\"hello world\"), \"Hello World\")\n}"
      },
      "fn": {
        "TypeScript": "toTitleCase",
        "JavaScript": "toTitleCase",
        "Python": "to_title_case",
        "Java": "toTitleCase",
        "Go": "toTitleCase",
        "Ruby": "to_title_case",
        "Rust": "to_title_case",
        "C#": "ToTitleCase",
        "Kotlin": "toTitleCase",
        "Swift": "toTitleCase"
      }
    }
  },
  {
    "title": "誕生日から年齢を計算",
    "body": "## 背景\n\n日付の比較は単純に見えて境界で間違えやすい処理です。「誕生日の前日・当日・翌日」の 3 点でテストを書く感覚を身につけます。\n\n誕生日 `birth` と基準日 `today`（どちらも年・月・日を持つ値）を受け取り、満年齢を返す `{{slot:fn}}(birth, today)` を実装します。\n\n## ルール\n\n- 基準日が誕生日（月日）より前なら、年の差から 1 を引く\n- 誕生日当日に 1 歳増える\n- 基準日が誕生日より前の日付ならエラーにする\n- 2 月 29 日生まれは、うるう年でない年は 3 月 1 日に年を取るものとする\n\n## 例\n\n- 誕生日 2000-05-10、基準日 2024-05-09 → `23`\n- 誕生日 2000-05-10、基準日 2024-05-10 → `24`\n- 誕生日 2004-02-29、基準日 2025-02-28 → `20`\n- 誕生日 2004-02-29、基準日 2025-03-01 → `21`\n\n## 考慮すること\n\n現在日時を関数の中で読まず、基準日を引数で渡すことでテストが安定します。日付は {{slot:date}}で十分です。\n\n満たすこと:\n- 誕生日の前日・当日・翌日で正しい年齢を返す\n- 年をまたぐ場合（12 月生まれを 1 月に計算）も正しい\n- 2 月 29 日生まれの扱いが決めたとおりになる\n- 誕生日より前の基準日はエラーになる\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 年の差を出してから、月日を比べて 1 を引くか決める\n- 月日の比較は (月, 日) の組で比べる",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('誕生日の前日はまだ 23 歳', () => {\n  const birth: YearMonthDay = { year: 2000, month: 5, day: 10 };\n  expect(ageOn(birth, { year: 2024, month: 5, day: 9 })).toBe(23);\n});",
        "JavaScript": "test('誕生日の前日はまだ 23 歳', () => {\n  const birth = { year: 2000, month: 5, day: 10 };\n  expect(ageOn(birth, { year: 2024, month: 5, day: 9 })).toBe(23);\n});",
        "Python": "from datetime import date\n\n\ndef test_still_23_on_the_day_before_birthday():\n    birth = date(2000, 5, 10)\n    assert age_on(birth, date(2024, 5, 9)) == 23",
        "Java": "@Test\nvoid stillTwentyThreeOnTheDayBeforeBirthday() {\n    var birth = new YearMonthDay(2000, 5, 10);\n    assertEquals(23, ageOn(birth, new YearMonthDay(2024, 5, 9)));\n}",
        "Go": "func TestAgeOnDayBeforeBirthday(t *testing.T) {\n\tgot, err := ageOn(\n\t\tyearMonthDay{year: 2000, month: 5, day: 10},\n\t\tyearMonthDay{year: 2024, month: 5, day: 9},\n\t)\n\tif err != nil {\n\t\tt.Fatal(err)\n\t}\n\tif want := 23; got != want {\n\t\tt.Errorf(\"ageOn() = %d, want %d\", got, want)\n\t}\n}",
        "Ruby": "class AgeOnTest < Minitest::Test\n  def test_still_23_on_the_day_before_birthday\n    birth = Date.new(2000, 5, 10)\n    assert_equal 23, age_on(birth, Date.new(2024, 5, 9))\n  end\nend",
        "Rust": "#[test]\nfn still_23_on_the_day_before_birthday() {\n    let birth = YearMonthDay { year: 2000, month: 5, day: 10 };\n    let today = YearMonthDay { year: 2024, month: 5, day: 9 };\n    assert_eq!(age_on(birth, today), Ok(23));\n}",
        "C#": "[Fact]\npublic void StillTwentyThreeOnTheDayBeforeBirthday()\n{\n    var birth = new DateOnly(2000, 5, 10);\n    Assert.Equal(23, AgeOn(birth, new DateOnly(2024, 5, 9)));\n}",
        "Kotlin": "@Test\nfun `誕生日の前日はまだ 23 歳`() {\n    val birth = YearMonthDay(2000, 5, 10)\n    assertEquals(23, ageOn(birth, YearMonthDay(2024, 5, 9)))\n}",
        "Swift": "func testStillTwentyThreeOnTheDayBeforeBirthday() {\n    let birth = YearMonthDay(year: 2000, month: 5, day: 10)\n    XCTAssertEqual(try ageOn(birth, YearMonthDay(year: 2024, month: 5, day: 9)), 23)\n}"
      },
      "fn": {
        "TypeScript": "ageOn",
        "JavaScript": "ageOn",
        "Python": "age_on",
        "Java": "ageOn",
        "Go": "ageOn",
        "Ruby": "age_on",
        "Rust": "age_on",
        "C#": "AgeOn",
        "Kotlin": "ageOn",
        "Swift": "ageOn"
      },
      "date": {
        "TypeScript": "`{ year, month, day }` の素朴な値（`YearMonthDay` 型）",
        "JavaScript": "`{ year, month, day }` の素朴な値",
        "Python": "`datetime.date`（年・月・日だけを使う）",
        "Java": "`record YearMonthDay(int year, int month, int day)` の素朴な値",
        "Go": "`yearMonthDay{year, month, day}` の素朴な構造体",
        "Ruby": "`Date`（年・月・日だけを使う）",
        "Rust": "`YearMonthDay { year, month, day }` の素朴な構造体",
        "C#": "`DateOnly`（年・月・日だけを使う）",
        "Kotlin": "`data class YearMonthDay(val year: Int, val month: Int, val day: Int)` の素朴な値",
        "Swift": "`struct YearMonthDay { let year, month, day: Int }` の素朴な値"
      }
    }
  },
  {
    "title": "ファイルサイズの表示",
    "body": "## 背景\n\nバイト数を人が読みやすい形にする処理は、多くのアプリの画面にあります。単位の切り替えと丸めの境界をテストで固める練習です。\n\nバイト数 `bytes`（0 以上の整数）を受け取り、`B`・`KB`・`MB`・`GB`・`TB` のいずれかを付けた文字列を返す `{{slot:fn}}(bytes)` を実装します。\n\n## ルール\n\n- 1 KB = 1024 B として計算する\n- 1024 未満は整数のまま `B` を付ける（例: `\"512 B\"`）\n- それ以上は値が 1024 未満になる最大の単位を選び、小数第 1 位まで表示する（四捨五入）\n- 小数第 1 位が 0 のときも `.0` を付ける\n\n## 例\n\n- `{{slot:fn}}(0)` → `\"0 B\"`\n- `{{slot:fn}}(1023)` → `\"1023 B\"`\n- `{{slot:fn}}(1024)` → `\"1.0 KB\"`\n- `{{slot:fn}}(1536)` → `\"1.5 KB\"`\n- `{{slot:fn}}(1048576)` → `\"1.0 MB\"`\n\n## 考慮すること\n\n丸めた結果が 1024.0 になる値（例: 1048575 B）をどう表示するか、チームで決めてテストに書いてください。単位の表を配列で持つと分岐が減ります。\n\n満たすこと:\n- 1024 未満は B で整数表示\n- 単位の切り替わりの境界（1023 と 1024）が正しい\n- 小数第 1 位まで表示する\n- 負の値はエラーにする\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 1024 で割り続け、1024 未満になったら止める\n- 単位の名前は配列の添字で引く",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('1024 バイトは 1.0 KB', () => {\n  expect(formatSize(1024)).toBe('1.0 KB');\n});",
        "JavaScript": "test('1024 バイトは 1.0 KB', () => {\n  expect(formatSize(1024)).toBe('1.0 KB');\n});",
        "Python": "def test_1024_bytes_is_1_0_kb():\n    assert format_size(1024) == \"1.0 KB\"",
        "Java": "@Test\nvoid oneKilobyte() {\n    assertEquals(\"1.0 KB\", formatSize(1024));\n}",
        "Go": "func TestFormatSize1024(t *testing.T) {\n\tgot, err := formatSize(1024)\n\tif err != nil {\n\t\tt.Fatal(err)\n\t}\n\tif want := \"1.0 KB\"; got != want {\n\t\tt.Errorf(\"formatSize(1024) = %q, want %q\", got, want)\n\t}\n}",
        "Ruby": "class FormatSizeTest < Minitest::Test\n  def test_1024_bytes_is_1_0_kb\n    assert_equal \"1.0 KB\", format_size(1024)\n  end\nend",
        "Rust": "#[test]\nfn one_kilobyte() {\n    assert_eq!(format_size(1024), \"1.0 KB\");\n}",
        "C#": "[Fact]\npublic void OneKilobyte()\n{\n    Assert.Equal(\"1.0 KB\", FormatSize(1024));\n}",
        "Kotlin": "@Test\nfun `1024 バイトは 1 KB と表示する`() {\n    assertEquals(\"1.0 KB\", formatSize(1024))\n}",
        "Swift": "func testOneKilobyte() {\n    XCTAssertEqual(try formatSize(1024), \"1.0 KB\")\n}"
      },
      "fn": {
        "TypeScript": "formatSize",
        "JavaScript": "formatSize",
        "Python": "format_size",
        "Java": "formatSize",
        "Go": "formatSize",
        "Ruby": "format_size",
        "Rust": "format_size",
        "C#": "FormatSize",
        "Kotlin": "formatSize",
        "Swift": "formatSize"
      }
    }
  },
  {
    "title": "じゃんけんの判定",
    "body": "## 背景\n\n組み合わせの表を作って判定する練習です。3 × 3 の全組み合わせをテストで網羅できる、小さく完結したお題です。\n\n2 人の手を受け取り、勝敗を返す `{{slot:fn}}(a, b)` を実装します。手は `\"rock\"`（グー）・`\"scissors\"`（チョキ）・`\"paper\"`（パー）のいずれかです。\n\n## ルール\n\n- グーはチョキに勝つ、チョキはパーに勝つ、パーはグーに勝つ\n- 同じ手はあいこ\n- 戻り値は `\"a\"`（a の勝ち）・`\"b\"`（b の勝ち）・`\"draw\"`（あいこ）\n- 知らない手が来たらエラーにする\n\n## 例\n\n- `{{slot:fn}}(\"rock\", \"scissors\")` → `\"a\"`\n- `{{slot:fn}}(\"rock\", \"paper\")` → `\"b\"`\n- `{{slot:fn}}(\"paper\", \"paper\")` → `\"draw\"`\n\n## 拡張（時間があれば）\n\n複数人の手の配列を受け取り、勝った人の添字の配列を返す `{{slot:fn2}}(hands)` を足します。3 種類の手がすべて出たとき、または全員同じ手のときはあいこ（空配列）です。\n\n満たすこと:\n- 9 通りの組み合わせすべてが正しく判定される\n- あいこを判定できる\n- 知らない手はエラーになる\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 「この手が勝つ相手」の対応表を 1 つ持つと分岐が要らない\n- 9 通りは表形式のテスト（パラメータ化テスト）にすると読みやすい",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('グーはチョキに勝つ', () => {\n  expect(judge('rock', 'scissors')).toBe('a');\n});",
        "JavaScript": "test('グーはチョキに勝つ', () => {\n  expect(judge('rock', 'scissors')).toBe('a');\n});",
        "Python": "def test_rock_beats_scissors():\n    assert judge(\"rock\", \"scissors\") == \"a\"",
        "Java": "@Test\nvoid rockBeatsScissors() {\n    assertEquals(\"a\", judge(\"rock\", \"scissors\"));\n}",
        "Go": "func TestRockBeatsScissors(t *testing.T) {\n\tgot, err := judge(\"rock\", \"scissors\")\n\tif err != nil {\n\t\tt.Fatal(err)\n\t}\n\tif want := \"a\"; got != want {\n\t\tt.Errorf(\"judge(rock, scissors) = %q, want %q\", got, want)\n\t}\n}",
        "Ruby": "class JudgeTest < Minitest::Test\n  def test_rock_beats_scissors\n    assert_equal \"a\", judge(\"rock\", \"scissors\")\n  end\nend",
        "Rust": "#[test]\nfn rock_beats_scissors() {\n    assert_eq!(judge(\"rock\", \"scissors\"), Ok(\"a\"));\n}",
        "C#": "[Fact]\npublic void RockBeatsScissors()\n{\n    Assert.Equal(\"a\", Judge(\"rock\", \"scissors\"));\n}",
        "Kotlin": "@Test\nfun `グーはチョキに勝つ`() {\n    assertEquals(\"a\", judge(\"rock\", \"scissors\"))\n}",
        "Swift": "func testRockBeatsScissors() {\n    XCTAssertEqual(try judge(\"rock\", \"scissors\"), \"a\")\n}"
      },
      "fn": {
        "TypeScript": "judge",
        "JavaScript": "judge",
        "Python": "judge",
        "Java": "judge",
        "Go": "judge",
        "Ruby": "judge",
        "Rust": "judge",
        "C#": "Judge",
        "Kotlin": "judge",
        "Swift": "judge"
      },
      "fn2": {
        "TypeScript": "judgeMany",
        "JavaScript": "judgeMany",
        "Python": "judge_many",
        "Java": "judgeMany",
        "Go": "judgeMany",
        "Ruby": "judge_many",
        "Rust": "judge_many",
        "C#": "JudgeMany",
        "Kotlin": "judgeMany",
        "Swift": "judgeMany"
      }
    }
  },
  {
    "title": "おつりの硬貨枚数",
    "body": "## 背景\n\nお金を扱う処理の入門です。大きい単位から順に使う貪欲法と、結果の表し方（連想配列）をテストで決めていきます。\n\n支払額 `paid` と代金 `price`（どちらも円の整数）を受け取り、おつりを最も少ない枚数で返す `{{slot:fn}}(paid, price)` を実装します。\n\n## ルール\n\n- 使える硬貨・紙幣は 1000・500・100・50・10・5・1 円\n- 戻り値は「額面 → 枚数」の対応。0 枚の額面は含めない\n- おつりが 0 なら空の対応を返す\n- 支払額が代金に足りなければエラーにする\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n最初は「おつりが 1 円」のような小さな例から始め、額面を 1 つずつ増やしていくと、表を使う形へ自然にリファクタリングできます。\n\n満たすこと:\n- 最も少ない枚数でおつりを返す\n- 0 枚の額面を含めない\n- おつりが 0 なら空\n- 支払額不足はエラー\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 額面の配列を大きい順に並べ、割り算と余りで枚数を出す",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('1000 円で 380 円の品を買う', () => {\n  expect(change(1000, 380)).toEqual({ 500: 1, 100: 1, 10: 2 });\n});",
        "JavaScript": "test('1000 円で 380 円の品を買う', () => {\n  expect(change(1000, 380)).toEqual({ 500: 1, 100: 1, 10: 2 });\n});",
        "Python": "def test_pay_1000_for_380():\n    assert change(1000, 380) == {500: 1, 100: 1, 10: 2}",
        "Java": "@Test\nvoid pay1000For380() {\n    assertEquals(Map.of(500, 1, 100, 1, 10, 2), change(1000, 380));\n}",
        "Go": "func TestPay1000For380(t *testing.T) {\n\tgot, err := change(1000, 380)\n\tif err != nil {\n\t\tt.Fatal(err)\n\t}\n\twant := map[int]int{500: 1, 100: 1, 10: 2}\n\tif !maps.Equal(got, want) {\n\t\tt.Errorf(\"change(1000, 380) = %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class ChangeTest < Minitest::Test\n  def test_pay_1000_for_380\n    assert_equal({ 500 => 1, 100 => 1, 10 => 2 }, change(1000, 380))\n  end\nend",
        "Rust": "use std::collections::BTreeMap;\n\n#[test]\nfn pay_1000_for_380() {\n    let want = BTreeMap::from([(500, 1), (100, 1), (10, 2)]);\n    assert_eq!(change(1000, 380), Ok(want));\n}",
        "C#": "[Fact]\npublic void Pay1000For380()\n{\n    var expected = new Dictionary<int, int> { [500] = 1, [100] = 1, [10] = 2 };\n    Assert.Equal(expected, Change(1000, 380));\n}",
        "Kotlin": "@Test\nfun `1000 円で 380 円の品を買う`() {\n    assertEquals(mapOf(500 to 1, 100 to 1, 10 to 2), change(1000, 380))\n}",
        "Swift": "func testPay1000For380() {\n    XCTAssertEqual(try change(1000, 380), [500: 1, 100: 1, 10: 2])\n}"
      },
      "examples": {
        "TypeScript": "- `change(1000, 380)` → `{ 500: 1, 100: 1, 10: 2 }`（620 円）\n- `change(500, 500)` → `{}`\n- `change(100, 1)` → `{ 50: 1, 10: 4, 5: 1, 1: 4 }`（99 円）",
        "JavaScript": "- `change(1000, 380)` → `{ 500: 1, 100: 1, 10: 2 }`（620 円）\n- `change(500, 500)` → `{}`\n- `change(100, 1)` → `{ 50: 1, 10: 4, 5: 1, 1: 4 }`（99 円）",
        "Python": "- `change(1000, 380)` → `{500: 1, 100: 1, 10: 2}`（620 円）\n- `change(500, 500)` → `{}`\n- `change(100, 1)` → `{50: 1, 10: 4, 5: 1, 1: 4}`（99 円）",
        "Java": "- `change(1000, 380)` → `Map.of(500, 1, 100, 1, 10, 2)`（620 円）\n- `change(500, 500)` → `Map.of()`\n- `change(100, 1)` → `Map.of(50, 1, 10, 4, 5, 1, 1, 4)`（99 円）",
        "Go": "- `change(1000, 380)` → `map[int]int{500: 1, 100: 1, 10: 2}`（620 円）\n- `change(500, 500)` → `map[int]int{}`\n- `change(100, 1)` → `map[int]int{50: 1, 10: 4, 5: 1, 1: 4}`（99 円）",
        "Ruby": "- `change(1000, 380)` → `{ 500 => 1, 100 => 1, 10 => 2 }`（620 円）\n- `change(500, 500)` → `{}`\n- `change(100, 1)` → `{ 50 => 1, 10 => 4, 5 => 1, 1 => 4 }`（99 円）",
        "Rust": "- `change(1000, 380)` → `Ok(BTreeMap::from([(500, 1), (100, 1), (10, 2)]))`（620 円）\n- `change(500, 500)` → `Ok(BTreeMap::new())`\n- `change(100, 1)` → `Ok(BTreeMap::from([(50, 1), (10, 4), (5, 1), (1, 4)]))`（99 円）",
        "C#": "- `Change(1000, 380)` → `new() { [500] = 1, [100] = 1, [10] = 2 }`（620 円）\n- `Change(500, 500)` → `new()`\n- `Change(100, 1)` → `new() { [50] = 1, [10] = 4, [5] = 1, [1] = 4 }`（99 円）",
        "Kotlin": "- `change(1000, 380)` → `mapOf(500 to 1, 100 to 1, 10 to 2)`（620 円）\n- `change(500, 500)` → `emptyMap()`\n- `change(100, 1)` → `mapOf(50 to 1, 10 to 4, 5 to 1, 1 to 4)`（99 円）",
        "Swift": "- `change(1000, 380)` → `[500: 1, 100: 1, 10: 2]`（620 円）\n- `change(500, 500)` → `[:]`\n- `change(100, 1)` → `[50: 1, 10: 4, 5: 1, 1: 4]`（99 円）"
      },
      "fn": {
        "TypeScript": "change",
        "JavaScript": "change",
        "Python": "change",
        "Java": "change",
        "Go": "change",
        "Ruby": "change",
        "Rust": "change",
        "C#": "Change",
        "Kotlin": "change",
        "Swift": "change"
      }
    }
  },
  {
    "title": "素数判定",
    "body": "## 背景\n\nループの終わりの条件と、小さな入力（0・1・2）の扱いを丁寧に詰める練習です。素朴な実装から始め、テストを保ったまま速くしていけます。\n\n整数 `n` を受け取り、素数かどうかを返す `{{slot:fn}}(n)` を実装します。続けて、`n` 以下の素数を昇順の配列で返す `{{slot:fn2}}(n)` も実装します。\n\n## ルール\n\n- 素数は 1 とそれ自身でしか割り切れない 2 以上の整数\n- 0・1・負の数は素数でない\n- 2 は素数（唯一の偶数の素数）\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n割る数を √n まで試せば十分です。`{{slot:fn2}}` は `{{slot:fn}}` を繰り返し呼ぶ形で通してから、エラトステネスのふるいへ置き換えても、テストはそのまま使えます。\n\n満たすこと:\n- 0・1・負の数は {{slot:falseWord}}\n- 2 と 3 は {{slot:trueWord}}\n- 平方数（9・25・49）を正しく {{slot:falseWord}} にする\n- {{slot:fn2}} が昇順の配列を返す\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- i * i <= n をループの条件にする\n- 平方数のテストは「√n ちょうど」の境界を確かめる",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('1 は素数でない', () => {\n  expect(isPrime(1)).toBe(false);\n});",
        "JavaScript": "test('1 は素数でない', () => {\n  expect(isPrime(1)).toBe(false);\n});",
        "Python": "def test_1_is_not_prime():\n    assert not is_prime(1)",
        "Java": "@Test\nvoid oneIsNotPrime() {\n    assertFalse(isPrime(1));\n}",
        "Go": "func TestOneIsNotPrime(t *testing.T) {\n\tif isPrime(1) {\n\t\tt.Errorf(\"isPrime(1) = true, want false\")\n\t}\n}",
        "Ruby": "class PrimeTest < Minitest::Test\n  def test_1_is_not_prime\n    refute prime?(1)\n  end\nend",
        "Rust": "#[test]\nfn one_is_not_prime() {\n    assert!(!is_prime(1));\n}",
        "C#": "[Fact]\npublic void OneIsNotPrime()\n{\n    Assert.False(IsPrime(1));\n}",
        "Kotlin": "@Test\nfun `1 は素数でない`() {\n    assertFalse(isPrime(1))\n}",
        "Swift": "func testOneIsNotPrime() {\n    XCTAssertFalse(isPrime(1))\n}"
      },
      "examples": {
        "TypeScript": "- `isPrime(2)` → `true`\n- `isPrime(1)` → `false`\n- `isPrime(97)` → `true`\n- `isPrime(91)` → `false`（7 × 13）\n- `primesUpTo(10)` → `[2, 3, 5, 7]`",
        "JavaScript": "- `isPrime(2)` → `true`\n- `isPrime(1)` → `false`\n- `isPrime(97)` → `true`\n- `isPrime(91)` → `false`（7 × 13）\n- `primesUpTo(10)` → `[2, 3, 5, 7]`",
        "Python": "- `is_prime(2)` → `True`\n- `is_prime(1)` → `False`\n- `is_prime(97)` → `True`\n- `is_prime(91)` → `False`（7 × 13）\n- `primes_up_to(10)` → `[2, 3, 5, 7]`",
        "Java": "- `isPrime(2)` → `true`\n- `isPrime(1)` → `false`\n- `isPrime(97)` → `true`\n- `isPrime(91)` → `false`（7 × 13）\n- `primesUpTo(10)` → `List.of(2, 3, 5, 7)`",
        "Go": "- `isPrime(2)` → `true`\n- `isPrime(1)` → `false`\n- `isPrime(97)` → `true`\n- `isPrime(91)` → `false`（7 × 13）\n- `primesUpTo(10)` → `[]int{2, 3, 5, 7}`",
        "Ruby": "- `prime?(2)` → `true`\n- `prime?(1)` → `false`\n- `prime?(97)` → `true`\n- `prime?(91)` → `false`（7 × 13）\n- `primes_up_to(10)` → `[2, 3, 5, 7]`",
        "Rust": "- `is_prime(2)` → `true`\n- `is_prime(1)` → `false`\n- `is_prime(97)` → `true`\n- `is_prime(91)` → `false`（7 × 13）\n- `primes_up_to(10)` → `vec![2, 3, 5, 7]`",
        "C#": "- `IsPrime(2)` → `true`\n- `IsPrime(1)` → `false`\n- `IsPrime(97)` → `true`\n- `IsPrime(91)` → `false`（7 × 13）\n- `PrimesUpTo(10)` → `[2, 3, 5, 7]`",
        "Kotlin": "- `isPrime(2)` → `true`\n- `isPrime(1)` → `false`\n- `isPrime(97)` → `true`\n- `isPrime(91)` → `false`（7 × 13）\n- `primesUpTo(10)` → `listOf(2, 3, 5, 7)`",
        "Swift": "- `isPrime(2)` → `true`\n- `isPrime(1)` → `false`\n- `isPrime(97)` → `true`\n- `isPrime(91)` → `false`（7 × 13）\n- `primesUpTo(10)` → `[2, 3, 5, 7]`"
      },
      "fn": {
        "TypeScript": "isPrime",
        "JavaScript": "isPrime",
        "Python": "is_prime",
        "Java": "isPrime",
        "Go": "isPrime",
        "Ruby": "prime?",
        "Rust": "is_prime",
        "C#": "IsPrime",
        "Kotlin": "isPrime",
        "Swift": "isPrime"
      },
      "fn2": {
        "TypeScript": "primesUpTo",
        "JavaScript": "primesUpTo",
        "Python": "primes_up_to",
        "Java": "primesUpTo",
        "Go": "primesUpTo",
        "Ruby": "primes_up_to",
        "Rust": "primes_up_to",
        "C#": "PrimesUpTo",
        "Kotlin": "primesUpTo",
        "Swift": "primesUpTo"
      },
      "trueWord": {
        "TypeScript": "true",
        "JavaScript": "true",
        "Python": "True",
        "Java": "true",
        "Go": "true",
        "Ruby": "true",
        "Rust": "true",
        "C#": "true",
        "Kotlin": "true",
        "Swift": "true"
      },
      "falseWord": {
        "TypeScript": "false",
        "JavaScript": "false",
        "Python": "False",
        "Java": "false",
        "Go": "false",
        "Ruby": "false",
        "Rust": "false",
        "C#": "false",
        "Kotlin": "false",
        "Swift": "false"
      }
    }
  },
  {
    "title": "秒数を時刻表記に",
    "body": "## 背景\n\n整数の割り算と余り、ゼロ埋めを練習するお題です。タイマーや動画の再生時間の表示に使われる処理です。\n\n秒数 `sec`（0 以上の整数）を受け取り、`H:MM:SS` 形式の文字列を返す `{{slot:fn}}(sec)` を実装します。\n\n## ルール\n\n- 1 時間未満なら時を省いて `M:SS` にする\n- 分と秒は 2 桁にゼロ埋めする（先頭の単位は埋めない）\n- 時は 24 を超えても日に繰り上げない\n- 負の値はエラーにする\n\n## 例\n\n- `{{slot:fn}}(0)` → `\"0:00\"`\n- `{{slot:fn}}(65)` → `\"1:05\"`\n- `{{slot:fn}}(3600)` → `\"1:00:00\"`\n- `{{slot:fn}}(3725)` → `\"1:02:05\"`\n- `{{slot:fn}}(90000)` → `\"25:00:00\"`\n\n## 考慮すること\n\n3599 秒と 3600 秒のように、表記が切り替わる境界を必ずテストに入れてください。逆向きの `{{slot:fn2}}(\"1:02:05\")` を足すと、往復のテストが書けます。\n\n満たすこと:\n- 1 時間未満は M:SS\n- 1 時間以上は H:MM:SS\n- 分・秒のゼロ埋めが正しい\n- 負の値はエラー\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 3600 と 60 での割り算と余りで時・分・秒に分ける",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('65 秒は 1:05', () => {\n  expect(formatDuration(65)).toBe('1:05');\n});",
        "JavaScript": "test('65 秒は 1:05', () => {\n  expect(formatDuration(65)).toBe('1:05');\n});",
        "Python": "def test_65_seconds():\n    assert format_duration(65) == \"1:05\"",
        "Java": "@Test\nvoid sixtyFiveSeconds() {\n    assertEquals(\"1:05\", formatDuration(65));\n}",
        "Go": "func TestFormatDuration65(t *testing.T) {\n\tgot, err := formatDuration(65)\n\tif err != nil {\n\t\tt.Fatal(err)\n\t}\n\tif want := \"1:05\"; got != want {\n\t\tt.Errorf(\"formatDuration(65) = %q, want %q\", got, want)\n\t}\n}",
        "Ruby": "class FormatDurationTest < Minitest::Test\n  def test_65_seconds\n    assert_equal \"1:05\", format_duration(65)\n  end\nend",
        "Rust": "#[test]\nfn sixty_five_seconds() {\n    assert_eq!(format_duration(65), \"1:05\");\n}",
        "C#": "[Fact]\npublic void SixtyFiveSeconds()\n{\n    Assert.Equal(\"1:05\", FormatDuration(65));\n}",
        "Kotlin": "@Test\nfun `65 秒は 1分05秒`() {\n    assertEquals(\"1:05\", formatDuration(65))\n}",
        "Swift": "func testSixtyFiveSeconds() {\n    XCTAssertEqual(try formatDuration(65), \"1:05\")\n}"
      },
      "fn": {
        "TypeScript": "formatDuration",
        "JavaScript": "formatDuration",
        "Python": "format_duration",
        "Java": "formatDuration",
        "Go": "formatDuration",
        "Ruby": "format_duration",
        "Rust": "format_duration",
        "C#": "FormatDuration",
        "Kotlin": "formatDuration",
        "Swift": "formatDuration"
      },
      "fn2": {
        "TypeScript": "parseDuration",
        "JavaScript": "parseDuration",
        "Python": "parse_duration",
        "Java": "parseDuration",
        "Go": "parseDuration",
        "Ruby": "parse_duration",
        "Rust": "parse_duration",
        "C#": "ParseDuration",
        "Kotlin": "parseDuration",
        "Swift": "parseDuration"
      }
    }
  },
  {
    "title": "信号機の状態遷移",
    "body": "## 背景\n\n状態遷移の入門です。「今の状態」と「出来事」から「次の状態」を返す純粋な関数として書くと、テストがとても素直になります。\n\n歩行者用ボタン付きの信号機の次の状態を返す `{{slot:fn}}(state, event)` を実装します。\n\n## 状態と出来事\n\n- 状態: `\"green\"`（青）・`\"yellow\"`（黄）・`\"red\"`（赤）\n- 出来事: `\"tick\"`（一定時間が経った）・`\"button\"`（歩行者がボタンを押した）\n\n## ルール\n\n- `tick` で 青 → 黄 → 赤 → 青 と進む\n- 青のときに `button` が来たら、すぐ黄へ進む\n- 黄・赤のときの `button` は無視する（状態を変えない）\n- 知らない状態・出来事はエラーにする\n\n## 例\n\n- `{{slot:fn}}(\"green\", \"tick\")` → `\"yellow\"`\n- `{{slot:fn}}(\"red\", \"tick\")` → `\"green\"`\n- `{{slot:fn}}(\"green\", \"button\")` → `\"yellow\"`\n- `{{slot:fn}}(\"red\", \"button\")` → `\"red\"`\n\n## 拡張（時間があれば）\n\n出来事の配列を受け取り、最後の状態を返す `{{slot:fn2}}(initial, events)` を足します。畳み込み 1 つで書けます。\n\n満たすこと:\n- tick で 3 つの状態を順に巡る\n- 青でのボタンは黄へ進める\n- 黄・赤でのボタンは無視する\n- 知らない入力はエラー\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 「状態 × 出来事 → 次の状態」の表を作る",
    "difficulty": "easy",
    "category": "tdd",
    "slots": {
      "firstTest": {
        "TypeScript": "test('青で時間が経つと黄', () => {\n  expect(next('green', 'tick')).toBe('yellow');\n});",
        "JavaScript": "test('青で時間が経つと黄', () => {\n  expect(next('green', 'tick')).toBe('yellow');\n});",
        "Python": "def test_green_then_tick_is_yellow():\n    assert next_state(\"green\", \"tick\") == \"yellow\"",
        "Java": "@Test\nvoid greenThenTickIsYellow() {\n    assertEquals(\"yellow\", next(\"green\", \"tick\"));\n}",
        "Go": "func TestGreenThenTickIsYellow(t *testing.T) {\n\tgot, err := next(\"green\", \"tick\")\n\tif err != nil {\n\t\tt.Fatal(err)\n\t}\n\tif want := \"yellow\"; got != want {\n\t\tt.Errorf(\"next(green, tick) = %q, want %q\", got, want)\n\t}\n}",
        "Ruby": "class TrafficLightTest < Minitest::Test\n  def test_green_then_tick_is_yellow\n    assert_equal \"yellow\", next_state(\"green\", \"tick\")\n  end\nend",
        "Rust": "#[test]\nfn green_then_tick_is_yellow() {\n    assert_eq!(next(\"green\", \"tick\"), Ok(\"yellow\"));\n}",
        "C#": "[Fact]\npublic void GreenThenTickIsYellow()\n{\n    Assert.Equal(\"yellow\", Next(\"green\", \"tick\"));\n}",
        "Kotlin": "@Test\nfun `青で時間が経つと黄`() {\n    assertEquals(\"yellow\", next(\"green\", \"tick\"))\n}",
        "Swift": "func testGreenThenTickIsYellow() {\n    XCTAssertEqual(try next(\"green\", \"tick\"), \"yellow\")\n}"
      },
      "fn": {
        "TypeScript": "next",
        "JavaScript": "next",
        "Python": "next_state",
        "Java": "next",
        "Go": "next",
        "Ruby": "next_state",
        "Rust": "next",
        "C#": "Next",
        "Kotlin": "next",
        "Swift": "next"
      },
      "fn2": {
        "TypeScript": "run",
        "JavaScript": "run",
        "Python": "run",
        "Java": "run",
        "Go": "run",
        "Ruby": "run",
        "Rust": "run",
        "C#": "Run",
        "Kotlin": "run",
        "Swift": "run"
      }
    }
  },
  {
    "title": "最小値を返すスタック",
    "body": "## 背景\n\n既存のデータ構造に機能を足しながら、計算量の約束を守る練習です。「最小値の履歴も一緒に積む」という発想がポイントです。\n\n`{{slot:push}}`・`{{slot:pop}}`・`{{slot:top}}`・`{{slot:min}}` を持つスタック `MinStack` を実装します。`{{slot:min}}` は今スタックにある要素の最小値を返します。\n\n## 振る舞い\n\n- `{{slot:push}}(x)`: 値を積む\n- `{{slot:pop}}()`: 一番上の値を取り除いて返す\n- `{{slot:top}}()`: 一番上の値を返す（取り除かない）\n- `{{slot:min}}()`: 今ある要素の最小値を返す\n- 空のスタックへの `{{slot:pop}}`・`{{slot:top}}`・`{{slot:min}}` はエラー\n- どの操作も `O(1)` で動く\n\n## 例\n\n```\n{{slot:code1}}\n```\n\n## 考慮すること\n\n最小値を 1 つの変数で覚えるだけだと、最小値を `{{slot:pop}}` したときに次の最小値が分かりません。同じ値を複数回積んだとき（`{{slot:push}}(2); {{slot:push}}(2); {{slot:pop}}()`）もテストしてください。\n\n満たすこと:\n- push・pop・top が通常のスタックとして動く\n- min が今ある要素の最小値を返す\n- 最小値を pop した後も min が正しい\n- 同じ値を重ねて積んでも正しい\n- 空のときはエラー\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 値と一緒に「その時点の最小値」を積む\n- または最小値だけを積む補助のスタックを持つ",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "push": {
        "TypeScript": "push",
        "JavaScript": "push",
        "Python": "push",
        "Java": "push",
        "Go": "Push",
        "Ruby": "push",
        "Rust": "push",
        "C#": "Push",
        "Kotlin": "push",
        "Swift": "push"
      },
      "pop": {
        "TypeScript": "pop",
        "JavaScript": "pop",
        "Python": "pop",
        "Java": "pop",
        "Go": "Pop",
        "Ruby": "pop",
        "Rust": "pop",
        "C#": "Pop",
        "Kotlin": "pop",
        "Swift": "pop"
      },
      "top": {
        "TypeScript": "top",
        "JavaScript": "top",
        "Python": "top",
        "Java": "top",
        "Go": "Top",
        "Ruby": "top",
        "Rust": "top",
        "C#": "Top",
        "Kotlin": "top",
        "Swift": "top"
      },
      "min": {
        "TypeScript": "min",
        "JavaScript": "min",
        "Python": "min",
        "Java": "min",
        "Go": "Min",
        "Ruby": "min",
        "Rust": "min",
        "C#": "Min",
        "Kotlin": "min",
        "Swift": "min"
      },
      "code1": {
        "TypeScript": "const s = new MinStack();\ns.push(5); s.push(3); s.push(7);\ns.min();  // 3\ns.pop();  // 7\ns.pop();  // 3\ns.min();  // 5",
        "JavaScript": "const s = new MinStack();\ns.push(5); s.push(3); s.push(7);\ns.min();  // 3\ns.pop();  // 7\ns.pop();  // 3\ns.min();  // 5",
        "Python": "s = MinStack()\ns.push(5)\ns.push(3)\ns.push(7)\ns.min()  # 3\ns.pop()  # 7\ns.pop()  # 3\ns.min()  # 5",
        "Java": "var s = new MinStack();\ns.push(5); s.push(3); s.push(7);\ns.min();  // 3\ns.pop();  // 7\ns.pop();  // 3\ns.min();  // 5",
        "Go": "s := &MinStack{}\ns.Push(5)\ns.Push(3)\ns.Push(7)\ns.Min() // 3, nil\ns.Pop() // 7, nil\ns.Pop() // 3, nil\ns.Min() // 5, nil",
        "Ruby": "s = MinStack.new\ns.push(5)\ns.push(3)\ns.push(7)\ns.min  # => 3\ns.pop  # => 7\ns.pop  # => 3\ns.min  # => 5",
        "Rust": "let mut s = MinStack::new();\ns.push(5);\ns.push(3);\ns.push(7);\ns.min(); // Some(3)\ns.pop(); // Some(7)\ns.pop(); // Some(3)\ns.min(); // Some(5)",
        "C#": "var s = new MinStack();\ns.Push(5); s.Push(3); s.Push(7);\ns.Min();  // 3\ns.Pop();  // 7\ns.Pop();  // 3\ns.Min();  // 5",
        "Kotlin": "val s = MinStack()\ns.push(5)\ns.push(3)\ns.push(7)\ns.min()  // 3\ns.pop()  // 7\ns.pop()  // 3\ns.min()  // 5",
        "Swift": "var s = MinStack()\ns.push(5)\ns.push(3)\ns.push(7)\ns.min()  // Optional(3)\ns.pop()  // Optional(7)\ns.pop()  // Optional(3)\ns.min()  // Optional(5)"
      },
      "firstTest": {
        "TypeScript": "test('最小値を pop すると次の最小値に戻る', () => {\n  const s: MinStack = new MinStack();\n  s.push(5); s.push(3);\n  s.pop();\n  expect(s.min()).toBe(5);\n});",
        "JavaScript": "test('最小値を pop すると次の最小値に戻る', () => {\n  const s = new MinStack();\n  s.push(5); s.push(3);\n  s.pop();\n  expect(s.min()).toBe(5);\n});",
        "Python": "def test_min_restores_after_pop():\n    s = MinStack()\n    s.push(5)\n    s.push(3)\n    s.pop()\n    assert s.min() == 5",
        "Java": "@Test\nvoid minRestoresAfterPop() {\n    var s = new MinStack();\n    s.push(5);\n    s.push(3);\n    s.pop();\n    assertEquals(5, s.min());\n}",
        "Go": "func TestMinRestoresAfterPop(t *testing.T) {\n\ts := &MinStack{}\n\ts.Push(5)\n\ts.Push(3)\n\ts.Pop()\n\tgot, err := s.Min()\n\tif err != nil || got != 5 {\n\t\tt.Errorf(\"got %v, %v; want 5\", got, err)\n\t}\n}",
        "Ruby": "class MinStackTest < Minitest::Test\n  def test_min_restores_after_pop\n    s = MinStack.new\n    s.push(5)\n    s.push(3)\n    s.pop\n    assert_equal 5, s.min\n  end\nend",
        "Rust": "#[test]\nfn min_restores_after_pop() {\n    let mut s = MinStack::new();\n    s.push(5);\n    s.push(3);\n    s.pop();\n    assert_eq!(s.min(), Some(5));\n}",
        "C#": "[Fact]\npublic void MinRestoresAfterPop()\n{\n    var s = new MinStack();\n    s.Push(5);\n    s.Push(3);\n    s.Pop();\n    Assert.Equal(5, s.Min());\n}",
        "Kotlin": "@Test\nfun minRestoresAfterPop() {\n    val s = MinStack()\n    s.push(5)\n    s.push(3)\n    s.pop()\n    assertEquals(5, s.min())\n}",
        "Swift": "func testMinRestoresAfterPop() {\n    var s = MinStack()\n    s.push(5)\n    s.push(3)\n    s.pop()\n    XCTAssertEqual(s.min(), 5)\n}"
      }
    }
  },
  {
    "title": "単語の出現頻度ランキング",
    "body": "## 背景\n\n文章の集計は、正規化・数え上げ・並べ替えの 3 段に分かれます。それぞれを小さなテストで固めてから組み合わせる練習です。\n\n英文 `text` と件数 `k` を受け取り、出現回数の多い単語を上位 `k` 件返す `{{slot:fn}}(text, k)` を実装します。\n\n## ルール\n\n- 大文字小文字は区別しない（すべて小文字で返す）\n- 英字とアポストロフィ（`'`）以外は区切りとみなす（`don't` は 1 語）\n- 戻り値は {{slot:pairShape}}で、回数の多い順\n- 回数が同じなら単語の辞書順\n- 単語の種類が `k` より少なければ、あるだけ返す\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n同順位の並びを決めておかないと、テストが実装の偶然に依存します。`'` だけの語や、語頭・語末の `'`（`'hello'`）をどう扱うかも決めてテストに書いてください。\n\n満たすこと:\n- 大文字小文字をまとめて数える\n- 記号・数字・空白で区切る\n- 回数の降順、同数は辞書順\n- k より種類が少ないときはあるだけ返す\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 分割・数える・並べる、を別の関数にするとテストしやすい\n- 並べ替えの比較は「回数 → 単語」の 2 段で書く",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "topWords",
        "JavaScript": "topWords",
        "Python": "top_words",
        "Java": "topWords",
        "Go": "topWords",
        "Ruby": "top_words",
        "Rust": "top_words",
        "C#": "TopWords",
        "Kotlin": "topWords",
        "Swift": "topWords"
      },
      "pairShape": {
        "TypeScript": "`[string, number]`（単語と回数）の配列",
        "JavaScript": "`[単語, 回数]` の配列",
        "Python": "`(単語, 回数)` のタプルのリスト",
        "Java": "`Map.Entry<String, Integer>`（単語と回数）の `List`",
        "Go": "`wordCount{単語, 回数}` のスライス",
        "Ruby": "`[単語, 回数]` の配列",
        "Rust": "`(String, usize)`（単語と回数）の `Vec`",
        "C#": "`(string Word, int Count)` のタプルの配列",
        "Kotlin": "`Pair<String, Int>`（単語と回数）の `List`",
        "Swift": "`(word: String, count: Int)` のタプルの配列"
      },
      "examples": {
        "TypeScript": "- `topWords('the cat and the hat', 2)` → `[['the', 2], ['and', 1]]`\n- `topWords('B a b A c', 2)` → `[['a', 2], ['b', 2]]`\n- `topWords('', 3)` → `[]`",
        "JavaScript": "- `topWords('the cat and the hat', 2)` → `[['the', 2], ['and', 1]]`\n- `topWords('B a b A c', 2)` → `[['a', 2], ['b', 2]]`\n- `topWords('', 3)` → `[]`",
        "Python": "- `top_words(\"the cat and the hat\", 2)` → `[(\"the\", 2), (\"and\", 1)]`\n- `top_words(\"B a b A c\", 2)` → `[(\"a\", 2), (\"b\", 2)]`\n- `top_words(\"\", 3)` → `[]`",
        "Java": "- `topWords(\"the cat and the hat\", 2)` → `List.of(Map.entry(\"the\", 2), Map.entry(\"and\", 1))`\n- `topWords(\"B a b A c\", 2)` → `List.of(Map.entry(\"a\", 2), Map.entry(\"b\", 2))`\n- `topWords(\"\", 3)` → `List.of()`",
        "Go": "- `topWords(\"the cat and the hat\", 2)` → `[]wordCount{{\"the\", 2}, {\"and\", 1}}`\n- `topWords(\"B a b A c\", 2)` → `[]wordCount{{\"a\", 2}, {\"b\", 2}}`\n- `topWords(\"\", 3)` → `[]wordCount{}`",
        "Ruby": "- `top_words('the cat and the hat', 2)` → `[['the', 2], ['and', 1]]`\n- `top_words('B a b A c', 2)` → `[['a', 2], ['b', 2]]`\n- `top_words('', 3)` → `[]`",
        "Rust": "- `top_words(\"the cat and the hat\", 2)` → `vec![(\"the\".to_string(), 2), (\"and\".to_string(), 1)]`\n- `top_words(\"B a b A c\", 2)` → `vec![(\"a\".to_string(), 2), (\"b\".to_string(), 2)]`\n- `top_words(\"\", 3)` → `vec![]`",
        "C#": "- `TopWords(\"the cat and the hat\", 2)` → `new[] { (\"the\", 2), (\"and\", 1) }`\n- `TopWords(\"B a b A c\", 2)` → `new[] { (\"a\", 2), (\"b\", 2) }`\n- `TopWords(\"\", 3)` → `Array.Empty<(string, int)>()`",
        "Kotlin": "- `topWords(\"the cat and the hat\", 2)` → `listOf(\"the\" to 2, \"and\" to 1)`\n- `topWords(\"B a b A c\", 2)` → `listOf(\"a\" to 2, \"b\" to 2)`\n- `topWords(\"\", 3)` → `emptyList()`",
        "Swift": "- `topWords(\"the cat and the hat\", 2)` → `[(word: \"the\", count: 2), (word: \"and\", count: 1)]`\n- `topWords(\"B a b A c\", 2)` → `[(word: \"a\", count: 2), (word: \"b\", count: 2)]`\n- `topWords(\"\", 3)` → `[]`"
      },
      "firstTest": {
        "TypeScript": "test('一番多い単語が先頭に来る', () => {\n  expect(topWords('the cat and the hat', 1)).toEqual([['the', 2]]);\n});",
        "JavaScript": "test('一番多い単語が先頭に来る', () => {\n  expect(topWords('the cat and the hat', 1)).toEqual([['the', 2]]);\n});",
        "Python": "def test_most_frequent_word_first():\n    assert top_words(\"the cat and the hat\", 1) == [(\"the\", 2)]",
        "Java": "@Test\nvoid mostFrequentWordFirst() {\n    assertEquals(List.of(Map.entry(\"the\", 2)), topWords(\"the cat and the hat\", 1));\n}",
        "Go": "import \"slices\"\n\nfunc TestMostFrequentWordFirst(t *testing.T) {\n\tgot := topWords(\"the cat and the hat\", 1)\n\twant := []wordCount{{\"the\", 2}}\n\tif !slices.Equal(got, want) {\n\t\tt.Errorf(\"got %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class TopWordsTest < Minitest::Test\n  def test_most_frequent_word_first\n    assert_equal [['the', 2]], top_words('the cat and the hat', 1)\n  end\nend",
        "Rust": "#[test]\nfn most_frequent_word_first() {\n    assert_eq!(top_words(\"the cat and the hat\", 1), vec![(\"the\".to_string(), 2)]);\n}",
        "C#": "[Fact]\npublic void MostFrequentWordFirst()\n{\n    Assert.Equal(new[] { (\"the\", 2) }, TopWords(\"the cat and the hat\", 1));\n}",
        "Kotlin": "@Test\nfun mostFrequentWordFirst() {\n    assertEquals(listOf(\"the\" to 2), topWords(\"the cat and the hat\", 1))\n}",
        "Swift": "func testMostFrequentWordFirst() {\n    let got = topWords(\"the cat and the hat\", 1)\n    XCTAssertEqual(got.map { $0.word }, [\"the\"])\n    XCTAssertEqual(got.map { $0.count }, [2])\n}"
      }
    }
  },
  {
    "title": "営業日の加算",
    "body": "## 背景\n\n業務システムでよく出る「◯営業日後」の計算です。土日と祝日を飛ばす規則を、日付の境界（月末・年末）を含めてテストで固めます。\n\n開始日 `start`、日数 `n`（0 以上）、祝日の一覧 `holidays` を受け取り、`n` 営業日後の日付を返す `{{slot:fn}}(start, n, holidays)` を実装します。\n\n## ルール\n\n- 土曜・日曜・祝日は営業日でない\n- 開始日の翌日から数える（開始日自体は数えない）\n- `n = 0` のとき、開始日が営業日ならその日、営業日でなければ次の営業日を返す\n- 日付は `YYYY-MM-DD` の文字列で受け渡す\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\nタイムゾーンや夏時間の影響を受けないよう、時刻を持たない日付として扱うのが安全です。曜日の計算を自前で書くか、言語の日付の道具を使うかはチームで決めてください。\n\n満たすこと:\n- 土日を飛ばす\n- 祝日の一覧にある日を飛ばす\n- 月末・年末をまたいでも正しい\n- n = 0 の扱いがルールどおり\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 「1 日進める」と「営業日か判定する」を別の関数に分ける\n- 祝日は集合にして引く",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "addBusinessDays",
        "JavaScript": "addBusinessDays",
        "Python": "add_business_days",
        "Java": "addBusinessDays",
        "Go": "addBusinessDays",
        "Ruby": "add_business_days",
        "Rust": "add_business_days",
        "C#": "AddBusinessDays",
        "Kotlin": "addBusinessDays",
        "Swift": "addBusinessDays"
      },
      "examples": {
        "TypeScript": "- `addBusinessDays('2026-11-20', 1, [])` → `'2026-11-23'`（金曜の 1 営業日後は月曜）\n- `addBusinessDays('2026-11-20', 1, ['2026-11-23'])` → `'2026-11-24'`\n- `addBusinessDays('2026-12-30', 2, ['2026-12-31', '2027-01-01'])` → `'2027-01-05'`\n- `addBusinessDays('2026-11-21', 0, [])` → `'2026-11-23'`（土曜は翌営業日へ）",
        "JavaScript": "- `addBusinessDays('2026-11-20', 1, [])` → `'2026-11-23'`（金曜の 1 営業日後は月曜）\n- `addBusinessDays('2026-11-20', 1, ['2026-11-23'])` → `'2026-11-24'`\n- `addBusinessDays('2026-12-30', 2, ['2026-12-31', '2027-01-01'])` → `'2027-01-05'`\n- `addBusinessDays('2026-11-21', 0, [])` → `'2026-11-23'`（土曜は翌営業日へ）",
        "Python": "- `add_business_days(\"2026-11-20\", 1, [])` → `\"2026-11-23\"`（金曜の 1 営業日後は月曜）\n- `add_business_days(\"2026-11-20\", 1, [\"2026-11-23\"])` → `\"2026-11-24\"`\n- `add_business_days(\"2026-12-30\", 2, [\"2026-12-31\", \"2027-01-01\"])` → `\"2027-01-05\"`\n- `add_business_days(\"2026-11-21\", 0, [])` → `\"2026-11-23\"`（土曜は翌営業日へ）",
        "Java": "- `addBusinessDays(\"2026-11-20\", 1, List.of())` → `\"2026-11-23\"`（金曜の 1 営業日後は月曜）\n- `addBusinessDays(\"2026-11-20\", 1, List.of(\"2026-11-23\"))` → `\"2026-11-24\"`\n- `addBusinessDays(\"2026-12-30\", 2, List.of(\"2026-12-31\", \"2027-01-01\"))` → `\"2027-01-05\"`\n- `addBusinessDays(\"2026-11-21\", 0, List.of())` → `\"2026-11-23\"`（土曜は翌営業日へ）",
        "Go": "- `addBusinessDays(\"2026-11-20\", 1, []string{})` → `\"2026-11-23\", nil`（金曜の 1 営業日後は月曜）\n- `addBusinessDays(\"2026-11-20\", 1, []string{\"2026-11-23\"})` → `\"2026-11-24\", nil`\n- `addBusinessDays(\"2026-12-30\", 2, []string{\"2026-12-31\", \"2027-01-01\"})` → `\"2027-01-05\", nil`\n- `addBusinessDays(\"2026-11-21\", 0, []string{})` → `\"2026-11-23\", nil`（土曜は翌営業日へ）",
        "Ruby": "- `add_business_days('2026-11-20', 1, [])` → `'2026-11-23'`（金曜の 1 営業日後は月曜）\n- `add_business_days('2026-11-20', 1, ['2026-11-23'])` → `'2026-11-24'`\n- `add_business_days('2026-12-30', 2, ['2026-12-31', '2027-01-01'])` → `'2027-01-05'`\n- `add_business_days('2026-11-21', 0, [])` → `'2026-11-23'`（土曜は翌営業日へ）",
        "Rust": "- `add_business_days(\"2026-11-20\", 1, &[])` → `\"2026-11-23\"`（金曜の 1 営業日後は月曜）\n- `add_business_days(\"2026-11-20\", 1, &[\"2026-11-23\"])` → `\"2026-11-24\"`\n- `add_business_days(\"2026-12-30\", 2, &[\"2026-12-31\", \"2027-01-01\"])` → `\"2027-01-05\"`\n- `add_business_days(\"2026-11-21\", 0, &[])` → `\"2026-11-23\"`（土曜は翌営業日へ）",
        "C#": "- `AddBusinessDays(\"2026-11-20\", 1, Array.Empty<string>())` → `\"2026-11-23\"`（金曜の 1 営業日後は月曜）\n- `AddBusinessDays(\"2026-11-20\", 1, new[] { \"2026-11-23\" })` → `\"2026-11-24\"`\n- `AddBusinessDays(\"2026-12-30\", 2, new[] { \"2026-12-31\", \"2027-01-01\" })` → `\"2027-01-05\"`\n- `AddBusinessDays(\"2026-11-21\", 0, Array.Empty<string>())` → `\"2026-11-23\"`（土曜は翌営業日へ）",
        "Kotlin": "- `addBusinessDays(\"2026-11-20\", 1, emptyList())` → `\"2026-11-23\"`（金曜の 1 営業日後は月曜）\n- `addBusinessDays(\"2026-11-20\", 1, listOf(\"2026-11-23\"))` → `\"2026-11-24\"`\n- `addBusinessDays(\"2026-12-30\", 2, listOf(\"2026-12-31\", \"2027-01-01\"))` → `\"2027-01-05\"`\n- `addBusinessDays(\"2026-11-21\", 0, emptyList())` → `\"2026-11-23\"`（土曜は翌営業日へ）",
        "Swift": "- `addBusinessDays(\"2026-11-20\", 1, [])` → `\"2026-11-23\"`（金曜の 1 営業日後は月曜）\n- `addBusinessDays(\"2026-11-20\", 1, [\"2026-11-23\"])` → `\"2026-11-24\"`\n- `addBusinessDays(\"2026-12-30\", 2, [\"2026-12-31\", \"2027-01-01\"])` → `\"2027-01-05\"`\n- `addBusinessDays(\"2026-11-21\", 0, [])` → `\"2026-11-23\"`（土曜は翌営業日へ）"
      },
      "firstTest": {
        "TypeScript": "test('金曜の 1 営業日後は月曜', () => {\n  expect(addBusinessDays('2026-11-20', 1, [])).toBe('2026-11-23');\n});",
        "JavaScript": "test('金曜の 1 営業日後は月曜', () => {\n  expect(addBusinessDays('2026-11-20', 1, [])).toBe('2026-11-23');\n});",
        "Python": "def test_friday_plus_one_is_monday():\n    assert add_business_days(\"2026-11-20\", 1, []) == \"2026-11-23\"",
        "Java": "@Test\nvoid fridayPlusOneIsMonday() {\n    assertEquals(\"2026-11-23\", addBusinessDays(\"2026-11-20\", 1, List.of()));\n}",
        "Go": "func TestFridayPlusOneIsMonday(t *testing.T) {\n\tgot, err := addBusinessDays(\"2026-11-20\", 1, []string{})\n\twant := \"2026-11-23\"\n\tif err != nil || got != want {\n\t\tt.Errorf(\"got %q, %v; want %q\", got, err, want)\n\t}\n}",
        "Ruby": "class AddBusinessDaysTest < Minitest::Test\n  def test_friday_plus_one_is_monday\n    assert_equal '2026-11-23', add_business_days('2026-11-20', 1, [])\n  end\nend",
        "Rust": "#[test]\nfn friday_plus_one_is_monday() {\n    assert_eq!(add_business_days(\"2026-11-20\", 1, &[]), \"2026-11-23\");\n}",
        "C#": "[Fact]\npublic void FridayPlusOneIsMonday()\n{\n    Assert.Equal(\"2026-11-23\", AddBusinessDays(\"2026-11-20\", 1, Array.Empty<string>()));\n}",
        "Kotlin": "@Test\nfun fridayPlusOneIsMonday() {\n    assertEquals(\"2026-11-23\", addBusinessDays(\"2026-11-20\", 1, emptyList()))\n}",
        "Swift": "func testFridayPlusOneIsMonday() {\n    XCTAssertEqual(addBusinessDays(\"2026-11-20\", 1, []), \"2026-11-23\")\n}"
      }
    }
  },
  {
    "title": "文章の折り返し",
    "body": "## 背景\n\n「Word Wrap Kata」として知られるお題です。ごく単純な例から始めて、テストを 1 つ足すたびに実装が少しずつ一般化していく、TDD の段取りの練習に向いています。\n\n文字列 `text` と 1 行の最大幅 `width` を受け取り、単語の切れ目で改行（`\\n`）を入れた文字列を返す `{{slot:fn}}(text, width)` を実装します。\n\n## ルール\n\n- 1 行は `width` 文字以下にする\n- できるだけ単語の切れ目（空白）で折り返し、折り返した位置の空白は消す\n- `width` より長い単語は、`width` 文字ごとに単語の途中で切る\n- 空文字列は空文字列を返す\n- `width` が 1 未満ならエラーにする\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\nテストの順番が肝です。「空」「収まる」「長い単語を 1 回切る」「長い単語を何度も切る」「空白で切る」……と、実装を 1 歩ずつしか変えなくて済む順を探してみてください。\n\n満たすこと:\n- 各行が width 文字以下になる\n- 空白の位置で折り返し、行頭・行末に空白を残さない\n- 長い単語は途中で切る\n- 空文字列と不正な width を扱う\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- width 以内の最後の空白を探し、そこで切って残りを再帰的に処理する\n- 空白が見つからなければ width の位置で切る",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "wrap",
        "JavaScript": "wrap",
        "Python": "wrap",
        "Java": "wrap",
        "Go": "wrap",
        "Ruby": "wrap",
        "Rust": "wrap",
        "C#": "Wrap",
        "Kotlin": "wrap",
        "Swift": "wrap"
      },
      "examples": {
        "TypeScript": "- `wrap('word', 10)` → `'word'`\n- `wrap('word word', 6)` → `'word\\nword'`\n- `wrap('a lot of words', 5)` → `'a lot\\nof\\nwords'`\n- `wrap('abcdefgh', 3)` → `'abc\\ndef\\ngh'`",
        "JavaScript": "- `wrap('word', 10)` → `'word'`\n- `wrap('word word', 6)` → `'word\\nword'`\n- `wrap('a lot of words', 5)` → `'a lot\\nof\\nwords'`\n- `wrap('abcdefgh', 3)` → `'abc\\ndef\\ngh'`",
        "Python": "- `wrap(\"word\", 10)` → `\"word\"`\n- `wrap(\"word word\", 6)` → `\"word\\nword\"`\n- `wrap(\"a lot of words\", 5)` → `\"a lot\\nof\\nwords\"`\n- `wrap(\"abcdefgh\", 3)` → `\"abc\\ndef\\ngh\"`",
        "Java": "- `wrap(\"word\", 10)` → `\"word\"`\n- `wrap(\"word word\", 6)` → `\"word\\nword\"`\n- `wrap(\"a lot of words\", 5)` → `\"a lot\\nof\\nwords\"`\n- `wrap(\"abcdefgh\", 3)` → `\"abc\\ndef\\ngh\"`",
        "Go": "- `wrap(\"word\", 10)` → `\"word\", nil`\n- `wrap(\"word word\", 6)` → `\"word\\nword\", nil`\n- `wrap(\"a lot of words\", 5)` → `\"a lot\\nof\\nwords\", nil`\n- `wrap(\"abcdefgh\", 3)` → `\"abc\\ndef\\ngh\", nil`",
        "Ruby": "- `wrap('word', 10)` → `'word'`\n- `wrap('word word', 6)` → `\"word\\nword\"`\n- `wrap('a lot of words', 5)` → `\"a lot\\nof\\nwords\"`\n- `wrap('abcdefgh', 3)` → `\"abc\\ndef\\ngh\"`",
        "Rust": "- `wrap(\"word\", 10)` → `Ok(\"word\")`\n- `wrap(\"word word\", 6)` → `Ok(\"word\\nword\")`\n- `wrap(\"a lot of words\", 5)` → `Ok(\"a lot\\nof\\nwords\")`\n- `wrap(\"abcdefgh\", 3)` → `Ok(\"abc\\ndef\\ngh\")`",
        "C#": "- `Wrap(\"word\", 10)` → `\"word\"`\n- `Wrap(\"word word\", 6)` → `\"word\\nword\"`\n- `Wrap(\"a lot of words\", 5)` → `\"a lot\\nof\\nwords\"`\n- `Wrap(\"abcdefgh\", 3)` → `\"abc\\ndef\\ngh\"`",
        "Kotlin": "- `wrap(\"word\", 10)` → `\"word\"`\n- `wrap(\"word word\", 6)` → `\"word\\nword\"`\n- `wrap(\"a lot of words\", 5)` → `\"a lot\\nof\\nwords\"`\n- `wrap(\"abcdefgh\", 3)` → `\"abc\\ndef\\ngh\"`",
        "Swift": "- `wrap(\"word\", 10)` → `\"word\"`\n- `wrap(\"word word\", 6)` → `\"word\\nword\"`\n- `wrap(\"a lot of words\", 5)` → `\"a lot\\nof\\nwords\"`\n- `wrap(\"abcdefgh\", 3)` → `\"abc\\ndef\\ngh\"`"
      },
      "firstTest": {
        "TypeScript": "test('幅に収まる文はそのまま', () => {\n  expect(wrap('word', 10)).toBe('word');\n});",
        "JavaScript": "test('幅に収まる文はそのまま', () => {\n  expect(wrap('word', 10)).toBe('word');\n});",
        "Python": "def test_short_text_is_unchanged():\n    assert wrap(\"word\", 10) == \"word\"",
        "Java": "@Test\nvoid shortTextIsUnchanged() {\n    assertEquals(\"word\", wrap(\"word\", 10));\n}",
        "Go": "func TestShortTextIsUnchanged(t *testing.T) {\n\tgot, err := wrap(\"word\", 10)\n\twant := \"word\"\n\tif err != nil || got != want {\n\t\tt.Errorf(\"got %q, %v; want %q\", got, err, want)\n\t}\n}",
        "Ruby": "class WrapTest < Minitest::Test\n  def test_short_text_is_unchanged\n    assert_equal 'word', wrap('word', 10)\n  end\nend",
        "Rust": "#[test]\nfn short_text_is_unchanged() {\n    assert_eq!(wrap(\"word\", 10).unwrap(), \"word\");\n}",
        "C#": "[Fact]\npublic void ShortTextIsUnchanged()\n{\n    Assert.Equal(\"word\", Wrap(\"word\", 10));\n}",
        "Kotlin": "@Test\nfun shortTextIsUnchanged() {\n    assertEquals(\"word\", wrap(\"word\", 10))\n}",
        "Swift": "func testShortTextIsUnchanged() throws {\n    XCTAssertEqual(try wrap(\"word\", 10), \"word\")\n}"
      }
    }
  },
  {
    "title": "CSV の行の分解",
    "body": "## 背景\n\n「カンマで split するだけ」では済まないのが CSV です。引用符の中のカンマや、二重にした引用符を扱うには、文字を 1 つずつ読む小さな状態機械が要ります。\n\nCSV の 1 行 `line` を受け取り、フィールドの配列を返す `{{slot:fn}}(line)` を実装します。\n\n## ルール\n\n- フィールドはカンマで区切られる\n- `\"` で囲まれたフィールドの中では、カンマも普通の文字として扱う\n- 囲みの中の `\"\"` は `\"` 1 文字を表す\n- 空のフィールドは空文字列（`a,,b` は 3 フィールド）\n- 囲みが閉じていなければエラーにする\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n「囲みの外」「囲みの中」「囲みの中で引用符を 1 つ見た直後」の状態を持つと整理できます。閉じた引用符の直後にカンマ以外が来たとき（`\"a\"b`）の扱いも決めてください。\n\n満たすこと:\n- 単純なカンマ区切りを分解できる\n- 空のフィールドを保つ\n- 囲みの中のカンマを区切りとみなさない\n- 二重の引用符を 1 つの引用符に戻す\n- 閉じていない囲みはエラー\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 文字を 1 つずつ読み、今の状態で振る舞いを変える\n- 区切りを見たら今のフィールドを確定して次へ進む",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "parseCsvLine",
        "JavaScript": "parseCsvLine",
        "Python": "parse_csv_line",
        "Java": "parseCsvLine",
        "Go": "parseCsvLine",
        "Ruby": "parse_csv_line",
        "Rust": "parse_csv_line",
        "C#": "ParseCsvLine",
        "Kotlin": "parseCsvLine",
        "Swift": "parseCsvLine"
      },
      "examples": {
        "TypeScript": "- `parseCsvLine('a,b,c')` → `['a', 'b', 'c']`\n- `parseCsvLine('a,,c')` → `['a', '', 'c']`\n- `parseCsvLine('\"x,y\",z')` → `['x,y', 'z']`\n- `parseCsvLine('\"say \"\"hi\"\"\",ok')` → `['say \"hi\"', 'ok']`\n- `parseCsvLine('')` → `['']`",
        "JavaScript": "- `parseCsvLine('a,b,c')` → `['a', 'b', 'c']`\n- `parseCsvLine('a,,c')` → `['a', '', 'c']`\n- `parseCsvLine('\"x,y\",z')` → `['x,y', 'z']`\n- `parseCsvLine('\"say \"\"hi\"\"\",ok')` → `['say \"hi\"', 'ok']`\n- `parseCsvLine('')` → `['']`",
        "Python": "- `parse_csv_line(\"a,b,c\")` → `[\"a\", \"b\", \"c\"]`\n- `parse_csv_line(\"a,,c\")` → `[\"a\", \"\", \"c\"]`\n- `parse_csv_line('\"x,y\",z')` → `[\"x,y\", \"z\"]`\n- `parse_csv_line('\"say \"\"hi\"\"\",ok')` → `['say \"hi\"', \"ok\"]`\n- `parse_csv_line(\"\")` → `[\"\"]`",
        "Java": "- `parseCsvLine(\"a,b,c\")` → `List.of(\"a\", \"b\", \"c\")`\n- `parseCsvLine(\"a,,c\")` → `List.of(\"a\", \"\", \"c\")`\n- `parseCsvLine(\"\\\"x,y\\\",z\")` → `List.of(\"x,y\", \"z\")`\n- `parseCsvLine(\"\\\"say \\\"\\\"hi\\\"\\\"\\\",ok\")` → `List.of(\"say \\\"hi\\\"\", \"ok\")`\n- `parseCsvLine(\"\")` → `List.of(\"\")`",
        "Go": "- `parseCsvLine(\"a,b,c\")` → `[]string{\"a\", \"b\", \"c\"}, nil`\n- `parseCsvLine(\"a,,c\")` → `[]string{\"a\", \"\", \"c\"}, nil`\n- `parseCsvLine(\"\\\"x,y\\\",z\")` → `[]string{\"x,y\", \"z\"}, nil`\n- `parseCsvLine(\"\\\"say \\\"\\\"hi\\\"\\\"\\\",ok\")` → `[]string{\"say \\\"hi\\\"\", \"ok\"}, nil`\n- `parseCsvLine(\"\")` → `[]string{\"\"}, nil`",
        "Ruby": "- `parse_csv_line('a,b,c')` → `['a', 'b', 'c']`\n- `parse_csv_line('a,,c')` → `['a', '', 'c']`\n- `parse_csv_line('\"x,y\",z')` → `['x,y', 'z']`\n- `parse_csv_line('\"say \"\"hi\"\"\",ok')` → `['say \"hi\"', 'ok']`\n- `parse_csv_line('')` → `['']`",
        "Rust": "- `parse_csv_line(\"a,b,c\")` → `Ok(vec![\"a\", \"b\", \"c\"])`\n- `parse_csv_line(\"a,,c\")` → `Ok(vec![\"a\", \"\", \"c\"])`\n- `parse_csv_line(\"\\\"x,y\\\",z\")` → `Ok(vec![\"x,y\", \"z\"])`\n- `parse_csv_line(\"\\\"say \\\"\\\"hi\\\"\\\"\\\",ok\")` → `Ok(vec![\"say \\\"hi\\\"\", \"ok\"])`\n- `parse_csv_line(\"\")` → `Ok(vec![\"\"])`",
        "C#": "- `ParseCsvLine(\"a,b,c\")` → `new[] { \"a\", \"b\", \"c\" }`\n- `ParseCsvLine(\"a,,c\")` → `new[] { \"a\", \"\", \"c\" }`\n- `ParseCsvLine(\"\\\"x,y\\\",z\")` → `new[] { \"x,y\", \"z\" }`\n- `ParseCsvLine(\"\\\"say \\\"\\\"hi\\\"\\\"\\\",ok\")` → `new[] { \"say \\\"hi\\\"\", \"ok\" }`\n- `ParseCsvLine(\"\")` → `new[] { \"\" }`",
        "Kotlin": "- `parseCsvLine(\"a,b,c\")` → `listOf(\"a\", \"b\", \"c\")`\n- `parseCsvLine(\"a,,c\")` → `listOf(\"a\", \"\", \"c\")`\n- `parseCsvLine(\"\\\"x,y\\\",z\")` → `listOf(\"x,y\", \"z\")`\n- `parseCsvLine(\"\\\"say \\\"\\\"hi\\\"\\\"\\\",ok\")` → `listOf(\"say \\\"hi\\\"\", \"ok\")`\n- `parseCsvLine(\"\")` → `listOf(\"\")`",
        "Swift": "- `parseCsvLine(\"a,b,c\")` → `[\"a\", \"b\", \"c\"]`\n- `parseCsvLine(\"a,,c\")` → `[\"a\", \"\", \"c\"]`\n- `parseCsvLine(\"\\\"x,y\\\",z\")` → `[\"x,y\", \"z\"]`\n- `parseCsvLine(\"\\\"say \\\"\\\"hi\\\"\\\"\\\",ok\")` → `[\"say \\\"hi\\\"\", \"ok\"]`\n- `parseCsvLine(\"\")` → `[\"\"]`"
      },
      "firstTest": {
        "TypeScript": "test('カンマで分ける', () => {\n  expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);\n});",
        "JavaScript": "test('カンマで分ける', () => {\n  expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);\n});",
        "Python": "def test_splits_on_commas():\n    assert parse_csv_line(\"a,b,c\") == [\"a\", \"b\", \"c\"]",
        "Java": "@Test\nvoid splitsOnCommas() {\n    assertEquals(List.of(\"a\", \"b\", \"c\"), parseCsvLine(\"a,b,c\"));\n}",
        "Go": "import \"slices\"\n\nfunc TestSplitsOnCommas(t *testing.T) {\n\tgot, err := parseCsvLine(\"a,b,c\")\n\twant := []string{\"a\", \"b\", \"c\"}\n\tif err != nil || !slices.Equal(got, want) {\n\t\tt.Errorf(\"got %q, %v; want %q\", got, err, want)\n\t}\n}",
        "Ruby": "class ParseCsvLineTest < Minitest::Test\n  def test_splits_on_commas\n    assert_equal ['a', 'b', 'c'], parse_csv_line('a,b,c')\n  end\nend",
        "Rust": "#[test]\nfn splits_on_commas() {\n    assert_eq!(parse_csv_line(\"a,b,c\").unwrap(), vec![\"a\", \"b\", \"c\"]);\n}",
        "C#": "[Fact]\npublic void SplitsOnCommas()\n{\n    Assert.Equal(new[] { \"a\", \"b\", \"c\" }, ParseCsvLine(\"a,b,c\"));\n}",
        "Kotlin": "@Test\nfun splitsOnCommas() {\n    assertEquals(listOf(\"a\", \"b\", \"c\"), parseCsvLine(\"a,b,c\"))\n}",
        "Swift": "func testSplitsOnCommas() throws {\n    XCTAssertEqual(try parseCsvLine(\"a,b,c\"), [\"a\", \"b\", \"c\"])\n}"
      }
    }
  },
  {
    "title": "ライフゲームの次の世代",
    "body": "## 背景\n\nコンウェイのライフゲームは、Code Retreat でも使われる定番のお題です。規則は 4 つだけですが、盤面の端の扱いや表現の選び方で設計の違いが出ます。\n\n生きているセルの座標の集合を受け取り、次の世代の生きているセルの集合を返す `{{slot:fn}}(cells)` を実装します。盤面は無限に広いものとします。\n\n## ルール\n\n- 生きているセルの周囲 8 マスに生きているセルが 2 つか 3 つなら、生き残る\n- それ以外の生きているセルは死ぬ（過疎・過密）\n- 死んでいるセルの周囲にちょうど 3 つ生きているセルがあれば、生まれる\n\n## 例\n\n{{slot:examples}}\n\n## 考慮すること\n\n二次元配列ではなく座標の集合で持つと、端の扱いが要らなくなります。集合の比較は並びに依存しないようにしてください（並べ替えてから比べる等）。\n\n満たすこと:\n- 過疎・過密で死ぬ\n- 2 つか 3 つの隣で生き残る\n- ちょうど 3 つの隣で生まれる\n- ブロックが不変、ブリンカーが振動する\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 生きているセルの隣を全部数え上げ、「隣の数」の表を作る\n- 座標は \"x,y\" の文字列にすると集合のキーにしやすい",
    "difficulty": "medium",
    "category": "tdd",
    "slots": {
      "fn": {
        "TypeScript": "nextGeneration",
        "JavaScript": "nextGeneration",
        "Python": "next_generation",
        "Java": "nextGeneration",
        "Go": "nextGeneration",
        "Ruby": "next_generation",
        "Rust": "next_generation",
        "C#": "NextGeneration",
        "Kotlin": "nextGeneration",
        "Swift": "nextGeneration"
      },
      "examples": {
        "TypeScript": "- 空の集合 → 空の集合\n- 1 つだけのセル → 空（過疎で死ぬ）\n- 2×2 のブロック `[[0,0],[0,1],[1,0],[1,1]]` → 変わらない\n- 横一列の 3 つ（ブリンカー）`[[0,0],[1,0],[2,0]]` → 縦一列 `[[1,-1],[1,0],[1,1]]`",
        "JavaScript": "- 空の集合 → 空の集合\n- 1 つだけのセル → 空（過疎で死ぬ）\n- 2×2 のブロック `[[0,0],[0,1],[1,0],[1,1]]` → 変わらない\n- 横一列の 3 つ（ブリンカー）`[[0,0],[1,0],[2,0]]` → 縦一列 `[[1,-1],[1,0],[1,1]]`",
        "Python": "- 空の集合 → 空の集合\n- 1 つだけのセル → 空（過疎で死ぬ）\n- 2×2 のブロック `{(0, 0), (0, 1), (1, 0), (1, 1)}` → 変わらない\n- 横一列の 3 つ（ブリンカー）`{(0, 0), (1, 0), (2, 0)}` → 縦一列 `{(1, -1), (1, 0), (1, 1)}`",
        "Java": "- 空の集合 → 空の集合\n- 1 つだけのセル → 空（過疎で死ぬ）\n- 2×2 のブロック `Set.of(new Cell(0, 0), new Cell(0, 1), new Cell(1, 0), new Cell(1, 1))` → 変わらない\n- 横一列の 3 つ（ブリンカー）`Set.of(new Cell(0, 0), new Cell(1, 0), new Cell(2, 0))` → 縦一列 `Set.of(new Cell(1, -1), new Cell(1, 0), new Cell(1, 1))`",
        "Go": "- 空の集合 → 空の集合\n- 1 つだけのセル → 空（過疎で死ぬ）\n- 2×2 のブロック `[]cell{{0, 0}, {0, 1}, {1, 0}, {1, 1}}` → 変わらない\n- 横一列の 3 つ（ブリンカー）`[]cell{{0, 0}, {1, 0}, {2, 0}}` → 縦一列 `[]cell{{1, -1}, {1, 0}, {1, 1}}`",
        "Ruby": "- 空の集合 → 空の集合\n- 1 つだけのセル → 空（過疎で死ぬ）\n- 2×2 のブロック `Set[[0, 0], [0, 1], [1, 0], [1, 1]]` → 変わらない\n- 横一列の 3 つ（ブリンカー）`Set[[0, 0], [1, 0], [2, 0]]` → 縦一列 `Set[[1, -1], [1, 0], [1, 1]]`",
        "Rust": "- 空の集合 → 空の集合\n- 1 つだけのセル → 空（過疎で死ぬ）\n- 2×2 のブロック `&HashSet::from([(0, 0), (0, 1), (1, 0), (1, 1)])` → 変わらない\n- 横一列の 3 つ（ブリンカー）`&HashSet::from([(0, 0), (1, 0), (2, 0)])` → 縦一列 `HashSet::from([(1, -1), (1, 0), (1, 1)])`",
        "C#": "- 空の集合 → 空の集合\n- 1 つだけのセル → 空（過疎で死ぬ）\n- 2×2 のブロック `new HashSet<(int, int)> { (0, 0), (0, 1), (1, 0), (1, 1) }` → 変わらない\n- 横一列の 3 つ（ブリンカー）`new HashSet<(int, int)> { (0, 0), (1, 0), (2, 0) }` → 縦一列 `new HashSet<(int, int)> { (1, -1), (1, 0), (1, 1) }`",
        "Kotlin": "- 空の集合 → 空の集合\n- 1 つだけのセル → 空（過疎で死ぬ）\n- 2×2 のブロック `setOf(0 to 0, 0 to 1, 1 to 0, 1 to 1)` → 変わらない\n- 横一列の 3 つ（ブリンカー）`setOf(0 to 0, 1 to 0, 2 to 0)` → 縦一列 `setOf(1 to -1, 1 to 0, 1 to 1)`",
        "Swift": "- 空の集合 → 空の集合\n- 1 つだけのセル → 空（過疎で死ぬ）\n- 2×2 のブロック `[Cell(x: 0, y: 0), Cell(x: 0, y: 1), Cell(x: 1, y: 0), Cell(x: 1, y: 1)]` → 変わらない\n- 横一列の 3 つ（ブリンカー）`[Cell(x: 0, y: 0), Cell(x: 1, y: 0), Cell(x: 2, y: 0)]` → 縦一列 `[Cell(x: 1, y: -1), Cell(x: 1, y: 0), Cell(x: 1, y: 1)]`"
      },
      "firstTest": {
        "TypeScript": "test('孤立したセルは死ぬ', () => {\n  expect(nextGeneration([[0, 0]])).toEqual([]);\n});",
        "JavaScript": "test('孤立したセルは死ぬ', () => {\n  expect(nextGeneration([[0, 0]])).toEqual([]);\n});",
        "Python": "def test_lonely_cell_dies():\n    assert next_generation({(0, 0)}) == set()",
        "Java": "@Test\nvoid lonelyCellDies() {\n    assertEquals(Set.of(), nextGeneration(Set.of(new Cell(0, 0))));\n}",
        "Go": "func TestLonelyCellDies(t *testing.T) {\n\tif got := nextGeneration([]cell{{0, 0}}); len(got) != 0 {\n\t\tt.Errorf(\"got %v, want no cells\", got)\n\t}\n}",
        "Ruby": "class NextGenerationTest < Minitest::Test\n  def test_lonely_cell_dies\n    assert_empty next_generation(Set[[0, 0]])\n  end\nend",
        "Rust": "#[test]\nfn lonely_cell_dies() {\n    assert!(next_generation(&HashSet::from([(0, 0)])).is_empty());\n}",
        "C#": "[Fact]\npublic void LonelyCellDies()\n{\n    Assert.Empty(NextGeneration(new HashSet<(int, int)> { (0, 0) }));\n}",
        "Kotlin": "@Test\nfun lonelyCellDies() {\n    assertTrue(nextGeneration(setOf(0 to 0)).isEmpty())\n}",
        "Swift": "func testLonelyCellDies() {\n    XCTAssertEqual(nextGeneration([Cell(x: 0, y: 0)]), [])\n}"
      }
    }
  },
  {
    "title": "テキスト表の桁揃え",
    "body": "## 背景\n\nコマンドラインの出力やプレーンテキストの報告書では、表の列をそろえる処理がよく要ります。列幅の計算・寄せ・全角文字の幅など、細かい決めごとをテストで 1 つずつ固めていくお題です。\n\n行の配列（各行は文字列の配列）と列ごとの寄せ方を受け取り、列をそろえた表の文字列を返す `{{slot:name}}(rows, align)` を実装します。1 行目は見出しです。\n\n## ルール\n\n- 列幅は、その列の最も長いセルの表示幅\n- 列は `|` で区切り、セルの左右に空白を 1 つずつ置く\n- 見出しの下に `|-----|` の形の区切り線を引く（`-` の数は列幅 + 2）\n- 寄せ方は列ごとに `\"left\"`・`\"right\"`・`\"center\"`。中央寄せで余りが奇数なら右側を 1 つ多くする\n- 行によってセルの数が足りなければ、空のセルで補う\n- 全角文字（日本語など）は表示幅 2 として数える\n\n## 例\n\n```\n{{slot:code1}}\n```\n\n## 考慮すること\n\n「表示幅」の数え方は 1 つの関数に閉じ込めて、別にテストしてください。全角の判定を厳密にやると深い沼なので、どの範囲を全角とするかを決めて、そこだけテストします。セルの中の改行や `|` は今回は扱わなくてよいです。\n\n満たすこと:\n- 列幅が最長のセルに合う\n- 左・右・中央寄せが正しい\n- 区切り線の長さが列幅に合う\n- セルの不足を空で補う\n- 全角文字を幅 2 として揃う\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 列幅の計算・1 セルの寄せ・1 行の組み立てを別の関数にして、下から順にテストする\n- 中央寄せは「左の余白 = 余り ÷ 2 の切り捨て」で決まる",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "name": {
        "TypeScript": "renderTable",
        "JavaScript": "renderTable",
        "Python": "render_table",
        "Java": "renderTable",
        "Go": "renderTable",
        "Ruby": "render_table",
        "Rust": "render_table",
        "C#": "RenderTable",
        "Kotlin": "renderTable",
        "Swift": "renderTable"
      },
      "code1": {
        "TypeScript": "renderTable([['name', 'qty'], ['apple', '3'], ['fig', '12']], ['left', 'right'])\n\n| name  | qty |\n|-------|-----|\n| apple |   3 |\n| fig   |  12 |",
        "JavaScript": "renderTable([['name', 'qty'], ['apple', '3'], ['fig', '12']], ['left', 'right'])\n\n| name  | qty |\n|-------|-----|\n| apple |   3 |\n| fig   |  12 |",
        "Python": "render_table([[\"name\", \"qty\"], [\"apple\", \"3\"], [\"fig\", \"12\"]], [\"left\", \"right\"])\n\n| name  | qty |\n|-------|-----|\n| apple |   3 |\n| fig   |  12 |",
        "Java": "renderTable(\n    List.of(List.of(\"name\", \"qty\"), List.of(\"apple\", \"3\"), List.of(\"fig\", \"12\")),\n    List.of(\"left\", \"right\"))\n\n| name  | qty |\n|-------|-----|\n| apple |   3 |\n| fig   |  12 |",
        "Go": "renderTable([][]string{{\"name\", \"qty\"}, {\"apple\", \"3\"}, {\"fig\", \"12\"}}, []string{\"left\", \"right\"})\n\n| name  | qty |\n|-------|-----|\n| apple |   3 |\n| fig   |  12 |",
        "Ruby": "render_table([%w[name qty], %w[apple 3], %w[fig 12]], %w[left right])\n\n| name  | qty |\n|-------|-----|\n| apple |   3 |\n| fig   |  12 |",
        "Rust": "render_table(&[vec![\"name\", \"qty\"], vec![\"apple\", \"3\"], vec![\"fig\", \"12\"]], &[\"left\", \"right\"])\n\n| name  | qty |\n|-------|-----|\n| apple |   3 |\n| fig   |  12 |",
        "C#": "RenderTable([[\"name\", \"qty\"], [\"apple\", \"3\"], [\"fig\", \"12\"]], [\"left\", \"right\"])\n\n| name  | qty |\n|-------|-----|\n| apple |   3 |\n| fig   |  12 |",
        "Kotlin": "renderTable(\n    listOf(listOf(\"name\", \"qty\"), listOf(\"apple\", \"3\"), listOf(\"fig\", \"12\")),\n    listOf(\"left\", \"right\"))\n\n| name  | qty |\n|-------|-----|\n| apple |   3 |\n| fig   |  12 |",
        "Swift": "renderTable([[\"name\", \"qty\"], [\"apple\", \"3\"], [\"fig\", \"12\"]], [\"left\", \"right\"])\n\n| name  | qty |\n|-------|-----|\n| apple |   3 |\n| fig   |  12 |"
      },
      "firstTest": {
        "TypeScript": "test('1 列 1 行の見出しだけの表', () => {\n  const rows: string[][] = [['a']];\n  expect(renderTable(rows, ['left'])).toBe('| a |\\n|---|');\n});",
        "JavaScript": "test('1 列 1 行の見出しだけの表', () => {\n  expect(renderTable([['a']], ['left'])).toBe('| a |\\n|---|');\n});",
        "Python": "def test_header_only_table():\n    assert render_table([[\"a\"]], [\"left\"]) == \"| a |\\n|---|\"",
        "Java": "@Test\nvoid headerOnlyTable() {\n    assertEquals(\"| a |\\n|---|\", renderTable(List.of(List.of(\"a\")), List.of(\"left\")));\n}",
        "Go": "func TestHeaderOnlyTable(t *testing.T) {\n\tgot := renderTable([][]string{{\"a\"}}, []string{\"left\"})\n\tif want := \"| a |\\n|---|\"; got != want {\n\t\tt.Errorf(\"renderTable = %q, want %q\", got, want)\n\t}\n}",
        "Ruby": "class RenderTableTest < Minitest::Test\n  def test_header_only_table\n    assert_equal \"| a |\\n|---|\", render_table([[\"a\"]], [\"left\"])\n  end\nend",
        "Rust": "#[test]\nfn header_only_table() {\n    assert_eq!(render_table(&[vec![\"a\"]], &[\"left\"]), \"| a |\\n|---|\");\n}",
        "C#": "[Fact]\npublic void HeaderOnlyTable()\n{\n    Assert.Equal(\"| a |\\n|---|\", RenderTable([[\"a\"]], [\"left\"]));\n}",
        "Kotlin": "@Test\nfun headerOnlyTable() {\n    assertEquals(\"| a |\\n|---|\", renderTable(listOf(listOf(\"a\")), listOf(\"left\")))\n}",
        "Swift": "func testHeaderOnlyTable() {\n    XCTAssertEqual(renderTable([[\"a\"]], [\"left\"]), \"| a |\\n|---|\")\n}"
      }
    }
  },
  {
    "title": "自動販売機の状態機械",
    "body": "## 背景\n\nお金・在庫・選択という 3 つの関心が絡む状態機械です。不正な操作の順番や、おつりが出せない場合など、現実の機械が出会う例外をテストで追いかけます。\n\n硬貨を受け付けて商品を売る自動販売機 `VendingMachine` を実装します。\n\n## 振る舞い\n\n- {{slot:ctor}}: 商品（名前・値段・在庫数）と、つり銭用の硬貨（額面ごとの枚数）で初期化する\n- `{{slot:insert}}(coin)`: 硬貨を入れる。受け付けるのは 10・50・100・500 円だけで、それ以外は返却口へ出す\n- `{{slot:select}}(name)`: 商品を選ぶ。投入額が足り、在庫があり、おつりが出せれば商品とおつりを出す\n- `{{slot:cancel}}()`: 投入した額を返す\n- `{{slot:display}}()`: 今の表示（`\"INSERT COIN\"`・投入額・`\"SOLD OUT\"`・`\"EXACT CHANGE ONLY\"` など）\n\n## ルール\n\n- 投入額が足りないときに選ぶと、値段を表示して待つ\n- 在庫切れの商品を選ぶと `\"SOLD OUT\"` を表示し、投入額はそのまま保つ\n- おつりが手持ちの硬貨で作れないときは売らない。投入額はそのまま保つ\n- 売れたら、入れた硬貨はつり銭用の硬貨に加わる\n\n## 考慮すること\n\n「表示」はその時点の状態だけで決まるのか、直前の出来事にも依るのか（`\"THANK YOU\"` を 1 回だけ出す等）を決めてください。おつりの計算は硬貨の枚数に上限があるので、貪欲法で作れないが別の組み合わせなら作れる場合があるかも考えます。\n\n満たすこと:\n- 受け付けない硬貨は返却される\n- 投入額が足りれば商品とおつりが出る\n- 在庫切れ・おつり不足のときは売らずに投入額を保つ\n- {{slot:cancel}} で投入額が戻る\n- 売れた分の硬貨がつり銭に加わる\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 操作の戻り値（出てきた商品・硬貨）と状態の変化を分けてテストする\n- おつりの組み立ては独立した関数にして、硬貨の枚数の上限つきでテストする",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "ctor": {
        "TypeScript": "`new VendingMachine({ products, coins })`",
        "JavaScript": "`new VendingMachine({ products, coins })`",
        "Python": "`VendingMachine(products, coins)`",
        "Java": "`new VendingMachine(products, coins)`",
        "Go": "`newVendingMachine(products, coins)`",
        "Ruby": "`VendingMachine.new(products:, coins:)`",
        "Rust": "`VendingMachine::new(products, coins)`",
        "C#": "`new VendingMachine(products, coins)`",
        "Kotlin": "`VendingMachine(products, coins)`",
        "Swift": "`VendingMachine(products:coins:)`"
      },
      "insert": {
        "TypeScript": "insert",
        "JavaScript": "insert",
        "Python": "insert",
        "Java": "insert",
        "Go": "insert",
        "Ruby": "insert",
        "Rust": "insert",
        "C#": "Insert",
        "Kotlin": "insert",
        "Swift": "insert"
      },
      "select": {
        "TypeScript": "select",
        "JavaScript": "select",
        "Python": "select",
        "Java": "select",
        "Go": "selectProduct",
        "Ruby": "select",
        "Rust": "select",
        "C#": "Select",
        "Kotlin": "select",
        "Swift": "select"
      },
      "cancel": {
        "TypeScript": "cancel",
        "JavaScript": "cancel",
        "Python": "cancel",
        "Java": "cancel",
        "Go": "cancel",
        "Ruby": "cancel",
        "Rust": "cancel",
        "C#": "Cancel",
        "Kotlin": "cancel",
        "Swift": "cancel"
      },
      "display": {
        "TypeScript": "display",
        "JavaScript": "display",
        "Python": "display",
        "Java": "display",
        "Go": "display",
        "Ruby": "display",
        "Rust": "display",
        "C#": "Display",
        "Kotlin": "display",
        "Swift": "display"
      },
      "firstTest": {
        "TypeScript": "test('硬貨を入れる前は INSERT COIN', () => {\n  const vm: VendingMachine = new VendingMachine({ products: [], coins: {} });\n  expect(vm.display()).toBe('INSERT COIN');\n});",
        "JavaScript": "test('硬貨を入れる前は INSERT COIN', () => {\n  const vm = new VendingMachine({ products: [], coins: {} });\n  expect(vm.display()).toBe('INSERT COIN');\n});",
        "Python": "def test_shows_insert_coin_before_any_coin():\n    vm = VendingMachine(products=[], coins={})\n    assert vm.display() == \"INSERT COIN\"",
        "Java": "@Test\nvoid showsInsertCoinBeforeAnyCoin() {\n    var vm = new VendingMachine(List.of(), Map.of());\n    assertEquals(\"INSERT COIN\", vm.display());\n}",
        "Go": "func TestShowsInsertCoinBeforeAnyCoin(t *testing.T) {\n\tvm := newVendingMachine([]product{}, map[int]int{})\n\tif got := vm.display(); got != \"INSERT COIN\" {\n\t\tt.Errorf(\"display() = %q, want %q\", got, \"INSERT COIN\")\n\t}\n}",
        "Ruby": "class VendingMachineTest < Minitest::Test\n  def test_shows_insert_coin_before_any_coin\n    vm = VendingMachine.new(products: [], coins: {})\n    assert_equal \"INSERT COIN\", vm.display\n  end\nend",
        "Rust": "#[test]\nfn shows_insert_coin_before_any_coin() {\n    let mut vm = VendingMachine::new(vec![], HashMap::new());\n    assert_eq!(vm.display(), \"INSERT COIN\");\n}",
        "C#": "[Fact]\npublic void ShowsInsertCoinBeforeAnyCoin()\n{\n    var vm = new VendingMachine(products: [], coins: new());\n    Assert.Equal(\"INSERT COIN\", vm.Display());\n}",
        "Kotlin": "@Test\nfun showsInsertCoinBeforeAnyCoin() {\n    val vm = VendingMachine(products = emptyList(), coins = emptyMap())\n    assertEquals(\"INSERT COIN\", vm.display())\n}",
        "Swift": "func testShowsInsertCoinBeforeAnyCoin() {\n    let vm = VendingMachine(products: [], coins: [:])\n    XCTAssertEqual(vm.display(), \"INSERT COIN\")\n}"
      }
    }
  },
  {
    "title": "割り勘の端数配分",
    "body": "## 背景\n\nお金を割るときは、合計がもとの額と一致することが何より大事です。浮動小数を使わず、整数の最小単位で端数を配る「按分」をテストで固めるお題です。\n\n合計金額 `total`（円の整数）と比率の配列 `ratios` を受け取り、比率に応じて分けた金額の配列を返す `{{slot:name}}(total, ratios)` を実装します。\n\n## ルール\n\n- 結果の合計は必ず `total` に一致する\n- 各人の額は、比率どおりの額を切り捨てたものに、端数を 1 円ずつ配って作る\n- 端数は、切り捨てで失われた分（小数部）が大きい人から順に配る。同じなら配列の前の人を先にする\n- 比率は 0 以上の整数。比率 0 の人は 0 円\n- 比率がすべて 0、または配列が空ならエラー\n- `total` が負の値（返金）でも、合計が一致するように配る\n\n## 例\n\n- `{{slot:name}}(100, [1, 1, 1])` → `[34, 33, 33]`\n- `{{slot:name}}(10, [1, 2])` → `[3, 7]`\n- `{{slot:name}}(5, [3, 7])` → `[2, 3]`（1.5 と 3.5 を切り捨てて 1 と 3。端数の 1 円は、小数部が同じなので前の人へ）\n- `{{slot:name}}(1000, [0, 1])` → `[0, 1000]`\n\n## 考慮すること\n\n3 つ目の例のように小数部が同じになる場合も、ルールから結果が一意に決まることをテストで確かめてください。負の額で「切り捨て」が何を意味するか（0 に向かうのか、負の無限大に向かうのか）も決めごとです。\n\n満たすこと:\n- 結果の合計が常に total と一致する\n- 端数の配り方がルールどおり\n- 比率 0 の人は 0 円\n- 不正な比率はエラー\n- 負の total でも合計が一致する\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 小数を使わず、total * ratio を比率の合計で割った商と余りで考える\n- 「合計が一致する」はどの入力でも成り立つ性質なので、たくさんの入力で確かめるテストも書ける",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "name": {
        "TypeScript": "allocate",
        "JavaScript": "allocate",
        "Python": "allocate",
        "Java": "allocate",
        "Go": "allocate",
        "Ruby": "allocate",
        "Rust": "allocate",
        "C#": "Allocate",
        "Kotlin": "allocate",
        "Swift": "allocate"
      },
      "firstTest": {
        "TypeScript": "test('100 円を 3 人で割ると先頭が 1 円多い', () => {\n  const shares: number[] = allocate(100, [1, 1, 1]);\n  expect(shares).toEqual([34, 33, 33]);\n});",
        "JavaScript": "test('100 円を 3 人で割ると先頭が 1 円多い', () => {\n  expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);\n});",
        "Python": "def test_first_gets_the_extra_yen():\n    assert allocate(100, [1, 1, 1]) == [34, 33, 33]",
        "Java": "@Test\nvoid firstGetsTheExtraYen() {\n    assertArrayEquals(new long[] {34, 33, 33}, allocate(100, new int[] {1, 1, 1}));\n}",
        "Go": "func TestFirstGetsTheExtraYen(t *testing.T) {\n\tgot, err := allocate(100, []int{1, 1, 1})\n\tif want := []int{34, 33, 33}; err != nil || !reflect.DeepEqual(got, want) {\n\t\tt.Errorf(\"allocate = %v, %v; want %v\", got, err, want)\n\t}\n}",
        "Ruby": "class AllocateTest < Minitest::Test\n  def test_first_gets_the_extra_yen\n    assert_equal [34, 33, 33], allocate(100, [1, 1, 1])\n  end\nend",
        "Rust": "#[test]\nfn first_gets_the_extra_yen() {\n    assert_eq!(allocate(100, &[1, 1, 1]), Ok(vec![34, 33, 33]));\n}",
        "C#": "[Fact]\npublic void FirstGetsTheExtraYen()\n{\n    Assert.Equal(new long[] { 34, 33, 33 }, Allocate(100, [1, 1, 1]));\n}",
        "Kotlin": "@Test\nfun firstGetsTheExtraYen() {\n    assertEquals(listOf(34L, 33L, 33L), allocate(100, listOf(1, 1, 1)))\n}",
        "Swift": "func testFirstGetsTheExtraYen() {\n    XCTAssertEqual(try allocate(100, [1, 1, 1]), [34, 33, 33])\n}"
      }
    }
  },
  {
    "title": "多通貨の合計（Money）",
    "body": "## 背景\n\n『テスト駆動開発』の第 1 部で扱われる、多通貨の金額計算を題材にしたお題です。値オブジェクト・式の組み立て・為替の換算を、小さなテストで段階的に育てます。\n\n通貨つきの金額 `Money` と、為替レートを知る `Bank` を実装します。\n\n## 振る舞い\n\n- {{slot:of}}: 金額（整数の最小単位）と通貨（`\"USD\"`・`\"JPY\"` など）を持つ値\n- `{{slot:times}}(n)`: 金額を n 倍した新しい `Money`\n- `{{slot:plus}}(other)`: 合計を表す値。通貨が違っても足せる（換算は後で行う）\n- {{slot:equals}}: 金額と通貨が同じなら等しい\n- `bank.{{slot:addRate}}(from, to, rate)`: レートを登録する\n- `bank.{{slot:reduce}}(expr, to)`: 式を通貨 `to` の `Money` に換算する\n\n## ルール\n\n- `Money` は不変（操作は新しい値を返す）\n- 同じ通貨への換算のレートは 1\n- 登録されていないレートで換算しようとしたらエラー\n- 換算で端数が出たら、決めた方法で丸める（例: 四捨五入）\n\n## 例\n\n```\n{{slot:code1}}\n```\n\n## 考慮すること\n\n`{{slot:plus}}` の戻り値を「合計の式」にしておくと、換算のタイミングを `{{slot:reduce}}` まで遅らせられます。式の中に式が入る（`a.{{slot:plus}}(b).{{slot:plus}}(c)`）ときや、式を `{{slot:times}}` するときにどうなるかもテストしてください。\n\n満たすこと:\n- 同じ金額・同じ通貨の Money は等しい\n- {{slot:times}} と {{slot:plus}} が新しい値を返す\n- 異なる通貨を足して換算できる\n- 未登録のレートはエラー\n- 入れ子の式も換算できる\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- Money と「合計」を、同じ「換算できる式」のインタフェースで扱う\n- まず同じ通貨だけで {{slot:plus}} と {{slot:reduce}} を通し、それから換算を足す",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "of": {
        "TypeScript": "`Money.of(amount, currency)`",
        "JavaScript": "`Money.of(amount, currency)`",
        "Python": "`Money(amount, currency)`",
        "Java": "`Money.of(amount, currency)`",
        "Go": "`moneyOf(amount, currency)`",
        "Ruby": "`Money.new(amount, currency)`",
        "Rust": "`Money::of(amount, currency)`",
        "C#": "`Money.Of(amount, currency)`",
        "Kotlin": "`Money(amount, currency)`",
        "Swift": "`Money(amount:currency:)`"
      },
      "times": {
        "TypeScript": "times",
        "JavaScript": "times",
        "Python": "times",
        "Java": "times",
        "Go": "times",
        "Ruby": "times",
        "Rust": "times",
        "C#": "Times",
        "Kotlin": "times",
        "Swift": "times"
      },
      "plus": {
        "TypeScript": "plus",
        "JavaScript": "plus",
        "Python": "plus",
        "Java": "plus",
        "Go": "plus",
        "Ruby": "plus",
        "Rust": "plus",
        "C#": "Plus",
        "Kotlin": "plus",
        "Swift": "plus"
      },
      "equals": {
        "TypeScript": "`equals(other)`",
        "JavaScript": "`equals(other)`",
        "Python": "`==`（`__eq__`）",
        "Java": "`equals(other)`",
        "Go": "`==`（値の比較）",
        "Ruby": "`==`",
        "Rust": "`==`（`PartialEq`）",
        "C#": "`Equals(other)`",
        "Kotlin": "`==`（`equals`）",
        "Swift": "`==`（`Equatable`）"
      },
      "addRate": {
        "TypeScript": "addRate",
        "JavaScript": "addRate",
        "Python": "add_rate",
        "Java": "addRate",
        "Go": "addRate",
        "Ruby": "add_rate",
        "Rust": "add_rate",
        "C#": "AddRate",
        "Kotlin": "addRate",
        "Swift": "addRate"
      },
      "reduce": {
        "TypeScript": "reduce",
        "JavaScript": "reduce",
        "Python": "reduce",
        "Java": "reduce",
        "Go": "reduce",
        "Ruby": "reduce",
        "Rust": "reduce",
        "C#": "Reduce",
        "Kotlin": "reduce",
        "Swift": "reduce"
      },
      "code1": {
        "TypeScript": "const bank = new Bank();\nbank.addRate('USD', 'JPY', 150);\nconst sum = Money.of(5, 'USD').plus(Money.of(300, 'JPY'));\nbank.reduce(sum, 'JPY');  // 1050 JPY",
        "JavaScript": "const bank = new Bank();\nbank.addRate('USD', 'JPY', 150);\nconst sum = Money.of(5, 'USD').plus(Money.of(300, 'JPY'));\nbank.reduce(sum, 'JPY');  // 1050 JPY",
        "Python": "bank = Bank()\nbank.add_rate(\"USD\", \"JPY\", 150)\ntotal = Money(5, \"USD\").plus(Money(300, \"JPY\"))\nbank.reduce(total, \"JPY\")  # Money(1050, \"JPY\")",
        "Java": "var bank = new Bank();\nbank.addRate(\"USD\", \"JPY\", 150);\nExpression sum = Money.of(5, \"USD\").plus(Money.of(300, \"JPY\"));\nbank.reduce(sum, \"JPY\");  // 1050 JPY",
        "Go": "b := newBank()\nb.addRate(\"USD\", \"JPY\", 150)\nsum := moneyOf(5, \"USD\").plus(moneyOf(300, \"JPY\"))\nb.reduce(sum, \"JPY\") // 1050 JPY",
        "Ruby": "bank = Bank.new\nbank.add_rate(\"USD\", \"JPY\", 150)\nsum = Money.new(5, \"USD\").plus(Money.new(300, \"JPY\"))\nbank.reduce(sum, \"JPY\")  # => 1050 JPY",
        "Rust": "let mut bank = Bank::new();\nbank.add_rate(\"USD\", \"JPY\", 150.0);\nlet sum = Money::of(5, \"USD\").plus(Money::of(300, \"JPY\"));\nbank.reduce(&sum, \"JPY\"); // Ok(1050 JPY)",
        "C#": "var bank = new Bank();\nbank.AddRate(\"USD\", \"JPY\", 150);\nvar sum = Money.Of(5, \"USD\").Plus(Money.Of(300, \"JPY\"));\nbank.Reduce(sum, \"JPY\");  // 1050 JPY",
        "Kotlin": "val bank = Bank()\nbank.addRate(\"USD\", \"JPY\", 150.0)\nval sum = Money(5, \"USD\").plus(Money(300, \"JPY\"))\nbank.reduce(sum, \"JPY\")  // 1050 JPY",
        "Swift": "let bank = Bank()\nbank.addRate(from: \"USD\", to: \"JPY\", rate: 150)\nlet sum = Money(amount: 5, currency: \"USD\").plus(Money(amount: 300, currency: \"JPY\"))\nbank.reduce(sum, to: \"JPY\")  // 1050 JPY"
      },
      "firstTest": {
        "TypeScript": "test('5 ドルの 2 倍は 10 ドル', () => {\n  const ten: Money = Money.of(5, 'USD').times(2);\n  expect(ten.equals(Money.of(10, 'USD'))).toBe(true);\n});",
        "JavaScript": "test('5 ドルの 2 倍は 10 ドル', () => {\n  expect(Money.of(5, 'USD').times(2).equals(Money.of(10, 'USD'))).toBe(true);\n});",
        "Python": "def test_five_dollars_times_two_is_ten_dollars():\n    assert Money(5, \"USD\").times(2) == Money(10, \"USD\")",
        "Java": "@Test\nvoid fiveDollarsTimesTwoIsTenDollars() {\n    assertEquals(Money.of(10, \"USD\"), Money.of(5, \"USD\").times(2));\n}",
        "Go": "func TestFiveDollarsTimesTwo(t *testing.T) {\n\tif got, want := moneyOf(5, \"USD\").times(2), moneyOf(10, \"USD\"); got != want {\n\t\tt.Errorf(\"times(2) = %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class MoneyTest < Minitest::Test\n  def test_five_dollars_times_two_is_ten_dollars\n    assert_equal Money.new(10, \"USD\"), Money.new(5, \"USD\").times(2)\n  end\nend",
        "Rust": "#[test]\nfn five_dollars_times_two_is_ten_dollars() {\n    assert_eq!(Money::of(5, \"USD\").times(2), Money::of(10, \"USD\"));\n}",
        "C#": "[Fact]\npublic void FiveDollarsTimesTwoIsTenDollars()\n{\n    Assert.Equal(Money.Of(10, \"USD\"), Money.Of(5, \"USD\").Times(2));\n}",
        "Kotlin": "@Test\nfun fiveDollarsTimesTwoIsTenDollars() {\n    assertEquals(Money(10, \"USD\"), Money(5, \"USD\").times(2))\n}",
        "Swift": "func testFiveDollarsTimesTwoIsTenDollars() {\n    XCTAssertEqual(Money(amount: 5, currency: \"USD\").times(2), Money(amount: 10, currency: \"USD\"))\n}"
      }
    }
  },
  {
    "title": "迷路の最短経路",
    "body": "## 背景\n\n格子のグラフを幅優先探索（BFS）で解く、探索アルゴリズムの基本のお題です。入力の解析・探索・経路の復元を分けてテストする練習にもなります。\n\n文字列で表した迷路を受け取り、スタートからゴールまでの最短の歩数を返す `{{slot:name}}(maze)` を実装します。\n\n## ルール\n\n- 迷路は改行区切りの行の文字列。`#` は壁、`.` は通路、`S` はスタート、`G` はゴール\n- 移動は上下左右の 1 マスずつ（斜めは不可）\n- ゴールに着けなければ `-1` を返す\n- `S` か `G` が無い、または複数あるときはエラー\n- 行の長さがそろっていなければエラー\n\n## 例\n\n```\nS.#\n..#\n#.G\n```\n\n- 上の迷路 → `4`\n- `\"SG\"` → `1`\n- `\"S#G\"` → `-1`\n\n## 拡張（時間があれば）\n\n歩数だけでなく、経路を `\"R\"`・`\"D\"` などの向きの文字列で返す `{{slot:pathOf}}(maze)` を足します。最短経路が複数あるときにどれを返すかも決めてテストしてください。\n\n満たすこと:\n- 最短の歩数を返す\n- 着けないときは -1\n- 斜めには進まない\n- 不正な迷路はエラー\n- 大きな迷路（50×50 程度）でもすぐ終わる\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- キューと「訪れた印」で探索し、同じマスを 2 度入れない\n- 解析（文字列 → 格子）と探索を分けると、テストが小さくなる",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "name": {
        "TypeScript": "shortestPath",
        "JavaScript": "shortestPath",
        "Python": "shortest_path",
        "Java": "shortestPath",
        "Go": "shortestPath",
        "Ruby": "shortest_path",
        "Rust": "shortest_path",
        "C#": "ShortestPath",
        "Kotlin": "shortestPath",
        "Swift": "shortestPath"
      },
      "pathOf": {
        "TypeScript": "pathOf",
        "JavaScript": "pathOf",
        "Python": "path_of",
        "Java": "pathOf",
        "Go": "pathOf",
        "Ruby": "path_of",
        "Rust": "path_of",
        "C#": "PathOf",
        "Kotlin": "pathOf",
        "Swift": "pathOf"
      },
      "firstTest": {
        "TypeScript": "test('隣り合う S と G は 1 歩', () => {\n  const steps: number = shortestPath('SG');\n  expect(steps).toBe(1);\n});",
        "JavaScript": "test('隣り合う S と G は 1 歩', () => {\n  expect(shortestPath('SG')).toBe(1);\n});",
        "Python": "def test_adjacent_start_and_goal_is_one_step():\n    assert shortest_path(\"SG\") == 1",
        "Java": "@Test\nvoid adjacentStartAndGoalIsOneStep() {\n    assertEquals(1, shortestPath(\"SG\"));\n}",
        "Go": "func TestAdjacentStartAndGoal(t *testing.T) {\n\tgot, err := shortestPath(\"SG\")\n\tif err != nil || got != 1 {\n\t\tt.Errorf(\"shortestPath = %d, %v; want 1\", got, err)\n\t}\n}",
        "Ruby": "class ShortestPathTest < Minitest::Test\n  def test_adjacent_start_and_goal_is_one_step\n    assert_equal 1, shortest_path(\"SG\")\n  end\nend",
        "Rust": "#[test]\nfn adjacent_start_and_goal_is_one_step() {\n    assert_eq!(shortest_path(\"SG\"), Ok(1));\n}",
        "C#": "[Fact]\npublic void AdjacentStartAndGoalIsOneStep()\n{\n    Assert.Equal(1, ShortestPath(\"SG\"));\n}",
        "Kotlin": "@Test\nfun adjacentStartAndGoalIsOneStep() {\n    assertEquals(1, shortestPath(\"SG\"))\n}",
        "Swift": "func testAdjacentStartAndGoalIsOneStep() {\n    XCTAssertEqual(try shortestPath(\"SG\"), 1)\n}"
      }
    }
  },
  {
    "title": "エレベーターの運行",
    "body": "## 背景\n\n時間を進めながら状態が変わるシミュレーションです。「1 歩進める」関数を中心に据えると、時間に依存する振る舞いを決定的にテストできます。\n\n1 台のエレベーターの運行を表す `Elevator` を実装します。\n\n## 振る舞い\n\n- {{slot:ctor}}: 階の数と最初の階\n- `{{slot:call}}(floor)`: 呼び出し（乗り場のボタンでも、かごの中のボタンでも同じに扱う）\n- `{{slot:step}}()`: 時間を 1 単位進める。1 単位で 1 階動くか、扉を開けて止まる\n- `{{slot:state}}()`: 今の階・向き（`\"up\"`・`\"down\"`・`\"idle\"`）・扉の開閉\n\n## ルール\n\n- 呼び出しが無ければ止まって待つ（`\"idle\"`）\n- 動いている向きに呼び出しが残っている間は、その向きに進み続ける（途中の階の呼び出しにも止まる）\n- その向きに呼び出しが無くなったら、反対の向きの呼び出しへ向かう\n- 呼び出しのある階に着いたら、その `{{slot:step}}` で扉を開け、次の `{{slot:step}}` で閉める\n- 今いる階の呼び出しは、すぐ扉を開けて応える\n- 存在しない階の呼び出しはエラー\n\n## 例\n\n```\n{{slot:code1}}\n```\n\n## 考慮すること\n\n「上りながら下の階で呼ばれた」「同じ階を 2 回呼んだ」「扉が開いている間に呼ばれた」など、規則の隙間を突くテストを書いて、決めごとを増やしてください。\n\n満たすこと:\n- 呼び出しが無ければ待つ\n- 同じ向きの呼び出しを順に回る\n- 向きを変えるのは、その向きの呼び出しが無くなってから\n- 着いた階で扉を開けて閉める\n- 不正な階はエラー\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 時刻を内部で読まず、{{slot:step}} の回数だけで時間を表す\n- 「次にどちらへ動くか」を決める関数を別にしてテストする",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "ctor": {
        "TypeScript": "`new Elevator({ floors, start })`",
        "JavaScript": "`new Elevator({ floors, start })`",
        "Python": "`Elevator(floors, start)`",
        "Java": "`new Elevator(floors, start)`",
        "Go": "`newElevator(floors, start)`",
        "Ruby": "`Elevator.new(floors:, start:)`",
        "Rust": "`Elevator::new(floors, start)`",
        "C#": "`new Elevator(floors, start)`",
        "Kotlin": "`Elevator(floors, start)`",
        "Swift": "`Elevator(floors:start:)`"
      },
      "call": {
        "TypeScript": "call",
        "JavaScript": "call",
        "Python": "call",
        "Java": "call",
        "Go": "call",
        "Ruby": "call",
        "Rust": "call",
        "C#": "Call",
        "Kotlin": "call",
        "Swift": "call"
      },
      "step": {
        "TypeScript": "step",
        "JavaScript": "step",
        "Python": "step",
        "Java": "step",
        "Go": "step",
        "Ruby": "step",
        "Rust": "step",
        "C#": "Step",
        "Kotlin": "step",
        "Swift": "step"
      },
      "state": {
        "TypeScript": "state",
        "JavaScript": "state",
        "Python": "state",
        "Java": "state",
        "Go": "state",
        "Ruby": "state",
        "Rust": "state",
        "C#": "State",
        "Kotlin": "state",
        "Swift": "state"
      },
      "code1": {
        "TypeScript": "const e = new Elevator({ floors: 10, start: 1 });\ne.call(3);\ne.step(); // 2 階・上り\ne.step(); // 3 階・上り\ne.step(); // 3 階・扉が開く",
        "JavaScript": "const e = new Elevator({ floors: 10, start: 1 });\ne.call(3);\ne.step(); // 2 階・上り\ne.step(); // 3 階・上り\ne.step(); // 3 階・扉が開く",
        "Python": "e = Elevator(floors=10, start=1)\ne.call(3)\ne.step()  # 2 階・上り\ne.step()  # 3 階・上り\ne.step()  # 3 階・扉が開く",
        "Java": "var e = new Elevator(10, 1);\ne.call(3);\ne.step(); // 2 階・上り\ne.step(); // 3 階・上り\ne.step(); // 3 階・扉が開く",
        "Go": "e := newElevator(10, 1)\ne.call(3)\ne.step() // 2 階・上り\ne.step() // 3 階・上り\ne.step() // 3 階・扉が開く",
        "Ruby": "e = Elevator.new(floors: 10, start: 1)\ne.call(3)\ne.step # 2 階・上り\ne.step # 3 階・上り\ne.step # 3 階・扉が開く",
        "Rust": "let mut e = Elevator::new(10, 1);\ne.call(3).unwrap();\ne.step(); // 2 階・上り\ne.step(); // 3 階・上り\ne.step(); // 3 階・扉が開く",
        "C#": "var e = new Elevator(floors: 10, start: 1);\ne.Call(3);\ne.Step(); // 2 階・上り\ne.Step(); // 3 階・上り\ne.Step(); // 3 階・扉が開く",
        "Kotlin": "val e = Elevator(floors = 10, start = 1)\ne.call(3)\ne.step() // 2 階・上り\ne.step() // 3 階・上り\ne.step() // 3 階・扉が開く",
        "Swift": "let e = Elevator(floors: 10, start: 1)\ntry e.call(3)\ne.step() // 2 階・上り\ne.step() // 3 階・上り\ne.step() // 3 階・扉が開く"
      },
      "firstTest": {
        "TypeScript": "test('呼び出しが無ければ動かない', () => {\n  const e: Elevator = new Elevator({ floors: 5, start: 1 });\n  e.step();\n  expect(e.state()).toEqual({ floor: 1, direction: 'idle', doorOpen: false });\n});",
        "JavaScript": "test('呼び出しが無ければ動かない', () => {\n  const e = new Elevator({ floors: 5, start: 1 });\n  e.step();\n  expect(e.state()).toEqual({ floor: 1, direction: 'idle', doorOpen: false });\n});",
        "Python": "def test_stays_idle_without_calls():\n    e = Elevator(floors=5, start=1)\n    e.step()\n    assert e.state() == {\"floor\": 1, \"direction\": \"idle\", \"door_open\": False}",
        "Java": "@Test\nvoid staysIdleWithoutCalls() {\n    var e = new Elevator(5, 1);\n    e.step();\n    assertEquals(new State(1, \"idle\", false), e.state());\n}",
        "Go": "func TestStaysIdleWithoutCalls(t *testing.T) {\n\te := newElevator(5, 1)\n\te.step()\n\twant := state{floor: 1, direction: \"idle\", doorOpen: false}\n\tif got := e.state(); got != want {\n\t\tt.Errorf(\"state() = %+v, want %+v\", got, want)\n\t}\n}",
        "Ruby": "class ElevatorTest < Minitest::Test\n  def test_stays_idle_without_calls\n    e = Elevator.new(floors: 5, start: 1)\n    e.step\n    assert_equal({ floor: 1, direction: \"idle\", door_open: false }, e.state)\n  end\nend",
        "Rust": "#[test]\nfn stays_idle_without_calls() {\n    let mut e = Elevator::new(5, 1);\n    e.step();\n    assert_eq!(e.state(), State { floor: 1, direction: \"idle\", door_open: false });\n}",
        "C#": "[Fact]\npublic void StaysIdleWithoutCalls()\n{\n    var e = new Elevator(floors: 5, start: 1);\n    e.Step();\n    Assert.Equal(new ElevatorState(1, \"idle\", false), e.State());\n}",
        "Kotlin": "@Test\nfun staysIdleWithoutCalls() {\n    val e = Elevator(floors = 5, start = 1)\n    e.step()\n    assertEquals(State(floor = 1, direction = \"idle\", doorOpen = false), e.state())\n}",
        "Swift": "func testStaysIdleWithoutCalls() {\n    let e = Elevator(floors: 5, start: 1)\n    e.step()\n    XCTAssertEqual(e.state(), State(floor: 1, direction: \"idle\", doorOpen: false))\n}"
      }
    }
  },
  {
    "title": "会議室の予約",
    "body": "## 背景\n\n予約システムの心臓部である「時間の重なり」の判定を中心に、ドメインの規則を積み上げるお題です。半開区間の考え方と、境界の時刻のテストが肝になります。\n\n複数の会議室の予約を管理する `Scheduler` を実装します。\n\n## 振る舞い\n\n- {{slot:ctor}}: 会議室の名前と定員の一覧で初期化する\n- {{slot:book}}: 予約する。成功したら予約の識別子を返す\n- `{{slot:cancel}}(id)`: 予約を取り消す\n- {{slot:free}}: その時間に空いていて定員が足りる会議室の名前を、定員の小さい順に返す\n\n## ルール\n\n- 時刻は分単位の整数（例: 9:00 は 540）。予約は `[start, end)` の半開区間\n- 同じ会議室で時間が重なる予約はできない。終わりと始まりが同じ時刻なら重ならない\n- `start >= end`、定員を超える人数、存在しない会議室はエラー\n- 予約は 15 分単位。それ以外の時刻はエラー\n- 取り消した予約の時間は、また予約できる\n\n## 例\n\n```\n{{slot:code1}}\n```\n\n## 考慮すること\n\n重なりの判定（`a.start < b.end && b.start < a.end`）は単独でテストし、境界（ちょうど接する・完全に含む・含まれる）を網羅してください。存在しない識別子の取り消しをどう扱うかも決めます。\n\n満たすこと:\n- 重なる予約を拒む\n- 接するだけの予約は受け付ける\n- 定員と存在しない会議室を検査する\n- 取り消した時間を再び予約できる\n- {{slot:freeName}} が条件に合う会議室を定員の小さい順に返す\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 「2 つの区間が重なるか」を純粋な関数に切り出す\n- 検証の失敗はエラーの種類を分けると、テストで原因を確かめやすい",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "ctor": {
        "TypeScript": "`new Scheduler(rooms)`",
        "JavaScript": "`new Scheduler(rooms)`",
        "Python": "`Scheduler(rooms)`",
        "Java": "`new Scheduler(rooms)`",
        "Go": "`newScheduler(rooms)`",
        "Ruby": "`Scheduler.new(rooms)`",
        "Rust": "`Scheduler::new(rooms)`",
        "C#": "`new Scheduler(rooms)`",
        "Kotlin": "`Scheduler(rooms)`",
        "Swift": "`Scheduler(rooms:)`"
      },
      "book": {
        "TypeScript": "`book({ room, start, end, people })`",
        "JavaScript": "`book({ room, start, end, people })`",
        "Python": "`book(room, start, end, people)`",
        "Java": "`book(new Booking(room, start, end, people))`",
        "Go": "`book(booking{room, start, end, people})`",
        "Ruby": "`book(room:, time: start...end, people:)`",
        "Rust": "`book(Booking { room, start, end, people })`",
        "C#": "`Book(room, start, end, people)`",
        "Kotlin": "`book(room, start, end, people)`",
        "Swift": "`book(room:start:end:people:)`"
      },
      "cancel": {
        "TypeScript": "cancel",
        "JavaScript": "cancel",
        "Python": "cancel",
        "Java": "cancel",
        "Go": "cancel",
        "Ruby": "cancel",
        "Rust": "cancel",
        "C#": "Cancel",
        "Kotlin": "cancel",
        "Swift": "cancel"
      },
      "free": {
        "TypeScript": "`findFree({ start, end, people })`",
        "JavaScript": "`findFree({ start, end, people })`",
        "Python": "`find_free(start, end, people)`",
        "Java": "`findFree(start, end, people)`",
        "Go": "`findFree(start, end, people)`",
        "Ruby": "`find_free(time: start...end, people:)`",
        "Rust": "`find_free(start, end, people)`",
        "C#": "`FindFree(start, end, people)`",
        "Kotlin": "`findFree(start, end, people)`",
        "Swift": "`findFree(start:end:people:)`"
      },
      "freeName": {
        "TypeScript": "findFree",
        "JavaScript": "findFree",
        "Python": "find_free",
        "Java": "findFree",
        "Go": "findFree",
        "Ruby": "find_free",
        "Rust": "find_free",
        "C#": "FindFree",
        "Kotlin": "findFree",
        "Swift": "findFree"
      },
      "code1": {
        "TypeScript": "const s = new Scheduler([{ name: 'A', capacity: 4 }, { name: 'B', capacity: 10 }]);\ns.book({ room: 'A', start: 540, end: 600, people: 3 });\ns.findFree({ start: 570, end: 630, people: 2 });  // ['B']\ns.findFree({ start: 600, end: 660, people: 2 });  // ['A', 'B']",
        "JavaScript": "const s = new Scheduler([{ name: 'A', capacity: 4 }, { name: 'B', capacity: 10 }]);\ns.book({ room: 'A', start: 540, end: 600, people: 3 });\ns.findFree({ start: 570, end: 630, people: 2 });  // ['B']\ns.findFree({ start: 600, end: 660, people: 2 });  // ['A', 'B']",
        "Python": "s = Scheduler([Room(\"A\", 4), Room(\"B\", 10)])\ns.book(room=\"A\", start=540, end=600, people=3)\ns.find_free(start=570, end=630, people=2)  # [\"B\"]\ns.find_free(start=600, end=660, people=2)  # [\"A\", \"B\"]",
        "Java": "var s = new Scheduler(List.of(new Room(\"A\", 4), new Room(\"B\", 10)));\ns.book(new Booking(\"A\", 540, 600, 3));\ns.findFree(570, 630, 2);  // [B]\ns.findFree(600, 660, 2);  // [A, B]",
        "Go": "s := newScheduler([]room{{name: \"A\", capacity: 4}, {name: \"B\", capacity: 10}})\ns.book(booking{room: \"A\", start: 540, end: 600, people: 3})\ns.findFree(570, 630, 2) // [B]\ns.findFree(600, 660, 2) // [A B]",
        "Ruby": "s = Scheduler.new([{ name: \"A\", capacity: 4 }, { name: \"B\", capacity: 10 }])\ns.book(room: \"A\", time: 540...600, people: 3)\ns.find_free(time: 570...630, people: 2)  # => [\"B\"]\ns.find_free(time: 600...660, people: 2)  # => [\"A\", \"B\"]",
        "Rust": "let mut s = Scheduler::new(vec![Room { name: \"A\", capacity: 4 }, Room { name: \"B\", capacity: 10 }]);\ns.book(Booking { room: \"A\", start: 540, end: 600, people: 3 }).unwrap();\ns.find_free(570, 630, 2); // [\"B\"]\ns.find_free(600, 660, 2); // [\"A\", \"B\"]",
        "C#": "var s = new Scheduler([new Room(\"A\", 4), new Room(\"B\", 10)]);\ns.Book(room: \"A\", start: 540, end: 600, people: 3);\ns.FindFree(start: 570, end: 630, people: 2);  // [\"B\"]\ns.FindFree(start: 600, end: 660, people: 2);  // [\"A\", \"B\"]",
        "Kotlin": "val s = Scheduler(listOf(Room(\"A\", 4), Room(\"B\", 10)))\ns.book(room = \"A\", start = 540, end = 600, people = 3)\ns.findFree(start = 570, end = 630, people = 2)  // [B]\ns.findFree(start = 600, end = 660, people = 2)  // [A, B]",
        "Swift": "let s = Scheduler(rooms: [Room(name: \"A\", capacity: 4), Room(name: \"B\", capacity: 10)])\ntry s.book(room: \"A\", start: 540, end: 600, people: 3)\ns.findFree(start: 570, end: 630, people: 2)  // [\"B\"]\ns.findFree(start: 600, end: 660, people: 2)  // [\"A\", \"B\"]"
      },
      "firstTest": {
        "TypeScript": "test('終わりと始まりが同じ時刻なら予約できる', () => {\n  const s: Scheduler = new Scheduler([{ name: 'A', capacity: 4 }]);\n  s.book({ room: 'A', start: 540, end: 600, people: 2 });\n  expect(() => s.book({ room: 'A', start: 600, end: 660, people: 2 })).not.toThrow();\n});",
        "JavaScript": "test('終わりと始まりが同じ時刻なら予約できる', () => {\n  const s = new Scheduler([{ name: 'A', capacity: 4 }]);\n  s.book({ room: 'A', start: 540, end: 600, people: 2 });\n  expect(() => s.book({ room: 'A', start: 600, end: 660, people: 2 })).not.toThrow();\n});",
        "Python": "def test_back_to_back_bookings_are_allowed():\n    s = Scheduler([Room(\"A\", 4)])\n    s.book(room=\"A\", start=540, end=600, people=2)\n    assert s.book(room=\"A\", start=600, end=660, people=2) is not None",
        "Java": "@Test\nvoid backToBackBookingsAreAllowed() {\n    var s = new Scheduler(List.of(new Room(\"A\", 4)));\n    s.book(new Booking(\"A\", 540, 600, 2));\n    assertDoesNotThrow(() -> s.book(new Booking(\"A\", 600, 660, 2)));\n}",
        "Go": "func TestBackToBackBookingsAreAllowed(t *testing.T) {\n\ts := newScheduler([]room{{name: \"A\", capacity: 4}})\n\ts.book(booking{room: \"A\", start: 540, end: 600, people: 2})\n\tif _, err := s.book(booking{room: \"A\", start: 600, end: 660, people: 2}); err != nil {\n\t\tt.Errorf(\"book() error = %v, want nil\", err)\n\t}\n}",
        "Ruby": "class SchedulerTest < Minitest::Test\n  def test_back_to_back_bookings_are_allowed\n    s = Scheduler.new([{ name: \"A\", capacity: 4 }])\n    s.book(room: \"A\", time: 540...600, people: 2)\n    refute_nil s.book(room: \"A\", time: 600...660, people: 2)\n  end\nend",
        "Rust": "#[test]\nfn back_to_back_bookings_are_allowed() {\n    let mut s = Scheduler::new(vec![Room { name: \"A\", capacity: 4 }]);\n    s.book(Booking { room: \"A\", start: 540, end: 600, people: 2 }).unwrap();\n    assert!(s.book(Booking { room: \"A\", start: 600, end: 660, people: 2 }).is_ok());\n}",
        "C#": "[Fact]\npublic void BackToBackBookingsAreAllowed()\n{\n    var s = new Scheduler([new Room(\"A\", 4)]);\n    s.Book(room: \"A\", start: 540, end: 600, people: 2);\n    var error = Record.Exception(() => s.Book(room: \"A\", start: 600, end: 660, people: 2));\n    Assert.Null(error);\n}",
        "Kotlin": "@Test\nfun backToBackBookingsAreAllowed() {\n    val s = Scheduler(listOf(Room(\"A\", 4)))\n    s.book(room = \"A\", start = 540, end = 600, people = 2)\n    assertDoesNotThrow { s.book(room = \"A\", start = 600, end = 660, people = 2) }\n}",
        "Swift": "func testBackToBackBookingsAreAllowed() throws {\n    let s = Scheduler(rooms: [Room(name: \"A\", capacity: 4)])\n    try s.book(room: \"A\", start: 540, end: 600, people: 2)\n    XCTAssertNoThrow(try s.book(room: \"A\", start: 600, end: 660, people: 2))\n}"
      }
    }
  },
  {
    "title": "バージョン番号の比較と範囲",
    "body": "## 背景\n\nパッケージ管理の道具が毎日行っている、セマンティックバージョニングの比較と範囲の判定です。規格の細かな規則を 1 つずつテストに落とし込むお題です。\n\nバージョン文字列を比べる `{{slot:compare}}(a, b)` と、範囲を満たすかを返す `{{slot:satisfies}}(version, range)` を実装します。\n\n## ルール（比較）\n\n- 形は `MAJOR.MINOR.PATCH`、後ろに `-` とプレリリースの識別子（`.` 区切り）が付くことがある（例: `1.0.0-alpha.1`）\n- 数の部分は数値として比べる（`1.10.0` は `1.9.0` より大きい）\n- プレリリースが付いた版は、付かない同じ版より小さい\n- プレリリースの識別子は前から順に比べ、数字だけの識別子は数値、それ以外は文字列で比べる。数字だけの識別子は文字列の識別子より小さい。識別子が多い方が大きい（それ以前が等しいとき）\n- `{{slot:compare}}` は `-1`・`0`・`1` を返す。形が不正ならエラー\n\n## ルール（範囲）\n\n- `>=1.2.0`・`<2.0.0`・`=1.2.3` などの比較を空白で並べると、すべてを満たすこと（AND）\n- `^1.2.3` は `>=1.2.3 <2.0.0`、`~1.2.3` は `>=1.2.3 <1.3.0`\n- `||` で区切ると、どれかを満たすこと（OR）\n\n## 例\n\n- `{{slot:compare}}(\"1.10.0\", \"1.9.0\")` → `1`\n- `{{slot:compare}}(\"1.0.0-alpha\", \"1.0.0\")` → `-1`\n- `{{slot:compare}}(\"1.0.0-alpha.2\", \"1.0.0-alpha.10\")` → `-1`\n- `{{slot:satisfies}}(\"1.4.0\", \"^1.2.3\")` → {{slot:trueValue}}\n- `{{slot:satisfies}}(\"2.0.0\", \"^1.2.3 || >=3.0.0\")` → {{slot:falseValue}}\n\n## 考慮すること\n\n`^0.2.3` のように 0 から始まる版での `^` の意味は規格で特別扱いされます。扱うかどうかを決めて、扱うならテストを足してください。\n\n満たすこと:\n- 数の部分を数値として比べる\n- プレリリースの順序が規則どおり\n- ^ と ~ を比較の組に展開できる\n- AND と OR を組み合わせて判定できる\n- 不正な形はエラー\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 文字列を構造（数の配列とプレリリースの配列）へ解析してから比べる\n- 範囲は「OR の配列」の中に「AND の配列」を持つ形に解析する",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "compare": {
        "TypeScript": "compare",
        "JavaScript": "compare",
        "Python": "compare",
        "Java": "compare",
        "Go": "compare",
        "Ruby": "compare",
        "Rust": "compare",
        "C#": "Compare",
        "Kotlin": "compare",
        "Swift": "compare"
      },
      "satisfies": {
        "TypeScript": "satisfies",
        "JavaScript": "satisfies",
        "Python": "satisfies",
        "Java": "satisfies",
        "Go": "satisfies",
        "Ruby": "satisfies",
        "Rust": "satisfies",
        "C#": "Satisfies",
        "Kotlin": "satisfies",
        "Swift": "satisfies"
      },
      "firstTest": {
        "TypeScript": "test('1.10.0 は 1.9.0 より新しい', () => {\n  const order: -1 | 0 | 1 = compare('1.10.0', '1.9.0');\n  expect(order).toBe(1);\n});",
        "JavaScript": "test('1.10.0 は 1.9.0 より新しい', () => {\n  expect(compare('1.10.0', '1.9.0')).toBe(1);\n});",
        "Python": "def test_compares_numbers_numerically():\n    assert compare(\"1.10.0\", \"1.9.0\") == 1",
        "Java": "@Test\nvoid comparesNumbersNumerically() {\n    assertEquals(1, compare(\"1.10.0\", \"1.9.0\"));\n}",
        "Go": "func TestComparesNumbersNumerically(t *testing.T) {\n\tgot, err := compare(\"1.10.0\", \"1.9.0\")\n\tif err != nil || got != 1 {\n\t\tt.Errorf(\"compare = %d, %v; want 1\", got, err)\n\t}\n}",
        "Ruby": "class CompareTest < Minitest::Test\n  def test_compares_numbers_numerically\n    assert_equal 1, compare(\"1.10.0\", \"1.9.0\")\n  end\nend",
        "Rust": "#[test]\nfn compares_numbers_numerically() {\n    assert_eq!(compare(\"1.10.0\", \"1.9.0\"), Ok(1));\n}",
        "C#": "[Fact]\npublic void ComparesNumbersNumerically()\n{\n    Assert.Equal(1, Compare(\"1.10.0\", \"1.9.0\"));\n}",
        "Kotlin": "@Test\nfun comparesNumbersNumerically() {\n    assertEquals(1, compare(\"1.10.0\", \"1.9.0\"))\n}",
        "Swift": "func testComparesNumbersNumerically() {\n    XCTAssertEqual(try compare(\"1.10.0\", \"1.9.0\"), 1)\n}"
      },
      "trueValue": {
        "TypeScript": "`true`",
        "JavaScript": "`true`",
        "Python": "`True`",
        "Java": "`true`",
        "Go": "`true`",
        "Ruby": "`true`",
        "Rust": "`true`",
        "C#": "`true`",
        "Kotlin": "`true`",
        "Swift": "`true`"
      },
      "falseValue": {
        "TypeScript": "`false`",
        "JavaScript": "`false`",
        "Python": "`False`",
        "Java": "`false`",
        "Go": "`false`",
        "Ruby": "`false`",
        "Rust": "`false`",
        "C#": "`false`",
        "Kotlin": "`false`",
        "Swift": "`false`"
      }
    }
  },
  {
    "title": "定期実行の次の時刻",
    "body": "## 背景\n\ncron 式は 5 つの欄で「いつ動かすか」を表します。式の解析と、「次に当てはまる時刻」を探す計算を分けて TDD するお題です。日付の繰り上がりや月末が考えどころです。\n\ncron 式 `expr` と基準の時刻 `{{slot:from}}` を受け取り、`{{slot:from}}` より後で式に当てはまる最初の時刻を返す `{{slot:name}}(expr, {{slot:from}})` を実装します。\n\n## ルール\n\n- 欄は「分 時 日 月 曜日」の順（分 0-59・時 0-23・日 1-31・月 1-12・曜日 0-6 で 0 が日曜）\n- 各欄に書けるのは `*`・数・`a-b`（範囲）・`*/n`・`a-b/n`（間隔）・それらのカンマ区切り\n- 時刻は分単位で、タイムゾーンは考えない（年・月・日・時・分の値として扱う）\n- 秒は扱わない。`{{slot:from}}` ちょうどは含めず、その次の分から探す\n- 日と曜日の両方が `*` 以外のときは、どちらかに当てはまれば実行する\n- 不正な式（欄の数が違う・範囲外の数）はエラー\n\n## 例\n\n- `{{slot:name}}(\"*/15 * * * *\", 2026-11-18 10:07)` → 2026-11-18 10:15\n- `{{slot:name}}(\"0 9 * * 1-5\", 2026-11-20 09:00)`（金曜）→ 2026-11-23 09:00（月曜）\n- `{{slot:name}}(\"0 0 31 * *\", 2026-11-01 00:00)` → 2026-12-31 00:00（11 月に 31 日は無い）\n- `{{slot:name}}(\"30 2 29 2 *\", 2026-01-01 00:00)` → 2028-02-29 02:30\n\n## 考慮すること\n\n1 分ずつ進めて調べる素朴な方法でも正しく動きますが、`29 2` のような式では時間がかかります。まず素朴に通してから、当てはまらない月・日・時を丸ごと飛ばす形へテストを保ったまま改善してください。\n\n満たすこと:\n- 5 つの欄の書き方をすべて解析できる\n- 月末・年末・うるう年をまたいでも正しい\n- 日と曜日の OR の規則に従う\n- {{slot:from}} ちょうどを含めない\n- 不正な式はエラー\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 各欄を「当てはまる値の集合」へ解析すると、照合は集合の判定だけになる\n- 解析と探索を別の関数にして、それぞれテストする",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "name": {
        "TypeScript": "nextRun",
        "JavaScript": "nextRun",
        "Python": "next_run",
        "Java": "nextRun",
        "Go": "nextRun",
        "Ruby": "next_run",
        "Rust": "next_run",
        "C#": "NextRun",
        "Kotlin": "nextRun",
        "Swift": "nextRun"
      },
      "from": {
        "TypeScript": "from",
        "JavaScript": "from",
        "Python": "from_",
        "Java": "from",
        "Go": "from",
        "Ruby": "from",
        "Rust": "from",
        "C#": "from",
        "Kotlin": "from",
        "Swift": "from"
      },
      "firstTest": {
        "TypeScript": "test('毎分の式は次の分を返す', () => {\n  const from = { year: 2026, month: 11, day: 18, hour: 10, minute: 7 };\n  expect(nextRun('* * * * *', from)).toEqual({ ...from, minute: 8 });\n});",
        "JavaScript": "test('毎分の式は次の分を返す', () => {\n  const from = { year: 2026, month: 11, day: 18, hour: 10, minute: 7 };\n  expect(nextRun('* * * * *', from)).toEqual({ ...from, minute: 8 });\n});",
        "Python": "def test_every_minute_returns_next_minute():\n    from_ = datetime(2026, 11, 18, 10, 7)\n    assert next_run(\"* * * * *\", from_) == datetime(2026, 11, 18, 10, 8)",
        "Java": "@Test\nvoid everyMinuteReturnsNextMinute() {\n    var from = LocalDateTime.of(2026, 11, 18, 10, 7);\n    assertEquals(from.plusMinutes(1), nextRun(\"* * * * *\", from));\n}",
        "Go": "func TestEveryMinuteReturnsNextMinute(t *testing.T) {\n\tfrom := time.Date(2026, 11, 18, 10, 7, 0, 0, time.UTC)\n\tgot, err := nextRun(\"* * * * *\", from)\n\tif want := from.Add(time.Minute); err != nil || !got.Equal(want) {\n\t\tt.Errorf(\"nextRun = %v, %v; want %v\", got, err, want)\n\t}\n}",
        "Ruby": "class NextRunTest < Minitest::Test\n  def test_every_minute_returns_next_minute\n    from = Time.utc(2026, 11, 18, 10, 7)\n    assert_equal Time.utc(2026, 11, 18, 10, 8), next_run(\"* * * * *\", from)\n  end\nend",
        "Rust": "#[test]\nfn every_minute_returns_next_minute() {\n    let from = DateTime { year: 2026, month: 11, day: 18, hour: 10, minute: 7 };\n    assert_eq!(next_run(\"* * * * *\", from), Ok(DateTime { minute: 8, ..from }));\n}",
        "C#": "[Fact]\npublic void EveryMinuteReturnsNextMinute()\n{\n    var from = new DateTime(2026, 11, 18, 10, 7, 0);\n    Assert.Equal(from.AddMinutes(1), NextRun(\"* * * * *\", from));\n}",
        "Kotlin": "@Test\nfun everyMinuteReturnsNextMinute() {\n    val from = LocalDateTime.of(2026, 11, 18, 10, 7)\n    assertEquals(from.plusMinutes(1), nextRun(\"* * * * *\", from))\n}",
        "Swift": "func testEveryMinuteReturnsNextMinute() {\n    let from = DateComponents(year: 2026, month: 11, day: 18, hour: 10, minute: 7)\n    let next = DateComponents(year: 2026, month: 11, day: 18, hour: 10, minute: 8)\n    XCTAssertEqual(try nextRun(\"* * * * *\", from: from), next)\n}"
      }
    }
  },
  {
    "title": "数独を解く",
    "body": "## 背景\n\n制約を満たす解をバックトラックで探す、探索の定番のお題です。「盤面が規則に沿っているか」の判定から始め、候補の絞り込み、探索へと段階的に進めます。\n\n9×9 の数独の盤面を受け取り、解いた盤面を返す `{{slot:solve}}(board)` を実装します。盤面は 81 文字の文字列で、空きマスは `.` です。\n\n## ルール\n\n- 各行・各列・各 3×3 のブロックに、1〜9 が 1 つずつ入る\n- 解けた盤面を同じ形（81 文字の文字列）で返す\n- 解が無ければ {{slot:none}} を返す\n- 最初から規則に反している盤面（同じ行に同じ数がある等）はエラー\n- 長さや文字が不正な盤面はエラー\n\n## 段階\n\n1. `{{slot:isValid}}(board)`: 埋まっているマスが規則に反していないかを返す\n2. `{{slot:candidates}}(board, index)`: そのマスに置ける数の一覧を返す\n3. `{{slot:solve}}(board)`: 候補の少ないマスから順に試し、行き詰まったら戻る\n\n## 考慮すること\n\nテストに使う問題は、答えの分かっているものを用意します。解の一意性までは確かめなくてよいですが、返した盤面が「元の数字を保ち、規則を満たし、空きが無い」ことを確かめるテストは書けます。難しい問題でも数秒以内に終わることを目標にしてください。\n\n満たすこと:\n- 規則に反する盤面を見抜く\n- マスの候補を正しく返す\n- 解ける盤面を解く（元の数字は変えない）\n- 解けない盤面は {{slot:none}}\n- 不正な入力はエラー\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- マスの添字から行・列・ブロックの番号を出す関数を先に作る\n- 探索は「埋める → 再帰 → 失敗なら戻す」の形で書く",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "solve": {
        "TypeScript": "solve",
        "JavaScript": "solve",
        "Python": "solve",
        "Java": "solve",
        "Go": "solve",
        "Ruby": "solve",
        "Rust": "solve",
        "C#": "Solve",
        "Kotlin": "solve",
        "Swift": "solve"
      },
      "isValid": {
        "TypeScript": "isValid",
        "JavaScript": "isValid",
        "Python": "is_valid",
        "Java": "isValid",
        "Go": "isValid",
        "Ruby": "valid?",
        "Rust": "is_valid",
        "C#": "IsValid",
        "Kotlin": "isValid",
        "Swift": "isValid"
      },
      "candidates": {
        "TypeScript": "candidates",
        "JavaScript": "candidates",
        "Python": "candidates",
        "Java": "candidates",
        "Go": "candidates",
        "Ruby": "candidates",
        "Rust": "candidates",
        "C#": "Candidates",
        "Kotlin": "candidates",
        "Swift": "candidates"
      },
      "none": {
        "TypeScript": "`null`",
        "JavaScript": "`null`",
        "Python": "`None`",
        "Java": "空の `Optional`",
        "Go": "`false`（2 つ目の戻り値）",
        "Ruby": "`nil`",
        "Rust": "`Ok(None)`",
        "C#": "`null`",
        "Kotlin": "`null`",
        "Swift": "`nil`"
      },
      "firstTest": {
        "TypeScript": "test('同じ行に同じ数がある盤面は不正', () => {\n  const board: string = '11' + '.'.repeat(79);\n  expect(isValid(board)).toBe(false);\n});",
        "JavaScript": "test('同じ行に同じ数がある盤面は不正', () => {\n  const board = '11' + '.'.repeat(79);\n  expect(isValid(board)).toBe(false);\n});",
        "Python": "def test_rejects_duplicate_in_row():\n    board = \"11\" + \".\" * 79\n    assert is_valid(board) is False",
        "Java": "@Test\nvoid rejectsDuplicateInRow() {\n    String board = \"11\" + \".\".repeat(79);\n    assertFalse(isValid(board));\n}",
        "Go": "func TestRejectsDuplicateInRow(t *testing.T) {\n\tboard := \"11\" + strings.Repeat(\".\", 79)\n\tif isValid(board) {\n\t\tt.Errorf(\"isValid(%q) = true, want false\", board)\n\t}\n}",
        "Ruby": "class SudokuTest < Minitest::Test\n  def test_rejects_duplicate_in_row\n    board = \"11\" + \".\" * 79\n    refute valid?(board)\n  end\nend",
        "Rust": "#[test]\nfn rejects_duplicate_in_row() {\n    let board = format!(\"11{}\", \".\".repeat(79));\n    assert!(!is_valid(&board));\n}",
        "C#": "[Fact]\npublic void RejectsDuplicateInRow()\n{\n    var board = \"11\" + new string('.', 79);\n    Assert.False(IsValid(board));\n}",
        "Kotlin": "@Test\nfun rejectsDuplicateInRow() {\n    val board = \"11\" + \".\".repeat(79)\n    assertFalse(isValid(board))\n}",
        "Swift": "func testRejectsDuplicateInRow() {\n    let board = \"11\" + String(repeating: \".\", count: 79)\n    XCTAssertFalse(isValid(board))\n}"
      }
    }
  },
  {
    "title": "優先度付きキュー（ヒープ）",
    "body": "## 背景\n\n二分ヒープは、配列 1 本で木を表す巧みなデータ構造です。添字の計算と「上へ浮かせる・下へ沈める」操作を、性質を確かめるテストで支えながら作ります。\n\n優先度の小さい順に取り出せる `PriorityQueue` を、二分ヒープで実装します。\n\n## 振る舞い\n\n- {{slot:ctor}}: 比較関数を渡せる（省略時は数値の昇順）\n- `{{slot:push}}(x)`: 要素を加える（`O(log n)`）\n- {{slot:pop}}: 最も優先度の高い要素を取り除いて返す（`O(log n)`）。空なら {{slot:none}}\n- {{slot:peek}}: 取り除かずに返す\n- {{slot:size}}: 要素の数\n\n## ルール\n\n- 同じ優先度の要素は、入れた順に取り出す（安定）\n- 内部の配列を外から書き換えられない\n- 標準ライブラリのソート済みの構造や優先度付きキューは使わない\n\n## 考慮すること\n\n「どんな順で入れても、{{slot:popName}} を繰り返すと昇順に並ぶ」という性質は、乱数で作った多くの入力で確かめられます。乱数の種を固定してテストが毎回同じになるようにしてください。安定にするには、比較に「入れた順の番号」を加える工夫が要ります。\n\n満たすこと:\n- {{slot:popName}} が常に最小の要素を返す\n- 比較関数で順序を変えられる\n- 同じ優先度は入れた順に出る\n- 空のときの {{slot:popName}}・{{slot:peekName}} を扱う\n- 多くの乱数の入力で昇順に取り出せる\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 添字 i の親は (i - 1) / 2 の切り捨て、子は 2i + 1 と 2i + 2\n- 末尾に足して浮かせる、根を末尾と入れ替えて沈める",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "ctor": {
        "TypeScript": "`new PriorityQueue(compare?)`",
        "JavaScript": "`new PriorityQueue(compare?)`",
        "Python": "`PriorityQueue(compare=None)`",
        "Java": "`new PriorityQueue<>()`・`new PriorityQueue<>(comparator)`",
        "Go": "`newPriorityQueue[T]()`・`newPriorityQueueFunc(less)`",
        "Ruby": "`PriorityQueue.new(&compare)`",
        "Rust": "`PriorityQueue::new()`・`PriorityQueue::with_compare(compare)`",
        "C#": "`new PriorityQueue<T>(comparer = null)`",
        "Kotlin": "`PriorityQueue<T>()`・`PriorityQueue(comparator)`",
        "Swift": "`PriorityQueue<T>()`・`PriorityQueue(by: areInIncreasingOrder)`"
      },
      "push": {
        "TypeScript": "push",
        "JavaScript": "push",
        "Python": "push",
        "Java": "push",
        "Go": "push",
        "Ruby": "push",
        "Rust": "push",
        "C#": "Push",
        "Kotlin": "push",
        "Swift": "push"
      },
      "pop": {
        "TypeScript": "`pop()`",
        "JavaScript": "`pop()`",
        "Python": "`pop()`",
        "Java": "`pop()`",
        "Go": "`pop()`",
        "Ruby": "`pop`",
        "Rust": "`pop()`",
        "C#": "`TryPop(out item)`",
        "Kotlin": "`pop()`",
        "Swift": "`pop()`"
      },
      "peek": {
        "TypeScript": "`peek()`",
        "JavaScript": "`peek()`",
        "Python": "`peek()`",
        "Java": "`peek()`",
        "Go": "`peek()`",
        "Ruby": "`peek`",
        "Rust": "`peek()`",
        "C#": "`TryPeek(out item)`",
        "Kotlin": "`peek()`",
        "Swift": "`peek()`"
      },
      "popName": {
        "TypeScript": "pop",
        "JavaScript": "pop",
        "Python": "pop",
        "Java": "pop",
        "Go": "pop",
        "Ruby": "pop",
        "Rust": "pop",
        "C#": "TryPop",
        "Kotlin": "pop",
        "Swift": "pop"
      },
      "peekName": {
        "TypeScript": "peek",
        "JavaScript": "peek",
        "Python": "peek",
        "Java": "peek",
        "Go": "peek",
        "Ruby": "peek",
        "Rust": "peek",
        "C#": "TryPeek",
        "Kotlin": "peek",
        "Swift": "peek"
      },
      "size": {
        "TypeScript": "`size`",
        "JavaScript": "`size`",
        "Python": "`len(q)`",
        "Java": "`size()`",
        "Go": "`size()`",
        "Ruby": "`size`",
        "Rust": "`len()`",
        "C#": "`Count`",
        "Kotlin": "`size`",
        "Swift": "`count`"
      },
      "none": {
        "TypeScript": "`undefined`",
        "JavaScript": "`undefined`",
        "Python": "`None`",
        "Java": "`null`",
        "Go": "`false`（2 つ目の戻り値）",
        "Ruby": "`nil`",
        "Rust": "`None`",
        "C#": "`false`",
        "Kotlin": "`null`",
        "Swift": "`nil`"
      },
      "firstTest": {
        "TypeScript": "test('入れた順に依らず小さい順に出る', () => {\n  const q = new PriorityQueue<number>();\n  [5, 1, 4].forEach((x) => q.push(x));\n  expect([q.pop(), q.pop(), q.pop()]).toEqual([1, 4, 5]);\n});",
        "JavaScript": "test('入れた順に依らず小さい順に出る', () => {\n  const q = new PriorityQueue();\n  [5, 1, 4].forEach((x) => q.push(x));\n  expect([q.pop(), q.pop(), q.pop()]).toEqual([1, 4, 5]);\n});",
        "Python": "def test_pops_in_ascending_order():\n    q = PriorityQueue()\n    for x in [5, 1, 4]:\n        q.push(x)\n    assert [q.pop(), q.pop(), q.pop()] == [1, 4, 5]",
        "Java": "@Test\nvoid popsInAscendingOrder() {\n    var q = new PriorityQueue<Integer>();\n    List.of(5, 1, 4).forEach(q::push);\n    assertEquals(List.of(1, 4, 5), List.of(q.pop(), q.pop(), q.pop()));\n}",
        "Go": "func TestPopsInAscendingOrder(t *testing.T) {\n\tq := newPriorityQueue[int]()\n\tfor _, x := range []int{5, 1, 4} {\n\t\tq.push(x)\n\t}\n\tvar got []int\n\tfor range 3 {\n\t\tx, _ := q.pop()\n\t\tgot = append(got, x)\n\t}\n\tif want := []int{1, 4, 5}; !reflect.DeepEqual(got, want) {\n\t\tt.Errorf(\"got %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class PriorityQueueTest < Minitest::Test\n  def test_pops_in_ascending_order\n    q = PriorityQueue.new\n    [5, 1, 4].each { |x| q.push(x) }\n    assert_equal [1, 4, 5], [q.pop, q.pop, q.pop]\n  end\nend",
        "Rust": "#[test]\nfn pops_in_ascending_order() {\n    let mut q = PriorityQueue::new();\n    for x in [5, 1, 4] {\n        q.push(x);\n    }\n    assert_eq!([q.pop(), q.pop(), q.pop()], [Some(1), Some(4), Some(5)]);\n}",
        "C#": "[Fact]\npublic void PopsInAscendingOrder()\n{\n    var q = new PriorityQueue<int>();\n    foreach (var x in new[] { 5, 1, 4 }) q.Push(x);\n    q.TryPop(out var a);\n    q.TryPop(out var b);\n    q.TryPop(out var c);\n    Assert.Equal(new[] { 1, 4, 5 }, new[] { a, b, c });\n}",
        "Kotlin": "@Test\nfun popsInAscendingOrder() {\n    val q = PriorityQueue<Int>()\n    listOf(5, 1, 4).forEach(q::push)\n    assertEquals(listOf(1, 4, 5), listOf(q.pop(), q.pop(), q.pop()))\n}",
        "Swift": "func testPopsInAscendingOrder() {\n    var q = PriorityQueue<Int>()\n    for x in [5, 1, 4] { q.push(x) }\n    let popped = [q.pop(), q.pop(), q.pop()]\n    XCTAssertEqual(popped, [1, 4, 5])\n}"
      }
    }
  },
  {
    "title": "ポーカーの役判定",
    "body": "## 背景\n\nルールの多いドメインを、データの表現と比較の設計で整理するお題です。役の判定だけでなく「同じ役どうしの強さ比べ」まで含めると、比較のキーの作り方が考えどころになります。\n\n5 枚の手札を 2 組受け取り、どちらが強いかを返す `{{slot:name}}(a, b)` を実装します。\n\n## ルール\n\n- カードは `\"AS\"`（スペードのエース）・`\"TH\"`（ハートの 10）のように、ランク（`2`〜`9`・`T`・`J`・`Q`・`K`・`A`）とスート（`S`・`H`・`D`・`C`）の 2 文字\n- 役は強い順に、ストレートフラッシュ・フォーカード・フルハウス・フラッシュ・ストレート・スリーカード・ツーペア・ワンペア・ハイカード\n- `A-2-3-4-5` もストレート（このときの A は 1 として扱う）\n- 同じ役なら、役を作るカードのランク、次に残りのカードのランクの順で比べる\n- スートの強さは比べない。すべて同じなら引き分け\n- 戻り値は `\"a\"`・`\"b\"`・`\"tie\"`。重複したカードや不正なカードはエラー\n\n## 例\n\n- `{{slot:name}}(\"2H 3D 5S 9C KD\", \"2C 3H 4S 8C AH\")` → `\"b\"`（ハイカードで A が勝つ）\n- `{{slot:name}}(\"2H 2D 5S 9C KD\", \"3C 3H 4S 8C AH\")` → `\"b\"`（ペアの 3 が勝つ）\n- `{{slot:name}}(\"AH 2D 3C 4S 5H\", \"2S 3S 4H 5D 6C\")` → `\"b\"`（5 が上のストレートと 6 が上のストレート）\n\n## 考慮すること\n\n役ごとに「比較に使うランクの並び」を作っておくと、強さ比べは「役の順位 → 並びの辞書順」の比較 1 つにまとまります。役の判定は、ランクごとの枚数の形（4-1・3-2・2-2-1 など）で多くが決まります。\n\n満たすこと:\n- 9 種類の役を判定できる\n- A を 1 として扱うストレートに対応する\n- 同じ役どうしを正しく比べる\n- 引き分けを返せる\n- 不正・重複したカードはエラー\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- 手札の解析・役の判定・強さのキーの作成を別の関数にする\n- ランクを枚数の多い順、同数ならランクの高い順に並べると比較のキーになる",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "name": {
        "TypeScript": "compareHands",
        "JavaScript": "compareHands",
        "Python": "compare_hands",
        "Java": "compareHands",
        "Go": "compareHands",
        "Ruby": "compare_hands",
        "Rust": "compare_hands",
        "C#": "CompareHands",
        "Kotlin": "compareHands",
        "Swift": "compareHands"
      },
      "firstTest": {
        "TypeScript": "test('ハイカードどうしは最も高いカードで決まる', () => {\n  const winner: 'a' | 'b' | 'tie' = compareHands('2H 3D 5S 9C KD', '2C 3H 4S 8C AH');\n  expect(winner).toBe('b');\n});",
        "JavaScript": "test('ハイカードどうしは最も高いカードで決まる', () => {\n  expect(compareHands('2H 3D 5S 9C KD', '2C 3H 4S 8C AH')).toBe('b');\n});",
        "Python": "def test_high_card_decides():\n    assert compare_hands(\"2H 3D 5S 9C KD\", \"2C 3H 4S 8C AH\") == \"b\"",
        "Java": "@Test\nvoid highCardDecides() {\n    assertEquals(\"b\", compareHands(\"2H 3D 5S 9C KD\", \"2C 3H 4S 8C AH\"));\n}",
        "Go": "func TestHighCardDecides(t *testing.T) {\n\tgot, err := compareHands(\"2H 3D 5S 9C KD\", \"2C 3H 4S 8C AH\")\n\tif err != nil || got != \"b\" {\n\t\tt.Errorf(\"compareHands = %q, %v; want %q\", got, err, \"b\")\n\t}\n}",
        "Ruby": "class CompareHandsTest < Minitest::Test\n  def test_high_card_decides\n    assert_equal \"b\", compare_hands(\"2H 3D 5S 9C KD\", \"2C 3H 4S 8C AH\")\n  end\nend",
        "Rust": "#[test]\nfn high_card_decides() {\n    assert_eq!(compare_hands(\"2H 3D 5S 9C KD\", \"2C 3H 4S 8C AH\"), Ok(\"b\"));\n}",
        "C#": "[Fact]\npublic void HighCardDecides()\n{\n    Assert.Equal(\"b\", CompareHands(\"2H 3D 5S 9C KD\", \"2C 3H 4S 8C AH\"));\n}",
        "Kotlin": "@Test\nfun highCardDecides() {\n    assertEquals(\"b\", compareHands(\"2H 3D 5S 9C KD\", \"2C 3H 4S 8C AH\"))\n}",
        "Swift": "func testHighCardDecides() {\n    XCTAssertEqual(try compareHands(\"2H 3D 5S 9C KD\", \"2C 3H 4S 8C AH\"), \"b\")\n}"
      }
    }
  },
  {
    "title": "行単位の差分（diff）",
    "body": "## 背景\n\n2 つの文章の違いを示す diff は、最長共通部分列（LCS）を動的計画法で求める応用です。表の作り方と、表からの経路の復元を分けてテストするお題です。\n\n2 つの文字列の配列（行の並び）`before` と `after` を受け取り、行ごとの差分を返す `{{slot:name}}(before, after)` を実装します。\n\n## ルール\n\n- 戻り値は {{slot:shape}}。`op` は `\"=\"`（共通）・`\"-\"`（削除）・`\"+\"`（追加）\n- `\"=\"` の行の数は、2 つの並びの最長共通部分列の長さと一致する\n- `\"-\"` と `\"=\"` の行を順に並べると `before`、`\"+\"` と `\"=\"` を並べると `after` に戻る\n- 同じ長さの解が複数あるときは、削除を追加より先に出す\n- 片方または両方が空でも動く\n\n## 例\n\n```\n{{slot:code1}}\n```\n\n## 考慮すること\n\n「元に戻せる」「共通の行の数が最大」という 2 つの性質は、どんな入力でも成り立つはずです。具体例のテストに加えて、この性質を確かめるテストを書くと、実装の隙を見つけやすくなります。差分を `- b` / `+ d` の形の文字列に整える `{{slot:formatDiff}}` を足すのもよい拡張です。\n\n満たすこと:\n- 同じ並びは全部 \"=\" になる\n- 片方が空なら全部 \"-\" か全部 \"+\"\n- 結果から before と after を復元できる\n- 共通の行の数が最長共通部分列の長さと一致する\n- 削除を追加より先に出す\n\n最初のテストの例:\n```\n{{slot:firstTest}}\n```\n\nヒント:\n- (before の長さ + 1) × (after の長さ + 1) の表に LCS の長さを埋める\n- 表を後ろからたどって op を集め、最後に反転する",
    "difficulty": "hard",
    "category": "tdd",
    "slots": {
      "name": {
        "TypeScript": "diffLines",
        "JavaScript": "diffLines",
        "Python": "diff_lines",
        "Java": "diffLines",
        "Go": "diffLines",
        "Ruby": "diff_lines",
        "Rust": "diff_lines",
        "C#": "DiffLines",
        "Kotlin": "diffLines",
        "Swift": "diffLines"
      },
      "formatDiff": {
        "TypeScript": "formatDiff",
        "JavaScript": "formatDiff",
        "Python": "format_diff",
        "Java": "formatDiff",
        "Go": "formatDiff",
        "Ruby": "format_diff",
        "Rust": "format_diff",
        "C#": "FormatDiff",
        "Kotlin": "formatDiff",
        "Swift": "formatDiff"
      },
      "shape": {
        "TypeScript": "`{ op, line }` の配列",
        "JavaScript": "`{ op, line }` の配列",
        "Python": "`(op, line)` のタプルのリスト",
        "Java": "`Edit(op, line)` のリスト",
        "Go": "`edit{op, line}` のスライス",
        "Ruby": "`{ op:, line: }` のハッシュの配列",
        "Rust": "`Edit { op, line }` の `Vec`",
        "C#": "`Edit(Op, Line)` のリスト",
        "Kotlin": "`Edit(op, line)` のリスト",
        "Swift": "`Edit(op:line:)` の配列"
      },
      "code1": {
        "TypeScript": "diffLines(['a', 'b', 'c'], ['a', 'c', 'd'])\n→ [\n  { op: '=', line: 'a' },\n  { op: '-', line: 'b' },\n  { op: '=', line: 'c' },\n  { op: '+', line: 'd' },\n]",
        "JavaScript": "diffLines(['a', 'b', 'c'], ['a', 'c', 'd'])\n→ [\n  { op: '=', line: 'a' },\n  { op: '-', line: 'b' },\n  { op: '=', line: 'c' },\n  { op: '+', line: 'd' },\n]",
        "Python": "diff_lines([\"a\", \"b\", \"c\"], [\"a\", \"c\", \"d\"])\n→ [\n  (\"=\", \"a\"),\n  (\"-\", \"b\"),\n  (\"=\", \"c\"),\n  (\"+\", \"d\"),\n]",
        "Java": "diffLines(List.of(\"a\", \"b\", \"c\"), List.of(\"a\", \"c\", \"d\"))\n→ List.of(\n  new Edit(\"=\", \"a\"),\n  new Edit(\"-\", \"b\"),\n  new Edit(\"=\", \"c\"),\n  new Edit(\"+\", \"d\"))",
        "Go": "diffLines([]string{\"a\", \"b\", \"c\"}, []string{\"a\", \"c\", \"d\"})\n→ []edit{\n  {op: \"=\", line: \"a\"},\n  {op: \"-\", line: \"b\"},\n  {op: \"=\", line: \"c\"},\n  {op: \"+\", line: \"d\"},\n}",
        "Ruby": "diff_lines(%w[a b c], %w[a c d])\n→ [\n  { op: \"=\", line: \"a\" },\n  { op: \"-\", line: \"b\" },\n  { op: \"=\", line: \"c\" },\n  { op: \"+\", line: \"d\" },\n]",
        "Rust": "diff_lines(&[\"a\", \"b\", \"c\"], &[\"a\", \"c\", \"d\"])\n→ vec![\n  Edit { op: \"=\", line: \"a\" },\n  Edit { op: \"-\", line: \"b\" },\n  Edit { op: \"=\", line: \"c\" },\n  Edit { op: \"+\", line: \"d\" },\n]",
        "C#": "DiffLines([\"a\", \"b\", \"c\"], [\"a\", \"c\", \"d\"])\n→ [\n  new Edit(\"=\", \"a\"),\n  new Edit(\"-\", \"b\"),\n  new Edit(\"=\", \"c\"),\n  new Edit(\"+\", \"d\"),\n]",
        "Kotlin": "diffLines(listOf(\"a\", \"b\", \"c\"), listOf(\"a\", \"c\", \"d\"))\n→ listOf(\n  Edit(\"=\", \"a\"),\n  Edit(\"-\", \"b\"),\n  Edit(\"=\", \"c\"),\n  Edit(\"+\", \"d\"),\n)",
        "Swift": "diffLines([\"a\", \"b\", \"c\"], [\"a\", \"c\", \"d\"])\n→ [\n  Edit(op: \"=\", line: \"a\"),\n  Edit(op: \"-\", line: \"b\"),\n  Edit(op: \"=\", line: \"c\"),\n  Edit(op: \"+\", line: \"d\"),\n]"
      },
      "firstTest": {
        "TypeScript": "test('同じ並びは全部共通', () => {\n  const ops: { op: '=' | '-' | '+'; line: string }[] = diffLines(['a', 'b'], ['a', 'b']);\n  expect(ops).toEqual([\n    { op: '=', line: 'a' },\n    { op: '=', line: 'b' },\n  ]);\n});",
        "JavaScript": "test('同じ並びは全部共通', () => {\n  expect(diffLines(['a', 'b'], ['a', 'b'])).toEqual([\n    { op: '=', line: 'a' },\n    { op: '=', line: 'b' },\n  ]);\n});",
        "Python": "def test_identical_lines_are_all_common():\n    assert diff_lines([\"a\", \"b\"], [\"a\", \"b\"]) == [(\"=\", \"a\"), (\"=\", \"b\")]",
        "Java": "@Test\nvoid identicalLinesAreAllCommon() {\n    assertEquals(\n        List.of(new Edit(\"=\", \"a\"), new Edit(\"=\", \"b\")),\n        diffLines(List.of(\"a\", \"b\"), List.of(\"a\", \"b\")));\n}",
        "Go": "func TestIdenticalLinesAreAllCommon(t *testing.T) {\n\tgot := diffLines([]string{\"a\", \"b\"}, []string{\"a\", \"b\"})\n\twant := []edit{{op: \"=\", line: \"a\"}, {op: \"=\", line: \"b\"}}\n\tif !reflect.DeepEqual(got, want) {\n\t\tt.Errorf(\"got %v, want %v\", got, want)\n\t}\n}",
        "Ruby": "class DiffLinesTest < Minitest::Test\n  def test_identical_lines_are_all_common\n    expected = [{ op: \"=\", line: \"a\" }, { op: \"=\", line: \"b\" }]\n    assert_equal expected, diff_lines(%w[a b], %w[a b])\n  end\nend",
        "Rust": "#[test]\nfn identical_lines_are_all_common() {\n    assert_eq!(\n        diff_lines(&[\"a\", \"b\"], &[\"a\", \"b\"]),\n        vec![Edit { op: \"=\", line: \"a\" }, Edit { op: \"=\", line: \"b\" }]\n    );\n}",
        "C#": "[Fact]\npublic void IdenticalLinesAreAllCommon()\n{\n    var expected = new[] { new Edit(\"=\", \"a\"), new Edit(\"=\", \"b\") };\n    Assert.Equal(expected, DiffLines([\"a\", \"b\"], [\"a\", \"b\"]));\n}",
        "Kotlin": "@Test\nfun identicalLinesAreAllCommon() {\n    assertEquals(listOf(Edit(\"=\", \"a\"), Edit(\"=\", \"b\")), diffLines(listOf(\"a\", \"b\"), listOf(\"a\", \"b\")))\n}",
        "Swift": "func testIdenticalLinesAreAllCommon() {\n    XCTAssertEqual(diffLines([\"a\", \"b\"], [\"a\", \"b\"]), [Edit(op: \"=\", line: \"a\"), Edit(op: \"=\", line: \"b\")])\n}"
      }
    }
  }
];
