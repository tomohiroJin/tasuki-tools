# AI お題生成 — 設計（サーバ常駐・サブスククレジット・合言葉解錠）

- 日付: 2026-06-12
- ステータス: 実装完了（2026-06-13・実機 E2E 検証済み）
- 関連: BACKLOG「[機能] AI お題生成」、`docs/plans/tdd-mob-pro-timer/spec.md` FR-021〜FR-027、
  v2.2 Phase 3b ルームパスフレーズ（`2026-06-10-v2.2-experience-improvements` 系）

## 背景と目的

タスキのお題は現在、定型バンク（33 件）のみで供給されている。`problemMode==="ai"` の経路・
`ProblemDelegator` の deadline/再委譲/縮退・`buildProblemPrompt`/`validateProblem` という
「AI 生成のレール」は v1 から実装済みだが、生成器が空席（全クライアント `hasAiKey: false`、
`resolveProvider()` は常に `NoAiProvider`）のため実質未稼働だった。

2026-06-15 から Claude サブスクリプションに月次 Agent SDK クレジットが付与され
（Pro $20/月 等。`claude -p`・Agent SDK・サードパーティアプリでの利用が対象）、
運営者のサブスク契約でサーバサイド生成を行うことが公式にサポートされた。
これを生成器として接続する。

参照: https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan

## 決定事項（ブレストで確定）

| 論点 | 決定 |
|------|------|
| 誰のクレジットか | **サーバ env に運営者の `CLAUDE_CODE_OAUTH_TOKEN` 一本**（`claude setup-token` で発行）。クレジットは個人アカウント単位で共有・プール不可のため、利用者ごと課金はしない |
| 有効化の範囲 | **合言葉（隠しキー）方式**。サーバ env の `AI_UNLOCK_KEY` を知るルームの host だけが AI 生成を解錠できる。未解錠・未設定は従来どおり定型バンクのみ |
| 実行方式 | **案 A: `claude -p` 子プロセス**（スタンドアロンバイナリ・Node 不要。子プロセス起動は `node:child_process`＝Bun でも動作し vitest でもテスト可能）。Agent SDK 組込み（Bun 互換未検証）と API 直叩き（従量課金）は不採用 |

## 全体アーキテクチャ

```
[ロビー: host が合言葉入力]
   │ ai.unlock {key}
   ▼
[sync] handleAiUnlock ─ 照合OK → room.aiUnlocked=true, problemMode="ai" → snapshot 配信
   │                                （合言葉・トークンは snapshot 非混入。boolean のみ）
   ▼
[problem.request] → ProblemDelegator.request()
   │
   ├─ problemMode==="ai" && aiUnlocked && サーバ provider 有効
   │     → ClaudeCliProblemProvider.generate()
   │        = spawn(["claude","-p","--output-format","json",...], prompt は stdin)
   │          env: CLAUDE_CODE_OAUTH_TOKEN
   │     → validateProblem() OK → finalize(source:"ai")
   │     → 失敗/タイムアウト(60s)/検証NG → pickFallback()（既存の縮退レール）
   │
   └─ それ以外 → 従来どおり即・定型バンク
```

既存原則を無変更で再利用する:

- **AI 由来テキストは信頼しないデータ**（FR-023）— `validateProblem` の Valibot 検証を通過したものだけ確定
- **失敗は必ず定型へ縮退**（FR-024）— 生成不能でもお題は必ず出る。サービスを止める方向の失敗を作らない
- **secret-zero の延長** — 合言葉・トークンの平文はサーバ専用（env / メモリ）のみ。snapshot には boolean
  だけ乗せる（ルームパスフレーズ実装と同型）

## core の変更（加算的のみ・既存イベントの破壊変更なし）

- `Room.aiUnlocked?: boolean` — `passphraseProtected` と同型の状態フラグ
- 新コマンドスキーマ `ai.unlock { key: string }` — 最大 64 字（`MAX_AI_UNLOCK_KEY`）・HOST_ONLY
- 以下は**無変更で再利用**: `problemMode`（`"ai" | "fallback"`）、`Problem.source`（`"ai"`）、
  `buildProblemPrompt`、`validateProblem`、`pickFallback`

## sync の変更

### config（すべて env・`loadSyncConfig` に追加）

| env | 既定 | 意味 |
|-----|------|------|
| `CLAUDE_CODE_OAUTH_TOKEN` | 未設定 | サブスク OAuth トークン（`sk-ant-oat01-`）。子プロセスの env にのみ渡す |
| `AI_UNLOCK_KEY` | 未設定 | 解錠の合言葉。trim 後空は未設定扱い |
| `AI_PROBLEM_MODEL` | `sonnet` | `claude -p --model` に渡す値 |
| `AI_GENERATION_TIMEOUT_MS` | `60000` | 子プロセスのタイムアウト |
| `AI_DAILY_LIMIT` | `100` | 日次生成回数上限（グローバル） |

**トークンと合言葉のどちらかが欠けると AI 機能は丸ごと無効**。解錠コマンドは常に失敗し、
機能の存在を秘匿する（管理エンドポイントの 426 秘匿と同じ思想）。

### 新 port / adapter

- port `ServerProblemProvider { generate(language, difficulty, signal): Promise<unknown> }`
  — テストでは Fake を注入
- adapter `ClaudeCliProblemProvider` — `claude -p --output-format json --model <model>` を
  `node:child_process` の spawn で起動し（Bun でも動作・vitest でもテスト可能）、**プロンプトは stdin で渡す**（argv 長・シェルエスケープ問題を回避）。
  `--output-format json` の `result` フィールドから JSON を抽出して返す。
  タイムアウトで `proc.kill()`。spawn 関数は注入可能にしてユニットテスト可能に保つ

### ハンドラ・委譲

- `handleAiUnlock` — host 限定。定数時間比較で照合（管理トークンと同様）。失敗は `joinFailures` 同様の
  レート制限に積算（総当たり対策）。成功で `aiUnlocked=true` + `problemMode="ai"` + snapshot 配信。
  失敗エラーコード: `AI_UNLOCK_FAILED`
- `ProblemDelegator.request()` 拡張 — 条件成立時にサーバ生成を最優先で実行。
  リロール（`cancel`）時は実行中の子プロセスも kill。requestId の stale 検査は既存パターンを踏襲。
  失敗時は既存の `buildCandidates` 経路（クライアント候補ゼロ → 定型確定）へ落ちる
- `problem.mode.set`（既存・EDITOR_PLUS）で AI ⇔ 定型を切替可能。`aiUnlocked` が false のルームで
  `"ai"` にしても生成条件を満たさないため定型のまま（害なし）

### 濫用抑制（超過時はエラーにせず定型へ縮退）

- ルームごと同時 1 件（既存 `active` Map で担保）
- ルームごとクールダウン 10 秒
- **グローバル同時実行 1**（直列化。下記「VPS リソース実測」参照 — 1GB RAM では同時 2 で swap 溢れ/OOM リスク）
- 日次上限 `AI_DAILY_LIMIT`（日付ロールオーバーでリセット・揮発で可）

### VPS リソース実測（2026-06-12・実行可能性の根拠）

| 項目 | 実測値 |
|------|--------|
| VPS 空きメモリ | 614MB（total 960MB・Caddy + sync 稼働中） |
| VPS swap | 2GB 設定済み（ほぼ未使用） |
| `claude -p` ピーク RSS（MCP 設定なし＝VPS 相当） | **355MB** |
| `claude -p` 最小応答の所要時間 | 8〜10 秒（生成本番は 15〜40 秒想定） |
| バイナリのディスク占有 | 約 240MB（ディスク 100GB で問題なし） |

結論: **同時 1 件なら RAM 内に収まる**（355MB < 614MB）。同時 2 件は 710MB で空きを超え
swap 溢れ・OOM killer が sync を巻き込むリスクがあるため不可。CPU はネットワークバウンドで
2 Core で十分。メモリ逼迫で生成が失敗しても定型縮退でサービス無停止。
お題生成は低頻度（ロビーで 1 回＋リロール数回）のため直列化による待ちは許容範囲。

## web の変更

- ロビー「お題・設定」タブの詳細設定内に host 限定「AI 生成の合言葉」入力
  （`PassphrasePanel` と同型の小 UI）。**入力欄は host に常時表示**する（サーバ側が未設定なら
  送信しても失敗するだけ。クライアントはサーバの設定状態を知らないため出し分けしない）。
  解錠済みは「AI 生成: 有効」表示と OFF トグル（`problem.mode.set` を再利用）
- お題ヘッダに `source==="ai"` のとき小さな「AI」バッジ（v3 で撤去したバッジの限定再導入）
- 生成待ち表示: 既存「お題を準備中」に AI 時の文言「AI が作成中…（最大 1 分）」を追加
- `ERROR_MESSAGES` に `AI_UNLOCK_FAILED`: 「合言葉が違います。」を追加

## エラー処理マトリクス

| 事象 | 挙動 |
|------|------|
| トークン or 合言葉未設定 | 解錠常時失敗（存在秘匿）。生成経路は無効 |
| 解錠合言葉不一致 | `AI_UNLOCK_FAILED` + レート制限積算 |
| claude -p 非ゼロ exit / stdout JSON 不正 | ログ記録 → 定型縮退 |
| validateProblem 失敗 | 定型縮退（既存 FR-023/024 どおり） |
| タイムアウト（60s） | 子プロセス kill → 定型縮退 |
| クールダウン/日次上限超過 | 生成スキップ → 定型縮退 |
| リロール（再リクエスト） | 旧 requestId の生成を cancel + 子プロセス kill |
| トークン失効 | 生成失敗 → 定型縮退（サービス無停止）。運用で `claude setup-token` 再発行 |

## テスト計画

- **core**: `ai.unlock` スキーマ検証・evolve（`aiUnlocked` フラグ）テスト
- **sync**:
  - 解錠: 成功 / 不一致 / 未設定秘匿 / レート制限 / host 以外拒否
  - 委譲統合（Fake provider）: 成功確定（source:"ai"）/ タイムアウト縮退 / 検証失敗縮退 /
    リロール時 cancel / クールダウン・日次上限縮退 / `aiUnlocked=false` では生成しない
  - adapter: spawn 注入ユニット（コマンドライン組立・JSON 抽出・kill）
- **web**: 合言葉パネル表示/送信・AI バッジ・エラーメッセージ
- **実機 E2E**: ローカル dev で実 `claude -p`（運営者の setup-token）による生成 →
  ロビーで解錠 → AI お題確定 → バッジ表示までブラウザ確認

## デプロイ・運用

1. VPS に claude スタンドアロンバイナリを導入（`curl -fsSL https://claude.ai/install.sh | bash`、Node 不要）
2. `/opt/tasuki/tasuki-sync.env` に `CLAUDE_CODE_OAUTH_TOKEN`・`AI_UNLOCK_KEY` を追記（600 維持）
3. systemd unit の PATH（または ExecStart 環境）にバイナリパスを追加
4. `/status` 管理エンドポイントに `aiGenerationCount`（当日/累計）を追加して消費を可視化
5. `deploy/README.md` に導入手順・トークン更新（`claude setup-token` 再発行）手順を追記

ロールバック: env の 2 変数を消して `systemctl restart` すれば全ルーム定型のみに戻る（コード変更不要）。

## スコープ外（やらないこと）

- 利用者各自のトークン持ち込み（BYOT）— クレジットがプール不可のため将来検討。休眠 BYOK 一式は残置のまま
- AI によるお題の多言語生成最適化・プロンプト改良 — まず既存 `buildProblemPrompt` で運用し、品質を見て別タスク
- 管理 UI からの解錠キー管理 — env 直編集で十分
