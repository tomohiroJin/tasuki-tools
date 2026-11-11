/**
 * AI のエージェントに人の承認なしで走らせないコマンドの宣言と、その判定（#490・docs/adr/0032）。
 *
 * **止めるコマンドの一覧の正本はここ（{@link GUARDED_COMMANDS}）。** ツールごとの設定は一覧を写さず、
 * ここを読む入口（Claude Code なら `.claude/settings.json` の PreToolUse フック →
 * `scripts/agent-guard-hook.mjs`）だけを持つ。配線のずれは `scripts/audit-agent-guard.mjs` が見る。
 *
 * ## 何を止めるか
 *
 * `AGENTS.md`「AI 運用規則」の「人の明示の指示か承認を待つ操作」のうち、**本番デプロイ**に当たるコマンド。
 * 止め方は「拒む」ではなく「人に聞く」（Claude Code の `permissionDecision: "ask"`）。人が明示に指示したときは、
 * その場で承認すれば設定を書き換えずに進められる（#490 の EARS 2）。
 *
 * ## 何を止めないか — **「足りる」とは言わない**
 *
 * 判定は事故（うっかり本番へ流す）を止める歯止めであって、迂回を止める壁ではない。次は素通りする。
 *
 * - 変数・別名・関数を経た呼び出し（`$CMD restart`・`alias s=systemctl`）。値はシェルを走らせないと分からない
 * - 別の言語からの呼び出し（`python -c "os.system('systemctl …')"`・`node -e …`）
 * - エージェントが書いたスクリプトの中の呼び出し（スクリプトを走らせる行には名前が出ない）
 * - 標準入力やヒアストリングでシェルへ渡す形（`echo 'systemctl …' | bash`・`bash <<<'…'`）
 * - 読んでいない包むコマンド（`flock`・`strace`・`script -c`・`nsenter`・`unbuffer` ほか。PR #498 のレビュー 3 で記録のみとした）
 * - 宣言に無いコマンド（`kill`・`rsync` で本番へ直接送るなど）。足すときはここに足す
 *
 * 読み方はシェルの部分集合である（引用符・バックスラッシュ・区切り・コマンド置換・リダイレクト・
 * 包むコマンド）。**読み切れないときは当てる側に倒す**（入れ子が深すぎる・入力が読めない）。
 *
 * 設計方針: 純粋関数だけを置く（I/O は `scripts/agent-guard-hook.mjs`）。追加依存は禁止。
 */
import path from "node:path";

/**
 * 止めるコマンドの宣言。
 *
 * - `script`: リポジトリの中のスクリプト（リポジトリ相対）。**起動の位置に出た語のファイル名**で当てる
 *   （`cd deploy && ./deploy.sh` も当てるため。同じ名前の別のスクリプトも当たるが、聞く側に倒す）
 * - `program`: PATH から呼ぶプログラムの名前。`subcommands` があれば、最初の引数がそのどれかのときだけ当てる
 *
 * `deploy/` の下の実行するスクリプトは、宣言から漏れていないかを `scripts/audit-agent-guard.mjs` が見る。
 */
export const GUARDED_COMMANDS = [
  { id: "deploy-script", script: "deploy/deploy.sh", why: "本番へのデプロイ（ビルドを転送し、サービスを再起動する）" },
  { id: "setup-script", script: "deploy/setup.sh", why: "本番の初回セットアップ（systemd のユニット・sudoers を書く）" },
  { id: "firewall-script", script: "deploy/firewall/connlimit.sh", why: "本番の firewall の規則を書き換える" },
  { id: "systemctl", program: "systemctl", why: "systemd のサービスの起動・停止・再起動" },
  { id: "service", program: "service", why: "サービスの起動・停止・再起動（systemctl の古い入口）" },
  { id: "caddy-reload", program: "caddy", subcommands: ["reload", "stop"], why: "Caddy の設定の入れ替え・停止" },
];

/**
 * `git` の、値を次の語に取る全体の選択肢（`git -C dir push`）。`git --help` の一覧と `man git` で洗った
 * （`--exec-path`・`--list-cmds` は `=` でしか値を取らない。全体の選択肢は省略形を受け付けない。2.43 で確認）。
 */
export const GIT_ARG_OPTS = ["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--attr-source", "--super-prefix"];
const GH_ARG_OPTS = ["-R", "--repo"];

/**
 * 語が長いオプション `full` の（省略形を含む）綴りか。git の parse-options は、一意に決まる前方一致の省略形を受け付ける
 * （`git reset --h` は `--hard`）。`--opt=値` の `=` より前を見る。曖昧な短い形（`--s`）は git が拒むので、3 文字以上を前方一致で拾う。
 */
export function isLongOption(word, full) {
  if (!word.startsWith("--")) return false;
  const name = word.split("=")[0];
  return name.length >= 3 && full.startsWith(name);
}

/** 語の並びのうち `--` より前（選択肢の部分）。 */
export function beforeDashDash(words) {
  const k = words.indexOf("--");
  return k === -1 ? words : words.slice(0, k);
}

/**
 * `git checkout` が枝の操作か。`--` の後ろに pathspec が 1 つ以上あり、枝を作る・切り離す選択肢（`-b`・`-B`・`--orphan`・`--detach`）が
 * 無いときだけ、ファイルの取り出し（枝の操作でない）。
 */
export function checkoutIsBranchOperation(words, start) {
  const rest = words.slice(start + 1);
  const opts = beforeDashDash(rest);
  if (opts.some((w) => (/^-[A-Za-z]*[bBd]/.test(w) && !w.startsWith("--")) || isLongOption(w, "--orphan") || isLongOption(w, "--detach"))) return true;
  const k = rest.indexOf("--");
  return k === -1 || k === rest.length - 1;
}

/**
 * `gh pr review` の引数が、承認・差し戻しを決めない既知のものだけか（許可リスト・fail closed）。
 * 許す: `-c`/`--comment`、`-b`/`--body`・`-F`/`--body-file`・`-R`/`--repo`（値は次の語。`--opt=値`・`-b値` の形も）、先頭が `-` でない位置引数（PR の番号・URL・枝名）。
 * それ以外の `-` で始まる語（`-a`・`-r`・`-ab`・`-a=true`・`--approve=true`・未知の選択肢ほか）が 1 つでもあれば、承認・差し戻しの恐れがあるとして false（聞く）。
 */
function isNonDecidingGhReview(args) {
  for (let i = 0; i < args.length; i += 1) {
    const w = args[i];
    if (!w.startsWith("-")) continue;
    if (w === "-c" || w === "--comment") continue;
    if (["-b", "--body", "-F", "--body-file", "-R", "--repo"].includes(w)) {
      i += 1; // 値は次の語
      continue;
    }
    if (/^--(body|body-file|repo)=/.test(w) || /^-[bFR][^=\s]/.test(w)) continue;
    return false;
  }
  return true;
}

/**
 * サブエージェントから呼ばれたときだけ人に聞くコマンドの宣言（#578・docs/adr/0037）。
 * 呼び出し元がサブエージェントかは、PreToolUse フックの入力の `agent_id` で見分ける（実測は docs/adr/0037）。
 * まとめ役（親）の呼び出しには `agent_id` が無く、止めない。サブエージェントに任せない操作を、
 * 一覧の正本のここに置く（`GUARDED_COMMANDS` と同じ読み方・同じ「歯止めであって壁ではない」限界）。
 * `when(words, start)` は、`args` に当たった後の絞り込み（`start` は `args` の先頭の語の位置）。
 */
export const SUBAGENT_GUARDED_COMMANDS = [
  { id: "git-push", program: "git", args: ["push"], argOpts: GIT_ARG_OPTS, why: "push は、まとめ役か人が行う" },
  { id: "gh-pr-merge", program: "gh", args: ["pr", "merge"], argOpts: GH_ARG_OPTS, why: "PR のマージは、人の承認の後にまとめ役が行う" },
  { id: "gh-pr-close", program: "gh", args: ["pr", "close"], argOpts: GH_ARG_OPTS, why: "PR を閉じるのは、まとめ役か人が行う" },
  { id: "git-switch", program: "git", args: ["switch"], argOpts: GIT_ARG_OPTS, why: "枝の切り替えは、同じ作業ツリーを使う他の作業を壊す" },
  { id: "git-checkout-branch", program: "git", args: ["checkout"], argOpts: GIT_ARG_OPTS, when: checkoutIsBranchOperation, why: "枝の切り替えは、同じ作業ツリーを使う他の作業を壊す" },
  {
    id: "git-reset-hard", program: "git", args: ["reset"], argOpts: GIT_ARG_OPTS,
    when: (words, start) => beforeDashDash(words.slice(start + 1)).some((w) => isLongOption(w, "--hard")), why: "reset --hard は、未コミットの変更と履歴を消す",
  },
  { id: "git-worktree-remove", program: "git", args: ["worktree", "remove"], argOpts: GIT_ARG_OPTS, why: "作業ツリーの削除は、まとめ役が棚卸しの後に行う" },
  {
    id: "git-branch-modify", program: "git", args: ["branch"], argOpts: GIT_ARG_OPTS,
    // -d/-D/-m/-M/-f/-c/-C（束ねた短い選択肢・長い選択肢の省略形も）。一覧・作成は読む形・日常の形として通す
    when: (words, start) => {
      const args = words.slice(start + 1);
      for (let i = 0; i < args.length; i += 1) {
        const w = args[i];
        if (w === "--sort") {
          i += 1; // 値（`-committerdate` のように - で始まりうる）は選択肢でない
          continue;
        }
        if ((/^-[A-Za-z]*[dDmMfcC]/.test(w) && !w.startsWith("--")) || ["--delete", "--move", "--force", "--copy"].some((f) => isLongOption(w, f))) return true;
      }
      return false;
    },
    why: "枝の削除・改名・付け替えは、まとめ役の枝や他の作業の枝を壊す",
  },
  { id: "npx-kill-port", program: "npx", args: ["kill-port"], why: "ポートを握るプロセスの停止は、利用者の dev サーバーを止めうる" },
  { id: "bunx-kill-port", program: "bunx", args: ["kill-port"], why: "ポートを握るプロセスの停止は、利用者の dev サーバーを止めうる" },
  { id: "pnpm-dlx-kill-port", program: "pnpm", args: ["dlx", "kill-port"], why: "ポートを握るプロセスの停止は、利用者の dev サーバーを止めうる" },
  { id: "fuser-kill", program: "fuser", args: [], when: (words) => words.some((w) => /^-[A-Za-z]*k/.test(w) || w === "--kill"), why: "ポートを握るプロセスの停止は、利用者の dev サーバーを止めうる" },
  {
    id: "tmux-kill", program: "tmux", args: [], argOpts: ["-L", "-S", "-f", "-c", "-T"],
    // サブコマンドが kill で始まる（kill-server・kill-session・kill-window・kill-pane・別名 killw・killp・前方一致の省略 kill-ses）、
    // または send-keys（別名 send・省略 send-k）に C-c・^C（別の綴り）を含む、respawn-pane/-window の -k（tmux 3.4 の list-commands で確かめた）
    when: (words, start) => {
      const sub = words[start];
      if (sub === undefined) return false;
      if (sub.startsWith("kill")) return true;
      const sendKeys = sub === "send" || (sub.length >= 6 && "send-keys".startsWith(sub));
      if (sendKeys && words.slice(start + 1).some((w) => /^(C-c|\^c|C-\\|\^\\)$/i.test(w))) return true;
      // respawn-pane -k・respawn-window -k（別名 respawnp・respawnw）は、走っているプロセスを殺して起動し直す
      return sub.startsWith("respawn") && words.slice(start + 1).some((w) => /^-[A-Za-z]*k/.test(w));
    },
    why: "tmux の停止・窓やペインの kill・Ctrl-C の送信は、利用者のセッション（ログ・dev サーバー）を落としうる",
  },
  { id: "gh-api-write", program: "gh", args: ["api"], argOpts: GH_ARG_OPTS, when: (words, start) => !isReadOnlyGhApi(words, start + 1), why: "GitHub への書き込み（GET 以外・フィールド付き）は、人の承認の後にまとめ役が行う" },
  { id: "gh-pr-review-decide", program: "gh", args: ["pr", "review"], argOpts: GH_ARG_OPTS, when: (words, start) => !isNonDecidingGhReview(words.slice(start + 2)), why: "PR の承認・変更要求は、人の判断" },
  { id: "kill", program: "kill", why: "プロセスの停止は、利用者の dev サーバーなどを止めうる" },
  { id: "pkill", program: "pkill", why: "プロセスの停止は、利用者の dev サーバーなどを止めうる" },
  { id: "killall", program: "killall", why: "プロセスの停止は、利用者の dev サーバーなどを止めうる" },
];

/**
 * シェルのコマンド（`tool_input.command`）を走らせる Claude Code の道具。`.claude/settings.json` の matcher は
 * これを全部覆う（`scripts/audit-agent-guard.mjs` が見る）。Monitor は PR #498 のレビュー 2 で足した。
 */
export const SHELL_TOOLS = ["Bash", "Monitor"];

/** 入れ子（`bash -c`・`ssh`・コマンド置換ほか）をこれより深く読まない。越えたら読めなかったとして当てる。 */
const MAX_DEPTH = 8;

/** 読み切れなかったときに返す当たり。 */
const UNREADABLE = Object.freeze({ id: "unreadable", why: "コマンドを読み切れなかった（入れ子が深すぎる）" });

/** 起動の位置に来ても、次の語が本当のコマンドになる予約語。 */
const KEYWORDS = new Set(["if", "then", "else", "elif", "fi", "do", "done", "while", "until", "!", "{", "}", "time", "coproc"]);

/** `su`・`runuser` の値を取る選択肢。`-c` は別に扱う（文字列として読み直す）。 */
const SU_ARG_OPTS = ["-u", "-g", "-G", "-s", "-w", "--user", "--group", "--supp-group", "--shell", "--whitelist-environment"];

/** 引数を 1 つ取る選択肢（`-u root` のように次の語を値にとるもの）を、包むコマンドごとに並べる。 */
const WRAPPERS = {
  sudo: { argOpts: ["-u", "-g", "-h", "-p", "-C", "-D", "-r", "-t", "-U", "-T", "--user", "--group", "--host", "--prompt", "--chdir"] },
  doas: { argOpts: ["-u", "-C"] },
  pkexec: { argOpts: ["--user"] },
  env: { argOpts: ["-u", "-C", "--unset", "--chdir"], splitOpts: ["-S", "--split-string"] },
  nohup: { argOpts: [] },
  command: { argOpts: [] },
  builtin: { argOpts: [] },
  exec: { argOpts: ["-a"] },
  nice: { argOpts: ["-n", "--adjustment"] },
  ionice: { argOpts: ["-c", "-n", "-p", "--class", "--classdata"] },
  setsid: { argOpts: [] },
  stdbuf: { argOpts: ["-i", "-o", "-e"] },
  timeout: { argOpts: ["-s", "-k", "--signal", "--kill-after"], positional: 1 },
  xargs: { argOpts: ["-a", "-d", "-E", "-I", "-L", "-n", "-P", "-s", "--arg-file", "--delimiter", "--max-args", "--max-procs", "--max-lines"] },
};

/** 残りの語を 1 つの文字列として読み直すコマンド。 */
const REJOINERS = { eval: { argOpts: [] }, watch: { argOpts: ["-n", "-d", "--interval"] } };

/** 引数のスクリプトか `-c` の文字列を走らせるシェル。 */
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "ash", "fish"]);
const SHELL_ARG_OPTS = ["-o", "+o", "-O", "+O", "--rcfile", "--init-file"];

/** ssh の、値を取る選択肢（`ssh -p 2222 host cmd`）。 */
const SSH_ARG_OPTS = ["-b", "-c", "-D", "-E", "-e", "-F", "-I", "-i", "-J", "-L", "-l", "-m", "-O", "-o", "-p", "-Q", "-R", "-S", "-W", "-w"];

/** find の、残りをコマンドとして走らせる選択肢。 */
const FIND_EXEC = new Set(["-exec", "-execdir", "-ok", "-okdir"]);

/**
 * 対応する閉じ括弧を探す。引用符の中の括弧は数えない。
 * @returns {[string, number]} 中身と、閉じ括弧の次の位置（閉じていなければ末尾）
 */
function readParen(src, start) {
  let depth = 1;
  let quote = null;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === "\\" && quote === '"') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "\\") i += 1;
    else if (c === "'" || c === '"') quote = c;
    else if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return [src.slice(start, i), i + 1];
    }
  }
  return [src.slice(start), src.length];
}

/** 閉じのバッククォートを探す。 */
function readBacktick(src, start) {
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === "\\") i += 1;
    else if (src[i] === "`") return [src.slice(start, i), i + 1];
  }
  return [src.slice(start), src.length];
}

/**
 * コマンドの文字列を、単純なコマンド（語の並び）の列と、置換の中身（読み直す文字列）に分ける。
 * 引用符とバックスラッシュは剥がす。リダイレクトの先の語とコメントは捨てる。
 */
export function lex(src) {
  const commands = [];
  const nested = [];
  let words = [];
  let cur = null;
  let redirectNext = false;

  const pushWord = () => {
    if (cur === null) return;
    if (redirectNext) redirectNext = false;
    else words.push(cur);
    cur = null;
  };
  const endCommand = () => {
    pushWord();
    if (words.length > 0) commands.push(words);
    words = [];
    redirectNext = false;
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      if (src[i + 1] !== "\n") cur = (cur ?? "") + (src[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      const stop = end === -1 ? src.length : end;
      cur = (cur ?? "") + src.slice(i + 1, stop);
      i = stop + 1;
      continue;
    }
    if (c === '"') {
      cur = cur ?? "";
      i += 1;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < src.length) {
          cur += src[i + 1];
          i += 2;
        } else if (src[i] === "$" && src[i + 1] === "(") {
          const [inner, next] = readParen(src, i + 2);
          nested.push(inner);
          cur += "$()";
          i = next;
        } else if (src[i] === "`") {
          const [inner, next] = readBacktick(src, i + 1);
          nested.push(inner);
          cur += "$()";
          i = next;
        } else {
          cur += src[i];
          i += 1;
        }
      }
      i += 1;
      continue;
    }
    if (c === "$" && src[i + 1] === "(") {
      const [inner, next] = readParen(src, i + 2);
      nested.push(inner);
      cur = (cur ?? "") + "$()";
      i = next;
      continue;
    }
    if (c === "`") {
      const [inner, next] = readBacktick(src, i + 1);
      nested.push(inner);
      cur = (cur ?? "") + "$()";
      i = next;
      continue;
    }
    if ((c === "<" || c === ">") && src[i + 1] === "(") {
      const [inner, next] = readParen(src, i + 2);
      nested.push(inner);
      cur = (cur ?? "") + "$()";
      i = next;
      continue;
    }
    if (c === "#" && cur === null) {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (c === "\n") {
      endCommand();
      i += 1;
      continue;
    }
    if (/\s/.test(c)) {
      pushWord();
      i += 1;
      continue;
    }
    if (c === "<" || c === ">") {
      // `2>` の 2 はリダイレクトの番号で、語ではない
      if (cur !== null && /^\d+$/.test(cur)) cur = null;
      else pushWord();
      i += 1;
      while (i < src.length && "<>&|".includes(src[i])) i += 1;
      redirectNext = true;
      continue;
    }
    if (";&|()".includes(c)) {
      endCommand();
      i += 1;
      continue;
    }
    cur = (cur ?? "") + c;
    i += 1;
  }
  endCommand();
  return { commands, nested };
}

/** 環境変数の代入（`FOO=bar`）か。 */
function isAssignment(word) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);
}

/**
 * 選択肢の語が、次の語を値として取るか。
 *
 * 短い選択肢のまとまりは getopt と同じく**左から 1 文字ずつ読み、最初に値を取る文字が出たところで止める。**
 * そこが末尾なら次の語が値（`-iu root`）、途中ならその語の残りが値（`-uroot`・`-sKILL`）で、次の語はコマンドである。
 * 最後の文字だけを見ると `-uroot` の `t` を値を取る選択肢と読み、コマンドを値として飛ばす（PR #498 の再レビュー 1）。
 */
function takesNextWord(w, argOpts) {
  if (argOpts.includes(w)) return true;
  if (!/^-[A-Za-z0-9]{2,}$/.test(w)) return false;
  for (let k = 1; k < w.length; k += 1) {
    if (argOpts.includes(`-${w[k]}`)) return k === w.length - 1;
  }
  return false;
}

/**
 * 選択肢を読み飛ばし、最初の選択肢でない語の位置を返す。
 * `-u root`（値を取る）・`-uroot`・`--user=root`・`--`（ここで終わり）を扱う。
 */
function skipOptions(words, start, argOpts) {
  let i = start;
  while (i < words.length) {
    const w = words[i];
    if (w === "--") return i + 1;
    if (!w.startsWith("-") || w === "-") return i;
    i += takesNextWord(w, argOpts) ? 2 : 1;
  }
  return i;
}

/** 起動の位置の語が、宣言のどれに当たるか。 */
function matchHead(words, i, decls) {
  const name = path.posix.basename(words[i]);
  const hits = [];
  for (const g of decls) {
    if (g.script && name === path.posix.basename(g.script)) hits.push(g);
    if (g.program && name === g.program) {
      if (!g.subcommands && !g.args) hits.push(g);
      else if (g.subcommands) {
        const sub = words.slice(i + 1).find((w) => !w.startsWith("-"));
        if (sub !== undefined && g.subcommands.includes(sub)) hits.push(g);
      }
    }
    // `args`: 選択肢（`argOpts` は値を取るもの。`gh -R a/b`）を除いた最初の語から並ぶ語（`gh pr create`）。
    // 位置を固定する（`gh issue list --search pr create` の引数の中の並びには当てない）。
    // 当たった語を `words` に持たせる（題の取り出しに使う。#504）
    if (g.program && g.args && name === g.program) {
      const start = skipOptions(words, i + 1, g.argOpts ?? []);
      if (g.args.every((a, k) => words[start + k] === a) && (g.when === undefined || g.when(words, start))) {
        hits.push({ ...g, words, start });
      }
    }
  }
  return hits;
}

/** 単純なコマンド 1 つ（語の並び）を読む。 */
function analyzeWords(words, depth, decls) {
  let i = 0;
  for (;;) {
    while (i < words.length && (isAssignment(words[i]) || KEYWORDS.has(words[i]))) i += 1;
    if (i >= words.length) return [];
    const name = path.posix.basename(words[i]);

    if (Object.hasOwn(WRAPPERS, name)) {
      const spec = WRAPPERS[name];
      // command -v / -V は場所を調べるだけで走らせない（PR #498 のレビュー 5）
      if (name === "command" && (words[i + 1] === "-v" || words[i + 1] === "-V")) return [];
      // env -S は残りを 1 つの文字列として読み直す（`--split-string=…` の形も）
      if (spec.splitOpts) {
        const eq = words.findIndex((w, k) => k > i && w.startsWith("--split-string="));
        if (eq !== -1) return analyzeString([words[eq].slice("--split-string=".length), ...words.slice(eq + 1)].join(" "), depth + 1, decls);
        const split = words.findIndex((w, k) => k > i && spec.splitOpts.includes(w));
        if (split !== -1 && split + 1 < words.length) return analyzeString(words.slice(split + 1).join(" "), depth + 1, decls);
      }
      i = skipOptions(words, i + 1, spec.argOpts) + (spec.positional ?? 0);
      continue;
    }
    if (Object.hasOwn(REJOINERS, name)) {
      const next = skipOptions(words, i + 1, REJOINERS[name].argOpts);
      return analyzeString(words.slice(next).join(" "), depth + 1, decls);
    }
    if (SHELLS.has(name) || name === "source" || name === ".") {
      let k = i + 1;
      let inline = false;
      while (k < words.length && /^[-+]/.test(words[k]) && words[k] !== "-" && words[k] !== "--") {
        if (/^-[A-Za-z]*c[A-Za-z]*$/.test(words[k])) inline = true;
        k += SHELL_ARG_OPTS.includes(words[k]) ? 2 : 1;
      }
      if (words[k] === "--") k += 1;
      if (k >= words.length) return [];
      if (inline) return analyzeString(words[k], depth + 1, decls);
      return matchHead(words, k, decls).filter((g) => g.script);
    }
    if (name === "su" || name === "runuser") {
      // -c の文字列は読み直す。runuser -u <user> [--] <cmd> は残りをコマンドとして読む（PR #498 のレビュー 3）
      const c = words.findIndex((w, k) => k > i && (w === "-c" || w === "--command" || /^-[A-Za-z]*c$/.test(w)));
      if (c !== -1 && c + 1 < words.length) return analyzeString(words[c + 1], depth + 1, decls);
      const cEq = words.find((w, k) => k > i && w.startsWith("--command="));
      if (cEq) return analyzeString(cEq.slice("--command=".length), depth + 1, decls);
      if (name === "runuser" && words.slice(i + 1).some((w) => w === "-u" || w === "--user")) {
        i = skipOptions(words, i + 1, SU_ARG_OPTS);
        continue;
      }
      return [];
    }
    if (name === "ssh") {
      const host = skipOptions(words, i + 1, SSH_ARG_OPTS);
      if (host + 1 >= words.length) return [];
      return analyzeString(words.slice(host + 1).join(" "), depth + 1, decls);
    }
    if (name === "find") {
      const hits = [];
      words.forEach((w, k) => {
        if (FIND_EXEC.has(w) && k + 1 < words.length) {
          const rest = words.slice(k + 1);
          const end = rest.findIndex((x) => x === ";" || x === "+");
          hits.push(...analyzeWords(end === -1 ? rest : rest.slice(0, end), depth + 1, decls));
        }
      });
      return hits;
    }
    return matchHead(words, i, decls);
  }
}

/** 文字列を読み、当たった宣言を出現順に返す（重複は除く）。 */
function analyzeString(src, depth, decls) {
  if (depth > MAX_DEPTH) return [UNREADABLE];
  const { commands, nested } = lex(src);
  const hits = [];
  for (const words of commands) hits.push(...analyzeWords(words, depth, decls));
  for (const inner of nested) hits.push(...analyzeString(inner, depth + 1, decls));
  // `words` を持つ当たりは呼ぶたびに新しいオブジェクトなので、同じ宣言と同じ語の並びを 1 つにまとめる
  const seen = new Set();
  return [...new Set(hits)].filter((h) => {
    if (h.words === undefined) return true;
    const key = `${h.id}\0${h.words.join("\0")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * コマンドの文字列が、宣言（{@link GUARDED_COMMANDS}）のどれを走らせうるかを返す。
 * @param {string} command シェルに渡るコマンドの文字列
 * @returns {{ id: string, why: string }[]} 当たった宣言（出現順・重複なし）。当たらなければ空
 */
export function findGuardedCommands(command) {
  return analyzeString(command, 0, GUARDED_COMMANDS);
}

/**
 * 宣言の一覧を指定して、コマンドの文字列が当てるものを返す（読み方は {@link findGuardedCommands} と同じ）。
 * 先行 PR の確認のフック（`scripts/lib/prior-pr-hook.mjs`・#504）が、`gh pr create` の宣言を渡して使う。
 * @param {string} command
 * @param {readonly object[]} decls
 * @returns {object[]} 当たった宣言。`args` を持つ宣言は `words`（そのコマンドの語の並び）を足したコピー
 */
export function findCommandsMatching(command, decls) {
  return analyzeString(command, 0, decls);
}

/**
 * 「読むだけ・記録するだけ」と分かる語の許可リスト（#578・docs/adr/0037）。コマンドの文字列に危ない操作の名前（`push`・`stash` ほか）が
 * 出ても、先頭がこれらの語だけなら、名前は引数の文字列にすぎない（`grep 'git stash' docs`・`git commit -m "…restore…"`）。
 * 許可リストに書くのは「当てない」側の例外だけで、載っていない語は読めないものとして扱う（fail closed）。
 *
 * **脅威の範囲**: 協力的なエージェントの事故を止める歯止めであって、悪意への境界ではない（docs/adr/0032 の限界と同じ。最後の壁は
 * 資格情報がエージェントの環境に無いこと）。誤って聞くのは許容し、**協力的なエージェントが実際に書きうる形**で誤って通すのを無くす。
 * 意図的な回避（sed の `e`・`w` コマンド、git の `--upload-pack`・`-c` で別のプログラムを走らせる形）は範囲外。
 */
const TAME_HEADS = new Set([
  "grep", "egrep", "fgrep", "rg", "cat", "echo", "printf", "ls", "head", "tail", "wc", "less", "more", "diff", "sort", "uniq", "nl",
  "file", "stat", "which", "type", "true", "false", "test", "[", "pwd", "basename", "dirname", "date", "sleep", "tr", "cut", "jq", "column",
  "cd", "pushd", "popd", "mkdir", // mkdir は作るだけ（消さない・戻さない）。後ろに && で続くコマンドは別に判定される
]);
/** 先頭が git（全体の選択肢なし）のとき、下位コマンドがこれなら読むだけ・記録するだけ。branch・fetch・tag・remote・reflog は選択肢が既知の読む形のときだけ（isReadOnly…）。 */
const TAME_GIT_SUBS = new Set([
  "status", "log", "diff", "show", "blame", "grep", "branch", "tag", "remote", "rev-parse", "ls-files", "ls-remote", "ls-tree",
  "describe", "shortlog", "reflog", "cat-file", "for-each-ref", "merge-base", "rev-list", "name-rev", "fetch", "add", "commit", "mv",
]);
/** gh の、読む・投稿する形（マージ・閉じる・API の書き込みを含まない）。`api` は別に見る。 */
const TAME_GH = {
  pr: ["view", "list", "status", "checks", "diff", "create", "edit", "comment", "ready"],
  issue: ["view", "list", "status", "create", "comment", "edit"],
  run: ["view", "list", "watch"],
  repo: ["view"],
  auth: ["status"],
  release: ["view", "list"],
  workflow: ["view", "list"],
  search: null, // どの下位コマンドも読む
  browse: null,
};

/** `sed` の印字だけの形（`-n` と `1,5p`・`/re/p`・`$p`）。`-i`・`-f`・`e`/`w` コマンドは tame でない。 */
function isPrintOnlySed(words) {
  const args = words.slice(1);
  if (!args.includes("-n") || args.some((w) => /^-[A-Za-z]*[ifsz]/.test(w) && w !== "-n" && !/^-n$/.test(w)) || args.some((w) => w.startsWith("--"))) return false;
  const script = args.find((w) => !w.startsWith("-"));
  return script !== undefined && /^(\d+|\$|\/[^/]*\/)?(,(\d+|\$|\/[^/]*\/))?p$/.test(script);
}

/** gh の選択肢のうち、既知のもの（許可リスト）。未知の選択肢と、2 文字を超える短い選択肢の束（`-XPUT`・`-Ra/b`）は読み切れない。 */
const GH_LONG = [
  "--json", "--jq", "--template", "--repo", "--state", "--limit", "--search", "--title", "--body", "--body-file", "--base", "--head",
  "--label", "--assignee", "--reviewer", "--milestone", "--draft", "--web", "--comments", "--fill", "--project", "--author", "--app",
  "--mention", "--branch", "--workflow", "--status", "--event", "--user", "--log", "--log-failed", "--interval", "--exit-status", "--name-only", "--color",
];
const GH_SHORT = ["-R", "-s", "-L", "-S", "-t", "-b", "-B", "-H", "-l", "-a", "-r", "-m", "-d", "-w", "-q", "-p", "-A", "-e", "-c", "-F"];
const GH_API_LONG = ["--method", "--header", "--jq", "--include", "--template", "--paginate", "--slurp", "--cache", "--hostname", "--silent", "--verbose"];
const GH_API_SHORT = ["-X", "-H", "-q", "-i", "-t"];

/** `from` 以降の選択肢が、すべて既知か。 */
function ghOptionsKnown(words, from, long, short) {
  for (let i = from; i < words.length; i += 1) {
    const w = words[i];
    if (!w.startsWith("-") || w === "-" || w === "--") continue;
    if (w.startsWith("--")) {
      if (!long.includes(w.split("=")[0])) return false;
    } else if (w.length > 2 || !short.includes(w)) return false;
  }
  return true;
}

/**
 * `gh api` が読む形か（許可リスト）: 既知の選択肢だけ・`--input` なし。
 * - フィールド（`-f`・`-F`・`--field`・`--raw-field`）なし: メソッドは GET のまま（明示するなら GET）
 * - フィールドあり: `-X GET`／`--method GET` を明示したときだけ（GET ではフィールドは問い合わせの値になる）。
 * - `gh api graphql` は query でも読む形に含めない（全部聞く）
 */
function isReadOnlyGhApi(words, from) {
  const valued = new Set(["-H", "--header", "-q", "--jq", "-t", "--template", "--cache", "--hostname"]);
  let method = null;
  let endpoint = null;
  const fields = [];
  for (let i = from; i < words.length; i += 1) {
    const w = words[i];
    if (w === "--input" || w.startsWith("--input=")) return false;
    if (w === "-X" || w === "--method") {
      method = words[i + 1] ?? "";
      i += 1;
    } else if (/^-X./.test(w) || w.startsWith("--method=")) method = w.replace(/^-X|^--method=/, "");
    else if (w === "-f" || w === "-F" || w === "--field" || w === "--raw-field") {
      fields.push(words[i + 1] ?? "");
      i += 1;
    } else if (/^-[fF]./.test(w) && !w.startsWith("--")) fields.push(w.slice(2));
    else if (/^--(field|raw-field)=/.test(w)) fields.push(w.slice(w.indexOf("=") + 1));
    else if (valued.has(w)) i += 1;
    else if (w.startsWith("--") && valued.has(w.split("=")[0])) continue;
    else if (w.startsWith("-")) {
      if (!(GH_API_LONG.includes(w.split("=")[0]) || (w.length === 2 && GH_API_SHORT.includes(w)))) return false;
    } else if (endpoint === null) endpoint = w;
  }
  if (method !== null && method.toUpperCase() !== "GET") return false;
  // graphql は query でも全部聞く（POST で、種類を部分文字列で判定すると、シェルが渡す文字列との食い違い〈`$'…'`・`{a,b}`・`\\` ほか〉で mutation が通る）
  if (endpoint === "graphql") return false;
  if (fields.length === 0) return true;
  return method !== null; // GET を明示したときだけ（ここまで来て method があれば GET）
}

const READ_FLAGS = new Set(["-p", "--patch", "--stat", "--name-only", "--name-status", "--oneline", "--abbrev-commit", "--no-abbrev-commit", "-q", "--quiet", "--no-color", "--color"]);
/** 選択肢（`-` で始まる語）がすべて既知の読む選択肢か。`reflog`・`stash list|show` の引数に使う（`-` で始まる語を何でも通さない）。 */
function hasOnlyReadFlags(args) {
  return args.every((w) => !w.startsWith("-") || READ_FLAGS.has(w) || /^--(date|format|pretty|max-count)=\S*$/.test(w) || /^-n\d*$/.test(w) || /^-\d+$/.test(w));
}
/**
 * `git reflog` の読む形（許可リスト）: 引数なし／読む選択肢だけ（`-n 5` を含む。裸の語は無い）／`show [<ref>…]` と読む選択肢。
 * 裸の語は下位コマンド（`expire`・`delete`・`drop`・`list` ほか、版で増える）でありうるので、`show` の後ろ以外では通さない。
 */
function isReadOnlyGitReflog(args) {
  const [first, ...rest] = args;
  if (first === "show") return hasOnlyReadFlags(rest);
  const flags = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "-n" && /^\d+$/.test(args[i + 1] ?? "")) {
      i += 1;
      continue;
    }
    if (!args[i].startsWith("-")) return false;
    flags.push(args[i]);
  }
  return hasOnlyReadFlags(flags);
}
const BRANCH_FLAGS = new Set(["-a", "-r", "-l", "--list", "-v", "-vv", "--verbose", "--show-current", "--no-color", "--color", "--all", "--remotes"]);
const BRANCH_VALUED = new Set(["--contains", "--merged", "--no-merged", "--points-at"]);
/** `git branch` の読む形: 選択肢がすべて既知で、名前の引数が無い。 */
function isReadOnlyGitBranch(args) {
  for (let i = 0; i < args.length; i += 1) {
    const w = args[i];
    if (BRANCH_FLAGS.has(w) || /^--(format|sort|contains|merged|no-merged|points-at|color)=\S*$/.test(w)) continue;
    if (BRANCH_VALUED.has(w) && args[i + 1] !== undefined && !args[i + 1].startsWith("-")) {
      i += 1;
      continue;
    }
    return false;
  }
  return true;
}
const TAG_FLAGS = new Set(["-l", "--list", "-n", "--no-color", "--color"]);
/** `git tag` の読む形: 一覧の選択肢だけ（作る・消す引数が無い）。 */
function isReadOnlyGitTag(args) {
  return args.every((w) => TAG_FLAGS.has(w) || /^--(sort|format|contains|merged|no-merged|points-at)=\S*$/.test(w) || /^-n\d+$/.test(w));
}
const FETCH_FLAGS = new Set(["-q", "--quiet", "-v", "--verbose", "--all", "--dry-run"]);
/** `git fetch` の安全な形: 既知の選択肢（`--prune`・`--force` を含まない）と、`:` も先頭の `+` も無い remote・枝名だけ。 */
function isSafeGitFetch(args) {
  return args.every((w) => FETCH_FLAGS.has(w) || /^--depth=\d+$/.test(w) || (!w.startsWith("-") && !w.startsWith("+") && !w.includes(":")));
}

/** 1 つの単純なコマンド（語の並び）が、許可リストの「読むだけ・記録するだけ」か。 */
function isTameWords(words) {
  if (words.length === 0) return true;
  const name = path.posix.basename(words[0]);
  if (name === "sed") return isPrintOnlySed(words);
  if (name === "find") return !words.some((w) => FIND_EXEC.has(w) || w === "-delete" || w.startsWith("-fprint") || w.startsWith("-fls"));
  if (TAME_HEADS.has(name)) return true;
  if (name === "git") {
    if (words[1] === undefined || words[1].startsWith("-")) return false; // 全体の選択肢（-C・-c ほか）があれば読み切れない
    const sub = words[1];
    // 全部の下位コマンドに共通: ファイルへ書く選択肢（--output と、その省略形）は読むだけでない
    if (words.some((w) => isLongOption(w, "--output"))) return false;
    // 読むだけの下位コマンドも、選択肢と引数が既知の読む形のときだけ（拒否リストでなく許可リスト。省略形 `--del`・`+refspec` を通さない）
    if (sub === "mv") return !words.slice(2).some((w) => w === "--force" || (/^-[A-Za-z]+$/.test(w) && w.includes("f")));
    if (sub === "branch") return isReadOnlyGitBranch(words.slice(2));
    if (sub === "fetch") return isSafeGitFetch(words.slice(2));
    if (sub === "tag") return isReadOnlyGitTag(words.slice(2));
    if (sub === "remote") return words.slice(2).every((w) => w === "-v" || w === "--verbose") || ["show", "get-url"].includes(words[2]);
    if (sub === "reflog") return isReadOnlyGitReflog(words.slice(2));
    if (TAME_GIT_SUBS.has(sub)) return true;
    if (sub === "stash") return ["list", "show"].includes(words[2]) && hasOnlyReadFlags(words.slice(3));
    if (sub === "worktree") return ["list", "add"].includes(words[2]);
    return false;
  }
  if (name === "gh") {
    const at = skipOptions(words, 1, GH_ARG_OPTS);
    const group = words[at];
    if (group === "api") return isReadOnlyGhApi(words, at + 1);
    if (!Object.hasOwn(TAME_GH, group)) return false;
    if (!(TAME_GH[group] === null || TAME_GH[group].includes(words[at + 1]))) return false;
    return ghOptionsKnown(words, at + 2, GH_LONG, GH_SHORT);
  }
  return false;
}

/**
 * 危ない操作の名前の一覧（唯一の置き場。サブエージェントの候補・未コミットの変更を消す git の候補・ヒアドキュメント本文の確かめが、
 * ここから正規表現を作る。コードレビュー 10: 3 か所に写していた）。
 * git の語は `git` が文字列にあるときだけ、gh の語は `gh` があるときだけ、kill 系は単独の語として当てる。
 */
export const OPERATION_WORDS = Object.freeze({
  /** サブエージェントがまとめ役か人に任せる git の操作。 */
  gitSubagent: ["push", "checkout", "switch", "reset", "worktree", "branch"],
  /**
   * 未コミットの変更を消しうる git の操作。`git help -a` の下位コマンドを洗った（2026-11-11・git 2.43）:
   * 作業ツリーのファイルを上書き・削除するもの（checkout・restore・switch・reset・clean・stash・rm -f・mv -f・checkout-index -f・
   * read-tree --reset -u・submodule update --force・worktree remove -f）。merge・pull・rebase・cherry-pick・revert・apply・am は
   * 変更があると git 自身が拒む（`--abort`・`--quit` は消すが日常の作業を止めるので含めない）。
   */
  gitDiscard: ["checkout", "restore", "stash", "reset", "clean", "switch", "rm", "mv", "checkout-index", "read-tree", "submodule", "worktree"],
  gh: ["merge", "close", "api", "review"],
  kill: ["kill", "pkill", "killall", "kill-port", "fuser", "kill-server", "kill-session", "kill-window", "kill-pane", "killw", "killp"],
});

const wordsRe = (words) => new RegExp(`(?<![\\w-])(?:${words.join("|")})(?![\\w-])`);
const RE = {
  gitSubagent: wordsRe(OPERATION_WORDS.gitSubagent),
  gitDiscard: wordsRe(OPERATION_WORDS.gitDiscard),
  gitAny: wordsRe([...new Set([...OPERATION_WORDS.gitSubagent, ...OPERATION_WORDS.gitDiscard])]),
  gh: wordsRe(OPERATION_WORDS.gh),
  kill: wordsRe(OPERATION_WORDS.kill),
};
const hasGit = (t) => /\bgit\b/.test(t);
const hasGh = (t) => /\bgh\b/.test(t);

/** サブエージェントが任せる操作の名前が出るか（入れ子も含め、素朴な文字列の走査）。 */
export function mentionsSubagentOperation(text) {
  return (hasGit(text) && RE.gitSubagent.test(text)) || (hasGh(text) && RE.gh.test(text)) || RE.kill.test(text);
}
/** 未コミットの変更を消しうる git の操作の名前が出るか。 */
export function mentionsDiscardOperation(text) {
  return hasGit(text) && RE.gitDiscard.test(text);
}
/** どちらかの危ない操作の名前が出るか（ヒアドキュメント本文の確かめ）。 */
export function mentionsGuardedOperation(text) {
  return (hasGit(text) && RE.gitAny.test(text)) || (hasGh(text) && RE.gh.test(text)) || RE.kill.test(text);
}
function looksLikeGuardedOperation(text) {
  return mentionsGuardedOperation(text);
}

/**
 * ヒアドキュメントの本文（`<<TAG` の次の行から、`TAG` だけの行まで）を取り除く。本文は文章で、実行されない。
 * 終端が見つからないとき（`<<` が文字列の中にあるだけの可能性）は null — 後ろの行を本文として隠さない（fail closed）。
 * `<<<`（ヒアストリング）は対象外。
 */
export function stripHeredocBodies(src) {
  const lines = src.split("\n");
  const out = [];
  const operator = /<<(?!<)(-?)\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][\w-]*))/g;
  for (let i = 0; i < lines.length; i += 1) {
    const tags = [...lines[i].matchAll(operator)];
    // 演算子の行が `\` で終わる、または前の行の継続の続きのとき、bash は継続されたコマンドが終わってから本文を始める。
    // 行の分け方が食い違い、本文でない部分を取り除いてしまうので、取り除かない（fail closed。本文の語の有無に依らない）
    if (tags.length > 0 && (lines[i].endsWith("\\") || (i > 0 && lines[i - 1].endsWith("\\")))) return null;
    // 演算子そのものも取り除く（取り除いた後の文字列を読み直しても、終端の行を探さなくてよい）
    out.push(lines[i].replace(operator, ""));
    for (const m of tags) {
      const tag = m[2] ?? m[3] ?? m[4];
      const end = lines.findIndex((l, k) => k > i && (m[1] === "-" ? l.trim() === tag : l === tag));
      if (end === -1) return null;
      const body = lines.slice(i + 1, end).join("\n");
      // 本文が危ない操作の名前を含むとき、データとして使われる決まった形（DATA_HEREDOC_LINE）だけ文章として隠す。それ以外は読めないとする（fail closed）
      if (looksLikeGuardedOperation(body) && !heredocIsData(lines[i], tag, lines.slice(end + 1), i > 0 && lines[i - 1].endsWith("\\"))) return null;
      i = end; // 本文と終端の行を飛ばす
    }
  }
  return out.join("\n");
}

/**
 * 本文を文章として隠してよい、唯一の形（許可リスト）。行全体が次のどれかに一致し、`'TAG'`（単一引用符つき。展開されない）で終わる:
 * `git commit … -m|--message "$(cat <<'TAG'`、`gh pr|issue create|edit|comment … --body "$(cat <<'TAG'`（前に `git add … &&` を置いてよい）。
 * 続けて終端の行が `TAG`、その次の行が `)"` で始まる。それ以外のヒアドキュメントは、本文に危ない操作の名前があれば読めないとして聞く。
 * 状態機械で引用符を追う作りは、`echo '$(cat <<EOF'` や `# $(cat <<EOF` で穴が出たので退けた（#578 の自動レビュー）。
 */
// 区切り・コメント・引用符・展開（$ とバッククォート）・リダイレクト・バックスラッシュ・改行を含まない 1 文字
const PLAIN = "[^;&|$" + "`" + "\"'()<>#\\\\\\n]";
// 平文か、展開を含まない対の "…" の並び
const WORDS = "(?:" + PLAIN + "|\"[^\"$" + "`" + "\\\\\\n]*\")*";
const DATA_HEREDOC_LINE = new RegExp(
  "^\\s*(?:git add " + PLAIN + "* && )?(?:git commit\\b" + WORDS + "\\s(?:-m|--message)|gh (?:pr|issue) (?:create|edit|comment)\\b" + WORDS + "\\s--body)\\s+\"\\$\\(cat <<'([A-Za-z_]+)'$",
);

/** @param {string[]} after 終端の行より後ろの行 */
const CAT_PATH = "[^\\s\"'$`;&|()<>\\\\]+";
const CAT_PREFIX = "(?:mkdir -p [^;&|$`\"'()<>#\\\\\\n]+ && )?"; // 前に置いてよいのは `mkdir -p <パス> &&` だけ
const CAT_HEREDOC_LINES = [
  new RegExp(`^\\s*${CAT_PREFIX}cat\\s+>>?\\s+${CAT_PATH}\\s+<<\\s*'([A-Za-z_]+)'$`), // cat > f <<'TAG'（<< の後ろの空白も）
  new RegExp(`^\\s*${CAT_PREFIX}cat\\s+<<\\s*'([A-Za-z_]+)'\\s+>>?\\s+${CAT_PATH}$`), // cat <<'TAG' > f
];

function heredocIsData(line, tag, after, continued = false) {
  // 前の行が `\` で終わるとき、この行は前の行から続く 1 つのコマンドの一部なので、決まった形として隠さない
  if (continued) return false;
  const m = DATA_HEREDOC_LINE.exec(line);
  // 終端の次の行は `)"` と空白だけ。その後ろに別のコマンドがあれば隠さない
  if (m !== null && m[1] === tag && after.length > 0 && /^\)"\s*$/.test(after[0]) && after.slice(1).every((l) => l.trim() === "")) return true;
  // `cat > <パス>`・`cat <<'TAG' > <パス>` の行（前に `mkdir -p <パス> &&` 可）
  // 隠すのは、終端の行の後ろに何も続かないときだけ（書いたスクリプトを同じコマンドで走らせる形は、本文も隠さず判定する）
  if (!after.every((l) => l.trim() === "")) return false;
  return CAT_HEREDOC_LINES.some((re) => re.exec(line)?.[1] === tag);
}

/**
 * コマンドの文字列が、すべて「読むだけ・記録するだけ」（許可リスト）か。読み切れない（置換・入れ子の実行・未知の語・閉じないヒアドキュメント）ものは false。
 * 名前に当たる語が文字列にあっても、これが true なら引数の文字列にすぎない。
 */
export function isTameCommand(command, depth = 0) {
  if (depth > MAX_DEPTH || hasUnreadableQuote(command)) return false;
  const stripped = stripHeredocBodies(command);
  if (stripped === null) return false;
  const { commands, nested } = lex(stripped);
  return commands.every(isTameWords) && nested.every((inner) => isTameCommand(inner, depth + 1));
}

/**
 * コマンドの文字列が、先頭が `git`（前に環境変数・`cd`・`sudo` ほかが無い）の**単一の単純なコマンド**で、
 * 全体の選択肢（`-C`・`-c` ほか）が無いなら、`{ sub, rest }`。それ以外は null（確かめてよい単純な形ではない）。
 */
export function simpleGitCommand(command) {
  if (hasUnreadableQuote(command)) return null;
  const { commands, nested } = lex(command);
  if (commands.length !== 1 || nested.length > 0) return null;
  const words = commands[0];
  if (words[0] !== "git" || words.length < 2 || words[1].startsWith("-")) return null;
  // 展開されていない変数（`-- $F`）は、何を指すか分からない
  if (words.some((w) => /[$`]/.test(w))) return null;
  return { sub: words[1], rest: words.slice(2) };
}

/**
 * サブエージェントのガードの候補: コマンドの文字列のどこかに、危ない操作の名前が出るか（入れ子も含め、素朴な文字列の走査）。
 * 名前が出て、宣言に当たらず、許可リストの「読むだけ」でも単純な安全な形でもなければ、読めないとして聞く。
 */
function hasSubagentCandidate(command) {
  return mentionsSubagentOperation(command);
}

/**
 * 宣言（{@link SUBAGENT_GUARDED_COMMANDS}）に当たらず、読む・作る形と読み切れた単純なコマンド（`git [-C …] branch`〈変更の選択肢は宣言が先に当たる〉・
 * `fuser`〈-k は宣言〉・`gh pr review` の決めない形・`gh api` の GET の形）か。「迷う形は聞く」の受け皿へ落とさない（再レビュー I-1）。
 */
function isBenignSubagentWords(words) {
  // 許可リストの形だけ: 先頭の環境変数の代入が 1 つでもあれば通さない（`GIT_SSH_COMMAND=… git branch`）
  if (words.length === 0 || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) return false;
  if (findSubagentCommands(words.join(" ")).length > 0) return false;
  const name = path.posix.basename(words[0]);
  if (name === "git") {
    // 全体の選択肢は `-C <dir>`（作業ツリーの指定）だけ許す。`-c`・`--config-env`・`--exec-path`・`--git-dir` ほかが 1 つでもあれば通さない
    let at = 1;
    while (words[at] === "-C" && at + 1 < words.length) at += 2;
    if (words[at] === undefined || words[at].startsWith("-")) return false;
    return words[at] === "branch" && isListOrCreateGitBranch(words.slice(at + 1));
  }
  if (name === "fuser") return true;
  if (name === "gh") {
    const at = skipOptions(words, 1, GH_ARG_OPTS);
    if (words[at] === "api") return isReadOnlyGhApi(words, at + 1);
    if (words[at] === "pr" && words[at + 1] === "review") return isNonDecidingGhReview(words.slice(at + 2));
  }
  return false;
}

/**
 * `git branch` の、一覧・現在の枝・作成だけ（許可リスト）: 引数なし／`--list [<pattern>]`・`-l`／`--show-current`／`-a`・`-r`・`-v`・`-vv`／
 * `--sort=<…>`・`--sort <…>`／`--contains|--merged|--no-merged [<rev>]`／`<name> [<start>]`（作成）。
 * `-u`・`--set-upstream-to`・`--unset-upstream`・`--edit-description`・ほかの選択肢と、選択肢に続く名前は通さない（上流の付け替えは含まない）。
 */
function isListOrCreateGitBranch(args) {
  let list = false;
  let flags = 0;
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const w = args[i];
    if (w === "--list" || w === "-l") list = true;
    else if (["-a", "-r", "-v", "-vv", "--all", "--remotes", "--verbose", "--show-current", "--no-color", "--color", "--column", "--no-column", "--abbrev", "--no-abbrev"].includes(w) || /^--(sort|contains|merged|no-merged|points-at|format|color|column|abbrev)=\S*$/.test(w)) flags += 1;
    else if (w === "--sort" || w === "--format") {
      flags += 1;
      i += 1; // 値は次の語（`-committerdate` のように - で始まりうる）
    } else if (["--contains", "--merged", "--no-merged"].includes(w)) {
      flags += 1;
      if (args[i + 1] !== undefined && !args[i + 1].startsWith("-")) i += 1;
    } else if (w.startsWith("-")) return false;
    else positional.push(w);
  }
  if (positional.length === 0 || list) return true;
  return flags === 0 && positional.length <= 2;
}

/** `lex` が読めない引用（`$'…'`・`$"…"`）を含むか。含めば lex の結果を信じない（引用符の内外が食い違い、`git push` が引用符の中と読まれる）。 */
export function hasUnreadableQuote(command) {
  // ① 元のコマンド（`lex`・`isTameCommand` と同じ行の分け方）から、データとして証明できる heredoc の本文だけを取り除く
  //    （取り除けないときは元のまま。fail closed）。本文の中の `$'…'` は実行されない。
  const text = stripHeredocBodies(command) ?? command;
  // ② 行の継続（`\` と改行）をつなぐ。③ `$'`・`$"` が**どこかに 1 つでも**あれば読めない（前の文字は問わない。
  //    `echo x$'\''` のように語の途中でも、`grep "main$"` の行末の錨の直後の引用符でも。見分けようとせず、判定の食い違いを避ける）
  return /\$['"]/.test(text.replace(/\\\r?\n/g, ""));
}

/** 「迷う形は聞く」の対象から、上の読む・作る形の単純なコマンドを除いた残り。入れ子（置換・`bash -c`）があれば元のまま（fail closed）。 */
function residualForSubagent(command) {
  // `$'…'`・`$"…"`（ANSI-C・ロケールの引用）は lex が読めず、引用符の内外が食い違う。lex の結果を信じず、除かずに元のまま返す（fail closed）
  if (hasUnreadableQuote(command)) return command;
  const stripped = stripHeredocBodies(command);
  if (stripped === null) return command;
  const { commands, nested } = lex(stripped);
  if (nested.length > 0) return command;
  const keep = commands.filter((words) => !isBenignSubagentWords(words));
  // 何も除かなければ（データの heredoc の本文だけ取り除いた）元の文字列のまま読む（語をつなぎ直すと、引用符の中の `|`・`;`・`&&` が区切りになる）
  if (keep.length === commands.length) return stripped;
  // 除いたときは、語を 1 つずつ単一引用符で包み直して、読み直しても同じ語の並びになるようにする
  const quote = (w) => `'${w.replaceAll("'", "'\\''")}'`;
  return keep.map((words) => words.map(quote).join(" ")).join("\n");
}

/** サブエージェントでも通してよい単純な git の形（ファイルの取り出し・安全な reset・worktree の追加と一覧）。 */
function isSafeSimpleGit(command) {
  const g = simpleGitCommand(command);
  if (g === null) return false;
  const opts = beforeDashDash(g.rest);
  if (g.sub === "checkout") {
    const k = g.rest.indexOf("--");
    // `git checkout [rev] -- path…`: rev は高々 1 語、枝を作る・切り離す選択肢は無く、pathspec が 1 つ以上
    return k !== -1 && k <= 1 && k < g.rest.length - 1 && g.rest.slice(0, k).every((w) => !w.startsWith("-"));
  }
  if (g.sub === "reset") return opts.every((w) => !w.startsWith("-") || ["--soft", "--mixed", "-q", "--quiet"].includes(w));
  if (g.sub === "worktree") return ["add", "list"].includes(g.rest[0]);
  return false;
}

/**
 * サブエージェントから呼ばれたときに人に聞くコマンド（{@link SUBAGENT_GUARDED_COMMANDS}）のうち、コマンドの文字列が走らせうるもの。
 * @param {string} command
 */
export function findSubagentCommands(command) {
  // データとして使われる heredoc の本文（git commit -m "$(cat <<'EOF' …)"）は文章なので、宣言を当てる前に取り除く（コードレビュー 2）
  return analyzeString(stripHeredocBodies(command) ?? command, 0, SUBAGENT_GUARDED_COMMANDS);
}

const RULE_REF = "AGENTS.md「AI 運用規則」の「人の明示の指示か承認を待つ操作」に当たります（docs/adr/0032）。";

function ask(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: reason,
    },
  };
}

/**
 * 入力（標準入力の JSON）を読み、シェルのコマンドの文字列を取り出す。
 * @returns {{ ask: object } | { skip: true } | { input: object, command: string }}
 */
function readShellCommand(raw) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return { ask: ask(`フックの入力を読めませんでした。念のため人に確かめます。${RULE_REF}`) };
  }
  if (input === null || typeof input !== "object") {
    return { ask: ask(`フックの入力の形が想定と違います。念のため人に確かめます。${RULE_REF}`) };
  }
  if (!SHELL_TOOLS.includes(input.tool_name)) return { skip: true };
  const command = input.tool_input?.command;
  // Monitor の WebSocket の形はシェルを走らせない（PR #498 の再レビュー 3）
  if (input.tool_name === "Monitor" && command === undefined && input.tool_input?.ws !== undefined) return { skip: true };
  if (typeof command !== "string") {
    return { ask: ask(`${input.tool_name} のコマンドを読めませんでした。念のため人に確かめます。${RULE_REF}`) };
  }
  return { input, command };
}

/**
 * 本番デプロイの判定（{@link GUARDED_COMMANDS}）。入力が読めない・command が文字列でないときも `ask`（黙って通さない）。
 * 入口はこれに当たったときだけ、ほかの判定を流さずにすぐ返す（docs/adr/0032 の追記）。
 * @param {string} raw 標準入力の中身
 * @returns {object | null}
 */
export function decideProductionOutput(raw) {
  const r = readShellCommand(raw);
  if (r.ask) return r.ask;
  if (r.skip) return null;
  const hits = findGuardedCommands(r.command);
  if (hits.length === 0) return null;
  const list = hits.map((h) => `${h.id}（${h.why}）`).join("・");
  return ask(`本番デプロイに当たるコマンドです: ${list}。人の明示の指示があるときだけ承認してください。${RULE_REF}`);
}

/**
 * サブエージェントの呼び出しだけ（入力に `agent_id` がある。まとめ役の呼び出しには無い）の判定（docs/adr/0037）。
 * @param {string} raw
 * @returns {object | null}
 */
export function decideSubagentOutput(raw) {
  const r = readShellCommand(raw);
  if (r.ask || r.skip) return null; // 読めない入力は本番デプロイの判定が ask に倒している
  const { input, command } = r;
  if (typeof input.agent_id !== "string" || input.agent_id === "") return null;
  const sub = findSubagentCommands(command);
  if (sub.length > 0) {
    const list = sub.map((h) => `${h.id}（${h.why}）`).join("・");
    return ask(`サブエージェントからの呼び出しです: ${list}。まとめ役か人が行う操作です。人が任せたときだけ承認してください（docs/adr/0037）。`);
  }
  // 迷う形は聞く: 危ない操作の名前が文字列にあるのに、宣言に当たらず、読むだけでも単純な安全な形でもない（変数・別名・入れ子ほか）
  const rest = residualForSubagent(command);
  if (hasSubagentCandidate(rest) && !isTameCommand(rest) && !isSafeSimpleGit(rest)) {
    return ask(`サブエージェントからの呼び出しで、push・マージ・枝の切り替え・reset・worktree・kill に当たるかを読み切れない形です。まとめ役か人が行う操作かもしれないので、人の確認が要ります（docs/adr/0037）。`);
  }
  return null;
}

/**
 * 本番デプロイとサブエージェントの判定をまとめた形（本番デプロイが先）。入口は両方を別々に呼ぶ（束ね方は `scripts/lib/hook-combine.mjs`）。
 * @param {string} raw 標準入力の中身
 * @returns {object | null}
 */
export function decideHookOutput(raw) {
  return decideProductionOutput(raw) ?? decideSubagentOutput(raw);
}
