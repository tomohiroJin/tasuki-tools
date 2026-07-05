# ローカル `.env` ファイル方式 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ローカル開発で AI お題生成（および sync の全 env）を `apps/sync/.env` ファイルで設定できるようにし、README をその方式に書き換える。

**Architecture:** sync は Bun 起動（`bun run --watch src/server.ts`）で、Bun は cwd（`apps/sync`）の `.env` を自動読み込みする（実機確認済み）。コード追加（dotenv 等）は不要。`apps/sync/.env.example` をテンプレとして新設し、開発者は `cp .env.example .env` して値を埋める。`.env` は既存 `.gitignore`（`.env` / `.env.*` / `!.env.example`）で無視され、`.env.example` のみ追跡される（実機確認済み）。

**Tech Stack:** Bun（`.env` 自動読み込み）/ pnpm + Turborepo / 既存の `loadSyncConfig(process.env)`

**前提（確認済み・変更不要）:**
- `env 無し → AI 無効` は実装済み（`server.ts` の `aiReady = Boolean(config.claudeOauthToken && config.aiUnlockKey)`）
- `.gitignore`（`local/Tasuki/.gitignore`）に `.env` / `.env.*` / `!.env.example` 設定済み
- Bun が `apps/sync/.env` を自動読み込みすることを `bun -e` で確認済み
- 本番用 `deploy/tasuki-sync.env.example`（systemd EnvironmentFile 用）は据え置き（ローカル用と 2 つ持ち＝ユーザー承認方針）

**作業環境メモ:**
- リポジトリ: `/workspaces/claym/local/Tasuki`（独立 git リポジトリ）。ブランチ `feature/local-env-file` チェックアウト済み
- pnpm は `~/.local/bin/pnpm`、bun は `~/.bun/bin/bun`
- コメント日本語。`apps/sync/package.json` に `workspaces` が混入する bun の副作用に注意（コミット前 `git status` 確認）

---

## File Structure

| ファイル | 役割 | 操作 |
|---|---|---|
| `apps/sync/.env.example` | ローカル開発用の env テンプレート（全 env・AI 含む・Bun 自動読み込み前提の注意書き） | 新規作成 |
| `README.md` | 「AI お題生成をローカルで試す」節を `.env` 方式へ書き換え。Node 起動節の env 表との整合 | 修正 |

テストコード変更なし（ドキュメント＋設定テンプレのため）。検証は「実起動で `.env` が読まれること」を手動で行う。

---

### Task 1: ローカル用 `apps/sync/.env.example` を新設する

**Files:**
- Create: `apps/sync/.env.example`

- [ ] **Step 1: テンプレートを作成する**

`apps/sync/.env.example` を以下の内容で新規作成する（本番用 `deploy/tasuki-sync.env.example` と変数名・既定値を一致させつつ、ローカル開発向けの注意書きにする）:

```bash
# Tasuki sync server 環境変数（ローカル開発用）
#
# 使い方: このファイルを同じディレクトリに `.env` としてコピーし、値を埋める。
#   cp .env.example .env
# sync は Bun 起動（bun run --watch src/server.ts）で、Bun が cwd の .env を
# 自動読み込みする。dotenv 等の追加設定は不要。
# `.env` は .gitignore 済み（このテンプレート .env.example だけがコミットされる）。
# ルートから `pnpm dev` で起動すると turbo が apps/sync を cwd に dev を回すため、
# この apps/sync/.env が読まれる。

# 待ち受けポート（vite の /ws プロキシ先と一致：既定 8787）
#PORT=8787

# 待ち受けインターフェース（ローカルは既定の 127.0.0.1 で十分）
#HOST=127.0.0.1

# WebSocket 接続を許可する Origin（カンマ区切り）。
# 空なら全 Origin 許可（dev 向け。本番では必ず設定する）。
#ALLOWED_ORIGINS=

# ─── AI お題生成（任意・両方設定したときのみ有効） ───
# 設定しなければ AI 機能は無効＝お題は定型バンクのみ（解錠も常に失敗）。
#
# OAuth トークン: ローカルで `claude setup-token` を実行して発行する（要 Claude サブスク）。
# ⚠ 個人アカウントのサブスク・クレジットを消費（共有/プール不可）。自己ホストで自分の契約に限る。
#CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...

# 解錠の合言葉（これを知るルームの host だけが AI 生成を有効化できる）。
#AI_UNLOCK_KEY=

# 生成モデル（既定 sonnet。検証は速くて安い haiku が便利）。
#AI_PROBLEM_MODEL=haiku

# 生成のタイムアウト（ms・既定 60000）。超過で定型へ縮退。
#AI_GENERATION_TIMEOUT_MS=60000

# 日次生成回数の上限（グローバル・既定 100）。0 でその日の生成を全面停止。
#AI_DAILY_LIMIT=100
```

- [ ] **Step 2: gitignore されることを確認する**

Run:
```bash
cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/sync
printf 'X=1' > .env && git check-ignore .env && echo "OK: .env は無視される" && rm -f .env
git check-ignore .env.example || echo "OK: .env.example は追跡される"
```
Expected: `.env`（無視される）と表示 → `OK: .env は無視される`、`.env.example` は出力なし → `OK: .env.example は追跡される`

- [ ] **Step 3: 実際に `.env` が読まれることを確認する**

`.env` を一時作成し、Bun が cwd から読むことを確認する（server は起動せず env 読み込みだけ検証）:

Run:
```bash
cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/sync
cp .env.example .env
printf '\nAI_UNLOCK_KEY=plan-test\nAI_PROBLEM_MODEL=haiku\n' >> .env
~/.bun/bin/bun -e 'console.log("読込:", process.env.AI_UNLOCK_KEY, process.env.AI_PROBLEM_MODEL)'
rm -f .env
```
Expected: `読込: plan-test haiku`

- [ ] **Step 4: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git status --short   # apps/sync/.env が混入していないこと・package.json に workspaces 混入がないことを確認
git add tdd-mob-pro-timer/apps/sync/.env.example
git commit -m "feat(sync): ローカル開発用 .env.example を追加（Bun 自動読み込み）"
```

---

### Task 2: README を `.env` ファイル方式に書き換える

**Files:**
- Modify: `README.md`（60〜120 行付近「### AI お題生成をローカルで試す」節）

- [ ] **Step 1: 「2. env を渡して起動する」を `.env` 方式へ書き換える**

`README.md` の現在の「#### 2. env を渡して起動する」ブロック（83〜104 行付近、`env を付けて pnpm dev …` から AI 環境変数表まで）を、以下に置き換える:

```markdown
#### 2. `.env` に設定して起動する

sync は Bun 起動で **cwd（`apps/sync`）の `.env` を自動で読み込みます**（dotenv 等は不要）。
テンプレートをコピーして値を埋めてください。`.env` は `.gitignore` 済みなので誤コミットの心配はありません。

```bash
cp apps/sync/.env.example apps/sync/.env
# apps/sync/.env を編集し、最低限 CLAUDE_CODE_OAUTH_TOKEN と AI_UNLOCK_KEY を設定
```

ルートから `pnpm dev` を起動すると、turbo が `apps/sync` を作業ディレクトリにして
sync を回すため、この `apps/sync/.env` が読まれます。

```bash
pnpm dev
```

起動ログに `AI お題生成: 有効 (model=haiku)` が出れば設定成功です（無効時は `無効 (トークン/合言葉 未設定)`）。
モデルは未指定なら `sonnet`。検証では速くて安い `haiku` が便利です。

> コマンドラインに env を直接書いて渡すこともできます（`CLAUDE_CODE_OAUTH_TOKEN=... pnpm dev`）。
> その場合 `turbo.json` の `dev.passThroughEnv` 経由で透過します（新しい env を足すときは
> `passThroughEnv` も更新）。ただし `.env` 方式のほうがシェル履歴にトークンが残らず安全です。

AI 関連の環境変数:

| 変数 | 既定 | 説明 |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | （空） | `claude setup-token` で発行する OAuth トークン。子プロセスの env にのみ渡る（argv・ログ・snapshot 非混入） |
| `AI_UNLOCK_KEY` | （空） | 解錠の合言葉。これを知るルームの host だけが AI 生成を有効化できる |
| `AI_PROBLEM_MODEL` | `sonnet` | `claude -p --model` に渡すモデル名 |
| `AI_GENERATION_TIMEOUT_MS` | `60000` | 生成のタイムアウト（ms）。超過で定型へ縮退 |
| `AI_DAILY_LIMIT` | `100` | 日次生成回数の上限（グローバル）。`0` でその日の生成を全面停止 |
```

注: コードフェンスのネスト（外側 markdown ブロック内の ```bash）に注意。実ファイルでは内側を通常の ```bash として書く（このプラン上の表記だけネストして見える）。

- [ ] **Step 2: 「1. OAuth トークンを用意する」の見出し番号と本文整合を確認する**

「#### 1. OAuth トークンを用意する」はそのまま残す（`claude setup-token` と既存ログイン補足）。
「#### 3. ブラウザで解錠して試す」もそのまま残す。番号 1→2→3 が維持されていることを目視確認する。

- [ ] **Step 3: markdown の体裁を確認する**

Run:
```bash
cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer
sed -n '60,125p' README.md
```
Expected: 「#### 1.」「#### 2. `.env` に設定して起動する」「#### 3.」の 3 見出しが順に並び、
`cp apps/sync/.env.example apps/sync/.env` の手順と AI 環境変数表が含まれている。
壊れたコードフェンス（``` の閉じ忘れ）がないこと。

- [ ] **Step 4: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/README.md
git commit -m "docs(readme): AI お題生成のローカル手順を .env ファイル方式に変更"
```

---

### Task 3: 通し実機確認（`.env` で AI 生成が動く）

**Files:** なし（検証のみ。問題が出たら該当タスクの流儀で直す）

- [ ] **Step 1: 旧プロセスを掃除する**

```bash
for p in $(lsof -ti tcp:5173 tcp:5174 tcp:8787 2>/dev/null); do kill -9 $p 2>/dev/null; done
sleep 1; lsof -ti tcp:5173 tcp:8787 2>/dev/null || echo "ports clear"
```

- [ ] **Step 2: `.env` を作って起動する（README の手順どおり）**

```bash
cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer
cp apps/sync/.env.example apps/sync/.env
# claude setup-token で発行したトークンと合言葉を apps/sync/.env に設定する:
#   CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
#   AI_UNLOCK_KEY=test-himitsu
#   AI_PROBLEM_MODEL=haiku
PATH="$HOME/.local/bin:$PATH" pnpm dev > /tmp/tasuki_dev.log 2>&1 &
sleep 8
grep -E "AI お題生成|Local:" /tmp/tasuki_dev.log | head -2
```
Expected: 起動ログに `AI お題生成: 有効 (model=haiku)` と `Local: http://localhost:5173/`

- [ ] **Step 3: ブラウザで解錠→生成を確認する（chrome-devtools MCP）**

1. `http://localhost:5173/` を開く → ルーム作成 → 「お題・設定」タブ
2. 「AI でお題を生成する（合言葉が必要）」リンク → `test-himitsu` で解錠 →「AI 生成: 有効」表示
3. 「別のお題にする」で AI バッジ付きお題が出る（haiku で 15〜40 秒）

Expected: 解錠成功・AI 生成成功（README の手順が `.env` 方式で完結することの確認）

- [ ] **Step 4: 後始末（`.env` は gitignore 済みだが手動削除）**

```bash
cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer
for p in $(lsof -ti tcp:5173 tcp:5174 tcp:8787 2>/dev/null); do kill -9 $p 2>/dev/null; done
rm -f apps/sync/.env
git status --short   # apps/sync/.env が追跡対象に出ないこと（gitignore 効果）を最終確認
```
Expected: `git status` に `apps/sync/.env` が現れない（無視されている）。作業ツリーはクリーン。

---

## スペック対応表（セルフレビュー用）

| 要求 | タスク |
|---|---|
| ローカル用 `apps/sync/.env.example` 新設（AI 含む全 env） | Task 1 |
| `.env` が gitignore され `.env.example` だけ追跡 | Task 1 Step 2 |
| Bun が `.env` を自動読み込み（コード追加なし） | Task 1 Step 3 / Task 3 |
| README を `.env` 方式に書き換え | Task 2 |
| 本番用 example は据え置き（2 つ持ち） | 変更しない（明記） |
| env 無し→AI 無効 | 実装済み（変更なし・前提に記載） |
| 通し実機確認 | Task 3 |
