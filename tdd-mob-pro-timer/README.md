# TDD Mob Pro Timer

モブプログラミングを TDD で実践するチームのための、**交代タイマー兼お題出題ツール**。

2〜10 人のチームが、設定した間隔で「ドライバー（キーボードを打つ人）」を自動的に回し、
全員が同一のカウントダウンと同一のセッション状態をほぼ即時に共有します。お題（プログラミング課題）は
サーバー常駐の AI 生成（合言葉で解錠・運営者の Claude サブスクを使用）または定型バンクから出題され、
AI 生成に失敗しても定型お題へ自動縮退します。完成時には所要時間・交代回数などの記録が残ります。

## 特徴

- **共有タイマー**: 全参加者が同一の残り時間・現/次ドライバーを見て交代できる（サーバー権威の時計）
- **自動・手動交代**: 交代間隔（3/5/7/10/15 分）で自動交代、手動スキップも可能
- **役割と権限**: 主催者・編集者・観覧者の三段階。コマンドごとに権限を検証
- **耐障害性**: 回線切断後の自動復帰、主催者不在時の自動委譲（既定 30 秒）
- **お題出題**: サーバー常駐の AI 生成（合言葉で解錠）または定型バンク。AI 生成失敗時は定型へ自動縮退
- **ソロモード**: サーバー・通信なしで完全ローカルに完結
- **記録**: 完成記録を各端末のローカル（IndexedDB）に保存、JSON で入出力
- **アクセシビリティ**: キーボード操作・ARIA 通知・ダークモード・モーション軽減対応

## アーキテクチャ概要

3 つのワークスペースから成る pnpm モノレポです。詳細は [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) を参照してください。

| パッケージ | 役割 |
|---|---|
| `packages/core`（`@tdd-mob/core`） | 純粋ドメイン（`decide`/`evolve`・時刻導出・お題・記録・スキーマ・i18n）。front/server で共有 |
| `apps/sync`（`@tdd-mob/sync`） | 軽量同期サーバー（WebSocket・full snapshot 配信・サーバー権威タイマー・揮発状態） |
| `apps/web`（`@tdd-mob/web`） | フロントエンド（React + Vite）。WS クライアント・ソロモード・記録・UI |

設計判断の経緯は [docs/adr/](./docs/adr/) の ADR を参照してください。

## 前提条件

- Node.js 20 以上
- pnpm 9.x（`packageManager: pnpm@9.15.0`）
- （任意）Bun — `apps/sync` の開発起動 `bun run --watch` を使う場合

## インストール

```bash
cd tdd-mob-pro-timer
pnpm install
```

## 開発

```bash
# 全ワークスペースを並列起動（Turborepo）
pnpm dev

# 個別起動
pnpm --filter @tdd-mob/web dev     # フロント（Vite, 既定 5173）
pnpm --filter @tdd-mob/sync dev    # 同期サーバー（Bun, 既定 8787）
```

Vite の開発サーバーは `/ws` を同期サーバー（`ws://localhost:8787`）へプロキシします
（`apps/web/vite.config.ts`）。ブラウザは常に同一オリジンの `/ws` に接続します。

### AI お題生成をローカルで試す

AI お題生成は、サーバー env に **OAuth トークン**と**解錠の合言葉**の両方を設定したときだけ有効になります。
どちらかが欠けると AI 機能は丸ごと無効で、お題は定型バンクのみになります（解錠も常に失敗＝機能の存在を秘匿）。
設計の詳細は [../docs/superpowers/specs/2026-06-12-ai-problem-generation-design.md](../docs/superpowers/specs/2026-06-12-ai-problem-generation-design.md)、
本番デプロイ手順は [deploy/README.md](./deploy/README.md) の「AI お題生成」節を参照してください。

#### 1. OAuth トークンを用意する

AI 生成は `claude -p` 子プロセス（スタンドアロンの claude バイナリ）で行い、運営者（あなた）の
Claude サブスクの月次 Agent SDK クレジットを使います。Claude Agent SDK 専用の OAuth トークンを
以下のコマンドで発行してください。

```bash
claude setup-token      # → sk-ant-oat01-... が出力される
```

> ⚠ このトークンは個人アカウントのサブスク・クレジットを実際に消費します（共有・プール不可）。
> 第三者から読める場所には置かず、自己ホストで自分の契約の範囲に限って使ってください。
> ローカルでは次の手順で `apps/sync/.env`（gitignore 済み）にのみ書きます。

#### 2. `.env` に設定して起動する

sync は Bun 起動で **cwd（`apps/sync`）の `.env` を自動で読み込みます**（dotenv 等は不要）。
テンプレートをコピーして値を埋めてください。`.env` は `.gitignore` 済みなので誤コミットの心配はありません。

```bash
cp apps/sync/.env.example apps/sync/.env
# apps/sync/.env を編集（最低限 CLAUDE_CODE_OAUTH_TOKEN と AI_UNLOCK_KEY。
# 下のログ例に合わせるなら AI_PROBLEM_MODEL=haiku も設定。未設定なら既定 sonnet）
```

ルートから `pnpm dev` を起動すると、turbo が各ワークスペースを適切な作業ディレクトリで回し、
sync は `apps/sync` を cwd とするため、この `apps/sync/.env` が読まれます。

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

#### 3. ブラウザで解錠して試す

1. ルームを作成 → ロビーの「お題・設定」タブを開く
2. セッション設定カードの末尾にある控えめなリンク **「AI でお題を生成する（合言葉が必要）」** をクリック
   （合言葉を知らない人には目立たない隠し導線です。host のみ表示）
3. `AI_UNLOCK_KEY` に設定した合言葉を入力して「解錠」→「AI 生成: 有効」表示になる
4. お題パネルの **「別のお題にする」** を押すと AI が新しいお題を生成（haiku で 15〜40 秒・お題に「AI」バッジ）
5. 「定型に戻す」でいつでも定型バンクへ切替

合言葉が一致しなければ「合言葉が違います。」と表示され、生成は走りません。生成に失敗（タイムアウト・
検証失敗・トークン失効など）しても必ず定型お題へ縮退するため、お題が出ない状態にはなりません。

> 実機確認の前に必ず旧プロセスを掃除してから単一起動してください（WSL では vite の HMR 取りこぼし・
> ゾンビプロセスが古いコードを配信する罠があります）:
> `for p in $(lsof -ti tcp:5173 tcp:8787); do kill -9 $p; done`

### 同期サーバーを Node で起動する場合

`apps/sync` は既定で Bun 起動ですが、Bun が無い環境では bundler 経由で Node 実行できます。
本番は Caddy（[deploy/Caddyfile](./deploy/Caddyfile)）を前段に置く構成を想定しています。

環境変数:

| 変数 | 既定 | 説明 |
|---|---|---|
| `PORT` | `8787` | 待受ポート |
| `ALLOWED_ORIGINS` | （空） | カンマ区切りの許可 Origin。**空の場合は全 Origin 許可**（本番は必ず設定する） |

## テスト

```bash
pnpm test:unit          # 全ワークスペースのユニットテスト
pnpm --filter @tdd-mob/core test:unit   # core のみ
pnpm typecheck          # 型チェック
pnpm build              # ビルド
```

ドメインは Vitest + fast-check（プロパティテスト）で不変条件を検証します。
振る舞いテスト（Example Map / 受け入れ基準 / Gherkin）は
[docs/plans/tdd-mob-pro-timer/](../docs/plans/tdd-mob-pro-timer/) にあります。

## ディレクトリ構成

```
tdd-mob-pro-timer/
├─ packages/core/        # @tdd-mob/core — 純粋ドメイン
│  └─ src/{aggregate,decide,evolve,events,errors,schemas,problem,records}.ts
├─ apps/sync/            # @tdd-mob/sync — 同期サーバー
│  └─ src/{domain なし→core 再利用, application/, ports/, adapters/, server.ts}
├─ apps/web/             # @tdd-mob/web — フロントエンド
│  └─ src/{ui/, sync/, solo/, ai/, records/, platform/}
├─ deploy/Caddyfile      # 本番前段（WSS・/ws リバースプロキシ）
└─ docs/                 # ARCHITECTURE.md / adr/
```

## ライセンス

MIT（予定）。
