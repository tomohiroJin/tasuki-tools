# ADR-0037: AI の事故を止める歯止めを、本番デプロイの外へ広げる

- **ステータス**: Proposed（採択は人が行う。`docs/adr/0030` 決定 1）
- **関連**: [#578](https://github.com/tomohiroJin/tasuki-tools/issues/578) /
  [ADR-0032](./0032-agent-guard-for-production-commands.md)（本番デプロイの歯止め。この ADR は決定 1 の「止める範囲」を広げる） /
  [ADR-0030](./0030-ai-driven-development-operations.md)（決定 1・2・5） /
  [ADR-0011](./0011-threat-model-and-data-classification.md)（資格情報の分類）

## 背景

ADR-0032 は、`AGENTS.md`「人の明示の指示か承認を待つ操作」のうち**本番デプロイ**だけを、PreToolUse フックで人に聞くと決めた。
#578（メモリの棚卸し）で、繰り返し起きた事故のうち文章だけで守っているものが見つかった。どれも本番デプロイではないので、
ADR-0032 の範囲の外にある。

- サブエージェントが `git push`・`gh pr merge`・枝の切り替え・`git reset --hard`・`git worktree remove`・`kill`/`pkill` を走らせ、
  まとめ役の枝・作業ツリー・利用者の dev サーバーが壊れた（メモリ「サブエージェントにプロセスと枝を触らせない」「サブエージェントにマージさせない」）
- `git checkout -- <path>`・`git restore`・`git stash` で、別のエージェントや自分の未コミットの変更が消えた
- `pnpm --filter @tasuki/tasuki-sync`（実在しない名前）が 0 件に当たり、何も走らずに緑になった
- 閉鎖キーワードの事故が両方向にある。バッククォートで囲むと効かず、説明のつもりで地の文に書くと squash マージで ISSUE を勝手に閉じる
- 構造監査の合否の無い指標は、悪くなっても監査が緑のままで、後退に誰も気づかない

## 決定

### 1. サブエージェントの呼び出しは、フックの入力の `agent_id` で見分ける

- **実測**（2026-11-11・Claude Code 2.1.321・`claude -p --setting-sources ""` に確かめ用の PreToolUse フックだけを渡し、入力をそのまま書き出した）:
  サブエージェント（Agent ツールで起こした `general-purpose`）の中の Bash 呼び出しの入力には `agent_id`（例 `aa2c43bc26cb36705`）と
  `agent_type`（例 `general-purpose`）がある。まとめ役（メインのセッション）の同じ Bash 呼び出しの入力には**どちらも無い**。
  そのほかの項目は同じ（`session_id`・`transcript_path`・`cwd`・`permission_mode`・`tool_name`・`tool_input`・`tool_use_id`・`effort`）
- **MUST**: `agent_id` が空でない文字列のときだけ「サブエージェントの呼び出し」と扱う。無ければ（まとめ役・人の端末）止めない
- 残余: `agent_id` を持たない形で呼ばれるサブエージェント（将来の版・チームメイトの形）は見分けられない。版が変わったら実測し直す

### 2. サブエージェントからの次の操作は `ask` で人に聞く

`git push`・`gh pr merge|close`・`git switch`・`git checkout`（`--` の後ろに pathspec が無い形・`-b`/`-B`/`--orphan`/`--detach` の形＝枝の操作）・
`git reset --hard`（`--h` などの省略形も）・`git worktree remove`・`kill`/`pkill`/`killall`。

- 一覧の正本は `scripts/lib/agent-guard.mjs` の `SUBAGENT_GUARDED_COMMANDS`（ADR-0032 決定 1 の `GUARDED_COMMANDS` と同じ置き場・同じ読み方）。
  本番デプロイの判定が先で、当たらなかったときだけ見る
- 入口の束ね方（`scripts/lib/hook-combine.mjs`）: 本番デプロイに当たったときだけ他を省いて返す（ADR-0032）。それ以外は、判定（サブエージェント・未コミットの変更・`pnpm --filter`・閉鎖キーワード・先行 PR）ごとに try を分け、**投げた判定は `ask`（判定に失敗しました）に倒し**、当たった理由を**全部まとめて**出す（先に返して後を捨てない・通る側に倒さない。PR 2 のレビュー I1・/code-review 583 の 3・4）
- **迷う形は聞く**: 危ない操作の名前（`push`・`merge`・`kill` ほか）が文字列にあるのに、宣言で読み切れず、
  許可リストの「読むだけ・記録するだけ」（`grep`・`git log`・`git commit -m …`・`gh pr view` ほか。`isTameCommand`）でも
  単純な安全な形（`git checkout [<rev>] -- <path>`・`git reset` の `--soft`/`--mixed`・`git worktree add|list`）でもなければ `ask`

背景の事故の型に合わせ、次も一覧に足した: 枝の削除・改名・付け替え（`git branch -d/-D/-m/-M/-f/-c/-C`。一覧・現在の枝・作成〈`git branch <名前> [<開始点>]`〉は通す。**上流の付け替え**〈`-u`・`--set-upstream-to`・`--unset-upstream`〉と `--edit-description` は通す形に含めない）、プロセスを止める別の道（`npx|bunx|pnpm dlx kill-port`・`fuser -k`・tmux の停止〈サブコマンドが `kill` で始まるもの〈`kill-server`・`kill-session`・`kill-window`・`kill-pane`・別名 `killw`・`killp`・前方一致の省略〉・`send-keys`〈別名 `send`〉の `C-c`・`^C`・`C-\`・`respawn-pane|respawn-window` の `-k`〉）、GitHub への書き込み（`gh api` の GET 以外・フィールド付き。**ただし** `-X GET`／`--method GET` を明示したフィールド付きの検索は読む形として通す。`gh api graphql` は query でも聞く（POST で、`mutation` の語を部分文字列で判定すると、シェルが渡す文字列との食い違い〈`$'…'`・波括弧の展開・バックスラッシュ〉で素通りしうるので、判定を賢くせず狭くした）。`--input`・方法が不明は聞く、`gh pr review --approve|--request-changes`）。**`git merge`・`git rebase`・`git commit --amend` は足さない**（実装役が自分の枝でふつうに使うので、聞くと日常の作業を止める。他人の枝・main へのそれらは push とマージの歯止めが守る）。

### 3. 未コミットの変更を消す git は、変更があるときだけ `ask`（許可リスト・fail closed）

`scripts/lib/discard-guard.mjs`。対象は `git checkout -- <path>`・`git restore`・`git stash`・`git reset --hard`・`git clean`・`git switch -f`、`git rm -f`・`git mv -f`・`git checkout-index -f`・`git read-tree --reset/-u`・`git submodule … --force`・`git worktree … -f`（`git help -a` の下位コマンドを洗った。候補の語の一覧は `scripts/lib/agent-guard.mjs` の `OPERATION_WORDS` が唯一の置き場）。`merge`・`pull`・`rebase`・`apply` は変更があると git 自身が拒むので含めない。シェルが展開する pathspec（`{a,b}`・先頭の `~`）は展開前の文字では確かめられないので聞く。

- 許可リストの「おとなしい形」（サブエージェントの受け皿より前で通す形）は、先頭に環境変数の代入が無く、git の全体の選択肢が `-C <dir>` だけの `git branch`（一覧・作成）、`fuser`（`-k` 無し）、`gh pr review` の決めない形、`gh api` の読む形だけ。`cat > <パス> <<[ ]'TAG'`・`cat <<[ ]'TAG' > <パス>`（前に `mkdir -p <パス> &&` を置いてよい。パスは引用符・`$`・区切りを含まない）の本文も文章として扱う。**ただし終端の行の後ろに何も続かないときだけ**（書いたスクリプトを同じコマンドで `bash x.sh` と走らせる形は、本文も隠さず判定する。`git branch` の `--format <値>`・`--column`・`--abbrev` は読む形）。前の行が `\` で終わる行（継続）は決まった形として隠さない
- ヒアドキュメントの本文は、**データとして使われる形**（消費者が `cat`・`<<` が引用符とコメントの外・終端の語が引用符つきか本文に `$(`・バッククォートが無い。`git commit -m "$(cat <<'EOF' …)"`）だけ文章として隠す。
  `bash <<EOF`・パイプで渡す形・終端の後ろに続く行・引用符の中の `<<` で、本文に危ない操作の名前があれば読めないとして聞く
- 「読むだけ」の許可リストの `git branch`・`git fetch` は、枝・参照を消す・動かす形（`-d/-D/-f/-m`・`--prune`）を除く
- 作りは**許可リスト**: ①候補（`git` と対象の下位コマンドの語が文字列のどこかにある）→ ②読むだけ・記録するだけなら通す →
  ③**確かめてよい単純な形**（単一のコマンド・先頭が `git`・全体の選択肢なし・既知の少数の選択肢）だけ `cwd` で未コミットの変更を見て、あれば `ask`・無ければ通す →
  ④**それ以外の候補は全部 `ask`**（「形が単純でないので確かめられない」）。確かめ自体が失敗しても `ask`。
  禁止の形を数え上げる作りは、`cd`・`GIT_DIR`・`-c core.worktree`・入れ子の文字列・省略形ほか、3 回の敵対的レビューで穴が尽きなかったので退けた
- 手順書の往復（`docs/guides/procedures/adversarial-review.md` の `git checkout origin/main -- <テスト>` → `git checkout HEAD -- <テスト>`）を止めないため、
  `checkout`・`restore` は**作業ツリーの未コミットの変更（index との差）だけ**を見る。1 回目で index に載った変更は、2 回目では変更に数えない。
  `stash`・`reset --hard` は index の変更も見る
- path 指定の `checkout`/`restore` は、同じ名前の追跡外のファイル（ignore されないもの）も変更に数えて聞く。**残余**: `.gitignore` の対象のファイルを上書きする形は聞かない
- 追跡外のファイルを数えるのは **rev つきの形**（`git checkout <rev> -- <path>`・`git restore --source <rev>`）だけ。rev の無い `checkout -- .`・`restore .` は index から戻すので追跡外に触れない。理由の文は「追跡外のファイルを上書きします」と「未コミットの変更があります」で分ける
- 残余: rev つきの `checkout` が、rev の側に無い名前の追跡外のファイルでも聞く（追跡外の同名ファイルがあるだけで、上書きされるか分からないので聞く側に倒れる）
- 残余: ステージ済みだけの変更を `git checkout <rev> -- <path>` が上書きするときは聞かない。
  `docs/guides/procedures/mutations.md` の `git checkout -- <壊したファイル>` は、壊したファイルに未コミットの変更があるので**聞かれる**（意図した破棄なので承認する）。同じ手順書の `kill -KILL -- -<PGID>`・`kill -TERM <PID>` も、サブエージェントが流すと聞かれる（承認する人がいない走り方では変異検査を止められない。止めるのはまとめ役か人）

### 4. 名前が当たらない `pnpm --filter` は `ask`

`scripts/lib/pnpm-filter-guard.mjs`。pnpm は filter が 0 件に当たっても成功で終わる。`--filter`・`-F`・`--filter-prod` の値を、
`pnpm-workspace.yaml` の `packages:` から読んだパッケージ名と突き合わせる（完全一致・スコープ無しは `@*/名前`・`*` は全文への glob。pnpm 11 で確かめた）。
どれにも当たらなければ `ask`。パス（`./dir`）・git の参照・除外・読めない glob の workspace は通す（pnpm に任せる）。

### 5. `gh pr create` の直前に、閉鎖キーワードの事故を `ask` で知らせる

`scripts/lib/closing-keywords.mjs`。コマンドの全文（ヒアドキュメントの中を含む）・`--body-file`・枝のコミットメッセージ（`git log origin/main..HEAD`）に、
GitHub が閉鎖と読む形（`Closes`/`Fixes`/`Resolves` の活用形＋`#N`・`owner/repo#N`・URL）があるとき、
バッククォートの中（効かない）と地の文（squash で勝手に閉じる）を分けて知らせる。PR 本文の行頭の単独の閉鎖（`Closes #578`）は意図した閉鎖として通す。
コミットメッセージは行頭でも知らせる（squash が全コミットの本文を連結するため）。先行 PR の確認（ADR-0032 の追記・#504）と理由を 1 つにまとめる。

### 6. 構造監査の合否の無い指標の後退を `pnpm check:fast` の最後に知らせる

`scripts/lib/structure-metrics.mjs`。比べる指標の一覧は同ファイルの `METRICS` が持つ（ここに写さない）。merge-base の構造監査を `git archive` した一時ディレクトリで走らせた値（SHA で控える）と今の値を比べ、
今の側は**追跡下のファイルと、追跡外で ignore されないファイル**（未コミットの変更は含む。新しいファイルは `git add` 前でも）を一時ディレクトリへ写して測る（`git ls-files --cached --others --exclude-standard`）。`.gitignore` の対象（coverage ほか）で偽の後退を出さず、新しいファイルによる後退を `git add` 前に見落とさない。残余: ignore されない試しのファイルは数えられる（偽の後退が出うる）。比較は `pnpm check:fast` の開始と同時に別プロセス（`scripts/structure-metrics-notices.mjs`）で走らせ、最後に待つ（検査の後ろに直列で足さない）。後退（小さいほど良い指標の増加・大きいほど良い指標の減少）を `⚠` の知らせにする。**落とさない。** コードの差分が無ければ比べない。
表の形が変わって読めなくなった指標も、今の側・基準の側のどちらでも `⚠` で知らせる（検査が黙って外れない）。基準の控え（OS の一時ディレクトリに SHA ごと）は、一時ファイルへ書いて rename し、読むときも宣言した指標の過半が読めなければ捨てて取り直す。空の控えで偽の緑を出さない。

### 7. 脅威の範囲 —— 事故の防止であり、悪意への境界ではない

決定 2〜5 の歯止めは、ADR-0032 と同じく**協力的なエージェントの事故を止めるもの**である。悪意のあるエージェントへの境界ではない
（最後の壁は、資格情報がエージェントの環境に無いこと。ADR-0011）。

- **誤って聞くのは許容する。協力的なエージェントが実際に書きうる形で、誤って通すのを無くす。**
- 範囲外（意図的な回避）: sed の `e`・`w` コマンド、git の `--upload-pack`・`-c` で別のプログラムを走らせる形、変数・別名・別の言語・
  エージェントが書いたスクリプトの中の呼び出し（ADR-0032 の「何を止めないか」と同じ）。`agent_id` を外した呼び出し、`disableAllHooks`
- 指摘をこの基準で振り分ける。テストの冒頭に同じ一文を置いた（`scripts/lib/agent-guard.test.mjs`・`scripts/lib/discard-guard.test.mjs`）

### 8. 配線の検査

`scripts/audit-agent-guard.mjs` は、入口（`scripts/agent-guard-hook.mjs`）が `import` でたどる部品を**すべて**追跡下にあるかを見る
（一覧を手で持たず import をたどるので、部品を足して一覧に足し忘れない）。`.claude/settings.json` の配線（matcher `Bash|Monitor`・入口のコマンド）は
ADR-0032 のまま変えない。判定は入口の中で順に流れる（本番デプロイ → サブエージェント → 未コミットの変更を消す git → `pnpm --filter` → 閉鎖キーワードと先行 PR）。
いずれも `ask`（人が承認すれば進める）で、`deny` にはしない。

## 影響
- 記録のみ（PR #583 の敵対的レビュー 5・6）:
  - 行頭の閉鎖キーワードは、説明文でも意図した閉鎖として通す（機械では見分けられない。「閉じないつもりで行頭に書く」事故は防げない）
  - 複合コマンド（`&&`・`;`）は、まとめ役でも変更の有無にかかわらず聞かれる（単純な形だけ確かめるため）。承認する人がいない走り方（クラウドのセッション・`claude -p`）では、その操作は止まる

- Claude Code のサブエージェントが決定 2 の操作を走らせようとすると、承認を求められる（承認する人がいない走り方では走らない）。
  まとめ役の操作は変わらない
- 未コミットの変更があるのに `git stash`・`git restore` などを使うと、聞かれる。単純でない形（`cd x && git stash`・`git -C …`）は、変更の有無にかかわらず聞かれる
- 誤って聞く例: サブエージェントの `pnpm run kill-dev` のように、危ない操作の名前が文字列に出て、許可リストに載らない語のコマンド。許可リストは足す
- 確かめたこと（2026-11-11）: 上の判定は `scripts/lib/*.test.mjs` と入口を実際に起動する `scripts/agent-guard-hook.test.mjs` で守り、
  変異 1500〜 で壊して赤になることを確かめた。`agent_id` の実測は決定 1。
- 確かめていないこと: Claude Code が実際のセッションで、サブエージェントの `git push` のフックの `ask` を人に提示すること（入力の JSON を渡した確認まで）。
  `agent_id` を持たない呼び出しの形が将来あること。`pnpm --filter` の照合は pnpm 11.28 での確認で、他の版の規則は確かめていない
