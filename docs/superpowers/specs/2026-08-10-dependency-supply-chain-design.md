# 依存の最新化と供給網対策の設計（#69）

- 日付: 2026-08-10（**2026-08-11 に全数値を再実測して更新**）
- 対象 Issue: [#69](https://github.com/tomohiroJin/tasuki-tools/issues/69)「B: 依存の最新化と供給網対策」（親 epic [#67](https://github.com/tomohiroJin/tasuki-tools/issues/67)）
- ステータス: 設計承認済み・実装前
- 実装計画: [`docs/superpowers/plans/2026-08-10-dependency-supply-chain.md`](../plans/2026-08-10-dependency-supply-chain.md)
- タスク: [`docs/superpowers/plans/2026-08-10-dependency-supply-chain-tasks.md`](../plans/2026-08-10-dependency-supply-chain-tasks.md)

> **数値の正本はこの文書です。**実測値（脆弱性の件数・陳腐化の一覧・待機期間ごとの違反件数・
> 版と公開日時）は本書にのみ置き、実装計画・タスク・ADR 0008 からは**参照するだけで転記しない**
> （憲法 原則 VIII「二重正本を作らない」）。初版では同じ表を 3 文書へ転記した結果、
> メジャー更新の件数が三者で食い違うという実害が出たため、この規則を明示する。

## 背景と目的

npm パッケージの乗っ取り・改ざんによる供給網攻撃が続いている。**公開直後の版を即座に
取り込まない**ことが有効な緩和策なので、それを人の注意力ではなく仕組みとして入れる。

Tasuki の現状は「自動更新の仕組みが無い」ため、依存の更新は誰かが思い出したときにだけ
起きる。思い出したときに一気に上げると、そのとき公開されたばかりの版をまとめて掴む。
これは供給網攻撃にとって最も都合のよい取り込み方である。

**この Issue の主眼は仕組み作りであり、「今すぐ全部上げる作業」ではない。**

## 実測で確認した前提（2026-08-10 / `/home/vscode/tasuki-work`）

Issue 本文の主張を 1 つずつ叩いた結果。**主要な数字が 5 点、事実と食い違っていた。**
設計は Issue 本文ではなくこの実測に基づく。

| Issue 本文の記載 | 実測 | 判定 |
|---|---|---|
| 脆弱性 **0 件** | **2 件**（high 1・moderate 1） | ✗ 既に発生済み |
| 陳腐化した依存 **3 件のみ** | ルートのみで **5 件**、`pnpm outdated -r`（全 11 プロジェクト）で **20 件**（メジャー 12・非メジャー 8） | ✗ 過少 |
| `.npmrc` に `minimumReleaseAge` を設定する | **`.npmrc` は無視される。**効くのは `pnpm-workspace.yaml` | ✗ 置き場が違う |
| `onlyBuiltDependencies` でインストール時スクリプトを制御する | pnpm 11 のキーは **`allowBuilds`**。しかも `pnpm-workspace.yaml` に**既に設定済み**（`esbuild: true`） | ✗ 名前違い＋対応済み |
| 参考として `docs/BACKLOG.md` を挙げる | [#105](https://github.com/tomohiroJin/tasuki-tools/pull/105) で解体済み。据え置き理由は #69 のコメントへ転記済み | ✗ 消滅 |
| **pnpm 11.5.0 は `minimumReleaseAge` に対応している** | **正しい**（`minimumReleaseAge` / `Exclude` / `Strict` / `IgnoreMissingTime` の 4 キーを確認） | ✓ |
| 依存の自動更新は仕組み無し（renovate / dependabot とも未設定） | **正しい**（`renovate.json` `.renovaterc*` `.github/dependabot.yml` いずれも不在） | ✓ |

### 環境

| 項目 | 値 |
|---|---|
| pnpm | 11.5.0（`packageManager` 宣言） |
| Node | v22.23.2（`engines: >=22.13.0`） |
| workspace | 11 プロジェクト（`packages/*` `apps/*` `e2e`） |
| 依存総数 | 533（prod 40 / dev 491 / optional 62） |
| CI | `.github/workflows/ci.yml` の 2 ジョブ（`ci` / `e2e`）。**どちらも `pnpm install --frozen-lockfile`** |

### 陳腐化した依存 20 件の内訳（2026-08-11 再実測）

`pnpm outdated -r` の全件。**初版はルートの `pnpm outdated` だけを見て「低リスク 3 件」と
書いており、アプリ・パッケージ側の 4 件を取りこぼしていた。**その反省を含めて全件を挙げる。

**非メジャー 8 件**（#69 のスコープ内）

| パッケージ | 現在 → 最新 | 種別 | 宣言元 | 備考 |
|---|---|---|---|---|
| `dompurify` | 3.4.12 → 3.4.13 | パッチ | `@tasuki/timer-web` | **脆弱性**（後述） |
| `postcss` | 8.5.25 → 8.5.26 | パッチ | `@tasuki/timer-web` | **`nanoid` 脆弱性の親**。更新で推移側も動く |
| `ws` | 8.21.1 → 8.21.3 | パッチ | `@tasuki/timer-sync` | **実行時依存**（WebSocket） |
| `lucide-react` | 1.28.0 → 1.31.0 | マイナー | `@tasuki/timer-web` | **実行時依存**（アイコン） |
| `@testing-library/user-event` | 14.6.1 → 14.6.3 | パッチ | `@tasuki/timer-web` | テスト用 |
| `typescript-eslint` | 8.65.0 → 8.66.0 | マイナー | ルート | |
| `eslint` | 10.8.0 → 10.8.1 | パッチ | ルート | |
| `turbo` | 2.10.8 → 2.10.9 | パッチ | ルート | |

**メジャー 12 件**（#69 のスコープ外。別 Issue へ切り出す）

| パッケージ | 現在 → 最新 | 宣言元 |
|---|---|---|
| `@types/node` | 22.20.1 → 26.2.0 | `@tasuki/e2e`, ルート |
| `typescript` | 5.9.3 → 7.0.2 | 6 プロジェクト |
| `tailwindcss` | 3.4.19 → 4.3.3 | `@tasuki/timer-web` |
| `vite` | 6.4.3 → 8.2.1 | 3 プロジェクト |
| `vitest` | 3.2.7 → 4.1.10 | 8 プロジェクト |
| `@vitest/coverage-v8` | 3.2.7 → 4.1.10 | `@tasuki/timer-core` |
| `@vitejs/plugin-react` | 4.7.0 → 6.0.5 | 3 プロジェクト |
| `jsdom` | 25.0.1 → 30.0.1 | `@tasuki/landing`, `@tasuki/timer-web` |
| `stylelint` | 16.26.1 → 17.14.1 | `@tasuki/ui` |
| `stylelint-config-recommended` | 14.0.1 → 18.0.0 | `@tasuki/ui` |
| `@testing-library/jest-dom` | 6.10.0 → 7.0.0 | `@tasuki/landing`, `@tasuki/timer-web` |
| `nanoid`（直接依存） | 5.1.16 → 6.0.1 | `@tasuki/timer-sync` |

### 脆弱性 2 件の内訳

| 深刻度 | パッケージ | 現在 | 修正版 | 経路 |
|---|---|---|---|---|
| **high** | `nanoid` | 3.3.16 | >=3.3.17 | `postcss@8.5.25` 経由の推移依存。**44 経路**（vite / vitest / tailwindcss / stylelint 等） |
| **moderate** | `dompurify` | 3.4.12 | >=3.4.13 | `apps/timer-web` の**直接依存**（宣言は `^3.4.8`） |

**2 件とも宣言済み semver 範囲内で解消できる。**破壊的変更を伴わない。

| パッケージ | 解決先 | 公開日時 | 7 日を超える日時 |
|---|---|---|---|
| `dompurify` | 3.4.13（最新。`^3.4.8` の範囲内） | 2026-08-03T14:16:00Z | 2026-08-10T14:16Z（**解禁済み**） |
| `nanoid` | 3.3.17 または 3.3.18（`postcss` の要求は `^3.3.16`） | 3.3.17: 2026-08-03T10:39:22Z / 3.3.18: 2026-08-07T16:41:05Z | 3.3.17: 2026-08-10T10:39Z（**解禁済み**） / 3.3.18: 2026-08-14T16:41Z |

**配布経路の評価（実装順序の判断根拠）**

| 脆弱性 | 利用者へ配布されるか |
|---|---|
| `nanoid`（high） | **されない。**44 経路すべてが `postcss` 経由（vite / vitest / tailwindcss / stylelint）で、**ビルド時のみ**。成果物に含まれない |
| `dompurify`（moderate） | **される。**`apps/timer-web` の実行時依存。ただし深刻度は moderate |

**したがって「high が出ているから何より先に潰す」という状況ではない。**high のほうが
配布されず、配布されるほうは moderate である。この評価が、仕組み（PR-1）を脆弱性の解消
（PR-2）より先に置く判断の根拠になる（後述の「実装順序」）。

### `minimumReleaseAge` の挙動 — Issue の想定と逆だった点

Issue は「CI でも同じ設定が効くことを確認する（`--frozen-lockfile` との相互作用）」を
確認事項として挙げていた。実測の結果、**想定と逆**だった。

pnpm 11.5.0 は install のたびに **lockfile の各エントリへ `minimumReleaseAge` を再適用する**。
`pnpm install --help` の `--trust-lockfile` の説明にこう書かれている。

> Trust the lockfile and skip the supply-chain verification step that re-applies
> minimumReleaseAge / trustPolicy to each lockfile entry.

つまり「解決のときだけ効く検査」ではない。**既に lockfile に固定済みのエントリも
毎回検証される**ので、設定を入れた瞬間に既存 lockfile を持つ CI がその場で赤くなる。

実測（現行 `pnpm-lock.yaml` に対して `pnpm install --frozen-lockfile`）:

| 待機期間 | 違反した lockfile エントリ |
|---|---|
| 1 日（1440 分） | **0 件** |
| 3 日（4320 分） | **1 件** |
| **7 日（10080 分）** | **1 件** — `postcss-selector-parser@7.1.5`（2026-08-07T09:32:20Z 公開） |
| 14 日（20160 分） | **55 件** |
| 30 日（43200 分） | **80 件** |

エラーは `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` で **exit code 1**。

**逃げ道は 2 つあり、いずれも実測で効くことを確認した。**

| 手段 | 効果 | 実測 |
|---|---|---|
| `pnpm install --trust-lockfile` | lockfile エントリの検証をまるごと省く | exit=0 |
| `minimumReleaseAgeExclude`（glob 可） | 指定パッケージだけ待機期間から除外する | 除外した版でインストール成功 |

**`CI=true` では回避されない**（exit=1 を確認）。

**検証は解決より先に走る。**`pnpm install --no-frozen-lockfile` も `pnpm update -r <pkg>` も、
違反エントリがあると**再解決に入る前に**同じエラーで落ちる（2026-08-11 実測）。
つまり「違反しているエントリだけを古い版へ解決し直して回避する」という逃げ道は**存在しない**。
違反が出たときに取れる手は次の 3 つに限られる。

| 手 | 内容 | コスト |
|---|---|---|
| **待つ** | 当該版が公開から 7 日を超えるのを待つ | lockfile を触らない。最も安全 |
| **期限つき除外** | `minimumReleaseAgeExclude` に追記し、解除予定日をコメントに残す | 消し忘れの risk。解除を完了条件に含める |
| **全面再解決** | `pnpm clean --lockfile && pnpm install` | lockfile 533 エントリ規模の diff。単独 PR が必須 |

> ⚠ **観測の罠。**最初の計測で `CI=true` が exit=0 に見えたが、これは直前の
> `--trust-lockfile` 実行で `node_modules` が最新になっており、pnpm が
> 「Already up to date」で短絡していたためだった。`rm -rf node_modules` してから
> 測り直すと exit=1 になる。**`node_modules` が最新のとき供給網検証は走らない。**
> このリポジトリが 4 回踏んでいる「検査が静かに効かなくなる」失敗
> （[#70](https://github.com/tomohiroJin/tasuki-tools/issues/70) の警告）と同じ形なので、
> 検証手順には毎回 `node_modules` の除去を含める。
>
> CI は毎回フレッシュな checkout なので、この短絡は起きない。**罠にかかるのは
> ローカルでの確認作業のほうである。**

### 置き場の実測

| 置き場 | 記法 | 結果 |
|---|---|---|
| `.npmrc` | `minimum-release-age=43200` | **無視された**（8.66.0 がそのまま入った） |
| `.npmrc` | `minimumReleaseAge=43200` | **無視された** |
| `pnpm-workspace.yaml` | `minimumReleaseAge: 43200` | **効いた**（`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`） |

**単位は分。**43200 分 = 30 日。カットオフ日時がエラーメッセージに出るので検算できる。

## 決定の一覧

対話で確定した決定。

| # | 論点 | 決定 |
|---|---|---|
| D1 | 待機期間の日数 | **7 日（10080 分）** |
| D2 | 設定の置き場 | **`pnpm-workspace.yaml`**（`.npmrc` ではない） |
| D3 | CI での扱い | **`--trust-lockfile` を使わない。**CI でも検証を効かせる |
| D4 | 緊急時の例外手順 | **`minimumReleaseAgeExclude` に期限つきで追記 → 解消後に削除** |
| D5 | 自動更新 bot | **Renovate** |
| D6 | bot の待機期間 | **7 日以上**（pnpm 側を下回らせない） |
| D7 | 自動マージ | **しない**（提案までを自動化し、取り込みは人が判断する） |
| D8 | インストール時スクリプト | **現状維持**（`allowBuilds` は既に許可制。棚卸しのみ行う） |
| D9 | `pnpm audit` の CI 組み込み | **#69 で入れる。high 以上でビルドを落とす** |
| D10 | 更新のスコープ | **非メジャー 8 件のみ**（脆弱性 2 件を含む）。メジャー 12 件は別 Issue へ切り出す |
| D11 | 実装の順序 | **仕組み（PR-1）→ 脆弱性の解消（PR-2）**。PR-1 は違反 0 件を確認してからマージする |

## 各決定の根拠

### D1: 待機期間は 7 日

実測の違反件数がそのまま導入コストになる。

- **7 日の導入コストは 1 件のみ**（`postcss-selector-parser@7.1.5`）。しかもこの 1 件は
  2026-08-07 公開なので、**数日待てば自然に解消する**
- 14 日にすると **55 件**、30 日にすると **80 件**が一斉に違反し、導入と同時に CI が全面停止する。
  解消には lockfile の全面再解決か `--trust-lockfile` での一時的な逃げが要り、
  「仕組みを入れる」作業が「lockfile を作り直す」作業に化ける
- 供給網攻撃の発覚は多くが数日以内に起きるため、7 日でも緩和効果は残る

**却下した代替案**

| 案 | 却下理由 |
|---|---|
| 30 日 | 防御は最も厚いが、導入時に 80 件が違反する。#69 の作業量が跳ね上がり、原則 IX「小さく回す」に反する |
| 14 日 | 55 件。同上 |
| 3 日 | 違反件数は 7 日と同じ 1 件なので、コストが同じなら防御の厚い 7 日を採る |
| 1 日 | 違反 0 件だが、待機期間としては短すぎて緩和効果がほぼ無い |

> **将来 14 日・30 日へ引き上げる余地は残る。**7 日で運用し、lockfile が一巡して
> 新しい版が入らなくなれば違反件数は自然に減る。引き上げは別 Issue の判断とする。

### D2: 置き場は `pnpm-workspace.yaml`

Issue 本文は `.npmrc` を指定していたが、**実測で `.npmrc` は無視された**（ケバブケース・
キャメルケースの両方）。pnpm 11 系の設定は `pnpm-workspace.yaml` に集約されており、
このリポジトリも既に `allowBuilds` をそこに書いている。二重の置き場を作らない。

### D3: CI では `--trust-lockfile` を使わない

`--trust-lockfile` は「lockfile は信頼済みの基盤の一部である」ことを前提とする逃げ道で、
pnpm 自身がその用途を「クローズドソース・検証済み lockfile に対する CI」と限定している。

Tasuki の lockfile は**公開リポジトリで、bot が更新を提案する**対象である。
「lockfile は信頼済み」という前提が成立しない。CI で検証を切ると、
**待機期間をローカルで迂回して更新した lockfile がそのまま通る**。それでは仕組みにならない。

そのため CI の `pnpm install --frozen-lockfile` は現状のまま変えない。

### D4: 例外手順は `minimumReleaseAgeExclude`

待機期間があると**緊急の脆弱性修正版も掴めない**。

> **初版はここに「今回がまさにその実例」と書いていたが、2026-08-11 時点でもう成立しない。**
> `dompurify@3.4.13` は 2026-08-10T14:16Z、`nanoid@3.3.17` は同日 10:39Z に 7 日を超え、
> どちらも普通に取り込めるようになった。**例外手順を実案件で試す機会は日付の経過で消えた**ため、
> 代わりに **PR-1 の破壊検証で意図的に演習する**（待機期間を一時的に引き上げて封鎖を作り、
> 除外で通し、元へ戻す）。実案件を待つより再現性が高く、いつ実行しても同じ結果になる。

例外手順の要件は次の 3 つ。

1. **範囲が狭いこと** — 特定パッケージだけを外す。全体を切る `--trust-lockfile` は使わない
2. **CI でも同じように効くこと** — ローカルだけの逃げ道にしない
3. **消し忘れが残らないこと** — 除外は恒久設定になりやすい

`minimumReleaseAgeExclude` は 1 と 2 を満たす（設定ファイルなので CI でも読まれる）。
3 はコメントで期限と理由を書き、解消後の削除を PR の完了条件に含めることで担保する。

**却下した代替案**

| 案 | 却下理由 |
|---|---|
| CI で `--trust-lockfile` | 検査を全体で切る。D3 のとおり、迂回した lockfile が無検査で通る |
| 環境変数で一時的に待機期間を 0 にする | 範囲が全体になる。手順が履歴に残らず、消し忘れも検出できない |
| 例外時だけ `pnpm-workspace.yaml` の値を下げる | 同上。しかも「何を許したか」が記録に残らない |

### D5・D6・D7: Renovate

`pnpm outdated -r` が **20 件**を返す現状では、bot が 1 件ずつ PR を立てると PR が溢れる。
**グルーピングの表現力**が選定の主要因になる。

- Renovate は `packageRules` でグループ・スケジュール・待機期間をパッケージ単位で制御できる
- Dependabot は追加導入なしで使えるが、まとめ方の表現力が Renovate に劣る

**bot の待機期間は pnpm 側（7 日）を下回らせない（D6）。**下回らせると、bot が
7 日未満の版を提案 → その PR の lockfile が pnpm の検証で弾かれ、**bot の PR が
常に赤くなる**。2 つの待機期間は「bot 側 ≧ pnpm 側」で揃える。

**自動マージはしない（D7）。**bot は提案までを担い、取り込みは人が判断する。
供給網対策として待機期間を入れておきながら、待機期間を過ぎたものを無検査で
自動的に取り込むのでは、防御の穴を自分で開けることになる。

> Renovate の導入には GitHub App の有効化（リポジトリ管理者の操作）が要る。
> **設定ファイルのコミットだけでは動かない。**この手動ステップは計画に明示する。

### D8: インストール時スクリプトは現状維持

Issue は「`onlyBuiltDependencies` で許可制にするか決める」としていたが、**pnpm 11 の
キー名は `allowBuilds` であり、しかも既に設定済み**である。

```yaml
# pnpm-workspace.yaml（現行）
allowBuilds:
  esbuild: true
```

pnpm 10 系以降、ビルドスクリプトはデフォルトで**ブロック**され、明示的に許可した
パッケージだけが実行される。つまり Issue が「決める」としていた許可制は**既に効いている**。

したがって新たな決定は不要で、**現在の許可リスト（`esbuild` の 1 件のみ）が
妥当かの棚卸しだけを行う**。

### D9: `pnpm audit` を CI へ・high 以上で落とす

現に high 1 件・moderate 1 件が出ている。**仕組み（待機期間）と同時に検知（audit）を
入れないと、再発したことに気づけない。**

- **high 以上でビルドを落とす。**moderate 以下は報告に留める
- 判断の閾値を設けるのは、推移依存の moderate で作業全体が止まるのを避けるため

**#70（段階 C）との境界**: #70 は「リポジトリが持つ検査をすべて CI へ組み込む」を
担当し、`pnpm audit` もその一覧に含まれる。ここでは**#69 が `pnpm audit` のジョブを
先に入れ、#70 はそれを既存として扱う**。二重に足さないよう、#69 のマージ後に
#70 の該当項目へ「#69 で対応済み」と記録する。

### D10: 更新は非メジャー 8 件のみ

対象は「陳腐化した依存 20 件の内訳」の**非メジャー 8 件**（うち 2 件が脆弱性）。
一覧を再掲しない（数値の正本は前掲の表）。

> **初版は「低リスク 3 件」としていたが、これはルートの `pnpm outdated` だけを見た誤りだった。**
> アプリ・パッケージ側の `postcss`・`ws`・`lucide-react`・`@testing-library/user-event` の
> 4 件を落としていた。とくに `ws`（timer-sync の WebSocket）と `lucide-react`（timer-web の
> アイコン）は**実行時依存**であり、「依存の最新化」を掲げる Issue が落としてよい対象ではない。
> `postcss` は `nanoid` 脆弱性の親でもある。

**メジャー 12 件は #69 に含めない。**理由は原則 IX「小さく回す」。仕組み作りの PR に
破壊的変更の追従を混ぜると、CI が赤くなったとき原因が仕組み側か追従側か切り分けられない。

> #69 のコメントに転記済みの据え置き理由（React 19・Tailwind 4・TypeScript 6 等、
> 2026-06 時点の記録）は、この切り出し先 Issue の背景としてそのまま引き継ぐ。
> ただし**内容は古い**（当時「保留」とした前提が変わっている可能性がある）ので、
> 切り出し時に再度実測すること。

### D11: 仕組み（PR-1）を脆弱性の解消（PR-2）より先に置く

**判断の根拠は「配布経路の評価」**（前掲）。high の `nanoid` は `postcss` 経由の
ビルド時依存で**利用者へ配布されない**。配布される `dompurify` は moderate である。
したがって「high が出ているので何より先に潰す」という状況ではなく、Issue の主眼である
仕組みを先に入れてよい。

**ただし PR-1 にはマージ可否のゲートを置く。**

- **違反 0 件を確認してからマージする。**待機期間を入れた状態で `main` の CI が赤くなると、
  以降のすべての PR が赤いまま積み上がる
- 2026-08-11 時点では `postcss-selector-parser@7.1.5` が 1 件違反する。この版は
  **2026-08-14T09:32Z に 7 日を超える**ので、それ以降に測り直せば 0 件になる
- 前倒しする必要があるなら期限つき除外を使い、**解除を PR-2 の完了条件に含める**

> **「違反しているエントリだけ古い版へ解決し直す」という第 4 の手は無い。**
> 検証が解決より先に走るため、`pnpm update -r postcss-selector-parser` も同じエラーで
> 落ちる（2026-08-11 実測）。取れる手は待つ・除外・全面再解決の 3 つだけである。

## 受け入れ条件（EARS）

Issue #69 の完了条件を EARS 記法（[`docs/guides/ears-writing.md`](../../guides/ears-writing.md)）で
書き直したもの。DoD 項目 8 の判定基準になる。

**ユビキタス**

- システムは、常に公開から 7 日未満の版を `pnpm install` で取り込まないこと
- システムは、常に `pnpm-workspace.yaml` を待機期間設定の単一の置き場とすること
- システムは、常に `pnpm turbo test typecheck lint build` の全タスクを緑で完了させること
  （Issue #69 の完了条件④「全 30 タスク緑」に対応）

**望まれない振る舞い**

- 公開から 7 日未満の版が lockfile に含まれる場合、システムは `pnpm install --frozen-lockfile` を
  `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` で終了コード 1 として失敗させること
- 待機期間の設定を削除した場合、システムは公開から 7 日未満の版の取り込みを許すこと
  （＝検査が現に効いていることの反証）
- 深刻度 high 以上の脆弱性が検出された場合、システムは CI を失敗させること
- 深刻度 moderate 以下の脆弱性が検出された場合、システムは CI を失敗させず、内容を出力に残すこと

**イベント駆動**

- マイナーまたはパッチの新しい版が公開されてから 7 日が経過したとき、システムは
  更新を提案する PR を自動で作成すること
- メジャーの新しい版が公開されてから 7 日が経過したとき、システムは Dependency Dashboard に
  その更新を提示すること（PR の作成は人の承認を待つ）
- 緊急の脆弱性修正を待機期間中に取り込む必要が生じたとき、システムは当該パッケージのみを
  除外する手順で取り込みを許すこと

**オプション**

- 除外設定を用いる場合、システムは除外の理由と解除予定を設定ファイル内のコメントに残すこと

## この設計で決めないこと

- **メジャー依存の更新そのもの**（12 件）→ #69 のマージ後に切り出す別 Issue
- **`trustPolicy`（信頼済み発行者・provenance による検証）の採否** — pnpm 11.5.0 が
  持つ別の供給網対策だが、Issue #69 のスコープ外であり、適用コストを未実測。
  **申し送りとして記録する**（下記「申し送り」）
- **カバレッジ閾値・構造監査・変異検査の CI 組み込み** → #70（段階 C）
- **`deploy.sh` の自動化** → #70（段階 C）
- **`docs/plans/` `docs/superpowers/` の物理的な整理** → #71（段階 D）

## 申し送り

| 宛先 | 内容 |
|---|---|
| #70（段階 C） | `pnpm audit` の CI 組み込みは **#69 で完了**。#70 側の該当項目は重複追加しない |
| #70（段階 C） | #70 本文の「PR テンプレート / Issue テンプレート」は **#68 PR-4 で対応済み**（`.github/pull_request_template.md` / `.github/ISSUE_TEMPLATE/{feature,task}.md` が実在） |
| #71（段階 D） | `.specify/feature.json` が実在しない `specs/001-planning-poker-mvp` を指している（実体は `docs/poker/specs/001-planning-poker-mvp/`）。そのため `setup-plan.sh` を叩くと空の `specs/` を新規作成してしまう。整理対象 |
| 別 Issue | メジャー依存 **12 件**の更新。#69 コメントの据え置き理由を背景として引き継ぐ（要再実測） |
| 別 Issue | `trustPolicy: no-downgrade` の採否。適用コスト（何件が落ちるか）の実測から |
| #69 本体 | **本書の受け入れ条件（EARS）を #69 へコメントとして転記する。**憲法 原則 VIII は「要求は Issue（EARS 記法）に記録する（MUST）」と定めており、要求の正本は Issue 側にある。ADR 0003 決定 2 は chore 系 Issue に EARS を強制しないが、本書が EARS で書いた以上は Issue へ届ける |

## 関連

- 親 epic: [#67](https://github.com/tomohiroJin/tasuki-tools/issues/67)（基盤整備）
- 前段階: [#68](https://github.com/tomohiroJin/tasuki-tools/issues/68)（規範とアーキテクチャの確立・完了）
- 次段階との境界: [#70](https://github.com/tomohiroJin/tasuki-tools/issues/70)（CI/CD 整備）
- 憲法: [`.specify/memory/constitution.md`](../../../.specify/memory/constitution.md)（原則 VII「検査は壊して確かめる」・原則 IX「小さく回す」）
- DoD: [`docs/guides/definition-of-done.md`](../../guides/definition-of-done.md)
