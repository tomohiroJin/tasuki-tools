# ADR-0033: クラウドのセッションでは公式の取得先だけで道具を揃え、揃わない検査は CI に任せる

- **ステータス**: Proposed（2026-11-02。採択は人が行う。`docs/adr/0030` 決定 1）
- **関連**: [#509](https://github.com/tomohiroJin/tasuki-tools/issues/509)（#491 の振り返りの申し送り 7・11） /
  [ADR-0030](./0030-ai-driven-development-operations.md)（決定 2「どこで開発しても同じ検査が同じ条件で流れる」・決定 4 の報告） /
  [ADR-0031](./0031-toolchain-declaration-and-preflight.md)（版の宣言と事前の確認） /
  [ADR-0008](./0008-dependency-supply-chain.md)（依存の供給網） /
  振り返り [`docs/retrospectives/2026-11-02-issue-491-two-place-trial.md`](../retrospectives/2026-11-02-issue-491-two-place-trial.md)（罠 7・9）

## 背景

#491 の試しのクラウド側（claude.ai/code のセッション）で、検査に要る道具が揃わなかった（振り返りの罠 7・9）。
`docs/adr/0031` の事前の確認（`check-toolchain`）は、版が合わないことを正しく止めた。しかし、案内した揃え方が
クラウドのプロキシの内側で使えなかった。

2026-11-02 に、新しいクラウドのセッションで取得先ごとに届くかを確かめた（#509）。プロキシは、許していない
ホストへの `CONNECT` に 403 を返す。

### コンテナに最初から入っていたもの

| 道具 | 入っていたもの | 宣言 |
|---|---|---|
| Node | 22.23.4 | 22.22.2 以上・22 系（合う） |
| pnpm | 11.28.8（corepack） | 11.28.8（合う） |
| Bun | 1.4.4（`~/.bun/bin/bun`） | 1.4.3（合わない） |
| Chromium | revision 1243・headless shell 1243・ffmpeg 1011（`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`） | Playwright 1.64.1 が要求する 1248・ffmpeg 1013（合わない） |
| Caddy | 無い | 2.11.7 |
| shellcheck | 無い | 宣言していない |

### 取得先ごとの結果

| 取得先 | 結果 |
|---|---|
| `bun.sh/install`（Bun の公式のインストーラー） | 403 |
| `github.com/oven-sh/bun/releases`（`bun-v1.4.3` の `bun-linux-x64.zip`・`SHASUMS256.txt`） | 取れた。`sha256sum -c` が一致し、`bun --version` が 1.4.3 |
| `registry.npmjs.org` の `bun@1.4.3` | 取れた。1.4.3 |
| `github.com/caddyserver/caddy/releases`（2.11.7 の tarball・checksums） | 取れた。`sha512sum -c` が一致。E2E のハーネスも自分で取得して照合した |
| `caddyserver.com/api/download`・`dl.cloudsmith.io`（Caddy の apt リポジトリ） | 403 |
| `cdn.playwright.dev`・`playwright.download.prss.microsoft.com`・`playwright*.azureedge.net`（Playwright の CDN） | 403 |
| `storage.googleapis.com/chrome-for-testing-public/156.0.8078.4/`（Chrome for Testing の配布物。revision 1248 の中身） | 取れた。本体・headless shell とも `--version` が 156.0.8078.4 |
| `googlechromelabs.github.io`（Chrome for Testing の版の一覧） | 403 |
| Playwright の ffmpeg（`builds/ffmpeg/1013/`） | Playwright の CDN にしか無く、取れない |
| `github.com/koalaman/shellcheck/releases`（v0.10.0） | 取れた。照合の値（`.sha256`）は 404 |
| `pypi.org`（`shellcheck-py`）・`archive.ubuntu.com` | 届いた（入れるところまでは試していない。`apt-get update` はセッションの権限の確認で止められた） |

### E2E を流した結果

1. Bun 1.4.3 と Chrome for Testing の Chromium 1248 を置くと、`check-toolchain e2e` は OK を出した。
   しかし `pnpm e2e` は 215 件中 158 件が落ちた。通った 57 件は画面を開かない spec（Caddy の設定・経路・ヘッダー）で、
   画面を開く spec が全件「`ffmpeg-1013/ffmpeg-linux` が無い」で落ちた（`e2e/playwright.config.ts` の `video: 'retain-on-failure'`）。
   **`check-toolchain` が ffmpeg を見ていなかった**
2. 診断のためだけに、入っていた ffmpeg 1011 を 1013 の置き場へ写して流すと、215 件すべてが通った
   （Caddy はハーネスが取得した。ポート・同期サーバー・書体で止まるものは無かった）。
   要求と違う版の ffmpeg なので、**E2E を確かめたことにはしない**（`docs/adr/0031` 決定 2）。
   分かったのは、Chromium と ffmpeg のほかに E2E を止めるものが無いことだけである

## 決定

### 1. 取得先は、リポジトリが既に使っている公式のものだけにする

- **MUST**: クラウドのセッションで道具を揃えるときも、本番・CI・ハーネスが既に使っている取得先と照合の仕方を使う。
  新しい取得先を足さない
- Bun は、本番と同じく GitHub Releases の `bun-linux-x64.zip` を `SHASUMS256.txt` と照合して取る（`deploy/README.md` の
  「Bun を上げる」）。版は `toolchain.json` から読む。手順は `docs/guides/development.md` の「クラウドのセッションで道具を揃える」に置き、
  `check-toolchain` の揃え方はそこを指す
- Caddy は何も足さない。ハーネスがいまの取り方（GitHub Releases と公式の checksums）で取れる

### 2. Chromium と ffmpeg が揃わないときは、E2E を CI に任せる

- **MUST**: `check-toolchain e2e` が止め、Playwright の CDN に届かないときは、E2E を流さずに CI に任せる。
  報告の「確かめられなかったこと」に、止まった道具と届かなかった取得先を書く（`docs/adr/0030` 決定 4）
- **MUST NOT**: 別の取得先（Chrome for Testing の配布物など）や別の revision で代えない
- 揃える道は、環境の持ち主がクラウドの環境の設定で `cdn.playwright.dev` を許すことである（リポジトリの外の設定）。
  許したあとは、いまの `playwright install chromium` がそのまま使える見込みだが、確かめていない

### 3. `check-toolchain` の e2e の段は ffmpeg も見る

`docs/adr/0031` 決定 2 は、Chromium の本体と headless shell の revision の実在を見ると決めた。
Playwright は動画の記録に ffmpeg を使い、その revision も Playwright の版が決め、`playwright install chromium` が一緒に入れる。
見ないと、背景の 1 のとおり OK を出したまま E2E が全件落ちる。**ffmpeg の要求の revision の実在も見る**
（0031 の「検査の前に止める」の範囲を、実際に要るものへ合わせる。比べ方は Chromium と同じ）。

### 4. shellcheck は版を宣言しない

- `toolchain.json` にも `check-toolchain` の段にも入れない。CI はランナーに入っている shellcheck を使い、版を固定していない。
  宣言だけを足すと、CI が読まない宣言になる（`docs/adr/0031` 決定 1 の「CI は正本から読む」に反する）。
  固定するなら CI の入れ方を変えることになり、技術選定に当たる（別の ISSUE で決める）
- クラウドのセッションで無いときは、CI に任せて「確かめられなかったこと」に書く。照合の値が公開されていない
  配布物を入れて代えない

### 退けた案

| 案 | 退けた理由 |
|---|---|
| (a) クラウドの環境のセットアップのスクリプトで、宣言どおりの版を先に入れる | スクリプトはリポジトリの外（環境の設定）に置かれ、版を 2 か所に書くことになる（`docs/adr/0031` 決定 1）。リポジトリから版を読むにしても、いま止まっているのは取得先のほうで、スクリプトでは解けない |
| Chrome for Testing の配布物（`storage.googleapis.com`）から Chromium を取る | ffmpeg が取れないので E2E は流せない（背景の 1）。CI と違う取得先が 1 つ増え、Playwright の CDN の中身と同じかを確かめる手段も無い（同じ置き場が出す値しか無い） |
| 入っている別の revision（1243・ffmpeg 1011）を要求の revision の名前で置く | 要求と違う版で試すことになる（`docs/adr/0031` 決定 2）。診断にだけ使い、確かめたことにはしなかった |
| Bun を `npm i bun@<版>` で入れる | 取れはした。しかし本番と違う取得先になる。本番と同じ取り方で取れるので、そちらに揃える |
| shellcheck を `toolchain.json` に宣言する | 決定 4 |

## 影響

- クラウドのセッションでは、Bun を揃えれば `pnpm test`・変異検査が流せる。E2E は、環境が `cdn.playwright.dev` を許すまで CI に任せる。
  このため、**クラウドで実装した PR の E2E の確認は CI の結果だけになる**（`docs/adr/0030` 決定 2 の目標にはまだ届かない）
- `check-toolchain e2e` は、ffmpeg が無い・別の revision の環境でも止まるようになる。手元や devcontainer で `playwright install chromium` を
  流していれば ffmpeg も入っているので、普段の環境は変わらない
- 取得先ごとの結果は 2026-11-02 の 1 つのセッションの実測である。環境の設定やプロキシの方針が変われば、表は古くなる。
  変わったと気づいたら、表を更新する ADR か ISSUE を立てる
- 依存を共有した作業ツリーで `mutation-check` が起動を拒む件（振り返りの罠 7）は、取得先の話ではないので
  手順書（`docs/guides/procedures/mutations.md`）に書いた
