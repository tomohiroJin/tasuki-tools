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
- **合言葉解錠**: `AI_UNLOCK_KEY` を知る在室者が有効化できる。トークン/合言葉のどちらかが
  未設定なら AI 機能は丸ごと無効かつ存在を秘匿（解錠は常に失敗）。
  （**当初は「ルームの host だけ」と書いていた。**#95 S3 で役割とホストを廃止したため
  在室者全員へ開いた。下の追記（2026-09-08）を参照。）
- **縮退と濫用抑制**: 失敗（タイムアウト・検証失敗・トークン失効）は全経路で定型バンクへ縮退。
  同時 1・クールダウン・日次上限（`AI_DAILY_LIMIT`）で運営者クレジットを保護。
- **BYOK は休眠残置**: `apps/web/src/ai/{byok,key-storage}.ts` は UI から撤去し将来の再有効化に備えて残す。

## 影響

- **利点**: 参加者は鍵不要で AI お題を使える。生成主体が単一（サーバー）になり、代表委譲の調停は不要。
- **代償**: サーバーが運営者トークンという秘密を持つ（ADR-0005 の「秘密ゼロ」を放棄）。
  トークン衛生（env 限定・非ログ）と濫用抑制がサーバーの責務になる。
  運営者のサブスク・クレジットを消費するため日次上限が必須。
- ADR-0005 のうち **Valibot 検証・定型縮退・出所バッジ**の原則はそのまま引き継ぐ。

## 追記（2026-08-17・#72 E1）

**決定の 4 項目目「BYOK は休眠残置: `apps/web/src/ai/{byok,key-storage}.ts` は UI から
撤去し将来の再有効化に備えて残す」は、その後に実装によって失効している。**

両ファイルは #28 の T010（コミット `7d7a73c`「refactor: BYOK 系の休眠コードを撤去する」）
で削除された。現在 `apps/timer-web/src/ai/` にあるのは `no-ai.ts` と `provider.ts` の
2 本のみである（2026-08-17 実測）。

**決定の本体（サーバー常駐生成・合言葉解錠・縮退と濫用抑制）は現在も有効で、
実装も存在する** — `apps/tasuki-sync/src/adapters/claude-cli-problem-provider.ts` と
`apps/tasuki-sync/src/application/ai-limits.ts`。

**この不整合は #33（`docs/plans/adr-alignment-post-refactor/`）が取りこぼしたものである。**
#33 は #28 後の ADR 整合を扱ったが、対象を論点 1〜3（`docs/timer/adr/` の 0009・0002・0001）に
限定していた。

あわせて、`apps/timer-web/src/App.tsx` の `resolveProvider()` の docstring が削除済みの
`key-storage` に言及していたので、実装に合わせて直した（#72 E1）。

本追記は経緯の記録であり、決定を覆すものではない（`docs/adr/0002` の「ADR は追記のみ」）。

## 追記（2026-09-08・#95 S3）

**決定の 2 項目目「合言葉解錠: `AI_UNLOCK_KEY` を知るルームの host だけが有効化できる」の
「host だけが」という限定は、[#95](https://github.com/tomohiroJin/tasuki-tools/issues/95) S3
（[#244](https://github.com/tomohiroJin/tasuki-tools/issues/244)）で失効した。**

役割（`host` / `editor` / `viewer`）とホストの概念を廃止したため、解錠を絞る主体が存在しない。
実装（`apps/tasuki-sync/src/application/command-handlers/ai-unlock.ts` の `handleAiUnlock`）は
レート制限と合言葉の定数時間比較だけを見ており、参加者の属性を一切参照しない。画面側
（`apps/timer-web/src/ui/Lobby.tsx`）も `AiUnlockPanel` を役割で出し分けていない。
**したがって現在は「合言葉を知る在室者なら誰でも解錠できる」である。**

**S3 が触ったのはこの限定だけである。** サーバー常駐生成と、縮退・濫用抑制の 2 項目は
無傷で、決定の趣旨である「秘密は運営者の env のみに置き、解錠を合言葉で絞る」も変わっていない
（4 項目目の BYOK については上の追記（2026-08-17・#72 E1）を参照。S3 とは無関係の失効である）。
絞りの単位が「ルーム内の 1 人」から「合言葉を知っている人」へ移っただけで、
合言葉を知らない参加者は解錠できない。運用上の含意（鍵を共有した相手の範囲が広がりうる）は
[`docs/guides/security.md`](../../guides/security.md) の鍵の回転の項に書いた。

本追記は経緯の記録であり、決定を覆すものではない（`docs/adr/0002` の「ADR は追記のみ」）。

**訂正（2026-09-09・[#258](https://github.com/tomohiroJin/tasuki-tools/issues/258)）**:
上の一文は本追記を「追記のみ」と述べているが、**実際には同時に決定 2 項目目の本文も直している**
（「ルームの host だけ」→「`AI_UNLOCK_KEY` を知る在室者」。当初の文面は丸括弧で本文内に残した）。
決定を覆していないという点は正しい。作法としては
[`docs/adr/0002`](../../adr/0002-document-system-three-layers.md) の「追記（2026-09-09・#258）」が
定めた**改定節つきの本文訂正**に当たる。**この訂正自体は追記であり、上の記録は書き換えていない。**
