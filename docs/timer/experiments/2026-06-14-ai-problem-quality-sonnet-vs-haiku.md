# AI お題生成 品質実験：sonnet vs haiku

- 実施日: 2026-06-14
- 対象: AI お題生成機能（`problemMode === "ai"`・`claude -p` 子プロセス生成）
- 関連: [AI お題生成 設計](../superpowers/specs/2026-06-12-ai-problem-generation-design.md) / [状態可視化 設計](../superpowers/specs/2026-06-14-ai-status-visibility-design.md)
- 再現スクリプト: `apps/sync/scripts/quality-experiment.mjs`（生成）・`apps/sync/scripts/quality-judge.mjs`（採点）
- 生データ: `docs/experiments/data/2026-06-14-quality-results.json`（20件の生成結果）・`.../2026-06-14-quality-scores.json`（judge スコア）

## 背景・目的

お題生成機能は「動く」「形式が壊れない（スキーマ検証＋定型縮退で下限担保）」までは確認済みだったが、
**生成お題の内容品質**（例示テストの正しさ・難易度の妥当性・要件の明確さ）は体系的に未検証だった。
本番デフォルトモデル（`sonnet`）と低コスト候補（`haiku`）のどちらをどう使うかを判断するため、両モデルを実プロンプトで比較した。

## 手法

- **生成**: 実際の `buildProblemPrompt(language, difficulty)`（`packages/core/src/problem.ts`）を使い、本番アダプタ（`claude-cli-problem-provider.ts`）と同じ `claude -p --output-format json --strict-mcp-config --settings {}` で生成。
- **マトリクス**: 5 組合せ × 各 2 サンプル × 2 モデル = **20 生成**。
  - 言語×難易度: TypeScript/easy・TypeScript/hard・Python/medium・Go/easy・Java/medium（4 言語・3 難易度を網羅）。
- **計測**: 生成成功率・`validateProblem`（Valibot）によるスキーマ妥当率・レイテンシ・コスト・タイトル多様性。
- **品質採点**: `sonnet` を judge にして全 20 件を **盲採点**（どちらのモデル生成かは judge に伏せる）。4 観点を 1〜5 点：
  1. `req_clarity` 要件の明確さ・テスト可能性
  2. `test_correctness` 例示テストの構文妥当性＋要件との意味的整合（正解実装なら通るか）
  3. `difficulty_fit` 指定難易度との適合
  4. `tdd_value` TDD 適性・教育的価値

> 注意: judge は LLM であり二次情報。test_correctness の意味的判定は完全ではない（特に算術の正誤）。手動サンプル確認で補完した。

## 結果

### 構造・コスト・速度

| 指標 | sonnet | haiku |
|---|---|---|
| 生成成功 | 10/10 | 10/10 |
| スキーマ妥当 | 10/10 | 10/10 |
| タイトル多様性 | 10/10 | 10/10 |
| 平均レイテンシ | 22s | 25s |
| 平均コスト/件 | $0.027 | $0.018 |
| 10 件合計コスト | $0.274 | $0.175 |

形式面は両モデルとも完璧。haiku は速度面で優位なし（むしろ僅かに遅い＝個体差の範囲）。コストは sonnet が約 1.6 倍。

### 内容品質（judge・1〜5 点平均）

| 観点 | sonnet | haiku |
|---|---|---|
| 要件の明確さ | 4.80 | 4.30 |
| **例示テストの正しさ** | **4.80** | **4.30** |
| 難易度の妥当性 | 4.60 | 4.40 |
| TDD 適性 | 4.60 | 4.30 |
| **総合** | **4.70** | **4.33** |

両モデルとも「十分使える」水準（4.3〜4.7/5）。**sonnet が全観点で明確に上**（総合 +0.37）。

## 検出された弱点

- 🔴 **haiku の例示テスト破綻（1/10・最重要）**: Java/medium で assertion の算術が不整合
  （`5×1.00 + 12×2.00` を「29.00」と主張するが 10% bulk 割引後は 26.60。続く promo/tax の積も不整合）。
  test_correctness=2。**AI 生成お題で最も危険なパターン**＝形式は妥当だが中身が数学的に誤りで、TDD を能動的に誤誘導する。
  スキーマ検証では捕捉不可。
- 🟡 haiku は **easy 難易度を過大評価**しがち（easy 指定に medium 相当を出す）・要件に書いたエッジケースを例示テストで検証しない傾向。
- 🟡 sonnet の最低スコアも easy の要件の曖昧さ（総合 3.50）だが、**算術破綻のような致命例はゼロ**。
- トピック偏り: Shopping 系が sonnet 2/10・haiku 3/10。タイトルは全て一意で大きな重複なし。

## 結論

- **品質は十分実用に足る**: 両モデル schema 妥当 100% ＋ judge 4.3〜4.7/5。失敗時は定型バンクへ縮退するため下限が保証される。
- **sonnet が明確に高品質**（特に最重要の「例示テストの正しさ」で 4.80 vs 4.30）。
- haiku は約 40% 安いが、**例示テストの算術破綻という tail risk** を持つ。

## 推奨アクション

1. **本番デフォルトは `sonnet` を維持**（`config.ts` の既定）。品質差が追加コスト（$0.027/件・日次上限 100 で最悪 ~$2.7/日）に見合う。
   haiku は高頻度/コスト重視のシナリオや検証用に限定。
2. **モデル非依存の品質ギャップ**（BACKLOG 候補）: 例示テストの意味的正しさはスキーマでは守れない。
   - 案 A: UI で「例示テストは AI 提案であり要検証」を明示。
   - 案 B: 生成後に例示テストの軽量サニティチェック（算術・assertion の妥当性）を追加。
3. 品質の継続監視: モデル更新時は本スクリプトで再計測する。

## 再現方法

```bash
cd apps/sync
# apps/sync/.env に CLAUDE_CODE_OAUTH_TOKEN（claude setup-token で発行）が必要
bun run scripts/quality-experiment.mjs   # 20 生成 → /tmp/tasuki-quality-results.json
bun run scripts/quality-judge.mjs        # sonnet judge で採点 → /tmp/tasuki-quality-scores.json
```

> ⚠ `claude -p` の並列起動は認証/設定競合で失敗するため、スクリプトは直列実行（本番アダプタも `AiLimiter` で `maxConcurrent=1`）。
