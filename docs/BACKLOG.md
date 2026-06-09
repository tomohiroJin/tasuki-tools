# Tasuki バックログ（公開後のやることリスト）

本番公開済み: **https://tasuki.niku9.click/**（2026-06-09〜）。
デプロイ設計は `docs/superpowers/specs/2026-06-07-tasuki-vps-deployment-design.md`。
セキュリティレビュー（本番）の結果、Critical/High は無し。以下は残タスク。

凡例: 優先度 [高] / [中] / [低] / [機能]、状態 = TODO / 調査中 / 保留。

---

## [高] vitest を v2 → v4 へ更新（脆弱性対応 L-4）

- **状態**: TODO（早めに対応したい）
- **背景**: devDependency `vitest@^2.1.8` に critical 勧告 GHSA-5xrq-8626-4rwp
  「Vitest UI サーバー待受時に任意ファイル読取/実行」。修正版は **4.1.0**。
- **本番影響**: **無し**。デプロイ成果物は `bun build` バンドルで vitest を含まず、VPS に vitest は存在しない（`pnpm audit --prod` はゼロ）。発動条件は `vitest --ui` 起動＋悪性ページ閲覧で、本プロジェクトは `vitest run` のみ＝UI 不使用。よって実害は低いが衛生として更新する。
- **注意**: v2→v4 は **2 メジャー上**＝破壊的変更あり。`bun update` 単発では済まず、
  config（`vitest.config.*` / `coverage` 設定）と API 差分の解消が必要。
- **完了条件**: 各 package の vitest を `^4`（≥4.1.0）へ、`pnpm test`（core/sync/web 計488）全緑、`pnpm build` 緑、`bun audit` で当該 critical 解消。

## [中] IP 単位のレート制限（L-1・可用性 DoS 緩和）

- **状態**: 調査中（要 `sudo ufw status verbose` の現行ルール確認）
- **背景**: リソース上限（接続200 / ルーム50）は**グローバル**で IP 単位でない。
  単一 IP が枠を占有すると正規ユーザを締め出せる（メモリ枯渇＝サーバダウンは M-2 で解消済、これは可用性の話）。
- **前提**: ホストに **ufw が active**（default-deny + 22/80/443 許可）で稼働中。これに追記する。
- **方針**: 443 への**同一送信元 IP の同時接続数 connlimit**を追加（既定案 **~80/IP**）。
  HTTP/2 多重化で 1 ユーザー≒2接続、同一 NAT のチーム20人でも〜40接続なので 80 なら正規利用は無傷、
  単一 IP の 200 独占 DoS は阻止。443 共用なので gallery/play も保護される。
- **安全策**: 本番 443 への FW 変更はロックアウト/既存サイト影響リスク → `ufw before.rules` 追記を
  **自動ロールバック付き**（数分で元に戻る安全網）で適用し、問題なければ確定。
- **未決**: 上限値（想定する「同一拠点からの最大同時利用者数」で調整）。
- **代替**: Caddy `rate_limit` プラグイン（xcaddy で再ビルド要）も選択肢だが、WS の長寿命接続には connlimit の方が素直。

## [低] `127.0.0.1:42179` の所有プロセス特定

- **状態**: 調査中
- **背景**: VPS で localhost のみで待受している不明ポート。**外部非公開**（ufw drop + localhost bind）でセキュリティ懸念は無いが正体を確認したい。
- **手順**: VPS で `sudo ss -tlnp 'sport = :42179'`（または `sudo lsof -i :42179`）。
  caddy(PID 540)/bun(PID 2071) とは別の可能性。おそらく Caddy 関連だが確定させる。

## [機能] AI お題生成（保留 → 再開検討）

- **状態**: 保留（v2.0.0 後に調査済・方針確定済）
- **方針**: **ルーム作成者（ホスト）の Claude サブスクのみ**で生成（参加者各自同時は SDK 制約上非現実的）。
- **事実（調査結果）**:
  - Agent SDK のサブスク認証 = OAuth トークン `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`（`sk-ant-oat01-`）。
  - Claude Code CLI をラップ＝**Node 実行・ブラウザ不可**。クレジットは個人アカウント単位で**共有/プール不可**。
  - ⚠ **ToS**: 事前承認なく第三者プロダクトに claude.ai ログイン/レート枠を組み込む提供は不可
    → **自己ホストで自分の契約の範囲**に限る。
- **実装案（推奨）**: サーバ（Bun）に `AgentSdkProblemProvider`（`claude -p` 子プロセス推奨・**Bun 互換は要 PoC**）を追加し、
  既存 `problemMode==="ai"` 経路 + `ProblemDelegator` の deadline/フォールバック + `buildProblemPrompt`/`validateProblem` に合流。
  トークンは**ホストの env のみ**＝secret-zero 維持。未設定時は従来どおり定型お題（`NoAiProvider`・外部リクエスト無し）。
- **既存資産**: 休眠 BYOK 一式（`key-storage`/`byok`/`AiSettingsModal`）はテスト保護下で残置済（復活時に App 配線を再実装）。
- **完了条件（叩き台）**: ホスト env にトークンがあるときのみ AI 生成、無ければ定型。deadline 超過で定型へフォールバック。全テスト緑。

---

## その他・既知の残件

- **リリースタグ未設定**: M-2 で sync に機能追加したため、次の正式リリースで `v2.1.0` 等を切るか要判断。
- **L-3（低・許容）**: コンテナのデプロイ鍵 `~/.ssh/niku9_deploy` がパスフレーズ無し。個人運用は許容範囲。
  厳格化するなら VPS の `authorized_keys` で当該鍵に `from="<送信元IP>"` 制限。
- **お名前.com ドメインプロテクション返金**: 意図せず申込→即解約済、返金請求フォーム送信済。**先方の返信待ち**。

## デプロイ運用メモ（再掲）

- 更新は コンテナから `cd tdd-mob-pro-timer && PATH=$HOME/.local/bin:$PATH ./deploy/deploy.sh`（build→転送→`sudo systemctl restart`、非対話）。
- VPS = Debian 12・ユーザー `tomohiro`（非 root）・サービスも tomohiro 実行。bun は `/usr/local/bin`。
- 初回/再セットアップ用スクリプト: `deploy/vps-setup.sh`・`deploy/caddy-setup.sh`（いずれも冪等・要 VPS sudo）。
