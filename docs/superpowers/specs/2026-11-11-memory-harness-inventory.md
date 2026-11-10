# #578 メモリの棚卸し（PR 1「書く」）

> マージ後の節は書き換えない。後から分かったことは末尾の補遺の節に書き、置き換えた古い節の末尾に改定の印を足す（`docs/guides/design-doc-revision.md`）。

確認時点: main `8d5c0f46`（2026-11-11）。手元のメモリ 158 件を、中身ごとに次の 4 つへ分けた。
このファイルは、**分類と書き先だけ**を残す。メモリの中身は写さない。

| 記号 | 意味 |
|---|---|
| (a) | フック・検査にできる。**PR 2「機械化」**で扱う |
| (b) | 手順書・ガイド・`AGENTS.md` へ書く。**PR 1（この PR）**で書く |
| (c) | 利用者個人の判断・好み・環境・本番の運用。リポジトリに書かず手元に残す |
| (d) | 経緯（振り返り・ADR・`git log` にある）か、古くなった事実。書かない |

Codex への接続（本番デプロイの歯止め・入口の検査の拡張）は **PR 3「Codex」**で扱う。

## 集計

数え方: 各表の行は `grep -c '^| .*\.md |' <このファイル>` に近い形で数えた（表ごとに範囲を区切る）。(c) は表を持たないので件数だけを書く。

- (c) 手元に残す: 36 件（分類に (c) を含む行を数えた件数。中身とファイル名は書かない）
  - うち 10 件は、(b) の断片（サブエージェントへの指示・往復の終わり方など）を手順書へ書いた。書いた先は `docs/guides/procedures/orchestration.md`・`docs/guides/procedures/adversarial-review.md`・`docs/guides/procedures/mutations.md`・`docs/guides/pr-granularity.md`
- (b) を書いた: 92 件
  - うち 7 件は一部だけ書いた（「(b) の一部」の表。**この 7 件は上の 92 件の内数**）
- (d)・済（書かない）: 30 件
- 合計: (c) 36 + (b) 92 + (d)・済 30 = 158 件（手元のメモリは `MEMORY.md` を除いて 158 件）

## (b) を書いた

「範囲」の「全部」は、棚卸しの行にあった (b) の項目をすべて書いた、の意味。経緯・製品の事実・古い事実（(d)）は書いていない。

| メモリ | 書いた先 | 範囲 |
|---|---|---|
| 9p-mount-breaks-directory-moves.md | `docs/guides/development.md` | 全部 |
| appending-a-section-reparents-the-next-one.md | `docs/guides/counting-and-writing.md` | 全部 |
| assertions-must-sit-where-implementations-differ.md | `docs/guides/procedures/adversarial-review.md` | 全部 |
| bare-spec-reference-means-the-0813-spec.md | `docs/guides/counting-and-writing.md` | 全部 |
| bun-test-migration-findings.md | `docs/guides/development.md` | 全部 |
| check-pr-comments-after-push.md | `docs/guides/procedures/orchestration.md` | 全部 |
| closes-keyword-must-not-be-in-backticks.md | `docs/guides/procedures/orchestration.md` | 全部 |
| code-review-targets-the-current-branch.md | `docs/guides/procedures/orchestration.md` | 全部 |
| count-by-running-not-grepping.md | `docs/guides/counting-and-writing.md`、`AGENTS.md` | 全部 |
| countermeasures-carry-the-flaw-they-fix.md | `docs/guides/procedures/adversarial-review.md` | 全部 |
| count-in-prose-goes-stale.md | `docs/guides/counting-and-writing.md` | 全部 |
| dated-obligations-need-their-own-home.md | `docs/guides/development.md`、`docs/guides/counting-and-writing.md` | 全部 |
| defineproperty-stubs-survive-unstuballglobals.md | `docs/guides/development.md` | 全部 |
| deleted-symbols-live-on-in-declarations.md | `docs/guides/procedures/adversarial-review.md` | 全部 |
| design-system-invariants.md | `packages/ui/README.md` | 全部 |
| docs-issues-must-not-grow-into-implementation.md | `docs/guides/pr-granularity.md` | 全部 |
| dont-embed-formatted-text-in-briefs.md | `docs/guides/procedures/orchestration.md` | 全部 |
| dont-fix-while-scoring-runs.md | `docs/guides/procedures/orchestration.md` | 全部 |
| dont-restate-numbers-across-own-docs.md | `docs/guides/counting-and-writing.md` | 全部 |
| dont-scatter-issueless-prs.md | `docs/guides/pr-granularity.md` | 全部 |
| dont-truncate-tool-output-when-counting.md | `docs/guides/counting-and-writing.md` | 全部 |
| dotenv-follows-the-working-directory.md | `docs/guides/development.md` | 全部 |
| enumerations-rot-name-the-mechanism.md | `docs/guides/counting-and-writing.md` | 全部 |
| estimate-verification-time-in-plans.md | `docs/guides/plan-writing.md` | 全部 |
| fixed-version-present-is-not-old-version-gone.md | `docs/guides/development.md` | 全部 |
| fixes-often-touch-only-one-side.md | `docs/guides/procedures/adversarial-review.md` | 全部 |
| issue-bodies-had-factual-errors.md | `docs/guides/counting-and-writing.md`、`AGENTS.md` | 全部 |
| issue-sprawl-means-deferral-chains.md | `docs/guides/pr-granularity.md` | 全部 |
| layout-must-fit-real-content.md | `docs/guides/definition-of-done.md` | 全部 |
| markdown-perf-test-ci-slowness.md | `docs/guides/development.md` | 全部 |
| metric-and-norm-can-disagree.md | `docs/guides/counting-and-writing.md` | 全部 |
| metrics-without-a-verdict-need-a-baseline.md | `docs/guides/counting-and-writing.md` | 一部 |
| mutate-after-rewriting.md | `docs/guides/procedures/mutations.md` | 全部 |
| mutation-ids-collide-in-parallel-work.md | `docs/guides/procedures/orchestration.md`、`docs/guides/procedures/mutations.md` | 全部 |
| never-write-identifiers-from-memory.md | `docs/guides/counting-and-writing.md`、`AGENTS.md` | 全部 |
| old-vs-new-comparison-finds-what-tests-cannot.md | `docs/guides/procedures/adversarial-review.md` | 全部 |
| operator-only-norms-need-no-enforcement.md | `docs/guides/security.md`、`docs/guides/counting-and-writing.md` | 全部 |
| oracles-must-be-wider-than-the-implementation.md | `docs/guides/procedures/adversarial-review.md` | 全部 |
| parallel-agents-need-isolated-worktrees.md | `docs/guides/procedures/orchestration.md` | 全部 |
| pgrep-self-match-in-waiters.md | `docs/guides/procedures/orchestration.md` | 全部 |
| plans-defects-outnumber-implementation-defects.md | `docs/guides/plan-writing.md` | 全部 |
| playwright-assertion-traps.md | `docs/guides/procedures/live-check.md` | 全部 |
| pnpm-virtual-store-off-9p.md | `docs/guides/development.md` | 全部 |
| push-before-announcing-done.md | `AGENTS.md` | 全部 |
| read-ci-by-head-sha.md | `docs/guides/procedures/orchestration.md`、`docs/guides/development.md` | 全部 |
| record-decisions-not-completed-state.md | `docs/guides/counting-and-writing.md` | 全部 |
| review-loops-need-a-stop-criterion.md | `docs/guides/procedures/orchestration.md`、`docs/guides/procedures/adversarial-review.md` | 全部 |
| runner-completions-hide-missing-deps.md | `docs/guides/development.md` | 全部 |
| sdd-final-phase-burns-tokens.md | `docs/guides/procedures/orchestration.md` | 全部 |
| simple-checks-beat-clever-ones.md | `docs/guides/counting-and-writing.md` | 一部 |
| spec-errors-get-ratified-downstream.md | `docs/guides/design-doc-revision.md`、`docs/guides/procedures/adversarial-review.md` | 全部 |
| specs-pin-the-method-not-just-the-claim.md | `docs/guides/definition-of-done.md` | 全部 |
| subagents-must-not-merge.md | `docs/guides/procedures/orchestration.md` | 全部 |
| subagents-must-not-touch-processes-or-branches.md | `docs/guides/procedures/orchestration.md` | 全部 |
| tasuki-issue103-ip-rate-limit.md | `docs/guides/development.md`、`docs/guides/definition-of-done.md` | 全部 |
| tasuki-issue135-scan-target-integrity.md | `docs/guides/procedures/live-check.md` | 全部 |
| tasuki-issue142-e2e-error-paths.md | `docs/guides/counting-and-writing.md` | 一部 |
| tasuki-issue154-supply-chain-config-integrity.md | `docs/guides/development.md` | 全部 |
| tasuki-issue155-plan-constitution-gate.md | `docs/guides/development.md`、`docs/guides/procedures/adversarial-review.md` | 全部 |
| tasuki-issue157-log-hygiene-tsx-scope.md | `docs/guides/design-doc-revision.md`、`docs/guides/procedures/adversarial-review.md` | 全部 |
| tasuki-issue162-e2e-from-vscode-extension.md | `docs/guides/development.md` | 全部 |
| tasuki-issue173-tests-in-typecheck-scope.md | `docs/guides/development.md` | 全部 |
| tasuki-issue220-timer-core-public-contract.md | `docs/guides/development.md` | 全部 |
| tasuki-issue221-rate-limit-public-contract.md | `docs/guides/design-doc-revision.md`、`docs/guides/counting-and-writing.md` | 全部 |
| tasuki-issue246-identity-and-presence.md | `docs/guides/architecture.md` | 全部 |
| tasuki-issue248-poker-via-hub.md | `docs/guides/architecture.md`、`docs/guides/procedures/live-check.md` | 全部 |
| tasuki-issue250-epic95-retrospective.md | `docs/guides/counting-and-writing.md` | 全部 |
| tasuki-issue271-lobby-problem-server-side.md | `docs/guides/development.md` | 一部 |
| tasuki-issue274-name-before-absence.md | `docs/guides/architecture.md`、`packages/ui/README.md` | 全部 |
| tasuki-issue276-rotation-seats.md | `docs/guides/architecture.md` | 全部 |
| tasuki-issue279-contrast-gradient.md | `packages/ui/README.md` | 全部 |
| tasuki-issue280-ui-typography-scale.md | `packages/ui/README.md`、`docs/guides/procedures/live-check.md` | 全部 |
| tasuki-issue284-display-name-hardening.md | `docs/guides/procedures/adversarial-review.md` | 全部 |
| tasuki-issue290-leaving-a-room.md | `docs/guides/architecture.md`、`docs/guides/procedures/mutations.md`、`docs/guides/plan-writing.md` | 全部 |
| tasuki-issue294-fold-config-members.md | `docs/guides/architecture.md` | 全部 |
| tasuki-issue297-ivory-faint-margin.md | `docs/guides/procedures/orchestration.md` | 一部 |
| tasuki-issue321-timer-without-tailwind.md | `docs/guides/procedures/live-check.md`、`docs/guides/procedures/orchestration.md` | 全部 |
| tasuki-issue387-test-weight.md | `docs/guides/procedures/orchestration.md`、`docs/guides/development.md` | 全部 |
| tasuki-issue429-agenda-timer.md | `docs/guides/procedures/orchestration.md` | 全部 |
| tasuki-issue429-stage2-repeat.md | `docs/guides/architecture.md`、`docs/guides/definition-of-done.md`、`docs/guides/procedures/adversarial-review.md` | 全部 |
| tasuki-issue439-444-pnpm-and-advisories.md | `docs/guides/development.md` | 全部 |
| tasuki-issue458-roulette-regulars.md | `docs/guides/procedures/adversarial-review.md` | 全部 |
| tasuki-issues-352-348-94-parallel-run.md | `docs/guides/procedures/orchestration.md` | 全部 |
| tasuki-parallel-two-issues-run.md | `docs/guides/procedures/orchestration.md` | 全部 |
| tasuki-real-usage-and-positioning.md | `docs/guides/product-positioning.md` | 全部 |
| typecheck-misses-test-fixtures.md | `docs/guides/procedures/adversarial-review.md` | 全部 |
| valibot-paths-are-not-a-classifier.md | `docs/guides/architecture.md` | 全部 |
| verify-artifacts-adversarially.md | `docs/guides/procedures/adversarial-review.md` | 全部 |
| verify-the-break-itself.md | `docs/guides/procedures/adversarial-review.md` | 一部 |
| verify-the-live-path.md | `docs/guides/definition-of-done.md` | 全部 |
| verify-with-redirects-followed.md | `docs/guides/counting-and-writing.md` | 一部 |
| zsh-path-variable-clobbers-PATH.md | `docs/guides/development.md` | 全部 |

## (b) の一部

一部だけ書いたもの。書かなかった部分と理由を示す。

| メモリ | 書かなかった部分と理由 |
|---|---|
| metrics-without-a-verdict-need-a-baseline.md | 基準値との比較は (a) として PR 2 へ回した。SC029・SC031（計画への逐語の書き方、ADR 0006 が出典）は `plan-writing.md` に、`// When / Then（理由）` の 1 行の書き方は `development.md` に書いた。SC032 の書き方の残りは書いていない |
| simple-checks-beat-clever-ones.md | 倒す条件は書いた。検査の個別の例（無状態＋許可リスト）は、現物の検査で確かめられていないため書いていない |
| tasuki-issue142-e2e-error-paths.md | `routeWebSocket` を掛けたページが同期を取りこぼす件は、`e2e/README.md` に既にある（済）。書いたのは「ISSUE が指定した解法も疑う」 |
| tasuki-issue271-lobby-problem-server-side.md | 製品の事実（輪と名簿は別の帳簿・`problem: null` の出どころ・委譲は必ず確定する）はコードと ADR にある（d）。書いたのは、確定的に作る最小の WS クライアントの方法 |
| tasuki-issue297-ivory-faint-margin.md | コントラストの余裕・書体の件は経緯と古い事実（d）。書いたのは、Agent ツールの有無の確かめ方（Claude Code の注記） |
| verify-the-break-itself.md | 置換の前後の件数・抑制レベルのある道具の見方は書いていない。現物の道具で確かめられていないため。壊す前に落ちるものを書く点は書いた |
| verify-with-redirects-followed.md | 測る場所を先に疑う点だけ書いた。ANSI・パイプの落ち・`--is-ancestor` の個別の罠は、重複する記述が既にあるため書いていない |

## (d)・済（書かない）

経緯は振り返り・ADR・`git log` に、規則は既存のガイド・検査・コードにある。古くなった事実は書かない。
記号は `(d)` か `済` にそろえた。他の分類（(a) など）を含むものは、元の分類を右に添えた。(a) を含むものは下の「PR 2」の一覧に載せた。

| メモリ | 分類 |
|---|---|
| caddy-fragment-evaluation-order.md | (d) または済 |
| checks-need-a-control-run.md | (d) または済 |
| ci-mutation-offline-install-flake.md | (d) または済 |
| e2e-serves-prebuilt-dist.md | (d) または済 |
| free-dev-ports-when-done.md | (d) または済 |
| local-green-is-not-ci-green.md | (d) または済 |
| mutation-changed-falls-back-when-declarations-touched.md | (d) または済（他の分類を含む行は下の注） |
| poker-sync-heartbeat-test-is-flaky.md | (d) または済 |
| poker-web-copy-link-test-is-flaky.md | (d) または済 |
| tasuki-e2e-design.md | (d) または済 |
| tasuki-issue136-security-norms.md | (d) または済 |
| tasuki-issue182-public-contract-membership.md | (d) または済 |
| tasuki-issue223-self-only-public-symbols.md | (d) または済 |
| tasuki-issue254-fast-uri-advisory.md | (d) または済 |
| tasuki-issue265-dependency-advisories.md | (d) または済 |
| tasuki-issue283-server-authoritative-generating.md | (d) または済 |
| tasuki-issue296-pseudo-and-unreadable-layers.md | (d) または済 |
| tasuki-issue402-timer-break.md | (d) または済 |
| tasuki-issue447-1-room-header.md | (d) または済 |
| tasuki-issue447-2-timer-room-header.md | (d) または済 |
| tasuki-issue455-agenda-long-meetings.md | (d) または済 |
| tasuki-issue465-checkin-more-methods.md | (d) または済 |
| tasuki-issue491-two-place-trial.md | (d) または済 |
| tasuki-issue508-check-fast-signals.md | (d) または済 |
| tasuki-issue91-shared-topic.md | (d) または済（他の分類を含む行は下の注） ＋ (a)（PR 2） |
| tasuki-issue93-estimate-log.md | (d) または済 |
| tasuki-issue95-shared-identity-and-rooms.md | (d) または済 |
| tasuki-node-pnpm-version-floor.md | (d) または済 |
| ui-text-must-fit-font-base-subset.md | 済（機械化済み） |
| vitest-worker-timeout-under-load.md | 済（機械化済み） |

## (a) を PR 2 へ回すもの

(a) を含む行のうち、効果が大きいと棚卸しで挙げたもの。実装は PR 2 で選ぶ。

- PR 本文・コミット本文の閉鎖キーワードの検査（`gh pr create` 直前のフックに足す）
- 9p 上のディレクトリ移動・削除、作業ツリーを巻き戻す git 操作の歯止め
- 期限つき例外の期限超過を落とす検査
- PR の未返信コメントの知らせ（`check:fast` の最初と最後の知らせ）
- 計画の見積もり節を plan-gate で求める
- 合否の無い指標の基準値との比較
- `pnpm --filter <名前>` の名前が workspace に無いときに止める（偽の緑を防ぐ。tasuki-issue91-shared-topic.md が元）
- detached HEAD の知らせ、未 push・マージ済み PR への push の知らせ（AGENTS.md「作業の終わりに」の確かめは文章で、機械化できる）
- ISSUE 本文の件数・不在の主張を実行して確かめること（`AGENTS.md` の 1 行）は、判断を要するので機械化しない

## PR 3 へ回すもの

- 本番デプロイの歯止めを Codex の `deny` につなぐ（`docs/adr/0032` の改版が要る。採択は人）
- 入口の検査を `.agents/skills/`・`.codex/` へ広げる

