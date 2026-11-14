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
- 繰り返す作業（レビュー・実画面での確認・変異）は、記憶でなく手順書（`docs/guides/procedures/`）に従う
- ISSUE 本文の件数・「無い」という主張・仮説は、実行して確かめてから設計に使う。件数は実行して数え、識別子（SHA・番号）は出力から写す（[`docs/guides/counting-and-writing.md`](docs/guides/counting-and-writing.md)）
- 同じブランチ・作業ツリーを別のエージェントが触っていないか確かめる。並行するなら分ける
- 同じ ISSUE の開いた PR・マージ済みの PR・リモートの枝を確かめる。確かめる時は、**始め**と、**PR を立てる前・終わりを報告する前**。見つけたら（途中でも）、続ける前に人へ伝える
  - PR: `gh pr list --state all --limit 1000 --search "#<番号> in:title,body" --json number,title,body -q 'length as $t|"\($t) 件中:",(.[]|select((.title+.body)|test("#<番号>([^0-9]|$)"))|"\(.number) \(.title)")'`（件数が 1000 に近ければ切れている）
  - 枝: `git ls-remote --heads origin | grep -E 'refs/heads/.*[/-]<番号>([^0-9]|$)'`（`git fetch --prune` はしない。他の作業ツリーの参照を消す）
  - 検査もある（`pnpm check:fast` の最初と最後の知らせ・Claude Code の `gh pr create` 直前のフック。`docs/adr/0030` 決定 5）。人が確かめる操作は残る

**コマンドの書き方**（フックの確認で作業が止まらないため。まとめ役もサブエージェントも同じ。#612）

- Bash は 1 呼び出しに 1 操作。確認（`git status --porcelain`・`git log`）と操作（`checkout`・`stash`・`worktree remove`）を `&&`・`;`・for でつながない。
  つなぐと、未コミットの変更を消す git の判定（`docs/adr/0037` 決定 3）が形を読み切れず、変更の有無にかかわらず人に聞く
  （#612 の実測: 2026-11-12〜11-14 に止まった 117 件のほぼすべてがつなぎ書きで、1 行の 59 件のうち 29 件は分けるだけで通る形だった）
- ファイルは編集の道具（Claude Code なら Write・Edit）で書く。heredoc で書いて同じ呼び出しで走らせない。
  スクリプトはファイルに置き、別の呼び出しで `node <パス>`・`python3 -I <パス>` を流す。**フックが止める操作（git・gh の書き込み・`kill`・本番デプロイ）はスクリプトに入れず、Bash で 1 つずつ流す**（スクリプトの中はフックが見ない。回避の道に使わない）
- 別の作業ツリーの git は `cd <パス> && git …` でなく `git -C <パス> …` と書く。パスは変数・`~` を使わずそのまま書き、`-C` は 1 つだけ。
  Claude Code の `cd` は作業ディレクトリの外（兄弟の作業ツリー）では次の呼び出しに残らない。`-C` が 1 つの形は、判定がその作業ツリーの変更を確かめる（`docs/adr/0037` 決定 3 の追記）。
  **ただしサブエージェントでは、`-C` があっても `checkout`・`switch`・`reset`・`worktree` は止まる**（決定 2 は `-C` を読まない。代わりの形は `docs/guides/procedures/orchestration.md` と `adversarial-review.md` の手順 3）
- サブエージェントへの指示に写す細目（heredoc で本文を文章として扱う形・`node -e` の語ほか）は [`docs/guides/procedures/orchestration.md`](docs/guides/procedures/orchestration.md) の共通の指示

**人の明示の指示か承認を待つ操作**（基準は `docs/adr/0030` 決定 1。一覧に無くても基準に当たれば聞く）

- 本番デプロイ（deploy.sh / systemctl / Caddy reload）。Claude Code ではフックが人に聞く（一覧の正本は `scripts/lib/agent-guard.mjs`。`docs/adr/0032`）
  - Codex には `.codex/hooks.json` で本番デプロイを `deny` する歯止めを置いている（`docs/adr/0032` の追記。プロジェクトを信頼した状態の Codex の実機で止まることを確かめた（2026-11-12。フックの信頼は `--dangerously-bypass-hook-trust` で飛ばした 1 回。`/hooks` で信頼した経路は未実測））。プロジェクトとフックを信頼しないと効かない（信頼していない場所では読まれないことを実測した）。効いていても、人の承認を待つ操作のまま（[`docs/guides/development.md`](docs/guides/development.md) の「Codex で作業するとき」）
- ADR の採択・却下（Proposed → Accepted / Rejected）・憲法の改版
- 検査を飛ばす・無効にする・弱める変更（テストの skip・変異の宣言の削除・走査対象の除外の追加）
- 依頼に含まれない ISSUE・PR・コメントの投稿、外部のサービスへの送信
- 他人のブランチの履歴の書き換え・force push・データや記録の削除
- 秘密・資格情報（`docs/adr/0011` の分類）を読む・書く・移す

**作業の終わりに**

- 触った範囲の検査を流す（下の「基本コマンド」。段ごとの使い分けは `docs/guides/development.md`）
- 誤字・リンク・記録の状態の書き換え**だけ**の変更を除く、すべての変更は、**終わりを報告する前に**、実装したのとは別のエージェントの敵対的レビューを通す（`docs/guides/procedures/adversarial-review.md`）。PR を立てるかどうかに依らない。差分とコードを渡し、実装した側の結論は渡さない。通せない理由は別のエージェントを起こせない環境に限る。その時は報告の**前に**人へ聞く（「PR が無い」「時間が無い」は理由にしない。`docs/adr/0030` 決定 5）
- push を求められた作業では、コミットを溜めずに push する（作業の途中でもよい。保留中に PR がマージされ、修正が落ちた例がある）。終わりを報告するのは、検査とレビューを通したあと。報告の前に、`git ls-remote origin <枝>` が手元の HEAD と一致することと、PR が open のままであること（`gh pr view <番号> --json state,mergedAt`）を確かめる。サブエージェントに任せた作業では、push はまとめ役が行う（`docs/guides/procedures/orchestration.md`）
- 報告は次の 3 つに分けて書く（PR 本文・ISSUE・会話のどれでも）
  - **変えたこと**
  - **確かめたこと** — 流したコマンドと結果。レビューを通したなら、誰に何を渡し、指摘が何件で、どう扱ったか
  - **確かめられなかったこと** — 流せなかった検査とその理由。無ければ「なし」と書く。レビューを通せなかったなら、人に聞いた結果と理由
- 会話の中で決めたことは、ADR・ISSUE・振り返りのどれかへ残す

**環境について**

- 9p マウント（`/workspaces` など）上で検査が遅いときは、ソースを移さず
  **依存の実体だけ**をコンテナ側へ逃がす（手順は
  [`docs/guides/development.md`](docs/guides/development.md) の「9p 越しで実行するとき」）
- クラウドのセッション（claude.ai/code）では、プロキシで届かない取得先がある。`check-toolchain` が止めたら、
  [`docs/guides/development.md`](docs/guides/development.md) の「クラウドのセッションで道具を揃える」に従う。
  そこにある取得先で揃わない道具（いまは E2E の Chromium と ffmpeg・shellcheck）は、**別の取得先や別の版で代えず**、
  その検査を CI に任せ、「確かめられなかったこと」に止まった道具と届かなかった取得先を書く（`docs/adr/0033`）
- 起動した dev サーバーは使い終わったら止める（`ss -tlnp` で確認）

## 文書地図

- 憲法: [`docs/constitution.md`](docs/constitution.md) —
  何を守るか（原則 I〜XI）
- マニフェスト: [`docs/ai-manifesto.md`](docs/ai-manifesto.md) —
  AI と開発するときの価値観の要約。新しい義務は持たず、憲法と ADR を指す（`docs/adr/0030` 決定 6）
- ADR: [`docs/adr/`](docs/adr/)（横断）・`docs/<app>/adr/`（アプリ固有） —
  なぜそう決まっているか。参照は置き場つき（例: `docs/adr/0002`）
- ガイド: [`docs/guides/`](docs/guides/) —
  今日どう書くか（DoD・EARS・振り返り・アーキテクチャ・開発手順・セキュリティ・PR の粒度）。件数の数え方・文書の書き方は [`counting-and-writing.md`](docs/guides/counting-and-writing.md)、機能を選ぶ物差しは [`product-positioning.md`](docs/guides/product-positioning.md)
- 手順書: [`docs/guides/procedures/`](docs/guides/procedures/README.md) —
  繰り返す作業の手順（敵対的レビュー・実画面で確かめる・変異の足し方・並行実装のまとめ役）。
  `.claude/skills/` のスキルはここへ向ける薄い入口で、手順を書かない
- 設計文書: [`docs/superpowers/`](docs/superpowers/) —
  機能ごとの設計経緯（日付つきファイル）
- 全体像・目的別の入口は [`docs/README.md`](docs/README.md) を参照

## 基本コマンド

- `pnpm check:fast` — 速い段。型・lint・単体・監査・リンク・差分の変異をまとめて流し、成功・失敗・省略理由を最後に示す。文書だけの差分では型・lint・単体を省く
- `pnpm check:full` — 全件の段。CI からコマンドと変異のシャードを導いて同じ引数で流す。依存・ブラウザの導入は先に済ませる。両方とも版が合わなければ検査を始めない。`--list` で実行予定だけを確認できる
- `pnpm test` — 全パッケージのテスト
- `pnpm e2e` — E2E テスト
- `node scripts/audit-structure.mjs` — 構造監査
- `node scripts/audit-test-focus.mjs` — テストの `.only`（`node:test` の `{ only: true }` を含む）と、理由のコメントの無い `.skip` / `.skipIf` / `.runIf` / `.todo` / `.fixme`（bun の `.if` / `.todoIf`、`node:test` の `{ skip }` / `{ todo }` を含む）を止める（違反があれば exit 1）
- `node scripts/audit-log-hygiene.mjs` — ログ衛生
- `node scripts/audit-assembly-wiring.mjs` — 組み立ての集約（同期サーバー）
- `node scripts/audit-domain-error-shape.mjs` — ドメインエラー型の形（core のエラー型が文言を持たない）
- `node scripts/audit-domain-side-effects.mjs` — ドメインの副作用（core が環境から直接値を読まない）
- `node scripts/check-links.mjs` — リンク検査
- `node scripts/audit-agent-entries.mjs` — AI ツールの入口（`CLAUDE.md` ほか）が本書とずれていないか・スキルが手順書へ向く薄い入口か
- `node scripts/check-toolchain.mjs <test|e2e|mutation>` — 開発環境の版（Node・pnpm・Bun・Chromium・ffmpeg・Caddy）が宣言と合うか。`pnpm test`・`pnpm e2e`・変異検査は先にこれを通し、合わなければ始めない（`docs/adr/0031`）
- `node scripts/audit-toolchain.mjs` — 版の宣言（`toolchain.json` ほか）と、それを読む CI・ハーネスのずれ
- `node scripts/audit-agent-guard.mjs` — AI ツールの設定（`.claude/settings.json`）が本番デプロイのコマンドを止めるフックへ配線されているか・止める一覧（`scripts/lib/agent-guard.mjs`）と `deploy/` の実体が合うか（`docs/adr/0032`）
- `node scripts/audit-codex-guard.mjs` — Codex の設定（`.codex/hooks.json`）が本番デプロイを `deny` で止める入口へ配線されているか（`docs/adr/0032` の追記（#578））
- `node scripts/mutation-check.mjs` — 変異検査（全件。手元の実装中は `--changed` / `--pkg <dir>` / `--id <番号,…>` で絞る。`--jobs <数>` で作業ツリーを分けて並列に流せる。CI は `--shard k/n` で分ける。段ごとの使い分けは `docs/guides/development.md`）
- `bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'` — scripts の自己テスト

検査系の詳細（対象の決まり方・新しいパッケージを足したときの直し方）は
[`docs/guides/development.md`](docs/guides/development.md) の「検査系」を参照。
