# ADR-0032: 本番デプロイのコマンドは、AI ツールのフックで人に聞いてから走らせる

- **ステータス**: Accepted（2026-11-01。利用者が PR tomohiroJin/tasuki-tools#498 で採択。`docs/adr/0030` 決定 1 のとおり人が判断した）
- **関連**: [#490](https://github.com/tomohiroJin/tasuki-tools/issues/490)（親 [#483](https://github.com/tomohiroJin/tasuki-tools/issues/483)） /
  [ADR-0030](./0030-ai-driven-development-operations.md)（決定 1「人の明示の指示か承認を待つ操作」・決定 2「機械で守れるなら検査として足す」・影響 5） /
  [ADR-0009](./0009-ci-scope-and-checks.md)（検査の配置） /
  [ADR-0011](./0011-threat-model-and-data-classification.md)（秘密と資格情報の分類） /
  [#488](https://github.com/tomohiroJin/tasuki-tools/issues/488)（手元の速い段）

## 背景

`AGENTS.md`「AI 運用規則」は、本番デプロイ（`deploy.sh`・`systemctl`・Caddy の reload）を人の明示の指示まで待つと定めている。
`docs/adr/0030` 決定 2 は「機械で守れるなら検査として足す」としているが、この規則は**文章だけで守っていた**。
リポジトリには AI ツールの設定（`.claude/settings.json` など）が無く、エージェントが規則を読み落とせば、そのまま走る。

2026-11-01 にこのリポジトリのクラウドのコンテナで確かめたところ、`systemctl` は `/usr/bin/systemctl` にあり、
フックを外した Claude Code（`claude -p`・`--allowedTools Bash`）は `systemctl --version` をそのまま走らせた（下の「確かめたこと」の対照）。

## 決定

### 1. 止めるコマンドの一覧は `scripts/lib/agent-guard.mjs` の 1 か所に置く

- **MUST**: 止めるコマンドの一覧の正本は `scripts/lib/agent-guard.mjs` の `GUARDED_COMMANDS` とする。
  ツールごとの設定は**一覧を写さず、判定を呼ぶ入口だけ**を持つ（`docs/adr/0030` 決定 3 と同じ考え方）
- 一覧（2026-11-01）: `deploy/deploy.sh`・`deploy/setup.sh`・`deploy/firewall/connlimit.sh`（スクリプト）、`systemctl`・`service`（どの下位コマンドでも）、
  `caddy reload`・`caddy stop`。`caddy version`・`validate`・`fmt` は当てない（版の確認と E2E の作業を妨げない）
- 判定はシェルの部分集合を読む。`sudo`・`su`・`runuser`・`pkexec`・`env`・`timeout` ほかの包むコマンド（短い選択肢のまとまり `sudo -iu root`・値をつなげた `sudo -uroot` も。getopt と同じく左から読む）、`bash -c`・`ssh <host> <cmd>`・`eval`・`xargs`・`find -exec`、
  区切り（`;`・`&&`・`|`・改行・サブシェル）、コマンド置換、引用符とバックスラッシュで割った綴りを読む。
  `cat deploy/deploy.sh`・`grep systemctl …`・`command -v systemctl` のように**引数に名前が出るだけのもの・場所を調べるだけのものは当てない**
- **MUST**: 読み切れないとき（入れ子が深すぎる・フックの入力が読めない）は、当てる側（人に聞く側）に倒す

### 2. Claude Code は PreToolUse フックで「人に聞く」

- **MUST**: `.claude/settings.json`（追跡する。`.claude/` は無視の対象なので `git add -f`）の `hooks.PreToolUse` に、
  matcher `Bash|Monitor`（シェルのコマンドを走らせる道具。`scripts/lib/agent-guard.mjs` の `SHELL_TOOLS`）で
  `node "${CLAUDE_PROJECT_DIR}/scripts/agent-guard-hook.mjs"` を置く
- Monitor を足したのは PR #498 のレビュー 2。Claude Code 2.1.316 では、Monitor を走らせるときも matcher `Bash` のフックが
  `tool_name: "Bash"` で呼ばれることを実経路で見た（フックの入力を書き出して確かめた）。つまり今の版では `Bash` だけでも止まる。
  それは版の挙動に頼る守りなので、Monitor の名前でも判定する
- 当たったときは `permissionDecision: "ask"` を返す。**拒む（`deny`・exit 2）にはしない。** 人が明示に指示したときは、
  その場の承認で、設定を書き換えずに進められる（#490 の EARS 2）。人が自分の端末で `./deploy/deploy.sh` を叩くのは、
  フックの外なので何も変わらない
- 承認する人がいない走り方（`claude -p`）では、聞けないので走らない（Claude Code の既定）
- **MUST NOT**: 同じ一覧を `permissions.ask` の規則（`Bash(systemctl:*)` ほか）に写さない。規則は前方一致で、
  `sudo systemctl`・`bash -c '…'`・`cd deploy && ./deploy.sh` を取りこぼし、しかも一覧が 2 か所になる

### 3. 配線のずれは検査で捕まえる

- **MUST**: `scripts/audit-agent-guard.mjs`（CI の `docs` ジョブ）が次を見る。
  ①`.claude/settings.json`・入口・判定の部品が追跡下にある
  ②`settings.json` の PreToolUse に、`SHELL_TOOLS` のどれにも当たる matcher で入口が置かれ、`disableAllHooks` が true でない
  ③宣言したスクリプトが追跡下にあり、`deploy/` の下の実行するスクリプト（`*.sh`。読み込まれる部品の `deploy/lib/` を除く）が**どれも宣言にある**。
  デプロイの入口を足して一覧へ足し忘れる、を捕まえる
- 判定の読み方は `scripts/lib/agent-guard.test.mjs` が見る。変異 760〜771 が両方を守る（720〜725、ついで 740〜749 を取ったが、どちらも並行の PR #497 と重なったので振り直した）

### 4. 他のツールは、今は文章だけで守る

| ツール | 仕組みはあるか（2026-11-01 の調べ） | いまの扱い |
|---|---|---|
| Gemini CLI | フック（`BeforeTool`。`run_shell_command` で絞れる。実験的で、有効にする設定が要る）と、シェルのコマンドの前方一致の除外（`tools.exclude` ほか。版でキーの名前が違う） | 文章だけ（`GEMINI.md` → `AGENTS.md`） |
| GitHub Copilot | Copilot CLI とクラウドのエージェントは `.github/hooks/*.json` の `preToolUse`。VS Code のエージェントのフックはプレビュー | 文章の入口なし（改定 2026-11-04・#507。改定前は「文章だけ（.github の下の copilot-instructions.md → `AGENTS.md`）」） |

**改定（2026-11-04・#507）**: 上の表の Copilot の「いまの扱い」を、改定前の「文章だけ（.github の下の copilot-instructions.md → `AGENTS.md`）」から
「文章の入口なし」に直した（`docs/adr/0002` 追記（#258）の改定節つきの本文訂正。表の列は現況を語るため）。利用者が Copilot を
使わないと決めたので入口を外した（`docs/adr/0030` 決定 3 の改定と追記）。Copilot の面では、いまは文章の入口も置いていない。
Copilot を使い始めるときは、`AGENTS.md` を読むかとフックが効くかを、その時点の版で確かめてから決める。決定 4 は変えていない。

- **文章だけで守る理由**: どちらも、この環境にツールが無く、**実際に呼ばせて止まることを確かめられなかった**（原則 VII）。
  調べたのは公式の文書と検索の要約だけで、Copilot の文書（docs.github.com）にはこの環境から届かなかった。
  確かめていない設定を置くと、「止まる」と思わせたまま止まらない形を作る。置くのは確かめてからにする
- **MUST**: 置くときは、判定を写さず `scripts/agent-guard-hook.mjs`（か、同じ `scripts/lib/agent-guard.mjs` を呼ぶ入口）へ向け、
  `scripts/audit-agent-guard.mjs` の①②に足す。2 つの場所で同じ ISSUE を任せる試し（[#491](https://github.com/tomohiroJin/tasuki-tools/issues/491)）で確かめる
  - **改定（2026-11-04・#507）**: Copilot の分の「#491 の試しで確かめる」は、#491 の試しでは確かめられなかったので、
    「Copilot を使い始めるときに、その時点の版で確かめる」へ移した（上の改定）。Gemini CLI の分は、改定前の文面のまま残す（扱いは別に決める）。

### 5. コミットの前に速い検査を流すフックは、今は置かない

- 置かない。理由は 3 つ。①流す「速い段」がまだ無い（#488。何を流すかが決まっていない）
  ②Claude Code のフックとして置くと、Claude Code で作業したときだけ流れ、`docs/adr/0030` 決定 2 の「どこで開発しても同じ検査」に反する
  ③git の pre-commit として置くと、人の作業にも掛かり、置くための手順（`core.hooksPath`）が要る
- **速い段（#488・PR #497 の `pnpm check:fast`）が main に入ったら、#491（2 つの場所で試す振り返り）で決め直す**
  （git の pre-commit から速い段を呼ぶか。呼ぶなら全部のツールと人に同じく掛かる）。#488 は PR #497 の merge で閉じるので、決め直す場所は #491 に置く

#### 追記（2026-11-03・#504）: `gh pr create` の直前に、同じ ISSUE の先行 PR があれば聞く

同じフック（`scripts/agent-guard-hook.mjs`・matcher `Bash|Monitor`）に、先行 PR の判定を足す。決定 1〜3 は変えない。
`.claude/settings.json` の配線もそのままである。**本番のガードが主で、先行 PR の確認はそれを遅らせも消しもしない。**

- **MUST**: 本番デプロイの判定（`decideHookOutput`）を**最初に**評価する。当たったら、先行 PR の確認（gh と git）は
  **流さずに**、その `ask` をすぐ返す。コマンドに `gh pr create` も含まれるときは、理由に「先行 PR の確認は省きました」と添える。
  確認が遅れたり時間切れになったりしても、本番のガードが fail-open にならない（先行 PR の確認を待ってから合成する形は、
  自動のレビューで fail-open の穴として指摘され、取り下げた）
- **MUST**: `gh pr create`（別名 `gh pr new`）の直前に、同じ ISSUE の開いた PR・マージ済みの PR・リモートの枝を引き、あれば `ask`。
  番号は、自分の枝（`--head`・`-H` があればそれ、無ければ作業場所の今の枝）の `<type>/<番号>-…` か `issue-<番号>` と、
  `--title`（`-t`・`-t<値>`・`--title=<値>` も）の最初の `#番号` の最大 2 つ（同じなら 1 つ）。どこにも無ければ引かずに通す
  （確かめようがない）。引き方は `scripts/lib/prior-work.mjs` の 1 つで、`pnpm check:fast` の知らせと共有する
  （`docs/adr/0030` 決定 5 の追記）
- `gh pr create` の読み方は `scripts/lib/agent-guard.mjs` の字句の読みを使う（`findCommandsMatching`。複合コマンド・`bash -c`・`env`・
  `gh -R a/b pr create` も当てる）。`args` の照合は、選択肢を除いた**最初の語**から並ぶときだけ当てる
  （`gh issue list --search 'pr create'` に当てない）。判定の部品は `scripts/lib/prior-pr-hook.mjs`。
  入口が読み込むので、部品が追跡下にあるかを `scripts/audit-agent-guard.mjs` が見る。入口の配線は
  `scripts/agent-guard-hook.test.mjs` が入口を実際に起動して守る
- **上限（壁時計）**: 子プロセス（gh・git）は 1 つ 10 秒で、**プロセスグループごと** SIGKILL する（別のグループとして起こし、
  標準入力は閉じ、出力の管も閉じる）。確認全体は 15 秒で打ち切り、**打ち切ったときは `ask`** （確かめられなかったので聞く）。
  直接の子だけを止めると、孫（gh の下の git・git の下の ssh）が出力の管を握ったままで、Node が管の閉じるのを待って終わらず、
  Claude Code のフックの既定の時間切れ（60 秒）を超えうる（偽の gh で実測: 修正前は `ask` が 10.2 秒、プロセスの終了が 64.1 秒）。
  終わりを支えるのは、**プロセスグループごとの SIGKILL** と、時間切れのときに**管を `destroy` する**ことである（変異 873 が前者を守る）。
  残余: `setsid` などで別のセッションに移った孫は止めない。管を切り離すので、フックはその孫を待たない
  番号 2 つ分と gh・git は並列に引くので、待ちは長い方 1 回分である
- **gh が使えなかったとき（引けなかったとき）、検索が上限で切れて先行が無いと言い切れないときは `ask` に倒す。** 理由: 決定 2 は
  「読めないときは当てる側に倒す」とした（入力が読めない → ask）。黙って通すと、確かめていないのに確かめたように見える。
  `gh pr create` 自身が gh・認証・ネットワークを要するので、引けない環境で聞いても余計な手間はほぼ増えない
- **`cd` の先は、登録済みの worktree のときだけ使う。** フックは許可の**前**に走るので、コマンドの文字列から取った場所で
  git・gh を流すと、信用できないディレクトリの `.git/config`（`core.fsmonitor`・`core.sshCommand` など）が人の承認より前に
  実行される。そこで、コマンドの**先頭**の `cd <dir> &&`（`;`）を読んだときは、`git worktree list --porcelain`（フックの入力の
  `cwd` で引く）に載った場所と一致するときだけその場所で引く。**一致しなければ、その場所では何も流さずに `ask`**
  （理由に場所を書く）。登録の一覧を引けないときも同じ。`cd` が途中・`~`/変数/`-`・`git -C`・`pushd` は読まず、入力の `cwd` のままにする
- **`git` に `-c core.fsmonitor=false -c core.sshCommand=` のような上書きは付けない。** 流す git は `rev-parse --abbrev-ref`・
  `ls-remote`・`worktree list` で、fsmonitor を使わない。`core.sshCommand` は、利用者が push や ls-remote の認証のために
  設定していることがあり、空にすると引けずに毎回 `ask` になる。流す場所は入力の `cwd`（Claude Code が信用を確かめた作業場所）と
  登録済みの worktree だけで、そこの設定は利用者自身が `git push` に使うものである
- 本番デプロイの判定と違い、先行 PR の確認は**作業の重複を防ぐ歯止め**である。承認すれば進める（`deny` にはしない）。
  知っていて承認することも、フックを切ることも防げない
- 残余: `gh api …/pulls` のように PR を直接作る経路・別の言語やスクリプトの中の呼び出しは当てない。`--head <別の枝>` の
  `owner:branch` は branch だけを見る。番号の無い枝名では引かない。登録済みの worktree の `.git/config` が悪意を持つ場合
  （利用者が自分で登録した場所）は防がない
- 残余（記録）: 入力の `cwd` そのもの（先頭に `cd` が無いとき）は信用する場所として確かめない。セッションの作業場所が信用できない
  clone なら、許可の前に git と gh がそこで流れる。エージェントがそこで `git status` を流すのと同じ範囲である
- 実測していないこと: Claude Code が実際に `gh pr create` でこのフックを呼ぶことは、標準入力の JSON を渡した確認までで、
  実際のセッションでは確かめていない（決定 2 の Monitor の確認と同じ書き方）。フックの既定の時間切れが 60 秒であることは、
  公式の文書の記憶によるもので、この環境では確かめていない

### 退けた案

| 案 | 退けた理由 |
|---|---|
| `permissions.deny` / `permissions.ask` の規則だけで止める | 決定 2 の MUST NOT。前方一致で包んだ形を取りこぼし、一覧が 2 か所になる |
| `deny`（exit 2）で拒む | 人が指示したときも設定を書き換えないと進めない（#490 の EARS 2） |
| 名前が文字列のどこかに出たら当てる | `cat deploy/deploy.sh`・`grep systemctl` まで聞くことになり、デプロイの周りの作業ができない |
| 確かめずに Gemini CLI・Copilot の設定も置く | 決定 4。止まると思わせて止まらない形を作る |

## 影響

- `.claude/settings.json` を初めてリポジトリに置く。Claude Code で `systemctl`・`deploy.sh` ほかを走らせると、承認を求められる
- 歯止めであって壁ではない。変数・別名を経た呼び出し・別の言語からの呼び出し（`python -c "os.system(…)"`）・
  エージェントが書いたスクリプトの中の呼び出し・標準入力やヒアストリングでシェルへ渡す形（`echo '…' | bash`・`bash <<<'…'`）・
  読んでいない包むコマンド（`flock`・`strace`・`script -c`・`nsenter`・`unbuffer` ほか。PR #498 のレビュー 3 で記録のみとした）は素通りする。利用者が手元の設定（`.claude/settings.local.json`・`~/.claude/settings.json`）で
  `disableAllHooks` にすれば止まらない。**本番への最後の壁は、デプロイの資格情報（SSH の鍵）がエージェントの環境に無いこと**（`docs/adr/0011`）のままである
- 判定の一覧を変えるのは `scripts/lib/agent-guard.mjs` だけで済む（ADR の改版は要らない。`docs/adr/0002` 決定 2）
