import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { GUARDED_COMMANDS, SHELL_TOOLS, findGuardedCommands, findCommandsMatching, decideHookOutput } from "./agent-guard.mjs";

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
