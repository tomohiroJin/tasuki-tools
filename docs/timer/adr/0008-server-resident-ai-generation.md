# ADR-0008: AI お題生成はサーバー常駐 `claude -p` + 合言葉解錠

- **ステータス**: Accepted（2026-06-12 設計・実装、main `5b19113`。[ADR-0005](./0005-secret-zero-byok-problem.md) の BYOK 方式を置換）
- **関連**: 設計正本 `../../../docs/superpowers/specs/2026-06-12-ai-problem-generation-design.md`,
  実装 `apps/sync/src/adapters/claude-cli-problem-provider.ts`, `apps/sync/src/application/ai-limits.ts`

## 背景

ADR-0005 の BYOK（利用者のブラウザが自分の API 鍵で直接生成）は「サーバー秘密ゼロ」を実現したが、
実運用では成立しなかった: 参加者に Anthropic API 鍵の取得・入力を求めるのは体験として重すぎ、
鍵を持つ参加者がいないルームでは AI 生成が事実上使えない。一方 2026-06-15 開始の
Claude サブスク月次 Agent SDK クレジットにより、運営者負担での代理生成が現実的になった。

## 決定

- **サーバー常駐生成**: sync サーバーが `claude -p` 子プロセス（`node:child_process` spawn）で生成する。
  OAuth トークン（`CLAUDE_CODE_OAUTH_TOKEN`）はサーバー env のみに置き、子プロセスの env にのみ渡す
  （argv・ログ・snapshot 非混入）。
- **合言葉解錠**: `AI_UNLOCK_KEY` を知るルームの host だけが有効化できる。トークン/合言葉のどちらかが
  未設定なら AI 機能は丸ごと無効かつ存在を秘匿（解錠は常に失敗）。
- **縮退と濫用抑制**: 失敗（タイムアウト・検証失敗・トークン失効）は全経路で定型バンクへ縮退。
  同時 1・クールダウン・日次上限（`AI_DAILY_LIMIT`）で運営者クレジットを保護。
- **BYOK は休眠残置**: `apps/web/src/ai/{byok,key-storage}.ts` は UI から撤去し将来の再有効化に備えて残す。

## 影響

- **利点**: 参加者は鍵不要で AI お題を使える。生成主体が単一（サーバー）になり、代表委譲の調停は不要。
- **代償**: サーバーが運営者トークンという秘密を持つ（ADR-0005 の「秘密ゼロ」を放棄）。
  トークン衛生（env 限定・非ログ）と濫用抑制がサーバーの責務になる。
  運営者のサブスク・クレジットを消費するため日次上限が必須。
- ADR-0005 のうち **Valibot 検証・定型縮退・出所バッジ**の原則はそのまま引き継ぐ。
