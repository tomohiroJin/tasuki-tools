/**
 * 定型バンクのうち、バグ探し・デバッグのお題（#634）。
 *
 * 落ちるテストから原因を追うお題。本文は Markdown で、「対象のコード:」と「落ちるテスト:」の
 * 後ろに、それぞれのコードをコードの囲み（```）で包んで置く。
 */
import type { TopicBankEntry } from "./topic-bank.js";

export const DEBUGGING_TOPICS: readonly TopicBankEntry[] = [
  {
    "title": "成績の評価区分",
    "body": "## 背景\n\n点数から評価（A〜D）を付ける小さな関数です。テストの点数表を配る前に、ちょうど区切りの点数を取った人から「評価がおかしい」と問い合わせが来ました。\n\n仕様では、区切りの点数は上の評価に入ります。\n\n## 仕様\n\n- 90 点以上は `A`\n- 70 点以上 90 点未満は `B`\n- 50 点以上 70 点未満は `C`\n- 50 点未満は `D`\n\n## 症状\n\n- 95 点は `A`、80 点は `B`、30 点は `D` と、たいていの点数は正しく出る\n- ところが 90 点を取った人の評価が `A` にならない\n- 問い合わせは 70 点・50 点の人からも来ている\n\n満たすこと:\n- 落ちるテストを流し、実際に返っている値を確かめる\n- 原因を一文で説明してから直す\n- 直したあと、落ちるテストが通る\n- 他の区切り（70 点・50 点）にもテストを足して、同じ誤りが無いことを確かめる\n\n対象のコード:\n```\nfunction grade(score) {\n  if (score > 90) return 'A';\n  if (score > 70) return 'B';\n  if (score > 50) return 'C';\n  return 'D';\n}\n```\n\n落ちるテスト:\n```\ntest('90 点は A', () => {\n  expect(grade(90)).toBe('A');\n});\ntest('70 点は B、50 点は C', () => {\n  expect(grade(70)).toBe('B');\n  expect(grade(50)).toBe('C');\n});\n```\n\nヒント:\n- 仕様の「以上」「未満」を、コードの比較と 1 つずつ見比べる\n- 区切りちょうど・1 つ上・1 つ下の 3 点でテストすると漏れにくい",
    "difficulty": "easy",
    "category": "debugging"
  },
  {
    "title": "税込み価格の端数",
    "body": "## 背景\n\nネットショップで、税抜き価格から税込み価格（税率 10%）を出す関数です。画面には整数の円で表示します。\n\n会計の決まりで、税込み価格の 1 円未満は切り捨てます。\n\n## 症状\n\n- 商品ページで、100 円の商品の税込み価格が `110` ではない値で表示されている\n- 見た目では `110` に近い数だが、合計の照合で 1 円単位の比較が合わない\n- 105 円の商品は、税込みが `115` 円になるはずなのに、そうならない\n\n満たすこと:\n- 落ちるテストを流し、返っている値をそのまま書き出して確かめる\n- なぜその値になるのかを説明する\n- 税込み価格は整数で、1 円未満は切り捨てる\n- 直したあと、落ちるテストが通る\n\n対象のコード:\n```\nfunction priceWithTax(price) {\n  return price * 1.1;\n}\n```\n\n落ちるテスト:\n```\ntest('100 円の税込みは 110 円', () => {\n  expect(priceWithTax(100)).toBe(110);\n});\ntest('105 円の税込みは 115 円（1 円未満は切り捨て）', () => {\n  expect(priceWithTax(105)).toBe(115);\n});\n```\n\nヒント:\n- 返っている値を小数点以下までそのまま表示してみる\n- 小数で計算する前に、整数のまま計算できないか考える",
    "difficulty": "easy",
    "category": "debugging"
  },
  {
    "title": "成績サマリーの先頭",
    "body": "## 背景\n\n提出順に並んだ点数の配列から、中央値と「最初に提出した人の点数」「最後に提出した人の点数」をまとめて返す関数です。\n\n中央値は、点数を小さい順に並べたときの真ん中の値です（個数が偶数なら真ん中 2 つの平均）。\n\n## 症状\n\n- 中央値は正しく出ている\n- ところが「最初に提出した人の点数」が、提出順の先頭の点数になっていない\n- サマリーを出したあと、画面の提出一覧の並びまで変わってしまうという報告もある\n\n満たすこと:\n- 落ちるテストを流し、返っている値を確かめる\n- 提出一覧の並びが変わる理由を説明する\n- 中央値は今と同じ値を返す\n- 提出一覧の並びが変わる症状も、あわせて止まる\n- 直したあと、落ちるテストが通る\n\n対象のコード:\n```\nfunction median(nums) {\n  const sorted = nums.sort((a, b) => a - b);\n  const mid = Math.floor(sorted.length / 2);\n  return sorted.length % 2 === 1\n    ? sorted[mid]\n    : (sorted[mid - 1] + sorted[mid]) / 2;\n}\n\nfunction summary(scores) {\n  const m = median(scores);\n  return { median: m, first: scores[0], last: scores[scores.length - 1] };\n}\n```\n\n落ちるテスト:\n```\ntest('最初と最後は提出順の点数', () => {\n  expect(summary([30, 10, 20])).toEqual({ median: 20, first: 30, last: 20 });\n});\n```\n\nヒント:\n- median を呼ぶ前と後で、scores の中身を表示して比べる\n- 使っている標準の関数の説明を、戻り値だけでなく最後まで読む",
    "difficulty": "easy",
    "category": "debugging"
  },
  {
    "title": "全員合格の判定",
    "body": "## 背景\n\nチームの全員が合格点に達しているかを判定する関数です。1 人でも合格点に届かなければ `false` を返します。\n\nメンバーが 0 人のときは、取り決めで `true` を返します。\n\n## 症状\n\n- 全員が合格のチームは `true` になる\n- 先頭の人が不合格のチームも、正しく `false` になる\n- ところが、先頭の人が合格で、2 人目以降に不合格の人がいるチームが `true` になってしまう\n\n満たすこと:\n- 落ちるテストを流し、どの入力で誤るかを確かめる\n- ループが何回まわっているかを確かめてから直す\n- 0 人のときは true のまま\n- 直したあと、落ちるテストが通る\n\n対象のコード:\n```\nfunction allPassed(scores, passLine) {\n  for (const s of scores) {\n    if (s < passLine) return false;\n    return true;\n  }\n  return true;\n}\n```\n\n落ちるテスト:\n```\ntest('2 人目が不合格なら false', () => {\n  expect(allPassed([80, 40, 90], 60)).toBe(false);\n});\ntest('0 人なら true', () => {\n  expect(allPassed([], 60)).toBe(true);\n});\n```\n\nヒント:\n- ループの中に表示を入れて、何人目まで見ているかを数える",
    "difficulty": "easy",
    "category": "debugging"
  },
  {
    "title": "ユーザー名の重複登録",
    "body": "## 背景\n\n会員登録で、同じユーザー名がすでに使われていないかを確かめる関数です。\n\n決まりとして、ユーザー名は前後の空白を無視し、大文字と小文字を区別せずに比べます。つまり `Alice` と ` alice ` は同じ名前です。\n\n## 症状\n\n- 小文字だけで登録された名前（例: `bob`）に対して、`BOB` で登録しようとすると正しく弾かれる\n- ところが、大文字を含めて登録された名前（例: `Alice`）は、同じ綴りで登録しようとしても弾かれず、重複して登録できてしまう\n\n満たすこと:\n- 落ちるテストを流し、どの組み合わせで誤るかを確かめる\n- 比べている 2 つの値を、それぞれ表示して見比べる\n- 登録済みの名前の表記（大文字を含む等）は変えずに保存されたままでよい\n- 直したあと、落ちるテストが通る\n\n対象のコード:\n```\nfunction isTaken(name, existingNames) {\n  const key = name.trim().toLowerCase();\n  return existingNames.includes(key);\n}\n```\n\n落ちるテスト:\n```\ntest('大文字で登録済みの名前は使えない', () => {\n  expect(isTaken('Alice', ['Alice', 'bob'])).toBe(true);\n});\ntest('前後の空白と大文字小文字を無視する', () => {\n  expect(isTaken(' alice ', ['Alice'])).toBe(true);\n});\n```\n\nヒント:\n- 通る例と落ちる例で、比べている 2 つの値の違いを書き出す",
    "difficulty": "easy",
    "category": "debugging"
  },
  {
    "title": "ユーザーごとの通知設定",
    "body": "## 背景\n\n新しいユーザーを作るとき、既定の設定を元に、ユーザーごとの設定を用意します。ユーザーは画面の色（テーマ）を変えたり、通知を受け取るタグをフォローしたりできます。\n\n設定はユーザーごとに独立していて、ある人の変更が他の人に影響してはいけません。\n\n## 症状\n\n- あるユーザーがテーマを `dark` にしても、他のユーザーは `light` のまま（ここは正しい）\n- ところが、あるユーザーがタグをフォローすると、他のユーザーも同じタグをフォローしたことになっている\n- サーバーを再起動した直後に作られたユーザーまで、誰かがフォローしたタグを最初から持っている\n\n## 調べるときの観点\n\nテーマはユーザーごとに分かれているのに、タグだけが混ざる、という違いに注目してください。\n\n満たすこと:\n- 落ちるテストを流し、混ざっているのがどの値かを確かめる\n- テーマとタグで振る舞いが違う理由を説明する\n- ユーザーの設定を変えても、既定の設定と他のユーザーの設定は変わらない\n- 直したあと、落ちるテストが通る\n- 既定の設定に入れ子の値が増えても壊れない直し方を選ぶ\n\n対象のコード:\n```\nconst DEFAULT_SETTINGS = {\n  theme: 'light',\n  notifications: { email: true, tags: [] },\n};\n\nfunction createUser(name) {\n  return { name, settings: { ...DEFAULT_SETTINGS } };\n}\n\nfunction setTheme(user, theme) {\n  user.settings.theme = theme;\n}\n\nfunction followTag(user, tag) {\n  user.settings.notifications.tags.push(tag);\n}\n```\n\n落ちるテスト:\n```\ntest('タグのフォローは本人だけに効く', () => {\n  const a = createUser('a');\n  const b = createUser('b');\n  setTheme(a, 'dark');\n  followTag(a, 'release');\n  expect(b.settings.theme).toBe('light');\n  expect(b.settings.notifications.tags).toEqual([]);\n  expect(createUser('c').settings.notifications.tags).toEqual([]);\n});\n```\n\nヒント:\n- 2 人のユーザーのタグの配列が、同じものか別のものかを確かめる\n- createUser が新しく作っている値と、そうでない値を書き出す",
    "difficulty": "medium",
    "category": "debugging"
  },
  {
    "title": "日別のイベント集計",
    "body": "## 背景\n\nイベントの発生時刻から、日ごとの件数を集計する関数です。時刻は時差つきの ISO 8601 形式の文字列で届きます。\n\nサービスの利用者は日本にいるので、日付は日本時間（UTC+9）で区切る決まりです。サーバーがどの国のどの時刻設定で動いていても、同じ結果になる必要があります。\n\n## 症状\n\n- 昼間のイベントは正しい日に数えられている\n- ところが、朝早い時間（日本時間の 0 時〜9 時ごろ）のイベントが、前の日に数えられている\n- 月初の集計で、前の月の最終日の件数が多すぎると指摘された\n\n満たすこと:\n- 落ちるテストを流し、どのイベントがどの日に入っているかを確かめる\n- ずれる時間帯がなぜ 0 時〜9 時なのかを説明する\n- サーバーの時刻設定に依らず同じ結果になる\n- 直したあと、落ちるテストが通る\n\n対象のコード:\n```\nfunction dayKey(isoText) {\n  return new Date(isoText).toISOString().slice(0, 10);\n}\n\nfunction countByDay(events) {\n  const counts = {};\n  for (const e of events) {\n    const key = dayKey(e.at);\n    counts[key] = (counts[key] || 0) + 1;\n  }\n  return counts;\n}\n```\n\n落ちるテスト:\n```\ntest('日本時間の日付で数える', () => {\n  const events = [\n    { at: '2026-02-28T23:30:00+09:00' },\n    { at: '2026-03-01T08:00:00+09:00' },\n    { at: '2026-03-01T10:00:00+09:00' },\n  ];\n  expect(countByDay(events)).toEqual({ '2026-02-28': 1, '2026-03-01': 2 });\n});\n```\n\nヒント:\n- dayKey に 1 件ずつ渡して、返る日付を表示する\n- 日付を切り出す前の文字列全体を表示して、末尾まで読む",
    "difficulty": "medium",
    "category": "debugging"
  },
  {
    "title": "プロフィールの並列取得",
    "body": "## 背景\n\n画面に並べる複数のユーザーのプロフィールを、まとめて取得する関数です。待ち時間を減らすため、取得は並列に行います。\n\n画面は、渡した ID の順に表示します。返す配列も ID と同じ順でなければなりません。\n\n## 症状\n\n- 開発環境では、いつも正しい順に並んでいた\n- 本番では、ときどき並びが入れ替わる。再読み込みすると直ることもある\n- 件数は合っていて、抜けや重複は無い\n\n満たすこと:\n- 落ちるテストを流し、どんな順で返っているかを確かめる\n- 開発環境では再現しなかった理由を説明する\n- 取得は並列のまま（1 件ずつ待つ形に変えない）\n- 直したあと、落ちるテストが通る\n\n対象のコード:\n```\nasync function loadProfiles(ids, fetchProfile) {\n  const profiles = [];\n  await Promise.all(\n    ids.map(async (id) => {\n      const profile = await fetchProfile(id);\n      profiles.push(profile);\n    }),\n  );\n  return profiles;\n}\n```\n\n落ちるテスト:\n```\ntest('渡した ID の順に返す', async () => {\n  const delays = { 1: 30, 2: 10, 3: 20 };\n  const fetchProfile = (id) =>\n    new Promise((resolve) => setTimeout(() => resolve({ id, name: 'user' + id }), delays[id]));\n  const profiles = await loadProfiles([1, 2, 3], fetchProfile);\n  expect(profiles.map((p) => p.id)).toEqual([1, 2, 3]);\n});\n```\n\nヒント:\n- テストの待ち時間を全部同じにすると、結果がどう変わるかを見る\n- 結果を配列に入れる「時点」がいつなのかを考える",
    "difficulty": "medium",
    "category": "debugging"
  },
  {
    "title": "期限切れセッションの掃除",
    "body": "## 背景\n\nログイン中のセッションの一覧から、期限が切れたものを取り除く関数です。定期的に呼ばれ、渡した配列そのものを掃除します。\n\n`expiresAt` が `now` 以下のセッションは期限切れです。\n\n## 症状\n\n- 期限切れが 1 件だけのときは、きちんと消える\n- 期限切れのセッションが残っている、という報告がたまに来る\n- 残るのは、期限切れのセッションが一覧の中で続けて並んでいたときらしい\n\n満たすこと:\n- 落ちるテストを流し、どのセッションが残るかを確かめる\n- 続けて並んだときだけ残る理由を説明する\n- 期限切れでないセッションの順序は変えない\n- 直したあと、落ちるテストが通る\n\n対象のコード:\n```\nfunction removeExpired(sessions, now) {\n  for (let i = 0; i < sessions.length; i++) {\n    if (sessions[i].expiresAt <= now) {\n      sessions.splice(i, 1);\n    }\n  }\n  return sessions;\n}\n```\n\n落ちるテスト:\n```\ntest('続けて並んだ期限切れも消える', () => {\n  const sessions = [\n    { id: 'a', expiresAt: 10 },\n    { id: 'b', expiresAt: 20 },\n    { id: 'c', expiresAt: 100 },\n    { id: 'd', expiresAt: 30 },\n  ];\n  removeExpired(sessions, 50);\n  expect(sessions.map((s) => s.id)).toEqual(['c']);\n});\n```\n\nヒント:\n- ループのたびに i と配列の中身を表示する\n- 1 件消したあと、次に見る要素はどれになっているかを追う",
    "difficulty": "medium",
    "category": "debugging"
  },
  {
    "title": "バイト数での切り詰め",
    "body": "## 背景\n\n外部のシステムへ送る見出しは、UTF-8 で数えて決まったバイト数までしか受け付けられません。長すぎる見出しを、そのバイト数に収まるように切り詰める関数です。\n\n切り詰めた結果は、文字として壊れていない文字列でなければなりません。収まりきらない文字は丸ごと落とします。\n\n## 症状\n\n- 英数字だけの見出しは、正しく切り詰められる\n- 日本語の見出しを送ると、相手の画面で末尾に「�」のような文字が出ることがある\n- 出るときと出ないときがあり、上限のバイト数を変えると症状が変わる\n\n満たすこと:\n- 落ちるテストを流し、返っている文字列の各文字を確かめる\n- 上限によって症状が出たり出なかったりする理由を説明する\n- 結果は maxBytes 以下のバイト数に収まる\n- 直したあと、落ちるテストが通る\n\n対象のコード:\n```\nfunction truncateBytes(text, maxBytes) {\n  const bytes = new TextEncoder().encode(text);\n  if (bytes.length <= maxBytes) return text;\n  return new TextDecoder().decode(bytes.slice(0, maxBytes));\n}\n```\n\n落ちるテスト:\n```\ntest('日本語を文字の途中で切らない', () => {\n  expect(truncateBytes('あいう', 7)).toBe('あい');\n  expect(truncateBytes('あいう', 6)).toBe('あい');\n});\ntest('英数字はそのまま切り詰める', () => {\n  expect(truncateBytes('abcdef', 4)).toBe('abcd');\n});\n```\n\nヒント:\n- 「あ」「い」「う」がそれぞれ UTF-8 で何バイトかを調べる\n- 上限を 6・7・8 と変えて、結果の末尾を見比べる",
    "difficulty": "medium",
    "category": "debugging"
  },
  {
    "title": "検索結果の取り違え",
    "body": "## 背景\n\n入力欄に文字を打つたびに検索を投げ、結果を一覧に出す検索ボックスです。検索 API の応答時間は語によってまちまちで、先に投げた検索が後から返ることがあります。\n\n画面には、最後に打った語の結果だけを出します。最後の検索の応答が返るまでは「読み込み中」を出し続けます。\n\n## 症状\n\n- 1 語だけ打って待つと、正しい結果が出る\n- 速く打つと、最後に打った語とは違う語の結果が一覧に残ることがある\n- 結果が出ていないのに「読み込み中」の表示が消え、一瞬、空の一覧や前の結果が見えることがある\n\n## 調べるときの観点\n\n2 つの症状は同じ根から来ているとは限りません。テストを 1 つずつ通しながら確かめてください。\n\n満たすこと:\n- 落ちるテストを流し、2 つのテストがそれぞれどう落ちるかを確かめる\n- 応答の順序を図や表に書き出して、どの時点で状態が誤るかを説明する\n- 最後に投げた検索の結果だけが一覧に残る\n- 最後の検索の応答が返るまで loading は true のまま\n- 直したあと、2 つのテストが通る（テストの待ち時間は変えない）\n\n対象のコード:\n```\nclass SearchBox {\n  constructor(api) {\n    this.api = api;\n    this.results = [];\n    this.loading = false;\n  }\n\n  async search(query) {\n    this.loading = true;\n    const results = await this.api(query);\n    this.results = results;\n    this.loading = false;\n  }\n}\n```\n\n落ちるテスト:\n```\ntest('後から打った語の結果が残る', async () => {\n  const box = new SearchBox(fakeApi({ t: 50, ts: 10 }));\n  const first = box.search('t');\n  const second = box.search('ts');\n  await Promise.all([first, second]);\n  expect(box.results).toEqual(['ts の結果']);\n});\n\ntest('最後の検索が返るまで読み込み中', async () => {\n  const box = new SearchBox(fakeApi({ t: 10, ts: 50 }));\n  box.search('t');\n  const last = box.search('ts');\n  await wait(20);\n  expect(box.loading).toBe(true);\n  await last;\n  expect(box.loading).toBe(false);\n  expect(box.results).toEqual(['ts の結果']);\n});\n\n// テスト用の部品: 語ごとに決まった時間（ミリ秒）だけ待って結果を返す\nfunction fakeApi(delays) {\n  return (q) => new Promise((resolve) => setTimeout(() => resolve([q + ' の結果']), delays[q]));\n}\nfunction wait(ms) {\n  return new Promise((resolve) => setTimeout(resolve, ms));\n}\n```\n\nヒント:\n- search の始まりと終わりに、語と時刻を表示して順序を見る\n- 応答が返った時点で、それがまだ「見せるべき応答」かをどう知るかを考える",
    "difficulty": "hard",
    "category": "debugging"
  },
  {
    "title": "依存パッケージの導入順",
    "body": "## 背景\n\nパッケージの依存関係から、導入する順序を決める関数です。どのパッケージも、それが依存するパッケージより後に導入しなければなりません。依存が輪になっている（循環している）ときは、導入できないのでエラーにします。\n\n依存関係は「パッケージ名 → 依存するパッケージ名の配列」の形で渡されます。\n\n## 症状\n\n- 依存が一直線のとき（`a` が `b` に、`b` が `c` に依存）は、エラーにならずに順序が返る\n- ところが、2 つのパッケージが同じパッケージに依存していると、循環していないのに「循環」のエラーになる\n- エラーにならなかった場合も、導入してみると依存先がまだ入っていないと言われる\n\n## 調べるときの観点\n\nエラーを消すだけでは終わりません。返す順序が正しいことも、テストで確かめます。\n\n満たすこと:\n- 落ちるテストを流し、どの名前で「循環」と判定されたかを確かめる\n- 依存関係を図に描き、関数がたどる順を書き込む\n- 本当の循環は、これまでどおりエラーにする\n- 共通の依存は 1 回だけ並べる\n- 直したあと、2 つのテストが通る\n\n対象のコード:\n```\nfunction installOrder(deps) {\n  const visited = new Set();\n  const order = [];\n\n  function visit(name) {\n    if (visited.has(name)) throw new Error('循環: ' + name);\n    visited.add(name);\n    order.push(name);\n    for (const dep of deps[name] || []) visit(dep);\n  }\n\n  for (const name of Object.keys(deps)) {\n    if (!visited.has(name)) visit(name);\n  }\n  return order;\n}\n```\n\n落ちるテスト:\n```\ntest('共通の依存があっても導入順を返す', () => {\n  const order = installOrder({\n    app: ['ui', 'api'],\n    ui: ['core'],\n    api: ['core'],\n    core: [],\n  });\n  expect(order.length).toBe(4);\n  expect(order.indexOf('core') < order.indexOf('ui')).toBe(true);\n  expect(order.indexOf('core') < order.indexOf('api')).toBe(true);\n  expect(order.indexOf('ui') < order.indexOf('app')).toBe(true);\n  expect(order.indexOf('api') < order.indexOf('app')).toBe(true);\n});\n\ntest('本当の循環はエラーにする', () => {\n  expect(() => installOrder({ a: ['b'], b: ['c'], c: ['a'] })).toThrow();\n});\n```\n\nヒント:\n- 共通の依存（core）に 2 回目にたどり着いたとき、本来どうなるべきかを考える\n- 図の上で、order に名前が積まれる順を手で書き出し、テストの期待と比べる",
    "difficulty": "hard",
    "category": "debugging"
  },
  {
    "title": "循環を含む深いコピー",
    "body": "## 背景\n\n画面の編集機能で、元のデータを壊さずに試し編集するため、データ全体を深くコピーする関数です。\n\nデータには、木の各ノードが親を指す参照や、複数の場所から同じオブジェクトを指す参照、作成日時の値が含まれます。コピーは元と同じ形（どこがどこを指しているか）を保ち、日時は日時のまま写す必要があります。\n\n## 症状\n\n- 数値・文字列・配列・入れ子のオブジェクトだけのデータは、正しくコピーできる\n- 親を指すノードを含む木をコピーしようとすると、呼び出しの深さが上限を超えたというエラーで止まる\n- 作成日時を含むデータをコピーすると、コピー側で日時の操作をしたところでエラーになる\n\n## 調べるときの観点\n\nテストは 3 つあり、落ち方がそれぞれ違います。1 つずつ通してください。\n\n満たすこと:\n- 落ちるテストを流し、3 つのテストの落ち方の違いを確かめる\n- 親を指すノードで止まる理由を、呼び出しの流れで説明する\n- 同じオブジェクトを 2 か所から指していたら、コピーでも同じ 1 つを指す\n- コピーを書き換えても、元のデータは変わらない\n- 直したあと、3 つのテストが通る\n\n対象のコード:\n```\nfunction deepClone(value) {\n  if (value === null || typeof value !== 'object') return value;\n  if (Array.isArray(value)) return value.map((v) => deepClone(v));\n  const copy = {};\n  for (const key of Object.keys(value)) {\n    copy[key] = deepClone(value[key]);\n  }\n  return copy;\n}\n```\n\n落ちるテスト:\n```\ntest('親を指すノードを含む木をコピーできる', () => {\n  const root = { name: 'root', children: [] };\n  root.children.push({ name: 'child', parent: root, children: [] });\n  const copy = deepClone(root);\n  expect(copy.children[0].parent).toBe(copy);\n  expect(copy === root).toBe(false);\n});\n\ntest('同じオブジェクトへの参照は、コピーでも同じ 1 つを指す', () => {\n  const shared = { label: 'x' };\n  const copy = deepClone({ a: shared, b: shared });\n  expect(copy.a).toBe(copy.b);\n  expect(copy.a === shared).toBe(false);\n});\n\ntest('日時は日時として写す', () => {\n  const original = { createdAt: new Date(Date.UTC(2026, 0, 1)) };\n  const copy = deepClone(original);\n  expect(copy.createdAt.getTime()).toBe(original.createdAt.getTime());\n});\n```\n\nヒント:\n- 親を指すノードをコピーするとき、deepClone がどの値で何回呼ばれるかを書き出す\n- 日時の値が、deepClone のどの分岐を通るかを追う",
    "difficulty": "hard",
    "category": "debugging"
  },
  {
    "title": "毎月の請求日",
    "body": "## 背景\n\nサブスクリプションの請求日を、契約日から毎月の同じ日で並べる関数です。\n\n決まりは次のとおりです。\n\n- 請求日は毎月「契約日と同じ日」\n- その月にその日が無いとき（例: 31 日の契約で 2 月）は、その月の末日\n- 末日に寄せたのはその月だけで、次の月はまた契約日と同じ日に戻る\n\n## 症状\n\n- 15 日に契約した人の請求日は、毎月 15 日に並ぶ（正しい）\n- 1 月 31 日に契約した人の 2 回目の請求日が、2 月ではなく 3 月になっている\n- 月末に契約した人の請求日が、月を追うごとに契約日とは違う日へずれていく、という問い合わせもある\n\n## 調べるときの観点\n\n1 つ直すと症状が変わります。直すたびにテストを流し、次の落ち方を確かめてください。\n\n満たすこと:\n- 落ちるテストを流し、返っている日付の並びを確かめる\n- 2 月に入らない理由を、日付の計算の流れで説明する\n- 末日に寄せるのはその月だけで、次の月は契約日の日に戻る\n- うるう年の 2 月 29 日も正しく扱う\n- 直したあと、落ちるテストが通る\n\n対象のコード:\n```\nfunction addOneMonth(dateText) {\n  const d = new Date(dateText + 'T00:00:00Z');\n  d.setUTCMonth(d.getUTCMonth() + 1);\n  return d.toISOString().slice(0, 10);\n}\n\nfunction billingDates(start, count) {\n  const dates = [start];\n  while (dates.length < count) {\n    dates.push(addOneMonth(dates[dates.length - 1]));\n  }\n  return dates;\n}\n```\n\n落ちるテスト:\n```\ntest('31 日の契約は、短い月だけ末日に寄せる', () => {\n  expect(billingDates('2026-01-31', 4)).toEqual([\n    '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',\n  ]);\n});\n\ntest('うるう年の 2 月は 29 日', () => {\n  expect(billingDates('2027-11-30', 4)).toEqual([\n    '2027-11-30', '2027-12-30', '2028-01-30', '2028-02-29',\n  ]);\n});\n\ntest('15 日の契約は毎月 15 日', () => {\n  expect(billingDates('2026-01-15', 3)).toEqual([\n    '2026-01-15', '2026-02-15', '2026-03-15',\n  ]);\n});\n```\n\nヒント:\n- 1 月 31 日に「1 か月」を足したとき、途中でどんな日付ができているかを表示する\n- 1 つ目の症状を直したら、6 回分ほど並べて、日の動きを見る",
    "difficulty": "hard",
    "category": "debugging"
  },
  {
    "title": "予算の按分",
    "body": "## 背景\n\n部署の予算（円）を、各チームの人数の比で分ける関数です。予算は 1 円単位の整数で、分けた結果も整数でなければなりません。\n\n決まりは次のとおりです。\n\n- 各チームの取り分は整数\n- 取り分の合計は、必ず元の予算と等しい\n- まず比で割った値の整数部分を配り、余った分は「割り算の余りが大きいチーム」から 1 円ずつ配る。余りが同じなら、先に並んでいるチームを優先する\n\n## 症状\n\n- 1000 円を 3:1 で分けると 750 円と 250 円になる（正しい）\n- 100 円を 3 チームで均等に分けると、合計が 100 円にならない\n- 10 円を 4 チームで均等に分けると、合計が予算を超える\n\n満たすこと:\n- 落ちるテストを流し、取り分と合計を確かめる\n- 合計が足りない場合と超える場合の両方が起きる理由を説明する\n- 取り分の合計は常に total と等しい\n- 余りの配り方は上の決まりに従う（同じ入力なら必ず同じ結果）\n- 直したあと、落ちるテストが通る\n\n対象のコード:\n```\nfunction allocate(total, weights) {\n  const sum = weights.reduce((a, b) => a + b, 0);\n  return weights.map((w) => Math.round((total * w) / sum));\n}\n```\n\n落ちるテスト:\n```\ntest('100 円を 3 チームで分ける', () => {\n  const shares = allocate(100, [1, 1, 1]);\n  expect(sumOf(shares)).toBe(100);\n  expect(shares).toEqual([34, 33, 33]);\n});\n\ntest('10 円を 4 チームで分ける', () => {\n  const shares = allocate(10, [1, 1, 1, 1]);\n  expect(sumOf(shares)).toBe(10);\n  expect(shares).toEqual([3, 3, 2, 2]);\n});\n\ntest('割り切れるときはそのまま', () => {\n  expect(allocate(1000, [3, 1])).toEqual([750, 250]);\n});\n\nfunction sumOf(xs) {\n  return xs.reduce((a, b) => a + b, 0);\n}\n```\n\nヒント:\n- 各チームについて、比で割った値を丸める前の小数のまま表示する\n- 余りは小数でなく、整数の割り算の余りで比べられないか考える",
    "difficulty": "hard",
    "category": "debugging"
  }
];
