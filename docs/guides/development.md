# 開発ガイド

## このガイドの位置づけ

**起動・テスト・検査の手順の正本はこのガイドです。** 書き分けの規則は
[`docs/adr/0002`](../adr/0002-document-system-three-layers.md)（文書体系の三層構造）を
参照してください。

## 前提

- **Node.js 22 以上**（pnpm 11.5.0 が `node:sqlite` を使うため、20 では起動しません）
- pnpm 11.5.0（`packageManager` 宣言に従うので `corepack enable` でよい）
- **Bun** — 同期サーバーの起動と `apps/poker-sync` のテスト・ビルドに必要

```bash
corepack enable
pnpm install
```

## まとめて起動

```bash
pnpm dev     # turbo が全アプリの dev を並列起動する
```

起動したら **<http://localhost:5175/>（玄関 LP）を開いてください。**
ここが本番と同じ入口で、札をクリックすれば各ツールへ移動できます。

### 玄関から通しで使う

**<http://localhost:5175/> を入口にすると、本番と同じ形で 3 系統を行き来できます。**
LP の dev サーバーが本番の Caddy と同じ役割を担い、`/timer/` と `/poker/` を
それぞれの dev サーバーへ転送します（WebSocket も通します）。

| 入口 | 到達先 |
|---|---|
| <http://localhost:5175/> | 玄関 LP |
| <http://localhost:5175/timer/> | timer（札をクリックしても移動する） |
| <http://localhost:5175/poker/> | poker（同上） |
| `/timer/ws`・`/poker/ws` | 各同期サーバー |

各ツールの dev サーバー（:5173 / :5174）を直接開いても動きます。そちらは
そのツールだけを触るとき向けで、**玄関からの導線を確かめるなら :5175 を使ってください。**

本番の Caddy 設定そのものを検証したいときは、リバースプロキシを立てて
`deploy/*/caddy/*.conf` の断片をそのまま使えます。手順は
[`deploy/caddy/README.md`](../../deploy/caddy/README.md)、実例は
[`docs/superpowers/specs/2026-08-05-s4-url-relocation-design.md`](../superpowers/specs/2026-08-05-s4-url-relocation-design.md)
にあります。

## 個別起動

Tasuki は **5 つのプロセス**（web 3 + 同期サーバー 2）で構成されます。
用途に応じて必要なものだけ起動してください。

| プロセス | コマンド | 開く URL |
|---|---|---|
| 玄関 LP | `pnpm --filter @tasuki/landing dev` | <http://localhost:5175/> |
| timer の画面 | `pnpm --filter @tasuki/timer-web dev` | <http://localhost:5173/timer/> |
| timer の同期サーバー | `pnpm --filter @tasuki/timer-sync dev` | （:8787・画面から使う） |
| poker の画面 | `pnpm --filter @tasuki/poker-web dev` | <http://localhost:5174/poker/> |
| poker の同期サーバー | `pnpm --filter @tasuki/poker-sync dev` | （:3311・画面から使う） |

各アプリは本番と同じ `base` で配信されます。ブラウザで `http://localhost:5173/` のように
base を省いて開いた場合は、Vite が **302 で `/timer/` へリダイレクト**するので表示できます。
ただし `curl` など**リダイレクトを追わないクライアントでは 302 のまま**なので、
動作確認では末尾のパスまで指定してください。

同期サーバーを起動していないと、画面は開けても**ルームの作成・参加ができません**。
timer なら timer-sync、poker なら poker-sync が対になります。

> ポートが埋まっていると Vite は次の空きポートへ逃げます。起動時のログに出る URL が正です。
>
> `pnpm dev` は `--continue` 付きで動くので、**1 つ失敗しても残りは起動します**。
> ただし同期サーバーが `EADDRINUSE` で落ちていても画面は開けてしまい、
> **ルームを作ろうとして初めて気づく**ことになります。起動ログにエラーが出ていないか
> 確認してください。古い開発サーバーが残っている場合は先に片付けます。
>
> ```bash
> ss -tlnp | grep -E ':(8787|3311|517[3-5])'   # 誰が掴んでいるか
> ```

## 依存の更新

公開直後の版（7 日未満）は `pnpm install` の段で拒否されます
（`pnpm-workspace.yaml` の `minimumReleaseAge`。判断の根拠は
[`docs/adr/0008`](../adr/0008-dependency-supply-chain.md)）。

### 通常の更新

```bash
pnpm outdated -r   # 全プロジェクトを見る。ルートのみの pnpm outdated は実行時依存を取りこぼす
pnpm update <pkg>  # 宣言済み semver 範囲内で更新
```

### 緊急の脆弱性修正を待機期間中に取り込む例外手順

7 日未満の版をどうしても取り込む必要がある場合のみ、対象パッケージだけを
`minimumReleaseAgeExclude` で除外します。

```yaml
# pnpm-workspace.yaml
minimumReleaseAgeExclude:
  # 【期限つき】GHSA-xxxx-xxxx-xxxx の修正取り込みのため一時除外。
  # 解除予定: 2026-08-17（当該版が公開から 7 日を超える日）
  - "dompurify"
```

- 除外は**特定パッケージのみ**に絞る。`pnpm install --trust-lockfile` で
  検証を全体的に切ることはしない
- **理由・対象アドバイザリ・解除予定日をコメントに残す**
- **解除を完了条件に含める**（消し忘れると恒久設定になる）

### ローカル確認時の注意

`node_modules` が最新のとき、pnpm は「Already up to date」で短絡し**供給網検証を
走らせません**。ローカルで違反件数を確認するときは、必ず先に `node_modules` を
消してから `pnpm install --frozen-lockfile` を実行してください。

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules
pnpm install --frozen-lockfile
```

CI は毎回フレッシュな checkout なのでこの短絡は起きません。**この罠にかかるのは
ローカルでの確認作業だけです。**

### CI での扱い

CI の `pnpm install --frozen-lockfile` は `--trust-lockfile` を付けません。
待機期間の検証を常に効かせるためです（決定は ADR 0008）。

違反が出たときに取れる手は次の 3 つに限られます。「違反したエントリだけを
古い版へ解決し直す」手段は存在しません（検証が解決より先に走るため）。

1. **待つ**: 当該版が公開から 7 日を超えるのを待つ（最も安全）
2. **期限つき除外**: 上記の例外手順を使う
3. **全面再解決**: `pnpm clean --lockfile && pnpm install`（lockfile 全体の diff になるため単独 PR にする）

## テスト

単一の pnpm workspace + turbo。ルートで全ツールをまとめて検証できます。

```bash
pnpm test        # 全パッケージのテスト
pnpm typecheck
pnpm lint
pnpm build

# 4 つまとめて回す
pnpm turbo test typecheck lint build

# 単一アプリだけを対象にする
pnpm turbo run build --filter=@tasuki/timer-web
```

`pnpm test` は turbo 経由で 10 パッケージ（`@tasuki/timer-core` `@tasuki/timer-web`
`@tasuki/timer-sync` `@tasuki/poker-core` `@tasuki/poker-web` `@tasuki/poker-sync`
`@tasuki/landing` `@tasuki/protocol` `@tasuki/ui` `@tasuki/e2e`）のテストを実行し、
2026-08-10 時点で**全 1,970 件**が緑になります（コンテナのファイルシステム上・
コールド実行で約 30 秒）。

### 9p 越しでは実行しない

devcontainer を **Windows / WSL のマウント（`/workspaces` など 9p 越しのパス）** で開いている場合、
リポジトリをコンテナ側のファイルシステム（`/home/vscode` 配下など）へクローンし、**そちらで検査を回してください。**
テストランナーは大量のファイルを読むため、9p 越しだと I/O がすべてプロトコル越しになり桁違いに遅くなります。

| 実行場所 | キャッシュ | `pnpm test` の所要 |
|---|---|---|
| 9p マウント上 | 10 件中 1 件ヒット | **22 分 38 秒** |
| コンテナのファイルシステム上 | **0 件ヒット（`--force`）** | **28.3 秒** |

いずれも 2026-08-09 の実測（[#84](https://github.com/tomohiroJin/tasuki-tools/issues/84)）。
**キャッシュが冷たい側が約 48 倍速い**ので、差はキャッシュではなくファイルシステムに由来します。
参考までに CI（GitHub Actions）の `ci` ジョブは 2 分 5 秒で、こちらも毎回コールドです
（ワークフローは turbo のキャッシュを永続化していません）。

## E2E

本番と同一の Caddy 断片・実ビルド成果物・実 sync サーバーをローカルに立ち上げ、
`/`・`/timer/`・`/poker/` の 3 系統が外から見て正しく振る舞うことを確認します。

```bash
pnpm build            # web アプリのビルドが必要（^build として依存）
pnpm e2e              # ローカル環境に立てて全シナリオを実行
pnpm e2e --grep @smoke   # @smoke タグのシナリオだけ実行
```

**`pnpm dev` と同時には実行できません。** Caddy（`18080`）と timer-sync（`8787`）・
poker-sync（`3311`）を実際に起動するため、`pnpm dev` と同じポートを共有します。
`pnpm dev` を止めてから `pnpm e2e` を実行してください。

異常終了（SIGKILL など）で残骸が残った場合は、次回起動時の `preflight` が検出して
落とすので、その指示に従って手動で撤去します（`sudo rm -rf /etc/caddy/tasuki` 等）。

シナリオ・タグの一覧、本番向け実行（`pnpm e2e:prod`）、終了後の確認コマンド、
異常終了時の詳しい復旧手順は [`e2e/README.md`](../../e2e/README.md) を参照してください
（詳細の正本はそちらです。ここでは二重管理しません）。

## 検査系

CI からは呼ばれない手動の検査です（[#70](https://github.com/tomohiroJin/tasuki-tools/issues/70) で組み込み予定）。

```bash
node scripts/audit-structure.mjs        # 構造監査
node --test scripts/audit-structure.test.mjs
node scripts/mutation-check.mjs         # 変異検査
```

**変異検査は作業ツリーが汚れていると実行できません。** `mutation-check.mjs` は
対象箇所を意図的に壊して既存テストが赤くなるかを確認する仕組みのため、
コミットされていない変更が残っていると自分の変更なのか検出漏れなのか
区別できず、実行前に working tree のクリーンさを要求します。

## 関連

- 書き分けの規則: [`docs/adr/0002`](../adr/0002-document-system-three-layers.md)（文書体系の三層構造）
- E2E の詳細（シナリオ・タグ・復旧手順）: [`e2e/README.md`](../../e2e/README.md)
- 本番 Caddy 設定の検証手順: [`deploy/caddy/README.md`](../../deploy/caddy/README.md)
