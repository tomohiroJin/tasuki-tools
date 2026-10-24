# サイトの外側を揃える（#434）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slack などに Tasuki の URL を貼ると紹介（題名・説明・画像）が出るようにし、robots.txt・アイコン・security.txt・存在しないパスの 404・Cache-Control を設計どおりに揃える。

**Architecture:** 共有の公開ファイル（紹介の画像・アイコン・manifest・robots.txt・security.txt）は玄関（`apps/landing/public/`）に置き、ルートから配る。6 つの `index.html` が同じ `<head>` の外側を持つ。Caddy は断片で「拡張子つきで実体の無いパスは 404」、サイトブロックで Cache-Control を付ける。

**Tech Stack:** 静的 HTML・Vite 8 の `public/`・Caddy 2.11.4・Vitest（landing の単体）・Playwright（E2E と、開発時だけの画像の書き出し）

**Spec:** [`docs/superpowers/specs/2026-10-23-site-exterior-design.md`](../specs/2026-10-23-site-exterior-design.md)（以下「設計 §n」）

## Constitution Check

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動 | 通過 | Task 2〜4 は赤いテストから。Task 1 の画像は見た目の判断なので撮って確かめ、寸法・形式はテストで固定する |
| II. ADR | 通過 | 新しい依存・技術なし。画像の書き出しは既存の Playwright（`e2e/`）を開発時にだけ使う |
| III. 揮発インメモリ | 通過 | サーバーの処理を足さない。静的なファイルと Caddy の設定だけ |
| IV. 境界の型安全 | 通過 | 新しい入力の境界なし |
| V. 実画面検証 | 通過 | 実 Caddy の E2E（Task 4）。配布後に Slack で実物を確かめる（設計 §7。利用者の指示を待つ） |
| VI. 依存は内向き | 通過 | ドメインに触れない |
| VII. 壊して確かめる | 通過 | Task 5 で変異 m463〜m469 を足す |
| VIII. 記録が正本 | 通過 | 道具の名前と一行は `apps/landing/src/tools.ts` が正本。`index.html` の写しはテストで一致を固定（設計 S2） |
| IX. 小さく回す | 通過 | PR 1 本。配布は #433・#435 と一緒に 1 回、利用者の指示を待つ |
| X. 抽象は実需で | 通過 | 6 つの `<head>` の重複は共通化しない（静的 HTML。揃いはテストで見る） |
| XI. 秘密と個人情報 | 通過 | 紹介にルームのコード・名前・表示名を載せない。security.txt にメールアドレスを載せない |

**逸脱なし。**

## 検証の時間の見積もり

| 検証 | 1 回 | 回数 | 計 |
|---|---|---|---|
| landing の単体（`pnpm --filter @tasuki/landing test`） | 約 20 秒 | 各タスク 2〜3 回 | 約 5 分 |
| E2E の `@smoke`（全アプリのビルド込み・controller が流す） | 約 2〜3 分 | 3 回 | 約 10 分 |
| E2E 全件（controller が最後に 1 回） | 約 5 分 | 1 回 | 約 5 分 |
| 変異（`--id` で 1 本ずつ・controller が流す） | 約 1〜2 分 | 7 本 | 約 15 分 |
| `pnpm test --force`・lint・typecheck・検査系（最後に 1 回） | 約 5 分 | 1 回 | 約 5 分 |

**機械の待ちは合計で約 40 分。** 2 倍（80 分）を超えたら止まって報告する。変異の全件は CI に任せる（手元で `--changed` は変異を足した枝では全件に倒れる）。

## Global Constraints

- 紹介の文言は設計 §4.2 の表のとおり（逐語）。玄関の説明は「チームで開発を回すための道具。ルームを作るか、招かれたルームに入ります。」
- `og:image` は `https://tasuki.niku9.click/og.png`（6 ページで同じ）。`og:url` は書かない
- 共通: `og:type`=`website`・`og:site_name`=`Tasuki`・`og:locale`=`ja_JP`・`og:image:width`=`1200`・`og:image:height`=`630`・`og:image:alt`=`Tasuki — 緑の卓に置かれたトランプの札`・`twitter:card`=`summary_large_image`
- `theme-color` は `--felt-900`（`#0a2b21`）。値はトークンと一致することをテストで固定する
- アイコンの `<link>` は 4 本（順も固定）: `<link rel="icon" href="/favicon.ico" sizes="32x32" />`・`<link rel="icon" href="/favicon.svg" type="image/svg+xml" />`・`<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`・`<link rel="manifest" href="/site.webmanifest" />`
- 玄関の `<meta name="robots" content="noindex, nofollow" />` と Caddy の `X-Robots-Tag` は残す
- `<title>` は変えない
- 新しい依存を足さない。新しい E2E のタグを作らない（`@smoke` に乗せる）
- 変異 ID は 463〜469 を使う
- サブエージェントは push・PR 作成・マージをしない。**プロセスを止めない**（`kill`・`pkill`・シェルの中断をしない。dev サーバー・E2E・Playwright を起動しない）。**ブランチを切り替えない・作業ツリーやコミットを巻き戻す git 操作をしない**（`checkout`・`switch`・`stash`・`reset`・`restore`。戻すときは手で直すか新しいコミットにする。過去の版は `git show <rev>:<path>` で読む）
- コミットの末尾は `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`（実装役）。閉鎖キーワード（`Closes` など）を書かない

## Review Focus

1. **招待 URL `/?room=<コード>` が 404 になったり紹介から外れたりしない** — 拡張子の無いパスとクエリは `index.html` に落ちる（Task 4 の E2E が `/?room=E2E-abc1` を見る）
2. **旧リンク `/poker/room/<コード>` と旧 WS 入口 `/timer/ws`・`/poker/ws` が 404 に巻き込まれない**（既存の `routing.spec.ts` が 200 を見ている。Task 4 で 404 の書き方を入れた後も緑であること）
3. **配布の途中に、まだ無い `assets/` の 404 が 1 年キャッシュされない**（Task 4 の E2E が 404 の `Cache-Control` に `immutable` が無いことを見る）
4. **道具を足したときに `index.html` の外側を書き忘れる** — 検査が `apps/*/index.html` を走査して集めるので、新しいアプリが外側を持たなければ赤（Task 3 のテストが走査の件数 ≥ 6 も見る）
5. **security.txt の期限切れに誰も気づかない** — 30 日前から赤（Task 2）

---

### Task 1: 紹介の画像とアイコンの素材（controller が自分で作る）

見た目の判断が要るので、実装役に渡さず統括（Opus）が作る。

**Files:**
- Create: `apps/landing/og/og-image.html`（紹介の画像の絵の正本。1200×630。設計 §4.1）
- Create: `apps/landing/og/render-site-images.mjs`（書き出しのスクリプト。開発者が手で走らせる）
- Create: `apps/landing/public/favicon.svg`（アイコンの正本。設計 §4.3）
- Create（書き出した成果物・コミットする）: `apps/landing/public/og.png`・`favicon.ico`・`apple-touch-icon.png`・`icon-192.png`・`icon-512.png`
- Test: `apps/landing/tests/site-images.test.ts`

**Interfaces:**
- Produces: 上の 6 本の公開ファイル（Task 2 の manifest・Task 3 の `<link>`・Task 4 の E2E が名前で参照する）

- [ ] **Step 1: 失敗するテストを書く** — `site-images.test.ts`（`index-html-loading-placeholder.test.ts` の `findRepoRoot` の作法でルートを探す）
  - `og.png` が PNG の署名で始まり、IHDR の幅 1200・高さ 630、大きさ 512KB 以下
  - `apple-touch-icon.png` が 180×180、`icon-192.png` が 192×192、`icon-512.png` が 512×512
  - `favicon.ico` が ICO の見出し（`00 00 01 00`）で始まり、1 枚目の項目が 32×32 で中身が PNG
  - `favicon.svg` が `<svg` を含み、`viewBox` を持つ
- [ ] **Step 2: 赤を見る** — `pnpm --filter @tasuki/landing exec vitest run tests/site-images.test.ts` → ファイルが無くて FAIL
- [ ] **Step 3: 絵を描き、書き出す** — `og-image.html` はブレインストーミングの「2 案」（中央にエースと伏せ札、下にロゴ、四隅にチップと札の端）を 1200×630 で描く。書体は `packages/ui/src/fonts/` の woff2 を相対パスで読む。色は `packages/ui/src/tokens/palette.css` の値。`render-site-images.mjs` は `e2e/node_modules` の Playwright（Chromium）を `createRequire` で読み、`file://` で開いて撮る。アイコンの PNG は `favicon.svg` を各寸法で撮り、ICO は 32px の PNG を 1 枚包んで自前で組む（ICONDIR 6 バイト＋項目 16 バイト＋PNG）。実行: `node apps/landing/og/render-site-images.mjs`
- [ ] **Step 4: 撮った絵を目で確かめる** — `og.png` と 32px・180px のアイコンを Read で開き、潰れていないこと・字が base 層の書体で出ていること（豆腐や代替書体が無い）を見る
- [ ] **Step 5: 緑を見る** — Step 2 のコマンドが PASS
- [ ] **Step 6: コミット** — `feat: 紹介の画像とアイコンを足す（#434）`

### Task 2: 公開のテキストファイル（robots.txt・manifest・security.txt）

**Files:**
- Create: `apps/landing/public/robots.txt`・`apps/landing/public/site.webmanifest`・`apps/landing/public/.well-known/security.txt`
- Delete: `apps/timer-web/public/robots.txt`
- Test: `apps/landing/tests/site-files.test.ts`

**Interfaces:**
- Consumes: Task 1 の `icon-192.png`・`icon-512.png`
- Produces: `/robots.txt`・`/site.webmanifest`・`/.well-known/security.txt`（Task 3・4 が参照）

- [ ] **Step 1: 失敗するテストを書く** — `site-files.test.ts`
  - `robots.txt` の行（空行を除く）が正確に `User-agent: *` と `Disallow: /` の 2 行
  - `apps/timer-web/public/robots.txt` が存在しない（正本はルートの 1 本）
  - `site.webmanifest` が JSON で、`name`=`Tasuki`・`short_name`=`Tasuki`・`start_url`=`/`・`display`=`browser`・`theme_color` と `background_color` が `palette.css` の `--felt-900` と一致（`paletteHex` の作法で読む）・`icons` の各 `src` が `/` で始まり `apps/landing/public` に実体があり、`sizes` が 192x192 と 512x512 を含む
  - `security.txt` が `Contact: https://github.com/tomohiroJin/tasuki-tools/blob/main/SECURITY.md`・`Policy:` 同 URL・`Preferred-Languages: ja, en`・`Expires:` を持つ
  - **`Expires` が実行時の現在から 30 日より先**（`new Date()` と比べる。赤の文言に「`apps/landing/public/.well-known/security.txt` の Expires を 1 年先へ書き換える」と書く）
  - `security.txt` にメールアドレス（`@` を含む `mailto:` や `x@y.z` の形）が無い
- [ ] **Step 2: 赤を見る** — `pnpm --filter @tasuki/landing exec vitest run tests/site-files.test.ts` → FAIL
- [ ] **Step 3: ファイルを書く** — `Expires` は `2027-10-23T00:00:00.000Z`。各ファイルの先頭に「なぜ置くか」を 1〜2 行のコメント（`#`）で書く（manifest は JSON なのでコメントなし）。`apps/timer-web/public/robots.txt` を `git rm`
- [ ] **Step 4: 緑を見る** — Step 2 のコマンドが PASS
- [ ] **Step 5: コミット** — `feat: ルートの robots.txt・manifest・security.txt を置く（#434）`

### Task 3: 6 つの `index.html` の外側

**Files:**
- Modify: `apps/landing/index.html`・`apps/timer-web/index.html`・`apps/poker-web/index.html`・`apps/topic-web/index.html`・`apps/roulette-web/index.html`・`apps/agenda-web/index.html`（`<head>` だけ）
- Test: `apps/landing/tests/index-html-exterior.test.ts`

**Interfaces:**
- Consumes: Task 1・2 の公開ファイルの名前。`apps/landing/src/tools.ts` の `TOOLS`（`id`・`name`・`summary`・`href`）
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く** — `index-html-exterior.test.ts`。対象は **`apps/*/index.html` を走査して集める**（列挙しない）。`<meta>` と `<link>` は属性の順に依らない形で読む（`DOMParser` で `<head>` を解く。jsdom 環境）
  - 走査の件数が 6 以上（走査先を間違えていない）
  - 各ページ: Global Constraints の共通の OGP・`twitter:card`・`theme-color`・4 本の `<link>`（`href` の集合と順）が揃う
  - 各ページ: `og:title` と `twitter:title` が同じ、`og:description` と `description` と `twitter:description` が同じ
  - 各ページ: `data:` の `href` を持つ `<link rel="icon">` が無い
  - 玄関: `og:title`=`Tasuki`・説明が設計 §4.2 の逐語・`robots` が `noindex, nofollow`
  - 道具: `TOOLS` の各要素について、`href` からアプリを引き（`/poker/` → `apps/poker-web`。対応はディレクトリ名 `<id>-web` の規約で導く）、`og:title` が `` `${name} — Tasuki` ``、`og:description` が `summary` と一致。**`TOOLS` に載っているのに `index.html` が見つからない道具があれば赤**
  - `og:url` を持つページが無い
  - `theme-color` が `palette.css` の `--felt-900` と一致
- [ ] **Step 2: 赤を見る** — `pnpm --filter @tasuki/landing exec vitest run tests/index-html-exterior.test.ts` → FAIL
- [ ] **Step 3: 6 つの `<head>` を書く** — 絵文字の `data:` アイコンを外し、`description`・OGP・Twitter Card・`theme-color`・4 本の `<link>` を置く。timer の古い `description`（「モブプログラミング TDD 交代タイマー」）は表の値に替える。並びは `charset` → `viewport` → `title` → `description` → `theme-color` → OGP → Twitter → `<link>` の順に揃える
- [ ] **Step 4: 緑を見る** — Step 2 のコマンドと `pnpm --filter @tasuki/landing test`（既存の `index-html-loading-placeholder.test.ts` も含む）が PASS
- [ ] **Step 5: コミット** — `feat: 全ページに紹介とアイコンの指定を足す（#434）`

### Task 4: Caddy（404・Cache-Control）と実配信の E2E

**Files:**
- Modify: `deploy/landing/caddy/90-landing.conf`・`deploy/timer/caddy/30-timer-spa.conf`・`deploy/poker/caddy/20-poker.conf`・`deploy/topic/caddy/40-topic.conf`・`deploy/roulette/caddy/50-roulette.conf`・`deploy/agenda/caddy/60-agenda.conf`・`deploy/caddy/tasuki.conf`
- Modify: `deploy/caddy/README.md`（「#434 の配布」の節を末尾に足す）
- Modify: `apps/landing/tests/caddy-fragment-order.test.ts`（`describe('Caddy 断片')` に `it` を足す）
- Create: `e2e/specs/site-exterior.spec.ts`

**Interfaces:**
- Consumes: Task 1〜3 の公開ファイルと `index.html`
- Produces: なし

- [ ] **Step 1: 失敗する単体テストを書く** — `caddy-fragment-order.test.ts` に:
  - 配信断片（`root` を持つ断片）がすべて `try_files` を持たず、`not file` と `not path_regexp \.[^/]*$` の名前付き条件で `rewrite … /index.html` する（1 本でも古い書き方なら赤。件数 ≥ 6 も見る）
  - `deploy/caddy/tasuki.conf` が `Cache-Control "public, max-age=31536000, immutable"` を `path */assets/*` の条件で `defer` 付きで持ち、`Cache-Control "no-cache"` を `not path */assets/*` の条件で持つ
- [ ] **Step 2: 失敗する E2E を書く** — `site-exterior.spec.ts`。`routing.spec.ts` と同じく `request` だけで見る（ブラウザを開かない）。`test.describe('@smoke サイトの外側', …)`
  - `/robots.txt` が 200・`text/plain`・本文に `Disallow: /`
  - `/og.png` が 200・`image/png`。`/favicon.ico`・`/favicon.svg`・`/apple-touch-icon.png`・`/site.webmanifest`・`/.well-known/security.txt` が 200
  - `/no-such.txt`・`/poker/no-such.png`・`/timer/assets/no-such.js` が 404。`/timer/assets/no-such.js` の `cache-control` に `immutable` が含まれない
  - `/no-such-page`・`/?room=E2E-abc1`・`/poker/room/E2E-abc1` が 200 の `text/html`
  - 6 ページ（`/` と 5 ツール）: HTML の `og:image` の値を取り、そのパス部分（`/og.png`）を同じ相手に GET して 200・`image/png`。`<link rel="icon">` の `href` がすべて `/` で始まり（サブパスに書き換わっていない）、GET して 200
  - 6 ページの HTML の `cache-control` が `no-cache`。各ページの資材（`/assets/` を含む参照を 1 本）の `cache-control` に `immutable`
- [ ] **Step 3: 単体の赤を見る** — `pnpm --filter @tasuki/landing exec vitest run tests/caddy-fragment-order.test.ts` → FAIL。**E2E は実装役が流さない**（controller が Step 7 で流す）
- [ ] **Step 4: Caddy を書き換える** — 各配信断片の `try_files {path} /index.html` を次の形に替える（`root` の行と `file_server` はそのまま）:

```caddyfile
	@spa {
		not file
		not path_regexp \.[^/]*$
	}
	rewrite @spa /index.html
```

  `tasuki.conf` のサイトブロックに `@hashed path */assets/*`・`@unhashed not path */assets/*`・`header @hashed { Cache-Control "public, max-age=31536000, immutable"; defer }`・`header @unhashed Cache-Control "no-cache"` を足す。各所に「なぜ」のコメント（拡張子つきだけ 404 にする理由・`defer` で 404 に immutable を付けない理由・2 条件を排他にする理由。設計 §4.7・§4.8）。CSP の上のコメントの「favicon が data: URI なので img-src に data: が要る」を「羅紗の織り目の模様が data: の SVG なので…」に直す（`packages/ui/src/elements/reset.css`・`apps/timer-web/src/styles/base.css`）
- [ ] **Step 5: 単体の緑を見る** — Step 3 のコマンドと `pnpm --filter @tasuki/landing test` が PASS
- [ ] **Step 6: 配布の手順を書く** — `deploy/caddy/README.md` の末尾に「#434 の配布（サイトの外側）」の節: web を全アプリ配ってから（#433 の順 timer → agenda を守る）、`site.conf` と 6 断片を `/tmp` へ送り、退避 → `install` → `<公開ドメイン>` の置換 → `caddy validate` → reload。確認のコマンド（`/robots.txt`・`/og.png`・`/no-such.txt` の 404・`/?room=TEST` の 200・`cache-control`）と、Slack に貼る実物確認（設計 §7）。**配布は利用者の指示を待つ**と書く
- [ ] **Step 7（controller）: E2E の赤と緑** — 実装の前のコミットで `pnpm e2e --grep "@smoke"` が新しいシナリオで赤、実装の後に全シナリオ緑（既存の `routing.spec.ts` も緑であること＝Review Focus 2）
- [ ] **Step 8: コミット** — `feat: 実体の無いファイルを 404 にし、キャッシュの指定を付ける（#434）`

### Task 5: 変異（m463〜m469）

**Files:**
- Create: `scripts/mutations/m463-*.patch`〜`m469-*.patch`
- Modify: `scripts/lib/mutation-declarations.mjs`（末尾に 7 件）

各変異は 1 か所だけを壊し、検出を期待するテストを 1 本名指しする（`m461` の形）。

| ID | 壊し方 | pkg | 検出するテスト |
|---|---|---|---|
| 463 | `apps/poker-web/index.html` の `og:image` を外す | `apps/landing` | `tests/index-html-exterior.test.ts` |
| 464 | `apps/agenda-web/index.html` の `og:description` を「ステップを計る」に変える（`tools.ts` との食い違い） | `apps/landing` | `tests/index-html-exterior.test.ts` |
| 465 | `apps/timer-web/index.html` の 4 本の `<link>` を外す | `apps/landing` | `tests/index-html-exterior.test.ts` |
| 466 | `deploy/topic/caddy/40-topic.conf` を `try_files {path} /index.html` に戻す | `apps/landing` | `tests/caddy-fragment-order.test.ts` |
| 467 | `deploy/caddy/tasuki.conf` の `assets/` 側の `defer` を外す | `apps/landing` | `tests/caddy-fragment-order.test.ts` |
| 468 | `security.txt` の `Expires` を `2026-11-01T00:00:00.000Z` にする | `apps/landing` | `tests/site-files.test.ts` |
| 469 | `robots.txt` の `Disallow: /` を `Disallow:` にする（全許可） | `apps/landing` | `tests/site-files.test.ts` |

- [ ] **Step 1: パッチと宣言を書く**（`git diff` で作り、`git apply -R` で戻す。作業ツリーは毎回 clean に戻す）
- [ ] **Step 2（controller）: 1 本ずつ流す** — `node scripts/mutation-check.mjs --id 463,464,465,466,467,468,469` → 7 件すべて「検出」
- [ ] **Step 3: コミット** — `test: サイトの外側の検査に変異を足す（#434）`

### Task 6（controller）: 仕上げ

- [ ] `pnpm test --force`・`pnpm lint`・`pnpm typecheck`・`node scripts/check-links.mjs`・`node scripts/audit-structure.mjs`・`node scripts/audit-plan-gate.mjs`・scripts の自己テスト（AGENTS.md のコマンド）
- [ ] `pnpm e2e` 全件
- [ ] README の「本番」の節に、配布を待つ変更として #434 を 1 行（#433 と同じ書き方）
- [ ] 最終レビュー（Opus・差分は面で分けて渡す）→ push → PR（閉鎖キーワードは地の文に書かない）→ `/code-review <番号>` → CI を headSha で読む
