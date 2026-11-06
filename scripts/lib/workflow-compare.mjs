/**
 * ワークフロー同士の「写し」を比べる補助（#562）。`scripts/e2e-repeat-workflow.test.mjs` が使う。
 * ci.yml の e2e ジョブの準備の段を、手動起動の e2e-repeat.yml が写している。ずれを見つけるための部品。
 */
import { splitJobs, splitSteps } from "./workflow.mjs";

const SCOPE_AND = /^(\s*if: )steps\.scope\.outputs\.code == 'true' && /;
const SCOPE_ONLY = /^\s*if: steps\.scope\.outputs\.code == 'true'\s*$/;

/**
 * 段のテキストからコメント行と空行を外す。`stripScope` のときだけ、`steps.scope` を見る `if:` の条件を外す。
 * **scope を外すのは ci.yml 側だけ**（手動のジョブは scope の段を持たない）。写しの側に scope が残っていれば、
 * 外さないので不一致になる（本番では Chromium の導入が飛ばされる形を止める）。
 */
export function normalizeStep(text, { stripScope = false } = {}) {
  return text
    .split("\n")
    .filter((l) => !/^\s*#/.test(l) && l.trim() !== "")
    .map((l) => (stripScope ? l.replace(SCOPE_AND, "$1").replace(SCOPE_ONLY, "") : l))
    .filter((l) => l !== "")
    .join("\n");
}

const code = (text) => text.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

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
    prep: steps
      .slice(0, build + 1)
      .filter((s) => !/^\s*- id: scope\s*$/m.test(code(s)))
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
  const block = /^env:\n((?:[ \t].*\n|\n)*)/m.exec(workflow)?.[1] ?? "";
  return block
    .split("\n")
    .filter((l) => !/^\s*#/.test(l) && l.trim() !== "")
    .join("\n");
}
