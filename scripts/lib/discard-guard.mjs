/**
 * 未コミットの変更を消しうる git の手前で人に聞く判定（#578・docs/adr/0037）。
 *
 * ## 作り（許可リスト・fail closed）
 *
 * 禁止の形を数え上げる作りは、`cd`・`GIT_DIR`・`-c core.worktree`・入れ子の文字列・省略形ほか、すり抜けの形が尽きなかった
 * （3 回の敵対的レビューで穴が出た）ので、**確かめてよい単純な形だけを許可リストに書き、ほかは全部聞く**作りにした。
 *
 * 1. **候補**: コマンドの文字列のどこかに `git` と、`checkout`・`restore`・`stash`・`reset`・`clean`・`switch` のどれかがある（入れ子の中も含め、素朴な文字列の走査）
 * 2. **読むだけ・記録するだけ**（`grep 'git stash' …`・`git commit -m "…"`・`git log`・`git stash list`）なら通す（許可リスト。`agent-guard.mjs` の `isTameCommand`）
 * 3. **確かめてよい単純な形**だけ、`cwd` で未コミットの変更を見る: 1 つのコマンドだけ（`;`・`&&`・`|`・置換・入れ子の文字列が無い）、
 *    先頭が `git`（前に環境変数・`cd`・`sudo` が無い）、全体の選択肢（`-C`・`-c`・`--git-dir` ほか）が無く、下位コマンドの選択肢が既知の少数だけ。
 *    変更があれば聞き、無ければ通す。**確かめ自体が失敗したら聞く**
 * 4. **それ以外の候補は全部聞く**（理由は「形が単純でないので確かめられない」）。誤って聞くのは許容し、誤って通すのをなくす
 *
 * ## 確かめてよい単純な形
 *
 * - `git checkout [<rev>] -- <path>…`・`git checkout <path>`（実在するパス 1 つ）: そのパスの**作業ツリーの未コミットの変更**（index との差）を見る。
 *   `git checkout -b|-B <名前> [<開始点>]`・`git checkout <枝>`（実在するパスでない 1 語）・`git checkout --detach [<rev>]` は枝の操作で、git 自身が上書きを拒むので通す
 * - `git restore [--] <path>…`: 同じく作業ツリーの変更。`git restore --staged|-S [--] <path>…` は作業ツリーを消さないので通す
 * - `git stash [push|save] [-u|--include-untracked] [-m <文>]`: 追跡中の変更（index も含む。`-u` は追跡外も）を見る。
 *   `stash list|show`・`pop`・`apply`（引数なし）は通す。`drop`・`clear`・`branch` ほかは聞く
 * - `git reset --hard [<rev>]`: 追跡中の変更を見る。`--soft`・`--mixed`・`-q` と rev・path だけの reset は通す。ほかの選択肢（`--merge`・`--keep`・省略形）は聞く
 * - `git clean`: `-n`・`--dry-run` があれば通す。ほかは聞く
 * - `git switch <枝>`・`git switch -c <名前> [<開始点>]`・`git switch --detach|-d [<rev>]`（どれも `-q` 可）は通す。ほかの選択肢（`-f`・`--discard-changes`・`-C`）は聞く
 * - 先頭の `git -C <リテラルのパス>` は 1 つだけ読み、そのパスを作業ツリーとして上の形を確かめる（#612。兄弟の作業ツリーでは
 *   Claude Code の `cd` が次の呼び出しに残らないため）。`-C` が 2 つ以上・ほかの全体の選択肢・`$`・先頭の `~`・波括弧のある形と、
 *   `-C` の先が実在するディレクトリでない形（グロブほか、シェルが展開する語）は聞く
 *
 * ## 手順書との関係
 *
 * `docs/guides/procedures/adversarial-review.md` の `git checkout origin/main -- <テスト>` → `git checkout HEAD -- <テスト>` は、
 * 1 回目で index と作業ツリーを書き換える（HEAD との差は **ステージ済みの変更**になる）ので、2 回目を止めないよう、
 * `checkout`・`restore` では**作業ツリーの未コミットの変更（index との差）だけ**を見る。ステージ済みだけの変更を
 * `git checkout <rev> -- <path>` が上書きするときは聞かない（ADR-0037 の残余）。stash と reset --hard は index の変更も見る。
 *
 * 歯止めであって壁ではない: `rm`・エディタでの上書き・`git checkout -- .` 以外の別の言語からの呼び出しは対象外。
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { isTameCommand, simpleGitCommand, mentionsDiscardOperation, hasShellExpansion, SHELL_TOOLS } from "./agent-guard.mjs";

/** 通す（確かめなくてよい）ときの結果。 */
const SAFE = Object.freeze({ verdict: "safe" });
/** 形が単純でなく、確かめられないときの結果。 */
const UNKNOWN_FORM = Object.freeze({ verdict: "unknown-form" });

/** 候補の語が引数に出るだけの組み込みの下位コマンド（`git push origin fix/reset-x`・`git rebase …`）。作業ツリーの未コミットの変更は、git 自身が上書きを拒む。 */
const NON_DISCARDING_SUBS = new Set([
  "push", "pull", "fetch", "merge", "rebase", "cherry-pick", "revert", "clone", "init", "notes", "archive", "am", "format-patch",
  "submodule", "bisect", "gc", "maintenance", "fsck", "count-objects", "sparse-checkout", "pack-refs", "update-ref", "symbolic-ref",
]);

/** `:` で始まる魔法の pathspec（`:/a.ts`・`:(icase)A.TS`）。枝の名前は `:` で始まれない（#612 の再レビュー）。 */
const isMagicPathspec = (w) => w.startsWith(":");

const hasShort = (w, c) => /^-[A-Za-z]+$/.test(w) && w.includes(c);

/**
 * 単純な git の形（{ sub, rest }）を、許可リストで分類する。
 * @returns {{ verdict: "safe" } | { verdict: "unknown-form" } | { verdict: "check", target: object }}
 */
function classify({ sub, rest }, exists) {
  // シェルが展開する語（`{a,b}`・`{a..c}`・先頭の `~`）は、展開前の文字のままでは git status に渡せない（コードレビュー 1）
  if (rest.some(hasShellExpansion)) return UNKNOWN_FORM;
  const quiet = (w) => w === "-q" || w === "--quiet";
  if (sub === "checkout") {
    const words = rest.filter((w) => !quiet(w));
    const dd = words.indexOf("--");
    if (dd !== -1) {
      const before = words.slice(0, dd);
      const paths = words.slice(dd + 1);
      if (before.length > 1 || before.some((w) => w.startsWith("-")) || paths.length === 0) return UNKNOWN_FORM;
      return { verdict: "check", target: { kind: "paths", paths, scope: "worktree", ...(before.length === 1 ? { withRev: true } : {}) } };
    }
    if ((words[0] === "-b" || words[0] === "-B") && words.length >= 2 && words.length <= 3 && words.slice(1).every((w) => !w.startsWith("-"))) return SAFE;
    // `git checkout --detach [<rev>]`: HEAD を切り離すだけ。枝の切り替えと同じく、git 自身が上書きを拒む（#612）
    if (words[0] === "--detach" && words.length <= 2 && words.slice(1).every((w) => !w.startsWith("-"))) return SAFE;
    if (words.length === 1 && (words[0] === "-" || !words[0].startsWith("-"))) {
      // グロブ（`*`・`?`・`[`、zsh の extendedglob の `^`・`~`）を含む語は、文字どおりには実在しなくてもシェルや git が実在するパスへ展開しうるので、
      // 枝とみなさずパスとして確かめる（#612 の敵対的レビュー・/code-review）。どの字も git の枝の名前には使えないので、枝を誤って聞くことはない
      return words[0] !== "-" && (/[*?[^~]/.test(words[0]) || isMagicPathspec(words[0]) || exists(words[0])) ? { verdict: "check", target: { kind: "paths", paths: words, scope: "worktree" } } : SAFE;
    }
    return UNKNOWN_FORM;
  }
  if (sub === "restore") {
    // 許可リスト: --staged/-S・--source <rev>/-s <rev>（`=`・つなげた形も）・`--`・path だけ。ほかの選択肢は聞く
    let staged = false;
    let withRev = false;
    const paths = [];
    let ended = false;
    for (let i = 0; i < rest.length; i += 1) {
      const w = rest[i];
      if (ended || !w.startsWith("-")) paths.push(w);
      else if (w === "--") ended = true;
      else if (w === "--staged" || w === "-S") staged = true;
      else if (w === "-s" || w === "--source") {
        withRev = true;
        i += 1; // 値は次の語
      } else if (/^--source=./.test(w) || /^-s[^-\s]/.test(w)) withRev = true;
      else return UNKNOWN_FORM;
    }
    if (paths.length === 0) return UNKNOWN_FORM;
    if (staged) return SAFE;
    return { verdict: "check", target: { kind: "paths", paths, scope: "worktree", ...(withRev ? { withRev: true } : {}) } };
  }
  if (sub === "stash") {
    const [first, ...tail] = rest;
    if (first === "list" || first === "show") return SAFE;
    if (first === "pop" || first === "apply") return tail.length === 0 ? SAFE : UNKNOWN_FORM;
    const body = first === "push" || first === "save" ? tail : rest;
    let untracked = false;
    for (let i = 0; i < body.length; i += 1) {
      const w = body[i];
      if (w === "-u" || w === "--include-untracked") untracked = true;
      else if (w === "-m" || w === "--message") i += 1;
      else if (first === "save" && !w.startsWith("-")) continue; // save <文>
      else return UNKNOWN_FORM;
    }
    return { verdict: "check", target: { kind: "all", scope: "any", ...(untracked ? { untracked: true } : {}) } };
  }
  if (sub === "reset") {
    if (rest.includes("--hard")) {
      const others = rest.filter((w) => w !== "--hard");
      return others.length <= 1 && others.every((w) => !w.startsWith("-")) ? { verdict: "check", target: { kind: "all", scope: "any" } } : UNKNOWN_FORM;
    }
    return rest.every((w) => !w.startsWith("-") || ["--soft", "--mixed", "-q", "--quiet", "--"].includes(w)) ? SAFE : UNKNOWN_FORM;
  }
  if (sub === "clean") {
    return rest.some((w) => w === "-n" || w === "--dry-run" || hasShort(w, "n")) && !rest.some((w) => w === "-f" || w === "--force") ? SAFE : UNKNOWN_FORM;
  }
  if (sub === "switch") {
    const words = rest.filter((w) => !quiet(w));
    if (words.length === 1 && !words[0].startsWith("-")) return SAFE;
    if (words[0] === "-c" && words.length >= 2 && words.length <= 3 && words.slice(1).every((w) => !w.startsWith("-"))) return SAFE;
    // `git switch --detach|-d [<rev>]`（#612）
    if ((words[0] === "--detach" || words[0] === "-d") && words.length <= 2 && words.slice(1).every((w) => !w.startsWith("-"))) return SAFE;
    return UNKNOWN_FORM;
  }
  // 下の 5 つは -f/--force（や --reset）が無ければ変更があると git 自身が拒む。ある形は対象を絞れないので聞く（コードレビュー 5）
  if (sub === "rm") return rest.some((w) => w === "--force" || hasShort(w, "f")) ? UNKNOWN_FORM : SAFE;
  if (sub === "mv" || sub === "checkout-index") return rest.some((w) => w === "--force" || hasShort(w, "f")) ? UNKNOWN_FORM : SAFE;
  if (sub === "read-tree") return rest.some((w) => w === "--reset" || hasShort(w, "u") || w === "--reset") ? UNKNOWN_FORM : SAFE;
  if (sub === "submodule") return rest.some((w) => w === "--force" || hasShort(w, "f")) ? UNKNOWN_FORM : SAFE;
  if (sub === "worktree") return rest.some((w) => w === "--force" || hasShort(w, "f")) ? UNKNOWN_FORM : SAFE;
  // 作業ツリーの変更を上書きしない git 組み込みの下位コマンド（別名は組み込みの名前を覆えない）。それ以外（別名・未知）は読めない
  return NON_DISCARDING_SUBS.has(sub) ? SAFE : UNKNOWN_FORM;
}

/** 実在するディレクトリか（`git -C` の先の確かめ。本番の `dirExists`）。 */
function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function ask(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason } };
}

const describeTarget = (t) => (t.kind === "paths" ? t.paths.join("・") : "作業ツリー全体");

/**
 * Claude Code の PreToolUse フックの入力から、未コミットの変更を消しうる git なら `ask` を返す。当たらなければ null。
 * @param {string} raw
 * @param {{ exists?: (p: string, cwd: string) => boolean, dirExists?: (dir: string) => boolean, isDirty: (cwd: string, target: object) => Promise<"yes" | "no" | "unknown"> | "yes" | "no" | "unknown", cwd?: string }} deps
 */
export async function decideDiscardOutput(raw, { exists, isDirty, cwd: defaultCwd = process.cwd(), dirExists = isDirectory }) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return null; // 読めない入力は本番デプロイの判定が ask に倒している
  }
  if (input === null || typeof input !== "object" || !SHELL_TOOLS.includes(input.tool_name)) return null;
  const command = input.tool_input?.command;
  if (typeof command !== "string") return null;
  // 1. 候補（素朴な文字列の走査。入れ子の中も含む）
  if (!mentionsDiscardOperation(command)) return null;
  // 2. 読むだけ・記録するだけ（許可リスト）
  if (isTameCommand(command)) return null;
  // 3. 確かめてよい単純な形
  const baseCwd = typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : defaultCwd;
  const simple = simpleGitCommand(command, { allowDir: true });
  // `git -C <パス>` は、そのパスを作業ツリーとして確かめる（#612。パスの存在も変更もそこで見る）
  const cwd = simple?.dir === undefined ? baseCwd : path.resolve(baseCwd, simple.dir);
  const existsIn = exists ? (p) => exists(p, cwd) : (p) => fs.existsSync(path.resolve(cwd, p));
  // -C の先が実在するディレクトリでなければ（グロブ・zsh の =cmd ほかシェルが展開する語・誤った場所）、git が実際に動く場所が分からない（#612 の敵対的レビュー 1）
  const dirKnown = simple?.dir === undefined || dirExists(cwd);
  if (!dirKnown) {
    return ask(`git -C の先（${simple.dir}）が実在するディレクトリでないので、どの作業ツリーの変更が消えるか確かめられません（グロブ・誤った場所ほか）。パスをそのまま書き直すか、消えてよいか人が確かめてください（docs/adr/0037）。`);
  }
  // 残余: -C のとき、後ろの引数のグロブはシェルが呼び出しの cwd（baseCwd）で展開するが、ここは -C の先でパスを見る。
  // 今はグロブの語を確かめる側（聞く側）に倒しているので誤って通さない。グロブを存在だけで判定する形に縮めるときは、この食い違いを先に塞ぐ
  const result = simple === null ? UNKNOWN_FORM : classify(simple, existsIn);
  if (result.verdict === "safe") return null;
  if (result.verdict === "unknown-form") {
    return ask("未コミットの変更を消しうる git かもしれませんが、形が単純でないので（複数のコマンド・入れ子・環境変数や -C/-c・未知の選択肢ほか）確かめられません。消えてよいか人の確認が要ります（docs/adr/0037）。");
  }
  // 4. 変更を見る。確かめ自体が失敗したら聞く
  const state = await isDirty(cwd, result.target);
  if (state === "no") return null;
  const why =
    state === "untracked"
      ? `${describeTarget(result.target)} と同じ名前の追跡外のファイルを上書きします。必要ならコミットか退避してください。`
      : state === "yes"
      ? `${describeTarget(result.target)} に未コミットの変更があります。消える前にコミットするか、退避してください。`
      : `${describeTarget(result.target)} に未コミットの変更があるか確かめられませんでした（git が答えなかった）。`;
  return ask(`未コミットの変更を消しうる操作です: ${why}消してよいと人が決めたときだけ承認してください（docs/adr/0037）。`);
}

/** git の問い合わせの上限（ミリ秒）。 */
const GIT_TIMEOUT_MS = 5000;

/**
 * 対象に未コミットの変更があるか。本番の `isDirty`。`scope: "worktree"` は作業ツリーの変更（index との差）だけ、`"any"` はステージ済みも。
 * @returns {Promise<"yes" | "untracked" | "no" | "unknown">}
 */
export function defaultIsDirty(cwd, target, env = {}) {
  // rev つきの checkout/restore（`git checkout <rev> -- <path>`・`git restore --source <rev>`）は、同じ名前の追跡外のファイル（ignore されないもの）も
  // 上書きしうるので、追跡外も見る。rev の無い形は index から戻すので追跡外に触れない（PR コメント 1）。ignore されたファイルを上書きする形は見ない（残余。ADR-0037）
  const untrackedMode = target.untracked || target.withRev ? "normal" : "no";
  const args = ["status", "--porcelain", `--untracked-files=${untrackedMode}`];
  if (target.kind === "paths") args.push("--", ...target.paths);
  return new Promise((resolve) => {
    const child = execFile("git", args, { cwd, timeout: GIT_TIMEOUT_MS, encoding: "utf8", windowsHide: true, env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      if (!error) {
        const lines = stdout.split("\n").filter((l) => l !== "");
        // worktree 範囲: 作業ツリー側の変更（` M`・`??` ほか）。index だけの変更（`M `）は数えない
        const relevant = target.scope === "worktree" ? lines.filter((l) => l[1] !== " " || l.startsWith("??")) : lines;
        if (relevant.length === 0) return resolve("no");
        // 追跡下の変更があれば "yes"、追跡外のファイルだけなら "untracked"（上書きされるのは追跡外のファイル。理由の文を分ける）
        return resolve(relevant.every((l) => l.startsWith("??")) && !target.untracked ? "untracked" : "yes");
      }
      // 作業ツリーでない場所だけが、消すものが無い。ほかの 128（所有者の不一致・壊れた設定）・git が無い・場所が無い・時間切れは、確かめられなかった
      if (!error.killed && error.code === 128 && /not a git repository/i.test(String(stderr))) return resolve("no");
      return resolve("unknown");
    });
    child.stdin?.end();
  });
}
