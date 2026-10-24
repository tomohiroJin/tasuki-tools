# サイトの外側を揃える（#434）— 設計正本

- **Issue**: [#434](https://github.com/tomohiroJin/tasuki-tools/issues/434)
- **日付**: 2026-10-23
- **実測時点**: main `02f4a7dd`・本番 `https://tasuki.niku9.click`（`v4.3.0`）
- **前提**: [`docs/constitution.md`](../../constitution.md) 原則 II / III / V / VII / VIII / IX / X / XI・配備の設計 [`2026-06-07-tasuki-vps-deployment-design.md`](2026-06-07-tasuki-vps-deployment-design.md)（「公開だが検索除外」）・[`deploy/caddy/README.md`](../../../deploy/caddy/README.md)

この文書は #434 の設計の正本である。**利用者が決めたこと**と**設計者（Claude）の判断**を分けて書く。
判断には「【判断 Sn】」と付け、§9 にも一覧で置く。利用者は「基本推奨で一気に作ってしまってください」と委ねたので、
§2 の利用者の決定以外は設計者の推奨で決めている。

## 1. 何のために作るか

利用者が Slack に Tasuki の URL を貼ったところ、リンクの下に紹介（題名・説明・画像）が出なかった。
Slack などは貼られたページの `<head>` にある OGP（`og:*`）を読んで紹介を組み立てるが、Tasuki のどのページにも OGP が無い。

あるべき姿（Issue 本文）:

> **チームのメンバー**として、Slack に Tasuki の招待 URL やツールの URL を貼ると、「Tasuki」の名前・何の道具かの一行・見分けのつく画像が出て、何のリンクか一目で分かる。
>
> **運用者**として、`robots.txt`・アイコンなどのサイトの外側が設計どおりに揃っており、存在しないパスが紛れずに分かる。

一番よく貼られるのは招待 URL（`/?room=<コード>`）である（推測。利用者は貼った場面を覚えていない）。招待 URL は玄関の `index.html` をそのまま返すので、玄関の紹介がそのまま出る。

## 2. 利用者が決めたこと（2026-10-23）

1. **紹介の画像は「カードと緑（画面の色）」の、カッコよく一目で分かる 1 枚。** 見比べた案のうち「中央に 1 枚のエースと伏せ札、下にロゴ。四隅にチップと札の端をのぞかせる」に決めた（§4.1）
2. **画像にも文にも道具の数や名前を入れない。** 道具は今後も増えるので、増えるたびに画像を作り直さない
3. **Issue に挙がった外側の欠けは全部この Issue で片付ける**（OGP・robots.txt・アイコン・存在しないパス・theme-color・manifest・security.txt・Cache-Control）
4. **タブのアイコンは、道具ごとの絵文字をやめて共通の Tasuki のアイコン 1 つに揃える**
5. **紹介の文言は §4.2 の表のとおり**

## 3. 範囲

### 3.1 作るもの

| 項目 | 中身 |
|---|---|
| 紹介の画像 | `/og.png`（1200×630 の PNG）。全ページで共有 |
| 紹介の文 | 6 つの `index.html` に OGP・Twitter Card・`description` |
| アイコン | `/favicon.svg`・`/favicon.ico`・`/apple-touch-icon.png`・manifest 用の 192 / 512 の PNG。6 つの `index.html` が同じものを指す |
| テーマ色・manifest | `<meta name="theme-color">` を 6 ページに。`/site.webmanifest` を 1 つ |
| robots.txt | ルート `/robots.txt`（`Disallow: /`）。`/timer/robots.txt` は消す |
| security.txt | `/.well-known/security.txt`（RFC 9116） |
| 存在しないパス | 拡張子の付いたパスで実体が無いものは 404 |
| Cache-Control | ハッシュ付きの `assets/` は 1 年・それ以外は毎回確かめる |
| 検査 | 単体テスト（`index.html` と公開ファイル）・E2E（実 Caddy で配信を確かめる）・変異 |

### 3.2 作らないもの

| 作らないもの | 理由 |
|---|---|
| ルームごとの紹介（ルーム名を出すなど） | `index.html` は全員に同じものが返る静的ファイル。サーバーの処理を足さない（原則 III・Issue の「守ること」）。ルームのコード・名前・表示名を紹介に載せない（`docs/adr/0011`） |
| 道具ごとの画像 | 利用者の決定 2。1 枚を共有する |
| 404 の専用ページ | 拡張子つきのパスはブラウザで人が開くものではない。Caddy の既定（空の本文）で足りる【判断 S5】 |
| `sitemap.xml` | 検索除外なので要らない |
| 検索除外の解除 | Issue の「守ること」。`X-Robots-Tag: noindex, nofollow` と玄関の `<meta name="robots">` は残す |

## 4. 振る舞い

### 4.1 紹介の画像（`/og.png`）

- 1200×630。地はフェルトの緑の放射グラデーション（`--felt-700` → `--felt-800` → `--felt-950`）、内側に真鍮の細い縁（`--gold-bright` の半透明）
- 中央に札 2 枚（伏せ札 `--card-back` と、象牙の A♠）。その下に「Tasuki」（Fraunces・`--gold-bright`・淡い発光）と一行「チームで開発を回すための道具。」（Zen Kaku Gothic New・`--ivory-dim`）
- 四隅: 左上に伏せ札の端、右下に Q♦ の端、左下と右上に真鍮のチップ
- 道具の数・名前は入れない（利用者の決定 2）
- **作り方【判断 S1】**: 絵の正本は HTML（`apps/landing/og/og-image.html`）に置き、`packages/ui` の書体ファイルと色の値をそのまま使う。PNG への書き出しは開発者が手で走らせるスクリプト（`apps/landing/og/render-site-images.mjs`）で行い、**書き出した PNG をコミットする**。スクリプトは E2E がすでに持つ Playwright（Chromium）で撮る。ビルドのたびに生成しない（ビルドにブラウザを持ち込まない）。新しい依存は足さない（原則 II）
- 書き出した PNG はファイルの大きさを抑える（上限 512KB。Slack は 5MB まで受けるが、軽いほど取得が速い。当初の目安 300KB は、卓のグラデーションで約 420KB になり、圧縮の道具を足さないために上げた）

### 4.2 紹介の文（利用者の決定 5）

| ページ | `og:title` | `og:description`・`description` |
|---|---|---|
| 玄関 `/`（招待 URL `/?room=…` を含む） | Tasuki | チームで開発を回すための道具。ルームを作るか、招かれたルームに入ります。 |
| `/timer/` | TDD Mob Pro Timer — Tasuki | ドライバーの交代を計る |
| `/poker/` | Planning Poker — Tasuki | 見積もりを揃える |
| `/topic/` | Topic Board — Tasuki | お題を用意して全員に見せる |
| `/roulette/` | Facilitator Roulette — Tasuki | その場で進行役を決める |
| `/agenda/` | Agenda Timer — Tasuki | ステップを順に計って進める |

- 道具ごとの名前と一行は**玄関の札（`apps/landing/src/tools.ts` の `name`・`summary`）を正本とする**。`index.html` は静的なので値を写すが、**写しが正本と一致することを単体テストで固定する**（原則 VIII の二重正本を検査で 1 つに保つ）【判断 S2】
- 全ページ共通: `og:type`=`website`・`og:site_name`=`Tasuki`・`og:locale`=`ja_JP`・`og:image`=`https://tasuki.niku9.click/og.png`・`og:image:width`=1200・`og:image:height`=630・`og:image:alt`・`twitter:card`=`summary_large_image`
- `og:url` は書かない。招待 URL はクエリでルームを指すので、`og:url` を玄関に固定すると、それを正規の URL として扱うサービスでルームの URL が玄関に畳まれるおそれがある【判断 S3】
- **`og:image` は絶対 URL が要るので本番のドメインを直に書く【判断 S4】**。README がすでに同じドメインを公開しているので新しい露出ではない。ビルド時の環境変数にすると、変数の渡し忘れで黙って壊れる経路が増える。6 ページの値が同じであることを単体テストで固定する
- `<title>` は変えない（タブの見出しは今のまま）

### 4.3 アイコン（利用者の決定 4）

- 紹介の画像の中央の札（象牙の A♠ をフェルトの緑に置いた絵）を、小さくしても潰れない形に簡単にした 1 つの意匠
- `favicon.svg`（正本）・`favicon.ico`（32×32 の PNG を 1 枚包んだ ICO）・`apple-touch-icon.png`（180×180）・`icon-192.png`・`icon-512.png`。どれも玄関の `public/` に置き、ルート（`/favicon.svg` など）から配る。PNG と ICO は §4.1 と同じスクリプトで書き出してコミットする
- 6 つの `index.html` から絵文字の `data:` アイコンを外し、同じ 4 本の `<link>`（`icon` の ICO と SVG・`apple-touch-icon`・`manifest`）を置く。**timer にも付く**
- 各アプリは `base` がサブパス（`/poker/` など）だが、**Vite 8 は `index.html` に書いた絶対パスのうち、そのアプリの `public/` に実体が無いもの（`/favicon.svg` など）を書き換えない**（2026-10-23 に `vite build --base=/poker/` で実測）。ビルド後の `href` がルートを指したままであることを E2E でも確かめる

### 4.4 テーマ色と manifest

- `<meta name="theme-color" content="…">` を 6 ページに。値は `--felt-900`（地の色）。生の色を書く規約の例外なので、値がトークンと一致することを単体テストで固定する（`index-html-loading-placeholder.test.ts` と同じ作法）
- `/site.webmanifest`: `name`=`Tasuki`・`short_name`=`Tasuki`・`start_url`=`/`・`display`=`browser`・`background_color` と `theme_color`=`--felt-900`・`icons`=192 / 512。`display` は `browser` にして、ホーム画面に置いたときの振る舞いを今のブラウザ表示から変えない【判断 S6】

### 4.5 robots.txt

- 玄関の `public/robots.txt` に `User-agent: *` と `Disallow: /`。`apps/timer-web/public/robots.txt` は消す（サブパスの robots.txt は検索エンジンに読まれない。正本を 1 つにする）
- Slack の紹介の取得役（`Slackbot-LinkExpanding`）は robots.txt を守らないと Slack 自身が書いている（<https://api.slack.com/robots>、2026-10-23 取得。更新日の記載なし）。**これは推測として扱い、配布後に実物で確かめる**（§7）

- 【決定 2026-10-24】紹介が出ると約束する相手は **Slack**。`Disallow: /` は残す（検索除外を保つ）ので、robots.txt を守る取得役（X の Twitterbot など）は紹介を取らない。X での表示は約束しない。`index.html` の冒頭コメントもそう書く

### 4.6 security.txt

- `/.well-known/security.txt`: `Contact:` と `Policy:` に `https://github.com/tomohiroJin/tasuki-tools/blob/main/SECURITY.md`、`Expires:` に作成日から 1 年後、`Preferred-Languages: ja, en`
- GitHub の非公開の報告窓口は無効（2026-10-23 に `gh api …/private-vulnerability-reporting` で `enabled: false`）なので、窓口の案内を書いている `SECURITY.md` を指す。メールアドレスは載せない（原則 XI）【判断 S7】
- **`Expires` は RFC 9116 で必須で、切れると無効になる。** 期限の約束が置き場を失わないよう、**期限の 30 日前を過ぎたら赤になる単体テスト**を置く。赤の文言に書き換え方を書く【判断 S8】

### 4.7 存在しないパス

- 6 つの配信断片（玄関の包括と 5 つのツール）で、**拡張子の付いたパス（最後の `/` の後ろに `.` を含む）で実体が無いものは 404** にする。拡張子の無いパスは今までどおり各アプリの `index.html` へ落とす（各アプリは知らないパスを玄関へ送り返す処理を持っており、それを生かす）
- ルームのコードは英数字と `-` だけ（`apps/tasuki-sync/src/adapters/nanoid-code-gen.ts` の `slugify`）なので、旧リンク `/poker/room/<コード>` は 404 に巻き込まれない
- 書き方は `try_files {path} /index.html` を、名前付きの条件（`not file` かつ `not path_regexp \.[^/]*$`）に当たるときだけ `rewrite … /index.html` する形に替える【判断 S5】。2026-10-23 に Caddy 2.11.4 で試作して確かめた: `/x/y`・`/?room=…`・`/poker/room/abc-1` は 200 で `index.html`、`/no.txt`・`/poker/no.png`・`/assets/none.js` は 404
- Vite は `public/` の `.well-known/` もそのまま成果物へ写す（同日に実測）

### 4.8 Cache-Control

- サイトブロック（`deploy/caddy/tasuki.conf`）で一括して付ける。パスに `/assets/` を含み拡張子のあるもの（Vite が名前にハッシュを入れた成果物）は `public, max-age=31536000, immutable`、それ以外とエラーの応答は `no-cache`（毎回 ETag で確かめる）
- 同じ見出しを 2 つの `header` で付けると、どちらが後に効くかが Caddy の並べ替えで決まる。**2 つの条件を互いに排他にする**（`/assets/` 配下で拡張子つき・その補集合）【判断 S9】
- **実体の無い `assets/` の 404 に 1 年の immutable を付けない**（配布の途中に新しい `index.html` が先に届くと、まだ無い資産の 404 が 1 年キャッシュされうる）。エラーの応答は `handle_errors { header Cache-Control "no-cache" }` で上書きする（`header` は応答を書く前に付くので、file_server の 404 にも immutable が残っている）。`header { … match status 2xx }` は使わない: **本番の Caddy 2.6.2（Debian の apt）は `match` を条件として読まず**、404 にも immutable が付いた（2026-10-24 の配布で実測。E2E の 2.11.4 では効くので手元は緑だった）。`defer` も状態コードを見ないので使わない。あわせて、拡張子なしの `/…/assets/x`（断片が index.html へ書き換える）が immutable な HTML にならないよう、`@hashed` は拡張子つき（`path_regexp \.[^/]+$`）に絞り、`@unhashed` はその厳密な補集合にする。Caddy 2.6.2 と 2.11.4 の両方で確かめた: `/assets/a-1.js` は immutable、`/assets/none.js` は 404 で `no-cache`、拡張子なしは `no-cache`。`.webmanifest` は Go の MIME 表に無く text/plain になるので Content-Type を明示する。E2E で「404 に immutable が付かない」ことも見る【判断 S10】
- CSP の `img-src data:` は残す（羅紗の織り目の模様が `data:` の SVG を、招待の QR が `data:image/png` を使う）。アイコンが `data:` でなくなったので、サイトブロックのコメントの理由を直す

## 5. 検査

| 検査 | 置き場 | 見るもの |
|---|---|---|
| `index.html` の外側 | `apps/landing/tests/`（単体） | 画面を持つ全アプリの `index.html`（**ディレクトリを走査して集める。列挙しない**）に OGP・Twitter Card・`description`・`theme-color`・4 本の `<link>` が揃う／`og:image` が全ページで同じ絶対 URL／道具の `og:title`・`og:description` が `tools.ts` と一致／絵文字の `data:` アイコンが残っていない／玄関が `noindex` を保つ |
| 公開ファイル | `apps/landing/tests/`（単体） | `robots.txt` の中身／`og.png` が PNG で 1200×630 かつ大きさの上限内／アイコンの PNG の寸法／`favicon.ico` が ICO／manifest が JSON でアイコンの実体がある／security.txt の必須項目と `Expires` が 30 日より先 |
| Caddy 断片 | 既存の `caddy-fragment-*.test.ts` に足す | 6 つの配信断片がすべて 404 の書き方を持つ（1 つだけ古い `try_files {path} /index.html` に戻ると赤） |
| 実配信 | `e2e/specs/`（既存のタグ） | 実 Caddy で: `/robots.txt` が `text/plain`／`/og.png` が `image/png`／`/favicon.ico`・`/favicon.svg`・`/site.webmanifest`・`/.well-known/security.txt` が 200／`/no-such.txt`・`/poker/no-such.png`・`/timer/assets/no-such.js` が 404 で、その 404 に immutable が付かない／`/no-such-page`・`/?room=…`・各ツールのトップが 200 の HTML／`assets/` の `Cache-Control` が immutable で HTML が `no-cache`／各ページで `link[rel=icon]` の `href` がルートを指し、その先が 200 |

- 新しい E2E のタグは作らない（`docs/` の決まり。既存の `@core`・`@smoke` に乗せる）。本番向けの `pnpm e2e:prod` では、配布するまで新しい項目が赤になる（#433 の agenda と同じ扱い）
- 新しい検査は、対象を壊して赤になることを変異で確かめる（原則 VII）。変異 ID は 463 以降（台帳の予約を見る）

## 6. 配布

**配布は利用者の指示を待つ。** 未配布の #433・#435 と一緒に 1 回で配るのが単純（原則 III・IX）。

- web: 6 アプリすべての `index.html` が変わるので、`deploy.sh` を全アプリに流す（#433 の順の制約 timer → agenda はそのまま守る）
- Caddy: サイトブロック（`site.conf`）と 6 つの断片が変わる。**root での設置と `caddy validate`・reload が 1 回要る**（`deploy/caddy/README.md` の手順に、この配布の節を足す）
- 順: web を先に配る（新しい公開ファイルが先に揃う）→ Caddy。逆でも壊れはしない（新しい 404 は「無いファイル」にしか当たらない）

## 7. 配布後に実物で確かめること（推測の裏取り）

1. `curl -A 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'` で玄関と各ツールの `<head>` に OGP があること
2. **利用者が Slack に招待 URL とツールの URL を貼って、紹介が出ること**（Slack は結果を約 30 分キャッシュするので、以前に貼った URL は時間を置く）
3. 出なかったら: `X-Robots-Tag: noindex` か robots.txt を Slack が見ている疑いがある。そのときに Slack の取得役だけを通すかを決める（検索除外を保ったまま）

## 8. Constitution との関係

| 原則 | 関係 |
|---|---|
| II. ADR | 新しい技術・依存なし。画像の書き出しは既存の Playwright を開発時にだけ使う |
| III. 揮発インメモリ | サーバーの処理は足さない。静的なファイルと Caddy の設定だけ |
| V. 実画面検証 | 実 Caddy の E2E と、配布後の Slack での実物確認（§7） |
| VII. 壊して確かめる | 新しい検査に変異を足す |
| VIII. 記録が正本 | 道具の名前と一行は `tools.ts` が正本。`index.html` の写しはテストで一致を固定 |
| X. 抽象は実需で | 6 つの `index.html` の `<head>` の重複は共通化しない（静的 HTML で、各 20 行に満たない。テストで揃いを見る） |
| XI. 秘密と個人情報 | 紹介にルームのコード・名前・表示名を載せない。security.txt にメールアドレスを載せない |

## 9. 設計者の判断の一覧

| ID | 判断 | 節 |
|---|---|---|
| S1 | 画像は HTML を正本にし、手で走らせるスクリプトで PNG に書き出してコミットする（ビルドで生成しない） | §4.1 |
| S2 | 道具の名前と一行は `tools.ts` を正本にし、`index.html` の写しをテストで固定する | §4.2 |
| S3 | `og:url` は書かない | §4.2 |
| S4 | `og:image` の絶対 URL は本番のドメインを直書きし、6 ページで同じことをテストで固定する | §4.2 |
| S5 | 404 は拡張子つきで実体の無いパスだけ。専用の 404 ページは作らない | §4.7 |
| S6 | manifest の `display` は `browser` | §4.4 |
| S7 | security.txt は `SECURITY.md` を指す（非公開の窓口が無効のため） | §4.6 |
| S8 | security.txt の期限切れを 30 日前に赤くする単体テストを置く | §4.6 |
| S9 | Cache-Control は互いに排他な 2 条件（`/assets/` 配下で拡張子つき・その補集合）で付ける | §4.8 |
| S10 | `assets/` の immutable は `defer` で付け、404 には付けない | §4.8 |
