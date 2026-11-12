/**
 * 脅威の範囲（docs/adr/0037）: サブエージェントの操作と未コミットの変更を消す操作の歯止めは、**協力的なエージェントの事故を止めるもの**で、
 * 悪意への境界ではない（docs/adr/0032 の限界と同じ。最後の壁は資格情報がエージェントの環境に無いこと）。誤って聞くのは許容し、
 * 協力的なエージェントが実際に書きうる形で誤って通すのを無くす。意図的な回避（sed の e・w コマンド、git の --upload-pack や -c で
 * 別のプログラムを走らせる形）は範囲外。指摘をこの基準で振り分ける。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  GUARDED_COMMANDS,
  SHELL_TOOLS,
  SUBAGENT_GUARDED_COMMANDS,
  findGuardedCommands,
  findCommandsMatching,
  findSubagentCommands,
  decideHookOutput,
  decideSubagentOutput,
  isTameCommand,
  hasUnreadableQuote,
  stripHeredocBodies,
  mentionsSubagentOperation,
  mentionsDiscardOperation,
  mentionsGuardedOperation,
} from "./agent-guard.mjs";

/** 当たった宣言の id を並べる（順序は出現順）。 */
function ids(command) {
  return findGuardedCommands(command).map((h) => h.id);
}

describe("GUARDED_COMMANDS: 宣言の形", () => {
  test("id は重複せず、どれも理由（why）と当て方（script か program）を持つ", () => {
    const seen = new Set();
    for (const g of GUARDED_COMMANDS) {
      assert.ok(!seen.has(g.id), `id が重複しています: ${g.id}`);
      seen.add(g.id);
      assert.equal(typeof g.why, "string");
      assert.ok(g.why.length > 0);
      assert.ok(("script" in g) !== ("program" in g), `${g.id}: script と program のどちらか 1 つだけを持つ`);
    }
  });

  test("ISSUE #490 が名指しした 3 つ（deploy.sh・systemctl・Caddy の reload）が宣言にある", () => {
    assert.ok(GUARDED_COMMANDS.some((g) => g.script === "deploy/deploy.sh"));
    assert.ok(GUARDED_COMMANDS.some((g) => g.program === "systemctl"));
    assert.ok(GUARDED_COMMANDS.some((g) => g.program === "caddy" && g.subcommands?.includes("reload")));
  });
});

describe("findGuardedCommands: 素直な呼び方", () => {
  test("deploy.sh を、リポジトリ直下からの相対・./・絶対パス・cd した先から呼ぶと当たる", () => {
    assert.deepEqual(ids("./deploy/deploy.sh timer"), ["deploy-script"]);
    assert.deepEqual(ids("deploy/deploy.sh timer"), ["deploy-script"]);
    assert.deepEqual(ids("/home/u/tasuki-tools/deploy/deploy.sh timer"), ["deploy-script"]);
    assert.deepEqual(ids("cd deploy && ./deploy.sh timer"), ["deploy-script"]);
  });

  test("環境変数を前に置いても当たる（DRY_RUN=1 も含めて人に聞く）", () => {
    assert.deepEqual(ids("TASUKI_SSH_HOST=prod ./deploy/deploy.sh timer"), ["deploy-script"]);
    assert.deepEqual(ids("DRY_RUN=1 ./deploy/deploy.sh timer"), ["deploy-script"]);
  });

  test("systemctl はどの下位コマンドでも当たる。絶対パスでも当たる", () => {
    assert.deepEqual(ids("systemctl restart tasuki-sync"), ["systemctl"]);
    assert.deepEqual(ids("systemctl status tasuki-sync"), ["systemctl"]);
    assert.deepEqual(ids("/usr/bin/systemctl reload caddy"), ["systemctl"]);
  });

  test("caddy は reload と stop だけが当たり、version・validate・fmt は当たらない", () => {
    assert.deepEqual(ids("caddy reload --config /etc/caddy/Caddyfile"), ["caddy-reload"]);
    assert.deepEqual(ids("caddy stop"), ["caddy-reload"]);
    assert.deepEqual(ids("caddy version"), []);
    assert.deepEqual(ids("caddy validate --config deploy/caddy/site.conf"), []);
    assert.deepEqual(ids("caddy fmt --overwrite deploy/caddy/site.conf"), []);
  });

  test("setup.sh・firewall の規則も本番を書き換えるので当たる", () => {
    assert.deepEqual(ids("sudo DEPLOY_USER=me bash deploy/setup.sh timer"), ["setup-script"]);
    assert.deepEqual(ids("sudo deploy/firewall/connlimit.sh apply"), ["firewall-script"]);
  });

  test("service コマンド（systemctl の古い入口）も当たる", () => {
    assert.deepEqual(ids("service caddy reload"), ["service"]);
  });
});

describe("findGuardedCommands: 包んだ呼び方（事故で踏みやすい形）", () => {
  test("sudo・env・nohup・timeout・nice・command・exec で包んでも当たる", () => {
    assert.deepEqual(ids("sudo systemctl restart tasuki-sync"), ["systemctl"]);
    assert.deepEqual(ids("sudo -u root -- systemctl restart tasuki-sync"), ["systemctl"]);
    assert.deepEqual(ids("env -i PATH=/usr/bin systemctl restart x"), ["systemctl"]);
    assert.deepEqual(ids("nohup ./deploy/deploy.sh timer"), ["deploy-script"]);
    assert.deepEqual(ids("timeout -s KILL 30 systemctl restart x"), ["systemctl"]);
    assert.deepEqual(ids("nice -n 10 caddy reload"), ["caddy-reload"]);
    assert.deepEqual(ids("command systemctl restart x"), ["systemctl"]);
    assert.deepEqual(ids("exec systemctl restart x"), ["systemctl"]);
  });

  test("シェルにスクリプトとして渡しても、-c で文字列として渡しても当たる", () => {
    assert.deepEqual(ids("bash deploy/deploy.sh timer"), ["deploy-script"]);
    assert.deepEqual(ids("sh -x ./deploy/deploy.sh timer"), ["deploy-script"]);
    assert.deepEqual(ids("bash -c 'systemctl restart tasuki-sync'"), ["systemctl"]);
    assert.deepEqual(ids("bash -lc \"cd deploy && ./deploy.sh timer\""), ["deploy-script"]);
    assert.deepEqual(ids("source deploy/deploy.sh"), ["deploy-script"]);
    assert.deepEqual(ids(". deploy/deploy.sh"), ["deploy-script"]);
  });

  test("ssh の先で走らせるコマンドも読む", () => {
    assert.deepEqual(ids("ssh -p 2222 prod sudo systemctl restart tasuki-sync"), ["systemctl"]);
    assert.deepEqual(ids("ssh prod 'sudo caddy reload --config /etc/caddy/Caddyfile'"), ["caddy-reload"]);
  });

  test("eval・xargs・find -exec・watch の先も読む", () => {
    assert.deepEqual(ids("eval 'systemctl restart x'"), ["systemctl"]);
    assert.deepEqual(ids("echo tasuki-sync | xargs -n 1 systemctl restart"), ["systemctl"]);
    assert.deepEqual(ids("find deploy -name deploy.sh -exec {} timer \\;"), []);
    assert.deepEqual(ids("find /etc -name x -exec systemctl restart {} \\;"), ["systemctl"]);
    assert.deepEqual(ids("watch -n 5 systemctl status x"), ["systemctl"]);
  });

  test("区切り（; && || | 改行 & サブシェル）の後ろのコマンドも読む", () => {
    assert.deepEqual(ids("pnpm build; ./deploy/deploy.sh timer"), ["deploy-script"]);
    assert.deepEqual(ids("pnpm build || systemctl restart x"), ["systemctl"]);
    assert.deepEqual(ids("pnpm build\nsystemctl restart x"), ["systemctl"]);
    assert.deepEqual(ids("(cd deploy && ./deploy.sh timer) &"), ["deploy-script"]);
    assert.deepEqual(ids("if true; then systemctl restart x; fi"), ["systemctl"]);
    assert.deepEqual(ids("{ systemctl restart x; }"), ["systemctl"]);
  });

  test("コマンド置換・プロセス置換の中も読む", () => {
    assert.deepEqual(ids("echo $(systemctl restart x)"), ["systemctl"]);
    assert.deepEqual(ids('echo "result: $(caddy reload)"'), ["caddy-reload"]);
    assert.deepEqual(ids("echo `systemctl restart x`"), ["systemctl"]);
    assert.deepEqual(ids("diff <(systemctl cat x) y"), ["systemctl"]);
  });

  test("引用符・バックスラッシュで綴りを割っても当たる", () => {
    assert.deepEqual(ids("'systemctl' restart x"), ["systemctl"]);
    assert.deepEqual(ids('"./deploy/deploy.sh" timer'), ["deploy-script"]);
    assert.deepEqual(ids("sys\\temctl restart x"), ["systemctl"]);
    assert.deepEqual(ids("'cad'dy reload"), ["caddy-reload"]);
  });

  test("リダイレクトを挟んでも下位コマンドを読み違えない", () => {
    assert.deepEqual(ids("caddy 2>&1 reload"), ["caddy-reload"]);
    assert.deepEqual(ids("systemctl restart x > /tmp/log 2>&1"), ["systemctl"]);
  });

  test("1 行に 2 つあれば 2 つとも返す", () => {
    assert.deepEqual(ids("./deploy/deploy.sh timer && sudo systemctl reload caddy"), ["deploy-script", "systemctl"]);
  });
});

describe("findGuardedCommands: PR #498 のレビューで見つかった取りこぼし", () => {
  test("短い選択肢をまとめた形（-iu root）でも、値を読み飛ばして当てる（レビュー 1）", () => {
    assert.deepEqual(ids("sudo -iu root systemctl restart x"), ["systemctl"]);
    assert.deepEqual(ids("sudo -su root systemctl restart x"), ["systemctl"]);
    assert.deepEqual(ids("sudo -Eu root ./deploy/deploy.sh timer"), ["deploy-script"]);
    assert.deepEqual(ids("ionice -c2 -n7 nice -n 5 systemctl restart x"), ["systemctl"]);
  });

  test("値をつなげて書く形（-uroot）は、その語の残りが値で、次の語はコマンドとして読む（再レビュー 1）", () => {
    assert.deepEqual(ids("sudo -uroot systemctl restart tasuki"), ["systemctl"]);
    assert.deepEqual(ids("sudo -uubuntu systemctl restart tasuki"), ["systemctl"]);
    assert.deepEqual(ids("sudo -iuroot systemctl restart tasuki"), ["systemctl"]);
    assert.deepEqual(ids("sudo -uadmin ./deploy/deploy.sh timer"), ["deploy-script"]);
    assert.deepEqual(ids("timeout -sKILL 10 systemctl restart x"), ["systemctl"]);
  });

  test("su・runuser・pkexec で権限を変えて走らせても当てる（レビュー 3）", () => {
    assert.deepEqual(ids("su -c 'systemctl restart tasuki'"), ["systemctl"]);
    assert.deepEqual(ids("su root -c 'systemctl restart tasuki'"), ["systemctl"]);
    assert.deepEqual(ids("su - root -c './deploy/deploy.sh timer'"), ["deploy-script"]);
    assert.deepEqual(ids("runuser -u root -- systemctl restart tasuki"), ["systemctl"]);
    assert.deepEqual(ids("runuser -l root -c 'caddy reload'"), ["caddy-reload"]);
    assert.deepEqual(ids("pkexec systemctl restart tasuki"), ["systemctl"]);
    assert.deepEqual(ids("pkexec --user root systemctl restart tasuki"), ["systemctl"]);
  });

  test("env の --split-string= の形も読み直す（レビュー 3）", () => {
    assert.deepEqual(ids("env --split-string='systemctl restart x'"), ["systemctl"]);
  });

  test("command -v / -V は場所を調べるだけなので当てない。command だけなら当てる（レビュー 5）", () => {
    assert.deepEqual(ids("command -v systemctl"), []);
    assert.deepEqual(ids("command -V caddy reload"), []);
    assert.deepEqual(ids("command -p systemctl restart x"), ["systemctl"]);
  });
});

describe("findGuardedCommands: 当てないもの（読むだけ・名前を口にするだけ）", () => {
  test("引数として名前が出るだけのコマンドは当てない", () => {
    assert.deepEqual(ids("cat deploy/deploy.sh"), []);
    assert.deepEqual(ids("grep -n systemctl deploy/README.md"), []);
    assert.deepEqual(ids("git diff -- deploy/deploy.sh"), []);
    assert.deepEqual(ids("shellcheck -x deploy/deploy.sh"), []);
    assert.deepEqual(ids("echo 'caddy reload'"), []);
    assert.deepEqual(ids("man systemctl"), []);
  });

  test("リダイレクトの先に名前があっても当てない", () => {
    assert.deepEqual(ids("echo hi > systemctl"), []);
  });

  test("コメントの中は当てない", () => {
    assert.deepEqual(ids("pnpm test # 終わったら systemctl restart する"), []);
  });

  test("空の入力・空白だけの入力は何も返さない", () => {
    assert.deepEqual(ids(""), []);
    assert.deepEqual(ids("   \n  "), []);
  });
});

describe("findGuardedCommands: 読み切れないときは当てる側に倒す", () => {
  test("入れ子が深すぎる文字列は、読めなかったとして当てる", () => {
    let cmd = "echo hi";
    for (let i = 0; i < 12; i += 1) cmd = `bash -c ${JSON.stringify(cmd)}`;
    assert.deepEqual(ids(cmd), ["unreadable"]);
  });
});

describe("decideHookOutput: Claude Code の PreToolUse フックの返し方", () => {
  test("Bash で宣言に当たれば ask を返し、理由に当たったものと AGENTS.md を書く", () => {
    const out = decideHookOutput(JSON.stringify({ tool_name: "Bash", tool_input: { command: "sudo systemctl restart tasuki-sync" } }));
    assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /systemctl/);
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /AGENTS\.md/);
  });

  test("Bash で宣言に当たらなければ何も返さない（ほかの許可の仕組みに任せる）", () => {
    assert.equal(decideHookOutput(JSON.stringify({ tool_name: "Bash", tool_input: { command: "pnpm test" } })), null);
  });

  test("Bash 以外でもシェルのコマンド（tool_input.command）を走らせる道具は同じく判定する（Monitor。レビュー 2）", () => {
    const out = decideHookOutput(JSON.stringify({ tool_name: "Monitor", tool_input: { command: "systemctl restart tasuki" } }));
    assert.equal(out?.hookSpecificOutput?.permissionDecision, "ask");
    assert.equal(decideHookOutput(JSON.stringify({ tool_name: "Monitor", tool_input: { command: "tail -f log" } })), null);
  });

  test("Monitor の WebSocket の形（command が無く ws がある）はシェルを走らせないので見ない（再レビュー 3）", () => {
    assert.equal(decideHookOutput(JSON.stringify({ tool_name: "Monitor", tool_input: { ws: { url: "wss://x" } } })), null);
    // command も ws も無い Monitor は読めないとして聞く
    assert.equal(decideHookOutput(JSON.stringify({ tool_name: "Monitor", tool_input: {} }))?.hookSpecificOutput?.permissionDecision, "ask");
  });

  test("SHELL_TOOLS は Bash と Monitor を含む", () => {
    assert.ok(SHELL_TOOLS.includes("Bash"));
    assert.ok(SHELL_TOOLS.includes("Monitor"));
  });

  test("Bash 以外の道具は見ない", () => {
    assert.equal(decideHookOutput(JSON.stringify({ tool_name: "Read", tool_input: { file_path: "deploy/deploy.sh" } })), null);
  });

  test("入力が読めない・command が文字列でないときは ask に倒す", () => {
    for (const raw of ["", "not json", JSON.stringify({ tool_name: "Bash", tool_input: {} }), JSON.stringify(null)]) {
      const out = decideHookOutput(raw);
      assert.equal(out?.hookSpecificOutput?.permissionDecision, "ask", `入力 ${JSON.stringify(raw)}`);
    }
  });
});

describe("args の宣言（先行 PR の確認で使う。#504）", () => {
  const decls = [{ id: "pr-create", program: "gh", args: ["pr", "create"], argOpts: ["-R", "--repo"] }];
  const match = (c) => findCommandsMatching(c, decls);

  test("選択肢を除いた最初の語から並ぶ gh pr create だけに当たる（引数の中の並びには当てない）", () => {
    assert.equal(match("gh pr create --title x").length, 1);
    assert.equal(match("gh -R a/b pr create").length, 1);
    assert.equal(match("gh --repo a/b pr create").length, 1);
    for (const c of ["gh issue list --search pr create", "gh issue list --search 'pr create'", "gh search prs pr create", "gh pr list", "gh pr"]) {
      assert.equal(match(c).length, 0, c);
    }
  });

  test("同じコマンドを繰り返しても、語の並びが同じなら 1 つにまとめる。違えば別々に返す", () => {
    assert.equal(match("gh pr create --title a; gh pr create --title a").length, 1);
    assert.equal(match("gh pr create --title a; gh pr create --title b").length, 2);
  });

  test("当たりは語の並び（words）を持つ", () => {
    assert.deepEqual(match("gh pr create -t x")[0].words, ["gh", "pr", "create", "-t", "x"]);
  });
});

describe("サブエージェントの危ない操作（#578・docs/adr/0037）", () => {
  const sub = (c) => findSubagentCommands(c).map((h) => h.id);

  test("宣言: id は重複せず、どれも理由と program を持つ", () => {
    const seen = new Set();
    for (const g of SUBAGENT_GUARDED_COMMANDS) {
      assert.ok(!seen.has(g.id), g.id);
      seen.add(g.id);
      assert.ok(g.why && g.program, g.id);
    }
  });

  test("git push・gh pr merge|close・git reset --hard・git worktree remove・kill 系に当たる", () => {
    assert.deepEqual(sub("git push origin HEAD"), ["git-push"]);
    assert.deepEqual(sub("git -C ../wt push --force-with-lease"), ["git-push"]);
    assert.deepEqual(sub("cd x && git -c core.x=y push"), ["git-push"]);
    assert.deepEqual(sub("gh pr merge 12 --squash"), ["gh-pr-merge"]);
    assert.deepEqual(sub("gh -R a/b pr close 3"), ["gh-pr-close"]);
    assert.deepEqual(sub("git reset --hard origin/main"), ["git-reset-hard"]);
    assert.deepEqual(sub("git worktree remove ../wt"), ["git-worktree-remove"]);
    assert.deepEqual(sub("kill -9 123"), ["kill"]);
    assert.deepEqual(sub("sudo pkill -f vite"), ["pkill"]);
    assert.deepEqual(sub("killall node"), ["killall"]);
  });

  test("枝の切り替え（switch と、-- の無い checkout）に当たる。-- 付きのファイル取り出しは枝の切り替えではない", () => {
    assert.deepEqual(sub("git switch main"), ["git-switch"]);
    assert.deepEqual(sub("git checkout main"), ["git-checkout-branch"]);
    assert.deepEqual(sub("git checkout -b new"), ["git-checkout-branch"]);
    assert.deepEqual(sub("git checkout origin/main -- a.test.ts"), []);
    assert.deepEqual(sub("git checkout -- a.ts"), []);
  });

  test("当てない: 読むだけのコマンド・名前を口にするだけ・別の下位コマンド", () => {
    for (const c of [
      "git status", "git log --oneline", "git reset --soft HEAD~1", "git reset HEAD a.ts", "git worktree list", "git worktree add ../x -b y",
      "gh pr view 3", "gh pr list", "gh pr create --title x", "grep 'git push' docs/a.md", "echo kill", "cat kill.txt", "git push-helper",
    ]) {
      assert.deepEqual(sub(c), [], c);
    }
  });

  test("すり抜け: reset --hard の長いオプションの省略形（git は --h・--ha・--har も --hard と読む）", () => {
    for (const o of ["--h", "--ha", "--har", "--hard"]) assert.deepEqual(sub(`git reset ${o} HEAD~1`), ["git-reset-hard"], o);
    assert.deepEqual(sub("git reset --soft HEAD~1"), []);
    assert.deepEqual(sub("git reset --mixed"), []);
    // -- より後ろはパス。--hard という名前のファイルは対象外
    assert.deepEqual(sub("git reset HEAD -- --hard"), []);
  });

  test("すり抜け: checkout の判定は -- の後ろに pathspec があるときだけファイルの取り出し", () => {
    assert.deepEqual(sub("git checkout main --"), ["git-checkout-branch"]);
    assert.deepEqual(sub("git checkout -b feat -- a.ts"), ["git-checkout-branch"]);
    assert.deepEqual(sub("git checkout -B feat origin/main -- a.ts"), ["git-checkout-branch"]);
    assert.deepEqual(sub("git checkout --orphan x -- a.ts"), ["git-checkout-branch"]);
    assert.deepEqual(sub("git checkout --orph x -- a.ts"), ["git-checkout-branch"]);
    assert.deepEqual(sub("git checkout --detach origin/main"), ["git-checkout-branch"]);
    assert.deepEqual(sub("git checkout --deta origin/main -- "), ["git-checkout-branch"]);
    assert.deepEqual(sub("git checkout -d origin/main"), ["git-checkout-branch"]);
    assert.deepEqual(sub("git checkout origin/main -- a.ts"), []);
    assert.deepEqual(sub("git checkout HEAD -- a.ts b.ts"), []);
  });

  test("すり抜け: 値を別の語に取るグローバルオプション（git --help の一覧）をサブコマンドと読み違えない", () => {
    for (const g of [
      "-C ../wt", "-c core.x=y", "--git-dir .git", "--git-dir=.git", "--work-tree .", "--work-tree=.", "--namespace ns", "--namespace=ns",
      "--config-env a.b=HOME", "--config-env=a.b=HOME", "--attr-source HEAD", "--attr-source=HEAD", "--no-pager", "-p", "--exec-path=/x", "--bare",
    ]) {
      assert.deepEqual(sub(`git ${g} push origin x`), ["git-push"], g);
      assert.deepEqual(sub(`git ${g} switch main`), ["git-switch"], g);
      assert.deepEqual(sub(`git ${g} worktree remove ../x`), ["git-worktree-remove"], g);
      assert.deepEqual(sub(`git ${g} reset --hard`), ["git-reset-hard"], g);
    }
  });

  test("すり抜け: 包むコマンド・引用符・環境変数・入れ子を経ても当たる（共通の読み方）", () => {
    for (const c of [
      "sudo git push", "env GIT_DIR=.git git push", "GIT_SSH_COMMAND=x git push", "command git push", "timeout 5 git push", "bash -c 'git push origin x'",
      "sh -c \"cd x && git push\"", "eval 'git push'", "echo ok; git 'push'", "git \"push\"", "\\git push", "echo $(git push)", "xargs git push", "true && git push || true",
      "git push\n", "ssh host git push",
    ]) assert.deepEqual(sub(c), ["git-push"], c);
    for (const c of ["sudo xargs kill", "timeout 3 pkill -f x", "bash -c 'kill 1'", "find . -exec kill {} ;", "nohup killall node &"]) assert.equal(sub(c).length, 1, c);
  });

  test("すり抜け: gh の -R / --repo は --opt 値 と --opt=値 の両形", () => {
    for (const g of ["-R a/b", "--repo a/b", "--repo=a/b", "-Ra/b"]) {
      assert.deepEqual(sub(`gh ${g} pr merge 3`), ["gh-pr-merge"], g);
      assert.deepEqual(sub(`gh ${g} pr close 3`), ["gh-pr-close"], g);
    }
  });

  test("迷う形は聞く: 危ない操作の名前が出るのに宣言で読み切れない形（変数・別名・入れ子）は、サブエージェントでは ask", () => {
    const askSub = (c) => decideHookOutput(JSON.stringify({ tool_name: "Bash", agent_id: "a1", tool_input: { command: c } }))?.hookSpecificOutput?.permissionDecision;
    for (const c of [
      'eval "$(echo git push)"', "git -c alias.p=push p origin", "a=push; git $a origin", "x=$(echo kill); $x 1; kill $PID2",
      "git checkout -b x -- a.ts", "git reset --merge", "git worktree prune && git worktree remove x", "cat x | xargs -I{} sh -c 'git push {}'",
      "sh -c \"$CMD && git push\"", "git switch -", "git checkout $BRANCH", "git checkout -- ", "git -C x checkout main", "env GIT_DIR=x git reset --hard",
    ]) assert.equal(askSub(c), "ask", c);
  });

  test("迷う形は聞く、ただし読むだけ・記録するだけの語と単純な安全な形は通す（誤検出を避ける）", () => {
    const askSub = (c) => decideHookOutput(JSON.stringify({ tool_name: "Bash", agent_id: "a1", tool_input: { command: c } }))?.hookSpecificOutput?.permissionDecision ?? null;
    for (const c of [
      "git checkout origin/main -- a.test.ts", "git checkout HEAD -- a.ts b.ts", "git checkout -- a.ts", "git commit -m 'fix push'", 'echo "git push"',
      "grep -rn kill docs", "git commit -m \"$(cat <<'EOF'\nfix: push handling\nEOF\n)\"", "git log --grep=reset", "gh pr create --body 'close the loop, merge it'",
      "git reset HEAD~1", "git reset --soft HEAD~1", "git worktree add ../x -b fix/reset", "git worktree list", "git status && git diff | head", "git stash list",
      "sed -n '1,5p' push.md", "find . -name '*kill*'", "git branch -a",
    ]) assert.equal(askSub(c), null, c);
  });

  test("tame の穴（4 回目のレビュー）: ヒアドキュメントの終端の後ろのコマンド・gh api の書き込み・git の全体の選択肢と書き込み・sed の e/w/-f は「読むだけ」に数えない", () => {
    for (const c of [
      "cat <<EOF > f\nbody\nEOF\ngit push", "cat <<'EOF'\nx\nEOF\ngit push origin x", "cat <<EOF\nunterminated\ngit push",
      "echo \"a << b\"\ngit push origin x", "git commit -m \"$(cat <<'EOF'\nx\nEOF\n)\" && git push",
      "gh api -X PUT repos/o/r/pulls/3/merge", "gh api repos/o/r/pulls/3/merge -X PUT", "gh api --method PUT repos/o/r/pulls/3/merge", "gh api -XPUT repos/o/r/pulls/3/merge",
      "gh api repos/o/r/pulls/3/merge -f merge_method=squash", "gh api graphql -F query=@q.graphql", "gh api x --input body.json", "gh pr merge 3", "gh -R a/b pr close 3",
      "gh repo delete x", "gh workflow run x.yml", "gh alias set x 'pr merge'",
      "git -c core.sshCommand=x log", "git config push.default simple", "git -C ../wt log --grep=push", "git apply x.patch", "git --no-pager log",
      // 5 回目: 引用符・コメントの中の << を本文の始まりと拾い、続く行を隠す形（飛ばしたテキストに危ない操作の名前があれば読めない）
      "echo \"<<EOF\"\ngit stash\nEOF", "# <<EOF\ngit checkout -- .\nEOF", "echo '<<EOF'\ngit push origin x\nEOF", "echo \"<<EOF\"\nkill 1\nEOF",
      // gh の短い選択肢の束・未知の選択肢
      "gh api -XPUT repos/o/r/pulls/3/merge", "gh api -fmerge_method=squash repos/o/r/pulls/3/merge", "gh pr view 3 -Ra/b", "gh pr view 3 --unknown-flag", "gh pr list -vS x", "gh issue list --merge-it",
      "sed -n 'w out.txt' f.md", "sed -i s/push/x/ f.md", "sed -f script.sed f.md", "sed 's/push/x/e' f.md", "sed -n '1e git push' f.md", "sed 's/a/b/' f.md", "sed --expression=p f.md",
    ]) assert.equal(isTameCommand(c), false, c);
    // 協力的なエージェントが書く、読む・印字する形は通す
    for (const c of ["gh api repos/o/r/pulls/3", "gh api -X GET repos/o/r/pulls", "gh api --method=GET repos/o/r/pulls", "gh pr view 3 --json state", "gh pr list --search 'close merge'",
      "gh -R a/b pr create --title x", "gh issue comment 5 --body 'closed by push'", "sed -n '1,5p' push.md", "sed -n '/kill/p' f.md", "sed -n '$p' f.md",
      "git fetch origin && git log --oneline origin/main..HEAD", "cat <<EOF > f\nbody about push\nEOF", "git commit -m \"$(cat <<'EOF'\nfix: push\nEOF\n)\""]) assert.equal(isTameCommand(c), true, c);
    // 終端の後ろのコマンドは、サブエージェントでは宣言にも当たって ask
    const askSub = (c) => decideHookOutput(JSON.stringify({ tool_name: "Bash", agent_id: "a1", tool_input: { command: c } }))?.hookSpecificOutput?.permissionDecision ?? null;
    assert.equal(askSub("cat <<EOF > f\nbody\nEOF\ngit push"), "ask");
    assert.equal(askSub("cat <<EOF > f\nbody about push\nEOF"), null);
  });

  test("I2: 本文を隠すのは決まった形（git commit -m / gh pr|issue … --body の \"$(cat <<'TAG' … TAG\n)\"）だけ。ほかの heredoc は本文に危ない操作の名前があれば tame でない", () => {
    for (const c of [
      "git add scripts && git commit -m \"$(cat <<'EOF'\nfix: git checkout の判定を直す\n\n- git reset --hard の省略形\nEOF\n)\"",
      "git commit -m \"$(cat <<'EOF'\nfix: git push の判定\nEOF\n)\"",
      "gh pr create --title x --body \"$(cat <<'EOF'\n## 概要\ngit push と git stash を止める。gh pr merge も\nEOF\n)\"",
      "gh issue comment 3 --body \"$(cat <<'MSG'\ngit worktree remove と kill の話\nMSG\n)\"",
    ]) assert.equal(isTameCommand(c), true, c);
    for (const c of [
      "bash <<EOF\ngit push origin x\nEOF", "sh <<'EOF'\ngit stash\nEOF", "cat <<'EOF' | sh\ngit push\nEOF",
      "git commit -m \"$(cat <<-'EOF'\n\tgit stash の説明\n\tEOF\n)\"",
      "gh issue comment 3 --body \"$(cat <<\"EOF\"\ngit worktree remove と kill の話\nEOF\n)\"",
      "git commit -m \"$(cat <<EOF\nfix: $(git push) だ git push\nEOF\n)\"", "git commit -m \"$(cat <<EOF\n`git stash` git push\nEOF\n)\"",
      "echo \"<<EOF\"\ngit stash\nEOF", "# <<EOF\ngit checkout -- .\nEOF", "ssh host <<'EOF'\ngit push\nEOF", "cat <<'EOF'\nx\nEOF\ngit push",
      // 自動レビュー: 引用符・コメントの中の $(cat <<EOF
      "echo '$(cat <<EOF'\ngit push\nEOF", "# $(cat <<EOF\ngit stash\nEOF", "echo \"$(cat <<'EOF'\ngit push\nEOF\n)\"",
      // 終端の次の行が )" でない
      "git commit -m \"$(cat <<'EOF'\ngit push\nEOF\n", "git commit -m \"$(cat <<'EOF'\ngit push\nEOF\nx)\"",
    ]) assert.equal(isTameCommand(c), false, c);
  });

  test("I2 対照: 固定の入力（履歴に頼らない。$'…'・git の語・日本語を含む）と、このリポジトリの直近のコミットメッセージを heredoc の本文にした git commit は、聞かれない", () => {
    const subOut = (c) => decideSubagentOutput(JSON.stringify({ tool_name: "Bash", agent_id: "a1", tool_input: { command: c } }));
    const asCommit = (m) => `git add -A && git commit -m "$(cat <<'EOF'\n${m}\nEOF\n)"`;
    // 固定の入力は必ず流れる（履歴が引けなくても。以前は maxBuffer の超過で履歴の取得が例外になり、黙って何も見ずに通っていた）
    const fixed = [
      "fix(scripts): $'…' を含む文字列は lex の結果を信じず fail closed にする（#578）\n\n- git push と git reset --hard の説明\n- echo $'\\n' と grep \"main$\"",
      "docs: git checkout -- file で戻す形と git stash の説明\n\n- `git branch -D` は聞く",
      "feat: 通常のコミット",
    ];
    for (const m of fixed) {
      assert.equal(isTameCommand(asCommit(m)), true, m.slice(0, 60));
      assert.equal(subOut(asCommit(m)), null, m.slice(0, 60));
    }
    let inRepo = true;
    try {
      execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      inRepo = false; // git の履歴が無い環境（アーカイブの展開先）では履歴の部分だけ見ない
    }
    if (!inRepo) return;
    // 履歴が引けるのに引けなかったら、黙って通さず落とす（maxBuffer は十分に大きくする）
    const log = execFileSync("git", ["log", "-n", "400", "--format=%B%x1e"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    const messages = log.split("\x1e").map((m) => m.trim()).filter((m) => m !== "" && !m.split("\n").includes("EOF"));
    assert.ok(messages.length > 0, "履歴が空");
    for (const m of messages) assert.equal(isTameCommand(asCommit(m)), true, m.slice(0, 120));
  });

  test("7 回目: heredoc の行の .* に区切り・コメント・引用符を含められない／終端の後ろに別のコマンドがあれば tame でない", () => {
    for (const c of [
      "git commit -m x; git push && echo \"$(cat <<'EOF'\nx\nEOF\n)\"".replace('echo "$(','git commit --message "$('),
      "git commit -m x # y -m \"$(cat <<'EOF'\ngit push\nEOF\n)\"", "git commit -m 'a \"$(cat <<'EOF'\ngit push\nEOF\n)\"",
      "git commit -m $(echo) | tee -m \"$(cat <<'EOF'\ngit push\nEOF\n)\"",
      "git commit -m \"$(cat <<'EOF'\ngit push\nEOF\n)\" && git push", "git commit -m \"$(cat <<'EOF'\ngit push\nEOF\n)\"\ngit push",
      "git commit -m \"$(cat <<'EOF'\ngit push\nEOF\n)\" # x\n",
      // 行の可変部が単一引用符・コメントを含む（形を広げない。読めない形は聞く側に倒す）
      "git commit -m \"a\" --author='b' -m \"$(cat <<'EOF'\ngit push\nEOF\n)\"", "git commit -m a --author=b # c -m \"$(cat <<'EOF'\ngit push\nEOF\n)\"\n", "gh pr create --body-file x -m; git push; echo --body \"$(cat <<'EOF'\ngit push\nEOF\n)\"",
    ]) assert.equal(isTameCommand(c), false, c);
    // 題などの引用符つきの文字列は、対の中なら許す
    assert.equal(isTameCommand("gh pr create --title \"feat: x（#9）\" --body \"$(cat <<'EOF'\ngit push する\nEOF\n)\"\n"), true);
  });

  test("7 回目: --output（ファイルへ書く）は git のどの下位コマンドでも tame でない。reflog・stash show は既知の読む選択肢だけ", () => {
    for (const c of [
      "git reflog --output=x", "git reflog show --output x", "git stash show --output=x", "git log --output=x", "git diff --output x", "git show --outp=x", "git status --output=x", "git branch --output=x", "git add --output=x f",
      "git reflog expire --all", "git reflog --expire=now", "git reflog show --unknown", "git stash list --output=x", "git stash show --unknown", "git stash show -p --exec x", "git reflog -d HEAD", "git reflog drop", "git reflog list", "git reflog foo", "git reflog HEAD", "git reflog delete x", "git reflog show foo bar --exec x",
    ]) assert.equal(isTameCommand(c), false, c);
    for (const c of ["git reflog", "git reflog show HEAD", "git reflog -n 5", "git reflog --date=iso", "git reflog show --oneline", "git stash list", "git stash list --oneline", "git stash show", "git stash show -p stash@{0}".replace("stash@{0}", "'stash@{0}'"), "git stash show --stat"]) assert.equal(isTameCommand(c), true, c);
  });

  test("コードレビュー 2: サブエージェントの宣言は、データとして使われる heredoc の本文を取り除いてから当てる", () => {
    const askSub = (c) => decideHookOutput(JSON.stringify({ tool_name: "Bash", agent_id: "a1", tool_input: { command: c } }))?.hookSpecificOutput?.permissionDecision ?? null;
    assert.equal(askSub("git commit -m \"$(cat <<'EOF'\nfeat: x\n\ngit push は止める\nEOF\n)\""), null);
    assert.equal(askSub("gh pr create --title x --body \"$(cat <<'EOF'\nkill と gh pr merge の話\nEOF\n)\""), null);
    // 本文を隠さない形では今までどおり当たる
    assert.equal(askSub("bash <<'EOF'\ngit push origin x\nEOF"), "ask");
    assert.equal(askSub("git commit -m \"$(cat <<'EOF'\nx\nEOF\n)\" && git push"), "ask");
  });

  test("コードレビュー 10: 危ない操作の名前の一覧は 1 か所の定数から作る。discard の候補を広げた分（rm・mv・checkout-index ほか）も含む", () => {
    for (const c of ["git push", "git worktree remove x", "gh pr merge 3", "kill 1", "pkill x"]) assert.equal(mentionsSubagentOperation(c), true, c);
    for (const c of ["git stash", "git restore a", "git rm -f a", "git mv -f a b", "git checkout-index -f -a", "git read-tree --reset -u HEAD", "git submodule update --force", "git worktree remove -f x"]) assert.equal(mentionsDiscardOperation(c), true, c);
    for (const c of ["git status", "git commit -m x", "git log", "echo hi", "grep -rn pushed docs"]) {
      assert.equal(mentionsSubagentOperation(c), false, c);
      assert.equal(mentionsDiscardOperation(c), false, c);
      assert.equal(mentionsGuardedOperation(c), false, c);
    }
    assert.equal(mentionsGuardedOperation("git rm -f a"), true);
    assert.equal(mentionsGuardedOperation("kill 1"), true);
  });

  test("コメント 3: 枝の削除・改名・付け替え、別のプロセス停止、GitHub への書き込みもサブエージェントでは聞く。merge・rebase・commit --amend は聞かない", () => {
    for (const c of [
      "git branch -D other", "git branch -d other", "git branch -m old new", "git branch -M a b", "git branch -f other HEAD", "git branch --delete x", "git branch --move a b", "git branch --force x HEAD", "git -C ../w branch -D x",
      "npx kill-port 5173", "npx -y kill-port 5173", "bunx kill-port 5173", "pnpm dlx kill-port 5173", "fuser -k 5173/tcp", "tmux kill-server", "tmux kill-session -t x", "tmux -L s kill-session",
      "gh api repos/o/r/pulls/3 -X DELETE", "gh api repos/o/r/issues -f title=x", "gh pr review 3 --approve", "gh pr review 3 --request-changes", "gh pr review 3 -a", "gh pr review 3 -r -b x",
    ]) assert.ok(findSubagentCommands(c).length > 0, c);
    for (const c of ["git branch", "git branch newbranch", "git branch -a", "git merge other", "git rebase origin/main", "git commit --amend --no-edit", "gh api repos/o/r/pulls/3", "gh pr review 3 --comment -b x", "tmux ls", "fuser 5173/tcp", "npx vitest run"]) {
      assert.equal(findSubagentCommands(c).length, 0, c);
    }
  });

  test("自動レビュー: 新しい操作の名前も OPERATION_WORDS にあり、heredoc の中の git branch -D・gh api -X DELETE・gh pr review --approve は隠れず当たる", () => {
    for (const c of ["git branch -D x", "gh api -X DELETE repos/o/r", "gh pr review 3 --approve", "tmux kill-session"]) assert.equal(mentionsSubagentOperation(c), true, c);
    for (const c of [
      "bash <<'EOF'\ngit branch -D x\nEOF", "bash <<'EOF'\ngh api -X DELETE repos/o/r/pulls/3\nEOF", "bash <<'EOF'\ngh pr review 3 --approve\nEOF",
      "git commit -m x && bash <<'EOF'\ngit branch -D x\nEOF",
    ]) {
      assert.equal(isTameCommand(c), false, c);
      assert.ok(findSubagentCommands(c).length > 0, c);
    }
    // データとして使われる heredoc の本文は今までどおり文章
    assert.equal(isTameCommand("git commit -m \"$(cat <<'EOF'\nfix: git branch -D と gh pr review --approve の説明\nEOF\n)\""), true);
  });

  test("自動レビュー: gh pr review の短い選択肢の束（-ab・-rb・-ar）も聞く（fail closed）", () => {
    for (const c of ["gh pr review 3 -ab x", "gh pr review 3 -rb x", "gh pr review 3 -ar", "gh pr review 3 -cr -b x", "gh pr review 3 -Rowner/repo -a"]) assert.ok(findSubagentCommands(c).length > 0, c);
    for (const c of ["gh pr review 3 -c -b x", "gh pr review 3 --comment -b x", "gh pr review 3"]) assert.equal(findSubagentCommands(c).length, 0, c);
  });

  test("自動レビュー（許可リスト）: gh pr review は判定を決めない既知の選択肢だけ通し、ほかの - で始まる語が 1 つでもあれば聞く", () => {
    for (const c of [
      "gh pr review 3 -a=true", "gh pr review 3 -ca=true", "gh pr review 3 -r=1", "gh pr review 3 --approve=true", "gh pr review 3 -ab x", "gh pr review 3 --unknown",
      "gh pr review 3 --request-changes", "gh pr review 3 --appr", "gh pr review 3 --comment --approve", "gh pr review 3 -c -x", "gh pr review 3 -cb x", "gh pr review --body x -a",
      "gh pr review 3 -R owner/repo --approve",
    ]) assert.ok(findSubagentCommands(c).length > 0, c);
    for (const c of [
      'gh pr review 583 --comment -b "x y"', "gh pr review 583 -c --body-file x.md", "gh pr review 583 -R owner/repo -c -b x", "gh pr review 583 --body=x -c", "gh pr review 583 -bfoo",
      "gh pr review 583 -F x.md", "gh pr review 583 -Fx.md", "gh pr review 583 --repo=o/r -c", "gh pr review 583 --repo o/r --comment", "gh pr review https://github.com/o/r/pull/3 -c -b x", "gh pr review feature-branch -c -b x",
    ]) assert.equal(findSubagentCommands(c).length, 0, c);
  });

  const subOut = (c) => decideSubagentOutput(JSON.stringify({ tool_name: "Bash", agent_id: "a1", tool_input: { command: c } }));

  test("再レビュー I-1: ADR が通すと書く読む形・作る形は、入口の判定（agent_id つき）で通る。&& でつないだ形・git -C つきも", () => {
    for (const c of [
      "git branch newbr", "git branch --list 'feat*'", "git branch --show-current", "git -C /workspaces/x/wt branch --show-current", "git -C ../w branch -a",
      "pnpm test && git branch --show-current", "cd ../wt && git branch -vv && pnpm lint", "git branch feat/x origin/main",
      "fuser 5173/tcp", "pnpm test; fuser 5173/tcp", "gh pr review 583 --comment", "gh pr review 583 -c --body-file x.md", "gh pr review 583 -R o/r -c -b x",
      "gh api repos/o/r/pulls/3", "gh api repos/o/r/pulls --paginate --jq '.[].number'", "pnpm test && gh api -X GET repos/o/r/issues",
    ]) assert.equal(subOut(c), null, c);
    // 宣言の当たりと「迷う形」は今までどおり聞く
    for (const c of ["git branch -D x", "git -C ../w branch -f x HEAD", "pnpm test && git branch -D x", "fuser -k 5173/tcp", "gh pr review 583 --approve", "gh api -X DELETE repos/o/r", "a=push; git $a origin x", "eval 'git branch -D x'"]) {
      assert.equal(subOut(c)?.hookSpecificOutput.permissionDecision, "ask", c);
    }
  });

  test("PR コメント I-1/自動: おとなしい形は許可リストだけ。環境変数の代入・git の -C 以外の全体の選択肢・branch の変更系（-u ほか）は通さない", () => {
    for (const c of [
      "git branch feat/new", "git branch --list 'fix-*'", "git branch --sort -committerdate", "git branch --sort=-committerdate", "git branch --show-current && pnpm test",
      "git -C ../wt branch --show-current", "git branch -a", "git branch -vv", "git branch --contains abc123", "git branch --merged main", "git branch --no-merged", "git branch feat/x origin/main", "git branch",
      "fuser 5173/tcp",
    ]) assert.equal(subOut(c), null, c);
    for (const c of [
      "git branch -u origin/x", "git branch --set-upstream-to=origin/x", "git branch --unset-upstream", "git branch --edit-description", "git branch -a foo", "git branch a b c",
      "GIT_SSH_COMMAND=x git branch", "GIT_DIR=/x git branch newbr", "FOO=1 fuser 5173/tcp", "git -c core.sshCommand=x branch", "git --config-env a=B branch", "git --exec-path=/x branch", "git --no-pager branch", "git --git-dir=/x branch",
      "git -C ../w -c a=b branch",
    ]) assert.equal(subOut(c)?.hookSpecificOutput.permissionDecision, "ask", c);
  });

  test("自動レビュー: 行の継続（行末の \\）の次の行に cat > f <<'TAG' を置いても、継続された 1 つのコマンドの heredoc をデータとみなさない", () => {
    for (const c of ["echo x \\\ncat > f <<'EOF'\ngit push\nEOF", "git commit -m x \\\ncat >> f <<'EOF'\ngit branch -D a\nEOF"]) {
      assert.equal(isTameCommand(c), false, c);
      assert.equal(subOut(c)?.hookSpecificOutput.permissionDecision, "ask", c);
    }
    assert.equal(subOut("echo x\ncat > f <<'EOF'\ngit branch -a\nEOF"), null);
  });

  test("PR コメント 2: gh api の GET にはフィールドも付けられる（-X GET 明示の REST）。graphql は query でも全部聞く（判定の食い違いを避ける）。--input・GET 以外・方法が不明は聞く", () => {
    for (const c of [
      "gh api -X GET search/code -f q=foo", "gh api --method GET search/code -F q=foo -f per_page=5", "gh api -XGET repos/o/r/issues -f state=open",
    ]) assert.equal(subOut(c), null, c);
    for (const c of [
      "gh api search/code -f q=foo", "gh api repos/o/r/issues -f title=x", "gh api -X POST repos/o/r/issues -f title=x", "gh api -X GET repos/o/r --input body.json", "gh api graphql --input q.json",
      "gh api graphql -f query='query { viewer { login } }'", "gh api graphql -F query='query { repository(owner:\"o\", name:\"r\") { id } }' -F owner=o", "gh api graphql --paginate -f query='query($n:Int){ x }'",
      "gh api -X GET graphql -f query='query { viewer { login } }'", "gh api graphql",
      "gh api graphql -f query=$'mut\\x61tion { addStar }'", "gh api graphql -f query=$'\\155utation { x }'", "gh api graphql -f query={mut,ation}", "gh api graphql -f query=mut\\ation",
      "gh api graphql -f query='MUTATION{x}'", "gh api graphql -F query=@q.graphql", "gh api -X POST graphql -f query='{ viewer { login } }'",
      "gh api -X DELETE repos/o/r/issues/1", "gh api -X GET repos/o/r --unknown-flag",
    ]) assert.equal(subOut(c)?.hookSpecificOutput.permissionDecision, "ask", c);
  });

  test("再レビュー M-1: cat > <パス> <<'TAG' の本文は、引用符つきの終端なら文章。終端の後ろの行は別のコマンドとして判定する", () => {
    for (const c of ["cat > /tmp/notes.md <<'EOF'\nuse git branch -a here\nEOF", "cat >> notes.md <<'EOF'\nran gh pr view; the review found nothing\nEOF", "cat > notes.md << 'EOF'\ngit push と kill の話\nEOF", "cat <<'EOF' > notes.md\ngit branch -D の話\nEOF", "mkdir -p /tmp/x && cat > /tmp/x/r.md <<'EOF'\ngit push しない\nEOF", "cat >> a.md <<'EOF'\ngit push\nEOF\n"]) {
      assert.equal(subOut(c), null, c);
    }
    for (const c of [
      "cat > notes.md <<'EOF'\nx\nEOF\ngit push origin x", "cat > notes.md <<EOF\ngit push $(git push)\nEOF", "cat > \"$F\" <<'EOF'\ngit push\nEOF", "cat > a.md; git push <<'EOF'\ngit push\nEOF", "cat | sh <<'EOF'\ngit push\nEOF", "cat > a.md <<'EOF' && git push\nx\nEOF",
    ]) assert.equal(subOut(c)?.hookSpecificOutput.permissionDecision, "ask", c);
  });

  test("再レビュー M-2: 理由の文が、どの操作に当たったか（宣言の id）を示す", () => {
    const why = (c) => subOut(c).hookSpecificOutput.permissionDecisionReason;
    assert.match(why("git branch -D x"), /git-branch-modify/);
    assert.match(why("git -C ../w branch -f x HEAD"), /git-branch-modify/);
    assert.match(why("gh api -X DELETE repos/o/r"), /gh-api-write/);
    assert.match(why("gh api repos/o/r/issues -f title=x"), /gh-api-write/);
    assert.match(why("gh pr review 3 --approve"), /gh-pr-review-decide/);
    assert.match(why("tmux kill-session -t x"), /tmux-kill/);
    assert.doesNotMatch(why("git branch -D x"), /読み切れない/);
  });

  test("再々レビュー M-1: cat の heredoc の本文を隠すのは、終端の後ろに何も続かないときだけ。書いたスクリプトを同じコマンドで走らせる形は隠さない", () => {
    for (const c of [
      "cat > /tmp/x.sh <<'EOF'\ngit push origin x\nEOF\nbash /tmp/x.sh", "cat > /tmp/x.sh <<'EOF'\ngit branch -D a\nEOF\nsh /tmp/x.sh", "mkdir -p /tmp/x && cat > /tmp/x/r.sh <<'EOF'\nkill 1\nEOF\nbash /tmp/x/r.sh",
      "cat > notes.md <<'EOF'\ngit push と kill の話\nEOF\nls", "cat <<'EOF' > x.sh\ngit push\nEOF\nbash x.sh",
    ]) assert.equal(subOut(c)?.hookSpecificOutput.permissionDecision, "ask", c);
  });

  test("再々レビュー M-5: 日常の書き方（<< の後ろの空白・リダイレクトが後ろ・mkdir -p … &&）の cat の heredoc も、後ろに何も続かなければ通る。git branch の値を取る選択肢（--format <値>・--column・--abbrev）も", () => {
    for (const c of [
      "cat > f << 'EOF'\nuse git branch -a here\nEOF", "cat <<'EOF' > f\nuse git branch -a here\nEOF", "cat << 'EOF' >> f\ngit push の話\nEOF", "mkdir -p /tmp/a/b && cat > /tmp/a/b/f <<'EOF'\ngit reset の話\nEOF",
      "git branch --format '%(refname)'", "git branch -l 'docs/*' --format '%(refname)'", "git branch --column", "git branch -v --abbrev=7", "git branch --format=%(refname)", "git branch --no-column",
    ]) assert.equal(subOut(c), null, c);
    // 形を広げすぎない: 引用符つきでない終端・コマンド置換のパス・パイプ・別のコマンドとの連結
    for (const c of [
      "cat > f << EOF\ngit push $(git push)\nEOF", "cat <<'EOF' | sh\ngit push\nEOF", "mkdir -p /tmp/x; cat > f <<'EOF'\ngit push\nEOF", "cat <<'EOF' > $F\ngit push\nEOF", "git branch --format '%(refname)' -D x",
    ]) assert.equal(subOut(c)?.hookSpecificOutput.permissionDecision, "ask", c);
  });

  test("再々レビュー（コメント 4）: 引用符の中の区切り文字（| ; &&）の後ろの kill・checkout などを、別のコマンドと読み直さない。引用符の外の区切りは聞く", () => {
    for (const c of [
      'grep -E "kill|pkill" notes.md', 'grep -rn "git push; git reset" docs', 'git commit -m "fix: reset; kill the timer"', 'git commit -m "fix: branch && checkout の説明"', 'git log --grep="push|reset" --oneline',
      // 受け皿より前で除く形（git branch）と組み合わせても、残りの引用符は保たれる
      'git branch --show-current && grep -E "kill|pkill" notes.md', 'git branch feat/x && git commit -m "fix: reset; kill the timer"',
    ]) assert.equal(subOut(c), null, c);
    for (const c of ['grep -rn "x" docs; git push origin x', 'git commit -m "fix: x" && git push', 'git branch --show-current && git push', 'git branch --show-current; kill 1', 'echo "a|b" | git push'])
      assert.equal(subOut(c)?.hookSpecificOutput.permissionDecision, "ask", c);
  });

  test("自動レビュー（$'…'）: lex が読めない ANSI-C の引用（$'・$\"）は、前の文字を問わずどこかに 1 つでもあれば信じない。操作の名前があれば聞く", () => {
    const bad = [
      "echo $'\\'' ; git push ; echo $'\\''", "git branch --show-current && echo $'\\'' ; git push ; echo $'\\''", "echo $\"x\" ; git push", "fuser 5173/tcp && echo $'\\'' ; kill 1 ; echo $'\\''",
      // 語の途中（直前が普通の文字）
      "echo x$'\\'' ; git push ; echo x$'\\''", "git branch --show-current && echo a$'\\'' ; git push ; echo b$'\\''", "echo main$\"x\" ; git push",
      "git push $'origin' HEAD", "echo $'x' ; git push", "grep $'\\t' file; git checkout main",
    ];
    for (const c of bad) assert.equal(subOut(c)?.hookSpecificOutput.permissionDecision, "ask", c);
    // 行の継続（$ と引用符の間の \\ と改行）、継続と heredoc の組み合わせ
    for (const c of [
      "echo $\\\n'\\'' ; git push ; echo $'\\''", "git branch --show-current && echo $\\\n'\\'' ; git push ; echo $'\\''", "echo $\\\r\n\"x\" ; git push", "echo $\\\n'\\'' ; git push ; echo $\\\n'\\''",
      "git branch --show-current && echo $\\\n'\\'' ; git push ; echo $\\\n'\\''", "echo x \\\ncat > f <<'EOF'\nbody\nEOF\necho $'\\'' ; git push ; echo $'\\''", "git commit -m \"$(cat <<'EOF'\nfix: x\nEOF\n)\" && echo x$\\\n'\\'' ; git push ; echo $'\\''",
    ]) {
      assert.equal(subOut(c)?.hookSpecificOutput.permissionDecision, "ask", c);
      assert.equal(isTameCommand(c), false, c);
    }
    for (const c of ["echo $'a'", "grep $'x' f", "git commit -m $'fix'", "echo x$'a'"]) assert.equal(isTameCommand(c), false, c);
    // 引用符の**中**の `$` に続く引用符（正規表現の行末の錨）は ANSI-C の引用ではないので聞かない（2026-11-12 の利用者の決定。bash でも引用にならない）
    for (const c of ['git branch -a | grep "main$"', "git log --oneline | grep -E 'reset$'", 'git status --short | grep -E "^ M.*checkout\\.mjs$"', 'echo "cost: 5$" && git stash list', "git branch -a | grep 'main[$]'"]) {
      assert.equal(hasUnreadableQuote(c), false, c);
      assert.equal(subOut(c), null, c);
    }
    // 引用符の中の錨でも、引用符の外に危ない操作が続けば聞く
    assert.equal(subOut('git branch -a | grep "main$" ; git push')?.hookSpecificOutput.permissionDecision, "ask");
    // 二重引用符の中の `$(…)` は外と同じ規則なので、その中の `$'…'` は読めない引用
    for (const c of ['echo "$(echo $\'x\')" ; git push', "echo \"`echo $'x'`\" ; git push"]) {
      assert.equal(hasUnreadableQuote(c), true, c);
      assert.equal(subOut(c)?.hookSpecificOutput.permissionDecision, "ask", c);
    }
    // 引用の状態をたどれない形は、どこかに 1 つでもあれば読めない側へ倒す（コメントの中の ' ・取り除けない heredoc・${…}・閉じない引用符）
    for (const c of [
      "# don't\necho $'\\'' ; git push ; echo $'\\''",
      "cat <<EOF\ndon't\nEOF\necho $'\\'' ; git push ; echo $'\\''",
      "echo ${x:-$'\\''} ; git push",
      "echo \"main$\" '",
    ]) {
      assert.equal(hasUnreadableQuote(c), true, c);
    }
    assert.equal(subOut("# don't\necho $'\\'' ; git push ; echo $'\\''")?.hookSpecificOutput.permissionDecision, "ask");
    // $'…' を使わない日常の形は通ったまま
    for (const c of ['grep -E "kill|pkill" notes.md', 'git commit -m "fix: reset; kill the timer"', 'git log --grep="push|reset" --oneline', "git branch --show-current && grep -E 'kill|x' notes.md", "echo 'cost $5'"]) {
      assert.equal(subOut(c), null, c);
    }
    // データの heredoc の本文の中の $'…' は、取り除いた後の文字列に当てるので聞かない（履歴に頼らない固定の入力）
    const withAnsi = "git add -A && git commit -m \"$(cat <<'EOF'\nfix: $'\\n' を読めない引用として扱う\n\n- git push と git reset の説明\nEOF\n)\"";
    assert.equal(subOut(withAnsi), null);
    assert.equal(isTameCommand(withAnsi), true);
    assert.equal(hasUnreadableQuote(withAnsi), false);
    assert.equal(hasUnreadableQuote("bash <<'EOF'\necho $'x'\ngit push\nEOF"), true); // データでない本文は取り除かない
    // heredoc の演算子の行が `\` で終わる・前の行の継続の続きのときは、bash の本文の始まりと行の分け方が食い違うので、本文を取り除かない（null）
    const cont = [
      "cat <<'EOF' \\\n; echo $'a'\nEOF\nrm x", "echo x \\\ncat <<'EOF'\nfoo $'a'\nEOF", "cat > f <<'EOF' \\\n; echo $'a'\nEOF",
      "git commit -m \"$(cat <<'EOF' \\\n; echo $'a'\nEOF\n)\"",
    ];
    for (const c of cont) {
      assert.equal(stripHeredocBodies(c), null, c);
      assert.equal(hasUnreadableQuote(c), true, c);
      assert.equal(isTameCommand(c), false, c);
    }
    // 継続の無い普通の形は今までどおり本文を取り除く
    assert.notEqual(stripHeredocBodies("cat > f <<'EOF'\nfoo\nEOF"), null);
    // 取り除かない道（residual は元の文字列）でも、サブエージェントの操作の名前があれば聞く
    assert.equal(subOut("echo x \\\ncat <<'EOF'\nfoo\nEOF\ngit push origin x")?.hookSpecificOutput.permissionDecision, "ask");
  });

  test("再レビュー: mkdir -p … && cat > … << 'EOF'（本文に操作の名前）はサブエージェントでも通る。mkdir の後ろの git push は聞く", () => {
    assert.equal(subOut("mkdir -p /tmp/x && cat > /tmp/x/f << 'EOF'\ngit checkout -- file で戻す。git push しない\nEOF"), null);
    assert.equal(isTameCommand("mkdir -p /tmp/x && cat > /tmp/x/f << 'EOF'\ngit checkout -- file で戻す\nEOF"), true);
    for (const c of ["mkdir -p x && git push", "mkdir -p x && git branch -D y", "mkdir -p x; kill 1"]) assert.equal(subOut(c)?.hookSpecificOutput.permissionDecision, "ask", c);
  });

  test("再々レビュー M-2: tmux の send-keys ^C（C-c の別の綴り）・respawn-pane -k・respawn-window -k も聞く。-k の無い respawn は通す", () => {
    for (const c of ["tmux send-keys -t dev ^C", "tmux send-keys -t dev '^c'", "tmux send -t dev C-C", "tmux respawn-pane -k -t dev", "tmux respawn-window -k -t dev", "tmux respawn-pane -t dev -k 'pnpm dev'", "tmux respawnp -k -t dev", "tmux respawn-pane -kc /tmp -t dev"]) {
      assert.ok(findSubagentCommands(c).length > 0, c);
      assert.match(subOut(c).hookSpecificOutput.permissionDecisionReason, /tmux-kill/, c);
    }
    for (const c of ["tmux respawn-pane -t dev", "tmux send-keys -t dev '^x' Enter"]) assert.equal(subOut(c), null, c);
  });

  test("再レビュー M-3: tmux の kill-*・別名（killw・killp）・前方一致の省略・send-keys の C-c も聞く。ls・capture-pane は通す", () => {
    for (const c of [
      "tmux kill-window -t dev", "tmux killw -t dev", "tmux kill-pane -t dev", "tmux killp -t dev", "tmux kill-ses -t x", "tmux kill-ser", "tmux kill-server", "tmux -L s kill-session",
      "tmux send-keys -t dev C-c", "tmux send -t dev C-c Enter", "tmux send-k -t dev C-c",
    ]) assert.ok(findSubagentCommands(c).length > 0, c);
    for (const c of ["tmux ls", "tmux list-sessions", "tmux capture-pane -p -t dev", "tmux send-keys -t dev 'pnpm test' Enter", "tmux new-session -d -s x"]) assert.equal(subOut(c), null, c);
  });

  test("コードレビュー 5: tame の git mv は -f/--force を含まない", () => {
    assert.equal(isTameCommand("git mv a b"), true);
    for (const c of ["git mv -f a b", "git mv --force a b", "git mv -kf a b"]) assert.equal(isTameCommand(c), false, c);
  });

  test("M3: git branch / fetch / tag / remote / reflog は、選択肢と引数が既知の読む形のときだけ tame（拒否リストでなく許可リスト）", () => {
    for (const c of [
      "git branch -D chore/578", "git branch -f main HEAD", "git branch -d x", "git branch -m a b", "git branch --delete x", "git branch --del x", "git branch --dele x", "git branch newbranch", "git branch --set-upstream-to=o/x", "git branch -c a b", "git branch --list 'fix/*'",
      "git fetch --prune", "git fetch -p origin", "git fetch --prune-tags", "git fetch --force origin", "git fetch -f", "git fetch origin +refs/heads/*:refs/heads/*", "git fetch origin main:main", "git fetch origin +main", "git fetch --update-head-ok origin", "git fetch --refmap= origin",
      "git tag -d v1", "git tag v1", "git tag --delete v1", "git tag -f v1", "git remote remove origin", "git remote add x y", "git remote set-url origin z", "git reflog expire --all", "git reflog delete HEAD@{1}", "git log --output=out.txt",
    ]) assert.equal(isTameCommand(c), false, c);
    for (const c of ["git branch", "git branch -a", "git branch -vv", "git branch --show-current", "git branch -r --contains abc123", "git branch --merged main", "git branch --format='%(refname)' --sort=-committerdate",
      "git fetch", "git fetch origin", "git fetch origin main", "git fetch --all", "git fetch -q --depth=1 origin main", "git tag", "git tag -l", "git remote -v", "git remote show origin", "git reflog", "git reflog show HEAD"]) assert.equal(isTameCommand(c), true, c);
  });

  test("decideHookOutput: agent_id があるときだけ聞く。まとめ役（agent_id なし）は止めない", () => {
    const mk = (command, extra = {}) => JSON.stringify({ tool_name: "Bash", tool_input: { command }, ...extra });
    const out = decideHookOutput(mk("git push origin x", { agent_id: "a1", agent_type: "general-purpose" }));
    assert.equal(out?.hookSpecificOutput?.permissionDecision, "ask");
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /サブエージェント/);
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /git-push/);
    assert.equal(decideHookOutput(mk("git push origin x")), null);
    assert.equal(decideHookOutput(mk("git push origin x", { agent_id: "" })), null);
    assert.equal(decideHookOutput(mk("pnpm test", { agent_id: "a1" })), null);
  });

  test("decideHookOutput: 本番デプロイの判定が先（サブエージェントでも理由は本番デプロイ）", () => {
    const out = decideHookOutput(JSON.stringify({ tool_name: "Bash", agent_id: "a1", tool_input: { command: "systemctl restart x; git push" } }));
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /本番デプロイ/);
  });
});
