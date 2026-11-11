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

/** `git` の、値を次の語に取る全体の選択肢（`git -C dir push`・`git -c k=v push`）。 */
export const GIT_ARG_OPTS = ["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix"];
const GH_ARG_OPTS = ["-R", "--repo"];

/** `--` より前に `--` の無い checkout（枝の切り替え。`git checkout <枝>`・`-b`）。 */
const checkoutWithoutDashDash = (words, start) => !words.slice(start + 1).includes("--");

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
  { id: "git-checkout-branch", program: "git", args: ["checkout"], argOpts: GIT_ARG_OPTS, when: checkoutWithoutDashDash, why: "枝の切り替えは、同じ作業ツリーを使う他の作業を壊す" },
  {
    id: "git-reset-hard", program: "git", args: ["reset"], argOpts: GIT_ARG_OPTS,
    when: (words, start) => words.slice(start + 1).includes("--hard"), why: "reset --hard は、未コミットの変更と履歴を消す",
  },
  { id: "git-worktree-remove", program: "git", args: ["worktree", "remove"], argOpts: GIT_ARG_OPTS, why: "作業ツリーの削除は、まとめ役が棚卸しの後に行う" },
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
 * サブエージェントから呼ばれたときに人に聞くコマンド（{@link SUBAGENT_GUARDED_COMMANDS}）のうち、コマンドの文字列が走らせうるもの。
 * @param {string} command
 */
export function findSubagentCommands(command) {
  return analyzeString(command, 0, SUBAGENT_GUARDED_COMMANDS);
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
 * Claude Code の PreToolUse フックの入力（標準入力の JSON）から、返す JSON を決める。
 *
 * - シェルを走らせる道具（{@link SHELL_TOOLS}）で宣言に当たれば `ask`（人に聞く）。理由に当たったものと規則の置き場を書く
 * - 当たらなければ `null`（何も返さない。ほかの許可の仕組みに任せる）
 * - それ以外の道具は `null`
 * - 入力が読めない・`command` が文字列でないときは `ask` に倒す（黙って通さない）
 *
 * @param {string} raw 標準入力の中身
 * @returns {object | null}
 */
export function decideHookOutput(raw) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return ask(`フックの入力を読めませんでした。念のため人に確かめます。${RULE_REF}`);
  }
  if (input === null || typeof input !== "object") {
    return ask(`フックの入力の形が想定と違います。念のため人に確かめます。${RULE_REF}`);
  }
  if (!SHELL_TOOLS.includes(input.tool_name)) return null;
  const command = input.tool_input?.command;
  // Monitor の WebSocket の形はシェルを走らせない（PR #498 の再レビュー 3）
  if (input.tool_name === "Monitor" && command === undefined && input.tool_input?.ws !== undefined) return null;
  if (typeof command !== "string") {
    return ask(`${input.tool_name} のコマンドを読めませんでした。念のため人に確かめます。${RULE_REF}`);
  }
  const hits = findGuardedCommands(command);
  if (hits.length > 0) {
    const list = hits.map((h) => `${h.id}（${h.why}）`).join("・");
    return ask(`本番デプロイに当たるコマンドです: ${list}。人の明示の指示があるときだけ承認してください。${RULE_REF}`);
  }
  // サブエージェントの呼び出しだけ（入力に agent_id がある。まとめ役の呼び出しには無い）。本番デプロイの判定の後に見る
  if (typeof input.agent_id === "string" && input.agent_id !== "") {
    const sub = findSubagentCommands(command);
    if (sub.length > 0) {
      const list = sub.map((h) => `${h.id}（${h.why}）`).join("・");
      return ask(`サブエージェントからの呼び出しです: ${list}。まとめ役か人が行う操作です。人が任せたときだけ承認してください（docs/adr/0037）。`);
    }
  }
  return null;
}
