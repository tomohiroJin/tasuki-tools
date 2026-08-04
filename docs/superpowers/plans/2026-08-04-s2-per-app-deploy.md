# S2（#17 アプリ別独立デプロイ）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 各アプリが「自分の systemd ユニット + 固有ポート + Caddy 断片 + env」を持ち、`deploy.sh <app>` で対象アプリだけをビルド・配置・再起動できる規約に揃える。あわせて #51 の再発防止（実行ユーザーの一元化・実行可能なドキュメント）を構造で担保する。

**Architecture:** アプリ固有の値を `deploy/<app>/app.env` に集約し、共通ドライバ（`deploy/deploy.sh` / `deploy/setup.sh`）がそれを読んで動く。systemd ユニットと Caddy 断片は**テンプレートから生成**するため、ユーザー名やポートが 2 箇所に散らばらない。ホストの Caddyfile は `import` するだけにする。

**Tech Stack:** Bash / systemd / Caddy / rsync + scp over SSH / turbo `--filter`

**設計の正本:** `docs/superpowers/specs/2026-08-04-monorepo-unification-design.md`（S2 の節）

## Global Constraints

- **本番へのデプロイはこの段では行わない。** epic #15 の全段階が終わってから 1 回だけ実施する
- **systemd ユニット名は改名しない**（決定済み）。timer は稼働中の **`tasuki-sync` を据え置き**、poker は **`tasuki-poker-sync`** を新規追加する
- **poker は S4（#19）まで本番未公開。** S2 では資材を用意するだけで、公開はしない
- timer の本番パス（`/opt/tasuki`・`/var/www/tasuki`・ポート 8787）は**変えない**
- `main` への直接コミット禁止。コミットメッセージは Conventional Commits + 日本語
- **秘密情報を含むファイル（`*.env` の実体）はコミットしない。** テンプレート（`env.example`）のみ

## #51 から引き継ぐ再発防止

| # | 症状 | 構造での対処 |
|---|---|---|
| A | `vps-setup.sh` のユニット生成が `<<'UNITEOF'`（クォート付き）で、`${DEPLOY_USER}` が展開されず `User=deploy` 固定。本番の実行ユーザーは `tomohiro` なので再実行するとユニットが壊れる | ユニットを **`.service.tmpl` からプレースホルダ置換で生成**する。あわせて**既存ユニットの `User=` と食い違ったら中断**するガードを入れる |
| B | `deploy.sh` の既定 SSH ホストが実在しない `myvps`。README の手順がそのままでは必ず失敗する | **既定値を廃止し、未指定なら即座に中断**して設定方法を表示する。README は実行可能な形（環境変数付き）に書き換える |
| C | `docs/BACKLOG.md` のリリース記述が `v2.12.0` のまま | `v2.13.0`（2026-08-04 デプロイ）へ更新し、履歴行に追記 |

---

## File Structure

### 到達点

```
deploy/
├── README.md                      # アプリ共通の手順（正本）
├── deploy.sh                      # 共通ドライバ:  ./deploy/deploy.sh <app>
├── setup.sh                       # 共通 VPS 初回セットアップ:  sudo bash setup.sh <app>
├── lib/
│   └── common.sh                  # app.env の読込・検証・共通処理
├── caddy/
│   └── tasuki.conf                # ホストのサイトブロック（断片を import するだけ）
├── timer/
│   ├── app.env                    # timer 固有の値（唯一の定義場所）
│   ├── service.tmpl               # systemd ユニットのテンプレート
│   ├── Caddyfile.timer            # Caddy 断片
│   ├── env.example                # アプリ env のテンプレート
│   └── NOTES.md                   # timer 固有の経緯・注意（旧 README の内訳）
└── poker/
    ├── app.env  service.tmpl  Caddyfile.poker  env.example  NOTES.md
```

### 削除・置換

| 旧 | 新 |
|---|---|
| `deploy/timer/deploy.sh` | `deploy/deploy.sh timer` |
| `deploy/timer/vps-setup.sh` | `deploy/setup.sh timer` |
| `deploy/timer/tasuki-sync.service` | `deploy/timer/service.tmpl`（生成元） |
| `deploy/timer/tasuki-sync.env.example` | `deploy/timer/env.example` |
| `deploy/timer/README.md` | `deploy/README.md`（共通）+ `deploy/timer/NOTES.md`（固有） |
| `deploy/timer/Caddyfile.production` | `deploy/caddy/tasuki.conf` + `deploy/timer/Caddyfile.timer` |
| `deploy/timer/Caddyfile`（旧 Docker 用ドラフト・本番未使用） | 削除 |
| `deploy/poker/deploy.sh` | `deploy/deploy.sh poker` |
| `deploy/poker/poker-sync.service` | `deploy/poker/service.tmpl` |
| `deploy/poker/README.md` | `deploy/poker/NOTES.md` |

### アプリ別の値（`app.env`）

| キー | timer | poker |
|---|---|---|
| `APP_NAME` | `timer` | `poker` |
| `SERVICE` | **`tasuki-sync`**（据え置き） | `tasuki-poker-sync` |
| `PORT` | `8787` | `3311` |
| `APP_DIR` | `/opt/tasuki` | `/opt/tasuki-poker` |
| `WEB_ROOT` | `/var/www/tasuki` | `/var/www/tasuki-poker` |
| `BUILD_FILTER` | `@tasuki/timer-web` | `@tasuki/poker-web` |
| `WEB_DIST` | `apps/timer-web/dist` | `apps/poker-web/dist` |
| `SYNC_ENTRY` | `apps/timer-sync/src/server.ts` | `apps/poker-sync/src/server.ts` |
| `ENV_FILE` | `tasuki-sync.env` | `tasuki-poker-sync.env` |
| `PUBLIC_PATH` | `/`（S4 で `/timer/` へ） | `/poker/` |

---

## Task 1: 共通ライブラリと app.env を作る

**Files:**
- Create: `deploy/lib/common.sh`, `deploy/timer/app.env`, `deploy/poker/app.env`

**Interfaces:**
- Produces: `load_app <app>` — `deploy/<app>/app.env` を読み、必須キーの欠落・不正値で中断する。`APP_NAME` `SERVICE` `PORT` `APP_DIR` `WEB_ROOT` `BUILD_FILTER` `WEB_DIST` `SYNC_ENTRY` `ENV_FILE` をエクスポートする
- Produces: `require_ssh_host` — SSH ホストが未指定なら**設定方法を表示して中断**する（#51 B）
- Produces: `workspace_root` — このスクリプト群からワークスペースルートを解決する

- [ ] **Step 1: `deploy/lib/common.sh` を書く**（下記「実装」参照）
- [ ] **Step 2: `app.env` を 2 つ書く**（上表の値）
- [ ] **Step 3: 構文チェック** — `bash -n deploy/lib/common.sh`
- [ ] **Step 4: 読み込みの検証（赤→緑）**
  - 存在しないアプリ名で中断すること: `bash -c 'source deploy/lib/common.sh; load_app nosuch'` が非 0
  - 必須キーを 1 つ削った一時 app.env で中断すること
  - 正しい app.env で `SERVICE` 等が期待値になること
- [ ] **Step 5: コミット**

## Task 2: `deploy/deploy.sh <app>` を作る（#51 B）

**Files:**
- Create: `deploy/deploy.sh`
- Delete: `deploy/timer/deploy.sh`, `deploy/poker/deploy.sh`

**Interfaces:**
- Consumes: Task 1 の `load_app` / `require_ssh_host`
- Produces: `./deploy/deploy.sh <app>` — 対象アプリだけを `turbo --filter` でビルドし、rsync/scp で配置し、そのアプリの service のみ再起動する

- [ ] **Step 1: SSH ホスト未指定で中断することを先に確かめる（赤）**
  `TASUKI_SSH_HOST` 未設定で `./deploy/deploy.sh timer` を実行し、**ネットワークに触れる前に**中断してメッセージが出ること
- [ ] **Step 2: 実装**
- [ ] **Step 3: 構文チェックとドライラン**
  `bash -n`、および `DRY_RUN=1 TASUKI_SSH_HOST=dummy ./deploy/deploy.sh timer` で実行されるコマンド列を表示だけさせる
- [ ] **Step 4: ビルド段だけ実際に走らせる（SSH 不要）**
  timer と poker の両方で `WEB_DIST/index.html` と `deploy/<app>/dist/server.js` が生成されること
- [ ] **Step 5: 単一アプリだけがビルドされることを確認**
  `--filter` により相手側の dist が更新されないこと（mtime で確認）
- [ ] **Step 6: コミット**

## Task 3: `deploy/setup.sh <app>` を作る（#51 A）

**Files:**
- Create: `deploy/setup.sh`, `deploy/timer/service.tmpl`, `deploy/poker/service.tmpl`, `deploy/timer/env.example`, `deploy/poker/env.example`
- Delete: `deploy/timer/vps-setup.sh`, `deploy/timer/tasuki-sync.service`, `deploy/timer/tasuki-sync.env.example`, `deploy/poker/poker-sync.service`

**Interfaces:**
- Consumes: Task 1 の `load_app`
- Produces: `sudo bash deploy/setup.sh <app>` — ディレクトリ・env・systemd ユニット・sudoers を冪等に用意する。ユニットは `service.tmpl` から `DEPLOY_USER` / `SERVICE` / `APP_DIR` / `ENV_FILE` / `PORT` を置換して生成する

- [ ] **Step 1: 現状の欠陥を再現する（赤）**
  `DEPLOY_USER=tomohiro` で旧 `vps-setup.sh` のヒアドキュメント部分を取り出して実行し、**`User=deploy` のまま**であることを示す
- [ ] **Step 2: テンプレートと生成ロジックを実装**
- [ ] **Step 3: 生成結果を検証する（緑）**
  `DEPLOY_USER=tomohiro` で生成したユニットの `User=` / `Group=` が `tomohiro` になること。`deploy` でも同様に追随すること
- [ ] **Step 4: 既存ユニットとの食い違いガードを検証**
  既存ユニットの `User=` と指定値が異なる場合に**中断**すること（上書きして本番を壊さない）
- [ ] **Step 5: 冪等性の確認** — 2 回実行しても結果が同じであること
- [ ] **Step 6: コミット**

## Task 4: Caddy を import 構成にする

**Files:**
- Create: `deploy/caddy/tasuki.conf`
- Modify: `deploy/timer/Caddyfile.timer`（新規・旧 `Caddyfile.production` の中身を断片化）, `deploy/poker/Caddyfile.poker`
- Delete: `deploy/timer/Caddyfile`, `deploy/timer/Caddyfile.production`, `deploy/timer/caddy-setup.sh`

**Interfaces:**
- Produces: ホスト側 `/etc/caddy/Caddyfile` の `tasuki.niku9.click` ブロックが `import /etc/caddy/tasuki/*.conf` だけを持つ形

- [ ] **Step 1: 現行本番の Caddyfile と等価な断片に分解する**
  timer 断片は `handle /ws*` → `127.0.0.1:8787` と SPA フォールバックを持つ。**この段では公開パスを変えない**（`/` = timer のまま）
- [ ] **Step 2: poker 断片は用意するが import 対象に入れない**
  S4 まで poker は非公開。`tasuki.conf` のコメントで「poker は S4 で import を有効化する」と明記する
- [ ] **Step 3: 断片の順序依存をドキュメント化**
  Caddy の `handle` は記述順に評価される。SPA フォールバックの `handle` は**最後**に来る必要がある
- [ ] **Step 4: コミット**

## Task 5: ドキュメントを実行可能な形に整える（#51 B・C）

**Files:**
- Create: `deploy/README.md`, `deploy/timer/NOTES.md`, `deploy/poker/NOTES.md`
- Delete: `deploy/timer/README.md`, `deploy/poker/README.md`
- Modify: `docs/BACKLOG.md`

**Interfaces:**
- Consumes: Task 2・3 の実際のコマンド形
- Produces: そのままコピペで実行できる手順

- [ ] **Step 1: `deploy/README.md` を書く** — 通常運用・初回セットアップ・切り戻しを、**環境変数を明示した実行可能な形**で
- [ ] **Step 2: 旧 README の固有情報を `NOTES.md` へ退避** — bun のパス、sudoers、過去の経緯など
- [ ] **Step 3: `docs/BACKLOG.md` を更新（#51 C）** — `v2.12.0` → `v2.13.0`、履歴行に追記
- [ ] **Step 4: README に書いたコマンドを実際に叩いて検証**
  少なくとも「SSH 不要な部分」（ビルド・生成・構文チェック）はそのまま実行して通ること
- [ ] **Step 5: コミット**

## Task 6: 全体検証と PR

- [ ] **Step 1: 全スクリプトの構文チェック** — `bash -n` を deploy 配下の全 `.sh` に
- [ ] **Step 2: shellcheck（あれば）**
- [ ] **Step 3: ワークスペースの検証が壊れていないこと** — `turbo run typecheck lint build test` が 23 タスク・1,724 件全緑
- [ ] **Step 4: 秘密情報が混入していないこと** — `git diff` に env の実体・トークン・鍵が無いこと
- [ ] **Step 5: PR を作成**（本番検証未実施を明記し、#51 との関係を書く）

---

## リスクと対処

| リスク | 対処 |
|---|---|
| 生成したユニットが本番の稼働ユニットと食い違い、`setup.sh` 再実行でサービスが壊れる | Task 3 Step 4 の**食い違いガード**で中断させる。`--force` を付けない限り上書きしない |
| Caddy 断片の順序を誤り、SPA フォールバックが先に効いて `/ws` が届かない | `tasuki.conf` に順序の制約をコメントで明記し、断片名を番号接頭辞（`10-`, `20-`, `90-`）にして順序を明示する |
| poker の資材を作った勢いで本番へ出してしまう | `tasuki.conf` の poker import を**コメントアウトした状態**で入れる。有効化は S4 |
| deploy.sh の共通化で timer のデプロイ経路が壊れる | ビルド段までを実際に実行して成果物を確認する。実デプロイでの最終確認は epic 完了時にまとめて |
