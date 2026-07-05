# Tasuki バックログ（公開後のやることリスト）

本番公開済み: **https://tasuki.example.com/**（2026-06-09〜）。
デプロイ設計は `docs/superpowers/specs/2026-06-07-tasuki-vps-deployment-design.md`。
セキュリティレビュー（本番）の結果、Critical/High は無し。以下は残タスク。

凡例: 優先度 [高] / [中] / [低] / [機能]、状態 = TODO / 調査中 / 保留。

---

## [完了] vitest 脆弱性対応 + 依存の安全な更新（2026-06-09）

- **状態**: ✅ DONE
- **対応**: 勧告 GHSA-5xrq-8626-4rwp（vitest <3.2.6 critical）に対し **vitest を 2.1.8 → ^3.2.6** へ更新（core/sync/web）。
  併せて dompurify 3.4.7→3.4.8、非推奨 `@types/dompurify` 除去、fast-check 3→4。
  **`bun audit` 脆弱性ゼロ**（vitest critical + vite/esbuild moderate も transitive 更新で解消）。`pnpm test` 488 全緑・`pnpm build` 緑・typecheck 緑。
- **vitest 4 を見送った理由**: vitest 4 はこの環境（C:\ の 9p マウントで I/O が遅い）で
  「Timeout waiting for worker to respond」が頻発し web テストが不安定（forks/threads/singleFork いずれも再現）。
  勧告は **<3.2.6** が対象なので **3.2.6+ で十分修正**。安全な安定版として 3 系を採用。
  vitest 4 へ上げるなら、ワーカー応答タイムアウトの緩和 or 9p 外でのテスト実行を別途検討。

## [低] メジャー依存の更新（安全のため据え置き中）

- **状態**: 保留（脆弱性なし・production 稼働中・この環境が脆いため見送り）
- **対象と理由**:
  - **React 18.3 → 19**: 19 は stable だが破壊的変更あり。18.3 は安全・保守継続・脆弱性なし。UI 全面テストを伴う別タスクで。
  - **Tailwind 3.4 → 4**: v4 は設定形式の破壊的書き換え（CSS-first）。UI 全崩れリスク大。3.4 維持。
  - **TypeScript 5.9 → 6**: 新規の厳格化で型エラー誘発の恐れ。5.9 は最新 5 系で安全。
  - **vite 6.4 → 7 / @vitejs/plugin-react 4 → 6 / jsdom 25 → 29 / @types/node 22 → 25**: いずれも脆弱性なし・現状で安定動作。ビルド/テスト挙動の回帰リスクを避け据え置き。
- **方針**: 各々を個別タスクで、テスト488緑・build緑・実機確認を伴って慎重に上げる。

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

## [完了] AI お題生成（2026-06-13）

- **状態**: ✅ DONE（main マージ済 `5b19113`・本番有効化済）
- **実装**: サーバ常駐 `claude -p` 子プロセス（`node:child_process`・Bun で動作）で生成。
  運営者サブスクの月次 Agent SDK クレジット（2026-06-15 開始の公式制度）を使用。
  合言葉（`AI_UNLOCK_KEY`）解錠方式＝知っているルームの host だけが有効化。
  失敗は全経路で定型バンクへ縮退・濫用抑制（同時1/クールダウン10s/日次上限）・`/status` に生成カウンタ。
- **正本**: spec `docs/superpowers/specs/2026-06-12-ai-problem-generation-design.md` /
  計画 `docs/superpowers/plans/2026-06-12-ai-problem-generation.md` / 手順 `tdd-mob-pro-timer/deploy/README.md`「AI お題生成」
- **検証**: 全 665 テスト緑・実 claude -p スモーク・ブラウザ E2E（解錠失敗→解錠→AI 生成 25s→定型復帰）済
- **デプロイ時作業**: ✅ 完了（VPS へ claude バイナリ導入 + env 2 変数追記 + systemd PATH。
  手順の正本は `tdd-mob-pro-timer/deploy/README.md`「AI お題生成」）

---

## その他・既知の残件

- ~~**リリースタグ**~~: ✅ 最新 **`v2.10.0`**（v2.5〜v2.10 のフィードバック対応を PR #1 でマージ・本番デプロイ済 2026-06-26。初回公開タグは `v2.1.0` 2026-06-09）。
- **L-3（低・許容）**: コンテナのデプロイ鍵 `~/.ssh/myvps_deploy` がパスフレーズ無し。個人運用は許容範囲。
  厳格化するなら VPS の `authorized_keys` で当該鍵に `from="<送信元IP>"` 制限。
- **お名前.com ドメインプロテクション返金**: 意図せず申込→即解約済、返金請求フォーム送信済。**先方の返信待ち**。

## デプロイ運用メモ（再掲）

- 更新は コンテナから `cd tdd-mob-pro-timer && PATH=$HOME/.local/bin:$PATH ./deploy/deploy.sh`（build→転送→`sudo systemctl restart`、非対話）。
- VPS = Debian 12・ユーザー `deploy`（非 root）・サービスも deploy 実行。bun は `/usr/local/bin`。
- 初回/再セットアップ用スクリプト: `deploy/vps-setup.sh`・`deploy/caddy-setup.sh`（いずれも冪等・要 VPS sudo）。
