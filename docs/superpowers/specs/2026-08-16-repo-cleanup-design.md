# 不要なディレクトリ・ファイルの整理（#71）設計

- 対象 Issue: #71（epic #67 段階 D）
- 日付: 2026-08-16
- 起点: main `b7c6277`

## 1. 背景 — Issue 本文の前提を叩き直した結果

#71 の本文は 2026-08-05 の実測に基づいており、**「やること」6 項目のうち 2 つは宛先が消滅し、
2 つは既に達成済み**だった。現行 main で測り直した結果は次のとおり。

| 本文の記述 | 2026-08-16 の実測 | 判定 |
|---|---|---|
| `docs/` 3.0M | 4.2M（追跡 192 ファイル） | 腐敗 |
| 最大は `docs/plans/` 1.3M | 最大は `docs/superpowers/` 2.2M（71 本）。plans は 2 位 | 首位が入れ替わり |
| `docs/plans/` 16 ディレクトリ | 15（`archive/` 含む。`archive/` の中身は 1 ファイル） | 微修正 |
| `docs/BACKLOG.md` が陳腐化 | ファイルごと存在しない（#68 / PR #105 が解体済み） | 宛先消滅 |
| `docs/` の入口を作る | `docs/README.md` が既に正本の宣言と入口表を持つ | 達成済み |
| リンク切れが無いことを確認 | `check-links.mjs` が CI で常時走り緑 | #70 で自動化済み |
| SC027 到達不能モジュール 0 件 | 今も 0 件 | 生存 |
| 完了条件「全 30 タスク緑」 | turbo は 44 タスク | 数字が腐敗 |
| `dompurify` が未使用（コメント） | もう存在しない（#69 で削除済み） | 宛先消滅 |

本文に一言も無い主題がコメント側で育っていた。**spec-kit 経路が丸ごと死んでおり、
同じディレクトリに憲法の正本が同居している。** これが #71 の実質的な中心である。

### 死に方の内訳（実測）

`.specify/feature.json` が実在しない `specs/001-planning-poker-mvp` を指している
（実体は `docs/poker/specs/001-planning-poker-mvp/`）。申し送りは「3 本のスクリプトが
いずれも失敗するか空の `specs/` を作る」と書いていたが、**挙動は 3 者 3 様だった**。

| スクリプト | 終了コード | 副作用 |
|---|---|---|
| `check-prerequisites.sh` | 1 | なし |
| `setup-plan.sh` | **0** | **`specs/001-planning-poker-mvp/plan.md` を実際に作る** |
| `setup-tasks.sh` | 1 | なし |

最も危険なのは `setup-plan.sh` で、**exit 0 で成功したように見えながらリポジトリ直下に
幽霊ディレクトリを生やす**。`specs/` は `.gitignore` に無いため `git status` に現れ続ける。

追跡下の `.claude/skills/speckit-*` 10 本はすべてこの死んだ経路に依存している。
`AGENTS.md` はこの 10 本を 1 つも案内していない。実運用の設計文書は
`docs/superpowers/`（specs 32・plans 39）で回っており、命名は
`YYYY-MM-DD-<topic>[-design].md` で完全に統一され、進行中のものは 1 本も無い。

## 2. 決定

- **D1** spec-kit 経路を廃止する。`.specify/` は道具部分もろとも消し、
  `.claude/skills/speckit-*` 10 本も同時に削除する。
- **D2** 憲法の正本を `.specify/memory/constitution.md` から
  **`docs/constitution.md`** へ移す。三層（憲法・ADR・ガイド）が `docs/` 直下で揃う。
- **D3** 憲法は**中身を変えない**。版のみ 2.1.3 → **2.1.4（PATCH）**へ上げ、
  Sync Impact Report を 1 件足す。
- **D4** `.claude/` を **`.gitignore` に入れない**（追跡候補のまま残す）。ただし speckit スキル
  10 本の削除で**追跡ファイルは 0 件になる**。git は空ディレクトリを追跡しないため、
  クローン直後に `.claude/` は存在しない。
- **D5** `docs/plans/archive/` は**そのまま残す**。当初は「1 ファイルしか無い中途半端な
  二重構造」として廃止する設計だったが、敵対的検証で**撤回した**（理由は 4 節）。
- **D6** 設計文書の追記規約を **ADR 0002 の 1 箇所だけ**を正本として明文化する。
- **D7** 1 Issue = 1 PR（ADR 0013 の既定）。各コミットで検査を緑に保つ。

### D1 の対象

| 対象 | 件数 | 理由 |
|---|---|---|
| `.specify/scripts/bash/` | 5 | `setup-plan.sh` が幽霊ディレクトリを生む |
| `.specify/templates/` | 5 | 上のスクリプト専用の vendor。単体では意味を持たない |
| `.specify/workflows/` `integrations/` | 4 | spec-kit のワークフロー登録 |
| `.specify/feature.json` `init-options.json` `integration.json` | 3 | `feature.json` が元凶 |
| `.specify/memory/.constitution-template.json` | 1 | `speckit-constitution` 専用 |
| `.claude/skills/speckit-*` | 10 | すべて上の経路に依存。誰にも案内されていない |

合計 28 ファイル削除、1 ファイル移動（憲法）。

### D3 の根拠 — 憲法は spec-kit に依存していない

**spec-kit ワークフロー順守の MUST は #68 で既に憲法から撤廃済み**である
（旧「開発ワークフロー」節ごと。「`constitution → specify → plan → tasks → implement`
の順守」「成果物を `specs/` 配下に保存」を含む 3 つの MUST）。したがって憲法本体は
spec-kit に一切依存しない。

憲法の 1〜164 行目は 4 版分の改版履歴（HTML コメント）で、`.specify/templates/*` を
15 箇所名指ししている。**全部コメント内かつバッククォート無し**なので `check-links` の
コードパス検査に掛からない。当時の記録としてそのまま残す。

版を上げる判断は「原則は不変だが正本のパスが変わり全参照が動く」ことによる。
原則の追加・削除・拡張は無いため PATCH とする。

## 3. 移設のコスト（破壊検証で確定）

`.specify/` と `.claude/skills/` を実際に削除して測った（使い捨てブランチ・復元済み）。

| 直す対象 | 件数 | 検出する検査 |
|---|---|---|
| `check-links.mjs` の定数（`LIVE_DOCS` の `.specify/memory/`、`DORMANT_DOCS` の `.claude/skills/` と `.specify/templates/`） | 3 | `checkConstants` |
| `check-links.mjs` の `REPO_TOP_LEVEL` 正規表現から `\.specify` を外す | 1 | — |
| Markdown リンク（相対パス） | 10 箇所 / 8 ファイル | check-links |
| バッククォート内のコードパス表記 | 20 箇所 / 11 ファイル | check-links |
| `list-scan-targets.mjs` の shell 除外 | 1 | 「除外が 1 件も一致しません」で exit 1 |
| `list-scan-targets.test.mjs` の題材 | 2 テスト | — |
| ADR 0009 D6 の記述 | 2 箇所 | **検査に掛からない**（下記） |
| ADR 0002 の三層表・19 行・87 行 | 3 箇所 | check-links |
| `.github/workflows/ci.yml` 233 行のコメント | 1 | — |

**休眠文書も Markdown リンクは検査される。** `DORMANT_DOCS` が免除するのは
コードパス検査だけで、リンクの実在検査は効く。実際 `docs/poker/README.md` と
`docs/superpowers/plans|specs/` の 5 本が落ちた。「記録だから壊れたまま残す」は選べない。

**`docs/adr/0009` の 2 箇所だけは検査が捕まえない。** `.specify/scripts/**` と
`**` 付きで書かれており、check-links はパスとして扱わないためプローブでも落ちなかった。
LIVE 文書 12 本の `.specify` 言及 23 箇所のうち、**バッククォートもリンクも無い素の言及は
0 件**で、この 2 箇所を除く全部を check-links が捕まえる。

**構造監査は無反応**（exit 0）。`docs/` も `.specify/` も走査していない。
つまり**完了判定を担うのは check-links と list-scan-targets の 2 本だけ**である。

## 4. 規範文書の扱い

### ADR 0002（三層の定義）— 表の更新 ＋ 追記

決定の中身は変えない。三層表・19 行・87 行の指し先を `docs/constitution.md` へ書き換え、
**なぜ変わったかを追記節に残す**（ADR 0009 D6 が 2026-08-16 に「手段の差し替え」を
追記で記録した先例に倣う）。放置すると check-links が「実在しないパス」で落とすため、
表の値そのものは更新が必須である。

同じ追記で D6 の規約を明文化する。

> `docs/plans/` は SDD 期の記録一式、`docs/superpowers/` は現行の設計文書。
> **どちらも追記のみで、完了しても移動しない。ディレクトリ名も当時のまま改名しない**（記録だから）。

**この規約の正本は ADR 0002 の 1 箇所だけ**とする。`docs/README.md` には要約と参照のみを
置き、規約本文は転記しない（同じ表を複数の文書へ写して件数を食い違わせた前例がある）。

同じ追記に、**移設前の文書は当時のパスを指している**ことを明記する。

> 2026-08-16 以前の文書は憲法を `.specify/memory/constitution.md` として参照している。
> これは当時の正本のパスであり、記録として正しい。**現在の正本は `docs/constitution.md`。**

### `docs/plans/archive/` を廃止しない理由（当初案の撤回）

当初は「中に 1 ファイルしか無く、規約が宣言されないまま中途半端に存在している」として
廃止する設計だった。敵対的検証で 2 つの実害が出たため撤回する。

1. **上の D6 規約と正面から矛盾する。** 「記録は完了しても移動しない・改名しない」と
   決めた同じ設計の中で、記録ファイルを移動することになる。
2. **参照が実在し、片方は検査が捕まえない。**

| 参照元 | 形式 | 検査 |
|---|---|---|
| `docs/adr/0011` | Markdown リンク（LIVE） | 落ちる |
| `docs/plans/tdd-mob-pro-timer/plan.md`・`spec.md` | バッククォート（休眠） | **落ちない。静かに壊れる** |
| `docs/superpowers/plans/2026-08-13-security-norms.md` | バッククォート（休眠） | **落ちない** |
| 憲法 78 行 | HTML コメント内 | 落ちない |

`archive/` には**実装前の最終設計書**が入っており、隣接ディレクトリの spec / plan / tasks とは
種類が違う。構造が悪いのではなく**宣言が無かった**だけなので、ADR 0002 の追記で
位置づけを説明するに留める。

### ADR 0009 D6 — 追記のみ

D6 の「`.specify/scripts/**` は vendor のため対象外（MUST NOT）」は**対象そのものが
消滅して宛先を失う**。D6 本文は歴史として残し、追記で記録する。

> 2026-08-16・#71 で `.specify/` を廃止したため、この MUST NOT は空振りになった。
> 除外は `list-scan-targets.mjs` から削除した。**走査対象は 6 本のまま変わらない**
> （削除された 5 本はもともと除外されていたため）。

### 憲法 — 2.1.4（PATCH）

ADR 0002 の「憲法改版時は AGENTS.md の見出し同期を確認する（MUST）」に従い、
**見出し 11 本が不変であることを確認して Sync Impact Report に明記**する。

### その他

| ファイル | 直す箇所 |
|---|---|
| `AGENTS.md` | 8 行・31 行 |
| `docs/README.md` | 正本の宣言・入口表・plans の位置づけ（3 箇所） |
| `docs/adr/` 0004・0005・0006・0007・0011・0012 | 憲法パス 11 箇所 |
| `docs/guides/` architecture・security | 3 箇所 |
| `docs/poker/README.md`、`docs/superpowers/` の 5 本 | 相対リンク 6 箇所 |

## 5. 検査と破壊検証

### 対照実行（作業前の緑。壊す前に「壊さなければ緑」を見る）

- `node scripts/check-links.mjs` → `リンク検査 OK（走査 215 ファイル）`
- `node scripts/list-scan-targets.mjs shell` → 6 本
- 削除後も shell の対象は **6 本のまま**。CI の挙動は変わらない

### 破壊検証（DoD 項目 3）

新しい検査は足さないが、**除外を 1 件消して `exclusions: []` にする**ため次を確かめる。
「0 件ガード自身が穴だった」「対策が自分の塞ぐ欠陥を持っていた」を繰り返しているため。

1. **死んだ除外の検出が空振りしていないこと** — `exclusions` が空になった後、
   わざと実在しない除外を 1 件足して `list-scan-targets.mjs shell` が赤くなることを
   確認し、戻す
2. **新しい憲法パスが本当に検査に載っていること** — `check-links.mjs` の `LIVE_DOCS` に
   実在しないエントリを 1 件足し、
   `LIVE_DOCS が実在しないパスを指しています: <足したパス>` で落ちることを確認して戻す

どちらも**壊す前に「壊れたこと」自体を確認する**（`grep -c` で改変が入ったことを見てから
走らせる）。壊したつもりで壊れておらず空振りした検証を過去に 6 回している。

**壊し方を間違えると空振りする（実測で確定）。** 当初 2 は「`docs/constitution.md` を
一時退避する」手順だったが、これでは確かめられない。

- `check-links.mjs` の `exists` は **`git ls-files` の索引**を見ており、ファイルシステムを
  見ていない。退避してもエントリは「実在する」と判定される
- 実際に退避して走らせると、名指しの赤ではなく **Node のクラッシュ**になった
  （追跡下のファイルが disk に無い状態を想定していないため）
- 定数を書き換える壊し方に差し替えて実測したところ、
  `LIVE_DOCS が実在しないパスを指しています: docs/no-such-probe/` と**名指しで落ちた**

同じ理由で、**「ファイルを消して赤を見る」形の破壊検証はこの検査に対しては使わない。**

`list-scan-targets.test.mjs` の 2 テストは `.specify/scripts/` を題材にしている。
題材を消すだけだとテストが薄くなるので、**架空のパスを題材に差し替えて単体テストとしての
強度を保つ**（除外の仕組み自体は残り続けるため）。

`scan-target-wiring.test.mjs` の対照実行は check-links に連動して赤くなるが、
check-links が緑に戻れば自動で解消する。

### DoD 8 項目の当てはめ

| # | 項目 | 判定 |
|---|---|---|
| 1 | `pnpm test` 全緑 | 該当（`scripts/` のテストを触る） |
| 2 | E2E | 該当なし（利用者の経路は不変） |
| 3 | 新しい検査を壊して赤を見る | 該当（上の 2 つ） |
| 4 | 変異検査 | 該当（`mutation-check.mjs` 9 件が全部検出することを確認） |
| 5 | 実経路確認 | 該当なし（文書とスクリプト定数のみ） |
| 6 | Tidy First | **該当なし**（`archive/` 廃止を撤回したため、整地の対象が無くなった） |
| 7 | 文書への反映 | 該当（本体そのもの） |
| 8 | Issue の完了条件 | 該当。ただし本文の完了条件が腐っている（下記） |

## 6. 完了条件（本文の「全 30 タスク緑」を置き換える）

turbo は現在 44 タスクで、本文の数え上げは既に成立しない。**数え上げをやめて性質で指す。**

- `docs/` を見て、どれが現行の正本か迷わない
  → `docs/README.md` と ADR 0002 が正本の置き場と追記規約を宣言している
- リンク切れ 0
  → `node scripts/check-links.mjs` が緑
- 検査を回す
  → CI 5 ジョブが緑（件数は数えない）
- spec-kit 経路が消えている
  → `git ls-files .specify` が 0 件、`git ls-files .claude` が 0 件、
    かつ**作業ツリーが clean**（幽霊 `specs/` が生まれていない）

「`setup-plan.sh` が実行できない」は完了条件に**しない**。ファイルを消せば必ず成立する
恒真の判定であり、何も確かめていないため（#149 で同型の恒真な削除判定手順を作った前例がある）。

置き換えた完了条件は #71 へコメントで残す。

## 7. PR とコミット

**1 Issue = 1 PR**（ADR 0013）。分割してよい 4 つの理由のどれにも当たらない
（独立 revert 単位なし・段階的リリース不要・危険度は一様・レビュー破綻の実績なし）。

ブランチ: `chore/71-retire-spec-kit`

| # | コミット | 検査 |
|---|---|---|
| 1 | `docs: 憲法を docs/constitution.md へ移し 2.1.4 とする（#71）` — `git mv` ＋ 参照 30 箇所 ＋ `check-links.mjs` の `LIVE_DOCS`／`REPO_TOP_LEVEL` ＋ Sync Impact Report を同一コミットで | 緑 |
| 2 | `chore: spec-kit 経路を廃止する（#71）` — `.specify/` 残りと speckit スキル 10 本 ＋ `DORMANT_DOCS` 2 件 ＋ `list-scan-targets` の除外とテスト ＋ `ci.yml` のコメントを同一コミットで | 緑 |
| 3 | `docs: ADR 0002 に追記規約と移設の記録を、ADR 0009 に D6 の宛先消滅を記録する（#71）` | 緑 |
| 4 | `docs: #71 の振り返り（#71）` | 緑 |

1 と 2 は大きめになるが、**分けると必ず赤い中間状態ができる**。各コミットで検査が緑である
性質を優先する。

振り返り（`docs/retrospectives/2026-08-16-issue-71-cleanup.md`）は同じ PR に入れる。
工程で割った振り返り PR #127 は差分 1 行あたりの説明コストが 12.4 と跳ねており、
`docs/guides/pr-granularity.md` が名指しで戒めている。

**作業場所は `/home/vscode/tasuki-work`**（overlay）。`/workspaces` 側は 9p マウントで
ディレクトリ操作が壊れ、約 48 倍遅い。マージ後、利用者側の
`/workspaces/claym/local/Tasuki` で `git pull` が必要になる。

## 8. 残存ブランチ

- `origin/docs/136-security-norms` — main にマージ済み（`--is-ancestor` で確認済み）。
  **リモートを触る戻しにくい操作なので、PR マージ後に改めて確認を取ってから削除する**
- ローカル `docs/103-ip-rate-limit-design`（tasuki-work のみ）— ブランチにしか無いファイルは
  0 件。作業のついでに削除する

## 9. 塞げていないこと・射程外

- **`docs/` のサイズは減らない。** 4.2M のうち 2.2M を占める `docs/superpowers/` 71 本は
  すべて記録として残す。#71 本文が「そこにしか無い『なぜそうしたか』」を明示的に
  警告しており、削除も階層化も情報を増やさないため。
- **`docs/plans/` の古いディレクトリ名は改名しない**（`tdd-mob-pro-timer` など）。
  記録であり、改名すると休眠文書からの参照が大量に壊れる。D6 の規約に明記する。
- **`.claude/` は追跡下に残るが中身が 0 件になる。** git は空ディレクトリを追跡できないため、
  クローン直後には存在しない。各自のローカルなスキルは引き続き `git status` に現れる。
- **憲法の Sync Impact Report は `.specify/templates/*` を 15 箇所名指ししたまま残る。**
  当時の記録であり、HTML コメント内かつバッククォート無しなので検査に掛からない。
- **休眠文書 12 ファイル・25 箇所が古い憲法パスを指したまま残る。** 休眠文書では
  バッククォート内のコードパスが検査されないため。休眠文書の憲法パス言及は全 31 箇所で、
  うち Markdown リンクと同一行の 6 箇所だけが検査に強制されて直る。**残り 25 箇所は
  当時の記録として正しいので直さない**が、「検査が守っていない」ことは意識しておく。
  現在の正本の所在は ADR 0002 の追記が示す。
- **#158 の申し送り 2 件**（構造監査のエラー時の走査量／`findMissingPaths` が
  `existsSync` である件）は #72 の妨げにならないため触らない。

## 10. 関連

- Issue #71（epic #67 段階 D）
- `docs/adr/0002`（三層の定義）・`docs/adr/0009`（CI の射程）・`docs/adr/0013`（PR の粒度）
- `docs/adr/0014`（走査対象の健全性。#135）
- `docs/guides/definition-of-done.md`・`docs/guides/pr-granularity.md`
