/**
 * 脅威の範囲（docs/adr/0037）: この歯止めは**協力的なエージェントの事故を止めるもの**で、悪意への境界ではない
 * （docs/adr/0032 の限界と同じ。最後の壁は資格情報がエージェントの環境に無いこと）。誤って聞くのは許容し、協力的なエージェントが
 * 実際に書きうる形で誤って通すのを無くす。意図的な回避（sed の e・w コマンド、git の --upload-pack や -c で別のプログラムを走らせる形）は範囲外。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { decideDiscardOutput, defaultIsDirty } from "./discard-guard.mjs";

/**
 * 判定を `isDirty` の答え（yes / no / unknown）ごとに流し、ask か通すか（null）と、確かめた対象を返す。
 * exists は「実在するパス」の集合を与える。
 */
async function decide(command, { dirty = "no", existing = [], cwd = "/w", tool = "Bash", dirs = null } = {}) {
  const calls = [];
  const out = await decideDiscardOutput(JSON.stringify({ tool_name: tool, cwd, tool_input: { command } }), {
    exists: (p) => existing.includes(p),
    // -C の先のディレクトリが実在するか。既定は実在する（dirs を渡したら、その集合だけが実在する）
    dirExists: (d) => dirs === null || dirs.includes(d),
    isDirty: async (dir, target) => (calls.push({ dir, target }), dirty),
  });
  return { ask: out?.hookSpecificOutput?.permissionDecision === "ask", reason: out?.hookSpecificOutput?.permissionDecisionReason ?? "", calls };
}

describe("確かめてよい単純な形: 変更があれば聞き、無ければ通す", () => {
  const cases = [
    ["git checkout -- a.ts", { kind: "paths", paths: ["a.ts"], scope: "worktree" }],
    ["git checkout -- a.ts b.ts", { kind: "paths", paths: ["a.ts", "b.ts"], scope: "worktree" }],
    ["git checkout HEAD -- a.ts", { kind: "paths", paths: ["a.ts"], scope: "worktree", withRev: true }],
    ["git checkout origin/main -- a.test.mjs", { kind: "paths", paths: ["a.test.mjs"], scope: "worktree", withRev: true }],
    ["git restore --source=HEAD~1 a.ts", { kind: "paths", paths: ["a.ts"], scope: "worktree", withRev: true }],
    ["git restore -sHEAD~1 a.ts", { kind: "paths", paths: ["a.ts"], scope: "worktree", withRev: true }],
    ["git restore -s HEAD~1 a.ts", { kind: "paths", paths: ["a.ts"], scope: "worktree", withRev: true }],
    ["git checkout -q -- a.ts", { kind: "paths", paths: ["a.ts"], scope: "worktree" }],
    ["git checkout .", { kind: "paths", paths: ["."], scope: "worktree" }, ["."]],
    ["git restore a.ts", { kind: "paths", paths: ["a.ts"], scope: "worktree" }],
    ["git restore -- a.ts", { kind: "paths", paths: ["a.ts"], scope: "worktree" }],
    ["git restore .", { kind: "paths", paths: ["."], scope: "worktree" }],
    ["git stash", { kind: "all", scope: "any" }],
    ["git stash push", { kind: "all", scope: "any" }],
    ["git stash push -m wip", { kind: "all", scope: "any" }],
    ["git stash -m list", { kind: "all", scope: "any" }],
    ["git stash save wip", { kind: "all", scope: "any" }],
    ["git stash -u", { kind: "all", scope: "any", untracked: true }],
    ["git stash push --include-untracked", { kind: "all", scope: "any", untracked: true }],
    ["git reset --hard", { kind: "all", scope: "any" }],
    ["git reset --hard origin/main", { kind: "all", scope: "any" }],
  ];
  for (const [command, target, existing = []] of cases) {
    test(command, async () => {
      const yes = await decide(command, { dirty: "yes", existing });
      assert.equal(yes.ask, true);
      assert.deepEqual(yes.calls, [{ dir: "/w", target }]);
      assert.equal((await decide(command, { dirty: "no", existing })).ask, false);
      // 確かめ自体が失敗したら聞く
      const unknown = await decide(command, { dirty: "unknown", existing });
      assert.equal(unknown.ask, true);
      assert.match(unknown.reason, /確かめられませんでした/);
    });
  }
});

describe("確かめなくてよい形（消さない・git 自身が上書きを拒む・許可リストの読むだけ）は、何も確かめずに通す", () => {
  for (const command of [
    "git checkout main", "git checkout -b feat/x", "git checkout -B feat/x origin/main", "git checkout -",
    "git restore --staged a.ts", "git restore -S -- a.ts", "git restore --staged .",
    "git stash list", "git stash show -p", "git stash pop", "git stash apply",
    "git reset", "git reset HEAD a.ts", "git reset --soft HEAD~1", "git reset --mixed", "git reset -q HEAD~1",
    "git clean -n", "git clean --dry-run -d", "git switch main", "git switch -c feat/x", "git switch -c feat/x origin/main",
    "git status", "git diff -- a.ts", "git log --oneline -- a.ts", "git add . && git commit -m 'restore the stash'",
    "grep 'git stash' docs/a.md", "rg -n 'git checkout --' docs", "echo git restore a.ts", "cat checkout.txt",
    "git commit -m \"$(cat <<'EOF'\nfix: restore the reset handling\nEOF\n)\"", "git add -A && git commit -m \"$(cat <<'EOF'\nfix: git stash と git reset --hard の説明\nEOF\n)\"",
    "gh pr create --title 'x' --body 'git stash と git reset --hard の説明'", "git log --grep='git clean' | head",
    "git branch -a", "git push origin fix/reset-handling", "git rebase origin/main -x 'echo restore'", "\\git status", "git worktree add ../wt -b fix/reset-x", "pnpm test", "ls",
    // #612: HEAD を切り離す・-q つきの枝の切り替えも、git 自身が上書きを拒む（-f・-m・--discard-changes が無い）
    "git checkout --detach", "git checkout --detach abc1234", "git checkout -q --detach origin/main", "git checkout --quiet --detach refactor/591-x",
    "git switch -q main", "git switch --quiet main", "git switch --detach abc1234", "git switch -d abc1234", "git switch -q --detach origin/main", "git switch -q -c feat/x origin/main",
  ]) {
    test(command.split("\n")[0], async () => {
      const r = await decide(command, { dirty: "yes" });
      assert.equal(r.ask, false, r.reason);
      assert.deepEqual(r.calls, []);
    });
  }
});

describe("単純でない形は、変更の有無にかかわらず全部聞く（誤って聞くのは許容し、誤って通さない）", () => {
  const forms = [
    // 3 回の敵対的レビューで出たすり抜けの形
    "git checkout main a.ts", "git checkout a.ts b.ts", "git checkout --force main", "git checkout -f -- a.ts", "git checkout -b x -- a.ts",
    "git restore --pathspec-from-file=list.txt", "git restore --pathspec-from-file list.txt", "git restore -p a.ts", "git restore --patch a.ts",
    "git restore --stag --work a.ts", "git restore -SW a.ts", "git restore --staged --worktree a.ts",
    "git stash drop", "git stash clear", "git stash branch x", "git stash --include-untr", "git stash push -- a.ts",
    "git reset --har", "git reset --h", "git reset --merge", "git reset --keep", "git reset --hard HEAD~1 extra", "git clean -fd", "git clean -n -f", "git switch -f main", "git switch --discard-changes main", "git switch -C x",
    "cd ../other && git checkout -- a.ts", "pushd ../other; git restore a.ts", "cd /x; git stash", "git checkout -- a.ts; git stash", "git stash && git stash pop", "git checkout -- a.ts | cat",
    "GIT_DIR=/x/.git git checkout -- a.ts", "GIT_WORK_TREE=/x git restore a.ts", "GIT_INDEX_FILE=/tmp/i git stash", "GIT_CONFIG_GLOBAL=/x git stash", "GIT_CEILING_DIRECTORIES=/ git stash",
    "export GIT_DIR=/x/.git; git stash", "env GIT_DIR=/x git stash", "env -S 'git stash'", "sudo git stash", "command git stash", "time git stash", "/usr/bin/git stash",
    "git -c core.worktree=/x checkout -- a.ts", "git -c core.bare=true stash", "git --config-env core.worktree=W stash", "git -c include.path=/x stash",
    "git --git-dir=/x/.git stash", "git --work-tree=/x checkout -- a.ts", "git --no-pager stash",
    "sh -c 'cd x && git stash'", "bash -c \"git checkout -- a.ts\"", "eval 'git stash'", "ssh host git stash", "echo ok && sh -c 'git restore a.ts'",
    "find . -exec git checkout -- {} ;", "xargs git checkout --", "echo $(git stash)", "echo `git restore a.ts`", "git stash $(echo)", "git checkout -- $F",
    "watch git stash", "nohup git stash", "timeout 5 git stash", "sh <<EOF\ngit stash\nEOF",
    "git checkout -- a.ts\ngit stash", "git alias-co -- a.ts git restore",
    // ヒアドキュメントの終端の後ろに続く・閉じていない・gh api の書き込み
    "cat <<EOF > f\nbody\nEOF\ngit stash", "cat <<EOF\nunterminated\ngit stash", "echo \"a << b\"\ngit restore a.ts", "gh api -X PUT repos/o/r/pulls/3/merge && git stash",
    "git -C ../wt log --grep=stash", "git config x.y z && git stash",
    // 5 回目: 引用符・コメントの中の << で続く行を隠す形
    "echo \"<<EOF\"\ngit stash\nEOF", "# <<EOF\ngit checkout -- .\nEOF", "echo '$(cat <<EOF'\ngit stash\nEOF", "# $(cat <<EOF\ngit stash\nEOF",
  ];
  for (const command of forms) {
    test(command.replaceAll("\n", "\\n"), async () => {
      const r = await decide(command, { dirty: "no" });
      assert.equal(r.ask, true, "聞かずに通った");
    });
  }
  test("コードレビュー 1: シェルが展開する語（{a,b}・~）を含む pathspec は、展開前の文字のままでは確かめられないので聞く", async () => {
    for (const c of ["git checkout -- {a,b}.ts", "git restore {a,b}.ts", "git restore ~/x.ts", "git checkout HEAD -- {a..c}.ts", "git stash push -- {a,b}"]) {
      assert.equal((await decide(c, { dirty: "no" })).ask, true, c);
    }
    // 展開されない形（HEAD~1・stash@{0}・* の glob は git 側の pathspec）は今までどおり確かめる
    assert.equal((await decide("git reset --hard HEAD~1", { dirty: "no" })).ask, false);
    assert.equal((await decide("git checkout -- 'src/*.ts'", { dirty: "yes" })).calls.length, 1);
  });

  test("コードレビュー 5: 未コミットの変更を消しうるほかの git（rm -f・mv -f・checkout-index -f・read-tree --reset・submodule --force・worktree remove -f）は聞く。-f の無い形は通す", async () => {
    for (const c of ["git rm -f a.ts", "git rm --force a.ts", "git rm -rf dir", "git mv -f a b", "git checkout-index -f -a", "git read-tree --reset -u HEAD", "git submodule update --force", "git submodule deinit -f x", "git worktree remove -f ../x", "git worktree remove --force ../x"]) {
      assert.equal((await decide(c, { dirty: "no" })).ask, true, c);
    }
    for (const c of ["git rm a.ts", "git rm --cached a.ts", "git mv a b", "git checkout-index a", "git worktree remove ../x", "git worktree add ../x", "git worktree list", "git submodule status", "git submodule update --init"]) {
      assert.equal((await decide(c, { dirty: "yes" })).ask, false, c);
    }
  });

  test("敵対的レビュー（#612・main からの穴）: checkout のグロブを含む 1 語は、文字どおりに実在しなくても枝とみなさず、パスとして変更を確かめる", async () => {
    // 再レビュー: `:` で始まる魔法の pathspec（`:/a.ts`・`:(icase)A.TS`）も同じ（文字どおりには実在しないが、git はパスとして取り出す）
    // 引用符で包んだ `:(icase)A.TS` も 1 語の魔法の pathspec として変更を確かめる
    const icase = await decide("git checkout ':(icase)A.TS'", { dirty: "yes" });
    assert.equal(icase.ask, true);
    assert.deepEqual(icase.calls, [{ dir: "/w", target: { kind: "paths", paths: [":(icase)A.TS"], scope: "worktree" } }]);
    assert.equal((await decide("git checkout ':(icase)A.TS'", { dirty: "no" })).ask, false);
    for (const w of ["a.t*", "a.t?", "[a].ts", "src/*", ":/a.ts", ":!b.ts"]) {
      const r = await decide(`git checkout ${w}`, { dirty: "yes" });
      assert.equal(r.ask, true, w);
      assert.deepEqual(r.calls, [{ dir: "/w", target: { kind: "paths", paths: [w], scope: "worktree" } }], w);
      assert.equal((await decide(`git checkout ${w}`, { dirty: "no" })).ask, false, w);
    }
  });

  test("PR コメント 1: 理由の文は「追跡外のファイルを上書きします」と「未コミットの変更があります」で分ける", async () => {
    const yes = await decide("git checkout HEAD -- a.ts", { dirty: "yes" });
    assert.match(yes.reason, /未コミットの変更があります/);
    const un = await decide("git checkout HEAD -- a.ts", { dirty: "untracked" });
    assert.equal(un.ask, true);
    assert.match(un.reason, /追跡外のファイルを上書きします/);
    assert.doesNotMatch(un.reason, /未コミットの変更があります/);
  });

  test("再レビュー: mkdir -p <パス> && cat > <パス> << 'EOF' の本文に操作の名前があっても通る（mkdir は作るだけ）。mkdir の後ろの別のコマンドは別に判定する", async () => {
    const body = "mkdir -p /tmp/x && cat > /tmp/x/f << 'EOF'\ngit checkout -- file で戻す\nEOF";
    assert.equal((await decide(body, { dirty: "yes" })).ask, false);
    assert.equal((await decide("mkdir -p x && git checkout -- .", { dirty: "yes" })).ask, true);
    assert.equal((await decide("mkdir -p x && git stash", { dirty: "no" })).ask, true); // 単純でない形は聞く
    assert.equal((await decide(`${body}\ngit checkout -- a.ts`, { dirty: "yes" })).ask, true);
  });

  test("自動レビュー: 引用符の外の $'・$\" は前の文字を問わず読めない引用として、単純でない形に倒す。引用符の中の錨（grep の行末の $）は聞かない。データの heredoc の本文の $'…' は聞かない", async () => {
    for (const c of ["echo x$'a' && git stash", "echo $'a' && git checkout -- ."]) {
      assert.equal((await decide(c, { dirty: "no" })).ask, true, c);
    }
    for (const c of ['git log --oneline | grep -E \'reset$\'', 'git status --short | grep -E "^ M.*checkout\\.mjs$"', 'echo "cost: 5$" && git stash list']) {
      assert.equal((await decide(c, { dirty: "no" })).ask, false, c);
    }
    assert.equal((await decide("git commit -m \"$(cat <<'EOF'\nfix: $'\\n' と git stash の説明\nEOF\n)\"", { dirty: "yes" })).ask, false);
    assert.equal((await decide("git stash $'x'", { dirty: "no" })).ask, true);
  });

  test("#612: --detach・-q を足しても、ほかの選択肢・余分な語・pathspec がある形は今までどおり聞く", async () => {
    for (const c of [
      "git checkout --detach -f abc1234", "git checkout --detach -f", "git checkout -f --detach abc1234", "git switch --detach -f", "git switch -d --discard-changes", "git checkout --detach abc1234 extra", "git checkout --detach -- a.ts", "git checkout -m --detach x",
      "git switch -q -f main", "git switch --detach -f abc1234", "git switch -q --discard-changes main", "git switch --detach abc1234 extra", "git switch -q -C x",
    ]) {
      assert.equal((await decide(c, { dirty: "no" })).ask, true, c);
    }
  });

  test("理由に「形が単純でない」と書く", async () => {
    assert.match((await decide("cd x && git stash")).reason, /形が単純でない/);
  });
});

describe("#612: git -C <リテラルのパス> が 1 つだけの形は、そのパスを作業ツリーとして確かめる", () => {
  test("確かめる形は、-C のパス（cwd からの相対は解決する）で変更を見て、あれば聞き、無ければ通す", async () => {
    const cases = [
      ["git -C ../wt checkout -- a.ts", "/wt", { kind: "paths", paths: ["a.ts"], scope: "worktree" }],
      ["git -C /x/Tasuki-review-591 stash", "/x/Tasuki-review-591", { kind: "all", scope: "any" }],
      ["git -C sub reset --hard", "/w/sub", { kind: "all", scope: "any" }],
      ["git -C /x restore a.ts", "/x", { kind: "paths", paths: ["a.ts"], scope: "worktree" }],
    ];
    for (const [command, dir, target] of cases) {
      const yes = await decide(command, { dirty: "yes" });
      assert.equal(yes.ask, true, command);
      assert.deepEqual(yes.calls, [{ dir, target }], command);
      assert.equal((await decide(command, { dirty: "no" })).ask, false, command);
      assert.match((await decide(command, { dirty: "unknown" })).reason, /確かめられませんでした/, command);
    }
  });

  test("確かめなくてよい形は、-C があっても何も確かめずに通す", async () => {
    for (const c of ["git -C /x/Tasuki-review-591 checkout -q --detach d4aff35f", "git -C ../wt switch -q main", "git -C ../wt worktree list", "git -C /x reset --soft HEAD~1"]) {
      const r = await decide(c, { dirty: "yes" });
      assert.equal(r.ask, false, `${c}: ${r.reason}`);
      assert.deepEqual(r.calls, [], c);
    }
  });

  test("-C の 1 語が実在するパスかどうかは、-C の先で見る（git checkout <path> を枝と取り違えない）", async () => {
    const seen = [];
    const out = await decideDiscardOutput(JSON.stringify({ tool_name: "Bash", cwd: "/w", tool_input: { command: "git -C ../wt checkout a.ts" } }), {
      isDirty: async () => "yes",
      dirExists: () => true,
      exists: (p, dir) => (seen.push([p, dir]), true),
    });
    assert.equal(out?.hookSpecificOutput?.permissionDecision, "ask");
    assert.deepEqual(seen, [["a.ts", "/wt"]]);
  });

  test("敵対的レビュー 1: -C の先が実在するディレクトリでない（グロブ・実在しない場所）なら、変更を確かめられないので聞く", async () => {
    for (const c of ["git -C ../wt-6* checkout a.ts", "git -C ../wt-61? checkout -- a.ts", "git -C ../wt-612[x] stash", "git -C /nonexistent checkout a.ts", "git -C ../wt switch -q main"]) {
      const r = await decide(c, { dirty: "no", dirs: ["/w"] });
      assert.equal(r.ask, true, c);
      assert.match(r.reason, /形が単純でない/, c);
      assert.deepEqual(r.calls, [], c);
    }
    // 実在すれば今までどおり確かめる
    assert.equal((await decide("git -C ../wt checkout -- a.ts", { dirty: "no", dirs: ["/wt"] })).ask, false);
  });

  test("パスが読み切れない・-C が 2 つ以上・ほかの全体の選択肢がある形は、今までどおり聞く", async () => {
    for (const c of [
      "git -C ../a -C b stash", "git -C ~/wt stash", "git -C {a,b} stash", "git -C $W stash", "git -C \"$W\" stash", "git -C ../wt -c core.worktree=/x stash",
      "git -C ../wt --git-dir=/x/.git stash", "git -c x=y -C ../wt stash", "git -C ../wt -- stash", "git -C '' stash",
      "cd ../wt && git -C . stash", "git -C ../wt stash && git -C ../wt stash pop", "GIT_DIR=/x git -C ../wt stash", "git -C ../wt log --grep=stash",
    ]) {
      assert.equal((await decide(c, { dirty: "no" })).ask, true, c);
    }
  });
});

describe("入力の読み方", () => {
  test("Monitor も同じに扱う。シェル以外の道具・読めない入力・command が文字列でないものは null", async () => {
    assert.equal((await decide("git stash", { dirty: "yes", tool: "Monitor" })).ask, true);
    assert.equal((await decide("git stash", { dirty: "yes", tool: "Read" })).ask, false);
    const deps = { isDirty: async () => "yes" };
    assert.equal(await decideDiscardOutput("not json", deps), null);
    assert.equal(await decideDiscardOutput(JSON.stringify({ tool_name: "Bash", tool_input: {} }), deps), null);
  });
});

describe("手順書の正当な形（現物から）", () => {
  const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
  const docs = {
    "docs/guides/procedures/adversarial-review.md": ["git checkout origin/main -- <テストのファイル>", "git checkout HEAD -- <テストのファイル>"],
    "docs/guides/procedures/live-check.md": ["git restore --staged -- <一時ファイル>"],
    "docs/guides/development.md": ["git checkout -- pnpm-lock.yaml <書き換わった package.json>", "git checkout -- pnpm-workspace.yaml pnpm-lock.yaml"],
  };
  // 変更があっても聞かない戻し方（#603: mutations.md は git checkout -- をやめ、作ったパッチを git apply -R で逆に当てる）
  const passing = {
    "docs/guides/procedures/mutations.md": ["git apply -R scripts/mutations/m<ID>-<短い名前>.patch"],
    "docs/guides/procedures/adversarial-review.md": ["git apply -R <作業ツリーの外>/break.patch"],
  };
  test("手順書にいまもその行がある（表が古びたら赤にする）", () => {
    for (const [rel, lines] of Object.entries({ ...docs, ...passing })) for (const line of lines) assert.ok(read(rel).includes(line), `${rel}: ${line}`);
  });
  test("手順書の git apply -R の戻し方は、変更があっても聞かない（#603）", async () => {
    for (const line of Object.values(passing).flat()) {
      const command = line.replace(/<[^>]+>/g, "x");
      assert.equal((await decide(command, { dirty: "yes" })).ask, false, command);
    }
  });
  test("取り出し・復元は、変更が無ければ通り、作業ツリーに未コミットの変更があれば聞く。--staged だけの外しは通る", async () => {
    for (const line of Object.values(docs).flat().filter((l) => !l.includes("--staged"))) {
      const command = line.replace(/<[^>]+>/g, "x.ts");
      assert.equal((await decide(command, { dirty: "no" })).ask, false, command);
      assert.equal((await decide(command, { dirty: "yes" })).ask, true, command);
    }
    assert.equal((await decide("git restore --staged -- x.ts", { dirty: "yes" })).ask, false);
  });
});

describe("defaultIsDirty: 実際の git で", () => {
  const git = (cwd, ...a) => execFileSync("git", a, { cwd, stdio: "pipe", encoding: "utf8" });
  function repo(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "discard-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    git(dir, "init", "-q");
    git(dir, "config", "user.email", "t@example.com");
    git(dir, "config", "user.name", "t");
    fs.writeFileSync(path.join(dir, "a.ts"), "1");
    fs.writeFileSync(path.join(dir, "b.ts"), "1");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "init");
    return dir;
  }
  const wt = (paths) => ({ kind: "paths", paths, scope: "worktree" });

  test("対象のパスだけを見る。きれいなら no、触ったパスなら yes、全体なら yes", async (t) => {
    const dir = repo(t);
    assert.equal(await defaultIsDirty(dir, wt(["a.ts"])), "no");
    assert.equal(await defaultIsDirty(dir, { kind: "all", scope: "any" }), "no");
    fs.writeFileSync(path.join(dir, "a.ts"), "2");
    assert.equal(await defaultIsDirty(dir, wt(["a.ts"])), "yes");
    assert.equal(await defaultIsDirty(dir, wt(["b.ts"])), "no");
    assert.equal(await defaultIsDirty(dir, wt(["."])), "yes");
    assert.equal(await defaultIsDirty(dir, { kind: "all", scope: "any" }), "yes");
  });

  test("手順書の往復: checkout origin/main -- でステージ済みになった変更は、作業ツリーの変更ではない（HEAD へ戻す 2 回目を止めない）。stash は見る", async (t) => {
    const dir = repo(t);
    fs.writeFileSync(path.join(dir, "a.ts"), "2");
    git(dir, "add", "a.ts"); // checkout <rev> -- path の後と同じ状態（index と作業ツリーが同じ）
    assert.equal(await defaultIsDirty(dir, wt(["a.ts"])), "no");
    assert.equal(await defaultIsDirty(dir, { kind: "all", scope: "any" }), "yes");
    fs.writeFileSync(path.join(dir, "a.ts"), "3"); // さらに作業ツリーだけ変えた
    assert.equal(await defaultIsDirty(dir, wt(["a.ts"])), "yes");
  });

  test("PR コメント 1: 追跡外のファイルを数えるのは rev つきの形だけ（rev の無い checkout -- ・restore は index から戻すので触れない）。ignore されたものは数えない", async (t) => {
    const dir = repo(t);
    fs.writeFileSync(path.join(dir, ".gitignore"), "ign.ts\n");
    git(dir, "add", ".gitignore");
    git(dir, "commit", "-qm", "ig");
    fs.writeFileSync(path.join(dir, "new.ts"), "x");
    fs.writeFileSync(path.join(dir, "ign.ts"), "x");
    const rev = (paths) => ({ ...wt(paths), withRev: true });
    assert.equal(await defaultIsDirty(dir, rev(["new.ts"])), "untracked");
    assert.equal(await defaultIsDirty(dir, wt(["new.ts"])), "no");
    assert.equal(await defaultIsDirty(dir, wt(["."])), "no");
    assert.equal(await defaultIsDirty(dir, rev(["ign.ts"])), "no");
    assert.equal(await defaultIsDirty(dir, rev(["a.ts"])), "no");
    fs.writeFileSync(path.join(dir, "a.ts"), "2");
    assert.equal(await defaultIsDirty(dir, rev(["a.ts", "new.ts"])), "yes"); // 追跡下の変更が先
  });

  test("追跡していない新規ファイルは、-u の stash だけが対象", async (t) => {
    const dir = repo(t);
    fs.writeFileSync(path.join(dir, "new.ts"), "x");
    assert.equal(await defaultIsDirty(dir, { kind: "all", scope: "any" }), "no");
    assert.equal(await defaultIsDirty(dir, { kind: "all", scope: "any", untracked: true }), "yes");
  });

  test("not a git repository は no。それ以外の 128（壊れた設定）と、無い場所は確かめられなかった", async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "discard-nogit-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    assert.equal(await defaultIsDirty(dir, { kind: "all", scope: "any" }, { GIT_CEILING_DIRECTORIES: path.dirname(dir) }), "no");
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "discard-home-"));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    fs.writeFileSync(path.join(home, ".gitconfig"), "[core\n");
    const repoDir = repo(t);
    assert.equal(await defaultIsDirty(repoDir, { kind: "all", scope: "any" }, { GIT_CONFIG_GLOBAL: path.join(home, ".gitconfig") }), "unknown");
    assert.equal(await defaultIsDirty(path.join(dir, "missing"), { kind: "all", scope: "any" }), "unknown");
  });
});
