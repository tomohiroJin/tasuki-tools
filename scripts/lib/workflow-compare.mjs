/**
 * ワークフロー同士の「写し」を比べる補助（#562）。`scripts/e2e-repeat-workflow.test.mjs` が使う。
 * ci.yml の e2e ジョブの準備の段を、手動起動の e2e-repeat.yml が写している。ずれを見つけるための部品。
 */
import { splitJobs, splitSteps, stripComments, topLevelEnvBlock } from "./workflow.mjs";

const SCOPE_AND = /^(\s*if: )steps\.scope\.outputs\.code == 'true' && /;
const SCOPE_ONLY = /^\s*if: steps\.scope\.outputs\.code == 'true'\s*$/;

/**
 * 段のテキストからコメント行と空行を外す。`stripScope` のときだけ、`steps.scope` を見る `if:` の条件を外す。
 * **scope を外すのは ci.yml 側だけ**（手動のジョブは scope の段を持たない）。写しの側に scope が残っていれば、
 * 外さないので不一致になる（本番では Chromium の導入が飛ばされる形を止める）。
 */
export function normalizeStep(text, { stripScope = false } = {}) {
  return stripComments(text, { dropBlank: true })
    .split("\n")
    .map((l) => (stripScope ? l.replace(SCOPE_AND, "$1").replace(SCOPE_ONLY, "") : l))
    .filter((l) => l !== "")
    .join("\n");
}

const code = (text) => stripComments(text);

function jobOf(workflow, jobName) {
  const job = splitJobs(workflow).find((j) => j.name === jobName);
  if (!job) throw new Error(`${jobName} ジョブがありません`);
  return job;
}

/**
 * ジョブの段を「build まで」「build から `pnpm e2e` の手前まで」「`pnpm e2e` の段」に分ける。
 * `scope` の段は準備から外す。段は正規化したテキストで返す。
 */
export function splitE2eSteps(workflow, jobName, { stripScope }) {
  const steps = splitSteps(jobOf(workflow, jobName).lines).map((s) => s.text);
  const build = steps.findIndex((s) => /^\s*- run: pnpm build\s*$/m.test(code(s)));
  const e2e = steps.findIndex((s) => /^\s*- run: pnpm e2e( .*)?$/m.test(code(s)) || /pnpm e2e --/.test(code(s)));
  if (build < 0) throw new Error(`${jobName} に pnpm build の段がありません`);
  if (e2e < 0) throw new Error(`${jobName} に pnpm e2e の段がありません`);
  const norm = (s) => normalizeStep(s, { stripScope });
  return {
    // scope の段を外すのは ci.yml 側（stripScope）だけ。写しに scope の段があれば残り、不一致になる
    prep: steps
      .slice(0, build + 1)
      .filter((s) => !(stripScope && /^\s*- id: scope\s*$/m.test(code(s))))
      .map(norm),
    between: steps.slice(build + 1, e2e).map(norm),
  };
}

/** ジョブ直下（4 字下げ）のキー。`steps` の外の設定（env・container・services など）を見つけるため。 */
export function jobLevelKeys(workflow, jobName) {
  return jobOf(workflow, jobName)
    .lines.map((l) => /^ {4}([A-Za-z0-9_-]+):/.exec(l.text)?.[1])
    .filter(Boolean);
}

/** workflow 直下の `env:` の塊（コメントと空行を除く）。無ければ空文字。 */
export function topLevelEnv(workflow) {
  return stripComments(topLevelEnvBlock(workflow) ?? "", { dropBlank: true });
}

/** repeat 用の引数。ci.yml の `pnpm e2e` の引数と比べるときに写しの側から外す。 */
const REPEAT_ONLY_ARG = /^--(repeat-each|retries|trace|reporter)(=|$)/;
/** 写しの run に許す、pnpm e2e 以外の行（結果の置き場を作る）。 */
const KNOWN_REPEAT_COMMANDS = [/^mkdir -p "\$GITHUB_WORKSPACE\/e2e-repeat-results"$/];
/** repeat 用の env。写しの側にだけある。 */
const REPEAT_ONLY_ENV = /^(REPEAT|PLAYWRIGHT_JSON_OUTPUT_NAME):/;

/** `pnpm e2e` の段を、{ args: `pnpm e2e` の引数, extras: run と name 以外の鍵の行 } に分ける。 */
export function e2eStepShape(stepText, { repeatSide }) {
  const lines = normalizeStep(stepText, { stripScope: !repeatSide }).split("\n");
  const indentOf = (l) => /^\s*/.exec(l)[0].length;
  const commands = [];
  const extras = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^(\s*(?:- )?)run:\s*(.*)$/.exec(line);
    if (m) {
      if (/^[|>][+-]?$/.test(m[2])) {
        const base = indentOf(m[1].replace("- ", "  "));
        while (i + 1 < lines.length && indentOf(lines[i + 1]) > base) commands.push(lines[++i].trim());
      } else {
        commands.push(m[2].trim());
      }
      continue;
    }
    const entry = line.replace(/^\s*- /, "  ");
    if (/^\s*name:/.test(entry)) continue;
    if (repeatSide && REPEAT_ONLY_ENV.test(entry.trim())) continue;
    extras.push({ indent: indentOf(entry), text: entry.trim() });
  }
  // 空になった `env:` の見出しを落とす
  const kept = extras.filter((e, i) => !(e.text === "env:" && !(extras[i + 1] && extras[i + 1].indent > e.indent)));
  const command = commands.find((c) => /^pnpm e2e(\s|$)/.test(c)) ?? "";
  const others = commands.filter((c) => c !== command);
  const tokens = command.split(/\s+/).filter(Boolean).slice(2).filter((t) => t !== "--");
  return { command, args: repeatSide ? tokens.filter((t) => !REPEAT_ONLY_ARG.test(t)) : tokens, extras: kept.map((e) => e.text), others };
}

/**
 * ci.yml の e2e ジョブの `pnpm e2e` の段と、e2e-repeat.yml の段を比べ、ずれを文で返す（空なら一致）。
 * - コマンドは `pnpm e2e` であること。
 * - 写しの引数（repeat 用の --repeat-each・--retries・--trace・--reporter を除く）が、ci.yml の引数と等しいこと。
 * - run の中の pnpm e2e 以外の行: ci.yml 側は無いこと、写し側は既知の mkdir だけ。
 * - run と name 以外の鍵（env など）は、写しの側だけの REPEAT・PLAYWRIGHT_JSON_OUTPUT_NAME を除いて同じこと。
 */
export function compareE2eStep(ciWorkflow, repeatWorkflow) {
  const stepOf = (wf, job) => {
    const steps = splitSteps(jobOf(wf, job).lines).map((s) => s.text);
    const i = steps.findIndex((s) => /^\s*(?:- )?(?:run: )?pnpm e2e( .*)?$/m.test(code(s)));
    if (i < 0) throw new Error(`${job} に pnpm e2e の段がありません`);
    return steps[i];
  };
  const ci = e2eStepShape(stepOf(ciWorkflow, "e2e"), { repeatSide: false });
  let rp;
  try {
    rp = e2eStepShape(stepOf(repeatWorkflow, "e2e-repeat"), { repeatSide: true });
  } catch (e) {
    return [e.message];
  }
  const problems = [];
  if (!/^pnpm e2e(\s|$)/.test(rp.command)) problems.push("写しの run が pnpm e2e で始まりません");
  // repeat 用の 4 つを外した写しの引数が、ci.yml の引数と等しいこと（写しだけの --grep・--project も見逃さない）
  if (JSON.stringify(ci.args) !== JSON.stringify(rp.args)) {
    problems.push(`pnpm e2e の引数が違います（ci.yml: ${JSON.stringify(ci.args)} / 写し（repeat 用を除く）: ${JSON.stringify(rp.args)}）`);
  }
  // run の中の pnpm e2e 以外の行: ci.yml 側は無いこと（あれば写しへの影響を見る）、写し側は既知の mkdir だけ
  for (const c of ci.others) problems.push(`ci.yml の e2e の段の run に pnpm e2e 以外の行があります: ${c}`);
  for (const c of rp.others) {
    if (!KNOWN_REPEAT_COMMANDS.some((re) => re.test(c))) problems.push(`写しの run に想定外の行があります: ${c}`);
  }
  if (JSON.stringify(ci.extras) !== JSON.stringify(rp.extras)) {
    problems.push(`pnpm e2e の段の run 以外の鍵が違います（ci.yml: ${JSON.stringify(ci.extras)} / 写し: ${JSON.stringify(rp.extras)}）`);
  }
  return problems;
}
