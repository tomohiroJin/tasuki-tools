# Tasuki

モブプログラミング × TDD を支援する**ツール群（単一 monorepo）**。
Tasuki は複数ツールをまとめる傘ブランドで、各ツールは 1 つの pnpm workspace 上のパッケージとして管理します。

## 🔗 ライブデモ

**<https://tasuki.niku9.click/>** — TDD Mob Pro Timer を実際に試せます（ルーム作成 → 招待リンクで参加 → リアルタイム同期）。

> 現在この URL は timer を直接開きます。[#66](https://github.com/tomohiroJin/tasuki-tools/issues/66) のデプロイ後は
> **`/` が玄関 LP、timer は `/timer/`** になります（旧 `/?room=...` の共有リンクは `/timer/` へ転送されます）。

## 収録ツール

### 1. TDD Mob Pro Timer

モブプログラミングのドライバー交代タイマー＋お題出題ツール。**本番公開中。**

- **構成**
  - [`packages/timer-core`](packages/timer-core/) — ドメインロジック（集約・状態遷移・お題バンク・検証）
  - [`apps/timer-web`](apps/timer-web/) — フロントエンド（React + Vite・`base=/timer/`）
  - [`apps/timer-sync`](apps/timer-sync/) — リアルタイム同期サーバー（Bun + WebSocket・揮発インメモリ）
- **特徴**
  - WebSocket による全参加者リアルタイム同期（サーバープッシュ）
  - モブ順ローテーション表示・「今は誰の番か」の明示
  - 現ドライバー不在時の次担当への自動繰上
  - 任意のルーム参加合言葉
  - AI お題生成（任意・ホストの Claude サブスクで実行・未設定時は定型お題へ安全縮退）
- 概要: [`docs/timer/README.md`](docs/timer/README.md)
- アーキテクチャ: [`docs/timer/ARCHITECTURE.md`](docs/timer/ARCHITECTURE.md)
- 設計判断（ADR）: [`docs/timer/adr/`](docs/timer/adr/)

### 2. Planning Poker

見積り合意のためのプランニングポーカー。**実装完了・本番未公開**（初回公開は [#66](https://github.com/tomohiroJin/tasuki-tools/issues/66)）。

- **構成**
  - [`packages/poker-core`](packages/poker-core/) — ドメインロジック（デッキ・ラウンド・集計）
  - [`apps/poker-web`](apps/poker-web/) — フロントエンド（React + Vite・`base=/poker/`）
  - [`apps/poker-sync`](apps/poker-sync/) — リアルタイム同期サーバー（Bun + WebSocket）
- 概要: [`docs/poker/README.md`](docs/poker/README.md)
- SDD 成果物: [`docs/poker/specs/`](docs/poker/specs/)

### 3. 玄関（ツール選択 LP）

訪問者がツールを選ぶための入口。ツール選択そのものを「手札」にしており、poker と同じ
象牙の札が並ぶ。**実装完了・本番未公開**（初回公開は [#66](https://github.com/tomohiroJin/tasuki-tools/issues/66)）。

- **構成**: [`apps/landing`](apps/landing/) — Vite + React・静的サイト（同期サーバー無し・`base=/`）
- 世界観は [`packages/ui`](packages/ui/) の「夜のカードテーブル」を共有

## 起動方法

### 前提

- **Node.js 22 以上**（pnpm 11.5.0 が `node:sqlite` を使うため、20 では起動しません）
- pnpm 11.5.0（`packageManager` 宣言に従うので `corepack enable` でよい）
- **Bun** — 同期サーバーの起動と `apps/poker-sync` のテスト・ビルドに必要

```bash
corepack enable
pnpm install
```

### まとめて起動

```bash
pnpm dev     # turbo が全アプリの dev を並列起動する
```

起動したら **<http://localhost:5175/>（玄関 LP）を開いてください。**
ここが本番と同じ入口で、札をクリックすれば各ツールへ移動できます。

### 個別に起動

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
そのツールだけを触るとき向けで、**玄関からの導線を確かめるなら :5175 を使ってください**。

本番の Caddy 設定そのものを検証したいときは、リバースプロキシを立てて
`deploy/*/caddy/*.conf` の断片をそのまま使えます。手順は
[`deploy/caddy/README.md`](deploy/caddy/README.md)、実例は
[`docs/superpowers/specs/2026-08-05-s4-url-relocation-design.md`](docs/superpowers/specs/2026-08-05-s4-url-relocation-design.md) にあります。

## 開発

単一の pnpm workspace + turbo。ルートで全ツールをまとめて検証できます。

```bash
pnpm test        # 全パッケージのテスト（1,927 件 / 10 タスク）
pnpm typecheck
pnpm lint
pnpm build

# 4 つまとめて回すと 30 タスク
pnpm turbo test typecheck lint build

# 単一アプリだけを対象にする
pnpm turbo run build --filter=@tasuki/timer-web
```

### 検査はコンテナのファイルシステム上で回す

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

手動で回す検査（CI からは呼ばれません。[#70](https://github.com/tomohiroJin/tasuki-tools/issues/70) で組み込み予定）:

```bash
node scripts/audit-structure.mjs        # 構造監査
node --test scripts/audit-structure.test.mjs
node scripts/mutation-check.mjs         # 変異検査（作業ツリーが汚れていると実行不可）
```

### パッケージ

| パッケージ | ディレクトリ | 役割 |
|---|---|---|
| `@tasuki/timer-core` | `packages/timer-core` | timer のドメイン |
| `@tasuki/timer-web` | `apps/timer-web` | timer の画面 |
| `@tasuki/timer-sync` | `apps/timer-sync` | timer の同期サーバー |
| `@tasuki/poker-core` | `packages/poker-core` | poker のドメイン |
| `@tasuki/poker-web` | `apps/poker-web` | poker の画面 |
| `@tasuki/poker-sync` | `apps/poker-sync` | poker の同期サーバー |
| `@tasuki/landing` | `apps/landing` | 玄関 LP |
| `@tasuki/ui` | `packages/ui` | 共通ビジュアル「夜のカードテーブル」（CSS のみ） |
| `@tasuki/protocol` | `packages/protocol` | 信頼境界のパース（外部入力 → 検証済みの値） |

## ドキュメント

- ツール別ドキュメント: [`docs/timer/`](docs/timer/) / [`docs/poker/`](docs/poker/)
- 仕様駆動開発（SDD）の成果物: [`docs/plans/`](docs/plans/)（spec / plan / tasks）
- バックログ: [`docs/BACKLOG.md`](docs/BACKLOG.md)
- 開発計画・設計メモ: [`docs/superpowers/`](docs/superpowers/)
- デプロイ資材: [`deploy/`](deploy/)（共通手順・アプリ別の資材・Caddy 断片）

## 技術スタック

TypeScript / React 19 + Vite / Bun / WebSocket / Valibot / neverthrow / Vitest / bun:test / turbo

## ステータス

| ツール | 公開パス | 状態 |
|---|---|---|
| TDD Mob Pro Timer | `/timer/` | 本番公開中（現在は `/`。[#66](https://github.com/tomohiroJin/tasuki-tools/issues/66) で移設） |
| Planning Poker | `/poker/` | 実装完了・**本番未公開** |
| 玄関 LP | `/` | 実装完了・**本番未公開** |

単一 monorepo への統合は [epic #15](https://github.com/tomohiroJin/tasuki-tools/issues/15) で**実装完了**しました
（設計: [`docs/superpowers/specs/2026-08-04-monorepo-unification-design.md`](docs/superpowers/specs/2026-08-04-monorepo-unification-design.md)）。
**残るのは本番への反映 1 回だけ**で、[#66](https://github.com/tomohiroJin/tasuki-tools/issues/66) が引き継いでいます。
そこで poker と玄関 LP が初めて公開されます。

続く整備は [epic #67](https://github.com/tomohiroJin/tasuki-tools/issues/67)（規範・依存・CI/CD・ADR に沿った作り直し）と
[#73](https://github.com/tomohiroJin/tasuki-tools/issues/73)（E2E テスト新設）で進めます。
