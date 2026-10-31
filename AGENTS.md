# Tasuki — AI エージェント向けガイド

Tasuki は二本柱で成り立つ。**実用ツール集**（timer・poker 等、実務で使うツール群を提供する）と
**AI 駆動開発の実践場**（MCP・複数 AI エージェントによる開発プロセス自体の実践・実証）。

## 絶対規則

正本は [`docs/constitution.md`](docs/constitution.md)。以下は
その見出し（原則 I〜XI）を転記したものに過ぎない。内容・詳細は必ず正本を参照すること。

- I. テスト駆動開発（NON-NEGOTIABLE）
- II. 技術選定は ADR を通す
- III. 揮発インメモリと単純運用
- IV. 境界の型安全
- V. 実画面検証
- VI. 依存は内向き
- VII. 検査は壊して確かめる
- VIII. 記録が正本
- IX. 小さく回す
- X. 抽象は実需で
- XI. 秘密と個人情報を持ち込まない

### AI 運用規則

決定と根拠は [`docs/adr/0030`](docs/adr/0030-ai-driven-development-operations.md)、
価値観の要約は [`docs/ai-manifesto.md`](docs/ai-manifesto.md)。ここは今日どう動くかの正本。

**作業の始めに**

- 依頼の ISSUE・関係する ADR とガイドを読む。作業ブランチを確かめる
- 同じブランチ・作業ツリーを別のエージェントが触っていないか確かめる。並行するなら分ける

**人の明示の指示か承認を待つ操作**（基準は `docs/adr/0030` 決定 1。一覧に無くても基準に当たれば聞く）

- 本番デプロイ（deploy.sh / systemctl / Caddy reload）
- ADR の採択（Proposed → Accepted）・憲法の改版
- 検査を飛ばす・無効にする・弱める変更（テストの skip・変異の宣言の削除・走査対象の除外の追加）
- 依頼に含まれない ISSUE・PR・コメントの投稿、外部のサービスへの送信
- 他人のブランチの履歴の書き換え・force push・データや記録の削除
- 秘密・資格情報（`docs/adr/0011` の分類）を読む・書く・移す

**作業の終わりに**

- 触った範囲の検査を流す（下の「基本コマンド」。段ごとの使い分けは `docs/guides/development.md`）
- 報告は次の 3 つに分けて書く（PR 本文・ISSUE・会話のどれでも）
  - **変えたこと**
  - **確かめたこと** — 流したコマンドと結果
  - **確かめられなかったこと** — 流せなかった検査とその理由。無ければ「なし」と書く
- 会話の中で決めたことは、ADR・ISSUE・振り返りのどれかへ残す

**環境について**

- 9p マウント（`/workspaces` など）上で検査が遅いときは、ソースを移さず
  **依存の実体だけ**をコンテナ側へ逃がす（手順は
  [`docs/guides/development.md`](docs/guides/development.md) の「9p 越しで実行するとき」）
- 起動した dev サーバーは使い終わったら止める（`ss -tlnp` で確認）

## 文書地図

- 憲法: [`docs/constitution.md`](docs/constitution.md) —
  何を守るか（原則 I〜XI）
- マニフェスト: [`docs/ai-manifesto.md`](docs/ai-manifesto.md) —
  AI と開発するときの価値観の要約。新しい義務は持たず、憲法と ADR を指す（`docs/adr/0030` 決定 6）
- ADR: [`docs/adr/`](docs/adr/)（横断）・`docs/<app>/adr/`（アプリ固有） —
  なぜそう決まっているか。参照は置き場つき（例: `docs/adr/0002`）
- ガイド: [`docs/guides/`](docs/guides/) —
  今日どう書くか（DoD・EARS・振り返り・アーキテクチャ・開発手順・セキュリティ・PR の粒度）
- 設計文書: [`docs/superpowers/`](docs/superpowers/) —
  機能ごとの設計経緯（日付つきファイル）
- 全体像・目的別の入口は [`docs/README.md`](docs/README.md) を参照

## 基本コマンド

- `pnpm test` — 全パッケージのテスト
- `pnpm e2e` — E2E テスト
- `node scripts/audit-structure.mjs` — 構造監査
- `node scripts/audit-log-hygiene.mjs` — ログ衛生
- `node scripts/audit-assembly-wiring.mjs` — 組み立ての集約（同期サーバー）
- `node scripts/audit-domain-error-shape.mjs` — ドメインエラー型の形（core のエラー型が文言を持たない）
- `node scripts/audit-domain-side-effects.mjs` — ドメインの副作用（core が環境から直接値を読まない）
- `node scripts/check-links.mjs` — リンク検査
- `node scripts/audit-agent-entries.mjs` — AI ツールの入口（`CLAUDE.md` ほか）が本書とずれていないか
- `node scripts/mutation-check.mjs` — 変異検査（全件。手元の実装中は `--changed` / `--pkg <dir>` / `--id <番号,…>` で絞る。`--jobs <数>` で作業ツリーを分けて並列に流せる。CI は `--shard k/n` で分ける。段ごとの使い分けは `docs/guides/development.md`）
- `bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'` — scripts の自己テスト

検査系の詳細（対象の決まり方・新しいパッケージを足したときの直し方）は
[`docs/guides/development.md`](docs/guides/development.md) の「検査系」を参照。
